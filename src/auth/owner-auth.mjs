// R-04b (#23, owner decision D12): owner login.
// - One owner account whose username and scrypt password hash come from the environment: no credential is
//   hard-coded or stored in plain text, and nobody can register.
// - Server-side sessions in PostgreSQL (migration 029): only a SHA-256 of the random token is stored, with absolute
//   and idle expiry, rotation at login, logout and server-side revocation.
// - Repeated failed logins are rate-limited per client and per username; every login, failure, refusal and logout
//   is audited without secrets.
// - Sessions carry a principal and roles, so further users and roles can be added later without changing the model.
// Off unless MATCHPILOT_AUTH=enforce: enabling it in production is an owner action (D12), and in production its
// migration is applied only when the owner approves it (D13).
import {createHash, createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';

const scrypt = promisify(scryptCallback);

// ---- Password hashing ----

const KEY_LENGTH = 64;
const DEFAULT_N = 2 ** 15;
const MAX_N = 2 ** 18;
const HASH_FORMAT = /^scrypt\$(\d+)\$(\d+)\$(\d+)\$([A-Za-z0-9+/]+={0,2})\$([A-Za-z0-9+/]+={0,2})$/;
const scryptOptions = (N, r, p) => ({N, r, p, maxmem: 256 * N * r});

// Format: scrypt$N$r$p$<salt base64>$<key base64>. Produced by `npm run auth:hash-password`.
export async function hashPassword(password, {N = DEFAULT_N, r = 8, p = 1} = {}) {
  const salt = randomBytes(16);
  const key = await scrypt(String(password).normalize('NFC'), salt, KEY_LENGTH, scryptOptions(N, r, p));
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

// N may be as low as 2^10 so tests stay fast; authConfig requires at least 2^14 in production. N and r are capped
// so a configured hash cannot make verification use unbounded memory (128 * N * r bytes).
export const MIN_PRODUCTION_N = 2 ** 14;
export function parsePasswordHash(value) {
  const match = HASH_FORMAT.exec(String(value || ''));
  if (!match) return null;
  const [N, r, p] = match.slice(1, 4).map(Number);
  const salt = Buffer.from(match[4], 'base64');
  const key = Buffer.from(match[5], 'base64');
  const powerOfTwo = (N & (N - 1)) === 0;
  if (!powerOfTwo || N < 2 ** 10 || N > MAX_N || r < 1 || r > 16 || p < 1 || p > 4) return null;
  if (salt.length < 16 || key.length !== KEY_LENGTH) return null;
  return {N, r, p, salt, key};
}

export async function verifyPassword(password, stored) {
  const parsed = parsePasswordHash(stored);
  if (!parsed) return false;
  const key = await scrypt(String(password ?? '').normalize('NFC'), parsed.salt, KEY_LENGTH, scryptOptions(parsed.N, parsed.r, parsed.p));
  return timingSafeEqual(key, parsed.key);
}

// A fixed decoy keeps a failed login with an unknown username as slow as one with the right username.
const DECOY_HASH = `scrypt$${DEFAULT_N}$8$1$${Buffer.alloc(16, 7).toString('base64')}$${Buffer.alloc(KEY_LENGTH).toString('base64')}`;

// ---- Configuration ----

const positiveInteger = (raw, fallback) => {
  if (raw === undefined || raw === '') return fallback;
  return /^\d+$/.test(String(raw).trim()) && Number(raw) > 0 ? Number(raw) : null;
};

export function authConfig(env = process.env) {
  const rawMode = String(env.MATCHPILOT_AUTH || 'off').trim().toLowerCase();
  if (rawMode !== 'off' && rawMode !== 'enforce') throw new Error(`Invalid MATCHPILOT_AUTH: ${rawMode} (expected off or enforce)`);
  const production = String(env.MATCHPILOT_RUNTIME_MODE || 'offline').trim().toLowerCase() === 'production';
  const config = {
    mode: rawMode,
    state: 'ready',
    reason: null,
    username: String(env.MATCHPILOT_OWNER_USERNAME || '').trim(),
    passwordHash: env.MATCHPILOT_OWNER_PASSWORD_HASH || '',
    ttlMinutes: positiveInteger(env.MATCHPILOT_SESSION_TTL_MINUTES, 720),
    idleMinutes: positiveInteger(env.MATCHPILOT_SESSION_IDLE_MINUTES, 60),
    secureCookie: production || env.MATCHPILOT_COOKIE_SECURE === 'true',
    trustProxy: env.MATCHPILOT_TRUST_PROXY === 'true',
  };
  if (rawMode === 'off') return config;
  const fail = reason => ({...config, state: 'misconfigured', reason, passwordHash: ''});
  if (env.MATCHPILOT_OWNER_PASSWORD !== undefined) return fail('MATCHPILOT_OWNER_PASSWORD is refused: store only a hash (npm run auth:hash-password)');
  if (!config.username) return fail('MATCHPILOT_OWNER_USERNAME is missing');
  const parsed = parsePasswordHash(config.passwordHash);
  if (!parsed) return fail('MATCHPILOT_OWNER_PASSWORD_HASH is missing or not a valid scrypt hash');
  if (production && parsed.N < MIN_PRODUCTION_N) return fail('MATCHPILOT_OWNER_PASSWORD_HASH cost is too low for production (N < 2^14)');
  if (config.ttlMinutes === null || config.idleMinutes === null) return fail('session lifetimes must be positive integers (minutes)');
  return config;
}

// Never print the hash: a report of the configuration for logs.
export const describeConfig = config => ({mode: config.mode, state: config.state, reason: config.reason,
  ttl_minutes: config.ttlMinutes, idle_minutes: config.idleMinutes, secure_cookie: config.secureCookie});

// ---- Request helpers ----

export function parseCookies(header) {
  const cookies = {};
  for (const part of String(header || '').split(';')) {
    const index = part.indexOf('=');
    if (index < 1) continue;
    const name = part.slice(0, index).trim();
    try { cookies[name] = decodeURIComponent(part.slice(index + 1).trim()); } catch { /* malformed value: ignored */ }
  }
  return cookies;
}

// Only same-site absolute paths; never back to the login page.
export function safeNextPath(value) {
  const path = String(value || '');
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\') || /[\0-\x1f]/.test(path)) return '/';
  if (path === '/login' || path.startsWith('/login?')) return '/';
  return path;
}

// State-changing requests from a browser carry Origin: it must name this host. A missing Origin (curl, server
// clients) is allowed; SameSite=Strict already keeps the cookie off cross-site requests.
export function sameOriginRequest(headers) {
  if (headers['sec-fetch-site'] && !['same-origin', 'none'].includes(headers['sec-fetch-site'])) return false;
  const origin = headers.origin;
  if (origin === undefined) return true;
  try { return new URL(origin).host === String(headers.host || ''); } catch { return false; }
}

const PUBLIC_PATHS = new Set(['/healthz', '/login', '/auth/login', '/auth/logout', '/auth/session']);
export const isPublicPath = path => PUBLIC_PATHS.has(path);

// Roles map to permissions; the owner has every permission. Future roles add entries here.
const ROLE_PERMISSIONS = {owner: ['*']};
export const authorize = (session, permission) => Boolean(session)
  && session.roles.some(role => (ROLE_PERMISSIONS[role] || []).some(granted => granted === '*' || granted === permission));

const sha256 = value => createHash('sha256').update(String(value)).digest('hex');
const constantTimeEqualText = (a, b) => timingSafeEqual(Buffer.from(sha256(a), 'hex'), Buffer.from(sha256(b), 'hex'));

// Behind a trusted proxy the address it appended (the last X-Forwarded-For entry) is used; earlier entries are
// client-controlled and ignored, so a client cannot pick its own rate-limit bucket.
export function clientAddress(req, config) {
  if (config.trustProxy) {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',').map(part => part.trim()).filter(Boolean).pop();
    if (forwarded) return forwarded;
  }
  return req.socket?.remoteAddress || 'unknown';
}

// ---- Sessions, rate limit and audit (PostgreSQL) ----

export const RATE_WINDOW_MINUTES = 15;
export const MAX_FAILURES_PER_CLIENT = 10;
export const MAX_FAILURES_PER_USERNAME = 30;

export const cookieName = config => (config.secureCookie ? '__Host-mp_session' : 'mp_session');

function cookieHeader(config, value, maxAgeSeconds) {
  return `${cookieName(config)}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${config.secureCookie ? '; Secure' : ''}`;
}

// Audit identifiers are HMACs keyed with the owner password hash (server-only): stable for rate limiting, but a
// password typed into the username field cannot be brute-forced from the audit table.
const tag = (config, kind, value) => createHmac('sha256', `${kind}:${config.passwordHash}`).update(String(value)).digest('hex');
const usernameTag = (config, username) => tag(config, 'username', String(username).toLowerCase());
const clientTag = (config, clientId) => tag(config, 'client', clientId);

async function audit(client, config, event, {principalId = null, username = null, clientId = null, detail = {}} = {}) {
  await client.query(
    'INSERT INTO auth_audit(event, principal_id, username_hash, client_hash, detail) VALUES ($1, $2, $3, $4, $5)',
    [event, principalId, username === null ? null : usernameTag(config, username), clientId === null ? null : clientTag(config, clientId), detail],
  );
}

// Whether the auth tables exist (migration 029 may be held in production by D13).
export async function authSchemaReady(client) {
  const {rows} = await client.query("SELECT to_regclass('auth_sessions') IS NOT NULL AND to_regclass('auth_audit') IS NOT NULL AS ready");
  return rows[0].ready;
}

export async function rateLimited(client, config, {username, clientId}) {
  const {rows} = await client.query(
    `SELECT count(*) FILTER (WHERE client_hash = $1)::int AS by_client, count(*) FILTER (WHERE username_hash = $2)::int AS by_username
       FROM auth_audit WHERE event = 'login_failure' AND at > now() - make_interval(mins => $3)`,
    [clientTag(config, clientId), usernameTag(config, username), RATE_WINDOW_MINUTES]);
  return rows[0].by_client >= MAX_FAILURES_PER_CLIENT || rows[0].by_username >= MAX_FAILURES_PER_USERNAME;
}

export async function login(client, config, {username, password, clientId, presentedToken}) {
  if (await rateLimited(client, config, {username, clientId})) {
    await audit(client, config, 'login_rate_limited', {username, clientId});
    return {status: 'rate_limited', retryAfterSeconds: RATE_WINDOW_MINUTES * 60};
  }
  const usernameOk = constantTimeEqualText(String(username ?? ''), config.username);
  const passwordOk = await verifyPassword(password, usernameOk ? config.passwordHash : DECOY_HASH);
  if (!(usernameOk && passwordOk)) {
    await audit(client, config, 'login_failure', {username, clientId});
    return {status: 'invalid'};
  }
  // Rotation: a session presented at login is revoked and never reused (no fixation).
  if (presentedToken) {
    await client.query("UPDATE auth_sessions SET revoked_at = now(), revoke_reason = 'rotated' WHERE token_hash = $1 AND revoked_at IS NULL", [sha256(presentedToken)]);
  }
  const token = randomBytes(32).toString('base64url');
  const principalId = 'owner';
  const roles = ['owner'];
  const {rows} = await client.query(
    `INSERT INTO auth_sessions(token_hash, principal_id, roles, expires_at, idle_expires_at)
     VALUES ($1, $2, $3, now() + make_interval(mins => $4), now() + make_interval(mins => $5))
     RETURNING expires_at`,
    [sha256(token), principalId, roles, config.ttlMinutes, Math.min(config.idleMinutes, config.ttlMinutes)]);
  await audit(client, config, 'login_success', {principalId, clientId});
  return {status: 'ok', token, principalId, roles, expiresAt: rows[0].expires_at,
    cookie: cookieHeader(config, token, config.ttlMinutes * 60)};
}

// Valid, unrevoked, unexpired session for the presented token, with its idle expiry extended (at most once a minute).
export async function currentSession(client, config, token) {
  if (!token || token.length > 200) return null;
  const {rows} = await client.query(
    `UPDATE auth_sessions
        SET last_seen_at = now(), idle_expires_at = LEAST(expires_at, now() + make_interval(mins => $2))
      WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now() AND idle_expires_at > now()
        AND last_seen_at < now() - interval '1 minute'
      RETURNING principal_id, roles, expires_at`,
    [sha256(token), config.idleMinutes]);
  if (rows[0]) return {principalId: rows[0].principal_id, roles: rows[0].roles, expiresAt: rows[0].expires_at};
  const fresh = await client.query(
    `SELECT principal_id, roles, expires_at FROM auth_sessions
      WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now() AND idle_expires_at > now()`, [sha256(token)]);
  const row = fresh.rows[0];
  return row ? {principalId: row.principal_id, roles: row.roles, expiresAt: row.expires_at} : null;
}

export async function logout(client, config, {token, clientId}) {
  if (token) {
    const {rows} = await client.query(
      "UPDATE auth_sessions SET revoked_at = now(), revoke_reason = 'logout' WHERE token_hash = $1 AND revoked_at IS NULL RETURNING principal_id",
      [sha256(token)]);
    if (rows[0]) await audit(client, config, 'logout', {principalId: rows[0].principal_id, clientId});
  }
  return cookieHeader(config, '', 0);
}

export const recordOriginRejected = (client, config, {clientId, path}) => audit(client, config, 'origin_rejected', {clientId, detail: {path}});
