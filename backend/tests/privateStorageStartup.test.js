import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, beforeEach, test } from 'node:test';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { ensureLifecycleLockDatabase } from '../services/documentLifecycleLock.js';
import { createPrivateDocumentStorage } from '../services/privateDocuments.js';
import { validatePrivateDocumentStorageForStartup } from '../services/privateStorageStartup.js';

let temporaryDirectory;
let storageRoot;
let databasePath;
let database;

function seedPreservedRecords() {
  database = new Database(databasePath);
  database.exec(`
    CREATE TABLE recovery_documents (document_id TEXT PRIMARY KEY);
    CREATE TABLE document_lifecycle_operations (operation_id TEXT PRIMARY KEY);
    INSERT INTO recovery_documents VALUES ('DOC-PRESERVE');
    INSERT INTO document_lifecycle_operations VALUES ('OP-PRESERVE');
  `);
  database.close();
  database = null;
}

function counts() {
  const inspection = new Database(databasePath, { readonly: true });
  try {
    return {
      documents: inspection.prepare('SELECT COUNT(*) AS count FROM recovery_documents').get().count,
      operations: inspection.prepare('SELECT COUNT(*) AS count FROM document_lifecycle_operations').get().count
    };
  } finally {
    inspection.close();
  }
}

function runNormalStartup(storagePath) {
  const databaseModule = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    'database.js'
  );
  const script = `
    import db, { initDatabase } from ${JSON.stringify(new URL(`file:///${databaseModule.replace(/\\/g, '/')}`).href)};
    try { initDatabase(); process.exitCode = 0; }
    catch (error) { console.error(error.message); process.exitCode = 1; }
    finally { db.close(); }
  `;
  return spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8',
    env: {
      ...process.env,
      DISASTER_RELIEF_DB_PATH: databasePath,
      PRIVATE_DOCUMENTS_DIR: storagePath
    }
  });
}

beforeEach(async () => {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'alalai-storage-startup-'));
  storageRoot = path.join(temporaryDirectory, 'private-documents');
  databasePath = path.join(temporaryDirectory, 'isolated.sqlite');
  seedPreservedRecords();
});

afterEach(async () => {
  database?.close();
  await rm(temporaryDirectory, { recursive: true, force: true });
});

test('explicit provisioning creates the storage root and lock database', () => {
  const scriptPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    'scripts',
    'provisionPrivateDocuments.js'
  );
  const result = spawnSync(process.execPath, [scriptPath, '--confirm'], {
    encoding: 'utf8',
    env: { ...process.env, PRIVATE_DOCUMENTS_DIR: storageRoot }
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.statSync(storageRoot).isDirectory(), true);
  assert.equal(fs.statSync(path.join(storageRoot, '.document-lifecycle-lock.sqlite')).isFile(), true);
  assert.deepEqual(counts(), { documents: 1, operations: 1 });
});

test('normal startup fails for a missing previously provisioned root without recreating it', () => {
  const result = runNormalStartup(storageRoot);
  assert.notEqual(result.status, 0);
  assert.equal(fs.existsSync(storageRoot), false);
  assert.deepEqual(counts(), { documents: 1, operations: 1 });
});

test('normal startup fails when the provisioned lock database is missing and does not recreate it', () => {
  fs.mkdirSync(storageRoot);
  const result = runNormalStartup(storageRoot);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /lifecycle lock database is missing/i);
  assert.equal(fs.existsSync(path.join(storageRoot, '.document-lifecycle-lock.sqlite')), false);
  assert.deepEqual(counts(), { documents: 1, operations: 1 });
});

test('inaccessible storage fails before changing document metadata, lifecycle rows, or lock file', () => {
  fs.mkdirSync(storageRoot);
  ensureLifecycleLockDatabase(storageRoot);
  const lockPath = path.join(storageRoot, '.document-lifecycle-lock.sqlite');
  const lockContents = fs.readFileSync(lockPath);
  const inaccessibleFileSystem = {
    ...fs,
    lstatSync() {
      const error = new Error('injected inaccessible storage');
      error.code = 'EACCES';
      throw error;
    }
  };
  const inaccessibleStorage = createPrivateDocumentStorage({
    root: storageRoot,
    fileSystem: inaccessibleFileSystem
  });
  assert.throws(
    () => validatePrivateDocumentStorageForStartup({
      root: storageRoot,
      storage: inaccessibleStorage
    }),
    { code: 'EACCES' }
  );
  assert.deepEqual(counts(), { documents: 1, operations: 1 });
  assert.deepEqual(fs.readFileSync(lockPath), lockContents);
});

test('storage with group/world write permission is rejected on POSIX', {
  skip: process.platform === 'win32' ? 'POSIX mode permissions are unavailable on Windows.' : false
}, () => {
  fs.mkdirSync(storageRoot, { mode: 0o700 });
  ensureLifecycleLockDatabase(storageRoot);
  fs.chmodSync(storageRoot, 0o777);
  const storage = createPrivateDocumentStorage({ root: storageRoot });
  assert.throws(() => storage.validatePermissions(), {
    code: 'DOCUMENT_STORAGE_PERMISSIONS_UNSAFE'
  });
});

test('Windows junction root is rejected by documented reparse-point inspection', (t) => {
  if (process.platform !== 'win32') {
    t.skip('Windows-specific reparse-point validation.');
    return;
  }
  const actualRoot = path.join(temporaryDirectory, 'actual-root');
  const linkedRoot = path.join(temporaryDirectory, 'linked-root');
  fs.mkdirSync(actualRoot);
  try {
    fs.symlinkSync(actualRoot, linkedRoot, 'junction');
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) {
      t.skip('The current Windows account cannot create a directory junction.');
      return;
    }
    throw error;
  }
  const storage = createPrivateDocumentStorage({ root: linkedRoot });
  assert.throws(() => storage.validateRoot(), { code: 'DOCUMENT_STORAGE_REPARSE_POINT' });
});
