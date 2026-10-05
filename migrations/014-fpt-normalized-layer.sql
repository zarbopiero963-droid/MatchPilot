-- FPT-PR-09: request ledger fields, family fixes, normalized facts, filter registry, team links.
-- Nothing here rewrites raw snapshots or match versions.

ALTER TABLE fpt_request_ledger
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'futpythontrader',
  ADD COLUMN IF NOT EXISTS endpoint_family text,
  ADD COLUMN IF NOT EXISTS latency_ms integer,
  ADD COLUMN IF NOT EXISTS deduped boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS budget_state text,
  ADD COLUMN IF NOT EXISTS budget_remaining_day integer,
  ADD COLUMN IF NOT EXISTS budget_remaining_minute integer,
  ADD COLUMN IF NOT EXISTS provider_quota_remaining integer;

ALTER TABLE fpt_request_ledger DROP CONSTRAINT IF EXISTS fpt_request_ledger_outcome_check;
ALTER TABLE fpt_request_ledger ADD CONSTRAINT fpt_request_ledger_outcome_check
  CHECK (outcome IN ('cache_hit','upstream','429','error','deduped'));
ALTER TABLE fpt_request_ledger DROP CONSTRAINT IF EXISTS fpt_request_ledger_latency_check;
ALTER TABLE fpt_request_ledger ADD CONSTRAINT fpt_request_ledger_latency_check
  CHECK (latency_ms IS NULL OR latency_ms >= 0);
ALTER TABLE fpt_request_ledger DROP CONSTRAINT IF EXISTS fpt_request_ledger_budget_state_check;
ALTER TABLE fpt_request_ledger ADD CONSTRAINT fpt_request_ledger_budget_state_check
  CHECK (budget_state IS NULL OR budget_state IN ('ok','warning','critical'));

-- Rows written before this migration keep latency, budget state and quota NULL: they were not measured.
UPDATE fpt_request_ledger
SET endpoint_family = CASE
  WHEN url_path LIKE '/api/download/%' THEN 'dataset'
  WHEN url_path LIKE '/api/jogos-do-dia%' THEN 'today'
  WHEN url_path LIKE '/api-docs%' THEN 'catalog'
  ELSE 'other' END
WHERE endpoint_family IS NULL;

-- Field family fixes. AH_/EH_ are handicap prices, Country/Div are identity, throw-ins are set pieces.
UPDATE fpt_schema_fields SET family = 'market' WHERE field_name ~* '^(ah|eh)_';
UPDATE fpt_schema_fields SET family = 'identity' WHERE lower(field_name) IN ('country','div');
UPDATE fpt_schema_fields SET family = 'set_pieces' WHERE field_name ~* 'throw_in';

