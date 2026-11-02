// MP-MIG-030-PROMOTE-01 (F1, owner mandate MP-MIGRATIONS-030-031-AND-API-FOOTBALL-P1-FIX-01): db/staged/030-persistence.sql
// becomes migrations/030-persistence.sql, byte for byte. Static checks (order, numbering, dependencies, rollback scope),
// then the real runner on throwaway PostgreSQL schemas for every historical state a database can be in:
// empty; 001-029 with data; 001-029 plus 031 applied first (the order PR #282 would produce); 030 already run by hand.
// The PostgreSQL part runs on the local throwaway database of FUTPYTHON_TEST_DATABASE_URL and is skipped without it
// (it fails instead in CI), as the other PostgreSQL tests of the repository.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, readFileSync} from 'node:fs';
import {mkdtemp, rm, copyFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import test from 'node:test';
import {assertLocalTestDatabase, MIGRATIONS_DIR, migrateArgs, migrationFiles, migrationsBefore} from './helpers/migrations.mjs';

const ROOT_URL = process.env.FUTPYTHON_TEST_DATABASE_URL || 'postgres://matchpilot:matchpilot_local_test@127.0.0.1:5432/matchpilot_fpt';
const FILE_030 = '030-persistence.sql';
const SHA_030 = 'b81e0ca4be76712c09e1556a53c112d779d8532f911c16684fa0e50671276999';
const PATH_030 = join(MIGRATIONS_DIR, FILE_030);
// Migration 031 is still staged on this branch (it moves to migrations/ with PR #282): the tests use that exact file.
const PATH_031 = fileUrlPath('../db/staged/031-apifootball-odds-snapshots.sql');
const DOWN_030 = fileUrlPath('../db/rollback/030-persistence.down.sql');
const TABLES_030 = ['paper_ledger_entries', 'paper_ledger_keys', 'saved_backtests', 'strategy_definitions', 'strategy_versions'];
const FUNCTIONS_030 = ['mp_paper_ledger_next_seq', 'mp_persistence_append_only', 'mp_strategy_versions_supersede_only'];

function fileUrlPath(relative) { return new URL(relative, import.meta.url).pathname; }
const strip = sql => sql.replace(/--.*$/gm, '');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

// Objects a migration creates, and the objects it refers to, read from its SQL.
function objects(sql) {
  const code = strip(sql);
  const all = (re) => [...code.matchAll(re)].map(m => m[1].toLowerCase());
  return {
    tables: all(/CREATE TABLE IF NOT EXISTS\s+(\w+)/gi),
    functions: all(/CREATE OR REPLACE FUNCTION\s+(\w+)/gi),
    indexes: all(/CREATE (?:UNIQUE )?INDEX IF NOT EXISTS\s+(\w+)/gi),
    triggers: all(/CREATE OR REPLACE TRIGGER\s+(\w+)/gi),
    referencedTables: [...all(/REFERENCES\s+(\w+)/gi), ...all(/\bON\s+(\w+)\s+(?:FOR|\()/gi), ...all(/\bFROM\s+(\w+)/gi)],
    referencedFunctions: all(/EXECUTE FUNCTION\s+(\w+)/gi),
  };
}

test('F1 static: 030 is a numbered migration, byte-identical to the reviewed staged file, in order after 029', async () => {
  const files = await migrationFiles();
  assert.ok(files.includes(FILE_030), 'migrations/030-persistence.sql exists');
  assert.equal(existsSync(fileUrlPath('../db/staged/030-persistence.sql')), false, 'the staged copy is gone: one source only');
  assert.equal(sha256(readFileSync(PATH_030)), SHA_030, 'same bytes as the staged file reviewed in docs/persistence-plan.md');
  // The runner applies files in plain sort order: numbering and sort order must agree, with no gap and no duplicate.
  const numbers = files.map(file => Number(/^(\d{3})-/.exec(file)?.[1]));
  assert.ok(numbers.every(Number.isInteger), 'every migration starts with three digits');
  assert.deepEqual(numbers, numbers.map((_, i) => i + 1), 'numbers 001..N, contiguous, unique, sort order = number order');
  assert.equal(files[files.indexOf(FILE_030) - 1], '029-owner-auth.sql');
});

test('F1 static: 030 and 031 are independent of each other and of 001-029; the rollback removes exactly what 030 creates', async () => {
  const sql030 = readFileSync(PATH_030, 'utf8');
  const own = objects(sql030);
  assert.deepEqual([...own.tables].sort(), TABLES_030);
  assert.deepEqual([...own.functions].sort(), FUNCTIONS_030);
  // Every table and trigger function 030 refers to is one it creates itself: no dependency on 001-029.
  for (const name of own.referencedTables) assert.ok(own.tables.includes(name), `030 refers to ${name}, which it does not create`);
  for (const name of own.referencedFunctions) assert.ok(own.functions.includes(name), `030 calls ${name}, which it does not create`);
  // No name 030 creates exists in an earlier migration.
  const earlier = (await migrationFiles()).filter(file => file < FILE_030).map(file => strip(readFileSync(join(MIGRATIONS_DIR, file), 'utf8')).toLowerCase()).join('\n');
  for (const name of [...own.tables, ...own.functions, ...own.indexes, ...own.triggers]) {
    assert.doesNotMatch(earlier, new RegExp(`\\b${name}\\b`), `${name} already appears in 001-029`);
  }
  // 031 neither creates nor refers to anything of 030, and the other way round.
  const sql031 = readFileSync(PATH_031, 'utf8');
  const other = objects(sql031);
  const names030 = [...own.tables, ...own.functions, ...own.indexes, ...own.triggers];
  const names031 = [...other.tables, ...other.functions, ...other.indexes, ...other.triggers];
  assert.deepEqual(names030.filter(name => names031.includes(name)), [], 'no object created by both');
  for (const name of names030) assert.doesNotMatch(strip(sql031).toLowerCase(), new RegExp(`\\b${name}\\b`), `031 mentions ${name}`);
  for (const name of names031) assert.doesNotMatch(strip(sql030).toLowerCase(), new RegExp(`\\b${name}\\b`), `030 mentions ${name}`);
  // The rollback drops the five tables and three functions of 030 and its schema_migrations row, nothing else.
  const down = strip(readFileSync(DOWN_030, 'utf8'));
  assert.deepEqual([...down.matchAll(/DROP TABLE IF EXISTS (\w+)/g)].map(m => m[1]).sort(), TABLES_030);
  assert.deepEqual([...down.matchAll(/DROP FUNCTION IF EXISTS (\w+)\(\)/g)].map(m => m[1]).sort(), FUNCTIONS_030);
  assert.deepEqual([...down.matchAll(/DELETE FROM (\w+) WHERE filename = '([^']+)'/g)].map(m => [m[1], m[2]]), [['schema_migrations', FILE_030]]);
  assert.doesNotMatch(down, /\bCASCADE\b/i, 'no cascade: a dependent object makes the rollback fail instead of vanishing');
});

// ---- PostgreSQL ----
function run(args, env) {
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, args, {cwd: resolve('.'), env, stdio: ['ignore', 'pipe', 'pipe']});
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.once('error', fail);
    child.once('exit', code => (code === 0 ? done(output) : fail(new Error(`migrate exited ${code}\n${output}`))));
  });
}

