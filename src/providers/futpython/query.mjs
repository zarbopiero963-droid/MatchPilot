// Normalized query layer. Every answer comes from Neon tables already written by the mirror.
// This module never imports the provider client and never calls FutPythonTrader.
import { normalizeTeamName } from './teams.mjs';

export const FACTS_VERSION = 'fpt-facts-2';
export const FILTERS_VERSION = 'fpt-filters-2';

const FACT_COLUMNS = `internal_match_id, internal_competition_id, season_id, country_slug, league_slug, season,
  match_date, kickoff_local_time, kickoff_utc, kickoff_tz_status, home_team_id, away_team_id, home_name, away_name,
  provider_match_id, home_score, away_score, result_status, phase, dataset_key, version_id, snapshot_id,
  odd_home, odd_draw, odd_away, odd_over25, odd_under25, odd_btts_yes, favorite_side, favorite_odd,
  xg_home, xg_away, total_goals`;

const TEAM_VENUE_SQL = {
  both: '(home_team_id = $1 OR away_team_id = $1)',
  home: 'home_team_id = $1',
  away: 'away_team_id = $1'
};

function teamMatchesSql(venue) {
  return `SELECT ${FACT_COLUMNS}
      FROM fpt_match_facts
      WHERE ${TEAM_VENUE_SQL[venue]}
        AND phase = 'HISTORICAL'
        AND match_date < $2::date
      ORDER BY match_date DESC, internal_match_id
      LIMIT $3`;
}

