BEGIN;

CREATE TABLE IF NOT EXISTS fpt_sync_runs (
  run_id text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('cron','backfill','manual','today')),
  status text NOT NULL CHECK (status IN ('running','complete','partial','failed','skipped')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  catalog_entries integer NOT NULL DEFAULT 0,
  datasets_attempted integer NOT NULL DEFAULT 0,
  datasets_changed integer NOT NULL DEFAULT 0,
  snapshots_inserted integer NOT NULL DEFAULT 0,
  rows_seen bigint NOT NULL DEFAULT 0,
  rows_inserted bigint NOT NULL DEFAULT 0,
  fields_seen integer NOT NULL DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS fpt_catalog (
  dataset_key text PRIMARY KEY,
  country_slug text NOT NULL,
  league_slug text NOT NULL,
  season text NOT NULL,
  route text NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  active boolean NOT NULL DEFAULT true,
  UNIQUE(country_slug, league_slug, season)
);

CREATE TABLE IF NOT EXISTS fpt_dataset_state (
  dataset_key text PRIMARY KEY REFERENCES fpt_catalog(dataset_key) ON DELETE CASCADE,
  last_sha256 text,
  last_snapshot_id bigint,
  last_row_count integer,
  last_synced_at timestamptz,
  last_changed_at timestamptz,
  last_error text
);

CREATE TABLE IF NOT EXISTS fpt_raw_snapshots (
  snapshot_id bigserial PRIMARY KEY,
  dataset_key text NOT NULL,
  source_kind text NOT NULL CHECK (source_kind IN ('dataset','today')),
  provider_path text NOT NULL,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  sha256 text NOT NULL,
  row_count integer NOT NULL,
  headers jsonb NOT NULL,
  payload_gzip bytea NOT NULL,
  UNIQUE(dataset_key, sha256)
);

ALTER TABLE fpt_dataset_state
  DROP CONSTRAINT IF EXISTS fpt_dataset_state_last_snapshot_id_fkey;
ALTER TABLE fpt_dataset_state
  ADD CONSTRAINT fpt_dataset_state_last_snapshot_id_fkey
  FOREIGN KEY (last_snapshot_id) REFERENCES fpt_raw_snapshots(snapshot_id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS fpt_schema_fields (
  field_name text PRIMARY KEY,
  inferred_type text NOT NULL,
  family text NOT NULL DEFAULT 'unclassified',
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  datasets_seen bigint NOT NULL DEFAULT 0,
  rows_seen bigint NOT NULL DEFAULT 0,
  nonempty_seen bigint NOT NULL DEFAULT 0,
  sample_values jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS fpt_match_versions (
  version_id bigserial PRIMARY KEY,
  match_key text NOT NULL,
  provider_match_id text,
  dataset_key text NOT NULL,
  snapshot_id bigint NOT NULL REFERENCES fpt_raw_snapshots(snapshot_id) ON DELETE RESTRICT,
  acquired_at timestamptz NOT NULL,
  country_slug text,
  league_slug text,
  season text,
  match_date date,
  match_time text,
  home text,
  away text,
  phase text NOT NULL DEFAULT 'PREMATCH',
  payload jsonb NOT NULL,
  payload_sha256 text NOT NULL,
  UNIQUE(match_key, payload_sha256)
);

CREATE INDEX IF NOT EXISTS fpt_match_versions_match_idx ON fpt_match_versions(match_key, acquired_at DESC);
CREATE INDEX IF NOT EXISTS fpt_match_versions_date_idx ON fpt_match_versions(match_date);
CREATE INDEX IF NOT EXISTS fpt_match_versions_dataset_idx ON fpt_match_versions(dataset_key);
CREATE INDEX IF NOT EXISTS fpt_match_versions_payload_gin ON fpt_match_versions USING gin(payload);

CREATE OR REPLACE VIEW fpt_matches_latest AS
SELECT DISTINCT ON (match_key)
  *
FROM fpt_match_versions
ORDER BY match_key, acquired_at DESC, version_id DESC;

COMMIT;
