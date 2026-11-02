-- MP-AF-SCHED-01 (#263) — STAGED: non in migrations/, non si applica in produzione senza autorizzazione owner.
-- Budget giornaliero condiviso e registro delle esecuzioni dello scheduler API-FOOTBALL.
CREATE TABLE IF NOT EXISTS af_scheduler_budget (
  day          date PRIMARY KEY,
  daily_limit  integer NOT NULL CHECK (daily_limit > 0),
  used         integer NOT NULL DEFAULT 0 CHECK (used >= 0 AND used <= daily_limit)
);
CREATE TABLE IF NOT EXISTS af_scheduler_runs (
  id           bigserial PRIMARY KEY,
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  status       text NOT NULL CHECK (status IN ('RUNNING','DONE','STOPPED','FAILED','ABORTED')),
  host         text NOT NULL,
  pid          integer NOT NULL,
  requests     integer NOT NULL DEFAULT 0,
  note         text
);
-- Un solo RUNNING alla volta, anche oltre l'advisory lock (difesa in profondità).
CREATE UNIQUE INDEX IF NOT EXISTS af_scheduler_one_running ON af_scheduler_runs ((true)) WHERE status = 'RUNNING';
