import crypto from 'node:crypto';
import { acquireDocumentLifecycleLock } from './documentLifecycleLock.js';

export class DocumentFileMissingError extends Error {
  constructor() {
    super('The stored document file is missing; its metadata was preserved.');
    this.code = 'DOCUMENT_FILE_MISSING';
  }
}

export class DocumentCleanupPendingError extends Error {
  constructor(message = 'Document cleanup is pending and can be retried.') {
    super(message);
    this.code = 'DOCUMENT_CLEANUP_PENDING';
  }
}

function logFailure(logger, message, error) {
  logger.error(message, error.message);
}

function updateOperation(db, operationId, state, identity = null) {
  const result = db.prepare(`
    UPDATE document_lifecycle_operations
    SET state = ?,
      file_device = COALESCE(?, file_device),
      file_inode = COALESCE(?, file_inode),
      updated_at = CURRENT_TIMESTAMP
    WHERE operation_id = ?
  `).run(state, identity?.device ?? null, identity?.inode ?? null, operationId);
  if (result.changes !== 1) throw new Error('Document lifecycle operation disappeared.');
}

function deleteOperation(db, operationId) {
  const result = db.prepare('DELETE FROM document_lifecycle_operations WHERE operation_id = ?')
    .run(operationId);
  if (result.changes !== 1) throw new Error('Document lifecycle operation was not finalized.');
}

function sameDocument(left, right) {
  return Boolean(left)
    && left.document_id === right.document_id
    && left.user_id === right.user_id
    && left.case_id === right.case_id
    && left.application_id === right.application_id
    && left.original_filename === right.original_filename
    && left.stored_name === right.stored_name
    && left.media_type === right.media_type
    && left.file_size === right.file_size
    && left.category === right.category
    && left.description === right.description;
}

