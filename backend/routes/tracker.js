import express from 'express';
import crypto from 'node:crypto';
import db from '../database.js';
import { findSubsidy } from '../services/subsidyCatalog.js';

const router = express.Router();
const statuses = new Set([
  'PREPARED',
  'SUBMITTED',
  'FOLLOW_UP_NEEDED',
  'DECISION_RECEIVED'
]);
const reminderStates = new Set(['ACTIVE', 'COMPLETED', 'DISMISSED']);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function text(value, field, maximum, { required = false } = {}) {
  if (value == null && !required) return { value: '' };
  if (typeof value !== 'string') return { error: `${field} must be text.` };
  const normalized = value.trim();
  if ((required && !normalized) || normalized.length > maximum) {
    return { error: `${field} must be ${required ? 'non-empty and ' : ''}at most ${maximum} characters.` };
  }
  return { value: normalized };
}

function date(value, field) {
  const parsedDate = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00.000Z`)
    : null;
  if (
    !parsedDate
    || Number.isNaN(parsedDate.getTime())
    || parsedDate.toISOString().slice(0, 10) !== value
  ) {
    return { error: `${field} must be a valid YYYY-MM-DD date.` };
  }
  return { value };
}

function ownedTracker(id, userId) {
  return db.prepare(`
    SELECT tracked_applications.*,
      recovery_cases.disaster_type, recovery_cases.incident_date,
      recovery_cases.province, recovery_cases.city_municipality, recovery_cases.barangay,
      applications.reference_number AS form_reference_number
    FROM tracked_applications
    JOIN recovery_cases ON recovery_cases.case_id = tracked_applications.case_id
    LEFT JOIN applications ON applications.application_id = tracked_applications.application_id
    WHERE tracked_applications.tracked_application_id = ?
      AND tracked_applications.user_id = ?
  `).get(id, userId);
}

function formatTracker(row) {
  return {
    ...row,
    history: db.prepare(`
      SELECT history_id, previous_status, new_status, note, created_at
      FROM tracked_application_history
      WHERE tracked_application_id = ?
      ORDER BY history_sequence ASC
    `).all(row.tracked_application_id),
    reminders: db.prepare(`
      SELECT reminder_id, reminder_date, note, state, created_at, updated_at
      FROM follow_up_reminders
      WHERE tracked_application_id = ?
      ORDER BY reminder_date ASC, created_at ASC
    `).all(row.tracked_application_id)
  };
}

function sendDatabaseError(res, error, message) {
  if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return res.status(409).json({ success: false, error: 'This program is already being tracked for that saved application.' });
  }
  console.error(message, error);
  return res.status(500).json({ success: false, error: 'Unable to save tracker changes.' });
}

router.get('/', (req, res) => {
  try {
    const filter = req.query.status;
    if (filter && !statuses.has(filter)) {
      return res.status(400).json({ success: false, error: 'Unknown tracker status filter.' });
    }
    const rows = db.prepare(`
      SELECT tracked_applications.*,
        recovery_cases.disaster_type, recovery_cases.incident_date,
        recovery_cases.province, recovery_cases.city_municipality, recovery_cases.barangay,
        applications.reference_number AS form_reference_number
      FROM tracked_applications
      JOIN recovery_cases ON recovery_cases.case_id = tracked_applications.case_id
      LEFT JOIN applications ON applications.application_id = tracked_applications.application_id
      WHERE tracked_applications.user_id = ?
        AND (? IS NULL OR tracked_applications.status = ?)
      ORDER BY tracked_applications.updated_at DESC, tracked_applications.created_at DESC
    `).all(req.user.user_id, filter || null, filter || null);
    res.json({ success: true, data: rows.map(formatTracker) });
  } catch (error) {
    console.error('Error fetching application tracker:', error);
    res.status(500).json({ success: false, error: 'Unable to fetch tracked applications.' });
  }
});

router.post('/', (req, res) => {
  try {
    if (!isRecord(req.body)) {
      return res.status(400).json({ success: false, error: 'Request body must be an object.' });
    }
    const caseId = text(req.body.case_id, 'case_id', 100, { required: true });
    const programName = text(req.body.program_name, 'program_name', 160, { required: true });
    const agencySource = text(req.body.agency_source, 'agency_source', 160);
    const applicationId = req.body.application_id == null || req.body.application_id === ''
      ? { value: null }
      : text(req.body.application_id, 'application_id', 100, { required: true });
    const referenceNumber = text(req.body.reference_number, 'reference_number', 120);
    const notes = text(req.body.notes, 'notes', 2000);
    const errors = [caseId, programName, agencySource, applicationId, referenceNumber, notes]
      .find((result) => result.error);
    if (errors) return res.status(400).json({ success: false, error: errors.error });

    if (!db.prepare(`
      SELECT 1 FROM recovery_cases WHERE case_id = ? AND user_id = ?
    `).get(caseId.value, req.user.user_id)) {
      return res.status(404).json({ success: false, error: 'Recovery case not found.' });
    }

    if (applicationId.value) {
      const application = db.prepare(`
        SELECT case_id, applied_subsidies FROM applications
        WHERE application_id = ? AND user_id = ?
      `).get(applicationId.value, req.user.user_id);
      if (!application) {
        return res.status(404).json({ success: false, error: 'Saved application not found.' });
      }
      if (application.case_id !== caseId.value) {
        return res.status(400).json({ success: false, error: 'The application and recovery case do not match.' });
      }
      let selectedPrograms;
      try {
        selectedPrograms = JSON.parse(application.applied_subsidies || '[]');
      } catch {
        selectedPrograms = [];
      }
      if (!Array.isArray(selectedPrograms) || !selectedPrograms.includes(programName.value)) {
        return res.status(400).json({ success: false, error: 'Choose a program selected on the saved application.' });
      }
    }

    const knownProgram = findSubsidy(programName.value);
    const storedProgramName = knownProgram?.title || programName.value;
    const id = `TRACK-${crypto.randomUUID()}`;
    db.transaction(() => {
      db.prepare(`
        INSERT INTO tracked_applications (
          tracked_application_id, user_id, case_id, application_id,
          program_name, agency_source, reference_number, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        req.user.user_id,
        caseId.value,
        applicationId.value,
        storedProgramName,
        knownProgram?.agency || agencySource.value,
        referenceNumber.value,
        notes.value
      );
      db.prepare(`
        INSERT INTO tracked_application_history (
          history_id, tracked_application_id, previous_status, new_status, note
        ) VALUES (?, ?, NULL, 'PREPARED', ?)
      `).run(`TRACK-HISTORY-${crypto.randomUUID()}`, id, notes.value);
    })();

    const created = ownedTracker(id, req.user.user_id);
    res.status(201).json({ success: true, data: formatTracker(created) });
  } catch (error) {
    return sendDatabaseError(res, error, 'Error creating tracked application:');
  }
});

