import { withClient } from '../db.mjs';
import { emitAlert, resolveAlert } from '../alerts.mjs';

let timer;

export async function checkDataWatchdog() {
  if (!process.env.DATABASE_URL) return {status:'skipped'};
  const staleHours = Number(process.env.FUTPYTHON_STALE_HOURS || 8);

  return withClient(async client => {
    const last = await client.query(
      `SELECT run_id,status,started_at,finished_at
       FROM fpt_sync_runs
       WHERE kind IN ('cron','manual')
       ORDER BY started_at DESC LIMIT 1`
    );
    const row = last.rows[0];
    const reference = row?.finished_at || row?.started_at;
    const stale = !reference || (Date.now() - new Date(reference).getTime()) > staleHours*3600000;

    if (stale) {
      await emitAlert({
        source:'futpython',severity:'critical',code:'SYNC_STALE',key:'cron',
        title:'FutPython sync non aggiornato',
        message:`Nessun sync recente entro ${staleHours} ore.`,
        payload:{lastRun:row || null,staleHours}
      },client);
    } else {
      await resolveAlert({source:'futpython',code:'SYNC_STALE',key:'cron'},client);
    }

    const failed = await client.query(
      `SELECT dataset_key,last_synced_at,last_error
       FROM fpt_dataset_state
       WHERE last_error IS NOT NULL
       ORDER BY last_synced_at DESC LIMIT 50`
    );
    if (failed.rowCount) {
      await emitAlert({
        source:'futpython',
        severity:failed.rowCount >= 5 ? 'critical':'warning',
        code:'DATASET_ERRORS',key:'aggregate',
        title:'Dataset FutPython con errori',
        message:`${failed.rowCount} dataset risultano con errore di sincronizzazione.`,
        payload:{count:failed.rowCount,datasets:failed.rows.map(r=>r.dataset_key)}
      },client);
    } else {
      await resolveAlert({source:'futpython',code:'DATASET_ERRORS',key:'aggregate'},client);
    }

    await client.query(
      `INSERT INTO data_watchdog_state(source,last_checked_at,last_success_at,last_run_id,meta)
       VALUES('futpython',now(),CASE WHEN $1 THEN NULL ELSE now() END,$2,$3::jsonb)
       ON CONFLICT(source) DO UPDATE SET
         last_checked_at=now(),
         last_success_at=CASE WHEN $1 THEN data_watchdog_state.last_success_at ELSE now() END,
         last_run_id=$2,
         meta=$3::jsonb`,
      [stale,row?.run_id || null,JSON.stringify({datasetErrors:failed.rowCount})]
    );
    return {status:stale?'critical':failed.rowCount?'warning':'ok',datasetErrors:failed.rowCount};
  });
}

export function startDataWatchdog() {
  if (process.env.DATA_WATCHDOG_ENABLED === 'false') return;
  const intervalMs = Number(process.env.DATA_WATCHDOG_INTERVAL_MS || 3600000);
  setTimeout(()=>checkDataWatchdog().catch(e=>console.error('DATA_WATCHDOG_ERROR',String(e?.message||e))),30000);
  timer=setInterval(()=>checkDataWatchdog().catch(e=>console.error('DATA_WATCHDOG_ERROR',String(e?.message||e))),intervalMs);
  timer.unref?.();
  console.log('DATA_WATCHDOG_READY '+JSON.stringify({intervalMs}));
}

export function stopDataWatchdog() {
  if (timer) clearInterval(timer);
  timer=undefined;
}