-- Filter metadata registry: one row per registry field.
CREATE TABLE IF NOT EXISTS fpt_filter_registry (
  field_name text PRIMARY KEY REFERENCES fpt_schema_fields(field_name) ON DELETE CASCADE,
  normalized_field text NOT NULL,
  family text NOT NULL,
  data_type text NOT NULL,
  filterable boolean NOT NULL,
  operators jsonb NOT NULL,
  timing_class text NOT NULL CHECK (timing_class IN ('PREMATCH_IDENTITY','PREMATCH_MARKET_UNTIMED','POSTMATCH_OUTCOME')),
  prematch_safe boolean NOT NULL,
  missing_tokens jsonb NOT NULL,
  zero_is_missing boolean NOT NULL,
  rows_scoped bigint,
  nonempty_rows bigint,
  coverage_ratio numeric(18,10),
  provenance jsonb NOT NULL,
  registry_version text NOT NULL,
  refreshed_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION fpt_refresh_filter_registry()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE v_rows integer;
BEGIN
  INSERT INTO fpt_filter_registry(
    field_name, normalized_field, family, data_type, filterable, operators, timing_class, prematch_safe,
    missing_tokens, zero_is_missing, rows_scoped, nonempty_rows, coverage_ratio, provenance, registry_version, refreshed_at
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
           'timing_rule', 'family'
         ),
         'fpt-filters-1',
         now()
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
    refreshed_at = excluded.refreshed_at;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END
$$;

-- Cross-competition team links. International competitions write "Club (XXX)".
-- The code's country is derived from the data: the domestic country with strictly the most
-- exact normalized-name matches. A link is written only for one unique domestic team.
CREATE TABLE IF NOT EXISTS fpt_team_links (
  internal_team_id text PRIMARY KEY REFERENCES fpt_teams(internal_team_id) ON DELETE CASCADE,
  linked_team_id text REFERENCES fpt_teams(internal_team_id) ON DELETE CASCADE,
  country_code text NOT NULL,
  code_country_slug text,
  link_status text NOT NULL CHECK (link_status IN ('LINKED','NO_DOMESTIC_MATCH','AMBIGUOUS','CODE_UNRESOLVED')),
  basis text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  refreshed_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION fpt_refresh_team_links()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE v_rows integer;
BEGIN
  DELETE FROM fpt_team_links;
  WITH intl AS (
    SELECT t.internal_team_id, t.country_slug AS intl_country,
           min(upper(substring(a.name from '\(([A-Za-z]{3})\)\s*$'))) AS code,
           min(a.normalized_name) AS normalized_name
    FROM fpt_teams t
    JOIN fpt_team_aliases a USING (internal_team_id)
    WHERE a.name ~ '\([A-Za-z]{3}\)\s*$'
    GROUP BY t.internal_team_id, t.country_slug
  ),
  dom AS (
    SELECT DISTINCT t.internal_team_id, t.country_slug, a.normalized_name
    FROM fpt_teams t
    JOIN fpt_team_aliases a USING (internal_team_id)
    WHERE t.country_slug NOT IN (SELECT DISTINCT intl_country FROM intl)
  ),
  votes AS (
    SELECT i.code, d.country_slug, count(DISTINCT i.internal_team_id) AS n
    FROM intl i JOIN dom d USING (normalized_name)
    GROUP BY i.code, d.country_slug
  ),
  ranked AS (
    SELECT code, country_slug, n,
           row_number() OVER (PARTITION BY code ORDER BY n DESC, country_slug) AS r,
           lead(n) OVER (PARTITION BY code ORDER BY n DESC, country_slug) AS runner_up
    FROM votes
  ),
  code_country AS (
    SELECT code, country_slug, n, COALESCE(runner_up, 0) AS runner_up
    FROM ranked
    WHERE r = 1 AND n > COALESCE(runner_up, 0)
  ),
  candidates AS (
    SELECT i.internal_team_id, i.code, cc.country_slug AS code_country,
           cc.n AS votes, cc.runner_up,
           array_agg(DISTINCT d.internal_team_id) FILTER (WHERE d.internal_team_id IS NOT NULL) AS matches
    FROM intl i
    LEFT JOIN code_country cc ON cc.code = i.code
    LEFT JOIN dom d ON d.country_slug = cc.country_slug AND d.normalized_name = i.normalized_name
    GROUP BY i.internal_team_id, i.code, cc.country_slug, cc.n, cc.runner_up
  )
  INSERT INTO fpt_team_links(internal_team_id, linked_team_id, country_code, code_country_slug, link_status, basis, evidence)
  SELECT internal_team_id,
         CASE WHEN cardinality(matches) = 1 THEN matches[1] END,
         code,
         code_country,
         CASE
           WHEN code_country IS NULL THEN 'CODE_UNRESOLVED'
           WHEN matches IS NULL THEN 'NO_DOMESTIC_MATCH'
           WHEN cardinality(matches) = 1 THEN 'LINKED'
           ELSE 'AMBIGUOUS'
         END,
         'country-code-vote+exact-normalized-name',
         jsonb_build_object('code_votes', votes, 'runner_up_votes', runner_up, 'candidates', COALESCE(to_jsonb(matches), '[]'::jsonb))
  FROM candidates;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END
$$;

-- Normalized match facts: one row per match_key, from its latest stored version.
CREATE TABLE IF NOT EXISTS fpt_match_facts (
  internal_match_id text PRIMARY KEY,
  match_key text NOT NULL UNIQUE,
  version_id bigint NOT NULL REFERENCES fpt_match_versions(version_id) ON DELETE RESTRICT,
  snapshot_id bigint NOT NULL,
  dataset_key text NOT NULL,
  phase text NOT NULL,
  acquired_at timestamptz NOT NULL,
  internal_competition_id text,
  season_id text,
  country_slug text,
  league_slug text,
  season text,
  match_date date,
  kickoff_local_time text,
  kickoff_utc timestamptz,
  kickoff_tz_status text NOT NULL,
  home_team_id text,
  away_team_id text,
  home_name text,
  away_name text,
  provider_match_id text,
  provider_competition_id text,
  home_score integer,
  away_score integer,
  result_status text NOT NULL CHECK (result_status IN ('FINAL','NO_RESULT','NOT_STARTED')),
  source_provider text NOT NULL,
  parser_version text NOT NULL,
  schema_version text NOT NULL,
  transform_version text NOT NULL,
  facts_version text NOT NULL,
  refreshed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fpt_match_facts_home_idx ON fpt_match_facts(home_team_id, match_date DESC);
CREATE INDEX IF NOT EXISTS fpt_match_facts_away_idx ON fpt_match_facts(away_team_id, match_date DESC);
CREATE INDEX IF NOT EXISTS fpt_match_facts_comp_season_idx ON fpt_match_facts(internal_competition_id, season_id, match_date);
CREATE INDEX IF NOT EXISTS fpt_match_facts_date_idx ON fpt_match_facts(match_date);
CREATE INDEX IF NOT EXISTS fpt_match_facts_provider_idx ON fpt_match_facts(provider_match_id) WHERE provider_match_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS fpt_team_aliases_name_idx ON fpt_team_aliases(name);

CREATE OR REPLACE FUNCTION fpt_score_int(v text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN btrim(COALESCE(v, '')) ~ '^\d+(\.0+)?$' THEN btrim(v)::numeric::integer END
$$;

-- Same rows as fpt_match_facts but computed from versions acquired at or before p_at.
CREATE OR REPLACE FUNCTION fpt_match_facts_at(p_at timestamptz)
RETURNS TABLE (
  internal_match_id text, version_id bigint, dataset_key text, phase text, acquired_at timestamptz,
  internal_competition_id text, season_id text, match_date date, kickoff_local_time text,
  home_team_id text, away_team_id text, provider_match_id text,
  home_score integer, away_score integer, result_status text
)
LANGUAGE sql
STABLE
AS $$
  WITH latest AS (
    SELECT DISTINCT ON (v.match_key) v.*
    FROM fpt_match_versions v
    WHERE v.acquired_at <= p_at
    ORDER BY v.match_key, v.acquired_at DESC, v.version_id DESC
  ),
  names AS (
    SELECT t.country_slug, a.name, min(a.internal_team_id) AS team_id
    FROM fpt_team_aliases a JOIN fpt_teams t USING (internal_team_id)
    GROUP BY t.country_slug, a.name
    HAVING count(DISTINCT a.internal_team_id) = 1
  )
  SELECT l.match_key,
         l.version_id,
         l.dataset_key,
         l.phase,
         l.acquired_at,
         CASE WHEN l.country_slug IS NOT NULL AND l.league_slug IS NOT NULL
           THEN 'fpt:competition:' || md5(l.country_slug || '|' || l.league_slug) END,
         CASE WHEN l.country_slug IS NOT NULL AND l.league_slug IS NOT NULL AND l.season IS NOT NULL
           THEN 'fpt:season:' || md5(l.country_slug || '|' || l.league_slug || '|' || l.season) END,
         l.match_date,
         NULLIF(btrim(l.match_time), ''),
         h.team_id,
         a.team_id,
         l.provider_match_id,
         CASE WHEN l.phase = 'HISTORICAL' THEN fpt_score_int(l.payload->>'Home_Score') END,
         CASE WHEN l.phase = 'HISTORICAL' THEN fpt_score_int(l.payload->>'Away_Score') END,
         CASE
           WHEN l.phase <> 'HISTORICAL' THEN 'NOT_STARTED'
           WHEN fpt_score_int(l.payload->>'Home_Score') IS NOT NULL
            AND fpt_score_int(l.payload->>'Away_Score') IS NOT NULL THEN 'FINAL'
           ELSE 'NO_RESULT'
         END
  FROM latest l
  LEFT JOIN names h ON h.country_slug = l.country_slug AND h.name = l.home
  LEFT JOIN names a ON a.country_slug = l.country_slug AND a.name = l.away
$$;

CREATE OR REPLACE FUNCTION fpt_refresh_match_facts()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE v_rows integer;
BEGIN
  INSERT INTO fpt_match_facts(
    internal_match_id, match_key, version_id, snapshot_id, dataset_key, phase, acquired_at,
    internal_competition_id, season_id, country_slug, league_slug, season, match_date,
    kickoff_local_time, kickoff_utc, kickoff_tz_status, home_team_id, away_team_id, home_name, away_name,
    provider_match_id, provider_competition_id, home_score, away_score, result_status,
    source_provider, parser_version, schema_version, transform_version, facts_version, refreshed_at
  )
  SELECT f.internal_match_id, f.internal_match_id, f.version_id, v.snapshot_id, f.dataset_key, f.phase, f.acquired_at,
         f.internal_competition_id, f.season_id, v.country_slug, v.league_slug, v.season, f.match_date,
         f.kickoff_local_time, NULL, 'PROVIDER_TZ_UNDOCUMENTED', f.home_team_id, f.away_team_id, v.home, v.away,
         f.provider_match_id, NULL, f.home_score, f.away_score, f.result_status,
         v.source_provider, v.parser_version, v.schema_version, v.transform_version, 'fpt-facts-1', now()
  FROM fpt_match_facts_at('infinity'::timestamptz) f
  JOIN fpt_match_versions v ON v.version_id = f.version_id
  ON CONFLICT (internal_match_id) DO UPDATE SET
    version_id = excluded.version_id,
    snapshot_id = excluded.snapshot_id,
    dataset_key = excluded.dataset_key,
    phase = excluded.phase,
    acquired_at = excluded.acquired_at,
    internal_competition_id = excluded.internal_competition_id,
    season_id = excluded.season_id,
    country_slug = excluded.country_slug,
    league_slug = excluded.league_slug,
    season = excluded.season,
    match_date = excluded.match_date,
    kickoff_local_time = excluded.kickoff_local_time,
    home_team_id = excluded.home_team_id,
    away_team_id = excluded.away_team_id,
    home_name = excluded.home_name,
    away_name = excluded.away_name,
    provider_match_id = excluded.provider_match_id,
    home_score = excluded.home_score,
    away_score = excluded.away_score,
    result_status = excluded.result_status,
    source_provider = excluded.source_provider,
    parser_version = excluded.parser_version,
    schema_version = excluded.schema_version,
    transform_version = excluded.transform_version,
    facts_version = excluded.facts_version,
    refreshed_at = excluded.refreshed_at
  WHERE fpt_match_facts.version_id IS DISTINCT FROM excluded.version_id
     OR fpt_match_facts.home_team_id IS DISTINCT FROM excluded.home_team_id
     OR fpt_match_facts.away_team_id IS DISTINCT FROM excluded.away_team_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END
$$;

SELECT fpt_refresh_filter_registry();
SELECT fpt_refresh_team_links();
SELECT fpt_refresh_match_facts();
ANALYZE fpt_match_facts;
ANALYZE fpt_filter_registry;
ANALYZE fpt_team_links;
