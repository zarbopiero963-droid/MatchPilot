#!/usr/bin/env node
// t131u: liveness probe that runs OUTSIDE the FPT worker (systemd timer matchpilot-fpt-liveness.timer). If the newest
// fpt_sync_runs row is older than FPT_LIVENESS_MAX_HOURS (default 7), it raises FPT_WORKER_LIVENESS through the same
// deduplicated alert store; when runs resume, the alert is resolved (one '✅ RISOLTO' notice if it had been delivered).
import { emitAlert, resolveAlert } from '../src/alerts.mjs';
import { withClient, closePool } from '../src/db.mjs';

export function livenessVerdict(lastStartedAt, now = Date.now(), maxHours = 7) {
  const ageHours = lastStartedAt ? (now - new Date(lastStartedAt).getTime()) / 3600000 : Infinity;
  return {dead: ageHours > maxHours, ageHours: Number.isFinite(ageHours) ? Math.round(ageHours * 10) / 10 : null,
    lastStartedAt: lastStartedAt ? new Date(lastStartedAt).toISOString() : null};
}

export async function probe(client, {now = Date.now(), maxHours = Number(process.env.FPT_LIVENESS_MAX_HOURS || 7), deliver} = {}) {
  const r = await client.query('SELECT max(started_at) AS last FROM fpt_sync_runs');
  const v = livenessVerdict(r.rows[0]?.last, now, maxHours);
  const key = {source: 'futpython', code: 'FPT_WORKER_LIVENESS', key: 'worker'};
  const options = deliver ? {deliver} : {};
  if (v.dead) {
    // The text holds only the last run time: it does not change while the worker stays down, so it is not repeated.
    await emitAlert({...key, severity: 'critical', title: 'Worker FPT fermo',
      message: `Nessun fpt_sync_runs da oltre ${maxHours}h (ultimo avvio: ${v.lastStartedAt ?? 'mai'}). Controllare matchpilot-fpt-worker.`,
      payload: v}, client, options);
  } else {
    await resolveAlert(key, client, options);
  }
  return {probe: 'FPT_LIVENESS', ...v, maxHours, at: new Date(now).toISOString()};
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try { console.log(JSON.stringify(await withClient(client => probe(client)))); }
  catch (error) { console.error(new Date().toISOString(), 'FPT_LIVENESS_ERROR', String(error?.message || error)); process.exitCode = 1; }
  finally { try { await closePool(); } catch {} }
}
