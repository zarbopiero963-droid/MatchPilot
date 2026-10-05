import { randomUUID } from 'node:crypto';
import { withClient, closePool } from '../db.mjs';
import { migrate } from '../migrate.mjs';
import { fetchCatalog, isCurrentSeason } from '../providers/futpython/catalog.mjs';
import { fetchDataset, fetchToday } from '../providers/futpython/client.mjs';
import { storeDataset, upsertCatalog, sha256 } from '../providers/futpython/store.mjs';
import { persistOutcome } from '../providers/futpython/classification.mjs';
import { shouldYieldToCritical } from '../providers/futpython/budget.mjs';
import { refreshNormalizedLayer } from '../providers/futpython/query.mjs';
import { advanceOnboarding, onboardingTargets, registerDiscovered } from '../providers/futpython/onboarding.mjs';
import { emitAlert, resolveAlert } from '../alerts.mjs';

const LOCK_ID = 76420311;
const DRILL_KEY_RE = /^[a-z0-9-]+\/[a-z0-9-]+\/20\d{2}(?:-20\d{2})?$/;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const activeRun = {
  runId: null, kind: null, stats: null, stop: false, signal: null, inDataset: false, marked: false
};
let interruptHandlersInstalled = false;

export function createRunStats({mode, bootstrap, startedAt = new Date()} = {}) {
  return {
    startedAt,
    catalogEntries: 0,
    datasetsAttempted: 0,
    datasetsChanged: 0,
    snapshotsInserted: 0,
    rowsSeen: 0,
    rowsInserted: 0,
    fieldsSeen: 0,
    failures: [],
    newFields: new Set(),
    newDatasets: new Set(),
    unavailable404: [],
    finalUnavailable404: 0,
    rowDrops: [],
    resumedSkips: 0,
    deferred: [],
    availableCount: 0,
    errorRealCount: 0,
    catalogSnapshotId: null,
    meta: {mode, bootstrap}
  };
}

export function backfillResumeDecision(state = {}) {
  if (state.ingest_complete === false) return {skip: false, reconcileToAvailable: false};
  if (['available', 'unavailable_404', 'deprecated'].includes(state.availability)) {
    return {skip: true, reconcileToAvailable: false};
  }
  if (state.availability === 'unknown' && state.last_snapshot_id != null) {
    return {skip: true, reconcileToAvailable: true};
  }
  return {skip: false, reconcileToAvailable: false};
}

export function isBackfillTerminalState(state = {}) {
  return backfillResumeDecision(state).skip;
}

export function incrementalTargets(catalog, now = new Date()) {
  return catalog.filter(entry => isCurrentSeason(entry.season, now));
}

export function parseResumeDrillKeys(argv = process.argv, env = process.env) {
  const explicit = argv.some(arg => arg === '--resume-drill-requeue' || arg.startsWith('--resume-drill-requeue='));
  if (!explicit) return [];
  const flagged = argv.find(arg => arg.startsWith('--resume-drill-requeue='));
  const raw = flagged ? flagged.slice('--resume-drill-requeue='.length) : (env.FUTPYTHON_RESUME_DRILL_KEYS || '');
  const keys = [...new Set(String(raw).split(',').map(value => value.trim()).filter(Boolean))];
  const max = Number(env.FUTPYTHON_RESUME_DRILL_MAX || 5);
  if (!Number.isInteger(max) || max < 1 || max > 5) throw new Error('FUTPYTHON_RESUME_DRILL_MAX must be an integer from 1 to 5');
  if (!keys.length) throw new Error('resume drill requires at least one dataset key');
  if (keys.length > max) throw new Error(`resume drill accepts at most ${max} dataset keys`);
  for (const key of keys) {
    if (!DRILL_KEY_RE.test(key)) throw new Error('resume drill dataset key is not a catalog key');
  }
  return keys;
}

