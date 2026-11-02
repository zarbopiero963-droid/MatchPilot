-- Rollback of migrations/030-persistence.sql (MP-MIG-030-PROMOTE-01), same pattern as the rollback of migration 031
-- (PR #282). Run by hand only, with an owner GO, after a backup. It refuses to run while any persistence table holds a
-- row: ledger entries, strategies and saved backtests are history and are never dropped by a rollback (export them
-- first; restoring them is a separate decision). With empty tables it removes exactly what the migration created and
-- its schema_migrations row. Confirm the target schema first: names are unqualified and resolve through the
-- connection's search_path. Safe to run again on an already rolled-back schema (missing objects are skipped).
BEGIN;
-- The advisory lock of migrate() (class MIGRATION_LOCK_CLASS 0x4d504d47 = 1297108295, key hashtext(current_schema())),
-- so it never runs alongside a migrator; then exclusive table locks, so no insert lands between the check and the drop.
SELECT pg_advisory_xact_lock(1297108295, hashtext(current_schema()));
DO $$
DECLARE
  t text;
  has_rows boolean;
BEGIN
  FOREACH t IN ARRAY ARRAY['paper_ledger_entries','paper_ledger_keys','strategy_versions','strategy_definitions','saved_backtests'] LOOP
    IF to_regclass(t) IS NOT NULL THEN
      EXECUTE format('LOCK TABLE %I IN ACCESS EXCLUSIVE MODE', t);
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I)', t) INTO has_rows;
      IF has_rows THEN RAISE EXCEPTION 'ROLLBACK_REFUSED: % holds rows', t USING ERRCODE = 'P0001'; END IF;
    END IF;
  END LOOP;
END
$$;
DROP TABLE IF EXISTS saved_backtests;
DROP TABLE IF EXISTS strategy_versions;
DROP TABLE IF EXISTS strategy_definitions;
DROP TABLE IF EXISTS paper_ledger_keys;
DROP TABLE IF EXISTS paper_ledger_entries;
DROP FUNCTION IF EXISTS mp_strategy_versions_supersede_only();
DROP FUNCTION IF EXISTS mp_paper_ledger_next_seq();
DROP FUNCTION IF EXISTS mp_persistence_append_only();
DELETE FROM schema_migrations WHERE filename = '030-persistence.sql';
COMMIT;
