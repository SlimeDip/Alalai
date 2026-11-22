import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isStoragePathReparsePoint,
  validatePrivateStoragePermissions,
  validatePrivateStorageProvisioningParents,
  validateStoragePathReparsePoints
} from './privateStorageSecurity.js';

const serviceDirectory = path.dirname(fileURLToPath(import.meta.url));
export const privateDocumentRoot = path.resolve(
  process.env.PRIVATE_DOCUMENTS_DIR
    || (
      process.platform === 'win32' && process.env.LOCALAPPDATA
        ? path.join(process.env.LOCALAPPDATA, 'WebSysGroup12', 'private-documents')
        : path.join(serviceDirectory, '..', 'private-documents')
    )
);

const allowedTypes = new Map([
  ['.jpg', { mediaType: 'image/jpeg', extension: '.jpg' }],
  ['.jpeg', { mediaType: 'image/jpeg', extension: '.jpg' }],
  ['.png', { mediaType: 'image/png', extension: '.png' }],
  ['.webp', { mediaType: 'image/webp', extension: '.webp' }],
  ['.pdf', { mediaType: 'application/pdf', extension: '.pdf' }]
]);

function validPng(buffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length < 45 || !buffer.subarray(0, 8).equals(signature)) return false;
  let offset = 8;
  let hasHeader = false;
  let hasImageData = false;
  let hasEnd = false;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    if (length > buffer.length - offset - 12) return false;
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    if (!hasHeader) {
      if (type !== 'IHDR' || length !== 13) return false;
      const width = buffer.readUInt32BE(offset + 8);
      const height = buffer.readUInt32BE(offset + 12);
      if (!width || !height || width > 8000 || height > 8000 || width * height > 16000000) return false;
      hasHeader = true;
    }
    if (type === 'IDAT') hasImageData = true;
    offset += length + 12;
    if (type === 'IEND') {
      hasEnd = length === 0;
      break;
    }
  }
  return hasHeader && hasImageData && hasEnd && offset === buffer.length;
}

function validWebp(buffer) {
  if (
    buffer.length < 20
    || buffer.toString('ascii', 0, 4) !== 'RIFF'
    || buffer.toString('ascii', 8, 12) !== 'WEBP'
    || buffer.readUInt32LE(4) !== buffer.length - 8
  ) return false;
  const chunkSize = buffer.readUInt32LE(16);
  const chunkType = buffer.toString('ascii', 12, 16);
  const minimumChunkSize = chunkType === 'VP8 ' || chunkType === 'VP8X'
    ? 10
    : chunkType === 'VP8L' ? 5 : Number.POSITIVE_INFINITY;
  if (chunkType === 'VP8 ' && buffer.toString('hex', 23, 26) !== '9d012a') return false;
  if (chunkType === 'VP8L' && buffer[20] !== 0x2f) return false;
  return chunkSize >= minimumChunkSize
    && chunkSize <= buffer.length - 20
    && 20 + chunkSize + (chunkSize % 2) === buffer.length;
}

export function inspectUploadedDocument(file) {
  const originalName = String(file.originalname || '').replace(/\\/g, '/').split('/').pop();
  const safeOriginalName = (originalName || 'document')
    .replace(/[\u0000-\u001f\u007f]/g, '_')
    .trim()
    .slice(0, 255) || 'document';
  const extension = path.extname(safeOriginalName).toLowerCase();
  const expected = allowedTypes.get(extension);
  if (!expected) return { error: 'Supported file types are JPG, PNG, WebP, and PDF.' };

  const { buffer } = file;
  const isJpeg = buffer.length >= 4
    && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
    && buffer[buffer.length - 2] === 0xff && buffer[buffer.length - 1] === 0xd9;
  const isPng = validPng(buffer);
  const isWebp = validWebp(buffer);
  const isPdf = buffer.length >= 10
    && buffer.toString('ascii', 0, 5) === '%PDF-'
    && buffer.toString('ascii', Math.max(0, buffer.length - 1024)).includes('%%EOF');
  const actualType = isJpeg
    ? 'image/jpeg'
    : isPng
      ? 'image/png'
      : isWebp
        ? 'image/webp'
        : isPdf ? 'application/pdf' : null;
  if (!actualType || actualType !== expected.mediaType) {
    return { error: 'The file content does not match its supported extension.' };
  }
  return {
    value: {
      originalFilename: safeOriginalName,
      mediaType: expected.mediaType,
      extension: expected.extension
    }
  };
}

