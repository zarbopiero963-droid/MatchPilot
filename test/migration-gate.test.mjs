// MP-MIG-GATE-01 (F3, owner mandate MP-MIGRATIONS-030-031-AND-API-FOOTBALL-P1-FIX-01 F3=A): security tests of the double
// authorization of migrations, on throwaway PostgreSQL schemas, with the real runner in child processes. Every
// unauthorized case is refused and applies nothing: offline and production without authorization, one of the two only,
// expired, other release, other bytes, reuse, crash before/during, rollback and repeated restarts, concurrency,
// ambiguous state, unsafe filesystem permissions, the TEST authorization outside test mode, an offline server start.
// Skipped without a local PostgreSQL outside CI (fails in CI), as the other PostgreSQL tests.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {chmod, mkdir, mkdtemp, rm, symlink, writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import test from 'node:test';
import {decide, loadOwnerApprovals} from '../src/migration-authz.mjs';
import {assertLocalTestDatabase} from './helpers/migrations.mjs';
import {RELEASE, approval, authzFixture, technicalToken} from './helpers/migration-authz.mjs';

const ROOT_URL = process.env.FUTPYTHON_TEST_DATABASE_URL || 'postgres://matchpilot:matchpilot_local_test@127.0.0.1:5432/matchpilot_fpt';
const RUNNER = new URL('../src/migrate.mjs', import.meta.url).href;
const DB = new URL('../src/db.mjs', import.meta.url).href;
const sha = text => createHash('sha256').update(text).digest('hex');
const A = 'CREATE TABLE g_a(id int);', B = 'CREATE TABLE g_b(id int);';

test('F3 unit: the repository manifest is valid and holds no approval; a manifest naming an unknown decision is refused', () => {
  const repo = loadOwnerApprovals({approvalsPath: 'db/migration-approvals.json', decisionsPath: 'docs/governance/owner-decisions.json'});
  assert.deepEqual(repo.approvals, [], 'no migration operation is approved by this PR');
  const op = {file: '001-a.sql', sha256: sha(A), operation: 'apply'};
  const none = {approvals: new Set(), closedNonces: new Set(), uses: new Set()};
  const token = {nonce: 'n'.repeat(32), operations: [{operation: 'apply', filename: '001-a.sql', sha256: sha(A)}]};
  const ok = approval('MA-UNIT-1', 'apply', '001-a.sql', sha(A));
  const reasons = args => decide({ops: [op], mode: 'offline', env: {}, testAllowed: false, approvals: [], token: null, consumed: none, now: Date.now(), ...args}).refused[0]?.reasons;
  assert.deepEqual(reasons({}), ['OWNER_APPROVAL_MISSING', 'TECHNICAL_AUTHORIZATION_MISSING']);
  assert.deepEqual(reasons({approvals: [ok]}), ['TECHNICAL_AUTHORIZATION_MISSING'], 'owner only');
  assert.deepEqual(reasons({token}), ['OWNER_APPROVAL_MISSING'], 'technical only');
  assert.equal(reasons({approvals: [ok], token}), undefined, 'both');
  assert.deepEqual(reasons({approvals: [ok], token, mode: 'production'}), ['D13_PRODUCTION_LIST_MISSING']);
  assert.deepEqual(reasons({approvals: [], token: null, testAllowed: true, mode: 'offline'}), ['OWNER_APPROVAL_MISSING', 'TECHNICAL_AUTHORIZATION_MISSING'], 'TEST outside test mode: refused');
  assert.deepEqual(reasons({approvals: [{...ok, expires_at: '2020-01-01T00:00:00Z'}], token}), ['OWNER_APPROVAL_EXPIRED']);
  assert.deepEqual(reasons({approvals: [ok], token, consumed: {...none, approvals: new Set(['MA-UNIT-1'])}}), ['OWNER_APPROVAL_CONSUMED']);
  assert.deepEqual(reasons({approvals: [ok], token, consumed: {...none, closedNonces: new Set([token.nonce])}}), ['TECHNICAL_AUTHORIZATION_CONSUMED']);
  // PR #300 review P2: an old entry never shadows a new valid GO; two valid entries are ambiguous; none valid is refused.
  const expired = {...ok, id: 'MA-UNIT-0', expires_at: '2020-01-01T00:00:00Z'};
  assert.equal(reasons({approvals: [expired, ok], token}), undefined, 'expired entry followed by a new one');
  assert.equal(reasons({approvals: [ok, {...ok, id: 'MA-UNIT-2'}], token, consumed: {...none, approvals: new Set(['MA-UNIT-1'])}}), undefined, 'consumed entry followed by a new one');
  assert.deepEqual(reasons({approvals: [ok, {...ok, id: 'MA-UNIT-2'}], token}), ['OWNER_APPROVAL_AMBIGUOUS']);
  assert.deepEqual(reasons({approvals: [expired, {...ok, id: 'MA-UNIT-3'}], token, consumed: {...none, approvals: new Set(['MA-UNIT-3'])}}), ['OWNER_APPROVAL_EXPIRED', 'OWNER_APPROVAL_CONSUMED'], 'no eligible entry');
  assert.deepEqual(reasons({approvals: [{...ok, sha256: sha(B)}], token: {...token, operations: [{...token.operations[0], sha256: sha(B)}]}}), ['OWNER_APPROVAL_MISSING', 'TECHNICAL_AUTHORIZATION_NOT_FOR_THIS_OPERATION'], 'other bytes');
});