export async function requeueDatasetsForResumeDrill(client, keys) {
  if (!Array.isArray(keys) || !keys.length) throw new Error('resume drill requires at least one dataset key');
  if (keys.length > 5) throw new Error('resume drill accepts at most 5 dataset keys');
  await client.query('BEGIN');
  try {
    const updated = await client.query(
      `UPDATE fpt_dataset_state
       SET availability='error', unavailable_reason='resume_drill', last_error='resume_drill'
       WHERE dataset_key = ANY($1::text[])
       RETURNING dataset_key, last_snapshot_id`,
      [keys]
    );
    if (updated.rowCount !== keys.length) {
      const err = new Error('resume drill key is not in the catalog state');
      err.code = 'DRILL_KEY_MISSING';
      throw err;
    }
    await client.query('COMMIT');
    return updated.rows;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* already closed */ }
    throw error;
  }
}

function redact(value) {
  return String(value || '').replace(/api_key=[^&\s]+/gi, 'api_key=[REDACTED]');
}

function installInterruptHandlers() {
  if (interruptHandlersInstalled) return;
  interruptHandlersInstalled = true;
  const onSignal = signal => {
    activeRun.stop = true;
    activeRun.signal = signal;
  };
  process.on('SIGTERM', onSignal);
  process.on('SIGINT', onSignal);
}

async function sleepInterruptible(ms) {
  let left = ms;
  while (left > 0) {
    if (activeRun.stop) return;
    const step = Math.min(50, left);
    await sleep(step);
    left -= step;
  }
}

async function recordRun(client, runId, kind, status, stats) {
  await client.query(
    `INSERT INTO fpt_sync_runs(
      run_id,kind,status,started_at,finished_at,catalog_entries,datasets_attempted,datasets_changed,
      snapshots_inserted,rows_seen,rows_inserted,fields_seen,errors,meta,
      resumed_skips,unavailable_404,available_count,error_real_count,catalog_snapshot_id
    ) VALUES(
      $1,$2,$3,$4,CASE WHEN $3='running' THEN NULL ELSE now() END,
      $5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14,$15,$16,$17,$18
    )
    ON CONFLICT(run_id) DO UPDATE SET
      status=excluded.status, finished_at=excluded.finished_at,
      catalog_entries=excluded.catalog_entries, datasets_attempted=excluded.datasets_attempted,
      datasets_changed=excluded.datasets_changed, snapshots_inserted=excluded.snapshots_inserted,
      rows_seen=excluded.rows_seen, rows_inserted=excluded.rows_inserted,
      fields_seen=excluded.fields_seen, errors=excluded.errors, meta=excluded.meta,
      resumed_skips=excluded.resumed_skips, unavailable_404=excluded.unavailable_404,
      available_count=excluded.available_count, error_real_count=excluded.error_real_count,
      catalog_snapshot_id=excluded.catalog_snapshot_id`,
    [
      runId, kind, status, stats.startedAt, stats.catalogEntries || 0, stats.datasetsAttempted || 0,
      stats.datasetsChanged || 0, stats.snapshotsInserted || 0, stats.rowsSeen || 0, stats.rowsInserted || 0,
      stats.fieldsSeen || 0, JSON.stringify(stats.failures || []), JSON.stringify(stats.meta || {}),
      stats.resumedSkips || 0, stats.finalUnavailable404 || stats.unavailable404?.length || 0, stats.availableCount || 0,
      stats.errorRealCount || 0, stats.catalogSnapshotId || null
    ]
  );
}

async function markRunInterrupted(client) {
  if (!activeRun.runId || activeRun.marked || !activeRun.stats) return;
  activeRun.marked = true;
  activeRun.stats.meta = {
    ...(activeRun.stats.meta || {}),
    interrupted: true,
    signal: activeRun.signal || null
  };
  await recordRun(client, activeRun.runId, activeRun.kind, 'partial', activeRun.stats);
}

export async function loadStoredCatalog(client) {
  const result = await client.query(
    `SELECT dataset_key, country_slug, league_slug, season, route
     FROM fpt_catalog WHERE active ORDER BY dataset_key`
  );
  return result.rows.map(row => ({
    datasetKey: row.dataset_key, countrySlug: row.country_slug, leagueSlug: row.league_slug,
    season: row.season, route: row.route
  }));
}

