-- TC-CORE-03B (#20): resumable TotalCorner HISTORICAL_UPSTREAM backfill and audit.
-- Raw payloads remain in tc_raw_responses; this migration adds resumable progress and compact, queryable coverage evidence.

CREATE TABLE IF NOT EXISTS tc_historical_runs (
  run_id bigserial PRIMARY KEY,
  version text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('sample','batch')),
  status text NOT NULL CHECK (status IN ('running','complete','failed','interrupted')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  summary jsonb,
  error text
);

CREATE TABLE IF NOT EXISTS tc_historical_checkpoints (
  league_id text PRIMARY KEY,
  sampled boolean NOT NULL DEFAULT false,
  next_page integer NOT NULL DEFAULT 1 CHECK (next_page >= 1),
  total_pages integer,
  complete boolean NOT NULL DEFAULT false,
  matches_seen bigint NOT NULL DEFAULT 0,
  matches_ingested bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_error text
);

CREATE TABLE IF NOT EXISTS tc_historical_match_audit (
  match_id text PRIMARY KEY,
  league_id text NOT NULL,
  provider_start text,
  kickoff_utc timestamptz,
  provider_timezone text NOT NULL,
  provider_offset_minutes integer,
  season_key text,
  acquired_at timestamptz NOT NULL,
  view_raw_id bigint,
  odds_raw_id bigint,
  bookmaker_raw_id bigint,
  view_outcome text,
  odds_outcome text,
  bookmaker_outcome text,
  events_count integer NOT NULL DEFAULT 0,
  score_ft_present boolean NOT NULL DEFAULT false,
  score_ht_present boolean NOT NULL DEFAULT false,
  corners_present boolean NOT NULL DEFAULT false,
  cards_present boolean NOT NULL DEFAULT false,
  attacks_present boolean NOT NULL DEFAULT false,
  dangerous_attacks_present boolean NOT NULL DEFAULT false,
  shots_present boolean NOT NULL DEFAULT false,
  possession_present boolean NOT NULL DEFAULT false,
  odds_history_present boolean NOT NULL DEFAULT false,
  asian_history_present boolean NOT NULL DEFAULT false,
  goal_history_present boolean NOT NULL DEFAULT false,
  corner_history_present boolean NOT NULL DEFAULT false,
  btts_history_present boolean NOT NULL DEFAULT false,
  bookmaker_odds_present boolean NOT NULL DEFAULT false,
  retroactive_live_stats_present boolean NOT NULL DEFAULT false,
  provenance text NOT NULL DEFAULT 'HISTORICAL_UPSTREAM' CHECK (provenance='HISTORICAL_UPSTREAM'),
  last_run_id bigint REFERENCES tc_historical_runs(run_id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tc_historical_match_league_idx ON tc_historical_match_audit(league_id, kickoff_utc);

CREATE TABLE IF NOT EXISTS tc_historical_movement_audit (
  match_id text NOT NULL,
  bookmaker text NOT NULL,
  columns_name text NOT NULL,
  outcome text NOT NULL,
  rows_seen integer NOT NULL DEFAULT 0,
  suspended_rows integer NOT NULL DEFAULT 0,
  raw_id bigint,
  acquired_at timestamptz NOT NULL,
  run_id bigint REFERENCES tc_historical_runs(run_id),
  PRIMARY KEY(match_id,bookmaker,columns_name)
);

CREATE TABLE IF NOT EXISTS tc_historical_league_coverage (
  league_id text PRIMARY KEY,
  country text,
  canonical_league_name text,
  earliest_upstream_date date,
  latest_upstream_date date,
  seasons_seen integer NOT NULL DEFAULT 0,
  matches_seen bigint NOT NULL DEFAULT 0,
  odds_history_matches bigint NOT NULL DEFAULT 0,
  asian_history_matches bigint NOT NULL DEFAULT 0,
  goal_history_matches bigint NOT NULL DEFAULT 0,
  corner_history_matches bigint NOT NULL DEFAULT 0,
  events_matches bigint NOT NULL DEFAULT 0,
  score_ht_matches bigint NOT NULL DEFAULT 0,
  corners_matches bigint NOT NULL DEFAULT 0,
  cards_matches bigint NOT NULL DEFAULT 0,
  retroactive_live_stats_matches bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
