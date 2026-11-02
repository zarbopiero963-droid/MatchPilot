-- MP-AF-RAW-01 (#263, P1 of PR #283, owner mandate MP-MIGRATIONS-030-031-AND-API-FOOTBALL-P1-FIX-01, decision P1=A):
-- the raw API-FOOTBALL answers, kept before any normalization, and the link from every new odds snapshot to the answer
-- it was parsed from.
-- MIGRATION, MANUAL. In production it is applied only when named in MATCHPILOT_APPROVED_MIGRATIONS (src/migrate.mjs) and
-- allowed by mp-deploy (allow-migrations-<sha>): two explicit owner steps. Rollback:
-- db/rollback/033-apifootball-raw-responses.down.sql, which refuses to run while any raw answer or linked snapshot exists.
--
-- DEPENDS ON migrations/031-apifootball-odds-snapshots.sql (PR #282): af_request_ledger, af_odds_snapshots and the
-- function mp_af_append_only(). Without them this file fails (undefined table) and migrate() rolls it back whole.
-- 032 is reserved by db/staged/032-af-scheduler.sql (PR #287, draft); this file does not depend on it.
--
-- Additive only. Existing snapshot rows are never rewritten: the new column is nullable without default (a catalog
-- change, no table rewrite), its foreign key and the "raw_id required" check are NOT VALID, so they bind every new row
-- and never scan, reject or hide the rows already stored (raw_id NULL = acquired before the raw store existed).
-- Locks: ACCESS EXCLUSIVE on af_odds_snapshots for the length of this transaction (ALTER TABLE, CREATE TRIGGER, one
-- partial index build over the existing rows); lock_timeout makes it fail fast instead of queueing behind a long reader.
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS af_raw_responses (
  raw_id bigserial PRIMARY KEY,
  provider text NOT NULL DEFAULT 'api-football' CHECK (provider = 'api-football'),
  -- The ledger row of the HTTP exchange this body answered (one answer per request).
  request_id bigint NOT NULL REFERENCES af_request_ledger(request_id),
  endpoint text NOT NULL CHECK (endpoint ~ '^/[a-z/]+$'),
  family text NOT NULL CHECK (family IN ('status','reference','fixtures','match','odds','live')),
  path text NOT NULL CHECK (length(path) <= 2048),
  params_hash text NOT NULL CHECK (params_hash ~ '^[0-9a-f]{64}$'),
  request_params jsonb NOT NULL CHECK (jsonb_typeof(request_params) = 'object'),
  purpose text NOT NULL CHECK (purpose ~ '^[a-z][a-z0-9_-]{0,39}$'),
  -- MatchPilot clock: request start (equals the ledger's requested_at) and reception of the answer (the client's
  -- fetched_at, which is the snapshots' acquired_at). The provider's own clock is its HTTP Date header, verbatim.
  requested_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL,
  provider_date text CHECK (provider_date IS NULL OR length(provider_date) <= 100),
  content_type text CHECK (content_type IS NULL OR length(content_type) <= 200),
  http_status smallint NOT NULL CHECK (http_status BETWEEN 100 AND 599),
  outcome text NOT NULL CHECK (outcome IN ('ok','provider_error')),
  -- The body exactly as received (get, parameters, errors, results, paging, response and any unknown field), its size
  -- and its SHA-256, checked by the database itself. body_exact is false only when the HTTP bytes were not available
  -- and the body is the parsed JSON serialized again.
  body bytea NOT NULL,
  body_exact boolean NOT NULL,
  body_bytes integer NOT NULL CHECK (body_bytes BETWEEN 0 AND 33554432),
  body_sha256 text NOT NULL CHECK (body_sha256 ~ '^[0-9a-f]{64}$'),
  quota jsonb,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT af_raw_responses_bytes CHECK (body_bytes = octet_length(body)),
  CONSTRAINT af_raw_responses_sha256 CHECK (body_sha256 = encode(sha256(body), 'hex')),
  CONSTRAINT af_raw_responses_received CHECK (received_at >= requested_at),
  -- Idempotent dedupe: the same answer (request and body hash) is stored once; a different body for a request that
  -- already has one is refused (af_raw_responses_one_per_request), never silently replaced.
  CONSTRAINT af_raw_responses_dedupe UNIQUE (request_id, body_sha256),
  CONSTRAINT af_raw_responses_one_per_request UNIQUE (request_id)
);
CREATE INDEX IF NOT EXISTS af_raw_responses_received_idx ON af_raw_responses(endpoint, received_at);

-- Traceability: a raw answer must agree with its ledger row (same request, provider outcome and status, same instant).
CREATE OR REPLACE FUNCTION mp_af_raw_matches_ledger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE l af_request_ledger%ROWTYPE;
BEGIN
  SELECT * INTO l FROM af_request_ledger WHERE request_id = NEW.request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RAW_LEDGER_MISMATCH: request % has no ledger row', NEW.request_id USING ERRCODE = '23503';
  END IF;
  IF l.endpoint <> NEW.endpoint OR l.family <> NEW.family OR l.path <> NEW.path OR l.params_hash <> NEW.params_hash
     OR l.purpose <> NEW.purpose OR l.outcome <> NEW.outcome OR l.http_status IS DISTINCT FROM NEW.http_status
     OR l.requested_at <> NEW.requested_at THEN
    RAISE EXCEPTION 'RAW_LEDGER_MISMATCH: raw answer does not match ledger request %', NEW.request_id USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;
CREATE OR REPLACE TRIGGER af_raw_responses_matches_ledger BEFORE INSERT ON af_raw_responses FOR EACH ROW EXECUTE FUNCTION mp_af_raw_matches_ledger();
CREATE OR REPLACE TRIGGER af_raw_responses_append_only BEFORE UPDATE OR DELETE ON af_raw_responses FOR EACH ROW EXECUTE FUNCTION mp_af_append_only();
CREATE OR REPLACE TRIGGER af_raw_responses_no_truncate BEFORE TRUNCATE ON af_raw_responses FOR EACH STATEMENT EXECUTE FUNCTION mp_af_append_only();

-- The link from the normalized snapshots to their raw answer.
ALTER TABLE af_odds_snapshots ADD COLUMN IF NOT EXISTS raw_id bigint;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'af_odds_snapshots_raw_fk' AND conrelid = 'af_odds_snapshots'::regclass) THEN
    ALTER TABLE af_odds_snapshots ADD CONSTRAINT af_odds_snapshots_raw_fk FOREIGN KEY (raw_id) REFERENCES af_raw_responses(raw_id) NOT VALID;
  END IF;
  -- Every new snapshot names its raw answer. NOT VALID: rows stored before this migration keep raw_id NULL and stay
  -- readable; do not VALIDATE this constraint while such rows exist.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'af_odds_snapshots_raw_required' AND conrelid = 'af_odds_snapshots'::regclass) THEN
    ALTER TABLE af_odds_snapshots ADD CONSTRAINT af_odds_snapshots_raw_required CHECK (raw_id IS NOT NULL) NOT VALID;
  END IF;
END
$$;
CREATE INDEX IF NOT EXISTS af_odds_snapshots_raw_idx ON af_odds_snapshots(raw_id) WHERE raw_id IS NOT NULL;

-- A snapshot links only to an /odds answer of the provider that succeeded, of the same request, acquired at the
-- instant that answer was received.
CREATE OR REPLACE FUNCTION mp_af_snapshot_matches_raw()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE r af_raw_responses%ROWTYPE;
BEGIN
  IF NEW.raw_id IS NULL THEN RETURN NEW; END IF;  -- refused by af_odds_snapshots_raw_required
  SELECT * INTO r FROM af_raw_responses WHERE raw_id = NEW.raw_id;
  IF NOT FOUND THEN RETURN NEW; END IF;           -- refused by af_odds_snapshots_raw_fk
  IF r.endpoint <> '/odds' OR r.outcome <> 'ok' OR NEW.request_id IS DISTINCT FROM r.request_id OR NEW.acquired_at <> r.received_at THEN
    RAISE EXCEPTION 'RAW_LINK_MISMATCH: snapshot does not come from raw answer %', NEW.raw_id USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;
CREATE OR REPLACE TRIGGER af_odds_snapshots_matches_raw BEFORE INSERT ON af_odds_snapshots FOR EACH ROW EXECUTE FUNCTION mp_af_snapshot_matches_raw();
