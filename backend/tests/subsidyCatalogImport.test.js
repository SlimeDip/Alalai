import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import {
  ensureSubsidyCatalogStatusColumn,
  importSubsidyCatalog,
  validateSubsidyCatalog
} from '../services/subsidyImporter.js';

const temporaryDirectories = new Set();
const quietLogger = { error() {} };

function subsidy(id, overrides = {}) {
  return {
    id,
    agency: 'Test Agency',
    title: `Program ${id}`,
    short_description: 'Test program description',
    details: 'Test program details',
    max_amount_php: 1000,
    amount_display: 1000,
    disaster_categories: ['Typhoon'],
    damage_types: ['general'],
    min_severity: 'Low',
    requirements: ['Proof of identity'],
    contact_info: 'Test agency contact',
    application_steps: ['Contact the agency'],
    application_channel: 'Test application channel',
    source_url: 'https://agency.gov/program',
    last_verified_on: '2026-10-16',
    ...overrides
  };
}

async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'alalai-subsidy-import-'));
  temporaryDirectories.add(directory);
  const database = new Database(path.join(directory, 'isolated.sqlite'));
  database.exec(`
    CREATE TABLE subsidies (
      subsidy_id TEXT PRIMARY KEY,
      agency TEXT NOT NULL,
      title TEXT NOT NULL,
      short_description TEXT NOT NULL,
      details TEXT NOT NULL,
      max_amount_php REAL NOT NULL,
      amount_display TEXT NOT NULL,
      disaster_categories TEXT NOT NULL,
      damage_types TEXT NOT NULL,
      min_severity TEXT NOT NULL,
      requirements TEXT NOT NULL,
      contact_info TEXT NOT NULL,
      application_steps TEXT NOT NULL,
      source_url TEXT,
      last_verified_on TEXT
    );
    CREATE TABLE applications (
      application_id TEXT PRIMARY KEY,
      applied_subsidies TEXT NOT NULL
    );
    CREATE TABLE recovery_cases (
      case_id TEXT PRIMARY KEY,
      recommended_subsidies TEXT NOT NULL,
      eligibility_results TEXT
    );
  `);
  return { database, directory };
}

async function writeCatalog(directory, records) {
  const file = path.join(directory, 'subsidies.json');
  await writeFile(file, JSON.stringify(records), 'utf8');
  return file;
}

