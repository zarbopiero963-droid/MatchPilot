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
