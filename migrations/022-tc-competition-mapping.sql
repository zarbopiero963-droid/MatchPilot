-- TC-CORE-02 (#20): FutPythonTrader <-> TotalCorner competition mapping, verified on real fixtures.
-- Only VERIFIED rows may feed the TotalCorner core collectors; the other states are kept with their evidence.

CREATE TABLE IF NOT EXISTS tc_mapping_runs (
  run_id bigserial PRIMARY KEY,
  version text NOT NULL,
  status text NOT NULL CHECK (status IN ('running','complete','failed','interrupted')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  summary jsonb,
  error text
);

-- Every TotalCorner league seen in schedule pages, mapped or not (the non-overlap list).
CREATE TABLE IF NOT EXISTS tc_competitions (
  totalcorner_league_id text PRIMARY KEY,
  totalcorner_league_name text NOT NULL,
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  fixtures_seen integer NOT NULL DEFAULT 0,
  mapping_status text NOT NULL DEFAULT 'UNMAPPED'
);

CREATE TABLE IF NOT EXISTS competition_mapping (
  mapping_id bigserial PRIMARY KEY,
  internal_competition_id text NOT NULL,
  country text NOT NULL,
  canonical_league_name text,
  futpython_country_slug text NOT NULL,
  futpython_league_slug text NOT NULL,
  futpython_season text,
  totalcorner_league_id text,
  totalcorner_league_name text,
  totalcorner_country_name text,
  mapping_status text NOT NULL CHECK (mapping_status IN ('VERIFIED','CANDIDATE','AMBIGUOUS','UNMAPPED','DEPRECATED')),
  mapping_confidence numeric(5,4),
  mapping_method text NOT NULL,
  verified_at timestamptz,
  evidence jsonb NOT NULL,
  active boolean NOT NULL DEFAULT true,
  run_id bigint REFERENCES tc_mapping_runs(run_id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (futpython_country_slug, futpython_league_slug)
);
-- A TotalCorner league can back at most one active VERIFIED FPT competition.
CREATE UNIQUE INDEX IF NOT EXISTS competition_mapping_verified_tc_uidx
  ON competition_mapping(totalcorner_league_id) WHERE mapping_status='VERIFIED' AND active;
CREATE INDEX IF NOT EXISTS competition_mapping_status_idx ON competition_mapping(mapping_status);
