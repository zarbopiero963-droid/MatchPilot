import { Cron } from 'croner';
import { runFutpythonSync } from './futpython-sync.mjs';
import { logEvent } from '../log.mjs';

let job;

// t138: refresh the watchdog heartbeat and freshness right after a cycle (errors are logged by the watchdog itself).
export async function afterCycle(trigger) {
  const fn = trigger || (await import('./data-watchdog.mjs')).triggerDataWatchdog;
  try { await fn('post-cycle'); } catch {}
}

export function startFutpythonCron() {
  if (process.env.FUTPYTHON_CRON_ENABLED === 'false') return null;
  if (!process.env.FUTPYTHON_API_KEY || !process.env.DATABASE_URL) return null;

  const expression = process.env.FUTPYTHON_CRON || '17 */6 * * *';
  const timezone = process.env.FUTPYTHON_CRON_TZ || 'Europe/Rome';

  job = new Cron(expression, { timezone, protect: true }, async () => {
    const started = Date.now();
    logEvent('FUTPYTHON_CYCLE_BEGIN', {kind: 'cron', expression, timezone});
    try {
      const r = await runFutpythonSync({kind:'cron',mode:'incremental'});
      logEvent(r?.status === 'skipped' ? 'FUTPYTHON_CYCLE_SKIPPED' : 'FUTPYTHON_CYCLE_END', {kind: 'cron', status: r?.status ?? null,
        reason: r?.reason ?? null, runId: r?.runId ?? null, datasetsAttempted: r?.datasetsAttempted ?? null,
        datasetsChanged: r?.datasetsChanged ?? null, datasetErrors: r?.failures?.length ?? null, durationMs: Date.now() - started});
      await afterCycle();
    }
    catch (e) {
      logEvent('FUTPYTHON_CYCLE_ERROR', {kind: 'cron', durationMs: Date.now() - started,
        error: String(e?.message||e).replace(/api_key=[^&\s]+/gi,'api_key=[REDACTED]').slice(0, 300)}, {out: console.error});
    }
  });

  logEvent('FUTPYTHON_CRON_READY', {expression, timezone, nextRun: job.nextRun()?.toISOString?.() ?? null});
  return job;
}

export const futpythonCronBusy = () => Boolean(job?.isBusy?.());

export function stopFutpythonCron() {
  if (job) job.stop();
  job = undefined;
}
