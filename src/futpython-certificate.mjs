// FPT-PR-09 final certificate. The report is read from Neon only: no FutPythonTrader call, no writes.
import { gunzipSync } from 'node:zlib';
import { withClient } from './db.mjs';
import { getFutpythonCertificationStatus } from './futpython-certification.mjs';
import { inspectDatasetCsv } from './providers/futpython/integrity.mjs';
import { sha256 } from './providers/futpython/store.mjs';
import { LINEAGE_VERSIONS } from './providers/futpython/schema.mjs';
import { DATA_CONTRACT } from './providers/futpython/seasons.mjs';
import { budgetConfig } from './providers/futpython/budget.mjs';
import { FACTS_VERSION, FILTERS_VERSION, ROUTES, perfSamples, runPerfGate, runQuery } from './providers/futpython/query.mjs';

export const CERTIFICATE_VERSION = 'fpt-cert-1';
export const VERDICTS = ['CERTIFIED', 'CERTIFIED WITH KNOWN LIMITATIONS', 'NOT CERTIFIED'];

// Incremental runs certified in FPT-PR-07 (PR #42).
export const INCREMENTAL_RUNS = ['fpt-1791157076578-4231ba2e', 'fpt-1791157259618-a37a60a5'];

const num = value => (value == null ? 0 : Number(value));

async function one(client, sql, values = []) {
  return (await client.query(sql, values)).rows[0] || {};
}

async function all(client, sql, values = []) {
  return (await client.query(sql, values)).rows;
}

export function sweepTotals(results) {
  const totals = {
    snapshots: results.length,
    hash_mismatch: 0,
    malformed_csv: 0,
    header_row_mismatch: 0,
    empty_payload: 0,
    today_empty_snapshots: 0,
    parser_vs_row_count_mismatch: 0,
    dataset_row_count_vs_db_mismatch: 0,
    duplicate_match_keys_in_snapshot: 0,
    missing_home: 0,
    missing_away: 0,
    missing_date: 0,
    date_parse_failures: 0,
    parser_rows: 0,
    stored_row_count: 0,
    db_rows: 0
  };
  for (const r of results) {
    if (!r.hash_ok) totals.hash_mismatch++;
    totals.malformed_csv += r.malformed_csv;
    totals.header_row_mismatch += r.header_row_mismatch;
    // An empty jogos-do-dia feed is a real provider state (no fixtures published yet), not a lost dataset.
    if (r.empty_payload && r.source_kind === 'dataset') totals.empty_payload++;
    if (r.empty_payload && r.source_kind !== 'dataset') totals.today_empty_snapshots++;
    if (r.parser_rows !== r.row_count) totals.parser_vs_row_count_mismatch++;
    if (r.source_kind === 'dataset' && r.row_count !== r.db_rows) totals.dataset_row_count_vs_db_mismatch++;
    totals.duplicate_match_keys_in_snapshot += r.duplicate_match_keys;
    totals.missing_home += r.missing_home;
    totals.missing_away += r.missing_away;
    totals.missing_date += r.missing_date;
    totals.date_parse_failures += r.date_parse_failures;
    totals.parser_rows += r.parser_rows;
    totals.stored_row_count += r.row_count;
    totals.db_rows += r.db_rows;
  }
  return totals;
}

export function rawSweepGate(totals, failures = []) {
  return totals.snapshots > 0
    && failures.length === 0
    && totals.hash_mismatch === 0
    && totals.malformed_csv === 0
    && totals.header_row_mismatch === 0
    && totals.empty_payload === 0
    && totals.parser_vs_row_count_mismatch === 0
    && totals.dataset_row_count_vs_db_mismatch === 0
    && totals.duplicate_match_keys_in_snapshot === 0
    && totals.missing_home === 0
    && totals.missing_away === 0
    && totals.missing_date === 0
    && totals.date_parse_failures === 0;
}

// Re-reads every stored gzip, one at a time, and compares hash, parser rows, stored row_count and DB rows.
export async function fullRawSweep(client) {
  const dbRows = new Map((await all(client,
    `SELECT snapshot_id, count(*)::int AS n FROM fpt_match_versions GROUP BY snapshot_id`
  )).map(row => [Number(row.snapshot_id), row.n]));
  const snapshots = await all(client,
    `SELECT snapshot_id, dataset_key, source_kind, sha256, row_count, ingest_complete
     FROM fpt_raw_snapshots ORDER BY snapshot_id`);
  const results = [];
  const failures = [];
  for (const snap of snapshots) {
    const id = Number(snap.snapshot_id);
    try {
      const payload = await one(client, 'SELECT payload_gzip FROM fpt_raw_snapshots WHERE snapshot_id=$1', [id]);
      const text = gunzipSync(payload.payload_gzip).toString('utf8');
      const inspected = inspectDatasetCsv(text, snap.dataset_key);
      results.push({
        snapshot_id: id,
        dataset_key: snap.dataset_key,
        source_kind: snap.source_kind,
        ingest_complete: snap.ingest_complete,
        hash_ok: sha256(text) === snap.sha256,
        row_count: snap.row_count,
        parser_rows: inspected.parser_rows,
        db_rows: dbRows.get(id) || 0,
        headers: inspected.headers.length,
        malformed_csv: inspected.malformed_csv,
        header_row_mismatch: inspected.header_row_mismatch,
        empty_payload: inspected.parser_rows === 0,
        duplicate_match_keys: inspected.duplicate_match_keys,
        missing_home: inspected.missing_home,
        missing_away: inspected.missing_away,
        missing_date: inspected.missing_date,
        date_parse_failures: inspected.date_parse_failures
      });
    } catch (error) {
      failures.push({snapshot_id: id, dataset_key: snap.dataset_key, error: String(error?.message || error).slice(0, 200)});
    }
  }
  const totals = sweepTotals(results);
  const today = results.filter(r => r.source_kind === 'today')
    .map(r => ({snapshot_id: r.snapshot_id, dataset_key: r.dataset_key, row_count: r.row_count, db_rows: r.db_rows}));
  return {totals, today, failures, gate: rawSweepGate(totals, failures)};
}

