// t138: FPT residuals — release SHA in the worker log, heartbeat after a cycle, probe with DB down, Telegram delivery proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { releaseSha } from '../src/worker.mjs';
import { afterCycle } from '../src/jobs/futpython-cron.mjs';
import { triggerDataWatchdog } from '../src/jobs/data-watchdog.mjs';
import { dbOutageStep, handleDbOutage, dbOutageText } from '../scripts/fpt-liveness-probe.mjs';
import { emitAlert, resolveAlert, logDelivery } from '../src/alerts.mjs';
import { fakeAlertsDb } from './helpers/fake-alerts-db.mjs';

process.env.MATCHPILOT_ALERT_RETRY_BASE_MS = '0';
const SHA = 'b393499ec27c48d20ee1fb3334203699525cfae5';

test('release: env wins; otherwise the resolved release directory; never a guess', () => {
  assert.equal(releaseSha({MP_RELEASE_SHA: SHA}, '/x', () => '/y'), SHA);
  assert.equal(releaseSha({}, '/srv/mp-deploy/current', () => `/srv/mp-deploy/releases/${SHA}`), SHA);
  assert.equal(releaseSha({}, '/srv/app', () => '/srv/app'), null);
  assert.equal(releaseSha({MP_RELEASE_SHA: 'bad'}, '/x', () => { throw new Error('ENOENT'); }), null);
});

test('heartbeat: a finished cron cycle triggers the watchdog (post-cycle); no-op when the watchdog is off', async () => {
  const calls = [];
  await afterCycle(async phase => calls.push(phase));
  assert.deepEqual(calls, ['post-cycle']);
  assert.equal(await triggerDataWatchdog(), null);
  await afterCycle(async () => { throw new Error('db'); }); // must not throw out of the cron callback
});

test('probe DB down: one alert per outage, one RISOLTO on recovery, retry when Telegram fails', async () => {
  const stateFile = join(mkdtempSync(join(tmpdir(), 't138-')), 'db-outage.json');
  const sent = []; const log = () => {};
  const ok = async text => { sent.push(text); return {ok: true, messageId: sent.length}; };
  const fail = async () => ({ok: false, status: 502});
  assert.deepEqual(await handleDbOutage(true, {stateFile, send: ok, log}), {sent: null});
  assert.equal((await handleDbOutage(false, {error: 'connect ECONNREFUSED postgres://u:p@h/db', stateFile, send: fail, log})).ok, false);
  assert.equal(existsSync(stateFile), false);
  await handleDbOutage(false, {error: 'connect ECONNREFUSED postgres://u:p@h/db', stateFile, send: ok, log});
  await handleDbOutage(false, {error: 'again', stateFile, send: ok, log});
  assert.equal(sent.length, 1);
  assert.match(sent[0], /Database non raggiungibile/);
  assert.doesNotMatch(sent[0], /u:p@/);
  await handleDbOutage(true, {stateFile, send: ok, log});
  assert.equal(sent.length, 2);
  assert.match(sent[1], /RISOLTO/);
  assert.equal(JSON.parse(readFileSync(stateFile, 'utf8')).dbDown, false);
  await handleDbOutage(true, {stateFile, send: ok, log});
  assert.equal(sent.length, 2);
  assert.equal(dbOutageStep(null, true).send, null);
  assert.match(dbOutageText('down', {since: 'x', error: 'password=abc'}), /password=\[REDACTED\]/);
});

test('Telegram: delivery result (channel + message_id) is logged and stored for open and RISOLTO', async () => {
  const lines = []; const orig = console.log; console.log = l => lines.push(String(l));
  try {
    const db = fakeAlertsDb();
    const deliver = async () => ({attempted: true, channel: 'telegram', messageId: 4242});
    await emitAlert({source: 'futpython', code: 'T138', severity: 'warning', title: 't', message: 'm', key: 'k'}, db.client, {deliver});
    await resolveAlert({source: 'futpython', code: 'T138', key: 'k'}, db.client, {deliver, evidence: 'e'});
  } finally { console.log = orig; }
  const d = lines.filter(l => l.startsWith('DATA_ALERT_DELIVERED'));
  assert.equal(d.length, 2);
  assert.match(d[0], /"kind":"open".*"messageId":4242/);
  assert.match(d[1], /"kind":"resolved".*"messageId":4242/);
  const out = []; logDelivery('open', 'X', {channel: 'telegram', messageId: 1, tries: 2}, l => out.push(l));
  assert.doesNotMatch(out[0], /bot\d|token/i);
});
