import { EMPTY_TOKENS } from './schema.mjs';

export const DENSE_NUMERATOR = 9;
export const DENSE_DENOMINATOR = 10;
export const COVERAGE_DIMENSIONS = ['global', 'dataset', 'league', 'season', 'period', 'team', 'normalized'];

const LEAGUE_KEY = `CASE WHEN country_slug IS NULL OR league_slug IS NULL THEN 'unscoped' ELSE country_slug || '/' || league_slug END`;
const SEASON_KEY = `COALESCE(season, 'unscoped')`;
const PERIOD_KEY = `COALESCE(to_char(match_date, 'YYYY'), 'undated')`;

export function isNonemptyValue(value) {
  return !EMPTY_TOKENS.includes(String(value ?? '').trim().toLowerCase());
}

export function coverageClass(rowsScoped, nonemptyRows) {
  const rows = Number(rowsScoped);
  const nonempty = Number(nonemptyRows);
  if (!Number.isSafeInteger(rows) || !Number.isSafeInteger(nonempty) || rows < 0 || nonempty < 0 || nonempty > rows) {
    throw new Error('invalid coverage counts');
  }
  if (rows === 0) return null;
  if (nonempty === 0) return 'always-empty';
  if (nonempty * DENSE_DENOMINATOR >= rows * DENSE_NUMERATOR) return 'dense';
  return 'sparse';
}

export function coverageTags(evidence) {
  const leaguesPresent = Number(evidence.leagues_present);
  const leaguesTotal = Number(evidence.leagues_total);
  const seasonGap = Number(evidence.season_gap_leagues);
  const introducedLate = Number(evidence.introduced_late_leagues);
  const missingLatest = Number(evidence.missing_latest_leagues);
  const comparable = Number(evidence.comparable_leagues);
  const tags = [];
  if (leaguesTotal > 0 && leaguesPresent < leaguesTotal) tags.push('league-specific');
  if (leaguesPresent === 0 || seasonGap > 0) tags.push('season-specific');
  const yearsComparable = leaguesPresent > 0 && comparable === leaguesPresent;
  if (yearsComparable && introducedLate === leaguesPresent && missingLatest === 0) tags.push('newly-introduced');
  if (yearsComparable && missingLatest === leaguesPresent) tags.push('deprecated-field');
  return tags;
}

export const PHASE5_SQL = `
SELECT
  (SELECT count(*)::int FROM fpt_schema_fields) AS registry_fields,
  (SELECT count(DISTINCT normalized_field)::int FROM fpt_schema_fields) AS normalized_names,
  (SELECT count(*)::int FROM fpt_field_coverage WHERE dimension = 'global') AS global_fields,
  (SELECT count(*)::int FROM fpt_schema_fields f
    WHERE NOT EXISTS (
      SELECT 1 FROM fpt_field_coverage c
      WHERE c.dimension = 'global' AND c.dimension_key = '' AND c.field_name = f.field_name
    )) AS missing_global,
  (SELECT count(*)::int FROM fpt_field_coverage
    WHERE dimension = 'global' AND (coverage_class IS NULL OR coverage_class NOT IN ('dense','sparse','always-empty'))) AS unclassified,
  (SELECT count(*)::int FROM fpt_field_coverage WHERE dimension = 'dataset') AS dataset_rows,
  (SELECT count(*)::int FROM fpt_field_coverage WHERE dimension = 'league') AS league_rows,
  (SELECT count(*)::int FROM fpt_field_coverage WHERE dimension = 'season') AS season_rows,
  (SELECT count(*)::int FROM fpt_field_coverage WHERE dimension = 'period') AS period_rows,
  (SELECT count(*)::int FROM fpt_field_coverage WHERE dimension = 'team') AS team_rows,
  (SELECT count(*)::int FROM fpt_field_coverage WHERE dimension = 'normalized') AS normalized_rows,
  a.payload_mismatches,
  a.rollup_mismatches,
  a.class_mismatches,
  a.historical_team_unresolved,
  a.today_country_unresolved,
  a.class_counts,
  a.tag_counts,
  a.computed_at
FROM fpt_coverage_audit a
WHERE a.audit_id = 1
`;

