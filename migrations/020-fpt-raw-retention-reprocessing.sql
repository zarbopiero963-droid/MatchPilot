-- FPT-PR-09 (#12 parser / schema version migration policy and raw retention policy).

-- Raw retention: a raw snapshot is append-only. Its content never changes; only the ingest flag is set once the
-- match rows are committed. A deletion needs an explicit owner authorization in the session and leaves a log row.
CREATE TABLE IF NOT EXISTS fpt_raw_retention_log (
  log_id bigserial PRIMARY KEY,
  snapshot_id bigint NOT NULL,
  dataset_key text NOT NULL,
  sha256 text NOT NULL,
  action text NOT NULL CHECK (action IN ('delete')),
  authorized_by text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION fpt_raw_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE v_auth text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.snapshot_id, NEW.dataset_key, NEW.source_kind, NEW.provider_path, NEW.acquired_at, NEW.sha256,
        NEW.row_count, NEW.headers, NEW.payload_gzip)
       IS DISTINCT FROM
       (OLD.snapshot_id, OLD.dataset_key, OLD.source_kind, OLD.provider_path, OLD.acquired_at, OLD.sha256,
        OLD.row_count, OLD.headers, OLD.payload_gzip) THEN
      RAISE EXCEPTION 'fpt_raw_snapshots is append-only: snapshot % cannot be modified', OLD.snapshot_id;
    END IF;
    RETURN NEW;
  END IF;
  v_auth := NULLIF(current_setting('matchpilot.raw_delete_authorization', true), '');
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'raw snapshot % cannot be deleted without owner authorization (matchpilot.raw_delete_authorization)', OLD.snapshot_id;
  END IF;
  INSERT INTO fpt_raw_retention_log(snapshot_id, dataset_key, sha256, action, authorized_by)
  VALUES (OLD.snapshot_id, OLD.dataset_key, OLD.sha256, 'delete', v_auth);
  RETURN OLD;
END
$$;

DROP TRIGGER IF EXISTS fpt_raw_guard_trg ON fpt_raw_snapshots;
CREATE TRIGGER fpt_raw_guard_trg
  BEFORE UPDATE OR DELETE ON fpt_raw_snapshots
  FOR EACH ROW EXECUTE FUNCTION fpt_raw_guard();

-- Reprocessing registry: every re-parse of the raw (dry run or apply) is a run with its versions and outcome.
CREATE TABLE IF NOT EXISTS fpt_reprocessing_runs (
  run_id text PRIMARY KEY,
  mode text NOT NULL CHECK (mode IN ('dry_run','apply')),
  parser_version text NOT NULL,
  schema_version text NOT NULL,
  transform_version text NOT NULL,
  stored_version_sets jsonb NOT NULL DEFAULT '[]'::jsonb,
  actor text NOT NULL,
  reason text NOT NULL,
  scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL CHECK (status IN ('running','complete','failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  snapshots_scanned integer NOT NULL DEFAULT 0,
  snapshots_hash_mismatch integer NOT NULL DEFAULT 0,
  rows_parsed bigint NOT NULL DEFAULT 0,
  rows_unchanged bigint NOT NULL DEFAULT 0,
  rows_new_output bigint NOT NULL DEFAULT 0,
  versions_inserted bigint NOT NULL DEFAULT 0,
  versions_before bigint,
  versions_after bigint,
  error text
);

-- Old vs new output, per changed row (sampled per run).
CREATE TABLE IF NOT EXISTS fpt_reprocessing_diffs (
  run_id text NOT NULL REFERENCES fpt_reprocessing_runs(run_id) ON DELETE CASCADE,
  snapshot_id bigint NOT NULL,
  dataset_key text NOT NULL,
  match_key text NOT NULL,
  previous_version_id bigint,
  changed_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (run_id, snapshot_id, match_key)
);
