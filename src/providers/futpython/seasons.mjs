import { createHash } from 'node:crypto';

export const COVERAGE_STATUSES = [
  'DISCOVERED',
  'CANDIDATE',
  'AVAILABLE',
  'PARTIAL',
  'COMPLETE',
  'UNAVAILABLE_404',
  'ERROR_REAL',
  'DEPRECATED',
  'REMOVED'
];

export const DATA_CONTRACT = 'fpt-schema-4';
export const ARGENTINA_DATASET = 'argentina/liga-profesional/2026';
export const ARGENTINA_SNAPSHOT_AT = '2026-10-04T14:35:03.311Z';

const TERMINAL = new Set(['UNAVAILABLE_404', 'ERROR_REAL', 'DEPRECATED', 'REMOVED']);

export function competitionId(country, league) {
  const digest = createHash('md5').update(`${country}|${league}`).digest('hex');
  return `fpt:competition:${digest}`;
}

export function seasonShape(season) {
  if (/^\d{4}$/.test(season)) return 'calendar';
  if (/^\d{4}-\d{4}$/.test(season)) return 'split';
  return 'other';
}

export function startYear(season) {
  const match = /^(\d{4})/.exec(season || '');
  return match ? Number(match[1]) : null;
}

export function seasonLabel(shape, year) {
  if (shape === 'calendar') return String(year);
  if (shape === 'split') return `${year}-${year + 1}`;
  return null;
}

export function coverageStatus({ classification, expectedMatchCount, matchCount }) {
  if (TERMINAL.has(classification)) return classification;
  if (classification !== 'AVAILABLE') return null;
  if (expectedMatchCount == null) return 'AVAILABLE';
  if (Number(matchCount) === Number(expectedMatchCount)) return 'COMPLETE';
  if (Number(matchCount) < Number(expectedMatchCount)) return 'PARTIAL';
  return 'AVAILABLE';
}

export function historicalComplete({ expectedMatchCount, matchCount }) {
  return expectedMatchCount != null && Number(matchCount) === Number(expectedMatchCount);
}

export function futureSeasonRow({ country, league, season, championship = false }) {
  const status = championship ? 'DISCOVERED' : 'CANDIDATE';
  return {
    dataset_key: `future/${country}/${league}/${season}`,
    internal_competition_id: competitionId(country, league),
    country_slug: country,
    league_slug: league,
    canonical_league_name: league,
    season,
    provider_competition_id: null,
    provider_season: null,
    first_data_date: null,
    last_data_date: null,
    match_count: 0,
    expected_match_count: null,
    coverage_status: status,
    fields_available: 0,
    fields_coverage: { nonempty_cells: 0, scoped_cells: 0, ratio: null },
    historical_complete: false,
    prematch_available: false,
    evidence: {
      origin: 'future',
      onboarding: championship ? 'championship' : 'season',
      expected_reason: 'not acquired'
    }
  };
}

export function countsAsMissingAvailable(row) {
  return row.classification === 'AVAILABLE' && row.snapshot_complete !== true;
}

function annualCadence(steps) {
  if (!steps.length) return false;
  const counts = new Map();
  for (const step of steps) counts.set(step, (counts.get(step) || 0) + 1);
  const annual = counts.get(1) || 0;
  if (!annual) return false;
  for (const [step, count] of counts) {
    if (step !== 1 && count > annual) return false;
  }
  return true;
}

