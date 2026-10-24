// PERSIST-API-01: the persistence routes. Handler tests on a throwaway PostgreSQL schema (the staged schema is applied by
// the test only), then end to end through the real server with owner auth enforced and with auth off.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import test from 'node:test';
import {MAX_BODY_BYTES, handlePersistence, writeAllowed} from '../src/api/persistence-api.mjs';
import {hashPassword} from '../src/auth/owner-auth.mjs';
import {runBacktest} from '../src/hist/engine.mjs';
import {createAccount} from '../src/persistence/store.mjs';

const STAGED = readFileSync(new URL('../db/staged/030-persistence.sql', import.meta.url), 'utf8');
const ROOT_URL = process.env.FUTPYTHON_TEST_DATABASE_URL || 'postgres://matchpilot:matchpilot_local_test@127.0.0.1:5432/matchpilot_fpt';
const OWNER = {principalId: 'owner', roles: ['owner']};
const SAME_ORIGIN = {'content-type': 'application/json', 'sec-fetch-site': 'same-origin', host: 'mp.local'};

function runNode(args, env) {
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, args, {cwd: process.cwd(), env, stdio: ['ignore', 'pipe', 'pipe']});
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.once('error', fail);
    child.once('exit', code => (code === 0 ? done(output) : fail(new Error(`node ${args.join(' ')} exited ${code}\n${output}`))));
  });
}

async function withSchema(t, name, body) {
  const pg = (await import('pg')).default;
  const dbUrl = new URL(ROOT_URL);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(dbUrl.hostname), 'remote PostgreSQL is forbidden');
  const root = new pg.Client({connectionString: ROOT_URL, connectionTimeoutMillis: 2000});
  try { await root.connect(); }
  catch (cause) {
    await root.end().catch(() => {});
    if (process.env.CI) throw cause;
    return t.skip('throwaway postgres unavailable');
  }
  const schema = `persist_api_${name}_${process.pid}`;
  try {
    await root.query(`CREATE SCHEMA ${schema}`);
    dbUrl.searchParams.set('options', `-csearch_path=${schema}`);
    await runNode(['src/migrate.mjs'], {PATH: process.env.PATH, NODE_ENV: 'test', DATABASE_URL: dbUrl.toString(), MATCHPILOT_RUNTIME_MODE: 'test'});
    const pool = new pg.Pool({connectionString: dbUrl.toString(), max: 4});
    let calls = 0;
    const withClient = async fn => { calls++; const c = await pool.connect(); try { return await fn(c); } finally { c.release(); } };
    try { await body({withClient, calls: () => calls, applyStaged: () => withClient(c => c.query(STAGED)), dbUrl, schema}); }
    finally { await pool.end(); }
  } finally {
    await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await root.end();
  }
}

const req = (method, path, {body, headers = SAME_ORIGIN, tooLarge = false} = {}) => ({method, url: new URL(path, 'http://mp.local'), headers,
  rawBody: body === undefined ? null : typeof body === 'string' ? body : JSON.stringify(body), tooLarge});

function sealedReport(strategy = 'mp-ref-fav-back-1') {
  const ev = {provider: 'fpt', event_id: 'e1', kickoff_utc: '2026-01-10T15:00:00Z', home: 'H', away: 'A'};
  const ob = (selection, odds, n) => ({observation_id: `o${n}`, provider: 'fpt', event_id: 'e1', bookmaker: 'bk1', market: '1X2', selection, odds,
    provider_time: '2026-01-10T14:30:00Z', acquired_at: '2026-01-10T14:30:00Z'});
  return runBacktest({schema_version: 'mp-hist-input-1', dataset: {id: 'api-fixture', kind: 'FIXTURE', description: 'api test'}, events: [ev],
    observations: [ob('HOME', '1.80', 1), ob('DRAW', '3.60', 2), ob('AWAY', '4.50', 3)],
    outcomes: [{provider: 'fpt', event_id: 'e1', status: 'FINAL', home_score: 2, away_score: 1, acquired_at: '2026-01-10T17:00:00Z'}]},
  {strategy, bookmaker: 'bk1', lead_minutes: 10, stake: '1', commission: '0'}, {codeVersion: 'test'});
}

