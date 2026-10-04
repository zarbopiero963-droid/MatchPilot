ALTER TABLE fpt_schema_fields
  ADD COLUMN IF NOT EXISTS type_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS type_collision boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS seasons_seen jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS alias_candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS normalized_field text,
  ADD COLUMN IF NOT EXISTS queryable boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS filterable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS unique_rows_seen bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_provider text NOT NULL DEFAULT 'futpythontrader',
  ADD COLUMN IF NOT EXISTS source_kinds jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE fpt_schema_fields
SET normalized_field = lower(field_name),
    type_history = CASE
      WHEN type_history = '[]'::jsonb
      THEN jsonb_build_array(jsonb_build_object('type', inferred_type, 'recorded_at', first_seen_at))
      ELSE type_history END,
    queryable = true,
    filterable = inferred_type IN ('integer','number','boolean','date_or_datetime')
      OR field_name IN ('Home','Away','Date','Time','Season','League','Country','Round','Match_ID','Id'),
    source_provider = 'futpythontrader'
WHERE normalized_field IS NULL;

UPDATE fpt_schema_fields SET normalized_field = 'home' WHERE field_name IN ('Home','home');
UPDATE fpt_schema_fields SET normalized_field = 'away' WHERE field_name IN ('Away','away');
UPDATE fpt_schema_fields SET normalized_field = 'match_date' WHERE field_name IN ('Date','date');
UPDATE fpt_schema_fields SET normalized_field = 'match_time' WHERE field_name IN ('Time','time');
UPDATE fpt_schema_fields SET normalized_field = 'provider_match_id'
WHERE field_name IN ('Match_ID','Id','ID','id','Match_Id','match_id');

ALTER TABLE fpt_match_versions
  ADD COLUMN IF NOT EXISTS source_provider text NOT NULL DEFAULT 'futpythontrader',
  ADD COLUMN IF NOT EXISTS parser_version text NOT NULL DEFAULT 'fpt-csv-1',
  ADD COLUMN IF NOT EXISTS schema_version text NOT NULL DEFAULT 'fpt-schema-4',
  ADD COLUMN IF NOT EXISTS transform_version text NOT NULL DEFAULT 'fpt-norm-1';

CREATE TABLE IF NOT EXISTS fpt_field_transforms (
  source_field text PRIMARY KEY REFERENCES fpt_schema_fields(field_name),
  normalized_field text NOT NULL,
  source_provider text NOT NULL,
  parser_version text NOT NULL,
  schema_version text NOT NULL,
  transform_version text NOT NULL,
  transform text NOT NULL
);

INSERT INTO fpt_field_transforms(
  source_field, normalized_field, source_provider, parser_version, schema_version, transform_version, transform
)
SELECT field_name, normalized_field, 'futpythontrader', 'fpt-csv-1', 'fpt-schema-4', 'fpt-norm-1',
  CASE
    WHEN field_name IN ('Date','date') THEN 'dmy_or_iso_date'
    WHEN normalized_field IN ('home','away','match_time','provider_match_id') THEN 'copy'
    ELSE 'payload_text'
  END
FROM fpt_schema_fields
ON CONFLICT (source_field) DO UPDATE SET
  normalized_field = excluded.normalized_field,
  transform = excluded.transform,
  schema_version = excluded.schema_version,
  transform_version = excluded.transform_version;

WITH snap AS (
  SELECT r.snapshot_id, r.headers, r.source_kind, c.season,
         (SELECT count(*)::bigint FROM fpt_match_versions v WHERE v.snapshot_id = r.snapshot_id) AS match_rows
  FROM fpt_raw_snapshots r
  LEFT JOIN fpt_catalog c ON c.dataset_key = r.dataset_key
),
exploded AS (
  SELECT h AS field_name, snap.season, snap.source_kind, snap.match_rows
  FROM snap
  CROSS JOIN LATERAL jsonb_array_elements_text(snap.headers) AS h
),
agg AS (
  SELECT field_name,
         sum(match_rows)::bigint AS unique_rows,
         COALESCE(jsonb_agg(DISTINCT season) FILTER (WHERE season IS NOT NULL), '[]'::jsonb) AS seasons,
         COALESCE(jsonb_agg(DISTINCT source_kind) FILTER (WHERE source_kind IS NOT NULL), '[]'::jsonb) AS sources
  FROM exploded
  GROUP BY field_name
)
UPDATE fpt_schema_fields AS f
SET unique_rows_seen = agg.unique_rows,
    seasons_seen = agg.seasons,
    source_kinds = agg.sources
FROM agg
WHERE f.field_name = agg.field_name;
