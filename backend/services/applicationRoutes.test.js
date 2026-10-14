import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendDirectory = fileURLToPath(new URL('..', import.meta.url));

const applicationApiScript = `
import express from 'express';
import { default as db, initDatabase } from './database.js';
import authRouter, { requireAuthenticatedUser } from './routes/auth.js';
import applicationsRouter from './routes/applications.js';

initDatabase();
const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);
app.use('/api/applications', requireAuthenticatedUser, applicationsRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));

const baseUrl = 'http://127.0.0.1:' + server.address().port + '/api/applications';
const authUrl = 'http://127.0.0.1:' + server.address().port + '/api/auth/register';
const registered = await fetch(authUrl, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    fullName: 'Application Test Owner',
    email: 'application-owner@example.test',
    password: 'test-password-long-enough'
  })
});
const registration = await registered.json();
const sessionCookie = registered.headers.get('set-cookie').split(';')[0];
const csrfToken = registration.csrfToken;

async function request(method, body, id = '', cookie = sessionCookie) {
  const response = await fetch(baseUrl + (id ? '/' + id : ''), {
    method,
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
      ...(cookie && csrfToken ? { 'x-csrf-token': csrfToken } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.status, body: await response.json() };
}

const validInput = {
  applicant_name: 'Application Test Applicant',
  applicant_age: '42',
  province: 'Test Province',
  city_municipality: 'Test City',
  barangay: 'Test Barangay',
  household_members_count: '3',
  household_members_detail: [
    { name: 'Test Member', age: '12', relationship: 'Child' }
  ],
  disaster_type: 'Typhoon',
  damage_level: 'Moderate',
  damage_summary: 'Roof damage.',
  applied_subsidies: ['Assistance to Individuals in Crisis Situations (AICS)'],
  estimated_damage_php: '12500.50',
  requested_amount_php: 5000,
  declared_needs: 'Food and roofing materials',
  sworn_attestation: true,
  status: 'DRAFT'
};

const created = await request('POST', validInput);
const createdId = created.body.data?.id;
const invalidPostCases = [
  ['non-object body', []],
  ['string field type', { ...validInput, applicant_name: 42 }],
  ['age below range', { ...validInput, applicant_age: -1 }],
  ['age above range', { ...validInput, applicant_age: 121 }],
  ['fractional age', { ...validInput, applicant_age: 24.5 }],
  ['zero household count', { ...validInput, household_members_count: 0 }],
  ['fractional household count', { ...validInput, household_members_count: 2.5 }],
  ['invalid estimated amount', { ...validInput, estimated_damage_php: 'NaN' }],
  ['negative requested amount', { ...validInput, requested_amount_php: -1 }],
  ['household details not array', { ...validInput, household_members_detail: {} }],
  ['malformed household member', { ...validInput, household_members_detail: [null] }],
  ['invalid household member age', {
    ...validInput,
    household_members_detail: [{ name: 'Member', age: 121, relationship: 'Child' }]
  }],
  ['subsidies not array', { ...validInput, applied_subsidies: 'AICS' }],
  ['malformed subsidy selection', { ...validInput, applied_subsidies: [42] }],
  ['unknown subsidy', { ...validInput, applied_subsidies: ['not-a-program'] }],
  ['unknown status', { ...validInput, status: 'WAITING' }],
  ['review status from ordinary route', { ...validInput, status: 'UNDER_REVIEW' }],
  ['approval status from ordinary route', { ...validInput, status: 'APPROVED' }]
];
const invalidPosts = [];
for (const [label, input] of invalidPostCases) {
  invalidPosts.push({ label, ...await request('POST', input) });
}

const invalidPutCases = [
  ['non-object body', []],
  ['string field type', { applicant_name: {} }],
  ['invalid age', { applicant_age: 'old' }],
  ['invalid household count', { household_members_count: 0 }],
  ['negative amount', { requested_amount_php: -10 }],
  ['malformed household JSON shape', { household_members_detail: { name: 'Member' } }],
  ['unknown subsidy', { applied_subsidies: ['missing-program'] }],
  ['approval status', { status: 'APPROVED' }],
  ['unknown status', { status: 'COMPLETE' }]
];
const invalidPuts = [];
for (const [label, input] of invalidPutCases) {
  invalidPuts.push({ label, ...await request('PUT', input, createdId) });
}
const unauthenticatedListResponse = await fetch(baseUrl);
const unauthenticatedList = {
  status: unauthenticatedListResponse.status,
  body: await unauthenticatedListResponse.json()
};

const updated = await request('PUT', {
  applicant_name: 'Updated Test Applicant',
  applicant_age: '43',
  requested_amount_php: '6000',
  applied_subsidies: ['dswd-aics'],
  status: 'SUBMITTED'
}, createdId);
const stored = db.prepare('SELECT * FROM applications WHERE application_id = ?').get(createdId);
const applicationCount = db.prepare('SELECT COUNT(*) AS count FROM applications').get().count;

await new Promise((resolve, reject) => {
  server.close((error) => error ? reject(error) : resolve());
});
db.close();

console.log('APPLICATION_API_RESULT:' + JSON.stringify({
  created,
  registrationStatus: registered.status,
  registration,
  sessionCookie,
  unauthenticatedList,
  invalidPosts,
  invalidPuts,
  updated,
  stored,
  applicationCount
}));
`;

function runIsolatedApplicationApi() {
  const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), 'application-routes-'));
  const databasePath = path.join(temporaryDirectory, 'test.sqlite');

  try {
    const result = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', applicationApiScript],
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
      .find((line) => line.startsWith('APPLICATION_API_RESULT:'));
    assert.ok(resultLine, result.stdout || result.stderr);
    return JSON.parse(resultLine.slice('APPLICATION_API_RESULT:'.length));
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

test('application routes validate create and update requests against isolated SQLite data', () => {
  const result = runIsolatedApplicationApi();

  assert.equal(result.created.status, 201);
  assert.equal(result.created.body.success, true);
  assert.equal(result.created.body.data.status, 'DRAFT');
  assert.deepEqual(
    result.created.body.data.applied_subsidies,
    ['Assistance to Individuals in Crisis Situations (AICS)']
  );
  assert.equal(result.created.body.data.applicant_age, 42);
  assert.equal(result.created.body.data.household_members_count, 3);
  assert.equal(result.created.body.data.estimated_damage_php, 12500.5);

  for (const invalid of [...result.invalidPosts, ...result.invalidPuts]) {
    assert.equal(invalid.status, 400, `${invalid.label}: ${JSON.stringify(invalid.body)}`);
    assert.equal(invalid.body.success, false, invalid.label);
    assert.equal(typeof invalid.body.error, 'string', invalid.label);
  }

  assert.equal(result.updated.status, 200);
  assert.equal(result.updated.body.success, true);
  assert.equal(result.updated.body.data.applicant_name, 'Updated Test Applicant');
  assert.equal(result.updated.body.data.applicant_age, 43);
  assert.equal(result.updated.body.data.requested_amount_php, 6000);
  assert.deepEqual(result.updated.body.data.applied_subsidies, ['dswd-aics']);
  assert.equal(result.updated.body.data.status, 'SUBMITTED');

  assert.equal(result.stored.applicant_name, 'Updated Test Applicant');
  assert.equal(result.stored.status, 'SUBMITTED');
  assert.equal(result.applicationCount, 1);
});
