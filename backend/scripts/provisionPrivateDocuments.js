import { ensureLifecycleLockDatabase } from '../services/documentLifecycleLock.js';
import { privateDocumentRoot, privateDocumentStorage } from '../services/privateDocuments.js';

if (process.argv.length !== 3 || process.argv[2] !== '--confirm') {
  console.error('Usage: node backend/scripts/provisionPrivateDocuments.js --confirm');
  process.exit(2);
}

try {
  privateDocumentStorage.ensureDirectory();
  privateDocumentStorage.validatePermissions();
  ensureLifecycleLockDatabase(privateDocumentRoot);
  console.log('Private document storage and lifecycle lock are provisioned and validated.');
} catch (error) {
  console.error(`Private document storage provisioning failed: ${error.message}`);
  process.exitCode = 1;
}
