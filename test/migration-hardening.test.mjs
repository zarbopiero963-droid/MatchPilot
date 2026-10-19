// MIG-GAP-01 / MIG-GAP-02 (owner mandate "Migration hardening", 2026-10-19; D13): the local-database check must use
// the host pg really connects to, and migrate() must be mutually exclusive across processes.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp, readdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import test from 'node:test';
import {assertRuntimeSafety, isLocalDatabaseUrl} from '../src/runtime-safety.mjs';

const REMOTE = 'ep-x.neon.tech';
const offline = url => ({MATCHPILOT_RUNTIME_MODE: 'offline', DATABASE_URL: url});

test('MIG-GAP-01: a ?host= override pointing to a remote server is refused outside production', () => {
  for (const url of [
    `postgres://u:p@localhost/db?host=${REMOTE}`,
    `postgres://u:p@127.0.0.1:5432/db?host=${REMOTE}`,
    `postgresql://u:p@localhost/db?host=localhost&host=${REMOTE}`, // pg uses the last value
    `postgres://u:p@localhost/db?host=${REMOTE}&sslmode=disable`,
  ]) {
    assert.equal(isLocalDatabaseUrl(url, {}), false, url);
    for (const mode of ['offline', 'test']) {
      assert.throws(() => assertRuntimeSafety({MATCHPILOT_RUNTIME_MODE: mode, DATABASE_URL: url}), /rejects non-local DATABASE_URL/, url);
    }
  }
});

test('MIG-GAP-01: every other remote or ambiguous host form is refused', () => {
  for (const url of [
    `postgres://u:p@${REMOTE}/db`,
    'postgres://u:p@localhost,remote.example/db', // host list
    'postgres://u:p@localhost./db', // trailing-dot name is not the loopback literal
    'postgres://u:p@0.0.0.0/db',
    'postgres://u:p@127.0.0.2/db',
    'postgres://u:p@localhost/db?hostaddr=10.0.0.1', // ignored by pg 8.16, refused defensively
    `socket:relative/path?db=x`,
    'postgres:///db', // no host in the URL: pg would fall back to PGHOST or its default
    'not a url',
    '',
  ]) assert.equal(isLocalDatabaseUrl(url, {}), false, url);
});

test('MIG-GAP-01: PGHOST and PGHOSTADDR cannot redirect an offline/test process', () => {
  const local = 'postgres://u:p@localhost/db';
  for (const env of [{PGHOST: REMOTE}, {PGHOSTADDR: '10.0.0.1'}, {PGHOST: `localhost,${REMOTE}`}]) {
    assert.equal(isLocalDatabaseUrl(local, env), false, JSON.stringify(env));
    assert.throws(() => assertRuntimeSafety({...offline(local), ...env}), /rejects non-local DATABASE_URL/);
  }
  assert.equal(isLocalDatabaseUrl(local, {PGHOST: 'localhost', PGHOSTADDR: '127.0.0.1'}), true);
});

test('MIG-GAP-01: loopback and local Unix-socket forms are still accepted; production is unaffected', () => {
  for (const url of [
    'postgres://u:p@localhost/db',
    'postgres://u:p@LOCALHOST:5432/db',
    'postgres://u:p@127.0.0.1:5432/db',
    'postgres://u:p@[::1]:5432/db',
    'postgres://u:p@localhost/db?host=/var/run/postgresql', // local socket next to the remote case above
    'postgres://u:p@%2Fvar%2Frun%2Fpostgresql/db', // percent-encoded socket path in the URL host
    'socket:/var/run/postgresql?db=x',
    'postgres://u:p@localhost/db?options=-c%20search_path%3Dx',
  ]) {
    assert.equal(isLocalDatabaseUrl(url, {}), true, url);
    assert.equal(assertRuntimeSafety(offline(url)).mode, 'offline');
  }
  const production = assertRuntimeSafety({MATCHPILOT_RUNTIME_MODE: 'production', DATABASE_URL: `postgres://u:p@localhost/db?host=${REMOTE}`});
  assert.equal(production.mode, 'production');
});

