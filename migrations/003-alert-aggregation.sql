ALTER TABLE fpt_dataset_state
  ADD COLUMN IF NOT EXISTS availability text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS unavailable_reason text;

UPDATE data_alerts
SET resolved_at = COALESCE(resolved_at, now())
WHERE resolved_at IS NULL
  AND code IN ('DATASET_SYNC_FAILED','NEW_FIELD','NEW_DATASET','ROW_COUNT_DROP','SYNC_RUN_FAILED','SYNC_RUN_PARTIAL');
