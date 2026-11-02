-- Rollback of migrations/031-apifootball-odds-snapshots.sql (MP-ODDS-MIG-01). Run by hand only, with an owner GO, after a
-- backup. It refuses to run while either table holds a row: snapshots and request rows are history and are never
-- dropped by a rollback (export them first; restoring them is a separate decision). With empty tables it removes exactly
-- what the migration created and its schema_migrations row, so the migration can be applied again later.
BEGIN;
DO $$
BEGIN
  IF to_regclass('af_odds_snapshots') IS NOT NULL AND EXISTS (SELECT 1 FROM af_odds_snapshots) THEN
    RAISE EXCEPTION 'ROLLBACK_REFUSED: af_odds_snapshots holds rows' USING ERRCODE = 'P0001';
  END IF;
  IF to_regclass('af_request_ledger') IS NOT NULL AND EXISTS (SELECT 1 FROM af_request_ledger) THEN
    RAISE EXCEPTION 'ROLLBACK_REFUSED: af_request_ledger holds rows' USING ERRCODE = 'P0001';
  END IF;
END
$$;
DROP TABLE IF EXISTS af_odds_snapshots;
DROP TABLE IF EXISTS af_request_ledger;
DROP FUNCTION IF EXISTS mp_af_append_only();
DELETE FROM schema_migrations WHERE filename = '031-apifootball-odds-snapshots.sql';
COMMIT;
