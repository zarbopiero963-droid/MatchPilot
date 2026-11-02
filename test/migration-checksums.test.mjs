// MP-MIG-CHECKSUMS-01 (F2, owner mandate MP-MIGRATIONS-030-031-AND-API-FOOTBALL-P1-FIX-01 F2=A): the persistent checksum
// register of the runner. Pure verification cases, then the real runner in child processes on throwaway PostgreSQL
// schemas: new, already applied, match, mismatch, missing, renamed, legacy and its adoption, populated database, crash
// during application, retry, two concurrent processes, rollback and restart. Skipped without a local PostgreSQL outside
// CI (fails in CI), as the other PostgreSQL tests.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtemp, readFile, rename, rm, unlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import test from 'node:test';
import {HASH_RULE, parseEvidence, verifyHistory} from '../src/migrate.mjs';
import {MIGRATIONS_DIR, migrationFiles} from './helpers/migrations.mjs';

const ROOT_URL = process.env.FUTPYTHON_TEST_DATABASE_URL || 'postgres://matchpilot:matchpilot_local_test@127.0.0.1:5432/matchpilot_fpt';
const sha = text => createHash('sha256').update(text).digest('hex');
const row = (filename, sha256, status = 'APPLIED') => [filename, {filename, sha256, status, hash_rule: HASH_RULE, hash_origin: 'VERIFIED'}];

test('F2 verifyHistory: match, mismatch, missing, renamed, legacy and ambiguous states are told apart', () => {
  const a = sha('a'), b = sha('b');
  const disk = new Map([['001-a.sql', {sha256: a}], ['002-b.sql', {sha256: b}]]);
  const ok = verifyHistory({applied: ['001-a.sql'], ledger: new Map([row('001-a.sql', a)]), disk});
  assert.deepEqual(ok, {problems: [], pending: ['002-b.sql']}, 'match: nothing blocks, 002 pending');
  const codes = input => verifyHistory(input).problems.map(p => p.code);
  assert.deepEqual(codes({applied: ['001-a.sql'], ledger: new Map([row('001-a.sql', sha('changed'))]), disk}), ['MIGRATION_CHECKSUM_MISMATCH']);
  assert.deepEqual(codes({applied: ['001-a.sql'], ledger: new Map([row('001-a.sql', a)]), disk: new Map([['002-b.sql', {sha256: b}]])}), ['MIGRATION_MISSING']);
  assert.deepEqual(codes({applied: ['001-a.sql'], ledger: new Map([row('001-a.sql', a)]), disk: new Map([['009-a.sql', {sha256: a}]])}), ['MIGRATION_RENAMED']);
  assert.deepEqual(codes({applied: ['001-a.sql'], ledger: new Map(), disk}), ['MIGRATION_LEGACY_UNADOPTED']);
  assert.deepEqual(codes({applied: [], ledger: new Map([row('001-a.sql', a)]), disk}), ['MIGRATION_STATE_AMBIGUOUS'], 'APPLIED in the register, gone from schema_migrations');
  assert.deepEqual(codes({applied: ['001-a.sql'], ledger: new Map([row('001-a.sql', a, 'REVOKED')]), disk}), ['MIGRATION_STATE_AMBIGUOUS'], 'REVOKED but back in schema_migrations');
  assert.deepEqual(codes({applied: [], ledger: new Map([row('001-a.sql', a, 'REVOKED')]), disk}), [], 'a recorded rollback is a sound state');
  assert.deepEqual(codes({applied: [], ledger: new Map([row('001-a.sql', sha('old'), 'REVOKED')]), disk}), ['MIGRATION_CHECKSUM_MISMATCH'], 'a revoked file changed on disk');
  const bad = new Map([['001-a.sql', {filename: '001-a.sql', sha256: 'x', status: 'APPLIED', hash_rule: HASH_RULE, hash_origin: 'VERIFIED'}]]);
  assert.ok(codes({applied: ['001-a.sql'], ledger: bad, disk}).includes('MIGRATION_STATE_AMBIGUOUS'), 'a malformed row fails closed');
});

test('F2 evidence parser: sha256sum format only, no ambiguity', () => {
  assert.deepEqual([...parseEvidence(`${sha('a')}  001-a.sql\n${sha('b')} migrations/002-b.sql\n`)], [['001-a.sql', sha('a')], ['002-b.sql', sha('b')]]);
  assert.throws(() => parseEvidence('not a hash line'), /ADOPT_EVIDENCE_MALFORMED|evidence lines/);
  assert.throws(() => parseEvidence(`${sha('a')} 001-a.sql\n${sha('b')} 001-a.sql`), /two hashes/);
});

