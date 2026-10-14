import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendDirectory = fileURLToPath(new URL('..', import.meta.url));

const serverConfigurationScript = `
import net from 'node:net';

const probe = net.createServer();
await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
process.env.PORT = String(port);

const [{ server }, { default: db }] = await Promise.all([
  import('./server.js'),
  import('./database.js')
]);
await new Promise((resolve, reject) => {
  if (server.listening) return resolve();
  server.once('listening', resolve);
  server.once('error', reject);
});

const base = 'http://127.0.0.1:' + port;
async function preflight(origin) {
  const response = await fetch(base + '/api/auth/me', {
    method: 'OPTIONS',
    headers: {
      origin,
      'access-control-request-method': 'GET'
    }
  });
  return {
    status: response.status,
    allowOrigin: response.headers.get('access-control-allow-origin'),
    allowCredentials: response.headers.get('access-control-allow-credentials')
  };
}

const allowedOrigin = 'https://frontend.example.test';
const allowedPreflight = await preflight(allowedOrigin);
const disallowedPreflight = await preflight('https://attacker.example.test');
const registrationResponse = await fetch(base + '/api/auth/register', {
  method: 'POST',
  headers: {
    origin: allowedOrigin,
    'content-type': 'application/json'
  },
  body: JSON.stringify({
    fullName: 'Production Cookie Test',
    email: 'production-cookie@example.test',
    password: 'production-test-password'
  })
});
const registration = await registrationResponse.json();
const sessionCookie = registrationResponse.headers.get('set-cookie');
const logoutResponse = await fetch(base + '/api/auth/logout', {
  method: 'POST',
  headers: {
    origin: allowedOrigin,
    cookie: sessionCookie.split(';')[0],
    'x-csrf-token': registration.csrfToken
  }
});
const logoutCookie = logoutResponse.headers.get('set-cookie');

await new Promise((resolve, reject) => {
  server.close((error) => error ? reject(error) : resolve());
});
db.close();
console.log('AUTH_SERVER_CONFIG_RESULT:' + JSON.stringify({
  allowedPreflight,
  disallowedPreflight,
  registrationStatus: registrationResponse.status,
  sessionCookie,
  logoutStatus: logoutResponse.status,
  logoutCookie
}));
`;

function runProductionServerConfiguration() {
  const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), 'auth-server-config-'));
  const databasePath = path.join(temporaryDirectory, 'test.sqlite');

  try {
    const result = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', serverConfigurationScript],
      {
        cwd: backendDirectory,
        encoding: 'utf8',
        env: {
          ...process.env,
          DISASTER_RELIEF_DB_PATH: databasePath,
          FRONTEND_ORIGIN: 'https://frontend.example.test',
          NODE_ENV: 'production',
          GEMINI_API_KEY: ''
        }
      }
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const resultLine = result.stdout
      .split(/\r?\n/)
      .find((line) => line.startsWith('AUTH_SERVER_CONFIG_RESULT:'));
    assert.ok(resultLine, result.stdout || result.stderr);
    return JSON.parse(resultLine.slice('AUTH_SERVER_CONFIG_RESULT:'.length));
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

test('actual server middleware applies production cookie and credentialed CORS settings', () => {
  const result = runProductionServerConfiguration();

  assert.equal(result.allowedPreflight.allowOrigin, 'https://frontend.example.test');
  assert.equal(result.allowedPreflight.allowCredentials, 'true');
  assert.equal(result.disallowedPreflight.allowOrigin, null);
  assert.notEqual(result.disallowedPreflight.allowCredentials, 'true');
  assert.equal(result.registrationStatus, 201);
  assert.match(result.sessionCookie, /HttpOnly/i);
  assert.match(result.sessionCookie, /Secure/i);
  assert.match(result.sessionCookie, /SameSite=None/i);
  assert.equal(result.logoutStatus, 200);
  assert.match(result.logoutCookie, /HttpOnly/i);
  assert.match(result.logoutCookie, /Secure/i);
  assert.match(result.logoutCookie, /SameSite=None/i);
  assert.match(result.logoutCookie, /Path=\//i);
  assert.match(result.logoutCookie, /Max-Age=0/i);
});
