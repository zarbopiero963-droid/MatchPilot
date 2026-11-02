// MP-AF-SCHED-01 (#263, #287): logica dello scheduler su un PostgreSQL finto in memoria.
// Il comportamento reale (advisory lock, upsert concorrente, crash della sessione) è in af-scheduler-postgres.test.mjs.
// Nessuna rete: fetchOne è sempre finta.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import {runScheduler, schedulerConfig, installStopHandlers, classifyError, SQL, LIMITS} from '../src/providers/apifootball/scheduler.mjs';

function fakeDb() {
  const st = {lock: null, budget: new Map(), runs: [], done: new Map(), events: [], tableBytes: 0, queries: 0, failOn: null};
  const session = (name) => ({async query(sql, p = []) {
    st.queries += 1;
    if (st.failOn && st.failOn === sql) throw new Error('connessione persa');
    if (sql === SQL.tryLock) { if (st.lock && st.lock !== name) return {rows: [{ok: false}]}; st.lock = name; return {rows: [{ok: true}]}; }
    if (sql === SQL.unlock) { if (st.lock === name) st.lock = null; return {rows: [{ok: true}]}; }
    if (sql === SQL.recover) { const r = st.runs.filter((x) => x.status === 'RUNNING'); r.forEach((x) => { x.status = 'ABORTED'; x.reason_code = 'CRASH_RECOVERED'; }); return {rows: r}; }
    if (sql === SQL.start) { const r = {id: st.runs.length + 1, status: 'RUNNING'}; st.runs.push(r); return {rows: [r]}; }
    if (sql === SQL.reserve) { const b = st.budget.get(p[0]) ?? {used: 0}; if (b.used >= p[1]) return {rows: []}; b.used += 1; b.limit = p[1]; st.budget.set(p[0], b); return {rows: [{used: b.used}]}; }
    if (sql === SQL.isDone) return {rows: st.done.has(`${p[0]}|${p[1]}`) ? [{done: 1}] : []};
    if (sql === SQL.markDone) { st.done.set(`${p[0]}|${p[1]}`, p[2]); return {rows: []}; }
    if (sql === SQL.event) { st.events.push({run: p[0], key: p[1], decision: p[2], reason: p[3], detail: p[4]}); return {rows: []}; }
    if (sql === SQL.tableBytes) return {rows: [{bytes: String(st.tableBytes)}]};
    if (sql === SQL.finish) { const r = st.runs.find((x) => x.id === p[0]); Object.assign(r, {status: p[1], requests: p[2], done: p[3], reason_code: p[4], note: p[5]}); return {rows: []}; }
    throw new Error('sql inattesa');
  }});
  return {st, session};
}
const ON = {MP_AF_SCHEDULER_ENABLED: '1', MP_AF_DAILY_BUDGET: '3', MP_AF_MIN_INTERVAL_MS: '100', MP_AF_RETRY_BASE_MS: '100'};
const today = () => '2026-11-02';
const BIG_DISK = async () => 1e15;
// Orologio finto: sleep avanza il tempo senza aspettare.
function clock() { const c = {t: 1_000_000, sleeps: []}; c.now = () => c.t; c.sleep = async (ms) => { c.sleeps.push(ms); c.t += ms; }; return c; }
const run = (db, opts) => { const c = opts.clock ?? clock(); return runScheduler({client: db.session(opts.name ?? 'a'), env: ON, today, freeDiskBytes: BIG_DISK, now: c.now, sleep: c.sleep, ...opts}); };
const httpErr = (status, code = 'HTTP_ERROR') => Object.assign(new Error(`HTTP ${status}`), {status, code});