function storageError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function pathEquals(left, right) {
  const normalizedLeft = path.normalize(left);
  const normalizedRight = path.normalize(right);
  return process.platform === 'win32'
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

function inspectPathComponents(target, fileSystem = fs, checkAllReparsePoints = true) {
  const absolute = path.resolve(target);
  const parsed = path.parse(absolute);
  const components = absolute.slice(parsed.root.length).split(/[\\/]+/).filter(Boolean);
  let current = parsed.root;
  const componentPaths = [];

  for (let index = 0; index < components.length; index += 1) {
    current = path.join(current, components[index]);
    const details = fileSystem.lstatSync(current);
    if (details.isSymbolicLink()) {
      throw storageError('Private document storage cannot contain symbolic links or reparse points.', 'DOCUMENT_STORAGE_REPARSE_POINT');
    }
    componentPaths.push(current);
    if (index < components.length - 1 && !details.isDirectory()) {
      throw storageError('A private document storage path component is not a directory.', 'DOCUMENT_STORAGE_ROOT_INVALID');
    }
  }
  if (checkAllReparsePoints) validateStoragePathReparsePoints(componentPaths);

  const rootDetails = fileSystem.lstatSync(absolute);
  if (!rootDetails.isDirectory()) {
    throw storageError('Private document storage root is not a directory.', 'DOCUMENT_STORAGE_ROOT_INVALID');
  }
  const realpath = fileSystem.realpathSync.native
    ? fileSystem.realpathSync.native(absolute)
    : fileSystem.realpathSync(absolute);
  if (!pathEquals(realpath, absolute)) {
    throw storageError('Private document storage root is not at its configured canonical path.', 'DOCUMENT_STORAGE_ROOT_INVALID');
  }
  return { absolute, realpath, details: rootDetails };
}

export function validatePrivateStorageRoot(root, { checkAllReparsePoints = true } = {}) {
  return inspectPathComponents(root, fs, checkAllReparsePoints);
}

export function createPrivateDocumentStorage({
  root = privateDocumentRoot,
  fileSystem = fs
} = {}) {
  const resolvedRoot = path.resolve(root);
  let canonicalRoot;
  let rootIdentity;

  function identity(details) {
    return { device: String(details.dev), inode: String(details.ino) };
  }

  function sameFileIdentity(left, right) {
    return left.device === right.device && left.inode === right.inode;
  }

  function validateRoot() {
    const inspected = inspectPathComponents(resolvedRoot, fileSystem, !canonicalRoot);
    const currentIdentity = identity(inspected.details);
    if (canonicalRoot && (
      !pathEquals(inspected.realpath, canonicalRoot)
      || !sameFileIdentity(currentIdentity, rootIdentity)
    )) {
      throw storageError('Private document storage root changed after initialization.', 'DOCUMENT_STORAGE_ROOT_CHANGED');
    }
    if (!canonicalRoot) {
      canonicalRoot = inspected.realpath;
      rootIdentity = currentIdentity;
    }
    return canonicalRoot;
  }

  function validateStoredName(storedName) {
    if (typeof storedName !== 'string'
      || !/^DOC-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\.(jpg|png|webp|pdf)$/i.test(storedName)) {
      const error = new TypeError('Invalid private document identifier.');
      error.code = 'DOCUMENT_STORAGE_PATH_INVALID';
      throw error;
    }
    return storedName;
  }

  function validateManagedPath(filepath) {
    const activeRoot = validateRoot();
    const resolved = path.resolve(filepath);
    if (!pathEquals(path.dirname(resolved), activeRoot)) {
      throw storageError('Private document path is outside the configured storage root.', 'DOCUMENT_STORAGE_PATH_INVALID');
    }
    const name = path.basename(resolved);
    if (
      !/^DOC-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\.(jpg|png|webp|pdf)$/i.test(name)
      && !/^TOMB-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\.bin$/i.test(name)
    ) {
      throw storageError('Invalid private document path.', 'DOCUMENT_STORAGE_PATH_INVALID');
    }
    return resolved;
  }

  function inspectRegularFile(filepath) {
    const managedPath = validateManagedPath(filepath);
    const details = fileSystem.lstatSync(managedPath);
    if (isStoragePathReparsePoint(managedPath, details)) {
      throw storageError('Private document files cannot be symbolic links or reparse points.', 'DOCUMENT_FILE_REPARSE_POINT');
    }
    if (!details.isFile()) {
      throw storageError('Stored document is not a regular file.', 'DOCUMENT_NOT_REGULAR_FILE');
    }
    return details;
  }

  function documentPath(storedName) {
    validateStoredName(storedName);
    return path.join(validateRoot(), storedName);
  }

  function tombstonePath(operationId) {
    if (typeof operationId !== 'string'
      || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(operationId)) {
      const error = new TypeError('Invalid document operation identifier.');
      error.code = 'DOCUMENT_STORAGE_PATH_INVALID';
      throw error;
    }
    return path.join(validateRoot(), `TOMB-${operationId}.bin`);
  }

  function fileIdentity(filepath) {
    return identity(inspectRegularFile(filepath));
  }

  function provisionDirectory() {
    const parsed = path.parse(resolvedRoot);
    const components = resolvedRoot.slice(parsed.root.length).split(/[\\/]+/).filter(Boolean);
    let current = parsed.root;
    validatePrivateStorageProvisioningParents(resolvedRoot);
    for (const component of components) {
      current = path.join(current, component);
      try {
        const details = fileSystem.lstatSync(current);
        if (details.isSymbolicLink()) {
          throw storageError('Private document storage cannot contain symbolic links or reparse points.', 'DOCUMENT_STORAGE_REPARSE_POINT');
        }
        if (!details.isDirectory()) {
          throw storageError('A private document storage path component is not a directory.', 'DOCUMENT_STORAGE_ROOT_INVALID');
        }
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        fileSystem.mkdirSync(current, { mode: 0o700 });
        const created = fileSystem.lstatSync(current);
        if (created.isSymbolicLink() || !created.isDirectory()) {
          throw storageError('Private document storage directory could not be safely provisioned.', 'DOCUMENT_STORAGE_ROOT_INVALID');
        }
      }
    }
    validateRoot();
  }

  return {
    root: resolvedRoot,
    documentPath,
    tombstonePath,
    fileIdentity,
    sameIdentity(filepath, expected) {
      return sameFileIdentity(fileIdentity(filepath), expected);
    },
    ensureDirectory: provisionDirectory,
    validateRoot,
    validatePermissions() {
      validateRoot();
      validatePrivateStoragePermissions(resolvedRoot);
    },
    readDocument(storedName) {
      const filepath = documentPath(storedName);
      const before = inspectRegularFile(filepath);
      const noFollow = fileSystem.constants.O_NOFOLLOW || 0;
      const nonBlocking = fileSystem.constants.O_NONBLOCK || 0;
      let descriptor;
      try {
        descriptor = fileSystem.openSync(
          filepath,
          fileSystem.constants.O_RDONLY | noFollow | nonBlocking
        );
        const opened = fileSystem.fstatSync(descriptor);
        if (!opened.isFile() || !sameFileIdentity(identity(before), identity(opened))) {
          throw storageError('Private document changed while it was being opened.', 'DOCUMENT_FILE_CHANGED');
        }
        const leafAfterOpen = inspectRegularFile(filepath);
        if (!sameFileIdentity(identity(opened), identity(leafAfterOpen))) {
          throw storageError('Private document changed while it was being opened.', 'DOCUMENT_FILE_CHANGED');
        }
        const buffer = fileSystem.readFileSync(descriptor);
        const afterRead = fileSystem.fstatSync(descriptor);
        if (
          !afterRead.isFile()
          || !sameFileIdentity(identity(opened), identity(afterRead))
          || opened.size !== afterRead.size
          || opened.mtimeMs !== afterRead.mtimeMs
          || opened.ctimeMs !== afterRead.ctimeMs
        ) {
          throw storageError('Private document changed while it was being read.', 'DOCUMENT_FILE_CHANGED');
        }
        const leafAfterRead = inspectRegularFile(filepath);
        if (!sameFileIdentity(identity(afterRead), identity(leafAfterRead))) {
          throw storageError('Private document path changed while it was being read.', 'DOCUMENT_FILE_CHANGED');
        }
        validateRoot();
        return buffer;
      } finally {
        if (descriptor !== undefined) fileSystem.closeSync(descriptor);
      }
    },
    inspectRoot() {
      validateRoot();
      return fileSystem.lstatSync(resolvedRoot);
    },
    inspect(filepath) {
      return inspectRegularFile(filepath);
    },
    link(from, to) {
      const source = validateManagedPath(from);
      const destination = validateManagedPath(to);
      inspectRegularFile(source);
      try {
        fileSystem.lstatSync(destination);
        throw storageError('Private document link destination already exists.', 'EEXIST');
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      validateRoot();
      fileSystem.linkSync(source, destination);
      if (!sameFileIdentity(fileIdentity(source), fileIdentity(destination))) {
        throw storageError('Private document link identity changed.', 'DOCUMENT_FILE_CHANGED');
      }
    },
    unlink(filepath) {
      const managedPath = validateManagedPath(filepath);
      const before = identity(inspectRegularFile(managedPath));
      validateRoot();
      const immediatelyBeforeUnlink = identity(inspectRegularFile(managedPath));
      if (!sameFileIdentity(before, immediatelyBeforeUnlink)) {
        throw storageError('Private document changed before removal.', 'DOCUMENT_FILE_CHANGED');
      }
      fileSystem.unlinkSync(managedPath);
    },
    write(storedName, buffer, onCreated) {
      const filepath = documentPath(storedName);
      validateRoot();
      let descriptor;
      let failure;
      try {
        descriptor = fileSystem.openSync(filepath, 'wx', 0o600);
        const details = fileSystem.fstatSync(descriptor);
        if (!details.isFile()) {
          throw storageError('New private document is not a regular file.', 'DOCUMENT_NOT_REGULAR_FILE');
        }
        onCreated?.({ device: String(details.dev), inode: String(details.ino) });
        fileSystem.writeFileSync(descriptor, buffer);
        fileSystem.fsyncSync(descriptor);
        validateRoot();
      } catch (error) {
        failure = error;
      }
      if (descriptor !== undefined) {
        try {
          fileSystem.closeSync(descriptor);
        } catch (error) {
          failure ||= error;
        }
      }
      if (failure) throw failure;
    }
  };
}

export const privateDocumentStorage = createPrivateDocumentStorage();
export const documentPath = (storedName) => privateDocumentStorage.documentPath(storedName);
export const ensurePrivateDocumentDirectory = () => privateDocumentStorage.ensureDirectory();
export const writePrivateDocument = (storedName, buffer, onCreated) => (
  privateDocumentStorage.write(storedName, buffer, onCreated)
);
