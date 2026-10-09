import { withClient } from '../db.mjs';
import { createTcClient, createPgStore, redactSecrets, sharedLimiter } from '../providers/totalcorner/client.mjs';
import { LIST_COLUMNS } from './totalcorner-discovery.mjs';
import { prematchConfig, providerTzGate } from './totalcorner-prematch.mjs';
import { LIVE_VERSION, eventsOf, rowsOf, snapshotHash, verifiedInplay } from '../providers/totalcorner/live.mjs';

// v2 uses a fresh namespace: a leaked v1 session lock on 76420324 was observed
// in Neon during the 2026-10-09 restart drill. This transaction lock cannot leak.
export const TC_LIVE_LOCK = 76420325;

/** Insert a v2 snapshot, bridging equal immutable v1 payloads through a partial fingerprint index. */
export async function insertLiveSnapshot(db, params) {
  return db.query(
    `INSERT INTO tc_live_snapshots(match_id,league_id,run_id,acquired_at,provider_status,minute,score,snapshot_hash,raw_id,payload,hash_version)
     SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,'v2'
     WHERE NOT EXISTS (SELECT 1 FROM tc_live_snapshots WHERE match_id=$1 AND hash_version='v1'
       AND md5(payload::text)=md5(($10::jsonb)::text) AND payload=$10::jsonb)
     ON CONFLICT(match_id,snapshot_hash) DO NOTHING RETURNING snapshot_id`, params);
}

/** Insert a v2 event with the same bounded v1 compatibility rule as snapshots. */
export async function insertLiveEvent(db, params) {
  return db.query(
    `INSERT INTO tc_live_events(match_id,event_hash,minute,event_type,raw_id,acquired_at,payload,hash_version)
     SELECT $1,$2,$3,$4,$5,$6,$7::jsonb,'v2'
     WHERE NOT EXISTS (SELECT 1 FROM tc_live_events WHERE match_id=$1 AND hash_version='v1'
       AND md5(payload::text)=md5(($7::jsonb)::text) AND payload=$7::jsonb)
     ON CONFLICT(match_id,event_hash) DO NOTHING RETURNING event_id`, params);
}

/** Read and clamp live polling, recovery, and authentication settings. */
export function liveConfig(env = process.env) {
  return {
    intervalMs: Math.max(15000, Number(env.TOTALCORNER_LIVE_POLL_SECONDS || 60) * 1000),
    maxMatches: Math.max(1, Math.min(8, Number(env.TOTALCORNER_LIVE_MAX_MATCHES || 4))),
    authPauseMs: Math.max(60000, Number(env.TOTALCORNER_AUTH_PAUSE_MS || 900000)),
    endedPages: Math.max(1, Math.min(10, Number(env.TOTALCORNER_LIVE_ENDED_PAGES || 6))),
    terminalGraceHours: Math.max(1, Math.min(24, Number(env.TOTALCORNER_LIVE_TERMINAL_GRACE_HOURS || 6)))
  };
}

async function verifiedLeagueIds(db) {
  const r = await db.query(`SELECT totalcorner_league_id FROM competition_mapping WHERE active AND mapping_status='VERIFIED' AND totalcorner_league_id IS NOT NULL`);
  return new Set(r.rows.map(x => String(x.totalcorner_league_id)));
}

/** Find previously captured matches that still require an explicit ended-list confirmation. */
async function pendingTerminalIds(db, config, now) {
  const since = new Date(now().getTime() - config.terminalGraceHours * 3600000);
  const r = await db.query(`SELECT match_id FROM tc_live_cursors WHERE terminal_at IS NULL AND last_polled_at >= $1`, [since]);
  return new Set(r.rows.map(x => String(x.match_id)));
}

/** Spend the bounded ended-list budget on the newest provider pages. Page 1 is
 * retained to read pagination metadata and to support single-page responses. */
