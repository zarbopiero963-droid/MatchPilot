// MP-AF-COLLECT-01 (#263, MP-NEXT-20261102 priority E): a controlled PREMATCH odds collector on top of the API-FOOTBALL
// client (MP-AF-01), its PostgreSQL request ledger and the snapshot store (MP-ODDS-SNAP-01, migration 031).
//
// It is OFF by default and has no scheduler: nothing in MatchPilot calls it. One call of runOnce() is one bounded cycle;
// there is no loop, timer or retry beyond the client's own single retry. Turning it on is an owner GO (env plus a
// schedule that does not exist yet), never a side effect of a deploy.
//
// Guarantees:
// - its own daily and per-minute budgets (purpose "prematch-collector" on the ledger), inside the client's budgets, plus a
//   cap of calls per cycle; when a budget is used up the cycle stops at once (safe stop) and reports why;
// - only fixtures that have not started (status NS) with a known kickoff inside the window (now + margin, now + lead];
//   nothing at or after kickoff is requested or stored (the snapshot rows refuse it again, and so does the database);
// - one /odds request per fixture at most every minIntervalMinutes (read back from the ledger, so a restart does not
//   reset it), plus the client's cache: the same request is never repeated in a tight loop;
// - snapshots are immutable (append-only tables) and carry the client's own acquisition time (fetched_at);
// - a failure stops the cycle after maxConsecutiveFailures; ledger or schema unavailable stops it at once.
import { canonicalRequest } from './client.mjs';
import { kickoffOf, oddsSnapshotsFromResult } from './odds-snapshots.mjs';
import { SnapshotStoreError } from './store.mjs';

export const COLLECTOR_PURPOSE = 'prematch-collector';
export const COLLECTOR_VERSION = 'mp-af-collect-1';

export class CollectorConfigError extends Error {
  constructor(message) { super(message); this.name = 'CollectorConfigError'; this.code = 'NOT_CONFIGURED'; }
}

const int = (raw, name, {min = 1, max = 1e6} = {}) => {
  const text = String(raw ?? '').trim();
  if (!/^\d{1,7}$/.test(text) || Number(text) < min || Number(text) > max) throw new CollectorConfigError(`${name} must be an integer between ${min} and ${max}`);
  return Number(text);
};

// Off unless APIFOOTBALL_PREMATCH_COLLECTOR_ENABLED is exactly "true". When on, every limit is explicit: no default
// assigns a share of the plan the owner did not set. Leagues are "league:season" pairs, e.g. "135:2026,39:2026".
export function prematchCollectorConfig(env = process.env) {
  if (String(env.APIFOOTBALL_PREMATCH_COLLECTOR_ENABLED ?? '').trim() !== 'true') return {enabled: false};
  const leagues = String(env.APIFOOTBALL_PREMATCH_LEAGUES ?? '').split(',').map(s => s.trim()).filter(Boolean).map(pair => {
    const m = /^(\d{1,6}):(\d{4})$/.exec(pair);
    if (!m) throw new CollectorConfigError('APIFOOTBALL_PREMATCH_LEAGUES takes league:season pairs');
    return {league: Number(m[1]), season: Number(m[2])};
  });
  if (!leagues.length || leagues.length > 50) throw new CollectorConfigError('APIFOOTBALL_PREMATCH_LEAGUES needs 1 to 50 league:season pairs');
  return {
    enabled: true,
    leagues,
    perDay: int(env.APIFOOTBALL_PREMATCH_CALLS_PER_DAY, 'APIFOOTBALL_PREMATCH_CALLS_PER_DAY', {max: 100000}),
    perMinute: int(env.APIFOOTBALL_PREMATCH_CALLS_PER_MINUTE, 'APIFOOTBALL_PREMATCH_CALLS_PER_MINUTE', {max: 1000}),
    maxCallsPerRun: int(env.APIFOOTBALL_PREMATCH_MAX_CALLS_PER_RUN, 'APIFOOTBALL_PREMATCH_MAX_CALLS_PER_RUN', {max: 1000}),
    leadHours: int(env.APIFOOTBALL_PREMATCH_LEAD_HOURS, 'APIFOOTBALL_PREMATCH_LEAD_HOURS', {max: 336}),
    minIntervalMinutes: int(env.APIFOOTBALL_PREMATCH_MIN_INTERVAL_MINUTES, 'APIFOOTBALL_PREMATCH_MIN_INTERVAL_MINUTES', {min: 5, max: 10080}),
    kickoffMarginMinutes: int(env.APIFOOTBALL_PREMATCH_KICKOFF_MARGIN_MINUTES ?? '5', 'APIFOOTBALL_PREMATCH_KICKOFF_MARGIN_MINUTES', {min: 1, max: 720}),
    maxPages: int(env.APIFOOTBALL_PREMATCH_MAX_PAGES ?? '1', 'APIFOOTBALL_PREMATCH_MAX_PAGES', {max: 10}),
    maxConsecutiveFailures: int(env.APIFOOTBALL_PREMATCH_MAX_FAILURES ?? '3', 'APIFOOTBALL_PREMATCH_MAX_FAILURES', {max: 20})
  };
}