function child(env, fn, options) {
  const script = `const m = await import(${JSON.stringify(RUNNER)});
const {closePool} = await import(${JSON.stringify(DB)});
const logs = [];
let report;
try { report = {ok: true, result: await m[${JSON.stringify(fn)}]({...${JSON.stringify(options)}, log: line => logs.push(line)})}; }
catch (error) { report = {ok: false, code: error.code || null, message: String(error.message)}; }
report.logs = logs;
await closePool().catch(() => {});
process.stdout.write(JSON.stringify(report));`;
  return new Promise((done, fail) => {
    const proc = spawn(process.execPath, ['--input-type=module', '-e', script], {cwd: resolve('.'), env, stdio: ['ignore', 'pipe', 'pipe']});
    let out = '', err = '';
    proc.stdout.on('data', chunk => { out += chunk; });
    proc.stderr.on('data', chunk => { err += chunk; });
    proc.once('error', fail);
    proc.once('exit', () => { try { done(JSON.parse(out)); } catch { fail(new Error(`child output: ${out}\n${err}`)); } });
  });
}

async function setup(t) {
  const pg = (await import('pg')).default;
  assertLocalTestDatabase(ROOT_URL);
  const admin = new pg.Client({connectionString: ROOT_URL, connectionTimeoutMillis: 2000});
  try { await admin.connect(); }
  catch (cause) {
    await admin.end().catch(() => {});
    if (process.env.CI) throw cause;
    t.skip('throwaway postgres unavailable');
    return null;
  }
  t.diagnostic(`PostgreSQL ${(await admin.query("SELECT current_setting('server_version') AS v")).rows[0].v}`);
  const schemas = [], cleanups = [], clients = [];
  let n = 0;
  const make = async (files, mode = 'offline') => {
    const schema = `miggate_${n++}_${process.pid}`;
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.query(`CREATE SCHEMA ${schema}`);
    schemas.push(schema);
    const url = new URL(ROOT_URL);
    url.searchParams.set('options', `-c search_path=${schema}`);
    const env = {PATH: process.env.PATH, DATABASE_URL: url.toString(), MATCHPILOT_RUNTIME_MODE: mode};
    const client = new pg.Client({connectionString: url.toString()});
    await client.connect();
    clients.push(client);
    const dir = await mkdtemp(join(tmpdir(), 'mp-miggate-'));
    cleanups.push(() => rm(dir, {recursive: true, force: true}));
    for (const [name, text] of Object.entries(files)) await writeFile(join(dir, name), text);
    const run = (options = {}, extraEnv = {}) => child({...env, ...extraEnv}, 'migrate', {dir, ...options});
    return {schema, env, client, dir, run};
  };
  const fixture = async (opts) => { const f = await authzFixture(opts); cleanups.push(f.cleanup); return f; };
  t.after(async () => {
    for (const client of clients) await client.end().catch(() => {});
    for (const schema of schemas) await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {});
    for (const fn of cleanups) await fn();
    await admin.end();
  });
  return {make, fixture, admin};
}