export function terminalPagePlan(pagination, budget) {
  const pages = Math.max(1, Number(pagination?.pages) || 1);
  const limit = Math.max(1, Math.min(pages, Number(budget) || 1));
  if (pages <= limit) return Array.from({length: pages}, (_, index) => index + 1);
  const tailStart = pages - limit + 2;
  return [1, ...Array.from({length: limit - 1}, (_, index) => tailStart + index)];
}

/** Persist the provider's documented type=ended row as the terminal snapshot and cursor proof. */
export async function captureTerminal(db, {row, rawId, acquiredAt, runId}) {
  const matchId = String(row.id), leagueId = String(row.l_id);
  const inserted = await insertLiveSnapshot(db, [matchId, leagueId, runId, acquiredAt, 'FT', row.minute ?? row.time ?? null,
    row.score ?? row.ss ?? `${row.hg ?? ''}-${row.ag ?? ''}`, snapshotHash(row), rawId, JSON.stringify(row)]);
  let events = 0;
  for (const event of eventsOf(row)) {
    const result = await insertLiveEvent(db, [matchId, event.event_hash,
      event.minute == null ? null : String(event.minute), event.event_type, rawId, acquiredAt,
      JSON.stringify(event.payload)]);
    events += result.rowCount;
  }
  await db.query(`UPDATE tc_live_cursors SET terminal_at=$2,terminal_raw_id=$3,terminal_source='today_ended',last_status='FT',
    last_snapshot_at=GREATEST(COALESCE(last_snapshot_at,$2),$2) WHERE match_id=$1`, [matchId, acquiredAt, rawId]);
  return {snapshots: inserted.rowCount, events};
}

