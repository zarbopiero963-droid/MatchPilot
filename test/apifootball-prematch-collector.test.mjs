// MP-AF-COLLECT-01: the PREMATCH odds collector with a fake fetch only (synthetic answers in the shapes observed on
// 2026-11-01; invented prices). No test reaches the network or spends provider quota.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { apiFootballConfig, createApiFootballClient, createMemoryLedger } from '../src/providers/apifootball/client.mjs';
import { COLLECTOR_PURPOSE, createPrematchCollector, prematchCandidates, prematchCollectorConfig } from '../src/providers/apifootball/prematch-collector.mjs';
import { createPgRequestLedger, oddsAsOf, saveOddsSnapshots, SnapshotStoreError } from '../src/providers/apifootball/store.mjs';

const T0 = Date.UTC(2026, 10, 2, 9, 0, 0);
const H = 3600000;
const clientEnv = {APIFOOTBALL_ENABLED: 'true', APIFOOTBALL_KEY: 'test-key-not-real-0123456789', APIFOOTBALL_REQUESTS_PER_DAY: '100', APIFOOTBALL_REQUESTS_PER_MINUTE: '30'};
const collectorEnv = (over = {}) => ({APIFOOTBALL_PREMATCH_COLLECTOR_ENABLED: 'true', APIFOOTBALL_PREMATCH_LEAGUES: '135:2026', APIFOOTBALL_PREMATCH_CALLS_PER_DAY: '20',
  APIFOOTBALL_PREMATCH_CALLS_PER_MINUTE: '10', APIFOOTBALL_PREMATCH_MAX_CALLS_PER_RUN: '10', APIFOOTBALL_PREMATCH_LEAD_HOURS: '24',
  APIFOOTBALL_PREMATCH_MIN_INTERVAL_MINUTES: '60', ...over});

const fixture = (id, kickoffMs, status = 'NS') => ({fixture: {id, timestamp: kickoffMs / 1000, date: new Date(kickoffMs).toISOString(), status: {short: status}}, league: {id: 135}});
const oddsItem = (id, kickoffMs, {home = '2.10', update = new Date(T0 - 10 * 60000).toISOString()} = {}) => ({
  fixture: {id, timestamp: kickoffMs / 1000, date: new Date(kickoffMs).toISOString()}, update,
  bookmakers: [{id: 8, name: 'Bet365', bets: [
    {id: 1, name: 'Match Winner', values: [{value: 'Home', odd: home}, {value: 'Draw', odd: '3.40'}, {value: 'Away', odd: '3.50'}]},
    {id: 5, name: 'Goals Over/Under', values: [{value: 'Over 2.5', odd: '1.85'}, {value: 'Under 2.5', odd: '1.95'}]}]}]});
const body = (response, paging = {current: 1, total: 1}) => ({errors: [], results: response.length, paging, response});

// routes: (url) -> {status, body, headers} | {throw}
function harness({routes, env = collectorEnv(), start = T0, ledger = createMemoryLedger(), save, latency = 50} = {}) {
  let clock = start;
  const calls = [];
  const fetchImpl = async url => {
    calls.push(url);
    const answer = routes(new URL(url), calls.length);
    if (!answer) throw new Error(`unexpected network call ${url}`);
    if (answer.throw) throw answer.throw;
    clock += latency;
    return {status: answer.status ?? 200, headers: new Headers(answer.headers ?? {}), json: async () => answer.body};
  };
  const client = createApiFootballClient({config: apiFootballConfig(clientEnv), ledger, fetchImpl, now: () => clock, sleep: async ms => { clock += ms; }});
  const saved = [];
  const released = [];
  const collector = createPrematchCollector({config: prematchCollectorConfig(env), client, ledger, now: () => clock,
    openConnection: async () => ({release: () => released.push(1)}),
    saveSnapshots: save ?? (async (_c, rows) => { saved.push(...rows); return {inserted: rows.length, skipped: 0}; })});
  return {collector, calls, saved, released, ledger, advance: ms => { clock += ms; }, now: () => clock};
}
const standard = (fixtures, oddsFor = id => [oddsItem(id, fixtures.find(f => f.fixture.id === id).fixture.timestamp * 1000)]) => url => {
  if (url.pathname === '/fixtures') return {body: body(fixtures)};
  if (url.pathname === '/odds') return {body: body(oddsFor(Number(url.searchParams.get('fixture'))))};
  return null;
};