function readRegularFile(storage, filepath) {
  try {
    storage.inspect(filepath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

function requireIdentity(storage, filepath, operation) {
  if (!operation.file_device || !operation.file_inode) return false;
  return storage.sameIdentity(filepath, {
    device: operation.file_device,
    inode: operation.file_inode
  });
}

function createOperation(db, operation) {
  db.prepare(`
    INSERT INTO document_lifecycle_operations (
      operation_id, operation_type, state, document_id, user_id, case_id,
      application_id, stored_name, tombstone_name, document_json,
      file_device, file_inode
    ) VALUES (
      @operation_id, @operation_type, @state, @document_id, @user_id, @case_id,
      @application_id, @stored_name, @tombstone_name, @document_json,
      @file_device, @file_inode
    )
  `).run({
    ...operation,
    file_device: null,
    file_inode: null,
    document_json: JSON.stringify(operation.document)
  });
}

function finalizeDeletion(db, operation) {
  db.transaction(() => {
    const result = db.prepare(`
      DELETE FROM recovery_documents
      WHERE document_id = ? AND user_id = ? AND stored_name = ?
    `).run(operation.document_id, operation.user_id, operation.stored_name);
    if (
      result.changes === 0
      && db.prepare('SELECT 1 FROM recovery_documents WHERE document_id = ?')
        .get(operation.document_id)
    ) {
      throw new Error('Document metadata changed before deletion was finalized.');
    }
    deleteOperation(db, operation.operation_id);
  })();
}

function saveUploadedDocumentUnlocked({
  db,
  document,
  buffer,
  storage,
  createRecord,
  logger = console
}) {
  const operationId = crypto.randomUUID();
  const operation = {
    operation_id: operationId,
    operation_type: 'UPLOAD',
    state: 'UPLOAD_PENDING',
    document_id: document.document_id,
    user_id: document.user_id,
    case_id: document.case_id,
    application_id: document.application_id,
    stored_name: document.stored_name,
    tombstone_name: null,
    document
  };
  createOperation(db, operation);
  let createdIdentity;

  try {
    storage.write(document.stored_name, buffer, (identity) => {
      createdIdentity = identity;
      updateOperation(db, operationId, 'UPLOAD_PENDING', identity);
    });
    updateOperation(db, operationId, 'UPLOAD_FILE_WRITTEN');
    db.transaction(() => {
      createRecord();
      updateOperation(db, operationId, 'UPLOAD_METADATA_INSERTED');
    })();
  } catch (error) {
    if (createdIdentity) {
      const filepath = storage.documentPath(document.stored_name);
      try {
        if (readRegularFile(storage, filepath)) {
          if (!storage.sameIdentity(filepath, createdIdentity)) {
            throw new Error('Generated upload path no longer identifies the created file.');
          }
          storage.unlink(filepath);
        }
        deleteOperation(db, operationId);
      } catch (cleanupError) {
        logFailure(logger, 'Unable to clean up an incomplete private document upload:', cleanupError);
      }
    } else {
      try {
        deleteOperation(db, operationId);
      } catch (cleanupError) {
        logFailure(logger, 'Unable to finalize a private document upload that created no file:', cleanupError);
      }
    }
    throw error;
  }
  try {
    deleteOperation(db, operationId);
  } catch (error) {
    logFailure(logger, 'Uploaded document is saved but its lifecycle record remains pending:', error);
  }
}

export function saveUploadedDocument(options) {
  const lifecycleLock = acquireDocumentLifecycleLock({
    root: options.storage.root,
    mode: 'shared'
  });
  try {
    return saveUploadedDocumentUnlocked(options);
  } finally {
    lifecycleLock.release();
  }
}

function deletePrivateDocumentUnlocked({
  db,
  document,
  userId,
  storage,
  logger = console
}) {
  storage.inspectRoot();
  const filepath = storage.documentPath(document.stored_name);
  const originalExists = readRegularFile(storage, filepath);
  if (!originalExists) throw new DocumentFileMissingError();

  const operationId = crypto.randomUUID();
  const tombstoneName = `TOMB-${operationId}.bin`;
  const tombstone = storage.tombstonePath(operationId);
  const operation = {
    operation_id: operationId,
    operation_type: 'DELETE',
    state: 'DELETE_REQUESTED',
    document_id: document.document_id,
    user_id: userId,
    case_id: document.case_id,
    application_id: document.application_id,
    stored_name: document.stored_name,
    tombstone_name: tombstoneName,
    document
  };
  createOperation(db, operation);

  try {
    storage.link(filepath, tombstone);
    const identity = storage.fileIdentity(tombstone);
    updateOperation(db, operationId, 'DELETE_TOMBSTONE_LINKED', identity);
    storage.unlink(filepath);
    updateOperation(db, operationId, 'DELETE_ORIGINAL_REMOVED');
    if (!storage.sameIdentity(tombstone, identity)) {
      throw new Error('Tombstone identity changed before physical deletion.');
    }
    storage.unlink(tombstone);
    finalizeDeletion(db, operation);
  } catch (error) {
    logFailure(logger, 'Document deletion operation remains pending:', error);
    throw new DocumentCleanupPendingError();
  }
}

export function deletePrivateDocument(options) {
  const lifecycleLock = acquireDocumentLifecycleLock({
    root: options.storage.root,
    mode: 'shared'
  });
  try {
    return deletePrivateDocumentUnlocked(options);
  } finally {
    lifecycleLock.release();
  }
}

function inspectOperation(db, operation, storage) {
  const originalPath = storage.documentPath(operation.stored_name);
  const expectedTombstoneName = `TOMB-${operation.operation_id}.bin`;
  if (
    (operation.operation_type === 'DELETE' && operation.tombstone_name !== expectedTombstoneName)
    || (operation.operation_type === 'UPLOAD' && operation.tombstone_name !== null)
  ) {
    throw new Error('Stored operation paths do not match generated names.');
  }
  const tombstonePath = operation.operation_type === 'DELETE'
    ? storage.tombstonePath(operation.operation_id)
    : null;
  const originalExists = readRegularFile(storage, originalPath);
  const tombstoneExists = tombstonePath ? readRegularFile(storage, tombstonePath) : false;
  const metadata = db.prepare('SELECT * FROM recovery_documents WHERE document_id = ?')
    .get(operation.document_id);
  return { originalPath, tombstonePath, originalExists, tombstoneExists, metadata };
}

function recoverUpload({ db, operation, storage, dryRun }) {
  const inspected = inspectOperation(db, operation, storage);
  if (operation.state === 'UPLOAD_METADATA_INSERTED') {
    if (!sameDocument(inspected.metadata, JSON.parse(operation.document_json))) {
      return { status: 'manual_review', action: 'preserve_mismatched_upload_metadata' };
    }
    if (!inspected.originalExists || !requireIdentity(storage, inspected.originalPath, operation)) {
      return { status: 'manual_review', action: 'preserve_missing_or_changed_upload_file' };
    }
    if (!dryRun) deleteOperation(db, operation.operation_id);
    return { status: dryRun ? 'would_recover' : 'recovered', action: 'finalize_uploaded_document' };
  }

  if (inspected.metadata) {
    return { status: 'manual_review', action: 'preserve_unexpected_upload_metadata' };
  }
  if (!inspected.originalExists) {
    if (!dryRun) deleteOperation(db, operation.operation_id);
    return { status: dryRun ? 'would_recover' : 'recovered', action: 'finalize_upload_without_file' };
  }
  if (!requireIdentity(storage, inspected.originalPath, operation)) {
    return { status: 'manual_review', action: 'preserve_unassociated_upload_file' };
  }
  if (!dryRun) {
    storage.unlink(inspected.originalPath);
    deleteOperation(db, operation.operation_id);
  }
  return { status: dryRun ? 'would_recover' : 'recovered', action: 'remove_abandoned_upload_file' };
}

function recoverDeletion({ db, operation, storage, dryRun }) {
  const inspected = inspectOperation(db, operation, storage);
  const savedDocument = JSON.parse(operation.document_json);
  if (inspected.metadata && !sameDocument(inspected.metadata, savedDocument)) {
    return { status: 'manual_review', action: 'preserve_mismatched_document_metadata' };
  }
  if (!inspected.originalExists && !inspected.tombstoneExists) {
    return { status: 'manual_review', action: 'preserve_metadata_missing_both_files' };
  }

  let identity = operation.file_device && operation.file_inode
    ? { device: operation.file_device, inode: operation.file_inode }
    : null;
  if (inspected.originalExists && inspected.tombstoneExists) {
    const originalIdentity = storage.fileIdentity(inspected.originalPath);
    const tombstoneIdentity = storage.fileIdentity(inspected.tombstonePath);
    if (
      originalIdentity.device !== tombstoneIdentity.device
      || originalIdentity.inode !== tombstoneIdentity.inode
      || (identity && (
        identity.device !== originalIdentity.device
        || identity.inode !== originalIdentity.inode
      ))
    ) {
      return { status: 'manual_review', action: 'preserve_tombstone_collision' };
    }
    identity = originalIdentity;
    if (!dryRun && (!operation.file_device || !operation.file_inode)) {
      updateOperation(db, operation.operation_id, 'DELETE_TOMBSTONE_LINKED', identity);
    }
  } else if (inspected.originalExists) {
    if (operation.state !== 'DELETE_REQUESTED') {
      return { status: 'manual_review', action: 'preserve_unexpected_original_file' };
    }
    if (!dryRun) {
      storage.link(inspected.originalPath, inspected.tombstonePath);
      identity = storage.fileIdentity(inspected.tombstonePath);
      updateOperation(db, operation.operation_id, 'DELETE_TOMBSTONE_LINKED', identity);
    }
  } else if (!requireIdentity(storage, inspected.tombstonePath, operation)) {
    return { status: 'manual_review', action: 'preserve_unidentified_tombstone' };
  }

  if (dryRun) {
    return {
      status: 'would_recover',
      action: inspected.originalExists
        ? 'link_original_and_finish_deletion'
        : 'finish_deletion_from_tombstone'
    };
  }

  if (inspected.originalExists) {
    if (!storage.sameIdentity(inspected.tombstonePath, identity)) {
      return { status: 'manual_review', action: 'preserve_changed_tombstone' };
    }
    storage.unlink(inspected.originalPath);
    updateOperation(db, operation.operation_id, 'DELETE_ORIGINAL_REMOVED', identity);
  }
  if (!storage.sameIdentity(inspected.tombstonePath, identity)) {
    return { status: 'manual_review', action: 'preserve_changed_tombstone' };
  }
  storage.unlink(inspected.tombstonePath);
  finalizeDeletion(db, operation);
  return { status: 'recovered', action: 'finish_deletion' };
}

function recoverDocumentOperationsUnlocked({ db, storage, dryRun = true }) {
  const operations = db.prepare(`
    SELECT * FROM document_lifecycle_operations
    ORDER BY created_at, operation_id
  `).all();
  const legacyRows = db.prepare('SELECT COUNT(*) AS count FROM recovery_document_cleanup').get().count;
  const results = [];

  if (operations.length) {
    try {
      storage.inspectRoot();
    } catch (error) {
      return {
        dry_run: dryRun,
        operations: operations.map((operation) => ({
          operation_id: operation.operation_id,
          type: operation.operation_type,
          status: 'manual_review',
          action: 'preserve_storage_root_unavailable',
          error: error.message
        })),
        legacy_cleanup_records: {
          count: legacyRows,
          action: 'manual_review_only'
        }
      };
    }
  }

  for (const operation of operations) {
    try {
      const validStates = operation.operation_type === 'UPLOAD'
        ? ['UPLOAD_PENDING', 'UPLOAD_FILE_WRITTEN', 'UPLOAD_METADATA_INSERTED']
        : operation.operation_type === 'DELETE'
          ? ['DELETE_REQUESTED', 'DELETE_TOMBSTONE_LINKED', 'DELETE_ORIGINAL_REMOVED']
          : [];
      if (
        !validStates.includes(operation.state)
        || Boolean(operation.file_device) !== Boolean(operation.file_inode)
      ) {
        results.push({
          operation_id: operation.operation_id,
          type: operation.operation_type,
          status: 'manual_review',
          action: 'preserve_invalid_operation_state'
        });
        continue;
      }
      const savedDocument = JSON.parse(operation.document_json);
      if (
        savedDocument.document_id !== operation.document_id
        || savedDocument.user_id !== operation.user_id
        || savedDocument.case_id !== operation.case_id
        || savedDocument.application_id !== operation.application_id
        || savedDocument.stored_name !== operation.stored_name
      ) {
        results.push({
          operation_id: operation.operation_id,
          type: operation.operation_type,
          status: 'manual_review',
          action: 'preserve_inconsistent_operation_metadata'
        });
        continue;
      }
      const result = operation.operation_type === 'UPLOAD'
        ? recoverUpload({ db, operation, storage, dryRun })
        : operation.operation_type === 'DELETE'
          ? recoverDeletion({ db, operation, storage, dryRun })
          : { status: 'manual_review', action: 'preserve_unknown_operation_type' };
      results.push({ operation_id: operation.operation_id, type: operation.operation_type, ...result });
    } catch (error) {
      results.push({
        operation_id: operation.operation_id,
        type: operation.operation_type,
        status: 'manual_review',
        action: 'preserve_after_recovery_error',
        error: error.message
      });
    }
  }
  return {
    dry_run: dryRun,
    operations: results,
    legacy_cleanup_records: {
      count: legacyRows,
      action: 'manual_review_only'
    }
  };
}

export function recoverDocumentOperations(options) {
  const lifecycleLock = acquireDocumentLifecycleLock({
    root: options.storage.root,
    mode: 'exclusive'
  });
  try {
    return recoverDocumentOperationsUnlocked(options);
  } finally {
    lifecycleLock.release();
  }
}
