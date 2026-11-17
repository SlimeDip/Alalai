import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { validatePrivateStorageRoot } from './privateDocuments.js';
import {
  isStoragePathReparsePoint,
  validatePrivateStorageFilePermissions,
  validatePrivateStoragePermissions
} from './privateStorageSecurity.js';

const lockDatabaseName = '.document-lifecycle-lock.sqlite';

function validateLockFile(lockPath) {
  const details = fs.lstatSync(lockPath);
  if (isStoragePathReparsePoint(lockPath, details) || !details.isFile()) {
    throw new Error('Document lifecycle lock database is not a regular file.');
  }
}

export function lifecycleLockDatabasePath(root) {
  return path.join(path.resolve(root), lockDatabaseName);
}

export function ensureLifecycleLockDatabase(root) {
  const { realpath } = validatePrivateStorageRoot(root);
  validatePrivateStoragePermissions(realpath);
  const lockPath = path.join(realpath, lockDatabaseName);
  try {
    validateLockFile(lockPath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    try {
      const descriptor = fs.openSync(lockPath, 'wx', 0o600);
      fs.closeSync(descriptor);
    } catch (createError) {
      if (createError.code !== 'EEXIST') throw createError;
    }
  }
  validateLockFile(lockPath);
  const database = new Database(lockPath);
  try {
    database.pragma('journal_mode = DELETE');
    database.pragma('synchronous = FULL');
    database.exec(`
      CREATE TABLE IF NOT EXISTS lifecycle_lock (
        lock_id INTEGER PRIMARY KEY CHECK (lock_id = 1)
      );
      INSERT OR IGNORE INTO lifecycle_lock (lock_id) VALUES (1);
    `);
  } finally {
    database.close();
  }
  if (process.platform !== 'win32') {
    fs.chmodSync(lockPath, 0o600);
  }
  validatePrivateStorageFilePermissions(lockPath);
}

export function validateLifecycleLockDatabase(root) {
  const { realpath } = validatePrivateStorageRoot(root);
  const lockPath = path.join(realpath, lockDatabaseName);
  try {
    validateLockFile(lockPath);
    validatePrivateStorageFilePermissions(lockPath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      const missingError = new Error('Document lifecycle lock database is missing; explicitly provision private storage before starting the backend.');
      missingError.code = 'DOCUMENT_LIFECYCLE_LOCK_MISSING';
      throw missingError;
    }
    throw error;
  }
  const database = new Database(lockPath, { readonly: true, fileMustExist: true });
  try {
    if (database.pragma('journal_mode', { simple: true }).toLowerCase() !== 'delete') {
      throw new Error('Document lifecycle lock database must use SQLite DELETE journal mode.');
    }
    database.prepare('SELECT lock_id FROM lifecycle_lock WHERE lock_id = 1').get();
  } finally {
    database.close();
  }
}

export function acquireDocumentLifecycleLock({ root, mode, create = false }) {
  if (mode !== 'shared' && mode !== 'exclusive') {
    throw new TypeError('Document lifecycle lock mode must be shared or exclusive.');
  }
  if (create) ensureLifecycleLockDatabase(root);
  const { realpath } = validatePrivateStorageRoot(root, { checkAllReparsePoints: false });
  const databasePath = path.join(realpath, lockDatabaseName);
  let lockDetails;
  try {
    lockDetails = fs.lstatSync(databasePath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const missingError = new Error('Document lifecycle lock database is missing; initialize the backend first.');
    missingError.code = 'DOCUMENT_LIFECYCLE_LOCK_MISSING';
    throw missingError;
  }
  if (isStoragePathReparsePoint(databasePath, lockDetails) || !lockDetails.isFile()) {
    throw new Error('Document lifecycle lock database is not a regular file.');
  }
  const database = new Database(databasePath, {
    fileMustExist: true,
    timeout: 0
  });
  try {
    if (database.pragma('journal_mode', { simple: true }).toLowerCase() !== 'delete') {
      throw new Error('Document lifecycle lock database must use SQLite DELETE journal mode.');
    }
    database.exec(mode === 'exclusive' ? 'BEGIN EXCLUSIVE' : 'BEGIN');
    database.prepare('SELECT lock_id FROM lifecycle_lock WHERE lock_id = 1').get();
  } catch (error) {
    database.close();
    if (error.code === 'SQLITE_BUSY' || error.code === 'SQLITE_LOCKED') {
      const lockError = new Error(`Could not acquire the ${mode} document lifecycle lock.`);
      lockError.code = 'DOCUMENT_LIFECYCLE_LOCK_BUSY';
      lockError.cause = error;
      throw lockError;
    }
    throw error;
  }

  let released = false;
  return {
    release() {
      if (released) return;
      released = true;
      try {
        database.exec('ROLLBACK');
      } finally {
        database.close();
      }
    }
  };
}