// ---- PostgreSQL ----
const RUNNER = new URL('../src/migrate.mjs', import.meta.url).href;
const DB = new URL('../src/db.mjs', import.meta.url).href;

// Runs one runner function in a child process and reports {ok, result | code, message, logs}.
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
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(ROOT_URL).hostname), 'remote PostgreSQL is forbidden');
  const admin = new pg.Client({connectionString: ROOT_URL, connectionTimeoutMillis: 2000});
  try { await admin.connect(); }
  catch (cause) {
    await admin.end().catch(() => {});
    if (process.env.CI) throw cause;
    t.skip('throwaway postgres unavailable');
    return null;
  }
  const schemas = [], dirs = [], clients = [];
  t.diagnostic(`PostgreSQL ${(await admin.query("SELECT current_setting('server_version') AS v")).rows[0].v}`);
  const make = async name => {
    const schema = `migsum_${name}_${process.pid}`;
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.query(`CREATE SCHEMA ${schema}`);
    schemas.push(schema);
    const url = new URL(ROOT_URL);
    url.searchParams.set('options', `-c search_path=${schema}`);
    const env = {PATH: process.env.PATH, DATABASE_URL: url.toString(), MATCHPILOT_RUNTIME_MODE: 'test', MATCHPILOT_CODE_VERSION: 'test-f2'};
    const client = new pg.Client({connectionString: url.toString()});
    await client.connect();
    clients.push(client);
    return {schema, env, client, run: (fn, options) => child(env, fn, options)};
  };
  const dir = async files => {
    const path = await mkdtemp(join(tmpdir(), 'mp-migsum-'));
    dirs.push(path);
    for (const [name, text] of Object.entries(files)) await writeFile(join(path, name), text);
    return path;
  };
  t.after(async () => {
    for (const client of clients) await client.end().catch(() => {});
    for (const schema of schemas) await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {});
    for (const path of dirs) await rm(path, {recursive: true, force: true});
    await admin.end();
  });
  return {make, dir, admin};
}