test('persistence API: the write gate refuses before any database access', () => {
  const at = (extra = {}) => writeAllowed({headers: SAME_ORIGIN, authEnforced: true, session: OWNER, ...extra});
  assert.equal(at(), null);
  assert.deepEqual([at({authEnforced: false}).status, at({authEnforced: false}).body.error.code], [403, 'WRITES_REQUIRE_AUTH']);
  assert.equal(at({session: null}).status, 401);
  assert.equal(at({session: {principalId: 'v', roles: ['viewer']}}).status, 403);
  assert.equal(at({headers: {...SAME_ORIGIN, 'sec-fetch-site': 'cross-site'}}).body.error.code, 'ORIGIN_NOT_ALLOWED');
  assert.equal(at({headers: {'content-type': 'application/json', origin: 'https://evil.example', host: 'mp.local'}}).body.error.code, 'ORIGIN_NOT_ALLOWED');
  assert.equal(at({headers: {...SAME_ORIGIN, 'content-type': 'application/x-www-form-urlencoded'}}).status, 415);
  assert.equal(at({headers: {...SAME_ORIGIN, 'content-type': 'text/plain'}}).status, 415);
});

test('persistence API: 503 until the schema exists, refusals write nothing, then save and read back', {timeout: 120000}, async t => {
  await withSchema(t, 'flow', async ({withClient, calls, applyStaged}) => {
    let ran = 0;
    const result = {reader: {events: 1}, report: sealedReport(), events: [], totals: {bets: 1}};
    const runV1 = async target => { ran++; assert.equal(target.pathname, '/api/v1/hist/backtest'); return {status: 200, body: {api_version: 'v1', data: result}}; };
    const ctx = {withClient, authEnforced: true, session: OWNER, runV1};
    const call = (method, path, options) => handlePersistence(req(method, path, options), ctx);

    assert.equal(await handlePersistence(req('GET', '/api/v1/health'), ctx), null, 'other routes are not handled here');
    assert.deepEqual((await call('GET', '/api/v1/persistence/status')).body.data, {available: false, writes_enabled: false, writes: 'owner session'});
    assert.equal((await call('GET', '/api/v1/backtests/saved')).status, 503, 'the list too');
    assert.equal((await call('GET', '/api/v1/strategies')).status, 503);
    const strategy = {key: 'fav-home', name: 'Casa', definition: {selection: 'HOME', side: 'BACK'}};
    assert.equal((await call('POST', '/api/v1/strategies', {body: strategy})).status, 503);
    const unavailable = await call('POST', '/api/v1/backtests/saved', {body: {name: 'x', kind: 'BACKTEST', params: {from: '2026-01-01', to: '2026-01-31'}}});
    assert.equal(unavailable.status, 503);
    assert.equal(ran, 0, 'nothing is computed when it cannot be stored');

    // Refused before the database: no auth, cross-site, wrong type, too large.
    const before = calls();
    assert.equal((await handlePersistence(req('POST', '/api/v1/strategies', {body: strategy}), {...ctx, authEnforced: false})).status, 403);
    assert.equal((await handlePersistence(req('POST', '/api/v1/strategies', {body: strategy}), {...ctx, session: null})).status, 401);
    // The saved strategies are private also when auth is off (MP-UI-PR-006, #34 Strategy permissions, D12-18).
    for (const path of ['/api/v1/strategies', '/api/v1/strategies?key=fav-home', '/api/v1/strategies?key=fav-home&version=1']) {
      const off = await handlePersistence(req('GET', path), {...ctx, authEnforced: false, session: null});
      assert.deepEqual([off.status, off.body.error.code], [403, 'READS_REQUIRE_AUTH'], path);
      const anonymous = await handlePersistence(req('GET', path), {...ctx, session: null});
      assert.deepEqual([anonymous.status, anonymous.body.error.code], [401, 'UNAUTHENTICATED'], path);
    }
    assert.equal((await call('POST', '/api/v1/strategies', {body: strategy, headers: {...SAME_ORIGIN, 'sec-fetch-site': 'cross-site'}})).status, 403);
    assert.equal((await call('POST', '/api/v1/strategies', {body: strategy, headers: {...SAME_ORIGIN, 'content-type': 'text/plain'}})).status, 415);
    assert.equal((await call('POST', '/api/v1/strategies', {tooLarge: true})).status, 413);
    assert.equal((await call('POST', '/api/v1/strategies', {body: 'x'.repeat(MAX_BODY_BYTES + 1)})).status, 413);
    assert.equal((await call('POST', '/api/v1/strategies', {body: '{not json'})).status, 400);
    assert.equal((await call('POST', '/api/v1/strategies', {body: {...strategy, extra: 1}})).body.error.code, 'UNKNOWN_FIELD');
    assert.equal((await call('POST', '/api/v1/strategies?x=1', {body: strategy})).body.error.code, 'UNKNOWN_PARAMETER');
    assert.equal((await call('DELETE', '/api/v1/strategies')).status, 405);
    assert.equal((await call('POST', '/api/v1/ledger/account', {body: {}})).status, 405, 'no ledger writes through the API');
    for (const path of ['/api/v1/strategies?key=%00', '/api/v1/strategies?key=Bad%20Key', `/api/v1/strategies?key=${'a'.repeat(70)}`,
      '/api/v1/ledger/account?account_id=%00', '/api/v1/ledger/account?account_id=%20', `/api/v1/ledger/account?account_id=${'a'.repeat(101)}`]) {
      assert.equal((await call('GET', path)).status, 400, path);
    }
    assert.equal(calls(), before, 'no database access for any refusal');

    await applyStaged();
    assert.equal((await call('GET', '/api/v1/persistence/status')).body.data.available, true);
    const saved = await call('POST', '/api/v1/strategies', {body: strategy});
    assert.deepEqual([saved.status, saved.body.data.status, saved.body.data.version], [201, 'SAVED', 1]);
    const again = await call('POST', '/api/v1/strategies', {body: {...strategy, definition: {side: 'BACK', selection: 'HOME'}}});
    assert.deepEqual([again.status, again.body.data.status], [200, 'UNCHANGED']);
    assert.equal((await call('POST', '/api/v1/strategies', {body: {...strategy, definition: {selection: 'NOPE', side: 'BACK'}}})).status, 400);
    assert.equal((await call('POST', '/api/v1/strategies', {body: {...strategy, key: 'Bad Key'}})).status, 400);
    assert.deepEqual((await call('GET', '/api/v1/strategies')).body.data.strategies.map(s => [s.key, s.version]), [['fav-home', 1]]);
    assert.equal((await call('GET', '/api/v1/strategies?key=fav-home&version=1')).body.data.strategy.strategy_id, saved.body.data.strategy_id);
    assert.equal((await call('GET', '/api/v1/strategies?key=missing')).status, 404);
    assert.equal((await call('GET', '/api/v1/strategies?version=1')).status, 400);
    assert.equal((await call('GET', '/api/v1/strategies?key=fav-home&version=0')).status, 400);

    const body = {name: 'Gennaio', kind: 'BACKTEST', params: {from: '2026-01-01', to: '2026-01-31'}};
    const bt = await call('POST', '/api/v1/backtests/saved', {body});
    assert.deepEqual([bt.status, bt.body.data.status, ran], [201, 'SAVED', 1]);
    assert.equal((await call('POST', '/api/v1/backtests/saved', {body})).body.data.status, 'ALREADY_SAVED');
    const loaded = await call('GET', `/api/v1/backtests/saved?id=${bt.body.data.backtest_id}`);
    assert.equal(loaded.body.data.response_text, JSON.stringify(result), 'the stored text, byte for byte');
    assert.deepEqual(loaded.body.data.result, result);
    assert.deepEqual(loaded.body.data.params, body.params);
    assert.equal((await call('GET', '/api/v1/backtests/saved?id=999')).status, 404);
    // A strategy saved from the request fields of a backtest: the same definition, the same id, no new version.
    const fromRules = await call('POST', '/api/v1/strategies', {body: {key: 'fav-home', name: 'Casa', rules: {selection: 'HOME', side: 'BACK'}}});
    assert.deepEqual([fromRules.status, fromRules.body.data.status], [200, 'UNCHANGED']);
    const withTeam = await call('POST', '/api/v1/strategies', {body: {key: 'ajax-lay', name: 'Ajax in casa', rules: {selection: 'HOME', side: 'LAY', odds_max: '2.5', team: 'Ajax', venue: 'HOME'}}});
    assert.equal(withTeam.status, 201);
    assert.deepEqual((await call('GET', '/api/v1/strategies?key=ajax-lay')).body.data.strategy.definition.conditions, {odds_max: '2.5', teams: ['Ajax'], venue: 'HOME'});
    // MP-UI-PR-006: the detail carries the request fields of the version and the history of the strategy.
    const detail = (await call('GET', '/api/v1/strategies?key=ajax-lay')).body.data;
    assert.deepEqual(detail.rules, {selection: 'HOME', side: 'LAY', odds_max: '2.5', team: 'Ajax', venue: 'HOME'});
    assert.deepEqual(detail.versions.map(v => [v.version, v.name, v.superseded_at]), [[1, 'Ajax in casa', null]]);
    const renamed = await call('POST', '/api/v1/strategies', {body: {key: 'ajax-lay', name: 'Ajax, banca in casa', rules: detail.rules}});
    assert.deepEqual([renamed.status, renamed.body.data.version], [201, 2]);
    const history = (await call('GET', '/api/v1/strategies?key=ajax-lay')).body.data;
    assert.deepEqual(history.versions.map(v => [v.version, v.name, v.superseded_at === null]), [[1, 'Ajax in casa', false], [2, 'Ajax, banca in casa', true]]);
    assert.equal(history.strategy.version, 2);
    assert.deepEqual((await call('GET', '/api/v1/strategies?key=ajax-lay&version=1')).body.data.strategy.name, 'Ajax in casa');
    // A definition the request cannot express (two teams) has no request fields: it cannot be reopened as a request.
    const twoTeams = await call('POST', '/api/v1/strategies', {body: {key: 'derby', name: 'Derby', definition: {selection: 'HOME', side: 'BACK', conditions: {teams: ['Ajax', 'PSV']}}}});
    assert.equal(twoTeams.status, 201);
    assert.equal((await call('GET', '/api/v1/strategies?key=derby')).body.data.rules, null);
    for (const [bad, status] of [[{key: 'x', name: 'x', rules: {selection: 'HOME', side: 'BACK'}, definition: {selection: 'HOME', side: 'BACK'}}, 400],
      [{key: 'x', name: 'x'}, 400], [{key: 'x', name: 'x', rules: {selection: 'HOME', side: 'BACK', stake: '5'}}, 400],
      [{key: 'x', name: 'x', rules: {selection: 'HOME', side: 2}}, 400], [{key: 'x', name: 'x', rules: {selection: 'NOPE', side: 'BACK'}}, 400]]) {
      assert.equal((await call('POST', '/api/v1/strategies', {body: bad})).status, status, JSON.stringify(bad));
    }
    const list = await call('GET', '/api/v1/backtests/saved');
    assert.deepEqual([list.status, list.body.data.backtests.map(b => b.backtest_id)], [200, [bt.body.data.backtest_id]]);
    assert.equal(list.body.data.backtests[0].response, undefined, 'the list carries no response');
    for (const bad of ['limit=0', 'limit=201', 'limit=x', `id=${bt.body.data.backtest_id}&limit=2`, 'other=1']) {
      assert.equal((await call('GET', `/api/v1/backtests/saved?${bad}`)).status, 400, bad);
    }
    assert.equal((await call('POST', '/api/v1/backtests/saved', {body: {...body, kind: 'OTHER'}})).status, 400);
    assert.equal((await call('POST', '/api/v1/backtests/saved', {body: {...body, params: {from: 1}}})).status, 400);
    // The backtest's own refusal comes back unchanged and nothing is saved.
    const busy = await handlePersistence(req('POST', '/api/v1/backtests/saved', {body: {...body, name: 'other'}}),
      {...ctx, runV1: async () => ({status: 429, body: {api_version: 'v1', error: {code: 'BUSY', message: 'retry'}}})});
    assert.equal(busy.status, 429);
    // A forged result never reaches the store: the server's own run is what is saved, and its seal is re-checked.
    const forged = {...result, report: {...result.report, metrics: {roi: '9.99'}}};
    const refused = await handlePersistence(req('POST', '/api/v1/backtests/saved', {body: {...body, name: 'forged'}}),
      {...ctx, runV1: async () => ({status: 200, body: {data: forged}})});
    assert.equal(refused.status, 400);

    assert.equal((await call('GET', '/api/v1/ledger/account?account_id=a')).status, 404);
    await withClient(c => createAccount(c, {accountId: 'a', initialAllocation: '100', at: '2026-10-24T10:00:00Z'}));
    const account = await call('GET', '/api/v1/ledger/account?account_id=a');
    assert.deepEqual([account.status, account.body.data.account.cash_balance, account.body.data.account.reconciled], [200, '100', true]);
    assert.equal((await call('GET', '/api/v1/ledger/account')).status, 400);
  });
});

