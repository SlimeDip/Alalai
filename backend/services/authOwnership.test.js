import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendDirectory = fileURLToPath(new URL('..', import.meta.url));

const authOwnershipScript = `
import express from 'express';
import { default as db, initDatabase } from './database.js';
import authRouter, { requireAuthenticatedUser } from './routes/auth.js';
import assessmentsRouter from './routes/assessments.js';
import applicationsRouter from './routes/applications.js';

initDatabase();
db.prepare(\`
  INSERT INTO recovery_cases (
    case_id, disaster_type, province, city_municipality, barangay, severity_level
  ) VALUES (?, ?, ?, ?, ?, ?)
\`).run('CASE-UNOWNED', 'Typhoon', 'Old Province', 'Old City', 'Old Barangay', 'Low');
db.prepare(\`
  INSERT INTO applications (
    application_id, reference_number, applicant_name, province,
    city_municipality, barangay, disaster_type, damage_level, damage_summary,
    applied_subsidies, status
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
\`).run(
  'APP-UNOWNED',
  'LEGACY-UNOWNED',
  'Legacy Applicant',
  'Old Province',
  'Old City',
  'Old Barangay',
  'Typhoon',
  'Low',
  'Legacy case',
  '[]',
  'DRAFT'
);

const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);
app.use('/api/assessments', requireAuthenticatedUser, assessmentsRouter);
app.use('/api/applications', requireAuthenticatedUser, applicationsRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const base = 'http://127.0.0.1:' + server.address().port;

const csrfByCookie = new Map();
async function call(path, method = 'GET', body, cookie, csrfTokenOverride) {
  const csrfToken = csrfTokenOverride === undefined
    ? csrfByCookie.get(cookie)
    : csrfTokenOverride;
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(cookie ? { cookie } : {}),
      ...(cookie && csrfToken
        ? { 'x-csrf-token': csrfToken }
        : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return {
    status: response.status,
    body: await response.json(),
    cookie: response.headers.get('set-cookie')?.split(';')[0] || null,
    setCookie: response.headers.get('set-cookie')
  };
}

const registration = await call('/api/auth/register', 'POST', {
  fullName: 'Alice Resident',
  email: 'ALICE@example.test',
  password: 'alice-secure-password'
});
const aliceCookie = registration.cookie;
csrfByCookie.set(aliceCookie, registration.body.csrfToken);
const duplicateRegistration = await call('/api/auth/register', 'POST', {
  fullName: 'Alice Resident',
  email: 'alice@example.test',
  password: 'alice-secure-password'
});
const weakPassword = await call('/api/auth/register', 'POST', {
  fullName: 'Weak Password',
  email: 'weak@example.test',
  password: 'short'
});
const aliceStoredUser = db.prepare('SELECT * FROM users WHERE email = ?').get('alice@example.test');
const aliceCase = await call('/api/assessments', 'POST', {
  disasterType: 'Typhoon',
  damageDescription: 'May sira ang bubong.',
  applicantName: 'Alice Resident',
  province: 'Alice Province',
  cityMunicipality: 'Alice City',
  barangay: 'Alice Barangay'
}, aliceCookie);
const aliceSecondCase = await call('/api/assessments', 'POST', {
  disasterType: 'Flood',
  damageDescription: 'Flood damage to the kitchen.',
  applicantName: 'Alice Resident',
  province: 'Alice Province',
  cityMunicipality: 'Alice City',
  barangay: 'Alice Barangay'
}, aliceCookie);
const aliceCsrf = csrfByCookie.get(aliceCookie);
csrfByCookie.delete(aliceCookie);
const csrfMissingMutation = await call('/api/assessments', 'POST', {
  disasterType: 'Typhoon',
  damageDescription: 'Request without anti-CSRF token.'
}, aliceCookie);
csrfByCookie.set(aliceCookie, aliceCsrf);
const forgedCase = await call('/api/assessments', 'POST', {
  disasterType: 'Typhoon',
  damageDescription: 'Roof damage.',
  userId: 'BOB-USER'
}, aliceCookie);
const aliceCaseId = aliceCase.body.assessmentId;
const aliceApplication = await call('/api/applications', 'POST', {
  case_id: aliceCaseId,
  user_id: 'BOB-USER',
  applicant_name: 'Alice Resident',
  province: 'Alice Province',
  city_municipality: 'Alice City',
  barangay: 'Alice Barangay',
  applied_subsidies: ['dswd-aics']
}, aliceCookie);
const aliceApplicationId = aliceApplication.body.data?.id;
const aliceApplicationOwner = db.prepare(
  'SELECT user_id FROM applications WHERE application_id = ?'
).get(aliceApplicationId);
const csrfInvalidMutation = await call('/api/applications/' + aliceApplicationId, 'PUT', {
  applicant_name: 'Invalid CSRF update'
}, aliceCookie, 'invalid-csrf-token');
const csrfMissingPut = await call('/api/applications/' + aliceApplicationId, 'PUT', {
  applicant_name: 'Missing CSRF update'
}, aliceCookie, null);
const csrfMissingDelete = await call(
  '/api/applications/' + aliceApplicationId,
  'DELETE',
  undefined,
  aliceCookie,
  null
);
const aliceLinksOwnCase = await call('/api/applications/' + aliceApplicationId, 'PUT', {
  case_id: aliceSecondCase.body.assessmentId,
  user_id: 'BOB-USER',
  applicant_name: 'Alice Resident'
}, aliceCookie);
const aliceOwnerReadsApplication = await call(
  '/api/applications/' + aliceApplicationId,
  'GET',
  undefined,
  aliceCookie
);

const bobRegistration = await call('/api/auth/register', 'POST', {
  fullName: 'Bob Resident',
  email: 'bob@example.test',
  password: 'bob-secure-password'
});
const bobCookie = bobRegistration.cookie;
csrfByCookie.set(bobCookie, bobRegistration.body.csrfToken);
const invalidLogin = await call('/api/auth/login', 'POST', {
  email: 'bob@example.test',
  password: 'wrong-password'
});
const bobLogin = await call('/api/auth/login', 'POST', {
  email: 'BOB@example.test',
  password: 'bob-secure-password'
});
const bobLoginCookie = bobLogin.cookie;
csrfByCookie.set(bobLoginCookie, bobLogin.body.csrfToken);
const bobApplication = await call('/api/applications', 'POST', {
  user_id: 'ALICE-USER',
  applicant_name: 'Bob Resident',
  province: 'Bob Province',
  city_municipality: 'Bob City',
  barangay: 'Bob Barangay',
  applied_subsidies: ['dswd-aics']
}, bobCookie);
const bobApplicationId = bobApplication.body.data?.id;
const bobLinksForeignCase = await call('/api/applications/' + bobApplicationId, 'PUT', {
  case_id: aliceCase.body.assessmentId,
  user_id: 'ALICE-USER'
}, bobCookie);
const bobApplicationAfterForeignLinkAttempt = db.prepare(
  'SELECT user_id, case_id FROM applications WHERE application_id = ?'
).get(bobApplicationId);

const unauthenticatedCaseList = await call('/api/assessments');
const unauthenticatedApplicationList = await call('/api/applications');
const aliceCaseList = await call('/api/assessments', 'GET', undefined, aliceCookie);
const bobCaseList = await call('/api/assessments', 'GET', undefined, bobCookie);
const aliceAppList = await call('/api/applications', 'GET', undefined, aliceCookie);
const bobAppList = await call('/api/applications', 'GET', undefined, bobCookie);
const bobReadsAliceCase = await call('/api/assessments/' + aliceCaseId, 'GET', undefined, bobCookie);
const bobReadsAliceApplication = await call('/api/applications/' + aliceApplicationId, 'GET', undefined, bobCookie);
const aliceOwnerApplicationBeforeDelete = db.prepare(
  'SELECT user_id, applicant_name, case_id FROM applications WHERE application_id = ?'
).get(aliceApplicationId);
const bobUpdatesAliceApplication = await call('/api/applications/' + aliceApplicationId, 'PUT', {
  applicant_name: 'Hijacked'
}, bobCookie);
const bobDeletesAliceApplication = await call('/api/applications/' + aliceApplicationId, 'DELETE', undefined, bobCookie);
const aliceOwnerApplicationAfterDeniedRequests = db.prepare(
  'SELECT user_id, applicant_name, case_id FROM applications WHERE application_id = ?'
).get(aliceApplicationId);
const aliceDeletesOwnApplication = await call(
  '/api/applications/' + aliceApplicationId,
  'DELETE',
  undefined,
  aliceCookie
);
const aliceReadsDeletedApplication = await call(
  '/api/applications/' + aliceApplicationId,
  'GET',
  undefined,
  aliceCookie
);
const bobLinksAliceCase = await call('/api/applications', 'POST', {
  case_id: aliceCaseId,
  applicant_name: 'Bob Resident',
  province: 'Bob Province',
  city_municipality: 'Bob City',
  barangay: 'Bob Barangay'
}, bobCookie);
const aliceReadsUnownedCase = await call('/api/assessments/CASE-UNOWNED', 'GET', undefined, aliceCookie);
const aliceReadsUnownedApplication = await call('/api/applications/APP-UNOWNED', 'GET', undefined, aliceCookie);
const aliceMe = await call('/api/auth/me', 'GET', undefined, aliceCookie);
const alteredCookie = aliceCookie.replace(/.$/, aliceCookie.endsWith('A') ? 'B' : 'A');
const alteredSession = await call('/api/auth/me', 'GET', undefined, alteredCookie);
const unknownSession = await call(
  '/api/auth/me',
  'GET',
  undefined,
  'tulong_bayan_session=unknown-session-token'
);
db.prepare('UPDATE auth_sessions SET expires_at = ? WHERE user_id = ?').run(
  '2000-01-01 00:00:00',
  registration.body.data.id
);
const expiredSession = await call('/api/auth/me', 'GET', undefined, aliceCookie);
const logout = await call('/api/auth/logout', 'POST', {}, bobLoginCookie);
const bobAfterLogout = await call('/api/auth/me', 'GET', undefined, bobLoginCookie);

const aliceCaseOwner = db.prepare('SELECT user_id FROM recovery_cases WHERE case_id = ?').get(aliceCaseId);
const sessionCount = db.prepare('SELECT COUNT(*) AS count FROM auth_sessions').get().count;

await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
db.close();

console.log('AUTH_OWNERSHIP_RESULT:' + JSON.stringify({
  registration,
  duplicateRegistration,
  weakPassword,
  passwordHash: aliceStoredUser.password_hash,
  aliceCase,
  aliceSecondCase,
  csrfMissingMutation,
  csrfInvalidMutation,
  csrfMissingPut,
  csrfMissingDelete,
  forgedCase,
  aliceApplication,
  aliceLinksOwnCase,
  aliceOwnerReadsApplication,
  bobRegistration,
  invalidLogin,
  bobLogin,
  bobApplication,
  bobLinksForeignCase,
  bobApplicationAfterForeignLinkAttempt,
  unauthenticatedCaseList,
  unauthenticatedApplicationList,
  aliceCaseList,
  bobCaseList,
  aliceAppList,
  bobAppList,
  bobReadsAliceCase,
  bobReadsAliceApplication,
  aliceOwnerApplicationBeforeDelete,
  aliceOwnerApplicationAfterDeniedRequests,
  bobUpdatesAliceApplication,
  bobDeletesAliceApplication,
  aliceDeletesOwnApplication,
  aliceReadsDeletedApplication,
  bobLinksAliceCase,
  aliceReadsUnownedCase,
  aliceReadsUnownedApplication,
  aliceMe,
  alteredSession,
  unknownSession,
  expiredSession,
  logout,
  bobAfterLogout,
  aliceCaseOwner,
  aliceApplicationOwner,
  sessionCount
}));
`;

