import { isCurrentSeason } from './catalog.mjs';
import { emitAlert, resolveAlert } from '../../alerts.mjs';
import { releaseSyncLock, trySyncLock } from './lock.mjs';

// #31 gap kinds for FutPythonTrader: what is detected, how urgent it is and what the recovery does.
// "fetch_dataset" / "refresh_dataset" are served by the next sync run; "catchup_sync" starts one; "none" is a
// classification only (the provider no longer serves the data or never published it).
export const GAP_KINDS = {
  incremental_sync_skipped: {priority: 'P1', action: 'catchup_sync', recoverable: true},
  interrupted_run: {priority: 'P1', action: 'next_run_resumes', recoverable: true},
  current_season_stale: {priority: 'P1', action: 'refresh_dataset', recoverable: true},
  never_attempted: {priority: 'P2', action: 'fetch_dataset', recoverable: true},
  available_without_snapshot: {priority: 'P2', action: 'fetch_dataset', recoverable: true},
  failed_dataset: {priority: 'P2', action: 'fetch_dataset', recoverable: true},
  missing_season: {priority: 'P2', action: 'fetch_dataset', recoverable: true},
  regression_404: {priority: 'P2', action: 'none', recoverable: false},
  season_not_published: {priority: 'P3', action: 'none', recoverable: false}
};

const OPEN = ['DETECTED', 'QUEUED', 'RECOVERING', 'PARTIAL', 'FAILED'];
const SOURCE = 'futpython';

export function reconConfig(env = process.env) {
  const num = (name, fallback) => {
    const value = Number(env[name] ?? fallback);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  };
  return {
    currentSeasonTtlHours: num('FUTPYTHON_CURRENT_SEASON_TTL_HOURS', 24),
    incrementalMaxGapHours: num('FUTPYTHON_INCREMENTAL_MAX_GAP_HOURS', 7),
    refreshPerRun: num('FUTPYTHON_REFRESH_PER_RUN', 50),
    recoveryPerRun: num('FUTPYTHON_RECOVERY_PER_RUN', 10),
    maxAttempts: num('FUTPYTHON_RECOVERY_MAX_ATTEMPTS', 3),
    retryFailedHours: num('FUTPYTHON_RECOVERY_RETRY_HOURS', 24),
    catchup: env.FUTPYTHON_RECON_CATCHUP !== 'false'
  };
}

function gap(kind, entity, expected, observed, scope = 'dataset') {
  const meta = GAP_KINDS[kind];
  return {gap_kind: kind, entity, scope, priority: meta.priority, action: meta.action, recoverable: meta.recoverable,
    expected, observed};
}