export const QUERIES = {
  teamSearch: {
    sql: `SELECT t.internal_team_id, t.canonical_name, t.country_slug, t.competitions
      FROM fpt_team_aliases a
      JOIN fpt_teams t USING (internal_team_id)
      WHERE a.normalized_name = $1
      GROUP BY t.internal_team_id, t.canonical_name, t.country_slug, t.competitions
      ORDER BY t.country_slug, t.canonical_name
      LIMIT 20`,
    params: ['normalized_name']
  },
  teamMatches: {
    sql: teamMatchesSql('both'),
    params: ['team_id', 'before', 'limit', 'venue']
  },
  teamSummary: {
    sql: `SELECT count(*)::int AS played,
        count(*) FILTER (WHERE (home_team_id = $1 AND home_score > away_score) OR (away_team_id = $1 AND away_score > home_score))::int AS won,
        count(*) FILTER (WHERE home_score = away_score)::int AS drawn,
        count(*) FILTER (WHERE (home_team_id = $1 AND home_score < away_score) OR (away_team_id = $1 AND away_score < home_score))::int AS lost,
        COALESCE(sum(CASE WHEN home_team_id = $1 THEN home_score ELSE away_score END), 0)::int AS goals_for,
        COALESCE(sum(CASE WHEN home_team_id = $1 THEN away_score ELSE home_score END), 0)::int AS goals_against,
        min(match_date) AS first_match, max(match_date) AS last_match
      FROM fpt_match_facts
      WHERE (home_team_id = $1 OR away_team_id = $1)
        AND result_status = 'FINAL'
        AND match_date < $2::date
        AND ($3::text IS NULL OR season_id = $3)`,
    params: ['team_id', 'before', 'season_id']
  },
  headToHead: {
    sql: `SELECT ${FACT_COLUMNS}
      FROM fpt_match_facts
      WHERE ((home_team_id = $1 AND away_team_id = $2) OR (home_team_id = $2 AND away_team_id = $1))
        AND phase = 'HISTORICAL'
        AND match_date < $3::date
      ORDER BY match_date DESC, internal_match_id
      LIMIT $4`,
    params: ['team_id', 'opponent_id', 'before', 'limit']
  },
  competitionSeason: {
    sql: `SELECT ${FACT_COLUMNS}
      FROM fpt_match_facts
      WHERE internal_competition_id = $1 AND season_id = $2
      ORDER BY match_date, kickoff_local_time, internal_match_id
      LIMIT $3`,
    params: ['competition_id', 'season_id', 'limit']
  },
  matchesOnDate: {
    sql: `SELECT ${FACT_COLUMNS}
      FROM fpt_match_facts
      WHERE match_date = $1::date
      ORDER BY kickoff_local_time, internal_match_id
      LIMIT $2`,
    params: ['date', 'limit']
  },
  matchDetail: {
    sql: `SELECT f.internal_match_id, f.internal_competition_id, f.season_id, f.country_slug, f.league_slug, f.season,
        f.match_date, f.kickoff_local_time, f.kickoff_utc, f.kickoff_tz_status, f.home_team_id, f.away_team_id,
        f.home_name, f.away_name, f.provider_match_id, f.home_score, f.away_score, f.result_status, f.phase,
        f.dataset_key, f.version_id, f.snapshot_id, f.acquired_at, f.source_provider, f.parser_version,
        f.schema_version, f.transform_version, f.facts_version, v.payload
      FROM fpt_match_facts f
      JOIN fpt_match_versions v ON v.version_id = f.version_id
      WHERE f.internal_match_id = $1`,
    params: ['match_id']
  },
  competitions: {
    sql: `SELECT internal_competition_id, country_slug, league_slug,
        count(*)::int AS seasons,
        count(*) FILTER (WHERE coverage_status = 'AVAILABLE')::int AS available_seasons,
        min(season) FILTER (WHERE match_count > 0) AS earliest_season,
        max(season) FILTER (WHERE match_count > 0) AS latest_season,
        sum(match_count)::bigint AS matches
      FROM fpt_competition_season
      GROUP BY internal_competition_id, country_slug, league_slug
      ORDER BY country_slug, league_slug`,
    params: []
  },
  xgByTeamSeason: {
    sql: `SELECT season_id, season,
        count(*)::int AS matches,
        count(*) FILTER (WHERE xg_home IS NOT NULL AND xg_away IS NOT NULL)::int AS matches_with_xg,
        round(avg(CASE WHEN home_team_id = $1 THEN xg_home ELSE xg_away END), 3) AS xg_for_avg,
        round(avg(CASE WHEN home_team_id = $1 THEN xg_away ELSE xg_home END), 3) AS xg_against_avg,
        round(sum(CASE WHEN home_team_id = $1 THEN xg_home ELSE xg_away END), 3) AS xg_for_total,
        sum(CASE WHEN home_team_id = $1 THEN home_score ELSE away_score END)::int AS goals_for,
        sum(CASE WHEN home_team_id = $1 THEN away_score ELSE home_score END)::int AS goals_against
      FROM fpt_match_facts
      WHERE (home_team_id = $1 OR away_team_id = $1)
        AND result_status = 'FINAL'
        AND match_date < $2::date
      GROUP BY season_id, season
      ORDER BY season`,
    params: ['team_id', 'before']
  },
  xgByCompetitionSeason: {
    sql: `SELECT season_id, season,
        count(*)::int AS matches,
        count(*) FILTER (WHERE xg_home IS NOT NULL AND xg_away IS NOT NULL)::int AS matches_with_xg,
        round(avg(xg_home), 3) AS xg_home_avg,
        round(avg(xg_away), 3) AS xg_away_avg,
        round(avg(xg_home + xg_away), 3) AS xg_total_avg,
        round(avg(total_goals), 3) AS goals_avg
      FROM fpt_match_facts
      WHERE internal_competition_id = $1
        AND result_status = 'FINAL'
        AND match_date < $2::date
      GROUP BY season_id, season
      ORDER BY season`,
    params: ['competition_id', 'before']
  },
  // Point-in-time: for each candidate match, the version acquired at or before as_of.
  // A match first acquired after as_of has no such version and is not returned.
  teamMatchesAsOf: {
    sql: `WITH candidates AS MATERIALIZED (
        SELECT internal_match_id, match_key, internal_competition_id, season_id, match_date,
          home_team_id, away_team_id, home_name, away_name
        FROM fpt_match_facts
        WHERE (home_team_id = $1 OR away_team_id = $1)
          AND phase = 'HISTORICAL'
          AND match_date < $3::date
      )
      SELECT f.internal_match_id, f.internal_competition_id, f.season_id, f.match_date, f.home_team_id, f.away_team_id,
        f.home_name, f.away_name, pit.version_id, pit.acquired_at,
        fpt_score_int(pit.payload->>'Home_Score') AS home_score,
        fpt_score_int(pit.payload->>'Away_Score') AS away_score,
        fpt_price(pit.payload->>'Odd_1_FT') AS odd_home,
        fpt_price(pit.payload->>'Odd_2_FT') AS odd_away
      FROM candidates f
      CROSS JOIN LATERAL (
        SELECT v.version_id, v.acquired_at, v.payload
        FROM fpt_match_versions v
        WHERE v.match_key = f.match_key AND v.acquired_at <= $2::timestamptz
        ORDER BY v.acquired_at DESC, v.version_id DESC
        LIMIT 1
      ) pit
      ORDER BY f.match_date DESC, f.internal_match_id
      LIMIT $4`,
    params: ['team_id', 'as_of', 'before', 'limit']
  },
  leagueFieldCoverage: {
    sql: `SELECT cs.internal_competition_id, cs.country_slug, cs.league_slug, cs.season, cs.season_id_key AS dataset_key,
        cs.match_count, cs.coverage_status, c.rows_scoped, c.nonempty_rows, c.coverage_ratio
      FROM (
        SELECT internal_competition_id, country_slug, league_slug, season, dataset_key AS season_id_key, match_count, coverage_status
        FROM fpt_competition_season
        WHERE ($2::text IS NULL OR internal_competition_id = $2)
      ) cs
      LEFT JOIN fpt_field_coverage c
        ON c.dimension = 'dataset' AND c.field_name = $1 AND c.dimension_key = cs.season_id_key
      ORDER BY cs.country_slug, cs.league_slug, cs.season
      LIMIT $3`,
    params: ['field', 'competition_id', 'limit']
  },
  // "Complete" seasons do not exist (no expected match count from the provider): seasons are counted as AVAILABLE.
  leaguesWithCoverage: {
    sql: `SELECT cs.internal_competition_id, cs.country_slug, cs.league_slug,
        count(*) FILTER (WHERE cs.coverage_status = 'AVAILABLE')::int AS available_seasons,
        count(*) FILTER (WHERE cs.coverage_status = 'AVAILABLE' AND c.coverage_ratio >= $2)::int AS seasons_meeting_coverage,
        round(avg(c.coverage_ratio) FILTER (WHERE cs.coverage_status = 'AVAILABLE'), 4) AS avg_coverage_ratio,
        sum(cs.match_count) FILTER (WHERE cs.coverage_status = 'AVAILABLE')::bigint AS matches
      FROM fpt_competition_season cs
      LEFT JOIN fpt_field_coverage c
        ON c.dimension = 'dataset' AND c.field_name = $1 AND c.dimension_key = cs.dataset_key
      GROUP BY cs.internal_competition_id, cs.country_slug, cs.league_slug
      HAVING count(*) FILTER (WHERE cs.coverage_status = 'AVAILABLE' AND c.coverage_ratio >= $2) >= $3
      ORDER BY seasons_meeting_coverage DESC, cs.country_slug, cs.league_slug
      LIMIT $4`,
    params: ['field', 'min_ratio', 'min_seasons', 'limit']
  },
  onboarding: {
    // #12 "Quali nuove leghe sono state scoperte ma non ancora verificate?"
    sql: `SELECT country_slug, league_slug, kind, promotion,
        jsonb_agg(jsonb_build_object('dataset_key', dataset_key, 'season', season, 'state', state,
          'waiting_for', waiting_for, 'blocked', blocked, 'blocked_reason', blocked_reason) ORDER BY season) AS seasons,
        min(discovered_at) AS discovered_at,
        bool_and(state = 'HARD_VERIFIED' OR blocked_reason = 'unavailable_404')
          AND bool_or(state = 'HARD_VERIFIED') AS ready_for_owner
      FROM fpt_onboarding
      WHERE state <> 'ACTIVE'
      GROUP BY country_slug, league_slug, kind, promotion
      ORDER BY min(discovered_at), country_slug, league_slug
      LIMIT $1`,
    params: ['limit']
  },
  filters: {
    sql: `SELECT field_name, normalized_field, family, data_type, filterable, operators, timing_class,
        prematch_safe, missing_tokens, zero_is_missing, rows_scoped, nonempty_rows, coverage_ratio, registry_version,
        source, fact_column, indexed, index_names, first_seen, last_seen, phases
      FROM fpt_filter_registry
      ORDER BY family, field_name`,
    params: []
  }
};

