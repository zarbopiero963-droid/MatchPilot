// WEB-TOOLS-01 (#94, #96, #100): the calculators, the Money Management registry and stake, and the market rules as v1
// endpoints. Vectors computed by hand; every endpoint runs without a database and refuses a bad input with 400 naming it.
import assert from 'node:assert/strict';
import test from 'node:test';
import {handleV1} from '../src/api/v1.mjs';
import {postMatch} from '../src/analysis/match-analysis.mjs';

const call = async query => {
  const {status, body} = await handleV1({method: 'GET', url: new URL(`http://mp.local${query}`)},
    {withClient: () => { throw new Error('no database for the calculators'); }, tc: {}});
  return {status, body};
};
const display = async query => {
  const {status, body} = await call(query);
  assert.equal(status, 200, JSON.stringify(body));
  return body.data.display;
};

test('odds: implied probabilities, book, overround and fair odds (proportional margin removal)', async () => {
  const {status, body} = await call('/api/v1/tools/odds?odds=2%204');
  assert.equal(status, 200);
  // 1/2 + 1/4 = 0.75; fair 0.5/0.75 = 2/3 and 1/3.
  assert.equal(body.data.result.book, '0.75');
  assert.equal(body.data.display.selections[0].fair_percent, '66.67');
  assert.equal(body.data.display.selections[1].fair_odds, '3.000');
  assert.equal(body.data.display.overround_percent, '-25.00');
  assert.ok(body.data.notes.includes('BOOK_BELOW_ONE'));
  assert.equal(body.meta.provenance.upstream_calls, 0);
  // Italian decimal commas and semicolons are accepted.
  assert.deepEqual((await display('/api/v1/tools/odds?odds=2,10%3B3,40%3B3,60')).selections.map(s => s.odds), ['2.100', '3.400', '3.600']);
  const single = await call('/api/v1/tools/odds?odds=2.5');
  assert.equal(single.body.data.display.overround_percent, null);
  assert.equal(single.body.data.display.selections[0].implied_percent, '40.00');
});

test('ev: back and lay expected value, edge and outcomes net of commission', async () => {
  // BACK 10 @ 2.2, p = 50%, 5% commission: wins 12 × 0.95 = 11.40, loses 10 → EV 0.70.
  const back = await display('/api/v1/tools/ev?odds=2.2&probability=50&stake=10&commission=5');
  assert.deepEqual([back.expected_value, back.if_wins, back.if_loses, back.edge_percent, back.fair_odds], ['0.70', '11.40', '-10.00', '10.00', '2.000']);
  // LAY 10 @ 2.2: liability 12; EV = 0.5 × 10 − 0.5 × 12 = −1.
  const lay = await display('/api/v1/tools/ev?odds=2.2&probability=50&stake=10&side=LAY');
  assert.deepEqual([lay.expected_value, lay.liability, lay.if_wins, lay.if_loses], ['-1.00', '12.00', '-12.00', '10.00']);
});

test('kelly: full and fractional stake, no edge no stake', async () => {
  // b = 1.2, p = 0.5: f* = (0.6 − 0.5) / 1.2 = 0.083…; half Kelly on 1000 = 41.66 (rounded down).
  const k = await display('/api/v1/tools/kelly?odds=2.2&probability=50&bankroll=1000&fraction=50');
  assert.deepEqual([k.kelly_percent, k.applied_percent, k.stake], ['8.33', '4.17', '41.66']);
  const none = await call('/api/v1/tools/kelly?odds=1.8&probability=50&bankroll=1000');
  assert.equal(none.body.data.display.stake, '0.00');
  assert.ok(none.body.data.notes.includes('NO_EDGE_NO_STAKE'));
});

test('position: liability and outcomes, stake from liability for a lay', async () => {
  const lay = await display('/api/v1/tools/position?side=LAY&odds=4&liability=30');
  assert.deepEqual([lay.stake, lay.liability, lay.if_wins, lay.if_loses, lay.break_even_percent], ['10.00', '30.00', '-30.00', '10.00', '25.00']);
  const both = await call('/api/v1/tools/position?odds=4&stake=10&liability=30');
  assert.equal(both.status, 400);
  assert.match(both.body.error.message, /^stake: give either stake or liability/);
});