// Pure detection over already loaded rows (expected = catalog / schedule, observed = mirror).
export function detectGaps({datasets = [], seasonGaps = [], runs = [], now = new Date(), config = reconConfig()}) {
  const out = [];
  const flagged = new Set();
  const nowMs = new Date(now).getTime();
  for (const d of datasets) {
    const key = d.dataset_key;
    const observed = {availability: d.availability, last_snapshot_id: d.last_snapshot_id ?? null,
      last_success_at: d.last_success_at || null, ingest_complete: d.ingest_complete ?? null};
    let kind = null;
    if (d.http_disposition === 'REGRESSION_404') kind = 'regression_404';
    else if (d.availability === 'available' && (d.last_snapshot_id == null || d.ingest_complete === false)) kind = 'available_without_snapshot';
    else if (d.availability === 'error' || d.last_error) kind = 'failed_dataset';
    else if ((d.availability == null || d.availability === 'unknown') && d.last_snapshot_id == null && !d.last_synced_at) kind = 'never_attempted';
    else if (d.availability === 'available' && isCurrentSeason(d.season, new Date(now))) {
      const age = d.last_success_at ? (nowMs - new Date(d.last_success_at).getTime()) / 3600000 : Infinity;
      if (age > config.currentSeasonTtlHours) kind = 'current_season_stale';
    }
    if (!kind) continue;
    flagged.add(key);
    out.push(gap(kind, key, {in_catalog: true, ...(kind === 'current_season_stale' ? {max_age_hours: config.currentSeasonTtlHours} : {})}, observed));
  }
  for (const s of seasonGaps) {
    const key = `${s.country_slug}/${s.league_slug}/${s.season}`;
    if (flagged.has(key)) continue;
    if (s.in_catalog && s.missing_available) out.push(gap('missing_season', key, {available_in_catalog: true}, {mirrored: false}));
    else if (!s.in_catalog) out.push(gap('season_not_published', key, {season_between_published_ones: true}, {in_catalog: false}, 'season'));
  }
  const incremental = runs.filter(r => r.mode !== 'backfill' && ['cron', 'manual', 'recovery'].includes(r.kind));
  // A run cut short by a crash or a deploy is not a sync that happened.
  const lastGood = incremental.filter(r => r.status === 'complete' || (r.status === 'partial' && r.interrupted !== true))
    .map(r => new Date(r.finished_at || r.started_at).getTime()).sort((a, b) => b - a)[0];
  const gapHours = lastGood ? (nowMs - lastGood) / 3600000 : Infinity;
  if (gapHours > config.incrementalMaxGapHours) {
    out.push(gap('incremental_sync_skipped', 'incremental', {max_gap_hours: config.incrementalMaxGapHours},
      {last_good_run_at: lastGood ? new Date(lastGood).toISOString() : null}, 'pipeline'));
  }
  const sorted = [...runs].sort((a, b) => new Date(a.started_at) - new Date(b.started_at));
  for (const r of sorted) {
    if (r.status !== 'partial' || r.interrupted !== true) continue;
    // Resumed by any later run of the same mode that finished (dataset errors aside), not by another crash.
    const resumed = sorted.some(x => new Date(x.started_at) > new Date(r.started_at)
      && (x.status === 'complete' || (x.status === 'partial' && x.interrupted !== true))
      && (x.mode === 'backfill') === (r.mode === 'backfill'));
    if (!resumed) out.push(gap('interrupted_run', r.run_id, {status: 'complete'}, {status: 'partial', mode: r.mode}, 'run'));
  }
  return out;
}

async function loadInputs(client) {
  const datasets = (await client.query(
    `SELECT c.dataset_key, c.season, s.availability, s.http_disposition, s.last_snapshot_id, s.last_success_at,
            s.last_synced_at, s.last_error, r.ingest_complete
     FROM fpt_catalog c
     JOIN fpt_dataset_state s USING (dataset_key)
     LEFT JOIN fpt_raw_snapshots r ON r.snapshot_id = s.last_snapshot_id
     WHERE c.active`)).rows;
  const seasonGaps = (await client.query(
    `SELECT country_slug, league_slug, season, in_catalog, missing_available FROM fpt_season_gaps`)).rows;
  const runs = (await client.query(
    `SELECT run_id, kind, status, started_at, finished_at, COALESCE(meta->>'mode', CASE WHEN kind='backfill' THEN 'backfill' ELSE 'incremental' END) AS mode,
            COALESCE((meta->>'interrupted')::boolean, false) AS interrupted
     FROM fpt_sync_runs WHERE started_at > now() - interval '14 days' ORDER BY started_at`)).rows;
  return {datasets, seasonGaps, runs};
}

// Startup step (#31): a run left "running" by a crash or a deploy is marked interrupted, but only when no
// process holds the sync lock (a live run is never touched).
export async function markOrphanRuns(client) {
  if (!await trySyncLock(client)) return 0;
  try {
    const res = await client.query(
      `UPDATE fpt_sync_runs SET status='partial', finished_at=COALESCE(finished_at, now()),
         meta = COALESCE(meta,'{}'::jsonb) || '{"interrupted":true,"marked_by":"reconciliation"}'::jsonb
       WHERE status='running'`);
    return res.rowCount;
  } finally {
    await releaseSyncLock(client);
  }
}