const ID_PATTERNS = {
  team_id: /^fpt:team:[0-9a-f]{24}$/,
  opponent_id: /^fpt:team:[0-9a-f]{24}$/,
  competition_id: /^fpt:competition:[0-9a-f]{32}$/,
  season_id: /^fpt:season:[0-9a-f]{32}$/,
  match_id: /^fpt:(hash|id):[A-Za-z0-9_-]{1,64}$/
};

export class QueryInputError extends Error {
  constructor(message) {
    super(message);
    this.code = 'BAD_QUERY_INPUT';
  }
}

function isoDate(value, name) {
  const s = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(`${s}T00:00:00Z`))) {
    throw new QueryInputError(`${name} must be YYYY-MM-DD`);
  }
  return s;
}

function idOf(value, name, {optional = false} = {}) {
  if (optional && (value == null || value === '')) return null;
  const s = String(value ?? '').trim();
  if (!ID_PATTERNS[name].test(s)) throw new QueryInputError(`invalid ${name}`);
  return s;
}

function limitOf(value, fallback = 50) {
  if (value == null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 500) throw new QueryInputError('limit must be an integer between 1 and 500');
  return n;
}

function todayUtc(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function venueOf(value, fallback = 'both') {
  if (value == null || value === '') return fallback;
  const v = String(value).trim().toLowerCase();
  if (!Object.hasOwn(TEAM_VENUE_SQL, v)) throw new QueryInputError('venue must be home, away or both');
  return v;
}

function priceOf(value, name, {optional = false} = {}) {
  if (optional && (value == null || value === '')) return null;
  const n = Number(String(value ?? '').replace(',', '.'));
  if (!Number.isFinite(n) || n < 1.01 || n > 1000) throw new QueryInputError(`${name} must be a decimal price between 1.01 and 1000`);
  return n;
}

function intOf(value, name, {min = 0, max = 100, optional = false} = {}) {
  if (optional && (value == null || value === '')) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new QueryInputError(`${name} must be an integer between ${min} and ${max}`);
  return n;
}

function ratioOf(value, name) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1) throw new QueryInputError(`${name} must be between 0 and 1`);
  return n;
}

function fieldOf(value) {
  const s = String(value ?? '').trim();
  if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(s)) throw new QueryInputError('field must be a registry field name');
  return s;
}

