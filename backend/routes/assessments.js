import express from 'express';
import crypto from 'crypto';
import multer from 'multer';
import db from '../database.js';
import { analyzeDisasterDamage } from '../services/aiService.js';
import { optionalAuthenticatedUser, requireAuthenticatedUser } from './auth.js';

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
    callback(null, allowedTypes.has(file.mimetype));
  }
});

function parseEligibilityResults(value) {
  if (typeof value !== 'string' || !value.trim()) return null;

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function parseJsonArray(value) {
  if (typeof value !== 'string' || !value.trim()) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function formatRecoveryCase(row) {
  const lossRecords = db.prepare(`
    SELECT * FROM loss_records WHERE case_id = ? ORDER BY created_at ASC
  `).all(row.case_id);
  const recoveryPlans = db.prepare(`
    SELECT * FROM recovery_plans WHERE case_id = ? ORDER BY created_at ASC
  `).all(row.case_id);

  return {
    id: row.case_id,
    case_id: row.case_id,
    applicant_name: row.applicant_name,
    contact_number: row.contact_number,
    province: row.province,
    city_municipality: row.city_municipality,
    barangay: row.barangay,
    disaster_type: row.disaster_type,
    incident_date: row.incident_date,
    raw_description: [...new Set(lossRecords.map((loss) => loss.description).filter(Boolean))].join('\n'),
    severity_level: row.severity_level,
    severity_score: row.severity_score,
    damage_categories: parseJsonArray(row.damage_categories),
    estimated_cost_min: row.estimated_cost_min,
    estimated_cost_max: row.estimated_cost_max,
    recommended_subsidies: parseJsonArray(row.recommended_subsidies),
    eligibility_results: parseEligibilityResults(row.eligibility_results),
    safety_precautions: parseJsonArray(row.safety_precautions),
    damage_summary: row.damage_summary ?? '',
    urgency: row.urgency ?? '',
    suggested_actions: parseJsonArray(row.suggested_actions),
    created_at: row.created_at,
    loss_records: lossRecords,
    recovery_plans: recoveryPlans
  };
}

// Run damage assessment through Gemini and save the verified result to SQLite
router.post('/', optionalAuthenticatedUser, upload.single('damageImage'), async (req, res) => {
  try {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({
        success: false,
        error: 'Request body must be a JSON object.'
      });
    }

    const body = req.body;
    if (body.userId !== undefined || body.user_id !== undefined) {
      return res.status(400).json({
        success: false,
        error: 'User identity is derived from the authenticated session.'
      });
    }
    const textFields = [
      'disasterType',
      'damageDescription',
      'applicantName',
      'contactNumber',
      'province',
      'cityMunicipality',
      'barangay',
      'incidentDate',
    ];
    for (const field of textFields) {
      if (body[field] != null && typeof body[field] !== 'string') {
        return res.status(400).json({
          success: false,
          error: `${field} must be a string.`
        });
      }
    }

    if (body.householdSize != null) {
      const householdSize = typeof body.householdSize === 'number'
        ? body.householdSize
        : typeof body.householdSize === 'string' && body.householdSize.trim()
          ? Number(body.householdSize)
          : NaN;
      if (!Number.isFinite(householdSize) || householdSize < 1) {
        return res.status(400).json({
          success: false,
          error: 'householdSize must be a positive number.'
        });
      }
    }

    const {
      disasterType = 'Typhoon',
      damageDescription,
      applicantName = 'Resident Applicant',
      contactNumber = '',
      province = '',
      cityMunicipality = '',
      barangay = '',
      householdSize = 1,
      incidentDate = new Date().toISOString().split('T')[0],
    } = req.body;

    if (
      (typeof damageDescription !== 'string' || damageDescription.trim().length === 0)
      && !req.file
    ) {
      return res.status(400).json({
        success: false,
        error: 'Damage description or a damage image is required for assessment.'
      });
    }
    if (typeof disasterType !== 'string' || disasterType.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Disaster type must be a non-empty string.'
      });
    }

    const location = [barangay, cityMunicipality, province].filter(Boolean).join(', ') || 'Philippines';

    // Call AI service
    const assessmentResult = await analyzeDisasterDamage({
      disasterType,
      damageDescription,
      location,
      householdSize: Number(householdSize) || 1,
      image: req.file
    });
    // console.log('AI response JSON:', JSON.stringify(assessmentResult, null, 2));

    // Generate unique ID
    const assessmentId = 'CASE-' + crypto.randomUUID();
    const damageCategories = assessmentResult.damage_categories || [];
    const lossCategories = damageCategories.length ? damageCategories : ['general'];
    const estimatedCostMin = Number(assessmentResult.estimated_cost_min) || 0;
    const estimatedCostMax = Number(assessmentResult.estimated_cost_max) || 0;
    if (!Array.isArray(assessmentResult.eligibility_results)) {
      throw new TypeError('Assessment eligibility results are unavailable.');
    }
    const insertCase = db.prepare(`
      INSERT INTO recovery_cases (
        case_id, user_id, applicant_name, contact_number, disaster_type,
        incident_date, province, city_municipality, barangay, severity_level,
        severity_score, estimated_cost_min, estimated_cost_max,
        damage_categories, recommended_subsidies, eligibility_results, safety_precautions,
        damage_summary, urgency, suggested_actions
      ) VALUES (
        @case_id, @user_id, @applicant_name, @contact_number, @disaster_type,
        @incident_date, @province, @city_municipality, @barangay, @severity_level,
        @severity_score, @estimated_cost_min, @estimated_cost_max,
        @damage_categories, @recommended_subsidies, @eligibility_results, @safety_precautions,
        @damage_summary, @urgency, @suggested_actions
      )
    `);
    const insertLoss = db.prepare(`
      INSERT INTO loss_records (
        loss_record_id, case_id, item_name, item_category, condition,
        loss_type, estimated_loss_php, description
      ) VALUES (
        @loss_record_id, @case_id, @item_name, @item_category, @condition,
        @loss_type, @estimated_loss_php, @description
      )
    `);
    const insertRecoveryPlan = db.prepare(`
      INSERT INTO recovery_plans (
        plan_id, case_id, category, estimated_cost_php, priority_level
      ) VALUES (
        @plan_id, @case_id, @category, @estimated_cost_php, @priority_level
      )
    `);
    const severityLevel = assessmentResult.severity_level || 'Low';
    const priorityLevel = severityLevel === 'Catastrophic' || severityLevel === 'Severe'
      ? 'High'
      : severityLevel === 'Moderate' ? 'Medium' : 'Low';

    const saveAssessment = db.transaction(() => {
      insertCase.run({
        case_id: assessmentId,
        user_id: req.user?.user_id ?? null,
        applicant_name: applicantName,
        contact_number: contactNumber,
        disaster_type: disasterType,
        incident_date: incidentDate,
        province: province || 'Unspecified',
        city_municipality: cityMunicipality || 'Unspecified',
        barangay: barangay || 'Unspecified',
        severity_level: severityLevel,
        severity_score: Number(assessmentResult.severity_score) || 0,
        estimated_cost_min: estimatedCostMin,
        estimated_cost_max: estimatedCostMax,
        damage_categories: JSON.stringify(damageCategories),
        recommended_subsidies: JSON.stringify(assessmentResult.matched_subsidies || []),
        eligibility_results: JSON.stringify(assessmentResult.eligibility_results),
        safety_precautions: JSON.stringify(assessmentResult.safety_precautions || []),
        damage_summary: assessmentResult.damage_summary || '',
        urgency: assessmentResult.urgency || '',
        suggested_actions: Array.isArray(assessmentResult.suggested_actions)
          ? JSON.stringify(assessmentResult.suggested_actions)
          : (typeof assessmentResult.suggested_actions === 'string' ? assessmentResult.suggested_actions : '[]')
      });

      for (const category of lossCategories) {
        const normalizedCategory = String(category);
        const loweredCategory = normalizedCategory.toLowerCase();
        const lossType = ['structural', 'agricultural', 'livelihood', 'general']
          .find((type) => loweredCategory.includes(type)) || 'general';

        insertLoss.run({
          loss_record_id: 'LOSS-' + crypto.randomUUID(),
          case_id: assessmentId,
          item_name: normalizedCategory,
          item_category: normalizedCategory,
          condition: severityLevel,
          loss_type: lossType,
          estimated_loss_php: estimatedCostMax / lossCategories.length,
          description: damageDescription
        });

        insertRecoveryPlan.run({
          plan_id: 'PLAN-' + crypto.randomUUID(),
          case_id: assessmentId,
          category: normalizedCategory,
          estimated_cost_php: estimatedCostMax / lossCategories.length,
          priority_level: priorityLevel
        });
      }
    });
    saveAssessment();

    res.json({
      success: true,
      assessmentId,
      data: {
        id: assessmentId,
        case_id: assessmentId,
        disaster_type: disasterType,
        incident_date: incidentDate,
        location,
        applicant_name: applicantName,
        ...assessmentResult
      }
    });
  } catch (error) {
    if (
      error.code === 'IRRELEVANT_IMAGE'
      || error.code === 'NO_DAMAGE_DETECTED'
      || error.code === 'AI_UNAVAILABLE'
    ) {
      return res.status(422).json({
        success: false,
        code: error.code,
        reason: error.reason,
        error: error.message
      });
    }
    console.error('Error conducting assessment:', error);
    res.status(500).json({ success: false, code: 'SERVER_ERROR', error: 'An unexpected error occurred while processing your damage assessment. Please try again.' });
  }
});

