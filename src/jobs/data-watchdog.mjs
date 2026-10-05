import { withClient } from '../db.mjs';
import { emitAlert, resolveAlert } from '../alerts.mjs';
import { budgetConfig, budgetPressure, countsTowardCircuit } from '../providers/futpython/budget.mjs';
import { reconcileFpt } from '../providers/futpython/reconciliation.mjs';

let timer;

export function syncIsStale(reference, now = Date.now(), staleHours = 8) {
  if (!reference) return true;
  return now - new Date(reference).getTime() > staleHours * 3600000;
}

async function alertOrResolve(client, active, alert, deliver) {
  if (active) await emitAlert(alert, client, deliver ? {deliver} : {});
  else await resolveAlert({source: alert.source, code: alert.code, key: alert.key}, client);
}

export async function evaluateProviderAlerts(client, {deliver, limits, circuitFailures} = {}) {
  const config = budgetConfig();
  const perDay = limits?.perDay ?? config.perDay;
  const perMinute = limits?.perMinute ?? config.perMinute;
  const needed = circuitFailures ?? config.circuitFailures;
  const usage = await client.query(
    `SELECT
       count(*) FILTER (
         WHERE outcome = ANY('{upstream,429,error}'::text[])
           AND recorded_at > now() - interval '1 minute'
       )::int AS minute_used,
       count(*) FILTER (
         WHERE outcome = ANY('{upstream,429,error}'::text[])
           AND recorded_at > now() - interval '1 day'
       )::int AS day_used,
       count(*) FILTER (
         WHERE outcome = '429' AND recorded_at > now() - interval '1 hour'
       )::int AS recent_429
     FROM fpt_request_ledger`
  );
  const recent = await client.query(
    `SELECT outcome, http_status
     FROM fpt_request_ledger
     ORDER BY recorded_at DESC
     LIMIT $1`,
    [needed]
  );
  const row = usage.rows[0] || {};
  const level = budgetPressure({
    dayUsed: row.day_used || 0,
    dayLimit: perDay,
    minuteUsed: row.minute_used || 0,
    minuteLimit: perMinute
  });
  await alertOrResolve(client, level === 'warning', {
    source: 'futpython', severity: 'warning', code: 'BUDGET_WARNING', key: 'day',
    title: 'Budget richieste FutPython in avviso',
    message: 'Il consumo di richieste ha superato la soglia di avviso.',
    payload: {level, dayUsed: row.day_used || 0, dayLimit: perDay}
  }, deliver);
  await alertOrResolve(client, level === 'critical', {
    source: 'futpython', severity: 'critical', code: 'BUDGET_CRITICAL', key: 'day',
    title: 'Budget richieste FutPython critico',
    message: 'Il consumo di richieste è vicino all’esaurimento.',
    payload: {level, dayUsed: row.day_used || 0, dayLimit: perDay}
  }, deliver);
  const recent429 = row.recent_429 || 0;
  await alertOrResolve(client, recent429 > 0, {
    source: 'futpython', severity: 'warning', code: 'RATE_LIMIT_429', key: 'aggregate',
    title: 'Risposte 429 FutPython',
    message: `${recent429} risposte 429 nell’ultima ora.`,
    payload: {count: recent429}
  }, deliver);
  const circuitOpen = recent.rowCount >= needed && recent.rows.every(countsTowardCircuit);
  await alertOrResolve(client, circuitOpen, {
    source: 'futpython', severity: 'critical', code: 'CIRCUIT_OPEN', key: 'provider',
    title: 'Circuit breaker FutPython aperto',
    message: 'Errori ripetuti hanno aperto il circuit breaker.',
    payload: {failures: recent.rowCount}
  }, deliver);
  return {level, recent429, circuitOpen};
}

