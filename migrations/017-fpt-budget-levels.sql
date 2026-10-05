-- FPT-PR-09 (#12 API budget): #31 budget levels, deferred ("throttled") requests and retry_count.

ALTER TABLE fpt_request_ledger
  ADD COLUMN IF NOT EXISTS budget_level text,
  ADD COLUMN IF NOT EXISTS retry_count integer;

ALTER TABLE fpt_request_ledger DROP CONSTRAINT IF EXISTS fpt_request_ledger_budget_level_check;
ALTER TABLE fpt_request_ledger ADD CONSTRAINT fpt_request_ledger_budget_level_check
  CHECK (budget_level IS NULL OR budget_level IN ('NORMAL','ELEVATED','CONSERVE','CRITICAL','EXHAUSTED'));
ALTER TABLE fpt_request_ledger DROP CONSTRAINT IF EXISTS fpt_request_ledger_retry_count_check;
ALTER TABLE fpt_request_ledger ADD CONSTRAINT fpt_request_ledger_retry_count_check
  CHECK (retry_count IS NULL OR retry_count >= 0);

-- "throttled" = deferred by the budget level before any upstream call. It does not count toward the budget.
ALTER TABLE fpt_request_ledger DROP CONSTRAINT IF EXISTS fpt_request_ledger_outcome_check;
ALTER TABLE fpt_request_ledger ADD CONSTRAINT fpt_request_ledger_outcome_check
  CHECK (outcome IN ('cache_hit','upstream','429','error','deduped','throttled'));

-- retry_count is derived from the recorded attempt number; budget_level is left NULL where it was not measured.
UPDATE fpt_request_ledger
SET retry_count = CASE WHEN attempt > 1 THEN attempt - 1 ELSE 0 END
WHERE retry_count IS NULL;
