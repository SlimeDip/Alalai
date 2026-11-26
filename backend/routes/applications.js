import express from 'express';
import crypto from 'crypto';
import db from '../database.js';
import { findSubsidy } from '../services/subsidyCatalog.js';

const router = express.Router();
const recognizedStatuses = new Set(['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED']);
// No authorized review routes exist, so ordinary CRUD is limited to draft/submission states.
const userEditableStatuses = new Set(['DRAFT', 'SUBMITTED']);
const stringFields = [
  'assessment_id',
  'case_id',
  'applicant_name',
  'birth_date',
  'sex',
  'civil_status',
  'contact_number',
  'valid_id_type',
  'valid_id_number',
  'occupation',
  'beneficiary_category',
  'representative_name',
  'representative_relationship',
  'representative_contact',
  'barangay_certificate_reference',
  'spouse_name',
  'children_count',
  'province',
  'city_municipality',
  'barangay',
  'purok_street',
  'disaster_type',
  'incident_date',
  'damage_level',
  'damage_summary',
  'declared_needs',
  'rsbsa_number',
  'agricultural_activity',
  'farm_fishery_location',
  'land_tenure',
  'pcic_policy_number',
  'status'
];

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseNumber(value, field, { integer = false, minimum = 0 } = {}) {
  const number = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number(value)
      : NaN;
  if (
    !Number.isFinite(number)
    || number < minimum
    || (integer && !Number.isSafeInteger(number))
  ) {
    return { error: `${field} must be a ${integer ? 'whole' : 'valid'} number not less than ${minimum}.` };
  }
  return { value: number };
}

function validateHouseholdMembers(value) {
  if (!Array.isArray(value)) {
    return 'household_members_detail must be an array.';
  }

  for (let index = 0; index < value.length; index += 1) {
    const member = value[index];
    if (!isRecord(member)) {
      return `household_members_detail[${index}] must be an object.`;
    }
    const allowedFields = new Set(['name', 'age', 'relationship']);
    if (Object.keys(member).some((field) => !allowedFields.has(field))) {
      return `household_members_detail[${index}] contains an unsupported field.`;
    }
    for (const field of ['name', 'relationship']) {
      if (typeof member[field] !== 'string') {
        return `household_members_detail[${index}].${field} must be a string.`;
      }
    }
    if (member.age != null && member.age !== '') {
      const age = parseNumber(member.age, `household_members_detail[${index}].age`, {
        integer: true
      });
      if (age.error || age.value > 120) {
        return `household_members_detail[${index}].age must be a whole number between 0 and 120.`;
      }
    }
  }
  return null;
}

