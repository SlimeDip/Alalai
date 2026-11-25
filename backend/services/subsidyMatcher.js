const SEVERITY_RANK = Object.freeze({
  low: 1,
  moderate: 2,
  severe: 3,
  catastrophic: 4,
});

const DISASTER_ALIASES = Object.freeze({
  flooding: 'flood',
  flash_flood: 'flood',
  baha: 'flood',
  volcano: 'volcanic_eruption',
  bagyo: 'typhoon',
  cyclone: 'typhoon',
  lindol: 'earthquake',
  pagguho: 'landslide',
  sunog: 'fire',
  storm_surge: 'storm_surge',
  tropical_storm: 'tropical_storm',
  tropical_depression: 'tropical_storm',
  habagat: 'monsoon',
  amihan: 'monsoon',
  monsoon: 'monsoon',
  heavy_rain: 'heavy_rainfall',
  heavy_rainfall: 'heavy_rainfall',
  tsunami: 'tsunami',
  drought: 'drought',
  tagtuyot: 'drought',
});

const RECOGNIZED_DISASTER_TYPES = new Set([
  'typhoon',
  'flood',
  'earthquake',
  'landslide',
  'fire',
  'volcanic_eruption',
  'drought',
  'storm_surge',
  'tropical_storm',
  'tsunami',
  'monsoon',
  'heavy_rainfall',
]);

const TYPE_ALIASES = Object.freeze({
  agriculture: 'agricultural',
  agriculture_fisheries: 'agricultural',
  agriculture_crops: 'agricultural',
  crops: 'agricultural',
  livestock: 'agricultural',
  fisheries: 'agricultural',
  agri: 'agricultural',
  roof: 'structural',
  roofing: 'structural',
  structural_roofing: 'structural',
  wall_collapse: 'structural',
  flooring: 'structural',
  livelihood_small_business: 'livelihood',
  small_business_livelihood: 'livelihood',
  business_inventory: 'livelihood',
  equipment: 'livelihood',
  flooding_water_ingress: 'general',
  water_ingress_flooding: 'general',
  general_residential_damage: 'general',
  medical_injuries: 'medical',
  immediate_relief: 'general',
});

const RECOGNIZED_DAMAGE_TYPES = new Set([
  'structural',
  'agricultural',
  'livelihood',
  'general',
  'food',
  'medical',
  'displacement',
]);

const CATEGORY_TYPES = Object.freeze({
  structural_roofing: ['structural'],
  water_ingress_flooding: ['general'],
  agriculture_crops: ['agricultural'],
  agriculture_fisheries: ['agricultural'],
  livelihood_small_business: ['livelihood'],
  small_business_livelihood: ['livelihood'],
  general_residential_damage: ['general'],
  medical_injuries: ['medical'],
});

function normalize(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function canonicalizeType(value) {
  const normalized = normalize(value);
  const canonical = TYPE_ALIASES[normalized] || normalized;
  return RECOGNIZED_DAMAGE_TYPES.has(canonical) ? canonical : null;
}

function canonicalizeDisaster(value) {
  const normalized = normalize(value);
  const canonical = DISASTER_ALIASES[normalized] || normalized;
  return RECOGNIZED_DISASTER_TYPES.has(canonical) ? canonical : null;
}

function parseList(value) {
  if (value == null || (typeof value === 'string' && !value.trim())) {
    return { state: 'missing', values: [] };
  }

  let entries;
  if (Array.isArray(value)) {
    entries = value;
  } else if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '*') return { state: 'unrestricted', values: [] };
    if (trimmed.startsWith('{')) return { state: 'malformed', values: [] };

    if (trimmed.startsWith('[')) {
      try {
        entries = JSON.parse(trimmed);
      } catch {
        return { state: 'malformed', values: [] };
      }
    } else {
      entries = trimmed.split(',');
    }
  } else {
    return { state: 'malformed', values: [] };
  }

  if (!Array.isArray(entries) || entries.some((entry) => typeof entry !== 'string')) {
    return { state: 'malformed', values: [] };
  }

  const values = entries.map((entry) => entry.trim());
  if (values.length === 1 && values[0] === '*') {
    return { state: 'unrestricted', values: [] };
  }
  if (values.some((entry) => !entry)) {
    return { state: 'malformed', values: [] };
  }
  if (values.length === 0) return { state: 'missing', values: [] };

  return { state: 'known', values };
}

