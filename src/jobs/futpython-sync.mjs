import { randomUUID } from 'node:crypto';
import { withClient } from '../db.mjs';
import { fetchCatalog, isCurrentSeason } from '../providers/futpython/catalog.mjs';
import { fetchDataset, fetchToday } from '../providers/futpython/client.mjs';
import { storeDataset, upsertCatalog } from '../providers/futpython/store.mjs';
import { emitAlert, resolveAlert } from '../alerts.mjs';

const LOCK_ID = 76420311;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function recordRun(client, runId, kind, status, stats) {
  const errors = stats.errors || [];
  await client.query(
    `INSERT INTO fpt_sync_runs(
      run_id,kind,status,started_at,finished_at,catalog_entries,datasets_attempted,datasets_changed,
      snapshots_inserted,rows_seen,rows_inserted,fields_seen,errors,meta
    ) VALUES($1,$2,$3,$4,CASE WHEN $3='running' THEN NULL ELSE now() END,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb)
    ON CONFLICT(run_id) DO UPDATE SET
      status=excluded.status,
      finished_at=excluded.finished_at,
      catalog_entries=excluded.catalog_entries,
      datasets_attempted=excluded.datasets_attempted,
      datasets_changed=excluded.datasets_changed,
      snapshots_inserted=excluded.snapshots_inserted,
      rows_seen=excluded.rows_seen,
      rows_inserted=excluded.rows_inserted,
      fields_seen=excluded.fields_seen,
      errors=excluded.errors,
      meta=excluded.meta`,
    [
      runId,kind,status,stats.startedAt,stats.catalogEntries||0,stats.datasetsAttempted||0,
      stats.datasetsChanged||0,stats.snapshotsInserted||0,stats.rowsSeen||0,stats.rowsInserted||0,
      stats.fieldsSeen||0,JSON.stringify(errors),JSON.stringify(stats.meta||{})
    ]
  );
}

async function syncEntry(client, entry, stats) {
  stats.datasetsAttempted++;
  try {
    const previous = await client.query('SELECT last_row_count FROM fpt_dataset_state WHERE dataset_key=$1',[entry.datasetKey]);
    const previousRows = previous.rows[0]?.last_row_count ?? null;
    const data = await fetchDataset(entry);
    stats.rowsSeen += data.rows.length;
    const stored = await storeDataset(client, {
      datasetKey:entry.datasetKey,
      sourceKind:'dataset',
      providerPath:data.providerPath,
      countrySlug:entry.countrySlug,
      leagueSlug:entry.leagueSlug,
      season:entry.season,
      ...data
    });
    if (stored.changed) {
      stats.datasetsChanged++;
      stats.snapshotsInserted++;
      stats.rowsInserted += stored.rowsInserted;
    }
    stats.fieldsSeen = Math.max(stats.fieldsSeen, stored.fields);
    for (const field of stored.newFields || []) {
      stats.newFields.add(field);
      await emitAlert({source:'futpython',severity:'info',code:'NEW_FIELD',key:field,title:'Nuova colonna FutPythonTrader',message:`Rilevata nuova colonna: ${field}`,payload:{field,datasetKey:entry.datasetKey}},client);
    }
    if (previousRows !== null && previousRows >= 20 && data.rows.length < Math.floor(previousRows*0.5)) {
      await emitAlert({source:'futpython',severity:'warning',code:'ROW_COUNT_DROP',key:entry.datasetKey,title:'Calo anomalo righe FutPython',message:`${entry.datasetKey}: ${previousRows} → ${data.rows.length} righe.`,payload:{datasetKey:entry.datasetKey,previousRows,currentRows:data.rows.length}},client);
    } else {
      await resolveAlert({source:'futpython',code:'ROW_COUNT_DROP',key:entry.datasetKey},client);
    }
    await resolveAlert({source:'futpython',code:'DATASET_SYNC_FAILED',key:entry.datasetKey},client);
  } catch (error) {
    const message = String(error?.message || error).replace(/api_key=[^&\s]+/gi,'api_key=[REDACTED]');
    stats.errors.push({datasetKey:entry.datasetKey,error:message});
    await emitAlert({source:'futpython',severity:'warning',code:'DATASET_SYNC_FAILED',key:entry.datasetKey,title:'Sync dataset FutPython fallito',message:`${entry.datasetKey}: ${message}`,payload:{datasetKey:entry.datasetKey}},client);
    await client.query(
      'UPDATE fpt_dataset_state SET last_synced_at=now(),last_error=$2 WHERE dataset_key=$1',
      [entry.datasetKey,message.slice(0,1000)]
    );
  }
}