async function upsertGap(client, g, now) {
  // A gap is the entity's: if its kind changes (never attempted -> failed), the open entry follows it.
  const open = await client.query(
    `UPDATE data_reconciliation_ledger SET last_seen_at=$3, observed=$4::jsonb,
       details = details || jsonb_build_object('current_kind', $5::text)
     WHERE source=$1 AND entity=$2 AND status = ANY($6::text[])`,
    [SOURCE, g.entity, now, JSON.stringify(g.observed), g.gap_kind, OPEN]);
  if (open.rowCount) return 'seen';
  const status = g.recoverable ? 'QUEUED' : 'UNRECOVERABLE';
  const res = await client.query(
    `INSERT INTO data_reconciliation_ledger(source, scope, entity, gap_kind, priority, detected_at, last_seen_at,
       expected, observed, missing, recovery_action, status, unrecoverable_count, recovery_finished_at, details)
     VALUES($1,$2,$3,$4,$5,$6,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10,$11,$12,$13,$14::jsonb)
     ON CONFLICT DO NOTHING`,
    [SOURCE, g.scope, g.entity, g.gap_kind, g.priority, now, JSON.stringify(g.expected), JSON.stringify(g.observed),
      JSON.stringify({[g.scope]: g.entity}), g.action, status, g.recoverable ? 0 : 1, g.recoverable ? null : now,
      JSON.stringify(g.recoverable ? {} : {cause: g.gap_kind})]);
  return res.rowCount ? 'new' : 'seen';
}

// Recovery targets for a sync run: queued dataset gaps, oldest and most urgent first, marked RECOVERING.
export async function recoveryTargets(client, {config = reconConfig(), runId = null} = {}) {
  // A FAILED gap is retried once a day (attempts start over), never in a tight loop.
  const pick = async (actions, limit) => (await client.query(
    `UPDATE data_reconciliation_ledger l
     SET attempts = CASE WHEN l.status = 'FAILED' THEN 1 ELSE l.attempts + 1 END,
       status='RECOVERING', recovery_started_at = now(), details = details || jsonb_build_object('run_id', $3::text)
     WHERE reconciliation_id IN (
       SELECT reconciliation_id FROM data_reconciliation_ledger
       WHERE source=$1 AND recovery_action = ANY($2::text[])
         AND (status IN ('DETECTED','QUEUED','PARTIAL')
           OR (status = 'FAILED' AND recovery_finished_at < now() - make_interval(hours => $5::int)))
       ORDER BY priority, detected_at, entity LIMIT $4)
     RETURNING l.entity, l.recovery_action`, [SOURCE, actions, runId, limit, Math.round(config.retryFailedHours)])).rows;
  const rows = [...await pick(['refresh_dataset'], config.refreshPerRun), ...await pick(['fetch_dataset'], config.recoveryPerRun)];
  if (!rows.length) return [];
  const catalog = (await client.query(
    `SELECT dataset_key, country_slug, league_slug, season, route FROM fpt_catalog WHERE active AND dataset_key = ANY($1::text[])`,
    [rows.map(r => r.entity)])).rows;
  const action = new Map(rows.map(r => [r.entity, r.recovery_action]));
  return catalog.map(c => ({datasetKey: c.dataset_key, countrySlug: c.country_slug, leagueSlug: c.league_slug,
    season: c.season, route: c.route, recovery: action.get(c.dataset_key), force: true}));
}

const PIPELINE_KINDS = new Set(['incremental_sync_skipped', 'interrupted_run']);

