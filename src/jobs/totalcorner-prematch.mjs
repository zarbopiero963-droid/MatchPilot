import { withClient } from '../db.mjs';
import { createTcClient, createPgStore, redactSecrets, sharedLimiter } from '../providers/totalcorner/client.mjs';
import { PREMATCH_PARSER_VERSION, TZ_GATE_VERSION, bookmakerIntervalMinutes, isDue, matchIdentity, measureProviderOffset,
  normalizeBookmakerRows, normalizeOddsRows, pitSummary, tzDecision, tzNeedsMeasure } from '../providers/totalcorner/prematch.mjs';
import { LIST_COLUMNS, ODDS_COLUMNS } from './totalcorner-discovery.mjs';

// TC-CORE-03 (#20): prematch market mirror for fixtures of VERIFIED competitions only. A cycle reads the upcoming list,
// takes /match/odds (and, less often, /match/bookmaker_odds) snapshots on an adaptive cadence before kickoff and stores
// every movement row once with its point-in-time phase. A one-shot replay normalizes the raw bodies already acquired.

// v2: cycles run only behind the provider timezone gate. The raw replay keeps its own version so a deploy does not
// replay (and re-snapshot) the discovery/mapping bodies a second time.
export const PREMATCH_VERSION = 'tc-core-03-v2';
export const PREMATCH_REPLAY_VERSION = 'tc-core-03-v1';
const TZ_MAX_PAGES = 3;
export const TC_PREMATCH_LOCK = 76420322;
const MAX_LIST_PAGES = 30;

const rowsOf = body => (Array.isArray(body?.data) ? body.data : []);

export function prematchConfig(env = process.env) {
  return {
    intervalMs: Math.max(60000, Number(env.TOTALCORNER_PREMATCH_INTERVAL_MS || 300000)),
    tzOffsetMinutes: Number(env.TOTALCORNER_TZ_OFFSET_MINUTES || 120),
    horizonHours: Math.max(1, Math.min(72, Number(env.TOTALCORNER_PREMATCH_HORIZON_HOURS || 36))),
    maxMatchesPerCycle: Math.max(1, Math.min(200, Number(env.TOTALCORNER_PREMATCH_MAX_MATCHES || 60))),
    authPauseMs: Math.max(60000, Number(env.TOTALCORNER_AUTH_PAUSE_MS || 1800000)),
    // How often the provider offset is re-measured, and how old the last agreeing measurement may be.
    tzCheckMinutes: Math.max(5, Math.min(180, Number(env.TOTALCORNER_TZ_CHECK_MINUTES || 30))),
    tzMaxAgeMinutes: Math.max(30, Math.min(720, Number(env.TOTALCORNER_TZ_MAX_AGE_MINUTES || 360)))
  };
}

export async function verifiedLeagues(db) {
  const r = await db.query(
    `SELECT totalcorner_league_id, futpython_country_slug, futpython_league_slug FROM competition_mapping
     WHERE active AND mapping_status='VERIFIED' AND totalcorner_league_id IS NOT NULL`);
  return new Map(r.rows.map(x => [String(x.totalcorner_league_id), x]));
}

export async function upsertMatch(db, m, mapping, seenAt, tzObservationId = null) {
  await db.query(
    `INSERT INTO tc_matches(match_id,league_id,league_name,home,home_id,away,away_id,start_provider,tz_offset_minutes,kickoff_utc,
       futpython_country_slug,futpython_league_slug,last_status,first_seen_at,last_seen_at,tz_observation_id)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14,$15)
     ON CONFLICT (match_id) DO UPDATE SET league_name=EXCLUDED.league_name, home=EXCLUDED.home, away=EXCLUDED.away,
       start_provider=EXCLUDED.start_provider, tz_offset_minutes=EXCLUDED.tz_offset_minutes, kickoff_utc=EXCLUDED.kickoff_utc,
       last_status=EXCLUDED.last_status, last_seen_at=GREATEST(tc_matches.last_seen_at, EXCLUDED.last_seen_at),
       tz_observation_id=COALESCE(EXCLUDED.tz_observation_id, tc_matches.tz_observation_id)`,
    [m.match_id, m.league_id, m.league_name, m.home, m.home_id, m.away, m.away_id, m.start_provider, m.tz_offset_minutes, m.kickoff_utc,
      mapping?.futpython_country_slug ?? null, mapping?.futpython_league_slug ?? null, m.last_status, seenAt, tzObservationId]);
}

