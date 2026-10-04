import { aliasCandidateNames } from './schema.mjs';

export const PHASE4_SQL = `
WITH raw AS (
  SELECT DISTINCT h AS field
  FROM fpt_raw_snapshots
  CROSS JOIN LATERAL jsonb_array_elements_text(headers) AS h
),
reg AS (
  SELECT field_name FROM fpt_schema_fields
)
SELECT
  (SELECT count(*)::int FROM raw) AS raw_unique_fields,
  (SELECT count(*)::int FROM reg) AS registry_unique_fields,
  (SELECT count(*)::int FROM raw r WHERE NOT EXISTS (SELECT 1 FROM reg g WHERE g.field_name = r.field)) AS missing_from_registry,
  (SELECT count(*)::int FROM reg g WHERE NOT EXISTS (SELECT 1 FROM raw r WHERE r.field = g.field_name)) AS extra_in_registry,
  (SELECT count(*)::int FROM fpt_schema_fields WHERE normalized_field IS NULL OR btrim(normalized_field) = '') AS missing_normalized,
  (SELECT count(*)::int FROM fpt_schema_fields WHERE type_history = '[]'::jsonb) AS missing_type_history,
  (SELECT count(*)::int FROM fpt_field_transforms) AS transforms,
  (SELECT count(*)::int FROM fpt_match_versions WHERE phase='HISTORICAL' AND (parser_version IS NULL OR schema_version IS NULL OR transform_version IS NULL OR source_provider IS NULL)) AS versions_without_lineage
`;

export function phase4Gate(row, {suppressedAliases = 0} = {}) {
  const raw = Number(row.raw_unique_fields) || 0;
  const registry = Number(row.registry_unique_fields) || 0;
  const suppressed = Number(suppressedAliases) || 0;
  return raw - suppressed === registry - suppressed
    && Number(row.missing_from_registry) === 0
    && Number(row.extra_in_registry) === 0
    && Number(row.missing_normalized) === 0
    && Number(row.missing_type_history) === 0
    && Number(row.transforms) === registry
    && Number(row.versions_without_lineage) === 0
    && raw === registry;
}

export async function refreshAliasCandidates(client) {
  const fields = await client.query('SELECT field_name FROM fpt_schema_fields');
  const names = new Set(fields.rows.map(row => row.field_name));
  const updates = [];
  for (const name of names) {
    const candidates = aliasCandidateNames(name).filter(candidate => names.has(candidate));
    updates.push({field_name: name, alias_candidates: candidates});
  }
  await client.query(
    `UPDATE fpt_schema_fields AS f
     SET alias_candidates = x.alias_candidates
     FROM jsonb_to_recordset($1::jsonb) AS x(field_name text, alias_candidates jsonb)
     WHERE f.field_name = x.field_name`,
    [JSON.stringify(updates)]
  );
  return {fields: updates.length, with_candidates: updates.filter(row => row.alias_candidates.length).length};
}

export async function loadLineageProof(client) {
  const home = await client.query(
    `SELECT v.dataset_key, v.snapshot_id, v.provider_match_id, v.source_provider,
            v.parser_version, v.schema_version, v.transform_version, v.acquired_at,
            t.source_field, t.normalized_field, t.transform,
            v.payload->>t.source_field AS raw_value,
            v.home AS normalized_value,
            r.sha256 IS NOT NULL AS snapshot_present,
            btrim(v.payload->>t.source_field) = v.home AS raw_matches_normalized
     FROM fpt_match_versions v
     JOIN fpt_raw_snapshots r ON r.snapshot_id = v.snapshot_id
     JOIN fpt_field_transforms t ON t.source_field = 'Home'
     WHERE v.phase = 'HISTORICAL' AND v.home IS NOT NULL
     ORDER BY v.version_id
     LIMIT 1`
  );
  const date = await client.query(
    `SELECT v.dataset_key, v.snapshot_id, v.provider_match_id, v.source_provider,
            v.parser_version, v.schema_version, v.transform_version, v.acquired_at,
            t.source_field, t.normalized_field, t.transform,
            v.payload->>'Date' AS raw_value,
            v.match_date::text AS normalized_value,
            r.sha256 IS NOT NULL AS snapshot_present
     FROM fpt_match_versions v
     JOIN fpt_raw_snapshots r ON r.snapshot_id = v.snapshot_id
     JOIN fpt_field_transforms t ON t.source_field = 'Date'
     WHERE v.phase = 'HISTORICAL' AND v.match_date IS NOT NULL AND COALESCE(v.payload->>'Date','') <> ''
     ORDER BY v.version_id
     LIMIT 1`
  );
  return {home: home.rows[0] || null, date: date.rows[0] || null};
}
