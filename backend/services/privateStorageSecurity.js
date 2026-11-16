import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const windowsInspectionScript = `
$ErrorActionPreference = 'Stop'
$paths = ConvertFrom-Json -InputObject $env:ALALAI_STORAGE_PATHS
$currentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$trustedSids = @(
  $currentSid,
  'S-1-5-18',
  'S-1-5-32-544',
  'S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464'
)
$writeMask = 2 -bor 4 -bor 16 -bor 64 -bor 256 -bor 65536 -bor 262144 -bor 524288
$results = foreach ($item in $paths) {
  $attributes = [IO.File]::GetAttributes([string]$item)
  $acl = Get-Acl -LiteralPath ([string]$item)
  $ownerSid = ([Security.Principal.NTAccount]$acl.Owner).Translate([Security.Principal.SecurityIdentifier]).Value
  $unsafeWriteAce = $false
  if ($env:ALALAI_CHECK_STORAGE_ACL -eq '1') {
    foreach ($ace in $acl.Access) {
      if ($ace.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow) {
        continue
      }
      $sid = $ace.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
      $rights = [int]$ace.FileSystemRights
      $isStorageRoot = $env:ALALAI_STORAGE_ROOT -and ([string]$item).Equals(
        $env:ALALAI_STORAGE_ROOT,
        [StringComparison]::OrdinalIgnoreCase
      )
      $relevantWriteMask = if ($isStorageRoot) {
        $writeMask
      } else {
        64 -bor 65536 -bor 262144 -bor 524288
      }
      if (($trustedSids -notcontains $sid) -and (($rights -band $relevantWriteMask) -ne 0)) {
        $unsafeWriteAce = $true
      }
    }
  }
  [pscustomobject]@{
    reparse = (($attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)
    unsafeWriteAce = $unsafeWriteAce
    unsafeOwner = ($trustedSids -notcontains $ownerSid)
  }
}
ConvertTo-Json -InputObject @($results) -Compress
`;

function inspectWindowsPaths(paths, checkAcl = false, storageRoot = '') {
  if (!paths.length) return [];
  const result = spawnSync('powershell.exe', [
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    windowsInspectionScript
  ], {
    encoding: 'utf8',
    windowsHide: true,
    env: {
      ...process.env,
      ALALAI_STORAGE_PATHS: JSON.stringify(paths),
      ALALAI_CHECK_STORAGE_ACL: checkAcl ? '1' : '0',
      ALALAI_STORAGE_ROOT: storageRoot
    }
  });
  if (result.error || result.status !== 0) {
    const error = new Error('Unable to verify Windows private-storage attributes or permissions.');
    error.code = 'DOCUMENT_STORAGE_VALIDATION_UNAVAILABLE';
    throw error;
  }
  let inspected;
  try {
    inspected = JSON.parse(result.stdout);
  } catch {
    const error = new Error('Windows private-storage validation returned an invalid result.');
    error.code = 'DOCUMENT_STORAGE_VALIDATION_UNAVAILABLE';
    throw error;
  }
  if (!Array.isArray(inspected) || inspected.length !== paths.length) {
    const error = new Error('Windows private-storage validation returned an incomplete result.');
    error.code = 'DOCUMENT_STORAGE_VALIDATION_UNAVAILABLE';
    throw error;
  }
  return inspected;
}

export function isStoragePathReparsePoint(filepath, details) {
  if (details.isSymbolicLink()) return true;
  if (process.platform !== 'win32') return false;
  return inspectWindowsPaths([filepath])[0].reparse;
}

export function validateStoragePathReparsePoints(paths) {
  if (process.platform !== 'win32') return;
  const inspected = inspectWindowsPaths(paths);
  if (inspected.some(({ reparse }) => reparse)) {
    const error = new Error('Private document storage cannot contain symbolic links or reparse points.');
    error.code = 'DOCUMENT_STORAGE_REPARSE_POINT';
    throw error;
  }
}

function posixStorageDirectories(root) {
  const absolute = path.resolve(root);
  const parsed = path.parse(absolute);
  const components = absolute.slice(parsed.root.length).split(/[\\/]+/).filter(Boolean);
  const paths = [parsed.root];
  let current = parsed.root;
  for (const component of components) {
    current = path.join(current, component);
    paths.push(current);
  }
  return { absolute, paths };
}

