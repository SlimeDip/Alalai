import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getAssessmentEligibilityModel,
  getCatalogProgramPresentation,
  getVisiblePrograms,
  toggleExpandedRecommendation
} from '../../frontend/src/utils/subsidyPresentation.js';

test('assessment presentation shows recommendable outcomes with their returned explanations', () => {
  const model = getAssessmentEligibilityModel({
    eligibility_results: [
      {
        id: 'PROGRAM-1',
        eligibility_outcome: 'potentially_eligible',
        reasons: ['The program supports typhoon.'],
        missing_information: [],
        restrictions: ['Confirm that the local program is accepting applications.']
      },
      {
        id: 'PROGRAM-2',
        eligibility_outcome: 'needs_more_information',
        reasons: ['The reported damage types match.'],
        missing_information: ['The program requirements are not available for review.'],
        restrictions: ['Textual requirements are not evaluated.']
      },
      {
        id: 'PROGRAM-3',
        eligibility_outcome: 'not_eligible',
        reasons: ['The reported severity is below the program minimum.']
      }
    ],
    matched_subsidies: [{ id: 'LEGACY-MATCH' }]
  });

  assert.equal(model.state, 'results');
  assert.deepEqual(model.programs.map((program) => program.outcomeKey), [
    'potentialMatch',
    'needsMoreInformation'
  ]);
  assert.deepEqual(model.programs[0].reasons, ['The program supports typhoon.']);
  assert.deepEqual(model.programs[0].restrictions, ['Confirm that the local program is accepting applications.']);
  assert.deepEqual(model.programs[1].missingInformation, ['The program requirements are not available for review.']);
});

test('saved assessment eligibility can render outcome, reasons, missing information, and restrictions', () => {
  const model = getAssessmentEligibilityModel({
    eligibility_results: [{
      program_id: 'PROGRAM-SAVED',
      title: 'Recovery support',
      eligibility_status: 'potential_match',
      reasons: ['The program supports typhoon.'],
      missing_information: ['The program requirements are not available for review.'],
      restrictions: ['Textual application requirements are not evaluated.']
    }]
  });

  assert.equal(model.programs[0].outcomeKey, 'potentialMatch');
  assert.deepEqual(model.programs[0].reasons, ['The program supports typhoon.']);
  assert.deepEqual(model.programs[0].missingInformation, ['The program requirements are not available for review.']);
  assert.deepEqual(model.programs[0].restrictions, ['Textual application requirements are not evaluated.']);
});

test('assessment presentation handles empty and incomplete matcher responses without adding criteria', () => {
  assert.deepEqual(
    getAssessmentEligibilityModel({ eligibility_results: [], matched_subsidies: [] }),
    { state: 'empty', programs: [] }
  );

  const incomplete = getAssessmentEligibilityModel({
    eligibility_results: [{ id: 'PROGRAM-4', eligibility_status: 'unrecognized' }, null]
  });
  assert.equal(incomplete.state, 'results');
  assert.equal(incomplete.programs.length, 1);
  assert.equal(incomplete.programs[0].outcomeKey, 'outcomeUnavailable');
  assert.deepEqual(incomplete.programs[0].reasons, []);
  assert.deepEqual(incomplete.programs[0].missingInformation, []);
  assert.deepEqual(incomplete.programs[0].restrictions, []);

  const legacy = getAssessmentEligibilityModel({
    matched_subsidies: [{ id: 'LEGACY', eligibility_status: 'potential_match' }]
  });
  assert.equal(legacy.programs[0].outcomeKey, 'potentialMatch');
});

test('individual recommendations can be expanded and collapsed independently', () => {
  let expanded = new Set();
  expanded = toggleExpandedRecommendation(expanded, 'PROGRAM-1');
  assert.deepEqual([...expanded], ['PROGRAM-1']);

  expanded = toggleExpandedRecommendation(expanded, 'PROGRAM-2');
  assert.deepEqual([...expanded], ['PROGRAM-1', 'PROGRAM-2']);

  expanded = toggleExpandedRecommendation(expanded, 'PROGRAM-1');
  assert.deepEqual([...expanded], ['PROGRAM-2']);
});

