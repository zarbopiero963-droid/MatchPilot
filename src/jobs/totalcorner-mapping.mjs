import { withClient } from '../db.mjs';
import { createTcClient, createPgStore, limiterConfig, redactSecrets, requestKey, sharedLimiter } from '../providers/totalcorner/client.mjs';
import { createCensus, phaseOf } from '../providers/totalcorner/schema.mjs';
import { MAPPING_METHOD, THRESHOLDS, classifyMappings, namingDiffers, pairFixtures, tcUtcDate } from '../providers/totalcorner/mapping.mjs';
import { LIST_COLUMNS, ODDS_COLUMNS } from './totalcorner-discovery.mjs';

// TC-CORE-02 (#20): map FPT competitions to TotalCorner leagues on real fixture overlap, persist every state with
// evidence, then re-run the field discovery on VERIFIED leagues only. Runs once per MAPPING_VERSION.

export const MAPPING_VERSION = 'tc-core-02-v2';
export const TC_MAPPING_LOCK = 76420321;
const MAX_PAGES = 80;

const rowsOf = body => (Array.isArray(body?.data) ? body.data : []);
const ymd = iso => iso.replaceAll('-', '');

export function mappingConfig(env = process.env) {
  return {
    dates: Math.max(3, Math.min(20, Number(env.TOTALCORNER_MAPPING_DATES || 10))),
    windowDays: Math.max(7, Math.min(60, Number(env.TOTALCORNER_MAPPING_WINDOW_DAYS || 30))),
    // Provider-local offset of TotalCorner timestamps, measured by discovery (UTC+2 on 08/10/2026).
    tzOffsetMinutes: Number(env.TOTALCORNER_TZ_OFFSET_MINUTES || 120)
  };
}

// Cache-first for immutable pages (past dates): the latest stored raw body is reused and the hit is recorded in the
// ledger; only missing pages go upstream.
export function createRawCache(db, {runId = null} = {}) {
  const stats = {hits: 0, misses: 0};
  return {
    stats,
    async get(family, path, params) {
      const key = requestKey(path, params);
      const r = await db.query(
        `SELECT raw_id, body FROM tc_raw_responses WHERE request_key=$1 AND outcome='ok' ORDER BY last_acquired_at DESC LIMIT 1`, [key]);
      if (!r.rowCount) { stats.misses++; return null; }
      stats.hits++;
      await db.query(
        `INSERT INTO tc_request_ledger(run_id,endpoint_family,url_path,attempt,outcome,raw_id) VALUES(NULL,$1,$2,0,'cache_hit',$3)`,
        [family, key, r.rows[0].raw_id]);
      return {outcome: 'ok', body: JSON.parse(r.rows[0].body), cache_hit: true, run_id: runId};
    }
  };
}

// All pages of one paginated list; stops when the provider says there is no next page or the page is not honoured.
async function allPages(call, family, path, params, ctx, notes, cache = null) {
  const rows = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const r = (cache && await cache.get(family, path, {...params, page})) || await call(family, path, {...params, page}, ctx);
    const pg = r.body?.pagination;
    rows.push(...rowsOf(r.body));
    if (r.outcome !== 'ok') break;
    if (pg && Number(pg.current) !== page) { notes.push(`${family} ${params.date || params.type}: page ${page} not honoured (current=${pg.current})`); break; }
    if (!pg || pg.next === false || pg.next === 'false') break;
    if (page === MAX_PAGES) notes.push(`${family} ${params.date || params.type}: stopped at ${MAX_PAGES} pages`);
  }
  return rows;
}