test('MIG-GAP-01: migrate() refuses an overridden host before opening any connection', async () => {
  const saved = process.env.DATABASE_URL;
  // 192.0.2.1 is TEST-NET-1: a connection attempt would hang, so a fast rejection proves no connection was made.
  process.env.DATABASE_URL = 'postgres://u:p@localhost/db?host=192.0.2.1';
  try {
    const {migrate} = await import('../src/migrate.mjs');
    const started = Date.now();
    await assert.rejects(migrate({env: {MATCHPILOT_RUNTIME_MODE: 'test'}, log: () => {}}), /rejects non-local DATABASE_URL/);
    assert.ok(Date.now() - started < 1000);
  } finally {
    if (saved === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = saved;
  }
});

// ---- MIG-GAP-02 on a real throwaway PostgreSQL ----

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

function schemaUrl(schema) {
  const url = new URL(ROOT_URL);
  url.searchParams.set('options', `-c search_path=${schema}`);
  return url.toString();
}

// Runs migrate() in a separate Node process, as two overlapping deploys or a job next to the server would.
function runMigrateProcess(schema, env, {dir} = {}) {
  const script = `
    const {migrate} = await import(${JSON.stringify(new URL('../src/migrate.mjs', import.meta.url).href)});
    const {closePool} = await import(${JSON.stringify(new URL('../src/db.mjs', import.meta.url).href)});
    try {
      const result = await migrate({log: () => {}${dir ? `, dir: ${JSON.stringify(dir)}` : ''}});
      process.stdout.write(JSON.stringify({ok: true, result}));
    } catch (error) {
      process.stdout.write(JSON.stringify({ok: false, code: error.code || null, message: String(error.message)}));
    } finally { await closePool(); }`;
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', script], {
      env: {PATH: process.env.PATH, DATABASE_URL: schemaUrl(schema), MATCHPILOT_LOG_LEVEL: 'silent', ...env},
      cwd: resolve('.'),
    });
    let out = '';
    let err = '';
    child.stdout.on('data', chunk => { out += chunk; });
    child.stderr.on('data', chunk => { err += chunk; });
    child.on('error', fail);
    child.on('close', code => {
      try { done({code, ...JSON.parse(out || '{}'), stderr: err}); }
      catch { fail(new Error(`child output not JSON (exit ${code}): ${out} ${err}`)); }
    });
  });
}

async function withSchema(admin, label, fn) {
  const schema = `migration_${label}_${process.pid}_${Date.now()}`;
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    return await fn(schema);
  } finally {
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  }
}

const migrationFiles = async () => (await readdir(resolve('migrations'))).filter(file => file.endsWith('.sql')).sort();

test('MIG-GAP-02: concurrent migrate() processes apply every migration exactly once', {timeout: 180000}, async t => {
  const admin = await adminClient(t);
  if (!admin) return;
  try {
    await withSchema(admin, 'concurrent', async schema => {
      const files = await migrationFiles();
      const runs = await Promise.all(Array.from({length: 4}, () => runMigrateProcess(schema, {MATCHPILOT_RUNTIME_MODE: 'test'})));
      for (const run of runs) assert.equal(run.ok, true, `${run.message || ''} ${run.stderr}`);
      const applied = runs.flatMap(run => run.result.applied);
      assert.deepEqual([...applied].sort(), files, 'each file applied by exactly one process');
      const rows = (await admin.query(`SELECT filename FROM ${schema}.schema_migrations ORDER BY filename`)).rows.map(row => row.filename);
      assert.deepEqual(rows, files);
    });
  } finally { await admin.end(); }
});

test('MIG-GAP-02: concurrent production processes still apply only approved migrations', {timeout: 120000}, async t => {
  const admin = await adminClient(t);
  if (!admin) return;
  try {
    await withSchema(admin, 'concurrent_prod', async schema => {
      const [first] = await migrationFiles();
      const env = {MATCHPILOT_RUNTIME_MODE: 'production', MATCHPILOT_APPROVED_MIGRATIONS: first};
      const runs = await Promise.all(Array.from({length: 3}, () => runMigrateProcess(schema, env)));
      for (const run of runs) assert.equal(run.ok, true, `${run.message || ''} ${run.stderr}`);
      assert.deepEqual(runs.flatMap(run => run.result.applied), [first], 'only the approved file, once');
      for (const run of runs) assert.ok(run.result.held.length > 0 && !run.result.held.includes(first));
      const rows = (await admin.query(`SELECT filename FROM ${schema}.schema_migrations`)).rows.map(row => row.filename);
      assert.deepEqual(rows, [first], 'unapproved migrations stay unapplied');
    });
  } finally { await admin.end(); }
});