function insertSubsidy(database, record, catalogStatus = 'CUSTOM') {
  ensureSubsidyCatalogStatusColumn(database);
  database.prepare(`
    INSERT INTO subsidies (
      subsidy_id, agency, title, short_description, details, max_amount_php,
      amount_display, disaster_categories, damage_types, min_severity,
      requirements, contact_info, application_steps, source_url, last_verified_on,
      catalog_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.id,
    record.agency,
    record.title,
    record.short_description,
    record.details,
    record.max_amount_php,
    String(record.amount_display),
    JSON.stringify(record.disaster_categories),
    JSON.stringify(record.damage_types),
    record.min_severity,
    JSON.stringify(record.requirements),
    record.contact_info,
    JSON.stringify(record.application_steps),
    record.source_url,
    record.last_verified_on,
    catalogStatus
  );
}

function catalogRows(database) {
  return database.prepare(`
    SELECT * FROM subsidies ORDER BY subsidy_id
  `).all();
}

afterEach(async () => {
  await Promise.all([...temporaryDirectories].map((directory) => (
    rm(directory, { recursive: true, force: true })
  )));
  temporaryDirectories.clear();
});

test('checked-in subsidy seed passes full catalog validation', () => {
  const seedPath = fileURLToPath(new URL('../data/subsidies.json', import.meta.url));
  const records = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  assert.equal(validateSubsidyCatalog(records).length, 15);
});

test('catalog import inserts new seeds and updates existing seed IDs', async () => {
  const { database, directory } = await fixture();
  try {
    insertSubsidy(database, subsidy('seed-existing', { title: 'Old title' }), 'ACTIVE_SEED');
    const file = await writeCatalog(directory, [
      subsidy('seed-existing', { title: 'Authoritative title' }),
      subsidy('seed-new')
    ]);

    const result = importSubsidyCatalog(database, file, quietLogger);
    assert.equal(result.success, true);
    assert.equal(result.imported, 2);
    assert.equal(database.prepare(`
      SELECT title FROM subsidies WHERE subsidy_id = 'seed-existing'
    `).get().title, 'Authoritative title');
    assert.equal(database.prepare(`
      SELECT catalog_status FROM subsidies WHERE subsidy_id = 'seed-existing'
    `).get().catalog_status, 'ACTIVE_SEED');
    assert.equal(database.prepare(`
      SELECT COUNT(*) AS count FROM subsidies
    `).get().count, 2);
  } finally {
    database.close();
  }
});

test('catalog import preserves custom records and archives removed seed-managed entries', async () => {
  const { database, directory } = await fixture();
  try {
    insertSubsidy(database, subsidy('seed-kept'), 'ACTIVE_SEED');
    insertSubsidy(database, subsidy('seed-removed'), 'ACTIVE_SEED');
    insertSubsidy(database, subsidy('custom-record'), 'CUSTOM');
    const file = await writeCatalog(directory, [subsidy('seed-kept')]);

    const result = importSubsidyCatalog(database, file, quietLogger);
    assert.equal(result.success, true);
    assert.equal(result.archived, 1);
    const rows = catalogRows(database);
    assert.equal(rows.length, 3);
    assert.equal(rows.find((row) => row.subsidy_id === 'custom-record').catalog_status, 'CUSTOM');
    assert.equal(rows.find((row) => row.subsidy_id === 'seed-removed').catalog_status, 'ARCHIVED_SEED');
    assert.equal(rows.find((row) => row.subsidy_id === 'seed-kept').catalog_status, 'ACTIVE_SEED');

    const restoredFile = await writeCatalog(directory, [
      subsidy('seed-kept'),
      subsidy('seed-removed')
    ]);
    importSubsidyCatalog(database, restoredFile, quietLogger);
    assert.equal(database.prepare(`
      SELECT catalog_status FROM subsidies WHERE subsidy_id = 'seed-removed'
    `).get().catalog_status, 'ACTIVE_SEED');
  } finally {
    database.close();
  }
});

test('invalid catalog data leaves all existing rows and schema unchanged', async () => {
  const { database, directory } = await fixture();
  try {
    insertSubsidy(database, subsidy('custom-record'), 'CUSTOM');
    const beforeRows = catalogRows(database);
    const beforeColumns = database.pragma('table_info(subsidies)').map((column) => column.name);
    const file = await writeCatalog(directory, [subsidy('invalid', { source_url: '' })]);

    const result = importSubsidyCatalog(database, file, quietLogger);
    assert.equal(result.success, false);
    assert.deepEqual(catalogRows(database), beforeRows);
    assert.deepEqual(database.pragma('table_info(subsidies)').map((column) => column.name), beforeColumns);
  } finally {
    database.close();
  }
});

test('missing catalog file leaves all existing rows and schema unchanged', async () => {
  const { database, directory } = await fixture();
  try {
    insertSubsidy(database, subsidy('custom-record'), 'CUSTOM');
    const beforeRows = catalogRows(database);
    const beforeColumns = database.pragma('table_info(subsidies)').map((column) => column.name);

    const result = importSubsidyCatalog(database, path.join(directory, 'missing.json'), quietLogger);
    assert.equal(result.success, false);
    assert.deepEqual(catalogRows(database), beforeRows);
    assert.deepEqual(database.pragma('table_info(subsidies)').map((column) => column.name), beforeColumns);
  } finally {
    database.close();
  }
});

test('duplicate seed IDs are rejected without changing catalog data', async () => {
  const { database, directory } = await fixture();
  try {
    insertSubsidy(database, subsidy('custom-record'), 'CUSTOM');
    const beforeRows = catalogRows(database);
    const file = await writeCatalog(directory, [
      subsidy('duplicate-id'),
      subsidy('duplicate-id', { title: 'Duplicate program' })
    ]);

    const result = importSubsidyCatalog(database, file, quietLogger);
    assert.equal(result.success, false);
    assert.deepEqual(catalogRows(database), beforeRows);
  } finally {
    database.close();
  }
});

test('empty seed catalog is rejected without changing existing records', async () => {
  const { database, directory } = await fixture();
  try {
    insertSubsidy(database, subsidy('custom-record'), 'CUSTOM');
    const beforeRows = catalogRows(database);
    const file = await writeCatalog(directory, []);

    const result = importSubsidyCatalog(database, file, quietLogger);
    assert.equal(result.success, false);
    assert.deepEqual(catalogRows(database), beforeRows);
  } finally {
    database.close();
  }
});

test('a failed import rolls back seed updates, inserts, and archive changes', async () => {
  const { database, directory } = await fixture();
  try {
    insertSubsidy(database, subsidy('seed-update', { title: 'Old title' }), 'ACTIVE_SEED');
    insertSubsidy(database, subsidy('seed-remove'), 'ACTIVE_SEED');
    insertSubsidy(database, subsidy('custom-record'), 'CUSTOM');
    const beforeRows = catalogRows(database);
    database.exec(`
      CREATE TRIGGER reject_seed_insert
      BEFORE INSERT ON subsidies
      WHEN NEW.subsidy_id = 'seed-fail'
      BEGIN
        SELECT RAISE(ABORT, 'simulated import failure');
      END;
    `);
    const file = await writeCatalog(directory, [
      subsidy('seed-update', { title: 'New title' }),
      subsidy('seed-fail')
    ]);

    const result = importSubsidyCatalog(database, file, quietLogger);
    assert.equal(result.success, false);
    assert.deepEqual(catalogRows(database), beforeRows);
  } finally {
    database.close();
  }
});

test('repeated imports are idempotent and preserve saved application and eligibility snapshots', async () => {
  const { database, directory } = await fixture();
  try {
    database.prepare(`
      INSERT INTO applications (application_id, applied_subsidies)
      VALUES (?, ?)
    `).run('APP-1', JSON.stringify(['seed-one', 'retired-seed']));
    database.prepare(`
      INSERT INTO recovery_cases (case_id, recommended_subsidies, eligibility_results)
      VALUES (?, ?, ?)
    `).run(
      'CASE-1',
      JSON.stringify([{ subsidy_id: 'seed-one', title: 'Historical recommendation' }]),
      JSON.stringify([{ subsidy_id: 'seed-one', eligibility_outcome: 'needs_more_information' }])
    );
    const file = await writeCatalog(directory, [subsidy('seed-one')]);

    assert.equal(importSubsidyCatalog(database, file, quietLogger).success, true);
    const firstRows = catalogRows(database);
    const firstApplication = database.prepare('SELECT * FROM applications').get();
    const firstCase = database.prepare('SELECT * FROM recovery_cases').get();
    assert.equal(importSubsidyCatalog(database, file, quietLogger).success, true);

    assert.deepEqual(catalogRows(database), firstRows);
    assert.deepEqual(database.prepare('SELECT * FROM applications').get(), firstApplication);
    assert.deepEqual(database.prepare('SELECT * FROM recovery_cases').get(), firstCase);
    assert.deepEqual(JSON.parse(firstApplication.applied_subsidies), ['seed-one', 'retired-seed']);
    assert.deepEqual(JSON.parse(firstCase.eligibility_results), [
      { subsidy_id: 'seed-one', eligibility_outcome: 'needs_more_information' }
    ]);
  } finally {
    database.close();
  }
});
