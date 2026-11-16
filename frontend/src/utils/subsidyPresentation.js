const OUTCOME_KEYS = Object.freeze({
  potentially_eligible: ['potentialMatch', 'potential-match'],
  potential_match: ['potentialMatch', 'potential-match'],
  needs_more_information: ['needsMoreInformation', 'needs-more-information'],
  not_eligible: ['noCurrentMatch', 'no-current-match']
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

  return {
    state: programs.length ? 'results' : 'empty',
    programs: programs
      .map((program) => {
        const [outcomeKey, outcomeClass] = OUTCOME_KEYS[
          program.eligibility_outcome || program.eligibility_status
        ] || ['outcomeUnavailable', 'outcome-unavailable'];
        return {
          ...program,
          outcomeKey,
          outcomeClass,
          reasons: stringList(program.reasons),
          missingInformation: stringList(program.missing_information),
          restrictions: stringList(program.restrictions)
        };
      })
  };
}

export function getCatalogProgramPresentation(program) {
  return {
    purpose: typeof program?.short_description === 'string' && program.short_description.trim()
      ? program.short_description
      : typeof program?.details === 'string' ? program.details : '',
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
