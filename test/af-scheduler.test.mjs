import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {runScheduler, schedulerConfig, installStopHandlers, SQL} from '../src/providers/apifootball/scheduler.mjs';

// Finto PostgreSQL in memoria: advisory lock condiviso tra sessioni, budget, registro esecuzioni.
function fakeDb() {
  const st = {lock: null, budget: new Map(), runs: []};
  const session = (name) => ({async query(sql, p = []) {
    if (sql === SQL.tryLock) { if (st.lock && st.lock !== name) return {rows: [{ok: false}]}; st.lock = name; return {rows: [{ok: true}]}; }
    if (sql === SQL.unlock) { if (st.lock === name) st.lock = null; return {rows: [{ok: true}]}; }
    if (sql === SQL.recover) { const r = st.runs.filter((x) => x.status === 'RUNNING'); r.forEach((x) => { x.status = 'ABORTED'; }); return {rows: r}; }
    if (sql === SQL.start) { const r = {id: st.runs.length + 1, status: 'RUNNING'}; st.runs.push(r); return {rows: [r]}; }
    if (sql === SQL.reserve) { const b = st.budget.get(p[0]) ?? {limit: p[1], used: 0}; if (b.used >= b.limit) return {rows: []}; b.used += 1; st.budget.set(p[0], b); return {rows: [{used: b.used}]}; }
    if (sql === SQL.finish) { const r = st.runs.find((x) => x.id === p[0]); Object.assign(r, {status: p[1], requests: p[2], note: p[3]}); return {rows: []}; }
    throw new Error('sql inattesa');
  }});
  return {st, session};
}
const ON = {MP_AF_SCHEDULER_ENABLED: '1', MP_AF_DAILY_BUDGET: '3'};
const today = () => '2026-11-02';

test('disattivato per default e senza budget esplicito; nessuna richiesta', async () => {
  assert.equal(schedulerConfig({}).enabled, false);
  assert.equal(schedulerConfig({MP_AF_SCHEDULER_ENABLED: '1'}).enabled, false);
  assert.equal(schedulerConfig({MP_AF_SCHEDULER_ENABLED: 'true', MP_AF_DAILY_BUDGET: '5'}).enabled, false);
  const db = fakeDb(); let calls = 0;
  const r = await runScheduler({client: db.session('a'), env: {}, tasks: [1, 2], fetchOne: async () => { calls++; }});
  assert.equal(r.status, 'DISABLED'); assert.equal(calls, 0); assert.equal(db.st.lock, null);
});

test('un solo esecutore: la seconda sessione trova il lock occupato', async () => {
  const db = fakeDb(); let release; const gate = new Promise((r) => { release = r; });
  const first = runScheduler({client: db.session('a'), env: ON, tasks: [1], fetchOne: () => gate, today});
  await new Promise((r) => setImmediate(r));
  let calls = 0;
  const second = await runScheduler({client: db.session('b'), env: ON, tasks: [1], fetchOne: async () => { calls++; }, today});
  assert.equal(second.status, 'BUSY'); assert.equal(calls, 0);
  release(); assert.equal((await first).status, 'DONE'); assert.equal(db.st.lock, null);
});

test('budget persistente condiviso tra esecuzioni: si ferma al limite', async () => {
  const db = fakeDb(); let calls = 0; const f = async () => { calls++; };
  assert.deepEqual((await runScheduler({client: db.session('a'), env: ON, tasks: [1, 2], fetchOne: f, today})).requests, 2);
  const r = await runScheduler({client: db.session('b'), env: ON, tasks: [1, 2, 3], fetchOne: f, today});
  assert.equal(r.status, 'STOPPED'); assert.equal(r.requests, 1); assert.equal(calls, 3);
});

test('arresto sicuro su SIGTERM tra due richieste e lock rilasciato', async () => {
  const db = fakeDb(); const stop = {stopped: false}; const proc = new EventEmitter();
  const off = installStopHandlers(proc, stop);
  const r = await runScheduler({client: db.session('a'), env: ON, tasks: [1, 2, 3], today, stopSignal: stop,
    fetchOne: async () => { proc.emit('SIGTERM'); }});
  off();
  assert.equal(r.status, 'STOPPED'); assert.equal(r.requests, 1); assert.equal(db.st.lock, null);
});

test('errore: FAILED registrato, lock rilasciato; crash precedente recuperato come ABORTED', async () => {
  const db = fakeDb(); db.st.runs.push({id: 1, status: 'RUNNING'});
  const r = await runScheduler({client: db.session('a'), env: ON, tasks: [1], today, fetchOne: async () => { throw new Error('boom'); }});
  assert.equal(r.status, 'FAILED'); assert.equal(db.st.runs[0].status, 'ABORTED'); assert.equal(db.st.runs[1].status, 'FAILED');
  assert.equal(db.st.lock, null);
});
