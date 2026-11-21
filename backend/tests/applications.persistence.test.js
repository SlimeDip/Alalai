import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import fs from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { after, before, test } from 'node:test';
import Database from 'better-sqlite3';
import { PDFDocument } from 'pdf-lib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ensureLifecycleLockDatabase } from '../services/documentLifecycleLock.js';

let serverProcess;
let database;
let baseUrl;
let csrfToken;
let cookie;
let userId;
let caseId;
let applicationId;
let secondApplicationId;
let packetOtherCaseApplicationId;
let secondUserSession;
let trackedId;
let secondTrackedId;
let reminderId;
let cashAidId;
let inKindAidId;
let photoDocumentId;
let photoStoredName;
let temporaryDirectory;
let privateDocumentDirectory;

async function unusedPort() {
  const listener = createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const { port } = listener.address();
  await new Promise((resolve, reject) => {
    listener.close((error) => (error ? reject(error) : resolve()));
  });
  return port;
}

async function uploadDocument({
  filename,
  bytes,
  mediaType,
  caseId: documentCaseId = caseId,
  applicationId = ''
}) {
  const form = new FormData();
  form.append('case_id', documentCaseId);
  if (applicationId) form.append('application_id', applicationId);
  form.append('category', 'DAMAGE_PHOTO');
  form.append('description', 'Test supporting photo');
  form.append('document', new Blob([bytes], { type: mediaType }), filename);
  const response = await fetch(`${baseUrl}/api/documents`, {
    method: 'POST',
    headers: {
      Cookie: cookie,
      'X-CSRF-Token': csrfToken
    },
    body: form
  });
  return { response, result: await response.json() };
}

async function api(pathname, { method = 'GET', body, session = true, token = csrfToken } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(session && cookie ? { Cookie: cookie } : {}),
      ...(session && token ? { 'X-CSRF-Token': token } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  return { response, result: await response.json() };
}

async function register(email) {
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      firstName: 'Test',
      lastName: 'Resident',
      email,
      password: 'a-strong-test-password'
    })
  });
  const result = await response.json();
  assert.equal(response.status, 201);
  return {
    userId: result.data.id,
    cookie: response.headers.get('set-cookie').split(';')[0],
    csrfToken: result.csrfToken
  };
}

