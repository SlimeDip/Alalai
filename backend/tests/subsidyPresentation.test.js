import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getAssessmentEligibilityModel, getCatalogProgramPresentation } from '../../frontend/src/utils/subsidyPresentation.js';
import { translations } from '../../frontend/src/utils/translations.js';

test('assessment presentation preserves each matcher outcome and returned explanation', () => {
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
    'needsMoreInformation',
    'noCurrentMatch'
  ]);
  assert.deepEqual(model.programs[0].reasons, ['The program supports typhoon.']);
  assert.deepEqual(model.programs[0].restrictions, ['Confirm that the local program is accepting applications.']);
  assert.deepEqual(model.programs[1].missingInformation, ['The program requirements are not available for review.']);
  assert.deepEqual(model.programs[2].reasons, ['The reported severity is below the program minimum.']);
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

test('general catalog entries are not represented as assessment recommendations', () => {
  const catalogEntry = getCatalogProgramPresentation({
    id: 'CATALOG-1',
    short_description: 'General recovery support information.',
    requirements: ['Proof of identity'],
    application_steps: ['Contact the agency'],
    source_url: ''
  });

  assert.equal(catalogEntry.isAssessmentRecommendation, false);
  assert.equal(catalogEntry.purpose, 'General recovery support information.');
  assert.deepEqual(catalogEntry.requirements, ['Proof of identity']);
  assert.deepEqual(catalogEntry.applicationSteps, ['Contact the agency']);
  assert.equal(catalogEntry.sourceUrl, '');
});

test('screening and catalog copy clearly disclaims official decisions and guarantees', () => {
  assert.match(translations.en.screeningDisclaimer, /not an official eligibility determination/i);
  assert.match(translations.en.screeningDisclaimer, /does not guarantee approval/i);
  assert.match(translations.en.screeningDisclaimer, /verify.*responsible agency/i);
  assert.match(translations.en.catalogDisclaimer, /not a personalized recommendation/i);
  assert.match(translations.en.catalogDisclaimer, /not.*independently verified/i);
});
