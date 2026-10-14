import test from 'node:test';
import assert from 'node:assert/strict';
import {
  attachSubsidyEligibility,
  evaluateSubsidies,
  matchSubsidies
} from './subsidyMatcher.js';

function program(overrides = {}) {
  return {
    id: 'custom-program-id',
    agency: 'Test Agency',
    title: 'Test Assistance',
    short_description: 'Assistance for tested disaster damage.',
    details: 'Test details.',
    max_amount_php: 10000,
    amount_display: 'Up to PHP 10,000',
    disaster_categories: 'Typhoon, Flood',
    damage_types: 'structural,agricultural,general',
    min_severity: 'Moderate',
    requirements: '["Barangay certification"]',
    contact_info: 'Test contact',
    application_steps: '["Submit application"]',
    ...overrides
  };
}

function matchingAssessment(overrides = {}) {
  return {
    severity_level: 'Moderate',
    recommended_aid_types: ['structural'],
    damage_categories: ['Structural & Roofing'],
    ...overrides
  };
}

test('matches known rules and preserves existing frontend fields', () => {
  const [match] = matchSubsidies(matchingAssessment(), 'Typhoon', [program()]);

  assert.equal(match.id, 'custom-program-id');
  assert.equal(match.title, 'Test Assistance');
  assert.equal(match.match_score, 100);
  assert.equal(match.is_top_match, true);
  assert.equal(match.eligibility_status, 'potential_match');
  assert.equal(match.eligibility_outcome, 'potentially_eligible');
  assert.deepEqual(match.requirements, ['Barangay certification']);
  assert.equal(match.amount_display, 'Up to PHP 10,000');
  assert.equal(match.score_interpretation.includes('not a probability'), true);
  assert.ok(match.reasons.length >= 3);
  assert.ok(match.restrictions[0].includes('not confirmation'));
});

test('excludes an explicitly unsupported disaster from potential matches', () => {
  const [result] = evaluateSubsidies(matchingAssessment(), 'Earthquake', [program()]);

  assert.equal(result.eligibility_outcome, 'not_eligible');
  assert.equal(result.eligibility_status, 'not_eligible');
  assert.equal(result.is_top_match, false);
  assert.deepEqual(matchSubsidies(matchingAssessment(), 'Earthquake', [program()]), []);
  assert.ok(result.reasons.some((reason) => reason.includes('does not list Earthquake')));
});

test('an unrecognized assessment disaster requires more information instead of confirming a mismatch', () => {
  const [result] = evaluateSubsidies(matchingAssessment(), 'Tpyoon', [program()]);

  assert.equal(result.eligibility_outcome, 'needs_more_information');
  assert.equal(result.eligibility_status, 'needs_more_information');
  assert.equal(result.match_score, 65);
  assert.equal(result.is_top_match, false);
  assert.ok(result.missing_information.some((item) => item.includes('Tpyoon')));
  assert.ok(!result.reasons.some((reason) => reason.includes('does not list Tpyoon')));
});

test('an unrecognized-only program disaster rule requires more information', () => {
  const [result] = evaluateSubsidies(
    matchingAssessment(),
    'Typhoon',
    [program({ disaster_categories: 'Typhoony' })]
  );

  assert.equal(result.eligibility_outcome, 'needs_more_information');
  assert.equal(result.eligibility_status, 'needs_more_information');
  assert.equal(result.match_score, 65);
  assert.equal(result.is_top_match, false);
  assert.ok(result.missing_information.some((item) => item.includes('Typhoony')));
  assert.ok(!result.reasons.some((reason) => reason.includes('does not list Typhoon')));
});

test('a recognized match with an unrecognized program disaster rule remains uncertain', () => {
  const [result] = evaluateSubsidies(
    matchingAssessment(),
    'Typhoon',
    [program({ disaster_categories: 'Typhoon, Typhoony' })]
  );

  assert.equal(result.eligibility_outcome, 'needs_more_information');
  assert.equal(result.match_score, 100);
  assert.equal(result.is_top_match, false);
  assert.ok(result.reasons.some((reason) => reason.includes('supports Typhoon')));
  assert.ok(result.missing_information.some((item) => item.includes('Typhoony')));
});