test('OFF per default: ogni combinazione mancante o non valida resta DISABLED senza toccare il database', async () => {
  const cases = [
    {}, {MP_AF_DAILY_BUDGET: '100'},
    {MP_AF_SCHEDULER_ENABLED: '1'}, {MP_AF_SCHEDULER_ENABLED: '1', MP_AF_DAILY_BUDGET: ''},
    {MP_AF_SCHEDULER_ENABLED: 'true', MP_AF_DAILY_BUDGET: '5'}, {MP_AF_SCHEDULER_ENABLED: 'yes', MP_AF_DAILY_BUDGET: '5'},
    {MP_AF_SCHEDULER_ENABLED: ' 1', MP_AF_DAILY_BUDGET: '5'}, {MP_AF_SCHEDULER_ENABLED: '0', MP_AF_DAILY_BUDGET: '5'},
    {MP_AF_SCHEDULER_ENABLED: 1, MP_AF_DAILY_BUDGET: '5'},
    ...['0', '-1', 'abc', '5abc', '1e3', '2.5', ' 5', '5 ', '0x10', '100001', 'Infinity', 'NaN', '٣'].map((b) => ({MP_AF_SCHEDULER_ENABLED: '1', MP_AF_DAILY_BUDGET: b})),
    {...ON, MP_AF_DAILY_BUDGET: 5},
    ...Object.entries(LIMITS).filter(([n]) => n !== 'MP_AF_DAILY_BUDGET').flatMap(([n, s]) => [
      {...ON, [n]: 'x'}, {...ON, [n]: String(s.max + 1)}, ...(s.min > 0 ? [{...ON, [n]: String(s.min - 1)}] : []), {...ON, [n]: '-1'}]),
    {...ON, MP_AF_DISK_PATH: 'relativo'}, {...ON, MP_AF_DISK_PATH: '/a\0b'},
  ];
  for (const env of cases) {
    const cfg = schedulerConfig(env);
    assert.equal(cfg.enabled, false, JSON.stringify(env));
    assert.match(cfg.code, /^(DISABLED_DEFAULT|CONFIG_INVALID)$/);
    const db = fakeDb(); let calls = 0;
    const r = await runScheduler({client: db.session('a'), env, tasks: ['t1'], fetchOne: async () => { calls++; }});
    assert.equal(r.status, 'DISABLED', JSON.stringify(env));
    assert.equal(calls, 0); assert.equal(db.st.queries, 0, 'da disattivato nessuna query');
  }
  assert.equal(schedulerConfig().code, 'DISABLED_DEFAULT');
  assert.equal(schedulerConfig({MP_AF_SCHEDULER_ENABLED: '1'}).reason, 'MP_AF_DAILY_BUDGET mancante');
  // Con ENABLED=1 e budget valido i default sono quelli documentati.
  assert.deepEqual(schedulerConfig({MP_AF_SCHEDULER_ENABLED: '1', MP_AF_DAILY_BUDGET: '7'}), {enabled: true, dailyLimit: 7, maxPerRun: null,
    minIntervalMs: 1000, timeoutMs: 15000, maxRetries: 2, retryBaseMs: 2000, minFreeDiskBytes: 8192 * 1048576, maxOddsTableBytes: 5120 * 1048576, diskPath: '/'});
});

