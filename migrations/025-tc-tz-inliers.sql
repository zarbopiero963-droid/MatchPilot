-- TC-CORE-03 fix (#20), tc-tz-gate-v2: the offset estimate ignores outliers (late kickoffs); record how many samples agreed.
ALTER TABLE tc_tz_observations ADD COLUMN IF NOT EXISTS inliers integer NOT NULL DEFAULT 0;
