// t132u FPT hardening (FIX-01..08). Pure functions and in-memory fakes only: nothing here touches a real DB or Telegram.
import test from 'node:test';
import assert from 'node:assert/strict';
import { emitAlert, resolveAlert, retryPendingResolutions, telegramText, eventId, classifyDeliveryError } from '../src/alerts.mjs';
import { classifyFreshness } from '../src/providers/futpython/freshness.mjs';
import { classifyGap, planReclassification, applyReclassification, revertReclassification } from '../src/providers/futpython/gap-classes.mjs';
import { probe, livenessFindings } from '../scripts/fpt-liveness-probe.mjs';
import { logEvent } from '../src/log.mjs';
import { fakeAlertsDb } from './helpers/fake-alerts-db.mjs';

process.env.MATCHPILOT_ALERT_RETRY_BASE_MS = '0';
const NOW = Date.parse('2026-10-22T20:00:00Z');
const h = n => new Date(NOW - n * 3600000).toISOString();
const channel = (failFirst = 0, error = () => Object.assign(new Error('Telegram HTTP 502'), {status: 502})) => {
  const sent = []; let calls = 0;
  const fn = async alert => { calls++; if (calls <= failFirst) throw error(); sent.push(telegramText(alert)); return {attempted: true}; };
  return {sent, fn, calls: () => calls};
};
const probeDb = (o = {}) => fakeAlertsDb({'AS last_run': [{last_run: {run_id: 'r', status: 'complete', started_at: h(2), finished_at: h(2)},
  heartbeat_at: h(0.5), failed_last3: 0, ...o}]});
const healthy = {lastRun: {status: 'complete', started_at: h(2), finished_at: h(2)}, watchdogCheckedAt: h(0.5), workerActive: true,
  maxChangedAt: h(5), datasetErrors: 0, fetched200Unchanged72h: 0, requests72h: {ok: 100, errors: 0}};

test('FIX-01 worker killed abruptly: the external probe alerts once (critical) and closes with RISOLTO + evidence', async () => {
  const db = probeDb({heartbeat_at: h(3)}); const tg = channel();
  await probe(db.client, {now: NOW, deliver: tg.fn, workerActive: false});
  await probe(db.client, {now: NOW, deliver: tg.fn, workerActive: false});
  assert.equal(tg.sent.length, 1);
  assert.match(tg.sent[0], /non attiva/);
  const db2 = db; db2.canned['AS last_run'][0].heartbeat_at = new Date(NOW).toISOString();
  await probe(db2.client, {now: NOW, deliver: tg.fn, workerActive: true});
  assert.match(tg.sent[1], /MATCHPILOT — RISOLTO/);
  assert.match(tg.sent[1], /Verifica: .*unità attiva=true/);
});

test('FIX-01 worker hung: unit "active" but heartbeat older than 2h is HUNG_OR_DOWN', () => {
  const v = livenessFindings({lastRun: {started_at: h(2)}, heartbeatAt: h(3), workerActive: true}, {now: NOW});
  assert.equal(v.dead, true); assert.equal(v.worker, 'HUNG_OR_DOWN');
});

test('FIX-01 persistent errors: 3 failed runs raise FPT_PERSISTENT_ERRORS', async () => {
  const db = probeDb({failed_last3: 3}); const tg = channel();
  await probe(db.client, {now: NOW, deliver: tg.fn, workerActive: true});
  assert.ok(db.alerts.some(a => a.code === 'FPT_PERSISTENT_ERRORS' && !a.resolved_at));
});

test('FIX-02 scheduler skipped cycles: last cycle 14h ago -> MISSED_CYCLES (2), CRITICAL', () => {
  const f = classifyFreshness({...healthy, lastRun: {status: 'complete', started_at: h(14), finished_at: h(14)}}, {now: NOW});
  assert.equal(f.scheduler, 'MISSED_CYCLES'); assert.equal(f.missedCycles, 2); assert.equal(f.overall, 'CRITICAL');
});

test('FIX-02 provider reachable, no new data: sync TECHNICALLY_OK, provider NO_UPDATES only with evidence, overall DEGRADED', () => {
  const f = classifyFreshness({...healthy, maxChangedAt: h(400), fetched200Unchanged72h: 120}, {now: NOW});
  assert.equal(f.sync, 'TECHNICALLY_OK'); assert.equal(f.newData, 'NONE_RECENT');
  assert.equal(f.provider, 'NO_UPDATES'); assert.equal(f.overall, 'DEGRADED');
  const weak = classifyFreshness({...healthy, maxChangedAt: h(400), fetched200Unchanged72h: 3}, {now: NOW});
  assert.equal(weak.provider, 'UNDETERMINED', 'no blame without evidence');
});

test('FIX-02 zero changed rows with fresh content is not an error', () => {
  const f = classifyFreshness({...healthy, lastRun: {...healthy.lastRun, datasets_changed: 0}}, {now: NOW});
  assert.equal(f.overall, 'OK'); assert.equal(f.sync, 'TECHNICALLY_OK');
});