function parseMinimumSeverity(value) {
  if (value == null || (typeof value === 'string' && !value.trim())) {
    return { state: 'missing' };
  }
  if (typeof value !== 'string') return { state: 'malformed' };
  if (value.trim() === '*') return { state: 'unrestricted' };

  const severity = normalize(value);
  return Object.hasOwn(SEVERITY_RANK, severity)
    ? { state: 'known', severity }
    : { state: 'malformed' };
}

function parseJsonArray(value) {
  if (Array.isArray(value)) {
    return value.every((entry) => typeof entry === 'string')
      ? { state: 'known', values: value }
      : { state: 'malformed', values: [] };
  }
  if (typeof value !== 'string' || !value.trim()) {
    return { state: 'missing', values: [] };
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((entry) => typeof entry === 'string')
      ? { state: 'known', values: parsed }
      : { state: 'malformed', values: [] };
  } catch {
    return { state: 'malformed', values: [] };
  }
}

function getDamageTypes(analysis) {
  const aids = parseList(analysis.recommended_aid_types);
  const categories = parseList(analysis.damage_categories);
  const values = new Set();
  const unknownValues = new Set();
  const categoryValues = new Set();
  const unknownCategories = new Set();

  if (aids.state === 'known') {
    for (const aid of aids.values) {
      const type = canonicalizeType(aid);
      if (type) values.add(type);
      else unknownValues.add(aid);
    }
  }
  if (categories.state === 'known') {
    for (const category of categories.values) {
      const normalized = normalize(category);
      const knownTypes = CATEGORY_TYPES[normalized];
      if (knownTypes) {
        knownTypes.forEach((type) => {
          values.add(type);
          categoryValues.add(type);
        });
      } else {
        const type = canonicalizeType(category);
        if (type) {
          values.add(type);
          categoryValues.add(type);
        } else {
          unknownValues.add(category);
          unknownCategories.add(category);
        }
      }
    }
  }

  return {
    state: values.size > 0
      ? 'known'
      : unknownValues.size > 0
        ? 'unknown'
        : aids.state === 'malformed' || categories.state === 'malformed'
          ? 'malformed'
          : 'missing',
    values,
    unknownValues,
    malformed: aids.state === 'malformed' || categories.state === 'malformed',
    categoryValues,
    unknownCategories,
    categoriesMalformed: categories.state === 'malformed',
    categoriesState: categories.state,
  };
}

function formatRuleIssue(field, state) {
  if (state === 'malformed') {
    return `The program's ${field} rule is malformed and must be verified.`;
  }
  return `The program does not specify its ${field} rule.`;
}

