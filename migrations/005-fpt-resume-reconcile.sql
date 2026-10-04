UPDATE fpt_dataset_state
SET availability='available',
    unavailable_reason=NULL,
    last_error=NULL
WHERE availability='unknown'
  AND last_snapshot_id IS NOT NULL;

UPDATE fpt_sync_runs
SET status='partial',
    finished_at=COALESCE(finished_at,now()),
    meta=COALESCE(meta,'{}'::jsonb) || '{"interrupted":true,"reconciled_by":"005"}'::jsonb
WHERE status='running';
