// t131u FPT monitoring fixes (audit /workspace/t131u): each block is RED on main, GREEN here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { emitAlert, resolveAlert, redeliveryDue, contentStaleness, healthStatus, telegramText, DATA_CATEGORY } from '../src/alerts.mjs';
import { checkDataWatchdog } from '../src/jobs/data-watchdog.mjs';
import { staleRefreshUnchanged } from '../src/providers/futpython/reconciliation.mjs';
import { livenessVerdict, probe } from '../scripts/fpt-liveness-probe.mjs';
import { isoTimestamps } from '../src/worker.mjs';

const NOW = Date.parse('2026-10-22T19:40:00Z');

// In-memory data_alerts plus canned answers for the watchdog reads.
function fakeDb(canned = {}) {
  const alerts = [];
  let id = 0;
  const query = async (sql, params = []) => {
    const q = sql.replace(/\s+/g, ' ').trim();
    if (q.startsWith('SELECT * FROM data_alerts WHERE fingerprint=$1 AND resolved_at IS NULL')) {
      const rows = alerts.filter(a => a.fingerprint === params[0] && !a.resolved_at).map(a => ({...a}));
      return {rows, rowCount: rows.length};
    }
    if (q.startsWith('INSERT INTO data_alerts')) {
      const [source, severity, code, fingerprint, title, message] = params;
      const row = {alert_id: ++id, source, severity, code, fingerprint, title, message, delivery_status: 'pending', last_delivered_at: null, resolved_at: null};
      alerts.push(row); return {rows: [{...row}], rowCount: 1};
    }
    if (q.startsWith('UPDATE data_alerts SET last_seen_at')) {
      const a = alerts.find(x => x.alert_id === params[0]); a.title = params[2]; a.message = params[3]; return {rows: [], rowCount: 1};
    }
    if (q.startsWith('UPDATE data_alerts SET delivery_status=$2, last_delivered_at')) {
      for (const a of alerts.filter(x => x.fingerprint === params[0] && !x.resolved_at)) { a.delivery_status = params[1]; if (params[2]) a.last_delivered_at = new Date(); }
      return {rows: [], rowCount: 1};
    }
    if (q.startsWith('UPDATE data_alerts SET resolved_at=now()')) {
      const rows = alerts.filter(a => a.fingerprint === params[0] && !a.resolved_at);
      for (const a of rows) a.resolved_at = new Date();
      return {rows: rows.map(a => ({...a})), rowCount: rows.length};
    }
    if (q.startsWith('UPDATE data_alerts SET delivery_status=$2 WHERE alert_id=$1')) {
      alerts.find(x => x.alert_id === params[0]).delivery_status = params[1]; return {rows: [], rowCount: 1};
    }
    for (const [needle, rows] of Object.entries(canned)) if (q.includes(needle)) return {rows, rowCount: rows.length};
    return {rows: [], rowCount: 0};
  };
  return {alerts, client: {query}};
}
const channel = () => { const sent = []; let fail = false;
  const fn = async alert => { if (fail) throw new Error('Telegram HTTP 502'); sent.push(telegramText(alert)); return {attempted: true}; };
  return {sent, fn, setFail: v => { fail = v; }}; };

test('(1) liveness probe outside the worker: alert when the last fpt_sync_runs is older than 7h, resolved when runs resume', async () => {
  assert.equal(livenessVerdict('2026-10-22T12:00:00Z', NOW).dead, true);
  assert.equal(livenessVerdict('2026-10-22T17:05:00Z', NOW).dead, false);
  assert.equal(livenessVerdict(null, NOW).dead, true);
  const db = fakeDb({'max(started_at)': [{last: '2026-10-09T10:19:00Z'}]});
  const tg = channel();
  await probe(db.client, {now: NOW, deliver: tg.fn});
  await probe(db.client, {now: NOW + 1800000, deliver: tg.fn});
  assert.equal(tg.sent.length, 1, 'unchanged state is not repeated');
  assert.match(tg.sent[0], /Worker FPT fermo/);
});

test('(2) DATA_CONTENT_STALE: last_changed_at > 72h or match_date > 7d, attributed to the provider when the sync is on time', async () => {
  assert.equal(contentStaleness({maxChangedAt: '2026-10-21T00:00:00Z', maxMatchDate: '2026-10-20', now: NOW}).stale, false);
  assert.equal(contentStaleness({maxChangedAt: '2026-10-18T00:00:00Z', maxMatchDate: '2026-10-20', now: NOW}).stale, true);
  assert.equal(contentStaleness({maxChangedAt: '2026-10-21T00:00:00Z', maxMatchDate: '2026-10-04', now: NOW}).stale, true);
  const db = fakeDb({'FROM fpt_sync_runs': [{run_id: 'r', status: 'complete', started_at: '2026-10-22T16:17:00Z', finished_at: '2026-10-22T16:20:00Z'}],
    'max(last_changed_at)': [{max_changed: '2026-10-04T18:41:00Z', max_match_date: '2026-10-04'}]});
  const tg = channel();
  const r1 = await checkDataWatchdog({client: db.client, now: NOW, deliver: tg.fn});
  await checkDataWatchdog({client: db.client, now: NOW, deliver: tg.fn});
  assert.equal(r1.content.stale, true);
  const stale = tg.sent.filter(t => /Contenuti FutPython fermi/.test(t));
  assert.equal(stale.length, 1, 'sent exactly once');
  assert.match(stale[0], /provider FutPython/);
  assert.ok(stale[0].startsWith(DATA_CATEGORY), 'data category, distinct from [MatchPilot deploy]');
  assert.equal(db.alerts.find(a => a.code === 'DATA_CONTENT_STALE').delivery_status, 'delivered');
});

