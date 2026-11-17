import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, beforeEach, test } from 'node:test';
import {
  acquireDocumentLifecycleLock,
  ensureLifecycleLockDatabase
} from '../services/documentLifecycleLock.js';

const lockModuleUrl = pathToFileURL(
  fileURLToPath(new URL('../services/documentLifecycleLock.js', import.meta.url))
).href;
const childCode = `
  import { acquireDocumentLifecycleLock } from ${JSON.stringify(lockModuleUrl)};
  const [root, mode, action] = process.argv.slice(1);
  try {
    const lock = acquireDocumentLifecycleLock({ root, mode });
    console.log('acquired');
    if (action === 'hold') {
      process.stdin.once('data', () => {
        lock.release();
        console.log('released');
      });
    } else {
      lock.release();
    }
  } catch (error) {
    console.log(error.code || error.message);
    process.exitCode = 3;
  }
`;

let temporaryDirectory;
let storageDirectory;

function probe(mode) {
  return spawnSync(process.execPath, ['--input-type=module', '-e', childCode, storageDirectory, mode], {
    encoding: 'utf8'
  });
}

function startHolder(mode) {
  const child = spawn(
    process.execPath,
    ['--input-type=module', '-e', childCode, storageDirectory, mode, 'hold'],
    { stdio: ['pipe', 'pipe', 'pipe'] }
  );
  return new Promise((resolve, reject) => {
    let output = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      output += chunk;
      if (output.includes('acquired')) resolve({ child, output: () => output });
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (!output.includes('acquired')) reject(new Error(`Lock child exited ${code}: ${output}`));
    });
  });
}

function releaseHolder(child) {
  return new Promise((resolve, reject) => {
    child.once('exit', (code) => (
      code === 0 ? resolve() : reject(new Error(`Lock child exited ${code}`))
    ));
    child.stdin.end('release');
  });
}

beforeEach(async () => {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'alalai-lifecycle-lock-'));
  storageDirectory = path.join(temporaryDirectory, 'private-documents');
  fs.mkdirSync(storageDirectory);
  ensureLifecycleLockDatabase(storageDirectory);
});

afterEach(async () => {
  await rm(temporaryDirectory, { recursive: true, force: true });
});

test('shared lifecycle lock blocks exclusive recovery in another process', async () => {
  const holder = await startHolder('shared');
  try {
    assert.equal(probe('shared').status, 0);
    const blocked = probe('exclusive');
    assert.equal(blocked.status, 3);
    assert.match(blocked.stdout, /DOCUMENT_LIFECYCLE_LOCK_BUSY/);
  } finally {
    await releaseHolder(holder.child);
  }
  assert.equal(probe('exclusive').status, 0);
});

test('exclusive recovery blocks shared work and competing recovery processes', async () => {
  const holder = await startHolder('exclusive');
  try {
    assert.equal(probe('shared').status, 3);
    assert.equal(probe('exclusive').status, 3);
  } finally {
    await releaseHolder(holder.child);
  }
  assert.equal(probe('shared').status, 0);
  assert.equal(probe('exclusive').status, 0);
});

test('kernel lock is released when its owning process exits without release', async () => {
  const child = spawn(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import { acquireDocumentLifecycleLock } from ${JSON.stringify(lockModuleUrl)};
       acquireDocumentLifecycleLock({ root: process.argv[1], mode: 'shared' });
       process.stdout.write('acquired\\n', () => process.exit(17));`,
      storageDirectory
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );
  await new Promise((resolve, reject) => {
    child.stdout.once('data', (chunk) => {
      assert.match(chunk.toString(), /acquired/);
      resolve();
    });
    child.once('error', reject);
  });
  await new Promise((resolve, reject) => {
    child.once('exit', (code) => (code === 17 ? resolve() : reject(new Error(`exit ${code}`))));
  });
  assert.equal(probe('exclusive').status, 0);
});

test('lock acquisition and release can be repeated without replacing the lock database', () => {
  const firstLock = acquireDocumentLifecycleLock({ root: storageDirectory, mode: 'shared' });
  const secondLock = acquireDocumentLifecycleLock({ root: storageDirectory, mode: 'shared' });
  firstLock.release();
  firstLock.release();
  secondLock.release();
  assert.equal(probe('exclusive').status, 0);
});
