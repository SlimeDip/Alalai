const unavailableCaseValues = new Set([
  'unspecified',
  'not specified',
  'not recorded',
  'unknown',
  'n/a',
  'na',
  'none',
  'null',
  'hindi tinukoy',
  'hindi naitala'
]);

export function isUnavailableCaseValue(value) {
  return value == null || (
    typeof value === 'string'
    && (!value.trim() || unavailableCaseValues.has(value.trim().toLowerCase()))
  );
}

export function normalizeRecoverySeverity(value) {
  if (isUnavailableCaseValue(value)) return 'unknown';
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'catastrophic' || normalized === 'severe') return 'severe';
  if (normalized === 'moderate') return 'moderate';
  if (normalized === 'low') return 'low';
  return 'unknown';
}

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
  ]
    .filter((value) => (
      typeof value === 'string'
      && !isUnavailableCaseValue(value)
    ))
    .map((value) => value.trim())
    .join(', ');
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

export function createCaseProgramApplicationContext(recoveryCase, program) {
  const title = typeof program?.title === 'string' ? program.title.trim() : '';
  if (!title) {
    throw new TypeError('A program title is required to apply for a program.');
  }

  return {
    ...createCaseApplicationContext(recoveryCase),
    subsidy: program
  };
}

function programMatches(selection, program) {
  const reference = typeof selection === 'string' ? selection.trim() : '';
  return Boolean(reference) && (reference === program?.title || reference === program?.id);
}

// An existing application for this case and program, if one was already saved.
export function findApplicationForProgram(applications, caseId, program) {
  return getRelatedCaseApplications(applications, caseId).find((application) => (
    Array.isArray(application.applied_subsidies)
    && application.applied_subsidies.some((selection) => programMatches(selection, program))
  )) || null;
}

// Human-readable list of what deleting a case removes or keeps.
export function describeCaseDeletion(impact) {
  const plural = (count, singular, pluralForm = `${singular}s`) => (
    `${count} ${count === 1 ? singular : pluralForm}`
  );
  const removes = [];
  const keeps = [];
  const loss = Number(impact?.loss_records) || 0;
  const plans = Number(impact?.recovery_plans) || 0;
  const aid = Number(impact?.aid_records) || 0;
  const applications = Number(impact?.linked_applications) || 0;

  if (loss) removes.push(plural(loss, 'loss record'));
  if (plans) removes.push(plural(plans, 'recovery plan item'));
  if (aid) removes.push(`${plural(aid, 'aid ledger entry', 'aid ledger entries')} you recorded for this case`);
  if (applications) {
    keeps.push(`${plural(applications, 'saved application')} will be kept but no longer linked to this case`);
  }
  return { removes, keeps };
}
