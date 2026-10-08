import { withClient } from '../db.mjs';
import { createTcClient, createLimiter, createPgStore, limiterConfig, redactSecrets } from '../providers/totalcorner/client.mjs';
import { createCensus, phaseOf } from '../providers/totalcorner/schema.mjs';

// TC-CORE-01 (#20): bounded empirical discovery endpoint x field x phase x competition on the real account.
// Runs once per DISCOVERY_VERSION; raw bodies, ledger and registry are persisted, nothing is promoted to the core.

export const DISCOVERY_VERSION = 'tc-core-01-v1';
export const TC_DISCOVERY_LOCK = 76420320;
export const LIST_COLUMNS = 'events,odds,asian,cornerLine,cornerLineHalf,goalLine,goalLineHalf,asianCorner,attacks,dangerousAttacks,shotOn,shotOff,possession,userRemarks,btts';
export const ODDS_COLUMNS = 'asianList,goalList,cornerList,oddsList,asianHalfList,goalHalfList,cornerHalfList,oddsHalfList,bttsList';
// Vendor notice 08/10/2026: 18 bookmakers; movement checked on Pinnacle, Betfair, 1xBet, Bwin and the Italian SNAI.
export const MOVEMENT_BOOKMAKERS = ['pinnacle', 'betfair', '1xbet', 'bwin', 'snai'];
export const MOVEMENT_COLUMNS = ['oddsList', 'asianList', 'goalList', 'cornerList'];

const ymd = d => d.toISOString().slice(0, 10).replaceAll('-', '');
const iso = d => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
const rowsOf = body => (Array.isArray(body?.data) ? body.data : body?.data && typeof body.data === 'object' ? [body.data] : []);

// Kickoff timezone evidence: for first-half live rows, acquired_at - start - minute should be ~0 if `start` is UTC.
export function kickoffOffsetEvidence(rows, acquiredAt) {
  const deltas = [];
  for (const r of rows) {
    const m = /^\d+$/.test(String(r?.status ?? '')) ? Number(r.status) : null;
    const start = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(r?.start || '') ? Date.parse(r.start.replace(' ', 'T') + 'Z') : NaN;
    if (m === null || m < 1 || m > 45 || Number.isNaN(start)) continue;
    deltas.push(Math.round((acquiredAt.getTime() - start) / 60000 - m));
  }
  deltas.sort((a, b) => a - b);
  return {samples: deltas.length, median_minutes: deltas.length ? deltas[Math.floor(deltas.length / 2)] : null,
    min: deltas[0] ?? null, max: deltas.at(-1) ?? null};
}

// Bookmaker identities in a bookmaker_odds body, whatever its shape (keys of an object, or name-like fields).
export function bookmakerNames(body) {
  const out = new Set();
  const visit = (v, depth) => {
    if (depth > 3 || v === null || typeof v !== 'object') return;
    if (Array.isArray(v)) { v.forEach(x => visit(x, depth + 1)); return; }
    for (const [k, x] of Object.entries(v)) {
      if (/^(bookmaker|bookmaker_name|company|book|bm)$/i.test(k) && typeof x === 'string') out.add(x);
      visit(x, depth + 1);
    }
  };
  visit(body?.data, 0);
  const d = body?.data;
  const keyed = Array.isArray(d) ? d[0] : d;
  const keys = keyed && typeof keyed === 'object' && !Array.isArray(keyed) ? Object.keys(keyed) : [];
  return {named: [...out].sort(), data_keys: keys.sort()};
}

function pickSample(rows, n, used) {
  const out = [];
  const leagues = new Set();
  for (const pass of [true, false]) {
    for (const r of rows) {
      if (out.length >= n) break;
      const id = r?.id ? String(r.id) : null;
      if (!id || used.has(id)) continue;
      if (pass && leagues.has(r.l_id)) continue;
      used.add(id); leagues.add(r.l_id); out.push(r);
    }
  }
  return out;
}

