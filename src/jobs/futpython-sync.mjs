import { randomUUID } from 'node:crypto';
import { withClient } from '../db.mjs';
import { fetchCatalog, isCurrentSeason } from '../providers/futpython/catalog.mjs';
import { fetchDataset, fetchToday } from '../providers/futpython/client.mjs';
import { storeDataset, upsertCatalog } from '../providers/futpython/store.mjs';
import { emitAlert, resolveAlert } from '../alerts.mjs';

const LOCK_ID = 76420311;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function recordRun(client, runId, kind, status, stats) {
  await client.query(
    `INSERT INTO fpt_sync_runs(
      run_id,kind,status,started_at,finished_at,catalog_entries,datasets_attempted,datasets_changed,
      snapshots_inserted,rows_seen,rows_inserted,fields_seen,errors,meta
    ) VALUES($1,$2,$3,$4,CASE WHEN $3='running' THEN NULL ELSE now() END,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb)
    ON CONFLICT(run_id) DO UPDATE SET
      status=excluded.status, finished_at=excluded.finished_at,
      catalog_entries=excluded.catalog_entries, datasets_attempted=excluded.datasets_attempted,
      datasets_changed=excluded.datasets_changed, snapshots_inserted=excluded.snapshots_inserted,
      rows_seen=excluded.rows_seen, rows_inserted=excluded.rows_inserted,
      fields_seen=excluded.fields_seen, errors=excluded.errors, meta=excluded.meta`,
    [
      runId,kind,status,stats.startedAt,stats.catalogEntries||0,stats.datasetsAttempted||0,
      stats.datasetsChanged||0,stats.snapshotsInserted||0,stats.rowsSeen||0,stats.rowsInserted||0,
      stats.fieldsSeen||0,JSON.stringify(stats.failures||[]),JSON.stringify(stats.meta||{})
    ]
  );
}

async function markAvailability(client, datasetKey, availability, reason=null) {
  await client.query(
    `UPDATE fpt_dataset_state
     SET availability=$2, unavailable_reason=$3, last_synced_at=now(),
         last_error=CASE WHEN $2='error' THEN $3 ELSE NULL END
     WHERE dataset_key=$1`,
    [datasetKey,availability,reason]
  );
}

async function syncEntry(client, entry, stats) {
  stats.datasetsAttempted++;
  const previous = await client.query(
    'SELECT last_row_count,last_snapshot_id,availability FROM fpt_dataset_state WHERE dataset_key=$1',
    [entry.datasetKey]
  );
  const previousRows = previous.rows[0]?.last_row_count ?? null;
  const previouslySucceeded = previous.rows[0]?.last_snapshot_id != null;

  try {
    const data = await fetchDataset(entry);
    stats.rowsSeen += data.rows.length;
    const stored = await storeDataset(client, {
      datasetKey:entry.datasetKey, sourceKind:'dataset',
      providerPath:data.providerPath, countrySlug:entry.countrySlug,
      leagueSlug:entry.leagueSlug, season:entry.season, ...data
    });

    if (stored.changed) {
      stats.datasetsChanged++;
      stats.snapshotsInserted++;
      stats.rowsInserted += stored.rowsInserted;
    }
    stats.fieldsSeen = Math.max(stats.fieldsSeen, stored.fields);
    for (const field of stored.newFields || []) stats.newFields.add(field);

    await markAvailability(client,entry.datasetKey,'available');

    if (previousRows !== null && previousRows >= 20 && data.rows.length < Math.floor(previousRows*0.5)) {
      stats.rowDrops.push({datasetKey:entry.datasetKey,previousRows,currentRows:data.rows.length});
    }
  } catch (error) {
    const message = String(error?.message || error).replace(/api_key=[^&\s]+/gi,'api_key=[REDACTED]');
    if (error?.status === 404 && !previouslySucceeded) {
      stats.unavailable404.push(entry.datasetKey);
      await markAvailability(client,entry.datasetKey,'unavailable_404','HTTP 404');
      return;
    }

    const failure = {
      datasetKey:entry.datasetKey,
      error:message,
      status:error?.status || null,
      regression404:error?.status === 404 && previouslySucceeded
    };
    stats.failures.push(failure);
    await markAvailability(client,entry.datasetKey,'error',message.slice(0,1000));
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
    for (const field of stored.newFields || []) stats.newFields.add(field);
  } catch (error) {
    stats.failures.push({
      datasetKey:`today/${dateIso}`,
      error:String(error?.message||error).replace(/api_key=[^&\s]+/gi,'api_key=[REDACTED]'),
      status:error?.status || null
    });
  }
}

