import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import {
  readSavedApplications,
  saveBrowserApplication,
  saveAccountApplication
} from '../../frontend/src/utils/applicationStorage.js';

const originalStorage = globalThis.localStorage;
const originalFetch = globalThis.fetch;
let storedValue = null;

beforeEach(() => {
  storedValue = null;
  globalThis.fetch = originalFetch;
  globalThis.localStorage = {
    getItem(key) {
      return key === 'alalai_applications' ? storedValue : null;
    },
    setItem(key, value) {
      if (key === 'alalai_applications') storedValue = value;
    }
  };
});

test('guest application saves remain browser-only and update the same local record', () => {
  const created = saveBrowserApplication({ applicant_name: 'Guest Resident' });
  assert.match(created.id, /^LOCAL-/);
  assert.match(created.reference_number, /^AL-/);
  assert.equal(readSavedApplications().length, 1);

  const updated = saveBrowserApplication({ ...created, damage_summary: 'Updated locally' });
  assert.equal(updated.id, created.id);
  assert.equal(readSavedApplications().length, 1);
  assert.equal(readSavedApplications()[0].damage_summary, 'Updated locally');
});

test('a failed account save reports the error and does not create a browser fallback', async () => {
  storedValue = '[]';
  globalThis.fetch = async () => ({
    ok: false,
    json: async () => ({ success: false, error: 'Authentication is required.' })
  });

  await assert.rejects(
    saveAccountApplication({ applicant_name: 'Account Resident' }, 'csrf'),
    /Authentication is required/
  );
  assert.deepEqual(readSavedApplications(), []);
});

after(() => {
  if (originalStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = originalStorage;
  globalThis.fetch = originalFetch;
});
