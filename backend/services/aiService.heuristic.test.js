import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendDirectory = fileURLToPath(new URL('..', import.meta.url));

const heuristicIntegrationScript = `
const { default: db, initDatabase } = await import('./database.js');
initDatabase();

try {
  const { analyzeDisasterDamage, validateGeminiAnalysisResult } = await import('./services/aiService.js');
  const cases = [
    { label: 'roof', disasterType: 'Typhoon', damageDescription: 'May sira ang bubong.' },
    {
      label: 'denied-roof-english',
      disasterType: 'Typhoon',
      damageDescription: 'No damage to the roof.'
    },
    {
      label: 'denied-roof-tagalog',
      disasterType: 'Typhoon',
      damageDescription: 'Walang sira ang bubong.'
    },
    {
      label: 'unclassified',
      disasterType: 'Typhoon',
      damageDescription: 'The household reports unfamiliar shingle displacement.'
    },
    {
      label: 'roof-and-agriculture',
      disasterType: 'Typhoon',
      damageDescription: 'May sira ang bubong at pananim na palay.'
    },
    { label: 'agriculture', disasterType: 'Typhoon', damageDescription: 'May sira ang pananim na palay.' },
    {
      label: 'severe-agriculture',
      disasterType: 'Typhoon',
      damageDescription: 'Patay ang pananim na palay matapos ang bagyo.'
    },
    {
      label: 'severe-structural',
      disasterType: 'Typhoon',
      damageDescription: 'Bumagsak ang pader at nasira ang bubong.'
    },
    { label: 'livelihood', disasterType: 'Typhoon', damageDescription: 'May sira ang tindahan at paninda.' },
    { label: 'flood', disasterType: 'Typhoon', damageDescription: 'Baha sa loob ng bahay.' }
  ];
  const results = [];

  for (const input of cases) {
    const analysis = await analyzeDisasterDamage({
      ...input,
      location: 'Isolated heuristic test',
      householdSize: 2
    });
    results.push({
      label: input.label,
      engine: analysis.engine,
      severity_level: analysis.severity_level,
      severity_score: analysis.severity_score,
      damage_summary: analysis.damage_summary,
      damage_categories: analysis.damage_categories,
      recommended_aid_types: analysis.recommended_aid_types,
      matched_subsidies: analysis.matched_subsidies,
      eligibility_results: analysis.eligibility_results
    });
  }

  const { attachSubsidyEligibility } = await import('./services/subsidyMatcher.js');
  const unclassifiedAnalysis = results.find(({ label }) => label === 'unclassified');
  unclassifiedAnalysis.controlled_eligibility_results = attachSubsidyEligibility(
    unclassifiedAnalysis,
    'Typhoon',
    [{
      id: 'general-assistance',
      title: 'General Assistance',
      disaster_categories: 'Typhoon',
      damage_types: 'general',
      min_severity: 'Low',
      requirements: '["Barangay certification"]',
      application_steps: '["Submit application"]'
    }]
  ).eligibility_results;

  const explicitlyRecommendedFood = attachSubsidyEligibility({
    severity_level: 'Moderate',
    damage_categories: ['Structural & Roofing'],
    recommended_aid_types: ['food']
  }, 'Typhoon', db.prepare('SELECT subsidy_id AS id, * FROM subsidies').all());
  results.push({
    label: 'explicit-food-need',
    recommended_aid_types: explicitlyRecommendedFood.recommended_aid_types,
    matched_subsidies: explicitlyRecommendedFood.matched_subsidies,
    eligibility_results: explicitlyRecommendedFood.eligibility_results
  });

  const validGeminiShape = {
    severity_level: 'Moderate',
    severity_score: 45,
    damage_summary: 'Roof damage reported.',
    damage_categories: ['Structural & Roofing'],
    estimated_cost_min: 1000,
    estimated_cost_max: 5000,
    urgency: 'Standard',
    recommended_aid_types: ['structural'],
    safety_precautions: [],
    suggested_actions: []
  };
  const validGeminiResultAccepted = validateGeminiAnalysisResult(validGeminiShape) === validGeminiShape;
  let malformedGeminiCategoriesRejected = false;
  try {
    validateGeminiAnalysisResult({
      ...validGeminiShape,
      damage_categories: 'Structural & Roofing'
    });
  } catch (error) {
    malformedGeminiCategoriesRejected = error instanceof TypeError;
  }

  function isGeminiResultAccepted(overrides = {}) {
    try {
      validateGeminiAnalysisResult({ ...validGeminiShape, ...overrides });
      return true;
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
      return false;
    }
  }

  const numericValidation = {
    ordinaryValuesAccepted: isGeminiResultAccepted(),
    minimumSeverityAccepted: isGeminiResultAccepted({ severity_score: 1 }),
    maximumSeverityAccepted: isGeminiResultAccepted({ severity_score: 100 }),
    zeroCostsAccepted: isGeminiResultAccepted({ estimated_cost_min: 0, estimated_cost_max: 0 }),
    severityBelowMinimumRejected: !isGeminiResultAccepted({ severity_score: 0 }),
    severityAboveMaximumRejected: !isGeminiResultAccepted({ severity_score: 101 }),
    negativeMinimumCostRejected: !isGeminiResultAccepted({ estimated_cost_min: -1 }),
    negativeMaximumCostRejected: !isGeminiResultAccepted({ estimated_cost_max: -1 }),
    reversedCostRangeRejected: !isGeminiResultAccepted({
      estimated_cost_min: 5001,
      estimated_cost_max: 5000
    }),
    missingSeverityRejected: !isGeminiResultAccepted({ severity_score: undefined }),
    nonNumericSeverityRejected: !isGeminiResultAccepted({ severity_score: '45' }),
    nanSeverityRejected: !isGeminiResultAccepted({ severity_score: Number.NaN }),
    infiniteSeverityRejected: !isGeminiResultAccepted({ severity_score: Number.POSITIVE_INFINITY }),
    missingMinimumCostRejected: !isGeminiResultAccepted({ estimated_cost_min: undefined }),
    nonNumericMaximumCostRejected: !isGeminiResultAccepted({ estimated_cost_max: '5000' }),
    infiniteMinimumCostRejected: !isGeminiResultAccepted({ estimated_cost_min: Number.POSITIVE_INFINITY }),
    nanMaximumCostRejected: !isGeminiResultAccepted({ estimated_cost_max: Number.NaN })
  };

  console.log(JSON.stringify({
    analyses: results,
    validation: {
      validGeminiResultAccepted,
      malformedGeminiCategoriesRejected,
      numericValidation
    }
  }));
} finally {
  db.close();
}
`;