// One statement per body: rows already stored only bump last_acquired_at/seen_count; phase and provenance stay those
// of the first acquisition.
export async function storeRows(db, {matchId, rows: all, rawId, acquiredAt}) {
  // A body can repeat an identical row; one INSERT .. ON CONFLICT may not touch the same key twice.
  const seen = new Set();
  const rows = all.filter(r => {
    const k = `${r.source}|${r.market}|${r.period}|${r.kind}|${r.row_hash}`;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
  const counts = {total: all.length, repeated_in_body: all.length - rows.length, new: 0, PREMATCH: 0, INPLAY: 0, QUARANTINE: 0};
  if (!rows.length) return counts;
  for (const r of rows) counts[r.phase]++;
  const payload = rows.map(r => ({...r, extra: r.extra ? JSON.stringify(r.extra) : null}));
  const res = await db.query(
    `INSERT INTO tc_market_rows(match_id,source,market,period,kind,minute,line,price_1,price_2,price_3,provider_time,provider_time_utc,
       score_home,score_away,extra,phase,quarantine_reason,provenance,row_hash,first_raw_id,first_acquired_at,last_acquired_at,parser_version)
     SELECT $1,x.source,x.market,x.period,x.kind,x.minute,x.line,x.price_1,x.price_2,x.price_3,x.provider_time,x.provider_time_utc,
       x.score_home,x.score_away,x.extra::jsonb,x.phase,x.quarantine_reason,x.provenance,x.row_hash,$3,$4,$4,$5
     FROM jsonb_to_recordset($2::jsonb) AS x(source text, market text, period text, kind text, minute int, line text, price_1 numeric,
       price_2 numeric, price_3 numeric, provider_time text, provider_time_utc timestamptz, score_home int, score_away int, extra text,
       phase text, quarantine_reason text, provenance text, row_hash text)
     ON CONFLICT (match_id,source,market,period,kind,row_hash) DO UPDATE SET
       last_acquired_at=GREATEST(tc_market_rows.last_acquired_at, EXCLUDED.last_acquired_at), seen_count=tc_market_rows.seen_count+1
     RETURNING (xmax = 0) AS inserted`,
    [matchId, JSON.stringify(payload), rawId ?? null, acquiredAt, PREMATCH_PARSER_VERSION]);
  counts.new = res.rows.filter(x => x.inserted).length;
  return counts;
}

async function insertSnapshot(db, {matchId, runId, source, acquiredAt, kickoffUtc, rawId, counts}) {
  await db.query(
    `INSERT INTO tc_prematch_snapshots(match_id,run_id,source,acquired_at,kickoff_utc,minutes_to_kickoff,raw_id,rows_total,rows_new,
       rows_prematch,rows_inplay,rows_quarantine)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [matchId, runId, source, acquiredAt, kickoffUtc, ((kickoffUtc - acquiredAt) / 60000).toFixed(2), rawId ?? null, counts.total, counts.new,
      counts.PREMATCH, counts.INPLAY, counts.QUARANTINE]);
}

// Normalize one acquired body (odds or bookmaker) and record the snapshot when it was taken before kickoff.
export async function ingestBody(db, {source, body, rawId, acquiredAt, offset, runId, mapping, snapshot = true, tzObservationId = null}) {
  const record = rowsOf(body)[0];
  const m = matchIdentity(record, offset);
  if (!m) return {skipped: 'no_identity'};
  await upsertMatch(db, m, mapping, acquiredAt, tzObservationId);
  const ctx = {offset, kickoffUtc: m.kickoff_utc, acquiredAt};
  const rows = source === 'match_odds' ? normalizeOddsRows(record, ctx) : normalizeBookmakerRows(record, ctx);
  const counts = await storeRows(db, {matchId: m.match_id, rows, rawId, acquiredAt});
  const before = acquiredAt < m.kickoff_utc;
  if (snapshot && before) await insertSnapshot(db, {matchId: m.match_id, runId, source, acquiredAt, kickoffUtc: m.kickoff_utc, rawId, counts});
  return {match_id: m.match_id, league_id: m.league_id, counts, snapshot: snapshot && before, late: !before};
}

const bump = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };

async function recentTzObservations(db) {
  const r = await db.query(`SELECT observation_id, observed_at, status, offset_minutes FROM tc_tz_observations ORDER BY observed_at DESC, observation_id DESC LIMIT 20`);
  return r.rows.map(x => ({...x, observation_id: Number(x.observation_id)}));
}

// Measure the provider offset from the in-play list when no MEASURED observation is fresher than tzCheckMinutes, persist it,
// and decide whether this cycle may normalize. One to TZ_MAX_PAGES list calls per check, on the shared limiter.
export async function providerTzGate({db, call, config, now}) {
  let observations = await recentTzObservations(db);
  const t = now();
  let measuredNow = null;
  if (tzNeedsMeasure({observations, now: t, checkMinutes: config.tzCheckMinutes, retryMinutes: Math.min(config.tzCheckMinutes, 5)})) {
    const rows = [];
    const rawIds = [];
    let acquiredAt = null;
    let auth = false;
    for (let page = 1; page <= TZ_MAX_PAGES; page++) {
      const r = await call('tz_inplay_list', '/match/today', {type: 'inplay', page}, {phase: 'LIVE'});
      if (r.outcome === 'auth') { auth = true; break; }
      if (r.outcome !== 'ok') break;
      if (r.raw_id) rawIds.push(Number(r.raw_id));
      acquiredAt ||= r.acquired_at;
      // Each page is measured against its own acquisition time.
      for (const row of rowsOf(r.body)) rows.push({row, at: r.acquired_at instanceof Date ? r.acquired_at : new Date(r.acquired_at)});
      const pg = r.body?.pagination;
      if (!pg || Number(pg.current) !== page || pg.next === false || pg.next === 'false') break;
    }
    if (auth) return {verified: false, offset: null, reason: 'auth', auth_failed: true};
    const m = rows.length
      ? measureProviderOffset(rows.map(x => ({row: x.row, acquiredAt: x.at})))
      : {status: 'UNAVAILABLE', samples: 0, excluded_not_real_time: 0, median_minutes: null, min_minutes: null, max_minutes: null, offset_minutes: null};
    const ins = await db.query(
      `INSERT INTO tc_tz_observations(observed_at,gate_version,status,samples,excluded_not_real_time,median_minutes,min_minutes,max_minutes,
         offset_minutes,configured_offset_minutes,agrees,raw_ids)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING observation_id`,
      [acquiredAt || t, TZ_GATE_VERSION, m.status, m.samples, m.excluded_not_real_time, m.median_minutes, m.min_minutes, m.max_minutes,
        m.offset_minutes, config.tzOffsetMinutes, m.status === 'MEASURED' ? m.offset_minutes === config.tzOffsetMinutes : null, rawIds]);
    measuredNow = {...m, observation_id: Number(ins.rows[0].observation_id)};
    observations = await recentTzObservations(db);
  }
  const d = tzDecision({observations, configuredOffset: config.tzOffsetMinutes, now: t, maxAgeMinutes: config.tzMaxAgeMinutes});
  const basis = observations.find(o => o.status === 'MEASURED');
  return {...d, observation_id: basis?.observation_id ?? null, measured_now: measuredNow};
}


export async function runPrematchCycle({tc, db, config = prematchConfig(), now = () => new Date(), log = console.log}) {
  const run = await db.query(`INSERT INTO tc_prematch_runs(kind,version,status) VALUES('cycle',$1,'running') RETURNING run_id`, [PREMATCH_VERSION]);
  const runId = Number(run.rows[0].run_id);
  const outcomes = {};
  const totals = {snapshots: 0, rows_new: 0, late: 0, PREMATCH: 0, INPLAY: 0, QUARANTINE: 0};
  const call = async (family, path, params, ctx = {}) => {
    const r = await tc.get(path, params, {...ctx, endpoint_family: family, provenance: 'PREMATCH_COLLECTOR', run_id: null});
    bump(outcomes[family] ||= {}, r.outcome);
    return r;
  };
  try {
    const tz = await providerTzGate({db, call, config, now});
    if (tz.observation_id) await db.query(`UPDATE tc_prematch_runs SET tz_observation_id=$2 WHERE run_id=$1`, [runId, tz.observation_id]);
    if (!tz.verified) {
      // Fail closed: no normalization and no snapshot under an unverified offset. Movement history stays available
      // upstream (HISTORICAL_UPSTREAM) and can be acquired once the offset is verified again.
      const summary = {version: PREMATCH_VERSION, tz_gate: TZ_GATE_VERSION, run_id: runId, tz_hold: true, tz, auth_failed: Boolean(tz.auth_failed), outcomes};
      await db.query(`UPDATE tc_prematch_runs SET status=$2, finished_at=now(), summary=$3 WHERE run_id=$1`,
        [runId, tz.auth_failed ? 'failed' : 'complete', JSON.stringify(summary)]);
      log('TC_PREMATCH_TZ_HOLD ' + JSON.stringify(summary));
      return summary;
    }
    const offset = tz.offset;
    const leagues = await verifiedLeagues(db);
    const upcoming = [];
    let authFailed = false;
    for (let page = 1; page <= MAX_LIST_PAGES; page++) {
      const r = await call('prematch_list', '/match/today', {type: 'upcoming', columns: LIST_COLUMNS, page}, {phase: 'PREMATCH'});
      if (r.outcome === 'auth') { authFailed = true; break; }
      upcoming.push(...rowsOf(r.body));
      const pg = r.body?.pagination;
      if (r.outcome !== 'ok' || !pg || Number(pg.current) !== page || pg.next === false || pg.next === 'false') break;
    }
    const t0 = now();
    const horizon = t0.getTime() + config.horizonHours * 3600000;
    const candidates = [];
    for (const row of upcoming) {
      const mapping = leagues.get(String(row?.l_id));
      if (!mapping) continue;
      const m = matchIdentity(row, offset);
      if (!m || m.kickoff_utc <= t0 || m.kickoff_utc.getTime() > horizon) continue;
      await upsertMatch(db, m, mapping, t0, tz.observation_id);
      candidates.push({m, mapping});
    }
    const last = await db.query(
      `SELECT match_id, source, max(acquired_at) AS last_at FROM tc_prematch_snapshots WHERE match_id = ANY($1::text[]) GROUP BY 1,2`,
      [candidates.map(c => c.m.match_id)]);
    const lastAt = new Map(last.rows.map(r => [`${r.match_id}|${r.source}`, new Date(r.last_at)]));
    const due = candidates
      .filter(c => isDue({kickoffUtc: c.m.kickoff_utc, lastAt: lastAt.get(`${c.m.match_id}|match_odds`), now: t0}))
      .sort((a, b) => a.m.kickoff_utc - b.m.kickoff_utc)
      .slice(0, config.maxMatchesPerCycle);
    for (const {m, mapping} of due) {
      if (authFailed) break;
      const ctx = {match_id: m.match_id, league_id: m.league_id, phase: 'PREMATCH'};
      const odds = await call('prematch_match_odds', `/match/odds/${encodeURIComponent(m.match_id)}`, {columns: ODDS_COLUMNS}, ctx);
      if (odds.outcome === 'auth') { authFailed = true; break; }
      if (odds.outcome === 'ok') {
        const res = await ingestBody(db, {source: 'match_odds', body: odds.body, rawId: odds.raw_id, acquiredAt: odds.acquired_at,
          offset, runId, mapping, tzObservationId: tz.observation_id});
        if (res.snapshot) totals.snapshots++;
        if (res.late) totals.late++;
        if (res.counts) { totals.rows_new += res.counts.new; for (const k of ['PREMATCH', 'INPLAY', 'QUARANTINE']) totals[k] += res.counts[k]; }
      }
      const bmDue = isDue({kickoffUtc: m.kickoff_utc, lastAt: lastAt.get(`${m.match_id}|bookmaker_odds`), now: now(), interval: bookmakerIntervalMinutes});
      if (!bmDue) continue;
      const bm = await call('prematch_bookmaker_odds', `/match/bookmaker_odds/${encodeURIComponent(m.match_id)}`, {}, ctx);
      if (bm.outcome === 'auth') { authFailed = true; break; }
      if (bm.outcome === 'ok') {
        const res = await ingestBody(db, {source: 'bookmaker_odds', body: bm.body, rawId: bm.raw_id, acquiredAt: bm.acquired_at,
          offset, runId, mapping, tzObservationId: tz.observation_id});
        if (res.snapshot) totals.snapshots++;
        if (res.late) totals.late++;
        if (res.counts) { totals.rows_new += res.counts.new; for (const k of ['PREMATCH', 'INPLAY', 'QUARANTINE']) totals[k] += res.counts[k]; }
      }
    }
    const summary = {version: PREMATCH_VERSION, tz_gate: TZ_GATE_VERSION, tz: {reason: tz.reason, offset, observation_id: tz.observation_id,
      measured_now: tz.measured_now ? {status: tz.measured_now.status, samples: tz.measured_now.samples, offset_minutes: tz.measured_now.offset_minutes} : null},
      run_id: runId, upcoming: upcoming.length, verified_upcoming: candidates.length,
      verified_leagues_upcoming: new Set(candidates.map(c => c.m.league_id)).size, due: due.length, ...totals, auth_failed: authFailed, outcomes};
    await db.query(`UPDATE tc_prematch_runs SET status=$2, finished_at=now(), summary=$3 WHERE run_id=$1`,
      [runId, authFailed ? 'failed' : 'complete', JSON.stringify(summary)]);
    log('TC_PREMATCH_CYCLE ' + JSON.stringify(summary));
    return summary;
  } catch (e) {
    await db.query(`UPDATE tc_prematch_runs SET status='failed', finished_at=now(), error=$2 WHERE run_id=$1`, [runId, redactSecrets(e?.message || e).slice(0, 500)]);
    throw e;
  }
}

// One-shot: normalize the /match/odds and /match/bookmaker_odds raw bodies already stored by discovery/mapping, for
// VERIFIED leagues only. No upstream call.
export async function runPrematchRawReplay({db, config = prematchConfig(), log = console.log}) {
  const run = await db.query(`INSERT INTO tc_prematch_runs(kind,version,status) VALUES('raw_replay',$1,'running') RETURNING run_id`, [PREMATCH_REPLAY_VERSION]);
  const runId = Number(run.rows[0].run_id);
  try {
    const leagues = await verifiedLeagues(db);
    const raws = await db.query(
      `SELECT raw_id, endpoint_family, body, first_acquired_at FROM tc_raw_responses
       WHERE outcome='ok' AND endpoint_family IN ('match_odds','verified_match_odds','bookmaker_odds','verified_bookmaker_odds')
       ORDER BY first_acquired_at, raw_id`);
    const stats = {raw: raws.rowCount, ingested: 0, skipped_unverified: 0, skipped_no_identity: 0, snapshots: 0, rows_new: 0,
      PREMATCH: 0, INPLAY: 0, QUARANTINE: 0, matches: new Set(), leagues: new Set()};
    for (const raw of raws.rows) {
      let body;
      try { body = JSON.parse(raw.body); } catch { continue; }
      const mapping = leagues.get(String(rowsOf(body)[0]?.l_id));
      if (!mapping) { stats.skipped_unverified++; continue; }
      const source = raw.endpoint_family.endsWith('bookmaker_odds') ? 'bookmaker_odds' : 'match_odds';
      const res = await ingestBody(db, {source, body, rawId: Number(raw.raw_id), acquiredAt: new Date(raw.first_acquired_at),
        // Historical bodies: the live timezone gate cannot vouch for past dates (tz_observation_id stays NULL); the
        // per-date offset of historical upstream data is verified by the historical backfill card, not assumed here.
        offset: config.tzOffsetMinutes, runId, mapping});
      if (res.skipped) { stats.skipped_no_identity++; continue; }
      stats.ingested++;
      stats.matches.add(res.match_id); stats.leagues.add(res.league_id);
      if (res.snapshot) stats.snapshots++;
      stats.rows_new += res.counts.new;
      for (const k of ['PREMATCH', 'INPLAY', 'QUARANTINE']) stats[k] += res.counts[k];
    }
    const summary = {version: PREMATCH_REPLAY_VERSION, run_id: runId, ...stats, matches: stats.matches.size, leagues: stats.leagues.size};
    await db.query(`UPDATE tc_prematch_runs SET status='complete', finished_at=now(), summary=$2 WHERE run_id=$1`, [runId, JSON.stringify(summary)]);
    log('TC_PREMATCH_REPLAY ' + JSON.stringify(summary));
    return summary;
  } catch (e) {
    await db.query(`UPDATE tc_prematch_runs SET status='failed', finished_at=now(), error=$2 WHERE run_id=$1`, [runId, redactSecrets(e?.message || e).slice(0, 500)]);
    throw e;
  }
}

let timer = null;
let busy = false;
let pausedUntil = 0;

async function guarded(env, log, fn) {
  return withClient(async db => {
    const lock = await db.query('SELECT pg_try_advisory_lock($1, hashtext(current_schema())) AS ok', [TC_PREMATCH_LOCK]);
    if (!lock.rows[0]?.ok) return log('TC_PREMATCH_SKIPPED ' + JSON.stringify({reason: 'locked'}));
    try { return await fn(db); }
    finally { await db.query('SELECT pg_advisory_unlock($1, hashtext(current_schema()))', [TC_PREMATCH_LOCK]).catch(() => {}); }
  });
}

export async function maybeStartTcPrematch({env = process.env, log = console.log} = {}) {
  const token = env.TOTALCORNER_API_TOKEN?.trim();
  if (env.TOTALCORNER_PREMATCH_ENABLED === 'false') return log('TC_PREMATCH_SKIPPED ' + JSON.stringify({reason: 'disabled'}));
  if (!token || !env.DATABASE_URL) return log('TC_PREMATCH_SKIPPED ' + JSON.stringify({reason: token ? 'no_database' : 'no_token', token_present: Boolean(token)}));
  const config = prematchConfig(env);
  await guarded(env, log, async db => {
    await db.query(`UPDATE tc_prematch_runs SET status='interrupted', finished_at=now() WHERE status='running'`);
    const done = await db.query(`SELECT run_id FROM tc_prematch_runs WHERE kind='raw_replay' AND version=$1 AND status='complete' LIMIT 1`, [PREMATCH_REPLAY_VERSION]);
    if (done.rowCount) return log('TC_PREMATCH_REPLAY_SKIPPED ' + JSON.stringify({reason: 'already_complete', run_id: Number(done.rows[0].run_id)}));
    return runPrematchRawReplay({db, config, log});
  });
  const tc = createTcClient({token, store: createPgStore(withClient), limiter: sharedLimiter(env)});
  const tick = async () => {
    if (busy || Date.now() < pausedUntil) return;
    busy = true;
    try {
      const s = await guarded(env, log, db => runPrematchCycle({tc, db, config, log}));
      if (s?.auth_failed) {
        pausedUntil = Date.now() + config.authPauseMs;
        log('TC_PREMATCH_AUTH_PAUSE ' + JSON.stringify({pause_ms: config.authPauseMs}));
      }
    } catch (e) {
      console.error('TC_PREMATCH_ERROR', redactSecrets(String(e?.message || e)));
    } finally { busy = false; }
  };
  log('TC_PREMATCH_START ' + JSON.stringify({version: PREMATCH_VERSION, config}));
  await tick();
  timer = setInterval(tick, config.intervalMs);
  timer.unref?.();
}

export function stopTcPrematch() { if (timer) clearInterval(timer); timer = null; }

export async function tcPrematchReport(db) {
  const q = async (sql, p = []) => (await db.query(sql, p)).rows;
  const [runs, matches, snapshots, rows, quarantine, leakage, provenance, tz] = await Promise.all([
    q(`SELECT run_id, kind, version, status, started_at, finished_at, summary, error FROM tc_prematch_runs ORDER BY run_id DESC LIMIT 5`),
    q(`SELECT count(*)::int AS matches, count(DISTINCT league_id)::int AS leagues,
         count(*) FILTER (WHERE EXISTS (SELECT 1 FROM tc_prematch_snapshots s WHERE s.match_id=m.match_id))::int AS with_snapshot,
         count(DISTINCT league_id) FILTER (WHERE EXISTS (SELECT 1 FROM tc_prematch_snapshots s WHERE s.match_id=m.match_id))::int AS leagues_with_snapshot
       FROM tc_matches m`),
    q(`SELECT source, count(*)::int AS n, count(DISTINCT match_id)::int AS matches, min(minutes_to_kickoff) AS min_mtk,
         max(minutes_to_kickoff) AS max_mtk FROM tc_prematch_snapshots GROUP BY 1 ORDER BY 1`),
    q(`SELECT CASE WHEN source LIKE 'bookmaker:%' THEN 'bookmaker' ELSE source END AS source, market, period, phase, count(*)::int AS n
       FROM tc_market_rows GROUP BY 1,2,3,4 ORDER BY 1,2,3,4`),
    q(`SELECT quarantine_reason, count(*)::int AS n FROM tc_market_rows WHERE phase='QUARANTINE' GROUP BY 1 ORDER BY 1`),
    q(`SELECT
         (SELECT count(*) FROM tc_market_rows r JOIN tc_matches m USING (match_id)
           WHERE r.phase='PREMATCH' AND (r.provider_time_utc >= m.kickoff_utc OR r.minute IS NOT NULL))::int AS prematch_rows_at_or_after_kickoff,
         (SELECT count(*) FROM tc_prematch_snapshots WHERE acquired_at >= kickoff_utc)::int AS snapshots_at_or_after_kickoff,
         (SELECT count(*) FROM (SELECT 1 FROM tc_market_rows GROUP BY match_id,source,market,period,kind,row_hash HAVING count(*)>1) d)::int AS duplicate_rows,
         (SELECT count(*) FROM tc_matches m WHERE NOT EXISTS (SELECT 1 FROM competition_mapping c WHERE c.active AND c.mapping_status='VERIFIED'
           AND c.totalcorner_league_id=m.league_id))::int AS matches_outside_verified`),
    q(`SELECT provenance, phase, count(*)::int AS n FROM tc_market_rows GROUP BY 1,2 ORDER BY 1,2`),
    q(`SELECT observation_id, observed_at, gate_version, status, samples, excluded_not_real_time, median_minutes, min_minutes, max_minutes,
         offset_minutes, configured_offset_minutes, agrees FROM tc_tz_observations ORDER BY observed_at DESC, observation_id DESC LIMIT 5`)
  ]);
  return {version: PREMATCH_VERSION, replay_version: PREMATCH_REPLAY_VERSION, tz_gate: TZ_GATE_VERSION, runs, matches: matches[0], snapshots, rows,
    quarantine, leakage: leakage[0], provenance, tz_observations: tz};
}

// Point-in-time prematch view of one match. knowledge='provider' uses provider time only; 'captured' additionally
// requires that MatchPilot had acquired the row by as_of.
export async function tcPrematchMatch(db, {matchId, asOf = null, knowledge = 'provider'}) {
  const m = await db.query(`SELECT * FROM tc_matches WHERE match_id=$1`, [String(matchId ?? '')]);
  if (!m.rowCount) return null;
  const match = m.rows[0];
  const kickoffUtc = new Date(match.kickoff_utc);
  const at = asOf && !Number.isNaN(Date.parse(asOf)) ? new Date(asOf) : kickoffUtc;
  const rows = await db.query(
    `SELECT source, market, period, kind, line, price_1, price_2, price_3, provider_time, provider_time_utc, phase, provenance, first_acquired_at
     FROM tc_market_rows WHERE match_id=$1 AND phase='PREMATCH' AND ($2::text <> 'captured' OR first_acquired_at <= $3)
     ORDER BY provider_time_utc`, [match.match_id, knowledge, at]);
  const norm = rows.rows.map(r => ({...r, provider_time_utc: new Date(r.provider_time_utc).toISOString()}));
  const snaps = await db.query(`SELECT source, count(*)::int AS n, max(acquired_at) AS last_at FROM tc_prematch_snapshots WHERE match_id=$1 GROUP BY 1`, [match.match_id]);
  return {match, as_of: at.toISOString(), knowledge, cutoff: new Date(Math.min(at.getTime(), kickoffUtc.getTime() - 1)).toISOString(),
    snapshots: snaps.rows, markets: pitSummary(norm, {kickoffUtc, asOf: at})};
}
