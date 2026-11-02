// MP-AF-SCHED-01 (#263, #287): scheduler su PostgreSQL reale (CI: PostgreSQL 17; verificato anche su 18 in locale).
// Lo schema staged 032 è applicato a uno schema usa-e-getta solo dal test; migrate() non lo vede.
// Senza FUTPYTHON_TEST_DATABASE_URL i test sono saltati; in CI una connessione fallita è un errore.
// Nessuna rete: fetchOne è sempre finta.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runScheduler, SQL, LOCK_KEY} from '../src/providers/apifootball/scheduler.mjs';

const STAGED = readFileSync(new URL('../db/staged/032-af-scheduler.sql', import.meta.url), 'utf8');
const ON = {MP_AF_SCHEDULER_ENABLED: '1', MP_AF_DAILY_BUDGET: '10', MP_AF_MIN_INTERVAL_MS: '100', MP_AF_RETRY_BASE_MS: '100'};
const today = () => '2026-11-02';
const BIG_DISK = async () => 1e15;
const noWait = {now: () => 0, sleep: async () => {}};

async function withSchema(t, name, body) {
  const rootUrl = process.env.FUTPYTHON_TEST_DATABASE_URL;
  if (!rootUrl) return t.skip('FUTPYTHON_TEST_DATABASE_URL non impostata');
  const pg = (await import('pg')).default;
  const dbUrl = new URL(rootUrl);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(dbUrl.hostname), 'remote PostgreSQL is forbidden');
  const root = new pg.Client({connectionString: rootUrl, connectionTimeoutMillis: 2000});
  try { await root.connect(); }
  catch (cause) {
    await root.end().catch(() => {});
    if (process.env.CI) throw cause;
    return t.skip('throwaway postgres unavailable');
  }
  const schema = `afsched_${name}_${process.pid}`;
  const clients = [];
  try {
    await root.query(`CREATE SCHEMA ${schema}`);
    dbUrl.searchParams.set('options', `-csearch_path=${schema}`);
    const open = async () => {
      const c = new pg.Client({connectionString: dbUrl.toString()});
      c.on('error', () => {}); // una sessione terminata di proposito non deve far cadere il processo di test
      await c.connect(); clients.push(c); return c;
    };
    const db = await open();
    await db.query(STAGED);
    await db.query(STAGED); // idempotente
    await body({db, open, root, schema});
  } finally {
    for (const c of clients) await c.end().catch(() => {});
    await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await root.end();
  }
}
const run = (client, opts) => runScheduler({client, env: ON, today, freeDiskBytes: BIG_DISK, ...noWait, ...opts});
const code = async (promise) => { try { await promise; return 'OK'; } catch (e) { return e.code; } };
const advisoryHeld = async (root) => Number((await root.query(
  "SELECT count(*)::int AS n FROM pg_locks WHERE locktype='advisory' AND classid=0 AND objid=$1 AND objsubid=1 AND granted", [LOCK_KEY])).rows[0].n);

test('PG schema 032: un solo RUNNING (indice unico) e vincoli di integrità', {timeout: 60000}, async (t) => {
  await withSchema(t, 'schema', async ({db}) => {
    await db.query("INSERT INTO af_scheduler_runs(status, host, pid) VALUES ('RUNNING', 'h', 1)");
    assert.equal(await code(db.query("INSERT INTO af_scheduler_runs(status, host, pid) VALUES ('RUNNING', 'h', 2)")), '23505');
    assert.equal(await code(db.query("INSERT INTO af_scheduler_runs(status, host, pid) VALUES ('DONE', 'h', 2)")), '23514', 'DONE senza finished_at');
    assert.equal(await code(db.query("INSERT INTO af_scheduler_runs(status, host, pid, finished_at) VALUES ('DONE', 'h', 2, now())")), '23514', 'DONE senza motivo');
    assert.equal(await code(db.query("INSERT INTO af_scheduler_runs(status, host, pid, finished_at, reason_code, requests, tasks_done) VALUES ('DONE', 'h', 2, now(), 'X', 1, 2)")), '23514');
    assert.equal(await code(db.query("INSERT INTO af_scheduler_budget(day, daily_limit, used) VALUES ('2026-11-02', 2, 3)")), '23514');
    assert.equal(await code(db.query("INSERT INTO af_scheduler_budget(day, daily_limit, used) VALUES ('2026-11-02', 0, 0)")), '23514');
    assert.equal(await code(db.query("INSERT INTO af_scheduler_events(run_id, task_key, decision, reason_code) VALUES (999, 'a', 'DONE', 'OK')")), '23503');
    assert.equal(await code(db.query("INSERT INTO af_scheduler_done(day, task_key, run_id) VALUES ('2026-11-02', '', 1)")), '23514');
  });
});

