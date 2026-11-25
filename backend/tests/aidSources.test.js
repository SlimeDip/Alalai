import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getAppliedProgramSources } from '../../frontend/src/utils/aidSources.js';

test('aid source choices are the programs applied to for the selected incident', () => {
  const applications = [
    { case_id: 'CASE-1', applied_subsidies: ['Emergency Cash Transfer (ECT)'] },
    { case_id: 'CASE-1', applied_subsidies: ['Emergency Cash Transfer (ECT)', ' TUPAD '] },
    { case_id: 'CASE-2', applied_subsidies: ['SSS Calamity Loan Program'] },
    { assessment_id: 'CASE-1', applied_subsidies: ['GSIS Emergency Loan'] },
    { case_id: 'CASE-1', applied_subsidies: [] },
    { case_id: null, applied_subsidies: ['Unlinked program'] }
  ];
  assert.deepEqual(getAppliedProgramSources(applications, 'CASE-1'), [
    'Emergency Cash Transfer (ECT)',
    'TUPAD',
    'GSIS Emergency Loan'
  ]);
  assert.deepEqual(getAppliedProgramSources(applications, 'CASE-3'), []);
  assert.deepEqual(getAppliedProgramSources(applications, ''), []);
  assert.deepEqual(getAppliedProgramSources(undefined, 'CASE-1'), []);
});
