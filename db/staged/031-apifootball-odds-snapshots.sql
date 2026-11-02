-- MP-ODDS-SNAP-01 (#263, MP-OWNER-IMPL-20261101 "storico quote"): the API-FOOTBALL request ledger and the pre-match odds
-- snapshots MatchPilot builds itself, from acquisition time on.
-- STAGED, NOT A MIGRATION: this file is outside migrations/, so neither migrate() nor the deploy guard sees it. It becomes a
-- migration only in a PR the owner authorizes (migrations and production schema are MANUAL, AGENTS.md section 4).
-- Additive only: new tables, one function, triggers and indexes; nothing existing is changed. Both tables are
-- append-only, enforced by the database.
--
-- The provider guarantees no odds history (odds:false for past seasons, verification of 2026-11-01): the history is
-- the sequence of these snapshots, each with the instant MatchPilot acquired it. The database refuses a pre-match row
-- acquired at or after kickoff, or whose provider update is at or after kickoff: data after kickoff never becomes a
-- pre-match price.

CREATE TABLE IF NOT EXISTS af_request_ledger (
  request_id bigserial PRIMARY KEY,
  requested_at timestamptz NOT NULL,
  endpoint text NOT NULL CHECK (endpoint ~ '^/[a-z/]+$'),
  family text NOT NULL CHECK (family IN ('status','reference','fixtures','match','odds','live')),
  path text NOT NULL CHECK (length(path) <= 2048),
  params_hash text NOT NULL CHECK (params_hash ~ '^[0-9a-f]{64}$'),
  purpose text NOT NULL CHECK (purpose ~ '^[a-z][a-z0-9_-]{0,39}$'),
  attempt smallint NOT NULL CHECK (attempt IN (1, 2)),
  outcome text NOT NULL CHECK (outcome IN ('ok','provider_error','http_error','rate_limited','network_error','timeout')),
  http_status smallint CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599),
  latency_ms integer CHECK (latency_ms IS NULL OR latency_ms >= 0),
  quota jsonb,
  error text CHECK (error IS NULL OR length(error) <= 200),
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS af_request_ledger_requested_idx ON af_request_ledger(requested_at);

CREATE TABLE IF NOT EXISTS af_odds_snapshots (
  snapshot_id bigserial PRIMARY KEY,
  fixture_id bigint NOT NULL CHECK (fixture_id > 0),
  kickoff_at timestamptz NOT NULL,
  acquired_at timestamptz NOT NULL,
  provider_update_at timestamptz,
  phase text NOT NULL CHECK (phase = 'PREMATCH'),
  bookmaker_id integer NOT NULL CHECK (bookmaker_id > 0),
  bookmaker_name text NOT NULL,
  bet_id integer NOT NULL CHECK (bet_id > 0),
  bet_name text NOT NULL,
  value_text text NOT NULL CHECK (btrim(value_text) <> '' AND length(value_text) <= 120),
  handicap_text text NOT NULL DEFAULT '' CHECK (length(handicap_text) <= 20),
  odd numeric(12,4) NOT NULL CHECK (odd >= 1),
  odd_text text NOT NULL CHECK (odd_text ~ '^[0-9]{1,4}(\.[0-9]{1,4})?$'),
  market_ref_status text NOT NULL CHECK (market_ref_status IN ('PARSED','UNCLASSIFIED')),
  market_key text CHECK ((market_ref_status = 'PARSED') = (market_key IS NOT NULL)),
  market_ref_version text NOT NULL,
  request_id bigint REFERENCES af_request_ledger(request_id),
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  -- PIT: a pre-match price is acquired before kickoff and its provider update is before kickoff too.
  CONSTRAINT af_odds_snapshots_prematch_acquired CHECK (acquired_at < kickoff_at),
  CONSTRAINT af_odds_snapshots_prematch_update CHECK (provider_update_at IS NULL OR provider_update_at < kickoff_at),
  -- The provider update cannot be later than the acquisition (a 5-minute clock tolerance).
  CONSTRAINT af_odds_snapshots_update_not_future CHECK (provider_update_at IS NULL OR provider_update_at <= acquired_at + interval '5 minutes'),
  -- One snapshot per selection and acquisition: replaying the same acquisition writes nothing. Unchanged prices are
  -- skipped by the writer against the previous snapshot of the same selection (store.mjs), never against the whole
  -- history, so a price that returns to an earlier value is kept.
  CONSTRAINT af_odds_snapshots_acquisition UNIQUE (fixture_id, bookmaker_id, bet_id, value_text, handicap_text, acquired_at)
);
CREATE INDEX IF NOT EXISTS af_odds_snapshots_fixture_idx ON af_odds_snapshots(fixture_id, acquired_at);
CREATE INDEX IF NOT EXISTS af_odds_snapshots_selection_idx ON af_odds_snapshots(fixture_id, bookmaker_id, bet_id, value_text, handicap_text, acquired_at DESC);
CREATE INDEX IF NOT EXISTS af_odds_snapshots_market_idx ON af_odds_snapshots(market_key, acquired_at) WHERE market_key IS NOT NULL;

CREATE OR REPLACE FUNCTION mp_af_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'APPEND_ONLY: % on % is refused', TG_OP, TG_TABLE_NAME USING ERRCODE = 'P0001';
END
$$;

CREATE OR REPLACE TRIGGER af_request_ledger_append_only BEFORE UPDATE OR DELETE ON af_request_ledger FOR EACH ROW EXECUTE FUNCTION mp_af_append_only();
CREATE OR REPLACE TRIGGER af_request_ledger_no_truncate BEFORE TRUNCATE ON af_request_ledger FOR EACH STATEMENT EXECUTE FUNCTION mp_af_append_only();
CREATE OR REPLACE TRIGGER af_odds_snapshots_append_only BEFORE UPDATE OR DELETE ON af_odds_snapshots FOR EACH ROW EXECUTE FUNCTION mp_af_append_only();
CREATE OR REPLACE TRIGGER af_odds_snapshots_no_truncate BEFORE TRUNCATE ON af_odds_snapshots FOR EACH STATEMENT EXECUTE FUNCTION mp_af_append_only();
