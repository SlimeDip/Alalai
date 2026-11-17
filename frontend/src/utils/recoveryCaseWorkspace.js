export function getRecoveryCaseListView({ cases, loading, error }) {
  if (loading) return { state: 'loading', cases: [] };
  if (error && !cases.length) return { state: 'error', cases: [] };
  if (!cases.length) return { state: 'empty', cases: [] };
  return { state: 'list', cases };
}

export function getCaseLocation(recoveryCase) {
  return [
    recoveryCase.barangay,
    recoveryCase.city_municipality,
    recoveryCase.province
  ].filter(Boolean).join(', ');
}

export function getCaseLossRecords(recoveryCase) {
  return Array.isArray(recoveryCase?.loss_records) ? recoveryCase.loss_records : [];
}

export function getRecoveryCaseDetailModel(recoveryCase) {
  const household = {};
  for (const field of ['applicant_name', 'contact_number', 'household_size', 'household_members_count']) {
    if (recoveryCase?.[field] != null && recoveryCase[field] !== '') {
      household[field] = recoveryCase[field];
    }
  }

  return {
    location: getCaseLocation(recoveryCase || {}),
    household,
    losses: getCaseLossRecords(recoveryCase),
    damageCategories: Array.isArray(recoveryCase?.damage_categories)
      ? recoveryCase.damage_categories
      : []
  };
}

export function getRelatedCaseApplications(applications, caseId) {
  return (Array.isArray(applications) ? applications : [])
    .filter((application) => application.case_id === caseId);
}

export function createCaseApplicationContext(recoveryCase) {
  if (!recoveryCase?.case_id) {
    throw new TypeError('A saved recovery case ID is required to prepare an application.');
  }

  return {
    caseId: recoveryCase.case_id,
    caseLabel: [
      recoveryCase.disaster_type,
      getCaseLocation(recoveryCase),
      recoveryCase.incident_date
    ].filter(Boolean).join(' — '),
    assessment: recoveryCase,
    applicant: recoveryCase,
    returnTab: 'cases'
  };
}
