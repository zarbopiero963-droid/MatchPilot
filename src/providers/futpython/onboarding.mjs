import { gunzipSync } from 'node:zlib';
import { EMPTY_TOKENS } from './schema.mjs';
import { inspectDatasetCsv } from './integrity.mjs';
import { matchKey } from './identity.mjs';
import { sha256 } from './store.mjs';
import { buildTeamEntities, nameKind, normalizeTeamName } from './teams.mjs';
import { seasonShape, startYear } from './seasons.mjs';
import { isCurrentSeason } from './catalog.mjs';

// #12 "Nuovi campionati e nuove stagioni": the steps a dataset passes before it reaches production.
export const ONBOARDING_STEPS = [
  'DISCOVERED', 'CANDIDATE', 'METADATA_FETCHED', 'SEASONS_ENUMERATED', 'BACKFILLED',
  'SCHEMA_AUDITED', 'COVERAGE_AUDITED', 'HARD_VERIFIED', 'ACTIVE'
];

// Fields without which a match cannot be identified, placed on the calendar or linked to its teams.
export const IDENTITY_FIELDS = ['Date', 'Home', 'Away'];

const KEY_RE = /^[a-z0-9-]+\/[a-z0-9-]+\/20\d{2}(?:-20\d{2})?$/;

function stepIndex(state) {
  return ONBOARDING_STEPS.indexOf(state);
}

// Season window: a calendar season covers its year, a split season both years; one year of slack each side.
export function seasonWindow(season) {
  const start = startYear(season);
  if (start == null) return null;
  const end = seasonShape(season) === 'split' ? start + 1 : start;
  return {from: `${start - 1}-01-01`, to: `${end + 1}-12-31`};
}

// Pure evaluation of the step checks. Returns the highest step whose checks, and every earlier step's checks, pass.
export function evaluateSteps(f) {
  const checks = {};
  const fail = (step, waiting, blocked = null) => ({state: ONBOARDING_STEPS[stepIndex(step) - 1], waiting_for: waiting,
    blocked: blocked != null, blocked_reason: blocked, checks});

  checks.candidate = {in_catalog: f.in_catalog === true, key_valid: KEY_RE.test(f.dataset_key || ''),
    route_valid: f.route === `/api/download/${f.dataset_key}`};
  if (!checks.candidate.in_catalog) return fail('CANDIDATE', 'catalog', 'not_in_active_catalog');
  if (!checks.candidate.key_valid || !checks.candidate.route_valid) return fail('CANDIDATE', 'catalog', 'invalid_catalog_entry');

  checks.metadata = {internal_competition_id: f.internal_competition_id || null, season_shape: seasonShape(f.season),
    start_year: startYear(f.season), dataset_state: f.has_state === true};
  if (!f.internal_competition_id || checks.metadata.season_shape === 'other' || !f.has_state) {
    return fail('METADATA_FETCHED', 'metadata', checks.metadata.season_shape === 'other' ? 'unknown_season_shape' : null);
  }

  checks.seasons = {league_seasons: f.league_seasons || [], seasons_without_state: Number(f.seasons_without_state || 0),
    year_gaps: f.year_gaps || []};
  if (!checks.seasons.league_seasons.includes(f.season) || checks.seasons.seasons_without_state > 0) {
    return fail('SEASONS_ENUMERATED', 'season_enumeration');
  }

  checks.backfill = {availability: f.availability || null, snapshot_id: f.last_snapshot_id ?? null,
    ingest_complete: f.ingest_complete === true, snapshot_rows: f.snapshot_rows ?? null};
  if (f.availability === 'unavailable_404') return fail('BACKFILLED', 'provider_data', 'unavailable_404');
  if (f.last_snapshot_id == null || f.ingest_complete !== true || f.availability !== 'available') {
    return fail('BACKFILLED', 'backfill');
  }

  checks.schema = {fields: (f.headers || []).length, unregistered: f.unregistered_fields || [],
    unclassified: f.unclassified_fields || []};
  if (!checks.schema.fields) return fail('SCHEMA_AUDITED', 'schema', 'no_headers');
  if (checks.schema.unregistered.length || checks.schema.unclassified.length) {
    return fail('SCHEMA_AUDITED', 'schema', 'fields_not_classified');
  }

  const coverage = f.coverage || {};
  const identity = Object.fromEntries(IDENTITY_FIELDS.map(name => [name, coverage[name]?.ratio ?? 0]));
  checks.coverage = {identity, fields_full: Object.values(coverage).filter(c => c.ratio === 1).length,
    fields_partial: Object.values(coverage).filter(c => c.ratio > 0 && c.ratio < 1).length,
    fields_empty: Object.values(coverage).filter(c => c.ratio === 0).length};
  if (IDENTITY_FIELDS.some(name => identity[name] !== 1)) return fail('COVERAGE_AUDITED', 'coverage', 'identity_coverage_below_100');

  const h = f.hard || {};
  checks.hard = {
    matches: Number(h.rows || 0),
    // Raw = DB: the stored CSV hashes to its sha256, parses to its row count, and every row (key + payload hash)
    // exists as a match version of this dataset, whichever snapshot first wrote it.
    reconciled: h.hash_ok === true && Number(h.parser_rows) === Number(f.snapshot_rows ?? -1)
      && Number(h.stored_rows) === Number(h.rows),
    hash_ok: h.hash_ok === true,
    stored_rows: Number(h.stored_rows || 0),
    no_date: Number(h.no_date || 0),
    out_of_season: Number(h.out_of_season || 0),
    unresolved_teams: Number(h.unresolved_teams || 0),
    duplicate_keys: Number(h.duplicate_keys || 0)
  };
  if (checks.hard.matches === 0) return fail('HARD_VERIFIED', 'hard_verification', 'no_matches');
  if (!checks.hard.reconciled) return fail('HARD_VERIFIED', 'hard_verification', 'raw_db_mismatch');
  if (checks.hard.no_date || checks.hard.out_of_season) return fail('HARD_VERIFIED', 'hard_verification', 'dates_outside_season');
  if (checks.hard.unresolved_teams) return fail('HARD_VERIFIED', 'hard_verification', 'unresolved_teams');
  if (checks.hard.duplicate_keys) return fail('HARD_VERIFIED', 'hard_verification', 'duplicate_match_keys');

  return {state: 'HARD_VERIFIED', waiting_for: null, blocked: false, blocked_reason: null, checks};
}