const has = async (client, table) => (await client.query('SELECT to_regclass($1) IS NOT NULL AS ok', [table])).rows[0].ok;
const authzRows = async client => (await client.query('SELECT operation, filename, origin, mode, owner_approval_id FROM schema_migration_authorizations ORDER BY authz_id')).rows;
const tokenFor = (files, extra) => technicalToken(files.map(([filename, text]) => ({operation: 'apply', filename, sha256: sha(text)})), extra);

test('F3 on PostgreSQL: offline and production refuse without both authorizations; both authorize once', {timeout: 240000}, async t => {
  const env = await setup(t);
  if (!env) return;
  // Offline without anything; production without anything; the TEST authorization outside test mode.
  for (const mode of ['offline', 'production']) {
    const s = await env.make({'001-a.sql': A}, mode);
    const refused = await s.run({}, {MATCHPILOT_MIGRATION_TEST_AUTHORIZATION: 'throwaway-schema', MATCHPILOT_APPROVED_MIGRATIONS: '001-a.sql'});
    assert.deepEqual([refused.ok, refused.code], [false, 'MIGRATION_NOT_AUTHORIZED'], mode);
    assert.equal(await has(s.client, 'g_a'), false, `${mode}: nothing applied`);
    assert.equal((await s.client.query(`SELECT count(*)::int AS n FROM schema_migration_events WHERE event = 'MIGRATION_NOT_AUTHORIZED'`)).rows[0].n, 1, 'refusal recorded');
  }
  // Owner approval only; technical token only.
  const s = await env.make({'001-a.sql': A});
  const owner = await env.fixture({approvals: [approval('MA-G-1', 'apply', '001-a.sql', sha(A))]});
  assert.match((await s.run({authz: owner.options})).message, /TECHNICAL_AUTHORIZATION_MISSING/);
  const tech = await env.fixture({token: tokenFor([['001-a.sql', A]])});
  assert.match((await s.run({authz: tech.options})).message, /OWNER_APPROVAL_MISSING/);
  assert.equal(await has(s.client, 'g_a'), false);
  // Both: applied once, recorded, the token closed and removed.
  const both = await env.fixture({approvals: [approval('MA-G-1', 'apply', '001-a.sql', sha(A))], token: tokenFor([['001-a.sql', A]])});
  const ok = await s.run({authz: both.options});
  assert.deepEqual([ok.ok, ok.result?.applied], [true, ['001-a.sql']], ok.message);
  assert.deepEqual(await authzRows(s.client), [
    {operation: 'apply', filename: '001-a.sql', origin: 'OWNER_AND_TECHNICAL', mode: 'offline', owner_approval_id: 'MA-G-1'},
    {operation: 'close', filename: null, origin: 'OWNER_AND_TECHNICAL', mode: 'offline', owner_approval_id: null}]);
  assert.equal(existsSync(both.tokenPath), false, 'the consumed token file is removed');
  // Production: both authorizations and the D13 list are all needed.
  const p = await env.make({'001-a.sql': A}, 'production');
  const prod = await env.fixture({approvals: [approval('MA-G-P', 'apply', '001-a.sql', sha(A))], token: tokenFor([['001-a.sql', A]])});
  assert.match((await p.run({authz: prod.options})).message, /D13_PRODUCTION_LIST_MISSING/);
  const prodOk = await p.run({authz: prod.options}, {MATCHPILOT_APPROVED_MIGRATIONS: '001-a.sql'});
  assert.deepEqual([prodOk.ok, prodOk.result?.applied], [true, ['001-a.sql']], prodOk.message);
});