function runIsolatedAuthOwnership() {
  const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), 'auth-ownership-'));
  const databasePath = path.join(temporaryDirectory, 'test.sqlite');

  try {
    const result = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', authOwnershipScript],
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
      .find((line) => line.startsWith('AUTH_OWNERSHIP_RESULT:'));
    assert.ok(resultLine, result.stdout || result.stderr);
    return JSON.parse(resultLine.slice('AUTH_OWNERSHIP_RESULT:'.length));
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

test('server authentication and ownership protect recovery cases and applications', () => {
  const result = runIsolatedAuthOwnership();

  assert.equal(result.registration.status, 201);
  assert.equal(result.registration.body.data.name, 'Alice Resident');
  assert.equal(result.registration.body.data.email, 'alice@example.test');
  assert.ok(!JSON.stringify(result.registration.body).includes('password'));
  assert.ok(!result.passwordHash.includes('alice-secure-password'));
  assert.match(result.passwordHash, /^scrypt\$/);
  assert.equal(result.duplicateRegistration.status, 409);
  assert.equal(result.weakPassword.status, 400);
  assert.equal(result.aliceCase.status, 200);
  assert.equal(result.csrfMissingMutation.status, 403);
  assert.equal(result.csrfInvalidMutation.status, 403);
  assert.equal(result.csrfMissingPut.status, 403);
  assert.equal(result.csrfMissingDelete.status, 403);
  assert.equal(result.aliceCaseOwner.user_id, result.registration.body.data.id);
  assert.equal(result.forgedCase.status, 400);
  assert.equal(result.aliceApplication.status, 201);
  assert.equal(result.aliceApplicationOwner.user_id, result.registration.body.data.id);
  assert.equal(result.aliceLinksOwnCase.status, 200);
  assert.equal(result.aliceLinksOwnCase.body.data.case_id, result.aliceSecondCase.body.assessmentId);
  assert.equal(result.aliceLinksOwnCase.body.data.user_id, result.registration.body.data.id);
  assert.equal(result.aliceOwnerReadsApplication.status, 200);
  assert.equal(result.bobRegistration.status, 201);
  assert.equal(result.bobApplication.status, 201);
  assert.equal(result.bobLinksForeignCase.status, 400);
  assert.equal(
    result.bobApplicationAfterForeignLinkAttempt.user_id,
    result.bobRegistration.body.data.id
  );
  assert.equal(result.bobApplicationAfterForeignLinkAttempt.case_id, null);
  assert.equal(result.invalidLogin.status, 401);
  assert.equal(result.bobLogin.status, 200);
  assert.match(result.registration.cookie, /^tulong_bayan_session=/);
  assert.match(result.registration.setCookie, /HttpOnly/);
  assert.match(result.registration.setCookie, /SameSite=Lax/);

  assert.equal(result.unauthenticatedCaseList.status, 401);
  assert.equal(result.unauthenticatedApplicationList.status, 401);
  assert.deepEqual(
    result.aliceCaseList.body.data.map(({ id }) => id).sort(),
    [result.aliceCase.body.assessmentId, result.aliceSecondCase.body.assessmentId].sort()
  );
  assert.equal(result.aliceCaseList.body.count, 2);
  assert.equal(result.bobCaseList.body.count, 0);
  assert.equal(result.aliceAppList.body.count, 1);
  assert.equal(result.bobAppList.body.count, 1);
  assert.equal(result.bobAppList.body.data[0].id, result.bobApplication.body.data.id);
  assert.equal(result.bobReadsAliceCase.status, 404);
  assert.equal(result.bobReadsAliceApplication.status, 404);
  assert.deepEqual(
    result.aliceOwnerApplicationAfterDeniedRequests,
    result.aliceOwnerApplicationBeforeDelete
  );
  assert.equal(result.aliceOwnerApplicationBeforeDelete.applicant_name, 'Alice Resident');
  assert.equal(result.aliceOwnerApplicationAfterDeniedRequests.applicant_name, 'Alice Resident');
  assert.equal(
    result.aliceOwnerApplicationAfterDeniedRequests.user_id,
    result.registration.body.data.id
  );
  assert.equal(result.aliceDeletesOwnApplication.status, 200);
  assert.equal(result.aliceReadsDeletedApplication.status, 404);
  assert.equal(result.bobUpdatesAliceApplication.status, 404);
  assert.equal(result.bobDeletesAliceApplication.status, 404);
  assert.equal(result.bobLinksAliceCase.status, 400);
  assert.equal(result.aliceReadsUnownedCase.status, 404);
  assert.equal(result.aliceReadsUnownedApplication.status, 404);
  assert.equal(result.aliceMe.body.data.id, result.registration.body.data.id);
  assert.equal(result.alteredSession.status, 401);
  assert.equal(result.unknownSession.status, 401);
  assert.equal(result.expiredSession.status, 401);
  assert.equal(result.logout.status, 200);
  assert.match(result.logout.setCookie, /HttpOnly/);
  assert.match(result.logout.setCookie, /SameSite=Lax/);
  assert.match(result.logout.setCookie, /Path=\//);
  assert.match(result.logout.setCookie, /Max-Age=0/);
  assert.equal(result.logout.cookie, 'tulong_bayan_session=');
  assert.equal(result.bobAfterLogout.status, 401);
  assert.equal(result.sessionCount, 2);
});
