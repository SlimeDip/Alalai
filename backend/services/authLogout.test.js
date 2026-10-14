import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendDirectory = fileURLToPath(new URL('..', import.meta.url));

const logoutFailureScript = `
import express from 'express';
import db, { initDatabase } from './database.js';
import authRouter from './routes/auth.js';

initDatabase();
const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const base = 'http://127.0.0.1:' + server.address().port;

async function call(path, method = 'GET', options = {}) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...(options.csrfToken ? { 'x-csrf-token': options.csrfToken } : {})
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  return {
    status: response.status,
    body: await response.json(),
    setCookie: response.headers.get('set-cookie')
  };
}

try {
  const registration = await call('/api/auth/register', 'POST', {
    body: {
      fullName: 'Logout Test User',
      email: 'logout-test@example.test',
      password: 'logout-test-password'
    }
  });
  const sessionCookie = registration.setCookie.split(';')[0];

  db.exec(\`
    CREATE TRIGGER reject_session_revocation
    BEFORE DELETE ON auth_sessions
    BEGIN
      SELECT RAISE(ABORT, 'private_database_failure_details');
    END;
  \`);
  const failedLogout = await call('/api/auth/logout', 'POST', {
    cookie: sessionCookie,
    csrfToken: registration.body.csrfToken,
    body: {}
  });
  const sessionAfterFailure = await call('/api/auth/me', 'GET', { cookie: sessionCookie });
  db.exec('DROP TRIGGER reject_session_revocation');

  const successfulLogout = await call('/api/auth/logout', 'POST', {
    cookie: sessionCookie,
    csrfToken: registration.body.csrfToken,
    body: {}
  });
  const sessionAfterSuccess = await call('/api/auth/me', 'GET', { cookie: sessionCookie });

  console.log('AUTH_LOGOUT_FAILURE_RESULT:' + JSON.stringify({
    failedLogout,
    sessionAfterFailure,
    successfulLogout,
    sessionAfterSuccess
  }));
} finally {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  db.close();
}
`;

function runIsolatedLogoutFailure() {
  const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), 'auth-logout-'));
  const databasePath = path.join(temporaryDirectory, 'test.sqlite');

  try {
    const result = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', logoutFailureScript],
      {
        cwd: backendDirectory,
        encoding: 'utf8',
        env: {
          ...process.env,
          DISASTER_RELIEF_DB_PATH: databasePath,
          GEMINI_API_KEY: ''
        }
      }
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const resultLine = result.stdout
      .split(/\r?\n/)
      .find((line) => line.startsWith('AUTH_LOGOUT_FAILURE_RESULT:'));
    assert.ok(resultLine, result.stdout || result.stderr);
    return JSON.parse(resultLine.slice('AUTH_LOGOUT_FAILURE_RESULT:'.length));
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

test('logout handles session revocation failures without clearing a valid session cookie', () => {
  const result = runIsolatedLogoutFailure();

  assert.equal(result.failedLogout.status, 500);
  assert.deepEqual(result.failedLogout.body, {
    success: false,
    error: 'Unable to log out.'
  });
  assert.equal(result.failedLogout.setCookie, null);
  assert.equal(
    JSON.stringify(result.failedLogout).includes('private_database_failure_details'),
    false
  );
  assert.equal(JSON.stringify(result.failedLogout).includes('at '), false);
  assert.equal(result.sessionAfterFailure.status, 200);

  assert.equal(result.successfulLogout.status, 200);
  assert.deepEqual(result.successfulLogout.body, { success: true });
  assert.match(result.successfulLogout.setCookie, /HttpOnly/i);
  assert.match(result.successfulLogout.setCookie, /SameSite=Lax/i);
  assert.match(result.successfulLogout.setCookie, /Path=\//i);
  assert.match(result.successfulLogout.setCookie, /Max-Age=0/i);
  assert.equal(result.sessionAfterSuccess.status, 401);
});
