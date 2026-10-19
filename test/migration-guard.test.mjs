// R-04a (owner decision D13): pending migrations never reach a production database without the owner's approval of
// each exact file. Pure planning tests, plus the real migrate() on a throwaway PostgreSQL schema.
import assert from 'node:assert/strict';
import test from 'node:test';
import {migrationPolicy, planMigrations} from '../src/migrate.mjs';

const pending = ['029-a.sql', '030-b.sql', '031-c.sql'];

test('offline and test modes apply every pending migration', () => {
  for (const mode of [undefined, 'offline', 'test', ' TEST ']) {
    assert.deepEqual(planMigrations(pending, migrationPolicy({MATCHPILOT_RUNTIME_MODE: mode})), {apply: pending, held: []}, String(mode));
  }
});

test('production holds pending migrations unless each exact file is approved, in order', () => {
  const plan = env => planMigrations(pending, migrationPolicy({MATCHPILOT_RUNTIME_MODE: 'production', ...env}));
  assert.deepEqual(plan({}), {apply: [], held: pending}, 'nothing approved: nothing applied');
  assert.deepEqual(plan({MATCHPILOT_APPROVED_MIGRATIONS: '029-a.sql'}), {apply: ['029-a.sql'], held: ['030-b.sql', '031-c.sql']});
  assert.deepEqual(plan({MATCHPILOT_APPROVED_MIGRATIONS: ' 029-a.sql , 030-b.sql,031-c.sql '}), {apply: pending, held: []});
  assert.deepEqual(plan({MATCHPILOT_APPROVED_MIGRATIONS: '030-b.sql,031-c.sql'}), {apply: [], held: pending},
    'a later file is never applied ahead of an earlier unapproved one');
  assert.deepEqual(plan({MATCHPILOT_APPROVED_MIGRATIONS: '029-a,true,*,all'}), {apply: [], held: pending}, 'no wildcard or partial names');
  assert.deepEqual(planMigrations([], migrationPolicy({MATCHPILOT_RUNTIME_MODE: 'production'})), {apply: [], held: []});
});

test('migrate() in production mode applies only approved files on a real database', {timeout: 90000}, async t => {
  const pg = (await import('pg')).default;
  const rootUrl = process.env.FUTPYTHON_TEST_DATABASE_URL || 'postgres://matchpilot:matchpilot_local_test@127.0.0.1:5432/matchpilot_fpt';
  const base = new URL(rootUrl);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(base.hostname), 'remote PostgreSQL is forbidden');
  const admin = new pg.Client({connectionString: rootUrl, connectionTimeoutMillis: 2000});
  try { await admin.connect(); }
  catch (cause) {
    await admin.end().catch(() => {});
    if (process.env.CI) throw cause;
    return t.skip('throwaway postgres unavailable');
  }
  const schema = `migration_guard_${process.pid}`;
  await admin.query(`CREATE SCHEMA ${schema}`);
  base.searchParams.set('options', `-c search_path=${schema}`);
  process.env.DATABASE_URL = base.toString();
  const db = await import('../src/db.mjs');
  const {migrate} = await import('../src/migrate.mjs');
  const logs = [];
  const log = line => logs.push(line);
  try {
    const production = {MATCHPILOT_RUNTIME_MODE: 'production'};
    const held = await migrate({env: production, log});
    assert.equal(held.applied.length, 0);
    assert.ok(held.held.length >= 28 && held.held[0] === '001-futpython-mirror.sql');
    assert.ok(logs.some(line => line.startsWith('MIGRATIONS_PENDING_NOT_APPROVED ')));
    const tables = async () => (await admin.query(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema=$1`, [schema])).rows[0].n;
    assert.equal(await tables(), 1, 'only schema_migrations exists: no production migration ran');

    const one = await migrate({env: {...production, MATCHPILOT_APPROVED_MIGRATIONS: '001-futpython-mirror.sql'}, log});
    assert.deepEqual(one.applied, ['001-futpython-mirror.sql']);
    const recorded = (await admin.query(`SELECT filename FROM ${schema}.schema_migrations`)).rows.map(r => r.filename);
    assert.deepEqual(recorded, ['001-futpython-mirror.sql']);

    const rest = await migrate({env: {MATCHPILOT_RUNTIME_MODE: 'test'}, log});
    assert.equal(rest.held.length, 0);
    assert.equal(rest.applied.length, held.held.length - 1, 'test mode applies the remaining migrations');
    const again = await migrate({env: production, log});
    assert.deepEqual(again, {applied: [], held: []}, 'with nothing pending, production startup behaves as before');
  } finally {
    await db.closePool?.().catch?.(() => {});
    try { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); }
    finally { await admin.end(); }
  }
});