test('MP-AF-COLLECT-01 off by default: no configuration, no call; when on every limit is explicit', async () => {
  assert.deepEqual(prematchCollectorConfig({}), {enabled: false});
  assert.deepEqual(prematchCollectorConfig({APIFOOTBALL_PREMATCH_COLLECTOR_ENABLED: '1'}), {enabled: false});
  for (const over of [{APIFOOTBALL_PREMATCH_LEAGUES: ''}, {APIFOOTBALL_PREMATCH_LEAGUES: '135'}, {APIFOOTBALL_PREMATCH_LEAGUES: 'all:2026'},
    {APIFOOTBALL_PREMATCH_CALLS_PER_DAY: undefined}, {APIFOOTBALL_PREMATCH_CALLS_PER_MINUTE: '0'}, {APIFOOTBALL_PREMATCH_MAX_CALLS_PER_RUN: '1e3'},
    {APIFOOTBALL_PREMATCH_LEAD_HOURS: '-1'}, {APIFOOTBALL_PREMATCH_MIN_INTERVAL_MINUTES: '1'}, {APIFOOTBALL_PREMATCH_MAX_PAGES: '50'}]) {
    assert.throws(() => prematchCollectorConfig(collectorEnv(over)), err => err.code === 'NOT_CONFIGURED', JSON.stringify(over));
  }
  const h = harness({env: {}, routes: () => null});
  const report = await h.collector.runOnce();
  assert.equal(report.status, 'disabled');
  assert.equal(h.calls.length, 0);
  assert.equal(h.ledger.rows.length, 0);
});

test('MP-AF-COLLECT-01 one cycle: discovery, then odds nearest kickoff first; snapshots carry the client acquisition time', async () => {
  const fixtures = [fixture(2, T0 + 6 * H), fixture(1, T0 + 2 * H)];
  const h = harness({routes: standard(fixtures)});
  const report = await h.collector.runOnce();
  assert.equal(report.status, 'completed');
  assert.deepEqual(h.calls.map(u => new URL(u).pathname + new URL(u).search), [
    '/fixtures?from=2026-11-02&league=135&season=2026&status=NS&to=2026-11-03', '/odds?fixture=1', '/odds?fixture=2']);
  assert.deepEqual(report.fixtures.map(f => [f.fixture_id, f.outcome, f.inserted]), [[1, 'collected', 5], [2, 'collected', 5]]);
  assert.equal(h.saved.length, 10);
  assert.ok(h.saved.every(r => r.phase === 'PREMATCH' && Date.parse(r.acquired_at) < Date.parse(r.kickoff_at) && Date.parse(r.acquired_at) > T0));
  assert.ok(h.ledger.rows.every(r => r.purpose === COLLECTOR_PURPOSE));
  assert.equal(h.released.length, 2, 'every dedicated connection is released');
});

test('MP-AF-COLLECT-01 never pre-match after kickoff: started, too close, unscheduled and unknown fixtures are never requested', async () => {
  const {candidates, skipped} = prematchCandidates([fixture(1, T0 + H), fixture(2, T0 + 60000), fixture(3, T0 - H), fixture(4, T0 + H, '1H'),
    fixture(5, T0 + H, 'TBD'), fixture(6, T0 + H, 'PST'), fixture(7, T0 + 30 * H), {fixture: {id: 8, status: {short: 'NS'}}}, {fixture: {}}, fixture(1, T0 + H)],
  {now: T0, leadHours: 24, kickoffMarginMinutes: 5});
  assert.deepEqual(candidates.map(c => c.fixture_id), [1]);
  assert.deepEqual(skipped.map(s => s.reason), ['kickoff too close or past: no pre-match request', 'kickoff too close or past: no pre-match request',
    'status 1H: not a scheduled pre-match fixture', 'status TBD: not a scheduled pre-match fixture', 'status PST: not a scheduled pre-match fixture',
    'kickoff beyond the lead window', 'kickoff unknown', 'fixture id missing']);
  // Kickoff gets close during the cycle (slow answers, two leagues to discover): found at T0+4min with 8 minutes to go,
  // only 4 minutes are left after the second discovery, so the check right before the request skips it.
  const h = harness({latency: 4 * 60000, env: collectorEnv({APIFOOTBALL_PREMATCH_LEAGUES: '135:2026,39:2026'}), routes: standard([fixture(1, T0 + 12 * 60000)])});
  const report = await h.collector.runOnce();
  assert.deepEqual(report.fixtures.map(f => f.outcome), ['skipped_kickoff_too_close']);
  assert.ok(!h.calls.some(u => u.includes('/odds')));
  // An answer acquired after kickoff (clock moved past it) is refused by the snapshot rows, nothing stored.
  const late = harness({latency: 20 * 60000, routes: standard([fixture(1, T0 + 30 * 60000)])});
  const lateReport = await late.collector.runOnce();
  assert.equal(late.saved.length, 0);
  assert.equal(lateReport.fixtures[0].rejected, 1);
});

