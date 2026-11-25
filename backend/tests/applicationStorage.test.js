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

test('saved applications show their custom name instead of the reference number', async () => {
  const { getApplicationTitle, getApplicationProgram, renameBrowserApplication, normalizeApplicationName } =
    await import('../../frontend/src/utils/applicationStorage.js');

  assert.equal(getApplicationTitle({ reference_number: 'AL-1' }), 'AL-1');
  assert.equal(getApplicationTitle({ reference_number: 'AL-1', application_name: '  Roof repair ' }), 'Roof repair');
  assert.equal(getApplicationTitle({ reference_number: 'AL-1', application_name: '   ' }), 'AL-1');
  assert.equal(normalizeApplicationName('x'.repeat(100)).length, 80);

  assert.equal(getApplicationProgram({ applied_subsidies: ['Emergency Cash Transfer (ECT)'] }), 'Emergency Cash Transfer (ECT)');
  assert.equal(getApplicationProgram({ applied_subsidies: [] }), '');
  assert.equal(getApplicationProgram({}), '');

  const created = saveBrowserApplication({ applicant_name: 'Guest Resident' });
  renameBrowserApplication(created.id, ' Roof repair ');
  assert.equal(readSavedApplications()[0].application_name, 'Roof repair');
  renameBrowserApplication(created.id, '');
  assert.equal('application_name' in readSavedApplications()[0], false);
});

test('renaming an account application sends a PATCH with the CSRF token', async () => {
  const { renameAccountApplication } = await import('../../frontend/src/utils/applicationStorage.js');
  let call;
  globalThis.fetch = async (url, options) => {
    call = { url, options };
    return { ok: true, json: async () => ({ success: true, data: { application_name: 'Roof repair' } }) };
  };
  const updated = await renameAccountApplication('APP-1', ' Roof repair ', 'csrf-1');
  assert.equal(call.url, '/api/applications/APP-1/name');
  assert.equal(call.options.method, 'PATCH');
  assert.equal(call.options.headers['X-CSRF-Token'], 'csrf-1');
  assert.deepEqual(JSON.parse(call.options.body), { name: 'Roof repair' });
  assert.equal(updated.application_name, 'Roof repair');
});

test('browser-only applications move into the account and failures stay in the browser', async () => {
  const { migrateBrowserApplications, writeSavedApplications: write, readSavedApplications: read } =
    await import('../../frontend/src/utils/applicationStorage.js');
  write([
    { id: 'LOCAL-A', reference_number: 'AL-1', saved_at: 'x', application_name: 'Roof repair', applicant_name: 'A', applied_subsidies: ['ECT'] },
    { id: 'LOCAL-B', reference_number: 'AL-2', saved_at: 'x', applicant_name: 'B', applied_subsidies: [] }
  ]);
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, method: options.method, body: options.body && JSON.parse(options.body) });
    if (options.method === 'POST') {
      const body = JSON.parse(options.body);
      if (!body.applied_subsidies.length) {
        return { ok: false, json: async () => ({ success: false, error: 'Choose the aid program this application is for.' }) };
      }
      return { ok: true, json: async () => ({ success: true, data: { id: 'APP-1' } }) };
    }
    return { ok: true, json: async () => ({ success: true, data: { id: 'APP-1' } }) };
  };

  const [first, second] = await Promise.all([
    migrateBrowserApplications('csrf-1'),
    migrateBrowserApplications('csrf-1')
  ]);
  assert.deepEqual(first, { migrated: 1, failed: 1 });
  assert.equal(second, first, 'concurrent runs share one migration');

  const posts = calls.filter((call) => call.method === 'POST');
  assert.equal(posts.length, 2);
  assert.equal('id' in posts[0].body, false);
  assert.equal('reference_number' in posts[0].body, false);
  assert.ok(calls.some((call) => call.method === 'PATCH' && call.url === '/api/applications/APP-1/name'));
  assert.deepEqual(read().map((record) => record.id), ['LOCAL-B']);
});
