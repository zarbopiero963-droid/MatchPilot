ALTER TABLE fpt_raw_snapshots
  ADD COLUMN IF NOT EXISTS ingest_complete boolean;

UPDATE fpt_raw_snapshots
SET ingest_complete = true
WHERE ingest_complete IS NULL;

ALTER TABLE fpt_raw_snapshots
  ALTER COLUMN ingest_complete SET DEFAULT false;

ALTER TABLE fpt_raw_snapshots
  ALTER COLUMN ingest_complete SET NOT NULL;

CREATE TABLE IF NOT EXISTS fpt_request_ledger (
  ledger_id bigserial PRIMARY KEY,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  dataset_key text,
  url_path text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('cache_hit','upstream','429','error')),
  attempt integer NOT NULL DEFAULT 1 CHECK (attempt >= 0),
  backoff_ms integer NOT NULL DEFAULT 0 CHECK (backoff_ms >= 0),
  http_status integer,
  run_id text,
  priority text,
  CHECK (position('api_key=' in lower(url_path)) = 0)
);

CREATE INDEX IF NOT EXISTS fpt_request_ledger_recorded_idx
  ON fpt_request_ledger(recorded_at DESC);

CREATE INDEX IF NOT EXISTS fpt_request_ledger_run_dataset_idx
  ON fpt_request_ledger(run_id, dataset_key, outcome);

CREATE TABLE IF NOT EXISTS fpt_provider_hold (
  hold_id integer PRIMARY KEY CHECK (hold_id = 1),
  critical_depth integer NOT NULL DEFAULT 0 CHECK (critical_depth >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO fpt_provider_hold(hold_id, critical_depth)
VALUES (1, 0)
ON CONFLICT (hold_id) DO NOTHING;