export async function runTcDiscovery({tc, db, now = () => new Date(), log = console.log, sample = {upcoming: 5, inplay: 5, ended: 5, past30: 3, past365: 2}, leagues = 3}) {
  const census = createCensus();
  const runRes = await db.query(`INSERT INTO tc_discovery_runs(version,status) VALUES($1,'running') RETURNING run_id`, [DISCOVERY_VERSION]);
  const runId = Number(runRes.rows[0].run_id);
  const outcomes = {};
  const notes = [];
  const call = async (family, path, params, ctx = {}) => {
    const r = await tc.get(path, params, {...ctx, endpoint_family: family, run_id: runId});
    (outcomes[family] ||= {})[r.outcome] = (outcomes[family][r.outcome] || 0) + 1;
    if (r.body) census.add(family, r.body, r.acquired_at);
    return r;
  };
  try {
    const t0 = now();
    const lists = {};
    const tz = [];
    for (const type of ['upcoming', 'inplay', 'ended']) {
      const phase = {upcoming: 'PREMATCH', inplay: 'LIVE', ended: 'ENDED'}[type];
      const full = await call('match_today', '/match/today', {type, columns: LIST_COLUMNS}, {phase});
      await call('match_today_default', '/match/today', {type}, {phase});
      lists[type] = rowsOf(full.body);
      if (type === 'inplay') tz.push(kickoffOffsetEvidence(lists[type], full.acquired_at));
    }

    // Schedule: date format is probed on today, then reused for past/future dates.
    let fmt = null;
    for (const [name, f] of [['YYYYMMDD', ymd], ['YYYY-MM-DD', iso]]) {
      const r = await call('match_schedule', '/match/schedule', {date: f(t0)}, {phase: 'MIXED'});
      if (r.outcome === 'ok' || r.outcome === 'no_data') { fmt = {name, f}; lists.schedule_today = rowsOf(r.body); break; }
    }
    const schedule = {};
    if (fmt) {
      for (const [label, days] of [['plus1', 1], ['minus1', -1], ['minus7', -7], ['minus30', -30], ['minus365', -365]]) {
        const r = await call('match_schedule', '/match/schedule', {date: fmt.f(addDays(t0, days))}, {phase: 'MIXED'});
        schedule[label] = {outcome: r.outcome, rows: rowsOf(r.body).length};
        lists['schedule_' + label] = rowsOf(r.body);
      }
    } else notes.push('match_schedule: no accepted date format among YYYYMMDD / YYYY-MM-DD');

    const used = new Set();
    const ended = r => phaseOf(r) === 'ENDED';
    const picks = [
      ...pickSample(lists.upcoming, sample.upcoming, used).map(r => ({r, why: 'upcoming'})),
      ...pickSample(lists.inplay, sample.inplay, used).map(r => ({r, why: 'inplay'})),
      ...pickSample(lists.ended, sample.ended, used).map(r => ({r, why: 'ended'})),
      ...pickSample((lists.schedule_minus30 || []).filter(ended), sample.past30, used).map(r => ({r, why: 'past30'})),
      ...pickSample((lists.schedule_minus365 || []).filter(ended), sample.past365, used).map(r => ({r, why: 'past365'}))
    ];
    const bookmakers = {};
    for (const {r, why} of picks) {
      const ctx = {match_id: String(r.id), league_id: r.l_id ? String(r.l_id) : null, phase: phaseOf(r)};
      await call('match_view', `/match/view/${encodeURIComponent(r.id)}`, {columns: LIST_COLUMNS}, ctx);
      await call('match_odds', `/match/odds/${encodeURIComponent(r.id)}`, {columns: ODDS_COLUMNS}, ctx);
      const b = await call('bookmaker_odds', `/match/bookmaker_odds/${encodeURIComponent(r.id)}`, {}, ctx);
      bookmakers[r.id] = {why, outcome: b.outcome, ...bookmakerNames(b.body)};
    }

    // Movement per bookmaker on one recent ended match and one historical match.
    const movementTargets = [picks.find(p => p.why === 'ended'), picks.find(p => p.why === 'past30' || p.why === 'past365')].filter(Boolean);
    const movement = [];
    for (const {r, why} of movementTargets) {
      const ctx = {match_id: String(r.id), league_id: r.l_id ? String(r.l_id) : null, phase: phaseOf(r)};
      for (const bookmaker of MOVEMENT_BOOKMAKERS) {
        for (const columns of bookmaker === 'pinnacle' ? MOVEMENT_COLUMNS : ['asianList']) {
          const m = await call('bookmaker_movement', `/match/bookmaker_odds/${encodeURIComponent(r.id)}`, {bookmaker, columns}, ctx);
          movement.push({match_id: String(r.id), why, bookmaker, columns, outcome: m.outcome, rows: rowsOf(m.body).length});
        }
      }
    }

    const leagueIds = [...new Set(picks.map(p => p.r.l_id).filter(Boolean))].slice(0, leagues);
    for (const lid of leagueIds) {
      const ctx = {league_id: String(lid), phase: 'MIXED'};
      for (const type of ['table', 'corner', 'card']) await call('league_table_' + type, `/league/table/${encodeURIComponent(lid)}`, {type}, ctx);
      await call('league_schedule', `/league/schedule/${encodeURIComponent(lid)}`, {}, ctx);
    }

    await census.flush(db);
    const listVsDetail = await db.query(
      `SELECT d.endpoint_family, d.field_path, d.phase, d.nonnull_seen, d.rows_seen
       FROM tc_schema_registry d
       WHERE d.endpoint_family IN ('match_view','match_odds','bookmaker_odds','bookmaker_movement') AND d.nonnull_seen > 0
         AND NOT EXISTS (SELECT 1 FROM tc_schema_registry l WHERE l.endpoint_family IN ('match_today','match_schedule')
                         AND l.field_path=d.field_path AND l.nonnull_seen > 0)
       ORDER BY d.endpoint_family, d.field_path, d.phase`);
    const fields = await db.query(
      `SELECT endpoint_family, count(DISTINCT field_path)::int AS fields, count(DISTINCT field_path) FILTER (WHERE nonnull_seen>0)::int AS nonnull_fields
       FROM tc_schema_registry GROUP BY 1 ORDER BY 1`);
    const raw = await db.query(
      `SELECT count(*)::int AS raw_rows, coalesce(sum(body_bytes),0)::bigint AS raw_bytes FROM tc_raw_responses WHERE first_run_id=$1`, [runId]);
    const btts = await db.query(
      `SELECT endpoint_family, phase, field_path, rows_seen, nonnull_seen FROM tc_schema_registry
       WHERE field_path ~* '^(btts|bttsList|btts_list)' ORDER BY 1,2,3`);
    const summary = {
      version: DISCOVERY_VERSION, run_id: runId, started_at: t0.toISOString(), finished_at: now().toISOString(),
      outcomes, list_rows: Object.fromEntries(Object.entries(lists).map(([k, v]) => [k, v.length])),
      schedule_date_format: fmt?.name || null, schedule, kickoff_tz_evidence: tz[0] || null,
      sample: picks.map(p => ({match_id: String(p.r.id), league_id: p.r.l_id ?? null, league: p.r.l ?? null, why: p.why, phase: phaseOf(p.r)})),
      bookmakers, movement, leagues: leagueIds,
      fields_by_family: fields.rows, raw: raw.rows[0],
      btts_fields: btts.rows,
      detail_only_fields: listVsDetail.rows.length, detail_only_sample: listVsDetail.rows.slice(0, 80),
      notes
    };
    await db.query(`UPDATE tc_discovery_runs SET status='complete', finished_at=now(), summary=$2 WHERE run_id=$1`, [runId, JSON.stringify(summary)]);
    log('TC_DISCOVERY_COMPLETE ' + JSON.stringify({run_id: runId, outcomes, list_rows: summary.list_rows, schedule_date_format: summary.schedule_date_format,
      kickoff_tz_evidence: summary.kickoff_tz_evidence, sample: summary.sample.length, raw: summary.raw, fields_by_family: summary.fields_by_family,
      detail_only_fields: summary.detail_only_fields, btts_fields: summary.btts_fields.length, movement: movement.map(m => `${m.bookmaker}/${m.columns}:${m.outcome}:${m.rows}`)}));
    return summary;
  } catch (e) {
    await census.flush(db).catch(() => {});
    await db.query(`UPDATE tc_discovery_runs SET status='failed', finished_at=now(), error=$2 WHERE run_id=$1`, [runId, redactSecrets(e?.message || e).slice(0, 500)]);
    throw e;
  }
}

