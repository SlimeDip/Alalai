import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendDirectory = fileURLToPath(new URL('..', import.meta.url));

const coreWorkflowScript = `
import net from 'node:net';

const probe = net.createServer();
await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
process.env.PORT = String(port);
process.env.NODE_ENV = 'development';
process.env.GEMINI_API_KEY = '';

const [{ server }, { default: db }] = await Promise.all([
  import('./server.js'),
  import('./database.js')
]);
await new Promise((resolve, reject) => {
  if (server.listening) return resolve();
  server.once('listening', resolve);
  server.once('error', reject);
});

const base = 'http://127.0.0.1:' + port;
async function request(path, { method = 'GET', body, cookie, csrfToken } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(cookie ? { cookie } : {}),
      ...(csrfToken ? { 'x-csrf-token': csrfToken } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return {
    status: response.status,
    body: await response.json(),
    setCookie: response.headers.get('set-cookie')
  };
}

const registration = await request('/api/auth/register', {
  method: 'POST',
  body: {
    fullName: 'Workflow Owner',
    email: 'workflow-owner@example.test',
    password: 'workflow-owner-password'
  }
});
const ownerCookie = registration.setCookie.split(';')[0];
const ownerCsrf = registration.body.csrfToken;
const authenticatedUser = await request('/api/auth/me', { cookie: ownerCookie });

const firstAssessment = await request('/api/assessments', {
  method: 'POST',
  cookie: ownerCookie,
  csrfToken: ownerCsrf,
  body: {
    disasterType: 'Typhoon',
    damageDescription: 'May sira ang bubong at may tulo matapos ang bagyo.',
    applicantName: 'Workflow Owner',
    contactNumber: '09170000000',
    province: 'Workflow Province',
    cityMunicipality: 'Workflow City',
    barangay: 'Workflow Barangay',
    householdSize: 4
  }
});
const uncertainAssessment = await request('/api/assessments', {
  method: 'POST',
  cookie: ownerCookie,
  csrfToken: ownerCsrf,
  body: {
    disasterType: 'Unlisted Event',
    damageDescription: 'Damage to the household roof.',
    province: 'Workflow Province',
    cityMunicipality: 'Workflow City',
    barangay: 'Workflow Barangay'
  }
});
const caseId = firstAssessment.body.assessmentId;
const caseRow = db.prepare(
  'SELECT * FROM recovery_cases WHERE case_id = ?'
).get(caseId);
const persistedLossRecords = db.prepare(
  'SELECT * FROM loss_records WHERE case_id = ?'
).all(caseId);
const persistedRecoveryPlans = db.prepare(
  'SELECT * FROM recovery_plans WHERE case_id = ?'
).all(caseId);
const retrievedCase = await request('/api/assessments/' + caseId, { cookie: ownerCookie });

const secondAssessment = await request('/api/assessments', {
  method: 'POST',
  cookie: ownerCookie,
  csrfToken: ownerCsrf,
  body: {
    disasterType: 'Flood',
    damageDescription: 'Baha at tubig sa loob ng bahay.',
    applicantName: 'Workflow Owner',
    province: 'Workflow Province',
    cityMunicipality: 'Workflow City',
    barangay: 'Workflow Barangay'
  }
});
const selectedProgram = 'dswd-esa-partial';
const applicationCreate = await request('/api/applications', {
  method: 'POST',
  cookie: ownerCookie,
  csrfToken: ownerCsrf,
  body: {
    case_id: caseId,
    user_id: 'FORGED-OWNER-ID',
    applicant_name: 'Workflow Applicant',
    applicant_age: 34,
    contact_number: '09171112222',
    province: 'Workflow Province',
    city_municipality: 'Workflow City',
    barangay: 'Workflow Barangay',
    household_members_count: 2,
    household_members_detail: [
      { name: 'Household Member', age: 10, relationship: 'Child' }
    ],
    disaster_type: 'Typhoon',
    damage_level: firstAssessment.body.data.severity_level,
    damage_summary: firstAssessment.body.data.damage_summary,
    applied_subsidies: [selectedProgram],
    requested_amount_php: 5000,
    declared_needs: 'Roofing material',
    status: 'DRAFT'
  }
});
const applicationId = applicationCreate.body.data?.id;
const applicationGet = await request('/api/applications/' + applicationId, {
  cookie: ownerCookie
});
const applicationUpdate = await request('/api/applications/' + applicationId, {
  method: 'PUT',
  cookie: ownerCookie,
  csrfToken: ownerCsrf,
  body: {
    case_id: secondAssessment.body.assessmentId,
    user_id: 'ANOTHER-FORGED-ID',
    applicant_name: 'Updated Workflow Applicant',
    requested_amount_php: 6500,
    applied_subsidies: [selectedProgram],
    status: 'SUBMITTED'
  }
});
const applicationAfterUpdate = await request('/api/applications/' + applicationId, {
  cookie: ownerCookie
});
const savedApplicationRow = db.prepare(
  'SELECT * FROM applications WHERE application_id = ?'
).get(applicationId);

const otherRegistration = await request('/api/auth/register', {
  method: 'POST',
  body: {
    fullName: 'Other User',
    email: 'other-user@example.test',
    password: 'other-user-password'
  }
});
const otherCookie = otherRegistration.setCookie.split(';')[0];
const otherCsrf = otherRegistration.body.csrfToken;
const otherCaseRead = await request('/api/assessments/' + caseId, { cookie: otherCookie });
const otherApplicationRead = await request('/api/applications/' + applicationId, { cookie: otherCookie });
const ownerApplicationBeforeDeniedWrites = db.prepare(
  'SELECT user_id, case_id, applicant_name FROM applications WHERE application_id = ?'
).get(applicationId);
const otherApplicationUpdate = await request('/api/applications/' + applicationId, {
  method: 'PUT',
  cookie: otherCookie,
  csrfToken: otherCsrf,
  body: { applicant_name: 'Unauthorized Update' }
});
const otherApplicationDelete = await request('/api/applications/' + applicationId, {
  method: 'DELETE',
  cookie: otherCookie,
  csrfToken: otherCsrf
});
const ownerApplicationAfterDeniedWrites = db.prepare(
  'SELECT user_id, case_id, applicant_name FROM applications WHERE application_id = ?'
).get(applicationId);

const rowCountsBeforeInvalid = {
  recoveryCases: db.prepare('SELECT COUNT(*) AS count FROM recovery_cases').get().count,
  lossRecords: db.prepare('SELECT COUNT(*) AS count FROM loss_records').get().count,
  recoveryPlans: db.prepare('SELECT COUNT(*) AS count FROM recovery_plans').get().count
};
const invalidAssessment = await request('/api/assessments', {
  method: 'POST',
  cookie: ownerCookie,
  csrfToken: ownerCsrf,
  body: { damageDescription: 42 }
});
const rowCountsAfterInvalid = {
  recoveryCases: db.prepare('SELECT COUNT(*) AS count FROM recovery_cases').get().count,
  lossRecords: db.prepare('SELECT COUNT(*) AS count FROM loss_records').get().count,
  recoveryPlans: db.prepare('SELECT COUNT(*) AS count FROM recovery_plans').get().count
};

db.exec(\`
  CREATE TRIGGER fail_workflow_recovery_plan
  BEFORE INSERT ON recovery_plans
  WHEN EXISTS (SELECT 1 FROM recovery_cases WHERE case_id = NEW.case_id)
    AND EXISTS (SELECT 1 FROM loss_records WHERE case_id = NEW.case_id)
  BEGIN
    SELECT RAISE(ABORT, 'simulated workflow write failure');
  END;
\`);
const rowCountsBeforeFailedWrite = {
  recoveryCases: db.prepare('SELECT COUNT(*) AS count FROM recovery_cases').get().count,
  lossRecords: db.prepare('SELECT COUNT(*) AS count FROM loss_records').get().count,
  recoveryPlans: db.prepare('SELECT COUNT(*) AS count FROM recovery_plans').get().count
};
const failedAssessment = await request('/api/assessments', {
  method: 'POST',
  cookie: ownerCookie,
  csrfToken: ownerCsrf,
  body: {
    disasterType: 'Typhoon',
    damageDescription: 'May sira ang pader matapos ang bagyo.',
    province: 'Workflow Province',
    cityMunicipality: 'Workflow City',
    barangay: 'Workflow Barangay'
  }
});
const rowCountsAfterFailedWrite = {
  recoveryCases: db.prepare('SELECT COUNT(*) AS count FROM recovery_cases').get().count,
  lossRecords: db.prepare('SELECT COUNT(*) AS count FROM loss_records').get().count,
  recoveryPlans: db.prepare('SELECT COUNT(*) AS count FROM recovery_plans').get().count
};

await new Promise((resolve, reject) => {
  server.close((error) => error ? reject(error) : resolve());
});
db.close();

console.log('CORE_WORKFLOW_RESULT:' + JSON.stringify({
  registration,
  authenticatedUser,
  firstAssessment,
  uncertainAssessment,
  caseOwner: caseRow.user_id,
  persistedEligibilitySnapshot: JSON.parse(caseRow.eligibility_results),
  persistedLossCount: persistedLossRecords.length,
  persistedRecoveryPlanCount: persistedRecoveryPlans.length,
  persistedLossCaseIds: [...new Set(persistedLossRecords.map(({ case_id }) => case_id))],
  persistedPlanCaseIds: [...new Set(persistedRecoveryPlans.map(({ case_id }) => case_id))],
  retrievedCase,
  secondAssessment,
  applicationCreate,
  applicationCaseId: applicationCreate.body.data?.case_id,
  applicationGet,
  applicationUpdate,
  applicationAfterUpdate,
  applicationOwner: savedApplicationRow.user_id,
  applicationStoredSubsidies: JSON.parse(savedApplicationRow.applied_subsidies),
  otherCaseRead,
  otherApplicationRead,
  otherApplicationUpdate,
  otherApplicationDelete,
  ownerApplicationBeforeDeniedWrites,
  ownerApplicationAfterDeniedWrites,
  invalidAssessment,
  rowCountsBeforeInvalid,
  rowCountsAfterInvalid,
  failedAssessment,
  rowCountsBeforeFailedWrite,
  rowCountsAfterFailedWrite
}));
`;

