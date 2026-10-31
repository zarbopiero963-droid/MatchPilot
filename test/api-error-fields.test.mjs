// MP-UI-PR-007 (MP-REQ-UI-1046): a v1 refusal names the request parameters it is about in `error.fields`, so a page
// marks the field from the envelope and never reads the message. A declared test double stands for the database: the
// refusals happen before any query.
import assert from 'node:assert/strict';
import test from 'node:test';
import {handleV1} from '../src/api/v1.mjs';
import {requestFields} from '../src/api/hist-backtest.mjs';

const calls = [];
const fakeClient = {query: async sql => { calls.push(sql); return {rows: []}; }};
const get = path => handleV1({method: 'GET', url: new URL(`http://localhost${path}`)}, {withClient: async fn => fn(fakeClient), tc: {}, codeVersion: 't', now: () => new Date('2026-10-24T00:00:00Z')});
const fieldsOf = async path => {
  const result = await get(path);
  assert.equal(result.status, 400, path);
  return result.body.error.fields;
};
const BT = '/api/v1/hist/backtest?from=2025-09-01&to=2025-09-30';
const CMP = '/api/v1/hist/compare?from=2025-09-01&to=2025-09-30&a_strategy=mp-ref-fav-back-1&b_strategy=mp-ref-fav-back-1';

test('MP-REQ-UI-1046: every refusal of the backtest names its request parameters in error.fields', async () => {
  calls.length = 0;
  for (const [path, fields] of [
    ['/api/v1/hist/backtest?to=2025-09-30', ['from']],
    ['/api/v1/hist/backtest?from=2025-02-30&to=2025-03-01', ['from']],
    ['/api/v1/hist/backtest?from=2025-09-01&to=2026-10-01', ['from', 'to']],
    [`${BT}&pit_mode=LIVE`, ['pit_mode']],
    [`${BT}&commission=1`, ['commission']],
    [`${BT}&stake=0`, ['stake']],
    [`${BT}&unknown=1`, ['unknown']],
    [`${BT}&mm_model=PERCENT_BANKROLL&mm_value=5`, ['bankroll']],
    [`${BT}&bankroll=100&mm_model=PERCENT_BANKROLL&mm_value=500`, ['mm_value']],
    [`${BT}&bankroll=100&mm_model=PERCENT_BANKROLL`, ['mm_model', 'mm_value']],
    [`${BT}&selection=HOME&side=BACK&odds_max=0.5`, ['odds_max']],
    [`${BT}&selection=HOME`, ['side']],
    [`${BT}&odds_max=2`, ['odds_max', 'selection']],
  ]) assert.deepEqual(await fieldsOf(path), fields, path);
  assert.deepEqual(calls, [], 'refused before any query');
});

test('MP-REQ-UI-1046: a comparison names the configuration of the refused field (a_, b_, c_) and the shared ones unprefixed', async () => {
  assert.deepEqual(await fieldsOf(`${CMP}&b_stake=0`), ['b_stake']);
  assert.deepEqual(await fieldsOf(`${CMP}&c_selection=HOME&c_side=BACK&c_odds_min=x`), ['c_odds_min']);
  assert.deepEqual(await fieldsOf(`${CMP}&commission=1`), ['commission']);
  assert.deepEqual(await fieldsOf(`${CMP}&a_bankroll=100&a_mm_model=FIXED_STAKE&a_mm_value=0`), ['a_mm_value']);
  // A request that misses a configuration names no field: the page says the settings are invalid as a whole.
  assert.equal((await get('/api/v1/hist/compare?from=2025-09-01&to=2025-09-30&a_strategy=mp-ref-fav-back-1')).body.error.fields, undefined);
});

test('MP-REQ-UI-1046: a refusal of the FutPythonTrader layer names the API parameter, not the query layer\'s input', async () => {
  assert.deepEqual(await fieldsOf('/api/v1/fpt/search?fav_min=3&fav_max=2'), ['fav_min', 'fav_max']);
  assert.deepEqual(await fieldsOf('/api/v1/fpt/search?team=nope'), ['team']);
  assert.deepEqual(await fieldsOf('/api/v1/fpt/search?venue=home'), ['venue']);
});

test('requestFields maps the engine config paths back to the request parameters', () => {
  assert.deepEqual(requestFields(['config.strategy_definition.conditions.teams.0'], 'a_'), ['a_team']);
  assert.deepEqual(requestFields(['config.strategy_definition.side', 'config.commission'], 'b_'), ['b_side', 'commission']);
  assert.deepEqual(requestFields(['config.bookmaker', 'config.lead_minutes', 'config.strategy_definition']), [], 'the server\'s own settings are no parameter');
  assert.deepEqual(requestFields(['config.money_management.model']), ['mm_model']);
});