function timestampOf(value, name) {
  const s = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(s) || Number.isNaN(Date.parse(s))) {
    throw new QueryInputError(`${name} must be an ISO-8601 timestamp with time zone`);
  }
  return new Date(s).toISOString();
}

// Whitelisted filters for searchMatches. Every value is bound as a parameter; no input reaches the SQL text.
export const SEARCH_FILTERS = {
  competition: {parse: v => idOf(v, 'competition_id'), sql: p => `internal_competition_id = ${p}`},
  season: {parse: v => idOf(v, 'season_id'), sql: p => `season_id = ${p}`},
  from: {parse: v => isoDate(v, 'from'), sql: p => `match_date >= ${p}::date`},
  fav_min: {parse: v => priceOf(v, 'fav_min'), sql: p => `favorite_odd >= ${p}`},
  fav_max: {parse: v => priceOf(v, 'fav_max'), sql: p => `favorite_odd <= ${p}`},
  fav_side: {parse: v => {
    const s = String(v).trim().toUpperCase();
    if (!['HOME', 'AWAY', 'EVEN'].includes(s)) throw new QueryInputError('fav_side must be HOME, AWAY or EVEN');
    return s;
  }, sql: p => `favorite_side = ${p}`},
  home_odd_min: {parse: v => priceOf(v, 'home_odd_min'), sql: p => `odd_home >= ${p}`},
  home_odd_max: {parse: v => priceOf(v, 'home_odd_max'), sql: p => `odd_home <= ${p}`},
  over25_min: {parse: v => priceOf(v, 'over25_min'), sql: p => `odd_over25 >= ${p}`},
  over25_max: {parse: v => priceOf(v, 'over25_max'), sql: p => `odd_over25 <= ${p}`},
  result: {parse: v => {
    const s = String(v).trim().toUpperCase();
    if (!['FINAL', 'NO_RESULT', 'NOT_STARTED'].includes(s)) throw new QueryInputError('result must be FINAL, NO_RESULT or NOT_STARTED');
    return s;
  }, sql: p => `result_status = ${p}`},
  min_goals: {parse: v => intOf(v, 'min_goals', {max: 30}), sql: p => `total_goals >= ${p}`},
  max_goals: {parse: v => intOf(v, 'max_goals', {max: 30}), sql: p => `total_goals <= ${p}`},
  min_xg_total: {parse: v => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > 20) throw new QueryInputError('min_xg_total must be between 0 and 20');
    return n;
  }, sql: p => `xg_home + xg_away >= ${p}`}
};

function buildSearch(name, input, {now}) {
  const values = [];
  const where = [];
  const applied = [];
  const bind = value => { values.push(value); return `$${values.length}`; };
  const phase = input.phase == null || input.phase === '' ? 'HISTORICAL' : String(input.phase).trim().toUpperCase();
  if (!['HISTORICAL', 'PREMATCH'].includes(phase)) throw new QueryInputError('phase must be HISTORICAL or PREMATCH');
  where.push(`phase = ${bind(phase)}`);
  const before = input.before ? isoDate(input.before, 'before') : todayUtc(now);
  where.push(`match_date < ${bind(before)}::date`);
  applied.push('before');
  if (input.team != null && input.team !== '') {
    const team = idOf(input.team, 'team_id');
    const venue = venueOf(input.venue);
    const p = bind(team);
    where.push(TEAM_VENUE_SQL[venue].replaceAll('$1', p));
    applied.push('team', `venue:${venue}`);
  } else if (input.venue != null && input.venue !== '') {
    throw new QueryInputError('venue needs team');
  }
  for (const [key, filter] of Object.entries(SEARCH_FILTERS)) {
    if (input[key] == null || input[key] === '') continue;
    where.push(filter.sql(bind(filter.parse(input[key]))));
    applied.push(key);
  }
  if (input.fav_min != null && input.fav_max != null && Number(input.fav_min) > Number(input.fav_max)) {
    throw new QueryInputError('fav_min must not exceed fav_max');
  }
  const limit = bind(limitOf(input.limit, 50));
  return {
    name,
    sql: `SELECT ${FACT_COLUMNS}
      FROM fpt_match_facts
      WHERE ${where.join('\n        AND ')}
      ORDER BY match_date DESC, internal_match_id
      LIMIT ${limit}`,
    values,
    filters_applied: applied,
    cutoff_before: before
  };
}

