-- PERSIST-STORE-01 (priority 4, #99 #34): persistence of the paper ledger, configurable strategies and saved backtests.
-- STAGED, NOT A MIGRATION: this file is outside migrations/, so neither migrate() nor the deploy guard sees it. It
-- becomes migrations/030-persistence.sql only in the migration PR the owner authorizes (docs/persistence-plan.md).
-- Additive only: new tables, functions, triggers and indexes; nothing existing is changed. Append-only rules are enforced
-- by the database: UPDATE, DELETE and TRUNCATE raise, except the single allowed UPDATE of strategy_versions.

CREATE TABLE IF NOT EXISTS paper_ledger_entries (
  account_id text NOT NULL CHECK (btrim(account_id) <> ''),
  seq integer NOT NULL CHECK (seq >= 1),
  type text NOT NULL CHECK (type IN ('INITIAL_ALLOCATION','OPEN','HEDGE','SETTLEMENT_GROSS','COMMISSION','SETTLEMENT_NET','REVERSAL')),
  entry text NOT NULL,
  entry_sha256 text NOT NULL CHECK (entry_sha256 ~ '^[0-9a-f]{64}$'),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, seq)
);

CREATE TABLE IF NOT EXISTS paper_ledger_keys (
  account_id text NOT NULL,
  idempotency_key text NOT NULL CHECK (btrim(idempotency_key) <> ''),
  fingerprint text NOT NULL,
  entry_seqs integer[] NOT NULL CHECK (cardinality(entry_seqs) >= 1),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS strategy_definitions (
  strategy_id text PRIMARY KEY CHECK (strategy_id ~ '^def:[0-9a-f]{16}$'),
  definition text NOT NULL,
  definition_sha256 text NOT NULL CHECK (definition_sha256 ~ '^[0-9a-f]{64}$'),
  definition_version text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS strategy_versions (
  strategy_key text NOT NULL CHECK (strategy_key ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
  version integer NOT NULL CHECK (version >= 1),
  strategy_id text NOT NULL REFERENCES strategy_definitions(strategy_id),
  name text NOT NULL CHECK (btrim(name) <> '' AND length(name) <= 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  superseded_at timestamptz,
  PRIMARY KEY (strategy_key, version)
);
-- At most one current version per key.
CREATE UNIQUE INDEX IF NOT EXISTS strategy_versions_current_idx ON strategy_versions(strategy_key) WHERE superseded_at IS NULL;

CREATE TABLE IF NOT EXISTS saved_backtests (
  backtest_id bigserial PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('BACKTEST','COMPARE')),
  name text NOT NULL CHECK (btrim(name) <> '' AND length(name) <= 200),
  response text NOT NULL,
  response_sha256 text NOT NULL UNIQUE CHECK (response_sha256 ~ '^[0-9a-f]{64}$'),
  report_sha256 text[] NOT NULL CHECK (cardinality(report_sha256) >= 1),
  input_sha256 text NOT NULL,
  strategy_ids text[] NOT NULL,
  code_version text,
  params text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Append-only: every UPDATE, DELETE and TRUNCATE is refused.
CREATE OR REPLACE FUNCTION mp_persistence_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'APPEND_ONLY: % on % is refused', TG_OP, TG_TABLE_NAME USING ERRCODE = 'P0001';
END
$$;

-- The next ledger entry of an account must be max(seq)+1 (a concurrent append conflicts on the primary key instead).
CREATE OR REPLACE FUNCTION mp_paper_ledger_next_seq()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE v_last integer;
BEGIN
  SELECT max(seq) INTO v_last FROM paper_ledger_entries WHERE account_id = NEW.account_id;
  IF NEW.seq <> COALESCE(v_last, 0) + 1 THEN
    RAISE EXCEPTION 'LEDGER_SEQ: account % expects seq %, got %', NEW.account_id, COALESCE(v_last, 0) + 1, NEW.seq USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END
$$;

-- strategy_versions: the only UPDATE sets superseded_at once, from NULL, and changes nothing else.
CREATE OR REPLACE FUNCTION mp_strategy_versions_supersede_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP <> 'UPDATE' OR OLD.superseded_at IS NOT NULL OR NEW.superseded_at IS NULL
     OR (NEW.strategy_key, NEW.version, NEW.strategy_id, NEW.name, NEW.created_at)
        IS DISTINCT FROM (OLD.strategy_key, OLD.version, OLD.strategy_id, OLD.name, OLD.created_at) THEN
    RAISE EXCEPTION 'APPEND_ONLY: % on strategy_versions is refused (only superseded_at can be set once)', TG_OP USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE TRIGGER paper_ledger_entries_seq BEFORE INSERT ON paper_ledger_entries FOR EACH ROW EXECUTE FUNCTION mp_paper_ledger_next_seq();
CREATE OR REPLACE TRIGGER paper_ledger_entries_append_only BEFORE UPDATE OR DELETE ON paper_ledger_entries FOR EACH ROW EXECUTE FUNCTION mp_persistence_append_only();
CREATE OR REPLACE TRIGGER paper_ledger_entries_no_truncate BEFORE TRUNCATE ON paper_ledger_entries FOR EACH STATEMENT EXECUTE FUNCTION mp_persistence_append_only();

CREATE OR REPLACE TRIGGER paper_ledger_keys_append_only BEFORE UPDATE OR DELETE ON paper_ledger_keys FOR EACH ROW EXECUTE FUNCTION mp_persistence_append_only();
CREATE OR REPLACE TRIGGER paper_ledger_keys_no_truncate BEFORE TRUNCATE ON paper_ledger_keys FOR EACH STATEMENT EXECUTE FUNCTION mp_persistence_append_only();

CREATE OR REPLACE TRIGGER strategy_definitions_append_only BEFORE UPDATE OR DELETE ON strategy_definitions FOR EACH ROW EXECUTE FUNCTION mp_persistence_append_only();
CREATE OR REPLACE TRIGGER strategy_definitions_no_truncate BEFORE TRUNCATE ON strategy_definitions FOR EACH STATEMENT EXECUTE FUNCTION mp_persistence_append_only();

CREATE OR REPLACE TRIGGER strategy_versions_supersede_only BEFORE UPDATE OR DELETE ON strategy_versions FOR EACH ROW EXECUTE FUNCTION mp_strategy_versions_supersede_only();
CREATE OR REPLACE TRIGGER strategy_versions_no_truncate BEFORE TRUNCATE ON strategy_versions FOR EACH STATEMENT EXECUTE FUNCTION mp_persistence_append_only();

CREATE OR REPLACE TRIGGER saved_backtests_append_only BEFORE UPDATE OR DELETE ON saved_backtests FOR EACH ROW EXECUTE FUNCTION mp_persistence_append_only();
CREATE OR REPLACE TRIGGER saved_backtests_no_truncate BEFORE TRUNCATE ON saved_backtests FOR EACH STATEMENT EXECUTE FUNCTION mp_persistence_append_only();