test('a confirmed damage mismatch takes precedence over uncertain disaster information', () => {
  const [result] = evaluateSubsidies(
    matchingAssessment(),
    'Tpyoon',
    [program({ damage_types: 'agricultural,crops' })]
  );

  assert.equal(result.eligibility_outcome, 'not_eligible');
  assert.equal(result.eligibility_status, 'not_eligible');
  assert.equal(result.is_top_match, false);
  assert.ok(result.missing_information.some((item) => item.includes('Tpyoon')));
  assert.ok(result.reasons.some((reason) => reason.includes('does not list any of the reported damage')));
});

test('excludes an explicitly unsupported damage type from potential matches', () => {
  const candidate = program({ damage_types: 'agricultural,crops' });
  const [result] = evaluateSubsidies(matchingAssessment(), 'Typhoon', [candidate]);

  assert.equal(result.eligibility_outcome, 'not_eligible');
  assert.equal(result.eligibility_status, 'not_eligible');
  assert.equal(result.is_top_match, false);
  assert.deepEqual(matchSubsidies(matchingAssessment(), 'Typhoon', [candidate]), []);
  assert.ok(result.reasons.some((reason) => reason.includes('reported damage or aid types')));
});

test('a missing disaster-coverage rule requires more information when other rules match', () => {
  const candidate = program({ disaster_categories: '' });
  const [result] = evaluateSubsidies(matchingAssessment(), 'Typhoon', [candidate]);

  assert.equal(result.eligibility_outcome, 'needs_more_information');
  assert.equal(result.is_top_match, false);
  assert.deepEqual(result.missing_information, [
    'The program does not specify its disaster-type rule.'
  ]);
});

test('a missing damage-coverage rule requires more information when other rules match', () => {
  const candidate = program({ damage_types: '' });
  const [result] = evaluateSubsidies(matchingAssessment(), 'Typhoon', [candidate]);

  assert.equal(result.eligibility_outcome, 'needs_more_information');
  assert.equal(result.is_top_match, false);
  assert.equal(result.damage_coverage, null);
  assert.deepEqual(result.missing_information, [
    'The program does not specify its damage-type rule.'
  ]);
});

test('reports partial coverage when only one of multiple recognized damage types is supported', () => {
  const assessment = matchingAssessment({
    recommended_aid_types: [],
    damage_categories: ['Structural/Roofing', 'Agriculture/Crops']
  });
  const [result] = evaluateSubsidies(
    assessment,
    'Typhoon',
    [program({ damage_types: 'structural' })]
  );

  assert.deepEqual(result.matched_damage_types, ['structural']);
  assert.deepEqual(result.unmatched_damage_types, ['agricultural']);
  assert.equal(result.damage_coverage, 'partial');
  assert.ok(result.reasons.some((reason) =>
    reason.includes('Partial damage coverage')
      && reason.includes('structural')
      && reason.includes('agricultural')));
  assert.equal(result.eligibility_outcome, 'potentially_eligible');
  assert.equal(result.match_score, 100);
  assert.equal(result.is_top_match, true);
});

test('reports full coverage when all multiple recognized damage types are supported', () => {
  const assessment = matchingAssessment({
    recommended_aid_types: [],
    damage_categories: ['Structural/Roofing', 'Agriculture/Crops']
  });
  const [result] = evaluateSubsidies(
    assessment,
    'Typhoon',
    [program({ damage_types: 'structural,agricultural' })]
  );

  assert.deepEqual(result.matched_damage_types, ['structural', 'agricultural']);
  assert.deepEqual(result.unmatched_damage_types, []);
  assert.equal(result.damage_coverage, 'full');
  assert.equal(result.eligibility_outcome, 'potentially_eligible');
  assert.equal(result.match_score, 100);
});

test('reports no coverage when none of multiple recognized damage types are supported', () => {
  const assessment = matchingAssessment({
    recommended_aid_types: [],
    damage_categories: ['Structural/Roofing', 'Agriculture/Crops']
  });
  const [result] = evaluateSubsidies(
    assessment,
    'Typhoon',
    [program({ damage_types: 'livelihood' })]
  );

  assert.deepEqual(result.matched_damage_types, []);
  assert.deepEqual(result.unmatched_damage_types, ['structural', 'agricultural']);
  assert.equal(result.damage_coverage, 'none');
  assert.equal(result.eligibility_outcome, 'not_eligible');
  assert.equal(result.match_score, 55);
});

