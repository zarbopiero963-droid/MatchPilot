CREATE TABLE IF NOT EXISTS fpt_competition_season (
  dataset_key text PRIMARY KEY,
  internal_competition_id text NOT NULL,
  country_slug text NOT NULL,
  league_slug text NOT NULL,
  canonical_league_name text NOT NULL,
  season text NOT NULL,
  provider_competition_id text,
  provider_season text,
  first_data_date date,
  last_data_date date,
  match_count bigint NOT NULL CHECK (match_count >= 0),
  expected_match_count bigint,
  coverage_status text NOT NULL CHECK (coverage_status IN (
    'DISCOVERED','CANDIDATE','AVAILABLE','PARTIAL','COMPLETE',
    'UNAVAILABLE_404','ERROR_REAL','DEPRECATED','REMOVED'
  )),
  fields_available integer NOT NULL CHECK (fields_available >= 0),
  fields_coverage jsonb NOT NULL DEFAULT '{}'::jsonb,
  historical_complete boolean NOT NULL,
  prematch_available boolean NOT NULL,
  earliest_season text,
  latest_season text,
  discovered_at timestamptz,
  verified_at timestamptz,
  last_audited_at timestamptz NOT NULL DEFAULT now(),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (country_slug, league_slug, season)
);

CREATE INDEX IF NOT EXISTS fpt_competition_season_status_idx
  ON fpt_competition_season(coverage_status, country_slug, league_slug);

CREATE TABLE IF NOT EXISTS fpt_season_gaps (
  country_slug text NOT NULL,
  league_slug text NOT NULL,
  season text NOT NULL,
  detector text NOT NULL,
  in_catalog boolean NOT NULL,
  missing_available boolean NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (country_slug, league_slug, season)
);

CREATE TABLE IF NOT EXISTS fpt_season_audit (
  audit_id integer PRIMARY KEY CHECK (audit_id = 1),
  computed_at timestamptz NOT NULL DEFAULT now(),
  registry_rows integer NOT NULL,
  missing_available_seasons integer NOT NULL,
  gap_rows integer NOT NULL,
  status_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  expected_null integer NOT NULL,
  historical_complete integer NOT NULL,
  unavailable_marked_complete integer NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE OR REPLACE FUNCTION fpt_known_matches(p_at timestamptz, p_contract text, p_dataset text)
RETURNS bigint
LANGUAGE sql
STABLE
AS $$
  SELECT count(*)::bigint
  FROM fpt_match_versions
  WHERE acquired_at <= p_at
    AND schema_version = p_contract
    AND phase = 'HISTORICAL'
    AND (p_dataset IS NULL OR dataset_key = p_dataset)
$$;
