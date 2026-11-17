import express from 'express';
import crypto from 'node:crypto';
import db from '../database.js';

const router = express.Router();

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
  const parsed = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00.000Z`)
    : null;
  if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    return { error: `${field} must be a valid YYYY-MM-DD date.` };
  }
  return { value };
}

function money(value, field, { required = false } = {}) {
  if (value == null || value === '') {
    return required ? { error: `${field} is required.` } : { value: null };
  }
  const amount = typeof value === 'number' ? value : Number(value);
  if (
    !Number.isFinite(amount)
    || amount < 0
    || amount > 1_000_000_000
    || Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6
  ) {
    return { error: `${field} must be a valid PHP amount with at most two decimal places.` };
  }
  if (required && amount <= 0) return { error: `${field} must be greater than zero.` };
  return { value: amount };
}

function validate(body, existing = null) {
  if (!isRecord(body)) return { error: 'Request body must be an object.' };
  const aidType = body.aid_type ?? existing?.aid_type;
  if (!['CASH', 'IN_KIND'].includes(aidType)) {
    return { error: 'aid_type must be CASH or IN_KIND.' };
  }

  const caseId = text(body.case_id ?? existing?.case_id, 'case_id', 100, { required: true });
  const trackedApplicationId = body.tracked_application_id === undefined
    ? { value: existing?.tracked_application_id || null }
    : body.tracked_application_id == null || body.tracked_application_id === ''
      ? { value: null }
      : text(body.tracked_application_id, 'tracked_application_id', 100, { required: true });
  const description = text(
    body.assistance_description ?? existing?.assistance_description,
    'assistance_description',
    300,
    { required: aidType === 'IN_KIND' }
  );
  const quantity = text(body.quantity ?? existing?.quantity, 'quantity', 120);
  const source = text(body.source ?? existing?.source, 'source', 200, { required: true });
  const receivedOn = date(body.received_on ?? existing?.received_on, 'received_on');
  const notes = text(body.notes ?? existing?.notes, 'notes', 2000);
  const amount = money(body.amount_php ?? existing?.amount_php, 'amount_php', {
    required: aidType === 'CASH'
  });
  const estimatedValue = money(
    body.estimated_value_php ?? existing?.estimated_value_php,
    'estimated_value_php'
  );
  const errors = [
    caseId,
    trackedApplicationId,
    description,
    quantity,
    source,
    receivedOn,
    notes,
    amount,
    estimatedValue
  ].find((result) => result.error);
  if (errors) return { error: errors.error };
  if (aidType === 'CASH' && estimatedValue.value != null) {
    return { error: 'estimated_value_php is only for in-kind assistance.' };
  }
  if (aidType === 'IN_KIND' && body.amount_php != null && body.amount_php !== '') {
    return { error: 'amount_php is only for cash assistance.' };
  }
  if (aidType === 'IN_KIND' && body.estimated_value_php === undefined && existing?.aid_type === 'CASH') {
    return { error: 'Provide an estimated value or leave it empty for in-kind assistance.' };
  }
  return {
    value: {
      case_id: caseId.value,
      tracked_application_id: trackedApplicationId.value,
      aid_type: aidType,
      assistance_description: description.value,
      amount_php: aidType === 'CASH' ? amount.value : null,
      quantity: quantity.value,
      estimated_value_php: aidType === 'IN_KIND' ? estimatedValue.value : null,
      source: source.value,
      received_on: receivedOn.value,
      notes: notes.value
    }
  };
}

function validateRelationships(value, userId) {
  if (!db.prepare(`
    SELECT 1 FROM recovery_cases WHERE case_id = ? AND user_id = ?
  `).get(value.case_id, userId)) {
    return 'Recovery case not found.';
  }
  if (value.tracked_application_id) {
    const tracked = db.prepare(`
      SELECT case_id FROM tracked_applications
      WHERE tracked_application_id = ? AND user_id = ?
    `).get(value.tracked_application_id, userId);
    if (!tracked) return 'Tracked application not found.';
    if (tracked.case_id !== value.case_id) {
      return 'The tracked application and recovery case do not match.';
    }
  }
  return null;
}

router.get('/', (req, res) => {
  try {
    const caseId = req.query.case_id || null;
    if (caseId && !db.prepare(`
      SELECT 1 FROM recovery_cases WHERE case_id = ? AND user_id = ?
    `).get(caseId, req.user.user_id)) {
      return res.status(404).json({ success: false, error: 'Recovery case not found.' });
    }
    const rows = db.prepare(`
      SELECT * FROM aid_ledger
      WHERE user_id = ? AND (? IS NULL OR case_id = ?)
      ORDER BY received_on DESC, created_at DESC
    `).all(req.user.user_id, caseId, caseId);
    const summary = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN aid_type = 'CASH' THEN amount_php ELSE 0 END), 0) AS cash_total_php,
        SUM(CASE WHEN aid_type = 'IN_KIND' THEN 1 ELSE 0 END) AS in_kind_entries,
        SUM(CASE WHEN aid_type = 'IN_KIND' THEN estimated_value_php ELSE 0 END) AS in_kind_estimated_value_php,
        SUM(CASE WHEN aid_type = 'IN_KIND' AND estimated_value_php IS NOT NULL THEN 1 ELSE 0 END) AS valued_in_kind_entries
      FROM aid_ledger
      WHERE user_id = ? AND (? IS NULL OR case_id = ?)
    `).get(req.user.user_id, caseId, caseId);
    res.json({
      success: true,
      data: rows,
      summary: {
        cash_total_php: summary.cash_total_php,
        in_kind_entries: summary.in_kind_entries || 0,
        in_kind_estimated_value_php: summary.in_kind_estimated_value_php,
        valued_in_kind_entries: summary.valued_in_kind_entries || 0
      }
    });
  } catch (error) {
    console.error('Error fetching aid ledger:', error);
    res.status(500).json({ success: false, error: 'Unable to fetch aid records.' });
  }
});