export function cadenceGaps(rows) {
  const groups = new Map();
  for (const row of rows) {
    const shape = seasonShape(row.season);
    const year = startYear(row.season);
    if (shape === 'other' || year == null) continue;
    const key = `${row.country_slug}|${row.league_slug}|${shape}`;
    if (!groups.has(key)) groups.set(key, { ...row, shape, years: [] });
    groups.get(key).years.push(year);
  }
  const gaps = [];
  for (const group of groups.values()) {
    const years = [...new Set(group.years)].sort((a, b) => a - b);
    const steps = [];
    for (let i = 1; i < years.length; i += 1) steps.push(years[i] - years[i - 1]);
    if (!annualCadence(steps)) continue;
    for (let i = 1; i < years.length; i += 1) {
      for (let year = years[i - 1] + 1; year < years[i]; year += 1) {
        gaps.push({
          country_slug: group.country_slug,
          league_slug: group.league_slug,
          season: seasonLabel(group.shape, year),
          detector: 'annual_cadence',
          in_catalog: false,
          missing_available: false,
          evidence: {
            reason: 'not_in_provider_catalog',
            cadence: 1,
            shape: group.shape
          }
        });
      }
    }
  }
  return gaps;
}

const REGISTRY_SQL = `
WITH spans AS (
  SELECT country_slug, league_slug,
    first_value(season) OVER w AS earliest_season,
    last_value(season) OVER w AS latest_season,
    season
  FROM fpt_catalog
  WHERE active
  WINDOW w AS (
    PARTITION BY country_slug, league_slug
    ORDER BY substring(season FROM '^[0-9]{4}'), season
    ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
  )
), matches AS (
  SELECT dataset_key,
    count(*)::bigint AS match_count,
    min(match_date) AS first_data_date,
    max(match_date) AS last_data_date
  FROM fpt_match_versions
  WHERE phase = 'HISTORICAL'
  GROUP BY dataset_key
), fields AS (
  SELECT dimension_key AS dataset_key,
    count(*)::int AS fields_available,
    sum(nonempty_rows)::bigint AS nonempty_cells,
    sum(rows_scoped)::bigint AS scoped_cells
  FROM fpt_field_coverage
  WHERE dimension = 'dataset'
  GROUP BY dimension_key
)
INSERT INTO fpt_competition_season (
  dataset_key, internal_competition_id, country_slug, league_slug, canonical_league_name,
  season, provider_competition_id, provider_season, first_data_date, last_data_date,
  match_count, expected_match_count, coverage_status, fields_available, fields_coverage,
  historical_complete, prematch_available, earliest_season, latest_season,
  discovered_at, verified_at, last_audited_at, evidence
)
SELECT
  c.dataset_key,
  'fpt:competition:' || md5(c.country_slug || '|' || c.league_slug),
  c.country_slug,
  c.league_slug,
  c.league_slug,
  c.season,
  NULL,
  c.season,
  m.first_data_date,
  m.last_data_date,
  coalesce(m.match_count, 0),
  NULL,
  CASE s.classification
    WHEN 'UNAVAILABLE_404' THEN 'UNAVAILABLE_404'
    WHEN 'ERROR_REAL' THEN 'ERROR_REAL'
    WHEN 'DEPRECATED' THEN 'DEPRECATED'
    WHEN 'REMOVED' THEN 'REMOVED'
    WHEN 'AVAILABLE' THEN 'AVAILABLE'
    ELSE NULL
  END,
  coalesce(f.fields_available, 0),
  jsonb_build_object(
    'nonempty_cells', coalesce(f.nonempty_cells, 0),
    'scoped_cells', coalesce(f.scoped_cells, 0),
    'ratio', CASE WHEN coalesce(f.scoped_cells, 0) = 0 THEN NULL
      ELSE round(f.nonempty_cells::numeric / f.scoped_cells, 10) END
  ),
  false,
  coalesce(m.match_count, 0) > 0,
  spans.earliest_season,
  spans.latest_season,
  c.first_seen_at,
  now(),
  now(),
  jsonb_build_object(
    'origin', 'catalog',
    'classification', s.classification,
    'snapshot_complete', EXISTS (
      SELECT 1 FROM fpt_raw_snapshots r
      WHERE r.dataset_key = c.dataset_key AND r.source_kind = 'dataset' AND r.ingest_complete
    ),
    'route', c.route,
    'canonical_name_source', 'league_slug',
    'provider_competition_id', NULL,
    'expected_reason', 'provider catalog has no fixture total'
  )
FROM fpt_catalog c
JOIN fpt_dataset_state s USING (dataset_key)
JOIN spans ON spans.country_slug = c.country_slug
  AND spans.league_slug = c.league_slug
  AND spans.season = c.season
LEFT JOIN matches m ON m.dataset_key = c.dataset_key
LEFT JOIN fields f ON f.dataset_key = c.dataset_key
WHERE c.active
`;