// ---- End to end through the real server ----
async function startServer(dbUrl, env) {
  const child = spawn(process.execPath, ['src/server.mjs'], {
    cwd: resolve('.'), env: {PATH: process.env.PATH, PORT: '0', DATABASE_URL: dbUrl.toString(), MATCHPILOT_RUNTIME_MODE: 'test', ...env},
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  const deadline = Date.now() + 30000;
  while (!/listening on/.test(output) && child.exitCode == null && Date.now() < deadline) await new Promise(done => setTimeout(done, 50));
  assert.equal(child.exitCode, null, output);
  const port = Number(/listening on (\d+) /.exec(output)?.[1]);
  assert.ok(port > 0, output);
  return {base: `http://127.0.0.1:${port}`, output: () => output, stop: () => new Promise(done => { child.on('close', done); child.kill('SIGTERM'); })};
}

test('persistence API through the server: owner session + same origin to write; no anonymous write with auth off', {timeout: 180000}, async t => {
  await withSchema(t, 'e2e', async ({applyStaged, dbUrl}) => {
    await applyStaged();
    const password = 'correct horse battery staple 2026';
    const hash = await hashPassword(password, {N: 1024});
    const post = (base, path, body, headers = {}) => fetch(`${base}${path}`, {method: 'POST', headers: {'content-type': 'application/json', ...headers}, body: JSON.stringify(body)});
    const strategy = {key: 'k1', name: 'Uno', definition: {selection: 'AWAY', side: 'LAY'}};

    const off = await startServer(dbUrl, {MATCHPILOT_AUTH: 'off'});
    try {
      const refused = await post(off.base, '/api/v1/strategies', strategy);
      assert.equal(refused.status, 403);
      assert.equal((await refused.json()).error.code, 'WRITES_REQUIRE_AUTH');
      const status = await (await fetch(`${off.base}/api/v1/persistence/status`)).json();
      assert.deepEqual(status.data, {available: true, writes_enabled: false, writes: 'disabled (MATCHPILOT_AUTH is not enforce)'});
      // A body over the limit: the write gate answers first (403), and the half-read connection is closed.
      const big = await fetch(`${off.base}/api/v1/strategies`, {method: 'POST', headers: {'content-type': 'application/json'}, body: 'x'.repeat(MAX_BODY_BYTES * 4)});
      assert.equal(big.status, 403);
      assert.equal(big.headers.get('connection'), 'close');
    } finally { await off.stop(); }

    const on = await startServer(dbUrl, {MATCHPILOT_AUTH: 'enforce', MATCHPILOT_OWNER_USERNAME: 'owner', MATCHPILOT_OWNER_PASSWORD_HASH: hash});
    try {
      assert.equal((await post(on.base, '/api/v1/strategies', strategy)).status, 401, 'no session');
      const login = await post(on.base, '/auth/login', {username: 'owner', password});
      assert.equal(login.status, 200);
      const cookie = /mp_session=[^;]+/.exec(login.headers.get('set-cookie'))[0];
      const cross = await post(on.base, '/api/v1/strategies', strategy, {cookie, origin: 'https://evil.example'});
      assert.equal(cross.status, 403);
      assert.equal((await cross.json()).error.code, 'ORIGIN_NOT_ALLOWED');
      const form = await fetch(`${on.base}/api/v1/strategies`, {method: 'POST', headers: {cookie, 'content-type': 'application/x-www-form-urlencoded'}, body: 'key=k1'});
      assert.equal(form.status, 415);
      const saved = await post(on.base, '/api/v1/strategies', strategy, {cookie, origin: on.base});
      assert.equal(saved.status, 201, await saved.clone().text());
      const list = await (await fetch(`${on.base}/api/v1/strategies`, {headers: {cookie}})).json();
      assert.deepEqual(list.data.strategies.map(s => s.key), ['k1']);
      assert.equal((await fetch(`${on.base}/api/v1/strategies`)).status, 401, 'reads need the session too when auth is enforced');
      const big = await fetch(`${on.base}/api/v1/strategies`, {method: 'POST', headers: {cookie, 'content-type': 'application/json'}, body: 'x'.repeat(MAX_BODY_BYTES + 10)});
      assert.equal(big.status, 413);
      assert.equal(big.headers.get('connection'), 'close');
      // The real chain: the server runs the backtest itself (no FPT data in this schema) and saves its own result.
      const save = await post(on.base, '/api/v1/backtests/saved', {name: 'vuoto', kind: 'BACKTEST', params: {from: '2025-09-01', to: '2025-09-30'}}, {cookie, origin: on.base});
      const stored = await save.json();
      assert.equal(save.status, 201, JSON.stringify(stored));
      const back = await (await fetch(`${on.base}/api/v1/backtests/saved?id=${stored.data.backtest_id}`, {headers: {cookie}})).json();
      assert.equal(back.data.kind, 'BACKTEST');
      assert.equal(back.data.result.report.report_sha256, back.data.report_sha256[0]);
      const again = await (await post(on.base, '/api/v1/backtests/saved', {name: 'vuoto', kind: 'BACKTEST', params: {from: '2025-09-01', to: '2025-09-30'}}, {cookie, origin: on.base})).json();
      assert.deepEqual([again.data.status, again.data.backtest_id, again.data.kind], ['ALREADY_SAVED', stored.data.backtest_id, 'BACKTEST'], 'the same run is not saved twice');
      const bad = await post(on.base, '/api/v1/backtests/saved', {name: 'x', kind: 'BACKTEST', params: {from: '2025-09-01', to: '2025-09-30', nope: '1'}}, {cookie, origin: on.base});
      assert.equal(bad.status, 400, 'unknown backtest parameters are refused by the backtest itself');
      assert.ok(!on.output().includes(password), 'the password never reaches the log');
    } finally { await on.stop(); }
  });
});
