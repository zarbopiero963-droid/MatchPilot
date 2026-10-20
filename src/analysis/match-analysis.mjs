// R-07a (#25, #30, QUERY-CORE-01; MP-WEB-003, MP-WEB-014): pre-match analysis of one stored match. For each team and
// venue scope (home, away, both) and window (last 5, 10, 20 and the season), the server computes the team's record from
// FINAL historical matches dated strictly before the match day, with N, per-family coverage, provenance and the ids of
// the source rows (drill-down). Same-day matches are excluded: kickoff times are provider-local with an undocumented
// time zone, so the order within a day is unknown. Values come from the current fact versions with a date cutoff only:
// the answer is labelled PIT_NOT_VERIFIED (no acquisition-time check, AGENTS.md). Arithmetic is exact (Math Core
// Decimal); averages and rates are rounded HALF_EVEN to the places stated in the response. No upstream call.
import {Decimal, ROUNDING} from '../math/decimal.mjs';
import {ROUNDING_POLICY_VERSION} from '../math/core.mjs';
import {FACTS_VERSION, QueryInputError} from '../providers/futpython/query.mjs';

export const ANALYSIS_VERSION = 'mp-match-analysis-1';
export const WINDOWS = [5, 10, 20, 'season'];
export const VENUES = ['home', 'away', 'both'];
const AVERAGE_PLACES = 2;
const RATE_PLACES = 4;
const PERCENT_PLACES = 1;
const MAX_ID = 400;

const VENUE_SQL = {
  home: 'home_team_id = $1',
  away: 'away_team_id = $1',
  both: '(home_team_id = $1 OR away_team_id = $1)',
};

const ROW_COLUMNS = `internal_match_id, match_date, kickoff_local_time, season_id, season, home_team_id, away_team_id,
  home_name, away_name, home_score, away_score, xg_home, xg_away, odd_home, odd_draw, odd_away`;

// The latest 20 and, separately, the whole season before the cutoff: the 5/10/20 windows are prefixes of the first.
const recentSql = venue => `SELECT ${ROW_COLUMNS} FROM fpt_match_facts
  WHERE ${VENUE_SQL[venue]} AND phase = 'HISTORICAL' AND result_status = 'FINAL' AND home_score IS NOT NULL AND away_score IS NOT NULL
    AND match_date < $2::date
  ORDER BY match_date DESC, internal_match_id COLLATE "C" LIMIT 20`;
const seasonSql = venue => `SELECT ${ROW_COLUMNS} FROM fpt_match_facts
  WHERE ${VENUE_SQL[venue]} AND phase = 'HISTORICAL' AND result_status = 'FINAL' AND home_score IS NOT NULL AND away_score IS NOT NULL
    AND match_date < $2::date AND season_id = $3
  ORDER BY match_date DESC, internal_match_id COLLATE "C"`;

const MATCH_SQL = `SELECT internal_match_id, internal_competition_id, season_id, country_slug, league_slug, season, match_date::text AS match_date,
    kickoff_local_time, kickoff_tz_status, home_team_id, away_team_id, home_name, away_name, home_score, away_score,
    result_status, phase, dataset_key, version_id, acquired_at, source_provider, parser_version, facts_version,
    odd_home, odd_draw, odd_away, odd_over25, odd_under25, odd_btts_yes, favorite_side, favorite_odd, xg_home, xg_away
  FROM fpt_match_facts WHERE internal_match_id = $1`;

const H2H_SQL = `SELECT ${ROW_COLUMNS} FROM fpt_match_facts
  WHERE ((home_team_id = $1 AND away_team_id = $2) OR (home_team_id = $2 AND away_team_id = $1))
    AND phase = 'HISTORICAL' AND result_status = 'FINAL' AND home_score IS NOT NULL AND away_score IS NOT NULL AND match_date < $3::date
  ORDER BY match_date DESC, internal_match_id COLLATE "C" LIMIT 10`;

export function matchIdOf(value) {
  const id = String(value ?? '').trim();
  if (!id.startsWith('fpt:') || id.length > MAX_ID || id.includes('\u0000')) throw new QueryInputError('id must be an internal match id (fpt:…)');
  return id;
}

const present = value => value !== null && value !== undefined;
const ratio = (part, whole) => whole === 0 ? null : Decimal.from(part).div(whole).round(RATE_PLACES, ROUNDING.HALF_EVEN).toString(RATE_PLACES);
const average = (total, n) => n === 0 ? null : total.div(n).round(AVERAGE_PLACES, ROUNDING.HALF_EVEN).toString(AVERAGE_PLACES);
// The same share as a percentage, computed here so the page shows it as sent (MP-WEB-011: no arithmetic in the browser).
const percent = (part, whole) => whole === 0 ? null : Decimal.from(part).mul(100).div(whole).round(PERCENT_PLACES, ROUNDING.HALF_EVEN).toString(PERCENT_PLACES);
// The team's result in one match, from its side: W, D or L.
const outcomeOf = (gf, ga) => gf > ga ? 'W' : gf === ga ? 'D' : 'L';