async function captureCatalogSnapshot(client, catalog) {
  const stable = JSON.stringify(catalog);
  const hash = sha256(stable);
  const snapshotId = `fpt-catalog-${hash.slice(0, 24)}`;
  await client.query(
    `INSERT INTO fpt_catalog_snapshots(snapshot_id,sha256,catalog_count,catalog)
     VALUES($1,$2,$3,$4::jsonb)
     ON CONFLICT(snapshot_id) DO NOTHING`,
    [snapshotId, hash, catalog.length, stable]
  );
  return snapshotId;
}

async function markAvailability(client, datasetKey, availability, reason = null, providerPath = null) {
  if (availability === 'available') {
    await persistOutcome(client, datasetKey, {kind: 'success', providerPath});
    return;
  }
  if (availability === 'unavailable_404') {
    await persistOutcome(client, datasetKey, {kind: 'initial_404', providerPath, reason});
    return;
  }
  if (availability === 'deprecated') {
    await persistOutcome(client, datasetKey, {kind: 'deprecated', providerPath, reason});
    return;
  }
  await persistOutcome(client, datasetKey, {
    kind: reason === 'REGRESSION_404' ? 'regression_404' : 'error',
    providerPath,
    reason
  });
}

async function loadDatasetState(client, datasetKey) {
  const state = await client.query(
    `SELECT s.availability, s.last_snapshot_id, s.last_row_count, r.ingest_complete
     FROM fpt_dataset_state s
     LEFT JOIN fpt_raw_snapshots r ON r.snapshot_id = s.last_snapshot_id
     WHERE s.dataset_key=$1`,
    [datasetKey]
  );
  return state.rows[0] || {};
}

async function acquireCritical(client) {
  await client.query(
    `INSERT INTO fpt_provider_hold(hold_id, critical_depth)
     VALUES (1, 1)
     ON CONFLICT(hold_id) DO UPDATE
     SET critical_depth = fpt_provider_hold.critical_depth + 1, updated_at = now()`
  );
}

async function releaseCritical(client) {
  await client.query(
    `UPDATE fpt_provider_hold
     SET critical_depth = GREATEST(critical_depth - 1, 0), updated_at = now()
     WHERE hold_id = 1`
  );
}

async function waitForCriticalYield(client) {
  for (;;) {
    if (activeRun.stop) return;
    const row = await client.query('SELECT critical_depth, updated_at FROM fpt_provider_hold WHERE hold_id=1');
    if (!shouldYieldToCritical({
      depth: row.rows[0]?.critical_depth || 0,
      updatedAt: row.rows[0]?.updated_at || null,
      now: Date.now()
    })) return;
    await sleepInterruptible(200);
  }
}

async function syncEntry(client, entry, stats) {
  const previous = await loadDatasetState(client, entry.datasetKey);
  const previousRows = previous.last_row_count ?? null;
  const previouslySucceeded = previous.last_snapshot_id != null;
  // Past seasons of a league being onboarded travel as backfill traffic even inside an incremental run.
  const priority = stats.meta?.mode === 'backfill' || entry.onboarding ? 'backfill' : 'critical';
  try {
    stats.datasetsAttempted++;
    const data = await fetchDataset(entry, {
      runId: stats.runId,
      priority,
      purpose: priority === 'backfill' ? 'backfill' : 'current_season',
      cacheLookup: async () => backfillResumeDecision(await loadDatasetState(client, entry.datasetKey)).skip
    });
    if (data.cacheHit) {
      stats.datasetsAttempted--;
      stats.resumedSkips++;
      return;
    }
    stats.rowsSeen += data.rows.length;
    const stored = await storeDataset(client, {
      datasetKey: entry.datasetKey, sourceKind: 'dataset', providerPath: data.providerPath,
      countrySlug: entry.countrySlug, leagueSlug: entry.leagueSlug, season: entry.season, ...data
    });
    stats.rowsInserted += stored.rowsInserted || 0;
    if (stored.changed) {
      stats.datasetsChanged++;
      stats.snapshotsInserted++;
    }
    stats.fieldsSeen = Math.max(stats.fieldsSeen, stored.fields);
    for (const field of stored.newFields || []) stats.newFields.add(field);
    if (!stored.complete) throw new Error('dataset snapshot was not committed with its match rows');
    await markAvailability(client, entry.datasetKey, 'available', null, data.providerPath);
    if (previousRows !== null && previousRows >= 20 && data.rows.length < Math.floor(previousRows * 0.5)) {
      stats.rowDrops.push({datasetKey: entry.datasetKey, previousRows, currentRows: data.rows.length});
    }
  } catch (error) {
    if (error?.code === 'CIRCUIT_OPEN' || error?.code === 'BUDGET_EXHAUSTED') throw error;
    if (error?.code === 'BUDGET_THROTTLED') {
      // Deferred by the budget level: not a dataset error, the next run retries it.
      stats.datasetsAttempted--;
      stats.deferred.push({datasetKey: entry.datasetKey, level: error.budgetLevel, purpose: error.purpose});
      return;
    }
    const message = redact(error?.message || error);
    if (error?.status === 404 && !previouslySucceeded) {
      stats.unavailable404.push(entry.datasetKey);
      await markAvailability(client, entry.datasetKey, 'unavailable_404', 'HTTP 404', entry.route);
      return;
    }
    stats.failures.push({
      datasetKey: entry.datasetKey, error: message, status: error?.status || null,
      regression404: error?.status === 404 && previouslySucceeded
    });
    await markAvailability(
      client, entry.datasetKey, 'error',
      error?.status === 404 && previouslySucceeded ? 'REGRESSION_404' : message.slice(0, 1000),
      entry.route
    );
  }
}

