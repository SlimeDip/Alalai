import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createCaseApplicationContext,
  getRecoveryCaseDetailModel,
  getRecoveryCaseListView,
  getRelatedCaseApplications
} from '../../frontend/src/utils/recoveryCaseWorkspace.js';

const recoveryCase = {
  id: 'CASE-RECOVERY-1',
  case_id: 'CASE-RECOVERY-1',
  disaster_type: 'Typhoon',
  incident_date: '2026-10-12',
  created_at: '2026-10-12 08:15:00',
  barangay: 'Barangay 1',
  city_municipality: 'Tacloban',
  province: 'Leyte',
  applicant_name: 'Test Resident',
  damage_summary: 'Roof damage reported',
  severity_level: 'Moderate',
  estimated_cost_min: 10000,
  estimated_cost_max: 25000,
  damage_categories: ['structural'],
  loss_records: [{
    loss_record_id: 'LOSS-1',
    item_category: 'structural',
    estimated_loss_php: 25000
  }]
};

test('case list view distinguishes loading, errors, empty results, and available cases', () => {
  assert.deepEqual(
    getRecoveryCaseListView({ cases: [], loading: true, error: '' }),
    { state: 'loading', cases: [] }
  );
  assert.deepEqual(
    getRecoveryCaseListView({ cases: [], loading: false, error: 'Request failed' }),
    { state: 'error', cases: [] }
  );
  assert.deepEqual(
    getRecoveryCaseListView({ cases: [], loading: false, error: '' }),
    { state: 'empty', cases: [] }
  );
  assert.deepEqual(
    getRecoveryCaseListView({ cases: [recoveryCase], loading: false, error: '' }),
    { state: 'list', cases: [recoveryCase] }
  );
});

test('case details expose only saved household, assessment, and loss information', () => {
  const detail = getRecoveryCaseDetailModel(recoveryCase);
  assert.equal(detail.location, 'Barangay 1, Tacloban, Leyte');
  assert.deepEqual(detail.household, { applicant_name: 'Test Resident' });
  assert.deepEqual(detail.damageCategories, ['structural']);
  assert.deepEqual(detail.losses, recoveryCase.loss_records);

  const sparseDetail = getRecoveryCaseDetailModel({ case_id: 'CASE-SPARSE' });
  assert.deepEqual(sparseDetail.household, {});
  assert.deepEqual(sparseDetail.losses, []);
  assert.deepEqual(sparseDetail.damageCategories, []);
});

test('application context and related applications use the exact recovery case ID', () => {
  const context = createCaseApplicationContext(recoveryCase);
  assert.equal(context.caseId, 'CASE-RECOVERY-1');
  assert.equal(context.assessment.case_id, 'CASE-RECOVERY-1');
  assert.equal(context.returnTab, 'cases');

  assert.throws(() => createCaseApplicationContext({ id: 'CASE-NO-CANONICAL-ID' }), /case ID is required/);

  const related = getRelatedCaseApplications([
    { id: 'APP-1', case_id: 'CASE-RECOVERY-1' },
    { id: 'APP-2', case_id: 'CASE-OTHER' },
    { id: 'APP-3', case_id: null }
  ], 'CASE-RECOVERY-1');
  assert.deepEqual(related.map((application) => application.id), ['APP-1']);
});
