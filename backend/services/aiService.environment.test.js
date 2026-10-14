import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const backendDirectory = fileURLToPath(new URL('..', import.meta.url));
const serverUrl = pathToFileURL(path.join(backendDirectory, 'server.js')).href;
const databaseUrl = pathToFileURL(path.join(backendDirectory, 'database.js')).href;
const aiServiceUrl = pathToFileURL(path.join(backendDirectory, 'services', 'aiService.js')).href;
const serverScript = `
const [{ server }, { default: db }, { analyzeDisasterDamage }] = await Promise.all([
  import(${JSON.stringify(serverUrl)}),
  import(${JSON.stringify(databaseUrl)}),
  import(${JSON.stringify(aiServiceUrl)})
]);

await new Promise((resolve, reject) => {
  if (server.listening) return resolve();
  server.once('listening', resolve);
  server.once('error', reject);
});

try {
  const port = server.address().port;
  const healthResponse = await fetch('http://127.0.0.1:' + port + '/api/health');
  const health = await healthResponse.json();
  let engine = null;

  if (!health.aiEngineConfigured) {
    const analysis = await analyzeDisasterDamage({
      disasterType: 'Typhoon',
      damageDescription: 'May sira ang bubong.',
      householdSize: 2
    });
    engine = analysis.engine;
  }

  console.log('AI_ENV_RESULT:' + JSON.stringify({
    aiEngineConfigured: health.aiEngineConfigured,
    engine
  }));
} finally {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  db.close();
}
`;

function runWithTemporaryEnvironmentFile(apiKey) {
  const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), 'ai-env-config-'));
  const databasePath = path.join(temporaryDirectory, 'test.sqlite');

  try {
    if (apiKey !== null) {
      writeFileSync(path.join(temporaryDirectory, '.env'), `GEMINI_API_KEY=${apiKey}\n`);
    }

    const env = {
      ...process.env,
      DISASTER_RELIEF_DB_PATH: databasePath,
      PORT: '0'
    };
    delete env.GEMINI_API_KEY;

    const result = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', serverScript],
      {
        cwd: temporaryDirectory,
        encoding: 'utf8',
        env
      }
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const resultLine = result.stdout
      .split(/\r?\n/)
      .find((line) => line.startsWith('AI_ENV_RESULT:'));
    assert.ok(resultLine, result.stdout || result.stderr);
    return JSON.parse(resultLine.slice('AI_ENV_RESULT:'.length));
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

test('server loads the supported .env key before lazily configuring Gemini', () => {
  const result = runWithTemporaryEnvironmentFile('controlled-offline-test-key');

  assert.equal(result.aiEngineConfigured, true);
  assert.equal(result.engine, null);
});

test('server without a Gemini key reports unconfigured and retains heuristic fallback', () => {
  const result = runWithTemporaryEnvironmentFile(null);

  assert.equal(result.aiEngineConfigured, false);
  assert.equal(result.engine, 'Heuristic Rule Analyzer (Gemini Ready)');
});