async function closeVanished(client, detected, now, {deferred = new Set(), config, phase, runId}) {
  const live = new Set(detected.map(g => g.entity));
  const open = (await client.query(
    `SELECT l.reconciliation_id, l.gap_kind, l.entity, l.status, l.attempts, s.availability, l.details->>'run_id' AS run_id,
            r.status AS run_status
     FROM data_reconciliation_ledger l
     LEFT JOIN fpt_dataset_state s ON s.dataset_key = l.entity
     LEFT JOIN fpt_sync_runs r ON r.run_id = l.details->>'run_id'
     WHERE l.source=$1 AND l.status = ANY($2::text[])`, [SOURCE, OPEN])).rows;
  const closed = {recovered: [], unrecoverable: [], failed: [], requeued: []};
  for (const row of open) {
    const still = live.has(row.entity);
    if (!still) {
      // The gap is gone. A dataset that answered 404 was not recovered: the provider does not serve it.
      const unrecoverable = row.availability === 'unavailable_404' && row.gap_kind !== 'current_season_stale';
      await client.query(
        `UPDATE data_reconciliation_ledger SET status=$2, recovery_finished_at=$3,
           recovered_count = CASE WHEN $2='RECOVERED' THEN 1 ELSE recovered_count END,
           unrecoverable_count = CASE WHEN $2='UNRECOVERABLE' THEN 1 ELSE unrecoverable_count END,
           details = details || $4::jsonb
         WHERE reconciliation_id=$1`,
        [row.reconciliation_id, unrecoverable ? 'UNRECOVERABLE' : 'RECOVERED', now,
          JSON.stringify(unrecoverable ? {cause: 'unavailable_404'} : {})]);
      (unrecoverable ? closed.unrecoverable : closed.recovered).push(`${row.gap_kind}:${row.entity}`);
      continue;
    }
    if (row.status !== 'RECOVERING') continue;
    // A dataset recovery is judged only by the run that attempted it; a pipeline catch-up by the periodic cycle.
    const owned = phase === 'post_run' ? row.run_id === runId && !PIPELINE_KINDS.has(row.gap_kind)
      : PIPELINE_KINDS.has(row.gap_kind);
    if (!owned) {
      // The run that took this dataset ended without judging it (crash, deploy): back in the queue.
      if (phase !== 'post_run' && !PIPELINE_KINDS.has(row.gap_kind) && row.run_status !== 'running') {
        await client.query(`UPDATE data_reconciliation_ledger SET status='QUEUED' WHERE reconciliation_id=$1`, [row.reconciliation_id]);
        closed.requeued.push(row.entity);
      }
      continue;
    }
    if (deferred.has(row.entity)) {
      // Deferred by the budget level: not an attempt.
      await client.query(`UPDATE data_reconciliation_ledger SET status='QUEUED', attempts=GREATEST(attempts-1,0) WHERE reconciliation_id=$1`,
        [row.reconciliation_id]);
      closed.requeued.push(row.entity);
    } else if (row.attempts >= config.maxAttempts) {
      await client.query(`UPDATE data_reconciliation_ledger SET status='FAILED', recovery_finished_at=$2 WHERE reconciliation_id=$1`,
        [row.reconciliation_id, now]);
      closed.failed.push(`${row.gap_kind}:${row.entity}`);
    } else {
      await client.query(`UPDATE data_reconciliation_ledger SET status='QUEUED' WHERE reconciliation_id=$1`, [row.reconciliation_id]);
      closed.requeued.push(row.entity);
    }
  }
  return closed;
}