test('recommended general and food aid do not appear as reported damage coverage', () => {
  const assessment = matchingAssessment({
    recommended_aid_types: ['general', 'food'],
    damage_categories: ['Structural/Roofing']
  });
  const [result] = evaluateSubsidies(
    assessment,
    'Typhoon',
    [program({ damage_types: 'structural' })]
  );

  assert.deepEqual(result.matched_damage_types, ['structural']);
  assert.deepEqual(result.unmatched_damage_types, []);
  assert.equal(result.damage_coverage, 'full');
  assert.equal(result.eligibility_outcome, 'potentially_eligible');
});

test('aid-type matching can remain relevant without implying reported damage coverage', () => {
  const assessment = matchingAssessment({
    recommended_aid_types: ['food'],
    damage_categories: ['Structural/Roofing']
  });
  const [result] = evaluateSubsidies(
    assessment,
    'Typhoon',
    [program({ damage_types: 'food' })]
  );

  assert.deepEqual(result.matched_damage_types, []);
  assert.deepEqual(result.unmatched_damage_types, ['structural']);
  assert.equal(result.damage_coverage, 'none');
  assert.equal(result.match_score, 100);
  assert.equal(result.eligibility_outcome, 'potentially_eligible');
  assert.ok(result.reasons.some((reason) => reason.includes('match: food')));
});

test('a missing minimum-severity rule requires more information when other rules match', () => {
  const candidate = program({ min_severity: '' });
  const [result] = evaluateSubsidies(matchingAssessment(), 'Typhoon', [candidate]);

  assert.equal(result.eligibility_outcome, 'needs_more_information');
  assert.equal(result.is_top_match, false);
  assert.deepEqual(result.missing_information, [
    'The program does not specify its minimum-severity rule.'
  ]);
});

test('an unrecognized assessment damage category requires more information', () => {
  const assessment = matchingAssessment({
    recommended_aid_types: [],
    damage_categories: ['Unmapped Event Damage']
  });
  const [result] = evaluateSubsidies(assessment, 'Typhoon', [program()]);

  assert.equal(result.eligibility_outcome, 'needs_more_information');
  assert.equal(result.is_top_match, false);
  assert.equal(result.damage_coverage, null);
  assert.deepEqual(result.matched_damage_types, []);
  assert.deepEqual(result.unmatched_damage_types, []);
  assert.ok(result.missing_information.some((item) => item.includes('Unmapped Event Damage')));
  assert.ok(!result.reasons.some((reason) => reason.includes('does not list any of the reported damage')));
});

test('a recognized and unrecognized damage category does not imply full compatibility', () => {
  const assessment = matchingAssessment({
    recommended_aid_types: [],
    damage_categories: ['Structural & Roofing', 'Unmapped Event Damage']
  });
  const [result] = evaluateSubsidies(
    assessment,
    'Typhoon',
    [program({ damage_types: 'structural' })]
  );

  assert.equal(result.eligibility_outcome, 'needs_more_information');
  assert.equal(result.match_score, 100);
  assert.equal(result.is_top_match, false);
  assert.equal(result.damage_coverage, null);
  assert.ok(result.reasons.some((reason) => reason.includes('match: structural')));
  assert.ok(result.missing_information.some((item) => item.includes('Unmapped Event Damage')));
});

