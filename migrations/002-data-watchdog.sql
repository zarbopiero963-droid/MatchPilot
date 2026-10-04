CREATE TABLE IF NOT EXISTS data_alerts (
  alert_id bigserial PRIMARY KEY,
  source text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('info','warning','critical')),
  code text NOT NULL,
  fingerprint text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  occurrences integer NOT NULL DEFAULT 1,
  resolved_at timestamptz,
  delivery_status text NOT NULL DEFAULT 'pending',
  last_delivered_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS data_alerts_open_fingerprint_uq
  ON data_alerts(fingerprint)
  WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS data_alerts_open_idx
  ON data_alerts(resolved_at, severity, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS data_watchdog_state (
  source text PRIMARY KEY,
  last_checked_at timestamptz,
  last_success_at timestamptz,
  last_run_id text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);
