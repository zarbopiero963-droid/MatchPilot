-- MP-AF-SCHED-01 (#263, #287) — STAGED: non in migrations/, non si applica in produzione senza autorizzazione owner.
-- Budget giornaliero condiviso, registro delle esecuzioni, deduplica dei task e decisioni dello scheduler API-FOOTBALL.
-- Nessuna di queste tabelle è mai svuotata dallo scheduler (nessun DELETE, DROP o TRUNCATE nel codice).
CREATE TABLE IF NOT EXISTS af_scheduler_budget (
  day          date PRIMARY KEY,                        -- giorno UTC, come il reset della quota del provider
  daily_limit  integer NOT NULL CHECK (daily_limit > 0),
  used         integer NOT NULL DEFAULT 0 CHECK (used >= 0 AND used <= daily_limit),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS af_scheduler_runs (
  id           bigserial PRIMARY KEY,
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  status       text NOT NULL CHECK (status IN ('RUNNING','DONE','STOPPED','FAILED','ABORTED')),
  host         text NOT NULL,
  pid          integer NOT NULL,
  requests     integer NOT NULL DEFAULT 0 CHECK (requests >= 0),   -- tentativi, ognuno riservato nel budget
  tasks_done   integer NOT NULL DEFAULT 0 CHECK (tasks_done >= 0 AND tasks_done <= requests),
  reason_code  text,
  note         text,
  CHECK ((status = 'RUNNING') = (finished_at IS NULL)),
  CHECK (status = 'RUNNING' OR reason_code IS NOT NULL)
);
-- Un solo RUNNING alla volta, anche oltre l'advisory lock (difesa in profondità).
CREATE UNIQUE INDEX IF NOT EXISTS af_scheduler_one_running ON af_scheduler_runs ((true)) WHERE status = 'RUNNING';
-- Deduplica: un task (chiave stabile) completato in un giorno UTC non si ripete, nemmeno dopo un riavvio.
CREATE TABLE IF NOT EXISTS af_scheduler_done (
  day          date NOT NULL,
  task_key     text NOT NULL CHECK (length(task_key) BETWEEN 1 AND 200),
  run_id       bigint NOT NULL REFERENCES af_scheduler_runs(id),
  done_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (day, task_key)
);
-- Decisioni per task: completato, saltato (duplicato, già fatto, errore 4xx) o ritentato, con motivo.
CREATE TABLE IF NOT EXISTS af_scheduler_events (
  id           bigserial PRIMARY KEY,
  run_id       bigint NOT NULL REFERENCES af_scheduler_runs(id),
  at           timestamptz NOT NULL DEFAULT now(),
  task_key     text NOT NULL,
  decision     text NOT NULL CHECK (decision IN ('DONE','SKIPPED','RETRY')),
  reason_code  text NOT NULL,
  detail       text
);
CREATE INDEX IF NOT EXISTS af_scheduler_events_run ON af_scheduler_events (run_id);