test('the exact Gemini water category matches the heuristic alias without aid-type fallback', () => {
  const geminiAssessment = matchingAssessment({
    recommended_aid_types: [],
    damage_categories: ['Flooding/Water Ingress']
  });
  const heuristicAssessment = matchingAssessment({
    recommended_aid_types: [],
    damage_categories: ['Water Ingress & Flooding']
  });
  const [geminiResult] = evaluateSubsidies(
    geminiAssessment,
    'Typhoon',
    [program({ damage_types: 'general' })]
  );
  const [heuristicResult] = evaluateSubsidies(
    heuristicAssessment,
    'Typhoon',
    [program({ damage_types: 'general' })]
  );

  assert.equal(geminiResult.eligibility_outcome, 'needs_more_information');
  assert.equal(geminiResult.match_score, 100);
  assert.ok(geminiResult.reasons.some((reason) => reason.includes('match: general')));
  assert.deepEqual(
    {
      outcome: geminiResult.eligibility_outcome,
      score: geminiResult.match_score,
      missingInformation: geminiResult.missing_information
    },
    {
      outcome: heuristicResult.eligibility_outcome,
      score: heuristicResult.match_score,
      missingInformation: heuristicResult.missing_information
    }
  );
  assert.ok(!geminiResult.missing_information.some((item) => item.includes('unrecognized damage')));
});

test('object-shaped JSON rules are malformed and require more information', () => {
  const [result] = evaluateSubsidies(
    matchingAssessment(),
    'Typhoon',
    [program({ disaster_categories: '{"supported":["Typhoon"]}' })]
  );

  assert.equal(result.eligibility_outcome, 'needs_more_information');
  assert.equal(result.is_top_match, false);
  assert.ok(result.missing_information.some((item) => item.includes('disaster-type rule is malformed')));
});

test('unrecognized program damage rules do not establish a confirmed mismatch', () => {
  const [result] = evaluateSubsidies(
    matchingAssessment(),
    'Typhoon',
    [program({ damage_types: 'structural,unmapped-program-category' })]
  );

  assert.equal(result.eligibility_outcome, 'needs_more_information');
  assert.equal(result.is_top_match, false);
  assert.equal(result.damage_coverage, null);
  assert.ok(result.missing_information.some((item) => item.includes('unmapped-program-category')));
});

test('a malformed damage rule does not claim full or no coverage', () => {
  const [result] = evaluateSubsidies(
    matchingAssessment(),
    'Typhoon',
    [program({ damage_types: '["structural"' })]
  );

  assert.equal(result.eligibility_outcome, 'needs_more_information');
  assert.equal(result.damage_coverage, null);
  assert.deepEqual(result.matched_damage_types, []);
  assert.deepEqual(result.unmatched_damage_types, []);
});

test('malformed reported damage categories do not produce a coverage claim', () => {
  const assessment = matchingAssessment({
    recommended_aid_types: ['structural'],
    damage_categories: '["Structural/Roofing"'
  });
  const [result] = evaluateSubsidies(assessment, 'Typhoon', [program()]);

  assert.equal(result.eligibility_outcome, 'needs_more_information');
  assert.equal(result.damage_coverage, null);
  assert.deepEqual(result.matched_damage_types, []);
  assert.deepEqual(result.unmatched_damage_types, []);
});

test('marks below-minimum severity as not eligible and qualifying severity as potentially eligible', () => {
  const below = matchingAssessment({ severity_level: 'Low' });
  const [failed] = evaluateSubsidies(below, 'Typhoon', [program()]);
  const [passed] = evaluateSubsidies(matchingAssessment(), 'Typhoon', [program()]);

  assert.equal(failed.eligibility_outcome, 'not_eligible');
  assert.ok(failed.reasons.some((reason) => reason.includes('below the program minimum')));
  assert.equal(passed.eligibility_outcome, 'potentially_eligible');
});

test('unknown severity does not satisfy a known minimum-severity rule', () => {
  const [result] = evaluateSubsidies(
    matchingAssessment({ severity_level: 'unclassified' }),
    'Typhoon',
    [program()]
  );

  assert.equal(result.eligibility_outcome, 'needs_more_information');
  assert.equal(result.eligibility_status, 'needs_more_information');
  assert.equal(result.is_top_match, false);
  assert.ok(result.missing_information.some((item) => item.includes('recognized assessment severity')));
});

test('uses the documented severity order including Catastrophic', () => {
  const [result] = evaluateSubsidies(
    matchingAssessment({ severity_level: 'Catastrophic' }),
    'Typhoon',
    [program({ min_severity: 'Severe' })]
  );

  assert.equal(result.eligibility_outcome, 'potentially_eligible');
  assert.ok(result.reasons.some((reason) => reason.includes('meets the program minimum')));
});

