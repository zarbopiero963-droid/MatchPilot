// t132u FIX-02 / FIX-05: separate "the machinery runs" from "new data arrived". A sync with zero changed rows is not an
// error, and not proof of fresh data either. The provider is blamed only with evidence; otherwise UNDETERMINED.
export const FRESHNESS_DEFAULTS = {cycleHours: 6, graceHours: 1, heartbeatHours: 2, changedHours: 72, matchDays: 7,
  providerEvidenceDatasets: 20, unreachableShare: 0.5};

const hoursSince = (t, now) => t ? (now - new Date(t).getTime()) / 3600000 : Infinity;
const round = h => Number.isFinite(h) ? Math.round(h * 10) / 10 : null;

export function classifyFreshness(f, {now = Date.now(), config = FRESHNESS_DEFAULTS} = {}) {
  const c = {...FRESHNESS_DEFAULTS, ...config};
  const lastCycleAge = hoursSince(f.lastRun?.finished_at || f.lastRun?.started_at, now);
  const heartbeatAge = hoursSince(f.watchdogCheckedAt, now);
  const changedAge = hoursSince(f.maxChangedAt, now);
  const maxCycle = c.cycleHours + c.graceHours;
  const worker = f.workerActive === false ? 'DOWN'
    : heartbeatAge > c.heartbeatHours ? 'HUNG_OR_DOWN' : f.workerActive === true ? 'UP' : 'UP_BY_HEARTBEAT';
  const scheduler = lastCycleAge > maxCycle ? 'MISSED_CYCLES' : 'ON_TIME';
  const missedCycles = Number.isFinite(lastCycleAge) ? Math.max(0, Math.floor((lastCycleAge - c.graceHours) / c.cycleHours)) : null;
  const syncOk = f.lastRun && ['complete', 'partial'].includes(f.lastRun.status) && scheduler === 'ON_TIME';
  const sync = !f.lastRun ? 'NEVER' : f.lastRun.status === 'failed' ? 'FAILED' : syncOk ? 'TECHNICALLY_OK' : 'LATE';
  const newData = changedAge <= c.changedHours ? 'ACQUIRED' : 'NONE_RECENT';
  const req = f.requests72h || {ok: 0, errors: 0};
  const total = req.ok + req.errors;
  let provider = 'UNDETERMINED';
  let evidence = [];
  if (total > 0 && req.errors / total >= c.unreachableShare) {
    provider = 'UNREACHABLE';
    evidence.push(`${req.errors}/${total} richieste fallite in 72h`);
  } else if (newData === 'NONE_RECENT' && sync === 'TECHNICALLY_OK' && (f.datasetErrors || 0) === 0
    && (f.fetched200Unchanged72h || 0) >= c.providerEvidenceDatasets) {
    provider = 'NO_UPDATES';
    evidence.push(`${f.fetched200Unchanged72h} dataset scaricati con HTTP 200 in 72h, contenuto identico (stesso SHA)`);
  } else if (newData === 'ACQUIRED') {
    provider = 'UPDATING';
  }
  const staleDatasets = f.staleDatasets ?? null;
  const localErrors = (f.datasetErrors || 0) > 0 ? 'PRESENT' : 'NONE';
  let overall = 'OK';
  let reason = 'worker attivo, cicli puntuali, dati nuovi acquisiti';
  if (worker !== 'UP' && worker !== 'UP_BY_HEARTBEAT') { overall = 'CRITICAL'; reason = `worker ${worker}`; }
  else if (scheduler === 'MISSED_CYCLES' || sync === 'FAILED' || sync === 'NEVER') { overall = 'CRITICAL'; reason = `scheduler ${scheduler}, sync ${sync}`; }
  else if (newData === 'NONE_RECENT') {
    overall = 'DEGRADED';
    reason = `nessun dato nuovo da ${round(changedAge)}h (soglia ${c.changedHours}h); provider: ${provider}`;
  } else if (localErrors === 'PRESENT') { overall = 'DEGRADED'; reason = `${f.datasetErrors} dataset con errori locali`; }
  return {overall, reason, worker, scheduler, missedCycles, lastCycleAgeHours: round(lastCycleAge), heartbeatAgeHours: round(heartbeatAge),
    sync, newData, lastChangedAgeHours: round(changedAge), provider, providerEvidence: evidence, staleDatasets, localErrors};
}

export async function readFreshnessFacts(client, {workerActive = null} = {}) {
  const r = (await client.query(`SELECT
      (SELECT row_to_json(x) FROM (SELECT run_id, kind, status, started_at, finished_at, datasets_attempted, datasets_changed
         FROM fpt_sync_runs WHERE kind IN ('cron','manual','recovery') ORDER BY started_at DESC LIMIT 1) x) AS last_run,
      (SELECT last_checked_at FROM data_watchdog_state WHERE source='futpython') AS watchdog_checked_at,
      (SELECT max(last_changed_at) FROM fpt_dataset_state) AS max_changed,
      (SELECT count(*)::int FROM fpt_dataset_state WHERE last_error IS NOT NULL) AS dataset_errors,
      (SELECT count(*)::int FROM fpt_dataset_state WHERE last_http_status=200 AND last_synced_at > now() - interval '72 hours'
         AND (last_changed_at IS NULL OR last_changed_at < now() - interval '72 hours')) AS fetched_unchanged,
      (SELECT count(*)::int FROM data_reconciliation_ledger WHERE source='futpython' AND gap_kind='current_season_stale'
         AND status IN ('DETECTED','QUEUED','RECOVERING','PARTIAL','FAILED')) AS stale_datasets,
      (SELECT count(*)::int FROM fpt_request_ledger WHERE recorded_at > now() - interval '72 hours' AND outcome='upstream' AND http_status < 400) AS req_ok,
      (SELECT count(*)::int FROM fpt_request_ledger WHERE recorded_at > now() - interval '72 hours'
         AND (outcome IN ('error','429') OR (outcome='upstream' AND http_status >= 500))) AS req_err`)).rows[0];
  return {lastRun: r.last_run, watchdogCheckedAt: r.watchdog_checked_at, maxChangedAt: r.max_changed, datasetErrors: r.dataset_errors,
    fetched200Unchanged72h: r.fetched_unchanged, staleDatasets: r.stale_datasets, requests72h: {ok: r.req_ok, errors: r.req_err}, workerActive};
}