test('recommendation list reports accurate counts and supports collapsed and expanded states', () => {
  assert.deepEqual(getVisiblePrograms([], false), {
    total: 0,
    visiblePrograms: [],
    hasToggle: false
  });
  assert.deepEqual(getVisiblePrograms([{ id: 'PROGRAM-1' }], false), {
    total: 1,
    visiblePrograms: [{ id: 'PROGRAM-1' }],
    hasToggle: false
  });

  const programs = Array.from({ length: 5 }, (_, index) => ({ id: `PROGRAM-${index + 1}` }));
  const collapsed = getVisiblePrograms(programs, false);
  assert.equal(collapsed.total, 5);
  assert.deepEqual(collapsed.visiblePrograms, programs.slice(0, 3));
  assert.equal(collapsed.hasToggle, true);

  const expanded = getVisiblePrograms(programs, true);
  assert.equal(expanded.total, 5);
  assert.deepEqual(expanded.visiblePrograms, programs);
  assert.equal(expanded.hasToggle, true);
  assert.equal(getVisiblePrograms(programs.slice(0, 3), false).hasToggle, false);
});

test('catalog progressive disclosure shows six matching programs and hides the toggle for shorter results', () => {
  const programs = Array.from({ length: 8 }, (_, index) => ({ id: `CATALOG-${index + 1}` }));
  const collapsed = getVisiblePrograms(programs, false, 6);
  assert.equal(collapsed.total, 8);
  assert.deepEqual(collapsed.visiblePrograms, programs.slice(0, 6));
  assert.equal(collapsed.hasToggle, true);

  const expanded = getVisiblePrograms(programs, true, 6);
  assert.equal(expanded.total, 8);
  assert.deepEqual(expanded.visiblePrograms, programs);
  assert.equal(expanded.hasToggle, true);

  const filteredPrograms = programs.slice(0, 5);
  const filtered = getVisiblePrograms(filteredPrograms, false, 6);
  assert.equal(filtered.total, 5);
  assert.deepEqual(filtered.visiblePrograms, filteredPrograms);
  assert.equal(filtered.hasToggle, false);
});

test('matcher explanation availability distinguishes empty values from omitted fields', () => {
  const model = getAssessmentEligibilityModel({
    eligibility_results: [
      {
        id: 'PROGRAM-RETURNED-EMPTY',
        eligibility_outcome: 'potentially_eligible',
        reasons: [],
        missing_information: [],
        restrictions: []
      },
      {
        id: 'PROGRAM-OMITTED',
        eligibility_outcome: 'potentially_eligible'
      }
    ]
  });

  assert.equal(model.programs[0].reasonsReturned, true);
  assert.equal(model.programs[0].missingInformationReturned, true);
  assert.equal(model.programs[0].restrictionsReturned, true);
  assert.equal(model.programs[1].reasonsReturned, false);
  assert.equal(model.programs[1].missingInformationReturned, false);
  assert.equal(model.programs[1].restrictionsReturned, false);
});

test('general catalog entries are not represented as assessment recommendations', () => {
  const catalogEntry = getCatalogProgramPresentation({
    id: 'CATALOG-1',
    agency: 'Example agency',
    short_description: 'General recovery support information.',
    details: 'Additional catalog information.',
    requirements: ['Proof of identity'],
    application_steps: ['Contact the agency'],
    source_url: ''
  });

  assert.equal(catalogEntry.isAssessmentRecommendation, false);
  assert.equal(catalogEntry.agency, 'Example agency');
  assert.equal(catalogEntry.purpose, 'General recovery support information.');
  assert.equal(catalogEntry.description, 'Additional catalog information.');
  assert.deepEqual(catalogEntry.requirements, ['Proof of identity']);
  assert.deepEqual(catalogEntry.applicationSteps, ['Contact the agency']);
  assert.equal(catalogEntry.sourceUrl, '');
});

test('screening and catalog copy clearly disclaims official decisions and guarantees', () => {
  const screeningDisclaimer = 'This is preliminary screening, not an official eligibility determination. This does not guarantee approval. Verify details with the responsible agency.';
  const catalogDisclaimer = 'This catalog is not a personalized recommendation and program details are not independently verified.';
  assert.match(screeningDisclaimer, /not an official eligibility determination/i);
  assert.match(screeningDisclaimer, /does not guarantee approval/i);
  assert.match(screeningDisclaimer, /verify.*responsible agency/i);
  assert.match(catalogDisclaimer, /not a personalized recommendation/i);
  assert.match(catalogDisclaimer, /not.*independently verified/i);
});