// The team's record over the given rows, from the team's side of each match.
export function windowStats(team, rows) {
  let won = 0, drawn = 0, lost = 0, over25 = 0, btts = 0, cleanSheets = 0, failedToScore = 0;
  let goalsFor = Decimal.zero(), goalsAgainst = Decimal.zero(), xgFor = Decimal.zero(), xgAgainst = Decimal.zero();
  let xgN = 0, oddsN = 0;
  for (const row of rows) {
    const home = row.home_team_id === team;
    const gf = home ? row.home_score : row.away_score;
    const ga = home ? row.away_score : row.home_score;
    if (gf > ga) won++; else if (gf === ga) drawn++; else lost++;
    goalsFor = goalsFor.add(gf);
    goalsAgainst = goalsAgainst.add(ga);
    if (gf + ga >= 3) over25++;
    if (gf > 0 && ga > 0) btts++;
    if (ga === 0) cleanSheets++;
    if (gf === 0) failedToScore++;
    if (present(row.xg_home) && present(row.xg_away)) {
      xgN++;
      xgFor = xgFor.add(home ? row.xg_home : row.xg_away);
      xgAgainst = xgAgainst.add(home ? row.xg_away : row.xg_home);
    }
    if (present(row.odd_home) && present(row.odd_draw) && present(row.odd_away)) oddsN++;
  }
  const n = rows.length;
  return {
    n,
    won, drawn, lost,
    goals_for: goalsFor.toString(0), goals_against: goalsAgainst.toString(0),
    goals_for_avg: average(goalsFor, n), goals_against_avg: average(goalsAgainst, n),
    over25_rate: ratio(over25, n), btts_rate: ratio(btts, n),
    clean_sheet_rate: ratio(cleanSheets, n), failed_to_score_rate: ratio(failedToScore, n),
    percent: {won: percent(won, n), drawn: percent(drawn, n), lost: percent(lost, n), over25: percent(over25, n), btts: percent(btts, n),
      clean_sheet: percent(cleanSheets, n), failed_to_score: percent(failedToScore, n)},
    // Most recent first, from the team's side: the form strip of the page.
    form: rows.map(row => {
      const home = row.home_team_id === team;
      return {match_id: row.internal_match_id, venue: home ? 'home' : 'away',
        result: outcomeOf(home ? row.home_score : row.away_score, home ? row.away_score : row.home_score)};
    }),
    xg_for_avg: average(xgFor, xgN), xg_against_avg: average(xgAgainst, xgN),
    coverage: {result: ratio(n, n), xg: ratio(xgN, n), odds_1x2: ratio(oddsN, n), xg_n: xgN, odds_1x2_n: oddsN},
    source_match_ids: rows.map(row => row.internal_match_id),
    first_date: n ? rows[n - 1].match_date : null,
    last_date: n ? rows[0].match_date : null,
  };
}

const calendar = value => value instanceof Date
  ? `${String(value.getFullYear()).padStart(4, '0')}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
  : value;
const normalizeRows = rows => rows.map(row => ({...row, match_date: calendar(row.match_date)}));

async function teamAnalysis(client, team, cutoff, seasonId) {
  const venues = {};
  for (const venue of VENUES) {
    const recent = normalizeRows((await client.query(recentSql(venue), [team, cutoff])).rows);
    const season = normalizeRows((await client.query(seasonSql(venue), [team, cutoff, seasonId])).rows);
    const windows = {};
    for (const window of WINDOWS) windows[window] = windowStats(team, window === 'season' ? season : recent.slice(0, window));
    // Full rows of the widest windows, so the page can show every source row without another request.
    const rows = new Map([...recent, ...season].map(row => [row.internal_match_id, row]));
    venues[venue] = {windows, rows: [...rows.values()]};
  }
  return venues;
}

export async function matchAnalysis(client, input = {}) {
  const id = matchIdOf(input.id);
  const match = (await client.query(MATCH_SQL, [id])).rows[0];
  // An unknown match still says where the answer comes from (PR #176 review NB-6).
  if (!match) return {match: null, reason: 'MATCH_NOT_FOUND', provenance: {source: 'database', upstream_calls: 0, facts_version: FACTS_VERSION}};
  const cutoff = match.match_date;
  const teams = {};
  for (const [side, team] of [['home', match.home_team_id], ['away', match.away_team_id]]) {
    teams[side] = team ? {team_id: team, venues: await teamAnalysis(client, team, cutoff, match.season_id)} : null;
  }
  const h2h = match.home_team_id && match.away_team_id
    ? normalizeRows((await client.query(H2H_SQL, [match.home_team_id, match.away_team_id, cutoff])).rows)
    : [];
  return {
    match,
    teams,
    head_to_head: {n: h2h.length, rows: h2h},
    method: {
      analysis_version: ANALYSIS_VERSION,
      windows: WINDOWS,
      venues: VENUES,
      cutoff_before: cutoff,
      rule: 'FINAL historical matches dated strictly before the match day; same-day matches excluded (provider time zone undocumented)',
      pit: 'PIT_NOT_VERIFIED',
      pit_reason: 'current fact versions with a date cutoff; acquisition time not checked',
      rounding: {policy: ROUNDING_POLICY_VERSION, mode: 'HALF_EVEN', average_places: AVERAGE_PLACES, rate_places: RATE_PLACES, percent_places: PERCENT_PLACES},
    },
    provenance: {source: 'database', source_provider: match.source_provider ?? null, upstream_calls: 0, facts_version: FACTS_VERSION},
  };
}
