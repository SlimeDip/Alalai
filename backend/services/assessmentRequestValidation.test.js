import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendDirectory = fileURLToPath(new URL('..', import.meta.url));

const requestValidationScript = `
import net from 'node:net';

const probe = net.createServer();
await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
process.env.PORT = String(port);

const { server } = await import('./server.js');
const { default: db } = await import('./database.js');
const baseUrl = 'http://127.0.0.1:' + port + '/api/assessments';
const registerResponse = await fetch('http://127.0.0.1:' + port + '/api/auth/register', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    fullName: 'Request Validation User',
    email: 'request-validation@example.test',
    password: 'secure-test-password'
  })
});
const registeredUser = await registerResponse.json();
if (!registerResponse.ok) throw new Error(JSON.stringify(registeredUser));
const sessionCookie = registerResponse.headers.get('set-cookie').split(';')[0];
const csrfToken = registeredUser.csrfToken;

let ready = false;
for (let attempt = 0; attempt < 40 && !ready; attempt += 1) {
  try {
    await fetch('http://127.0.0.1:' + port + '/api/health');
    ready = true;
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
if (!ready) throw new Error('Assessment API did not start.');

async function post(body, raw = false) {
  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: sessionCookie,
      'x-csrf-token': csrfToken
    },
    body: raw ? body : JSON.stringify(body)
  });
  return { status: response.status, body: await response.json() };
}

const invalidDescription = await post({ damageDescription: 42 });
const nullDisaster = await post({ damageDescription: 'Roof damage', disasterType: null });
const invalidHouseholdSize = await post({ damageDescription: 'Roof damage', householdSize: 'many' });
const invalidApplicantName = await post({ damageDescription: 'Roof damage', applicantName: {} });
const forgedUserId = await post({ damageDescription: 'Roof damage', userId: 'OTHER-USER' });
const emptyDescription = await post({ damageDescription: '   ' });
const malformedJson = await post('{"damageDescription":', true);
const countsAfterInvalidRequests = {
  recoveryCases: db.prepare('SELECT COUNT(*) AS count FROM recovery_cases').get().count,
  lossRecords: db.prepare('SELECT COUNT(*) AS count FROM loss_records').get().count,
  recoveryPlans: db.prepare('SELECT COUNT(*) AS count FROM recovery_plans').get().count
};

db.exec(\`
  CREATE TRIGGER reject_assessment_insert
  BEFORE INSERT ON recovery_cases
  BEGIN
    SELECT RAISE(ABORT, 'sensitive simulated database failure');
  END;
\`);
const internalFailure = await post({ damageDescription: 'Roof damage' });
const countsAfterDatabaseFailure = {
  recoveryCases: db.prepare('SELECT COUNT(*) AS count FROM recovery_cases').get().count,
  lossRecords: db.prepare('SELECT COUNT(*) AS count FROM loss_records').get().count,
  recoveryPlans: db.prepare('SELECT COUNT(*) AS count FROM recovery_plans').get().count
};
await new Promise((resolve, reject) => {
  server.close((error) => error ? reject(error) : resolve());
});
db.close();

const output = {
  invalidDescription,
  nullDisaster,
  invalidHouseholdSize,
  invalidApplicantName,
  forgedUserId,
  emptyDescription,
  malformedJson,
  internalFailure,
  countsAfterInvalidRequests,
  countsAfterDatabaseFailure
};
console.log('ASSESSMENT_VALIDATION_RESULT:' + JSON.stringify(output));
`;

function runIsolatedRequestValidation() {
  const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), 'assessment-validation-'));
  const databasePath = path.join(temporaryDirectory, 'test.sqlite');

  try {
    const result = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', requestValidationScript],
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
    const resultLine = result.stdout
      .split(/\r?\n/)
      .find((line) => line.startsWith('ASSESSMENT_VALIDATION_RESULT:'));
    assert.ok(resultLine, result.stdout || result.stderr);
    return JSON.parse(resultLine.slice('ASSESSMENT_VALIDATION_RESULT:'.length));
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

test('assessment API validates request fields and hides internal failure details', () => {
  const result = runIsolatedRequestValidation();

  for (const invalidRequest of [
    result.invalidDescription,
    result.nullDisaster,
    result.invalidHouseholdSize,
    result.invalidApplicantName,
    result.forgedUserId,
    result.emptyDescription,
    result.malformedJson
  ]) {
    assert.equal(invalidRequest.status, 400);
    assert.equal(invalidRequest.body.success, false);
    assert.equal(typeof invalidRequest.body.error, 'string');
  }

  assert.match(result.invalidDescription.body.error, /damageDescription/);
  assert.match(result.nullDisaster.body.error, /Disaster type/);
  assert.match(result.invalidHouseholdSize.body.error, /householdSize/);
  assert.match(result.invalidApplicantName.body.error, /applicantName/);
  assert.match(result.forgedUserId.body.error, /authenticated session/);
  assert.match(result.emptyDescription.body.error, /Damage description/);
  assert.equal(result.malformedJson.body.error, 'Request body must contain valid JSON.');
  assert.deepEqual(result.countsAfterInvalidRequests, {
    recoveryCases: 0,
    lossRecords: 0,
    recoveryPlans: 0
  });

  assert.equal(result.internalFailure.status, 500);
  assert.equal(result.internalFailure.body.success, false);
  assert.equal(result.internalFailure.body.error, 'Internal assessment error.');
  assert.ok(!JSON.stringify(result.internalFailure.body).includes('sensitive simulated database failure'));
  assert.deepEqual(result.countsAfterDatabaseFailure, {
    recoveryCases: 0,
    lossRecords: 0,
    recoveryPlans: 0
  });
});
