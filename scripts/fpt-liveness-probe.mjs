#!/usr/bin/env node
// t131u/t132u FIX-01: watchdog that runs OUTSIDE the FPT worker (systemd timer matchpilot-fpt-liveness.timer, its own
// process, no paid service). It keeps working when the worker process is dead. It detects: worker unit not active,
// worker hung (watchdog heartbeat older than 2h while the unit is "active"), missed scheduler cycles (last cycle older
// than cycle 6h + grace, or than FPT_LIVENESS_MAX_HOURS), and persistent errors (>= 3 consecutive failed runs).
// Alerts go through the deduplicated store; when the condition clears, one RISOLTO notice with evidence.
import { execFile } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { emitAlert, resolveAlert } from '../src/alerts.mjs';
import { withClient, closePool } from '../src/db.mjs';
import { classifyFreshness } from '../src/providers/futpython/freshness.mjs';
import { fptRetired, RETIRED_RESOLUTION } from '../src/providers/futpython/retired.mjs';

export function livenessVerdict(lastStartedAt, now = Date.now(), maxHours = 7) {
  const ageHours = lastStartedAt ? (now - new Date(lastStartedAt).getTime()) / 3600000 : Infinity;
  return {dead: ageHours > maxHours, ageHours: Number.isFinite(ageHours) ? Math.round(ageHours * 10) / 10 : null,
    lastStartedAt: lastStartedAt ? new Date(lastStartedAt).toISOString() : null};
}

export function unitActive(unit = 'matchpilot-fpt-worker.service', run = execFile) {
  return new Promise(done => run('systemctl', ['is-active', unit], {timeout: 5000}, (error, stdout) => {
    const state = String(stdout || '').trim();
    // Unknown (systemctl unavailable) is not "down": the heartbeat then decides.
    done(state === 'active' ? true : ['inactive', 'failed', 'deactivating', 'activating'].includes(state) ? false : null);
  }));
}

export function livenessFindings({lastRun, heartbeatAt, workerActive, consecutiveFailed = 0}, {now = Date.now(), maxHours = 7} = {}) {
  const v = livenessVerdict(lastRun?.started_at, now, maxHours);
  const f = classifyFreshness({lastRun, watchdogCheckedAt: heartbeatAt, workerActive, maxChangedAt: now}, {now});
  const problems = [];
  if (f.worker === 'DOWN') problems.push('unità matchpilot-fpt-worker non attiva');
  else if (f.worker === 'HUNG_OR_DOWN') problems.push(`heartbeat del watchdog interno fermo (ultimo: ${heartbeatAt ? new Date(heartbeatAt).toISOString() : 'mai'})`);
  if (v.dead || f.scheduler === 'MISSED_CYCLES') problems.push(`ultimo ciclo FPT: ${v.lastStartedAt ?? 'mai'} (cicli saltati: ${f.missedCycles ?? '?'})`);
  // `dead` last: the age-only verdict must not override the unit/heartbeat findings.
  return {...v, problems, persistentErrors: consecutiveFailed >= 3, consecutiveFailed,
    worker: f.worker, scheduler: f.scheduler, dead: problems.length > 0};
}

export async function probe(client, {now = Date.now(), maxHours = Number(process.env.FPT_LIVENESS_MAX_HOURS || 7), deliver,
  workerActive, retired = fptRetired()} = {}) {
  // MP-FPT-RETIRE-01: a retired source has no cycles to miss. The FPT worker alerts are closed once with the reason and
  // never raised again; the database outage report (below, in the entry point) keeps working.
  if (retired) {
    const options = deliver ? {deliver} : {};
    for (const key of [{source: 'futpython', code: 'FPT_WORKER_LIVENESS', key: 'worker'}, {source: 'futpython', code: 'FPT_PERSISTENT_ERRORS', key: 'runs'}]) {
      await resolveAlert(key, client, {...options, evidence: RETIRED_RESOLUTION});
    }
    return {probe: 'FPT_LIVENESS', retired: true, at: new Date(now).toISOString()};
  }
  const r = (await client.query(`SELECT
      (SELECT row_to_json(x) FROM (SELECT run_id, status, started_at, finished_at FROM fpt_sync_runs ORDER BY started_at DESC LIMIT 1) x) AS last_run,
      (SELECT last_checked_at FROM data_watchdog_state WHERE source='futpython') AS heartbeat_at,
      (SELECT count(*)::int FROM (SELECT status FROM fpt_sync_runs WHERE kind IN ('cron','manual','recovery') ORDER BY started_at DESC LIMIT 3) t
         WHERE status='failed') AS failed_last3`)).rows[0] || {};
  const active = workerActive !== undefined ? workerActive : await unitActive();
  const v = livenessFindings({lastRun: r.last_run, heartbeatAt: r.heartbeat_at, workerActive: active,
    consecutiveFailed: r.failed_last3 || 0}, {now, maxHours});
  const options = deliver ? {deliver} : {};
  const key = {source: 'futpython', code: 'FPT_WORKER_LIVENESS', key: 'worker'};
  if (v.dead) {
    // The text holds only stable facts: it does not change while the worker stays down, so it is not repeated.
    await emitAlert({...key, severity: 'critical', title: 'Worker FPT fermo o bloccato',
      message: `${v.problems.join('; ')}. Controllare matchpilot-fpt-worker.`, payload: v}, client, options);
  } else {
    await resolveAlert(key, client, {...options,
      evidence: `unità attiva=${active}, heartbeat ${r.heartbeat_at ? new Date(r.heartbeat_at).toISOString() : '?'}, ultimo ciclo ${v.lastStartedAt}`});
  }
  const errKey = {source: 'futpython', code: 'FPT_PERSISTENT_ERRORS', key: 'runs'};
  if (v.persistentErrors) {
    await emitAlert({...errKey, severity: 'warning', title: 'Sync FPT in errore persistente',
      message: `Gli ultimi ${v.consecutiveFailed} cicli FPT sono falliti.`, payload: {consecutiveFailed: v.consecutiveFailed}}, client, options);
  } else {
    await resolveAlert(errKey, client, {...options, evidence: `ultimo ciclo ${r.last_run?.run_id ?? '?'} stato ${r.last_run?.status ?? '?'}`});
  }
  return {probe: 'FPT_LIVENESS', ...v, workerActive: active, maxHours, at: new Date(now).toISOString()};
}