router.post('/', (req, res) => {
  try {
    const validated = validate(req.body);
    if (validated.error) return res.status(400).json({ success: false, error: validated.error });
    const relationshipError = validateRelationships(validated.value, req.user.user_id);
    if (relationshipError) return res.status(404).json({ success: false, error: relationshipError });

    const id = `AID-${crypto.randomUUID()}`;
    db.prepare(`
      INSERT INTO aid_ledger (
        aid_id, user_id, case_id, tracked_application_id, aid_type,
        assistance_description, amount_php, quantity, estimated_value_php,
        source, received_on, notes
      ) VALUES (
        @aid_id, @user_id, @case_id, @tracked_application_id, @aid_type,
        @assistance_description, @amount_php, @quantity, @estimated_value_php,
        @source, @received_on, @notes
      )
    `).run({ aid_id: id, user_id: req.user.user_id, ...validated.value });
    const created = db.prepare(`
      SELECT * FROM aid_ledger WHERE aid_id = ? AND user_id = ?
    `).get(id, req.user.user_id);
    res.status(201).json({ success: true, data: created });
  } catch (error) {
    console.error('Error creating aid record:', error);
    res.status(500).json({ success: false, error: 'Unable to save aid record.' });
  }
});

router.put('/:id', (req, res) => {
  try {
    const existing = db.prepare(`
      SELECT * FROM aid_ledger WHERE aid_id = ? AND user_id = ?
    `).get(req.params.id, req.user.user_id);
    if (!existing) return res.status(404).json({ success: false, error: 'Aid record not found.' });
    const validated = validate(req.body, existing);
    if (validated.error) return res.status(400).json({ success: false, error: validated.error });
    const relationshipError = validateRelationships(validated.value, req.user.user_id);
    if (relationshipError) return res.status(404).json({ success: false, error: relationshipError });
    db.prepare(`
      UPDATE aid_ledger SET
        case_id = @case_id,
        tracked_application_id = @tracked_application_id,
        aid_type = @aid_type,
        assistance_description = @assistance_description,
        amount_php = @amount_php,
        quantity = @quantity,
        estimated_value_php = @estimated_value_php,
        source = @source,
        received_on = @received_on,
        notes = @notes,
        updated_at = CURRENT_TIMESTAMP
      WHERE aid_id = @aid_id AND user_id = @user_id
    `).run({
      aid_id: req.params.id,
      user_id: req.user.user_id,
      ...validated.value
    });
    const updated = db.prepare(`
      SELECT * FROM aid_ledger WHERE aid_id = ? AND user_id = ?
    `).get(req.params.id, req.user.user_id);
    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Error updating aid record:', error);
    res.status(500).json({ success: false, error: 'Unable to update aid record.' });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const result = db.prepare(`
      DELETE FROM aid_ledger WHERE aid_id = ? AND user_id = ?
    `).run(req.params.id, req.user.user_id);
    if (!result.changes) return res.status(404).json({ success: false, error: 'Aid record not found.' });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting aid record:', error);
    res.status(500).json({ success: false, error: 'Unable to delete aid record.' });
  }
});

export default router;
