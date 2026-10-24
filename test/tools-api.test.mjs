// MP-UI-PR-005 / MATH-CORE-08 (#94): the HTTP contract of the Trading Tools. Every tool answers in the v1 envelope with
// the exact values, the rounded ones and the display values; it never touches the database; every refusal is a 400 that
// names the parameter; the values shown are the server's (the page computes nothing, MP-WEB-011).
import assert from 'node:assert/strict';
import test from 'node:test';
import {createEndpoints, handleV1} from '../src/api/v1.mjs';
import {TOOLS, TOOLS_VERSION} from '../src/api/tools.mjs';
import {MATH_CORE_VERSION} from '../src/math/core.mjs';

const deps = {withClient: async () => { throw new Error('the tools never use the database'); }, tc: {}, codeVersion: 'test-sha', now: () => new Date('2026-10-24T12:00:00Z')};
const get = (path, method = 'GET') => handleV1({method, url: new URL(`http://localhost${path}`)}, deps);
const call = (tool, query) => get(`/api/v1/tools/${tool}?${new URLSearchParams(query)}`);

const CASES = {
  odds: [{odds: '2,10 3,40 3,60'}, d => assert.deepEqual([d.book_percent, d.overround_percent, d.selections[0].fair_odds], ['104.81', '4.81', '2.201'])],
  kelly: [{bankroll: '1000', odds: '2', probability: '60', fraction: '25'}, d => assert.deepEqual([d.stake, d.kelly_full_percent, d.kelly_fractional_percent, d.governing_limit], ['50.00', '20.00', '5.00', 'KELLY'])],
  ev: [{stake: '10', odds: '2,10', probability: '50', commission: '5'}, d => assert.deepEqual([d.expected_value, d.roi_percent, d.edge_percent, d.break_even_percent], ['0.22', '2.25', '5.00', '48.90'])],
  liability: [{stake: '10', odds: '3', commission: '5', bankroll: '15'}, d => assert.deepEqual([d.liability, d.if_selection_loses, d.if_selection_wins, d.break_even_percent, d.liability_percent_of_bankroll], ['20.00', '9.50', '-20.00', '32.20', '133.33'])],
  hedge: [{side: 'BACK', stake: '10', odds: '3', exit_odds: '2', commission: '5'}, d => assert.deepEqual([d.hedge_side, d.hedge_stake, d.after.if_wins, d.after.if_loses, d.liquidity], ['LAY', '15.00', '4.75', '4.75', 'UNAVAILABLE'])],
  dutching: [{total: '100', odds: '4;5;6'}, d => assert.deepEqual(d.selections.map(s => s.stake), ['40.54', '32.43', '27.03'])],
  poisson: [{xg_home: '1.4', xg_away: '1.1', max_goals: '3'}, d => {
    assert.deepEqual(d.match_odds.map(m => m.percent), ['43.80', '26.63', '29.56']);
    assert.equal(d.grid.cells.length, 16, '0..3 per side');
    assert.equal(d.top_scores.length, 5);
  }],
};

test('every tool answers in the v1 envelope with exact, rounded and display values, without the database', async () => {
  assert.deepEqual(Object.keys(CASES).sort(), Object.keys(TOOLS).sort());
  for (const [tool, [query, check]] of Object.entries(CASES)) {
    const {status, body} = await call(tool, query);
    assert.equal(status, 200, `${tool}: ${JSON.stringify(body)}`);
    assert.equal(body.endpoint, `/api/v1/tools/${tool}`);
    assert.deepEqual(body.meta.provenance, {source: 'computation', mode: 'MANUAL', engine: TOOLS_VERSION, math: MATH_CORE_VERSION, upstream_calls: 0});
    const d = body.data;
    assert.deepEqual([d.tool, d.tools_version, d.formula_version, d.mode], [tool, TOOLS_VERSION, MATH_CORE_VERSION, 'MANUAL']);
    assert.ok(d.result && d.display && Array.isArray(d.warnings) && d.normalized_inputs, tool);
    assert.deepEqual(d.display_rounding, {mode: 'HALF_EVEN', money_places: 2, percent_places: 2, odds_places: 3});
    check(d.display);
    // Every number reaches the page as text: no binary float is ever computed for it.
    const numbers = [];
    JSON.stringify(d, (_k, v) => { if (typeof v === 'number') numbers.push(v); return v; });
    assert.ok(numbers.every(Number.isInteger), `${tool}: only integer indexes are numbers`);
  }
});

test('the registry lists the tools as GET endpoints without database', () => {
  const tools = createEndpoints({}).filter(e => e.path.startsWith('/api/v1/tools/'));
  assert.deepEqual(tools.map(e => e.path.slice('/api/v1/tools/'.length)).sort(), Object.keys(TOOLS).sort());
  assert.ok(tools.every(e => e.db === false));
});