test('il codice dello scheduler non contiene rete né cancellazioni', () => {
  const src = readFileSync(new URL('../src/providers/apifootball/scheduler.mjs', import.meta.url), 'utf8');
  const sql = readFileSync(new URL('../db/staged/032-af-scheduler.sql', import.meta.url), 'utf8');
  for (const text of [src, sql]) {
    const code = text.split('\n').filter((l) => !/^\s*(\/\/|--)/.test(l)).join('\n');
    assert.doesNotMatch(code, /\b(DELETE|DROP|TRUNCATE)\b/i);
  }
  assert.doesNotMatch(src, /\bfetch\(|node:https?|node:net|api-sports|api-football\.com/);
});

test('rifiuta pool, task senza chiave e fetchOne mancante prima di prendere il lock', async () => {
  const db = fakeDb();
  const pool = {query: async () => ({rows: []}), totalCount: 0, idleCount: 0};
  assert.equal((await runScheduler({client: pool, env: ON, tasks: ['a'], fetchOne: async () => {}})).code, 'CLIENT_NOT_SESSION');
  for (const tasks of [[1], [{}], ['con spazio'], ['x'.repeat(201)], 'a', null]) {
    assert.equal((await run(db, {tasks, fetchOne: async () => {}})).code, 'TASKS_INVALID');
  }
  assert.equal((await run(db, {tasks: ['a']})).code, 'TASKS_INVALID');
  assert.equal(db.st.lock, null); assert.equal(db.st.runs.length, 0);
});

test('un solo esecutore: la seconda sessione trova il lock occupato', async () => {
  const db = fakeDb(); let release; const gate = new Promise((r) => { release = r; });
  const first = run(db, {tasks: ['t1'], fetchOne: () => gate});
  await new Promise((r) => setImmediate(r));
  let calls = 0;
  const second = await run(db, {name: 'b', tasks: ['t1'], fetchOne: async () => { calls++; }});
  assert.deepEqual([second.status, second.code], ['BUSY', 'LOCK_HELD']); assert.equal(calls, 0);
  release(); assert.equal((await first).status, 'DONE'); assert.equal(db.st.lock, null);
});

test('budget persistente condiviso tra esecuzioni; budget abbassato ha effetto subito', async () => {
  const db = fakeDb(); let calls = 0; const f = async () => { calls++; };
  assert.equal((await run(db, {tasks: ['a', 'b'], fetchOne: f})).requests, 2);
  const r = await run(db, {name: 'b', tasks: ['c', 'd', 'e'], fetchOne: f});
  assert.deepEqual([r.status, r.code, r.requests, r.done], ['STOPPED', 'BUDGET_EXHAUSTED', 1, 1]); assert.equal(calls, 3);
  const low = await run(db, {tasks: ['f'], fetchOne: f, env: {...ON, MP_AF_DAILY_BUDGET: '1'}});
  assert.deepEqual([low.code, low.requests], ['BUDGET_EXHAUSTED', 0]); assert.equal(calls, 3);
  assert.equal(db.st.runs.at(-1).reason_code, 'BUDGET_EXHAUSTED');
});

test('quota per esecuzione configurabile', async () => {
  const db = fakeDb(); let calls = 0;
  const r = await run(db, {tasks: ['a', 'b', 'c'], fetchOne: async () => { calls++; }, env: {...ON, MP_AF_DAILY_BUDGET: '50', MP_AF_MAX_REQUESTS_PER_RUN: '2'}});
  assert.deepEqual([r.status, r.code, r.requests, calls], ['STOPPED', 'RUN_QUOTA', 2, 2]);
});

test('deduplica: chiave ripetuta nello stesso run e task già completato oggi non costano richieste', async () => {
  const db = fakeDb(); const seen = [];
  const f = async (t) => { seen.push(t); };
  const env = {...ON, MP_AF_DAILY_BUDGET: '20'};
  await run(db, {tasks: ['a', 'b', 'a', {key: 'b'}], fetchOne: f, env});
  assert.deepEqual(seen, ['a', 'b']);
  assert.deepEqual(db.st.events.filter((e) => e.decision === 'SKIPPED').map((e) => [e.key, e.reason]), [['a', 'DUPLICATE_IN_RUN'], ['b', 'DUPLICATE_IN_RUN']]);
  const r = await run(db, {tasks: ['a', 'b', 'c'], fetchOne: f, env});
  assert.deepEqual(seen, ['a', 'b', 'c']); assert.equal(r.requests, 1);
  assert.equal(db.st.events.filter((e) => e.reason === 'ALREADY_DONE_TODAY').length, 2);
  assert.equal(db.st.budget.get('2026-11-02').used, 3);
  // Un altro giorno UTC la stessa chiave si esegue di nuovo.
  await run(db, {tasks: ['a'], fetchOne: f, env, today: () => '2026-11-03'});
  assert.deepEqual(seen, ['a', 'b', 'c', 'a']);
});

test('rate limiting: distanza minima tra due tentativi, retry compresi', async () => {
  const db = fakeDb(); const c = clock(); const at = [];
  let n = 0;
  await run(db, {clock: c, env: {...ON, MP_AF_DAILY_BUDGET: '20', MP_AF_MIN_INTERVAL_MS: '1500', MP_AF_RETRY_BASE_MS: '100'},
    tasks: ['a', 'b', 'c'], fetchOne: async () => { at.push(c.t); if (++n === 2) throw httpErr(503); }});
  assert.equal(at.length, 4);
  for (let i = 1; i < at.length; i++) assert.ok(at[i] - at[i - 1] >= 1500, `gap ${at[i] - at[i - 1]}`);
});

test('retry limitato con backoff esponenziale solo su errori transitori; ogni tentativo è nel budget', async () => {
  const db = fakeDb(); const c = clock(); let calls = 0;
  const r = await run(db, {clock: c, env: {...ON, MP_AF_DAILY_BUDGET: '20', MP_AF_MAX_RETRIES: '3', MP_AF_RETRY_BASE_MS: '1000'},
    tasks: ['a', 'b'], fetchOne: async () => { calls++; throw httpErr(502); }});
  assert.deepEqual([r.status, r.code, r.requests, calls], ['FAILED', 'PROVIDER_UNAVAILABLE', 4, 4], 'stop dopo 1 + 3 tentativi, il task b non parte');
  assert.deepEqual(c.sleeps.filter((ms) => ms >= 1000).slice(0, 3), [1000, 2000, 4000]);
  assert.equal(db.st.budget.get('2026-11-02').used, 4);
  assert.deepEqual(db.st.events.map((e) => [e.decision, e.detail]), [['RETRY', 'HTTP_ERROR HTTP 502'], ['RETRY', 'HTTP_ERROR HTTP 502'], ['RETRY', 'HTTP_ERROR HTTP 502']]);
  // Recupero al secondo tentativo.
  const db2 = fakeDb(); let k = 0;
  const ok = await run(db2, {tasks: ['a'], fetchOne: async () => { if (++k === 1) throw Object.assign(new Error('x'), {code: 'ECONNRESET'}); }});
  assert.deepEqual([ok.status, ok.requests, ok.done], ['DONE', 2, 1]);
  assert.deepEqual(db2.st.events.map((e) => e.decision), ['RETRY', 'DONE']);
});

test('nessun retry su 4xx, quota o errori sconosciuti', async () => {
  for (const [err, expect] of [
    [httpErr(404), ['DONE', 'COMPLETED', 'CLIENT_ERROR']],
    [Object.assign(new Error('p'), {code: 'PARAM_INVALID'}), ['DONE', 'COMPLETED', 'CLIENT_ERROR']],
    [Object.assign(new Error('p'), {code: 'PROVIDER_ERROR', provider_error_names: ['bet']}), ['DONE', 'COMPLETED', 'CLIENT_ERROR']],
    [httpErr(429, 'RATE_LIMITED'), ['STOPPED', 'PROVIDER_QUOTA']],
    [Object.assign(new Error('q'), {code: 'PROVIDER_QUOTA'}), ['STOPPED', 'PROVIDER_QUOTA']],
    [Object.assign(new Error('q'), {code: 'BUDGET_DAY'}), ['STOPPED', 'PROVIDER_QUOTA']],
    [Object.assign(new Error('q'), {code: 'PROVIDER_ERROR', provider_error_names: ['requests']}), ['STOPPED', 'PROVIDER_QUOTA']],
    [httpErr(401), ['FAILED', 'PROVIDER_FATAL']],
    [httpErr(403), ['FAILED', 'PROVIDER_FATAL']],
    [Object.assign(new Error('l'), {code: 'LEDGER_UNAVAILABLE'}), ['FAILED', 'PROVIDER_FATAL']],
    [new TypeError('bug'), ['FAILED', 'PROVIDER_FATAL']],
  ]) {
    const db = fakeDb(); let calls = 0;
    const r = await run(db, {env: {...ON, MP_AF_MAX_RETRIES: '5'}, tasks: ['a'], fetchOne: async () => { calls++; throw err; }});
    assert.equal(calls, 1, `${err.code ?? err.name} non ritentato`);
    assert.deepEqual([r.status, r.code], expect.slice(0, 2), String(err.code ?? err.name));
    if (expect[2]) assert.equal(db.st.events[0].reason, expect[2]);
    assert.equal(db.st.lock, null);
  }
  // Dopo un 4xx il task successivo procede.
  const db = fakeDb(); const seen = [];
  const r = await run(db, {tasks: ['a', 'b'], fetchOne: async (t) => { seen.push(t); if (t === 'a') throw httpErr(400); }});
  assert.deepEqual([r.status, r.done, seen], ['DONE', 1, ['a', 'b']]);
  assert.equal(classifyError({name: 'AbortError'}), 'transient');
  assert.equal(classifyError({code: 'TIMEOUT'}), 'transient');
  assert.equal(classifyError(undefined), 'fatal');
});

test('timeout per richiesta: la richiesta è annullata e ritentata come transitoria', async () => {
  const db = fakeDb(); const signals = [];
  const started = Date.now();
  const r = await runScheduler({client: db.session('a'), today, freeDiskBytes: BIG_DISK, tasks: ['a'],
    env: {...ON, MP_AF_REQUEST_TIMEOUT_MS: '1000', MP_AF_MAX_RETRIES: '1'},
    fetchOne: (_t, {signal}) => { signals.push(signal); return new Promise(() => {}); }});
  assert.deepEqual([r.status, r.code, r.requests], ['FAILED', 'PROVIDER_UNAVAILABLE', 2]);
  assert.ok(signals.every((s) => s.aborted), 'ogni tentativo scaduto è annullato');
  assert.ok(Date.now() - started >= 2000);
  assert.equal(db.st.events[0].detail, 'TIMEOUT');
});

test('spazio disco e tetto della tabella quote: sotto soglia STOPPED con motivo, nessuna richiesta', async () => {
  const MBy = 1048576;
  for (const [opts, code] of [
    [{freeDiskBytes: async () => 100 * MBy, env: {...ON, MP_AF_MIN_FREE_DISK_MB: '101'}}, 'DISK_LOW'],
    [{freeDiskBytes: async () => { throw Object.assign(new Error('x'), {code: 'ENOENT'}); }}, 'DISK_CHECK_FAILED'],
    [{freeDiskBytes: async () => NaN}, 'DISK_CHECK_FAILED'],
    [{freeDiskBytes: async () => undefined}, 'DISK_CHECK_FAILED'],
  ]) {
    const db = fakeDb(); let calls = 0;
    const r = await run(db, {tasks: ['a'], fetchOne: async () => { calls++; }, ...opts});
    assert.deepEqual([r.status, r.code, calls], ['STOPPED', code, 0]);
    assert.equal(db.st.runs[0].reason_code, code); assert.equal(db.st.budget.size, 0);
  }
  const db = fakeDb(); db.st.tableBytes = 3 * MBy; let calls = 0;
  const r = await run(db, {tasks: ['a'], fetchOne: async () => { calls++; }, env: {...ON, MP_AF_MAX_ODDS_TABLE_MB: '2'}});
  assert.deepEqual([r.status, r.code, calls], ['STOPPED', 'TABLE_CAP', 0]);
  // Il controllo è ripetuto prima di ogni task: lo spazio che finisce a metà ferma il run.
  const db2 = fakeDb(); let free = 10_000 * MBy; let n = 0;
  const r2 = await run(db2, {tasks: ['a', 'b', 'c'], env: {...ON, MP_AF_MIN_FREE_DISK_MB: '9000'}, freeDiskBytes: async () => free,
    fetchOne: async () => { n++; free = 8000 * MBy; }});
  assert.deepEqual([r2.code, n, r2.note], ['DISK_LOW', 1, 'spazio libero 8000 MB sotto la soglia 9000 MB']);
});

test('arresto sicuro su SIGTERM tra due richieste e lock rilasciato', async () => {
  const db = fakeDb(); const stop = {stopped: false}; const proc = new EventEmitter();
  const off = installStopHandlers(proc, stop);
  const r = await run(db, {tasks: ['a', 'b', 'c'], stopSignal: stop, fetchOne: async () => { proc.emit('SIGTERM'); }});
  off();
  assert.deepEqual([r.status, r.code, r.requests], ['STOPPED', 'STOP_REQUESTED', 1]); assert.equal(db.st.lock, null);
  assert.equal(proc.listenerCount('SIGTERM'), 0);
});

test('fail-closed: errore del database o del budget ferma tutto, registra FAILED e rilascia il lock', async () => {
  for (const sql of [SQL.reserve, SQL.isDone, SQL.markDone, SQL.event, SQL.tableBytes]) {
    const db = fakeDb(); db.st.failOn = sql; let calls = 0;
    const r = await run(db, {tasks: ['a', 'a', 'b'], fetchOne: async () => { calls++; }});
    assert.deepEqual([r.status, r.code], ['FAILED', 'INTERNAL_ERROR'], sql.slice(0, 30));
    assert.ok(calls <= 1); assert.equal(db.st.lock, null);
  }
  // Se anche la chiusura del run fallisce, il lock si rilascia comunque e il RUNNING resta da recuperare.
  const db = fakeDb(); db.st.failOn = SQL.finish; const logs = [];
  const r = await run(db, {tasks: ['a'], fetchOne: async () => {}, log: (e) => logs.push(e.event)});
  assert.equal(r.status, 'DONE'); assert.equal(db.st.lock, null); assert.ok(logs.includes('af.scheduler.finish_failed'));
  assert.equal(db.st.runs[0].status, 'RUNNING');
  db.st.failOn = null;
  await run(db, {tasks: ['b'], fetchOne: async () => {}});
  assert.equal(db.st.runs[0].status, 'ABORTED');
});

test('errore: FAILED registrato, lock rilasciato; crash precedente recuperato come ABORTED', async () => {
  const db = fakeDb(); db.st.runs.push({id: 1, status: 'RUNNING'});
  const r = await run(db, {tasks: ['a'], fetchOne: async () => { throw new Error('boom'); }});
  assert.equal(r.status, 'FAILED'); assert.equal(db.st.runs[0].status, 'ABORTED'); assert.equal(db.st.runs[1].status, 'FAILED');
  assert.equal(db.st.lock, null);
});