async function emitRunSummaryAlerts(client, stats, {bootstrap}) {
  if (!bootstrap && stats.newFields.size) {
    const fields=[...stats.newFields].sort();
    await emitAlert({
      source:'futpython',severity:'info',code:'NEW_FIELDS_AGG',key:'schema',
      title:'Nuove colonne FutPythonTrader',
      message:`${fields.length} nuove colonne rilevate: ${fields.slice(0,20).join(', ')}${fields.length>20?' …':''}`,
      payload:{count:fields.length,fields}
    },client);
  }

  if (!bootstrap && stats.newDatasets.size) {
    const datasets=[...stats.newDatasets].sort();
    await emitAlert({
      source:'futpython',severity:'info',code:'NEW_DATASETS_AGG',key:'catalog',
      title:'Nuovi dataset FutPythonTrader',
      message:`${datasets.length} nuovi dataset/leghe/stagioni rilevati.`,
      payload:{count:datasets.length,datasets}
    },client);
  }

  if (stats.rowDrops.length) {
    await emitAlert({
      source:'futpython',severity:'warning',code:'ROW_COUNT_DROPS_AGG',key:'aggregate',
      title:'Calo anomalo righe FutPython',
      message:`${stats.rowDrops.length} dataset hanno perso oltre il 50% delle righe rispetto al sync precedente.`,
      payload:{datasets:stats.rowDrops}
    },client);
  } else {
    await resolveAlert({source:'futpython',code:'ROW_COUNT_DROPS_AGG',key:'aggregate'},client);
  }

  if (stats.failures.length) {
    const regressions=stats.failures.filter(x=>x.regression404);
    await emitAlert({
      source:'futpython',
      severity:stats.failures.length>=5 || regressions.length ? 'critical':'warning',
      code:'SYNC_FAILURES_AGG',key:'aggregate',
      title:'Problemi sincronizzazione FutPython',
      message:`${stats.failures.length} errori reali nel run; ${regressions.length} regressioni 404 su dataset prima funzionanti.`,
      payload:{count:stats.failures.length,regressions:regressions.length,failures:stats.failures.slice(0,50)}
    },client);
  } else {
    await resolveAlert({source:'futpython',code:'SYNC_FAILURES_AGG',key:'aggregate'},client);
  }
}

export async function runFutpythonSync({kind='manual', mode='incremental'} = {}) {
  if (!process.env.FUTPYTHON_API_KEY?.trim()) return {status:'skipped',reason:'missing_key'};
  if (!process.env.DATABASE_URL?.trim()) return {status:'skipped',reason:'missing_database'};

  return withClient(async client => {
    const lock = await client.query('SELECT pg_try_advisory_lock($1) AS ok',[LOCK_ID]);
    if (!lock.rows[0]?.ok) return {status:'skipped',reason:'lock_busy'};

    const runId = `fpt-${Date.now()}-${randomUUID().slice(0,8)}`;
    const baselineResult = await client.query('SELECT count(*)::int AS n FROM fpt_schema_fields');
    const bootstrap = mode==='backfill' || (baselineResult.rows[0]?.n || 0)===0;
    const stats = {
      startedAt:new Date(),failures:[],newFields:new Set(),newDatasets:new Set(),
      unavailable404:[],rowDrops:[],meta:{mode,bootstrap}
    };

    try {
      await recordRun(client,runId,kind,'running',stats);

      const catalog = await fetchCatalog();
      stats.catalogEntries = catalog.length;
      await client.query('BEGIN');
      try {
        const catalogResult = await upsertCatalog(client,catalog);
        for (const entry of catalogResult.newDatasets || []) stats.newDatasets.add(entry.datasetKey);
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      }

      const targets = mode==='backfill' ? catalog : catalog.filter(e=>isCurrentSeason(e.season));
      for (const entry of targets) {
        if (mode==='backfill' && !isCurrentSeason(entry.season) && !process.argv.includes('--force')) {
          const done=await client.query(
            'SELECT last_snapshot_id FROM fpt_dataset_state WHERE dataset_key=$1 AND last_snapshot_id IS NOT NULL',
            [entry.datasetKey]
          );
          if (done.rowCount) continue;
        }
        await syncEntry(client,entry,stats);
        const delay=Number(process.env.FUTPYTHON_SYNC_DELAY_MS || 150);
        if (delay>0) await sleep(delay);
      }

      await syncToday(client,stats,new Date().toISOString().slice(0,10));

      const status = stats.failures.length
        ? (stats.datasetsChanged || stats.rowsInserted ? 'partial':'failed')
        : 'complete';

      stats.meta.newFields=[...stats.newFields];
      stats.meta.newDatasets=[...stats.newDatasets];
      stats.meta.unavailable404=stats.unavailable404;
      stats.meta.rowDrops=stats.rowDrops;
      await recordRun(client,runId,kind,status,stats);
      await emitRunSummaryAlerts(client,stats,{bootstrap});

      console.log('FUTPYTHON_SYNC '+JSON.stringify({
        runId,status,mode,bootstrap,catalogEntries:stats.catalogEntries,
        datasetsAttempted:stats.datasetsAttempted,datasetsChanged:stats.datasetsChanged,
        snapshotsInserted:stats.snapshotsInserted,rowsSeen:stats.rowsSeen,
        rowsInserted:stats.rowsInserted,fieldsSeen:stats.fieldsSeen,
        newFields:stats.newFields.size,newDatasets:stats.newDatasets.size,
        unavailable404:stats.unavailable404.length,errorCount:stats.failures.length
      }));
      return {runId,status,...stats};
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)',[LOCK_ID]).catch(()=>{});
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const mode=process.argv.includes('--backfill')?'backfill':'incremental';
  runFutpythonSync({kind:mode==='backfill'?'backfill':'manual',mode})
    .then(r=>{ if (r?.status==='failed') process.exitCode=1; })
    .catch(e=>{
      console.error('FUTPYTHON_SYNC_FATAL',String(e?.message||e).replace(/api_key=[^&\s]+/gi,'api_key=[REDACTED]'));
      process.exitCode=1;
    });
}
