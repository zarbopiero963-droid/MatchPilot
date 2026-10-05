-- FPT-PR-09 (#12 filter metadata registry): source, normalized fact column, real index usage,
-- first_seen/last_seen and the phases where the field appears.

ALTER TABLE fpt_filter_registry
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS fact_column text,
  ADD COLUMN IF NOT EXISTS indexed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS index_names jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS first_seen timestamptz,
  ADD COLUMN IF NOT EXISTS last_seen timestamptz,
  ADD COLUMN IF NOT EXISTS phases jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Which typed fpt_match_facts column a raw field feeds. A field without a column is read from the payload.
CREATE TABLE IF NOT EXISTS fpt_fact_columns (
  field_name text PRIMARY KEY,
  fact_column text NOT NULL,
  mapping text NOT NULL CHECK (mapping IN ('direct','resolved','derived'))
);

INSERT INTO fpt_fact_columns(field_name, fact_column, mapping) VALUES
  ('Home', 'home_team_id', 'resolved'),
  ('Away', 'away_team_id', 'resolved'),
  ('Date', 'match_date', 'direct'),
  ('Time', 'kickoff_local_time', 'direct'),
  ('Match_ID', 'provider_match_id', 'direct'),
  ('Id', 'provider_match_id', 'direct'),
  ('League', 'internal_competition_id', 'resolved'),
  ('Country', 'internal_competition_id', 'resolved'),
  ('Season', 'season_id', 'resolved'),
  ('Home_Score', 'home_score', 'direct'),
  ('Away_Score', 'away_score', 'direct'),
  ('Odd_1_FT', 'odd_home', 'direct'),
  ('Odd_H_FT', 'odd_home', 'direct'),
  ('Odd_X_FT', 'odd_draw', 'direct'),
  ('Odd_D_FT', 'odd_draw', 'direct'),
  ('Odd_2_FT', 'odd_away', 'direct'),
  ('Odd_A_FT', 'odd_away', 'direct'),
  ('Over_FT_2_5', 'odd_over25', 'direct'),
  ('Odd_Over25_FT', 'odd_over25', 'direct'),
  ('Under_FT_2_5', 'odd_under25', 'direct'),
  ('Odd_Under25_FT', 'odd_under25', 'direct'),
  ('BTTS_Yes', 'odd_btts_yes', 'direct'),
  ('Odd_BTTS_Yes', 'odd_btts_yes', 'direct'),
  ('xG_Home_FT', 'xg_home', 'direct'),
  ('xG_Away_FT', 'xg_away', 'direct')
ON CONFLICT (field_name) DO UPDATE SET fact_column = excluded.fact_column, mapping = excluded.mapping;

CREATE OR REPLACE FUNCTION fpt_refresh_filter_registry()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE v_rows integer;
BEGIN
  INSERT INTO fpt_filter_registry(
    field_name, normalized_field, family, data_type, filterable, operators, timing_class, prematch_safe,
    missing_tokens, zero_is_missing, rows_scoped, nonempty_rows, coverage_ratio, provenance, registry_version, refreshed_at,
    source, fact_column, indexed, index_names, first_seen, last_seen, phases
  )
  WITH phase_map AS (
    -- Header keys are unnested once per refresh, then joined to the fields.
    SELECT h AS field_name,
           jsonb_agg(DISTINCT CASE r.source_kind WHEN 'dataset' THEN 'HISTORICAL' WHEN 'today' THEN 'PREMATCH' ELSE upper(r.source_kind) END) AS phases
    FROM fpt_raw_snapshots r
    CROSS JOIN LATERAL jsonb_array_elements_text(r.headers) AS h
    GROUP BY h
  )
  SELECT f.field_name,
         COALESCE(f.normalized_field, lower(f.field_name)),
         f.family,
         f.inferred_type,
         f.filterable,
         CASE
           WHEN f.inferred_type IN ('integer','number','date_or_datetime')
             THEN '["eq","neq","gt","gte","lt","lte","between","is_null"]'::jsonb
           WHEN f.inferred_type = 'boolean' THEN '["eq","is_null"]'::jsonb
           ELSE '["eq","neq","in","is_null"]'::jsonb
         END,
         t.timing_class,
         t.timing_class <> 'POSTMATCH_OUTCOME',
         '["","null","undefined","nan","na","n/a","-"]'::jsonb,
         f.family = 'market' AND f.inferred_type IN ('integer','number'),
         c.rows_scoped,
         c.nonempty_rows,
         c.coverage_ratio,
         jsonb_build_object(
           'source_provider', f.source_provider,
           'registry', 'fpt_schema_fields',
           'coverage', CASE WHEN c.field_name IS NULL THEN NULL ELSE 'fpt_field_coverage.global' END,
           'timing_rule', 'family',
           'fact_mapping', fc.mapping,
           'index_rule', 'valid, non-partial index on fpt_match_facts whose leading column is fact_column'
         ),
         'fpt-filters-2',
         now(),
         CASE WHEN fc.fact_column IS NULL THEN 'fpt_match_versions.payload'
              ELSE 'fpt_match_facts.' || fc.fact_column END,
         fc.fact_column,
         COALESCE(ix.names, '[]'::jsonb) <> '[]'::jsonb,
         COALESCE(ix.names, '[]'::jsonb),
         f.first_seen_at,
         f.last_seen_at,
         -- Phases come from the raw snapshot headers themselves, not from a cached list.
         COALESCE(pm.phases, '[]'::jsonb)
  FROM fpt_schema_fields f
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN f.family = 'identity' THEN 'PREMATCH_IDENTITY'
      WHEN f.family = 'market' THEN 'PREMATCH_MARKET_UNTIMED'
      ELSE 'POSTMATCH_OUTCOME'
    END AS timing_class
  ) t
  LEFT JOIN fpt_field_coverage c
    ON c.dimension = 'global' AND c.dimension_key = '' AND c.field_name = f.field_name
  LEFT JOIN fpt_fact_columns fc ON fc.field_name = f.field_name
  LEFT JOIN phase_map pm ON pm.field_name = f.field_name
  LEFT JOIN LATERAL (
    -- Read from the catalog, not declared: the index must exist with fact_column as leading key.
    SELECT jsonb_agg(ic.relname ORDER BY ic.relname) AS names
    FROM pg_index i
    JOIN pg_class ic ON ic.oid = i.indexrelid
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
    WHERE i.indrelid = 'fpt_match_facts'::regclass
      AND i.indisvalid
      AND i.indpred IS NULL
      AND a.attname = fc.fact_column
  ) ix ON true
  ON CONFLICT (field_name) DO UPDATE SET
    normalized_field = excluded.normalized_field,
    family = excluded.family,
    data_type = excluded.data_type,
    filterable = excluded.filterable,
    operators = excluded.operators,
    timing_class = excluded.timing_class,
    prematch_safe = excluded.prematch_safe,
    missing_tokens = excluded.missing_tokens,
    zero_is_missing = excluded.zero_is_missing,
    rows_scoped = excluded.rows_scoped,
    nonempty_rows = excluded.nonempty_rows,
    coverage_ratio = excluded.coverage_ratio,
    provenance = excluded.provenance,
    registry_version = excluded.registry_version,
    refreshed_at = excluded.refreshed_at,
    source = excluded.source,
    fact_column = excluded.fact_column,
    indexed = excluded.indexed,
    index_names = excluded.index_names,
    first_seen = excluded.first_seen,
    last_seen = excluded.last_seen,
    phases = excluded.phases;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END
$$;

SELECT fpt_refresh_filter_registry();