export async function checkDataWatchdog(options = {}) {
  const run = async client => {
    const staleHours = Number(options.staleHours ?? process.env.FUTPYTHON_STALE_HOURS ?? 8);
    const last = await client.query(
      `SELECT run_id,status,started_at,finished_at
       FROM fpt_sync_runs
       WHERE kind IN ('cron','manual','recovery')
       ORDER BY started_at DESC LIMIT 1`
    );
    const row = last.rows[0];
    const reference = row?.finished_at || row?.started_at;
    const stale = syncIsStale(reference, options.now ?? Date.now(), staleHours);
    await alertOrResolve(client, stale, {
      source: 'futpython', severity: 'critical', code: 'SYNC_STALE', key: 'cron',
      title: 'FutPython sync non aggiornato',
      message: `Nessun sync recente entro ${staleHours} ore.`,
      payload: {lastRun: row || null, staleHours}
    }, options.deliver);

    const failed = await client.query(
      `SELECT dataset_key,last_synced_at,last_error
       FROM fpt_dataset_state
       WHERE last_error IS NOT NULL
       ORDER BY last_synced_at DESC LIMIT 50`
    );
    await alertOrResolve(client, failed.rowCount > 0, {
      source: 'futpython',
      severity: failed.rowCount >= 5 ? 'critical' : 'warning',
      code: 'DATASET_ERRORS', key: 'aggregate',
      title: 'Dataset FutPython con errori',
      message: `${failed.rowCount} dataset risultano con errore di sincronizzazione.`,
      payload: {count: failed.rowCount, datasets: failed.rows.map(item => item.dataset_key)}
    }, options.deliver);

    const budget = await evaluateProviderAlerts(client, options);
    // #31 reconciliation rides on the watchdog cycle (startup, then hourly): no extra timer keeps Neon awake.
    let reconciliation = null;
    if (options.reconcile === true) {
      try {
        reconciliation = await reconcileFpt(client, {phase: options.phase || 'periodic', catchup: options.catchup || null,
          deliver: options.deliver || null});
      } catch (error) {
        reconciliation = {error: String(error?.message || error).slice(0, 200)};
      }
    }
    await client.query(
      `INSERT INTO data_watchdog_state(source,last_checked_at,last_success_at,last_run_id,meta)
       VALUES('futpython',now(),CASE WHEN $1 THEN NULL ELSE now() END,$2,$3::jsonb)
       ON CONFLICT(source) DO UPDATE SET
         last_checked_at=now(),
         last_success_at=CASE WHEN $1 THEN data_watchdog_state.last_success_at ELSE now() END,
         last_run_id=$2,
         meta=$3::jsonb`,
      [stale, row?.run_id || null, JSON.stringify({
        datasetErrors: failed.rowCount,
        budget: budget.level,
        recent429: budget.recent429,
        circuitOpen: budget.circuitOpen,
        reconciliation
      })]
    );
    return {
      status: stale ? 'critical' : failed.rowCount ? 'warning' : 'ok',
      stale,
      datasetErrors: failed.rowCount,
      budget,
      reconciliation
    };
  };

  if (options.client) return run(options.client);
  if (!process.env.DATABASE_URL) return {status: 'skipped'};
  return withClient(run);
}


export function phase8Gate(details) {
  if (!details || details.mirror_unchanged !== true || details.inbound_ignored !== true) return false;
  const cases = details.cases || {};
  const required = [
    'stale', 'recovery', 'dataset_error', 'resolved',
    'new_field', 'new_dataset', 'row_drop', 'regression', 'aggregated', 'suppressed',
    'budget_warning', 'budget_critical', 'budget_resolved', 'rate_limit', 'circuit',
    'real_watchdog_quiet'
  ];
  if (!required.every(key => cases[key] === true)) return false;
  const telegram = details.telegram || {};
  if (telegram.configured) {
    return telegram.sent === true && telegram.secondSuppressed === true && telegram.messages === 1 && telegram.outbound === true;
  }
  return telegram.reason === 'missing_config' && details.local_suppression === true;
}

export function startDataWatchdog() {
  if (process.env.DATA_WATCHDOG_ENABLED === 'false') return;
  const intervalMs = Number(process.env.DATA_WATCHDOG_INTERVAL_MS || 3600000);
  // A skipped incremental sync is caught up in this process, behind the same advisory lock and budget.
  const catchup = () => import('./futpython-sync.mjs').then(m => m.runFutpythonSync({kind: 'recovery', mode: 'incremental'}));
  const cycle = phase => checkDataWatchdog({reconcile: true, phase, catchup})
    .then(result => { if (result?.reconciliation) console.log('FUTPYTHON_RECONCILIATION ' + JSON.stringify(result.reconciliation)); })
    .catch(error => console.error('DATA_WATCHDOG_ERROR', String(error?.message || error)));
  setTimeout(() => cycle('startup'), 30000);
  timer = setInterval(() => cycle('periodic'), intervalMs);
  timer.unref?.();
  console.log('DATA_WATCHDOG_READY ' + JSON.stringify({intervalMs}));
}

export function stopDataWatchdog() {
  if (timer) clearInterval(timer);
  timer = undefined;
}
