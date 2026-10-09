-- TC-CORE-04 v2: bounded legacy dedup and explicit FT confirmation from type=ended.
ALTER TABLE tc_live_snapshots ADD COLUMN IF NOT EXISTS hash_version text NOT NULL DEFAULT 'v1';
ALTER TABLE tc_live_events ADD COLUMN IF NOT EXISTS hash_version text NOT NULL DEFAULT 'v1';
ALTER TABLE tc_live_cursors ADD COLUMN IF NOT EXISTS terminal_at timestamptz;
ALTER TABLE tc_live_cursors ADD COLUMN IF NOT EXISTS terminal_raw_id bigint;
ALTER TABLE tc_live_cursors ADD COLUMN IF NOT EXISTS terminal_source text;

CREATE INDEX IF NOT EXISTS tc_live_snapshots_v1_payload_fingerprint
  ON tc_live_snapshots(match_id, md5(payload::text)) WHERE hash_version='v1';
CREATE INDEX IF NOT EXISTS tc_live_events_v1_payload_fingerprint
  ON tc_live_events(match_id, md5(payload::text)) WHERE hash_version='v1';
CREATE INDEX IF NOT EXISTS tc_live_cursors_pending_terminal
  ON tc_live_cursors(last_polled_at DESC) WHERE terminal_at IS NULL;