export function validatePrivateStoragePermissions(root) {
  const { absolute, paths } = posixStorageDirectories(root);
  validateDirectoryPermissions(paths, absolute);
}

export function validatePrivateStorageProvisioningParents(root) {
  const { absolute, paths } = posixStorageDirectories(root);
  const parents = paths.slice(0, -1);
  validateStoragePathReparsePoints(parents);
  const existing = [];
  for (const directoryPath of parents) {
    try {
      existing.push(directoryPath);
      fs.lstatSync(directoryPath);
    } catch (error) {
      existing.pop();
      if (error.code !== 'ENOENT') throw error;
      break;
    }
  }
  validateDirectoryPermissions(existing, null);
}

function validateDirectoryPermissions(paths, storageRoot) {
  if (process.platform === 'win32') {
    const volumeRoot = paths.find((directoryPath) => /^[A-Za-z]:\\$/.test(directoryPath));
    if (storageRoot && volumeRoot && path.resolve(storageRoot).toLowerCase() === volumeRoot.toLowerCase()) {
      const error = new Error('A Windows volume root cannot be used as private document storage.');
      error.code = 'DOCUMENT_STORAGE_PERMISSIONS_UNSAFE';
      throw error;
    }
    const permissionPaths = paths.filter((directoryPath) => !/^[A-Za-z]:\\$/.test(directoryPath));
    const inspected = inspectWindowsPaths(permissionPaths, true, storageRoot || '');
    if (inspected.some(({ unsafeWriteAce, unsafeOwner }) => unsafeWriteAce || unsafeOwner)) {
      const error = new Error('Private document storage or a parent directory grants write access to an untrusted Windows principal.');
      error.code = 'DOCUMENT_STORAGE_PERMISSIONS_UNSAFE';
      throw error;
    }
    return;
  }

  if (typeof process.getuid !== 'function') {
    const error = new Error('Cannot determine the service account for private storage permission checks.');
    error.code = 'DOCUMENT_STORAGE_PERMISSIONS_UNVERIFIABLE';
    throw error;
  }
  const serviceUid = process.getuid();
  for (let index = 0; index < paths.length; index += 1) {
    const directoryPath = paths[index];
    const details = fs.lstatSync(directoryPath);
    if (details.isSymbolicLink() || !details.isDirectory()) {
      const error = new Error('Private document storage permissions cannot be validated through a non-directory path.');
      error.code = 'DOCUMENT_STORAGE_PERMISSIONS_UNVERIFIABLE';
      throw error;
    }
    const isStorageRoot = directoryPath === storageRoot;
    const mode = details.mode & 0o7777;
    const groupWritable = Boolean(mode & 0o020);
    const worldWritable = Boolean(mode & 0o002);
    const sticky = Boolean(mode & 0o1000);
    const allowedStickyParent = !isStorageRoot && sticky && worldWritable && !groupWritable;
    if (
      groupWritable
      || (worldWritable && !allowedStickyParent)
      || (details.uid !== serviceUid && details.uid !== 0)
      || (isStorageRoot && Boolean(mode & 0o022))
    ) {
      const error = new Error('Private document storage or a parent directory is writable by an untrusted user or group.');
      error.code = 'DOCUMENT_STORAGE_PERMISSIONS_UNSAFE';
      throw error;
    }
  }
}

export function validatePrivateStorageFilePermissions(filepath) {
  const absolute = path.resolve(filepath);
  if (process.platform === 'win32') {
    const inspected = inspectWindowsPaths([absolute], true, absolute);
    if (inspected[0].unsafeWriteAce || inspected[0].unsafeOwner) {
      const error = new Error('The private storage lock file grants write access to an untrusted Windows principal.');
      error.code = 'DOCUMENT_STORAGE_PERMISSIONS_UNSAFE';
      throw error;
    }
    return;
  }

  if (typeof process.getuid !== 'function') {
    const error = new Error('Cannot determine the service account for private storage permission checks.');
    error.code = 'DOCUMENT_STORAGE_PERMISSIONS_UNVERIFIABLE';
    throw error;
  }
  const details = fs.lstatSync(absolute);
  if (
    details.isSymbolicLink()
    || !details.isFile()
    || details.uid !== process.getuid()
    || Boolean(details.mode & 0o022)
  ) {
    const error = new Error('The private storage lock file is not restricted to the service account.');
    error.code = 'DOCUMENT_STORAGE_PERMISSIONS_UNSAFE';
    throw error;
  }
}
