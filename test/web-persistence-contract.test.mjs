// MP-UI-PR-003 (MP-UI-HARD-GATES-01 §7): one contract, two adapters. The same checks run against the real adapter of
// the page (src/web/persistence.js createPersistence) on the real server — owner login enforced, the staged persistence
// schema on a throwaway PostgreSQL schema with the QA archive — and against the in-memory mock. Moving a page from the
// mock to the real backend is then a change of adapter, verified by this file, never a rewrite.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {ROOT_URL, startServer} from '../tools/qa/browser-qa.mjs';
import {createMemoryPersistence, createPersistence} from '../src/web/persistence.js';
import {seedQaArchive} from './helpers/fpt-seed.mjs';
import {hashPassword} from '../src/auth/owner-auth.mjs';

// The contract, as the page relies on it. `result` is the backtest result the real server produces for `params`.
async function contract(adapter, {params, result, strategyId, definition}) {
  // Every call below uses exactly the arguments the page passes (src/web/app.js simSave and savedView).
  const status = await adapter.status();
  assert.deepEqual([status.ok, status.data.available, status.data.writes_enabled], [true, true, true]);
  const empty = await adapter.listBacktests();
  assert.deepEqual([empty.ok, empty.data.backtests], [true, []]);

  const first = await adapter.saveBacktest({name: 'Prova', params});
  assert.deepEqual([first.ok, first.status, first.data.status, first.data.kind], [true, 201, 'SAVED', 'BACKTEST']);
  assert.ok(Number.isInteger(first.data.backtest_id) && first.data.backtest_id > 0);
  const again = await adapter.saveBacktest({name: 'Prova di nuovo', params});
  assert.deepEqual([again.status, again.data.status, again.data.backtest_id], [200, 'ALREADY_SAVED', first.data.backtest_id], 'idempotent');

  const list = await adapter.listBacktests();
  assert.equal(list.data.backtests.length, 1);
  const row = list.data.backtests[0];
  assert.deepEqual([row.backtest_id, row.kind, row.name, row.report_sha256], [first.data.backtest_id, 'BACKTEST', 'Prova', [result.report.report_sha256]]);
  assert.match(row.created_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
  assert.equal(row.result, undefined, 'a list carries no result');

  const loaded = await adapter.loadBacktest(first.data.backtest_id);
  assert.deepEqual([loaded.ok, loaded.data.kind, loaded.data.name], [true, 'BACKTEST', 'Prova']);
  assert.deepEqual(loaded.data.result, result, 'the stored result is the one the server produced');
  assert.deepEqual([(await adapter.loadBacktest(999)).status, (await adapter.loadBacktest(999)).code], [404, 'NOT_FOUND']);
  assert.equal((await adapter.loadBacktest('x')).status, 400);

  for (const name of ['', '   ', 'x'.repeat(201)]) {
    const refused = await adapter.saveBacktest({name, params});
    assert.deepEqual([refused.ok, refused.status], [false, 400], JSON.stringify(name));
  }
  const rules = {selection: 'HOME', side: 'LAY', odds_max: '2.5', team: 'Ajax', venue: 'HOME'};
  const strategy = await adapter.saveStrategy({key: 'ajax-casa', name: 'Ajax in casa', rules});
  assert.deepEqual([strategy.status, strategy.data.status, strategy.data.version, strategy.data.strategy_id], [201, 'SAVED', 1, strategyId]);
  const unchanged = await adapter.saveStrategy({key: 'ajax-casa', name: 'Ajax in casa', rules});
  assert.deepEqual([unchanged.status, unchanged.data.status, unchanged.data.version], [200, 'UNCHANGED', 1]);
  const renamed = await adapter.saveStrategy({key: 'ajax-casa', name: 'Ajax, banca in casa', rules});
  assert.deepEqual([renamed.data.status, renamed.data.version], ['SAVED', 2], 'a new name is a new version');
  assert.deepEqual((await adapter.listStrategies()).data.strategies.map(s => [s.key, s.version, s.strategy_id, s.name]), [['ajax-casa', 2, strategyId, 'Ajax, banca in casa']]);
  // MP-UI-PR-006: the detail of a strategy, its history and the request fields of each version.
  const current = await adapter.loadStrategy('ajax-casa');
  assert.deepEqual([current.ok, current.data.strategy.version, current.data.strategy.name, current.data.strategy.strategy_id, current.data.strategy.superseded_at],
    [true, 2, 'Ajax, banca in casa', strategyId, null]);
  assert.deepEqual(current.data.strategy.definition, definition, 'the stored definition');
  assert.deepEqual(current.data.rules, rules, 'the request fields to reopen it');
  assert.deepEqual(current.data.versions.map(v => [v.version, v.name, v.strategy_id, v.superseded_at === null]),
    [[1, 'Ajax in casa', strategyId, false], [2, 'Ajax, banca in casa', strategyId, true]]);
  for (const v of current.data.versions) assert.match(v.created_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
  assert.deepEqual(Object.keys(current.data.versions[0]).sort(), ['created_at', 'name', 'strategy_id', 'superseded_at', 'version']);
  const older = await adapter.loadStrategy('ajax-casa', 1);
  assert.deepEqual([older.data.strategy.version, older.data.strategy.name, older.data.rules], [1, 'Ajax in casa', rules]);
  assert.deepEqual([(await adapter.loadStrategy('missing')).status, (await adapter.loadStrategy('missing')).code], [404, 'NOT_FOUND']);
  assert.equal((await adapter.loadStrategy('Bad Key')).status, 400);
  assert.equal((await adapter.loadStrategy('ajax-casa', 'x')).status, 400);
  assert.equal((await adapter.loadStrategy('ajax-casa', 9)).status, 404);
  assert.equal((await adapter.saveStrategy({key: 'Not A Key', name: 'x', rules})).status, 400);
  const unknown = await adapter.saveStrategy({key: 'ajax-casa', name: 'x', rules: {...rules, stake: '5'}});
  assert.deepEqual([unknown.ok, unknown.status, unknown.code], [false, 400, 'UNKNOWN_FIELD']);
  assert.equal(typeof loaded.data.response_text, 'string', 'the stored text comes with the result');
  assert.deepEqual(JSON.parse(loaded.data.response_text), result);
}

// The refusals the page shows, in the same shape from both adapters.
async function refusals(adapter, {params, expected}) {
  const status = await adapter.status();
  if (expected === 'unavailable') {
    // Production today: no persistence schema and no owner login. Reads 503; a write is refused by the login gate first.
    assert.deepEqual([status.ok, status.data.available, status.data.writes_enabled], [true, false, false]);
    const list = await adapter.listBacktests();
    assert.deepEqual([list.ok, list.status, list.code], [false, 503, 'UNAVAILABLE']);
    const save = await adapter.saveBacktest({name: 'x', params});
    assert.deepEqual([save.ok, save.status, save.code], [false, 403, 'WRITES_REQUIRE_AUTH']);
    // The saved strategies are private: without the owner login nobody reads them (MP-UI-PR-006).
    for (const read of [await adapter.listStrategies(), await adapter.loadStrategy('k')]) assert.deepEqual([read.ok, read.status, read.code], [false, 403, 'READS_REQUIRE_AUTH']);
  } else if (expected === 'no-session') {
    // Owner login enforced, no session: every call is refused by the auth gate.
    for (const result of [status, await adapter.listBacktests(), await adapter.saveBacktest({name: 'x', params}), await adapter.saveStrategy({key: 'k', name: 'x', rules: {selection: 'HOME', side: 'BACK'}}),
      await adapter.listStrategies(), await adapter.loadStrategy('k')]) {
      assert.deepEqual([result.ok, result.status, result.code], [false, 401, 'UNAUTHENTICATED']);
    }
  } else {
    assert.deepEqual([status.data.available, status.data.writes_enabled], [true, false]);
    const refused = await adapter.saveBacktest({name: 'x', params});
    assert.deepEqual([refused.ok, refused.status, refused.code], [false, 403, 'WRITES_REQUIRE_AUTH']);
    assert.equal((await adapter.listBacktests()).ok, true, 'reads stay possible');
    for (const read of [await adapter.listStrategies(), await adapter.loadStrategy('k')]) assert.deepEqual([read.ok, read.status, read.code], [false, 403, 'READS_REQUIRE_AUTH'], 'except the private strategies');
  }
}

const PARAMS = {from: '2024-08-01', to: '2024-08-31', pit_mode: 'NON_PIT_RESEARCH', commission: '0.05', stake: '10'};
const RULES = {from: '2024-08-01', to: '2024-08-31', pit_mode: 'NON_PIT_RESEARCH', selection: 'HOME', side: 'LAY', odds_max: '2.5', team: 'Ajax', venue: 'HOME'};

test('the real adapter and the mock satisfy the same persistence contract', {timeout: 240000}, async t => {
  const pg = (await import('pg')).default;
  const admin = new pg.Client({connectionString: ROOT_URL, connectionTimeoutMillis: 3000});
  try { await admin.connect(); }
  catch (error) {
    await admin.end().catch(() => {});
    if (process.env.CI) throw error;
    return t.skip(`needs local PostgreSQL: ${error.message}`);
  }
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(ROOT_URL).hostname), 'local throwaway PostgreSQL only');
  const schema = `web_contract_${process.pid}_${Date.now()}`;
  const servers = [];
  t.after(async () => {
    for (const server of servers) await server.stop().catch(() => {});
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {});
    await admin.end().catch(() => {});
  });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const open = await startServer(schema);
  servers.push(open);
  const url = new URL(ROOT_URL);
  url.searchParams.set('options', `-c search_path=${schema}`);
  const client = new pg.Client({connectionString: url.toString()});
  await client.connect();
  try { await seedQaArchive(client); } finally { await client.end(); }

  // No persistence schema yet: what production answers today. Then the staged schema, as after the migration.
  await refusals(createPersistence({base: open.base}), {params: PARAMS, expected: 'unavailable'});
  const staged = new pg.Client({connectionString: url.toString()});
  await staged.connect();
  try { await staged.query(readFileSync(new URL('../db/staged/030-persistence.sql', import.meta.url), 'utf8')); } finally { await staged.end(); }
  await refusals(createPersistence({base: open.base}), {params: PARAMS, expected: 'read-only'});

  const password = 'contract owner password 2026';
  const owner = await startServer(schema, {MATCHPILOT_AUTH: 'enforce', MATCHPILOT_OWNER_USERNAME: 'owner', MATCHPILOT_OWNER_PASSWORD_HASH: await hashPassword(password, {N: 1024})});
  servers.push(owner);
  const login = await fetch(`${owner.base}/auth/login`, {method: 'POST', headers: {'content-type': 'application/json', origin: owner.base}, body: JSON.stringify({username: 'owner', password})});
  assert.equal(login.status, 200);
  const cookie = /mp_session=[^;]+/.exec(login.headers.get('set-cookie'))[0];
  // The browser sends the cookie and its origin; here the fetch does it.
  const browserFetch = (path, options) => fetch(path, {...options, headers: {...options.headers, cookie, origin: owner.base}});
  const backtest = async query => (await (await browserFetch(`${owner.base}/api/v1/hist/backtest?${new URLSearchParams(query)}`, {headers: {}})).json()).data;
  const result = await backtest(PARAMS);
  const ruleRun = await backtest(RULES);
  const strategyId = ruleRun.report.config.strategy;
  // The definition the server derives, as the backtest reports it (data for the check, never computed here).
  const definitionOfRules = async () => ruleRun.report.config.strategy_definition;
  assert.match(strategyId, /^def:[0-9a-f]{16}$/);

  // The definition the server stores for the rules: read back after the real run, given to the mock as data.
  let definition = null;
  await t.test('real adapter, real server', async () => {
    const real = createPersistence({base: owner.base, fetch: browserFetch});
    await contract({...real, loadStrategy: async (key, version) => {
      const answer = await real.loadStrategy(key, version);
      if (answer.ok && definition === null) definition = answer.data.strategy.definition;
      return answer;
    }}, {params: PARAMS, result, strategyId, definition: (await definitionOfRules())});
  });
  await t.test('real adapter, no session', () => refusals(createPersistence({base: owner.base}), {params: PARAMS, expected: 'no-session'}));
  const canonical = params => Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&');
  const strategies = {[canonical({selection: 'HOME', side: 'LAY', odds_max: '2.5', team: 'Ajax', venue: 'HOME'})]: {strategy_id: strategyId, definition}};
  await t.test('memory mock', () => contract(createMemoryPersistence({results: {[canonical(PARAMS)]: result}, strategies}), {params: PARAMS, result, strategyId, definition}));
  await t.test('memory mock refusals match the server', async () => {
    await refusals(createMemoryPersistence({schema: false, auth: false}), {params: PARAMS, expected: 'unavailable'});
    await refusals(createMemoryPersistence({auth: false, results: {[canonical(PARAMS)]: result}}), {params: PARAMS, expected: 'read-only'});
    await refusals(createMemoryPersistence({session: false}), {params: PARAMS, expected: 'no-session'});
  });
  // A network failure is an error with its code, never a success.
  await t.test('network failure', async () => {
    const down = createPersistence({fetch: async () => { throw new Error('offline'); }});
    assert.deepEqual(await down.status(), {ok: false, status: 0, code: 'NETWORK'});
    const odd = createPersistence({fetch: async () => new Response('not json', {status: 200})});
    assert.deepEqual(await odd.listBacktests(), {ok: false, status: 200, code: 'BAD_ENVELOPE'});
  });
});