test('PG due istanze concorrenti: una sola esegue, l\'altra è BUSY; nessun job duplicato', {timeout: 60000}, async (t) => {
  await withSchema(t, 'busy', async ({open, root, db}) => {
    const [a, b] = [await open(), await open()];
    let release; const gate = new Promise((r) => { release = r; });
    let calls = 0;
    const fetchOne = async () => { calls++; await gate; };
    const pa = run(a, {tasks: ['t1', 't2'], fetchOne, host: 'A'});
    const pb = run(b, {tasks: ['t1', 't2'], fetchOne, host: 'B'});
    const first = await Promise.race([pa, pb]);
    assert.deepEqual([first.status, first.code], ['BUSY', 'LOCK_HELD']);
    assert.equal(await advisoryHeld(root), 1);
    release();
    const results = (await Promise.all([pa, pb])).map((r) => r.status).sort();
    assert.deepEqual(results, ['BUSY', 'DONE']);
    assert.equal(calls, 2);
    assert.equal(await advisoryHeld(root), 0);
    const runs = (await db.query('SELECT status, requests, tasks_done FROM af_scheduler_runs')).rows;
    assert.deepEqual(runs, [{status: 'DONE', requests: 2, tasks_done: 2}], 'un solo run, nessun job duplicato');
    // Sei avvii simultanei: esattamente uno esegue.
    const many = await Promise.all([...Array(6)].map(async () => run(await open(), {tasks: ['t3'], fetchOne: async () => { calls++; }})));
    assert.equal(many.filter((r) => r.status === 'DONE').length + many.filter((r) => r.status === 'BUSY').length, 6);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM af_scheduler_done WHERE task_key='t3'")).rows[0].n, 1);
    assert.equal(calls, 3, 't3 eseguito una sola volta');
  });
});

test('PG lock rilasciato dopo errore ed eccezione; la sessione resta riutilizzabile', {timeout: 60000}, async (t) => {
  await withSchema(t, 'unlock', async ({open, root, db}) => {
    const a = await open();
    const r1 = await run(a, {tasks: ['a'], fetchOne: async () => { throw new TypeError('bug'); }});
    assert.deepEqual([r1.status, r1.code], ['FAILED', 'PROVIDER_FATAL']);
    assert.equal(await advisoryHeld(root), 0);
    // Eccezione del database a metà run (tabella eventi rimossa da un altro attore): FAILED, lock rilasciato.
    await db.query('ALTER TABLE af_scheduler_events RENAME TO af_scheduler_events_x');
    const r2 = await run(a, {tasks: ['b'], fetchOne: async () => {}});
    assert.deepEqual([r2.status, r2.code], ['FAILED', 'INTERNAL_ERROR']);
    assert.equal(await advisoryHeld(root), 0);
    await db.query('ALTER TABLE af_scheduler_events_x RENAME TO af_scheduler_events');
    const b = await open();
    assert.equal((await run(b, {tasks: ['c'], fetchOne: async () => {}})).status, 'DONE');
    assert.deepEqual((await db.query('SELECT status, reason_code FROM af_scheduler_runs ORDER BY id')).rows.map((r) => `${r.status}/${r.reason_code}`),
      ['FAILED/PROVIDER_FATAL', 'FAILED/INTERNAL_ERROR', 'DONE/COMPLETED']);
  });
});