function phase1Gate(status) {
  const latest = new Map();
  for (const row of status.phase1_checks || []) if (!latest.has(row.check_code)) latest.set(row.check_code, row.status);
  const checks = [...latest.values()];
  return checks.length >= 6 && checks.every(s => s === 'pass')
    && status.datasets.unknown === 0
    && status.datasets.undefined_states === 0
    && status.datasets.duplicate_catalog_keys === 0;
}

export function catalogGate(c) {
  return c.catalog_total > 0
    && c.classified_total === c.catalog_total
    && c.unclassified === 0
    && c.duplicate_catalog_keys === 0
    && c.classification_sum === c.catalog_total;
}

// The new ledger fields must be proven by real requests written after migration 014, not only by tests.
export function ledgerGate(l) {
  return l.api_key_paths === 0
    && l.unknown_outcomes === 0
    && l.rows_without_endpoint_family === 0
    && l.config.perDay > 0
    && Number(l.rows_after_014) > 0
    && Number(l.rows_after_014_upstream) > 0
    && Number(l.rows_after_014_missing_fields) === 0;
}

export function incrementalGate(runs) {
  if (runs.length < 2) return false;
  return runs.every(r => r.status === 'complete'
    && r.mode === 'incremental'
    && r.dataset_upstream === 0
    && r.cache_hit > 0);
}

export function factsGate(f) {
  return f.facts_rows > 0
    && f.facts_rows === f.distinct_match_keys
    && f.facts_at_now === f.facts_rows
    && f.facts_at_now_repeat === f.facts_at_now
    && f.facts_stale === 0
    && f.historical_without_team_ids === 0
    && f.without_competition === f.today_rows
    && f.kickoff_utc_set === 0;
}

export function filtersGate(f) {
  return f.registry_rows > 0
    && f.registry_rows === f.schema_fields
    && f.unclassified_family === 0
    && f.timing_unset === 0
    && f.postmatch_marked_safe === 0
    && f.without_seen === 0
    && f.without_source === 0
    && f.without_phases === 0
    && f.indexed_fields > 0
    && f.indexed_inconsistent === 0;
}

export function entityGate(e) {
  return e.team_splits === 0
    && e.teams > 0
    && e.historical_unresolved_home === 0
    && e.historical_unresolved_away === 0
    && e.links_total === e.coded_international_teams;
}

export function lineageGate(l) {
  return l.versions_without_lineage === 0
    && l.facts_without_version === 0
    && l.facts_version_mismatch === 0
    && l.orphan_versions === 0;
}

export function verdictFor(gates, limitations) {
  const failed = Object.entries(gates).filter(([, ok]) => ok !== true).map(([name]) => name);
  if (failed.length) return {verdict: 'NOT CERTIFIED', failed_gates: failed};
  return {verdict: limitations.length ? 'CERTIFIED WITH KNOWN LIMITATIONS' : 'CERTIFIED', failed_gates: []};
}

async function catalogSection(client) {
  const row = await one(client, `SELECT
      (SELECT count(*)::int FROM fpt_catalog WHERE active) AS catalog_total,
      (SELECT count(DISTINCT country_slug)::int FROM fpt_catalog WHERE active) AS countries,
      (SELECT count(DISTINCT country_slug || '/' || league_slug)::int FROM fpt_catalog WHERE active) AS leagues,
      (SELECT count(*)::int FROM fpt_catalog c JOIN fpt_dataset_state s USING (dataset_key)
         WHERE c.active AND s.classification IS NOT NULL) AS classified_total,
      (SELECT count(*)::int FROM fpt_catalog c LEFT JOIN fpt_dataset_state s USING (dataset_key)
         WHERE c.active AND s.classification IS NULL) AS unclassified,
      (SELECT count(*)::int FROM (SELECT 1 FROM fpt_catalog WHERE active
         GROUP BY country_slug, league_slug, season HAVING count(*) > 1) d) AS duplicate_catalog_keys,
      (SELECT count(*)::int FROM fpt_catalog WHERE NOT active) AS inactive_rows`);
  const byClass = await all(client, `SELECT s.classification, count(*)::int AS n
    FROM fpt_catalog c JOIN fpt_dataset_state s USING (dataset_key)
    WHERE c.active GROUP BY 1 ORDER BY 1`);
  const byDisposition = await all(client, `SELECT COALESCE(s.http_disposition, '-') AS http_disposition, count(*)::int AS n
    FROM fpt_catalog c JOIN fpt_dataset_state s USING (dataset_key)
    WHERE c.active GROUP BY 1 ORDER BY 1`);
  const classification = Object.fromEntries(byClass.map(r => [r.classification, r.n]));
  const section = {
    ...row,
    classification: {
      AVAILABLE: classification.AVAILABLE || 0,
      UNAVAILABLE_404: classification.UNAVAILABLE_404 || 0,
      ERROR_REAL: classification.ERROR_REAL || 0,
      DEPRECATED: classification.DEPRECATED || 0,
      REMOVED: classification.REMOVED || 0,
      unknown: Object.entries(classification)
        .filter(([key]) => !['AVAILABLE', 'UNAVAILABLE_404', 'ERROR_REAL', 'DEPRECATED', 'REMOVED'].includes(key))
        .reduce((sum, [, n]) => sum + n, 0)
    },
    http_disposition: Object.fromEntries(byDisposition.map(r => [r.http_disposition, r.n]))
  };
  section.classification_sum = Object.values(section.classification).reduce((a, b) => a + b, 0);
  section.gate = catalogGate(section);
  return section;
}