test('(3) a delivered alert that resolves sends one RISOLTO notice, exactly once; an undelivered one sends none', async () => {
  const db = fakeDb(); const tg = channel();
  const key = {source: 'futpython', code: 'SYNC_STALE', key: 'cron'};
  await emitAlert({...key, severity: 'critical', title: 'FutPython sync non aggiornato', message: 'x'}, db.client, {deliver: tg.fn});
  await resolveAlert(key, db.client, {deliver: tg.fn});
  await resolveAlert(key, db.client, {deliver: tg.fn});
  assert.equal(tg.sent.filter(t => /RISOLTO/.test(t)).length, 1);
  const silent = channel(); const db2 = fakeDb();
  await emitAlert({...key, title: 't', message: 'm'}, db2.client, {deliver: async () => ({attempted: false})});
  await resolveAlert(key, db2.client, {deliver: silent.fn});
  assert.equal(silent.sent.length, 0);
});

test('(4) a current-season refresh with an unchanged SHA is not RECOVERED (gap stays open, verified unchanged)', () => {
  const detected_at = '2026-10-22T10:00:00Z';
  assert.equal(staleRefreshUnchanged({gap_kind: 'current_season_stale', detected_at, last_changed_at: '2026-10-04T18:41:00Z'}), true);
  assert.equal(staleRefreshUnchanged({gap_kind: 'current_season_stale', detected_at, last_changed_at: null}), true);
  assert.equal(staleRefreshUnchanged({gap_kind: 'current_season_stale', detected_at, last_changed_at: '2026-10-22T11:00:00Z'}), false);
  assert.equal(staleRefreshUnchanged({gap_kind: 'failed_dataset', detected_at, last_changed_at: null}), false);
});

test('(5) /api/data-health status is warning when content is stale', () => {
  assert.equal(healthStatus([], {stale: true}), 'warning');
  assert.equal(healthStatus([], {stale: false}), 'ok');
  assert.equal(healthStatus([{severity: 'critical'}], {stale: true}), 'critical');
  const f = contentStaleness({maxChangedAt: '2026-10-04T18:41:00Z', maxMatchDate: '2026-10-04', now: NOW});
  assert.equal(f.maxMatchDate, '2026-10-04');
  assert.equal(f.maxLastChangedAt, '2026-10-04T18:41:00.000Z');
});

test('(6) a failed delivery is retried; an identical delivered alert is never repeated', async () => {
  assert.equal(redeliveryDue({delivery_status: 'failed', last_delivered_at: null, message: 'm', title: 't'}, {message: 'm', title: 't'}, NOW), true);
  assert.equal(redeliveryDue({delivery_status: 'delivered', last_delivered_at: new Date(NOW - 864e5), message: 'm', title: 't'}, {message: 'm', title: 't'}, NOW), false);
  assert.equal(redeliveryDue({delivery_status: 'delivered', last_delivered_at: new Date(NOW - 864e5), message: 'm', title: 't'}, {message: 'm2', title: 't'}, NOW), true);
  const db = fakeDb(); const tg = channel();
  const a = {source: 'futpython', code: 'X', key: 'k', title: 't', message: 'm'};
  tg.setFail(true);
  await emitAlert(a, db.client, {deliver: tg.fn});
  assert.equal(db.alerts[0].delivery_status, 'failed');
  tg.setFail(false);
  await emitAlert(a, db.client, {deliver: tg.fn});
  await emitAlert(a, db.client, {deliver: tg.fn});
  assert.equal(tg.sent.length, 1);
  assert.equal(db.alerts[0].delivery_status, 'delivered');
});

test('(7) worker log lines start with an ISO timestamp', () => {
  const lines = [];
  const target = {log: (...a) => lines.push(a.join(' ')), info() {}, warn() {}, error: (...a) => lines.push(a.join(' '))};
  isoTimestamps(target, () => new Date(NOW));
  isoTimestamps(target, () => new Date(NOW));
  target.log('DATA_WATCHDOG_READY');
  target.error('X');
  assert.deepEqual(lines, ['2026-10-22T19:40:00.000Z DATA_WATCHDOG_READY', '2026-10-22T19:40:00.000Z X']);
});
