-- TC-CORE-03 fix (#20): the TotalCorner provider offset is measured and persisted, never assumed. A prematch cycle
-- normalizes rows only while the newest MEASURED observation is fresh and equals the configured offset.
CREATE TABLE IF NOT EXISTS tc_tz_observations (
  observation_id bigserial PRIMARY KEY,
  observed_at timestamptz NOT NULL,
  gate_version text NOT NULL,
  status text NOT NULL CHECK (status IN ('MEASURED','INSUFFICIENT','INCONSISTENT','UNAVAILABLE')),
  samples integer NOT NULL DEFAULT 0,
  excluded_not_real_time integer NOT NULL DEFAULT 0,
  median_minutes numeric,
  min_minutes numeric,
  max_minutes numeric,
  offset_minutes integer,
  configured_offset_minutes integer NOT NULL,
  agrees boolean,
  raw_ids bigint[] NOT NULL DEFAULT '{}',
  CHECK (status <> 'MEASURED' OR offset_minutes IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS tc_tz_observations_time ON tc_tz_observations(observed_at DESC);

ALTER TABLE tc_prematch_runs ADD COLUMN IF NOT EXISTS tz_observation_id bigint;
ALTER TABLE tc_matches ADD COLUMN IF NOT EXISTS tz_observation_id bigint;