/** Execute one persisted live cycle under the caller's cross-process advisory lock. */
export async function runLiveCycle({tc, db, config = liveConfig(), now = () => new Date(), log = console.log}) {
  const run = await db.query(`INSERT INTO tc_collector_runs(version,status) VALUES($1,'running') RETURNING run_id`, [LIVE_VERSION]);
  const runId = Number(run.rows[0].run_id);
  const outcomes = {};
  const bump = (k, v) => { outcomes[k] = outcomes[k] || {}; outcomes[k][v] = (outcomes[k][v] || 0) + 1; };
  try {
    const tz = await providerTzGate({db, call: async (family, path, params, ctx) => {
      const r = await tc.get(path, params, {...ctx, endpoint_family: family, provenance: 'HISTORICAL_CAPTURED'});
      bump(family, r.outcome);
      return r;
    }, config: {...prematchConfig(), ...config}, now});
    const list = await tc.get('/match/today', {type: 'inplay', columns: LIST_COLUMNS}, {endpoint_family: 'live_list', phase: 'LIVE', provenance: 'HISTORICAL_CAPTURED'});
    bump('live_list', list.outcome);
    if (list.outcome === 'auth') {
      const summary = {version: LIVE_VERSION, run_id: runId, auth_failed: true, outcomes, tz_hold: !tz.verified};
      await db.query(`UPDATE tc_collector_runs SET status='failed', finished_at=clock_timestamp(), summary=$2 WHERE run_id=$1`, [runId, JSON.stringify(summary)]);
      return summary;
    }
    const leagues = await verifiedLeagueIds(db);
    const live = verifiedInplay(rowsOf(list.body), leagues).slice(0, config.maxMatches);
    let snapshots = 0, events = 0, views = 0, terminalConfirmed = 0;
    for (const row of live) {
      const view = await tc.get(`/match/view/${encodeURIComponent(row.id)}`, {columns: LIST_COLUMNS}, {endpoint_family: 'live_view', match_id: String(row.id), league_id: String(row.l_id), phase: 'LIVE', provenance: 'HISTORICAL_CAPTURED'});
      bump('live_view', view.outcome);
      const source = rowsOf(view.body)[0] || row;
      const hash = snapshotHash(source);
      // Called under TC_LIVE_LOCK: payload equality bridges immutable v1 hashes.
      const inserted = await insertLiveSnapshot(db,
        [String(row.id), String(row.l_id), runId, view.acquired_at || list.acquired_at || now(), source.status ?? null, source.minute ?? source.time ?? null, source.score ?? source.ss ?? null, hash, view.raw_id || list.raw_id || null, JSON.stringify(source)]);
      if (inserted.rowCount) snapshots++;
      for (const event of eventsOf(source)) {
        const ev = await insertLiveEvent(db,
          [String(row.id), event.event_hash, event.minute == null ? null : String(event.minute), event.event_type, view.raw_id || null, view.acquired_at || now(), JSON.stringify(event.payload)]);
        if (ev.rowCount) events++;
      }
      if (view.outcome === 'ok') views++;
      const market = {odds: source.odds ?? null, asian: source.asian ?? null, goal: source.goalLine ?? source.goal_line ?? null, corner: source.cornerLine ?? source.corner_line ?? null};
      if (Object.values(market).some(v => v != null)) {
        await db.query(
          `INSERT INTO tc_market_snapshots(match_id,source,acquired_at,raw_id,payload_hash)
           VALUES($1,'live_view',$2,$3,$4)
           ON CONFLICT(match_id,source,payload_hash) DO NOTHING`,
          [String(row.id), view.acquired_at || now(), view.raw_id || null, snapshotHash(market)]);
      }
      await db.query(
        `INSERT INTO tc_live_cursors(match_id,league_id,last_polled_at,last_snapshot_at,last_status,poll_count)
         VALUES($1,$2,$3,$3,$4,1)
         ON CONFLICT(match_id) DO UPDATE SET last_polled_at=EXCLUDED.last_polled_at, last_snapshot_at=COALESCE(EXCLUDED.last_snapshot_at, tc_live_cursors.last_snapshot_at), last_status=EXCLUDED.last_status, poll_count=tc_live_cursors.poll_count+1`,
        [String(row.id), String(row.l_id), view.acquired_at || now(), source.status ?? null]);
    }
    const pending = await pendingTerminalIds(db, config, now);
    for (const row of live) pending.delete(String(row.id));
    let endedPages = [1];
    for (let index = 0; pending.size && index < endedPages.length; index++) {
      const page = endedPages[index];
      const ended = await tc.get('/match/today', {type: 'ended', columns: LIST_COLUMNS, page},
        {endpoint_family: 'live_ended', phase: 'LIVE', provenance: 'HISTORICAL_CAPTURED'});
      bump('live_ended', ended.outcome);
      for (const row of rowsOf(ended.body)) {
        if (!pending.has(String(row.id)) || !leagues.has(String(row.l_id))) continue;
        const terminal = await captureTerminal(db, {row, rawId: ended.raw_id, acquiredAt: ended.acquired_at || now(), runId});
        snapshots += terminal.snapshots;
        events += terminal.events;
        terminalConfirmed++;
        pending.delete(String(row.id));
      }
      const pg = ended.body?.pagination;
      if (page === 1 && ended.outcome === 'ok') endedPages = terminalPagePlan(pg, config.endedPages);
      if (ended.outcome !== 'ok' || !pg || pg.next === false || pg.next === 'false') break;
    }
    const summary = {version: LIVE_VERSION, run_id: runId, inplay_seen: rowsOf(list.body).length, verified_live: live.length, snapshots_new: snapshots, events_new: events, views, terminal_confirmed: terminalConfirmed, terminal_pending: pending.size, tz_hold: !tz.verified, outcomes};
    await db.query(`UPDATE tc_collector_runs SET status='complete', finished_at=clock_timestamp(), summary=$2 WHERE run_id=$1`, [runId, JSON.stringify(summary)]);
    log('TC_LIVE_CYCLE ' + JSON.stringify(summary));
    return summary;
  } catch (e) {
    await db.query(`UPDATE tc_collector_runs SET status='failed', finished_at=clock_timestamp(), error=$2 WHERE run_id=$1`, [runId, redactSecrets(String(e?.message || e)).slice(0, 500)]);
    throw e;
  }
}