function validateApplicationPayload(body, { existing = null, userId } = {}) {
  if (!isRecord(body)) return { error: 'Request body must be a JSON object.' };

  // Saved profiles store the number of children as a number, so accept a whole number here.
  if (Number.isInteger(body.children_count) && body.children_count >= 0) {
    body.children_count = String(body.children_count);
  }

  for (const field of stringFields) {
    if (body[field] != null && typeof body[field] !== 'string') {
      return { error: `${field} must be a string.` };
    }
  }

  const requiredFields = ['applicant_name', 'province', 'city_municipality', 'barangay'];
  for (const field of requiredFields) {
    const value = body[field] ?? existing?.[field];
    if (typeof value !== 'string' || !value.trim()) {
      return { error: `${field} is required and must be a non-empty string.` };
    }
  }

  const numericFields = {
    applicant_age: { defaultValue: null, integer: true, optional: true },
    household_members_count: { defaultValue: 1, integer: true, minimum: 1 },
    estimated_damage_php: { defaultValue: 0 },
    requested_amount_php: { defaultValue: 0 }
  };
  const numbers = {};
  for (const [field, config] of Object.entries(numericFields)) {
    const value = body[field] !== undefined
      ? body[field]
      : existing?.[field] ?? config.defaultValue;
    if (config.optional && (value == null || value === '')) {
      numbers[field] = null;
      continue;
    }
    const parsed = parseNumber(value, field, config);
    if (parsed.error) return parsed;
    if (field === 'applicant_age' && parsed.value > 120) {
      return { error: 'applicant_age must be a whole number between 0 and 120.' };
    }
    numbers[field] = parsed.value;
  }

  const householdMembers = body.household_members_detail !== undefined
    ? body.household_members_detail
    : existing
      ? JSON.parse(existing.household_members_detail || '[]')
      : [];
  const householdError = validateHouseholdMembers(householdMembers);
  if (householdError) return { error: householdError };

  const subsidies = body.applied_subsidies !== undefined
    ? body.applied_subsidies
    : existing
      ? JSON.parse(existing.applied_subsidies || '[]')
      : [];
  if (!Array.isArray(subsidies) || subsidies.some(
    (selection) => typeof selection !== 'string' || !selection.trim()
  )) {
    return { error: 'applied_subsidies must be an array of non-empty subsidy IDs or titles.' };
  }
  // Every application must be for a specific aid program.
  if (subsidies.length === 0) {
    return { error: 'Choose the aid program this application is for.' };
  }
  const existingSubsidies = existing
    ? JSON.parse(existing.applied_subsidies || '[]')
    : [];
  for (const selection of subsidies) {
    const reference = selection.trim();
    if (!findSubsidy(reference) && !existingSubsidies.includes(reference)) {
      return { error: `Unknown subsidy reference: ${reference}.` };
    }
  }

  const requestedStatus = body.status !== undefined ? body.status : existing?.status ?? 'DRAFT';
  if (!recognizedStatuses.has(requestedStatus)) {
    return { error: 'status must be one of DRAFT, SUBMITTED, UNDER_REVIEW, or APPROVED.' };
  }
  if (!userEditableStatuses.has(requestedStatus)) {
    return {
      error: 'Applications may be created or edited only as DRAFT or SUBMITTED; review decisions require an authorized workflow.'
    };
  }

  if (body.sworn_attestation !== true && body.sworn_attestation !== 1) {
    return { error: 'sworn_attestation must be explicitly confirmed before saving.' };
  }
  const attestation = 1;

  const optionalStrings = {};
  for (const field of stringFields) {
    if (['assessment_id', 'case_id', 'applicant_name', 'province', 'city_municipality', 'barangay', 'status'].includes(field)) {
      continue;
    }
    if (body[field] !== undefined) {
      optionalStrings[field] = body[field];
    } else if (existing && field in existing) {
      optionalStrings[field] = existing[field];
    }
  }

  if (body.assessment_id !== undefined) {
    if (body.case_id === undefined) {
      return { error: 'Use case_id to identify a recovery case; assessment_id is not accepted.' };
    }
    if (
      body.assessment_id != null
      && body.assessment_id !== ''
      && body.assessment_id !== body.case_id
    ) {
      return { error: 'case_id and assessment_id must refer to the same recovery case.' };
    }
  }
  const caseId = body.case_id !== undefined
    ? (body.case_id || null)
    : existing?.case_id ?? null;
  if (typeof caseId === 'string' && caseId.startsWith('APP-')) {
    return { error: 'case_id must identify a recovery case, not an application.' };
  }
  if (caseId && !db.prepare(`
    SELECT 1 FROM recovery_cases WHERE case_id = ? AND user_id = ?
  `).get(caseId, userId)) {
    return { error: 'The linked recovery case was not found or is not owned by this user.' };
  }

  return {
    value: {
      ...optionalStrings,
      applicant_name: body.applicant_name ?? existing?.applicant_name,
      province: body.province ?? existing?.province,
      city_municipality: body.city_municipality ?? existing?.city_municipality,
      barangay: body.barangay ?? existing?.barangay,
      ...numbers,
      household_members_detail: householdMembers,
      applied_subsidies: subsidies,
      sworn_attestation: attestation ? 1 : 0,
      status: requestedStatus,
      case_id: caseId,
      birth_date: optionalStrings.birth_date ?? '',
      sex: optionalStrings.sex ?? '',
      occupation: optionalStrings.occupation ?? '',
      beneficiary_category: optionalStrings.beneficiary_category ?? '',
      representative_name: optionalStrings.representative_name ?? '',
      representative_relationship: optionalStrings.representative_relationship ?? '',
      representative_contact: optionalStrings.representative_contact ?? '',
      barangay_certificate_reference: optionalStrings.barangay_certificate_reference ?? '',
      spouse_name: optionalStrings.spouse_name ?? '',
      children_count: optionalStrings.children_count ?? '',
      rsbsa_number: optionalStrings.rsbsa_number ?? '',
      agricultural_activity: optionalStrings.agricultural_activity ?? '',
      farm_fishery_location: optionalStrings.farm_fishery_location ?? '',
      land_tenure: optionalStrings.land_tenure ?? '',
      pcic_policy_number: optionalStrings.pcic_policy_number ?? '',
      disaster_type: optionalStrings.disaster_type || 'Typhoon',
      incident_date: optionalStrings.incident_date || new Date().toISOString().split('T')[0],
      damage_level: optionalStrings.damage_level || 'Moderate',
      damage_summary: optionalStrings.damage_summary || 'Disaster damage assessment claim.',
      civil_status: optionalStrings.civil_status ?? 'Married',
      contact_number: optionalStrings.contact_number ?? '',
      valid_id_type: optionalStrings.valid_id_type ?? 'Philippine National ID (PhilSys)',
      valid_id_number: optionalStrings.valid_id_number ?? '',
      purok_street: optionalStrings.purok_street ?? '',
      declared_needs: optionalStrings.declared_needs ?? ''
    }
  };
}