test('MP-AF-COLLECT-01 dedup: a fixture is requested at most once per interval, also across restarts (read from the ledger)', async () => {
  const ledger = createMemoryLedger();
  const fixtures = [fixture(1, T0 + 5 * H)];
  const first = harness({ledger, routes: standard(fixtures)});
  await first.collector.runOnce();
  // A new collector on the same ledger (a restart), 30 minutes later: no new odds request.
  const second = harness({ledger, start: T0 + 30 * 60000, routes: standard(fixtures)});
  const report = await second.collector.runOnce();
  assert.deepEqual(report.fixtures.map(f => f.outcome), ['skipped_recently_requested']);
  assert.ok(!second.calls.some(u => u.includes('/odds')));
  const third = harness({ledger, start: T0 + 61 * 60000, routes: standard(fixtures)});
  assert.deepEqual((await third.collector.runOnce()).fixtures.map(f => f.outcome), ['collected']);
});

test('MP-AF-COLLECT-01 budgets: safe stop at the collector daily, per-minute and per-cycle limits; the client budget also stops it', async () => {
  const many = Array.from({length: 8}, (_, i) => fixture(i + 1, T0 + (i + 1) * H));
  const perRun = harness({env: collectorEnv({APIFOOTBALL_PREMATCH_MAX_CALLS_PER_RUN: '3'}), routes: standard(many)});
  const r1 = await perRun.collector.runOnce();
  assert.deepEqual([r1.status, r1.stop_reason, r1.calls, perRun.calls.length], ['stopped', 'MAX_CALLS_PER_RUN', 3, 3]);
  const perMinute = harness({env: collectorEnv({APIFOOTBALL_PREMATCH_CALLS_PER_MINUTE: '2'}), routes: standard(many)});
  const r2 = await perMinute.collector.runOnce();
  assert.deepEqual([r2.stop_reason, perMinute.calls.length], ['COLLECTOR_BUDGET_MINUTE', 2]);
  const ledger = createMemoryLedger();
  for (let i = 0; i < 4; i += 1) ledger.rows.push({at_ms: T0 - 1000, outcome: 'ok', purpose: COLLECTOR_PURPOSE, path: '/x'});
  ledger.rows.push({at_ms: T0 - 1000, outcome: 'ok', purpose: 'benchmark', path: '/y'});
  const perDay = harness({ledger, env: collectorEnv({APIFOOTBALL_PREMATCH_CALLS_PER_DAY: '5'}), routes: standard(many)});
  const r3 = await perDay.collector.runOnce();
  assert.deepEqual([r3.stop_reason, perDay.calls.length], ['COLLECTOR_BUDGET_DAY', 1], 'other purposes do not use the collector budget');
  // The provider reports its counter at zero: the client pauses and the cycle stops at once.
  const quota = harness({routes: url => url.pathname === '/fixtures' ? {body: body(many), headers: {'x-ratelimit-requests-remaining': '0'}} : null});
  const r4 = await quota.collector.runOnce();
  assert.deepEqual([r4.stop_reason, quota.calls.length], ['PROVIDER_QUOTA', 1]);
  const limited = harness({routes: url => url.pathname === '/fixtures' ? {body: body(many)} : {status: 429, body: {}}});
  const r5 = await limited.collector.runOnce();
  assert.equal(r5.stop_reason, 'RATE_LIMITED');
  assert.equal(limited.calls.filter(u => u.includes('/odds')).length, 1, 'no second odds request after a 429');
});