// The history of a team is always strictly before the cut-off date, so a pre-match view of a
// match on day D never sees D or later. The default cut-off is today in UTC.
export function buildQuery(name, input = {}, {now = new Date()} = {}) {
  const before = () => (input.before ? isoDate(input.before, 'before') : todayUtc(now));
  switch (name) {
    case 'teamSearch': {
      const normalized = normalizeTeamName(input.q);
      if (!normalized) throw new QueryInputError('q is required');
      return {name, sql: QUERIES.teamSearch.sql, values: [normalized]};
    }
    case 'teamMatches': {
      const venue = venueOf(input.venue);
      return {name, sql: teamMatchesSql(venue), values: [idOf(input.team, 'team_id'), before(), limitOf(input.limit)], venue};
    }
    case 'awayMatches':
      return {name, sql: teamMatchesSql('away'), values: [idOf(input.team, 'team_id'), before(), limitOf(input.limit, 20)], venue: 'away'};
    case 'favoriteOddsRange': {
      if (input.min == null || input.max == null) throw new QueryInputError('min and max are required');
      const q = buildSearch(name, {
        competition: input.competition, season: input.season, before: input.before, limit: input.limit,
        fav_min: input.min, fav_max: input.max, fav_side: input.side && String(input.side).toLowerCase() !== 'any' ? input.side : undefined
      }, {now});
      return q;
    }
    case 'searchMatches':
      return buildSearch(name, input, {now});
    case 'xgBySeason': {
      const hasTeam = input.team != null && input.team !== '';
      const hasCompetition = input.competition != null && input.competition !== '';
      if (hasTeam === hasCompetition) throw new QueryInputError('pass exactly one of team or competition');
      return hasTeam
        ? {name, sql: QUERIES.xgByTeamSeason.sql, values: [idOf(input.team, 'team_id'), before()], scope: 'team'}
        : {name, sql: QUERIES.xgByCompetitionSeason.sql, values: [idOf(input.competition, 'competition_id'), before()], scope: 'competition'};
    }
    case 'teamMatchesAsOf':
      return {name, sql: QUERIES.teamMatchesAsOf.sql, values: [
        idOf(input.team, 'team_id'), timestampOf(input.as_of, 'as_of'), before(), limitOf(input.limit, 20)
      ]};
    case 'leagueFieldCoverage':
      return {name, sql: QUERIES.leagueFieldCoverage.sql, values: [
        fieldOf(input.field), idOf(input.competition, 'competition_id', {optional: true}), limitOf(input.limit, 200)
      ]};
    case 'leaguesWithCoverage':
      return {name, sql: QUERIES.leaguesWithCoverage.sql, values: [
        fieldOf(input.field), ratioOf(input.min_ratio ?? 0.9, 'min_ratio'), intOf(input.min_seasons ?? 1, 'min_seasons', {min: 1, max: 100}),
        limitOf(input.limit, 200)
      ]};
    case 'catalog':
      return {name, sql: null, values: []};
    case 'teamSummary':
      return {name, sql: QUERIES.teamSummary.sql, values: [
        idOf(input.team, 'team_id'), before(), idOf(input.season, 'season_id', {optional: true})
      ]};
    case 'headToHead':
      return {name, sql: QUERIES.headToHead.sql, values: [
        idOf(input.team, 'team_id'), idOf(input.opponent, 'opponent_id'), before(), limitOf(input.limit, 20)
      ]};
    case 'competitionSeason':
      return {name, sql: QUERIES.competitionSeason.sql, values: [
        idOf(input.competition, 'competition_id'), idOf(input.season, 'season_id'), limitOf(input.limit, 500)
      ]};
    case 'matchesOnDate':
      return {name, sql: QUERIES.matchesOnDate.sql, values: [isoDate(input.date, 'date'), limitOf(input.limit, 200)]};
    case 'matchDetail':
      return {name, sql: QUERIES.matchDetail.sql, values: [idOf(input.id, 'match_id')]};
    case 'competitions':
      return {name, sql: QUERIES.competitions.sql, values: []};
    case 'filters':
      return {name, sql: QUERIES.filters.sql, values: []};
    case 'onboarding':
      return {name, sql: QUERIES.onboarding.sql, values: [limitOf(input.limit, 200)]};
    default:
      throw new QueryInputError(`unknown query ${name}`);
  }
}

// Market zeros in the payload are provider placeholders ("N/D"), not prices.
export function presentPayload(payload, registryRows) {
  const byField = new Map((registryRows || []).map(row => [row.field_name, row]));
  const out = {};
  for (const [field, raw] of Object.entries(payload || {})) {
    const meta = byField.get(field);
    const s = String(raw ?? '').trim();
    const empty = (meta?.missing_tokens || ['', 'null', 'undefined', 'nan', 'na', 'n/a', '-']).includes(s.toLowerCase());
    const zeroMissing = meta?.zero_is_missing === true && /^-?0+(?:[.,]0+)?$/.test(s);
    out[field] = {
      value: empty || zeroMissing ? null : raw,
      status: empty || zeroMissing ? 'N/D' : 'OK',
      timing_class: meta?.timing_class || null,
      prematch_safe: meta ? meta.prematch_safe === true : null
    };
  }
  return out;
}

