// MP-FPT-RETIRE-01: FutPythonTrader retired mode. With FUTPYTHON_RETIRED=true no process calls the provider, no FPT
// alert is raised, open ones are closed once, and nothing is deleted. Without the variable nothing changes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FPT_ALERT_KEYS, fptRetired, RETIRED_RESOLUTION } from '../src/providers/futpython/retired.mjs';
import { requestProviderText } from '../src/providers/futpython/client.mjs';
import { runFutpythonSync } from '../src/jobs/futpython-sync.mjs';
import { startFutpythonCron, stopFutpythonCron } from '../src/jobs/futpython-cron.mjs';
import { startBackgroundServices } from '../src/background.mjs';
import { checkDataWatchdog } from '../src/jobs/data-watchdog.mjs';
import { probe } from '../scripts/fpt-liveness-probe.mjs';

async function withEnv(vars, body) {
  const saved = Object.fromEntries(Object.keys(vars).map(k => [k, process.env[k]]));
  Object.assign(process.env, vars);
  try { return await body(); }
  finally { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
}

// A database double that records every statement; open alerts are listed in `open` (fingerprint matching is the real
// resolveAlert's job, so the double only says whether an UPDATE found a row).
function recordingClient({resolvable = new Set()} = {}) {
  const sql = [];
  return {
    sql,
    async query(text, values = []) {
      sql.push(text.replace(/\s+/g, ' ').trim());
      if (/^UPDATE data_alerts SET resolved_at=now\(\)/.test(text.trim().replace(/\s+/g, ' ')) && resolvable.size) {
        const fp = values[0];
        if (resolvable.has(fp)) { resolvable.delete(fp); return {rows: [{alert_id: 1, source: 'futpython', code: 'X', last_delivered_at: null}]}; }
      }
      return {rows: [], rowCount: 0};
    }
  };
}

test('MP-FPT-RETIRE-01 only the exact text "true" retires the provider; off by default', () => {
  assert.equal(fptRetired({}), false);
  for (const v of ['true', ' true ']) assert.equal(fptRetired({FUTPYTHON_RETIRED: v}), true, v);
  for (const v of ['TRUE', '1', 'yes', 'false', '']) assert.equal(fptRetired({FUTPYTHON_RETIRED: v}), false, v);
  assert.ok(FPT_ALERT_KEYS.length >= 17 && FPT_ALERT_KEYS.every(k => k.source === 'futpython' && k.code && k.key));
  assert.ok(FPT_ALERT_KEYS.some(k => k.code === 'SYNC_STALE') && FPT_ALERT_KEYS.some(k => k.code === 'RECON_GAPS') && FPT_ALERT_KEYS.some(k => k.code === 'FPT_WORKER_LIVENESS'));
});

test('MP-FPT-RETIRE-01 retired: the network entry point, the sync and the cron refuse to run', async () => {
  await withEnv({FUTPYTHON_RETIRED: 'true', FUTPYTHON_API_KEY: 'must-not-be-used', DATABASE_URL: 'postgres://u:p@127.0.0.1:1/none'}, async () => {
    await assert.rejects(requestProviderText({path: '/api/jogos-do-dia?date=2026-11-02&format=csv'}), err => err.code === 'FPT_RETIRED');
    assert.deepEqual(await runFutpythonSync({kind: 'recovery', mode: 'incremental'}), {status: 'skipped', reason: 'retired'});
    assert.equal(startFutpythonCron(), null);
  });
  stopFutpythonCron();
});

test('MP-FPT-RETIRE-01 retired: start-up backfill and phase-1 verification never run, whatever their flags', async () => {
  const calls = [];
  const logs = [];
  const services = {
    startFutpythonCron: () => calls.push('cron'), startDataWatchdog: () => calls.push('watchdog'),
    configureTelegramOutboundOnly: async () => calls.push('telegram_configure'), sendTelegramConnectivityTest: async () => calls.push('telegram_test'),
    runPhase1Verification: async () => { calls.push('phase1'); return {status: 'ok'}; },
    maybeStartTcDiscovery: async () => {}, maybeStartTcMapping: async () => {}, maybeStartTcPrematch: async () => {},
    maybeStartTcHistorical: async () => {}, maybeStartTcLive: async () => {},
    runFutpythonSync: async () => { calls.push('backfill'); return {status: 'ok'}; }
  };
  const env = {MATCHPILOT_RUNTIME_MODE: 'production', MATCHPILOT_BACKGROUND_ENABLED: 'true', FUTPYTHON_BACKFILL_ON_START: 'true', FUTPYTHON_PHASE1_VERIFY_ON_START: 'true'};
  await startBackgroundServices({env: {...env, FUTPYTHON_RETIRED: 'true'}, services, log: line => logs.push(line), error: () => {}});
  assert.ok(!calls.includes('backfill') && !calls.includes('phase1'));
  assert.ok(calls.includes('watchdog'), 'the watchdog keeps running');
  assert.ok(logs.some(l => l.startsWith('FUTPYTHON_RETIRED ')));
  calls.length = 0;
  await startBackgroundServices({env, services, log: () => {}, error: () => {}});
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(calls.includes('backfill') && calls.includes('phase1'), 'without the variable nothing changes');
});

test('MP-FPT-RETIRE-01 retired watchdog: no FPT query, no alert, no reconciliation; open alerts closed once with the reason', async () => {
  const deliveries = [];
  const client = recordingClient();
  const result = await checkDataWatchdog({client, retired: true, reconcile: true, catchup: () => { throw new Error('must not run'); }, deliver: async n => { deliveries.push(n); return {ok: true}; }});
  assert.deepEqual([result.status, result.retired, result.reconciliation], ['retired', true, null]);
  assert.ok(!client.sql.some(s => /fpt_sync_runs|fpt_dataset_state|fpt_request_ledger|data_reconciliation_ledger/.test(s)), 'no FPT pipeline read');
  assert.ok(!client.sql.some(s => /INSERT INTO data_alerts/.test(s)), 'no alert raised');
  assert.equal(client.sql.filter(s => s.startsWith('UPDATE data_alerts SET resolved_at=now()')).length, FPT_ALERT_KEYS.length, 'every FPT alert key is closed if open');
  assert.ok(client.sql.some(s => s.startsWith('INSERT INTO data_watchdog_state')), 'heartbeat kept');
  assert.ok(!client.sql.some(s => /^(DELETE|TRUNCATE|DROP)/i.test(s)), 'nothing deleted');
  assert.equal(RETIRED_RESOLUTION.includes('archivio conservato'), true);
});

test('MP-FPT-RETIRE-01 retired liveness probe: no worker alert, no FPT read', async () => {
  const client = recordingClient();
  const r = await probe(client, {retired: true, workerActive: false});
  assert.deepEqual([r.probe, r.retired], ['FPT_LIVENESS', true]);
  assert.ok(!client.sql.some(s => /INSERT INTO data_alerts|fpt_sync_runs/.test(s)));
  assert.equal(client.sql.filter(s => s.startsWith('UPDATE data_alerts SET resolved_at=now()')).length, 2);
});
