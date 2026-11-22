const OUTCOME_KEYS = Object.freeze({
  potentially_eligible: ['potentialMatch', 'potential-match'],
  potential_match: ['potentialMatch', 'potential-match'],
  needs_more_information: ['needsMoreInformation', 'needs-more-information'],
  not_eligible: ['noCurrentMatch', 'no-current-match']
});

const OUTCOME_ORDER = Object.freeze({
  potentialMatch: 0,
  needsMoreInformation: 1
});

function stringList(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim())
    : [];
}

export function getAssessmentEligibilityModel(assessment) {
  const eligibilityResults = Array.isArray(assessment?.eligibility_results)
    ? assessment.eligibility_results
    : [];
  const matchedSubsidies = Array.isArray(assessment?.matched_subsidies)
    ? assessment.matched_subsidies
    : [];
  const programs = (eligibilityResults.length ? eligibilityResults : matchedSubsidies)
    .filter((program) => program && typeof program === 'object' && !Array.isArray(program));

  const presentedPrograms = programs
    .map((program) => {
      const [outcomeKey, outcomeClass] = OUTCOME_KEYS[
        program.eligibility_outcome || program.eligibility_status
      ] || ['outcomeUnavailable', 'outcome-unavailable'];
      return {
        ...program,
        outcomeKey,
        outcomeClass,
        reasons: stringList(program.reasons),
        reasonsReturned: Array.isArray(program.reasons),
        missingInformation: stringList(program.missing_information),
        missingInformationReturned: Array.isArray(program.missing_information),
        restrictions: stringList(program.restrictions),
        restrictionsReturned: Array.isArray(program.restrictions)
      };
    })
    .filter((program) => program.outcomeKey !== 'noCurrentMatch')
    .sort((left, right) => (
      (OUTCOME_ORDER[left.outcomeKey] ?? 2) - (OUTCOME_ORDER[right.outcomeKey] ?? 2)
    ));

  return {
    state: presentedPrograms.length ? 'results' : 'empty',
    programs: presentedPrograms
  };
}

export function getVisiblePrograms(programs, showAll, limit = 3) {
  const availablePrograms = Array.isArray(programs) ? programs : [];
  return {
    total: availablePrograms.length,
    visiblePrograms: showAll ? availablePrograms : availablePrograms.slice(0, limit),
    hasToggle: availablePrograms.length > limit
  };
}

export function toggleExpandedRecommendation(expandedIds, id) {
  const nextExpandedIds = new Set(expandedIds);
  if (nextExpandedIds.has(id)) {
    nextExpandedIds.delete(id);
  } else {
    nextExpandedIds.add(id);
  }
  return nextExpandedIds;
}

export function getCatalogProgramPresentation(program) {
  return {
    agency: typeof program?.agency === 'string' ? program.agency : '',
    purpose: typeof program?.short_description === 'string' && program.short_description.trim()
      ? program.short_description
      : typeof program?.details === 'string' ? program.details : '',
    description: typeof program?.details === 'string' ? program.details : '',
    requirements: stringList(program?.requirements),
    applicationSteps: stringList(program?.application_steps),
    sourceUrl: typeof program?.source_url === 'string' && program.source_url.trim()
      ? program.source_url
      : '',
    lastReviewedOn: typeof program?.last_verified_on === 'string'
      ? program.last_verified_on
      : '',
    isAssessmentRecommendation: false
  };
}
