// MP-FPT-RETIRE-01 (#263, MP-OWNER-GO-2026-11-01, MP-OWNER-IMPL-20261101 item 6): FutPythonTrader retired mode.
// FutPythonTrader is retired as an operational provider; its archive and provenance are kept whole. With
// FUTPYTHON_RETIRED=true (exactly "true", surrounding spaces ignored) no MatchPilot process calls FutPythonTrader:
// - the FPT cron does not start;
// - the start-up backfill and phase-1 verification do not run, even if their own flags are set;
// - the data watchdog raises no FPT alert, closes the open ones once with the reason, and runs no reconciliation and
//   no recovery sync (the path that could call the provider even with the cron off);
// - the liveness probe raises no FPT worker alert (it keeps reporting a database outage).
// Nothing is deleted and no data is changed. Off by default: without the variable every behaviour is unchanged.
// Setting the variable on the VPS is an operational step that needs its own owner GO.
export const fptRetired = (env = process.env) => String(env.FUTPYTHON_RETIRED ?? '').trim() === 'true';
export const RETIRED_RESOLUTION = 'sorgente FutPythonTrader dismessa (FUTPYTHON_RETIRED=true): archivio conservato, nessuna chiamata al provider';

// Every alert the FPT pipeline can raise (watchdog, reconciliation, sync, liveness probe): in retired mode the open ones
// are closed once with the reason, and none is raised again.
export const FPT_ALERT_KEYS = Object.freeze([
  ['SYNC_STALE', 'cron'], ['DATASET_ERRORS', 'aggregate'], ['DATA_CONTENT_STALE', 'content'],
  ['BUDGET_WARNING', 'day'], ['BUDGET_CRITICAL', 'day'], ['RATE_LIMIT_429', 'aggregate'], ['CIRCUIT_OPEN', 'provider'],
  ['RECON_GAPS', 'futpython'], ['RECON_FAILED', 'futpython'],
  ['NEW_FIELDS_AGG', 'schema'], ['NEW_DATASETS_AGG', 'catalog'], ['ROW_COUNT_DROPS_AGG', 'aggregate'], ['SYNC_FAILURES_AGG', 'aggregate'],
  ['ONBOARDING_OWNER_PROMOTION', 'onboarding'], ['ONBOARDING_BLOCKED', 'onboarding'],
  ['FPT_WORKER_LIVENESS', 'worker'], ['FPT_PERSISTENT_ERRORS', 'runs']
].map(([code, key]) => Object.freeze({source: 'futpython', code, key})));

export class FptRetiredError extends Error {
  constructor() { super('FutPythonTrader is retired (FUTPYTHON_RETIRED=true): no provider call'); this.name = 'FptRetiredError'; this.code = 'FPT_RETIRED'; }
}
