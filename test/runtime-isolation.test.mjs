import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import test from 'node:test';

import { assertRuntimeSafety, runtimeMode, startBackgroundServices } from '../src/background.mjs';

function fakeServices(calls) {
  const sync = name => () => { calls.push(name); };
  const asyncService = name => async () => { calls.push(name); return {status: 'ok'}; };
  return {
    startFutpythonCron: sync('cron'),
    startDataWatchdog: sync('watchdog'),
    configureTelegramOutboundOnly: asyncService('telegram_configure'),
    sendTelegramConnectivityTest: asyncService('telegram_test'),
    runPhase1Verification: asyncService('phase1'),
    maybeStartTcDiscovery: asyncService('tc_discovery'),
    maybeStartTcMapping: asyncService('tc_mapping'),
    maybeStartTcPrematch: asyncService('tc_prematch'),
    maybeStartTcHistorical: asyncService('tc_historical'),
    maybeStartTcLive: asyncService('tc_live'),
    runFutpythonSync: asyncService('backfill'),
  };
}

test('runtime defaults offline and rejects unknown modes', () => {
  assert.equal(runtimeMode({}), 'offline');
  assert.equal(runtimeMode({MATCHPILOT_RUNTIME_MODE: 'TEST'}), 'test');
  assert.throws(() => runtimeMode({MATCHPILOT_RUNTIME_MODE: 'unsafe'}), /Invalid MATCHPILOT_RUNTIME_MODE/);
});

test('HTTP startup does not await background initialization', () => {
  const source = readFileSync(new URL('../src/server.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /await\s+startBackgroundServices\s*\(/);
  assert.match(source, /void\s+startBackgroundServices\s*\(\)\.catch/);
});

test('offline and test modes reject every non-local database URL', () => {
  for (const mode of ['offline', 'test']) {
    assert.throws(() => assertRuntimeSafety({MATCHPILOT_RUNTIME_MODE: mode, DATABASE_URL: 'postgres://user:pass@ep-example.neon.tech/db'}), /rejects non-local/);
    assert.equal(assertRuntimeSafety({MATCHPILOT_RUNTIME_MODE: mode, DATABASE_URL: 'postgres://user:pass@127.0.0.1:5432/db'}).backgroundEnabled, false);
  }
});

test('offline mode starts no cron, watchdog, provider, Telegram, recovery or backfill service', async () => {
  const calls = [];
  const logs = [];
  const result = await startBackgroundServices({
    env: {
      MATCHPILOT_RUNTIME_MODE: 'offline',
      DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
      FUTPYTHON_API_KEY: 'must-not-be-used',
      TOTALCORNER_API_TOKEN: 'must-not-be-used',
      FUTPYTHON_BACKFILL_ON_START: 'true',
      FUTPYTHON_PHASE1_VERIFY_ON_START: 'true',
    },
    services: fakeServices(calls),
    log: line => logs.push(line),
  });
  assert.equal(result.backgroundEnabled, false);
  assert.deepEqual(calls, []);
  assert.match(logs[0], /runtime_isolated/);
});

test('production background remains available only through explicit double opt-in', async () => {
  const disabledCalls = [];
  assert.equal((await startBackgroundServices({
    env: {MATCHPILOT_RUNTIME_MODE: 'production'}, services: fakeServices(disabledCalls), log: () => {},
  })).backgroundEnabled, false);
  assert.deepEqual(disabledCalls, []);

  const enabledCalls = [];
  await startBackgroundServices({
    env: {MATCHPILOT_RUNTIME_MODE: 'production', MATCHPILOT_BACKGROUND_ENABLED: 'true'},
    services: fakeServices(enabledCalls), log: () => {},
  });
  await new Promise(resolve => setImmediate(resolve));
  for (const required of ['cron', 'watchdog', 'telegram_configure', 'telegram_test', 'tc_discovery', 'tc_mapping', 'tc_prematch', 'tc_historical', 'tc_live']) {
    assert.ok(enabledCalls.includes(required), required);
  }
  assert.equal(enabledCalls.includes('backfill'), false);
});

test('real backend starts in test mode with PostgreSQL and performs no hidden background work', {timeout: 60000}, async t => {
  const pg = (await import('pg')).default;
  const rootUrl = process.env.FUTPYTHON_TEST_DATABASE_URL || 'postgres://matchpilot:matchpilot_local_test@127.0.0.1:5432/matchpilot_fpt';
  const admin = new pg.Client({connectionString: rootUrl, connectionTimeoutMillis: 2000});
  try { await admin.connect(); }
  catch (cause) {
    await admin.end().catch(() => {});
    if (process.env.CI) throw cause;
    return t.skip('throwaway postgres unavailable');
  }

  const schema = `runtime_isolation_${process.pid}`;
  await admin.query(`CREATE SCHEMA ${schema}`);
  const dbUrl = new URL(rootUrl);
  dbUrl.searchParams.set('options', `-csearch_path=${schema}`);

  let providerHits = 0;
  const trap = http.createServer((req, res) => { providerHits++; res.writeHead(500); res.end(); });
  await new Promise(resolve => trap.listen(0, '127.0.0.1', resolve));
  const trapUrl = `http://127.0.0.1:${trap.address().port}`;
  const port = 32000 + (process.pid % 10000);
  const env = {
    ...process.env,
    PORT: String(port),
    DATABASE_URL: dbUrl.toString(),
    MATCHPILOT_RUNTIME_MODE: 'test',
    MATCHPILOT_BACKGROUND_ENABLED: 'true',
    FUTPYTHON_API_KEY: 'must-not-be-used',
    FUTPYTHON_BASE_URL: trapUrl,
    TOTALCORNER_API_TOKEN: 'must-not-be-used',
    TOTALCORNER_BASE_URL: trapUrl,
    FUTPYTHON_BACKFILL_ON_START: 'true',
    FUTPYTHON_PHASE1_VERIFY_ON_START: 'true',
  };
  const child = spawn(process.execPath, ['src/server.mjs'], {cwd: process.cwd(), env, stdio: ['ignore', 'pipe', 'pipe']});
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });

  try {
    const deadline = Date.now() + 30000;
    while (!output.includes(`listening on ${port} (test)`) && child.exitCode == null && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.equal(child.exitCode, null, output);
    assert.match(output, /MATCHPILOT_BACKGROUND_SKIPPED.*runtime_isolated/);
    assert.match(output, new RegExp(`listening on ${port} \\(test\\)`));
    const response = await fetch(`http://127.0.0.1:${port}/healthz`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, 'ok');
    await new Promise(resolve => setTimeout(resolve, 250));
    assert.equal(providerHits, 0);

    const isolated = new pg.Client({connectionString: dbUrl.toString()});
    await isolated.connect();
    try {
      for (const table of ['fpt_sync_runs', 'tc_collector_runs', 'tc_raw_responses', 'tc_live_snapshots']) {
        const result = await isolated.query(`SELECT count(*)::int AS n FROM ${table}`);
        assert.equal(result.rows[0].n, 0, table);
      }
    } finally { await isolated.end(); }
  } finally {
    if (child.exitCode == null) {
      child.kill('SIGTERM');
      await new Promise(resolve => child.once('exit', resolve));
    }
    await new Promise(resolve => trap.close(resolve));
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});
