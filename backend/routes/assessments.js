import express from 'express';
import crypto from 'crypto';
import db from '../database.js';
import { analyzeDisasterDamage } from '../services/aiService.js';

const router = express.Router();

function formatRecoveryCase(row) {
  const lossRecords = db.prepare(`
    SELECT * FROM loss_records WHERE case_id = ? ORDER BY created_at ASC
  `).all(row.case_id);
  const recoveryPlans = db.prepare(`
    SELECT * FROM recovery_plans WHERE case_id = ? ORDER BY created_at ASC
  `).all(row.case_id);

  return {
    id: row.case_id,
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
    damage_categories: JSON.parse(row.damage_categories || '[]'),
    estimated_cost_min: row.estimated_cost_min,
    estimated_cost_max: row.estimated_cost_max,
    recommended_subsidies: JSON.parse(row.recommended_subsidies || '[]'),
    safety_precautions: JSON.parse(row.safety_precautions || '[]'),
    created_at: row.created_at,
    loss_records: lossRecords,
    recovery_plans: recoveryPlans
  };
}

// Run damage assessment through AI template + heuristic and save to SQLite
router.post('/', async (req, res) => {
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

    if (typeof damageDescription !== 'string' || damageDescription.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Damage description is required for assessment.'
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
      householdSize: Number(householdSize) || 1
    });

    // Generate unique ID
    const assessmentId = 'CASE-' + crypto.randomUUID().slice(0, 8).toUpperCase();
    const damageCategories = assessmentResult.damage_categories || [];
    const lossCategories = damageCategories.length ? damageCategories : ['general'];
    const estimatedCostMin = Number(assessmentResult.estimated_cost_min) || 0;
    const estimatedCostMax = Number(assessmentResult.estimated_cost_max) || 0;
    const insertCase = db.prepare(`
      INSERT INTO recovery_cases (
        case_id, user_id, applicant_name, contact_number, disaster_type,
        incident_date, province, city_municipality, barangay, severity_level,
        severity_score, estimated_cost_min, estimated_cost_max,
        damage_categories, recommended_subsidies, safety_precautions
      ) VALUES (
        @case_id, @user_id, @applicant_name, @contact_number, @disaster_type,
        @incident_date, @province, @city_municipality, @barangay, @severity_level,
        @severity_score, @estimated_cost_min, @estimated_cost_max,
        @damage_categories, @recommended_subsidies, @safety_precautions
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
        user_id: req.user.user_id,
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
        safety_precautions: JSON.stringify(assessmentResult.safety_precautions || [])
      });

      for (const category of lossCategories) {
        const normalizedCategory = String(category);
        const loweredCategory = normalizedCategory.toLowerCase();
        const lossType = ['structural', 'agricultural', 'livelihood', 'general']
          .find((type) => loweredCategory.includes(type)) || 'general';

        insertLoss.run({
          loss_record_id: 'LOSS-' + crypto.randomUUID().slice(0, 8).toUpperCase(),
          case_id: assessmentId,
          item_name: normalizedCategory,
          item_category: normalizedCategory,
          condition: severityLevel,
          loss_type: lossType,
          estimated_loss_php: estimatedCostMax / lossCategories.length,
          description: damageDescription
        });

        insertRecoveryPlan.run({
          plan_id: 'PLAN-' + crypto.randomUUID().slice(0, 8).toUpperCase(),
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
        disaster_type: disasterType,
        incident_date: incidentDate,
        location,
        applicant_name: applicantName,
        ...assessmentResult
      }
    });
  } catch (error) {
    console.error('Error conducting assessment:', error);
    res.status(500).json({ success: false, error: 'Internal assessment error.' });
  }
});

router.get('/', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT * FROM recovery_cases
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 50
    `).all(req.user.user_id);
    const formatted = rows.map(formatRecoveryCase);
    res.json({ success: true, count: formatted.length, data: formatted });
  } catch (error) {
    console.error('Error fetching assessments:', error);
    res.status(500).json({ success: false, error: 'Database error fetching assessments.' });
  }
});

// Get single assessment
router.get('/:id', (req, res) => {
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

export default router;
