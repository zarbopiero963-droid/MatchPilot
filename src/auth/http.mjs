// R-04b (#23, D12): HTTP side of the owner login. When MATCHPILOT_AUTH=enforce, every route except /healthz and the
// login routes requires an owner session (deny by default). Pages redirect to /login, APIs answer 401. If the
// configuration is invalid or the auth tables are missing (migration held in production, D13), protected routes
// answer 503: the gate fails closed and never opens the site.
import {
  authorize, authSchemaReady, clientAddress, cookieName, currentSession, describeConfig, isPublicPath, login, logout,
  parseCookies, recordOriginRejected, safeNextPath, sameOriginRequest,
} from './owner-auth.mjs';

const MAX_BODY_BYTES = 4096;
const PAGE_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
};

const escapeHtml = value => String(value).replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch]));

export function loginPage({next = '/', message = null} = {}) {
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MatchPilot — Accesso</title><style>body{margin:0;background:#07111f;color:#e6eef8;font-family:system-ui,-apple-system,sans-serif;display:grid;place-items:center;min-height:100vh}form{background:#0e1d31;border:1px solid #203753;border-radius:18px;padding:28px;width:min(360px,90vw);display:grid;gap:14px}h1{margin:0;font-size:24px}label{display:grid;gap:6px;font-size:14px;color:#a9bad0}input{padding:10px;border-radius:10px;border:1px solid #2b4767;background:#07111f;color:#e6eef8;font-size:16px}button{padding:11px;border:0;border-radius:10px;background:#2f7de1;color:#fff;font-size:16px;font-weight:600;cursor:pointer}.err{background:#3a1620;border:1px solid #7a2b3c;border-radius:10px;padding:9px;font-size:14px}.note{font-size:12px;color:#7f93ad;margin:0}</style></head><body><form method="post" action="/auth/login"><h1>MatchPilot</h1><p class="note">Accesso riservato all'owner.</p>${message ? `<div class="err" role="alert">${escapeHtml(message)}</div>` : ''}<label>Utente<input name="username" autocomplete="username" required maxlength="200"></label><label>Password<input name="password" type="password" autocomplete="current-password" required maxlength="1024"></label><input type="hidden" name="next" value="${escapeHtml(safeNextPath(next))}"><button type="submit">Accedi</button></form></body></html>`;
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
      const result = await withClient(client => login(client, config, {
        username: String(username).slice(0, 200), password: String(password).slice(0, 1024), clientId, presentedToken: tokenOf(req),
      }));
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
