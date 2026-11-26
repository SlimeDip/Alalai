import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createApplicationFormData,
  getApplicationDocuments,
  getAttachmentChecklist
} from '../../frontend/src/utils/applicationForm.js';

test('application form data uses only explicit recovery case IDs and starts fresh', () => {
  const catalogSelection = createApplicationFormData({
    subsidy: { title: 'Emergency Cash Transfer (ECT)' },
    assessment: { id: 'APP-NOT-A-CASE', damage_summary: 'Flood damage' }
  }, { isGuest: true });

  assert.equal(catalogSelection.case_id, null);
  assert.equal(catalogSelection.applicant_name, '');
  assert.deepEqual(catalogSelection.applied_subsidies, ['Emergency Cash Transfer (ECT)']);
  assert.equal(catalogSelection.sworn_attestation, false);

  const assessmentSelection = createApplicationFormData({
    caseId: 'CASE-EXPLICIT',
    assessment: { id: 'APP-NOT-A-CASE' }
  }, { isGuest: true });
  assert.equal(assessmentSelection.case_id, 'CASE-EXPLICIT');

  const firstSavedApplication = createApplicationFormData({
    fullRecord: {
      id: 'APP-ONE',
      case_id: 'CASE-ONE',
      applicant_name: 'First Applicant',
      barangay: 'First Barangay',
      damage_summary: 'First damage'
    }
  }, { name: 'Profile name' });
  const secondSavedApplication = createApplicationFormData({
    fullRecord: {
      id: 'APP-TWO',
      assessment_id: 'CASE-AMBIGUOUS',
      applicant_name: 'Second Applicant'
    }
  }, { name: 'Profile name' });

  assert.equal(firstSavedApplication.case_id, 'CASE-ONE');
  assert.equal(secondSavedApplication.id, 'APP-TWO');
  assert.equal(secondSavedApplication.case_id, null);
  assert.equal(secondSavedApplication.applicant_name, 'Second Applicant');
  assert.equal(secondSavedApplication.barangay, '');
  assert.equal(secondSavedApplication.damage_summary, '');
  assert.equal(secondSavedApplication.sworn_attestation, false);

  const legacyApplicationIdAsCase = createApplicationFormData({
    fullRecord: {
      id: 'APP-LEGACY',
      case_id: 'APP-LEGACY',
      applicant_name: 'Legacy Applicant'
    }
  }, { isGuest: true });
  assert.equal(legacyApplicationIdAsCase.case_id, null);

  const newApplicationAfterSaved = createApplicationFormData({
    subsidy: { title: 'Emergency Shelter Assistance (ESA)' }
  }, { isGuest: true });
  assert.equal(newApplicationAfterSaved.id, '');
  assert.equal(newApplicationAfterSaved.case_id, null);
  assert.equal(newApplicationAfterSaved.applicant_name, '');
  assert.deepEqual(newApplicationAfterSaved.applied_subsidies, ['Emergency Shelter Assistance (ESA)']);
});

test('attachment checklist reports vault categories without asserting document contents', () => {
  const applicationDocuments = getApplicationDocuments([
    { document_id: 'DOC-ID', category: 'IDENTITY', original_filename: 'id.jpg' },
    { document_id: 'DOC-PHOTO', category: 'DAMAGE_PHOTO', original_filename: 'roof.png' },
    { document_id: 'DOC-OTHER', category: 'SUPPORTING', original_filename: 'certificate.pdf' },
    {
      document_id: 'DOC-ANOTHER-APP',
      application_id: 'APP-OTHER',
      category: 'IDENTITY',
      original_filename: 'other-id.jpg'
    }
  ], 'APP-CURRENT');
  const checklist = getAttachmentChecklist(applicationDocuments);

  assert.deepEqual(checklist.identityFiles.map((document) => document.document_id), ['DOC-ID']);
  assert.deepEqual(checklist.damagePhotoFiles.map((document) => document.document_id), ['DOC-PHOTO']);
  assert.deepEqual(checklist.otherFiles.map((document) => document.document_id), ['DOC-OTHER']);
});

test('a saved profile with zero children fills the form as text, not a number', () => {
  const form = createApplicationFormData(null, { name: 'Resident', childrenCount: 0 });
  assert.equal(form.children_count, '0');
  assert.equal(typeof form.children_count, 'string');

  const noProfileValue = createApplicationFormData(null, { name: 'Resident', childrenCount: '' });
  assert.equal(noProfileValue.children_count, '');

  assert.equal(createApplicationFormData(null, { isGuest: true }).children_count, '0');
});
