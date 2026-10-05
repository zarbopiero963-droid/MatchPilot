-- FPT-PR-09 (#12 reconciliation compatibility with #31): checkpoints, watermarks and a reconciliation ledger.
-- The tables are source-agnostic (#31 names) so TotalCorner can use them; this migration wires FutPythonTrader.

-- A run started by the reconciliation itself (catch-up after a skipped incremental sync).
ALTER TABLE fpt_sync_runs DROP CONSTRAINT IF EXISTS fpt_sync_runs_kind_check;
ALTER TABLE fpt_sync_runs ADD CONSTRAINT fpt_sync_runs_kind_check
  CHECK (kind IN ('cron','backfill','manual','today','recovery'));

-- Pipeline-level checkpoint / watermark (#31 "Watermark / checkpoint").
CREATE TABLE IF NOT EXISTS data_checkpoints (
  source text NOT NULL,
  scope text NOT NULL,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_provider_timestamp timestamptz,
  last_acquired_at timestamptz,
  last_sequence_id text,
  last_entity_id text,
  checkpoint jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL CHECK (status IN ('ok','stale','failed','unknown')),
  retry_count integer NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  error_summary text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source, scope)
);

-- Per-dataset checkpoint: fpt_dataset_state already holds it; the view exposes it with the #31 names.
CREATE OR REPLACE VIEW fpt_dataset_checkpoints AS
SELECT 'futpython'::text AS source,
       'dataset:' || s.dataset_key AS scope,
       s.last_synced_at AS last_attempt_at,
       s.last_success_at,
       NULL::timestamptz AS last_provider_timestamp,
       r.acquired_at AS last_acquired_at,
       s.last_snapshot_id::text AS last_sequence_id,
       s.last_sha256 AS last_entity_id,
       jsonb_build_object('availability', s.availability, 'classification', s.classification,
         'row_count', s.last_row_count, 'ingest_complete', r.ingest_complete) AS checkpoint,
       CASE WHEN s.last_error IS NOT NULL THEN 'failed'
            WHEN s.last_success_at IS NOT NULL THEN 'ok'
            ELSE 'unknown' END AS status,
       s.last_error AS error_summary
FROM fpt_dataset_state s
LEFT JOIN fpt_raw_snapshots r ON r.snapshot_id = s.last_snapshot_id;

-- Data integrity ledger (#31): one row per detected gap, from detection to recovery or classification.
CREATE TABLE IF NOT EXISTS data_reconciliation_ledger (
  reconciliation_id bigserial PRIMARY KEY,
  source text NOT NULL,
  scope text NOT NULL,
  entity text NOT NULL,
  gap_kind text NOT NULL,
  priority text NOT NULL CHECK (priority IN ('P0','P1','P2','P3')),
  detected_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expected jsonb NOT NULL DEFAULT '{}'::jsonb,
  observed jsonb NOT NULL DEFAULT '{}'::jsonb,
  missing jsonb NOT NULL DEFAULT '{}'::jsonb,
  recovery_action text NOT NULL,
  recovery_started_at timestamptz,
  recovery_finished_at timestamptz,
  recovered_count integer NOT NULL DEFAULT 0,
  unrecoverable_count integer NOT NULL DEFAULT 0,
  attempts integer NOT NULL DEFAULT 0,
  status text NOT NULL CHECK (status IN ('DETECTED','QUEUED','RECOVERING','RECOVERED','PARTIAL','UNRECOVERABLE','FAILED')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- At most one open entry per gap: a repeated detection updates it instead of piling up rows.
CREATE UNIQUE INDEX IF NOT EXISTS data_reconciliation_open_idx
  ON data_reconciliation_ledger(source, gap_kind, entity)
  WHERE status IN ('DETECTED','QUEUED','RECOVERING','PARTIAL','FAILED');
-- A gap classified unrecoverable stays classified: it is not re-opened at every cycle.
CREATE UNIQUE INDEX IF NOT EXISTS data_reconciliation_unrecoverable_idx
  ON data_reconciliation_ledger(source, gap_kind, entity)
  WHERE status = 'UNRECOVERABLE';
CREATE INDEX IF NOT EXISTS data_reconciliation_status_idx
  ON data_reconciliation_ledger(source, status, priority);
