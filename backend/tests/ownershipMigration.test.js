import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import Database from 'better-sqlite3';

const backendDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const initializeScript = "import { initDatabase } from './database.js'; initDatabase();";

function runInitialization(databasePath) {
  return spawnSync(process.execPath, ['--input-type=module', '-e', initializeScript], {
    cwd: backendDirectory,
    env: {
      ...process.env,
      DISASTER_RELIEF_DB_PATH: databasePath
    },
    encoding: 'utf8'
  });
}

async function createFixture({ markerV1 = true, failVersion2Insert = false } = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'alalai-ownership-migration-'));
  const databasePath = path.join(directory, 'isolated.sqlite');
  const initialized = runInitialization(databasePath);
  assert.equal(initialized.status, 0, initialized.stderr || initialized.stdout);

  const database = new Database(databasePath);
  database.pragma('foreign_keys = OFF');
  database.prepare('DELETE FROM auth_ownership_migrations WHERE version = 2').run();
  if (markerV1) {
    database.prepare(`
      INSERT OR IGNORE INTO auth_ownership_migrations (version) VALUES (1)
    `).run();
  } else {
    database.prepare('DELETE FROM auth_ownership_migrations WHERE version = 1').run();
  }

  database.prepare(`
    INSERT INTO users (user_id, full_name, email, password_hash)
    VALUES (?, ?, ?, ?)
  `).run('USER-1', 'Test User One', 'one@example.test', 'test-hash');
  database.prepare(`
    INSERT INTO users (user_id, full_name, email, password_hash)
    VALUES (?, ?, ?, ?)
  `).run('USER-2', 'Test User Two', 'two@example.test', 'test-hash');

  const insertCase = database.prepare(`
    INSERT INTO recovery_cases (
      case_id, user_id, disaster_type, province, city_municipality, barangay,
      severity_level
    ) VALUES (?, ?, 'Typhoon', 'Leyte', 'Tacloban', 'Barangay 1', 'Moderate')
  `);
  insertCase.run('CASE-OWNED', 'USER-1');
  insertCase.run('CASE-NULL', null);
  insertCase.run('CASE-DANGLING', 'USER-MISSING');
  insertCase.run('CASE-OTHER-OWNER', 'USER-2');

  const insertApplication = database.prepare(`
    INSERT INTO applications (
      application_id, case_id, user_id, reference_number, applicant_name,
      province, city_municipality, barangay, disaster_type, damage_level,
      damage_summary, applied_subsidies
    ) VALUES (?, ?, ?, ?, 'Test Applicant', 'Leyte', 'Tacloban', 'Barangay 1',
      'Typhoon', 'Moderate', 'Test damage', '[]')
  `);
  insertApplication.run('APP-OWNED', 'CASE-OWNED', 'USER-1', 'REF-OWNED');
  insertApplication.run('APP-NULL', 'CASE-OWNED', null, 'REF-NULL');
  insertApplication.run('APP-DANGLING', 'CASE-OWNED', 'USER-MISSING', 'REF-DANGLING');
  insertApplication.run('APP-OWNED-CASE-NULL', 'CASE-NULL', 'USER-1', 'REF-CASE-NULL');
  insertApplication.run('APP-MISMATCH', 'CASE-OTHER-OWNER', 'USER-1', 'REF-MISMATCH');

  if (failVersion2Insert) {
    database.exec(`
      CREATE TRIGGER fail_ownership_v2_marker
      BEFORE INSERT ON auth_ownership_migrations
      WHEN NEW.version = 2
      BEGIN
        SELECT RAISE(ABORT, 'simulated ownership migration failure');
      END;
    `);
  }
  database.close();
  return { directory, databasePath };
}

async function withFixture(options, callback) {
  const fixture = await createFixture(options);
  try {
    await callback(fixture);
  } finally {
    await rm(fixture.directory, { recursive: true, force: true });
  }
}

function readOwnershipState(databasePath) {
  const database = new Database(databasePath, { readonly: true });
  const result = {
    migrationVersions: database.prepare(`
      SELECT version FROM auth_ownership_migrations ORDER BY version
    `).all().map(({ version }) => version),
    cases: database.prepare(`
      SELECT case_id, user_id FROM recovery_cases ORDER BY case_id
    `).all(),
    applications: database.prepare(`
      SELECT application_id, case_id, user_id FROM applications ORDER BY application_id
    `).all(),
    foreignKeyViolations: database.pragma('foreign_key_check').length
  };
  database.close();
  return result;
}