export const ROUTES = {
  '/api/fpt/teams': 'teamSearch',
  '/api/fpt/team-matches': 'teamMatches',
  '/api/fpt/team-summary': 'teamSummary',
  '/api/fpt/h2h': 'headToHead',
  '/api/fpt/competition-season': 'competitionSeason',
  '/api/fpt/matches': 'matchesOnDate',
  '/api/fpt/match': 'matchDetail',
  '/api/fpt/competitions': 'competitions',
  '/api/fpt/filters': 'filters',
  '/api/fpt/onboarding': 'onboarding',
  '/api/fpt/away-matches': 'awayMatches',
  '/api/fpt/odds-range': 'favoriteOddsRange',
  '/api/fpt/search': 'searchMatches',
  '/api/fpt/xg-by-season': 'xgBySeason',
  '/api/fpt/team-matches-asof': 'teamMatchesAsOf',
  '/api/fpt/league-field-coverage': 'leagueFieldCoverage',
  '/api/fpt/leagues-with-coverage': 'leaguesWithCoverage',
  '/api/fpt/catalog': 'catalog'
};

// Machine-readable description of every query, for MatchPilot Copilot (#44) and other DB-only callers.
export const QUERY_CATALOG = [
  {name: 'teamSearch', route: '/api/fpt/teams', question: 'Quale squadra è "Ajax"?', params: {q: 'testo, obbligatorio'}},
  {name: 'teamMatches', route: '/api/fpt/team-matches', question: 'Ultime N partite di una squadra (casa, trasferta o entrambe)',
    params: {team: 'fpt:team:…', venue: 'home|away|both (default both)', before: 'YYYY-MM-DD, esclusa', limit: '1–500'}},
  {name: 'awayMatches', route: '/api/fpt/away-matches', question: 'Ultime 20 trasferte di una squadra',
    params: {team: 'fpt:team:…', before: 'YYYY-MM-DD, esclusa', limit: 'default 20'}},
  {name: 'favoriteOddsRange', route: '/api/fpt/odds-range', question: 'Partite con favorito quotato tra 1.50 e 1.90',
    params: {min: 'quota ≥ 1.01', max: 'quota', side: 'home|away|any', competition: 'opzionale', season: 'opzionale', before: 'YYYY-MM-DD', limit: '1–500'}},
  {name: 'searchMatches', route: '/api/fpt/search', question: 'Ricerca con filtri combinati (AND)',
    params: {team: 'opzionale', venue: 'con team', ...Object.fromEntries(Object.keys(SEARCH_FILTERS).map(k => [k, 'opzionale'])), phase: 'HISTORICAL|PREMATCH', before: 'YYYY-MM-DD', limit: '1–500'}},
  {name: 'xgBySeason', route: '/api/fpt/xg-by-season', question: 'xG per stagione di una squadra o di una competizione',
    params: {team: 'oppure competition', competition: 'oppure team', before: 'YYYY-MM-DD'}},
  {name: 'teamMatchesAsOf', route: '/api/fpt/team-matches-asof', question: 'Cosa sapeva MatchPilot di una squadra al timestamp T',
    params: {team: 'fpt:team:…', as_of: 'ISO-8601 con fuso', before: 'YYYY-MM-DD', limit: '1–500'}},
  {name: 'leagueFieldCoverage', route: '/api/fpt/league-field-coverage', question: 'Coverage di un campo per lega e stagione',
    params: {field: 'nome campo registry', competition: 'opzionale', limit: '1–500'}},
  {name: 'leaguesWithCoverage', route: '/api/fpt/leagues-with-coverage', question: 'Leghe con almeno N stagioni con coverage sufficiente',
    params: {field: 'nome campo registry', min_ratio: '0–1, default 0.9', min_seasons: 'default 1', limit: '1–500'}},
  {name: 'teamSummary', route: '/api/fpt/team-summary', question: 'Bilancio V-N-P e gol di una squadra', params: {team: 'fpt:team:…', before: 'YYYY-MM-DD', season: 'opzionale'}},
  {name: 'headToHead', route: '/api/fpt/h2h', question: 'Scontri diretti', params: {team: 'fpt:team:…', opponent: 'fpt:team:…', before: 'YYYY-MM-DD'}},
  {name: 'competitionSeason', route: '/api/fpt/competition-season', question: 'Partite di una stagione', params: {competition: 'fpt:competition:…', season: 'fpt:season:…'}},
  {name: 'matchesOnDate', route: '/api/fpt/matches', question: 'Partite di un giorno', params: {date: 'YYYY-MM-DD'}},
  {name: 'matchDetail', route: '/api/fpt/match', question: 'Dettaglio partita con payload e timing di ogni campo', params: {id: 'fpt:hash:… | fpt:id:…'}},
  {name: 'competitions', route: '/api/fpt/competitions', question: 'Elenco competizioni e stagioni', params: {}},
  {name: 'filters', route: '/api/fpt/filters', question: 'Registry dei campi filtrabili', params: {}},
  {name: 'onboarding', route: '/api/fpt/onboarding', question: 'Nuove leghe/stagioni scoperte ma non ancora in produzione',
    params: {limit: '1–500'}}
].map(entry => ({
  ...entry,
  rules: [
    'risposte solo da Neon, nessuna chiamata a FutPythonTrader',
    'storico strettamente prima di before (default: oggi UTC)',
    'campi POSTMATCH_OUTCOME non sono input pre-match della partita analizzata',
    'quota 0 o placeholder = N/D, mai un prezzo'
  ]
}));