router.get('/', requireAuthenticatedUser, (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const countRow = db.prepare(`
      SELECT COUNT(*) as total FROM recovery_cases WHERE user_id = ?
    `).get(req.user.user_id);
    const total = countRow ? countRow.total : 0;

    const rows = db.prepare(`
      SELECT * FROM recovery_cases
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(req.user.user_id, limit, offset);

    const formatted = rows.map(formatRecoveryCase);
    res.json({
      success: true,
      count: formatted.length,
      data: formatted,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching assessments:', error);
    res.status(500).json({ success: false, error: 'Database error fetching assessments.' });
  }
});

// Get single assessment
router.get('/:id', requireAuthenticatedUser, (req, res) => {
  try {
    const row = db.prepare(`
      SELECT * FROM recovery_cases
      WHERE case_id = ? AND user_id = ?
    `).get(req.params.id, req.user.user_id);
    if (!row) {
      return res.status(404).json({ success: false, error: 'Assessment record not found.' });
    }
    const formatted = formatRecoveryCase(row);
    res.json({ success: true, data: formatted });
  } catch (error) {
    console.error('Error fetching assessment:', error);
    res.status(500).json({ success: false, error: 'Database error fetching assessment.' });
  }
});

function recoveryDocumentCount(caseId) {
  const table = db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'recovery_documents'"
  ).get();
  if (!table) return 0;
  return db.prepare('SELECT COUNT(*) AS total FROM recovery_documents WHERE case_id = ?')
    .get(caseId).total;
}

function caseDeletionImpact(caseId, userId) {
  const count = (sql) => db.prepare(sql).get(caseId, userId).total;
  return {
    loss_records: db.prepare('SELECT COUNT(*) AS total FROM loss_records WHERE case_id = ?')
      .get(caseId).total,
    recovery_plans: db.prepare('SELECT COUNT(*) AS total FROM recovery_plans WHERE case_id = ?')
      .get(caseId).total,
    aid_records: count('SELECT COUNT(*) AS total FROM aid_ledger WHERE case_id = ? AND user_id = ?'),
    linked_applications: count(
      'SELECT COUNT(*) AS total FROM applications WHERE case_id = ? AND user_id = ?'
    ),
    documents: recoveryDocumentCount(caseId)
  };
}

// Preview what deleting a case would remove, so the app can warn before anything is lost.
router.get('/:id/delete-impact', requireAuthenticatedUser, (req, res) => {
  try {
    const row = db.prepare('SELECT case_id FROM recovery_cases WHERE case_id = ? AND user_id = ?')
      .get(req.params.id, req.user.user_id);
    if (!row) {
      return res.status(404).json({ success: false, error: 'Recovery case not found.' });
    }
    res.json({ success: true, data: caseDeletionImpact(row.case_id, req.user.user_id) });
  } catch (error) {
    console.error('Error checking case deletion impact:', error);
    res.status(500).json({ success: false, error: 'Database error checking the recovery case.' });
  }
});

// Permanently delete a recovery case. Loss records, recovery plans and aid ledger entries are
// removed with it; saved applications are kept and simply become unlinked.
router.delete('/:id', requireAuthenticatedUser, (req, res) => {
  try {
    const row = db.prepare('SELECT case_id FROM recovery_cases WHERE case_id = ? AND user_id = ?')
      .get(req.params.id, req.user.user_id);
    if (!row) {
      return res.status(404).json({ success: false, error: 'Recovery case not found.' });
    }

    if (recoveryDocumentCount(row.case_id) > 0) {
      return res.status(409).json({
        success: false,
        error: 'This case has uploaded documents. Remove them before deleting the case.'
      });
    }

    const impact = db.transaction(() => {
      const summary = caseDeletionImpact(row.case_id, req.user.user_id);
      db.prepare('UPDATE applications SET case_id = NULL WHERE case_id = ? AND user_id = ?')
        .run(row.case_id, req.user.user_id);
      db.prepare('DELETE FROM aid_ledger WHERE case_id = ?').run(row.case_id);
      db.prepare('DELETE FROM loss_records WHERE case_id = ?').run(row.case_id);
      db.prepare('DELETE FROM recovery_plans WHERE case_id = ?').run(row.case_id);
      db.prepare('DELETE FROM recovery_cases WHERE case_id = ? AND user_id = ?')
        .run(row.case_id, req.user.user_id);
      return summary;
    })();

    res.json({ success: true, message: 'Recovery case deleted.', data: impact });
  } catch (error) {
    console.error('Error deleting recovery case:', error);
    res.status(500).json({ success: false, error: 'Database error deleting the recovery case.' });
  }
});

export default router;