async function logEvent(client, row) {
  await client.query(
    `INSERT INTO fpt_onboarding_events(dataset_key, from_state, to_state, actor, reason, checks, run_id)
     VALUES($1,$2,$3,$4,$5,$6::jsonb,$7)`,
    [row.dataset_key, row.from_state, row.to_state, row.actor, row.reason || null,
      JSON.stringify(row.checks || {}), row.run_id || null]
  );
}

// Called with the datasets the catalog lists for the first time. Before any baseline exists (a fresh database),
// the first import is the baseline itself and is certified as a whole by the FutPython certificate.
export async function registerDiscovered(client, entries, {runId = null} = {}) {
  if (!entries?.length) return {registered: 0, baseline: false};
  const any = await client.query('SELECT 1 FROM fpt_onboarding LIMIT 1');
  const baseline = any.rowCount === 0;
  const active = await client.query(
    `SELECT DISTINCT country_slug, league_slug FROM fpt_onboarding WHERE state = 'ACTIVE'`);
  const activeLeagues = new Set(active.rows.map(r => `${r.country_slug}/${r.league_slug}`));
  let registered = 0;
  for (const e of entries) {
    const kind = baseline ? 'baseline' : activeLeagues.has(`${e.countrySlug}/${e.leagueSlug}`) ? 'new_season' : 'new_league';
    const promotion = baseline ? 'baseline' : kind === 'new_season' ? 'auto' : 'owner';
    const state = baseline ? 'ACTIVE' : 'DISCOVERED';
    const inserted = await client.query(
      `INSERT INTO fpt_onboarding(dataset_key, country_slug, league_slug, season, kind, promotion, state, waiting_for,
         evidence, discovered_run_id, verified_at, activated_at, activated_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,
         CASE WHEN $7 = 'ACTIVE' THEN now() END, CASE WHEN $7 = 'ACTIVE' THEN now() END,
         CASE WHEN $7 = 'ACTIVE' THEN 'bootstrap' END)
       ON CONFLICT (dataset_key) DO NOTHING`,
      [e.datasetKey, e.countrySlug, e.leagueSlug, e.season, kind, promotion, state, baseline ? null : 'candidate',
        JSON.stringify(baseline ? {baseline: 'first import on an empty database'} : {route: e.route}), runId]
    );
    if (!inserted.rowCount) continue;
    registered++;
    await logEvent(client, {dataset_key: e.datasetKey, from_state: null, to_state: state,
      actor: baseline ? 'bootstrap' : 'sync:discovery', reason: kind, run_id: runId});
  }
  return {registered, baseline};
}