test('F3 on PostgreSQL: expired, other release, other bytes and reused authorizations are refused', {timeout: 240000}, async t => {
  const env = await setup(t);
  if (!env) return;
  const s = await env.make({'001-a.sql': A});
  const good = [approval('MA-G-2', 'apply', '001-a.sql', sha(A))];
  const expiredOwner = await env.fixture({approvals: [{...good[0], expires_at: '2020-01-01T00:00:00Z'}], token: tokenFor([['001-a.sql', A]])});
  assert.match((await s.run({authz: expiredOwner.options})).message, /OWNER_APPROVAL_EXPIRED/);
  // An expired entry followed by a new GO in the same manifest: the new one is selected (PR #300 review P2); applied on
  // a separate schema so the cases below still start from nothing.
  const renewed = await env.make({'001-a.sql': A});
  const renewal = await env.fixture({approvals: [{...good[0], id: 'MA-G-2-OLD', expires_at: '2020-01-01T00:00:00Z'}, {...good[0], id: 'MA-G-2-NEW'}], token: tokenFor([['001-a.sql', A]])});
  const renewedRun = await renewed.run({authz: renewal.options});
  assert.deepEqual([renewedRun.ok, renewedRun.result?.applied], [true, ['001-a.sql']], renewedRun.message);
  assert.equal((await authzRows(renewed.client))[0].owner_approval_id, 'MA-G-2-NEW');
  const twoValid = await env.fixture({approvals: [{...good[0], id: 'MA-G-2-X'}, {...good[0], id: 'MA-G-2-Y'}], token: tokenFor([['001-a.sql', A]])});
  assert.match((await s.run({authz: twoValid.options})).message, /OWNER_APPROVAL_AMBIGUOUS/, 'two eligible GOs for one operation: refused');
  const expiredToken = await env.fixture({approvals: good, token: tokenFor([['001-a.sql', A]], {issued_at: '2020-01-01T00:00:00Z', expires_at: '2020-01-01T01:00:00Z'})});
  assert.equal((await s.run({authz: expiredToken.options})).code, 'TOKEN_EXPIRED');
  const longToken = await env.fixture({approvals: good, token: tokenFor([['001-a.sql', A]], {expires_at: new Date(Date.now() + 48 * 3600e3).toISOString()})});
  assert.equal((await s.run({authz: longToken.options})).code, 'TOKEN_INVALID', 'validity above 24 h');
  const otherRelease = await env.fixture({approvals: good, token: tokenFor([['001-a.sql', A]])});
  assert.match((await s.run({authz: {...otherRelease.options, releaseSha: 'b'.repeat(40)}})).message, /TECHNICAL_AUTHORIZATION_MISSING/, 'another running release finds no token of its own');
  const mismatch = await env.fixture({approvals: good});
  await writeFile(join(mismatch.dir, `allow-migrations-${RELEASE}.json`), JSON.stringify(tokenFor([['001-a.sql', A]], {release_sha: 'c'.repeat(40)})));
  await chmod(join(mismatch.dir, `allow-migrations-${RELEASE}.json`), 0o600);
  assert.equal((await s.run({authz: mismatch.options})).code, 'TOKEN_RELEASE_MISMATCH', 'a token written for another release');
  const unknownRelease = await env.fixture({approvals: good, token: tokenFor([['001-a.sql', A]])});
  assert.equal((await s.run({authz: {...unknownRelease.options, releaseSha: null}})).code, 'MIGRATION_NOT_AUTHORIZED', 'unknown release: derived from the checkout, never the env');
  const otherBytes = await env.fixture({approvals: [approval('MA-G-2', 'apply', '001-a.sql', sha(B))], token: tokenFor([['001-a.sql', B]])});
  assert.match((await s.run({authz: otherBytes.options})).message, /OWNER_APPROVAL_MISSING.*TECHNICAL_AUTHORIZATION_NOT_FOR_THIS_OPERATION/);
  assert.equal(await has(s.client, 'g_a'), false, 'none of the above applied anything');

  // Reuse: a token is closed after its run, an approval is single use.
  const token = tokenFor([['001-a.sql', A], ['002-b.sql', B]]);
  const first = await env.fixture({approvals: good, token});
  assert.deepEqual((await s.run({authz: first.options})).result.applied, ['001-a.sql']);
  await writeFile(join(s.dir, '002-b.sql'), B);
  await first.setToken(token); // the same token again (same nonce), as if copied back
  await first.setApprovals([...good, approval('MA-G-3', 'apply', '002-b.sql', sha(B))]);
  assert.match((await s.run({authz: first.options})).message, /TECHNICAL_AUTHORIZATION_CONSUMED/);
  await first.setToken(tokenFor([['002-b.sql', B]]));
  await first.setApprovals([approval('MA-G-2', 'apply', '002-b.sql', sha(B))]); // id already consumed by 001
  assert.match((await s.run({authz: first.options})).message, /OWNER_APPROVAL_CONSUMED/);
  await first.setApprovals([approval('MA-G-3', 'apply', '002-b.sql', sha(B))]);
  assert.deepEqual((await s.run({authz: first.options})).result.applied, ['002-b.sql'], 'a new approval and a new token');
});