async function syncToday(client, stats, dateIso) {
  try {
    const data = await fetchToday(dateIso, {runId: stats.runId, priority: 'critical'});
    if (data.cacheHit) return;
    const key = `today/${dateIso}`;
    stats.rowsSeen += data.rows.length;
    const stored = await storeDataset(client, {
      datasetKey: key, sourceKind: 'today', providerPath: data.providerPath,
      text: data.text, headers: data.headers, rows: data.rows
    });
    stats.rowsInserted += stored.rowsInserted || 0;
    if (stored.changed) stats.snapshotsInserted++;
    stats.fieldsSeen = Math.max(stats.fieldsSeen, stored.fields);
    for (const field of stored.newFields || []) stats.newFields.add(field);
  } catch (error) {
    if (error?.code === 'CIRCUIT_OPEN' || error?.code === 'BUDGET_EXHAUSTED') throw error;
    if (error?.code === 'BUDGET_THROTTLED') {
      stats.deferred.push({datasetKey: `today/${dateIso}`, level: error.budgetLevel, purpose: error.purpose});
      return;
    }
    stats.failures.push({
      datasetKey: `today/${dateIso}`,
      error: redact(error?.message || error),
      status: error?.status || null
    });
  }
}

export async function emitRunSummaryAlerts(client, stats, {bootstrap, deliver} = {}) {
  const alertOptions = deliver ? {deliver} : {};
  if (!bootstrap && stats.newFields.size) {
    const fields = [...stats.newFields].sort();
    await emitAlert({
      source: 'futpython', severity: 'info', code: 'NEW_FIELDS_AGG', key: 'schema',
      title: 'Nuove colonne FutPythonTrader',
      message: `${fields.length} nuove colonne rilevate: ${fields.slice(0, 20).join(', ')}${fields.length > 20 ? ' …' : ''}`,
      payload: {count: fields.length, fields}
    }, client, alertOptions);
  }
  if (!bootstrap && stats.newDatasets.size) {
    const datasets = [...stats.newDatasets].sort();
    await emitAlert({
      source: 'futpython', severity: 'info', code: 'NEW_DATASETS_AGG', key: 'catalog',
      title: 'Nuovi dataset FutPythonTrader',
      message: `${datasets.length} nuovi dataset/leghe/stagioni rilevati.`,
      payload: {count: datasets.length, datasets}
    }, client, alertOptions);
  }
  if (stats.rowDrops.length) {
    await emitAlert({
      source: 'futpython', severity: 'warning', code: 'ROW_COUNT_DROPS_AGG', key: 'aggregate',
      title: 'Calo anomalo righe FutPython',
      message: `${stats.rowDrops.length} dataset hanno perso oltre il 50% delle righe rispetto al sync precedente.`,
      payload: {datasets: stats.rowDrops}
    }, client, alertOptions);
  } else {
    await resolveAlert({source: 'futpython', code: 'ROW_COUNT_DROPS_AGG', key: 'aggregate'}, client);
  }
  if (stats.failures.length) {
    const regressions = stats.failures.filter(item => item.regression404);
    await emitAlert({
      source: 'futpython',
      severity: stats.failures.length >= 5 || regressions.length ? 'critical' : 'warning',
      code: 'SYNC_FAILURES_AGG', key: 'aggregate',
      title: 'Problemi sincronizzazione FutPython',
      message: `${stats.failures.length} errori reali nel run; ${regressions.length} regressioni 404 su dataset prima funzionanti.`,
      payload: {count: stats.failures.length, regressions: regressions.length, failures: stats.failures.slice(0, 50)}
    }, client, alertOptions);
  } else {
    await resolveAlert({source: 'futpython', code: 'SYNC_FAILURES_AGG', key: 'aggregate'}, client);
  }
}

