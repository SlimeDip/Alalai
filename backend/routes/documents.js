import express from 'express';
import crypto from 'node:crypto';
import multer from 'multer';
import db from '../database.js';
import { inspectUploadedDocument, privateDocumentStorage } from '../services/privateDocuments.js';
import { acquireDocumentLifecycleLock } from '../services/documentLifecycleLock.js';
import {
  deletePrivateDocument,
  DocumentCleanupPendingError,
  DocumentFileMissingError,
  saveUploadedDocument
} from '../services/documentLifecycle.js';

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
    fields: 10,
    fieldSize: 4096
  }
});
const categories = new Set(['DAMAGE_PHOTO', 'IDENTITY', 'RECEIPT', 'SUPPORTING', 'OTHER']);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function text(value, field, maximum, { required = false } = {}) {
  if (value == null && !required) return { value: '' };
  if (typeof value !== 'string') return { error: `${field} must be text.` };
  const normalized = value.trim();
  if ((required && !normalized) || normalized.length > maximum) {
    return { error: `${field} must be ${required ? 'non-empty and ' : ''}at most ${maximum} characters.` };
  }
  return { value: normalized };
}

function ownedDocument(id, userId) {
  return db.prepare(`
    SELECT * FROM recovery_documents
    WHERE document_id = ? AND user_id = ?
  `).get(id, userId);
}

function validateApplication(applicationId, caseId, userId) {
  if (!applicationId) return null;
  const application = db.prepare(`
    SELECT case_id FROM applications
    WHERE application_id = ? AND user_id = ?
  `).get(applicationId, userId);
  if (!application) return 'Saved application not found.';
  if (application.case_id !== caseId) return 'The application and recovery case do not match.';
  return null;
}

