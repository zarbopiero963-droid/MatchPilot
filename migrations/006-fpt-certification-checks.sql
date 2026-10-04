CREATE TABLE IF NOT EXISTS fpt_certification_checks (
  check_id bigserial PRIMARY KEY,
  phase text NOT NULL,
  check_code text NOT NULL,
  status text NOT NULL CHECK (status IN ('pass','fail','blocked')),
  checked_at timestamptz NOT NULL DEFAULT now(),
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS fpt_certification_checks_phase_idx
  ON fpt_certification_checks(phase,checked_at DESC);