test('FIX-02 provider unreachable: majority of requests failing -> UNREACHABLE', () => {
  const f = classifyFreshness({...healthy, maxChangedAt: h(100), requests72h: {ok: 10, errors: 90}}, {now: NOW});
  assert.equal(f.provider, 'UNREACHABLE'); assert.equal(f.overall, 'DEGRADED');
});

test('FIX-05 intact DB with stale data: never OK, overall DEGRADED with a reason', () => {
  const f = classifyFreshness({...healthy, maxChangedAt: '2026-10-04T18:41:50Z'}, {now: NOW});
  assert.equal(f.overall, 'DEGRADED'); assert.match(f.reason, /nessun dato nuovo/);
});

const gap = o => ({gap_kind: 'current_season_stale', detected_at: '2026-10-10T00:00:00Z', last_changed_at: '2026-10-04T18:41:50Z',
  last_http_status: 200, availability: 'available', ingest_complete: true, last_error: null, ...o});
test('FIX-04 dataset already complete (coverage check) -> ALREADY_COMPLETE, not RECOVERED', () => {
  assert.equal(classifyGap(gap()).classification, 'ALREADY_COMPLETE');
});
test('FIX-04 dataset really incomplete -> STILL_MISSING', () => {
  assert.equal(classifyGap(gap({ingest_complete: false})).classification, 'STILL_MISSING');
});
test('FIX-04 unrecoverable 404 -> PERMANENTLY_UNAVAILABLE; 5xx -> PROVIDER_UNAVAILABLE; real change -> RECOVERED', () => {
  assert.equal(classifyGap(gap({last_http_status: 404, availability: 'unavailable_404'})).classification, 'PERMANENTLY_UNAVAILABLE');
  assert.equal(classifyGap(gap({last_http_status: 503, last_error: 'HTTP 503'})).classification, 'PROVIDER_UNAVAILABLE');
  assert.equal(classifyGap(gap({last_changed_at: '2026-10-11T00:00:00Z'})).classification, 'RECOVERED');
});

function fakeLedger(rows) {
  const ledger = rows.map(r => structuredClone(r));
  const client = {query: async (sql, p = []) => {
    if (/^\s*(BEGIN|COMMIT|ROLLBACK)/.test(sql)) return {rows: [], rowCount: 0};
    if (sql.includes('SELECT reconciliation_id, details')) {
      const rs = ledger.filter(r => (r.details.history || []).some(x => x.batch === p[0]));
      return {rows: rs.map(r => structuredClone(r)), rowCount: rs.length};
    }
    if (sql.includes("details - 'classification'")) {
      const r = ledger.find(x => x.reconciliation_id === p[0]);
      const {classification, classification_evidence, history, ...rest} = r.details;
      r.recovered_count = p[1]; r.details = {...rest, ...(p[2] == null ? {} : {classification: p[2]}), history: JSON.parse(p[3])};
      return {rows: [], rowCount: 1};
    }
    if (sql.includes('UPDATE data_reconciliation_ledger SET recovered_count=$2')) {
      const r = ledger.find(x => x.reconciliation_id === p[0] && x.status === 'RECOVERED' && x.recovered_count === p[5]
        && (x.details.classification ?? '') === (p[6] ?? ''));
      if (!r) return {rows: [], rowCount: 0};
      r.recovered_count = p[1];
      r.details = {...r.details, classification: p[2], classification_evidence: JSON.parse(p[3]), history: [...(r.details.history || []), JSON.parse(p[4])]};
      return {rows: [], rowCount: 1};
    }
    throw new Error('unexpected SQL ' + sql.slice(0, 60));
  }};
  return {ledger, client};
}
test('FIX-04/t133u the 412 reclassification: per-row evidence, audited history, exact revert, no-op on rerun', async () => {
  const rows = [
    {reconciliation_id: 1, entity: 'a', status: 'RECOVERED', recovered_count: 1, details: {x: 1}, ...gap()},
    {reconciliation_id: 2, entity: 'b', status: 'RECOVERED', recovered_count: 1, details: {}, ...gap({ingest_complete: false})},
    {reconciliation_id: 3, entity: 'c', status: 'RECOVERED', recovered_count: 1, details: {}, ...gap({last_changed_at: '2026-10-12T00:00:00Z'})}];
  const db = fakeLedger(rows);
  const plan = planReclassification(rows, 'b1');
  assert.deepEqual(plan.map(p => p.after.classification), ['ALREADY_COMPLETE', 'STILL_MISSING', 'RECOVERED']);
  assert.ok(plan.every(p => p.evidence.rule));
  assert.equal(await applyReclassification(db.client, plan), 3);
  assert.equal(db.ledger[0].recovered_count, 0); assert.equal(db.ledger[2].recovered_count, 1);
  assert.equal(db.ledger[0].status, 'RECOVERED', 'status column untouched (D13)');
  assert.equal(db.ledger[0].details.history[0].before.recovered_count, 1);
  assert.equal(await applyReclassification(db.client, plan), 0, 'stale plan cannot double-apply');
  assert.equal(await revertReclassification(db.client, 'b1'), 3);
  assert.deepEqual(db.ledger.map(r => [r.recovered_count, r.details.classification ?? null, r.details.history.length]),
    [[1, null, 0], [1, null, 0], [1, null, 0]]);
  assert.equal(db.ledger[0].details.x, 1, 'other metadata preserved');
});

