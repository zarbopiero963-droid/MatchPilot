// R-04b (#23, owner decision D12): owner login. Unit tests for the auth module and end-to-end tests through the
// real server on a throwaway PostgreSQL schema.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import test from 'node:test';
import {
  authConfig, clientAddress, hashPassword, isPublicPath, parseCookies, sameOriginRequest, safeNextPath, verifyPassword,
} from '../src/auth/owner-auth.mjs';

// Low scrypt cost keeps the tests fast; production hashes use the default cost (see hashPassword).
const FAST = {N: 1024};
const PASSWORD = 'correct horse battery staple 2026';

test('passwords are stored as salted scrypt hashes and verified in constant time', async () => {
  const hash = await hashPassword(PASSWORD, FAST);
  assert.match(hash, /^scrypt\$\d+\$\d+\$\d+\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
  assert.ok(!hash.includes(PASSWORD));
  assert.notEqual(await hashPassword(PASSWORD, FAST), hash, 'a fresh salt every time');
  assert.equal(await verifyPassword(PASSWORD, hash), true);
  assert.equal(await verifyPassword(`${PASSWORD} `, hash), false);
  assert.equal(await verifyPassword('', hash), false);
  for (const bad of ['', 'plain-text', 'scrypt$1$8$1$AA==$AA==', 'scrypt$16384$8$1$$', 'bcrypt$x', `scrypt$${2 ** 25}$8$1$AAAA$AAAA`]) {
    assert.equal(await verifyPassword(PASSWORD, bad), false, bad);
  }
  const lowCost = authConfig({MATCHPILOT_AUTH: 'enforce', MATCHPILOT_OWNER_USERNAME: 'owner', MATCHPILOT_OWNER_PASSWORD_HASH: hash});
  assert.deepEqual(lowCost.decoyHash.split('$').slice(1, 4), hash.split('$').slice(1, 4), 'decoy uses the owner hash cost (no username timing oracle)');
  const defaultHash = await hashPassword('x');
  assert.equal(defaultHash.split('$')[1], '32768', 'default cost N=2^15');
});

test('auth is off unless explicitly enforced; enforce without valid owner credentials fails closed', async () => {
  const hash = await hashPassword(PASSWORD, FAST);
  assert.equal(authConfig({}).mode, 'off');
  assert.equal(authConfig({MATCHPILOT_AUTH: 'off'}).mode, 'off');
  assert.throws(() => authConfig({MATCHPILOT_AUTH: 'on'}), /MATCHPILOT_AUTH/);
  const ready = authConfig({MATCHPILOT_AUTH: 'enforce', MATCHPILOT_OWNER_USERNAME: 'owner', MATCHPILOT_OWNER_PASSWORD_HASH: hash});
  assert.equal(ready.mode, 'enforce');
  assert.equal(ready.state, 'ready');
  for (const env of [
    {MATCHPILOT_AUTH: 'enforce'},
    {MATCHPILOT_AUTH: 'enforce', MATCHPILOT_OWNER_USERNAME: 'owner'},
    {MATCHPILOT_AUTH: 'enforce', MATCHPILOT_OWNER_USERNAME: 'owner', MATCHPILOT_OWNER_PASSWORD_HASH: 'not-a-hash'},
    {MATCHPILOT_AUTH: 'enforce', MATCHPILOT_OWNER_USERNAME: 'owner', MATCHPILOT_OWNER_PASSWORD_HASH: hash, MATCHPILOT_OWNER_PASSWORD: PASSWORD},
    {MATCHPILOT_AUTH: 'enforce', MATCHPILOT_OWNER_USERNAME: 'owner', MATCHPILOT_OWNER_PASSWORD_HASH: hash, MATCHPILOT_SESSION_TTL_MINUTES: '0'},
  ]) {
    const config = authConfig(env);
    assert.equal(config.state, 'misconfigured', JSON.stringify(Object.keys(env)));
    assert.ok(!JSON.stringify(config).includes(PASSWORD), 'no secret in the config report');
  }
  assert.equal(authConfig({MATCHPILOT_AUTH: 'enforce', MATCHPILOT_RUNTIME_MODE: 'production', MATCHPILOT_OWNER_USERNAME: 'o', MATCHPILOT_OWNER_PASSWORD_HASH: hash}).secureCookie, true);
});

test('request helpers: cookies, next path, same-origin check, public paths', () => {
  assert.deepEqual(parseCookies('a=1; mp_session=abc%3D; b'), {a: '1', mp_session: 'abc='});
  assert.deepEqual(parseCookies(undefined), {});
  for (const ok of ['/', '/coverage?x=1', '/api/v1/health']) assert.equal(safeNextPath(ok), ok);
  for (const bad of ['//evil.example', 'https://evil.example', '/\\evil', 'javascript:alert(1)', '', undefined, '/login', '/a\x7f', '/caf\u00e9', '/a b']) assert.equal(safeNextPath(bad), '/');
  assert.equal(sameOriginRequest({host: 'app.example', origin: 'https://app.example'}), true);
  assert.equal(sameOriginRequest({host: 'app.example'}), true, 'non-browser clients send no Origin');
  assert.equal(sameOriginRequest({host: 'app.example', origin: 'https://evil.example'}), false);
  assert.equal(sameOriginRequest({host: 'app.example', origin: 'null'}), false);
  assert.equal(sameOriginRequest({host: 'app.example', 'sec-fetch-site': 'cross-site'}), false);
  assert.equal(sameOriginRequest({host: 'app.example', origin: 'null', 'sec-fetch-site': 'same-origin'}), true, 'browser-attested same-origin form with Origin: null');
  assert.equal(sameOriginRequest({host: 'app.example', origin: 'null', 'sec-fetch-site': 'same-site'}), false);
  for (const path of ['/healthz', '/login', '/auth/login', '/auth/logout', '/auth/session']) assert.equal(isPublicPath(path), true, path);
  const config = {trustProxy: true};
  assert.equal(clientAddress({headers: {'x-forwarded-for': '6.6.6.6, 203.0.113.9'}, socket: {remoteAddress: '10.0.0.1'}}, config), '203.0.113.9', 'the proxy-appended entry, not a client-chosen one');
  assert.equal(clientAddress({headers: {'x-forwarded-for': '6.6.6.6'}, socket: {remoteAddress: '10.0.0.1'}}, {trustProxy: false}), '10.0.0.1');
  for (const path of ['/', '/coverage', '/api/v1/health', '/api/data-health', '/login/x', '/healthz/', '/auth/other']) assert.equal(isPublicPath(path), false, path);
});

// ---- End to end through the real server ----

const ROOT_URL = process.env.FUTPYTHON_TEST_DATABASE_URL || 'postgres://matchpilot:matchpilot_local_test@127.0.0.1:5432/matchpilot_fpt';
const sha256 = value => createHash('sha256').update(value).digest('hex');

async function adminClient(t) {
  const pg = (await import('pg')).default;
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(ROOT_URL).hostname), 'remote PostgreSQL is forbidden');
  const admin = new pg.Client({connectionString: ROOT_URL, connectionTimeoutMillis: 2000});
  try { await admin.connect(); return admin; }
  catch (cause) {
    await admin.end().catch(() => {});
    if (process.env.CI) throw cause;
    t.skip('throwaway postgres unavailable');
    return null;
  }
}

