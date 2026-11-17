import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import Database from 'better-sqlite3';
import {
  deletePrivateDocument,
  DocumentCleanupPendingError,
  DocumentFileMissingError,
  recoverDocumentOperations,
  saveUploadedDocument
} from '../services/documentLifecycle.js';
import { createPrivateDocumentStorage } from '../services/privateDocuments.js';
import {
  acquireDocumentLifecycleLock,
  ensureLifecycleLockDatabase
} from '../services/documentLifecycleLock.js';

const storedName = 'DOC-123e4567-e89b-12d3-a456-426614174000.pdf';
const documentId = 'DOC-123e4567-e89b-12d3-a456-426614174000';
const userId = 'USER-TEST';

let temporaryDirectory;
let storageDirectory;
let database;
let document;
let storage;
let logEntries;
const logger = {
  error(...values) {
    logEntries.push(values);
  }
};

function seedDocument({ includeFile = true, fileSystem } = {}) {
  document = {
    document_id: documentId,
    user_id: userId,
    case_id: 'CASE-TEST',
    application_id: null,
    original_filename: 'test.pdf',
    stored_name: storedName,
    media_type: 'application/pdf',
    file_size: 12,
    category: 'OTHER',
    description: '',
    uploaded_at: '2026-11-10 00:00:00'
  };
  database.prepare(`
    INSERT INTO recovery_documents (
      document_id, user_id, case_id, application_id, original_filename,
      stored_name, media_type, file_size, category, description, uploaded_at
    ) VALUES (
      @document_id, @user_id, @case_id, @application_id, @original_filename,
      @stored_name, @media_type, @file_size, @category, @description, @uploaded_at
    )
  `).run(document);
  storage = createPrivateDocumentStorage({ root: storageDirectory, fileSystem });
  if (includeFile) fs.writeFileSync(storage.documentPath(storedName), Buffer.from('test document'));
}

function operationCount() {
  return database.prepare('SELECT COUNT(*) AS count FROM document_lifecycle_operations').get().count;
}

function operationForDocument() {
  return database.prepare('SELECT * FROM document_lifecycle_operations WHERE document_id = ?')
    .get(documentId);
}

function deleteDocument(storageOverride = storage) {
  return deletePrivateDocument({
    db: database,
    document,
    userId,
    storage: storageOverride,
    logger
  });
}

function assertMetadataExists() {
  assert.ok(database.prepare('SELECT * FROM recovery_documents WHERE document_id = ?').get(documentId));
}

function assertLifecycleLockAvailable() {
  const lock = acquireDocumentLifecycleLock({ root: storageDirectory, mode: 'exclusive' });
  lock.release();
}

function assertFileStates({ original, tombstone, operation = operationForDocument() }) {
  assert.equal(fs.existsSync(storage.documentPath(storedName)), original);
  if (operation?.operation_type === 'DELETE') {
    assert.equal(fs.existsSync(storage.tombstonePath(operation.operation_id)), tombstone);
  }
}

beforeEach(async () => {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'alalai-document-lifecycle-'));
  storageDirectory = path.join(temporaryDirectory, 'private-documents');
  fs.mkdirSync(storageDirectory);
  ensureLifecycleLockDatabase(storageDirectory);
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
  logEntries = [];
});

afterEach(async () => {
  database?.close();
  await rm(temporaryDirectory, { recursive: true, force: true });
});

test('normal document deletion removes metadata and operation after both names are removed', () => {
  seedDocument();
  deleteDocument();
  assert.equal(database.prepare('SELECT 1 FROM recovery_documents WHERE document_id = ?').get(documentId), undefined);
  assert.equal(operationCount(), 0);
  assertFileStates({ original: false, tombstone: false, operation: null });
  assertLifecycleLockAvailable();
});

test('upload lock acquisition failure creates no lifecycle operation', () => {
  seedDocument({ includeFile: false });
  const lock = acquireDocumentLifecycleLock({ root: storageDirectory, mode: 'exclusive' });
  try {
    assert.throws(() => saveUploadedDocument({
      db: database,
      document,
      buffer: Buffer.from('test document'),
      storage,
      createRecord() {}
    }), { code: 'DOCUMENT_LIFECYCLE_LOCK_BUSY' });
  } finally {
    lock.release();
  }
  assert.equal(operationCount(), 0);
  assert.equal(fs.existsSync(storage.documentPath(storedName)), false);
});

test('delete lock acquisition failure creates no lifecycle operation or filesystem changes', () => {
  seedDocument();
  const lock = acquireDocumentLifecycleLock({ root: storageDirectory, mode: 'exclusive' });
  try {
    assert.throws(() => deleteDocument(), { code: 'DOCUMENT_LIFECYCLE_LOCK_BUSY' });
  } finally {
    lock.release();
  }
  assert.equal(operationCount(), 0);
  assert.equal(fs.existsSync(storage.documentPath(storedName)), true);
  assertLifecycleLockAvailable();
});