// Helper to generate official Philippine Disaster Intake Reference Number
function generateReferenceNumber() {
  const year = new Date().getFullYear();
  const randomHex = crypto.randomBytes(6).toString('hex').toUpperCase();
  return `NDRRMC-PH-${year}-${randomHex}`;
}

// Create new application
router.post('/', (req, res) => {
  try {
    const validated = validateApplicationPayload(req.body, { userId: req.user.user_id });
    if (validated.error) {
      return res.status(400).json({ success: false, error: validated.error });
    }
    const application = validated.value;

    const id = 'APP-' + crypto.randomUUID();
    const reference_number = generateReferenceNumber();

    const insert = db.prepare(`
      INSERT INTO applications (
        application_id, case_id, user_id, reference_number, applicant_name, applicant_age,
        birth_date, sex, civil_status, contact_number, valid_id_type, valid_id_number,
        occupation, beneficiary_category, representative_name, representative_relationship,
        representative_contact, barangay_certificate_reference, spouse_name, children_count,
        province, city_municipality, barangay, purok_street,
        household_members_count, household_members_detail,
        disaster_type, incident_date, damage_level, damage_summary,
        applied_subsidies, estimated_damage_php, requested_amount_php,
        declared_needs, rsbsa_number, agricultural_activity, farm_fishery_location,
        land_tenure, pcic_policy_number, sworn_attestation, status
      ) VALUES (
        @application_id, @case_id, @user_id, @reference_number, @applicant_name, @applicant_age,
        @birth_date, @sex, @civil_status, @contact_number, @valid_id_type, @valid_id_number,
        @occupation, @beneficiary_category, @representative_name, @representative_relationship,
        @representative_contact, @barangay_certificate_reference, @spouse_name, @children_count,
        @province, @city_municipality, @barangay, @purok_street,
        @household_members_count, @household_members_detail,
        @disaster_type, @incident_date, @damage_level, @damage_summary,
        @applied_subsidies, @estimated_damage_php, @requested_amount_php,
        @declared_needs, @rsbsa_number, @agricultural_activity, @farm_fishery_location,
        @land_tenure, @pcic_policy_number, @sworn_attestation, @status
      )
    `);

    insert.run({
      application_id: id,
      case_id: application.case_id,
      user_id: req.user.user_id,
      reference_number,
      ...application,
      household_members_detail: JSON.stringify(application.household_members_detail),
      applied_subsidies: JSON.stringify(application.applied_subsidies)
    });

    const created = db.prepare('SELECT * FROM applications WHERE application_id = ?').get(id);

    res.status(201).json({
      success: true,
      message: 'Disaster aid application slip saved successfully.',
      data: {
        ...created,
        id: created.application_id,
        assessment_id: created.case_id,
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
    const existing = db.prepare(`
      SELECT * FROM applications
      WHERE application_id = ? AND user_id = ?
    `).get(id, req.user.user_id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Application not found.' });
    }

    const userEditableStatuses = new Set(['DRAFT', 'SUBMITTED']);
    if (!userEditableStatuses.has(existing.status)) {
      return res.status(403).json({ success: false, error: 'Applications under review or approved cannot be modified.' });
    }

    const validated = validateApplicationPayload(req.body, {
      existing,
      userId: req.user.user_id
    });
    if (validated.error) {
      return res.status(400).json({ success: false, error: validated.error });
    }
    const application = validated.value;

    const update = db.prepare(`
      UPDATE applications SET
        case_id = @case_id,
        applicant_name = @applicant_name,
        applicant_age = @applicant_age,
        birth_date = @birth_date,
        sex = @sex,
        civil_status = @civil_status,
        contact_number = @contact_number,
        valid_id_type = @valid_id_type,
        valid_id_number = @valid_id_number,
        occupation = @occupation,
        beneficiary_category = @beneficiary_category,
        representative_name = @representative_name,
        representative_relationship = @representative_relationship,
        representative_contact = @representative_contact,
        barangay_certificate_reference = @barangay_certificate_reference,
        spouse_name = @spouse_name,
        children_count = @children_count,
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
        rsbsa_number = @rsbsa_number,
        agricultural_activity = @agricultural_activity,
        farm_fishery_location = @farm_fishery_location,
        land_tenure = @land_tenure,
        pcic_policy_number = @pcic_policy_number,
        sworn_attestation = @sworn_attestation,
        status = @status,
        updated_at = CURRENT_TIMESTAMP
      WHERE application_id = @id AND user_id = @user_id
    `);

    update.run({
      id,
      user_id: req.user.user_id,
      ...application,
      household_members_detail: JSON.stringify(application.household_members_detail),
      applied_subsidies: JSON.stringify(application.applied_subsidies)
    });

    const updated = db.prepare('SELECT * FROM applications WHERE application_id = ?').get(id);

    res.json({
      success: true,
      message: 'Application updated successfully.',
      data: {
        ...updated,
        id: updated.application_id,
        assessment_id: updated.case_id,
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
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const countRow = db.prepare(`
      SELECT COUNT(*) as total FROM applications WHERE user_id = ?
    `).get(req.user.user_id);
    const total = countRow ? countRow.total : 0;

    const rows = db.prepare(`
      SELECT * FROM applications
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(req.user.user_id, limit, offset);

    const formatted = rows.map(r => ({
      ...r,
      id: r.application_id,
      assessment_id: r.case_id,
      household_members_detail: JSON.parse(r.household_members_detail || '[]'),
      applied_subsidies: JSON.parse(r.applied_subsidies || '[]')
    }));

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
    console.error('Error fetching applications:', error);
    res.status(500).json({ success: false, error: 'Database error fetching applications.' });
  }
});

// Get single application
router.get('/:id', (req, res) => {
  try {
    const row = db.prepare(`
      SELECT * FROM applications
      WHERE application_id = ? AND user_id = ?
    `).get(req.params.id, req.user.user_id);
    if (!row) {
      return res.status(404).json({ success: false, error: 'Application record not found.' });
    }
    const formatted = {
      ...row,
      id: row.application_id,
      assessment_id: row.case_id,
      household_members_detail: JSON.parse(row.household_members_detail || '[]'),
      applied_subsidies: JSON.parse(row.applied_subsidies || '[]')
    };
    res.json({ success: true, data: formatted });
  } catch (error) {
    console.error('Error fetching application:', error);
    res.status(500).json({ success: false, error: 'Database error fetching application.' });
  }
});

const APPLICATION_NAME_MAX_LENGTH = 80;

// Rename a saved application. The name is only a personal label shown instead of the
// reference number, so it is allowed in any status and never touches the application's content.
router.patch('/:id/name', (req, res) => {
  try {
    if (!isRecord(req.body) || (req.body.name != null && typeof req.body.name !== 'string')) {
      return res.status(400).json({ success: false, error: 'name must be a string.' });
    }
    const name = (req.body.name ?? '').trim();
    if (name.length > APPLICATION_NAME_MAX_LENGTH) {
      return res.status(400).json({
        success: false,
        error: `name must be at most ${APPLICATION_NAME_MAX_LENGTH} characters.`
      });
    }

    const result = db.prepare(`
      UPDATE applications SET application_name = ?
      WHERE application_id = ? AND user_id = ?
    `).run(name || null, req.params.id, req.user.user_id);
    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: 'Application not found.' });
    }

    const row = db.prepare('SELECT * FROM applications WHERE application_id = ?').get(req.params.id);
    res.json({
      success: true,
      message: name ? 'Application renamed.' : 'Application name cleared.',
      data: {
        ...row,
        id: row.application_id,
        assessment_id: row.case_id,
        household_members_detail: JSON.parse(row.household_members_detail || '[]'),
        applied_subsidies: JSON.parse(row.applied_subsidies || '[]')
      }
    });
  } catch (error) {
    console.error('Error renaming application:', error);
    res.status(500).json({ success: false, error: 'Database error renaming application.' });
  }
});

// Delete application
router.delete('/:id', (req, res) => {
  try {
    const result = db.prepare(`
      DELETE FROM applications
      WHERE application_id = ? AND user_id = ?
    `).run(req.params.id, req.user.user_id);
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