export const MISSING_AVAILABLE_SQL = `
SELECT count(*)::int AS missing_available_seasons
FROM fpt_catalog c
JOIN fpt_dataset_state s USING (dataset_key)
WHERE c.active
  AND s.classification = 'AVAILABLE'
  AND NOT EXISTS (
    SELECT 1 FROM fpt_raw_snapshots r
    WHERE r.dataset_key = c.dataset_key
      AND r.source_kind = 'dataset'
      AND r.ingest_complete
  )
`;

export const PHASE6_SQL = `
SELECT registry_rows, missing_available_seasons, gap_rows, status_counts,
  expected_null, historical_complete, unavailable_marked_complete, evidence, computed_at
FROM fpt_season_audit
WHERE audit_id = 1
`;

export function phase6Gate(row) {
  if (!row) return false;
  const counts = row.status_counts || {};
  const pit = row.evidence?.pit;
  return Number(row.missing_available_seasons) === 0
    && Number(row.unavailable_marked_complete) === 0
    && Number(row.historical_complete) === 0
    && Number(row.expected_null) === Number(row.registry_rows)
    && Number(row.registry_rows) > 0
    && Number(counts.UNAVAILABLE_404) > 0
    && Number(counts.COMPLETE || 0) === 0
    && Number(counts.AVAILABLE) > 0
    && Boolean(pit)
    && pit.contract === DATA_CONTRACT
    && pit.t0_matches_snapshot === true
    && Number(pit.argentina_t0) > 0
    && Number(pit.total_t0) === Number(pit.total_t0_repeat)
    && Number(pit.total_t1) > Number(pit.total_t0)
    && Number(pit.later_dataset_t0) === 0
    && Number(pit.later_dataset_t1) > 0
    && Number(pit.wrong_contract_t0) === 0;
}

async function known(client, at, contract, dataset) {
  const result = await client.query(
    'SELECT fpt_known_matches($1::timestamptz, $2, $3)::bigint AS n',
    [at, contract, dataset]
  );
  return Number(result.rows[0].n);
}