export async function maybeStartTcDiscovery({env = process.env, log = console.log} = {}) {
  const token = env.TOTALCORNER_API_TOKEN?.trim();
  if (env.TOTALCORNER_DISCOVERY_ON_BOOT === 'false') return log('TC_DISCOVERY_SKIPPED ' + JSON.stringify({reason: 'disabled'}));
  if (!token || !env.DATABASE_URL) return log('TC_DISCOVERY_SKIPPED ' + JSON.stringify({reason: token ? 'no_database' : 'no_token', token_present: Boolean(token)}));
  return withClient(async db => {
    const lock = await db.query('SELECT pg_try_advisory_lock($1, hashtext(current_schema())) AS ok', [TC_DISCOVERY_LOCK]);
    if (!lock.rows[0]?.ok) return log('TC_DISCOVERY_SKIPPED ' + JSON.stringify({reason: 'locked'}));
    try {
      await db.query(`UPDATE tc_discovery_runs SET status='interrupted', finished_at=now() WHERE status='running'`);
      const done = await db.query(`SELECT run_id FROM tc_discovery_runs WHERE version=$1 AND status='complete' LIMIT 1`, [DISCOVERY_VERSION]);
      if (done.rowCount) return log('TC_DISCOVERY_SKIPPED ' + JSON.stringify({reason: 'already_complete', run_id: Number(done.rows[0].run_id)}));
      const store = createPgStore(withClient);
      const tc = createTcClient({token, store, limiter: createLimiter(limiterConfig(env))});
      log('TC_DISCOVERY_START ' + JSON.stringify({version: DISCOVERY_VERSION, token_present: true, limiter: limiterConfig(env)}));
      return await runTcDiscovery({tc, db, log});
    } finally {
      await db.query('SELECT pg_advisory_unlock($1, hashtext(current_schema()))', [TC_DISCOVERY_LOCK]).catch(() => {});
    }
  });
}