router.put('/:id', (req, res) => {
  try {
    if (!isRecord(req.body)) {
      return res.status(400).json({ success: false, error: 'Request body must be an object.' });
    }
    const existing = ownedTracker(req.params.id, req.user.user_id);
    if (!existing) return res.status(404).json({ success: false, error: 'Tracked application not found.' });
    const fields = {
      program_name: text(req.body.program_name ?? existing.program_name, 'program_name', 160, { required: true }),
      agency_source: text(req.body.agency_source ?? existing.agency_source, 'agency_source', 160),
      reference_number: text(req.body.reference_number ?? existing.reference_number, 'reference_number', 120),
      notes: text(req.body.notes ?? existing.notes, 'notes', 2000)
    };
    const invalid = Object.values(fields).find((result) => result.error);
    if (invalid) return res.status(400).json({ success: false, error: invalid.error });
    db.prepare(`
      UPDATE tracked_applications SET
        program_name = ?, agency_source = ?, reference_number = ?, notes = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE tracked_application_id = ? AND user_id = ?
    `).run(
      fields.program_name.value,
      fields.agency_source.value,
      fields.reference_number.value,
      fields.notes.value,
      req.params.id,
      req.user.user_id
    );
    res.json({ success: true, data: formatTracker(ownedTracker(req.params.id, req.user.user_id)) });
  } catch (error) {
    return sendDatabaseError(res, error, 'Error updating tracked application:');
  }
});

