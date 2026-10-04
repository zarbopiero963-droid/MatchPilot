CREATE TABLE IF NOT EXISTS fpt_catalog_snapshots (
  snapshot_id text PRIMARY KEY,
  captured_at timestamptz NOT NULL DEFAULT now(),
  sha256 text NOT NULL UNIQUE,
  catalog_count integer NOT NULL,
  catalog jsonb NOT NULL
);

ALTER TABLE fpt_sync_runs
  ADD COLUMN IF NOT EXISTS resumed_skips integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unavailable_404 integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS available_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS error_real_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS catalog_snapshot_id text REFERENCES fpt_catalog_snapshots(snapshot_id);

CREATE INDEX IF NOT EXISTS fpt_dataset_state_availability_idx
  ON fpt_dataset_state(availability);
