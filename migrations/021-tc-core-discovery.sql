-- TC-CORE-01 (#20): TotalCorner raw retention, request ledger, schema registry and discovery runs.
-- Raw bodies are stored exactly as received (lossless); the token never reaches any column.

CREATE TABLE IF NOT EXISTS tc_discovery_runs (
  run_id bigserial PRIMARY KEY,
  version text NOT NULL,
  status text NOT NULL CHECK (status IN ('running','complete','failed','interrupted')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  summary jsonb,
  error text
);

CREATE TABLE IF NOT EXISTS tc_raw_responses (
  raw_id bigserial PRIMARY KEY,
  provider text NOT NULL DEFAULT 'totalcorner',
  endpoint_family text NOT NULL,
  request_key text NOT NULL,
  url_path text NOT NULL,
  match_id text,
  league_id text,
  phase text,
  provenance text NOT NULL,
  http_status integer,
  outcome text NOT NULL,
  body_sha256 text NOT NULL,
  body_bytes integer NOT NULL,
  body text NOT NULL,
  first_acquired_at timestamptz NOT NULL,
  last_acquired_at timestamptz NOT NULL,
  seen_count integer NOT NULL DEFAULT 1,
  first_run_id bigint REFERENCES tc_discovery_runs(run_id),
  schema_version text NOT NULL,
  parser_version text NOT NULL,
  UNIQUE (request_key, body_sha256)
);
CREATE INDEX IF NOT EXISTS tc_raw_family_idx ON tc_raw_responses(endpoint_family, first_acquired_at);
CREATE INDEX IF NOT EXISTS tc_raw_match_idx ON tc_raw_responses(match_id) WHERE match_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS tc_raw_league_idx ON tc_raw_responses(league_id) WHERE league_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS tc_request_ledger (
  ledger_id bigserial PRIMARY KEY,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  run_id bigint REFERENCES tc_discovery_runs(run_id),
  endpoint_family text NOT NULL,
  url_path text NOT NULL,
  match_id text,
  league_id text,
  attempt integer NOT NULL,
  outcome text NOT NULL,
  http_status integer,
  latency_ms integer,
  backoff_ms integer NOT NULL DEFAULT 0,
  rate_limit jsonb,
  raw_id bigint REFERENCES tc_raw_responses(raw_id),
  error_class text
);
CREATE INDEX IF NOT EXISTS tc_ledger_time_idx ON tc_request_ledger(recorded_at);
CREATE INDEX IF NOT EXISTS tc_ledger_run_idx ON tc_request_ledger(run_id);

-- One row per endpoint family x match phase x field path observed in raw bodies.
CREATE TABLE IF NOT EXISTS tc_schema_registry (
  endpoint_family text NOT NULL,
  phase text NOT NULL,
  field_path text NOT NULL,
  json_types text[] NOT NULL,
  rows_seen bigint NOT NULL DEFAULT 0,
  nonnull_seen bigint NOT NULL DEFAULT 0,
  sample_value text,
  first_seen timestamptz NOT NULL,
  last_seen timestamptz NOT NULL,
  normalized_field text,
  PRIMARY KEY (endpoint_family, phase, field_path)
);
