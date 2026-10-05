// Normalized query layer. Every answer comes from Neon tables already written by the mirror.
// This module never imports the provider client and never calls FutPythonTrader.
import { normalizeTeamName } from './teams.mjs';

export const FACTS_VERSION = 'fpt-facts-1';
export const FILTERS_VERSION = 'fpt-filters-1';

const FACT_COLUMNS = `internal_match_id, internal_competition_id, season_id, country_slug, league_slug, season,
  match_date, kickoff_local_time, kickoff_utc, kickoff_tz_status, home_team_id, away_team_id, home_name, away_name,
  provider_match_id, home_score, away_score, result_status, phase, dataset_key, version_id, snapshot_id`;

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
    sql: `SELECT ${FACT_COLUMNS}
      FROM fpt_match_facts
      WHERE (home_team_id = $1 OR away_team_id = $1)
        AND phase = 'HISTORICAL'
        AND match_date < $2::date
      ORDER BY match_date DESC, internal_match_id
      LIMIT $3`,
    params: ['team_id', 'before', 'limit']
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
  filters: {
    sql: `SELECT field_name, normalized_field, family, data_type, filterable, operators, timing_class,
        prematch_safe, missing_tokens, zero_is_missing, rows_scoped, nonempty_rows, coverage_ratio, registry_version
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
    case 'teamMatches':
      return {name, sql: QUERIES.teamMatches.sql, values: [idOf(input.team, 'team_id'), before(), limitOf(input.limit)]};
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
  '/api/fpt/filters': 'filters'
};

export async function runQuery(client, name, input = {}, opts = {}) {
  const q = buildQuery(name, input, opts);
  const started = Date.now();
  const result = await client.query(q.sql, q.values);
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
      cutoff_before: ['teamMatches', 'teamSummary', 'headToHead'].includes(name) ? q.values[name === 'headToHead' ? 2 : 1] : null,
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
    )
    SELECT team.team_id, opp.opponent_id, cs.internal_competition_id, cs.season_id,
      to_char(d.match_date, 'YYYY-MM-DD') AS match_date, m.internal_match_id, name.normalized_name
    FROM team
    LEFT JOIN opp ON true LEFT JOIN cs ON true LEFT JOIN d ON true LEFT JOIN m ON true LEFT JOIN name ON true`);
  return sample.rows[0] || null;
}

export function perfInputs(sample, {before = '2100-01-01'} = {}) {
  if (!sample) return [];
  return [
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
  for (const [name, input] of perfInputs(sample)) {
    const q = buildQuery(name, input);
    // Warm run so the gate measures the plan, not a cold Neon cache.
    await client.query(q.sql, q.values);
    const explained = await client.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${q.sql}`, q.values);
    const plan = explained.rows[0]['QUERY PLAN'];
    results.push({query: name, ...summarizePlan(plan, limits)});
  }
  return {
    limits,
    sample_found: Boolean(sample),
    queries: results,
    gate: Boolean(sample) && results.length === 7 && results.every(row => row.pass)
  };
}

// Database-only refresh of the normalized layer after new versions or fields land.
export async function refreshNormalizedLayer(client) {
  const filters = await client.query('SELECT fpt_refresh_filter_registry() AS n');
  const facts = await client.query('SELECT fpt_refresh_match_facts() AS n');
  return {filters: Number(filters.rows[0].n), facts: Number(facts.rows[0].n)};
}