test('refusals are 400 and name the parameter; nothing else gets through', async () => {
  const refused = async (tool, query, field) => {
    const {status, body} = await call(tool, query);
    assert.equal(status, 400, `${tool} ${JSON.stringify(query)}`);
    assert.equal(body.error.code, 'BAD_REQUEST');
    assert.ok(body.error.message.startsWith(`${field}`), `${tool}: ${body.error.message}`);
  };
  await refused('odds', {odds: ''}, 'odds');
  await refused('odds', {odds: '2 1'}, 'odds[1]');
  await refused('odds', {odds: '2 abc'}, 'odds[1]');
  await refused('odds', {odds: Array(21).fill('2').join(' ')}, 'odds');
  await refused('kelly', {bankroll: '1000', odds: '2', probability: '100'}, 'probability');
  await refused('kelly', {bankroll: '1000', odds: '2', probability: '0'}, 'probability');
  await refused('kelly', {bankroll: '-5', odds: '2', probability: '60'}, 'bankroll');
  await refused('kelly', {bankroll: '1000', odds: '2', probability: '60', fraction: '0'}, 'fraction');
  await refused('kelly', {bankroll: '1000', odds: '2', probability: '60', max_bankroll: '101'}, 'max_bankroll');
  await refused('ev', {stake: '10', odds: '1', probability: '50'}, 'odds');
  await refused('ev', {stake: '10', odds: '2', probability: '50', commission: '100'}, 'commission');
  await refused('ev', {stake: '1e3', odds: '2', probability: '50'}, 'stake');
  await refused('liability', {stake: '0', odds: '3'}, 'stake');
  await refused('hedge', {side: 'BACK', stake: '10', odds: '3', exit_odds: '1'}, 'exit_odds');
  await refused('dutching', {total: '100', odds: '2'}, 'odds');
  await refused('poisson', {xg_home: '11', xg_away: '1'}, 'xg_home');
  await refused('poisson', {xg_home: '1', xg_away: '1', max_goals: '9'}, 'max_goals');
  // The v1 layer: required, unknown, repeated, wrong method, a bad side.
  const missing = await call('ev', {odds: '2', probability: '50'});
  assert.deepEqual([missing.status, missing.body.error.message], [400, 'missing required parameter: stake']);
  assert.equal((await call('ev', {stake: '10', odds: '2', probability: '50', note: 'x'})).body.error.code, 'UNKNOWN_PARAMETER');
  assert.equal((await get('/api/v1/tools/ev?stake=1&stake=2&odds=2&probability=50')).status, 400);
  assert.equal((await get('/api/v1/tools/ev?stake=1&odds=2&probability=50', 'POST')).status, 405);
  assert.equal((await call('hedge', {side: 'SELL', stake: '10', odds: '3', exit_odds: '2'})).status, 400);
  assert.equal((await call('ev', {stake: '1'.repeat(301), odds: '2', probability: '50'})).status, 400, 'parameter length');
});

test('display values are rounded half-even to the cent, two decimals of percent and three of odds', async () => {
  // EV = 0.5·10·1.17·0.95 − 5 = 0.5575: shown 0.56 (half-even), never truncated to 0.55.
  const ev = (await call('ev', {stake: '10', odds: '2.17', probability: '50', commission: '5'})).body.data;
  assert.deepEqual([ev.result.expected_value, ev.display.expected_value, ev.display.fair_odds, ev.display.roi_percent], ['0.5575', '0.56', '2.000', '5.58']);
  // 0.125 → 0.12 (half-even to the even cent), 0.135 → 0.14.
  const a = (await call('liability', {stake: '0.125', odds: '2'})).body.data.display;
  const b = (await call('liability', {stake: '0.135', odds: '2'})).body.data.display;
  assert.deepEqual([a.liability, b.liability], ['0.12', '0.14']);
});

test('the server signs the loss and gives no fair odds for a probability shown as zero', async () => {
  const ev = (await call('ev', {stake: '10', odds: '2', probability: '50'})).body.data.display;
  assert.equal(ev.loss_if_loses, '-10.00', 'the page shows the server value, it never builds the sign (MP-WEB-011)');
  const tiny = (await call('poisson', {xg_home: '0.000000000000000001', xg_away: '1'})).body.data.display;
  assert.deepEqual([tiny.btts.yes_percent, tiny.btts.yes_fair_odds], ['0.00', null]);
  assert.equal((await call('dutching', {total: '0,01', odds: '3 3 3'})).body.error.message.startsWith('total:'), true);
});

test('no upper limit on amounts beyond the parameter length (no arbitrary money limit)', async () => {
  const {status, body} = await call('liability', {stake: '123456789012345', odds: '1.01'});
  assert.equal(status, 200);
  assert.equal(body.data.display.liability, '1234567890123.45');
});
