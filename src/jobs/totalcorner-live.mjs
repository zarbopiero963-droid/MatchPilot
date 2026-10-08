import { withClient } from '../db.mjs';
import { createTcClient, createPgStore, redactSecrets, sharedLimiter } from '../providers/totalcorner/client.mjs';
import { LIST_COLUMNS } from './totalcorner-discovery.mjs';
import { prematchConfig, providerTzGate } from './totalcorner-prematch.mjs';
import { LIVE_VERSION, eventsOf, rowsOf, snapshotHash, verifiedInplay } from '../providers/totalcorner/live.mjs';

export const TC_LIVE_LOCK = 76420324;

export function liveConfig(env = process.env) {
  return {
    intervalMs: Math.max(15000, Number(env.TOTALCORNER_LIVE_POLL_SECONDS || 60) * 1000),
    maxMatches: Math.max(1, Math.min(8, Number(env.TOTALCORNER_LIVE_MAX_MATCHES || 4))),
    authPauseMs: Math.max(60000, Number(env.TOTALCORNER_AUTH_PAUSE_MS || 900000))
  };
}

async function verifiedLeagueIds(db) {
  const r = await db.query(`SELECT totalcorner_league_id FROM competition_mapping WHERE active AND mapping_status='VERIFIED' AND totalcorner_league_id IS NOT NULL`);
  return new Set(r.rows.map(x => String(x.totalcorner_league_id)));
}

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
      await db.query(`UPDATE tc_collector_runs SET status='failed', finished_at=now(), summary=$2 WHERE run_id=$1`, [runId, JSON.stringify(summary)]);
      return summary;
    }
    const leagues = await verifiedLeagueIds(db);
    const live = verifiedInplay(rowsOf(list.body), leagues).slice(0, config.maxMatches);
    let snapshots = 0, events = 0, views = 0;
    for (const row of live) {
      const view = await tc.get(`/match/view/${encodeURIComponent(row.id)}`, {columns: LIST_COLUMNS}, {endpoint_family: 'live_view', match_id: String(row.id), league_id: String(row.l_id), phase: 'LIVE', provenance: 'HISTORICAL_CAPTURED'});
      bump('live_view', view.outcome);
      const source = rowsOf(view.body)[0] || row;
      const hash = snapshotHash(source);
      const inserted = await db.query(
        `INSERT INTO tc_live_snapshots(match_id,league_id,run_id,acquired_at,provider_status,minute,score,snapshot_hash,raw_id,payload)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT(match_id,snapshot_hash) DO NOTHING RETURNING snapshot_id`,
        [String(row.id), String(row.l_id), runId, view.acquired_at || list.acquired_at || now(), source.status ?? null, source.minute ?? source.time ?? null, source.score ?? source.ss ?? null, hash, view.raw_id || list.raw_id || null, JSON.stringify(source)]);
      if (inserted.rowCount) snapshots++;
      for (const event of eventsOf(source)) {
        const ev = await db.query(
          `INSERT INTO tc_live_events(match_id,event_hash,minute,event_type,raw_id,acquired_at,payload)
           VALUES($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT(match_id,event_hash) DO NOTHING RETURNING event_id`,
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
    const summary = {version: LIVE_VERSION, run_id: runId, inplay_seen: rowsOf(list.body).length, verified_live: live.length, snapshots_new: snapshots, events_new: events, views, tz_hold: !tz.verified, outcomes};
    await db.query(`UPDATE tc_collector_runs SET status='complete', finished_at=now(), summary=$2 WHERE run_id=$1`, [runId, JSON.stringify(summary)]);
    log('TC_LIVE_CYCLE ' + JSON.stringify(summary));
    return summary;
  } catch (e) {
    await db.query(`UPDATE tc_collector_runs SET status='failed', finished_at=now(), error=$2 WHERE run_id=$1`, [runId, redactSecrets(String(e?.message || e)).slice(0, 500)]);
    throw e;
  }
}

let timer = null, busy = false, pausedUntil = 0;
async function guarded(env, log, fn) {
  return withClient(async db => {
    const lock = await db.query('SELECT pg_try_advisory_lock($1) AS locked', [TC_LIVE_LOCK]);
    if (!lock.rows[0]?.locked) return log('TC_LIVE_SKIPPED ' + JSON.stringify({reason: 'lock'}));
    try { return await fn(db); }
    finally { await db.query('SELECT pg_advisory_unlock($1)', [TC_LIVE_LOCK]); }
  });
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

export async function tcLiveReport(db) {
  const [runs, snapshots, events, markets, cursors] = await Promise.all([
    db.query(`SELECT run_id, version, status, started_at, finished_at, summary, error FROM tc_collector_runs ORDER BY run_id DESC LIMIT 8`),
    db.query(`SELECT count(*)::int AS snapshots, count(DISTINCT match_id)::int AS matches, count(DISTINCT league_id)::int AS leagues, min(acquired_at) AS earliest, max(acquired_at) AS latest FROM tc_live_snapshots`),
    db.query(`SELECT count(*)::int AS events, count(DISTINCT match_id)::int AS matches FROM tc_live_events`),
    db.query(`SELECT count(*)::int AS market_snapshots FROM tc_market_snapshots`),
    db.query(`SELECT count(*)::int AS cursors, max(last_polled_at) AS last_polled_at FROM tc_live_cursors`)
  ]);
  return {version: LIVE_VERSION, runs: runs.rows, snapshots: snapshots.rows[0], events: events.rows[0], markets: markets.rows[0], cursors: cursors.rows[0]};
}