export async function emitOnboardingAlerts(client, summary, {deliver} = {}) {
  const alertOptions = deliver ? {deliver} : {};
  if (summary.awaitingOwner.length) {
    await emitAlert({
      source: 'futpython', severity: 'info', code: 'ONBOARDING_OWNER_PROMOTION', key: 'onboarding',
      title: 'Nuova lega FutPython verificata, in attesa di promozione',
      message: `${summary.awaitingOwner.length} stagioni HARD_VERIFIED attendono la promozione dell'owner: ${summary.awaitingOwner.slice(0, 10).join(', ')}`,
      payload: {datasets: summary.awaitingOwner}
    }, client, alertOptions);
  } else {
    await resolveAlert({source: 'futpython', code: 'ONBOARDING_OWNER_PROMOTION', key: 'onboarding'}, client);
  }
  const blocked = summary.blocked.filter(item => item.reason !== 'unavailable_404');
  if (blocked.length) {
    await emitAlert({
      source: 'futpython', severity: 'warning', code: 'ONBOARDING_BLOCKED', key: 'onboarding',
      title: 'Onboarding FutPython bloccato',
      message: `${blocked.length} dataset fermi prima della produzione: ${blocked.slice(0, 10).map(b => `${b.datasetKey} (${b.reason})`).join(', ')}`,
      payload: {blocked}
    }, client, alertOptions);
  } else {
    await resolveAlert({source: 'futpython', code: 'ONBOARDING_BLOCKED', key: 'onboarding'}, client);
  }
}

async function refreshFinalCounts(client, stats) {
  const rows = await client.query(
    `SELECT availability,count(*)::int AS n
     FROM fpt_dataset_state s JOIN fpt_catalog c USING(dataset_key)
     WHERE c.active=true GROUP BY availability`
  );
  const counts = Object.fromEntries(rows.rows.map(row => [row.availability, row.n]));
  stats.availableCount = counts.available || 0;
  stats.finalUnavailable404 = counts.unavailable_404 || 0;
  stats.errorRealCount = counts.error || 0;
  stats.meta.finalAvailability = counts;
  stats.meta.undefinedStates = Object.entries(counts)
    .filter(([key]) => !['available', 'unavailable_404', 'error', 'deprecated'].includes(key))
    .reduce((acc, [key, value]) => (acc[key] = value, acc), {});
}

