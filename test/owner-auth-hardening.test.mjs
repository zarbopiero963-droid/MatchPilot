// R-04c (#23, D12): activation hardening from the PR #159 round-2 review — IPv6 /64 rate-limit buckets, explicit
// proxy trust in production, a throttled origin_rejected record under the client lock, a failure-spike alert that
// never locks the owner out, and an optional dedicated audit key.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import test from 'node:test';
import {authConfig, clientBucket, hashPassword} from '../src/auth/owner-auth.mjs';

const PASSWORD = 'correct horse battery staple 2026';
const FAST = {N: 1024};

test('rate-limit buckets: IPv4 per address, IPv4-mapped IPv6 as IPv4, IPv6 per /64', () => {
  assert.equal(clientBucket('192.0.2.1'), '192.0.2.1');
  assert.notEqual(clientBucket('192.0.2.1'), clientBucket('192.0.2.2'));
  assert.equal(clientBucket('::ffff:192.0.2.1'), '192.0.2.1');
  assert.equal(clientBucket('::FFFF:192.0.2.1'), '192.0.2.1');
  assert.equal(clientBucket('2001:db8:1:2::1'), clientBucket('2001:db8:1:2:ffff:ffff:ffff:ffff'));
  assert.equal(clientBucket('2001:0db8:0001:0002:0000:0000:0000:0009'), clientBucket('2001:db8:1:2::9'));
  assert.notEqual(clientBucket('2001:db8:1:2::1'), clientBucket('2001:db8:1:3::1'));
  assert.equal(clientBucket('[2001:db8:1:2::1]'), clientBucket('2001:db8:1:2::1'));
  assert.equal(clientBucket('2001:db8:1:2::1%eth0'), clientBucket('2001:db8:1:2::1'));
  assert.equal(clientBucket('not-an-ip'), 'not-an-ip');
});

test('production with auth enforced requires an explicit MATCHPILOT_TRUST_PROXY; the audit key is optional', async () => {
  const hash = await hashPassword(PASSWORD);
  const base = {MATCHPILOT_AUTH: 'enforce', MATCHPILOT_RUNTIME_MODE: 'production', MATCHPILOT_OWNER_USERNAME: 'owner', MATCHPILOT_OWNER_PASSWORD_HASH: hash};
  const unset = authConfig(base);
  assert.equal(unset.state, 'misconfigured');
  assert.match(unset.reason, /MATCHPILOT_TRUST_PROXY/);
  assert.equal(authConfig({...base, MATCHPILOT_TRUST_PROXY: 'maybe'}).state, 'misconfigured');
  assert.equal(authConfig({...base, MATCHPILOT_TRUST_PROXY: 'true'}).trustProxy, true);
  assert.equal(authConfig({...base, MATCHPILOT_TRUST_PROXY: 'false'}).state, 'ready');
  assert.equal(authConfig({...base, MATCHPILOT_TRUST_PROXY: 'true', MATCHPILOT_AUTH_AUDIT_KEY: 'short'}).state, 'misconfigured', 'audit key needs >= 32 characters');
  const keyed = authConfig({...base, MATCHPILOT_TRUST_PROXY: 'true', MATCHPILOT_AUTH_AUDIT_KEY: 'k'.repeat(32)});
  assert.equal(keyed.state, 'ready');
  assert.ok(!JSON.stringify(keyed).includes('k'.repeat(32)) || keyed.auditKey === 'k'.repeat(32));
  // Outside production the proxy setting keeps its default (off).
  assert.equal(authConfig({...base, MATCHPILOT_RUNTIME_MODE: 'test', MATCHPILOT_OWNER_PASSWORD_HASH: await hashPassword(PASSWORD, FAST)}).state, 'ready');
});

const ROOT_URL = process.env.FUTPYTHON_TEST_DATABASE_URL || 'postgres://matchpilot:matchpilot_local_test@127.0.0.1:5432/matchpilot_fpt';

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
  return {base: `http://127.0.0.1:${port}`, output: () => output, stop: () => new Promise(done => { child.on('close', done); child.kill('SIGTERM'); })};
}

const login = (base, body, headers = {}) => fetch(`${base}/auth/login`, {
  method: 'POST', redirect: 'manual', headers: {'content-type': 'application/json', ...headers}, body: JSON.stringify(body),
});

test('IPv6 /64 rotation is limited as one client; origin_rejected stays one row under concurrency; failure spikes alert without lockout', {timeout: 180000}, async t => {
  const admin = await adminClient(t);
  if (!admin) return;
  const schema = `owner_auth_r04c_${process.pid}_${Date.now()}`;
  const hash = await hashPassword(PASSWORD, FAST);
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    const server = await startServer(schema, {
      MATCHPILOT_AUTH: 'enforce', MATCHPILOT_OWNER_USERNAME: 'owner', MATCHPILOT_OWNER_PASSWORD_HASH: hash,
      MATCHPILOT_TRUST_PROXY: 'true', MATCHPILOT_AUTH_FAILURE_SPIKE: '25',
    });
    try {
      const {base} = server;
      const via = address => ({'x-forwarded-for': address});
      // Rotating addresses inside one /64 share one bucket.
      for (let i = 1; i <= 10; i++) assert.equal((await login(base, {username: 'owner', password: 'wrong'}, via(`2001:db8:aa:bb::${i.toString(16)}`))).status, 401);
      assert.equal((await login(base, {username: 'owner', password: PASSWORD}, via('2001:db8:aa:bb::ffff'))).status, 429);
      // Another /64 and an IPv4-mapped address are other clients; the owner is never locked out.
      assert.equal((await login(base, {username: 'owner', password: PASSWORD}, via('2001:db8:aa:cc::1'))).status, 200);
      assert.equal((await login(base, {username: 'owner', password: PASSWORD}, via('::ffff:198.51.100.20'))).status, 200);

      // 60 parallel cross-origin logouts from one client: one audit row.
      await Promise.all(Array.from({length: 60}, () => fetch(`${base}/auth/logout`, {method: 'POST', headers: {...via('198.51.100.30'), origin: 'https://evil.example'}})));
      const origin = (await admin.query(`SELECT count(*)::int AS n FROM ${schema}.auth_audit WHERE event = 'origin_rejected'`)).rows[0].n;
      assert.equal(origin, 1);

      // Distributed failures above the spike threshold raise one alert per window and lock nobody out.
      for (let i = 0; i < 30; i++) await login(base, {username: 'owner', password: 'wrong'}, via(`203.0.113.${i + 1}`));
      const alerts = server.output().match(/AUTH_FAILURE_SPIKE/g) || [];
      assert.equal(alerts.length, 1, server.output());
      assert.equal((await login(base, {username: 'owner', password: PASSWORD}, via('198.51.100.40'))).status, 200);
    } finally { await server.stop(); }
  } finally {
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
});