function runIsolatedHeuristicIntegration() {
  const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), 'heuristic-aid-'));
  const databasePath = path.join(temporaryDirectory, 'test.sqlite');

  try {
    const result = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', heuristicIntegrationScript],
      {
        cwd: backendDirectory,
        encoding: 'utf8',
        env: {
          ...process.env,
          DISASTER_RELIEF_DB_PATH: databasePath,
          GEMINI_API_KEY: ''
        }
      }
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);
    return JSON.parse(result.stdout.trim());
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

test('heuristic aid recommendations remain assessment-driven in the database-backed response', () => {
  const { analyses: results } = runIsolatedHeuristicIntegration();
  const byLabel = Object.fromEntries(results.map((result) => [result.label, result]));
  const roof = byLabel.roof;

  assert.equal(roof.engine, 'Heuristic Rule Analyzer (Gemini Ready)');
  assert.deepEqual(roof.damage_categories, ['Structural & Roofing']);
  assert.deepEqual(roof.recommended_aid_types, ['structural']);
  assert.ok(!roof.recommended_aid_types.includes('general'));
  assert.ok(!roof.recommended_aid_types.includes('food'));

  for (const label of ['denied-roof-english', 'denied-roof-tagalog']) {
    const deniedRoof = byLabel[label];
    assert.deepEqual(deniedRoof.damage_categories, []);
    assert.deepEqual(deniedRoof.recommended_aid_types, []);
    assert.match(deniedRoof.damage_summary, /did not identify a supported damage category/);
  }
  assert.equal(byLabel['denied-roof-tagalog'].severity_level, 'Low');
  assert.equal(byLabel['denied-roof-tagalog'].severity_score, 25);

  const unclassified = byLabel.unclassified;
  assert.deepEqual(unclassified.damage_categories, []);
  assert.deepEqual(unclassified.recommended_aid_types, []);
  assert.match(unclassified.damage_summary, /did not identify a supported damage category/);
  const unclassifiedGeneralProgram = unclassified.controlled_eligibility_results[0];
  assert.equal(unclassifiedGeneralProgram.eligibility_outcome, 'needs_more_information');
  assert.ok(unclassifiedGeneralProgram.missing_information
    .some((item) => item.includes('does not identify a damage or aid type')));

  const partialShelterAid = roof.eligibility_results.find(({ id }) => id === 'dswd-esa-partial');
  assert.equal(partialShelterAid.eligibility_outcome, 'potentially_eligible');
  assert.ok(roof.matched_subsidies.some(({ id }) => id === 'dswd-esa-partial'));

  const aics = roof.eligibility_results.find(({ id }) => id === 'dswd-aics');
  assert.equal(aics.eligibility_outcome, 'not_eligible');
  assert.ok(!roof.matched_subsidies.some(({ id }) => id === 'dswd-aics'));

  const roofAndAgriculture = byLabel['roof-and-agriculture'];
  const partialCoverageAid = roofAndAgriculture.eligibility_results
    .find(({ id }) => id === 'dswd-esa-partial');
  assert.equal(partialCoverageAid.eligibility_outcome, 'potentially_eligible');
  assert.deepEqual(partialCoverageAid.matched_damage_types, ['structural']);
  assert.deepEqual(partialCoverageAid.unmatched_damage_types, ['agricultural']);
  assert.equal(partialCoverageAid.damage_coverage, 'partial');

  const explicitFoodNeed = byLabel['explicit-food-need'];
  const aicsForFoodNeed = explicitFoodNeed.eligibility_results.find(({ id }) => id === 'dswd-aics');
  assert.equal(aicsForFoodNeed.eligibility_outcome, 'potentially_eligible');
  assert.equal(aicsForFoodNeed.damage_coverage, 'none');
  assert.ok(aicsForFoodNeed.reasons.some((reason) => reason.includes('match: food')));
  assert.ok(explicitFoodNeed.matched_subsidies.some(({ id }) => id === 'dswd-aics'));

  assert.ok(byLabel.agriculture.recommended_aid_types.includes('agricultural'));
  assert.ok(byLabel.livelihood.recommended_aid_types.includes('livelihood'));
  assert.ok(byLabel.flood.recommended_aid_types.includes('general'));

  const severeAgriculture = byLabel['severe-agriculture'];
  assert.equal(severeAgriculture.severity_level, 'Severe');
  assert.equal(severeAgriculture.severity_score, 75);
  assert.deepEqual(severeAgriculture.damage_categories, ['Agriculture & Fisheries']);
  assert.deepEqual(severeAgriculture.recommended_aid_types, ['agricultural']);

  const severeStructural = byLabel['severe-structural'];
  assert.equal(severeStructural.severity_level, 'Severe');
  assert.equal(severeStructural.severity_score, 75);
  assert.deepEqual(severeStructural.damage_categories, ['Structural & Roofing']);
  assert.deepEqual(severeStructural.recommended_aid_types, ['structural']);

  for (const analysis of results) {
    assert.ok(Array.isArray(analysis.matched_subsidies));
    assert.ok(Array.isArray(analysis.eligibility_results));
    assert.ok(analysis.eligibility_results.length > 0);
    assert.deepEqual(
      analysis.matched_subsidies.map(({ id }) => id).sort(),
      analysis.eligibility_results
        .filter(({ eligibility_outcome }) => eligibility_outcome !== 'not_eligible')
        .map(({ id }) => id)
        .sort()
    );
  }
});

test('Gemini analysis validation rejects malformed values used by the assessment route', () => {
  const { validation } = runIsolatedHeuristicIntegration();

  assert.equal(validation.validGeminiResultAccepted, true);
  assert.equal(validation.malformedGeminiCategoriesRejected, true);
});

test('Gemini analysis validation enforces severity and cost bounds', () => {
  const { validation } = runIsolatedHeuristicIntegration();

  assert.deepEqual(validation.numericValidation, {
    ordinaryValuesAccepted: true,
    minimumSeverityAccepted: true,
    maximumSeverityAccepted: true,
    zeroCostsAccepted: true,
    severityBelowMinimumRejected: true,
    severityAboveMaximumRejected: true,
    negativeMinimumCostRejected: true,
    negativeMaximumCostRejected: true,
    reversedCostRangeRejected: true,
    missingSeverityRejected: true,
    nonNumericSeverityRejected: true,
    nanSeverityRejected: true,
    infiniteSeverityRejected: true,
    missingMinimumCostRejected: true,
    nonNumericMaximumCostRejected: true,
    infiniteMinimumCostRejected: true,
    nanMaximumCostRejected: true
  });
});