function evaluateProgram(analysis, disasterType, program) {
  const reasons = [];
  const missingInformation = [];
  const restrictions = [
    'This is a potential-relevance check, not confirmation of official eligibility or approval.',
    'Textual application requirements are not evaluated by the matcher and must be reviewed.',
  ];
  let matchScore = 0;
  const failures = [];

  const disasterRule = parseList(program.disaster_categories);
  const disasterInput = typeof disasterType === 'string' ? disasterType.trim() : '';
  if (disasterRule.state === 'unrestricted') {
    matchScore += 35;
    reasons.push('The program explicitly allows all disaster types.');
  } else if (disasterRule.state !== 'known') {
    missingInformation.push(formatRuleIssue('disaster-type', disasterRule.state));
  } else if (!disasterInput) {
    missingInformation.push(disasterType == null || disasterType === ''
      ? 'The reported disaster type is missing.'
      : 'The reported disaster type is malformed.');
  } else {
    const assessmentDisaster = canonicalizeDisaster(disasterType);
    const normalizedProgramDisasters = disasterRule.values.map(canonicalizeDisaster);
    const supportedDisasters = new Set(normalizedProgramDisasters.filter(Boolean));
    const unknownProgramDisasters = disasterRule.values.filter((_, index) => !normalizedProgramDisasters[index]);

    if (!assessmentDisaster) {
      missingInformation.push(`The reported disaster type is unrecognized: ${disasterInput}.`);
    }
    if (unknownProgramDisasters.length > 0) {
      missingInformation.push(
        `The program includes unrecognized disaster rules: ${unknownProgramDisasters.join(', ')}.`
      );
    }

    if (assessmentDisaster && supportedDisasters.has(assessmentDisaster)) {
      matchScore += 35;
      reasons.push(`The program supports ${disasterInput}.`);
    } else if (assessmentDisaster && unknownProgramDisasters.length === 0) {
      failures.push(`The program does not list ${disasterInput} as a supported disaster type.`);
    }
  }

  const damageRule = parseList(program.damage_types);
  const damageTypes = getDamageTypes(analysis);
  let matchedDamageTypes = [];
  let unmatchedDamageTypes = [];
  let damageCoverage = null;
  if (damageRule.state === 'unrestricted') {
    matchScore += 45;
    reasons.push('The program explicitly allows all damage types.');
    matchedDamageTypes = [...damageTypes.categoryValues];
    if (
      damageTypes.categoriesState === 'known'
      && !damageTypes.categoriesMalformed
    ) {
      damageCoverage = 'full';
    }
  } else if (damageRule.state !== 'known') {
    missingInformation.push(formatRuleIssue('damage-type', damageRule.state));
  } else if (damageTypes.state !== 'known') {
    missingInformation.push(damageTypes.state === 'malformed'
      ? 'The assessment damage information is malformed.'
      : damageTypes.state === 'unknown'
        ? `The assessment includes unrecognized damage or aid types: ${[...damageTypes.unknownValues].join(', ')}.`
        : 'The assessment does not identify a damage or aid type.');
  } else {
    const normalizedProgramTypes = damageRule.values.map(canonicalizeType);
    const supportedTypes = new Set(normalizedProgramTypes.filter(Boolean));
    const unknownProgramTypes = damageRule.values.filter((_, index) => !normalizedProgramTypes[index]);
    const matchedTypes = [...damageTypes.values].filter((type) => supportedTypes.has(type));
    const matchedCategories = [...damageTypes.categoryValues].filter((type) => supportedTypes.has(type));
    matchedDamageTypes = matchedCategories;

    if (unknownProgramTypes.length > 0) {
      missingInformation.push(`The program includes unrecognized damage rules: ${unknownProgramTypes.join(', ')}.`);
    }
    if (damageTypes.unknownValues.size > 0) {
      missingInformation.push(`The assessment includes unrecognized damage or aid types: ${[...damageTypes.unknownValues].join(', ')}.`);
    }
    if (damageTypes.malformed) {
      missingInformation.push('Some assessment damage or aid information is malformed.');
    }

    if (unknownProgramTypes.length === 0) {
      if (
        damageTypes.categoriesState === 'known'
        && damageTypes.unknownCategories.size === 0
        && !damageTypes.categoriesMalformed
      ) {
        unmatchedDamageTypes = [...damageTypes.categoryValues]
          .filter((type) => !supportedTypes.has(type));
        damageCoverage = matchedCategories.length === 0
          ? 'none'
          : unmatchedDamageTypes.length === 0
            ? 'full'
            : 'partial';
      }
    }

    if (matchedTypes.length > 0) {
      matchScore += 45;
      reasons.push(`The reported damage or aid types match: ${matchedTypes.join(', ')}.`);
      if (damageCoverage === 'partial') {
        reasons.push(
          `Partial damage coverage: supported categories include ${matchedDamageTypes.join(', ')}; not listed: ${unmatchedDamageTypes.join(', ')}.`
        );
      }
      if (matchedTypes.includes('general')) {
        restrictions.push('The program uses broad general-damage coverage; verify that it applies to this specific loss.');
      }
    } else if (
      damageTypes.unknownValues.size === 0
      && !damageTypes.malformed
      && unknownProgramTypes.length === 0
    ) {
      failures.push('The program does not list any of the reported damage or aid types.');
    }
  }

  const severityRule = parseMinimumSeverity(program.min_severity);
  const reportedSeverity = normalize(analysis.severity_level);
  if (severityRule.state === 'unrestricted') {
    matchScore += 20;
    reasons.push('The program explicitly sets no minimum severity.');
  } else if (severityRule.state !== 'known') {
    missingInformation.push(formatRuleIssue('minimum-severity', severityRule.state));
  } else if (!Object.hasOwn(SEVERITY_RANK, reportedSeverity)) {
    missingInformation.push('A recognized assessment severity is required to check the program minimum.');
  } else if (SEVERITY_RANK[reportedSeverity] < SEVERITY_RANK[severityRule.severity]) {
    failures.push(`The reported ${reportedSeverity} severity is below the program minimum of ${severityRule.severity}.`);
  } else {
    matchScore += 20;
    reasons.push(`The reported ${reportedSeverity} severity meets the program minimum of ${severityRule.severity}.`);
  }

  const requirements = parseJsonArray(program.requirements);
  const applicationSteps = parseJsonArray(program.application_steps);
  if (requirements.state !== 'known') {
    missingInformation.push(requirements.state === 'malformed'
      ? 'The program requirements are malformed and need review.'
      : 'The program requirements are not available for review.');
  }
  if (applicationSteps.state === 'malformed') {
    missingInformation.push('The program application steps are malformed and need review.');
  }

  const eligibilityOutcome = failures.length > 0
    ? 'not_eligible'
    : missingInformation.length > 0
      ? 'needs_more_information'
      : 'potentially_eligible';
  const reasonsForResult = [...failures, ...reasons];
  if (reasonsForResult.length === 0) {
    reasonsForResult.push('There is not enough information to compare this program with the assessment.');
  }

  return {
    ...program,
    requirements: requirements.state === 'known' ? requirements.values : [],
    application_steps: applicationSteps.state === 'known' ? applicationSteps.values : [],
    disaster_categories: disasterRule.state === 'known' ? disasterRule.values : [],
    damage_types: damageRule.state === 'known' ? damageRule.values : [],
    min_severity: program.min_severity ?? null,
    match_score: matchScore,
    matched_damage_types: matchedDamageTypes,
    unmatched_damage_types: unmatchedDamageTypes,
    damage_coverage: damageCoverage,
    is_top_match: eligibilityOutcome === 'potentially_eligible' && matchScore >= 50,
    eligibility_status: eligibilityOutcome === 'potentially_eligible'
      ? 'potential_match'
      : eligibilityOutcome,
    eligibility_outcome: eligibilityOutcome,
    reasons: reasonsForResult,
    missing_information: [...new Set(missingInformation)],
    restrictions,
    score_interpretation: 'Compatibility points from matching known rules (disaster 35, damage 45, severity 20); not a probability of approval.',
  };
}

export function evaluateSubsidies(analysis, disasterType, programs) {
  if (!analysis || typeof analysis !== 'object' || Array.isArray(analysis)) {
    throw new TypeError('A valid assessment analysis is required to match subsidies.');
  }
  if (!Array.isArray(programs)) {
    throw new TypeError('Subsidy programs must be provided as an array.');
  }

  return programs
    .filter((program) => program && typeof program === 'object' && !Array.isArray(program))
    .map((program) => evaluateProgram(analysis, disasterType, program))
    .sort((a, b) => b.match_score - a.match_score || String(a.title ?? '').localeCompare(String(b.title ?? '')));
}

export function matchSubsidies(analysis, disasterType, programs) {
  return evaluateSubsidies(analysis, disasterType, programs)
    .filter((program) => program.eligibility_outcome !== 'not_eligible');
}

export function attachSubsidyEligibility(analysis, disasterType, programs) {
  const eligibilityResults = evaluateSubsidies(analysis, disasterType, programs);
  return {
    ...analysis,
    matched_subsidies: eligibilityResults.filter((program) => program.eligibility_outcome !== 'not_eligible'),
    eligibility_results: eligibilityResults,
  };
}