test('hedge: full green-up of a back and of a lay, partial hedge', async () => {
  // BACK 10 @ 3, lay at 2: lay stake 15 → +5 either way.
  const back = await display('/api/v1/tools/hedge?odds=3&stake=10&current_odds=2');
  assert.deepEqual([back.hedge_side, back.hedge_stake, back.after.if_wins, back.after.if_loses], ['LAY', '15.00', '5.00', '5.00']);
  // LAY 10 @ 2, back at 3: back 6.67 → 3.34 / 3.33 (the stake is rounded to the cent).
  const lay = await display('/api/v1/tools/hedge?side=LAY&odds=2&stake=10&current_odds=3');
  assert.deepEqual([lay.hedge_side, lay.hedge_stake, lay.after.if_wins, lay.after.if_loses], ['BACK', '6.67', '3.34', '3.33']);
  const half = await display('/api/v1/tools/hedge?odds=3&stake=10&current_odds=2&share=50');
  assert.equal(half.hedge_stake, '7.50');
});

test('dutching: equal return over the selections, stakes to the cent', async () => {
  const d = await display('/api/v1/tools/dutching?odds=4%205%206&total=100');
  assert.deepEqual(d.selections.map(s => s.stake), ['40.54', '32.43', '27.03']);
  assert.equal(d.placed, '100.00');
  assert.equal(d.book_percent, '61.67');
  assert.equal((await call('/api/v1/tools/dutching?odds=4&total=100')).status, 400, 'one selection is not a dutch');
});

test('poisson: exact goal lines and BTTS, 1X2 on the grid, score cells', async () => {
  const p = await display('/api/v1/tools/poisson?xg_home=1.6&xg_away=1.1');
  // P(0 goals) = e^-2.7 = 0.0672…; BTTS = (1 − e^-1.6)(1 − e^-1.1) = 0.5324…
  assert.equal(p.lines[0].under_percent, '6.72');
  assert.equal(p.btts.yes_percent, '53.24');
  assert.deepEqual(p.match_odds.map(m => m.selection), ['HOME', 'DRAW', 'AWAY']);
  assert.equal(p.grid.cells.length, 36);
  assert.equal(p.grid.cells.find(c => c.home === 0 && c.away === 0).percent, '6.72');
  assert.equal(p.grid_coverage_percent, '100.00');
  const sum = p.match_odds.reduce((acc, m) => acc + Number(m.percent), 0);
  assert.ok(Math.abs(sum - 100) < 0.02, `1X2 sums to 100%: ${sum}`);
  const zero = await display('/api/v1/tools/poisson?xg_home=0&xg_away=0&max_goals=2');
  assert.equal(zero.lines[0].under_percent, '100.00');
  assert.equal((await call('/api/v1/tools/poisson?xg_home=11&xg_away=1')).status, 400);
});

test('every refusal is a 400 naming the parameter; unknown parameters are refused', async () => {
  for (const [query, field] of [['/api/v1/tools/ev?odds=1&probability=50&stake=10', 'odds'], ['/api/v1/tools/ev?odds=2&probability=100&stake=10', 'probability'],
    ['/api/v1/tools/ev?odds=2&probability=50&stake=0', 'stake'], ['/api/v1/tools/ev?odds=2&probability=50&stake=1&side=X', 'side'],
    ['/api/v1/tools/ev?odds=2&probability=50&stake=1&commission=100', 'commission'], ['/api/v1/tools/odds?odds=2%20abc', 'odds[1]'],
    ['/api/v1/tools/kelly?odds=2&probability=50&bankroll=1&fraction=0', 'fraction'], ['/api/v1/mm/stake?model=KELLY&value=1&bankroll=1&odds=2', 'model']]) {
    const {status, body} = await call(query);
    assert.equal(status, 400, query);
    assert.equal(body.error.code, 'BAD_REQUEST');
    assert.ok(body.error.message.startsWith(`${field}:`), `${query}: ${body.error.message}`);
  }
  assert.equal((await call('/api/v1/tools/odds?odds=2&x=1')).body.error.code, 'UNKNOWN_PARAMETER');
  assert.equal((await call('/api/v1/tools/odds')).status, 400, 'odds is required');
});