async function dataSection(client) {
  const totals = await one(client, `SELECT
      (SELECT count(*)::int FROM fpt_raw_snapshots) AS snapshots,
      (SELECT count(*)::int FROM fpt_raw_snapshots WHERE source_kind='dataset') AS dataset_snapshots,
      (SELECT count(*)::int FROM fpt_raw_snapshots WHERE source_kind='today') AS today_snapshots,
      (SELECT count(*)::int FROM fpt_raw_snapshots WHERE NOT ingest_complete) AS incomplete_snapshots,
      (SELECT COALESCE(sum(row_count), 0)::bigint FROM fpt_raw_snapshots WHERE source_kind='dataset') AS dataset_rows,
      (SELECT count(*)::bigint FROM fpt_match_versions) AS versions,
      (SELECT count(*)::bigint FROM fpt_match_versions WHERE phase='HISTORICAL') AS historical_versions,
      (SELECT count(*)::bigint FROM fpt_match_versions WHERE phase<>'HISTORICAL') AS prematch_versions,
      (SELECT count(DISTINCT match_key)::bigint FROM fpt_match_versions) AS unique_matches,
      (SELECT to_char(min(match_date), 'YYYY-MM-DD') FROM fpt_match_versions WHERE phase='HISTORICAL') AS min_date,
      (SELECT to_char(max(match_date), 'YYYY-MM-DD') FROM fpt_match_versions WHERE phase='HISTORICAL') AS max_date`);
  const perDataset = await all(client, `SELECT v.dataset_key, count(*)::int AS versions, count(DISTINCT v.match_key)::int AS matches,
      to_char(min(v.match_date), 'YYYY-MM-DD') AS min_date, to_char(max(v.match_date), 'YYYY-MM-DD') AS max_date
    FROM fpt_match_versions v WHERE v.phase='HISTORICAL'
    GROUP BY v.dataset_key ORDER BY v.dataset_key`);
  const perLeague = await all(client, `SELECT country_slug || '/' || league_slug AS league, count(DISTINCT season)::int AS seasons,
      count(*)::int AS versions, count(DISTINCT match_key)::int AS matches,
      min(season) AS first_season, max(season) AS last_season
    FROM fpt_match_versions WHERE phase='HISTORICAL'
    GROUP BY 1 ORDER BY 1`);
  const perSeason = await all(client, `SELECT season, count(DISTINCT country_slug || '/' || league_slug)::int AS leagues,
      count(DISTINCT match_key)::int AS matches
    FROM fpt_match_versions WHERE phase='HISTORICAL'
    GROUP BY season ORDER BY season`);
  return {...totals, per_dataset: perDataset, per_league: perLeague, per_season: perSeason};
}

async function integritySection(client, status, sweep) {
  const dup = await one(client, `SELECT
      (SELECT count(*)::int FROM (SELECT 1 FROM fpt_raw_snapshots GROUP BY dataset_key, sha256 HAVING count(*) > 1) d) AS duplicate_snapshot_hashes,
      (SELECT count(*)::int FROM (SELECT 1 FROM fpt_match_versions GROUP BY match_key, payload_sha256 HAVING count(*) > 1) d) AS duplicate_versions,
      (SELECT count(*)::bigint FROM fpt_match_versions WHERE phase='HISTORICAL') AS historical_versions,
      (SELECT COALESCE(sum(row_count), 0)::bigint FROM fpt_raw_snapshots WHERE source_kind='dataset') AS dataset_rows`);
  const zeroLoss = sweep.totals.snapshots > 0 && sweep.totals.dataset_row_count_vs_db_mismatch === 0;
  const sql = status.phase3;
  return {
    ...dup,
    phase3: sql,
    raw_sweep: sweep,
    zero_loss: zeroLoss,
    gate: status.phase3.gate === true && sweep.gate && zeroLoss
      && dup.duplicate_snapshot_hashes === 0 && dup.duplicate_versions === 0
  };
}

async function coverageSection(client, status) {
  const classes = await all(client, `SELECT coverage_class, count(*)::int AS n FROM fpt_field_coverage
    WHERE dimension='global' GROUP BY 1 ORDER BY 1`);
  const tags = await all(client, `SELECT tag, count(*)::int AS n FROM fpt_field_coverage,
      jsonb_array_elements_text(coverage_tags) AS tag
    WHERE dimension='global' GROUP BY 1 ORDER BY 1`);
  const dims = await all(client, `SELECT dimension, count(*)::int AS n FROM fpt_field_coverage GROUP BY 1 ORDER BY 1`);
  const normalizedClasses = await all(client, `SELECT coverage_class, count(*)::int AS n FROM fpt_field_coverage
    WHERE dimension='normalized' GROUP BY 1 ORDER BY 1`);
  return {
    phase5: status.phase5,
    global_classes: Object.fromEntries(classes.map(r => [r.coverage_class, r.n])),
    normalized_classes: Object.fromEntries(normalizedClasses.map(r => [r.coverage_class, r.n])),
    global_tags: Object.fromEntries(tags.map(r => [r.tag, r.n])),
    rows_per_dimension: Object.fromEntries(dims.map(r => [r.dimension, r.n])),
    gate: status.phase5.gate === true
  };
}

async function seasonSection(client, status) {
  const range = await one(client, `SELECT min(season) FILTER (WHERE match_count > 0) AS earliest_season,
      max(season) FILTER (WHERE match_count > 0) AS latest_season,
      count(DISTINCT internal_competition_id)::int AS competitions,
      count(*)::int AS competition_seasons
    FROM fpt_competition_season`);
  const gaps = await all(client, `SELECT country_slug, league_slug, season, detector, in_catalog, missing_available
    FROM fpt_season_gaps ORDER BY 1, 2, 3`);
  const onboarding = await all(client, `SELECT coverage_status, count(*)::int AS n FROM fpt_competition_season GROUP BY 1 ORDER BY 1`);
  return {
    ...range,
    phase6: status.phase6,
    missing_available_seasons: num(status.phase6.missing_available_seasons),
    gaps,
    onboarding_status: Object.fromEntries(onboarding.map(r => [r.coverage_status, r.n])),
    gate: status.phase6.gate === true && num(status.phase6.missing_available_seasons) === 0
  };
}