test('PG budget atomico: richieste concorrenti da molte sessioni non superano mai il limite', {timeout: 60000}, async (t) => {
  await withSchema(t, 'budget', async ({open, db}) => {
    const sessions = await Promise.all([...Array(10)].map(() => open()));
    const results = await Promise.all(sessions.flatMap((s) => [...Array(8)].map(() => s.query(SQL.reserve, ['2026-11-02', 25]))));
    assert.equal(results.filter((r) => r.rows.length === 1).length, 25);
    assert.deepEqual(results.filter((r) => r.rows.length).map((r) => r.rows[0].used).sort((x, y) => x - y), [...Array(25)].map((_, i) => i + 1));
    assert.deepEqual((await db.query('SELECT daily_limit, used FROM af_scheduler_budget')).rows, [{daily_limit: 25, used: 25}]);
    // Limite abbassato sotto l'uso: nessuna riserva; alzato: riparte fino al nuovo limite.
    assert.equal((await db.query(SQL.reserve, ['2026-11-02', 20])).rows.length, 0);
    assert.equal((await db.query(SQL.reserve, ['2026-11-02', 26])).rows[0].used, 26);
  });
});

test('PG crash simulato (sessione terminata) -> RUNNING orfano recuperato come ABORTED; il riavvio non ripete i task', {timeout: 60000}, async (t) => {
  await withSchema(t, 'crash', async ({open, root, db}) => {
    const a = await open();
    const apid = (await a.query('SELECT pg_backend_pid() AS p')).rows[0].p;
    let reached; const atSecond = new Promise((r) => { reached = r; });
    let release; const gate = new Promise((r) => { release = r; });
    const seen = [];
    const pa = run(a, {tasks: ['t1', 't2', 't3'], fetchOne: async (task) => { seen.push(task); if (task === 't2') { reached(); await gate; } }});
    await atSecond;
    assert.equal(await advisoryHeld(root), 1);
    await root.query('SELECT pg_terminate_backend($1)', [apid]);
    for (let i = 0; i < 50 && await advisoryHeld(root); i++) await new Promise((r) => setTimeout(r, 100));
    assert.equal(await advisoryHeld(root), 0, 'PostgreSQL rilascia il lock della sessione morta');
    release();
    const ra = await pa;
    assert.equal(ra.status, 'FAILED', 'il processo in crash non scrive più nulla');
    assert.deepEqual((await db.query('SELECT status FROM af_scheduler_runs')).rows, [{status: 'RUNNING'}], 'RUNNING orfano');
    // Riavvio: recupero, deduplica di t1 (già fatto), t2 rifatto (la conferma non era stata scritta), t3 nuovo.
    const b = await open();
    const rb = await run(b, {tasks: ['t1', 't2', 't3'], fetchOne: async (task) => { seen.push(task); }});
    assert.deepEqual([rb.status, rb.requests, rb.done], ['DONE', 2, 2]);
    assert.deepEqual(seen, ['t1', 't2', 't2', 't3']);
    assert.deepEqual((await db.query('SELECT status, reason_code FROM af_scheduler_runs ORDER BY id')).rows,
      [{status: 'ABORTED', reason_code: 'CRASH_RECOVERED'}, {status: 'DONE', reason_code: 'COMPLETED'}]);
    // Integrità: ogni tentativo è nel budget (anche quelli del run interrotto), nessuna chiave fatta due volte.
    assert.equal((await db.query('SELECT used FROM af_scheduler_budget')).rows[0].used, 4);
    assert.deepEqual((await db.query('SELECT task_key FROM af_scheduler_done ORDER BY task_key')).rows.map((r) => r.task_key), ['t1', 't2', 't3']);
  });
});