// Past seasons of a league being onboarded are fetched by the normal incremental run as backfill traffic
// (deferred first under budget pressure). Current seasons are already incremental targets.
export async function onboardingTargets(client, {limit = 10, now = new Date()} = {}) {
  const result = await client.query(
    `SELECT o.dataset_key, c.country_slug, c.league_slug, c.season, c.route
     FROM fpt_onboarding o
     JOIN fpt_catalog c USING (dataset_key)
     LEFT JOIN fpt_dataset_state s USING (dataset_key)
     WHERE o.state <> 'ACTIVE' AND c.active
       AND s.last_snapshot_id IS NULL
       AND COALESCE(s.availability, 'unknown') <> 'unavailable_404'
     ORDER BY o.discovered_at, o.dataset_key`
  );
  return result.rows
    .filter(r => !isCurrentSeason(r.season, now))
    .slice(0, limit)
    .map(r => ({datasetKey: r.dataset_key, countrySlug: r.country_slug, leagueSlug: r.league_slug,
      season: r.season, route: r.route, onboarding: true}));
}

// Additive team identity for a dataset being onboarded: a new spelling joins the one team of its country with the
// same normalized name; an unseen name becomes a new team. Existing teams and ids are never rewritten.
export async function ensureTeamIdentity(client, datasetKey) {
  const spellings = (await client.query(
    `SELECT country_slug, league_slug AS competition_slug, name,
            min(match_date) AS first_seen, max(match_date) AS last_seen, count(*)::int AS seen
     FROM (
       SELECT country_slug, league_slug, home AS name, match_date FROM fpt_match_versions
       WHERE dataset_key = $1 AND phase = 'HISTORICAL' AND home IS NOT NULL AND btrim(home) <> ''
       UNION ALL
       SELECT country_slug, league_slug, away AS name, match_date FROM fpt_match_versions
       WHERE dataset_key = $1 AND phase = 'HISTORICAL' AND away IS NOT NULL AND btrim(away) <> ''
     ) n GROUP BY 1, 2, 3`, [datasetKey])).rows;
  if (!spellings.length) return {aliases: 0, teams: 0};
  const country = spellings[0].country_slug;
  const known = (await client.query(
    `SELECT a.name, a.normalized_name, a.internal_team_id
     FROM fpt_team_aliases a JOIN fpt_teams t USING (internal_team_id)
     WHERE t.country_slug = $1`, [country])).rows;
  const byName = new Set(known.map(r => r.name));
  const byNormalized = new Map();
  for (const r of known) {
    if (!byNormalized.has(r.normalized_name)) byNormalized.set(r.normalized_name, new Set());
    byNormalized.get(r.normalized_name).add(r.internal_team_id);
  }
  const provenance = {source_provider: 'futpythontrader', built_from: 'fpt_match_versions.home/away',
    normalization: 'nfkd-alnum-casefold', added_by: 'onboarding', dataset_key: datasetKey};
  let aliases = 0;
  const fresh = [];
  for (const s of spellings) {
    if (byName.has(s.name)) continue;
    const normalized = normalizeTeamName(s.name);
    const owners = byNormalized.get(normalized);
    if (owners?.size === 1) {
      const res = await client.query(
        `INSERT INTO fpt_team_aliases(internal_team_id, name, normalized_name, kind, first_seen, last_seen, provenance)
         VALUES($1,$2,$3,$4,$5,$6,$7::jsonb) ON CONFLICT (internal_team_id, name) DO NOTHING`,
        [[...owners][0], s.name, normalized, nameKind(s.name), s.first_seen, s.last_seen, JSON.stringify(provenance)]);
      aliases += res.rowCount;
    } else if (!owners) {
      fresh.push(s);
    }
    // Two or more teams already share that normalized name: left unresolved, hard verification reports it.
  }
  let teams = 0;
  for (const team of buildTeamEntities(fresh)) {
    const res = await client.query(
      `INSERT INTO fpt_teams(internal_team_id, country_slug, competition_slug, competitions, canonical_name,
         provider_team_id, abbreviations, first_seen, last_seen, provenance)
       VALUES($1,$2,$3,$4::jsonb,$5,$6,$7::jsonb,$8,$9,$10::jsonb) ON CONFLICT DO NOTHING`,
      [team.internal_team_id, team.country_slug, team.competition_slug, JSON.stringify(team.competitions),
        team.canonical_name, team.provider_team_id, JSON.stringify(team.abbreviations), team.first_seen, team.last_seen,
        JSON.stringify({...team.provenance, ...provenance})]);
    if (!res.rowCount) continue;
    teams++;
    for (const alias of team.aliases) {
      const a = await client.query(
        `INSERT INTO fpt_team_aliases(internal_team_id, name, normalized_name, kind, first_seen, last_seen, provenance)
         VALUES($1,$2,$3,$4,$5,$6,$7::jsonb) ON CONFLICT (internal_team_id, name) DO NOTHING`,
        [team.internal_team_id, alias.name, alias.normalized_name, alias.kind, alias.first_seen, alias.last_seen,
          JSON.stringify(provenance)]);
      aliases += a.rowCount;
    }
  }
  return {aliases, teams};
}

