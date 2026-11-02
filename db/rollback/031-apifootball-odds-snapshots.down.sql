-- Rollback of migrations/031-apifootball-odds-snapshots.sql (MP-ODDS-MIG-01). Run by hand only, with an owner GO, after a
-- backup. It refuses to run while either table holds a row: snapshots and request rows are history and are never
-- dropped by a rollback (export them first; restoring them is a separate decision). With empty tables it removes exactly
-- what the migration created and its schema_migrations row, so the migration can be applied again later.
-- Confirm the target schema first: names are unqualified and resolve through the connection's search_path.
-- Safe to run again on an already rolled-back schema (missing tables are skipped, the schema_migrations row is removed).
BEGIN;
-- The advisory lock of migrate() (class MIGRATION_LOCK_CLASS 0x4d504d47 = 1297108295, key hashtext(current_schema())),
-- so it never runs alongside a migrator; then exclusive table locks, so no insert lands between the check and the drop.
SELECT pg_advisory_xact_lock(1297108295, hashtext(current_schema()));
DO $$
DECLARE has_rows boolean;
BEGIN
  IF to_regclass('af_odds_snapshots') IS NOT NULL THEN
    EXECUTE 'LOCK TABLE af_odds_snapshots IN ACCESS EXCLUSIVE MODE';
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM af_odds_snapshots)' INTO has_rows;
    IF has_rows THEN RAISE EXCEPTION 'ROLLBACK_REFUSED: af_odds_snapshots holds rows' USING ERRCODE = 'P0001'; END IF;
  END IF;
  IF to_regclass('af_request_ledger') IS NOT NULL THEN
    EXECUTE 'LOCK TABLE af_request_ledger IN ACCESS EXCLUSIVE MODE';
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM af_request_ledger)' INTO has_rows;
    IF has_rows THEN RAISE EXCEPTION 'ROLLBACK_REFUSED: af_request_ledger holds rows' USING ERRCODE = 'P0001'; END IF;
  END IF;
END
$$;
DROP TABLE IF EXISTS af_odds_snapshots;
DROP TABLE IF EXISTS af_request_ledger;
DROP FUNCTION IF EXISTS mp_af_append_only();
DELETE FROM schema_migrations WHERE filename = '031-apifootball-odds-snapshots.sql';
COMMIT;
