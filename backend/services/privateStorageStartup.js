import { validateLifecycleLockDatabase } from './documentLifecycleLock.js';
import {
  privateDocumentRoot,
  privateDocumentStorage
} from './privateDocuments.js';

export function validatePrivateDocumentStorageForStartup({
  root = privateDocumentRoot,
  storage = privateDocumentStorage
} = {}) {
  storage.ensureDirectory();
  storage.validatePermissions();
  validateLifecycleLockDatabase(root);
}