const FACTS_SQL = `SELECT o.dataset_key, o.country_slug, o.league_slug, o.season, o.state, o.kind, o.promotion,
    c.active AS in_catalog, c.route,
    'fpt:competition:' || md5(o.country_slug || '|' || o.league_slug) AS internal_competition_id,
    s.dataset_key IS NOT NULL AS has_state, s.availability, s.last_snapshot_id,
    r.ingest_complete, r.row_count AS snapshot_rows, r.headers,
    (SELECT jsonb_agg(c2.season ORDER BY c2.season) FROM fpt_catalog c2
      WHERE c2.country_slug = o.country_slug AND c2.league_slug = o.league_slug AND c2.active) AS league_seasons,
    (SELECT count(*)::int FROM fpt_catalog c2 LEFT JOIN fpt_dataset_state s2 USING (dataset_key)
      WHERE c2.country_slug = o.country_slug AND c2.league_slug = o.league_slug AND c2.active
        AND s2.dataset_key IS NULL) AS seasons_without_state
  FROM fpt_onboarding o
  LEFT JOIN fpt_catalog c USING (dataset_key)
  LEFT JOIN fpt_dataset_state s USING (dataset_key)
  LEFT JOIN fpt_raw_snapshots r ON r.snapshot_id = s.last_snapshot_id
  WHERE o.state <> 'ACTIVE'
  ORDER BY o.discovered_at, o.dataset_key`;

function yearGaps(seasons = []) {
  const years = [...new Set(seasons.map(startYear).filter(y => y != null))].sort((a, b) => a - b);
  const gaps = [];
  for (let i = 1; i < years.length; i++) for (let y = years[i - 1] + 1; y < years[i]; y++) gaps.push(y);
  return gaps;
}