export async function runTcMapping({tc, db, config = mappingConfig(), log = console.log, now = () => new Date()}) {
  const run = await db.query(`INSERT INTO tc_mapping_runs(version,status) VALUES($1,'running') RETURNING run_id`, [MAPPING_VERSION]);
  const runId = Number(run.rows[0].run_id);
  const census = createCensus();
  const notes = [];
  const outcomes = {};
  const call = async (family, path, params, ctx = {}) => {
    const r = await tc.get(path, params, {...ctx, endpoint_family: family, provenance: ctx.provenance || 'MAPPING'});
    (outcomes[family] ||= {})[r.outcome] = (outcomes[family][r.outcome] || 0) + 1;
    if (r.body && ctx.census) census.add(family, r.body, r.acquired_at);
    return r;
  };
  try {
    const leagues = await db.query(
      `SELECT DISTINCT ON (country_slug, league_slug) country_slug, league_slug, internal_competition_id, canonical_league_name, season
       FROM fpt_competition_season ORDER BY country_slug, league_slug, season DESC`);
    const fptLeagues = leagues.rows.map(r => ({...r, league_key: `${r.country_slug}/${r.league_slug}`}));
    const datesRes = await db.query(
      `WITH last AS (SELECT max(match_date) AS d FROM fpt_matches_latest)
       SELECT match_date::date::text AS d, count(*)::int AS n FROM fpt_matches_latest, last
       WHERE match_date BETWEEN last.d - $1::int AND last.d GROUP BY 1 ORDER BY n DESC, d DESC LIMIT $2`, [config.windowDays, config.dates]);
    const dates = datesRes.rows.map(r => r.d).sort();
    const fptRes = await db.query(
      `SELECT country_slug||'/'||league_slug AS league_key, match_date::date::text AS date, home, away
       FROM fpt_matches_latest WHERE match_date::date::text = ANY($1::text[])`, [dates]);
    const fpt = fptRes.rows;

    const tcFixtures = [];
    const cache = createRawCache(db, {runId});
    const today = now().toISOString().slice(0, 10);
    for (const d of dates) {
      // Pages of days at least two days old cannot change any more: read them from the raw store first.
      const immutable = d <= new Date(Date.parse(today) - 2 * 86400000).toISOString().slice(0, 10);
      const rows = await allPages(call, 'match_schedule', '/match/schedule', {date: ymd(d)}, {phase: 'MIXED'}, notes, immutable ? cache : null);
      for (const r of rows) {
        if (!r?.id || !r?.l_id) continue;
        tcFixtures.push({id: String(r.id), league_id: String(r.l_id), league_name: String(r.l ?? ''), date: tcUtcDate(r.start, config.tzOffsetMinutes) || d,
          home: r.h, away: r.a, status: r.status ?? null});
      }
    }
    const seenAt = now();
    const tcLeagues = new Map();
    for (const m of tcFixtures) {
      const e = tcLeagues.get(m.league_id) || {name: m.league_name, n: 0};
      e.n++; tcLeagues.set(m.league_id, e);
    }

    const pairs = pairFixtures(fpt, tcFixtures);
    const mapped = classifyMappings({fptLeagues, fpt, tc: tcFixtures, pairs});

    await db.query('BEGIN');
    try {
      for (const [id, e] of tcLeagues) {
        await db.query(
          `INSERT INTO tc_competitions(totalcorner_league_id,totalcorner_league_name,first_seen_at,last_seen_at,fixtures_seen)
           VALUES($1,$2,$3,$3,$4)
           ON CONFLICT (totalcorner_league_id) DO UPDATE SET totalcorner_league_name=EXCLUDED.totalcorner_league_name,
             last_seen_at=EXCLUDED.last_seen_at, fixtures_seen=tc_competitions.fixtures_seen+EXCLUDED.fixtures_seen`,
          [id, e.name, seenAt, e.n]);
      }
      await db.query(`UPDATE competition_mapping SET active=false`);
      await db.query(`UPDATE tc_competitions SET mapping_status='UNMAPPED'`);
      for (const m of mapped) {
        await db.query(
          `INSERT INTO competition_mapping(internal_competition_id,country,canonical_league_name,futpython_country_slug,futpython_league_slug,
             futpython_season,totalcorner_league_id,totalcorner_league_name,totalcorner_country_name,mapping_status,mapping_confidence,
             mapping_method,verified_at,evidence,active,run_id,updated_at)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,NULL,$9,$10,$11,$12,$13,true,$14,now())
           ON CONFLICT (futpython_country_slug,futpython_league_slug) DO UPDATE SET
             internal_competition_id=EXCLUDED.internal_competition_id, canonical_league_name=EXCLUDED.canonical_league_name,
             futpython_season=EXCLUDED.futpython_season, totalcorner_league_id=EXCLUDED.totalcorner_league_id,
             totalcorner_league_name=EXCLUDED.totalcorner_league_name, mapping_status=EXCLUDED.mapping_status,
             mapping_confidence=EXCLUDED.mapping_confidence, mapping_method=EXCLUDED.mapping_method,
             verified_at=EXCLUDED.verified_at, evidence=EXCLUDED.evidence, active=true, run_id=EXCLUDED.run_id, updated_at=now()`,
          [m.internal_competition_id || m.league_key, m.country_slug, m.canonical_league_name ?? null, m.country_slug, m.league_slug, m.season ?? null,
            m.totalcorner_league_id ?? null, m.totalcorner_league_name ?? null, m.status, m.confidence, MAPPING_METHOD,
            m.status === 'VERIFIED' ? seenAt : null, JSON.stringify({...m.evidence, window_dates: dates}), runId]);
        if (m.totalcorner_league_id && ['VERIFIED', 'AMBIGUOUS', 'CANDIDATE'].includes(m.status)) {
          await db.query(
            `UPDATE tc_competitions SET mapping_status = CASE WHEN mapping_status='VERIFIED' THEN 'VERIFIED' ELSE $2 END WHERE totalcorner_league_id=$1`,
            [m.totalcorner_league_id, m.status]);
        }
      }
      await db.query('COMMIT');
    } catch (e) { await db.query('ROLLBACK'); throw e; }

    // Field discovery restricted to VERIFIED leagues: ended fixtures from the window plus today's upcoming/live.
    const verified = new Map(mapped.filter(m => m.status === 'VERIFIED').map(m => [m.totalcorner_league_id, m.league_key]));
    const perLeague = new Map();
    const pickEnded = tcFixtures.filter(m => verified.has(m.league_id) && m.status === 'full').filter(m => {
      const n = perLeague.get(m.league_id) || 0; if (n >= 1) return false; perLeague.set(m.league_id, n + 1); return true;
    }).slice(0, 10);
    const todayRows = {};
    for (const type of ['upcoming', 'inplay']) {
      const rows = await allPages(call, 'match_today', '/match/today', {type, columns: LIST_COLUMNS}, {phase: type === 'upcoming' ? 'PREMATCH' : 'LIVE', census: true, provenance: 'DISCOVERY_VERIFIED'}, notes);
      todayRows[type] = rows.filter(r => verified.has(String(r.l_id))).slice(0, 5);
    }
    const sample = [...pickEnded.map(m => ({id: m.id, league_id: m.league_id, why: 'ended_window'})),
      ...todayRows.upcoming.map(r => ({id: String(r.id), league_id: String(r.l_id), why: 'upcoming'})),
      ...todayRows.inplay.map(r => ({id: String(r.id), league_id: String(r.l_id), why: 'inplay'}))];
    for (const s of sample) {
      const ctx = {match_id: s.id, league_id: s.league_id, census: true, provenance: 'DISCOVERY_VERIFIED'};
      const v = await call('verified_match_view', `/match/view/${encodeURIComponent(s.id)}`, {columns: LIST_COLUMNS}, ctx);
      s.phase = phaseOf(rowsOf(v.body)[0] || {});
      await call('verified_match_odds', `/match/odds/${encodeURIComponent(s.id)}`, {columns: ODDS_COLUMNS}, {...ctx, phase: s.phase});
      await call('verified_bookmaker_odds', `/match/bookmaker_odds/${encodeURIComponent(s.id)}`, {}, {...ctx, phase: s.phase});
    }
    await census.flush(db);

    const status = {};
    for (const m of mapped) status[m.status] = (status[m.status] || 0) + 1;
    const ver = mapped.filter(m => m.status === 'VERIFIED');
    const dup = await db.query(
      `SELECT (SELECT count(*) FROM (SELECT totalcorner_league_id FROM competition_mapping WHERE mapping_status='VERIFIED' AND active
                GROUP BY 1 HAVING count(*)>1) x)::int AS dup_tc,
              (SELECT count(*) FROM (SELECT futpython_country_slug, futpython_league_slug FROM competition_mapping WHERE active
                GROUP BY 1,2 HAVING count(*)>1) y)::int AS dup_fpt`);
    const fields = await db.query(
      `SELECT endpoint_family, phase, count(*)::int AS fields, count(*) FILTER (WHERE nonnull_seen>0)::int AS nonnull_fields
       FROM tc_schema_registry WHERE endpoint_family LIKE 'verified_%' OR (endpoint_family='match_today' AND phase IN ('PREMATCH','LIVE'))
       GROUP BY 1,2 ORDER BY 1,2`);
    const keyFields = await db.query(
      `SELECT endpoint_family, phase, field_path, rows_seen, nonnull_seen FROM tc_schema_registry
       WHERE endpoint_family LIKE 'verified_%' AND field_path IN ('p_btts','po_btts','btts_list','bookmakers','asian_list','goal_list','corner_list','odds_list',
         'attacks','dang_attacks','shot_on','shot_off','possess','events','p_odds','po_odds','p_asian','p_goal','p_corner')
       ORDER BY 1,2,3`);
    const summary = {
      version: MAPPING_VERSION, run_id: runId, method: MAPPING_METHOD, thresholds: THRESHOLDS, config, window_dates: dates,
      fpt_leagues: fptLeagues.length, fpt_fixtures: fpt.length, tc_fixtures: tcFixtures.length, tc_leagues_seen: tcLeagues.size, pairs: pairs.length,
      status, verified: ver.length, verified_countries: [...new Set(ver.map(m => m.country_slug))].sort(),
      naming_differs: ver.filter(m => namingDiffers(m.league_slug, m.totalcorner_league_name)).map(m => `${m.league_key} -> ${m.totalcorner_league_name}`),
      ambiguous: mapped.filter(m => m.status === 'AMBIGUOUS').map(m => ({league: m.league_key, tc: m.totalcorner_league_name, matched: m.evidence.matched,
        runner_up: m.evidence.runner_up, reverse_others: m.evidence.reverse_others})),
      tc_leagues_unmapped: [...tcLeagues.keys()].filter(id => !mapped.some(m => m.totalcorner_league_id === id)).length,
      duplicates: dup.rows[0], cache: cache.stats, verified_discovery: {sample, fields: fields.rows, key_fields: keyFields.rows},
      outcomes, notes
    };
    await db.query(`UPDATE tc_mapping_runs SET status='complete', finished_at=now(), summary=$2 WHERE run_id=$1`, [runId, JSON.stringify(summary)]);
    log('TC_MAPPING_COMPLETE ' + JSON.stringify({run_id: runId, window_dates: dates, fpt_fixtures: fpt.length, tc_fixtures: tcFixtures.length,
      tc_leagues_seen: tcLeagues.size, pairs: pairs.length, status, verified_countries: summary.verified_countries.length,
      naming_differs: summary.naming_differs.length, ambiguous: summary.ambiguous.length, duplicates: summary.duplicates,
      verified_discovery_sample: sample.length, cache: cache.stats, outcomes, notes: notes.length}));
    return summary;
  } catch (e) {
    await census.flush(db).catch(() => {});
    await db.query(`UPDATE tc_mapping_runs SET status='failed', finished_at=now(), error=$2 WHERE run_id=$1`, [runId, redactSecrets(e?.message || e).slice(0, 500)]);
    throw e;
  }
}