let timer = null, busy = false, pausedUntil = 0;
/** Run one cycle with a transaction-scoped lock that PostgreSQL cannot leak through the pool. */
export async function withLiveLock(db, log, fn) {
  await db.query('BEGIN');
  try {
    const lock = await db.query('SELECT pg_try_advisory_xact_lock($1) AS locked', [TC_LIVE_LOCK]);
    if (!lock.rows[0]?.locked) {
      await db.query('ROLLBACK');
      return log('TC_LIVE_SKIPPED ' + JSON.stringify({reason: 'lock'}));
    }
    const result = await fn(db);
    await db.query('COMMIT');
    return result;
  } catch (error) {
    // runLiveCycle records its failed run before rethrowing. Preserve that evidence
    // when the transaction remains usable; COMMIT on an aborted transaction acts as ROLLBACK.
    try { await db.query('COMMIT'); }
    catch { await db.query('ROLLBACK').catch(() => {}); }
    throw error;
  }
}

async function guarded(env, log, fn) {
  return withClient(db => withLiveLock(db, log, fn));
}

export async function maybeStartTcLive({env = process.env, log = console.log} = {}) {
  const token = env.TOTALCORNER_API_TOKEN?.trim();
  if (env.TOTALCORNER_LIVE_ENABLED === 'false') return log('TC_LIVE_SKIPPED ' + JSON.stringify({reason: 'disabled'}));
  if (!token || !env.DATABASE_URL) return log('TC_LIVE_SKIPPED ' + JSON.stringify({reason: token ? 'no_database' : 'no_token', token_present: Boolean(token)}));
  const config = liveConfig(env);
  const tc = createTcClient({token, store: createPgStore(withClient), limiter: sharedLimiter(env)});
  const tick = async () => {
    if (busy || Date.now() < pausedUntil) return;
    busy = true;
    try {
      const s = await guarded(env, log, db => runLiveCycle({tc, db, config, log}));
      if (s?.auth_failed) pausedUntil = Date.now() + config.authPauseMs;
    } catch (e) {
      console.error('TC_LIVE_ERROR', redactSecrets(String(e?.message || e)));
    } finally { busy = false; }
  };
  log('TC_LIVE_START ' + JSON.stringify({version: LIVE_VERSION, interval_ms: config.intervalMs, max_matches: config.maxMatches}));
  setTimeout(tick, 0).unref?.();
  timer = setInterval(tick, config.intervalMs);
  timer.unref?.();
}

export function stopTcLive() { if (timer) clearInterval(timer); timer = null; }

/** Return current collector evidence without mutating provider or database state. */
export async function tcLiveReport(db) {
  const [runs, snapshots, events, markets, cursors] = await Promise.all([
    db.query(`SELECT run_id, version, status, started_at, finished_at, summary, error FROM tc_collector_runs ORDER BY run_id DESC LIMIT 8`),
    db.query(`SELECT count(*)::int AS snapshots, count(DISTINCT match_id)::int AS matches, count(DISTINCT league_id)::int AS leagues, min(acquired_at) AS earliest, max(acquired_at) AS latest FROM tc_live_snapshots`),
    db.query(`SELECT count(*)::int AS events, count(DISTINCT match_id)::int AS matches FROM tc_live_events`),
    db.query(`SELECT count(*)::int AS market_snapshots FROM tc_market_snapshots`),
    db.query(`SELECT count(*)::int AS cursors, count(*) FILTER(WHERE terminal_at IS NOT NULL)::int AS terminal_confirmed,
      count(*) FILTER(WHERE terminal_at IS NULL)::int AS terminal_pending, max(last_polled_at) AS last_polled_at FROM tc_live_cursors`)
  ]);
  return {version: LIVE_VERSION, runs: runs.rows, snapshots: snapshots.rows[0], events: events.rows[0], markets: markets.rows[0], cursors: cursors.rows[0]};
}