async function datasetFacts(client, row) {
  const f = {...row, league_seasons: row.league_seasons || [], year_gaps: yearGaps(row.league_seasons || []),
    headers: row.headers || []};
  if (row.last_snapshot_id == null) return f;
  const schema = (await client.query(
    `SELECT h AS field, sf.family FROM jsonb_array_elements_text($1::jsonb) h
     LEFT JOIN fpt_schema_fields sf ON sf.field_name = h`, [JSON.stringify(f.headers)])).rows;
  f.unregistered_fields = schema.filter(r => r.family == null).map(r => r.field);
  f.unclassified_fields = schema.filter(r => r.family === 'unclassified').map(r => r.field);
  const coverage = (await client.query(
    `SELECT h AS field, count(*)::int AS rows,
            count(*) FILTER (WHERE lower(btrim(COALESCE(v.payload->>h, ''))) <> ALL($2::text[]))::int AS nonempty
     FROM fpt_match_versions v CROSS JOIN jsonb_array_elements_text($3::jsonb) h
     WHERE v.snapshot_id = $1 GROUP BY h`, [row.last_snapshot_id, EMPTY_TOKENS, JSON.stringify(f.headers)])).rows;
  f.coverage = Object.fromEntries(coverage.map(c => [c.field, {rows: c.rows, nonempty: c.nonempty,
    ratio: c.rows ? Number((c.nonempty / c.rows).toFixed(4)) : 0}]));
  return f;
}

// Hard verification reads the latest raw snapshot itself and checks the stored versions of exactly its rows.
async function hardFacts(client, row) {
  const snap = (await client.query(
    'SELECT sha256, payload_gzip FROM fpt_raw_snapshots WHERE snapshot_id = $1', [row.last_snapshot_id])).rows[0];
  if (!snap) return {rows: 0};
  const text = gunzipSync(snap.payload_gzip).toString('utf8');
  const inspected = inspectDatasetCsv(text, row.dataset_key);
  const pairs = new Map();
  for (const r of inspected.rows) pairs.set(`${matchKey(r, row.dataset_key)}|${sha256(JSON.stringify(r))}`, r);
  const keys = [...pairs.keys()].map(k => k.slice(0, k.lastIndexOf('|')));
  const hashes = [...pairs.keys()].map(k => k.slice(k.lastIndexOf('|') + 1));
  const window = seasonWindow(row.season);
  const res = await client.query(
    `WITH p AS (SELECT * FROM unnest($1::text[], $2::text[]) AS p(match_key, payload_sha256)),
     v AS (
       SELECT DISTINCT ON (v.match_key) v.match_key, v.match_date, v.home, v.away
       FROM fpt_match_versions v JOIN p USING (match_key, payload_sha256)
       WHERE v.dataset_key = $3
       ORDER BY v.match_key, v.acquired_at DESC, v.version_id DESC
     ),
     names AS (
       SELECT a.name, count(DISTINCT a.internal_team_id) AS n
       FROM fpt_team_aliases a JOIN fpt_teams t USING (internal_team_id)
       WHERE t.country_slug = $4 GROUP BY a.name
     )
     SELECT (SELECT count(*)::int FROM fpt_match_versions v JOIN p USING (match_key, payload_sha256)
               WHERE v.dataset_key = $3) AS stored_rows,
            count(*) FILTER (WHERE v.match_date IS NULL)::int AS no_date,
            count(*) FILTER (WHERE v.match_date < $5::date OR v.match_date > $6::date)::int AS out_of_season,
            count(*) FILTER (WHERE COALESCE(h.n, 0) <> 1 OR COALESCE(a.n, 0) <> 1)::int AS unresolved_teams
     FROM v LEFT JOIN names h ON h.name = v.home LEFT JOIN names a ON a.name = v.away`,
    [keys, hashes, row.dataset_key, row.country_slug, window?.from || '1900-01-01', window?.to || '1900-01-01']);
  return {...res.rows[0], rows: pairs.size, parser_rows: inspected.parser_rows,
    hash_ok: sha256(text) === snap.sha256, duplicate_keys: inspected.duplicate_match_keys};
}