async function writeCheckpoints(client, {now, config, detected}) {
  const runs = (await client.query(
    `SELECT COALESCE(meta->>'mode', CASE WHEN kind='backfill' THEN 'backfill' ELSE 'incremental' END) AS mode,
            max(started_at) AS last_attempt_at,
            max(finished_at) FILTER (WHERE status = 'complete'
              OR (status = 'partial' AND COALESCE((meta->>'interrupted')::boolean, false) = false)) AS last_success_at,
            (array_agg(run_id ORDER BY started_at DESC))[1] AS last_run_id,
            (array_agg(status ORDER BY started_at DESC))[1] AS last_status
     FROM fpt_sync_runs WHERE kind IN ('cron','manual','recovery','backfill') GROUP BY 1`)).rows;
  const byMode = Object.fromEntries(runs.map(r => [r.mode, r]));
  const failedSince = async mode => Number((await client.query(
    `SELECT count(*)::int AS n FROM fpt_sync_runs
     WHERE COALESCE(meta->>'mode', CASE WHEN kind='backfill' THEN 'backfill' ELSE 'incremental' END) = $1
       AND status = 'failed' AND started_at > COALESCE((SELECT max(started_at) FROM fpt_sync_runs
         WHERE status IN ('complete','partial') AND COALESCE(meta->>'mode', CASE WHEN kind='backfill' THEN 'backfill' ELSE 'incremental' END) = $1), '-infinity')`,
    [mode])).rows[0].n);
  const catalog = (await client.query(
    `SELECT (SELECT max(recorded_at) FROM fpt_request_ledger WHERE endpoint_family='catalog') AS last_attempt_at,
            (SELECT max(recorded_at) FROM fpt_request_ledger WHERE endpoint_family='catalog' AND outcome='upstream') AS last_success_at,
            s.snapshot_id, s.captured_at, s.catalog_count
     FROM (SELECT 1) one LEFT JOIN LATERAL (SELECT * FROM fpt_catalog_snapshots ORDER BY captured_at DESC LIMIT 1) s ON true`)).rows[0];
  const today = (await client.query(
    `SELECT max(acquired_at) AS last_acquired_at, (array_agg(dataset_key ORDER BY acquired_at DESC))[1] AS last_key
     FROM fpt_raw_snapshots WHERE source_kind='today'`)).rows[0];
  const terminal = (await client.query(
    `SELECT count(*) FILTER (WHERE s.availability IN ('available','unavailable_404','deprecated'))::int AS terminal,
            count(*)::int AS total
     FROM fpt_catalog c JOIN fpt_dataset_state s USING (dataset_key) WHERE c.active`)).rows[0];
  const stale = detected.filter(g => g.gap_kind === 'current_season_stale').length;
  const skipped = detected.some(g => g.gap_kind === 'incremental_sync_skipped');
  const rows = [
    {scope: 'catalog', last_attempt_at: catalog.last_attempt_at, last_success_at: catalog.last_success_at,
      last_acquired_at: catalog.captured_at, last_entity_id: catalog.snapshot_id,
      checkpoint: {catalog_count: catalog.catalog_count}, status: catalog.snapshot_id ? 'ok' : 'unknown'},
    {scope: 'incremental', last_attempt_at: byMode.incremental?.last_attempt_at, last_success_at: byMode.incremental?.last_success_at,
      last_entity_id: byMode.incremental?.last_run_id, checkpoint: {last_status: byMode.incremental?.last_status || null,
        max_gap_hours: config.incrementalMaxGapHours},
      status: !byMode.incremental ? 'unknown' : skipped ? 'stale' : 'ok', retry_count: await failedSince('incremental')},
    {scope: 'backfill', last_attempt_at: byMode.backfill?.last_attempt_at, last_success_at: byMode.backfill?.last_success_at,
      last_entity_id: byMode.backfill?.last_run_id,
      checkpoint: {terminal_datasets: terminal.terminal, catalog_datasets: terminal.total, remaining: terminal.total - terminal.terminal},
      status: !byMode.backfill ? 'unknown' : terminal.terminal === terminal.total ? 'ok' : 'stale', retry_count: await failedSince('backfill')},
    {scope: 'today', last_acquired_at: today.last_acquired_at, last_success_at: today.last_acquired_at, last_entity_id: today.last_key,
      checkpoint: {}, status: today.last_acquired_at ? 'ok' : 'unknown'},
    {scope: 'current_season', last_success_at: null, checkpoint: {stale_datasets: stale, ttl_hours: config.currentSeasonTtlHours},
      status: stale ? 'stale' : 'ok'}
  ];
  for (const r of rows) {
    await client.query(
      `INSERT INTO data_checkpoints(source, scope, last_attempt_at, last_success_at, last_acquired_at, last_entity_id,
         checkpoint, status, retry_count, updated_at)
       VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10)
       ON CONFLICT (source, scope) DO UPDATE SET last_attempt_at=excluded.last_attempt_at,
         last_success_at=excluded.last_success_at, last_acquired_at=excluded.last_acquired_at,
         last_entity_id=excluded.last_entity_id, checkpoint=excluded.checkpoint, status=excluded.status,
         retry_count=excluded.retry_count, updated_at=excluded.updated_at`,
      [SOURCE, r.scope, r.last_attempt_at || null, r.last_success_at || null, r.last_acquired_at || null,
        r.last_entity_id || null, JSON.stringify(r.checkpoint || {}), r.status, r.retry_count || 0, now]);
  }
}

