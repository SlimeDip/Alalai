import express from 'express';
import crypto from 'crypto';
import db from '../database.js';

const router = express.Router();

// Helper to generate official Philippine Disaster Intake Reference Number
function generateReferenceNumber() {
  const year = new Date().getFullYear();
  const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `NDRRMC-PH-${year}-${randomHex}`;
}

// Create new application
router.post('/', (req, res) => {
  try {
    const {
      assessment_id = null,
      applicant_name,
      applicant_age = 35,
      civil_status = 'Married',
      contact_number = '',
      valid_id_type = 'Philippine National ID (PhilSys)',
      valid_id_number = '',
      province,
      city_municipality,
      barangay,
      purok_street = '',
      household_members_count = 1,
      household_members_detail = [],
      disaster_type,
      incident_date = new Date().toISOString().split('T')[0],
      damage_level = 'Moderate',
      damage_summary,
      applied_subsidies = [],
      estimated_damage_php = 0,
      requested_amount_php = 0,
      declared_needs = '',
      sworn_attestation = 1,
      status = 'DRAFT'
    } = req.body;

    if (!applicant_name || !province || !city_municipality || !barangay) {
      return res.status(400).json({
        success: false,
        error: 'Applicant name, Province, City/Municipality, and Barangay are required.'
      });
    }

    const id = 'APP-' + crypto.randomUUID().slice(0, 8).toUpperCase();
    const reference_number = generateReferenceNumber();

    const insert = db.prepare(`
      INSERT INTO applications (
        id, assessment_id, reference_number, applicant_name, applicant_age,
        civil_status, contact_number, valid_id_type, valid_id_number,
        province, city_municipality, barangay, purok_street,
        household_members_count, household_members_detail,
        disaster_type, incident_date, damage_level, damage_summary,
        applied_subsidies, estimated_damage_php, requested_amount_php,
        declared_needs, sworn_attestation, status
      ) VALUES (
        @id, @assessment_id, @reference_number, @applicant_name, @applicant_age,
        @civil_status, @contact_number, @valid_id_type, @valid_id_number,
        @province, @city_municipality, @barangay, @purok_street,
        @household_members_count, @household_members_detail,
        @disaster_type, @incident_date, @damage_level, @damage_summary,
        @applied_subsidies, @estimated_damage_php, @requested_amount_php,
        @declared_needs, @sworn_attestation, @status
      )
    `);

    insert.run({
      id,
      assessment_id,
      reference_number,
      applicant_name,
      applicant_age: Number(applicant_age) || 30,
      civil_status,
      contact_number,
      valid_id_type,
      valid_id_number,
      province,
      city_municipality,
      barangay,
      purok_street,
      household_members_count: Number(household_members_count) || 1,
      household_members_detail: JSON.stringify(household_members_detail),
      disaster_type: disaster_type || 'Typhoon',
      incident_date,
      damage_level,
      damage_summary: damage_summary || 'Disaster damage assessment claim.',
      applied_subsidies: JSON.stringify(applied_subsidies),
      estimated_damage_php: Number(estimated_damage_php) || 0,
      requested_amount_php: Number(requested_amount_php) || 0,
      declared_needs,
      sworn_attestation: sworn_attestation ? 1 : 0,
      status
    });

    const created = db.prepare('SELECT * FROM applications WHERE id = ?').get(id);

    res.status(201).json({
      success: true,
      message: 'Disaster aid application slip saved successfully.',
      data: {
        ...created,
        household_members_detail: JSON.parse(created.household_members_detail || '[]'),
        applied_subsidies: JSON.parse(created.applied_subsidies || '[]')
      }
    });
  } catch (error) {
    console.error('Error creating application:', error);
    res.status(500).json({ success: false, error: 'Database error saving application.' });
  }
});

