-- TC-CORE-04 (#20): live collector. Raw stays in tc_raw_responses. These tables are the captured live archive.
-- HISTORICAL_CAPTURED only: nothing here is reconstructed from a later upstream result.

CREATE TABLE IF NOT EXISTS tc_collector_runs (
  run_id bigserial PRIMARY KEY,
  version text NOT NULL,
  status text NOT NULL CHECK (status IN ('running','complete','failed','interrupted')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  summary jsonb,
  error text
);

CREATE TABLE IF NOT EXISTS tc_live_snapshots (
  snapshot_id bigserial PRIMARY KEY,
  match_id text NOT NULL,
  league_id text NOT NULL,
  run_id bigint REFERENCES tc_collector_runs(run_id),
  acquired_at timestamptz NOT NULL,
  provider_status text,
  minute text,
  score text,
  snapshot_hash text NOT NULL,
  raw_id bigint,
  provenance text NOT NULL DEFAULT 'HISTORICAL_CAPTURED' CHECK (provenance = 'HISTORICAL_CAPTURED'),
  payload jsonb NOT NULL,
  UNIQUE (match_id, snapshot_hash)
);
CREATE INDEX IF NOT EXISTS tc_live_snapshots_match ON tc_live_snapshots(match_id, acquired_at);

CREATE TABLE IF NOT EXISTS tc_live_events (
  event_id bigserial PRIMARY KEY,
  match_id text NOT NULL,
  event_hash text NOT NULL,
  minute text,
  event_type text,
  raw_id bigint,
  acquired_at timestamptz NOT NULL,
  provenance text NOT NULL DEFAULT 'HISTORICAL_CAPTURED' CHECK (provenance = 'HISTORICAL_CAPTURED'),
  payload jsonb NOT NULL,
  UNIQUE (match_id, event_hash)
);

CREATE TABLE IF NOT EXISTS tc_market_snapshots (
  market_snapshot_id bigserial PRIMARY KEY,
  match_id text NOT NULL,
  source text NOT NULL,
  acquired_at timestamptz NOT NULL,
  raw_id bigint,
  payload_hash text NOT NULL,
  provenance text NOT NULL DEFAULT 'HISTORICAL_CAPTURED' CHECK (provenance = 'HISTORICAL_CAPTURED'),
  UNIQUE (match_id, source, payload_hash)
);

CREATE TABLE IF NOT EXISTS tc_live_cursors (
  match_id text PRIMARY KEY,
  league_id text NOT NULL,
  last_polled_at timestamptz,
  last_snapshot_at timestamptz,
  last_status text,
  poll_count integer NOT NULL DEFAULT 0
);
