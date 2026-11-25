import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createCaseApplicationContext,
  getRecoveryCaseDetailModel,
  getRecoveryCaseListView,
  getRelatedCaseApplications,
  normalizeRecoverySeverity
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

test('recovery workspace severity presentation normalizes recognized and unavailable values', () => {
  assert.equal(normalizeRecoverySeverity('Severe'), 'severe');
  assert.equal(normalizeRecoverySeverity(' catastrophic '), 'severe');
  assert.equal(normalizeRecoverySeverity('MODERATE'), 'moderate');
  assert.equal(normalizeRecoverySeverity('Low'), 'low');
  assert.equal(normalizeRecoverySeverity('Unknown'), 'unknown');
  assert.equal(normalizeRecoverySeverity('Not recorded'), 'unknown');
  assert.equal(normalizeRecoverySeverity('Unexpected level'), 'unknown');
  assert.equal(normalizeRecoverySeverity(null), 'unknown');
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

  const partiallySpecifiedLocation = getRecoveryCaseDetailModel({
    barangay: ' Unspecified ',
    city_municipality: 'Tacloban',
    province: 'Not specified'
  });
  assert.equal(partiallySpecifiedLocation.location, 'Tacloban');
  assert.equal(getRecoveryCaseDetailModel({
    barangay: 'Unspecified',
    city_municipality: 'Unknown',
    province: 'N/A'
  }).location, '');
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

test('applying to a listed program carries the case and the program into the application', async () => {
  const { createCaseProgramApplicationContext, findApplicationForProgram } =
    await import('../../frontend/src/utils/recoveryCaseWorkspace.js');
  const program = { id: 'dswd-ect', title: 'Emergency Cash Transfer (ECT)', max_amount_php: 10000 };

  const context = createCaseProgramApplicationContext(recoveryCase, program);
  assert.equal(context.caseId, recoveryCase.case_id);
  assert.equal(context.subsidy, program);
  assert.equal(context.returnTab, 'cases');
  assert.throws(() => createCaseProgramApplicationContext(recoveryCase, { id: 'x' }), TypeError);

  const applications = [
    { id: 'APP-1', case_id: recoveryCase.case_id, applied_subsidies: ['Other program'] },
    { id: 'APP-2', case_id: 'CASE-OTHER', applied_subsidies: ['Emergency Cash Transfer (ECT)'] },
    { id: 'APP-3', case_id: recoveryCase.case_id, applied_subsidies: ['Emergency Cash Transfer (ECT)'] }
  ];
  assert.equal(findApplicationForProgram(applications, recoveryCase.case_id, program).id, 'APP-3');
  assert.equal(findApplicationForProgram(applications, recoveryCase.case_id, { title: 'Nope' }), null);
});

test('case deletion warning lists what is removed and what is kept', async () => {
  const { describeCaseDeletion } = await import('../../frontend/src/utils/recoveryCaseWorkspace.js');
  const { removes, keeps } = describeCaseDeletion({
    loss_records: 1,
    recovery_plans: 2,
    aid_records: 3,
    linked_applications: 1
  });
  assert.deepEqual(removes, [
    '1 loss record',
    '2 recovery plan items',
    '3 aid ledger entries you recorded for this case'
  ]);
  assert.deepEqual(keeps, ['1 saved application will be kept but no longer linked to this case']);
  assert.deepEqual(describeCaseDeletion({}), { removes: [], keeps: [] });
});