// t138: the probe stores its alerts in PostgreSQL, so with the DB down it used to only exit 1 (blind). Now an
// unreachable DB is reported straight to Telegram, deduplicated by a state file (one alert per outage, one RISOLTO
// when the DB answers again). The message never contains the error text verbatim beyond a redacted 160 chars.
export function dbOutageStep(state, dbOk, {now = Date.now(), error = null} = {}) {
  const open = Boolean(state?.dbDown);
  if (!dbOk && !open) return {send: 'down', next: {dbDown: true, since: new Date(now).toISOString()}};
  if (!dbOk && open) return {send: null, next: state};
  if (dbOk && open) return {send: 'resolved', next: {dbDown: false, since: null, lastOutage: state.since}};
  return {send: null, next: state || {dbDown: false}};
}

export function dbOutageText(kind, {since, error, now = Date.now()} = {}) {
  const safe = String(error || '').replace(/postgres(ql)?:\/\/[^\s]+/gi, '[db-url]').replace(/password=\S+/gi, 'password=[REDACTED]').slice(0, 160);
  return kind === 'down'
    ? ['🚨 MATCHPILOT — CRITICO', 'Database non raggiungibile dal watchdog FPT', `Dal: ${since} (UTC). Errore: ${safe || 'n/d'}`,
       'Il watchdog non può verificare worker e cicli finché il DB non risponde.'].join('\n')
    : ['✅ MATCHPILOT — RISOLTO', 'Database di nuovo raggiungibile dal watchdog FPT',
       `Guasto iniziato: ${since} (UTC). Risolto alle: ${new Date(now).toISOString()} (UTC).`].join('\n');
}

async function sendDirect(text, env = process.env) {
  const token = env.MATCHPILOT_TELEGRAM_BOT_TOKEN?.trim(); const chatId = env.MATCHPILOT_TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) return {ok: false, reason: 'missing_config'};
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {method: 'POST', headers: {'content-type': 'application/json'},
    body: JSON.stringify({chat_id: chatId, text, disable_web_page_preview: true}), signal: AbortSignal.timeout(10000)});
  const body = await r.json().catch(() => null);
  return {ok: r.ok && body?.ok === true, status: r.status, messageId: body?.result?.message_id ?? null};
}

export async function handleDbOutage(dbOk, {error = null, now = Date.now(), stateFile, send = sendDirect, log = console.log} = {}) {
  let state = null;
  try { state = JSON.parse(readFileSync(stateFile, 'utf8')); } catch {}
  const step = dbOutageStep(state, dbOk, {now, error});
  if (!step.send) return {sent: null};
  const text = dbOutageText(step.send, {since: step.send === 'down' ? step.next.since : state.since, error, now});
  let result;
  try { result = await send(text); } catch (e) { result = {ok: false, error: String(e?.message || e).slice(0, 120)}; }
  log('FPT_LIVENESS_DB_ALERT ' + JSON.stringify({ts: new Date(now).toISOString(), kind: step.send, ok: result.ok, messageId: result.messageId ?? null}));
  // A failed 'down' send keeps the state closed so the next run retries; a failed RISOLTO keeps it open for the same reason.
  if (result.ok) { try { mkdirSync(join(stateFile, '..'), {recursive: true}); writeFileSync(stateFile, JSON.stringify(step.next)); } catch {} }
  return {sent: step.send, ok: result.ok};
}

const STATE_FILE = join(process.env.STATE_DIRECTORY || '/var/lib/matchpilot-fpt-liveness', 'db-outage.json');

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    console.log(JSON.stringify(await withClient(client => probe(client))));
    await handleDbOutage(true, {stateFile: STATE_FILE});
  } catch (error) {
    const msg = String(error?.message || error);
    console.error(new Date().toISOString(), 'FPT_LIVENESS_ERROR', msg.slice(0, 300));
    process.exitCode = 1;
    if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EHOSTUNREACH|timeout|terminat|Connection|too many clients|the database system is|57P0|53300/i.test(msg)) {
      await handleDbOutage(false, {error: msg, stateFile: STATE_FILE});
    }
  } finally { try { await closePool(); } catch {} }
}
