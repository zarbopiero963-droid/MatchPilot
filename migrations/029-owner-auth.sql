-- R-04b (#23, owner decision D12): owner login sessions and audit trail.
-- In production this file is applied only when the owner lists it in MATCHPILOT_APPROVED_MIGRATIONS (D13), after
-- backup, compatibility check and recovery plan. Until then MATCHPILOT_AUTH=enforce fails closed (503): the code
-- never opens the site because the tables are missing. Additive only: no existing table is changed.
-- Recovery: DROP TABLE auth_audit, auth_sessions; (no other object depends on them).

CREATE TABLE IF NOT EXISTS auth_sessions(
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'), -- SHA-256 of the random token; the token is never stored
  principal_id text NOT NULL,                                       -- 'owner' today; future users get their own ids
  roles text[] NOT NULL CHECK (cardinality(roles) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  idle_expires_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoke_reason text CHECK (revoke_reason IN ('logout', 'rotated', 'revoked')),
  CHECK (idle_expires_at <= expires_at),
  CHECK ((revoked_at IS NULL) = (revoke_reason IS NULL))
);
CREATE INDEX IF NOT EXISTS auth_sessions_active_principal ON auth_sessions(principal_id) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS auth_audit(
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  event text NOT NULL CHECK (event IN ('login_success', 'login_failure', 'login_rate_limited', 'logout', 'origin_rejected')),
  principal_id text,
  username_hash text CHECK (username_hash IS NULL OR username_hash ~ '^[0-9a-f]{64}$'), -- HMAC-SHA-256 (server key) of the submitted username; never the password
  client_hash text CHECK (client_hash IS NULL OR client_hash ~ '^[0-9a-f]{64}$'),       -- HMAC-SHA-256 (server key) of the client address
  detail jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS auth_audit_failures ON auth_audit(at) WHERE event = 'login_failure';