const utcDayStart = ms => { const d = new Date(ms); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); };
const isoDay = ms => new Date(ms).toISOString().slice(0, 10);
// Errors that stop the whole cycle: budget, provider quota, ledger or schema unavailable, disabled or misconfigured client.
const STOP_CODES = new Set(['BUDGET_DAY', 'BUDGET_MINUTE', 'PROVIDER_QUOTA', 'RATE_LIMITED', 'LEDGER_UNAVAILABLE', 'SNAPSHOTS_UNAVAILABLE', 'DISABLED', 'NOT_CONFIGURED']);

// A ledger read that fails (schema missing, database down) stops the cycle before any call: no budget, no request.
const ledgerStop = error => (error instanceof SnapshotStoreError || error?.code === 'SNAPSHOTS_UNAVAILABLE' ? 'SNAPSHOTS_UNAVAILABLE' : 'LEDGER_UNAVAILABLE');

// Candidate fixtures from a /fixtures answer: not started (NS), known kickoff, inside the window. Anything else is
// reported, never guessed (TBD has no reliable time, PST/CANC/ABD are not played, an in-play status is not pre-match).
export function prematchCandidates(response, {now, leadHours, kickoffMarginMinutes}) {
  const from = now + kickoffMarginMinutes * 60000;
  const to = now + leadHours * 3600000;
  const candidates = [];
  const skipped = [];
  for (const item of Array.isArray(response) ? response : []) {
    const id = Number.isSafeInteger(item?.fixture?.id) && item.fixture.id > 0 ? item.fixture.id : null;
    const status = typeof item?.fixture?.status?.short === 'string' ? item.fixture.status.short : null;
    const kickoff = kickoffOf(item?.fixture);
    const skip = reason => skipped.push({fixture_id: id, reason});
    if (id === null) { skip('fixture id missing'); continue; }
    if (status !== 'NS') { skip(`status ${status ?? 'unknown'}: not a scheduled pre-match fixture`); continue; }
    if (kickoff === null) { skip('kickoff unknown'); continue; }
    if (kickoff <= from) { skip('kickoff too close or past: no pre-match request'); continue; }
    if (kickoff > to) { skip('kickoff beyond the lead window'); continue; }
    candidates.push({fixture_id: id, kickoff_ms: kickoff, league_id: item?.league?.id ?? null});
  }
  const seen = new Set();
  return {candidates: candidates.filter(c => !seen.has(c.fixture_id) && seen.add(c.fixture_id)).sort((a, b) => a.kickoff_ms - b.kickoff_ms || a.fixture_id - b.fixture_id), skipped};
}