async function emitReconAlerts(client, summary, deliver) {
  const options = deliver ? {deliver} : {};
  const open = (await client.query(
    `SELECT gap_kind, priority, count(*)::int AS n FROM data_reconciliation_ledger
     WHERE source=$1 AND status IN ('DETECTED','QUEUED','RECOVERING','PARTIAL')
       -- The daily refresh of current seasons is routine: it alerts only once it falls a day behind.
       AND NOT (gap_kind = 'current_season_stale' AND detected_at > now() - interval '24 hours')
     GROUP BY 1, 2 ORDER BY 2, 1`, [SOURCE])).rows;
  if (open.length) {
    await emitAlert({source: SOURCE, severity: open.some(r => r.priority === 'P1') ? 'warning' : 'info',
      code: 'RECON_GAPS', key: 'futpython', title: 'Gap dati FutPython in recupero',
      message: open.map(r => `${r.gap_kind} (${r.priority}): ${r.n}`).join(', '), payload: {open}}, client, options);
  } else {
    await resolveAlert({source: SOURCE, code: 'RECON_GAPS', key: 'futpython'}, client);
  }
  const failed = (await client.query(
    `SELECT gap_kind, entity FROM data_reconciliation_ledger WHERE source=$1 AND status='FAILED' ORDER BY entity LIMIT 50`, [SOURCE])).rows;
  if (failed.length) {
    await emitAlert({source: SOURCE, severity: 'critical', code: 'RECON_FAILED', key: 'futpython',
      title: 'Recupero dati FutPython fallito',
      message: `${failed.length} gap non recuperati dopo i tentativi previsti: ${failed.slice(0, 10).map(f => `${f.gap_kind}:${f.entity}`).join(', ')}`,
      payload: {failed}}, client, options);
  } else {
    await resolveAlert({source: SOURCE, code: 'RECON_FAILED', key: 'futpython'}, client);
  }
  return {open, failed: failed.length};
}

// One reconciliation cycle: detect, ledger, close what vanished, checkpoints, alerts, and a catch-up run when the
// incremental sync was skipped. phase: 'startup' | 'periodic' | 'post_run'.
export async function reconcileFpt(client, {phase = 'periodic', runId = null, now = new Date(), deferred = [], catchup = null,
  deliver = null, config = reconConfig()} = {}) {
  const orphanRuns = phase === 'startup' ? await markOrphanRuns(client) : 0;
  const inputs = await loadInputs(client);
  // After a run the reconciliation is called before the run records its final status: it has finished its work.
  if (phase === 'post_run' && runId) {
    inputs.runs = inputs.runs.map(r => r.run_id === runId ? {...r, status: 'complete', finished_at: now} : r);
  }
  const detected = detectGaps({...inputs, now, config});
  let created = 0;
  for (const g of detected) if (await upsertGap(client, g, now) === 'new') created++;
  const closed = await closeVanished(client, detected, now, {deferred: new Set(deferred), config, phase, runId});
  await writeCheckpoints(client, {now, config, detected});
  const alerts = await emitReconAlerts(client, closed, deliver);
  let catchupStarted = false;
  if (catchup && config.catchup && phase !== 'post_run' && detected.some(g => g.gap_kind === 'incremental_sync_skipped')) {
    await client.query(
      `UPDATE data_reconciliation_ledger SET status='RECOVERING', attempts=attempts+1, recovery_started_at=$2
       WHERE source=$1 AND gap_kind='incremental_sync_skipped' AND status IN ('DETECTED','QUEUED','PARTIAL')`, [SOURCE, now]);
    catchupStarted = true;
    Promise.resolve().then(catchup).catch(error => console.error('FUTPYTHON_RECON_CATCHUP_ERROR', String(error?.message || error).slice(0, 200)));
  }
  const byKind = detected.reduce((acc, g) => ({...acc, [g.gap_kind]: (acc[g.gap_kind] || 0) + 1}), {});
  return {phase, detected: detected.length, by_kind: byKind, created, orphan_runs: orphanRuns,
    recovered: closed.recovered.length, unrecoverable: closed.unrecoverable.length, failed: closed.failed.length,
    requeued: closed.requeued.length, open: alerts.open, catchup_started: catchupStarted};
}
