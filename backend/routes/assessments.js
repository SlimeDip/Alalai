import express from 'express';
import crypto from 'crypto';
import db from '../database.js';
import { analyzeDisasterDamage } from '../services/aiService.js';

const router = express.Router();

// Run damage assessment through AI template + heuristic and save to SQLite
router.post('/', async (req, res) => {
  try {
    const {
      disasterType = 'Typhoon',
      damageDescription,
      applicantName = 'Resident Applicant',
      contactNumber = '',
      province = '',
      cityMunicipality = '',
      barangay = '',
      householdSize = 1,
      incidentDate = new Date().toISOString().split('T')[0]
    } = req.body;

    if (!damageDescription || damageDescription.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Damage description is required for assessment.'
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
    const assessmentId = 'ASSESS-' + crypto.randomUUID().slice(0, 8).toUpperCase();

    // Save to SQLite
    const insertStmt = db.prepare(`
      INSERT INTO assessments (
        id, applicant_name, contact_number, province, city_municipality,
        barangay, disaster_type, incident_date, raw_description,
        severity_level, severity_score, damage_categories,
        estimated_cost_min, estimated_cost_max, recommended_subsidies,
        safety_precautions
      ) VALUES (
        @id, @applicant_name, @contact_number, @province, @city_municipality,
        @barangay, @disaster_type, @incident_date, @raw_description,
        @severity_level, @severity_score, @damage_categories,
        @estimated_cost_min, @estimated_cost_max, @recommended_subsidies,
        @safety_precautions
      )
    `);

    insertStmt.run({
      id: assessmentId,
      applicant_name: applicantName,
      contact_number: contactNumber,
      province,
      city_municipality: cityMunicipality,
      barangay,
      disaster_type: disasterType,
      incident_date: incidentDate,
      raw_description: damageDescription,
      severity_level: assessmentResult.severity_level,
      severity_score: assessmentResult.severity_score || 50,
      damage_categories: JSON.stringify(assessmentResult.damage_categories || []),
      estimated_cost_min: assessmentResult.estimated_cost_min || 0,
      estimated_cost_max: assessmentResult.estimated_cost_max || 0,
      recommended_subsidies: JSON.stringify(assessmentResult.matched_subsidies || []),
      safety_precautions: JSON.stringify(assessmentResult.safety_precautions || [])
    });

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
    res.status(500).json({ success: false, error: 'Internal assessment error: ' + error.message });
  }
});

// Get past assessments
router.get('/', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM assessments ORDER BY created_at DESC LIMIT 50').all();
    const formatted = rows.map(r => ({
      ...r,
      damage_categories: JSON.parse(r.damage_categories || '[]'),
      recommended_subsidies: JSON.parse(r.recommended_subsidies || '[]'),
      safety_precautions: JSON.parse(r.safety_precautions || '[]')
    }));
    res.json({ success: true, count: formatted.length, data: formatted });
  } catch (error) {
    console.error('Error fetching assessments:', error);
    res.status(500).json({ success: false, error: 'Database error fetching assessments.' });
  }
});

// Get single assessment
router.get('/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM assessments WHERE id = ?').get(req.params.id);
    if (!row) {
      return res.status(404).json({ success: false, error: 'Assessment record not found.' });
    }
    const formatted = {
      ...row,
      damage_categories: JSON.parse(row.damage_categories || '[]'),
      recommended_subsidies: JSON.parse(row.recommended_subsidies || '[]'),
      safety_precautions: JSON.parse(row.safety_precautions || '[]')
    };
    res.json({ success: true, data: formatted });
  } catch (error) {
    console.error('Error fetching assessment:', error);
    res.status(500).json({ success: false, error: 'Database error fetching assessment.' });
  }
});

export default router;
