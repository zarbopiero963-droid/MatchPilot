# Owner login (R-04b)

Issue #23, owner decision D12 (`MP-OWNER-D12-OWNER-LOGIN-20261019`). Code: [`src/auth/owner-auth.mjs`](../src/auth/owner-auth.mjs), [`src/auth/http.mjs`](../src/auth/http.mjs). Migration: [`029-owner-auth.sql`](../migrations/029-owner-auth.sql). Tests: `test/owner-auth.test.mjs`.

## Switching it on

Auth is **off** unless `MATCHPILOT_AUTH=enforce`. With auth off, the site behaves exactly as before, and the code never touches the auth tables.

D12 forbids turning on public authentication in production without owner authorization. Enabling it there takes four owner actions:

1. Create the password hash on a trusted machine with `npm run auth:hash-password`. The password is read from standard input, hidden when typed, and never printed or stored. It must be at least 12 characters.
2. Set `MATCHPILOT_OWNER_USERNAME` and `MATCHPILOT_OWNER_PASSWORD_HASH` in the service environment.
3. Approve migration `029-owner-auth.sql` through `MATCHPILOT_APPROVED_MIGRATIONS`, after backup, compatibility check and recovery plan (D13).
4. Set `MATCHPILOT_AUTH=enforce`.

The `matchpilot-test` service stays suspended (MP-OWNER-CONTINUE-20261019). Before any reactivation, Auto-Deploy must be checked and, if needed, disabled.

| Variable | Default | Meaning |
|---|---|---|
| `MATCHPILOT_AUTH` | `off` | `off` or `enforce`. Any other value stops startup. |
| `MATCHPILOT_OWNER_USERNAME` | — | The owner's username. |
| `MATCHPILOT_OWNER_PASSWORD_HASH` | — | `scrypt$N$r$p$salt$key`. Production requires N ≥ 2^14. |
| `MATCHPILOT_SESSION_TTL_MINUTES` | 720 | Absolute session lifetime. |
| `MATCHPILOT_SESSION_IDLE_MINUTES` | 60 | Idle timeout, extended at most once a minute and never past the absolute lifetime. |
| `MATCHPILOT_COOKIE_SECURE` | `true` in production | Sets the `Secure` attribute and the `__Host-` cookie name. |
| `MATCHPILOT_TRUST_PROXY` | `false` | Uses the proxy-appended (last) `X-Forwarded-For` entry as the client address. |

A plain-text `MATCHPILOT_OWNER_PASSWORD` is refused.

## Fail-closed states

| Situation | Effect |
|---|---|
| Missing or invalid credentials, plain-text password, invalid lifetimes | Logged once as `AUTH_MISCONFIGURED`. Every route except `/healthz` answers 503. |
| Auth tables missing (migration 029 held in production by D13) | Logged once as `AUTH_SCHEMA_MISSING`. Every route except `/healthz` answers 503. |
| Database error while checking a session | 503 with `MATCHPILOT_AUTH_ERROR`. The request never passes. |

## Behaviour with auth enforced

- **Deny by default.** Only `/healthz`, `/login`, `/auth/login`, `/auth/logout` and `/auth/session` are public. Without a session:
  - pages redirect (303) to `/login?next=…`;
  - `/api/v1/*` answers 401 with error code `UNAUTHENTICATED`;
  - other `/api/*` routes answer 401 JSON.
- **Login.** `POST /auth/login` accepts JSON or an HTML form.
  - Credentials are checked with constant-time comparisons. An unknown username costs the same scrypt work as a known one.
  - Wrong credentials give a generic 401 (`invalid_credentials`).
  - The HTML login page works without JavaScript and has a strict CSP with `frame-ancestors 'none'`. Its `next` parameter accepts only same-site paths.
- **Sessions.**
  - The token is 32 random bytes; only its SHA-256 is stored.
  - Each session has an absolute expiry and an idle expiry.
  - The cookie is `HttpOnly`, `SameSite=Strict` and `Path=/`, plus `Secure` with the `__Host-` prefix in production.
  - A session presented at login is revoked (rotation), so a cookie planted before login is never adopted.
- **Logout.** `POST /auth/logout` revokes the session server-side and clears the cookie.
- **CSRF.** Login and logout are POST only. A browser `Origin`, or `Sec-Fetch-Site`, that is not this host is refused with 403 and audited as `origin_rejected`.
- **Rate limiting.** Failed logins within 15 minutes are counted:
  - from one client: limited after 10 failures;
  - for one username: limited after 30, which keeps an attacker from locking the owner out cheaply.

  Over the limit, the answer is 429 with `Retry-After`, and the password is not even checked.
- **Audit.** `auth_audit` records `login_success`, `login_failure`, `login_rate_limited`, `logout` and `origin_rejected`.
  - Usernames and client addresses are stored only as HMACs keyed with server-only material.
  - Passwords, tokens and hashes are never stored or logged.

## Future users and roles

- Sessions carry a `principal_id` and `roles`.
- `authorize(session, permission)` maps roles to permissions. The owner has every permission.
- Further users (MP-FUT-018: a second admin, a SaaS user foundation) add principals, roles and permissions without changing the session model.
- There is no public registration and no billing in this version (D12).

## Not covered yet

- Production activation is an owner action.
- Per-route permissions beyond "authenticated owner", and the UI for sessions and audit, come with the users and roles work.
- The site's other hardening items (#32: CSP and HSTS on every page) are separate.