export function phase5Gate(row) {
  if (!row) return false;
  const keys = [
    'payload_mismatches', 'rollup_mismatches', 'class_mismatches', 'registry_fields',
    'global_fields', 'missing_global', 'unclassified', 'dataset_rows', 'league_rows',
    'season_rows', 'period_rows', 'team_rows', 'normalized_rows', 'normalized_names',
    'historical_team_unresolved'
  ];
  if (keys.some(key => row[key] === null || row[key] === undefined || Number.isNaN(Number(row[key])))) return false;
  const n = key => Number(row[key]);
  return n('payload_mismatches') === 0
    && n('rollup_mismatches') === 0
    && n('class_mismatches') === 0
    && n('registry_fields') > 0
    && n('global_fields') === n('registry_fields')
    && n('missing_global') === 0
    && n('unclassified') === 0
    && n('dataset_rows') > 0
    && n('league_rows') > 0
    && n('season_rows') > 0
    && n('period_rows') > 0
    && n('team_rows') > 0
    && n('normalized_rows') === n('normalized_names')
    && n('historical_team_unresolved') === 0;
}

function nonemptySql(expression) {
  return `NOT (lower(btrim(coalesce(${expression}, ''))) = ANY ($1::text[]))`;
}

const GRAIN_SQL = `
SELECT
  CASE
    WHEN GROUPING(v.dataset_key) = 0 THEN 'dataset'
    WHEN GROUPING(league_key) = 0 THEN 'league'
    WHEN GROUPING(season_key) = 0 THEN 'season'
    WHEN GROUPING(period_key) = 0 THEN 'period'
    ELSE 'global'
  END AS dimension,
  CASE
    WHEN GROUPING(v.dataset_key) = 0 THEN v.dataset_key
    WHEN GROUPING(league_key) = 0 THEN league_key
    WHEN GROUPING(season_key) = 0 THEN season_key
    WHEN GROUPING(period_key) = 0 THEN period_key
    ELSE ''
  END AS dimension_key,
  e.key AS field_name,
  count(*)::bigint AS rows_scoped,
  count(*) FILTER (WHERE ${nonemptySql('e.value')})::bigint AS nonempty_rows
FROM fpt_match_versions v
CROSS JOIN LATERAL jsonb_each_text(v.payload) AS e(key, value)
JOIN fpt_schema_fields f ON f.field_name = e.key
CROSS JOIN LATERAL (
  SELECT ${LEAGUE_KEY} AS league_key, ${SEASON_KEY} AS season_key, ${PERIOD_KEY} AS period_key
) dims
GROUP BY GROUPING SETS (
  (e.key),
  (v.dataset_key, e.key),
  (league_key, e.key),
  (season_key, e.key),
  (period_key, e.key)
)
`;

const EVIDENCE_SQL = `
WITH dims AS (
  SELECT DISTINCT dataset_key,
    ${LEAGUE_KEY} AS league_key,
    ${SEASON_KEY} AS season_key,
    substring(season FROM '^[0-9]{4}')::int AS start_year
  FROM fpt_match_versions
),
league_bounds AS (
  SELECT league_key,
         count(DISTINCT season_key)::int AS season_count,
         min(start_year) AS league_min,
         max(start_year) AS league_max
  FROM dims
  WHERE league_key <> 'unscoped'
  GROUP BY league_key
),
field_leagues AS (
  SELECT c.field_name, d.league_key,
         count(DISTINCT d.season_key) FILTER (WHERE d.season_key <> 'unscoped')::int AS field_seasons,
         min(d.start_year) AS field_min,
         max(d.start_year) AS field_max
  FROM fpt_field_coverage c
  JOIN dims d ON d.dataset_key = c.dimension_key
  WHERE c.dimension = 'dataset' AND d.league_key <> 'unscoped'
  GROUP BY c.field_name, d.league_key
)
SELECT
  g.field_name,
  g.rows_scoped,
  g.nonempty_rows,
  (SELECT count(*)::int FROM league_bounds) AS leagues_total,
  (SELECT count(DISTINCT season_key)::int FROM dims WHERE season_key <> 'unscoped') AS seasons_total,
  count(fl.league_key)::int AS leagues_present,
  count(fl.league_key) FILTER (WHERE fl.field_seasons < lb.season_count)::int AS season_gap_leagues,
  count(fl.league_key) FILTER (WHERE fl.field_min > lb.league_min)::int AS introduced_late_leagues,
  count(fl.league_key) FILTER (WHERE fl.field_max < lb.league_max)::int AS missing_latest_leagues,
  count(fl.league_key) FILTER (WHERE lb.league_min IS NOT NULL AND lb.league_max IS NOT NULL)::int AS comparable_leagues,
  COALESCE((
    SELECT sum(c.rows_scoped)::bigint
    FROM fpt_field_coverage c
    JOIN dims d ON d.dataset_key = c.dimension_key
    WHERE c.dimension = 'dataset' AND c.field_name = g.field_name AND d.league_key = 'unscoped'
  ), 0)::bigint AS unscoped_rows
FROM fpt_field_coverage g
LEFT JOIN field_leagues fl ON fl.field_name = g.field_name
LEFT JOIN league_bounds lb ON lb.league_key = fl.league_key
WHERE g.dimension = 'global' AND g.dimension_key = ''
GROUP BY g.field_name, g.rows_scoped, g.nonempty_rows
`;