test('MIG-GAP-02: a held lock makes migrate() fail closed after the wait limit, then succeed once released', {timeout: 120000}, async t => {
  const admin = await adminClient(t);
  if (!admin) return;
  try {
    await withSchema(admin, 'lock_wait', async schema => {
      const {MIGRATION_LOCK_CLASS} = await import('../src/migrate.mjs');
      assert.ok(Number.isInteger(MIGRATION_LOCK_CLASS));
      await admin.query('SELECT pg_advisory_lock($1::int4, hashtext($2))', [MIGRATION_LOCK_CLASS, schema]);
      const started = Date.now();
      const blocked = await runMigrateProcess(schema, {MATCHPILOT_RUNTIME_MODE: 'test', MATCHPILOT_MIGRATION_LOCK_TIMEOUT_MS: '700'});
      assert.equal(blocked.ok, false);
      assert.equal(blocked.code, 'MIGRATION_LOCK_TIMEOUT');
      assert.ok(Date.now() - started < 30000);
      const tables = (await admin.query('SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema=$1', [schema])).rows[0].n;
      assert.equal(tables, 0, 'nothing touched while another holder had the lock');
      await admin.query('SELECT pg_advisory_unlock($1::int4, hashtext($2))', [MIGRATION_LOCK_CLASS, schema]);
      const after = await runMigrateProcess(schema, {MATCHPILOT_RUNTIME_MODE: 'test', MATCHPILOT_MIGRATION_LOCK_TIMEOUT_MS: '700'});
      assert.equal(after.ok, true, after.message);
    });
  } finally { await admin.end(); }
});

test('MIG-GAP-02: the lock is released after a failing migration; bad lock settings fail closed', {timeout: 120000}, async t => {
  const admin = await adminClient(t);
  if (!admin) return;
  const dir = await mkdtemp(join(tmpdir(), 'mp-migrations-'));
  try {
    await writeFile(join(dir, '001-ok.sql'), 'CREATE TABLE lock_probe_ok(id int);');
    await writeFile(join(dir, '002-broken.sql'), 'CREATE TABLE lock_probe_broken(id int; -- syntax error');
    await withSchema(admin, 'lock_release', async schema => {
      const {MIGRATION_LOCK_CLASS} = await import('../src/migrate.mjs');
      const failed = await runMigrateProcess(schema, {MATCHPILOT_RUNTIME_MODE: 'test'}, {dir});
      assert.equal(failed.ok, false);
      const free = (await admin.query('SELECT pg_try_advisory_lock($1::int4, hashtext($2)) AS ok', [MIGRATION_LOCK_CLASS, schema])).rows[0].ok;
      assert.equal(free, true, 'lock released after the failure');
      await admin.query('SELECT pg_advisory_unlock($1::int4, hashtext($2))', [MIGRATION_LOCK_CLASS, schema]);
      const rows = (await admin.query(`SELECT filename FROM ${schema}.schema_migrations`)).rows.map(row => row.filename);
      assert.deepEqual(rows, ['001-ok.sql'], 'the failing file rolled back');
      for (const bad of ['0', '-5', 'abc', '1.5']) {
        const run = await runMigrateProcess(schema, {MATCHPILOT_RUNTIME_MODE: 'test', MATCHPILOT_MIGRATION_LOCK_TIMEOUT_MS: bad}, {dir});
        assert.equal(run.ok, false, bad);
        assert.equal(run.code, 'BAD_MIGRATION_LOCK_TIMEOUT', bad);
      }
    });
  } finally {
    await rm(dir, {recursive: true, force: true});
    await admin.end();
  }
});

