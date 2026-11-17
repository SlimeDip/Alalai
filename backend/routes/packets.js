import express from 'express';
import db from '../database.js';
import { privateDocumentStorage } from '../services/privateDocuments.js';
import { acquireDocumentLifecycleLock } from '../services/documentLifecycleLock.js';
import { generateRecoveryPacket } from '../services/recoveryPacket.js';

const router = express.Router();
const MAX_SELECTED_DOCUMENTS = 10;
const MAX_SELECTED_BYTES = 20 * 1024 * 1024;
const MAX_PACKET_BYTES = 40 * 1024 * 1024;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

router.post('/', async (req, res) => {
  try {
    if (!isRecord(req.body)) {
      return res.status(400).json({ success: false, error: 'Request body must be an object.' });
    }
    const { application_id: applicationId, document_ids: documentIds = [] } = req.body;
    if (typeof applicationId !== 'string' || !applicationId.trim()) {
      return res.status(400).json({ success: false, error: 'application_id is required.' });
    }
    if (
      !Array.isArray(documentIds)
      || documentIds.length > MAX_SELECTED_DOCUMENTS
      || documentIds.some((id) => typeof id !== 'string' || !id.trim())
      || new Set(documentIds).size !== documentIds.length
    ) {
      return res.status(400).json({
        success: false,
        error: `document_ids must contain up to ${MAX_SELECTED_DOCUMENTS} unique document IDs.`
      });
    }

    const application = db.prepare(`
      SELECT * FROM applications
      WHERE application_id = ? AND user_id = ?
    `).get(applicationId, req.user.user_id);
    if (!application) return res.status(404).json({ success: false, error: 'Saved application not found.' });
    if (!application.case_id) {
      return res.status(400).json({ success: false, error: 'This saved application is not linked to a recovery case.' });
    }
    const recoveryCase = db.prepare(`
      SELECT * FROM recovery_cases
      WHERE case_id = ? AND user_id = ?
    `).get(application.case_id, req.user.user_id);
    if (!recoveryCase) return res.status(404).json({ success: false, error: 'Recovery case not found.' });

    let documents = [];
    if (documentIds.length) {
      const placeholders = documentIds.map(() => '?').join(', ');
      documents = db.prepare(`
        SELECT * FROM recovery_documents
        WHERE user_id = ? AND case_id = ? AND document_id IN (${placeholders})
      `).all(req.user.user_id, application.case_id, ...documentIds);
      if (documents.length !== documentIds.length) {
        return res.status(404).json({
          success: false,
          error: 'One or more selected documents are not available for this application case.'
        });
      }
    }
    const selectedBytes = documents.reduce((total, document) => total + document.file_size, 0);
    if (selectedBytes > MAX_SELECTED_BYTES) {
      return res.status(413).json({ success: false, error: 'Selected documents exceed the 20 MB packet input limit.' });
    }

    let files;
    privateDocumentStorage.inspectRoot();
    const lifecycleLock = acquireDocumentLifecycleLock({
      root: privateDocumentStorage.root,
      mode: 'shared'
    });
    try {
      files = documents.map((document) => {
        try {
          return {
            ...document,
            buffer: privateDocumentStorage.readDocument(document.stored_name)
          };
        } catch (error) {
          console.error(`Unable to read selected private document ${document.document_id}:`, error.message);
          if (error.code === 'ENOENT'
            || (typeof error.code === 'string' && error.code.startsWith('DOCUMENT_FILE_'))
            || error.code === 'DOCUMENT_NOT_REGULAR_FILE') {
            return { ...document, buffer: null };
          }
          throw error;
        }
      });
    } finally {
      lifecycleLock.release();
    }
    const losses = db.prepare(`
      SELECT item_name, condition, estimated_loss_php, description
      FROM loss_records WHERE case_id = ? ORDER BY created_at ASC, loss_record_id ASC
    `).all(recoveryCase.case_id);

    const packet = await generateRecoveryPacket({
      application,
      recoveryCase,
      losses,
      documents: files
    });
    if (packet.byteLength > MAX_PACKET_BYTES) {
      return res.status(413).json({ success: false, error: 'Generated packet exceeds the 40 MB download limit.' });
    }
    const filename = `Alalai-${application.reference_number}`
      .replace(/[^a-z0-9._-]/gi, '_') + '.pdf';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', packet.byteLength);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.send(Buffer.from(packet));
  } catch (error) {
    console.error('Error generating recovery packet:', error.message);
    return res.status(500).json({ success: false, error: 'Unable to generate the saved recovery packet.' });
  }
});

export default router;