async function factsSection(client) {
  const row = await one(client, `SELECT
      (SELECT count(*)::int FROM fpt_match_facts) AS facts_rows,
      (SELECT count(DISTINCT match_key)::int FROM fpt_match_versions) AS distinct_match_keys,
      (SELECT count(*)::int FROM fpt_match_facts WHERE phase<>'HISTORICAL') AS today_rows,
      (SELECT count(*)::int FROM fpt_match_facts WHERE phase='HISTORICAL' AND (home_team_id IS NULL OR away_team_id IS NULL)) AS historical_without_team_ids,
      (SELECT count(*)::int FROM fpt_match_facts WHERE phase<>'HISTORICAL' AND (home_team_id IS NULL OR away_team_id IS NULL)) AS today_without_team_ids,
      (SELECT count(*)::int FROM fpt_match_facts WHERE internal_competition_id IS NULL) AS without_competition,
      (SELECT count(*)::int FROM fpt_match_facts WHERE season_id IS NULL) AS without_season,
      (SELECT count(*)::int FROM fpt_match_facts WHERE kickoff_utc IS NOT NULL) AS kickoff_utc_set,
      (SELECT count(*)::int FROM fpt_match_facts WHERE kickoff_local_time IS NOT NULL) AS kickoff_local_time_set,
      (SELECT count(*)::int FROM fpt_match_facts WHERE provider_match_id IS NOT NULL) AS with_provider_match_id,
      (SELECT count(*)::int FROM fpt_match_facts f
         WHERE f.version_id <> (SELECT v.version_id FROM fpt_match_versions v WHERE v.match_key = f.match_key
           ORDER BY v.acquired_at DESC, v.version_id DESC LIMIT 1)) AS facts_stale`);
  const atNow = await one(client, `SELECT count(*)::int AS n FROM fpt_match_facts_at(now())`);
  const atNowRepeat = await one(client, `SELECT count(*)::int AS n FROM fpt_match_facts_at(now())`);
  const results = await all(client, `SELECT result_status, count(*)::int AS n FROM fpt_match_facts GROUP BY 1 ORDER BY 1`);
  const tz = await all(client, `SELECT kickoff_tz_status, count(*)::int AS n FROM fpt_match_facts GROUP BY 1 ORDER BY 1`);
  const section = {
    ...row,
    facts_at_now: atNow.n,
    facts_at_now_repeat: atNowRepeat.n,
    result_status: Object.fromEntries(results.map(r => [r.result_status, r.n])),
    kickoff_tz_status: Object.fromEntries(tz.map(r => [r.kickoff_tz_status, r.n])),
    facts_version: FACTS_VERSION,
    columns: ['internal_match_id', 'internal_competition_id', 'season_id', 'kickoff_utc', 'kickoff_local_time',
      'home_team_id', 'away_team_id', 'provider_match_id', 'provider_competition_id', 'home_score', 'away_score',
      'result_status', 'version_id', 'snapshot_id']
  };
  section.gate = factsGate(section);
  return section;
}

async function pitSection(client, status) {
  const pit = status.phase6?.evidence?.pit || null;
  const known = await one(client, `SELECT fpt_known_matches(now(), $1, NULL)::bigint AS a,
      fpt_known_matches(now(), $1, NULL)::bigint AS b,
      fpt_known_matches('2000-01-01T00:00:00Z', $1, NULL)::bigint AS before_mirror`, [DATA_CONTRACT]);
  const section = {
    phase6_pit: pit,
    known_now: num(known.a),
    known_now_repeat: num(known.b),
    known_before_mirror: num(known.before_mirror),
    contract: DATA_CONTRACT
  };
  section.gate = Boolean(pit) && status.phase6.gate === true
    && section.known_now === section.known_now_repeat && section.known_before_mirror === 0;
  return section;
}

async function entitySection(client, status) {
  const row = await one(client, `SELECT
      (SELECT count(*)::int FROM fpt_teams) AS teams,
      (SELECT count(*)::int FROM fpt_team_aliases) AS aliases,
      (SELECT count(*)::int FROM fpt_teams WHERE provider_team_id IS NOT NULL) AS with_provider_team_id,
      (SELECT count(*)::int FROM fpt_match_facts WHERE phase='HISTORICAL' AND home_team_id IS NULL) AS historical_unresolved_home,
      (SELECT count(*)::int FROM fpt_match_facts WHERE phase='HISTORICAL' AND away_team_id IS NULL) AS historical_unresolved_away,
      (SELECT count(DISTINCT t.internal_team_id)::int FROM fpt_teams t JOIN fpt_team_aliases a USING (internal_team_id)
         WHERE a.name ~ '\\([A-Za-z]{3}\\)\\s*$') AS coded_international_teams,
      (SELECT count(*)::int FROM fpt_team_links) AS links_total`);
  const links = await all(client, `SELECT link_status, count(*)::int AS n FROM fpt_team_links GROUP BY 1 ORDER BY 1`);
  const codes = await all(client, `SELECT country_code, code_country_slug, count(*)::int AS teams,
      count(*) FILTER (WHERE link_status='LINKED')::int AS linked
    FROM fpt_team_links GROUP BY 1, 2 ORDER BY 1`);
  const section = {
    ...row,
    team_splits: status.phase3.team_splits,
    link_status: Object.fromEntries(links.map(r => [r.link_status, r.n])),
    codes
  };
  section.gate = entityGate(section);
  return section;
}

