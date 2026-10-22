#!/usr/bin/env node
// t131u/t132u FIX-01: watchdog that runs OUTSIDE the FPT worker (systemd timer matchpilot-fpt-liveness.timer, its own
// process, no paid service). It keeps working when the worker process is dead. It detects: worker unit not active,
// worker hung (watchdog heartbeat older than 2h while the unit is "active"), missed scheduler cycles (last cycle older
// than cycle 6h + grace, or than FPT_LIVENESS_MAX_HOURS), and persistent errors (>= 3 consecutive failed runs).
// Alerts go through the deduplicated store; when the condition clears, one RISOLTO notice with evidence.
import { execFile } from 'node:child_process';
import { emitAlert, resolveAlert } from '../src/alerts.mjs';
import { withClient, closePool } from '../src/db.mjs';
import { classifyFreshness } from '../src/providers/futpython/freshness.mjs';

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
  workerActive} = {}) {
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

if (import.meta.url === `file://${process.argv[1]}`) {
  try { console.log(JSON.stringify(await withClient(client => probe(client)))); }
  catch (error) { console.error(new Date().toISOString(), 'FPT_LIVENESS_ERROR', String(error?.message || error)); process.exitCode = 1; }
  finally { try { await closePool(); } catch {} }
}