test('MP-AF-COLLECT-01 failures: provider errors skip the fixture, consecutive failures stop the cycle; store unavailable stops it', async () => {
  const many = Array.from({length: 6}, (_, i) => fixture(i + 1, T0 + (i + 1) * H));
  const h = harness({routes: url => url.pathname === '/fixtures' ? {body: body(many)} : {body: {errors: {plan: 'x'}, results: 0, response: []}}});
  const report = await h.collector.runOnce();
  assert.deepEqual([report.status, report.stop_reason], ['stopped', 'CONSECUTIVE_FAILURES']);
  assert.equal(h.calls.filter(u => u.includes('/odds')).length, 3);
  assert.deepEqual(report.fixtures.map(f => f.outcome), ['failed_PROVIDER_ERROR', 'failed_PROVIDER_ERROR', 'failed_PROVIDER_ERROR']);
  const store = harness({routes: standard(many), save: async () => { throw new SnapshotStoreError('SNAPSHOTS_UNAVAILABLE', 'x'); }});
  const r2 = await store.collector.runOnce();
  assert.deepEqual([r2.stop_reason, store.calls.filter(u => u.includes('/odds')).length, store.released.length], ['SNAPSHOTS_UNAVAILABLE', 1, 1]);
  const disabledClient = createPrematchCollector({config: prematchCollectorConfig(collectorEnv()), ledger: createMemoryLedger(), now: () => T0,
    client: createApiFootballClient({config: apiFootballConfig({}), ledger: createMemoryLedger(), fetchImpl: async () => { throw new Error('no'); }}),
    openConnection: async () => ({}), saveSnapshots: async () => ({inserted: 0})});
  assert.equal((await disabledClient.runOnce()).stop_reason, 'DISABLED', 'collector on but client off: nothing is called');
  await assert.rejects(createPrematchCollector({config: prematchCollectorConfig(collectorEnv())}).runOnce(), err => err.code === 'NOT_CONFIGURED');
  // review: a ledger that cannot be read stops the cycle with a reported reason, before any provider call.
  for (const [failure, reason] of [[new SnapshotStoreError('SNAPSHOTS_UNAVAILABLE', 'x'), 'SNAPSHOTS_UNAVAILABLE'], [new Error('connection refused'), 'LEDGER_UNAVAILABLE']]) {
    const broken = {...createMemoryLedger(), countSince: async () => { throw failure; }};
    const b = harness({ledger: broken, routes: standard(many)});
    const r = await b.collector.runOnce();
    assert.deepEqual([r.status, r.stop_reason, b.calls.length], ['stopped', reason, 0]);
  }
  const ledger = createMemoryLedger();
  const noInterval = harness({ledger: {...ledger, insert: ledger.insert, countSince: ledger.countSince, lastRequestAt: async () => { throw new Error('down'); }}, routes: standard(many)});
  const r3 = await noInterval.collector.runOnce();
  assert.deepEqual([r3.stop_reason, noInterval.calls.filter(u => u.includes('/odds')).length, r3.fixtures[0].outcome], ['LEDGER_UNAVAILABLE', 0, 'stopped_ledger']);
});

test('MP-AF-COLLECT-01 pages: at most maxPages per fixture, truncation reported; overlapping cycles are refused', async () => {
  const f = fixture(1, T0 + 3 * H);
  const routes = url => url.pathname === '/fixtures' ? {body: body([f])} : {body: body([oddsItem(1, T0 + 3 * H, {home: url.searchParams.get('page') ? '2.20' : '2.10'})], {current: 1, total: 3})};
  const h = harness({env: collectorEnv({APIFOOTBALL_PREMATCH_MAX_PAGES: '2'}), routes});
  const report = await h.collector.runOnce();
  assert.deepEqual([report.fixtures[0].pages, report.fixtures[0].truncated_pages], [2, 1]);
  assert.deepEqual(h.calls.filter(u => u.includes('/odds')).map(u => new URL(u).search), ['?fixture=1', '?fixture=1&page=2']);
  const slow = harness({routes: standard([f])});
  const [a, b] = await Promise.all([slow.collector.runOnce(), slow.collector.runOnce()]);
  assert.deepEqual([a.status, b.stop_reason], ['completed', 'ALREADY_RUNNING']);
});

test('MP-AF-COLLECT-01 no scheduler: nothing in src starts the collector', async () => {
  const {readFileSync, readdirSync, statSync} = await import('node:fs');
  const {join} = await import('node:path');
  const files = [];
  const walk = dir => { for (const name of readdirSync(dir)) { const p = join(dir, name); statSync(p).isDirectory() ? walk(p) : p.endsWith('.mjs') && files.push(p); } };
  walk('src');
  const users = files.filter(p => !p.endsWith('prematch-collector.mjs') && /prematch-collector/.test(readFileSync(p, 'utf8')));
  assert.deepEqual(users, [], 'no route, job or timer imports the collector');
  assert.doesNotMatch(readFileSync('src/providers/apifootball/prematch-collector.mjs', 'utf8'), /setInterval|setTimeout|cron/i);
});

