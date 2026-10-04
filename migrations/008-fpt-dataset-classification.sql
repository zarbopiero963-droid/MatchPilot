ALTER TABLE fpt_dataset_state
  ADD COLUMN IF NOT EXISTS classification text,
  ADD COLUMN IF NOT EXISTS classification_reason text,
  ADD COLUMN IF NOT EXISTS http_disposition text,
  ADD COLUMN IF NOT EXISTS first_success_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_success_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_http_status integer,
  ADD COLUMN IF NOT EXISTS provider_path text;

ALTER TABLE fpt_dataset_state
  DROP CONSTRAINT IF EXISTS fpt_dataset_state_classification_chk;
ALTER TABLE fpt_dataset_state
  ADD CONSTRAINT fpt_dataset_state_classification_chk
  CHECK (classification IS NULL OR classification IN (
    'AVAILABLE','UNAVAILABLE_404','ERROR_REAL','DEPRECATED','REMOVED'
  ));

ALTER TABLE fpt_dataset_state
  DROP CONSTRAINT IF EXISTS fpt_dataset_state_http_disposition_chk;
ALTER TABLE fpt_dataset_state
  ADD CONSTRAINT fpt_dataset_state_http_disposition_chk
  CHECK (http_disposition IS NULL OR http_disposition IN ('INITIAL_404','REGRESSION_404'));

INSERT INTO fpt_dataset_state(dataset_key)
SELECT dataset_key FROM fpt_catalog
ON CONFLICT (dataset_key) DO NOTHING;

UPDATE fpt_dataset_state AS s
SET classification = 'AVAILABLE',
    classification_reason = 'snapshot_committed',
    http_disposition = NULL,
    last_http_status = 200,
    provider_path = COALESCE(s.provider_path, r.provider_path, c.route),
    first_success_at = COALESCE(s.first_success_at, (
      SELECT min(x.acquired_at) FROM fpt_raw_snapshots x
      WHERE x.dataset_key = s.dataset_key AND x.source_kind = 'dataset' AND x.ingest_complete
    ), s.last_synced_at, c.last_seen_at),
    last_success_at = COALESCE(s.last_success_at, (
      SELECT max(x.acquired_at) FROM fpt_raw_snapshots x
      WHERE x.dataset_key = s.dataset_key AND x.source_kind = 'dataset' AND x.ingest_complete
    ), s.last_synced_at, c.last_seen_at),
    last_synced_at = COALESCE(s.last_synced_at, r.acquired_at, c.last_seen_at)
FROM fpt_catalog AS c, fpt_raw_snapshots AS r
WHERE c.dataset_key = s.dataset_key
  AND r.snapshot_id = s.last_snapshot_id
  AND c.active = true
  AND s.availability = 'available'
  AND s.classification IS NULL
  AND r.ingest_complete = true;

UPDATE fpt_dataset_state AS s
SET classification = 'UNAVAILABLE_404',
    classification_reason = 'INITIAL_404',
    http_disposition = 'INITIAL_404',
    last_http_status = 404,
    provider_path = COALESCE(s.provider_path, c.route),
    last_error_at = COALESCE(s.last_error_at, s.last_synced_at, c.last_seen_at),
    last_synced_at = COALESCE(s.last_synced_at, c.last_seen_at)
FROM fpt_catalog AS c
WHERE c.dataset_key = s.dataset_key
  AND c.active = true
  AND s.availability = 'unavailable_404'
  AND s.last_snapshot_id IS NULL
  AND s.classification IS NULL;

UPDATE fpt_dataset_state AS s
SET availability = 'error',
    classification = 'ERROR_REAL',
    classification_reason = 'REGRESSION_404',
    http_disposition = 'REGRESSION_404',
    unavailable_reason = 'REGRESSION_404',
    last_error = COALESCE(s.last_error, 'REGRESSION_404'),
    last_http_status = 404,
    provider_path = COALESCE(s.provider_path, r.provider_path, c.route),
    last_error_at = COALESCE(s.last_error_at, s.last_synced_at, c.last_seen_at),
    last_synced_at = COALESCE(s.last_synced_at, c.last_seen_at)
FROM fpt_catalog AS c, fpt_raw_snapshots AS r
WHERE c.dataset_key = s.dataset_key
  AND r.snapshot_id = s.last_snapshot_id
  AND s.availability = 'unavailable_404'
  AND s.classification IS NULL;

UPDATE fpt_dataset_state AS s
SET classification = 'ERROR_REAL',
    classification_reason = COALESCE(NULLIF(btrim(s.last_error), ''), NULLIF(btrim(s.unavailable_reason), ''), 'error'),
    http_disposition = CASE
      WHEN s.last_snapshot_id IS NOT NULL AND COALESCE(s.last_error, '') ILIKE '%404%' THEN 'REGRESSION_404'
      ELSE s.http_disposition
    END,
    last_http_status = CASE
      WHEN COALESCE(s.last_error, s.unavailable_reason, '') ILIKE '%404%' THEN 404
      ELSE s.last_http_status
    END,
    provider_path = COALESCE(s.provider_path, c.route),
    last_error_at = COALESCE(s.last_error_at, s.last_synced_at, c.last_seen_at),
    last_synced_at = COALESCE(s.last_synced_at, c.last_seen_at)
FROM fpt_catalog AS c
WHERE c.dataset_key = s.dataset_key
  AND s.availability = 'error'
  AND s.classification IS NULL;

UPDATE fpt_dataset_state AS s
SET classification = 'DEPRECATED',
    classification_reason = COALESCE(NULLIF(btrim(s.unavailable_reason), ''), NULLIF(btrim(s.last_error), ''), 'deprecated'),
    provider_path = COALESCE(s.provider_path, c.route),
    last_synced_at = COALESCE(s.last_synced_at, c.last_seen_at)
FROM fpt_catalog AS c
WHERE c.dataset_key = s.dataset_key
  AND s.availability = 'deprecated'
  AND s.classification IS NULL;

UPDATE fpt_dataset_state AS s
SET availability = 'removed',
    classification = 'REMOVED',
    classification_reason = 'absent_from_catalog',
    http_disposition = NULL,
    last_synced_at = COALESCE(s.last_synced_at, c.last_seen_at, now())
FROM fpt_catalog AS c
WHERE c.dataset_key = s.dataset_key
  AND c.active = false
  AND s.classification IS NULL;
