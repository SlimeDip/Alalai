import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { recoverDocumentOperations } from '../services/documentLifecycle.js';
import { createPrivateDocumentStorage } from '../services/privateDocuments.js';
import { ensureLifecycleLockDatabase } from '../services/documentLifecycleLock.js';

const operationId = '123e4567-e89b-12d3-a456-426614174000';
const documentId = 'DOC-123e4567-e89b-12d3-a456-426614174000';
const storedName = `${documentId}.pdf`;
const userId = 'USER-RECOVERY';

let temporaryDirectory;
let storageDirectory;
let database;
let storage;

const document = {
  document_id: documentId,
  user_id: userId,
  case_id: 'CASE-RECOVERY',
  application_id: null,
  original_filename: 'recovery-test.pdf',
  stored_name: storedName,
  media_type: 'application/pdf',
  file_size: 12,
  category: 'OTHER',
  description: '',
  uploaded_at: '2026-11-10 00:00:00'
};

function insertDocument() {
  database.prepare(`
    INSERT INTO recovery_documents (
      document_id, user_id, case_id, application_id, original_filename,
      stored_name, media_type, file_size, category, description, uploaded_at
    ) VALUES (
      @document_id, @user_id, @case_id, @application_id, @original_filename,
      @stored_name, @media_type, @file_size, @category, @description, @uploaded_at
    )
  `).run(document);
}