function runIsolatedCoreWorkflow() {
  const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), 'core-workflow-'));
  const databasePath = path.join(temporaryDirectory, 'test.sqlite');

  try {
    const result = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', coreWorkflowScript],
      {
        cwd: backendDirectory,
        encoding: 'utf8',
        env: {
          ...process.env,
          DISASTER_RELIEF_DB_PATH: databasePath,
          FRONTEND_ORIGIN: 'http://localhost:3000',
          NODE_ENV: 'development',
          GEMINI_API_KEY: ''
        }
      }
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const resultLine = result.stdout
      .split(String.fromCharCode(10))
      .find((line) => line.startsWith('CORE_WORKFLOW_RESULT:'));
    assert.ok(resultLine, result.stdout || result.stderr);
    return JSON.parse(resultLine.slice('CORE_WORKFLOW_RESULT:'.length));
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

test('authenticated user completes the assessment-to-application workflow over HTTP', () => {
  const result = runIsolatedCoreWorkflow();

  assert.equal(result.registration.status, 201);
  assert.match(result.registration.setCookie, /HttpOnly/i);
  assert.match(result.registration.setCookie, /SameSite=Lax/i);
  assert.equal(result.authenticatedUser.status, 200);
  assert.equal(result.authenticatedUser.body.data.email, 'workflow-owner@example.test');

  assert.equal(result.firstAssessment.status, 200);
  assert.equal(result.caseOwner, result.registration.body.data.id);
  assert.ok(result.firstAssessment.body.data.eligibility_results.length > 0);
  const outcomes = new Set(
    result.firstAssessment.body.data.eligibility_results.map(({ eligibility_outcome }) => eligibility_outcome)
  );
  assert.ok(outcomes.has('potentially_eligible'));
  assert.ok(outcomes.has('not_eligible'));
  assert.ok(result.uncertainAssessment.body.data.eligibility_results
    .some(({ eligibility_outcome }) => eligibility_outcome === 'needs_more_information'));
  assert.deepEqual(
    result.firstAssessment.body.data.eligibility_results,
    result.persistedEligibilitySnapshot
  );
  assert.ok(result.persistedLossCount > 0);
  assert.ok(result.persistedRecoveryPlanCount > 0);
  assert.deepEqual(result.persistedLossCaseIds, [result.firstAssessment.body.assessmentId]);
  assert.deepEqual(result.persistedPlanCaseIds, [result.firstAssessment.body.assessmentId]);
  assert.equal(result.retrievedCase.status, 200);
  assert.deepEqual(
    result.retrievedCase.body.data.eligibility_results,
    result.persistedEligibilitySnapshot
  );
  assert.equal(
    result.retrievedCase.body.data.loss_records.length,
    result.persistedLossCount
  );
  assert.equal(
    result.retrievedCase.body.data.recovery_plans.length,
    result.persistedRecoveryPlanCount
  );

  assert.equal(result.applicationCreate.status, 201);
  assert.equal(result.applicationOwner, result.registration.body.data.id);
  assert.equal(result.applicationCaseId, result.firstAssessment.body.assessmentId);
  assert.deepEqual(result.applicationStoredSubsidies, ['dswd-esa-partial']);
  assert.equal(result.applicationGet.status, 200);
  assert.equal(result.applicationGet.body.data.applicant_name, 'Workflow Applicant');
  assert.deepEqual(result.applicationGet.body.data.applied_subsidies, ['dswd-esa-partial']);
  assert.equal(result.applicationUpdate.status, 200);
  assert.equal(result.applicationAfterUpdate.status, 200);
  assert.equal(
    result.applicationAfterUpdate.body.data.case_id,
    result.secondAssessment.body.assessmentId,
    JSON.stringify({
      updated: result.applicationAfterUpdate.body.data.case_id,
      newCase: result.secondAssessment.body.assessmentId,
      updateResponse: result.applicationUpdate
    })
  );
  assert.equal(
    result.applicationAfterUpdate.body.data.applicant_name,
    'Updated Workflow Applicant'
  );
  assert.equal(result.applicationAfterUpdate.body.data.requested_amount_php, 6500);
  assert.deepEqual(
    result.applicationAfterUpdate.body.data.applied_subsidies,
    ['dswd-esa-partial']
  );
  assert.equal(result.applicationAfterUpdate.body.data.user_id, result.registration.body.data.id);

  assert.equal(result.otherCaseRead.status, 404);
  assert.equal(result.otherApplicationRead.status, 404);
  assert.equal(result.otherApplicationUpdate.status, 404);
  assert.equal(result.otherApplicationDelete.status, 404);
  assert.deepEqual(
    result.ownerApplicationAfterDeniedWrites,
    result.ownerApplicationBeforeDeniedWrites
  );

  assert.equal(result.invalidAssessment.status, 400);
  assert.deepEqual(result.rowCountsAfterInvalid, result.rowCountsBeforeInvalid);
  assert.equal(result.failedAssessment.status, 500);
  assert.equal(result.failedAssessment.body.error, 'Internal assessment error.');
  assert.ok(!JSON.stringify(result.failedAssessment.body).includes('simulated workflow write failure'));
  assert.deepEqual(result.rowCountsAfterFailedWrite, result.rowCountsBeforeFailedWrite);
});
