-- TC-CORE-03 (#20): TotalCorner prematch market mirror with point-in-time cutoff.
-- Only fixtures of VERIFIED competition mappings enter. Every movement row keeps the provider time, the UTC time
-- derived from it, the time we first acquired it and the raw response it came from. No row at or after the scheduled
-- kickoff can be PREMATCH: in-play rows are INPLAY, pre-kickoff-labelled rows stamped after kickoff are QUARANTINE.

CREATE TABLE IF NOT EXISTS tc_matches (
  match_id text PRIMARY KEY,
  league_id text NOT NULL,
  league_name text,
  home text, home_id text, away text, away_id text,
  start_provider text NOT NULL,
  tz_offset_minutes integer NOT NULL,
  kickoff_utc timestamptz NOT NULL,
  futpython_country_slug text,
  futpython_league_slug text,
  last_status text,
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS tc_matches_kickoff ON tc_matches(kickoff_utc);

CREATE TABLE IF NOT EXISTS tc_prematch_runs (
  run_id bigserial PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('cycle','raw_replay')),
  version text NOT NULL,
  status text NOT NULL CHECK (status IN ('running','complete','failed','interrupted')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  summary jsonb,
  error text
);

-- One row per acquisition taken before kickoff. The CHECK is the hard cutoff: a snapshot acquired at or after the
-- scheduled kickoff cannot be stored as PREMATCH.
CREATE TABLE IF NOT EXISTS tc_prematch_snapshots (
  snapshot_id bigserial PRIMARY KEY,
  match_id text NOT NULL REFERENCES tc_matches(match_id),
  run_id bigint,
  source text NOT NULL CHECK (source IN ('match_odds','bookmaker_odds')),
  acquired_at timestamptz NOT NULL,
  kickoff_utc timestamptz NOT NULL,
  minutes_to_kickoff numeric NOT NULL,
  raw_id bigint,
  phase text NOT NULL DEFAULT 'PREMATCH' CHECK (phase = 'PREMATCH'),
  rows_total integer NOT NULL DEFAULT 0,
  rows_new integer NOT NULL DEFAULT 0,
  rows_prematch integer NOT NULL DEFAULT 0,
  rows_inplay integer NOT NULL DEFAULT 0,
  rows_quarantine integer NOT NULL DEFAULT 0,
  CHECK (acquired_at < kickoff_utc)
);
CREATE INDEX IF NOT EXISTS tc_prematch_snapshots_match ON tc_prematch_snapshots(match_id, acquired_at);

-- Normalized market rows. source: 'consensus' (TotalCorner /match/odds movement lists) or 'bookmaker:<slug>'
-- (/match/bookmaker_odds). kind: a movement row, or a bookmaker open/close/inplay quote.
CREATE TABLE IF NOT EXISTS tc_market_rows (
  row_id bigserial PRIMARY KEY,
  match_id text NOT NULL REFERENCES tc_matches(match_id),
  source text NOT NULL,
  market text NOT NULL CHECK (market IN ('odds','asian','goal','corner','btts')),
  period text NOT NULL CHECK (period IN ('FT','HT')),
  kind text NOT NULL CHECK (kind IN ('movement','open','close','inplay')),
  minute integer,
  line text,
  price_1 numeric, price_2 numeric, price_3 numeric,
  provider_time text,
  provider_time_utc timestamptz,
  score_home integer, score_away integer,
  extra jsonb,
  phase text NOT NULL CHECK (phase IN ('PREMATCH','INPLAY','QUARANTINE')),
  quarantine_reason text,
  -- PREMATCH_CAPTURED: first acquired before kickoff; HISTORICAL_UPSTREAM: pre-kickoff row first acquired afterwards.
  provenance text NOT NULL CHECK (provenance IN ('PREMATCH_CAPTURED','HISTORICAL_UPSTREAM','LIVE_UPSTREAM')),
  row_hash text NOT NULL,
  first_raw_id bigint,
  first_acquired_at timestamptz NOT NULL,
  last_acquired_at timestamptz NOT NULL,
  seen_count integer NOT NULL DEFAULT 1,
  parser_version text NOT NULL,
  UNIQUE (match_id, source, market, period, kind, row_hash),
  CHECK (phase <> 'PREMATCH' OR (minute IS NULL AND provider_time_utc IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS tc_market_rows_pit ON tc_market_rows(match_id, market, period, source, provider_time_utc);
