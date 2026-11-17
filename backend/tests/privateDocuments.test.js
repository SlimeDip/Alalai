import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { createPrivateDocumentStorage } from '../services/privateDocuments.js';

const storedName = 'DOC-123e4567-e89b-12d3-a456-426614174000.pdf';

let temporaryDirectory;
let storageRoot;
let storage;

function createSymlink(target, link, type) {
  fs.symlinkSync(target, link, process.platform === 'win32' ? type : undefined);
}

function unsupportedSymlinkError(error) {
  return process.platform === 'win32' && ['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code);
}

beforeEach(async () => {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'alalai-private-storage-'));
  storageRoot = path.join(temporaryDirectory, 'private-documents');
  fs.mkdirSync(storageRoot);
  storage = createPrivateDocumentStorage({ root: storageRoot });
});

afterEach(async () => {
  await rm(temporaryDirectory, { recursive: true, force: true });
});

test('rejects a storage root that is a symlink or reparse point', (t) => {
  const actualRoot = path.join(temporaryDirectory, 'actual-root');
  const linkedRoot = path.join(temporaryDirectory, 'linked-root');
  fs.mkdirSync(actualRoot);
  try {
    createSymlink(actualRoot, linkedRoot, 'junction');
  } catch (error) {
    if (unsupportedSymlinkError(error)) {
      t.skip('The current Windows account cannot create a directory symlink or junction.');
      return;
    }
    throw error;
  }
  const linkedStorage = createPrivateDocumentStorage({ root: linkedRoot });
  assert.throws(() => linkedStorage.inspectRoot(), { code: 'DOCUMENT_STORAGE_REPARSE_POINT' });
});

test('rejects a symlinked parent directory in the configured storage path', (t) => {
  const actualParent = path.join(temporaryDirectory, 'actual-parent');
  const linkedParent = path.join(temporaryDirectory, 'linked-parent');
  fs.mkdirSync(actualParent);
  fs.mkdirSync(path.join(actualParent, 'private-documents'));
  try {
    createSymlink(actualParent, linkedParent, 'junction');
  } catch (error) {
    if (unsupportedSymlinkError(error)) {
      t.skip('The current Windows account cannot create a directory symlink or junction.');
      return;
    }
    throw error;
  }
  const linkedStorage = createPrivateDocumentStorage({
    root: path.join(linkedParent, 'private-documents')
  });
  assert.throws(() => linkedStorage.inspectRoot(), { code: 'DOCUMENT_STORAGE_REPARSE_POINT' });
});

test('rejects a document symlink without reading its external target', (t) => {
  const externalPath = path.join(temporaryDirectory, 'outside.pdf');
  const documentPath = storage.documentPath(storedName);
  const externalContents = Buffer.from('outside private storage');
  fs.writeFileSync(externalPath, externalContents);
  try {
    createSymlink(externalPath, documentPath, 'file');
  } catch (error) {
    if (unsupportedSymlinkError(error)) {
      t.skip('The current Windows account cannot create a file symlink.');
      return;
    }
    throw error;
  }
  assert.throws(() => storage.readDocument(storedName), { code: 'DOCUMENT_FILE_REPARSE_POINT' });
  assert.throws(() => storage.inspect(documentPath), { code: 'DOCUMENT_FILE_REPARSE_POINT' });
  assert.deepEqual(fs.readFileSync(externalPath), externalContents);
});

test('rejects a reparse-point or symlink directory at the document leaf', (t) => {
  const externalDirectory = path.join(temporaryDirectory, 'outside-directory');
  const documentPath = storage.documentPath(storedName);
  fs.mkdirSync(externalDirectory);
  try {
    createSymlink(externalDirectory, documentPath, 'junction');
  } catch (error) {
    if (unsupportedSymlinkError(error)) {
      t.skip('The current Windows account cannot create a directory symlink or junction.');
      return;
    }
    throw error;
  }
  assert.throws(() => storage.readDocument(storedName), { code: 'DOCUMENT_FILE_REPARSE_POINT' });
});

test('rejects a non-regular document leaf', () => {
  fs.mkdirSync(storage.documentPath(storedName));
  assert.throws(() => storage.readDocument(storedName), { code: 'DOCUMENT_NOT_REGULAR_FILE' });
});

test('detects storage-root disappearance and replacement after initialization', () => {
  storage.inspectRoot();
  const displacedRoot = `${storageRoot}-displaced`;
  fs.renameSync(storageRoot, displacedRoot);
  assert.throws(() => storage.inspectRoot(), { code: 'ENOENT' });
  fs.mkdirSync(storageRoot);
  assert.throws(() => storage.inspectRoot(), { code: 'DOCUMENT_STORAGE_ROOT_CHANGED' });
});

test('reads an ordinary generated document through a validated regular-file handle', () => {
  const contents = Buffer.from('valid private document bytes');
  fs.writeFileSync(storage.documentPath(storedName), contents);
  assert.deepEqual(storage.readDocument(storedName), contents);
});