async function lineageSection(client, status) {
  const row = await one(client, `SELECT
      (SELECT count(*)::int FROM fpt_match_versions WHERE source_provider IS NULL OR parser_version IS NULL
         OR schema_version IS NULL OR transform_version IS NULL) AS versions_without_lineage,
      (SELECT count(*)::int FROM fpt_match_facts f LEFT JOIN fpt_match_versions v USING (version_id)
         WHERE v.version_id IS NULL) AS facts_without_version,
      (SELECT count(*)::int FROM fpt_match_facts f JOIN fpt_match_versions v USING (version_id)
         WHERE f.snapshot_id <> v.snapshot_id OR f.schema_version <> v.schema_version
            OR f.parser_version <> v.parser_version OR f.transform_version <> v.transform_version) AS facts_version_mismatch,
      (SELECT count(*)::int FROM fpt_match_versions v LEFT JOIN fpt_raw_snapshots r USING (snapshot_id)
         WHERE r.snapshot_id IS NULL) AS orphan_versions,
      (SELECT count(*)::int FROM fpt_field_transforms) AS field_transforms`);
  const versions = await all(client, `SELECT source_provider, parser_version, schema_version, transform_version, count(*)::int AS n
    FROM fpt_match_versions GROUP BY 1, 2, 3, 4 ORDER BY 1, 2, 3, 4`);
  const section = {...row, version_sets: versions, chain: 'fpt_raw_snapshots -> fpt_match_versions -> fpt_match_facts'};
  section.gate = lineageGate(section) && status.phase4.gate === true;
  return section;
}

async function ledgerSection(client) {
  const totals = await one(client, `SELECT count(*)::int AS rows,
      count(*) FILTER (WHERE position('api_key=' in lower(url_path)) > 0)::int AS api_key_paths,
      count(*) FILTER (WHERE outcome NOT IN ('cache_hit','upstream','429','error','deduped'))::int AS unknown_outcomes,
      count(*) FILTER (WHERE endpoint_family IS NULL)::int AS rows_without_endpoint_family,
      count(*) FILTER (WHERE latency_ms IS NOT NULL)::int AS rows_with_latency,
      count(*) FILTER (WHERE budget_state IS NOT NULL)::int AS rows_with_budget_state,
      count(*) FILTER (WHERE provider_quota_remaining IS NOT NULL)::int AS rows_with_provider_quota,
      count(*) FILTER (WHERE deduped)::int AS deduped_rows,
      to_char(min(recorded_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS first_row,
      to_char(max(recorded_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_row
    FROM fpt_request_ledger`);
  const after = await one(client, `WITH m AS (
      SELECT applied_at FROM schema_migrations WHERE filename = '014-fpt-normalized-layer.sql'
    )
    SELECT to_char((SELECT applied_at FROM m) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS migration_014_applied_at,
      count(*)::int AS rows_after_014,
      count(*) FILTER (WHERE l.outcome = 'upstream')::int AS rows_after_014_upstream,
      count(*) FILTER (WHERE l.endpoint_family IS NULL OR l.budget_state IS NULL OR l.provider IS NULL
        OR l.budget_remaining_day IS NULL OR l.budget_remaining_minute IS NULL
        OR (l.outcome IN ('upstream','429','error') AND l.attempt > 0 AND l.latency_ms IS NULL))::int AS rows_after_014_missing_fields,
      percentile_disc(0.5) WITHIN GROUP (ORDER BY l.latency_ms) FILTER (WHERE l.latency_ms IS NOT NULL) AS latency_p50_ms_after_014
    FROM fpt_request_ledger l
    WHERE l.recorded_at >= (SELECT applied_at FROM m)`);
  const byOutcome = await all(client, `SELECT outcome, COALESCE(endpoint_family, '-') AS endpoint_family, count(*)::int AS n,
      percentile_disc(0.5) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE latency_ms IS NOT NULL) AS latency_p50_ms,
      max(latency_ms) AS latency_max_ms
    FROM fpt_request_ledger GROUP BY 1, 2 ORDER BY 1, 2`);
  const byState = await all(client, `SELECT COALESCE(budget_state, 'not_recorded') AS budget_state, count(*)::int AS n
    FROM fpt_request_ledger GROUP BY 1 ORDER BY 1`);
  const window = await one(client, `SELECT
      count(*) FILTER (WHERE recorded_at >= now() - interval '1 minute' AND outcome IN ('upstream','429','error'))::int AS minute_used,
      count(*) FILTER (WHERE recorded_at >= now() - interval '1 day' AND outcome IN ('upstream','429','error'))::int AS day_used,
      count(*) FILTER (WHERE recorded_at >= now() - interval '1 day' AND outcome='429')::int AS rate_limited_day,
      max(backoff_ms)::int AS max_backoff_ms
    FROM fpt_request_ledger`);
  const config = budgetConfig({});
  const section = {
    ...totals,
    ...after,
    by_outcome: byOutcome,
    by_budget_state: Object.fromEntries(byState.map(r => [r.budget_state, r.n])),
    window,
    config,
    mechanisms: {
      cache_first: 'test/request-budget.test.mjs, test/incremental-sync.test.mjs',
      in_flight_dedup: 'test/request-budget.test.mjs (deduped ledger row)',
      no_restart_burst: 'test/request-budget.test.mjs (ledger-backed minute/day window survives a new process)',
      retry_after: 'test/request-budget.test.mjs',
      backoff_jitter: 'test/request-budget.test.mjs',
      circuit_breaker: 'test/request-budget.test.mjs, test/phase8-watchdog.test.mjs',
      backfill_throttling: 'test/request-budget.test.mjs',
      budget_warning_critical: 'test/phase8-watchdog.test.mjs'
    }
  };
  section.gate = ledgerGate(section);
  return section;
}