const ledger = async client => (await client.query('SELECT filename, sha256, hash_rule, hash_origin, status, code_version, evidence FROM schema_migration_ledger ORDER BY filename')).rows;
const events = async client => (await client.query('SELECT event, filename, expected_sha256, actual_sha256 FROM schema_migration_events ORDER BY event_id')).rows;
const tables = async client => (await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() ORDER BY 1")).rows.map(r => r.table_name);

test('F2 on PostgreSQL: new, applied, match, mismatch, missing, renamed — every problem blocks and is recorded', {timeout: 180000}, async t => {
  const env = await setup(t);
  if (!env) return;
  const s = await env.make('core');
  const A = 'CREATE TABLE f2_a(id int);\n', B = 'CREATE TABLE f2_b(id int);\n';
  const dir = await env.dir({'001-a.sql': A, '002-b.sql': B});
  const first = await s.run('migrate', {dir});
  assert.equal(first.ok, true, first.message);
  assert.deepEqual(first.result.applied, ['001-a.sql', '002-b.sql']);
  assert.deepEqual(await ledger(s.client), [
    {filename: '001-a.sql', sha256: sha(A), hash_rule: 'sha256-file-bytes-v1', hash_origin: 'VERIFIED', status: 'APPLIED', code_version: 'test-f2', evidence: null},
    {filename: '002-b.sql', sha256: sha(B), hash_rule: 'sha256-file-bytes-v1', hash_origin: 'VERIFIED', status: 'APPLIED', code_version: 'test-f2', evidence: null}]);
  const again = await s.run('migrate', {dir});
  assert.deepEqual(again.result, {applied: [], held: []}, 'match: nothing to apply, nothing refused');
  const verify = await s.run('migrate', {dir, verifyOnly: true});
  assert.deepEqual([verify.ok, verify.result.verified], [true, 2]);

  // Mismatch: one byte more (a trailing newline) is a different migration. Blocking; the pending 003 is not applied.
  await writeFile(join(dir, '001-a.sql'), A + '\n');
  await writeFile(join(dir, '003-c.sql'), 'CREATE TABLE f2_c(id int);');
  const mismatch = await s.run('migrate', {dir});
  assert.deepEqual([mismatch.ok, mismatch.code], [false, 'MIGRATION_CHECKSUM_MISMATCH']);
  assert.equal((await tables(s.client)).includes('f2_c'), false, 'nothing applied after a mismatch');
  assert.deepEqual((await events(s.client)).at(-1), {event: 'MIGRATION_CHECKSUM_MISMATCH', filename: '001-a.sql', expected_sha256: sha(A), actual_sha256: sha(A + '\n')});
  assert.equal((await ledger(s.client))[0].sha256, sha(A), 'the recorded hash is never updated');
  const stillRefused = await s.run('migrate', {dir});
  assert.equal(stillRefused.code, 'MIGRATION_CHECKSUM_MISMATCH', 'a restart is refused the same way');

  // Missing and renamed.
  await writeFile(join(dir, '001-a.sql'), A);
  await unlink(join(dir, '003-c.sql'));
  await rename(join(dir, '002-b.sql'), join(dir, '005-b.sql'));
  const renamed = await s.run('migrate', {dir});
  assert.deepEqual([renamed.ok, renamed.code], [false, 'MIGRATION_RENAMED']);
  await unlink(join(dir, '005-b.sql'));
  const missing = await s.run('migrate', {dir});
  assert.deepEqual([missing.ok, missing.code], [false, 'MIGRATION_MISSING']);
  await writeFile(join(dir, '002-b.sql'), B);
  const restored = await s.run('migrate', {dir});
  assert.deepEqual([restored.ok, restored.result.applied], [true, []], 'restart once the files are back as applied');
  assert.deepEqual((await events(s.client)).map(e => e.event), ['APPLIED', 'APPLIED', 'MIGRATION_CHECKSUM_MISMATCH', 'MIGRATION_CHECKSUM_MISMATCH', 'MIGRATION_RENAMED', 'MIGRATION_MISSING']);
});

test('F2 on PostgreSQL: a legacy history is refused until an explicit, confirmed adoption; no hash is invented', {timeout: 180000}, async t => {
  const env = await setup(t);
  if (!env) return;
  const s = await env.make('legacy');
  const A = 'CREATE TABLE f2_la(id int);', B = 'CREATE TABLE f2_lb(id int);', C = 'CREATE TABLE f2_lc(id int);';
  // A database migrated by the runner before the register existed: schema_migrations only.
  await s.client.query(`CREATE TABLE schema_migrations(filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now()); ${A} ${B}
    INSERT INTO schema_migrations(filename) VALUES('001-a.sql'), ('002-b.sql');`);
  const dir = await env.dir({'001-a.sql': A, '002-b.sql': B, '003-c.sql': C});
  const refused = await s.run('migrate', {dir});
  assert.deepEqual([refused.ok, refused.code], [false, 'MIGRATION_LEGACY_UNADOPTED']);
  assert.equal((await tables(s.client)).includes('f2_lc'), false, 'no pending migration on an unadopted history');
  assert.deepEqual(await ledger(s.client), [], 'nothing is written into the register by a refusal');

  // Evidence with a wrong hash refuses everything; no evidence and no allowUnverifiable refuses too.
  const wrong = await s.run('adoptLegacy', {dir, plan: true, evidence: `${sha('other')}  001-a.sql\n`});
  assert.equal(wrong.code, 'ADOPT_EVIDENCE_MISMATCH');
  assert.equal((await s.run('adoptLegacy', {dir, plan: true})).code, 'ADOPT_UNVERIFIABLE_NOT_ALLOWED');
  // Plan: 001 from the evidence (as the root-owned migrations.sha256 of mp-deploy), 002 unverifiable.
  const evidence = `${sha(A)}  001-a.sql\n`;
  const plan = await s.run('adoptLegacy', {dir, plan: true, evidence, evidenceLabel: 'migrations.sha256', allowUnverifiable: true});
  assert.equal(plan.ok, true, plan.message);
  assert.deepEqual(plan.result.items.map(i => [i.filename, i.origin]), [['001-a.sql', 'RECONSTRUCTED_FROM_EVIDENCE'], ['002-b.sql', 'UNVERIFIABLE_LEGACY']]);
  assert.match(plan.result.code, /^[0-9a-f]{16}$/);
  assert.deepEqual(await ledger(s.client), [], 'a plan writes nothing');
  const base = {dir, evidence, evidenceLabel: 'migrations.sha256', allowUnverifiable: true};
  assert.equal((await s.run('adoptLegacy', {...base, confirm: '0'.repeat(16), authorizedBy: 'MP-TEST-GO'})).code, 'ADOPT_CONFIRMATION_MISMATCH');
  assert.equal((await s.run('adoptLegacy', {...base, confirm: plan.result.code})).code, 'ADOPT_AUTHORIZATION_REQUIRED');
  assert.equal((await s.run('adoptLegacy', {...base, allowUnverifiable: false, confirm: plan.result.code, authorizedBy: 'MP-TEST-GO'})).code, 'ADOPT_UNVERIFIABLE_NOT_ALLOWED');
  const adopted = await s.run('adoptLegacy', {...base, confirm: plan.result.code, authorizedBy: 'MP-TEST-GO'});
  assert.equal(adopted.ok, true, adopted.message);
  const rows = await ledger(s.client);
  assert.deepEqual(rows.map(r => [r.filename, r.hash_origin, r.sha256]), [['001-a.sql', 'RECONSTRUCTED_FROM_EVIDENCE', sha(A)], ['002-b.sql', 'UNVERIFIABLE_LEGACY', sha(B)]]);
  assert.match(rows[0].evidence, /migrations\.sha256 sha256:[0-9a-f]{64}; authorized by MP-TEST-GO/);
  assert.match(rows[1].evidence, /not verifiable; authorized by MP-TEST-GO/);
  // After adoption the runner verifies and applies the pending file; a later change of an adopted file is a mismatch.
  const after = await s.run('migrate', {dir});
  assert.deepEqual([after.ok, after.result?.applied], [true, ['003-c.sql']]);
  await writeFile(join(dir, '002-b.sql'), B + ' -- edited');
  assert.equal((await s.run('migrate', {dir})).code, 'MIGRATION_CHECKSUM_MISMATCH');
  assert.equal((await s.run('adoptLegacy', {...base, dir, plan: true})).code, 'MIGRATION_CHECKSUM_MISMATCH', 'adoption never hides another problem');
});

test('F2 on PostgreSQL: a populated database of the real migrations is adopted from the deploy ledger without touching its data', {timeout: 240000}, async t => {
  const env = await setup(t);
  if (!env) return;
  const s = await env.make('populated');
  const first = await s.run('migrate', {dir: MIGRATIONS_DIR});
  assert.equal(first.ok, true, first.message);
  const {seedQaArchive} = await import('./helpers/fpt-seed.mjs');
  await seedQaArchive(s.client);
  const digest = async () => (await s.client.query(`SELECT md5(string_agg(t.table_name || ':' || (xpath('/row/c/text()', query_to_xml('SELECT md5(coalesce(string_agg(r::text, ''|'' ORDER BY r::text), '''')) AS c FROM ' || quote_ident(t.table_name) || ' r', false, true, '')))[1]::text, ',' ORDER BY t.table_name)) AS d
    FROM information_schema.tables t WHERE t.table_schema = current_schema() AND t.table_type = 'BASE TABLE' AND t.table_name NOT LIKE 'schema\\_migration%'`)).rows[0].d;
  const before = await digest();
  // The register is lost (a database migrated before F2): every applied row becomes legacy.
  await s.client.query('DROP TABLE schema_migration_ledger, schema_migration_events');
  assert.equal((await s.run('migrate', {dir: MIGRATIONS_DIR})).code, 'MIGRATION_LEGACY_UNADOPTED');
  // The deploy ledger written by mp-deploy (`sha256sum *` in migrations/) is the evidence.
  const files = await migrationFiles();
  const evidence = (await Promise.all(files.map(async f => `${sha(await readFile(join(MIGRATIONS_DIR, f)))}  ${f}`))).join('\n') + '\n';
  const plan = await s.run('adoptLegacy', {dir: MIGRATIONS_DIR, plan: true, evidence, evidenceLabel: 'migrations.sha256'});
  assert.equal(plan.result.items.length, files.length);
  assert.ok(plan.result.items.every(i => i.origin === 'RECONSTRUCTED_FROM_EVIDENCE'));
  const adopted = await s.run('adoptLegacy', {dir: MIGRATIONS_DIR, evidence, evidenceLabel: 'migrations.sha256', confirm: plan.result.code, authorizedBy: 'MP-TEST-GO'});
  assert.equal(adopted.ok, true, adopted.message);
  const verified = await s.run('migrate', {dir: MIGRATIONS_DIR, verifyOnly: true});
  assert.deepEqual([verified.ok, verified.result.verified], [true, files.length]);
  assert.equal(await digest(), before, 'the data of every table is unchanged');
});

test('F2 on PostgreSQL: crash during application, retry, concurrent processes, rollback and restart', {timeout: 240000}, async t => {
  const env = await setup(t);
  if (!env) return;
  // Crash: the process is killed while 002 runs; nothing of 002 is recorded, the restart applies it.
  const c = await env.make('crash');
  const dir = await env.dir({'001-ok.sql': 'CREATE TABLE f2_ok(id int);', '002-slow.sql': 'CREATE TABLE f2_slow(id int); SELECT pg_sleep(60);'});
  const script = `const {migrate} = await import(${JSON.stringify(RUNNER)}); await migrate({log: () => {}, dir: ${JSON.stringify(dir)}});`;
  const proc = spawn(process.execPath, ['--input-type=module', '-e', script], {env: c.env, stdio: 'ignore'});
  const exited = new Promise(done => proc.on('close', done));
  for (let i = 0; i < 300; i++) {
    if ((await env.admin.query(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE query LIKE '%f2_slow%pg_sleep(60)%' AND pid <> pg_backend_pid()`)).rows[0].n) break;
    await new Promise(done => setTimeout(done, 100));
  }
  proc.kill('SIGKILL');
  await exited;
  for (let i = 0; i < 100; i++) {
    if (!(await env.admin.query(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE query LIKE '%f2_slow%pg_sleep(60)%' AND pid <> pg_backend_pid()`)).rows[0].n) break;
    await new Promise(done => setTimeout(done, 100));
  }
  assert.deepEqual((await ledger(c.client)).map(r => r.filename), ['001-ok.sql'], 'the killed migration left no register row');
  await writeFile(join(dir, '002-slow.sql'), 'CREATE TABLE f2_slow(id int);'); // never applied: it may still change
  const restart = await c.run('migrate', {dir});
  assert.deepEqual([restart.ok, restart.result?.applied], [true, ['002-slow.sql']], restart.message);

  // Retry: a failing file records nothing; once fixed it applies.
  const r = await env.make('retry');
  const rdir = await env.dir({'001-bad.sql': 'CREATE TABLE f2_bad(id int); SELECT 1/0;'});
  const failed = await r.run('migrate', {dir: rdir});
  assert.equal(failed.ok, false);
  assert.deepEqual(await ledger(r.client), []);
  await writeFile(join(rdir, '001-bad.sql'), 'CREATE TABLE f2_bad(id int);');
  assert.deepEqual((await r.run('migrate', {dir: rdir})).result.applied, ['001-bad.sql']);

  // Two processes at once: one applies, the other waits for the lock and finds nothing pending.
  const k = await env.make('concurrent');
  const kdir = await env.dir({'001-a.sql': 'CREATE TABLE f2_k1(id int); SELECT pg_sleep(1);', '002-b.sql': 'CREATE TABLE f2_k2(id int);'});
  const [one, two] = await Promise.all([k.run('migrate', {dir: kdir}), k.run('migrate', {dir: kdir})]);
  assert.ok(one.ok && two.ok, `${one.message} ${two.message}`);
  assert.deepEqual([...one.result.applied, ...two.result.applied].sort(), ['001-a.sql', '002-b.sql']);
  assert.deepEqual((await events(k.client)).map(e => e.event), ['APPLIED', 'APPLIED'], 'each file recorded once');

  // Rollback recorded in the register (as db/rollback/*.down.sql does): the file can return with the same bytes.
  await k.client.query(`BEGIN; DROP TABLE f2_k2; DELETE FROM schema_migrations WHERE filename = '002-b.sql';
    UPDATE schema_migration_ledger SET status = 'REVOKED', revoked_at = now(), revoke_reason = 'test' WHERE filename = '002-b.sql'; COMMIT;`);
  const back = await k.run('migrate', {dir: kdir});
  assert.deepEqual([back.ok, back.result?.applied], [true, ['002-b.sql']], back.message);
  assert.equal((await events(k.client)).at(-1).event, 'REAPPLIED');
  // Rollback NOT recorded (schema_migrations row deleted by hand): ambiguous, refused at every restart.
  await k.client.query(`DROP TABLE f2_k2; DELETE FROM schema_migrations WHERE filename = '002-b.sql'`);
  for (let i = 0; i < 2; i++) assert.equal((await k.run('migrate', {dir: kdir})).code, 'MIGRATION_STATE_AMBIGUOUS');
  assert.equal((await tables(k.client)).includes('f2_k2'), false, 'never re-applied from an ambiguous state');
});

test('F2: the rollback of 030 records its revocation in the register', async () => {
  const down = await readFile(new URL('../db/rollback/030-persistence.down.sql', import.meta.url), 'utf8');
  assert.match(down, /UPDATE schema_migration_ledger SET status = 'REVOKED'[\s\S]*WHERE filename = '030-persistence\.sql'/);
  assert.ok(down.indexOf('schema_migration_ledger') < down.lastIndexOf('COMMIT;'), 'inside the rollback transaction');
});
