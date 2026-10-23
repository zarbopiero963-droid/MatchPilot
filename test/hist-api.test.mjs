// HIST-API-01: /api/v1/hist/backtest contract. A declared test double stands for the database: every invalid request
// is refused before any query; the real PostgreSQL path is in test/hist-pg-input.test.mjs.
import assert from 'node:assert/strict';
import test from 'node:test';
import {handleV1} from '../src/api/v1.mjs';
import {HIST_BACKTEST_LIMITS, configOf} from '../src/api/hist-backtest.mjs';

const calls = [];
const fakeClient = {query: async sql => { calls.push(sql); return {rows: []}; }};
const get = path => handleV1({method: 'GET', url: new URL(`http://localhost${path}`)}, {withClient: async fn => fn(fakeClient), tc: {}, codeVersion: 't', now: () => new Date('2026-10-23T00:00:00Z')});
const base = '/api/v1/hist/backtest?from=2025-09-01&to=2025-09-30';

test('invalid backtest requests are refused with 400 before any database access', async () => {
  calls.length = 0;
  const bad = ['/api/v1/hist/backtest?to=2025-09-30', '/api/v1/hist/backtest?from=2025-09-01&to=2026-10-01', '/api/v1/hist/backtest?from=2025-09-30&to=2025-09-01',
    '/api/v1/hist/backtest?from=2025-02-30&to=2025-03-01', `${base}&strategy=martingale`, `${base}&pit_mode=LIVE`, `${base}&commission=1`, `${base}&stake=0`,
    `${base}&mm_model=PERCENT_BANKROLL&mm_value=5`, `${base}&bankroll=100&mm_model=PERCENT_BANKROLL`, `${base}&bankroll=100&mm_model=PERCENT_BANKROLL&mm_value=5&stake=2`,
    '/api/v1/hist/backtest?from=2025-13-01&to=2025-09-30', '/api/v1/hist/backtest?from=2025-09-01&to=2025-00-10', // PR #230 review R2-NB-2: not a 500
    `${base}&max_events=${HIST_BACKTEST_LIMITS.maxEvents + 1}`, `${base}&competition=x' OR 1=1`, `${base}&outcomes_as_of=yesterday`, `${base}&unknown=1`];
  for (const path of bad) {
    const result = await get(path);
    assert.equal(result.status, 400, path);
    assert.ok(['BAD_REQUEST', 'UNKNOWN_PARAMETER'].includes(result.body.error.code), path);
  }
  assert.deepEqual(calls, [], 'no query was sent');
});

test('a valid request reads in a READ ONLY transaction and returns the labelled report', async () => {
  calls.length = 0;
  const result = await get(`${base}&pit_mode=NON_PIT_RESEARCH&bankroll=100&mm_model=PERCENT_BANKROLL&mm_value=2`);
  assert.equal(result.status, 200);
  assert.deepEqual([calls[0], calls[1].startsWith('SET LOCAL statement_timeout'), calls.at(-1)], ['BEGIN READ ONLY', true, 'COMMIT']);
  const {data, meta} = result.body;
  assert.equal(data.report.status, 'INSUFFICIENT_PIT_DATA', 'no stored match: nothing decided');
  assert.deepEqual([meta.provenance.pit_mode, meta.provenance.writes, meta.provenance.certification.certified], ['NON_PIT_RESEARCH', 0, false]);
  // Defaults are the tests' (stake 1, commission 0), never a guessed market rate.
  assert.deepEqual(configOf({}), {strategy: 'mp-ref-fav-back-1', bookmaker: 'futpythontrader-odds', lead_minutes: 10, commission: '0', pit_mode: 'PIT', stake: '1'});
});