// Update editable application fields
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM applications WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Application not found.' });
    }

    const {
      applicant_name = existing.applicant_name,
      applicant_age = existing.applicant_age,
      civil_status = existing.civil_status,
      contact_number = existing.contact_number,
      valid_id_type = existing.valid_id_type,
      valid_id_number = existing.valid_id_number,
      province = existing.province,
      city_municipality = existing.city_municipality,
      barangay = existing.barangay,
      purok_street = existing.purok_street,
      household_members_count = existing.household_members_count,
      household_members_detail = JSON.parse(existing.household_members_detail || '[]'),
      disaster_type = existing.disaster_type,
      incident_date = existing.incident_date,
      damage_level = existing.damage_level,
      damage_summary = existing.damage_summary,
      applied_subsidies = JSON.parse(existing.applied_subsidies || '[]'),
      estimated_damage_php = existing.estimated_damage_php,
      requested_amount_php = existing.requested_amount_php,
      declared_needs = existing.declared_needs,
      sworn_attestation = existing.sworn_attestation,
      status = existing.status
    } = req.body;

    const update = db.prepare(`
      UPDATE applications SET
        applicant_name = @applicant_name,
        applicant_age = @applicant_age,
        civil_status = @civil_status,
        contact_number = @contact_number,
        valid_id_type = @valid_id_type,
        valid_id_number = @valid_id_number,
        province = @province,
        city_municipality = @city_municipality,
        barangay = @barangay,
        purok_street = @purok_street,
        household_members_count = @household_members_count,
        household_members_detail = @household_members_detail,
        disaster_type = @disaster_type,
        incident_date = @incident_date,
        damage_level = @damage_level,
        damage_summary = @damage_summary,
        applied_subsidies = @applied_subsidies,
        estimated_damage_php = @estimated_damage_php,
        requested_amount_php = @requested_amount_php,
        declared_needs = @declared_needs,
        sworn_attestation = @sworn_attestation,
        status = @status,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `);

    update.run({
      id,
      applicant_name,
      applicant_age: Number(applicant_age) || 30,
      civil_status,
      contact_number,
      valid_id_type,
      valid_id_number,
      province,
      city_municipality,
      barangay,
      purok_street,
      household_members_count: Number(household_members_count) || 1,
      household_members_detail: JSON.stringify(household_members_detail),
      disaster_type,
      incident_date,
      damage_level,
      damage_summary,
      applied_subsidies: JSON.stringify(applied_subsidies),
      estimated_damage_php: Number(estimated_damage_php) || 0,
      requested_amount_php: Number(requested_amount_php) || 0,
      declared_needs,
      sworn_attestation: sworn_attestation ? 1 : 0,
      status
    });

    const updated = db.prepare('SELECT * FROM applications WHERE id = ?').get(id);

    res.json({
      success: true,
      message: 'Application updated successfully.',
      data: {
        ...updated,
        household_members_detail: JSON.parse(updated.household_members_detail || '[]'),
        applied_subsidies: JSON.parse(updated.applied_subsidies || '[]')
      }
    });
  } catch (error) {
    console.error('Error updating application:', error);
    res.status(500).json({ success: false, error: 'Database error updating application.' });
  }
});

// Get all applications
router.get('/', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM applications ORDER BY created_at DESC LIMIT 100').all();
    const formatted = rows.map(r => ({
      ...r,
      household_members_detail: JSON.parse(r.household_members_detail || '[]'),
      applied_subsidies: JSON.parse(r.applied_subsidies || '[]')
    }));
    res.json({ success: true, count: formatted.length, data: formatted });
  } catch (error) {
    console.error('Error fetching applications:', error);
    res.status(500).json({ success: false, error: 'Database error fetching applications.' });
  }
});

// Get single application
router.get('/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
    if (!row) {
      return res.status(404).json({ success: false, error: 'Application record not found.' });
    }
    const formatted = {
      ...row,
      household_members_detail: JSON.parse(row.household_members_detail || '[]'),
      applied_subsidies: JSON.parse(row.applied_subsidies || '[]')
    };
    res.json({ success: true, data: formatted });
  } catch (error) {
    console.error('Error fetching application:', error);
    res.status(500).json({ success: false, error: 'Database error fetching application.' });
  }
});

// Delete application
router.delete('/:id', (req, res) => {
  try {
    const result = db.prepare('DELETE FROM applications WHERE id = ?').run(req.params.id);
    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: 'Application not found.' });
    }
    res.json({ success: true, message: 'Application deleted.' });
  } catch (error) {
    console.error('Error deleting application:', error);
    res.status(500).json({ success: false, error: 'Database error deleting application.' });
  }
});

export default router;