async function incrementalSection(client) {
  const runs = await all(client, `SELECT r.run_id, r.kind, r.status, r.started_at, r.finished_at,
      r.datasets_attempted, r.datasets_changed, r.snapshots_inserted, r.rows_inserted,
      r.meta->>'mode' AS meta_mode,
      count(l.*) FILTER (WHERE l.outcome='cache_hit')::int AS cache_hit,
      count(l.*) FILTER (WHERE l.outcome='upstream')::int AS upstream,
      count(l.*) FILTER (WHERE l.outcome='upstream' AND l.url_path LIKE '/api/download/%')::int AS dataset_upstream,
      count(l.*) FILTER (WHERE l.outcome IN ('429','error'))::int AS failed_requests
    FROM fpt_sync_runs r
    LEFT JOIN fpt_request_ledger l ON l.run_id = r.run_id
    WHERE r.run_id = ANY($1::text[])
    GROUP BY r.run_id ORDER BY r.started_at`, [INCREMENTAL_RUNS]);
  const later = await all(client, `SELECT run_id, kind, status, started_at, snapshots_inserted, rows_inserted
    FROM fpt_sync_runs WHERE kind <> 'backfill' AND started_at > (SELECT max(started_at) FROM fpt_sync_runs WHERE run_id = ANY($1::text[]))
    ORDER BY started_at`, [INCREMENTAL_RUNS]);
  const normalized = runs.map(r => ({...r, mode: r.kind === 'backfill' ? 'backfill' : 'incremental'}));
  return {certified_runs: normalized, later_runs: later, gate: incrementalGate(normalized)};
}

async function watchdogSection(client, status) {
  const alerts = await one(client, `SELECT count(*)::int AS alerts,
      count(*) FILTER (WHERE resolved_at IS NULL)::int AS open_alerts,
      count(*) FILTER (WHERE last_delivered_at IS NOT NULL)::int AS delivered,
      COALESCE(sum(occurrences), 0)::int AS occurrences,
      count(*) FILTER (WHERE last_delivered_at >= now() - interval '1 day')::int AS delivered_last_day
    FROM data_alerts`);
  const open = await all(client, `SELECT code, severity, occurrences,
      to_char(last_seen_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_seen
    FROM data_alerts WHERE resolved_at IS NULL ORDER BY last_seen_at DESC LIMIT 20`);
  const check = await one(client, `SELECT status, to_char(checked_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS checked_at,
      details->'telegram' AS telegram
    FROM fpt_certification_checks WHERE phase='FPT_PHASE8' AND check_code='WATCHDOG'
    ORDER BY checked_at DESC LIMIT 1`);
  return {
    phase8: status.phase8,
    check,
    alerts,
    open_alerts: open,
    deliveries_without_repeat: num(alerts.delivered) <= num(alerts.alerts),
    gate: status.phase8.gate === true
  };
}

async function filtersSection(client) {
  const row = await one(client, `SELECT
      (SELECT count(*)::int FROM fpt_filter_registry) AS registry_rows,
      (SELECT count(*)::int FROM fpt_schema_fields) AS schema_fields,
      (SELECT count(*)::int FROM fpt_schema_fields WHERE family='unclassified') AS unclassified_family,
      (SELECT count(*)::int FROM fpt_filter_registry WHERE timing_class IS NULL) AS timing_unset,
      (SELECT count(*)::int FROM fpt_filter_registry WHERE timing_class='POSTMATCH_OUTCOME' AND prematch_safe) AS postmatch_marked_safe,
      (SELECT count(*)::int FROM fpt_filter_registry WHERE filterable) AS filterable,
      (SELECT count(*)::int FROM fpt_filter_registry WHERE zero_is_missing) AS zero_is_missing,
      (SELECT count(*)::int FROM fpt_filter_registry WHERE coverage_ratio IS NULL) AS without_coverage,
      (SELECT count(*)::int FROM fpt_filter_registry WHERE first_seen IS NULL OR last_seen IS NULL) AS without_seen,
      (SELECT count(*)::int FROM fpt_filter_registry WHERE source IS NULL) AS without_source,
      (SELECT count(*)::int FROM fpt_filter_registry WHERE phases = '[]'::jsonb) AS without_phases,
      (SELECT count(*)::int FROM fpt_filter_registry WHERE indexed) AS indexed_fields,
      (SELECT count(*)::int FROM fpt_filter_registry WHERE fact_column IS NOT NULL) AS fields_with_fact_column,
      (SELECT count(*)::int FROM fpt_filter_registry WHERE indexed AND (fact_column IS NULL OR index_names = '[]'::jsonb)) AS indexed_inconsistent,
      (SELECT jsonb_agg(field_name ORDER BY field_name) FROM fpt_filter_registry WHERE indexed) AS indexed_list`);
  const timing = await all(client, `SELECT timing_class, count(*)::int AS n FROM fpt_filter_registry GROUP BY 1 ORDER BY 1`);
  const families = await all(client, `SELECT family, count(*)::int AS n FROM fpt_schema_fields GROUP BY 1 ORDER BY 1`);
  const section = {
    ...row,
    timing_classes: Object.fromEntries(timing.map(r => [r.timing_class, r.n])),
    families: Object.fromEntries(families.map(r => [r.family, r.n])),
    version: FILTERS_VERSION
  };
  section.gate = filtersGate(section);
  return section;
}