test('a CPU-bound run is exclusive, computes after the client is released, and flags truncation (PR #227 review B-1)', async () => {
  // Exclusive: while one request holds the endpoint, a second gets 429 BUSY before touching the database.
  let releaseFirst;
  const slowClient = {query: async sql => { if (sql === 'COMMIT') await new Promise(resolve => { releaseFirst = resolve; }); return {rows: []}; }};
  const deps = {tc: {}, codeVersion: 't', now: () => new Date('2026-10-23T00:00:00Z')};
  const first = handleV1({method: 'GET', url: new URL(`http://localhost${base}`)}, {...deps, withClient: async fn => fn(slowClient)});
  await new Promise(resolve => setImmediate(resolve));
  calls.length = 0;
  const second = await get(base);
  assert.deepEqual([second.status, second.body.error.code, calls.length], [429, 'BUSY', 0]);
  releaseFirst();
  assert.equal((await first).status, 200);
  assert.equal((await get(base)).status, 200, 'the endpoint is free again');
  // The engine runs after withClient has returned (no pooled connection held during the computation).
  let inside = false;
  const tracking = await handleV1({method: 'GET', url: new URL(`http://localhost${base}`)}, {...deps, withClient: async fn => { inside = true; try { return await fn(fakeClient); } finally { inside = false; } }});
  assert.equal(tracking.status, 200);
  assert.equal(inside, false);
  assert.equal(tracking.body.data.reader.truncated, false);
  // A stored row the reader refuses is a data defect (500 INTERNAL), not an unavailable database (503).
  const badRows = {query: async sql => (sql.includes('fpt_match_facts') ? {rows: [{match_key: 'k', match_date: new Date(), acquired_at: '2026-10-04T00:00:00Z', version_id: 1, snapshot_id: 1, home: 'H', away: 'A'}]} : {rows: []})};
  const defect = await handleV1({method: 'GET', url: new URL(`http://localhost${base}`)}, {...deps, withClient: async fn => fn(badRows)});
  assert.deepEqual([defect.status, defect.body.error.code], [500, 'INTERNAL']);
  assert.equal(HIST_BACKTEST_LIMITS.maxEvents, 1000);
  // truncated only when more matches than max_events exist: the reader is asked for one more (review NB-b).
  let limitSeen = null;
  const counting = {query: async (sql, values) => { if (sql.includes('fpt_match_facts')) limitSeen = values[3]; return {rows: []}; }};
  await handleV1({method: 'GET', url: new URL(`http://localhost${base}&max_events=5`)}, {...deps, withClient: async fn => fn(counting)});
  assert.equal(limitSeen, 6);
});

test('configurable strategy parameters: refused combinations never reach the database; a valid one is a strategy_definition', async () => {
  calls.length = 0;
  const bad = [`${base}&strategy=mp-ref-fav-back-1&selection=HOME&side=BACK`, `${base}&selection=HOME`, `${base}&odds_min=1.5`, `${base}&side=LAY`,
    `${base}&team=Ajax`, `${base}&selection=FIRST_GOAL&side=BACK`, `${base}&selection=HOME&side=DUTCH`, `${base}&selection=HOME&side=BACK&odds_min=1`,
    `${base}&selection=HOME&side=BACK&odds_min=abc`, `${base}&selection=HOME&side=BACK&home_min=3&home_max=2`, `${base}&selection=HOME&side=BACK&venue=HOME`,
    `${base}&selection=HOME&side=BACK&team=Ajax&venue=NEUTRAL`];
  for (const path of bad) {
    const result = await get(path);
    assert.equal(result.status, 400, path);
  }
  assert.deepEqual(calls, [], 'no query was sent');
  assert.deepEqual(configOf({selection: 'UNDERDOG', side: 'LAY', odds_max: '6', draw_min: '2.5', team: 'Ajax', venue: 'HOME'}), {
    strategy_definition: {selection: 'UNDERDOG', side: 'LAY', conditions: {odds_max: '6', draw_min: '2.5', teams: ['Ajax'], venue: 'HOME'}},
    bookmaker: 'futpythontrader-odds', lead_minutes: 10, commission: '0', pit_mode: 'PIT', stake: '1'});
  const result = await get(`${base}&selection=HOME&side=BACK&odds_max=2.5&pit_mode=NON_PIT_RESEARCH`);
  assert.equal(result.status, 200);
  assert.match(result.body.data.report.config.strategy, /^def:[0-9a-f]{16}$/);
  assert.deepEqual(result.body.data.report.config.strategy_definition.conditions, {odds_max: '2.5'});
});
