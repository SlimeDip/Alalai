import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getRecoveryDashboardNextActions,
  getRecoveryDashboardView,
  summarizeRecoveryDashboard
} from '../../frontend/src/utils/recoveryDashboard.js';

const cases = [
  {
    case_id: 'CASE-OLD',
    created_at: '2025-01-01 10:00:00',
    disaster_type: 'Flood'
  },
  {
    case_id: 'CASE-NEW',
    created_at: '2025-02-01 10:00:00',
    disaster_type: 'Typhoon'
  }
];

test('dashboard summary counts saved cases, applications, and aid', () => {
  const summary = summarizeRecoveryDashboard({
    cases,
    applications: [{ id: 'APP-1', case_id: 'CASE-NEW' }],
    aidSummary: {
      cash_total_php: 2500,
      in_kind_entries: 3,
      valued_in_kind_entries: 1,
      in_kind_estimated_value_php: 900
    }
  });

  assert.equal(summary.caseCount, 2);
  assert.deepEqual(summary.recentCases.map((item) => item.case_id), ['CASE-NEW', 'CASE-OLD']);
  assert.equal(summary.applicationCount, 1);
  assert.equal(summary.cashTotal, 2500);
  assert.equal(summary.inKindCount, 3);
  assert.equal(summary.inKindEstimatedValue, 900);
});

test('dashboard keeps cash and in-kind measures separate and does not invent missing amounts', () => {
  const summary = summarizeRecoveryDashboard({
    aidSummary: {
      cash_total_php: null,
      in_kind_entries: 2,
      valued_in_kind_entries: 0,
      in_kind_estimated_value_php: null
    }
  });

  assert.equal(summary.cashTotal, null);
  assert.equal(summary.inKindCount, 2);
  assert.equal(summary.inKindEstimatedValue, null);
});

test('dashboard next actions reflect empty and unlinked application states', () => {
  const emptySummary = summarizeRecoveryDashboard({});
  assert.deepEqual(getRecoveryDashboardNextActions(emptySummary), [{ type: 'start-case' }]);

  const summary = summarizeRecoveryDashboard({
    cases,
    applications: [{ id: 'APP-NEW', case_id: 'CASE-NEW' }]
  });
  assert.deepEqual(getRecoveryDashboardNextActions(summary), [
    { type: 'prepare-application', recoveryCase: cases[0] }
  ]);
});

test('dashboard distinguishes loading, error, and ready views', () => {
  assert.deepEqual(
    getRecoveryDashboardView({ loading: true, error: '', data: null }),
    { state: 'loading' }
  );
  assert.deepEqual(
    getRecoveryDashboardView({ loading: false, error: 'Request failed', data: null }),
    { state: 'error' }
  );
  assert.deepEqual(
    getRecoveryDashboardView({ loading: false, error: '', data: {} }),
    { state: 'ready', data: {}, refreshError: '' }
  );
  assert.deepEqual(
    getRecoveryDashboardView({ loading: false, error: 'Request failed', data: { caseCount: 1 } }),
    { state: 'ready', data: { caseCount: 1 }, refreshError: 'Request failed' }
  );
});