export async function rebuildSeasonRegistry(client) {
  await client.query(`DELETE FROM fpt_competition_season WHERE coalesce(evidence->>'origin', '') <> 'future'`);
  await client.query('DELETE FROM fpt_season_gaps');
  await client.query(REGISTRY_SQL);
  const seasons = await client.query(
    `SELECT country_slug, league_slug, season
     FROM fpt_catalog WHERE active`
  );
  const gaps = cadenceGaps(seasons.rows);
  for (const gap of gaps) {
    await client.query(
      `INSERT INTO fpt_season_gaps(
         country_slug, league_slug, season, detector, in_catalog, missing_available, evidence
       ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
      [gap.country_slug, gap.league_slug, gap.season, gap.detector, gap.in_catalog, gap.missing_available, JSON.stringify(gap.evidence)]
    );
  }
  const missing = (await client.query(MISSING_AVAILABLE_SQL)).rows[0].missing_available_seasons;
  const summary = (await client.query(`
    SELECT
      count(*)::int AS registry_rows,
      count(*) FILTER (WHERE expected_match_count IS NULL)::int AS expected_null,
      count(*) FILTER (WHERE historical_complete)::int AS historical_complete,
      count(*) FILTER (
        WHERE evidence->>'classification' = 'UNAVAILABLE_404' AND coverage_status = 'COMPLETE'
      )::int AS unavailable_marked_complete,
      (
        SELECT coalesce(jsonb_object_agg(coverage_status, n), '{}'::jsonb)
        FROM (
          SELECT coverage_status, count(*)::int AS n
          FROM fpt_competition_season
          WHERE coalesce(evidence->>'origin', '') = 'catalog'
          GROUP BY coverage_status
        ) grouped
      ) AS status_counts
    FROM fpt_competition_season
    WHERE coalesce(evidence->>'origin', '') = 'catalog'
  `)).rows[0];

  const snapshot = await client.query(
    `SELECT acquired_at FROM fpt_raw_snapshots
     WHERE dataset_key = $1 AND source_kind = 'dataset'
     ORDER BY acquired_at LIMIT 1`,
    [ARGENTINA_DATASET]
  );
  const t0 = snapshot.rows[0]?.acquired_at;
  const t0Matches = t0 && new Date(t0).toISOString() === ARGENTINA_SNAPSHOT_AT;
  const later = await client.query(
    `SELECT dataset_key FROM fpt_match_versions
     WHERE phase = 'HISTORICAL'
     GROUP BY dataset_key
     HAVING min(acquired_at) > $1::timestamptz
     ORDER BY min(acquired_at) LIMIT 1`,
    [t0]
  );
  const laterKey = later.rows[0]?.dataset_key || null;
  const t1row = await client.query(
    `SELECT max(acquired_at) AS t1 FROM fpt_match_versions WHERE phase = 'HISTORICAL'`
  );
  const t1 = t1row.rows[0].t1;
  const pit = {
    contract: DATA_CONTRACT,
    dataset: ARGENTINA_DATASET,
    t0: t0 ? new Date(t0).toISOString() : null,
    t0_matches_snapshot: t0Matches,
    t1: t1 ? new Date(t1).toISOString() : null,
    later_dataset: laterKey,
    argentina_t0: t0 ? await known(client, t0, DATA_CONTRACT, ARGENTINA_DATASET) : 0,
    total_t0: t0 ? await known(client, t0, DATA_CONTRACT, null) : 0,
    total_t0_repeat: t0 ? await known(client, t0, DATA_CONTRACT, null) : 0,
    total_t1: t1 ? await known(client, t1, DATA_CONTRACT, null) : 0,
    later_dataset_t0: t0 && laterKey ? await known(client, t0, DATA_CONTRACT, laterKey) : null,
    later_dataset_t1: t1 && laterKey ? await known(client, t1, DATA_CONTRACT, laterKey) : null,
    wrong_contract_t0: t0 ? await known(client, t0, 'fpt-schema-0', null) : null
  };
  const evidence = {
    pit,
    missing_definition: 'active catalog classification AVAILABLE without an ingest_complete dataset snapshot',
    expected_match_count: 'null: the provider catalog does not carry a fixture total',
    cadence: 'a hole is recorded only when the unique modal step between observed seasons is 1 year; tournament cadences are not filled'
  };
  await client.query(
    `INSERT INTO fpt_season_audit(
       audit_id, registry_rows, missing_available_seasons, gap_rows, status_counts,
       expected_null, historical_complete, unavailable_marked_complete, evidence
     ) VALUES (1,$1,$2,$3,$4::jsonb,$5,$6,$7,$8::jsonb)
     ON CONFLICT (audit_id) DO UPDATE SET
       computed_at = now(),
       registry_rows = EXCLUDED.registry_rows,
       missing_available_seasons = EXCLUDED.missing_available_seasons,
       gap_rows = EXCLUDED.gap_rows,
       status_counts = EXCLUDED.status_counts,
       expected_null = EXCLUDED.expected_null,
       historical_complete = EXCLUDED.historical_complete,
       unavailable_marked_complete = EXCLUDED.unavailable_marked_complete,
       evidence = EXCLUDED.evidence`,
    [
      summary.registry_rows,
      missing,
      gaps.length,
      JSON.stringify(summary.status_counts),
      summary.expected_null,
      summary.historical_complete,
      summary.unavailable_marked_complete,
      JSON.stringify(evidence)
    ]
  );
  return { ...summary, missing_available_seasons: missing, gap_rows: gaps.length, evidence };
}