function safeDisposition(filename, disposition) {
  const fallback = filename.replace(/[^\x20-\x7e]|["\\;]/g, '_') || 'document';
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, (character) => (
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  ));
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

function sendFileResponse(res, row, disposition) {
  let contents;
  let lifecycleLock;
  try {
    privateDocumentStorage.inspectRoot();
    lifecycleLock = acquireDocumentLifecycleLock({
      root: privateDocumentStorage.root,
      mode: 'shared'
    });
    contents = privateDocumentStorage.readDocument(row.stored_name);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return res.status(404).json({ success: false, error: 'The stored document file is missing.' });
    }
    console.error('Unable to safely read private document:', error.message);
    return res.status(500).json({ success: false, error: 'Unable to read the stored document.' });
  } finally {
    lifecycleLock?.release();
  }
  res.setHeader('Content-Type', row.media_type);
  res.setHeader('Content-Length', contents.length);
  res.setHeader('Content-Disposition', safeDisposition(row.original_filename, disposition));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  return res.send(contents);
}

router.get('/', (req, res) => {
  try {
    const caseId = req.query.case_id;
    if (typeof caseId !== 'string' || !caseId.trim()) {
      return res.status(400).json({ success: false, error: 'case_id is required.' });
    }
    if (!db.prepare(`
      SELECT 1 FROM recovery_cases WHERE case_id = ? AND user_id = ?
    `).get(caseId, req.user.user_id)) {
      return res.status(404).json({ success: false, error: 'Recovery case not found.' });
    }
    const rows = db.prepare(`
      SELECT recovery_documents.*,
        applications.reference_number AS application_reference_number
      FROM recovery_documents
      LEFT JOIN applications ON applications.application_id = recovery_documents.application_id
      WHERE recovery_documents.case_id = ? AND recovery_documents.user_id = ?
      ORDER BY recovery_documents.uploaded_at DESC
    `).all(caseId, req.user.user_id);
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error listing recovery documents:', error);
    res.status(500).json({ success: false, error: 'Unable to fetch recovery documents.' });
  }
});

router.post('/', upload.single('document'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'Choose a document to upload.' });
    const detected = inspectUploadedDocument(req.file);
    if (detected.error) return res.status(400).json({ success: false, error: detected.error });

    const caseId = text(req.body.case_id, 'case_id', 100, { required: true });
    const category = text(req.body.category || 'OTHER', 'category', 40, { required: true });
    const description = text(req.body.description, 'description', 1000);
    const applicationId = req.body.application_id
      ? text(req.body.application_id, 'application_id', 100, { required: true })
      : { value: null };
    const invalid = [caseId, category, description, applicationId].find((result) => result.error);
    if (invalid) return res.status(400).json({ success: false, error: invalid.error });
    if (!categories.has(category.value)) {
      return res.status(400).json({ success: false, error: 'Unsupported document category.' });
    }
    if (!db.prepare(`
      SELECT 1 FROM recovery_cases WHERE case_id = ? AND user_id = ?
    `).get(caseId.value, req.user.user_id)) {
      return res.status(404).json({ success: false, error: 'Recovery case not found.' });
    }
    const applicationError = validateApplication(applicationId.value, caseId.value, req.user.user_id);
    if (applicationError) return res.status(404).json({ success: false, error: applicationError });

    const documentId = `DOC-${crypto.randomUUID()}`;
    const storedName = `${documentId}${detected.value.extension}`;
    const document = {
      document_id: documentId,
      user_id: req.user.user_id,
      case_id: caseId.value,
      application_id: applicationId.value,
      original_filename: detected.value.originalFilename,
      stored_name: storedName,
      media_type: detected.value.mediaType,
      file_size: req.file.size,
      category: category.value,
      description: description.value
    };
    saveUploadedDocument({
      db,
      document,
      buffer: req.file.buffer,
      storage: privateDocumentStorage,
      createRecord: () => {
        db.prepare(`
          INSERT INTO recovery_documents (
            document_id, user_id, case_id, application_id, original_filename,
            stored_name, media_type, file_size, category, description
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          documentId,
          req.user.user_id,
          caseId.value,
          applicationId.value,
          detected.value.originalFilename,
          storedName,
          detected.value.mediaType,
          req.file.size,
          category.value,
          description.value
        );
      }
    });
    const created = ownedDocument(documentId, req.user.user_id);
    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    console.error('Error saving private recovery document:', error.message);
    return res.status(500).json({ success: false, error: 'Unable to save the uploaded document.' });
  }
});

router.get('/:id/download', (req, res) => {
  const document = ownedDocument(req.params.id, req.user.user_id);
  if (!document) return res.status(404).json({ success: false, error: 'Document not found.' });
  return sendFileResponse(res, document, 'attachment');
});

router.get('/:id/preview', (req, res) => {
  const document = ownedDocument(req.params.id, req.user.user_id);
  if (!document) return res.status(404).json({ success: false, error: 'Document not found.' });
  if (!document.media_type.startsWith('image/')) {
    return res.status(415).json({ success: false, error: 'Only stored images can be previewed.' });
  }
  return sendFileResponse(res, document, 'inline');
});

router.put('/:id', (req, res) => {
  try {
    if (!isRecord(req.body)) {
      return res.status(400).json({ success: false, error: 'Request body must be an object.' });
    }
    const existing = ownedDocument(req.params.id, req.user.user_id);
    if (!existing) return res.status(404).json({ success: false, error: 'Document not found.' });
    const category = text(req.body.category ?? existing.category, 'category', 40, { required: true });
    const description = text(req.body.description ?? existing.description, 'description', 1000);
    const applicationId = req.body.application_id === undefined
      ? { value: existing.application_id }
      : req.body.application_id == null || req.body.application_id === ''
        ? { value: null }
        : text(req.body.application_id, 'application_id', 100, { required: true });
    const invalid = [category, description, applicationId].find((result) => result.error);
    if (invalid) return res.status(400).json({ success: false, error: invalid.error });
    if (!categories.has(category.value)) {
      return res.status(400).json({ success: false, error: 'Unsupported document category.' });
    }
    const applicationError = validateApplication(applicationId.value, existing.case_id, req.user.user_id);
    if (applicationError) return res.status(404).json({ success: false, error: applicationError });
    db.prepare(`
      UPDATE recovery_documents SET category = ?, description = ?, application_id = ?
      WHERE document_id = ? AND user_id = ?
    `).run(category.value, description.value, applicationId.value, req.params.id, req.user.user_id);
    res.json({ success: true, data: ownedDocument(req.params.id, req.user.user_id) });
  } catch (error) {
    console.error('Error updating recovery document metadata:', error.message);
    res.status(500).json({ success: false, error: 'Unable to update document details.' });
  }
});

router.delete('/:id', (req, res) => {
  const document = ownedDocument(req.params.id, req.user.user_id);
  if (!document) return res.status(404).json({ success: false, error: 'Document not found.' });
  try {
    deletePrivateDocument({
      db,
      document,
      userId: req.user.user_id,
      storage: privateDocumentStorage
    });
  } catch (error) {
    console.error('Error deleting private recovery document:', error.message);
    if (error instanceof DocumentFileMissingError) {
      return res.status(409).json({
        success: false,
        error: 'The stored document file is missing; its record was preserved for investigation.'
      });
    }
    if (error instanceof DocumentCleanupPendingError) {
      return res.status(500).json({ success: false, error: error.message });
    }
    return res.status(500).json({ success: false, error: 'Unable to delete the document.' });
  }
  return res.json({ success: true });
});

export default router;