export async function tcDiscoveryReport(db) {
  const runs = await db.query(`SELECT run_id, version, status, started_at, finished_at, summary, error FROM tc_discovery_runs ORDER BY run_id DESC LIMIT 5`);
  const ledger = await db.query(`SELECT endpoint_family, outcome, count(*)::int AS n, round(avg(latency_ms))::int AS avg_latency_ms
                                 FROM tc_request_ledger GROUP BY 1,2 ORDER BY 1,2`);
  const registry = await db.query(`SELECT endpoint_family, phase, count(*)::int AS fields, count(*) FILTER (WHERE nonnull_seen>0)::int AS nonnull_fields,
                                          sum(rows_seen)::bigint AS rows_seen FROM tc_schema_registry GROUP BY 1,2 ORDER BY 1,2`);
  return {runs: runs.rows, ledger: ledger.rows, registry: registry.rows};
}

export async function tcSchemaRegistry(db, {family = null, phase = null, limit = 2000} = {}) {
  const r = await db.query(
    `SELECT endpoint_family, phase, field_path, json_types, rows_seen, nonnull_seen,
            round(nonnull_seen::numeric / NULLIF(rows_seen,0), 4) AS coverage, sample_value, first_seen, last_seen
     FROM tc_schema_registry WHERE ($1::text IS NULL OR endpoint_family=$1) AND ($2::text IS NULL OR phase=$2)
     ORDER BY endpoint_family, phase, field_path LIMIT $3`, [family, phase, Math.min(Math.max(Number(limit) || 2000, 1), 5000)]);
  return r.rows;
}
