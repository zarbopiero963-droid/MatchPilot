-- Rollback of migrations/033-apifootball-raw-responses.sql (MP-AF-RAW-01). Run by hand only, with an owner GO, after a
-- backup. It refuses to run while any raw answer is stored or any snapshot names one: raw answers are history and are
-- never dropped by a rollback (export them first; restoring them is a separate decision). Otherwise it removes exactly
-- what the migration created (table, triggers, functions, the raw_id column with its constraints and index) and its
-- schema_migrations row, so the migration can be applied again later. Snapshot rows already stored are not touched.
-- Order: roll back 033 before 031 (af_raw_responses references af_request_ledger).
-- Confirm the target schema first: names are unqualified and resolve through the connection's search_path.
-- Safe to run again on an already rolled-back schema.
BEGIN;
-- The advisory lock of migrate() (class MIGRATION_LOCK_CLASS 0x4d504d47 = 1297108295, key hashtext(current_schema())),
-- so it never runs alongside a migrator; then exclusive table locks, so no insert lands between the check and the drop.
SELECT pg_advisory_xact_lock(1297108295, hashtext(current_schema()));
DO $$
DECLARE has_rows boolean;
BEGIN
  IF to_regclass('af_odds_snapshots') IS NOT NULL THEN
    EXECUTE 'LOCK TABLE af_odds_snapshots IN ACCESS EXCLUSIVE MODE';
    IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'af_odds_snapshots'::regclass AND attname = 'raw_id' AND NOT attisdropped) THEN
      EXECUTE 'SELECT EXISTS (SELECT 1 FROM af_odds_snapshots WHERE raw_id IS NOT NULL)' INTO has_rows;
      IF has_rows THEN RAISE EXCEPTION 'ROLLBACK_REFUSED: af_odds_snapshots holds rows linked to raw answers' USING ERRCODE = 'P0001'; END IF;
    END IF;
  END IF;
  IF to_regclass('af_raw_responses') IS NOT NULL THEN
    EXECUTE 'LOCK TABLE af_raw_responses IN ACCESS EXCLUSIVE MODE';
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM af_raw_responses)' INTO has_rows;
    IF has_rows THEN RAISE EXCEPTION 'ROLLBACK_REFUSED: af_raw_responses holds rows' USING ERRCODE = 'P0001'; END IF;
  END IF;
  IF to_regclass('af_odds_snapshots') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS af_odds_snapshots_matches_raw ON af_odds_snapshots';
    EXECUTE 'ALTER TABLE af_odds_snapshots DROP CONSTRAINT IF EXISTS af_odds_snapshots_raw_required';
    EXECUTE 'ALTER TABLE af_odds_snapshots DROP CONSTRAINT IF EXISTS af_odds_snapshots_raw_fk';
    EXECUTE 'DROP INDEX IF EXISTS af_odds_snapshots_raw_idx';
    EXECUTE 'ALTER TABLE af_odds_snapshots DROP COLUMN IF EXISTS raw_id';
  END IF;
END
$$;
DROP TABLE IF EXISTS af_raw_responses;
DROP FUNCTION IF EXISTS mp_af_snapshot_matches_raw();
DROP FUNCTION IF EXISTS mp_af_raw_matches_ledger();
DELETE FROM schema_migrations WHERE filename = '033-apifootball-raw-responses.sql';
COMMIT;