test('successful upload releases its shared lifecycle lock', () => {
  seedDocument({ includeFile: false });
  database.prepare('DELETE FROM recovery_documents WHERE document_id = ?').run(documentId);
  saveUploadedDocument({
    db: database,
    document,
    buffer: Buffer.from('test document'),
    storage,
    createRecord() {
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
  });
  assert.equal(operationCount(), 0);
  assertLifecycleLockAvailable();
});

test('failed upload releases its shared lifecycle lock', () => {
  seedDocument({ includeFile: false });
  database.prepare('DELETE FROM recovery_documents WHERE document_id = ?').run(documentId);
  const failingStorage = {
    ...storage,
    write() {
      throw new Error('injected write failure');
    }
  };
  assert.throws(() => saveUploadedDocument({
    db: database,
    document,
    buffer: Buffer.from('test document'),
    storage: failingStorage,
    createRecord() {},
    logger
  }), /injected write failure/);
  assert.equal(operationCount(), 0);
  assertLifecycleLockAvailable();
});

test('failed deletion releases its shared lifecycle lock', () => {
  seedDocument();
  const failingStorage = {
    ...storage,
    link() {
      throw new Error('injected link failure');
    }
  };
  assert.throws(() => deleteDocument(failingStorage), DocumentCleanupPendingError);
  assert.equal(operationCount(), 1);
  assertLifecycleLockAvailable();
});

test('confirmed missing file preserves document metadata', () => {
  seedDocument({ includeFile: false });
  assert.throws(deleteDocument, DocumentFileMissingError);
  assertMetadataExists();
  assert.equal(operationCount(), 0);
});

test('inspection I/O errors preserve metadata and the physical file', () => {
  seedDocument();
  const failingStorage = {
    ...storage,
    inspect() {
      const error = new Error('injected storage inspection failure');
      error.code = 'EACCES';
      throw error;
    }
  };
  assert.throws(() => deleteDocument(failingStorage), { code: 'EACCES' });
  assertMetadataExists();
  assert.equal(operationCount(), 0);
  assertFileStates({ original: true, tombstone: false, operation: null });
});

test('hard-link failure preserves metadata and records a recoverable deletion request', () => {
  seedDocument();
  const failingStorage = {
    ...storage,
    link() {
      const error = new Error('injected hard-link failure');
      error.code = 'EIO';
      throw error;
    }
  };
  assert.throws(() => deleteDocument(failingStorage), DocumentCleanupPendingError);
  assertMetadataExists();
  assert.equal(operationForDocument().state, 'DELETE_REQUESTED');
  assertFileStates({ original: true, tombstone: false });
});

test('database finalization failure preserves metadata and the pending operation after file deletion', () => {
  seedDocument();
  database.exec(`
    CREATE TRIGGER reject_document_delete
    BEFORE DELETE ON recovery_documents
    BEGIN SELECT RAISE(ABORT, 'injected database deletion failure'); END;
  `);
  assert.throws(deleteDocument, DocumentCleanupPendingError);
  assertMetadataExists();
  assert.equal(operationForDocument().state, 'DELETE_ORIGINAL_REMOVED');
  assertFileStates({ original: false, tombstone: false });
});

test('finalization does not delete replacement metadata for a changed storage name', () => {
  seedDocument();
  const replacementName = 'DOC-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.pdf';
  const racingStorage = {
    ...storage,
    unlink(filepath) {
      storage.unlink(filepath);
      if (filepath.endsWith('.bin')) {
        database.prepare('UPDATE recovery_documents SET stored_name = ? WHERE document_id = ?')
          .run(replacementName, documentId);
      }
    }
  };
  assert.throws(() => deleteDocument(racingStorage), DocumentCleanupPendingError);
  assert.equal(database.prepare('SELECT stored_name FROM recovery_documents WHERE document_id = ?')
    .get(documentId).stored_name, replacementName);
  assert.equal(operationCount(), 1);
  assertFileStates({ original: false, tombstone: false });
});

test('original unlink failure leaves both hard links and the operation record', () => {
  seedDocument();
  const failingStorage = {
    ...storage,
    unlink(filepath) {
      if (filepath === storage.documentPath(storedName)) {
        const error = new Error('injected original unlink failure');
        error.code = 'EIO';
        throw error;
      }
      storage.unlink(filepath);
    }
  };
  assert.throws(() => deleteDocument(failingStorage), DocumentCleanupPendingError);
  assertMetadataExists();
  assert.equal(operationForDocument().state, 'DELETE_TOMBSTONE_LINKED');
  assertFileStates({ original: true, tombstone: true });
});

test('tombstone unlink failure leaves metadata and a pending operation', () => {
  seedDocument();
  const failingStorage = {
    ...storage,
    unlink(filepath) {
      if (filepath === storage.tombstonePath(operationForDocument()?.operation_id || '')) {
        const error = new Error('injected tombstone unlink failure');
        error.code = 'EIO';
        throw error;
      }
      storage.unlink(filepath);
    }
  };
  assert.throws(() => deleteDocument(failingStorage), DocumentCleanupPendingError);
  assertMetadataExists();
  assert.equal(operationForDocument().state, 'DELETE_ORIGINAL_REMOVED');
  assertFileStates({ original: false, tombstone: true });
});

test('partial upload failure cleans only its generated file and preserves the write error', () => {
  seedDocument({ includeFile: false });
  database.prepare('DELETE FROM recovery_documents WHERE document_id = ?').run(documentId);
  const fileSystem = {
    ...fs,
    writeFileSync(descriptor, buffer) {
      fs.writeFileSync(descriptor, buffer.subarray(0, 3));
      throw new Error('injected partial write failure');
    }
  };
  const partialStorage = createPrivateDocumentStorage({ root: storageDirectory, fileSystem });
  let inserted = false;
  assert.throws(() => saveUploadedDocument({
    db: database,
    document,
    buffer: Buffer.from('complete payload'),
    storage: partialStorage,
    createRecord() {
      inserted = true;
    },
    logger
  }), /injected partial write failure/);
  assert.equal(inserted, false);
  assert.equal(fs.existsSync(partialStorage.documentPath(storedName)), false);
  assert.equal(operationCount(), 0);
});

test('partial upload cleanup failure leaves a durable operation and no document row', () => {
  seedDocument({ includeFile: false });
  database.prepare('DELETE FROM recovery_documents WHERE document_id = ?').run(documentId);
  const fileSystem = {
    ...fs,
    writeFileSync(descriptor, buffer) {
      fs.writeFileSync(descriptor, buffer.subarray(0, 3));
      throw new Error('injected partial write failure');
    }
  };
  const partialStorage = createPrivateDocumentStorage({ root: storageDirectory, fileSystem });
  const cleanupFailingStorage = {
    ...partialStorage,
    unlink() {
      throw new Error('injected cleanup failure');
    }
  };
  assert.throws(() => saveUploadedDocument({
    db: database,
    document,
    buffer: Buffer.from('complete payload'),
    storage: cleanupFailingStorage,
    createRecord() {
      assert.fail('metadata must not be inserted after a write failure');
    },
    logger
  }), /injected partial write failure/);
  assert.equal(fs.existsSync(partialStorage.documentPath(storedName)), true);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM recovery_documents').get().count, 0);
  assert.equal(operationCount(), 1);
  assert.equal(logEntries.some(([message]) => message.includes('incomplete private document upload')), true);
});

test('upload operation is persisted before writing and metadata is inserted transactionally', () => {
  seedDocument({ includeFile: false });
  database.prepare('DELETE FROM recovery_documents WHERE document_id = ?').run(documentId);
  const uploadDocumentRecord = { ...document, document_id: `DOC-${crypto.randomUUID()}`, stored_name: `DOC-${crypto.randomUUID()}.pdf` };
  let operationObservedBeforeWrite = false;
  const observingStorage = {
    ...storage,
    write(name, buffer, onCreated) {
      operationObservedBeforeWrite = database.prepare(`
        SELECT 1 FROM document_lifecycle_operations
        WHERE stored_name = ? AND state = 'UPLOAD_PENDING'
      `).get(name) != null;
      storage.write(name, buffer, onCreated);
    }
  };
  saveUploadedDocument({
    db: database,
    document: uploadDocumentRecord,
    buffer: Buffer.from('complete payload'),
    storage: observingStorage,
    createRecord() {
      database.prepare(`
        INSERT INTO recovery_documents (
          document_id, user_id, case_id, application_id, original_filename,
          stored_name, media_type, file_size, category, description, uploaded_at
        ) VALUES (
          @document_id, @user_id, @case_id, @application_id, @original_filename,
          @stored_name, @media_type, @file_size, @category, @description, @uploaded_at
        )
      `).run(uploadDocumentRecord);
    },
    logger
  });
  assert.equal(operationObservedBeforeWrite, true);
  assert.ok(database.prepare('SELECT 1 FROM recovery_documents WHERE document_id = ?')
    .get(uploadDocumentRecord.document_id));
  assert.equal(operationCount(), 0);
  assert.equal(fs.existsSync(storage.documentPath(uploadDocumentRecord.stored_name)), true);
});