router.patch('/:id/status', (req, res) => {
  try {
    if (!isRecord(req.body) || !statuses.has(req.body.status)) {
      return res.status(400).json({
        success: false,
        error: 'status must be PREPARED, SUBMITTED, FOLLOW_UP_NEEDED, or DECISION_RECEIVED.'
      });
    }
    const existing = ownedTracker(req.params.id, req.user.user_id);
    if (!existing) return res.status(404).json({ success: false, error: 'Tracked application not found.' });
    if (existing.status === req.body.status) {
      return res.status(400).json({ success: false, error: 'The selected status is already current.' });
    }
    const note = text(req.body.note, 'note', 2000);
    if (note.error) return res.status(400).json({ success: false, error: note.error });
    let submittedOn = existing.submitted_on;
    if (req.body.status === 'SUBMITTED') {
      const parsedDate = req.body.submitted_on == null || req.body.submitted_on === ''
        ? { value: new Date().toISOString().slice(0, 10) }
        : date(req.body.submitted_on, 'submitted_on');
      if (parsedDate.error) return res.status(400).json({ success: false, error: parsedDate.error });
      submittedOn = parsedDate.value;
    } else if (req.body.submitted_on != null) {
      return res.status(400).json({ success: false, error: 'submitted_on can only be set when status is SUBMITTED.' });
    }

    db.transaction(() => {
      db.prepare(`
        UPDATE tracked_applications SET
          status = ?, submitted_on = ?, updated_at = CURRENT_TIMESTAMP
        WHERE tracked_application_id = ? AND user_id = ?
      `).run(req.body.status, submittedOn, req.params.id, req.user.user_id);
      db.prepare(`
        INSERT INTO tracked_application_history (
          history_id, tracked_application_id, previous_status, new_status, note
        ) VALUES (?, ?, ?, ?, ?)
      `).run(
        `TRACK-HISTORY-${crypto.randomUUID()}`,
        req.params.id,
        existing.status,
        req.body.status,
        note.value
      );
    })();
    res.json({ success: true, data: formatTracker(ownedTracker(req.params.id, req.user.user_id)) });
  } catch (error) {
    console.error('Error changing tracked application status:', error);
    res.status(500).json({ success: false, error: 'Unable to update tracker status.' });
  }
});

router.post('/:id/reminders', (req, res) => {
  try {
    if (!isRecord(req.body)) {
      return res.status(400).json({ success: false, error: 'Request body must be an object.' });
    }
    const tracker = ownedTracker(req.params.id, req.user.user_id);
    if (!tracker) return res.status(404).json({ success: false, error: 'Tracked application not found.' });
    const reminderDate = date(req.body.reminder_date, 'reminder_date');
    const note = text(req.body.note, 'note', 2000);
    if (reminderDate.error || note.error) {
      return res.status(400).json({ success: false, error: reminderDate.error || note.error });
    }
    const id = `REMINDER-${crypto.randomUUID()}`;
    db.prepare(`
      INSERT INTO follow_up_reminders (
        reminder_id, tracked_application_id, user_id, reminder_date, note
      ) VALUES (?, ?, ?, ?, ?)
    `).run(id, req.params.id, req.user.user_id, reminderDate.value, note.value);
    const reminder = db.prepare(`
      SELECT * FROM follow_up_reminders
      WHERE reminder_id = ? AND user_id = ?
    `).get(id, req.user.user_id);
    res.status(201).json({ success: true, data: reminder });
  } catch (error) {
    console.error('Error creating follow-up reminder:', error);
    res.status(500).json({ success: false, error: 'Unable to create follow-up reminder.' });
  }
});

router.patch('/reminders/:id', (req, res) => {
  try {
    if (!isRecord(req.body)) {
      return res.status(400).json({ success: false, error: 'Request body must be an object.' });
    }
    const existing = db.prepare(`
      SELECT * FROM follow_up_reminders
      WHERE reminder_id = ? AND user_id = ?
    `).get(req.params.id, req.user.user_id);
    if (!existing) return res.status(404).json({ success: false, error: 'Reminder not found.' });

    const parsedDate = req.body.reminder_date === undefined
      ? { value: existing.reminder_date }
      : date(req.body.reminder_date, 'reminder_date');
    const note = req.body.note === undefined
      ? { value: existing.note }
      : text(req.body.note, 'note', 2000);
    const state = req.body.action === undefined
      ? { value: existing.state }
      : ({
        COMPLETE: { value: 'COMPLETED' },
        DISMISS: { value: 'DISMISSED' },
        REOPEN: { value: 'ACTIVE' }
      }[req.body.action] || { error: 'action must be COMPLETE, DISMISS, or REOPEN.' });
    const invalid = parsedDate.error || note.error || state.error;
    if (invalid) return res.status(400).json({ success: false, error: invalid });

    db.prepare(`
      UPDATE follow_up_reminders SET
        reminder_date = ?, note = ?, state = ?, updated_at = CURRENT_TIMESTAMP
      WHERE reminder_id = ? AND user_id = ?
    `).run(parsedDate.value, note.value, state.value, req.params.id, req.user.user_id);
    const updated = db.prepare(`
      SELECT * FROM follow_up_reminders
      WHERE reminder_id = ? AND user_id = ?
    `).get(req.params.id, req.user.user_id);
    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Error updating follow-up reminder:', error);
    res.status(500).json({ success: false, error: 'Unable to update follow-up reminder.' });
  }
});

export default router;