function insertOperation({
  type,
  state,
  operation = operationId,
  item = document,
  fileIdentity = null,
  tombstoneName = type === 'DELETE' ? `TOMB-${operation}.bin` : null
}) {
  database.prepare(`
    INSERT INTO document_lifecycle_operations (
      operation_id, operation_type, state, document_id, user_id, case_id,
      application_id, stored_name, tombstone_name, document_json,
      file_device, file_inode
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    operation,
    type,
    state,
    item.document_id,
    item.user_id,
    item.case_id,
    item.application_id,
    item.stored_name,
    tombstoneName,
    JSON.stringify(item),
    fileIdentity?.device ?? null,
    fileIdentity?.inode ?? null
  );
}

function run(dryRun = false, storageOverride = storage) {
  return recoverDocumentOperations({ db: database, storage: storageOverride, dryRun });
}

function operationCount() {
  return database.prepare('SELECT COUNT(*) AS count FROM document_lifecycle_operations').get().count;
}

function documentCount() {
  return database.prepare('SELECT COUNT(*) AS count FROM recovery_documents').get().count;
}

function assertNoChangesOnSecondRecovery() {
  const second = run();
  assert.equal(second.operations.length, 0);
  assert.equal(documentCount(), 0);
  assert.equal(operationCount(), 0);
}

beforeEach(async () => {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'alalai-document-recovery-'));
  storageDirectory = path.join(temporaryDirectory, 'private-documents');
  fs.mkdirSync(storageDirectory);
  ensureLifecycleLockDatabase(storageDirectory);
  storage = createPrivateDocumentStorage({ root: storageDirectory });
  database = new Database(path.join(temporaryDirectory, 'isolated.sqlite'));
  database.exec(`
    CREATE TABLE recovery_documents (
      document_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      case_id TEXT NOT NULL,
      application_id TEXT,
      original_filename TEXT NOT NULL,
      stored_name TEXT NOT NULL UNIQUE,
      media_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      uploaded_at TEXT NOT NULL
    );
    CREATE TABLE recovery_document_cleanup (
      document_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      tombstone_name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE document_lifecycle_operations (
      operation_id TEXT PRIMARY KEY,
      operation_type TEXT NOT NULL,
      state TEXT NOT NULL,
      document_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      case_id TEXT NOT NULL,
      application_id TEXT,
      stored_name TEXT NOT NULL,
      tombstone_name TEXT,
      document_json TEXT NOT NULL,
      file_device TEXT,
      file_inode TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (operation_type, document_id)
    );
  `);
});

afterEach(async () => {
  database?.close();
  await rm(temporaryDirectory, { recursive: true, force: true });
});

test('dry run reports deletion requested before file movement without changing state', () => {
  insertDocument();
  fs.writeFileSync(storage.documentPath(storedName), 'document');
  insertOperation({ type: 'DELETE', state: 'DELETE_REQUESTED' });
  const preview = run(true);
  assert.equal(preview.operations[0].action, 'link_original_and_finish_deletion');
  assert.equal(documentCount(), 1);
  assert.equal(operationCount(), 1);
  assert.equal(fs.existsSync(storage.documentPath(storedName)), true);
  assert.equal(fs.existsSync(storage.tombstonePath(operationId)), false);
});

test('recovery resumes deletion when cleanup record exists but hard link was not created', () => {
  insertDocument();
  fs.writeFileSync(storage.documentPath(storedName), 'document');
  insertOperation({ type: 'DELETE', state: 'DELETE_REQUESTED' });
  const first = run();
  assert.equal(first.operations[0].status, 'recovered');
  assert.equal(documentCount(), 0);
  assert.equal(operationCount(), 0);
  assert.equal(fs.existsSync(storage.documentPath(storedName)), false);
  assert.equal(fs.existsSync(storage.tombstonePath(operationId)), false);
  assertNoChangesOnSecondRecovery();
});

test('recovery resumes deletion after hard link creation but before database finalization', () => {
  insertDocument();
  fs.writeFileSync(storage.documentPath(storedName), 'document');
  fs.linkSync(storage.documentPath(storedName), storage.tombstonePath(operationId));
  const identity = storage.fileIdentity(storage.tombstonePath(operationId));
  insertOperation({
    type: 'DELETE',
    state: 'DELETE_TOMBSTONE_LINKED',
    fileIdentity: identity
  });
  const first = run();
  assert.equal(first.operations[0].status, 'recovered');
  assert.equal(documentCount(), 0);
  assert.equal(operationCount(), 0);
  assert.equal(fs.existsSync(storage.documentPath(storedName)), false);
  assert.equal(fs.existsSync(storage.tombstonePath(operationId)), false);
  assertNoChangesOnSecondRecovery();
});

test('recovery records link identity before resuming after a crash between link and state update', () => {
  insertDocument();
  fs.writeFileSync(storage.documentPath(storedName), 'document');
  fs.linkSync(storage.documentPath(storedName), storage.tombstonePath(operationId));
  insertOperation({ type: 'DELETE', state: 'DELETE_REQUESTED' });
  const first = run();
  assert.equal(first.operations[0].status, 'recovered');
  assert.equal(documentCount(), 0);
  assert.equal(operationCount(), 0);
  assert.equal(fs.existsSync(storage.documentPath(storedName)), false);
  assert.equal(fs.existsSync(storage.tombstonePath(operationId)), false);
  assertNoChangesOnSecondRecovery();
});

test('recovery preserves ambiguous deletion when both file names are missing', () => {
  insertDocument();
  insertOperation({
    type: 'DELETE',
    state: 'DELETE_ORIGINAL_REMOVED',
    fileIdentity: { device: '1', inode: '2' }
  });
  const first = run();
  assert.equal(first.operations[0].status, 'manual_review');
  assert.equal(first.operations[0].action, 'preserve_metadata_missing_both_files');
  assert.equal(documentCount(), 1);
  assert.equal(operationCount(), 1);
  const second = run();
  assert.equal(second.operations[0].status, 'manual_review');
  assert.equal(documentCount(), 1);
  assert.equal(operationCount(), 1);
});

test('recovery skips tombstone collision without deleting either file', () => {
  insertDocument();
  fs.writeFileSync(storage.documentPath(storedName), 'original');
  fs.writeFileSync(storage.tombstonePath(operationId), 'unrelated collision');
  insertOperation({ type: 'DELETE', state: 'DELETE_REQUESTED' });
  const first = run();
  assert.equal(first.operations[0].action, 'preserve_tombstone_collision');
  assert.equal(documentCount(), 1);
  assert.equal(operationCount(), 1);
  assert.equal(fs.readFileSync(storage.documentPath(storedName), 'utf8'), 'original');
  assert.equal(fs.readFileSync(storage.tombstonePath(operationId), 'utf8'), 'unrelated collision');
  const second = run();
  assert.equal(second.operations[0].action, 'preserve_tombstone_collision');
});

test('filesystem hard-link creation fails on an existing destination without overwriting it', () => {
  const source = storage.documentPath(storedName);
  const destination = storage.tombstonePath(operationId);
  fs.writeFileSync(source, 'original content');
  fs.writeFileSync(destination, 'existing destination');
  assert.throws(() => storage.link(source, destination), { code: 'EEXIST' });
  assert.equal(fs.readFileSync(source, 'utf8'), 'original content');
  assert.equal(fs.readFileSync(destination, 'utf8'), 'existing destination');
});

test('generated document and tombstone paths reject traversal input', () => {
  assert.throws(() => storage.documentPath('../outside.pdf'), TypeError);
  assert.throws(() => storage.tombstonePath('../outside'), TypeError);
});

test('recovery skips tombstone without a recorded identity when the original is gone', () => {
  insertDocument();
  fs.writeFileSync(storage.tombstonePath(operationId), 'unknown tombstone');
  insertOperation({ type: 'DELETE', state: 'DELETE_TOMBSTONE_LINKED' });
  const first = run();
  assert.equal(first.operations[0].action, 'preserve_unidentified_tombstone');
  assert.equal(documentCount(), 1);
  assert.equal(operationCount(), 1);
  assert.equal(fs.existsSync(storage.tombstonePath(operationId)), true);
  const second = run();
  assert.equal(second.operations[0].action, 'preserve_unidentified_tombstone');
  assert.equal(operationCount(), 1);
});

test('recovery treats absent pending-upload file as safely finalized', () => {
  insertOperation({ type: 'UPLOAD', state: 'UPLOAD_PENDING' });
  const first = run();
  assert.equal(first.operations[0].action, 'finalize_upload_without_file');
  assert.equal(documentCount(), 0);
  assert.equal(operationCount(), 0);
  assertNoChangesOnSecondRecovery();
});

test('recovery removes a partial upload only when its saved file identity matches', () => {
  fs.writeFileSync(storage.documentPath(storedName), 'partial bytes');
  const identity = storage.fileIdentity(storage.documentPath(storedName));
  insertOperation({ type: 'UPLOAD', state: 'UPLOAD_PENDING', fileIdentity: identity });
  const first = run();
  assert.equal(first.operations[0].action, 'remove_abandoned_upload_file');
  assert.equal(documentCount(), 0);
  assert.equal(operationCount(), 0);
  assert.equal(fs.existsSync(storage.documentPath(storedName)), false);
  assertNoChangesOnSecondRecovery();
});

test('recovery removes a complete upload whose metadata transaction did not finish', () => {
  fs.writeFileSync(storage.documentPath(storedName), 'complete bytes');
  const identity = storage.fileIdentity(storage.documentPath(storedName));
  insertOperation({ type: 'UPLOAD', state: 'UPLOAD_FILE_WRITTEN', fileIdentity: identity });
  const first = run();
  assert.equal(first.operations[0].action, 'remove_abandoned_upload_file');
  assert.equal(documentCount(), 0);
  assert.equal(operationCount(), 0);
  assert.equal(fs.existsSync(storage.documentPath(storedName)), false);
  assertNoChangesOnSecondRecovery();
});

test('recovery finalizes upload metadata inserted before operation cleanup', () => {
  insertDocument();
  fs.writeFileSync(storage.documentPath(storedName), 'complete bytes');
  const identity = storage.fileIdentity(storage.documentPath(storedName));
  insertOperation({
    type: 'UPLOAD',
    state: 'UPLOAD_METADATA_INSERTED',
    fileIdentity: identity
  });
  const first = run();
  assert.equal(first.operations[0].action, 'finalize_uploaded_document');
  assert.equal(documentCount(), 1);
  assert.equal(operationCount(), 0);
  assert.equal(fs.existsSync(storage.documentPath(storedName)), true);
  const second = run();
  assert.equal(second.operations.length, 0);
  assert.equal(documentCount(), 1);
  assert.equal(fs.existsSync(storage.documentPath(storedName)), true);
});

test('recovery keeps an upload pending when cleanup fails and retries safely', () => {
  fs.writeFileSync(storage.documentPath(storedName), 'partial bytes');
  const identity = storage.fileIdentity(storage.documentPath(storedName));
  insertOperation({ type: 'UPLOAD', state: 'UPLOAD_PENDING', fileIdentity: identity });
  const failingStorage = {
    ...storage,
    unlink() {
      const error = new Error('injected recovery unlink failure');
      error.code = 'EIO';
      throw error;
    }
  };
  const failed = run(false, failingStorage);
  assert.equal(failed.operations[0].status, 'manual_review');
  assert.equal(documentCount(), 0);
  assert.equal(operationCount(), 1);
  assert.equal(fs.existsSync(storage.documentPath(storedName)), true);
  const recovered = run();
  assert.equal(recovered.operations[0].status, 'recovered');
  assert.equal(operationCount(), 0);
  assert.equal(fs.existsSync(storage.documentPath(storedName)), false);
  assertNoChangesOnSecondRecovery();
});

test('recovery does not scan or delete unrelated files', () => {
  const unrelatedPath = path.join(storageDirectory, 'unrelated-file.bin');
  fs.writeFileSync(unrelatedPath, 'must remain');
  insertOperation({ type: 'UPLOAD', state: 'UPLOAD_PENDING' });
  const first = run();
  assert.equal(first.operations[0].action, 'finalize_upload_without_file');
  assert.equal(fs.readFileSync(unrelatedPath, 'utf8'), 'must remain');
  assert.equal(operationCount(), 0);
  assert.equal(run().operations.length, 0);
});

test('unassociated upload files are preserved for manual review', () => {
  fs.writeFileSync(storage.documentPath(storedName), 'unassociated');
  insertOperation({ type: 'UPLOAD', state: 'UPLOAD_PENDING' });
  const first = run();
  assert.equal(first.operations[0].action, 'preserve_unassociated_upload_file');
  assert.equal(operationCount(), 1);
  assert.equal(fs.readFileSync(storage.documentPath(storedName), 'utf8'), 'unassociated');
  assert.equal(run().operations[0].action, 'preserve_unassociated_upload_file');
});

test('recovery preserves legacy cleanup records for manual inspection', () => {
  database.prepare(`
    INSERT INTO recovery_document_cleanup (document_id, user_id, stored_name, tombstone_name)
    VALUES ('legacy-doc', 'legacy-user', 'legacy-name', 'legacy-tombstone')
  `).run();
  const report = run();
  assert.equal(report.legacy_cleanup_records.count, 1);
  assert.equal(report.legacy_cleanup_records.action, 'manual_review_only');
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM recovery_document_cleanup').get().count, 1);
});

test('unavailable storage root prevents recovery from treating files as missing', () => {
  insertOperation({ type: 'UPLOAD', state: 'UPLOAD_PENDING' });
  const unavailableStorage = {
    ...storage,
    inspectRoot() {
      const error = new Error('injected unavailable storage root');
      error.code = 'EIO';
      throw error;
    }
  };
  const report = run(false, unavailableStorage);
  assert.equal(report.operations[0].action, 'preserve_storage_root_unavailable');
  assert.equal(operationCount(), 1);
});

test('recovery preserves a pending operation when its document path is a symlink', (t) => {
  const externalPath = path.join(temporaryDirectory, 'outside.pdf');
  fs.writeFileSync(externalPath, 'outside private storage');
  try {
    fs.symlinkSync(externalPath, storage.documentPath(storedName), process.platform === 'win32' ? 'file' : undefined);
  } catch (error) {
    if (process.platform === 'win32' && ['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) {
      t.skip('The current Windows account cannot create a file symlink.');
      return;
    }
    throw error;
  }
  insertOperation({ type: 'UPLOAD', state: 'UPLOAD_PENDING' });
  const report = run(false);
  assert.equal(report.operations[0].status, 'manual_review');
  assert.equal(report.operations[0].action, 'preserve_after_recovery_error');
  assert.equal(operationCount(), 1);
  assert.equal(documentCount(), 0);
  assert.equal(fs.readFileSync(externalPath, 'utf8'), 'outside private storage');
  assert.equal(fs.lstatSync(storage.documentPath(storedName)).isSymbolicLink(), true);
});

test('maintenance CLI requires explicit paths and supports dry-run then apply without initialization', () => {
  insertOperation({ type: 'UPLOAD', state: 'UPLOAD_PENDING' });
  const cliPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    'scripts',
    'recoverDocuments.js'
  );
  const environment = {
    ...process.env,
    DISASTER_RELIEF_DB_PATH: path.join(temporaryDirectory, 'isolated.sqlite'),
    PRIVATE_DOCUMENTS_DIR: storageDirectory
  };
  const dryRun = spawnSync(process.execPath, [cliPath, '--dry-run'], {
    encoding: 'utf8',
    env: environment
  });
  assert.equal(dryRun.status, 0, dryRun.stderr);
  assert.equal(JSON.parse(dryRun.stdout).operations[0].action, 'finalize_upload_without_file');
  assert.equal(operationCount(), 1);

  const apply = spawnSync(process.execPath, [cliPath, '--apply'], {
    encoding: 'utf8',
    env: environment
  });
  assert.equal(apply.status, 0, apply.stderr);
  assert.equal(JSON.parse(apply.stdout).operations[0].status, 'recovered');
  assert.equal(operationCount(), 0);
});

test('maintenance dry-run requires the exclusive lock and leaves pending state intact when blocked', async () => {
  insertOperation({ type: 'UPLOAD', state: 'UPLOAD_PENDING' });
  const cliPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    'scripts',
    'recoverDocuments.js'
  );
  const environment = {
    ...process.env,
    DISASTER_RELIEF_DB_PATH: path.join(temporaryDirectory, 'isolated.sqlite'),
    PRIVATE_DOCUMENTS_DIR: storageDirectory
  };
  const lockModuleUrl = new URL('../services/documentLifecycleLock.js', import.meta.url).href;
  const holder = spawn(process.execPath, [
    '--input-type=module',
    '-e',
    `import { acquireDocumentLifecycleLock } from ${JSON.stringify(lockModuleUrl)};
     const lock = acquireDocumentLifecycleLock({ root: process.argv[1], mode: 'shared' });
     console.log('locked');
     process.stdin.once('data', () => { lock.release(); });`,
    storageDirectory
  ], { stdio: ['pipe', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => {
    holder.stdout.once('data', (chunk) => {
      assert.match(chunk.toString(), /locked/);
      resolve();
    });
    holder.once('error', reject);
  });

  try {
    const dryRun = spawnSync(process.execPath, [cliPath, '--dry-run'], {
      encoding: 'utf8',
      env: environment
    });
    assert.notEqual(dryRun.status, 0);
    assert.match(dryRun.stderr, /Could not acquire the exclusive document lifecycle lock/);
    assert.equal(operationCount(), 1);
    assert.equal(fs.existsSync(storage.documentPath(storedName)), false);
  } finally {
    holder.stdin.end('release');
  }
  await new Promise((resolve, reject) => {
    holder.once('exit', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
  });
});