function chunks(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function writeClasses(client, evidenceRows) {
  const payload = evidenceRows.map(row => {
    const coverage_class = coverageClass(row.rows_scoped, row.nonempty_rows);
    const coverage_tags = coverageTags(row);
    return {
      field_name: row.field_name,
      coverage_class,
      coverage_tags,
      evidence: {
        ...row,
        rows_scoped: Number(row.rows_scoped),
        nonempty_rows: Number(row.nonempty_rows),
        unscoped_rows: Number(row.unscoped_rows),
        dense_rule: `nonempty * ${DENSE_DENOMINATOR} >= rows * ${DENSE_NUMERATOR}`,
        nonempty_rule: 'trim/lower not in empty tokens shared with schema discovery',
        period_rule: 'calendar year of match_date, or undated',
        league_rule: 'country_slug/league_slug, or unscoped when either is null',
        season_rule: 'stored season, or unscoped when null',
        team_rule: 'internal_team_id resolved from home/away alias plus country_slug; null country_slug is not assigned',
        scope_tags_are_independent: true
      }
    };
  });
  await client.query(
    `UPDATE fpt_field_coverage AS c
     SET coverage_class = x.coverage_class,
         coverage_tags = x.coverage_tags,
         evidence = x.evidence,
         coverage_ratio = c.nonempty_rows::numeric / c.rows_scoped,
         computed_at = now()
     FROM jsonb_to_recordset($1::jsonb) AS x(field_name text, coverage_class text, coverage_tags jsonb, evidence jsonb)
     WHERE c.dimension = 'global' AND c.dimension_key = '' AND c.field_name = x.field_name`,
    [JSON.stringify(payload)]
  );
  const normalized = await client.query(
    `SELECT field_name, rows_scoped, nonempty_rows, evidence
     FROM fpt_field_coverage WHERE dimension = 'normalized'`
  );
  const normalizedPayload = normalized.rows.map(row => ({
    field_name: row.field_name,
    coverage_class: coverageClass(row.rows_scoped, row.nonempty_rows),
    evidence: {
      ...(row.evidence || {}),
      rows_scoped: Number(row.rows_scoped),
      nonempty_rows: Number(row.nonempty_rows),
      dense_rule: `nonempty * ${DENSE_DENOMINATOR} >= rows * ${DENSE_NUMERATOR}`,
      scope_tags: 'not applied; a normalized name can mix source feeds'
    }
  }));
  await client.query(
    `UPDATE fpt_field_coverage AS c
     SET coverage_class = x.coverage_class,
         coverage_tags = '[]'::jsonb,
         evidence = x.evidence,
         coverage_ratio = c.nonempty_rows::numeric / c.rows_scoped,
         computed_at = now()
     FROM jsonb_to_recordset($1::jsonb) AS x(field_name text, coverage_class text, evidence jsonb)
     WHERE c.dimension = 'normalized' AND c.field_name = x.field_name`,
    [JSON.stringify(normalizedPayload)]
  );
}

async function independentRecalc(client, fieldNames) {
  await client.query(`
    CREATE TEMP TABLE recalc_grain (
      field_name text NOT NULL,
      dataset_key text NOT NULL,
      league_key text NOT NULL,
      season_key text NOT NULL,
      period_key text NOT NULL,
      rows_scoped bigint NOT NULL,
      nonempty_rows bigint NOT NULL
    ) ON COMMIT DROP
  `);
  await client.query(`
    CREATE TEMP TABLE recalc_team (
      team_id text NOT NULL,
      field_name text NOT NULL,
      rows_scoped bigint NOT NULL,
      nonempty_rows bigint NOT NULL
    ) ON COMMIT DROP
  `);
  for (const batch of chunks(fieldNames, 20)) {
    await client.query(
      `INSERT INTO recalc_grain(field_name, dataset_key, league_key, season_key, period_key, rows_scoped, nonempty_rows)
       SELECT f.field_name, v.dataset_key, ${LEAGUE_KEY}, ${SEASON_KEY}, ${PERIOD_KEY},
              count(*)::bigint,
              count(*) FILTER (WHERE ${nonemptySql('v.payload->>f.field_name')})::bigint
       FROM unnest($2::text[]) AS f(field_name)
       JOIN fpt_match_versions v ON v.payload ? f.field_name
       GROUP BY f.field_name, v.dataset_key, 3, 4, 5`,
      [EMPTY_TOKENS, batch]
    );
    await client.query(
      `INSERT INTO recalc_team(team_id, field_name, rows_scoped, nonempty_rows)
       SELECT side.internal_team_id, f.field_name,
              count(*)::bigint,
              count(*) FILTER (WHERE ${nonemptySql('v.payload->>f.field_name')})::bigint
       FROM unnest($2::text[]) AS f(field_name)
       JOIN fpt_match_versions v ON v.payload ? f.field_name
       JOIN LATERAL (
         SELECT t.internal_team_id
         FROM fpt_team_aliases a
         JOIN fpt_teams t ON t.internal_team_id = a.internal_team_id
         WHERE t.country_slug = v.country_slug AND a.name = v.home
         UNION
         SELECT t.internal_team_id
         FROM fpt_team_aliases a
         JOIN fpt_teams t ON t.internal_team_id = a.internal_team_id
         WHERE t.country_slug = v.country_slug AND a.name = v.away
       ) side ON true
       GROUP BY side.internal_team_id, f.field_name`,
      [EMPTY_TOKENS, batch]
    );
  }
}

const ROLLED_SQL = `
SELECT 'global' AS dimension, '' AS dimension_key, field_name, sum(rows_scoped)::bigint AS rows_scoped, sum(nonempty_rows)::bigint AS nonempty_rows
FROM recalc_grain GROUP BY field_name
UNION ALL
SELECT 'dataset', dataset_key, field_name, sum(rows_scoped)::bigint, sum(nonempty_rows)::bigint
FROM recalc_grain GROUP BY dataset_key, field_name
UNION ALL
SELECT 'league', league_key, field_name, sum(rows_scoped)::bigint, sum(nonempty_rows)::bigint
FROM recalc_grain GROUP BY league_key, field_name
UNION ALL
SELECT 'season', season_key, field_name, sum(rows_scoped)::bigint, sum(nonempty_rows)::bigint
FROM recalc_grain GROUP BY season_key, field_name
UNION ALL
SELECT 'period', period_key, field_name, sum(rows_scoped)::bigint, sum(nonempty_rows)::bigint
FROM recalc_grain GROUP BY period_key, field_name
UNION ALL
SELECT 'team', team_id, field_name, rows_scoped, nonempty_rows FROM recalc_team
`;

async function mismatchCount(client) {
  const diff = await client.query(`
    WITH rolled AS (${ROLLED_SQL}),
    stored AS (
      SELECT dimension, dimension_key, field_name, rows_scoped, nonempty_rows
      FROM fpt_field_coverage
      WHERE dimension IN ('global','dataset','league','season','period','team')
    ),
    delta AS (
      SELECT s.dimension, s.dimension_key, s.field_name, s.rows_scoped AS stored_rows, r.rows_scoped AS recalc_rows,
             s.nonempty_rows AS stored_nonempty, r.nonempty_rows AS recalc_nonempty
      FROM stored s
      FULL OUTER JOIN rolled r USING (dimension, dimension_key, field_name)
      WHERE s.rows_scoped IS DISTINCT FROM r.rows_scoped
         OR s.nonempty_rows IS DISTINCT FROM r.nonempty_rows
    )
    SELECT count(*)::int AS n FROM delta
  `);
  const sample = await client.query(`
    WITH rolled AS (${ROLLED_SQL})
    SELECT s.dimension, s.dimension_key, COALESCE(s.field_name, r.field_name) AS field_name,
           s.rows_scoped AS stored_rows, r.rows_scoped AS recalc_rows,
           s.nonempty_rows AS stored_nonempty, r.nonempty_rows AS recalc_nonempty
    FROM (
      SELECT dimension, dimension_key, field_name, rows_scoped, nonempty_rows
      FROM fpt_field_coverage
      WHERE dimension IN ('global','dataset','league','season','period','team')
    ) s
    FULL OUTER JOIN rolled r USING (dimension, dimension_key, field_name)
    WHERE s.rows_scoped IS DISTINCT FROM r.rows_scoped
       OR s.nonempty_rows IS DISTINCT FROM r.nonempty_rows
    LIMIT 20
  `);
  return {n: diff.rows[0].n, sample: sample.rows};
}

async function normalizedOverlap(client) {
  const overlap = await client.query(`
    SELECT count(*)::int AS versions
    FROM (
      SELECT v.version_id
      FROM fpt_match_versions v
      JOIN fpt_field_transforms t ON v.payload ? t.source_field
      WHERE t.normalized_field IN (
        SELECT normalized_field FROM fpt_field_transforms GROUP BY normalized_field HAVING count(*) > 1
      )
      GROUP BY v.version_id, t.normalized_field
      HAVING count(*) > 1
    ) s
  `);
  return overlap.rows[0].versions;
}

async function normalizedMismatch(client) {
  const overlap = await normalizedOverlap(client);
  const diff = await client.query(`
    WITH expected AS (
      SELECT t.normalized_field AS field_name,
             sum(g.rows_scoped)::bigint AS rows_scoped,
             sum(g.nonempty_rows)::bigint AS nonempty_rows
      FROM (
        SELECT field_name, sum(rows_scoped)::bigint AS rows_scoped, sum(nonempty_rows)::bigint AS nonempty_rows
        FROM recalc_grain
        GROUP BY field_name
      ) g
      JOIN fpt_field_transforms t ON t.source_field = g.field_name
      GROUP BY t.normalized_field
    )
    SELECT count(*)::int AS n
    FROM fpt_field_coverage c
    FULL OUTER JOIN expected e ON e.field_name = c.field_name
    WHERE c.dimension = 'normalized'
      AND (c.rows_scoped IS DISTINCT FROM e.rows_scoped OR c.nonempty_rows IS DISTINCT FROM e.nonempty_rows
           OR c.field_name IS NULL OR e.field_name IS NULL)
  `);
  return {overlap_versions: overlap, mismatches: overlap > 0 ? diff.rows[0].n + overlap : diff.rows[0].n};
}

function evidenceFromGrainSql() {
  return `
    WITH dims AS (
      SELECT DISTINCT dataset_key,
        ${LEAGUE_KEY} AS league_key,
        ${SEASON_KEY} AS season_key,
        substring(season FROM '^[0-9]{4}')::int AS start_year
      FROM fpt_match_versions
    ),
    league_bounds AS (
      SELECT league_key,
             count(DISTINCT season_key)::int AS season_count,
             min(start_year) AS league_min,
             max(start_year) AS league_max
      FROM dims
      WHERE league_key <> 'unscoped'
      GROUP BY league_key
    ),
    field_leagues AS (
      SELECT g.field_name, d.league_key,
             count(DISTINCT d.season_key) FILTER (WHERE d.season_key <> 'unscoped')::int AS field_seasons,
             min(d.start_year) AS field_min,
             max(d.start_year) AS field_max
      FROM (
        SELECT field_name, dataset_key FROM recalc_grain GROUP BY field_name, dataset_key
      ) g
      JOIN dims d ON d.dataset_key = g.dataset_key
      WHERE d.league_key <> 'unscoped'
      GROUP BY g.field_name, d.league_key
    ),
    totals AS (
      SELECT field_name, sum(rows_scoped)::bigint AS rows_scoped, sum(nonempty_rows)::bigint AS nonempty_rows
      FROM recalc_grain
      GROUP BY field_name
    )
    SELECT t.field_name, t.rows_scoped, t.nonempty_rows,
           (SELECT count(*)::int FROM league_bounds) AS leagues_total,
           count(fl.league_key)::int AS leagues_present,
           count(fl.league_key) FILTER (WHERE fl.field_seasons < lb.season_count)::int AS season_gap_leagues,
           count(fl.league_key) FILTER (WHERE fl.field_min > lb.league_min)::int AS introduced_late_leagues,
           count(fl.league_key) FILTER (WHERE fl.field_max < lb.league_max)::int AS missing_latest_leagues,
           count(fl.league_key) FILTER (WHERE lb.league_min IS NOT NULL AND lb.league_max IS NOT NULL)::int AS comparable_leagues
    FROM totals t
    LEFT JOIN field_leagues fl ON fl.field_name = t.field_name
    LEFT JOIN league_bounds lb ON lb.league_key = fl.league_key
    GROUP BY t.field_name, t.rows_scoped, t.nonempty_rows
  `;
}

export async function rebuildCoverage(client) {
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL statement_timeout = '0'");
    await client.query("SET LOCAL work_mem = '256MB'");
    await client.query('DELETE FROM fpt_field_coverage');
    await client.query(
      `INSERT INTO fpt_field_coverage(dimension, dimension_key, field_name, rows_scoped, nonempty_rows, coverage_ratio)
       SELECT dimension, dimension_key, field_name, rows_scoped, nonempty_rows,
              nonempty_rows::numeric / rows_scoped
       FROM (${GRAIN_SQL}) s`,
      [EMPTY_TOKENS]
    );
    await client.query(
      `INSERT INTO fpt_field_coverage(dimension, dimension_key, field_name, rows_scoped, nonempty_rows, coverage_ratio)
       SELECT 'team', side.internal_team_id, e.key, count(*)::bigint,
              count(*) FILTER (WHERE ${nonemptySql('e.value')})::bigint,
              (count(*) FILTER (WHERE ${nonemptySql('e.value')}))::numeric / count(*)
       FROM fpt_match_versions v
       JOIN LATERAL (
         SELECT t.internal_team_id
         FROM fpt_team_aliases a
         JOIN fpt_teams t ON t.internal_team_id = a.internal_team_id
         WHERE t.country_slug = v.country_slug AND a.name = v.home
         UNION
         SELECT t.internal_team_id
         FROM fpt_team_aliases a
         JOIN fpt_teams t ON t.internal_team_id = a.internal_team_id
         WHERE t.country_slug = v.country_slug AND a.name = v.away
       ) side ON true
       CROSS JOIN LATERAL jsonb_each_text(v.payload) AS e(key, value)
       JOIN fpt_schema_fields f ON f.field_name = e.key
       GROUP BY side.internal_team_id, e.key`,
      [EMPTY_TOKENS]
    );
    const overlap = await normalizedOverlap(client);
    if (overlap > 0) {
      await client.query(
        `INSERT INTO fpt_field_coverage(dimension, dimension_key, field_name, rows_scoped, nonempty_rows, coverage_ratio, evidence)
         SELECT 'normalized', normalized_field, normalized_field, rows_scoped, nonempty_rows,
                nonempty_rows::numeric / rows_scoped,
                jsonb_build_object('source_fields', source_fields, 'rule', 'distinct stored version; nonempty if any source value is nonempty')
         FROM (
           SELECT per.normalized_field,
                  count(*)::bigint AS rows_scoped,
                  count(*) FILTER (WHERE per.nonempty)::bigint AS nonempty_rows,
                  (SELECT jsonb_agg(source_field ORDER BY source_field) FROM fpt_field_transforms src WHERE src.normalized_field = per.normalized_field) AS source_fields
           FROM (
             SELECT t.normalized_field, v.version_id,
                    bool_or(${nonemptySql('v.payload->>t.source_field')}) AS nonempty
             FROM fpt_match_versions v
             JOIN fpt_field_transforms t ON v.payload ? t.source_field
             GROUP BY t.normalized_field, v.version_id
           ) per
           GROUP BY per.normalized_field
         ) s`,
        [EMPTY_TOKENS]
      );
    } else {
      await client.query(
        `INSERT INTO fpt_field_coverage(dimension, dimension_key, field_name, rows_scoped, nonempty_rows, coverage_ratio, evidence)
         SELECT 'normalized', t.normalized_field, t.normalized_field,
                sum(c.rows_scoped)::bigint,
                sum(c.nonempty_rows)::bigint,
                sum(c.nonempty_rows)::numeric / sum(c.rows_scoped),
                jsonb_build_object(
                  'source_fields', jsonb_agg(t.source_field ORDER BY t.source_field),
                  'rule', 'sum of source fields; no stored version contains two source keys of the same normalized field'
                )
         FROM fpt_field_coverage c
         JOIN fpt_field_transforms t ON t.source_field = c.field_name
         WHERE c.dimension = 'global' AND c.dimension_key = ''
         GROUP BY t.normalized_field`
      );
    }
    const fields = await client.query('SELECT field_name FROM fpt_schema_fields ORDER BY field_name');
    await independentRecalc(client, fields.rows.map(row => row.field_name));
    const compared = await mismatchCount(client);
    const normalized = await normalizedMismatch(client);
    const evidence = await client.query(EVIDENCE_SQL);
    await writeClasses(client, evidence.rows);
    const recalcEvidence = await client.query(evidenceFromGrainSql());
    const storedClass = await client.query(
      `SELECT field_name, coverage_class, coverage_tags
       FROM fpt_field_coverage WHERE dimension = 'global' ORDER BY field_name`
    );
    const recalcByName = new Map(recalcEvidence.rows.map(row => [row.field_name, row]));
    let classMismatches = 0;
    for (const stored of storedClass.rows) {
      const again = recalcByName.get(stored.field_name);
      if (!again) {
        classMismatches += 1;
        continue;
      }
      const expectedClass = coverageClass(again.rows_scoped, again.nonempty_rows);
      const expectedTags = coverageTags(again);
      const storedTags = [...stored.coverage_tags].sort();
      if (stored.coverage_class !== expectedClass || storedTags.join('|') !== [...expectedTags].sort().join('|')) classMismatches += 1;
    }
    const unresolved = await client.query(`
      SELECT
        count(*) FILTER (WHERE country_slug IS NULL)::int AS today_country_unresolved,
        count(*) FILTER (WHERE country_slug IS NOT NULL AND (
          NOT EXISTS (
            SELECT 1 FROM fpt_team_aliases a
            JOIN fpt_teams t ON t.internal_team_id = a.internal_team_id
            WHERE t.country_slug = v.country_slug AND a.name = v.home
          )
          OR NOT EXISTS (
            SELECT 1 FROM fpt_team_aliases a
            JOIN fpt_teams t ON t.internal_team_id = a.internal_team_id
            WHERE t.country_slug = v.country_slug AND a.name = v.away
          )
        ))::int AS historical_team_unresolved
      FROM fpt_match_versions v
    `);
    const classCounts = await client.query(
      `SELECT coverage_class, count(*)::int AS n
       FROM fpt_field_coverage WHERE dimension = 'global' GROUP BY coverage_class ORDER BY coverage_class`
    );
    const tagCounts = await client.query(
      `SELECT tag, count(*)::int AS n
       FROM fpt_field_coverage, LATERAL jsonb_array_elements_text(coverage_tags) AS tag
       WHERE dimension = 'global'
       GROUP BY tag ORDER BY tag`
    );
    const payloadMismatches = compared.n + normalized.mismatches;
    const mixed = await client.query(`
      SELECT count(*)::int AS n FROM (
        SELECT dataset_key FROM fpt_match_versions
        GROUP BY dataset_key
        HAVING count(DISTINCT COALESCE(country_slug, '') || '/' || COALESCE(league_slug, '') || '/' || COALESCE(season, '')) > 1
      ) s
    `);
    const rollup = await client.query(`
      WITH dims AS (
        SELECT DISTINCT dataset_key,
          ${LEAGUE_KEY} AS league_key,
          ${SEASON_KEY} AS season_key
        FROM fpt_match_versions
      ),
      dataset_global AS (
        SELECT count(*)::int AS n
        FROM fpt_field_coverage g
        JOIN (
          SELECT field_name, sum(rows_scoped)::bigint AS rows_scoped, sum(nonempty_rows)::bigint AS nonempty_rows
          FROM fpt_field_coverage WHERE dimension = 'dataset'
          GROUP BY field_name
        ) d USING (field_name)
        WHERE g.dimension = 'global' AND g.dimension_key = ''
          AND (g.rows_scoped <> d.rows_scoped OR g.nonempty_rows <> d.nonempty_rows)
      ),
      league_gap AS (
        SELECT count(*)::int AS n
        FROM fpt_field_coverage league
        JOIN (
          SELECT d.league_key, c.field_name, sum(c.rows_scoped)::bigint AS rows_scoped, sum(c.nonempty_rows)::bigint AS nonempty_rows
          FROM fpt_field_coverage c
          JOIN dims d ON d.dataset_key = c.dimension_key
          WHERE c.dimension = 'dataset'
          GROUP BY d.league_key, c.field_name
        ) m ON m.league_key = league.dimension_key AND m.field_name = league.field_name
        WHERE league.dimension = 'league'
          AND (league.rows_scoped <> m.rows_scoped OR league.nonempty_rows <> m.nonempty_rows)
      ),
      season_gap AS (
        SELECT count(*)::int AS n
        FROM fpt_field_coverage season
        JOIN (
          SELECT d.season_key, c.field_name, sum(c.rows_scoped)::bigint AS rows_scoped, sum(c.nonempty_rows)::bigint AS nonempty_rows
          FROM fpt_field_coverage c
          JOIN dims d ON d.dataset_key = c.dimension_key
          WHERE c.dimension = 'dataset'
          GROUP BY d.season_key, c.field_name
        ) m ON m.season_key = season.dimension_key AND m.field_name = season.field_name
        WHERE season.dimension = 'season'
          AND (season.rows_scoped <> m.rows_scoped OR season.nonempty_rows <> m.nonempty_rows)
      )
      SELECT (SELECT n FROM dataset_global) + (SELECT n FROM league_gap) + (SELECT n FROM season_gap) AS n
    `);
    const audit = {
      payload_mismatches: payloadMismatches,
      rollup_mismatches: rollup.rows[0].n + mixed.rows[0].n,
      class_mismatches: classMismatches,
      historical_team_unresolved: unresolved.rows[0].historical_team_unresolved,
      today_country_unresolved: unresolved.rows[0].today_country_unresolved,
      class_counts: Object.fromEntries(classCounts.rows.map(row => [row.coverage_class, row.n])),
      tag_counts: Object.fromEntries(tagCounts.rows.map(row => [row.tag, row.n])),
      overlap_versions: normalized.overlap_versions,
      sample: compared.sample
    };
    await client.query(
      `INSERT INTO fpt_coverage_audit(
         audit_id, computed_at, payload_mismatches, rollup_mismatches, class_mismatches,
         historical_team_unresolved, today_country_unresolved, class_counts, tag_counts, evidence
       ) VALUES (1, now(), $1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb)
       ON CONFLICT (audit_id) DO UPDATE SET
         computed_at = excluded.computed_at,
         payload_mismatches = excluded.payload_mismatches,
         rollup_mismatches = excluded.rollup_mismatches,
         class_mismatches = excluded.class_mismatches,
         historical_team_unresolved = excluded.historical_team_unresolved,
         today_country_unresolved = excluded.today_country_unresolved,
         class_counts = excluded.class_counts,
         tag_counts = excluded.tag_counts,
         evidence = excluded.evidence`,
      [
        audit.payload_mismatches,
        audit.rollup_mismatches,
        audit.class_mismatches,
        audit.historical_team_unresolved,
        audit.today_country_unresolved,
        JSON.stringify(audit.class_counts),
        JSON.stringify(audit.tag_counts),
        JSON.stringify({overlap_versions: audit.overlap_versions, sample: audit.sample, empty_tokens: EMPTY_TOKENS})
      ]
    );
    await client.query('COMMIT');
    return audit;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