before(async () => {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'alalai-app-test-'));
  const databasePath = path.join(temporaryDirectory, 'isolated.sqlite');
  privateDocumentDirectory = path.join(temporaryDirectory, 'private-documents');
  const legacyDatabase = new Database(databasePath);
  legacyDatabase.exec(`
    CREATE TABLE applications (
      application_id TEXT PRIMARY KEY,
      case_id TEXT,
      user_id TEXT,
      reference_number TEXT UNIQUE NOT NULL,
      applicant_name TEXT NOT NULL,
      applicant_age INTEGER,
      civil_status TEXT,
      contact_number TEXT,
      valid_id_type TEXT,
      valid_id_number TEXT,
      province TEXT NOT NULL,
      city_municipality TEXT NOT NULL,
      barangay TEXT NOT NULL,
      purok_street TEXT,
      household_members_count INTEGER DEFAULT 1,
      household_members_detail TEXT,
      disaster_type TEXT NOT NULL,
      incident_date TEXT,
      damage_level TEXT NOT NULL,
      damage_summary TEXT NOT NULL,
      applied_subsidies TEXT NOT NULL,
      estimated_damage_php REAL,
      requested_amount_php REAL,
      declared_needs TEXT,
      sworn_attestation INTEGER DEFAULT 1,
      status TEXT DEFAULT 'DRAFT',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  legacyDatabase.prepare(`
    INSERT INTO applications (
      application_id, reference_number, applicant_name, province,
      city_municipality, barangay, disaster_type, damage_level,
      damage_summary, applied_subsidies
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'APP-LEGACY-TEST',
    'LEGACY-REFERENCE-1',
    'Legacy Resident',
    'Leyte',
    'Tacloban',
    'Barangay 1',
    'Typhoon',
    'Low',
    'Existing saved application',
    '[]'
  );
  legacyDatabase.close();
  fs.mkdirSync(privateDocumentDirectory);
  ensureLifecycleLockDatabase(privateDocumentDirectory);
  const port = await unusedPort();
  baseUrl = `http://127.0.0.1:${port}`;
  serverProcess = spawn(process.execPath, [
    '--experimental-loader',
    pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'isolatedAssessmentLoader.mjs')).href,
    'server.js'
  ], {
    cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
    env: {
      ...process.env,
      PORT: String(port),
      DISASTER_RELIEF_DB_PATH: databasePath,
      PRIVATE_DOCUMENTS_DIR: privateDocumentDirectory,
      NODE_ENV: 'test',
      ALALAI_E2E_TEST_ROOT: temporaryDirectory,
      ALALAI_E2E_BACKEND_DIR: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
      ALALAI_TEST_ASSESSMENT_MOCK: '1'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let serverOutput = '';
  serverProcess.stdout.setEncoding('utf8');
  serverProcess.stderr.setEncoding('utf8');
  serverProcess.stdout.on('data', (chunk) => { serverOutput += chunk; });
  serverProcess.stderr.on('data', (chunk) => { serverOutput += chunk; });
  const healthUrl = `${baseUrl}/api/health`;
  let ready = false;
  for (let attempt = 0; attempt < 600; attempt += 1) {
    if (serverProcess.exitCode !== null) {
      throw new Error(`Test API server exited with code ${serverProcess.exitCode}: ${serverOutput}`);
    }
    try {
      const response = await fetch(healthUrl);
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {}
    await delay(100);
  }
  assert.equal(ready, true, `isolated test API server did not start: ${serverOutput}`);

  database = new Database(databasePath);
  const preservedLegacy = database.prepare(`
    SELECT applicant_name, reference_number, damage_summary, birth_date, rsbsa_number
    FROM applications WHERE application_id = ?
  `).get('APP-LEGACY-TEST');
  assert.equal(preservedLegacy.applicant_name, 'Legacy Resident');
  assert.equal(preservedLegacy.reference_number, 'LEGACY-REFERENCE-1');
  assert.equal(preservedLegacy.damage_summary, 'Existing saved application');
  assert.equal(preservedLegacy.birth_date, null);
  assert.equal(preservedLegacy.rsbsa_number, null);
  const firstUser = await register('first@example.test');
  userId = firstUser.userId;
  cookie = firstUser.cookie;
  csrfToken = firstUser.csrfToken;
  caseId = 'CASE-PERSISTENCE-TEST';
  database.prepare(`
    INSERT INTO recovery_cases (
      case_id, user_id, disaster_type, province, city_municipality, barangay,
      severity_level
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(caseId, userId, 'Typhoon', 'Leyte', 'Tacloban', 'Barangay 1', 'Moderate');
});

after(async () => {
  database?.close();
  if (serverProcess && serverProcess.exitCode === null) {
    serverProcess.kill();
    await once(serverProcess, 'exit');
  }
  if (temporaryDirectory) {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test('authenticated assessments retain the signed-in owner and matcher explanations', async () => {
  const form = new FormData();
  form.append('disasterType', 'Typhoon');
  form.append('damageDescription', 'Synthetic test roof damage.');
  form.append('applicantName', 'Synthetic E2E Resident');
  form.append('province', 'Synthetic Province');
  form.append('cityMunicipality', 'Test City');
  form.append('barangay', 'Test Barangay');
  const response = await fetch(`${baseUrl}/api/assessments`, {
    method: 'POST',
    headers: { Cookie: cookie, 'X-CSRF-Token': csrfToken },
    body: form
  });
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.match(result.data.damage_summary, /^Synthetic test-only assessment:/);
  assert.ok(result.data.eligibility_results.length > 0);
  assert.ok(result.data.eligibility_results.every((program) => (
    Array.isArray(program.reasons)
    && Array.isArray(program.missing_information)
    && Array.isArray(program.restrictions)
  )));

  const savedCase = database.prepare(`
    SELECT user_id FROM recovery_cases WHERE case_id = ?
  `).get(result.data.case_id);
  assert.equal(savedCase.user_id, userId);

  const ownedCases = await api('/api/assessments');
  assert.equal(ownedCases.response.status, 200);
  assert.ok(ownedCases.result.data.some((item) => item.case_id === result.data.case_id));

  const savedLosses = database.prepare(`
    SELECT item_category, description FROM loss_records WHERE case_id = ?
  `).all(result.data.case_id);
  assert.deepEqual(savedLosses, [{
    item_category: 'structural_roofing',
    description: 'Synthetic test roof damage.'
  }]);
});

test('authenticated applications persist, update in place, retain case data, and enforce ownership', async () => {
  const listedCases = await api('/api/assessments');
  assert.equal(listedCases.response.status, 200);
  assert.ok(listedCases.result.data.some((recoveryCase) => recoveryCase.case_id === caseId));

  const payload = {
    case_id: caseId,
    applicant_name: 'Test Resident',
    applicant_age: '',
    birth_date: '1990-04-03',
    sex: 'Female',
    civil_status: 'Single',
    contact_number: '09123456789',
    valid_id_type: 'PhilSys',
    valid_id_number: 'TEST-ID-1',
    occupation: 'Farmer',
    beneficiary_category: 'Farmer',
    representative_name: '',
    representative_relationship: '',
    representative_contact: '',
    barangay_certificate_reference: '',
    spouse_name: 'N/A',
    children_count: '0',
    province: 'Leyte',
    city_municipality: 'Tacloban',
    barangay: 'Barangay 1',
    purok_street: 'Main Road',
    household_members_count: 1,
    household_members_detail: [],
    disaster_type: 'Typhoon',
    incident_date: '2026-10-01',
    damage_level: 'Moderate',
    damage_summary: 'Roof damage',
    applied_subsidies: ['Emergency Cash Transfer (ECT)'],
    estimated_damage_php: 25000,
    requested_amount_php: 0,
    declared_needs: 'Shelter materials',
    rsbsa_number: 'RSBSA-TEST',
    agricultural_activity: 'Rice farming',
    farm_fishery_location: 'Tacloban',
    land_tenure: 'Owner',
    pcic_policy_number: '',
    sworn_attestation: true,
    status: 'DRAFT'
  };

  const created = await api('/api/applications', { method: 'POST', body: payload });
  assert.equal(created.response.status, 201);
  applicationId = created.result.data.id;
  assert.equal(created.result.data.case_id, caseId);
  assert.equal(created.result.data.birth_date, '1990-04-03');

  const listed = await api('/api/applications');
  assert.equal(listed.response.status, 200);
  assert.equal(listed.result.data.length, 1);
  assert.equal(listed.result.data[0].id, applicationId);
  assert.deepEqual(listed.result.data[0].applied_subsidies, ['Emergency Cash Transfer (ECT)']);

  const updated = await api(`/api/applications/${applicationId}`, {
    method: 'PUT',
    body: {
      ...payload,
      case_id: undefined,
      assessment_id: undefined,
      damage_summary: 'Updated roof damage'
    }
  });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.result.data.id, applicationId);
  assert.equal(updated.result.data.case_id, caseId);
  assert.equal(updated.result.data.damage_summary, 'Updated roof damage');

  const afterUpdate = await api('/api/applications');
  assert.equal(afterUpdate.result.data.length, 1);
  assert.equal(afterUpdate.result.data[0].id, applicationId);

  database.prepare(`
    UPDATE applications SET applied_subsidies = ? WHERE application_id = ?
  `).run(JSON.stringify(['retired-seed-program-id']), applicationId);
  const historicalSelection = await api(`/api/applications/${applicationId}`);
  const preserveArchivedSelection = await api(`/api/applications/${applicationId}`, {
    method: 'PUT',
    body: {
      ...historicalSelection.result.data,
      applied_subsidies: ['retired-seed-program-id']
    }
  });
  assert.equal(preserveArchivedSelection.response.status, 200);
  assert.deepEqual(preserveArchivedSelection.result.data.applied_subsidies, ['retired-seed-program-id']);
  const rejectNewArchivedSelection = await api(`/api/applications/${applicationId}`, {
    method: 'PUT',
    body: {
      ...preserveArchivedSelection.result.data,
      applied_subsidies: ['retired-seed-program-id', 'unknown-new-program-id']
    }
  });
  assert.equal(rejectNewArchivedSelection.response.status, 400);
  const restoreCurrentSelection = await api(`/api/applications/${applicationId}`, {
    method: 'PUT',
    body: {
      ...preserveArchivedSelection.result.data,
      applied_subsidies: payload.applied_subsidies
    }
  });
  assert.equal(restoreCurrentSelection.response.status, 200);

  const loggedOut = await api('/api/auth/logout', { method: 'POST' });
  assert.equal(loggedOut.response.status, 200);
  const loggedIn = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'first@example.test',
      password: 'a-strong-test-password'
    })
  });
  const loginResult = await loggedIn.json();
  assert.equal(loggedIn.status, 200);
  cookie = loggedIn.headers.get('set-cookie').split(';')[0];
  csrfToken = loginResult.csrfToken;
  const afterRelogin = await api('/api/applications');
  assert.equal(afterRelogin.result.data.length, 1);
  assert.equal(afterRelogin.result.data[0].id, applicationId);

  secondUserSession = await register('second@example.test');
  const unauthorizedRead = await fetch(`${baseUrl}/api/applications/${applicationId}`, {
    headers: { Cookie: secondUserSession.cookie }
  });
  assert.equal(unauthorizedRead.status, 404);
  const unauthorizedUpdate = await fetch(`${baseUrl}/api/applications/${applicationId}`, {
    method: 'PUT',
    headers: {
      Cookie: secondUserSession.cookie,
      'X-CSRF-Token': secondUserSession.csrfToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ ...payload, damage_summary: 'Unauthorized change' })
  });
  assert.equal(unauthorizedUpdate.status, 404);

  const otherUserList = await fetch(`${baseUrl}/api/applications`, {
    headers: { Cookie: secondUserSession.cookie }
  });
  assert.deepEqual((await otherUserList.json()).data, []);
});

test('application saves require an explicit attestation and use only canonical recovery case IDs', async () => {
  const basePayload = {
    applicant_name: 'Unlinked Test Resident',
    province: 'Leyte',
    city_municipality: 'Tacloban',
    barangay: 'Barangay 3',
    applied_subsidies: [],
    status: 'DRAFT'
  };
  const missingAttestation = await api('/api/applications', {
    method: 'POST',
    body: { ...basePayload, case_id: null }
  });
  assert.equal(missingAttestation.response.status, 400);
  assert.match(missingAttestation.result.error, /explicitly confirmed/);

  const uncheckedAttestation = await api('/api/applications', {
    method: 'POST',
    body: { ...basePayload, case_id: null, sworn_attestation: false }
  });
  assert.equal(uncheckedAttestation.response.status, 400);

  const ambiguousAssessmentId = await api('/api/applications', {
    method: 'POST',
    body: {
      ...basePayload,
      assessment_id: 'APP-NOT-A-CASE',
      sworn_attestation: true
    }
  });
  assert.equal(ambiguousAssessmentId.response.status, 400);

  const applicationIdAsCase = await api('/api/applications', {
    method: 'POST',
    body: {
      ...basePayload,
      case_id: 'APP-NOT-A-CASE',
      sworn_attestation: true
    }
  });
  assert.equal(applicationIdAsCase.response.status, 400);
  assert.match(applicationIdAsCase.result.error, /not an application/);

  const unlinkedApplication = await api('/api/applications', {
    method: 'POST',
    body: {
      ...basePayload,
      case_id: null,
      sworn_attestation: true
    }
  });
  assert.equal(unlinkedApplication.response.status, 201);
  assert.equal(unlinkedApplication.result.data.case_id, null);
  const deleted = await api(`/api/applications/${unlinkedApplication.result.data.id}`, {
    method: 'DELETE'
  });
  assert.equal(deleted.response.status, 200);
});

test('mismatched application and case ownership does not expose either record across accounts', async () => {
  const otherCaseId = 'CASE-OWNERSHIP-MISMATCH';
  const mismatchedApplicationId = 'APP-OWNERSHIP-MISMATCH';
  database.prepare(`
    INSERT INTO recovery_cases (
      case_id, user_id, disaster_type, province, city_municipality, barangay,
      severity_level
    ) VALUES (?, ?, 'Flood', 'Leyte', 'Tacloban', 'Barangay 2', 'Low')
  `).run(otherCaseId, secondUserSession.userId);
  database.prepare(`
    INSERT INTO applications (
      application_id, case_id, user_id, reference_number, applicant_name,
      province, city_municipality, barangay, disaster_type, damage_level,
      damage_summary, applied_subsidies
    ) VALUES (?, ?, ?, ?, 'Test Resident', 'Leyte', 'Tacloban', 'Barangay 2',
      'Flood', 'Low', 'Test mismatch', '[]')
  `).run(mismatchedApplicationId, otherCaseId, userId, 'REF-OWNERSHIP-MISMATCH');

  try {
    const applicationOwnerRead = await api(`/api/applications/${mismatchedApplicationId}`);
    assert.equal(applicationOwnerRead.response.status, 200);
    assert.equal(applicationOwnerRead.result.data.case_id, otherCaseId);

    const foreignCaseAttempt = await fetch(`${baseUrl}/api/assessments/${otherCaseId}`, {
      headers: { Cookie: cookie }
    });
    assert.equal(foreignCaseAttempt.status, 404);
    const foreignCaseList = await fetch(`${baseUrl}/api/assessments`, {
      headers: { Cookie: cookie }
    });
    const foreignCaseListResult = await foreignCaseList.json();
    assert.ok(foreignCaseListResult.data.every((item) => item.case_id !== otherCaseId));

    const foreignApplicationAttempt = await fetch(
      `${baseUrl}/api/applications/${mismatchedApplicationId}`,
      { headers: { Cookie: secondUserSession.cookie } }
    );
    assert.equal(foreignApplicationAttempt.status, 404);

    const caseOwnerRead = await fetch(`${baseUrl}/api/assessments/${otherCaseId}`, {
      headers: { Cookie: secondUserSession.cookie }
    });
    assert.equal(caseOwnerRead.status, 200);

    const packetAttempt = await fetch(`${baseUrl}/api/packets`, {
      method: 'POST',
      headers: {
        Cookie: cookie,
        'X-CSRF-Token': csrfToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ application_id: mismatchedApplicationId, document_ids: [] })
    });
    assert.equal(packetAttempt.status, 404);
  } finally {
    database.prepare('DELETE FROM applications WHERE application_id = ?').run(mismatchedApplicationId);
    database.prepare('DELETE FROM recovery_cases WHERE case_id = ?').run(otherCaseId);
  }
});

test('tracker keeps program statuses independent, records history, and manages owned reminders', async () => {
  const created = await api('/api/tracker', {
    method: 'POST',
    body: {
      case_id: caseId,
      application_id: applicationId,
      program_name: 'Emergency Cash Transfer (ECT)',
      reference_number: 'USER-REF-01',
      notes: 'Prepared documents'
    }
  });
  assert.equal(created.response.status, 201);
  trackedId = created.result.data.tracked_application_id;
  assert.equal(created.result.data.status, 'PREPARED');
  assert.equal(created.result.data.agency_source, 'Department of Social Welfare and Development (DSWD)');
  assert.equal(created.result.data.history.length, 1);

  const secondApplication = await api('/api/applications', {
    method: 'POST',
    body: {
      applicant_name: 'Test Resident',
      province: 'Leyte',
      city_municipality: 'Tacloban',
      barangay: 'Barangay 1',
      case_id: caseId,
      applied_subsidies: ['Emergency Shelter Assistance (ESA)'],
      sworn_attestation: true,
      status: 'DRAFT'
    }
  });
  assert.equal(secondApplication.response.status, 201);
  secondApplicationId = secondApplication.result.data.id;
  const secondTracked = await api('/api/tracker', {
    method: 'POST',
    body: {
      case_id: caseId,
      application_id: secondApplicationId,
      program_name: 'Emergency Shelter Assistance (ESA)'
    }
  });
  assert.equal(secondTracked.response.status, 201);
  secondTrackedId = secondTracked.result.data.tracked_application_id;

  const submitted = await api(`/api/tracker/${trackedId}/status`, {
    method: 'PATCH',
    body: {
      status: 'SUBMITTED',
      submitted_on: '2026-10-04',
      note: 'Documents handed to the office'
    }
  });
  assert.equal(submitted.response.status, 200);
  assert.equal(submitted.result.data.submitted_on, '2026-10-04');
  assert.equal(submitted.result.data.history.length, 2);

  const followUp = await api(`/api/tracker/${trackedId}/status`, {
    method: 'PATCH',
    body: { status: 'FOLLOW_UP_NEEDED' }
  });
  const decision = await api(`/api/tracker/${trackedId}/status`, {
    method: 'PATCH',
    body: { status: 'DECISION_RECEIVED' }
  });
  assert.equal(followUp.result.data.history.length, 3);
  assert.equal(decision.result.data.history.length, 4);
  assert.equal(decision.result.data.history[3].previous_status, 'FOLLOW_UP_NEEDED');
  assert.equal(decision.result.data.submitted_on, '2026-10-04');

  const invalidDate = await api(`/api/tracker/${trackedId}/reminders`, {
    method: 'POST',
    body: { reminder_date: '2026-02-31' }
  });
  assert.equal(invalidDate.response.status, 400);
  const reminder = await api(`/api/tracker/${trackedId}/reminders`, {
    method: 'POST',
    body: { reminder_date: '2026-11-20', note: 'Call the office' }
  });
  assert.equal(reminder.response.status, 201);
  reminderId = reminder.result.data.reminder_id;
  const editedReminder = await api(`/api/tracker/reminders/${reminderId}`, {
    method: 'PATCH',
    body: { reminder_date: '2026-11-22', note: 'Follow up by phone' }
  });
  assert.equal(editedReminder.result.data.reminder_date, '2026-11-22');
  assert.equal(editedReminder.result.data.note, 'Follow up by phone');
  const completedReminder = await api(`/api/tracker/reminders/${reminderId}`, {
    method: 'PATCH',
    body: { action: 'COMPLETE' }
  });
  assert.equal(completedReminder.result.data.state, 'COMPLETED');

  const list = await api('/api/tracker');
  assert.equal(list.result.data.length, 2);
  assert.equal(list.result.data.find((item) => item.tracked_application_id === secondTrackedId).status, 'PREPARED');
  const submittedFilter = await api('/api/tracker?status=SUBMITTED');
  assert.equal(submittedFilter.result.data.length, 0);

  const unauthorized = await fetch(`${baseUrl}/api/tracker/${trackedId}/status`, {
    method: 'PATCH',
    headers: {
      Cookie: secondUserSession.cookie,
      'X-CSRF-Token': secondUserSession.csrfToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ status: 'PREPARED' })
  });
  assert.equal(unauthorized.status, 404);
  const unauthorizedReminder = await fetch(`${baseUrl}/api/tracker/reminders/${reminderId}`, {
    method: 'PATCH',
    headers: {
      Cookie: secondUserSession.cookie,
      'X-CSRF-Token': secondUserSession.csrfToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ action: 'DISMISS' })
  });
  assert.equal(unauthorizedReminder.status, 404);
});

test('aid ledger separates cash and in-kind totals and enforces validation and ownership', async () => {
  const emptyLedger = await api(`/api/aid?case_id=${caseId}`);
  assert.equal(emptyLedger.result.data.length, 0);
  assert.equal(emptyLedger.result.summary.cash_total_php, 0);
  assert.equal(emptyLedger.result.summary.in_kind_entries, 0);

  const cash = await api('/api/aid', {
    method: 'POST',
    body: {
      case_id: caseId,
      aid_type: 'CASH',
      assistance_description: 'Cash aid',
      amount_php: 15000,
      source: 'Local relief office',
      received_on: '2026-10-10',
      notes: 'Received in person'
    }
  });
  assert.equal(cash.response.status, 201);
  cashAidId = cash.result.data.aid_id;
  assert.equal(cash.result.data.amount_php, 15000);

  const inKind = await api('/api/aid', {
    method: 'POST',
    body: {
      case_id: caseId,
      aid_type: 'IN_KIND',
      assistance_description: 'Food packs',
      quantity: '3 packs',
      estimated_value_php: '',
      source: 'Community group',
      received_on: '2026-10-12'
    }
  });
  assert.equal(inKind.response.status, 201);
  inKindAidId = inKind.result.data.aid_id;
  assert.equal(inKind.result.data.estimated_value_php, null);

  const valuedInKind = await api('/api/aid', {
    method: 'POST',
    body: {
      case_id: caseId,
      aid_type: 'IN_KIND',
      assistance_description: 'Water containers',
      quantity: '2 containers',
      estimated_value_php: 2000,
      source: 'Barangay council',
      received_on: '2026-10-14'
    }
  });
  assert.equal(valuedInKind.response.status, 201);
  const summary = await api(`/api/aid?case_id=${caseId}`);
  assert.equal(summary.result.summary.cash_total_php, 15000);
  assert.equal(summary.result.summary.in_kind_entries, 2);
  assert.equal(summary.result.summary.in_kind_estimated_value_php, 2000);
  assert.equal(summary.result.summary.valued_in_kind_entries, 1);

  const updatedInKind = await api(`/api/aid/${inKindAidId}`, {
    method: 'PUT',
    body: {
      case_id: caseId,
      aid_type: 'IN_KIND',
      assistance_description: 'Food packs',
      quantity: '4 packs',
      estimated_value_php: '',
      source: 'Community group',
      received_on: '2026-10-12'
    }
  });
  assert.equal(updatedInKind.response.status, 200);
  assert.equal(updatedInKind.result.data.quantity, '4 packs');

  const invalidCash = await api('/api/aid', {
    method: 'POST',
    body: {
      case_id: caseId,
      aid_type: 'CASH',
      amount_php: 0,
      source: 'Invalid source',
      received_on: '2026-10-10'
    }
  });
  assert.equal(invalidCash.response.status, 400);

  const unauthorizedDelete = await fetch(`${baseUrl}/api/aid/${cashAidId}`, {
    method: 'DELETE',
    headers: {
      Cookie: secondUserSession.cookie,
      'X-CSRF-Token': secondUserSession.csrfToken
    }
  });
  assert.equal(unauthorizedDelete.status, 404);

  const deletedCash = await api(`/api/aid/${cashAidId}`, { method: 'DELETE' });
  assert.equal(deletedCash.response.status, 200);
  const afterCashDelete = await api(`/api/aid?case_id=${caseId}`);
  assert.equal(afterCashDelete.result.summary.cash_total_php, 0);
  assert.equal(afterCashDelete.result.summary.in_kind_entries, 2);
});

test('document vault validates file content, protects ownership, and securely downloads and deletes files', async () => {
  const pngBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5WQAAAAASUVORK5CYII=',
    'base64'
  );
  const uploaded = await uploadDocument({
    filename: 'damage-photo.png',
    bytes: pngBytes,
    mediaType: 'image/png',
    applicationId: secondApplicationId
  });
  assert.equal(uploaded.response.status, 201);
  const photo = uploaded.result.data;
  photoDocumentId = photo.document_id;
  photoStoredName = photo.stored_name;
  assert.equal(photo.media_type, 'image/png');
  assert.equal(photo.original_filename, 'damage-photo.png');
  assert.match(photo.stored_name, /^DOC-[0-9a-f-]+\.png$/);
  assert.equal(fs.existsSync(path.join(privateDocumentDirectory, photo.stored_name)), true);

  const listed = await fetch(`${baseUrl}/api/documents?case_id=${caseId}`, {
    headers: { Cookie: cookie }
  });
  const listing = await listed.json();
  assert.equal(listing.data.length, 1);
  assert.equal(listing.data[0].document_id, photo.document_id);

  const preview = await fetch(`${baseUrl}/api/documents/${photo.document_id}/preview`, {
    headers: { Cookie: cookie }
  });
  assert.equal(preview.status, 200);
  assert.equal(preview.headers.get('content-type'), 'image/png');
  assert.match(preview.headers.get('content-disposition'), /^inline;/);
  assert.deepEqual(Buffer.from(await preview.arrayBuffer()), pngBytes);

  const download = await fetch(`${baseUrl}/api/documents/${photo.document_id}/download`, {
    headers: { Cookie: cookie }
  });
  assert.equal(download.status, 200);
  assert.match(download.headers.get('content-disposition'), /^attachment;/);

  const metadataUpdate = await fetch(`${baseUrl}/api/documents/${photo.document_id}`, {
    method: 'PUT',
    headers: {
      Cookie: cookie,
      'X-CSRF-Token': csrfToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      category: 'SUPPORTING',
      description: 'Updated test document'
    })
  });
  assert.equal(metadataUpdate.status, 200);
  assert.equal((await metadataUpdate.json()).data.category, 'SUPPORTING');

  const pdfBytes = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n');
  const uploadedPdf = await uploadDocument({
    filename: 'receipt.pdf',
    bytes: pdfBytes,
    mediaType: 'application/pdf'
  });
  assert.equal(uploadedPdf.response.status, 201);
  const pdfPreview = await fetch(`${baseUrl}/api/documents/${uploadedPdf.result.data.document_id}/preview`, {
    headers: { Cookie: cookie }
  });
  assert.equal(pdfPreview.status, 415);

  const invalidContent = await uploadDocument({
    filename: 'not-an-image.png',
    bytes: Buffer.from('not a PNG image'),
    mediaType: 'image/png'
  });
  assert.equal(invalidContent.response.status, 400);

  const unsupported = await uploadDocument({
    filename: 'notes.txt',
    bytes: Buffer.from('plain text'),
    mediaType: 'text/plain'
  });
  assert.equal(unsupported.response.status, 400);

  const oversized = await uploadDocument({
    filename: 'too-large.png',
    bytes: Buffer.alloc(10 * 1024 * 1024 + 1, 0),
    mediaType: 'image/png'
  });
  assert.equal(oversized.response.status, 400);

  const unauthorizedDownload = await fetch(`${baseUrl}/api/documents/${photo.document_id}/download`, {
    headers: { Cookie: secondUserSession.cookie }
  });
  assert.equal(unauthorizedDownload.status, 404);
  const unauthorizedDelete = await fetch(`${baseUrl}/api/documents/${photo.document_id}`, {
    method: 'DELETE',
    headers: {
      Cookie: secondUserSession.cookie,
      'X-CSRF-Token': secondUserSession.csrfToken
    }
  });
  assert.equal(unauthorizedDelete.status, 404);
  assert.equal(database.prepare('SELECT 1 FROM recovery_documents WHERE document_id = ?')
    .get(photo.document_id) != null, true);
  assert.equal(fs.existsSync(path.join(privateDocumentDirectory, photo.stored_name)), true);
  const unauthorizedList = await fetch(`${baseUrl}/api/documents?case_id=${caseId}`, {
    headers: { Cookie: secondUserSession.cookie }
  });
  assert.equal(unauthorizedList.status, 404);

  const deleted = await fetch(`${baseUrl}/api/documents/${uploadedPdf.result.data.document_id}`, {
    method: 'DELETE',
    headers: { Cookie: cookie, 'X-CSRF-Token': csrfToken }
  });
  assert.equal(deleted.status, 200);
  assert.equal(fs.existsSync(path.join(privateDocumentDirectory, uploadedPdf.result.data.stored_name)), false);
  const afterDelete = await fetch(`${baseUrl}/api/documents/${uploadedPdf.result.data.document_id}/download`, {
    headers: { Cookie: cookie }
  });
  assert.equal(afterDelete.status, 404);
});

test('document downloads and previews reject a symlinked stored file', async (t) => {
  const documentPath = path.join(privateDocumentDirectory, photoStoredName);
  const backupPath = `${documentPath}.original`;
  const outsidePath = path.join(temporaryDirectory, 'outside-preview.png');
  const outsideContents = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5WQAAAAASUVORK5CYII=',
    'base64'
  );
  fs.writeFileSync(outsidePath, outsideContents);
  fs.renameSync(documentPath, backupPath);
  try {
    fs.symlinkSync(outsidePath, documentPath, process.platform === 'win32' ? 'file' : undefined);
  } catch (error) {
    fs.renameSync(backupPath, documentPath);
    if (process.platform === 'win32' && ['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) {
      t.skip('The current Windows account cannot create a file symlink.');
      return;
    }
    throw error;
  }

  try {
    const download = await fetch(`${baseUrl}/api/documents/${photoDocumentId}/download`, {
      headers: { Cookie: cookie }
    });
    const preview = await fetch(`${baseUrl}/api/documents/${photoDocumentId}/preview`, {
      headers: { Cookie: cookie }
    });
    assert.equal(download.status, 500);
    assert.equal(preview.status, 500);
    assert.deepEqual(fs.readFileSync(outsidePath), outsideContents);
  } finally {
    fs.unlinkSync(documentPath);
    fs.renameSync(backupPath, documentPath);
  }
});

test('download, preview, and packet routes reject invalid stored paths', async () => {
  const invalidDocumentId = 'DOC-INVALID-PRIVATE-PATH';
  database.prepare(`
    INSERT INTO recovery_documents (
      document_id, user_id, case_id, application_id, original_filename,
      stored_name, media_type, file_size, category, description
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    invalidDocumentId,
    userId,
    caseId,
    applicationId,
    'invalid.png',
    '..\\outside.png',
    'image/png',
    10,
    'OTHER',
    ''
  );
  try {
    const download = await fetch(`${baseUrl}/api/documents/${invalidDocumentId}/download`, {
      headers: { Cookie: cookie }
    });
    const preview = await fetch(`${baseUrl}/api/documents/${invalidDocumentId}/preview`, {
      headers: { Cookie: cookie }
    });
    assert.equal(download.status, 500);
    assert.equal(preview.status, 500);

    const packet = await fetch(`${baseUrl}/api/packets`, {
      method: 'POST',
      headers: {
        Cookie: cookie,
        'X-CSRF-Token': csrfToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        application_id: applicationId,
        document_ids: [invalidDocumentId]
      })
    });
    assert.equal(packet.status, 500);
  } finally {
    database.prepare('DELETE FROM recovery_documents WHERE document_id = ?').run(invalidDocumentId);
  }
});

test('packet generation uses saved data, includes selected documents, and safely omits unavailable files', async () => {
  const savedApplication = await api(`/api/applications/${applicationId}`);
  const longSummary = `Long saved damage description ${'Details about the damaged roof and household needs. '.repeat(180)}`;
  const updatedApplication = await api(`/api/applications/${applicationId}`, {
    method: 'PUT',
    body: { ...savedApplication.result.data, damage_summary: longSummary }
  });
  assert.equal(updatedApplication.response.status, 200);

  const noFiles = await fetch(`${baseUrl}/api/packets`, {
    method: 'POST',
    headers: {
      Cookie: cookie,
      'X-CSRF-Token': csrfToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ application_id: applicationId, document_ids: [] })
  });
  assert.equal(noFiles.status, 200);
  assert.match(noFiles.headers.get('content-type'), /application\/pdf/);
  const noFilesPdf = await PDFDocument.load(Buffer.from(await noFiles.arrayBuffer()));
  assert.equal(noFilesPdf.getTitle(), `Alalai recovery packet ${updatedApplication.result.data.reference_number}`);
  assert.ok(noFilesPdf.getPageCount() >= 2, 'long saved summary should wrap across packet pages');

  const pngBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5WQAAAAASUVORK5CYII=',
    'base64'
  );
  const secondPhoto = await uploadDocument({
    filename: 'second-damage-photo.png',
    bytes: pngBytes,
    mediaType: 'image/png'
  });
  assert.equal(secondPhoto.response.status, 201);

  const receiptPdf = await PDFDocument.create();
  receiptPdf.addPage([595.28, 841.89]).drawText('Supporting receipt');
  const receiptBytes = Buffer.from(await receiptPdf.save());
  const receipt = await uploadDocument({
    filename: 'supporting-receipt.pdf',
    bytes: receiptBytes,
    mediaType: 'application/pdf'
  });
  assert.equal(receipt.response.status, 201);

  const webpBytes = Buffer.from(
    'UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEAAUAmJaQAA3AA/v89WAAAAA==',
    'base64'
  ).subarray(0, 42);
  const webp = await uploadDocument({
    filename: 'unsupported-packet-photo.webp',
    bytes: webpBytes,
    mediaType: 'image/webp'
  });
  assert.equal(webp.response.status, 201);

  const secondCaseId = 'CASE-PACKET-OTHER';
  database.prepare(`
    INSERT INTO recovery_cases (
      case_id, user_id, disaster_type, province, city_municipality, barangay,
      severity_level
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(secondCaseId, userId, 'Flood', 'Leyte', 'Tacloban', 'Barangay 2', 'Low');
  const secondCaseApplication = await api('/api/applications', {
    method: 'POST',
    body: {
      case_id: secondCaseId,
      applicant_name: 'Test Resident',
      province: 'Leyte',
      city_municipality: 'Tacloban',
      barangay: 'Barangay 2',
      applied_subsidies: [],
      sworn_attestation: true,
      status: 'DRAFT'
    }
  });
  assert.equal(secondCaseApplication.response.status, 201);
  packetOtherCaseApplicationId = secondCaseApplication.result.data.id;
  const otherCaseDocument = await uploadDocument({
    filename: 'other-case.png',
    bytes: pngBytes,
    mediaType: 'image/png',
    caseId: secondCaseId,
    applicationId: secondCaseApplication.result.data.id
  });
  assert.equal(otherCaseDocument.response.status, 201);

  const crossCase = await fetch(`${baseUrl}/api/packets`, {
    method: 'POST',
    headers: {
      Cookie: cookie,
      'X-CSRF-Token': csrfToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      application_id: applicationId,
      document_ids: [otherCaseDocument.result.data.document_id]
    })
  });
  assert.equal(crossCase.status, 404);

  fs.unlinkSync(path.join(privateDocumentDirectory, photoStoredName));
  const withAttachments = await fetch(`${baseUrl}/api/packets`, {
    method: 'POST',
    headers: {
      Cookie: cookie,
      'X-CSRF-Token': csrfToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      application_id: applicationId,
      document_ids: [
        photoDocumentId,
        secondPhoto.result.data.document_id,
        receipt.result.data.document_id,
        webp.result.data.document_id
      ]
    })
  });
  assert.equal(withAttachments.status, 200);
  const fullPdf = await PDFDocument.load(Buffer.from(await withAttachments.arrayBuffer()));
  assert.ok(fullPdf.getPageCount() >= noFilesPdf.getPageCount() + 4);

  const anotherCasePacket = await fetch(`${baseUrl}/api/packets`, {
    method: 'POST',
    headers: {
      Cookie: cookie,
      'X-CSRF-Token': csrfToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      application_id: secondCaseApplication.result.data.id,
      document_ids: [otherCaseDocument.result.data.document_id]
    })
  });
  assert.equal(anotherCasePacket.status, 200);
  const otherPdf = await PDFDocument.load(Buffer.from(await anotherCasePacket.arrayBuffer()));
  assert.ok(otherPdf.getPageCount() >= 2);

  const unauthorized = await fetch(`${baseUrl}/api/packets`, {
    method: 'POST',
    headers: {
      Cookie: secondUserSession.cookie,
      'X-CSRF-Token': secondUserSession.csrfToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ application_id: applicationId, document_ids: [] })
  });
  assert.equal(unauthorized.status, 404);
});

test('packet generation omits a symlinked selected document instead of reading its target', async (t) => {
  const uploaded = await uploadDocument({
    filename: 'packet-symlink.pdf',
    bytes: Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n'),
    mediaType: 'application/pdf',
    applicationId
  });
  assert.equal(uploaded.response.status, 201);

  const emptyPacketResponse = await fetch(`${baseUrl}/api/packets`, {
    method: 'POST',
    headers: {
      Cookie: cookie,
      'X-CSRF-Token': csrfToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ application_id: applicationId, document_ids: [] })
  });
  assert.equal(emptyPacketResponse.status, 200);
  const emptyPacket = await PDFDocument.load(Buffer.from(await emptyPacketResponse.arrayBuffer()));

  const outsidePdf = await PDFDocument.create();
  outsidePdf.addPage();
  outsidePdf.addPage();
  outsidePdf.addPage();
  const outsidePath = path.join(temporaryDirectory, 'outside-packet.pdf');
  fs.writeFileSync(outsidePath, Buffer.from(await outsidePdf.save()));
  const documentPath = path.join(privateDocumentDirectory, uploaded.result.data.stored_name);
  const backupPath = `${documentPath}.original`;
  fs.renameSync(documentPath, backupPath);
  try {
    fs.symlinkSync(outsidePath, documentPath, process.platform === 'win32' ? 'file' : undefined);
  } catch (error) {
    fs.renameSync(backupPath, documentPath);
    if (process.platform === 'win32' && ['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) {
      t.skip('The current Windows account cannot create a file symlink.');
      return;
    }
    throw error;
  }

  try {
    const packetResponse = await fetch(`${baseUrl}/api/packets`, {
      method: 'POST',
      headers: {
        Cookie: cookie,
        'X-CSRF-Token': csrfToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        application_id: applicationId,
        document_ids: [uploaded.result.data.document_id]
      })
    });
    assert.equal(packetResponse.status, 200);
    const packet = await PDFDocument.load(Buffer.from(await packetResponse.arrayBuffer()));
    assert.equal(packet.getPageCount(), emptyPacket.getPageCount() + 1);
  } finally {
    fs.unlinkSync(documentPath);
    fs.renameSync(backupPath, documentPath);
  }
});

test('document storage failures return an error without inserting a database record', async () => {
  const pngBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5WQAAAAASUVORK5CYII=',
    'base64'
  );
  const existing = await fetch(`${baseUrl}/api/documents?case_id=${caseId}`, {
    headers: { Cookie: cookie }
  });
  const existingRows = (await existing.json()).data;
  const displacedDirectory = `${privateDocumentDirectory}-backup`;
  fs.renameSync(privateDocumentDirectory, displacedDirectory);
  fs.writeFileSync(privateDocumentDirectory, 'not a directory');
  try {
    const failed = await uploadDocument({
      filename: 'storage-failure.png',
      bytes: pngBytes,
      mediaType: 'image/png'
    });
    assert.equal(failed.response.status, 500);
  } finally {
    fs.unlinkSync(privateDocumentDirectory);
    fs.renameSync(displacedDirectory, privateDocumentDirectory);
  }
  const afterFailure = await fetch(`${baseUrl}/api/documents?case_id=${caseId}`, {
    headers: { Cookie: cookie }
  });
  assert.equal((await afterFailure.json()).data.length, existingRows.length);
});

test('account application writes reject requests without a valid authenticated session', async () => {
  const response = await fetch(`${baseUrl}/api/applications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ applicant_name: 'Guest' })
  });
  assert.equal(response.status, 401);
});

test('application deletion removes only the owned record', async () => {
  const deleted = await api(`/api/applications/${applicationId}`, { method: 'DELETE' });
  assert.equal(deleted.response.status, 200);
  const listed = await api('/api/applications');
  assert.equal(listed.result.data.length, 2);
  assert.ok(listed.result.data.some((item) => item.id === secondApplicationId));
  assert.ok(listed.result.data.some((item) => item.id === packetOtherCaseApplicationId));
  const secondDeleted = await api(`/api/applications/${secondApplicationId}`, { method: 'DELETE' });
  const thirdDeleted = await api(`/api/applications/${packetOtherCaseApplicationId}`, { method: 'DELETE' });
  assert.equal(secondDeleted.response.status, 200);
  assert.equal(thirdDeleted.response.status, 200);
  const afterAllDeletes = await api('/api/applications');
  assert.equal(afterAllDeletes.result.data.length, 0);
});