// Every check below is a property of the rows actually returned, not only a row count.
export function assistantChecks(answers, {before}) {
  const by = name => answers.find(a => a.name === name);
  const dateOk = rows => rows.every(r => String(r.match_date instanceof Date ? r.match_date.toISOString() : r.match_date).slice(0, 10) < before);
  const away = by('awayMatches');
  const odds = by('favoriteOddsRange');
  const xg = by('xgBySeason');
  const search = by('searchMatches');
  const pit = by('teamMatchesAsOf');
  const pitRepeat = by('teamMatchesAsOfRepeat');
  const pitEmpty = by('teamMatchesAsOfBeforeMirror');
  const leagues = by('leaguesWithCoverage');
  const checks = {
    away_last_20: Boolean(away) && away.rows.length === 20 && away.rows.every(r => r.away_team_id === away.input.team) && dateOk(away.rows),
    favorite_150_190: Boolean(odds) && odds.rows.length > 0
      && odds.rows.every(r => Number(r.favorite_odd) >= 1.5 && Number(r.favorite_odd) <= 1.9) && dateOk(odds.rows),
    xg_by_season: Boolean(xg) && xg.rows.length > 0 && xg.rows.some(r => Number(r.matches_with_xg) > 0)
      && xg.rows.every(r => Number(r.matches_with_xg) <= Number(r.matches)),
    five_plus_filters: Boolean(search) && Number(search.filters_applied?.length) >= 5 && search.rows.length > 0
      && search.rows.every(r => r.home_team_id === search.input.team && r.result_status === 'FINAL'
        && r.internal_competition_id === search.input.competition && r.season_id === search.input.season) && dateOk(search.rows),
    point_in_time: Boolean(pit && pitRepeat && pitEmpty) && pit.rows.length > 0
      && JSON.stringify(pit.rows) === JSON.stringify(pitRepeat.rows)
      && pit.rows.every(r => new Date(r.acquired_at).getTime() <= new Date(pit.as_of).getTime())
      && pitEmpty.rows.length === 0,
    leagues_with_coverage: Boolean(leagues) && leagues.rows.length > 0
      && leagues.rows.every(r => Number(r.seasons_meeting_coverage) >= 2),
    no_upstream: answers.every(a => a.upstream_calls === 0)
  };
  return {checks, gate: Object.values(checks).every(Boolean)};
}

async function assistantSection(client, perf) {
  const sample = perf.sample || null;
  const answers = [];
  const before = '2100-01-01';
  const asOf = new Date().toISOString();
  if (sample) {
    const run = async (label, name, input) => {
      let result;
      try {
        result = await runQuery(client, name, input, {now: new Date('2100-01-01T00:00:00Z')});
      } catch (error) {
        answers.push({name: label, query: name, input, rows: [], row_count: 0, upstream_calls: 0,
          error: String(error?.message || error).slice(0, 200)});
        return;
      }
      answers.push({name: label, query: name, input, rows: result.rows, row_count: result.row_count,
        upstream_calls: result.provenance.upstream_calls, filters_applied: result.provenance.filters_applied,
        as_of: result.provenance.as_of, elapsed_ms: result.provenance.elapsed_ms});
    };
    await run('teamSearch', 'teamSearch', {q: sample.normalized_name});
    await run('teamSummary', 'teamSummary', {team: sample.team_id, before});
    await run('headToHead', 'headToHead', {team: sample.team_id, opponent: sample.opponent_id, before, limit: 5});
    await run('awayMatches', 'awayMatches', {team: sample.team_id, before, limit: 20});
    await run('favoriteOddsRange', 'favoriteOddsRange', {min: 1.5, max: 1.9, side: 'any', before, limit: 50});
    await run('xgBySeason', 'xgBySeason', {team: sample.xg_team_id, before});
    await run('searchMatches', 'searchMatches', {competition: sample.xg_competition_id, season: sample.xg_season_id,
      team: sample.xg_team_id, venue: 'home', fav_min: 1.01, fav_max: 10, result: 'FINAL', before, limit: 50});
    await run('teamMatchesAsOf', 'teamMatchesAsOf', {team: sample.team_id, as_of: asOf, before, limit: 20});
    await run('teamMatchesAsOfRepeat', 'teamMatchesAsOf', {team: sample.team_id, as_of: asOf, before, limit: 20});
    await run('teamMatchesAsOfBeforeMirror', 'teamMatchesAsOf', {team: sample.team_id, as_of: '2000-01-01T00:00:00Z', before, limit: 20});
    await run('leaguesWithCoverage', 'leaguesWithCoverage', {field: 'xG_Home_FT', min_ratio: 0.9, min_seasons: 2, limit: 200});
  }
  const {checks, gate} = assistantChecks(answers, {before});
  const brief = row => row ? Object.fromEntries(Object.entries(row).filter(([k]) => [
    'internal_match_id', 'match_date', 'home_name', 'away_name', 'home_score', 'away_score', 'favorite_side', 'favorite_odd',
    'season', 'matches', 'matches_with_xg', 'xg_for_avg', 'xg_against_avg', 'country_slug', 'league_slug',
    'available_seasons', 'seasons_meeting_coverage', 'acquired_at', 'canonical_name', 'played', 'won', 'drawn', 'lost'
  ].includes(k))) : null;
  return {
    routes: ROUTES,
    answers: answers.map(a => ({name: a.name, query: a.query, row_count: a.row_count, upstream_calls: a.upstream_calls, error: a.error || null,
      filters_applied: a.filters_applied, as_of: a.as_of, elapsed_ms: a.elapsed_ms, first: brief(a.rows[0])})),
    checks,
    upstream_calls: answers.reduce((sum, a) => sum + a.upstream_calls, 0),
    gate: answers.length === 11 && gate && answers.every(a => !a.error)
      && ['teamSearch', 'teamSummary', 'headToHead'].every(n => answers.find(a => a.name === n)?.row_count > 0)
  };
}

export const KNOWN_LIMITATIONS_TEXT = {
  expected_match_count: 'FutPythonTrader non pubblica il numero atteso di partite per stagione: expected_match_count resta nullo e nessuna stagione è COMPLETE, solo AVAILABLE.',
  kickoff_timezone: 'Il fuso orario di Date/Time non è documentato dal provider: kickoff_utc resta nullo, kickoff_local_time conserva l’orario del CSV (kickoff_tz_status=PROVIDER_TZ_UNDOCUMENTED).',
  market_capture_time: 'Le quote storiche non hanno un timestamp di cattura: sono classificate PREMATCH_MARKET_UNTIMED, non come quote di apertura o chiusura.',
  provider_quota: 'La quota reale del fornitore non è nota: i tetti per minuto/giorno sono default conservativi di codice, provider_quota_remaining è valorizzato solo se il provider manda un header di rate limit.',
  team_links: 'Le squadre delle competizioni internazionali ("Club (XXX)") sono collegate alla squadra nazionale solo con nome normalizzato identico; le altre restano entità separate con stato esplicito in fpt_team_links.',
  sigterm: 'Il SIGTERM live del drill di resume è caduto fra due dataset, non a metà scrittura; il rollback a metà storeDataset è provato solo su Postgres locale.',
  ledger_history: 'Le righe del ledger scritte prima della migrazione 014 non hanno latency, budget_state e quota: non sono state misurate e non vengono ricostruite.',
  today_odds_placeholder: 'Il feed jogos-do-dia manda 0 nelle quote non ancora quotate: lo zero di un campo di mercato è N/D, non un prezzo.'
};