export async function maybeStartTcMapping({env = process.env, log = console.log} = {}) {
  const token = env.TOTALCORNER_API_TOKEN?.trim();
  if (env.TOTALCORNER_MAPPING_ON_BOOT === 'false') return log('TC_MAPPING_SKIPPED ' + JSON.stringify({reason: 'disabled'}));
  if (!token || !env.DATABASE_URL) return log('TC_MAPPING_SKIPPED ' + JSON.stringify({reason: token ? 'no_database' : 'no_token', token_present: Boolean(token)}));
  return withClient(async db => {
    const lock = await db.query('SELECT pg_try_advisory_lock($1, hashtext(current_schema())) AS ok', [TC_MAPPING_LOCK]);
    if (!lock.rows[0]?.ok) return log('TC_MAPPING_SKIPPED ' + JSON.stringify({reason: 'locked'}));
    try {
      await db.query(`UPDATE tc_mapping_runs SET status='interrupted', finished_at=now() WHERE status='running'`);
      const done = await db.query(`SELECT run_id FROM tc_mapping_runs WHERE version=$1 AND status='complete' LIMIT 1`, [MAPPING_VERSION]);
      if (done.rowCount) return log('TC_MAPPING_SKIPPED ' + JSON.stringify({reason: 'already_complete', run_id: Number(done.rows[0].run_id)}));
      const tc = createTcClient({token, store: createPgStore(withClient), limiter: sharedLimiter(env)});
      log('TC_MAPPING_START ' + JSON.stringify({version: MAPPING_VERSION, config: mappingConfig(env)}));
      return await runTcMapping({tc, db, config: mappingConfig(env), log});
    } finally {
      await db.query('SELECT pg_advisory_unlock($1, hashtext(current_schema()))', [TC_MAPPING_LOCK]).catch(() => {});
    }
  });
}

export async function tcMappingReport(db, {status = null} = {}) {
  const runs = await db.query(`SELECT run_id, version, status, started_at, finished_at, summary, error FROM tc_mapping_runs ORDER BY run_id DESC LIMIT 3`);
  const rows = await db.query(
    `SELECT futpython_country_slug, futpython_league_slug, internal_competition_id, totalcorner_league_id, totalcorner_league_name,
            mapping_status, mapping_confidence, mapping_method, verified_at, evidence
     FROM competition_mapping WHERE active AND ($1::text IS NULL OR mapping_status=$1)
     ORDER BY mapping_status, futpython_country_slug, futpython_league_slug`, [status]);
  const tcLeagues = await db.query(`SELECT mapping_status, count(*)::int AS n FROM tc_competitions GROUP BY 1 ORDER BY 1`);
  return {runs: runs.rows, mappings: rows.rows, tc_competitions: tcLeagues.rows};
}