test('PG decisioni persistite: retry, salto 4xx, duplicato, stop per budget; budget = somma dei tentativi', {timeout: 60000}, async (t) => {
  await withSchema(t, 'events', async ({open, db}) => {
    const a = await open();
    let n = 0;
    const r = await run(a, {env: {...ON, MP_AF_DAILY_BUDGET: '5'}, tasks: ['a', 'b', 'a', 'c', 'd', 'e'], fetchOne: async (task) => {
      n += 1;
      if (task === 'a' && n === 1) throw Object.assign(new Error('x'), {code: 'HTTP_ERROR', status: 503});
      if (task === 'b') throw Object.assign(new Error('x'), {code: 'HTTP_ERROR', status: 404});
    }});
    assert.deepEqual([r.status, r.code, r.requests, r.done], ['STOPPED', 'BUDGET_EXHAUSTED', 5, 3]);
    assert.deepEqual((await db.query('SELECT task_key, decision, reason_code, detail FROM af_scheduler_events ORDER BY id')).rows.map((e) => Object.values(e).join('/')), [
      'a/RETRY/TRANSIENT/HTTP_ERROR HTTP 503', 'a/DONE/OK/tentativi 2', 'b/SKIPPED/CLIENT_ERROR/HTTP_ERROR HTTP 404',
      'a/SKIPPED/DUPLICATE_IN_RUN/', 'c/DONE/OK/', 'd/DONE/OK/']);
    const run1 = (await db.query('SELECT status, reason_code, note, requests, tasks_done FROM af_scheduler_runs')).rows[0];
    assert.deepEqual(run1, {status: 'STOPPED', reason_code: 'BUDGET_EXHAUSTED', note: 'budget giornaliero esaurito', requests: 5, tasks_done: 3});
    const sums = (await db.query('SELECT (SELECT sum(requests) FROM af_scheduler_runs)::int AS req, (SELECT sum(used) FROM af_scheduler_budget)::int AS used')).rows[0];
    assert.equal(sums.req, sums.used);
  });
});

test('PG spazio: disco reale sotto soglia, percorso illeggibile e tetto di af_odds_snapshots fermano prima di ogni richiesta', {timeout: 60000}, async (t) => {
  await withSchema(t, 'disk', async ({open, db}) => {
    const a = await open(); let calls = 0;
    const f = async () => { calls++; };
    const real = (env) => runScheduler({client: a, env: {...ON, ...env}, today, ...noWait, tasks: ['x'], fetchOne: f});
    const low = await real({MP_AF_MIN_FREE_DISK_MB: '10000000'}); // 10 TB: sempre sotto soglia
    assert.deepEqual([low.status, low.code], ['STOPPED', 'DISK_LOW']);
    assert.match(low.note, /^spazio libero \d+ MB sotto la soglia 10000000 MB$/);
    assert.deepEqual([(await real({MP_AF_DISK_PATH: '/percorso/inesistente'})).code], ['DISK_CHECK_FAILED']);
    assert.equal((await real({MP_AF_MIN_FREE_DISK_MB: '1'})).status, 'DONE', 'sopra soglia si procede');
    await db.query('CREATE TABLE af_odds_snapshots (payload text)');
    await db.query("INSERT INTO af_odds_snapshots SELECT md5(i::text) || repeat('x', 1000) FROM generate_series(1, 3000) i");
    const cap = await runScheduler({client: a, env: {...ON, MP_AF_MAX_ODDS_TABLE_MB: '1'}, today, ...noWait, freeDiskBytes: BIG_DISK, tasks: ['y'], fetchOne: f});
    assert.deepEqual([cap.status, cap.code], ['STOPPED', 'TABLE_CAP']);
    assert.equal(calls, 1);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM af_odds_snapshots')).rows[0].n, 3000, 'nessuna cancellazione automatica');
  });
});