export async function runFutpythonSync({kind = 'manual', mode = 'incremental'} = {}) {
  if (!process.env.FUTPYTHON_API_KEY?.trim()) return {status: 'skipped', reason: 'missing_key'};
  if (!process.env.DATABASE_URL?.trim()) return {status: 'skipped', reason: 'missing_database'};
  installInterruptHandlers();

  return withClient(async client => {
    const lock = await client.query('SELECT pg_try_advisory_lock($1) AS ok', [LOCK_ID]);
    if (!lock.rows[0]?.ok) return {status: 'skipped', reason: 'lock_busy'};
    const critical = mode !== 'backfill';
    let criticalHeld = false;
    if (critical) {
      await acquireCritical(client);
      criticalHeld = true;
    }

    await client.query(
      `UPDATE fpt_sync_runs
       SET status='partial', finished_at=now(),
           meta=COALESCE(meta,'{}'::jsonb) || '{"interrupted":true}'::jsonb
       WHERE status='running'`
    );

    const runId = `fpt-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const baseline = await client.query('SELECT count(*)::int AS n FROM fpt_schema_fields');
    const bootstrap = mode === 'backfill' || (baseline.rows[0]?.n || 0) === 0;
    const stats = createRunStats({mode, bootstrap});
    stats.runId = runId;
    activeRun.runId = runId;
    activeRun.kind = kind;
    activeRun.stats = stats;
    activeRun.stop = false;
    activeRun.signal = null;
    activeRun.inDataset = false;
    activeRun.marked = false;

    try {
      await recordRun(client, runId, kind, 'running', stats);
      let catalog;
      let catalogFromDb = false;
      try {
        catalog = await fetchCatalog({
          priority: mode === 'backfill' ? 'backfill' : 'critical',
          runId
        });
      } catch (error) {
        // Discovery is the first traffic suspended under budget pressure: keep using the stored catalog.
        if (error?.code !== 'BUDGET_THROTTLED') throw error;
        catalog = await loadStoredCatalog(client);
        catalogFromDb = true;
        stats.meta.catalogSource = `db:budget_${String(error.budgetLevel || '').toLowerCase()}`;
        stats.deferred.push({datasetKey: 'catalog', level: error.budgetLevel, purpose: error.purpose});
      }
      stats.catalogEntries = catalog.length;
      if (!catalogFromDb) {
        stats.catalogSnapshotId = await captureCatalogSnapshot(client, catalog);
        await client.query('BEGIN');
        try {
          const catalogResult = await upsertCatalog(client, catalog);
          for (const entry of catalogResult.newDatasets || []) stats.newDatasets.add(entry.datasetKey);
          // A dataset listed for the first time starts onboarding; it is not production data yet.
          stats.meta.onboardingRegistered = await registerDiscovered(client, catalogResult.newDatasets, {runId});
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
      }

      const targets = mode === 'backfill' ? catalog : incrementalTargets(catalog);
      if (mode !== 'backfill') {
        const known = new Set(targets.map(entry => entry.datasetKey));
        const extra = await onboardingTargets(client, {limit: Number(process.env.FUTPYTHON_ONBOARDING_PER_RUN || 10)});
        for (const entry of extra) if (!known.has(entry.datasetKey)) targets.push(entry);
        stats.meta.onboardingTargets = extra.map(entry => entry.datasetKey);
      }
      for (const entry of targets) {
        if (activeRun.stop) break;
        if (mode === 'backfill') await waitForCriticalYield(client);
        if (activeRun.stop) break;
        if (mode === 'backfill' && !process.argv.includes('--force')) {
          const decision = backfillResumeDecision(await loadDatasetState(client, entry.datasetKey));
          if (decision.skip) {
            if (decision.reconcileToAvailable) await markAvailability(client, entry.datasetKey, 'available');
            stats.resumedSkips++;
            continue;
          }
        }
        activeRun.inDataset = true;
        try {
          await syncEntry(client, entry, stats);
        } finally {
          activeRun.inDataset = false;
        }
        if (activeRun.stop) break;
        const delay = Number(process.env.FUTPYTHON_SYNC_DELAY_MS || 150);
        if (delay > 0) await sleepInterruptible(delay);
      }

      if (activeRun.stop) {
        await markRunInterrupted(client);
        console.log('FUTPYTHON_SYNC_INTERRUPTED ' + JSON.stringify({runId, signal: activeRun.signal || null}));
        return {runId, status: 'partial', interrupted: true, ...stats};
      }

      if (mode === 'backfill') {
        await acquireCritical(client);
        try { await syncToday(client, stats, new Date().toISOString().slice(0, 10)); }
        finally { await releaseCritical(client); }
      } else {
        await syncToday(client, stats, new Date().toISOString().slice(0, 10));
      }
      await refreshFinalCounts(client, stats);
      if (stats.rowsInserted > 0 || stats.newFields.size > 0) {
        // Database-only refresh. A failure is recorded on the run and never hides the mirror result.
        try {
          stats.meta.normalizedLayer = await refreshNormalizedLayer(client);
        } catch (error) {
          stats.meta.normalizedLayerError = redact(error?.message || error);
        }
      }
      try {
        const onboarding = await advanceOnboarding(client, {runId});
        stats.meta.onboarding = onboarding;
        // A dataset that just became ACTIVE enters the facts in this same run.
        if (onboarding.activated.length) {
          stats.meta.onboardingFacts = Number((await client.query('SELECT fpt_refresh_match_facts() AS n')).rows[0].n);
        }
        await emitOnboardingAlerts(client, onboarding);
      } catch (error) {
        stats.meta.onboardingError = redact(error?.message || error);
      }

      const undefinedCount = Object.values(stats.meta.undefinedStates || {}).reduce((sum, value) => sum + value, 0);
      const status = stats.failures.length || undefinedCount
        ? (stats.datasetsChanged || stats.rowsInserted || stats.resumedSkips ? 'partial' : 'failed')
        : 'complete';

      stats.meta.deferred = stats.deferred;
      stats.meta.newFields = [...stats.newFields];
      stats.meta.newDatasets = [...stats.newDatasets];
      stats.meta.unavailable404ThisRun = stats.unavailable404;
      stats.meta.rowDrops = stats.rowDrops;
      await recordRun(client, runId, kind, status, stats);
      await emitRunSummaryAlerts(client, stats, {bootstrap});

      const ledger = await client.query(
        `SELECT outcome, http_status, count(*)::int AS n
         FROM fpt_request_ledger
         WHERE run_id=$1
         GROUP BY outcome, http_status
         ORDER BY outcome, http_status`,
        [runId]
      );
      console.log('FUTPYTHON_SYNC ' + JSON.stringify({
        runId, status, mode, bootstrap, catalogEntries: stats.catalogEntries,
        catalogSnapshotId: stats.catalogSnapshotId, datasetsAttempted: stats.datasetsAttempted,
        resumedSkips: stats.resumedSkips, datasetsChanged: stats.datasetsChanged,
        snapshotsInserted: stats.snapshotsInserted, rowsSeen: stats.rowsSeen,
        rowsInserted: stats.rowsInserted, fieldsSeen: stats.fieldsSeen,
        available: stats.availableCount, unavailable404: stats.meta.finalAvailability?.unavailable_404 || 0,
        errorReal: stats.errorRealCount, newFields: stats.newFields.size,
        newDatasets: stats.newDatasets.size, errorCount: stats.failures.length, deferred: stats.deferred.length,
        onboarding: stats.meta.onboarding
          ? {pending: stats.meta.onboarding.pending, activated: stats.meta.onboarding.activated.length,
            awaitingOwner: stats.meta.onboarding.awaitingOwner.length, blocked: stats.meta.onboarding.blocked.length}
          : null,
        ledger: ledger.rows
      }));
      return {runId, status, ...stats};
    } catch (error) {
      if (!activeRun.marked) {
        stats.failures.push({datasetKey: null, error: redact(error?.message || error), code: error?.code || null});
        try { await recordRun(client, runId, kind, 'partial', stats); } catch { /* preserve the original failure */ }
      }
      throw error;
    } finally {
      activeRun.runId = null;
      if (criticalHeld) {
        try { await releaseCritical(client); } catch { /* already closing */ }
      }
      await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]).catch(() => {});
    }
  });
}

async function main() {
  installInterruptHandlers();
  await migrate();
  const wantsRequeue = process.argv.some(arg => arg === '--resume-drill-requeue' || arg.startsWith('--resume-drill-requeue='));
  if (wantsRequeue) {
    const keys = parseResumeDrillKeys(process.argv, process.env);
    const updated = await withClient(client => requeueDatasetsForResumeDrill(client, keys));
    console.log('FUTPYTHON_RESUME_DRILL_REQUEUE ' + JSON.stringify({
      keys: updated.map(row => row.dataset_key),
      preservedSnapshots: updated.filter(row => row.last_snapshot_id != null).length
    }));
    if (!process.argv.includes('--backfill')) return;
  }
  const mode = process.argv.includes('--backfill') ? 'backfill' : 'incremental';
  const result = await runFutpythonSync({kind: mode === 'backfill' ? 'backfill' : 'manual', mode});
  if (result?.status === 'failed') process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .catch(error => {
      console.error('FUTPYTHON_SYNC_FATAL', redact(error?.message || error));
      process.exitCode = 1;
    })
    .finally(() => closePool());
}