// The catalog of one schema, independent of its name: columns, constraints, indexes, triggers and functions.
async function fingerprint(client, schema) {
  const q = async (sql) => (await client.query(sql, [schema])).rows.map(row => JSON.stringify(row).split(`${schema}.`).join(''));
  return {
    columns: await q(`SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = $1 AND table_name NOT LIKE 'schema\\_migration%' ORDER BY 1, 2`),
    constraints: await q(`SELECT conrelid::regclass::text AS t, conname, pg_get_constraintdef(oid) AS d FROM pg_constraint WHERE connamespace = $1::regnamespace ORDER BY 1, 2`),
    indexes: await q(`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = $1 ORDER BY 1`),
    triggers: await q(`SELECT tgname, pg_get_triggerdef(t.oid) AS d FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE c.relnamespace = $1::regnamespace AND NOT t.tgisinternal ORDER BY 1`),
    functions: await q(`SELECT proname, md5(prosrc) AS src FROM pg_proc WHERE pronamespace = $1::regnamespace ORDER BY 1`),
  };
}

// Content of every table except the runner's bookkeeping (schema_migrations and the checksum register): one md5 per table over its rows in a stable order.
async function contents(client, schema) {
  const tables = (await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE' AND table_name NOT LIKE 'schema\\_migration%' ORDER BY 1`, [schema])).rows.map(r => r.table_name);
  const out = {};
  for (const table of tables) {
    out[table] = (await client.query(`SELECT count(*)::int AS n, md5(coalesce(string_agg(r::text, '|' ORDER BY r::text), '')) AS h FROM ${schema}.${table} r`)).rows[0];
  }
  return out;
}

async function postgres(t) {
  const pg = (await import('pg')).default;
  const base = new URL(ROOT_URL);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(base.hostname), 'remote PostgreSQL is forbidden');
  assertLocalTestDatabase(ROOT_URL);
  const admin = new pg.Client({connectionString: ROOT_URL, connectionTimeoutMillis: 2000});
  try { await admin.connect(); }
  catch (cause) {
    await admin.end().catch(() => {});
    if (process.env.CI) throw cause;
    t.skip('throwaway postgres unavailable');
    return null;
  }
  const schemas = [];
  const dirs = [];
  const make = async name => {
    const schema = `mig030_${name}_${process.pid}`;
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.query(`CREATE SCHEMA ${schema}`);
    schemas.push(schema);
    const url = new URL(ROOT_URL);
    url.searchParams.set('options', `-c search_path=${schema}`);
    const env = {PATH: process.env.PATH, DATABASE_URL: url.toString(), MATCHPILOT_RUNTIME_MODE: 'test', MATCHPILOT_MIGRATION_TEST_AUTHORIZATION: 'throwaway-schema'};
    const client = new pg.Client({connectionString: url.toString()});
    await client.connect();
    return {schema, env, client, migrate: dir => run(migrateArgs(dir), env)};
  };
  const dir = async (files) => {
    const path = await mkdtemp(join(tmpdir(), 'mp-mig030-'));
    dirs.push(path);
    for (const file of files) await copyFile(file, join(path, file.split('/').at(-1)));
    return path;
  };
  const cleanup = async (...clients) => {
    for (const client of clients) await client.end().catch(() => {});
    for (const schema of schemas) await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {});
    for (const path of dirs) await rm(path, {recursive: true, force: true});
    await admin.end();
  };
  const version = (await admin.query("SELECT current_setting('server_version') AS v")).rows[0].v;
  return {pg, admin, make, dir, cleanup, version, track: path => dirs.push(path)};
}