// Re-evaluates every dataset not yet ACTIVE. A season of an already active league is promoted automatically once
// HARD_VERIFIED; a new league waits for the owner (promoteLeague). Returns what changed, for the run log and alerts.
export async function advanceOnboarding(client, {runId = null} = {}) {
  const pending = (await client.query(FACTS_SQL)).rows;
  const summary = {pending: pending.length, changed: [], activated: [], awaitingOwner: [], blocked: [], identity: []};
  for (const row of pending) {
    const f = await datasetFacts(client, row);
    let result = evaluateSteps(f);
    if (result.state === 'COVERAGE_AUDITED') {
      // Every audit before hard verification passed: link the teams, then run the hard checks on the stored rows.
      summary.identity.push({datasetKey: row.dataset_key, ...(await ensureTeamIdentity(client, row.dataset_key))});
      f.hard = await hardFacts(client, row);
      result = evaluateSteps(f);
    }
    let next = result.state;
    let actor = 'sync:onboarding';
    if (next === 'HARD_VERIFIED' && row.promotion === 'auto') {
      next = 'ACTIVE';
      actor = 'auto:new_season_of_active_league';
    }
    const waiting = next === 'HARD_VERIFIED' ? 'owner_promotion' : next === 'ACTIVE' ? null : result.waiting_for;
    await client.query(
      `UPDATE fpt_onboarding SET state = $2, waiting_for = $3, blocked = $4, blocked_reason = $5, checks = $6::jsonb,
         verified_at = CASE WHEN $2 IN ('HARD_VERIFIED','ACTIVE') THEN COALESCE(verified_at, now()) ELSE NULL END,
         activated_at = CASE WHEN $2 = 'ACTIVE' THEN now() ELSE NULL END,
         activated_by = CASE WHEN $2 = 'ACTIVE' THEN $7 ELSE NULL END,
         updated_at = now()
       WHERE dataset_key = $1`,
      [row.dataset_key, next, waiting, result.blocked, result.blocked_reason, JSON.stringify(result.checks), actor]);
    if (next !== row.state) {
      await logEvent(client, {dataset_key: row.dataset_key, from_state: row.state, to_state: next, actor,
        reason: result.blocked_reason || waiting, checks: result.checks, run_id: runId});
      summary.changed.push({datasetKey: row.dataset_key, from: row.state, to: next});
    }
    if (next === 'ACTIVE') summary.activated.push(row.dataset_key);
    if (next === 'HARD_VERIFIED') summary.awaitingOwner.push(row.dataset_key);
    if (result.blocked) summary.blocked.push({datasetKey: row.dataset_key, reason: result.blocked_reason});
  }
  return summary;
}

// Owner promotion of a new league: every season with data must be HARD_VERIFIED. Seasons the provider does not
// serve (unavailable_404) stay out of production; they have no data to promote.
export async function promoteLeague(client, {country, league, actor, reason}) {
  if (!actor || !String(actor).trim()) throw new Error('promotion needs an actor');
  if (!reason || !String(reason).trim()) throw new Error('promotion needs a reason');
  const rows = (await client.query(
    `SELECT dataset_key, state, blocked_reason FROM fpt_onboarding
     WHERE country_slug = $1 AND league_slug = $2 AND state <> 'ACTIVE' ORDER BY dataset_key`, [country, league])).rows;
  if (!rows.length) throw new Error(`no pending onboarding rows for ${country}/${league}`);
  const notReady = rows.filter(r => r.state !== 'HARD_VERIFIED' && r.blocked_reason !== 'unavailable_404');
  if (notReady.length) {
    const error = new Error(`league not ready: ${notReady.map(r => `${r.dataset_key}=${r.state}`).join(', ')}`);
    error.code = 'ONBOARDING_NOT_READY';
    throw error;
  }
  const ready = rows.filter(r => r.state === 'HARD_VERIFIED');
  if (!ready.length) throw new Error(`no HARD_VERIFIED season for ${country}/${league}`);
  for (const r of ready) {
    await client.query(
      `UPDATE fpt_onboarding SET state = 'ACTIVE', waiting_for = NULL, activated_at = now(), activated_by = $2,
         updated_at = now() WHERE dataset_key = $1 AND state = 'HARD_VERIFIED'`,
      [r.dataset_key, `owner:${actor}`]);
    await logEvent(client, {dataset_key: r.dataset_key, from_state: 'HARD_VERIFIED', to_state: 'ACTIVE',
      actor: `owner:${actor}`, reason});
  }
  return {promoted: ready.map(r => r.dataset_key), leftOut: rows.filter(r => r.state !== 'HARD_VERIFIED').map(r => r.dataset_key)};
}