test('MIG-GAP-02: a process killed mid-migration leaves no partial change, frees the lock, and a restart resumes', {timeout: 120000}, async t => {
  const admin = await adminClient(t);
  if (!admin) return;
  const dir = await mkdtemp(join(tmpdir(), 'mp-migrations-'));
  try {
    await writeFile(join(dir, '001-ok.sql'), 'CREATE TABLE crash_probe_ok(id int);');
    await writeFile(join(dir, '002-slow.sql'), 'CREATE TABLE crash_probe_slow(id int); SELECT pg_sleep(60);');
    await withSchema(admin, 'crash', async schema => {
      const {MIGRATION_LOCK_CLASS} = await import('../src/migrate.mjs');
      const script = `const {migrate} = await import(${JSON.stringify(new URL('../src/migrate.mjs', import.meta.url).href)});
        await migrate({log: () => {}, dir: ${JSON.stringify(dir)}});`;
      const child = spawn(process.execPath, ['--input-type=module', '-e', script], {
        env: {PATH: process.env.PATH, DATABASE_URL: schemaUrl(schema), MATCHPILOT_RUNTIME_MODE: 'test'}, cwd: resolve('.'), stdio: 'ignore',
      });
      const exited = new Promise(done => child.on('close', done));
      // Wait until 002 is running (its sleep is visible in pg_stat_activity), then kill the process.
      const deadline = Date.now() + 30000;
      while (Date.now() < deadline) {
        const busy = (await admin.query(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE query LIKE '%pg_sleep(60)%' AND pid <> pg_backend_pid()`)).rows[0].n;
        if (busy) break;
        await new Promise(done => setTimeout(done, 100));
      }
      child.kill('SIGKILL');
      await exited;
      // The server notices the dropped connection, rolls back 002 and frees the session lock.
      let free = false;
      for (let i = 0; i < 100 && !free; i++) {
        free = (await admin.query('SELECT pg_try_advisory_lock($1::int4, hashtext($2)) AS ok', [MIGRATION_LOCK_CLASS, schema])).rows[0].ok;
        if (!free) await new Promise(done => setTimeout(done, 100));
      }
      assert.equal(free, true, 'lock freed after the crash');
      await admin.query('SELECT pg_advisory_unlock($1::int4, hashtext($2))', [MIGRATION_LOCK_CLASS, schema]);
      const tables = (await admin.query('SELECT table_name FROM information_schema.tables WHERE table_schema=$1 ORDER BY 1', [schema])).rows.map(row => row.table_name);
      assert.deepEqual(tables, ['crash_probe_ok', 'schema_migrations'], 'no partial table from the killed migration');
      const before = (await admin.query(`SELECT filename FROM ${schema}.schema_migrations`)).rows.map(row => row.filename);
      assert.deepEqual(before, ['001-ok.sql']);

      await writeFile(join(dir, '002-slow.sql'), 'CREATE TABLE crash_probe_slow(id int);');
      const restart = await runMigrateProcess(schema, {MATCHPILOT_RUNTIME_MODE: 'test'}, {dir});
      assert.equal(restart.ok, true, restart.message);
      assert.deepEqual(restart.result.applied, ['002-slow.sql'], 'restart skips the applied file and resumes');
      const again = await runMigrateProcess(schema, {MATCHPILOT_RUNTIME_MODE: 'test'}, {dir});
      assert.deepEqual(again.result, {applied: [], held: []}, 'nothing left to apply');
    });
  } finally {
    await rm(dir, {recursive: true, force: true});
    await admin.end();
  }
});

test('MIG-GAP-02: a connection error fails migrate() without hanging or applying anything', {timeout: 60000}, async () => {
  const script = `const {migrate} = await import(${JSON.stringify(new URL('../src/migrate.mjs', import.meta.url).href)});
    try { await migrate({log: () => {}}); process.stdout.write('applied'); }
    catch (error) { process.stdout.write('failed:' + (error.code || error.message)); process.exitCode = 3; }`;
  const out = await new Promise((done, fail) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', script], {
      // Port 1 on loopback: nothing listens, the connection is refused at once.
      env: {PATH: process.env.PATH, DATABASE_URL: 'postgres://u:p@127.0.0.1:1/db', MATCHPILOT_RUNTIME_MODE: 'test'}, cwd: resolve('.'),
    });
    let text = '';
    child.stdout.on('data', chunk => { text += chunk; });
    child.on('error', fail);
    child.on('close', code => done({code, text}));
  });
  assert.equal(out.code, 3);
  assert.match(out.text, /^failed:/);
});
