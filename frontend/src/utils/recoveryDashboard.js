const TRACKER_STATUSES = [
  'PREPARED',
  'SUBMITTED',
  'FOLLOW_UP_NEEDED',
  'DECISION_RECEIVED'
];

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
  trackedApplications = [],
  aidSummary = {},
  documentCount = null,
  documentError = ''
}) {
  const recentCases = [...cases].sort((a, b) => caseRecency(b) - caseRecency(a));
  const trackerStatusCounts = Object.fromEntries(
    TRACKER_STATUSES.map((status) => [
      status,
      trackedApplications.filter((application) => application.status === status).length
    ])
  );
  const followUpApplications = trackedApplications.filter(
    (application) => application.status === 'FOLLOW_UP_NEEDED'
  );

  return {
    cases: recentCases,
    applications,
    trackedApplications,
    recentCases: recentCases.slice(0, 3),
    caseCount: cases.length,
    applicationCount: applications.length,
    trackerStatusCounts,
    followUpApplications,
    cashTotal: numericValue(aidSummary.cash_total_php),
    inKindCount: numericValue(aidSummary.in_kind_entries),
    inKindEstimatedValue: Number(aidSummary.valued_in_kind_entries) > 0
      ? numericValue(aidSummary.in_kind_estimated_value_php)
      : null,
    documentCount: Number.isInteger(documentCount) && documentCount >= 0
      ? documentCount
      : null,
    documentError
  };
}

export function getRecoveryDashboardNextActions(summary) {
  const actions = [];
  const { cases, applications, trackedApplications } = summary;

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

    const prepared = trackedApplications.find((application) => application.status === 'PREPARED');
    if (prepared) {
      const savedApplication = applications.find(
        (application) => application.id === prepared.application_id
      );
      actions.push(savedApplication
        ? { type: 'review-application', application: savedApplication }
        : { type: 'review-tracker', caseId: prepared.case_id });
    }

    const followUp = summary.followUpApplications[0];
    if (followUp) {
      actions.push({ type: 'follow-up', caseId: followUp.case_id });
    }

    if (summary.documentCount === 0) {
      actions.push({ type: 'open-vault', caseId: cases[0].case_id });
    }
  }

  return actions;
}