test('ownership migration v2 preserves valid and NULL owners and repairs only dangling owners', async () => {
  await withFixture({}, ({ databasePath }) => {
    const initialized = runInitialization(databasePath);
    assert.equal(initialized.status, 0, initialized.stderr || initialized.stdout);

    const state = readOwnershipState(databasePath);
    assert.deepEqual(state.migrationVersions, [1, 2]);
    assert.equal(state.cases.find((row) => row.case_id === 'CASE-OWNED').user_id, 'USER-1');
    assert.equal(state.cases.find((row) => row.case_id === 'CASE-NULL').user_id, null);
    assert.equal(state.cases.find((row) => row.case_id === 'CASE-DANGLING').user_id, null);
    assert.equal(state.applications.find((row) => row.application_id === 'APP-OWNED').user_id, 'USER-1');
    assert.equal(state.applications.find((row) => row.application_id === 'APP-NULL').user_id, null);
    assert.equal(state.applications.find((row) => row.application_id === 'APP-DANGLING').user_id, null);
    assert.equal(state.foreignKeyViolations, 0);
  });
});

test('ownership migration v2 does not infer owners and reports but preserves mismatched links', async () => {
  await withFixture({}, ({ databasePath }) => {
    const initialized = runInitialization(databasePath);
    assert.equal(initialized.status, 0, initialized.stderr || initialized.stdout);
    assert.match(initialized.stderr, /1 application\/case pair\(s\) with different owners/);
    assert.match(initialized.stderr, /3 pair\(s\) with one owner missing/);

    const state = readOwnershipState(databasePath);
    const appWithoutOwner = state.applications.find((row) => row.application_id === 'APP-NULL');
    assert.equal(appWithoutOwner.user_id, null);
    assert.equal(appWithoutOwner.case_id, 'CASE-OWNED');
    const applicationWithOwnerlessCase = state.applications.find(
      (row) => row.application_id === 'APP-OWNED-CASE-NULL'
    );
    assert.equal(applicationWithOwnerlessCase.user_id, 'USER-1');
    assert.equal(applicationWithOwnerlessCase.case_id, 'CASE-NULL');

    const mismatch = state.applications.find((row) => row.application_id === 'APP-MISMATCH');
    assert.equal(mismatch.user_id, 'USER-1');
    assert.equal(mismatch.case_id, 'CASE-OTHER-OWNER');
    assert.equal(state.cases.find((row) => row.case_id === 'CASE-OTHER-OWNER').user_id, 'USER-2');
  });
});

test('ownership migration v2 is idempotent and preserves the existing v1 marker', async () => {
  await withFixture({}, ({ databasePath }) => {
    const firstRun = runInitialization(databasePath);
    assert.equal(firstRun.status, 0, firstRun.stderr || firstRun.stdout);
    const firstState = readOwnershipState(databasePath);

    const secondRun = runInitialization(databasePath);
    assert.equal(secondRun.status, 0, secondRun.stderr || secondRun.stdout);
    const secondState = readOwnershipState(databasePath);

    assert.deepEqual(secondState, firstState);
    assert.deepEqual(secondState.migrationVersions, [1, 2]);
  });
});

test('databases without a v1 marker do not run the former blanket ownership reset', async () => {
  await withFixture({ markerV1: false }, ({ databasePath }) => {
    const initialized = runInitialization(databasePath);
    assert.equal(initialized.status, 0, initialized.stderr || initialized.stdout);
    const state = readOwnershipState(databasePath);
    assert.deepEqual(state.migrationVersions, [2]);
    assert.equal(state.cases.find((row) => row.case_id === 'CASE-OWNED').user_id, 'USER-1');
    assert.equal(state.applications.find((row) => row.application_id === 'APP-OWNED').user_id, 'USER-1');
  });
});

test('ownership repairs and migration marker roll back together on failure', async () => {
  await withFixture({ failVersion2Insert: true }, ({ databasePath }) => {
    const failedRun = runInitialization(databasePath);
    assert.notEqual(failedRun.status, 0);
    assert.match(failedRun.stderr, /simulated ownership migration failure/);

    const state = readOwnershipState(databasePath);
    assert.deepEqual(state.migrationVersions, [1]);
    assert.equal(
      state.cases.find((row) => row.case_id === 'CASE-DANGLING').user_id,
      'USER-MISSING'
    );
    assert.equal(
      state.applications.find((row) => row.application_id === 'APP-DANGLING').user_id,
      'USER-MISSING'
    );
  });
});