// createPrematchCollector({config, client, ledger, openConnection, saveSnapshots, saveRawResponse, now})
//   saveRawResponse(result): persists the raw provider answer (path, fetched_at, response) before normalization; required,
//   so the collector cannot run without a raw store (its PostgreSQL table comes with the raw schema, not yet migrated)
//   client: createApiFootballClient(...) on the same ledger; ledger: countSince(ms, {purpose}) and lastRequestAt(path, ms)
//   openConnection(): a dedicated pg client with release() (saveOddsSnapshots needs one, never a pool)
//   saveSnapshots(connection, rows): saveOddsSnapshots
// runOnce() -> {version, status: 'disabled'|'completed'|'stopped', stop_reason, calls, fixtures: [...], stored, skipped}
export function createPrematchCollector({config = prematchCollectorConfig(), client, ledger, openConnection, saveSnapshots, saveRawResponse, now = Date.now} = {}) {
  let running = false;
  async function budgetLeft() {
    const t = now();
    const day = await ledger.countSince(utcDayStart(t), {purpose: COLLECTOR_PURPOSE});
    if (day >= config.perDay) return 'COLLECTOR_BUDGET_DAY';
    const minute = await ledger.countSince(t - 60000, {purpose: COLLECTOR_PURPOSE});
    if (minute >= config.perMinute) return 'COLLECTOR_BUDGET_MINUTE';
    return null;
  }

  return {
    async runOnce() {
      const report = {version: COLLECTOR_VERSION, status: 'disabled', stop_reason: null, calls: 0, fixtures: [], stored: 0, skipped: [], started_at: new Date(now()).toISOString()};
      if (!config?.enabled) return report;
      if (!client || !ledger || typeof ledger.countSince !== 'function' || typeof ledger.lastRequestAt !== 'function' || typeof openConnection !== 'function' || typeof saveSnapshots !== 'function' || typeof saveRawResponse !== 'function') {
        throw new CollectorConfigError('collector needs client, ledger (countSince, lastRequestAt), openConnection, saveSnapshots and saveRawResponse');
      }
      // One cycle at a time in this process: an overlapping call is refused, never queued.
      if (running) return {...report, status: 'stopped', stop_reason: 'ALREADY_RUNNING'};
      running = true;
      report.status = 'completed';
      let failures = 0;
      const stop = reason => { report.status = 'stopped'; report.stop_reason = reason; };
      // Every provider call goes through here: collector budget and per-cycle cap first, then the client's own checks.
      const call = async (endpoint, params) => {
        if (report.calls >= config.maxCallsPerRun) { stop('MAX_CALLS_PER_RUN'); return null; }
        let over;
        try { over = await budgetLeft(); } catch (error) { stop(ledgerStop(error)); return null; }
        if (over) { stop(over); return null; }
        report.calls += 1;
        try {
          const result = await client.get(endpoint, params, {purpose: COLLECTOR_PURPOSE});
          failures = 0;
          return result;
        } catch (error) {
          if (STOP_CODES.has(error?.code)) { stop(error.code); return null; }
          failures += 1;
          if (failures >= config.maxConsecutiveFailures) stop('CONSECUTIVE_FAILURES');
          return {error: error?.code ?? 'ERROR'};
        }
      };
      try {
        // 1. Discovery: one /fixtures request per league and season over the window's UTC days.
        const t0 = now();
        const candidates = [];
        for (const {league, season} of config.leagues) {
          if (report.status === 'stopped') break;
          const result = await call('/fixtures', {league, season, from: isoDay(t0), to: isoDay(t0 + config.leadHours * 3600000), status: 'NS'});
          if (!result || result.error) { if (result?.error) report.skipped.push({league_id: league, reason: `discovery failed: ${result.error}`}); continue; }
          const found = prematchCandidates(result.response, {now: now(), leadHours: config.leadHours, kickoffMarginMinutes: config.kickoffMarginMinutes});
          candidates.push(...found.candidates);
          report.skipped.push(...found.skipped);
        }
        const unique = [...new Map(candidates.map(c => [c.fixture_id, c])).values()].sort((a, b) => a.kickoff_ms - b.kickoff_ms || a.fixture_id - b.fixture_id);
        // 2. Odds, nearest kickoff first, each fixture at most once per minIntervalMinutes.
        for (const fixture of unique) {
          if (report.status === 'stopped') break;
          const entry = {fixture_id: fixture.fixture_id, kickoff_at: new Date(fixture.kickoff_ms).toISOString(), outcome: null, pages: 0, inserted: 0, rejected: 0};
          report.fixtures.push(entry);
          // Checked again right before the request: time passes during a cycle.
          if (fixture.kickoff_ms - now() <= config.kickoffMarginMinutes * 60000) { entry.outcome = 'skipped_kickoff_too_close'; continue; }
          const first = canonicalRequest('/odds', {fixture: fixture.fixture_id}).path;
          let last;
          try { last = await ledger.lastRequestAt(first, now() - config.minIntervalMinutes * 60000); }
          catch (error) { entry.outcome = 'stopped_ledger'; stop(ledgerStop(error)); break; }
          if (last !== null) { entry.outcome = 'skipped_recently_requested'; continue; }
          const rows = [];
          for (let page = 1; page <= config.maxPages; page += 1) {
            // review (Codex): the kickoff margin is checked again before every page, not only before the first.
            if (fixture.kickoff_ms - now() <= config.kickoffMarginMinutes * 60000) { entry.outcome = page === 1 ? 'skipped_kickoff_too_close' : 'pages_stopped_kickoff_too_close'; break; }
            const result = await call('/odds', page === 1 ? {fixture: fixture.fixture_id} : {fixture: fixture.fixture_id, page});
            if (!result) { entry.outcome = `stopped_${report.stop_reason}`; break; }
            if (result.error) { entry.outcome = `failed_${result.error}`; break; }
            entry.pages = page;
            // review (Codex): the raw answer is persisted before any normalization, so fields outside the projection and
            // rejected items are never lost and the snapshots can be reprocessed. A failure stops the cycle.
            try { await saveRawResponse(result); }
            catch { stop('RAW_STORE_FAILED'); entry.outcome = 'failed_raw_store'; break; }
            const {rows: pageRows, rejected} = oddsSnapshotsFromResult(result);
            rows.push(...pageRows);
            entry.rejected += rejected.length;
            const total = Number.isInteger(result.paging?.total) ? result.paging.total : 1;
            if (page >= total) break;
            if (page === config.maxPages) entry.truncated_pages = total - page;
          }
          if (rows.length) {
            let connection;
            try {
              connection = await openConnection();
              const saved = await saveSnapshots(connection, rows);
              entry.inserted = saved.inserted;
              report.stored += saved.inserted;
            } catch (error) {
              entry.outcome = 'failed_store';
              if (error instanceof SnapshotStoreError || error?.code === 'SNAPSHOTS_UNAVAILABLE') { stop('SNAPSHOTS_UNAVAILABLE'); break; }
              stop('STORE_FAILED');
              break;
            } finally { connection?.release?.(); }
          }
          entry.outcome ??= entry.pages ? 'collected' : 'not_requested';
        }
      } finally {
        running = false;
      }
      report.finished_at = new Date(now()).toISOString();
      return report;
    }
  };
}

