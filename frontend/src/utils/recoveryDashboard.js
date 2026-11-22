function caseRecency(item) {
  const value = item.created_at || item.incident_date;
  const dateValue = value == null ? '' : String(value);
  const timestamp = dateValue
    ? new Date(dateValue.includes(' ') ? `${dateValue.replace(' ', 'T')}Z` : dateValue).getTime()
    : 0;
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function numericValue(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function getRecoveryDashboardView({ loading, error, data }) {
  if (loading && !data) return { state: 'loading' };
  if (error && !data) return { state: 'error' };
  if (!data) return { state: 'empty' };
  return { state: 'ready', data, refreshError: error || '' };
}

export function summarizeRecoveryDashboard({
  cases = [],
  applications = [],
  aidSummary = {}
}) {
  const recentCases = [...cases].sort((a, b) => caseRecency(b) - caseRecency(a));
  return {
    cases: recentCases,
    applications,
    recentCases: recentCases.slice(0, 3),
    caseCount: cases.length,
    applicationCount: applications.length,
    cashTotal: numericValue(aidSummary.cash_total_php),
    inKindCount: numericValue(aidSummary.in_kind_entries),
    inKindEstimatedValue: Number(aidSummary.valued_in_kind_entries) > 0
      ? numericValue(aidSummary.in_kind_estimated_value_php)
      : null
  };
}

export function getRecoveryDashboardNextActions(summary) {
  const actions = [];
  const { cases, applications } = summary;

  if (!cases.length) {
    actions.push({ type: 'start-case' });
  } else {
    const unlinkedCase = cases.find((recoveryCase) => (
      recoveryCase.case_id
      && !applications.some((application) => application.case_id === recoveryCase.case_id)
    ));
    if (unlinkedCase) {
      actions.push({ type: 'prepare-application', recoveryCase: unlinkedCase });
    }

  }

  return actions;
}