// PORT=0: the OS picks a free port and the server logs it, so parallel test files never race for a fixed port.
const boundPort = text => Number(/listening on (\d+) /.exec(text)?.[1]);
async function startServer(schema, env) {
  const url = new URL(ROOT_URL);
  url.searchParams.set('options', `-c search_path=${schema}`);
  const child = spawn(process.execPath, ['src/server.mjs'], {
    cwd: resolve('.'),
    env: {PATH: process.env.PATH, PORT: '0', DATABASE_URL: url.toString(), MATCHPILOT_RUNTIME_MODE: 'test', ...env},
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  const deadline = Date.now() + 30000;
  while (!/listening on/.test(output) && child.exitCode == null && Date.now() < deadline) await new Promise(done => setTimeout(done, 50));
  assert.equal(child.exitCode, null, output);
  const port = boundPort(output);
  assert.ok(port > 0, output);
  return {
    base: `http://127.0.0.1:${port}`,
    output: () => output,
    stop: () => new Promise(done => { child.on('close', done); child.kill('SIGTERM'); }),
  };
}

async function withSchema(admin, label, fn) {
  const schema = `owner_auth_${label}_${process.pid}_${Date.now()}`;
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    return await fn(schema);
  } finally {
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  }
}

const login = (base, body, headers = {}) => fetch(`${base}/auth/login`, {
  method: 'POST', redirect: 'manual', headers: {'content-type': 'application/json', ...headers}, body: JSON.stringify(body),
});
const sessionCookie = response => {
  const header = response.headers.get('set-cookie') || '';
  const match = /(?:^|,\s*)((?:__Host-)?mp_session)=([^;]*)/.exec(header);
  return match ? {name: match[1], value: match[2], header} : null;
};

test('enforced owner login: deny by default, login, session, logout, revocation, fixation, CSRF, audit', {timeout: 180000}, async t => {
  const admin = await adminClient(t);
  if (!admin) return;
  const hash = await hashPassword(PASSWORD, FAST);
  try {
    await withSchema(admin, 'e2e', async schema => {
      const server = await startServer(schema, {MATCHPILOT_AUTH: 'enforce', MATCHPILOT_OWNER_USERNAME: 'owner', MATCHPILOT_OWNER_PASSWORD_HASH: hash});
      try {
        const {base} = server;
        // Deny by default.
        assert.equal((await fetch(`${base}/healthz`)).status, 200);
        const page = await fetch(`${base}/coverage?x=1`, {redirect: 'manual'});
        assert.equal(page.status, 303);
        assert.equal(page.headers.get('location'), '/login?next=%2Fcoverage%3Fx%3D1');
        const api = await fetch(`${base}/api/v1/health`);
        assert.equal(api.status, 401);
        assert.equal((await api.json()).error.code, 'UNAUTHENTICATED');
        assert.equal((await fetch(`${base}/api/data-health`)).status, 401);
        const loginPage = await fetch(`${base}/login`);
        assert.equal(loginPage.status, 200);
        assert.match(loginPage.headers.get('content-security-policy'), /frame-ancestors 'none'/);
        assert.match(await loginPage.text(), /<form[^>]+method="post"[^>]+action="\/auth\/login"/);

        // Wrong credentials: generic 401, no cookie, audited without secrets.
        for (const body of [{username: 'owner', password: 'wrong'}, {username: 'someone', password: PASSWORD}]) {
          const bad = await login(base, body);
          assert.equal(bad.status, 401);
          assert.deepEqual(await bad.json(), {error: 'invalid_credentials'});
          assert.equal(sessionCookie(bad), null);
        }

        // Session fixation: a cookie chosen before login is never adopted.
        const planted = 'planted-token-value-0123456789abcdef';
        const ok = await login(base, {username: 'owner', password: PASSWORD}, {cookie: `mp_session=${planted}`});
        assert.equal(ok.status, 200);
        const body = await ok.json();
        assert.equal(body.authenticated, true);
        assert.equal(body.principal, 'owner');
        assert.deepEqual(body.roles, ['owner']);
        const cookie = sessionCookie(ok);
        assert.ok(cookie && cookie.value.length >= 43 && cookie.value !== planted);
        assert.match(cookie.header, /HttpOnly/i);
        assert.match(cookie.header, /SameSite=Strict/i);
        assert.match(cookie.header, /Path=\//);
        assert.match(cookie.header, /Max-Age=\d+/);
        const auth = {cookie: `${cookie.name}=${cookie.value}`};
        assert.equal((await fetch(`${base}/api/v1/health`, {headers: {cookie: `mp_session=${planted}`}})).status, 401);

        // Authenticated access.
        const me = await fetch(`${base}/auth/session`, {headers: auth});
        assert.equal(me.status, 200);
        assert.equal((await me.json()).principal, 'owner');
        const authed = await fetch(`${base}/api/v1/health`, {headers: auth});
        assert.equal(authed.status, 200);
        assert.equal(authed.headers.get('x-matchpilot-auth'), 'enforce', 'the page learns that the login is enforced (MP-UI-PR-004)');
        assert.equal((await fetch(`${base}/`, {headers: auth})).status, 200);

        // The token is stored only as a hash.
        const stored = (await admin.query(`SELECT token_hash, principal_id, roles FROM ${schema}.auth_sessions`)).rows;
        assert.equal(stored.length, 1);
        assert.equal(stored[0].token_hash, sha256(cookie.value));
        assert.deepEqual(stored[0].roles, ['owner']);

        // Cross-origin state change is refused (CSRF); the session survives it.
        const csrf = await fetch(`${base}/auth/logout`, {method: 'POST', headers: {...auth, origin: 'https://evil.example'}});
        assert.equal(csrf.status, 403);
        assert.equal((await fetch(`${base}/auth/session`, {headers: auth})).status, 200);
        const csrfLogin = await login(base, {username: 'owner', password: PASSWORD}, {origin: 'https://evil.example'});
        assert.equal(csrfLogin.status, 403);

        // Logout revokes server-side; the old token no longer works.
        const out = await fetch(`${base}/auth/logout`, {method: 'POST', headers: auth});
        assert.equal(out.status, 204);
        assert.match(out.headers.get('set-cookie') || '', /Max-Age=0/);
        assert.equal((await fetch(`${base}/auth/session`, {headers: auth})).status, 401);
        assert.equal((await fetch(`${base}/api/v1/health`, {headers: auth})).status, 401);
        const revoked = (await admin.query(`SELECT revoked_at, revoke_reason FROM ${schema}.auth_sessions WHERE token_hash=$1`, [sha256(cookie.value)])).rows[0];
        assert.ok(revoked.revoked_at);
        assert.equal(revoked.revoke_reason, 'logout');

        // Expired and idle-expired sessions are rejected.
        // (idle_expires_at <= expires_at is a table invariant, so an absolute expiry moves both.)
        for (const [label, set] of [['absolute', "expires_at = now() - interval '1 second', idle_expires_at = now() - interval '1 second'"], ['idle', "idle_expires_at = now() - interval '1 second'"]]) {
          const fresh = sessionCookie(await login(base, {username: 'owner', password: PASSWORD}));
          await admin.query(`UPDATE ${schema}.auth_sessions SET ${set} WHERE token_hash=$1`, [sha256(fresh.value)]);
          assert.equal((await fetch(`${base}/auth/session`, {headers: {cookie: `${fresh.name}=${fresh.value}`}})).status, 401, label);
        }

        // Form login (no JavaScript): 303 to a validated next path.
        const form = await fetch(`${base}/auth/login`, {
          method: 'POST', redirect: 'manual', headers: {'content-type': 'application/x-www-form-urlencoded'},
          body: new URLSearchParams({username: 'owner', password: PASSWORD, next: '//evil.example/x'}),
        });
        assert.equal(form.status, 303);
        assert.equal(form.headers.get('location'), '/');
        assert.ok(sessionCookie(form));

        // Audit trail: events recorded, no password, no raw token, no raw username of failures.
        const audit = (await admin.query(`SELECT event, principal_id, username_hash, client_hash, detail FROM ${schema}.auth_audit ORDER BY id`)).rows;
        const events = audit.map(row => row.event);
        assert.ok(events.includes('login_failure') && events.includes('login_success') && events.includes('logout') && events.includes('origin_rejected'));
        const dump = JSON.stringify(audit);
        assert.ok(!dump.includes(PASSWORD) && !dump.includes('someone') && !dump.includes(cookie.value));
        assert.ok(audit.filter(row => row.event === 'login_failure').every(row => /^[0-9a-f]{64}$/.test(row.username_hash)));

        // Server output: no password, no token.
        const logs = server.output();
        assert.ok(!logs.includes(PASSWORD) && !logs.includes(cookie.value) && !logs.includes(hash));
      } finally { await server.stop(); }
    });
  } finally { await admin.end(); }
});

test('repeated failed logins are rate limited, even with the right password, and audited', {timeout: 120000}, async t => {
  const admin = await adminClient(t);
  if (!admin) return;
  const hash = await hashPassword(PASSWORD, FAST);
  try {
    await withSchema(admin, 'rate', async schema => {
      const server = await startServer(schema, {MATCHPILOT_AUTH: 'enforce', MATCHPILOT_OWNER_USERNAME: 'owner', MATCHPILOT_OWNER_PASSWORD_HASH: hash});
      try {
        for (let i = 0; i < 10; i++) assert.equal((await login(server.base, {username: 'owner', password: `wrong-${i}`})).status, 401);
        const limited = await login(server.base, {username: 'owner', password: PASSWORD});
        assert.equal(limited.status, 429);
        assert.ok(Number(limited.headers.get('retry-after')) > 0);
        assert.equal(sessionCookie(limited), null);
        const events = (await admin.query(`SELECT event FROM ${schema}.auth_audit`)).rows.map(row => row.event);
        assert.equal(events.filter(event => event === 'login_failure').length, 10);
        assert.ok(events.includes('login_rate_limited'));
        // The window slides: once the failures are older than it, the owner can log in again.
        await admin.query(`UPDATE ${schema}.auth_audit SET at = at - interval '16 minutes'`);
        assert.equal((await login(server.base, {username: 'owner', password: PASSWORD})).status, 200);
      } finally { await server.stop(); }
    });
  } finally { await admin.end(); }
});

test('auth stays off by default; misconfigured enforcement fails closed; a held auth migration blocks login in production', {timeout: 180000}, async t => {
  const admin = await adminClient(t);
  if (!admin) return;
  try {
    await withSchema(admin, 'off', async schema => {
      const server = await startServer(schema, {});
      try {
        assert.equal((await fetch(`${server.base}/`)).status, 200, 'unchanged behaviour without MATCHPILOT_AUTH');
        const health = await fetch(`${server.base}/api/v1/health`);
        assert.equal(health.status, 200);
        assert.equal(health.headers.get('x-matchpilot-auth'), null, 'no login marker when off');
        assert.equal((await fetch(`${server.base}/auth/session`)).status, 404, 'auth routes absent when off');
      } finally { await server.stop(); }
    });
    await withSchema(admin, 'miscfg', async schema => {
      const server = await startServer(schema, {MATCHPILOT_AUTH: 'enforce', MATCHPILOT_OWNER_USERNAME: 'owner', MATCHPILOT_OWNER_PASSWORD: PASSWORD});
      try {
        assert.equal((await fetch(`${server.base}/healthz`)).status, 200);
        assert.equal((await fetch(`${server.base}/`, {redirect: 'manual'})).status, 503);
        assert.equal((await fetch(`${server.base}/api/v1/health`)).status, 503);
        assert.equal((await login(server.base, {username: 'owner', password: PASSWORD})).status, 503);
        assert.match(server.output(), /AUTH_MISCONFIGURED/);
        assert.ok(!server.output().includes(PASSWORD));
      } finally { await server.stop(); }
    });
    // Production mode: every migration except the auth one is approved (D13), so its tables are missing. Auth is
    // enforced by the owner but cannot work: it fails closed instead of opening the site.
    await withSchema(admin, 'prod', async schema => {
      const files = (await readdir(resolve('migrations'))).filter(file => file.endsWith('.sql')).sort();
      const authFile = files.find(file => /auth/.test(file));
      assert.ok(authFile, 'an auth migration exists');
      const approved = files.filter(file => file !== authFile && file < authFile);
      const hash = await hashPassword(PASSWORD); // production refuses low-cost hashes
      const server = await startServer(schema, {
        MATCHPILOT_RUNTIME_MODE: 'production', MATCHPILOT_APPROVED_MIGRATIONS: approved.join(','), MATCHPILOT_TRUST_PROXY: 'false',
        MATCHPILOT_AUTH: 'enforce', MATCHPILOT_OWNER_USERNAME: 'owner', MATCHPILOT_OWNER_PASSWORD_HASH: hash,
      });
      try {
        assert.match(server.output(), new RegExp(`MIGRATIONS_PENDING_NOT_APPROVED.*${authFile}`));
        assert.equal((await fetch(`${server.base}/healthz`)).status, 200);
        assert.equal((await fetch(`${server.base}/api/v1/health`)).status, 503);
        assert.equal((await login(server.base, {username: 'owner', password: PASSWORD})).status, 503);
        assert.match(server.output(), /AUTH_SCHEMA_MISSING/);
        const tables = (await admin.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema=$1 AND table_name LIKE 'auth_%'", [schema])).rows[0].n;
        assert.equal(tables, 0, 'the held auth migration was not applied');
      } finally { await server.stop(); }
    });
  } finally { await admin.end(); }
});

const rawGet = (base, path) => new Promise((done, fail) => {
  const {hostname, port} = new URL(base);
  const req = http.request({hostname, port, path, method: 'GET'}, res => { res.resume(); res.on('end', () => done(res.statusCode)); });
  req.on('error', fail);
  req.end();
});

test('hardening: path variants, raw //, proxy header spoofing, no owner lockout, atomic limit, bounded audit, idle sliding', {timeout: 180000}, async t => {
  const admin = await adminClient(t);
  if (!admin) return;
  const hash = await hashPassword(PASSWORD, FAST);
  try {
    await withSchema(admin, 'hard', async schema => {
      const server = await startServer(schema, {MATCHPILOT_AUTH: 'enforce', MATCHPILOT_OWNER_USERNAME: 'owner', MATCHPILOT_OWNER_PASSWORD_HASH: hash, MATCHPILOT_TRUST_PROXY: 'true'});
      try {
        const {base} = server;
        const from = address => ({'x-forwarded-for': `203.0.113.66, ${address}`});
        // No protected content without a session, whatever the path spelling or method.
        for (const path of ['/healthz/', '/HEALTHZ', '/login/', '/auth/session/', '/api/v1/health/', '/%2e%2e/api/v1/health', '/login/..%2fapi/v1/health', '/api/v1/../v1/health']) {
          const status = (await fetch(`${base}${path}`, {redirect: 'manual'})).status;
          assert.ok([303, 401, 404, 405].includes(status), `${path}: ${status}`);
        }
        assert.equal((await fetch(`${base}/api/v1/health`, {method: 'HEAD'})).status, 401);
        assert.equal((await fetch(`${base}/`, {method: 'OPTIONS', redirect: 'manual'})).status, 303);
        // A raw "//" target is answered 400 and does not crash the process.
        assert.equal(await rawGet(base, '//'), 400);
        assert.equal((await fetch(`${base}/healthz`)).status, 200, 'server still alive');

        // Behind a trusted proxy only the proxy-appended address counts: varying the leftmost entry does not help.
        for (let i = 0; i < 10; i++) {
          assert.equal((await login(base, {username: 'owner', password: 'wrong'}, {'x-forwarded-for': `10.9.9.${i}, 198.51.100.7`})).status, 401);
        }
        assert.equal((await login(base, {username: 'owner', password: PASSWORD}, from('198.51.100.7'))).status, 429);
        // No per-username lockout: the owner still logs in from another address (PR #159 review NB-1).
        assert.equal((await login(base, {username: 'owner', password: PASSWORD}, from('198.51.100.8'))).status, 200);

        // Concurrent attempts cannot overshoot the limit (NB-6) and refusals add one audit row per window (NB-2).
        const statuses = await Promise.all(Array.from({length: 30}, () => login(base, {username: 'owner', password: 'wrong'}, from('198.51.100.9')).then(r => r.status)));
        assert.equal(statuses.filter(code => code === 401).length, 10);
        assert.equal(statuses.filter(code => code === 429).length, 20);
        for (let i = 0; i < 20; i++) await fetch(`${base}/auth/logout`, {method: 'POST', headers: {...from('198.51.100.9'), origin: 'https://evil.example'}});
        const perEvent = Object.fromEntries((await admin.query(
          `SELECT event, count(*)::int AS n FROM ${schema}.auth_audit WHERE client_hash = (SELECT client_hash FROM ${schema}.auth_audit WHERE event = 'login_rate_limited' ORDER BY id DESC LIMIT 1) GROUP BY event`)).rows.map(row => [row.event, row.n]));
        assert.deepEqual(perEvent, {login_failure: 10, login_rate_limited: 1, origin_rejected: 1});

        // Idle expiry slides (at most once a minute) and never past the absolute expiry.
        const fresh = sessionCookie(await login(base, {username: 'owner', password: PASSWORD}, from('198.51.100.10')));
        await admin.query(`UPDATE ${schema}.auth_sessions SET last_seen_at = now() - interval '2 minutes', idle_expires_at = now() + interval '30 seconds' WHERE token_hash=$1`, [sha256(fresh.value)]);
        assert.equal((await fetch(`${base}/auth/session`, {headers: {cookie: `${fresh.name}=${fresh.value}`}})).status, 200);
        const slid = (await admin.query(`SELECT idle_expires_at > now() + interval '55 minutes' AS slid, idle_expires_at <= expires_at AS capped FROM ${schema}.auth_sessions WHERE token_hash=$1`, [sha256(fresh.value)])).rows[0];
        assert.deepEqual(slid, {slid: true, capped: true});

        // A next path that cannot go in a Location header falls back to "/" (NB-3).
        const form = await fetch(`${base}/auth/login`, {
          method: 'POST', redirect: 'manual', headers: {'content-type': 'application/x-www-form-urlencoded', ...from('198.51.100.11')},
          body: new URLSearchParams({username: 'owner', password: PASSWORD, next: '/caf\u00e9\x7f'}),
        });
        assert.equal(form.status, 303);
        assert.equal(form.headers.get('location'), '/');
      } finally { await server.stop(); }
    });
  } finally { await admin.end(); }
});

test('production with the auth migration approved: login works and the cookie is __Host- and Secure', {timeout: 120000}, async t => {
  const admin = await adminClient(t);
  if (!admin) return;
  try {
    await withSchema(admin, 'prod_ok', async schema => {
      const files = (await readdir(resolve('migrations'))).filter(file => file.endsWith('.sql')).sort();
      const hash = await hashPassword(PASSWORD);
      const server = await startServer(schema, {
        MATCHPILOT_RUNTIME_MODE: 'production', MATCHPILOT_APPROVED_MIGRATIONS: files.join(','), MATCHPILOT_TRUST_PROXY: 'false',
        MATCHPILOT_AUTH: 'enforce', MATCHPILOT_OWNER_USERNAME: 'owner', MATCHPILOT_OWNER_PASSWORD_HASH: hash,
      });
      try {
        const ok = await login(server.base, {username: 'owner', password: PASSWORD});
        assert.equal(ok.status, 200);
        const cookie = sessionCookie(ok);
        assert.equal(cookie.name, '__Host-mp_session');
        assert.match(cookie.header, /; Secure/);
        assert.match(cookie.header, /Path=\//);
        assert.doesNotMatch(cookie.header, /Domain=/i);
      } finally { await server.stop(); }
    });
  } finally { await admin.end(); }
});