export async function runQuery(client, name, input = {}, opts = {}) {
  const q = buildQuery(name, input, opts);
  const started = Date.now();
  const result = q.sql ? await client.query(q.sql, q.values) : {rows: QUERY_CATALOG};
  let rows = result.rows;
  if (name === 'matchDetail' && rows[0]) {
    const registry = await client.query(QUERIES.filters.sql);
    rows = [{...rows[0], payload: presentPayload(rows[0].payload, registry.rows)}];
  }
  return {
    query: name,
    rows,
    row_count: rows.length,
    provenance: {
      source: 'neon',
      source_provider: 'futpythontrader',
      upstream_calls: 0,
      facts_version: FACTS_VERSION,
      filters_version: FILTERS_VERSION,
      cutoff_before: q.cutoff_before
        ?? (['teamMatches', 'awayMatches', 'teamSummary', 'xgBySeason'].includes(name) ? q.values[1]
          : name === 'headToHead' || name === 'teamMatchesAsOf' ? q.values[2] : null),
      as_of: name === 'teamMatchesAsOf' ? q.values[1] : null,
      filters_applied: q.filters_applied || null,
      venue: q.venue || null,
      scope: q.scope || null,
      elapsed_ms: Date.now() - started
    }
  };
}

function walkPlan(node, visit) {
  if (!node) return;
  visit(node);
  for (const child of node.Plans || []) walkPlan(child, visit);
}

const LARGE_TABLES = new Set(['fpt_match_facts', 'fpt_match_versions', 'fpt_raw_snapshots']);

export const PERF_LIMITS = {maxExecutionMs: 250, maxRowsScanned: 20000};

export function summarizePlan(explainJson, limits = PERF_LIMITS) {
  const top = Array.isArray(explainJson) ? explainJson[0] : explainJson;
  const plan = top?.Plan;
  const scans = [];
  let rowsScanned = 0;
  walkPlan(plan, node => {
    const type = node['Node Type'] || '';
    if (/Scan/.test(type) && type !== 'Function Scan') {
      const loops = Number(node['Actual Loops'] || 1);
      const rows = (Number(node['Actual Rows'] || 0) + Number(node['Rows Removed by Filter'] || 0)
        + Number(node['Rows Removed by Index Recheck'] || 0)) * loops;
      if (type !== 'Bitmap Index Scan') rowsScanned += rows;
      scans.push({type, relation: node['Relation Name'] || null, index: node['Index Name'] || null, rows});
    }
  });
  const seqOnLarge = scans.filter(scan => scan.type === 'Seq Scan' && LARGE_TABLES.has(scan.relation));
  const executionMs = Number(top?.['Execution Time'] ?? NaN);
  const planningMs = Number(top?.['Planning Time'] ?? NaN);
  const indexes = [...new Set(scans.map(scan => scan.index).filter(Boolean))];
  return {
    execution_ms: executionMs,
    planning_ms: planningMs,
    rows_scanned: rowsScanned,
    indexes,
    scans,
    seq_scan_on_large_table: seqOnLarge.map(scan => scan.relation),
    pass: Number.isFinite(executionMs)
      && executionMs <= limits.maxExecutionMs
      && rowsScanned <= limits.maxRowsScanned
      && seqOnLarge.length === 0
  };
}

export async function perfSamples(client) {
  const sample = await client.query(`WITH team AS (
      SELECT home_team_id AS team_id, count(*) AS n FROM fpt_match_facts
      WHERE home_team_id IS NOT NULL AND phase = 'HISTORICAL'
      GROUP BY 1 ORDER BY n DESC, 1 LIMIT 1
    ), opp AS (
      SELECT f.away_team_id AS opponent_id, count(*) AS n FROM fpt_match_facts f JOIN team ON f.home_team_id = team.team_id
      WHERE f.away_team_id IS NOT NULL GROUP BY 1 ORDER BY n DESC, 1 LIMIT 1
    ), cs AS (
      SELECT internal_competition_id, season_id, count(*) AS n FROM fpt_match_facts
      WHERE season_id IS NOT NULL GROUP BY 1, 2 ORDER BY n DESC, 1, 2 LIMIT 1
    ), d AS (
      SELECT match_date, count(*) AS n FROM fpt_match_facts WHERE match_date IS NOT NULL
      GROUP BY 1 ORDER BY n DESC, 1 LIMIT 1
    ), m AS (
      SELECT f.internal_match_id FROM fpt_match_facts f JOIN team ON f.home_team_id = team.team_id
      ORDER BY f.match_date DESC, f.internal_match_id LIMIT 1
    ), name AS (
      SELECT a.normalized_name FROM fpt_team_aliases a JOIN team ON a.internal_team_id = team.team_id
      ORDER BY a.normalized_name LIMIT 1
    ), xteam AS (
      SELECT home_team_id AS team_id, internal_competition_id, count(*) AS n FROM fpt_match_facts
      WHERE xg_home IS NOT NULL AND home_team_id IS NOT NULL
      GROUP BY 1, 2 ORDER BY n DESC, 1 LIMIT 1
    ), xseason AS (
      SELECT f.season_id, count(*) AS n FROM fpt_match_facts f JOIN xteam ON f.home_team_id = xteam.team_id
        AND f.internal_competition_id = xteam.internal_competition_id
      WHERE f.season_id IS NOT NULL GROUP BY 1 ORDER BY n DESC, 1 LIMIT 1
    )
    SELECT team.team_id, opp.opponent_id, cs.internal_competition_id, cs.season_id,
      to_char(d.match_date, 'YYYY-MM-DD') AS match_date, m.internal_match_id, name.normalized_name,
      xteam.team_id AS xg_team_id, xteam.internal_competition_id AS xg_competition_id, xseason.season_id AS xg_season_id
    FROM team
    LEFT JOIN opp ON true LEFT JOIN cs ON true LEFT JOIN d ON true LEFT JOIN m ON true LEFT JOIN name ON true
    LEFT JOIN xteam ON true LEFT JOIN xseason ON true`);
  return sample.rows[0] || null;
}