const applied = async client => (await client.query('SELECT filename FROM schema_migrations ORDER BY filename')).rows.map(r => r.filename);

test('F1 on PostgreSQL: every historical state reaches the same schema; data is untouched; order and idempotency hold', {timeout: 300000}, async t => {
  const env = await postgres(t);
  if (!env) return;
  const {make, dir, cleanup, version} = env;
  t.diagnostic(`PostgreSQL ${version}`);
  const all = (await migrationFiles()).map(file => join(MIGRATIONS_DIR, file));
  const opened = [];
  try {
    // A. Empty database: the runner applies 001..030 in order, then nothing.
    const a = await make('empty');
    opened.push(a.client);
    const outA = await a.migrate(await dir(all));
    const order = [...outA.matchAll(/MIGRATION_APPLIED (\S+)/g)].map(m => m[1]);
    assert.deepEqual(order, all.map(path => path.split('/').at(-1)), 'applied in file order, 030 last');
    assert.equal((await a.migrate(await dir(all))).includes('MIGRATION_APPLIED'), false, 'rerun applies nothing');
    const reference = await fingerprint(a.client, a.schema);
    for (const table of TABLES_030) assert.ok(reference.columns.some(c => c.includes(`"table_name":"${table}"`)), table);

    // 030 alone and 031 alone on an empty schema: neither needs 001-029.
    const alone = await make('alone');
    opened.push(alone.client);
    await alone.migrate(await dir([PATH_030]));
    await alone.migrate(await dir([PATH_030, PATH_031]));
    assert.deepEqual(await applied(alone.client), [FILE_030, '031-apifootball-odds-snapshots.sql']);

    // B. A populated database at 029 (the state of the operational database: 29 rows in schema_migrations).
    const b = await make('populated');
    opened.push(b.client);
    const before030 = await migrationsBefore('030');
    env.track(before030);
    await b.migrate(before030);
    assert.equal((await applied(b.client)).length, 29);
    const {seedQaArchive} = await import('./helpers/fpt-seed.mjs');
    await seedQaArchive(b.client);
    const dataBefore = await contents(b.client, b.schema);
    assert.ok(Object.values(dataBefore).some(row => row.n > 0), 'the database holds data');
    const schemaBefore = await fingerprint(b.client, b.schema);
    const outB = await b.migrate(await dir(all));
    assert.deepEqual([...outB.matchAll(/MIGRATION_APPLIED (\S+)/g)].map(m => m[1]), [FILE_030], 'only 030 is applied');
    const dataAfter = await contents(b.client, b.schema);
    for (const [table, row] of Object.entries(dataBefore)) assert.deepEqual(dataAfter[table], row, `${table} unchanged`);
    for (const table of TABLES_030) assert.deepEqual(dataAfter[table], {n: 0, h: 'd41d8cd98f00b204e9800998ecf8427e'}, `${table} created empty`);
    const schemaAfter = await fingerprint(b.client, b.schema);
    for (const key of Object.keys(schemaBefore)) {
      for (const line of schemaBefore[key]) assert.ok(schemaAfter[key].includes(line), `existing ${key} kept: ${line.slice(0, 120)}`);
    }
    assert.deepEqual(schemaAfter, reference, 'same schema as the database migrated from empty');

    // C. 031 applied before 030 (PR #282 merged first): 030 then applies after 031 and the result is the same schema.
    const c = await make('031first');
    opened.push(c.client);
    await c.migrate(await dir([...all.filter(p => !p.endsWith(FILE_030)), PATH_031]));
    assert.equal((await applied(c.client)).includes(FILE_030), false);
    const outC = await c.migrate(await dir([...all, PATH_031]));
    assert.deepEqual([...outC.matchAll(/MIGRATION_APPLIED (\S+)/g)].map(m => m[1]), [FILE_030], '030 applied after 031');
    const d = await make('030first');
    opened.push(d.client);
    await d.migrate(await dir([...all, PATH_031]));
    assert.deepEqual(await fingerprint(c.client, c.schema), await fingerprint(d.client, d.schema), 'order 031→030 and 030→031 give the same schema');

    // D. 030 run by hand (as the drill of docs/persistence-runbook.md did on a copy), with a row: the runner applies the
    // file again, records it, and changes neither the schema nor the row.
    const e = await make('byhand');
    opened.push(e.client);
    await e.migrate(before030);
    await e.client.query(readFileSync(PATH_030, 'utf8'));
    await e.client.query(`INSERT INTO strategy_definitions(strategy_id, definition, definition_sha256, definition_version) VALUES('def:0123456789abcdef', '{}', $1, 'v1')`, ['0'.repeat(64)]);
    const rowsBefore = await contents(e.client, e.schema);
    const outE = await e.migrate(await dir(all));
    assert.deepEqual([...outE.matchAll(/MIGRATION_APPLIED (\S+)/g)].map(m => m[1]), [FILE_030]);
    assert.deepEqual(await contents(e.client, e.schema), rowsBefore, 'the hand-written row is kept');
    assert.deepEqual(await fingerprint(e.client, e.schema), reference);

    // Rollback: refused while a table holds a row; with empty tables the schema returns to the 029 state exactly.
    await assert.rejects(e.client.query(readFileSync(DOWN_030, 'utf8')), /ROLLBACK_REFUSED: strategy_definitions holds rows/);
    await e.client.query('ROLLBACK').catch(() => {});
    assert.ok((await applied(e.client)).includes(FILE_030), 'a refused rollback changes nothing');
    await b.client.query(readFileSync(DOWN_030, 'utf8'));
    assert.deepEqual(await fingerprint(b.client, b.schema), schemaBefore, 'rolled back to the 029 schema');
    assert.equal((await applied(b.client)).includes(FILE_030), false);
    for (const [table, row] of Object.entries(dataBefore)) assert.deepEqual((await contents(b.client, b.schema))[table], row, `${table} unchanged by the rollback`);
    await b.client.query(readFileSync(DOWN_030, 'utf8')); // idempotent
    const outAgain = await b.migrate(await dir(all));
    assert.deepEqual([...outAgain.matchAll(/MIGRATION_APPLIED (\S+)/g)].map(m => m[1]), [FILE_030], 'after a rollback the runner can apply 030 again');
  } finally {
    await cleanup(...opened);
  }
});