test('money management: registry and the stake of a profile on a simulated account', async () => {
  const {body} = await call('/api/v1/mm/models');
  assert.equal(body.data.total, 16);
  assert.equal(body.data.implemented, 4);
  assert.deepEqual(body.data.models.filter(m => m.certification_status === 'IMPLEMENTED').map(m => m.type_id),
    ['FIXED_STAKE', 'FIXED_LIABILITY', 'PERCENT_BANKROLL', 'LIABILITY_PERCENT_BANKROLL']);
  // 2% of 1000 on a lay at 3: stake 20, liability 40.
  const lay = await call('/api/v1/mm/stake?model=PERCENT_BANKROLL&value=2&bankroll=1000&odds=3&side=LAY');
  assert.equal(lay.body.data.result.decision, 'ALLOW');
  assert.deepEqual([lay.body.data.display.adjusted_stake, lay.body.data.display.adjusted_liability], ['20.00', '40.00']);
  // A liability cap reduces the stake: max liability 30 at 3 → stake 15.
  const capped = await call('/api/v1/mm/stake?model=PERCENT_BANKROLL&value=2&bankroll=1000&odds=3&side=LAY&max_liability=30');
  assert.equal(capped.body.data.result.decision, 'REDUCE');
  assert.deepEqual(capped.body.data.result.caps_triggered, ['max_liability']);
  assert.equal(capped.body.data.display.adjusted_stake, '15.00');
  // The stake never exceeds what the account holds.
  const poor = await call('/api/v1/mm/stake?model=FIXED_STAKE&value=50&bankroll=20&odds=2');
  assert.equal(poor.body.data.display.adjusted_stake, '20.00');
  assert.deepEqual(poor.body.data.result.caps_triggered, ['available_bankroll']);
});

test('market rules registry and the settled markets of a finished match (#25)', async () => {
  const {body} = await call('/api/v1/markets/rules');
  assert.equal(body.data.version, 2);
  assert.ok(body.data.rules.some(r => r.market_rule_id === 'MATCH_ODDS@v2'));
  const post = postMatch({result_status: 'FINAL', home_score: 2, away_score: 1, odd_home: '1.900', odd_draw: '3.4', odd_away: '4.2',
    odd_over25: '1.8', odd_under25: '2.0', odd_btts_yes: '1.7', favorite_side: 'HOME', favorite_odd: '1.900'});
  assert.equal(post.status, 'SETTLED');
  assert.deepEqual(post.markets.map(m => [m.market_type, m.line, m.winning_selection, m.price]), [
    ['MATCH_ODDS', null, 'HOME', '1.900'], ['OVER_UNDER', '1.5', 'OVER', null], ['OVER_UNDER', '2.5', 'OVER', '1.8'],
    ['OVER_UNDER', '3.5', 'UNDER', null], ['BTTS', null, 'YES', '1.7'], ['CORRECT_SCORE', null, '2-1', null]]);
  assert.deepEqual(post.favourite, {side: 'HOME', odds: '1.900', won: true});
  assert.equal(postMatch({result_status: 'NOT_STARTED', home_score: null, away_score: null}).status, 'NOT_SETTLED');
  assert.equal(postMatch({result_status: 'FINAL', home_score: 0, away_score: 0, favorite_side: 'EVEN'}).favourite.won, null);
});

test('the calculators are listed in the endpoint registry', async () => {
  const {body} = await call('/api/v1/endpoints');
  const paths = body.data.endpoints.map(e => e.path);
  for (const path of ['/api/v1/tools/odds', '/api/v1/tools/ev', '/api/v1/tools/kelly', '/api/v1/tools/position', '/api/v1/tools/hedge',
    '/api/v1/tools/dutching', '/api/v1/tools/poisson', '/api/v1/mm/models', '/api/v1/mm/stake', '/api/v1/markets/rules']) assert.ok(paths.includes(path), path);
});