export function knownLimitations(report) {
  const out = ['expected_match_count', 'kickoff_timezone', 'market_capture_time', 'provider_quota', 'sigterm'];
  const linked = report.entity_resolution?.link_status?.LINKED || 0;
  if (num(report.entity_resolution?.links_total) > linked) out.push('team_links');
  if (num(report.request_ledger?.rows) > num(report.request_ledger?.rows_with_latency)) out.push('ledger_history');
  if (num(report.filter_registry?.zero_is_missing) > 0) out.push('today_odds_placeholder');
  return out.map(code => ({code, text: KNOWN_LIMITATIONS_TEXT[code]}));
}

export async function buildCertificateReport({env = process.env} = {}) {
  const status = await getFutpythonCertificationStatus();
  return withClient(async client => {
    const identityRow = await one(client, `SELECT current_setting('server_version') AS server_version, current_database() AS database,
      (SELECT filename FROM schema_migrations ORDER BY filename DESC LIMIT 1) AS last_migration,
      (SELECT to_char(applied_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') FROM schema_migrations
         ORDER BY filename DESC LIMIT 1) AS last_migration_applied_at,
      (SELECT count(*)::int FROM schema_migrations) AS migrations_applied,
      to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS db_now`);
    const identity = {
      certificate_version: CERTIFICATE_VERSION,
      generated_at: new Date().toISOString(),
      commit_sha: env.RENDER_GIT_COMMIT || null,
      git_branch: env.RENDER_GIT_BRANCH || null,
      render_service_id: env.RENDER_SERVICE_ID || null,
      render_service_name: env.RENDER_SERVICE_NAME || null,
      render_external_url: env.RENDER_EXTERNAL_URL || null,
      node_version: process.version,
      neon_server_version: identityRow.server_version,
      database: identityRow.database,
      db_now: identityRow.db_now,
      last_migration: identityRow.last_migration,
      last_migration_applied_at: identityRow.last_migration_applied_at,
      migrations_applied: identityRow.migrations_applied,
      parser_version: LINEAGE_VERSIONS.parserVersion,
      schema_version: LINEAGE_VERSIONS.schemaVersion,
      transform_version: LINEAGE_VERSIONS.transformVersion,
      data_contract: DATA_CONTRACT,
      facts_version: FACTS_VERSION,
      filters_version: FILTERS_VERSION,
      source_provider: LINEAGE_VERSIONS.sourceProvider
    };
    const sweep = await fullRawSweep(client);
    const perfSample = await perfSamples(client);
    const perf = await runPerfGate(client);
    const report = {
      identity,
      catalog: await catalogSection(client),
      data: await dataSection(client),
      integrity: await integritySection(client, status, sweep),
      schema: {...status.phase4, gate: status.phase4.gate === true},
      coverage: await coverageSection(client, status),
      seasons: await seasonSection(client, status),
      point_in_time: await pitSection(client, status),
      entity_resolution: await entitySection(client, status),
      lineage: await lineageSection(client, status),
      request_ledger: await ledgerSection(client),
      incremental_sync: await incrementalSection(client),
      watchdog: await watchdogSection(client, status),
      normalized_layer: await factsSection(client),
      filter_registry: await filtersSection(client),
      assistant_query_layer: await assistantSection(client, {sample: perfSample}),
      query_performance: {...perf, sample: perfSample},
      phase1: {gate: phase1Gate(status), latest_backfill: status.latest_backfill, checks: status.phase1_checks},
      phase2: {gate: status.phase2?.gate === true}
    };
    const gates = {
      phase1_backfill: report.phase1.gate,
      catalog: report.catalog.gate,
      classification_phase2: report.phase2.gate,
      integrity: report.integrity.gate,
      schema: report.schema.gate,
      coverage: report.coverage.gate,
      seasons: report.seasons.gate,
      point_in_time: report.point_in_time.gate,
      entity_resolution: report.entity_resolution.gate,
      lineage: report.lineage.gate,
      request_ledger: report.request_ledger.gate,
      incremental_sync: report.incremental_sync.gate,
      watchdog: report.watchdog.gate,
      normalized_layer: report.normalized_layer.gate,
      filter_registry: report.filter_registry.gate,
      assistant_query_layer: report.assistant_query_layer.gate,
      query_performance: report.query_performance.gate
    };
    const limitations = knownLimitations(report);
    return {...report, gates, known_limitations: limitations, ...verdictFor(gates, limitations)};
  });
}

let cache = null;
let building = null;
let lastError = null;

// The full sweep re-reads every gzip, so the HTTP route builds in the background and serves the last result.
export function certificateReport({maxAgeMs = 15 * 60 * 1000, build = buildCertificateReport, now = Date.now} = {}) {
  if (cache && now() - cache.at < maxAgeMs) return {state: 'ready', report: cache.report};
  if (!building) {
    building = build()
      .then(report => { cache = {at: now(), report}; lastError = null; return report; })
      .catch(error => { lastError = {at: new Date(now()).toISOString(), message: String(error?.message || error).replace(/postgres(?:ql)?:\/\/\S+/gi, 'postgres://[REDACTED]').slice(0, 300)}; throw error; })
      .finally(() => { building = null; });
    building.catch(() => {});
  }
  if (cache) return {state: 'stale', report: cache.report};
  return {state: 'building', report: null, last_error: lastError};
}

export function resetCertificateCacheForTests() {
  cache = null;
  building = null;
  lastError = null;
}