function runNode(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {env, stdio: ['ignore', 'pipe', 'pipe']});
    let output = '';
    child.stdout.on('data', c => { output += c; });
    child.stderr.on('data', c => { output += c; });
    child.once('error', reject);
    child.once('exit', code => (code === 0 ? resolve(output) : reject(new Error(`node exited ${code}\n${output}`))));
  });
}

test('MP-AF-COLLECT-01 on PostgreSQL: ledger budget and interval survive restarts, snapshots stored and read point in time', {timeout: 90000}, async t => {
  const pg = (await import('pg')).default;
  const rootUrl = process.env.FUTPYTHON_TEST_DATABASE_URL || 'postgres://matchpilot:matchpilot_local_test@127.0.0.1:5432/matchpilot_fpt';
  const dbUrl = new URL(rootUrl);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(dbUrl.hostname), 'remote PostgreSQL is forbidden');
  const root = new pg.Client({connectionString: rootUrl, connectionTimeoutMillis: 2000});
  try { await root.connect(); } catch (cause) { await root.end().catch(() => {}); if (process.env.CI) throw cause; return t.skip('throwaway postgres unavailable'); }
  const schema = `afcollect_${process.pid}`;
  try {
    await root.query(`CREATE SCHEMA ${schema}`);
    dbUrl.searchParams.set('options', `-csearch_path=${schema}`);
    await runNode(['src/migrate.mjs'], {PATH: process.env.PATH, NODE_ENV: 'test', DATABASE_URL: dbUrl.toString(), MATCHPILOT_RUNTIME_MODE: 'test'});
    const pool = new pg.Pool({connectionString: dbUrl.toString(), max: 3});
    try {
      // The 031 schema: migrate() applies it once it is in migrations/ (PR #282); while it is staged, the test applies the
      // same idempotent file itself. Either way the tables exist only in this throwaway schema.
      const {existsSync, readFileSync} = await import('node:fs');
      const schemaFile = ['migrations/031-apifootball-odds-snapshots.sql', 'db/staged/031-apifootball-odds-snapshots.sql'].find(f => existsSync(f));
      await pool.query(readFileSync(schemaFile, 'utf8'));
      const ledger = createPgRequestLedger(pool);
      const fixtures = [fixture(1, T0 + 2 * H), fixture(2, T0 + 4 * H)];
      const run = start => harness({ledger, start, routes: standard(fixtures), save: (c, rows) => saveOddsSnapshots(c, rows)});
      const make = h => createPrematchCollector({config: prematchCollectorConfig(collectorEnv()), ledger, now: h.now,
        client: createApiFootballClient({config: apiFootballConfig(clientEnv), ledger, now: h.now, sleep: async () => {},
          fetchImpl: async url => { h.calls.push(url); const a = standard(fixtures)(new URL(url)); h.advance(50); return {status: 200, headers: new Headers(), json: async () => a.body}; }}),
        openConnection: () => pool.connect(), saveSnapshots: saveOddsSnapshots});
      const h1 = run(T0);
      const r1 = await make(h1).runOnce();
      assert.deepEqual([r1.status, r1.stored], ['completed', 10]);
      const h2 = run(T0 + 10 * 60000);
      const r2 = await make(h2).runOnce();
      assert.deepEqual(r2.fixtures.map(f => f.outcome), ['skipped_recently_requested', 'skipped_recently_requested'], 'interval read back from PostgreSQL');
      assert.equal(await ledger.countSince(T0 - H, {purpose: COLLECTOR_PURPOSE}), 4);
      assert.equal(await ledger.countSince(T0 - H, {purpose: 'other'}), 0);
      const asOf = await oddsAsOf(pool, {fixtureId: 1, asOf: new Date(T0 + H)});
      assert.equal(asOf.length, 5);
      assert.deepEqual(await oddsAsOf(pool, {fixtureId: 1, asOf: new Date(T0 - H)}), [], 'nothing before its acquisition');
    } finally { await pool.end(); }
  } finally {
    await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await root.end();
  }
});