async function syncToday(client, stats, dateIso) {
  try {
    const data = await fetchToday(dateIso);
    const key = `today/${dateIso}`;
    stats.rowsSeen += data.rows.length;
    const stored = await storeDataset(client, {
      datasetKey:key, sourceKind:'today', providerPath:data.providerPath,
      text:data.text, headers:data.headers, rows:data.rows
    });
    if (stored.changed) {
      stats.snapshotsInserted++;
      stats.rowsInserted += stored.rowsInserted;
    }
    stats.fieldsSeen = Math.max(stats.fieldsSeen, stored.fields);
    for (const field of stored.newFields || []) {
      stats.newFields.add(field);
      await emitAlert({source:'futpython',severity:'info',code:'NEW_FIELD',key:field,title:'Nuova colonna FutPythonTrader',message:`Rilevata nuova colonna: ${field}`,payload:{field,datasetKey:key}},client);
    }
  } catch (error) {
    stats.errors.push({datasetKey:`today/${dateIso}`,error:String(error?.message||error)});
  }
}

export async function runFutpythonSync({kind='manual', mode='incremental'} = {}) {
  if (!process.env.FUTPYTHON_API_KEY?.trim()) return {status:'skipped',reason:'missing_key'};
  if (!process.env.DATABASE_URL?.trim()) return {status:'skipped',reason:'missing_database'};

  return withClient(async client => {
    const lock = await client.query('SELECT pg_try_advisory_lock($1) AS ok',[LOCK_ID]);
    if (!lock.rows[0]?.ok) return {status:'skipped',reason:'lock_busy'};

    const runId = `fpt-${Date.now()}-${randomUUID().slice(0,8)}`;
    const stats = {startedAt:new Date(),errors:[],newFields:new Set(),newDatasets:new Set(),meta:{mode}};
    try {
      await recordRun(client,runId,kind,'running',stats);

      const catalog = await fetchCatalog();
      stats.catalogEntries = catalog.length;
      await client.query('BEGIN');
      try {
        const catalogResult = await upsertCatalog(client,catalog);
        for (const entry of catalogResult.newDatasets || []) {
          stats.newDatasets.add(entry.datasetKey);
          await emitAlert({source:'futpython',severity:'info',code:'NEW_DATASET',key:entry.datasetKey,title:'Nuovo dataset FutPythonTrader',message:`Nuovo dataset disponibile: ${entry.datasetKey}`,payload:entry},client);
        }
        await client.query('COMMIT');
      }
      catch (e) { await client.query('ROLLBACK'); throw e; }

      const targets = mode === 'backfill'
        ? catalog
        : catalog.filter(e => isCurrentSeason(e.season));

      for (const entry of targets) {
        if (mode === 'backfill' && !isCurrentSeason(entry.season) && !process.argv.includes('--force')) {
          const done = await client.query(
            'SELECT last_snapshot_id FROM fpt_dataset_state WHERE dataset_key=$1 AND last_snapshot_id IS NOT NULL',
            [entry.datasetKey]
          );
          if (done.rowCount) continue;
        }
        await syncEntry(client,entry,stats);
        if (Number(process.env.FUTPYTHON_SYNC_DELAY_MS || 150) > 0) {
          await sleep(Number(process.env.FUTPYTHON_SYNC_DELAY_MS || 150));
        }
      }

      const today = new Date().toISOString().slice(0,10);
      await syncToday(client,stats,today);

      const status = stats.errors.length
        ? (stats.datasetsChanged || stats.rowsInserted ? 'partial' : 'failed')
        : 'complete';
      stats.meta.newFields=[...stats.newFields];
      stats.meta.newDatasets=[...stats.newDatasets];
      await recordRun(client,runId,kind,status,stats);
      if (status === 'failed' || status === 'partial') {
        await emitAlert({source:'futpython',severity:status==='failed'?'critical':'warning',code:'SYNC_RUN_'+status.toUpperCase(),key:'latest',title:`FutPython sync ${status}`,message:`Run ${runId}: ${stats.errors.length} errori.`,payload:{runId,status,errorCount:stats.errors.length}},client);
      } else {
        await resolveAlert({source:'futpython',code:'SYNC_RUN_FAILED',key:'latest'},client);
        await resolveAlert({source:'futpython',code:'SYNC_RUN_PARTIAL',key:'latest'},client);
      }
      console.log('FUTPYTHON_SYNC '+JSON.stringify({
        runId,status,mode,catalogEntries:stats.catalogEntries,
        datasetsAttempted:stats.datasetsAttempted,datasetsChanged:stats.datasetsChanged,
        snapshotsInserted:stats.snapshotsInserted,rowsSeen:stats.rowsSeen,
        rowsInserted:stats.rowsInserted,fieldsSeen:stats.fieldsSeen,newFields:stats.newFields.size,newDatasets:stats.newDatasets.size,errorCount:stats.errors.length
      }));
      return {runId,status,...stats};
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)',[LOCK_ID]).catch(()=>{});
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const mode = process.argv.includes('--backfill') ? 'backfill' : 'incremental';
  runFutpythonSync({kind:mode==='backfill'?'backfill':'manual',mode})
    .then(r => {
      if (r?.status === 'failed') process.exitCode = 1;
    })
    .catch(e => {
      console.error('FUTPYTHON_SYNC_FATAL', String(e?.message||e).replace(/api_key=[^&\s]+/gi,'api_key=[REDACTED]'));
      process.exitCode = 1;
    });
}