export const ASSISTANT_PERF_QUERIES = ['awayMatches', 'favoriteOddsRange', 'xgBySeason', 'searchMatches', 'teamMatchesAsOf',
  'leagueFieldCoverage', 'leaguesWithCoverage'];

export function perfInputs(sample, {before = '2100-01-01', asOf = new Date().toISOString()} = {}) {
  if (!sample) return [];
  return [
    ['awayMatches', {team: sample.team_id, before, limit: 20}],
    ['favoriteOddsRange', {min: 1.5, max: 1.9, side: 'any', before, limit: 50}],
    ['xgBySeason', {team: sample.xg_team_id, before}],
    ['xgBySeason', {competition: sample.xg_competition_id, before}],
    ['searchMatches', {competition: sample.xg_competition_id, season: sample.xg_season_id, team: sample.xg_team_id, venue: 'home',
      fav_min: 1.01, fav_max: 10, result: 'FINAL', before, limit: 50}],
    ['teamMatchesAsOf', {team: sample.team_id, as_of: asOf, before, limit: 20}],
    ['leagueFieldCoverage', {field: 'xG_Home_FT', competition: sample.xg_competition_id, limit: 200}],
    ['leaguesWithCoverage', {field: 'xG_Home_FT', min_ratio: 0.9, min_seasons: 2, limit: 200}],
    ['teamSearch', {q: sample.normalized_name}],
    ['teamMatches', {team: sample.team_id, before, limit: 50}],
    ['teamSummary', {team: sample.team_id, before}],
    ['headToHead', {team: sample.team_id, opponent: sample.opponent_id, before, limit: 20}],
    ['competitionSeason', {competition: sample.internal_competition_id, season: sample.season_id, limit: 500}],
    ['matchesOnDate', {date: sample.match_date, limit: 200}],
    ['matchDetail', {id: sample.internal_match_id}]
  ];
}

export async function runPerfGate(client, limits = PERF_LIMITS) {
  const sample = await perfSamples(client);
  const results = [];
  const inputs = perfInputs(sample);
  for (const [name, input] of inputs) {
    let q;
    try {
      q = buildQuery(name, input);
    } catch (error) {
      // A sample the data cannot provide (for example no xG anywhere) fails the gate; it never aborts the report.
      results.push({query: name, input, pass: false, error: String(error?.message || error), indexes: [], scans: [],
        seq_scan_on_large_table: [], execution_ms: null, planning_ms: null, rows_scanned: null});
      continue;
    }
    // Warm run so the gate measures the plan, not a cold Neon cache.
    await client.query(q.sql, q.values);
    const explained = await client.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${q.sql}`, q.values);
    const plan = explained.rows[0]['QUERY PLAN'];
    results.push({query: name, input, filters_applied: q.filters_applied || null, ...summarizePlan(plan, limits)});
  }
  const assistantCovered = ASSISTANT_PERF_QUERIES.every(name => results.some(row => row.query === name));
  const combined = results.find(row => row.query === 'searchMatches');
  return {
    limits,
    sample_found: Boolean(sample),
    queries: results,
    combined_filter_count: combined?.filters_applied?.length || 0,
    gate: Boolean(sample) && results.length === inputs.length && inputs.length >= 15 && assistantCovered
      && Number(combined?.filters_applied?.length || 0) >= 5
      && results.every(row => row.pass)
  };
}

// Database-only refresh of the normalized layer after new versions or fields land.
export async function refreshNormalizedLayer(client) {
  const filters = await client.query('SELECT fpt_refresh_filter_registry() AS n');
  const facts = await client.query('SELECT fpt_refresh_match_facts() AS n');
  return {filters: Number(filters.rows[0].n), facts: Number(facts.rows[0].n)};
}