test('FIX-06 Telegram temporarily down: retried, delivered once, no duplicate', async () => {
  const db = fakeAlertsDb(); const tg = channel(2);
  const r = await emitAlert({source: 'futpython', code: 'SYNC_STALE', key: 'cron', severity: 'critical', title: 't', message: 'm'}, db.client, {deliver: tg.fn});
  assert.equal(r.delivered, true); assert.equal(tg.calls(), 3); assert.equal(tg.sent.length, 1);
  assert.equal(classifyDeliveryError(Object.assign(new Error('x'), {status: 400})), 'permanent');
  assert.equal(classifyDeliveryError(Object.assign(new Error('timeout'), {name: 'TimeoutError'})), 'ambiguous');
});

test('FIX-06 restart during a send: the same event is not resent (at-most-once), a changed text is a new event', async () => {
  const db = fakeAlertsDb(); const tg = channel();
  const a = {source: 'futpython', code: 'SYNC_STALE', key: 'cron', severity: 'critical', title: 't', message: 'm'};
  await emitAlert(a, db.client, {deliver: async () => ({attempted: false})});
  const row = db.alerts[0]; row.delivery_status = 'sending'; row.payload._event = eventId({...a, payload: {}, fingerprint: row.fingerprint});
  const r = await emitAlert(a, db.client, {deliver: tg.fn});
  assert.equal(r.reason, 'interrupted_send_not_repeated'); assert.equal(tg.sent.length, 0); assert.equal(row.delivery_status, 'unknown');
  await emitAlert({...a, message: 'm2'}, db.client, {deliver: tg.fn});
  assert.equal(tg.sent.length, 1);
});

test('FIX-03/06 resolved vs still-open incidents; a failed RISOLTO is retried next cycle', async () => {
  const db = fakeAlertsDb(); const tg = channel();
  const A = {source: 'futpython', code: 'SYNC_STALE', key: 'cron'}; const B = {source: 'futpython', code: 'DATA_CONTENT_STALE', key: 'content'};
  await emitAlert({...A, severity: 'critical', title: 'a', message: 'm'}, db.client, {deliver: tg.fn});
  await emitAlert({...B, severity: 'warning', title: 'b', message: 'm'}, db.client, {deliver: tg.fn});
  const down = channel(99);
  await resolveAlert(A, db.client, {deliver: down.fn, evidence: 'ciclo 20:17 completato'});
  assert.equal(db.alerts.find(x => x.code === 'SYNC_STALE').delivery_status, 'resolved_unnotified');
  await retryPendingResolutions(db.client, {deliver: tg.fn});
  const ris = tg.sent.filter(t => /RISOLTO/.test(t));
  assert.equal(ris.length, 1);
  assert.match(ris[0], /Problema: /); assert.match(ris[0], /Componente: /); assert.match(ris[0], /Risolto alle: \d{4}-\d\d-\d\dT[\d:.]+Z \(UTC\)/); assert.match(ris[0], /Verifica: ciclo 20:17/);
  assert.equal(db.alerts.find(x => x.code === 'DATA_CONTENT_STALE').resolved_at, null, 'open incident stays open, no notice');
});

test('FIX-06 the same error repeated does not spam', async () => {
  const db = fakeAlertsDb(); const tg = channel();
  for (let i = 0; i < 5; i++) await emitAlert({source: 'futpython', code: 'DATA_CONTENT_STALE', key: 'content', title: 'x', message: 'same'}, db.client, {deliver: tg.fn});
  assert.equal(tg.sent.length, 1); assert.equal(db.alerts.length, 1);
});

test('FIX-07 structured log lines carry a UTC ISO ts', () => {
  const out = []; logEvent('FUTPYTHON_CYCLE_BEGIN', {kind: 'cron'}, {now: () => new Date(NOW), out: l => out.push(l)});
  assert.match(out[0], /^FUTPYTHON_CYCLE_BEGIN \{"ts":"2026-10-22T20:00:00.000Z","kind":"cron"\}$/);
});

test('FIX-09 the resume skip is backfill-only: incremental runs re-fetch current seasons (SHA check prevents duplicates)', async () => {
  const { resumeSkipApplies } = await import('../src/jobs/futpython-sync.mjs');
  const cur = {season: '2026-2027'}; const past = {season: '2019-2020'};
  assert.equal(resumeSkipApplies(cur, 'incremental'), false);
  assert.equal(resumeSkipApplies(cur, 'backfill'), true);
  assert.equal(resumeSkipApplies(past, 'incremental'), true, 'final past seasons keep the skip');
  assert.equal(resumeSkipApplies({...cur, force: true}, 'backfill'), false);
});
