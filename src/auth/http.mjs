// R-04b (#23, D12): HTTP side of the owner login. When MATCHPILOT_AUTH=enforce, every route except /healthz and the
// login routes requires an owner session (deny by default). Pages redirect to /login, APIs answer 401. If the
// configuration is invalid or the auth tables are missing (migration held in production, D13), protected routes
// answer 503: the gate fails closed and never opens the site.
import {
  authorize, authSchemaReady, clientAddress, cookieName, currentSession, describeConfig, isPublicPath, login, logout,
  parseCookies, RATE_WINDOW_MINUTES, recordOriginRejected, safeNextPath, sameOriginRequest,
} from './owner-auth.mjs';

const MAX_BODY_BYTES = 4096;
const PAGE_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  'X-Frame-Options': 'DENY',
  // same-origin, not no-referrer: with no-referrer browsers send `Origin: null` on the login form POST (R-05 E2E).
  'Referrer-Policy': 'same-origin',
};

const escapeHtml = value => String(value).replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch]));

export function loginPage({next = '/', message = null} = {}) {
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MatchPilot — Accesso</title><style>*{box-sizing:border-box}body{margin:0;background:#0A0F17;color:#E9EFF6;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;display:grid;place-items:center;min-height:100vh}form{background:#111823;border:1px solid #223042;border-radius:12px;padding:28px;width:min(360px,90vw);display:grid;gap:14px}h1{margin:0;font-size:22px;display:flex;align-items:center;gap:10px;letter-spacing:.04em}h1 span{color:#FFB547}label{display:grid;gap:6px;font-size:14px;color:#8494A8}input{padding:10px;border-radius:8px;border:1px solid #223042;background:#16202D;color:#E9EFF6;font-size:16px}input:focus-visible,button:focus-visible{outline:2px solid #FFB547;outline-offset:2px}button{padding:11px;border:0;border-radius:8px;background:#FFB547;color:#1A1205;font-size:16px;font-weight:700;cursor:pointer}.err{background:rgba(255,95,109,.14);border:1px solid rgba(255,95,109,.55);border-radius:8px;padding:9px;font-size:14px}.note{font-size:12px;color:#8494A8;margin:0}</style></head><body><form method="post" action="/auth/login"><h1 aria-label="MatchPilot"><svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#FFB547"/><path d="M7 22 L12.5 11 L16 17 L19.5 11 L25 22" fill="none" stroke="#1A1205" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/><circle cx="16" cy="25.5" r="1.8" fill="#1A1205"/></svg><b>MATCH<span>PILOT</span></b></h1><p class="note">Accesso riservato all'owner.</p>${message ? `<div class="err" role="alert">${escapeHtml(message)}</div>` : ''}<label>Utente<input name="username" autocomplete="username" required maxlength="200" data-control="CTL-LOGIN-USERNAME"></label><label>Password<input name="password" type="password" autocomplete="current-password" required maxlength="1024" data-control="CTL-LOGIN-PASSWORD"></label><input type="hidden" name="next" value="${escapeHtml(safeNextPath(next))}"><button type="submit" data-control="CTL-LOGIN-SUBMIT">Accedi</button></form></body></html>`;
}

function send(res, status, body, headers = {}) {
  const json = typeof body !== 'string';
  res.writeHead(status, {'Content-Type': json ? 'application/json' : 'text/plain; charset=utf-8', ...headers});
  res.end(json ? JSON.stringify(body) : body);
}

function denied(res, url, status) {
  const v1 = url.pathname.startsWith('/api/v1/');
  if (status === 401 && !url.pathname.startsWith('/api/')) {
    return send(res, 303, '', {Location: `/login?next=${encodeURIComponent(url.pathname + url.search)}`});
  }
  const code = status === 401 ? 'UNAUTHENTICATED' : status === 403 ? 'FORBIDDEN' : 'UNAVAILABLE';
  const message = status === 401 ? 'authentication required' : status === 403 ? 'not allowed' : 'authentication unavailable';
  if (v1) return send(res, status, {api_version: 'v1', error: {code, message}});
  if (url.pathname.startsWith('/api/')) return send(res, status, {error: code.toLowerCase()});
  return send(res, status, status === 503 ? 'Accesso temporaneamente non disponibile' : 'Accesso negato');
}

async function readForm(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('body too large'), {status: 413});
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (type === 'application/json') {
    let parsed;
    try { parsed = JSON.parse(text || '{}'); } catch { throw Object.assign(new Error('invalid JSON'), {status: 400}); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw Object.assign(new Error('invalid body'), {status: 400});
    return {form: false, fields: parsed};
  }
  if (type === 'application/x-www-form-urlencoded') return {form: true, fields: Object.fromEntries(new URLSearchParams(text))};
  throw Object.assign(new Error('unsupported content type'), {status: 415});
}

// Returns null when auth is off. Otherwise a gate: `await gate(req, res, url)` is true when it already answered
// (login routes, refusals); false when the request may continue, with req.authSession set for protected routes.
export function createAuthGate({config, withClient, log = console.log}) {
  if (config.mode === 'off') return null;
  log('AUTH_ENFORCED ' + JSON.stringify(describeConfig(config)));
  if (config.state !== 'ready') log('AUTH_MISCONFIGURED ' + JSON.stringify({reason: config.reason}));
  let schemaReady = false;
  // Distributed failures above the threshold raise one alert per window; nobody is locked out (round-2 NB-1).
  let lastSpikeAlert = 0;
  const spikeAlert = globalFailures => {
    if (globalFailures === null || globalFailures === undefined || globalFailures < config.failureSpike) return;
    if (Date.now() - lastSpikeAlert < RATE_WINDOW_MINUTES * 60e3) return;
    lastSpikeAlert = Date.now();
    log('AUTH_FAILURE_SPIKE ' + JSON.stringify({failures: globalFailures, window_minutes: RATE_WINDOW_MINUTES, threshold: config.failureSpike}));
  };
  let schemaWarned = false;
  const tokenOf = req => parseCookies(req.headers.cookie)[cookieName(config)] || null;

  return async function gate(req, res, url) {
    const path = url.pathname;
    if (path === '/healthz') return false;
    if (config.state !== 'ready') { denied(res, url, 503); return true; }
    if (!schemaReady) {
      schemaReady = await withClient(authSchemaReady).catch(() => false);
      if (!schemaReady) {
        if (!schemaWarned) { log('AUTH_SCHEMA_MISSING ' + JSON.stringify({hint: 'apply migration 029-owner-auth.sql (owner approval required in production)'})); schemaWarned = true; }
        denied(res, url, 503);
        return true;
      }
    }
    const clientId = clientAddress(req, config);

    if (isPublicPath(path)) {
      if (path === '/login') {
        if (req.method !== 'GET') { send(res, 405, '', {Allow: 'GET'}); return true; }
        send(res, 200, loginPage({next: url.searchParams.get('next')}), PAGE_HEADERS);
        return true;
      }
      if (path === '/auth/session') {
        if (req.method !== 'GET') { send(res, 405, {error: 'method_not_allowed'}, {Allow: 'GET'}); return true; }
        const session = await withClient(client => currentSession(client, config, tokenOf(req)));
        if (!session) send(res, 401, {authenticated: false});
        else send(res, 200, {authenticated: true, principal: session.principalId, roles: session.roles, expires_at: session.expiresAt});
        return true;
      }
      // /auth/login and /auth/logout change state: POST only, same origin only.
      if (req.method !== 'POST') { send(res, 405, {error: 'method_not_allowed'}, {Allow: 'POST'}); return true; }
      if (!sameOriginRequest(req.headers)) {
        await withClient(client => recordOriginRejected(client, config, {clientId, path}));
        send(res, 403, {error: 'origin_not_allowed'});
        return true;
      }
      if (path === '/auth/logout') {
        const cleared = await withClient(client => logout(client, config, {token: tokenOf(req), clientId}));
        send(res, 204, '', {'Set-Cookie': cleared});
        return true;
      }
      let body;
      try { body = await readForm(req); }
      catch (error) { send(res, error.status || 400, {error: 'bad_request'}); return true; }
      const {username = '', password = '', next} = body.fields;
      const result = await login(withClient, config, {
        username: String(username).slice(0, 200), password: String(password).slice(0, 1024), clientId, presentedToken: tokenOf(req),
      });
      if (result.status === 'ok') {
        log('AUTH_LOGIN_SUCCESS ' + JSON.stringify({principal: result.principalId}));
        if (body.form) send(res, 303, '', {Location: safeNextPath(next), 'Set-Cookie': result.cookie});
        else send(res, 200, {authenticated: true, principal: result.principalId, roles: result.roles, expires_at: result.expiresAt}, {'Set-Cookie': result.cookie});
      } else if (result.status === 'rate_limited') {
        log('AUTH_LOGIN_RATE_LIMITED {}');
        const headers = {'Retry-After': String(result.retryAfterSeconds)};
        if (body.form) send(res, 429, loginPage({next, message: 'Troppi tentativi. Riprova più tardi.'}), {...PAGE_HEADERS, ...headers});
        else send(res, 429, {error: 'rate_limited'}, headers);
      } else {
        log('AUTH_LOGIN_FAILURE {}');
        spikeAlert(result.globalFailures);
        if (body.form) send(res, 401, loginPage({next, message: 'Credenziali non valide.'}), PAGE_HEADERS);
        else send(res, 401, {error: 'invalid_credentials'});
      }
      return true;
    }

    const session = await withClient(client => currentSession(client, config, tokenOf(req)));
    if (!session) { denied(res, url, 401); return true; }
    if (!authorize(session, 'read')) { denied(res, url, 403); return true; }
    req.authSession = session;
    return false;
  };
}
