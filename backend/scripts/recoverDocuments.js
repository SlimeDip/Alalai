import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { recoverDocumentOperations } from '../services/documentLifecycle.js';
import { createPrivateDocumentStorage } from '../services/privateDocuments.js';

const args = new Set(process.argv.slice(2));
if (args.has('--help')) {
  console.log('Usage: node backend/scripts/recoverDocuments.js [--dry-run | --apply]');
  process.exit(0);
}
if ([...args].some((argument) => !['--dry-run', '--apply'].includes(argument))
  || (args.has('--dry-run') && args.has('--apply'))) {
  console.error('Choose either --dry-run or --apply.');
  process.exit(2);
}

const dryRun = !args.has('--apply');
const databaseSetting = process.env.DISASTER_RELIEF_DB_PATH;
const storageSetting = process.env.PRIVATE_DOCUMENTS_DIR;
if (!databaseSetting || !storageSetting) {
  console.error('Set DISASTER_RELIEF_DB_PATH and PRIVATE_DOCUMENTS_DIR explicitly.');
  process.exit(2);
}

const databasePath = path.resolve(databaseSetting);
const storagePath = path.resolve(storageSetting);
if (!fs.existsSync(databasePath)) {
  console.error('The configured database file does not exist.');
  process.exit(2);
}

let db;
try {
  db = new Database(databasePath, {
    readonly: dryRun,
    fileMustExist: true
  });
  db.pragma('foreign_keys = ON');
  const tables = new Set(db.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table'
  `).pluck().all());
  if (!tables.has('document_lifecycle_operations') || !tables.has('recovery_document_cleanup')) {
    throw new Error('Document lifecycle tables are missing; run the normal application migration separately.');
  }
  const storage = createPrivateDocumentStorage({ root: storagePath });
  const report = recoverDocumentOperations({ db, storage, dryRun });
  console.log(JSON.stringify(report, null, 2));
  if (report.operations.some((operation) => operation.status === 'manual_review')) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`Document recovery failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  db?.close();
}