test('missing program rules are uncertain rather than unrestricted', () => {
  const candidate = program({
    disaster_categories: '',
    damage_types: '',
    min_severity: null
  });
  const [result] = evaluateSubsidies(matchingAssessment(), 'Typhoon', [candidate]);

  assert.equal(result.eligibility_outcome, 'needs_more_information');
  assert.equal(result.match_score, 0);
  assert.equal(result.is_top_match, false);
  assert.equal(result.missing_information.length, 3);
});

test('an explicit wildcard is the only representation of unrestricted rules', () => {
  const candidate = program({
    disaster_categories: '*',
    damage_types: '*',
    min_severity: '*'
  });
  const [result] = evaluateSubsidies(
    matchingAssessment({
      recommended_aid_types: [],
      damage_categories: ['Structural/Roofing', 'Agriculture/Crops']
    }),
    '',
    [candidate]
  );

  assert.equal(result.eligibility_outcome, 'potentially_eligible');
  assert.equal(result.match_score, 100);
  assert.deepEqual(result.matched_damage_types, ['structural', 'agricultural']);
  assert.deepEqual(result.unmatched_damage_types, []);
  assert.equal(result.damage_coverage, 'full');
});

test('malformed database rules and requirements become explicit uncertainty', () => {
  const [result] = evaluateSubsidies(
    matchingAssessment(),
    'Typhoon',
    [program({
      disaster_categories: '["Typhoon"',
      requirements: '{invalid'
    })]
  );

  assert.equal(result.eligibility_outcome, 'needs_more_information');
  assert.ok(result.missing_information.some((item) => item.includes('disaster-type rule is malformed')));
  assert.ok(result.missing_information.some((item) => item.includes('requirements are malformed')));
});

test('unexpected eligibility field types become uncertainty instead of unrestricted rules', () => {
  const [result] = evaluateSubsidies(
    matchingAssessment(),
    'Typhoon',
    [program({ damage_types: 4, min_severity: { minimum: 'Low' } })]
  );

  assert.equal(result.eligibility_outcome, 'needs_more_information');
  assert.ok(result.missing_information.some((item) => item.includes('damage-type rule is malformed')));
  assert.ok(result.missing_information.some((item) => item.includes('minimum-severity rule is malformed')));
});

test('unrecognized minimum severity rules are not silently accepted', () => {
  const [result] = evaluateSubsidies(
    matchingAssessment(),
    'Typhoon',
    [program({ min_severity: 'Extreme' })]
  );

  assert.equal(result.eligibility_outcome, 'needs_more_information');
  assert.ok(result.missing_information.some((item) => item.includes('minimum-severity rule is malformed')));
});

test('comparison normalizes capitalization and surrounding whitespace', () => {
  const candidate = program({
    disaster_categories: '  tYpHoOn , fLoOd ',
    damage_types: ' STRUCTURAL , agricultural ',
    min_severity: ' mOdErAtE '
  });
  const assessment = matchingAssessment({
    severity_level: ' moderate ',
    recommended_aid_types: [' STRUCTURAL '],
    damage_categories: [' structural & roofing ']
  });
  const [result] = evaluateSubsidies(assessment, ' tyPHOON ', [candidate]);

  assert.equal(result.eligibility_outcome, 'potentially_eligible');
  assert.equal(result.match_score, 100);
});

test('keeps potential, confirmed mismatch, and uncertain programs distinct', () => {
  const programs = [
    program({ id: 'potential', title: 'Potential' }),
    program({ id: 'mismatch', title: 'Mismatch', disaster_categories: 'Earthquake' }),
    program({ id: 'uncertain', title: 'Uncertain', min_severity: '' })
  ];
  const results = evaluateSubsidies(matchingAssessment(), 'Typhoon', programs);
  const visibleCandidates = matchSubsidies(matchingAssessment(), 'Typhoon', programs);

  assert.deepEqual(
    Object.fromEntries(results.map(({ id, eligibility_outcome: outcome }) => [id, outcome])),
    {
      potential: 'potentially_eligible',
      uncertain: 'needs_more_information',
      mismatch: 'not_eligible'
    }
  );
  assert.deepEqual(visibleCandidates.map(({ id }) => id), ['potential', 'uncertain']);
});