test('F3 on PostgreSQL: crash before and during, retry, concurrency, ambiguous state', {timeout: 240000}, async t => {
  const env = await setup(t);
  if (!env) return;
  const SLOW = 'CREATE TABLE g_slow(id int); SELECT pg_sleep(60);';
  const s = await env.make({'001-slow.sql': SLOW});
  const f = await env.fixture({approvals: [approval('MA-G-C', 'apply', '001-slow.sql', sha(SLOW))], token: tokenFor([['001-slow.sql', SLOW]])});
  // Crash during: the process is killed while the authorized migration runs; nothing is consumed or applied.
  const script = `const {migrate} = await import(${JSON.stringify(RUNNER)}); await migrate({log: () => {}, dir: ${JSON.stringify(s.dir)}, authz: ${JSON.stringify(f.options)}});`;
  const proc = spawn(process.execPath, ['--input-type=module', '-e', script], {env: s.env, stdio: 'ignore'});
  const exited = new Promise(done => proc.on('close', done));
  const busy = async () => (await env.admin.query(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE query LIKE '%g_slow%pg_sleep(60)%' AND pid <> pg_backend_pid()`)).rows[0].n;
  for (let i = 0; i < 300 && !(await busy()); i++) await new Promise(done => setTimeout(done, 100));
  proc.kill('SIGKILL');
  await exited;
  for (let i = 0; i < 100 && (await busy()); i++) await new Promise(done => setTimeout(done, 100));
  assert.deepEqual(await authzRows(s.client), [], 'crash during: no authorization consumed');
  assert.equal(await has(s.client, 'g_slow'), false);
  assert.equal(existsSync(f.tokenPath), true, 'the token is still there');
  // Retry with the same (unconsumed) authorizations, now with a file that does not sleep (it never ran).
  const QUICK = 'CREATE TABLE g_slow(id int);';
  await writeFile(join(s.dir, '001-slow.sql'), QUICK);
  await f.setApprovals([approval('MA-G-C', 'apply', '001-slow.sql', sha(QUICK))]);
  await f.setToken(tokenFor([['001-slow.sql', QUICK]]));
  // Concurrency: two processes with the same authorization; one applies, the other finds nothing pending.
  const [one, two] = await Promise.all([s.run({authz: f.options}), s.run({authz: f.options})]);
  assert.ok(one.ok && two.ok, `${one.message} ${two.message}`);
  assert.deepEqual([...one.result.applied, ...two.result.applied], ['001-slow.sql']);
  assert.deepEqual((await authzRows(s.client)).map(r => r.operation), ['apply', 'close'], 'used once, closed once');

  // Crash before: a manifest that cannot be read fails everything closed, before any application.
  const c = await env.make({'001-a.sql': A});
  const broken = await env.fixture({token: tokenFor([['001-a.sql', A]])});
  await writeFile(broken.approvalsPath, '{not json');
  assert.equal((await c.run({authz: broken.options})).code, 'APPROVALS_INVALID');
  const notInForce = await env.fixture({approvals: [approval('MA-G-D', 'apply', '001-a.sql', sha(A))], token: tokenFor([['001-a.sql', A]]), decisionStatus: 'SUPERSEDED'});
  assert.equal((await c.run({authz: notInForce.options})).code, 'APPROVALS_INVALID', 'an approval citing a decision not IN_FORCE');
  // Ambiguous: an authorization recorded for a file the register does not know.
  await c.client.query(`INSERT INTO schema_migration_authorizations(operation, filename, origin, mode) VALUES('apply', '009-ghost.sql', 'TEST', 'test')`);
  assert.equal((await c.run({authz: notInForce.options})).code, 'MIGRATION_STATE_AMBIGUOUS');
  assert.equal(await has(c.client, 'g_a'), false);
});

test('F3 on PostgreSQL: after a rollback the migration stays REVOKED across restarts until a re-application GO', {timeout: 240000}, async t => {
  const env = await setup(t);
  if (!env) return;
  const s = await env.make({'001-a.sql': A, '002-b.sql': B});
  const f = await env.fixture({approvals: [approval('MA-G-R1', 'apply', '001-a.sql', sha(A)), approval('MA-G-R2', 'apply', '002-b.sql', sha(B))],
    token: tokenFor([['001-a.sql', A], ['002-b.sql', B]])});
  assert.deepEqual((await s.run({authz: f.options})).result.applied, ['001-a.sql', '002-b.sql']);
  // The rollback of 002, as db/rollback/*.down.sql do it: drop, schema_migrations row removed, REVOKED recorded.
  await s.client.query(`BEGIN; DROP TABLE g_b; DELETE FROM schema_migrations WHERE filename = '002-b.sql';
    UPDATE schema_migration_ledger SET status = 'REVOKED', revoked_at = now(), revoke_reason = 'test rollback' WHERE filename = '002-b.sql';
    INSERT INTO schema_migration_events(event, filename, detail) VALUES('REVOKED', '002-b.sql', 'test rollback'); COMMIT;`);
  const revocation = (await s.client.query(`SELECT max(event_id)::int AS id FROM schema_migration_events WHERE event = 'REVOKED'`)).rows[0].id;
  // Restarts (no authorization; the old approval; a new token for "apply"): held, the start goes on, never applied.
  for (const authz of [undefined, f.options, f.options]) {
    const restart = await s.run(authz ? {authz} : {});
    assert.deepEqual([restart.ok, restart.result?.applied, restart.result?.held], [true, [], ['002-b.sql']], restart.message);
  }
  await f.setToken(tokenFor([['002-b.sql', B]]));
  const stillHeld = await s.run({authz: f.options});
  assert.deepEqual(stillHeld.result.held, ['002-b.sql'], 'an apply approval does not authorize a re-application');
  assert.ok(stillHeld.logs.some(line => line.startsWith('MIGRATION_REVOKED_HELD')));
  assert.equal(await has(s.client, 'g_b'), false);
  // A later migration is not applied ahead of the held one.
  const C = 'CREATE TABLE g_c(id int);';
  await writeFile(join(s.dir, '003-c.sql'), C);
  await f.setApprovals([approval('MA-G-R3', 'apply', '003-c.sql', sha(C))]);
  await f.setToken(tokenFor([['003-c.sql', C]]));
  assert.equal((await s.run({authz: f.options})).code, 'MIGRATION_ORDER_BLOCKED');
  // A re-application GO answers this revocation: approval "reapply" with revocation_event, and a token for it.
  const reapply = {operation: 'reapply', filename: '002-b.sql', sha256: sha(B)};
  await f.setApprovals([approval('MA-G-R4', 'reapply', '002-b.sql', sha(B), {revocation_event: revocation - 1}), approval('MA-G-R3', 'apply', '003-c.sql', sha(C))]);
  await f.setToken(technicalToken([reapply, {operation: 'apply', filename: '003-c.sql', sha256: sha(C)}]));
  assert.equal((await s.run({authz: f.options})).code, 'MIGRATION_ORDER_BLOCKED', 'an approval for another revocation does not count');
  await f.setApprovals([approval('MA-G-R4', 'reapply', '002-b.sql', sha(B), {revocation_event: revocation}), approval('MA-G-R3', 'apply', '003-c.sql', sha(C))]);
  const back = await s.run({authz: f.options});
  assert.deepEqual([back.ok, back.result?.applied], [true, ['002-b.sql', '003-c.sql']], back.message);
  assert.equal((await s.client.query(`SELECT status FROM schema_migration_ledger WHERE filename = '002-b.sql'`)).rows[0].status, 'APPLIED');

  // Second rollback/re-application cycle (PR #300 review P2): the manifest keeps the history (the consumed R4 bound to
  // the first revocation, an expired entry); a new reapply GO for the second revocation is selected, not shadowed.
  await s.client.query(`BEGIN; DROP TABLE g_b; DELETE FROM schema_migrations WHERE filename = '002-b.sql';
    UPDATE schema_migration_ledger SET status = 'REVOKED', revoked_at = now(), revoke_reason = 'second rollback' WHERE filename = '002-b.sql';
    INSERT INTO schema_migration_events(event, filename, detail) VALUES('REVOKED', '002-b.sql', 'second rollback'); COMMIT;`);
  const second = (await s.client.query(`SELECT max(event_id)::int AS id FROM schema_migration_events WHERE event = 'REVOKED'`)).rows[0].id;
  const history = [approval('MA-G-R4', 'reapply', '002-b.sql', sha(B), {revocation_event: revocation}),
    approval('MA-G-R5', 'reapply', '002-b.sql', sha(B), {revocation_event: second, expires_at: '2020-01-01T00:00:00Z'})];
  await f.setApprovals(history);
  await f.setToken(technicalToken([reapply]));
  const none = await s.run({authz: f.options});
  assert.deepEqual([none.ok, none.result?.held], [true, ['002-b.sql']], 'no eligible approval: held, refused');
  assert.ok(none.logs.some(line => line.includes('OWNER_APPROVAL_CONSUMED') && line.includes('OWNER_APPROVAL_EXPIRED')), none.logs.join('\n'));
  await f.setApprovals([...history, approval('MA-G-R6', 'reapply', '002-b.sql', sha(B), {revocation_event: second})]);
  const again = await s.run({authz: f.options});
  assert.deepEqual([again.ok, again.result?.applied], [true, ['002-b.sql']], again.message);
  assert.equal((await authzRows(s.client)).filter(r => r.owner_approval_id === 'MA-G-R6').length, 1);
});

test('F3 on PostgreSQL: unsafe filesystem permissions and the TEST authorization outside a throwaway schema are refused', {timeout: 240000}, async t => {
  const env = await setup(t);
  if (!env) return;
  const s = await env.make({'001-a.sql': A});
  const approvals = [approval('MA-G-F', 'apply', '001-a.sql', sha(A))];
  const writable = await env.fixture({approvals});
  await writable.setToken(tokenFor([['001-a.sql', A]]), 0o666);
  assert.equal((await s.run({authz: writable.options})).code, 'TOKEN_UNSAFE', 'token writable by others');
  const openDir = await env.fixture({approvals, token: tokenFor([['001-a.sql', A]])});
  await chmod(openDir.dir, 0o777);
  assert.equal((await s.run({authz: openDir.options})).code, 'TOKEN_UNSAFE', 'directory writable by others');
  const owner = await env.fixture({approvals, token: tokenFor([['001-a.sql', A]])});
  assert.equal((await s.run({authz: {...owner.options, ownerUid: process.getuid() + 1}})).code, 'TOKEN_UNSAFE', 'not owned by the required uid');
  const link = await env.fixture({approvals});
  const elsewhere = join(link.root, 'elsewhere.json');
  await writeFile(elsewhere, JSON.stringify(tokenFor([['001-a.sql', A]])));
  await chmod(elsewhere, 0o600);
  await symlink(elsewhere, link.tokenPath);
  assert.equal((await s.run({authz: link.options})).code, 'TOKEN_UNSAFE', 'symbolic link');
  const inside = await env.fixture({approvals});
  const tree = join(inside.root, 'repo', 'authz');
  await mkdir(tree, {mode: 0o700});
  await writeFile(join(tree, `allow-migrations-${RELEASE}.json`), JSON.stringify(tokenFor([['001-a.sql', A]])));
  await chmod(join(tree, `allow-migrations-${RELEASE}.json`), 0o600);
  assert.equal((await s.run({authz: {...inside.options, dir: tree}})).code, 'TOKEN_UNSAFE', 'a token inside the release tree is not a separate mechanism');
  assert.equal(await has(s.client, 'g_a'), false);

  // TEST authorization: refused once the schema holds a real authorization.
  const real = await env.fixture({approvals, token: tokenFor([['001-a.sql', A]])});
  assert.equal((await s.run({authz: real.options})).ok, true);
  await writeFile(join(s.dir, '002-b.sql'), B);
  const testRun = await s.run({}, {MATCHPILOT_RUNTIME_MODE: 'test', MATCHPILOT_MIGRATION_TEST_AUTHORIZATION: 'throwaway-schema'});
  assert.equal(testRun.code, 'MIGRATION_NOT_AUTHORIZED');
  assert.ok(testRun.logs.some(line => line.startsWith('MIGRATION_TEST_AUTHORIZATION_REFUSED')));
  // The legacy adoption needs the double authorization too (offline).
  const legacy = await env.make({'001-a.sql': A});
  await legacy.client.query(`CREATE TABLE schema_migrations(filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now()); ${A} INSERT INTO schema_migrations(filename) VALUES('001-a.sql')`);
  const plan = await child(legacy.env, 'adoptLegacy', {dir: legacy.dir, plan: true, allowUnverifiable: true});
  assert.equal(plan.ok, true, plan.message);
  const adopt = await child(legacy.env, 'adoptLegacy', {dir: legacy.dir, allowUnverifiable: true, confirm: plan.result.code, authorizedBy: 'MP-TEST-MIGRATION-GO-01'});
  assert.equal(adopt.code, 'ADOPT_NOT_AUTHORIZED');
  const go = await env.fixture({approvals: [{id: 'MA-G-ADOPT', operation: 'adopt', plan_code: plan.result.code, decision: 'MP-TEST-MIGRATION-GO-01', expires_at: new Date(Date.now() + 3600e3).toISOString()}],
    token: technicalToken([{operation: 'adopt', plan_code: plan.result.code}])});
  const adopted = await child(legacy.env, 'adoptLegacy', {dir: legacy.dir, allowUnverifiable: true, confirm: plan.result.code, authorizedBy: 'MP-TEST-MIGRATION-GO-01', authz: go.options});
  assert.equal(adopted.ok, true, adopted.message);
});

test('F3: an offline server start with an unauthorized pending migration fails closed and applies nothing', {timeout: 120000}, async t => {
  const env = await setup(t);
  if (!env) return;
  const s = await env.make({});
  const run = await new Promise(done => {
    const proc = spawn(process.execPath, ['src/server.mjs'], {cwd: resolve('.'), env: {...s.env, PORT: '0'}, stdio: ['ignore', 'pipe', 'pipe']});
    let output = '';
    proc.stdout.on('data', chunk => { output += chunk; });
    proc.stderr.on('data', chunk => { output += chunk; });
    const timer = setTimeout(() => proc.kill('SIGKILL'), 30000);
    proc.once('exit', code => { clearTimeout(timer); done({code, output}); });
  });
  assert.notEqual(run.code, 0);
  assert.match(run.output, /MIGRATION_NOT_AUTHORIZED/);
  assert.doesNotMatch(run.output, /listening on/);
  assert.equal((await s.client.query('SELECT count(*)::int AS n FROM schema_migrations')).rows[0].n, 0, 'no repository migration applied');
});
