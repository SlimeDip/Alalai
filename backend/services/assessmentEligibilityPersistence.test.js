import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendDirectory = fileURLToPath(new URL('..', import.meta.url));

function runIsolatedDatabase(script) {
  const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), 'eligibility-persistence-'));
  const databasePath = path.join(temporaryDirectory, 'test.sqlite');

  try {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: backendDirectory,
      encoding: 'utf8',
      env: {
        ...process.env,
        DISASTER_RELIEF_DB_PATH: databasePath,
        GEMINI_API_KEY: ''
      }
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    return JSON.parse(result.stdout.trim());
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

const migrationScript = `
import Database from 'better-sqlite3';

const legacyDb = new Database(process.env.DISASTER_RELIEF_DB_PATH);
legacyDb.exec(\`
  CREATE TABLE recovery_cases (
    case_id TEXT PRIMARY KEY,
    user_id TEXT,
    applicant_name TEXT,
    contact_number TEXT,
    disaster_type TEXT NOT NULL,
    incident_date TEXT,
    province TEXT NOT NULL,
    city_municipality TEXT NOT NULL,
    barangay TEXT NOT NULL,
    purok_street TEXT,
    severity_level TEXT NOT NULL,
    severity_score INTEGER DEFAULT 0,
    estimated_cost_min REAL DEFAULT 0,
    estimated_cost_max REAL DEFAULT 0,
    damage_categories TEXT NOT NULL DEFAULT '[]',
    recommended_subsidies TEXT NOT NULL DEFAULT '[]',
    safety_precautions TEXT NOT NULL DEFAULT '[]',
    status TEXT DEFAULT 'OPEN',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    closed_at DATETIME
  );
  INSERT INTO recovery_cases (
    case_id, user_id, disaster_type, province, city_municipality, barangay,
    severity_level, applicant_name, recommended_subsidies
  ) VALUES (
    'CASE-EXISTING', 'UNVERIFIED-OWNER', 'Typhoon', 'Test Province', 'Test City', 'Test Barangay',
    'Moderate', 'Existing Applicant', '[{"id":"saved-program"}]'
  );
\`);
legacyDb.close();

const { default: db, initDatabase } = await import('./database.js');
initDatabase();
const columns = db.pragma('table_info(recovery_cases)').map(({ name }) => name);
const applicationColumns = db.pragma('table_info(applications)').map(({ name }) => name);
const row = db.prepare('SELECT * FROM recovery_cases WHERE case_id = ?').get('CASE-EXISTING');
console.log(JSON.stringify({
  eligibilityColumnPresent: columns.includes('eligibility_results'),
  eligibilityColumnNullable: db.pragma('table_info(recovery_cases)')
    .find(({ name }) => name === 'eligibility_results').notnull === 0,
  applicationOwnerColumnPresent: applicationColumns.includes('user_id'),
  preservedApplicant: row.applicant_name,
  legacyCaseOwner: row.user_id,
  preservedRecommendations: JSON.parse(row.recommended_subsidies),
  legacySnapshot: row.eligibility_results
}));
db.close();
`;

const assessmentApiScript = `
import express from 'express';
import { initDatabase, default as db } from './database.js';
import assessmentsRouter from './routes/assessments.js';

initDatabase();
db.prepare('INSERT INTO users (user_id, full_name, email, password_hash) VALUES (?, ?, ?, ?)')
  .run('TEST-USER', 'Persistence Test User', 'persistence@example.test', 'test-hash');
db.prepare('UPDATE subsidies SET disaster_categories = ? WHERE subsidy_id = ?')
  .run('Unsupported Test Disaster', 'dswd-esa-partial');
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  req.user = {
    user_id: 'TEST-USER',
    name: 'Persistence Test User',
    email: 'persistence@example.test'
  };
  next();
});
app.use('/api/assessments', assessmentsRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));

try {
  const address = server.address();
  const baseUrl = 'http://127.0.0.1:' + address.port + '/api/assessments';
  const createdResponse = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      disasterType: 'Typhoon',
      damageDescription: 'Sira ang bubong at may tulo matapos ang bagyo.',
      applicantName: 'Persistence Test Applicant',
      province: 'Test Province',
      cityMunicipality: 'Test City',
      barangay: 'Test Barangay'
    })
  });
  const created = await createdResponse.json();

  db.prepare(\`
    INSERT INTO recovery_cases (
      case_id, user_id, disaster_type, province, city_municipality, barangay,
      severity_level, eligibility_results
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  \`).run('CASE-LEGACY', 'TEST-USER', 'Typhoon', 'Test Province', 'Test City', 'Test Barangay', 'Low', null);
  db.prepare(\`
    INSERT INTO recovery_cases (
      case_id, user_id, disaster_type, province, city_municipality, barangay,
      severity_level, eligibility_results
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  \`).run('CASE-MALFORMED', 'TEST-USER', 'Typhoon', 'Test Province', 'Test City', 'Test Barangay', 'Low', '{invalid');

  const createdId = created.assessmentId;
  const retrievedResponse = await fetch(baseUrl + '/' + createdId);
  const retrieved = await retrievedResponse.json();
  const legacyResponse = await fetch(baseUrl + '/CASE-LEGACY');
  const legacy = await legacyResponse.json();
  const malformedResponse = await fetch(baseUrl + '/CASE-MALFORMED');
  const malformed = await malformedResponse.json();
  const missingResponse = await fetch(baseUrl + '/CASE-DOES-NOT-EXIST');
  const missing = await missingResponse.json();

  db.prepare(\`
    INSERT INTO recovery_cases (
      case_id, user_id, disaster_type, province, city_municipality, barangay,
      severity_level, damage_categories, recommended_subsidies, safety_precautions
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  \`).run(
    'CASE-MALFORMED-DAMAGE',
    'TEST-USER',
    'Typhoon',
    'Test Province',
    'Test City',
    'Test Barangay',
    'Low',
    '{invalid',
    '[{"id":"valid-program"}]',
    '["Wear protective footwear."]'
  );
  const malformedCaseResponse = await fetch(baseUrl + '/CASE-MALFORMED-DAMAGE');
  const malformedCase = await malformedCaseResponse.json();

  db.prepare(\`
    INSERT INTO recovery_cases (
      case_id, user_id, disaster_type, province, city_municipality, barangay,
      severity_level, damage_categories, recommended_subsidies, safety_precautions
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  \`).run(
    'CASE-MALFORMED-RECOMMENDATIONS',
    'TEST-USER',
    'Typhoon',
    'Test Province',
    'Test City',
    'Test Barangay',
    'Low',
    '["Agriculture & Fisheries"]',
    '{invalid',
    '["Store clean water."]'
  );
  const malformedRecommendationsResponse = await fetch(baseUrl + '/CASE-MALFORMED-RECOMMENDATIONS');
  const malformedRecommendations = await malformedRecommendationsResponse.json();

  db.prepare(\`
    INSERT INTO recovery_cases (
      case_id, user_id, disaster_type, province, city_municipality, barangay,
      severity_level, damage_categories, recommended_subsidies, safety_precautions
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  \`).run(
    'CASE-MALFORMED-SAFETY',
    'TEST-USER',
    'Typhoon',
    'Test Province',
    'Test City',
    'Test Barangay',
    'Low',
    '["Structural & Roofing"]',
    '[{"id":"valid-program"}]',
    '{invalid'
  );
  const malformedSafetyResponse = await fetch(baseUrl + '/CASE-MALFORMED-SAFETY');
  const malformedSafety = await malformedSafetyResponse.json();

  db.prepare(\`
    INSERT INTO recovery_cases (
      case_id, user_id, disaster_type, province, city_municipality, barangay,
      severity_level, eligibility_results
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  \`).run(
    'CASE-DEFAULT-JSON',
    'TEST-USER',
    'Typhoon',
    'Test Province',
    'Test City',
    'Test Barangay',
    'Low',
    null
  );
  const defaultJsonResponse = await fetch(baseUrl + '/CASE-DEFAULT-JSON');
  const defaultJson = await defaultJsonResponse.json();
  const listResponse = await fetch(baseUrl);
  const list = await listResponse.json();

  console.log(JSON.stringify({
    createStatus: createdResponse.status,
    retrievalStatus: retrievedResponse.status,
    createdData: created.data,
    retrievedData: retrieved.data,
    createdMatchedSubsidies: created.data?.matched_subsidies,
    savedRecommendedSubsidies: retrieved.data?.recommended_subsidies,
    legacyResults: legacy.data?.eligibility_results,
    malformedStatus: malformedResponse.status,
    malformedResults: malformed.data?.eligibility_results,
    missingStatus: missingResponse.status,
    missingError: missing.error,
    malformedCaseStatus: malformedCaseResponse.status,
    malformedCaseData: malformedCase.data,
    malformedRecommendationsStatus: malformedRecommendationsResponse.status,
    malformedRecommendationsData: malformedRecommendations.data,
    malformedSafetyStatus: malformedSafetyResponse.status,
    malformedSafetyData: malformedSafety.data,
    defaultJsonStatus: defaultJsonResponse.status,
    defaultJsonData: defaultJson.data,
    listStatus: listResponse.status,
    listCaseIds: list.data?.map(({ id }) => id)
  }));
} finally {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  db.close();
}
`;

const rollbackScript = `
import express from 'express';
import { initDatabase, default as db } from './database.js';
import assessmentsRouter from './routes/assessments.js';

initDatabase();
db.prepare('INSERT INTO users (user_id, full_name, email, password_hash) VALUES (?, ?, ?, ?)')
  .run('TEST-USER', 'Rollback Test User', 'rollback@example.test', 'test-hash');
db.exec(\`
  CREATE TRIGGER reject_eligibility_snapshot
  BEFORE INSERT ON recovery_cases
  WHEN NEW.eligibility_results IS NOT NULL
  BEGIN
    SELECT RAISE(ABORT, 'simulated eligibility snapshot persistence failure');
  END;
\`);

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  req.user = { user_id: 'TEST-USER', name: 'Rollback Test User', email: 'rollback@example.test' };
  next();
});
app.use('/api/assessments', assessmentsRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));

try {
  const response = await fetch('http://127.0.0.1:' + server.address().port + '/api/assessments', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      disasterType: 'Typhoon',
      damageDescription: 'May sira ang bubong.',
      province: 'Test Province',
      cityMunicipality: 'Test City',
      barangay: 'Test Barangay'
    })
  });
  const body = await response.json();
  console.log(JSON.stringify({
    status: response.status,
    success: body.success,
    recoveryCases: db.prepare('SELECT COUNT(*) AS count FROM recovery_cases').get().count,
    lossRecords: db.prepare('SELECT COUNT(*) AS count FROM loss_records').get().count,
    recoveryPlans: db.prepare('SELECT COUNT(*) AS count FROM recovery_plans').get().count
  }));
} finally {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  db.close();
}
`;

const laterStageRollbackScript = `
import express from 'express';
import { initDatabase, default as db } from './database.js';
import assessmentsRouter from './routes/assessments.js';

initDatabase();
db.prepare('INSERT INTO users (user_id, full_name, email, password_hash) VALUES (?, ?, ?, ?)')
  .run('TEST-USER', 'Rollback Test User', 'rollback@example.test', 'test-hash');
db.exec(\`
  CREATE TRIGGER reject_recovery_plan_after_case_and_loss
  BEFORE INSERT ON recovery_plans
  WHEN EXISTS (
    SELECT 1 FROM recovery_cases WHERE case_id = NEW.case_id
  ) AND EXISTS (
    SELECT 1 FROM loss_records WHERE case_id = NEW.case_id
  )
  BEGIN
    SELECT RAISE(ABORT, 'simulated recovery plan insert failure after case and loss writes');
  END;
\`);

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  req.user = { user_id: 'TEST-USER', name: 'Rollback Test User', email: 'rollback@example.test' };
  next();
});
app.use('/api/assessments', assessmentsRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));

try {
  const response = await fetch('http://127.0.0.1:' + server.address().port + '/api/assessments', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      disasterType: 'Typhoon',
      damageDescription: 'May sira ang bubong.',
      province: 'Test Province',
      cityMunicipality: 'Test City',
      barangay: 'Test Barangay'
    })
  });
  const body = await response.json();
  console.log(JSON.stringify({
    status: response.status,
    success: body.success,
    error: body.error,
    recoveryCases: db.prepare('SELECT COUNT(*) AS count FROM recovery_cases').get().count,
    lossRecords: db.prepare('SELECT COUNT(*) AS count FROM loss_records').get().count,
    recoveryPlans: db.prepare('SELECT COUNT(*) AS count FROM recovery_plans').get().count
  }));
} finally {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  db.close();
}
`;

test('schema upgrade adds nullable eligibility snapshot without changing existing cases', () => {
  const result = runIsolatedDatabase(migrationScript);

  assert.equal(result.eligibilityColumnPresent, true);
  assert.equal(result.eligibilityColumnNullable, true);
  assert.equal(result.applicationOwnerColumnPresent, true);
  assert.equal(result.preservedApplicant, 'Existing Applicant');
  assert.equal(result.legacyCaseOwner, null);
  assert.deepEqual(result.preservedRecommendations, [{ id: 'saved-program' }]);
  assert.equal(result.legacySnapshot, null);
});

test('assessment creation persists complete results and retrieval handles missing or malformed snapshots', () => {
  const result = runIsolatedDatabase(assessmentApiScript);

  assert.equal(result.createStatus, 200);
  assert.equal(result.retrievalStatus, 200);
  assert.equal(result.createdData.disaster_type, 'Typhoon');
  assert.equal(result.createdData.applicant_name, 'Persistence Test Applicant');
  assert.equal(result.retrievedData.province, 'Test Province');
  assert.equal(result.retrievedData.city_municipality, 'Test City');
  assert.equal(result.retrievedData.barangay, 'Test Barangay');
  assert.equal(result.retrievedData.applicant_name, result.createdData.applicant_name);
  assert.equal(result.retrievedData.raw_description, 'Sira ang bubong at may tulo matapos ang bagyo.');
  assert.ok(result.retrievedData.damage_categories.length > 0);
  assert.ok(result.retrievedData.loss_records.length > 0);
  assert.ok(result.retrievedData.recovery_plans.length > 0);
  assert.deepEqual(result.retrievedData.eligibility_results, result.createdData.eligibility_results);
  assert.ok(result.createdData.eligibility_results.length > 0);
  assert.deepEqual(result.savedRecommendedSubsidies, result.createdMatchedSubsidies);
  assert.ok(result.createdData.eligibility_results.some(
    ({ eligibility_outcome }) => eligibility_outcome === 'not_eligible'
  ));
  assert.ok(result.createdData.eligibility_results.some(
    ({ eligibility_outcome }) => eligibility_outcome === 'needs_more_information'
  ));
  assert.ok(!result.createdMatchedSubsidies.some(({ id }) => id === 'dswd-aics'));
  assert.ok(result.createdMatchedSubsidies.some(({ id }) => id === 'dswd-esa-partial'));
  assert.ok(result.createdData.eligibility_results
    .filter(({ eligibility_outcome }) => eligibility_outcome !== 'not_eligible')
    .every(({ id }) => result.createdMatchedSubsidies.some((program) => program.id === id)));
  assert.ok(result.createdMatchedSubsidies
    .every(({ id }) => result.createdData.eligibility_results
      .some((entry) => entry.id === id && entry.eligibility_outcome !== 'not_eligible')));
  assert.equal(result.legacyResults, null);
  assert.equal(result.malformedStatus, 200);
  assert.equal(result.malformedResults, null);
  assert.equal(result.missingStatus, 404);
  assert.equal(result.missingError, 'Assessment record not found.');
  assert.equal(result.malformedCaseStatus, 200);
  assert.deepEqual(result.malformedCaseData.damage_categories, []);
  assert.deepEqual(result.malformedCaseData.recommended_subsidies, [{ id: 'valid-program' }]);
  assert.deepEqual(result.malformedCaseData.safety_precautions, ['Wear protective footwear.']);
  assert.equal(result.malformedRecommendationsStatus, 200);
  assert.deepEqual(
    result.malformedRecommendationsData.damage_categories,
    ['Agriculture & Fisheries']
  );
  assert.deepEqual(result.malformedRecommendationsData.recommended_subsidies, []);
  assert.deepEqual(result.malformedRecommendationsData.safety_precautions, ['Store clean water.']);
  assert.equal(result.malformedSafetyStatus, 200);
  assert.deepEqual(result.malformedSafetyData.damage_categories, ['Structural & Roofing']);
  assert.deepEqual(result.malformedSafetyData.recommended_subsidies, [{ id: 'valid-program' }]);
  assert.deepEqual(result.malformedSafetyData.safety_precautions, []);
  assert.equal(result.defaultJsonStatus, 200);
  assert.deepEqual(result.defaultJsonData.damage_categories, []);
  assert.deepEqual(result.defaultJsonData.recommended_subsidies, []);
  assert.deepEqual(result.defaultJsonData.safety_precautions, []);
  assert.equal(result.defaultJsonData.eligibility_results, null);
  assert.equal(result.listStatus, 200);
  assert.ok(result.listCaseIds.includes('CASE-MALFORMED-DAMAGE'));
  assert.ok(result.listCaseIds.includes('CASE-MALFORMED-RECOMMENDATIONS'));
  assert.ok(result.listCaseIds.includes('CASE-MALFORMED-SAFETY'));
});

test('assessment transaction rolls back when eligibility snapshot persistence fails', () => {
  const result = runIsolatedDatabase(rollbackScript);

  assert.equal(result.status, 500);
  assert.equal(result.success, false);
  assert.equal(result.recoveryCases, 0);
  assert.equal(result.lossRecords, 0);
  assert.equal(result.recoveryPlans, 0);
});

test('assessment transaction rolls back earlier writes when a recovery-plan insert fails', () => {
  const result = runIsolatedDatabase(laterStageRollbackScript);

  assert.equal(result.status, 500);
  assert.equal(result.success, false);
  assert.equal(result.error, 'Internal assessment error.');
  assert.ok(!result.error.includes('simulated recovery plan insert failure'));
  assert.equal(result.recoveryCases, 0);
  assert.equal(result.lossRecords, 0);
  assert.equal(result.recoveryPlans, 0);
});