test('attached results include every program and matched results exclude only confirmed mismatches', () => {
  const programs = [
    program({ id: 'potential', title: 'Potential' }),
    program({ id: 'mismatch', title: 'Mismatch', damage_types: 'agricultural' }),
    program({ id: 'uncertain', title: 'Uncertain', min_severity: '' })
  ];
  const attached = attachSubsidyEligibility(matchingAssessment(), 'Typhoon', programs);
  const allIds = attached.eligibility_results.map(({ id }) => id);
  const matchedIds = attached.matched_subsidies.map(({ id }) => id);

  assert.deepEqual(new Set(allIds), new Set(['potential', 'mismatch', 'uncertain']));
  assert.deepEqual(new Set(matchedIds), new Set(['potential', 'uncertain']));
  assert.deepEqual(
    attached.matched_subsidies.map(({ id, eligibility_outcome }) => [
      id,
      eligibility_outcome
    ]),
    attached.eligibility_results
      .filter(({ eligibility_outcome }) => eligibility_outcome !== 'not_eligible')
      .map(({ id, eligibility_outcome }) => [id, eligibility_outcome])
  );

  for (const result of attached.eligibility_results) {
    assert.equal(result.eligibility_status,
      result.eligibility_outcome === 'potentially_eligible'
        ? 'potential_match'
        : result.eligibility_outcome);
    if (result.eligibility_outcome === 'not_eligible') {
      assert.equal(result.is_top_match, false);
      assert.equal(matchedIds.includes(result.id), false);
    }
  }
});

test('insufficient assessment information cannot produce a confident match', () => {
  const [result] = evaluateSubsidies({}, '', [program()]);

  assert.equal(result.eligibility_outcome, 'needs_more_information');
  assert.equal(result.is_top_match, false);
  assert.equal(result.match_score, 0);
  assert.equal(result.missing_information.length, 3);
});

test('Gemini and heuristic-shaped assessments use the same eligibility integration path', () => {
  const candidate = program();
  const aiAssessment = matchingAssessment({
    engine: 'Gemini 2.5 Flash',
    damage_categories: ['Structural/Roofing']
  });
  const heuristicAssessment = matchingAssessment({
    engine: 'Heuristic Rule Analyzer (Gemini Ready)',
    damage_categories: ['Structural & Roofing']
  });

  for (const assessment of [aiAssessment, heuristicAssessment]) {
    const attached = attachSubsidyEligibility(assessment, 'Typhoon', [candidate]);
    assert.equal(attached.matched_subsidies[0].eligibility_outcome, 'potentially_eligible');
    assert.equal(attached.eligibility_results[0].id, candidate.id);
  }
});

test('a high compatibility score cannot override a confirmed mismatch', () => {
  const candidate = program({ disaster_categories: 'Earthquake' });
  const [result] = evaluateSubsidies(matchingAssessment(), 'Typhoon', [candidate]);

  assert.equal(result.match_score, 65);
  assert.equal(result.eligibility_outcome, 'not_eligible');
  assert.equal(result.is_top_match, false);
  assert.deepEqual(matchSubsidies(matchingAssessment(), 'Typhoon', [candidate]), []);
});

test('recognizes supported agriculture categories and disaster aliases', () => {
  const assessment = matchingAssessment({
    recommended_aid_types: [],
    damage_categories: ['Agriculture & Fisheries']
  });
  const candidate = program({
    disaster_categories: 'Flood',
    damage_types: 'agricultural,crops,livestock,fisheries'
  });
  const [result] = evaluateSubsidies(assessment, 'Flash Flood', [candidate]);

  assert.equal(result.eligibility_outcome, 'potentially_eligible');
  assert.ok(result.reasons.some((reason) => reason.includes('agricultural')));
});

test('rejects invalid matcher inputs explicitly', () => {
  assert.throws(() => matchSubsidies(null, 'Typhoon', []), TypeError);
  assert.throws(() => matchSubsidies({}, 'Typhoon', null), TypeError);
});
