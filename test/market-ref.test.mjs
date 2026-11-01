// MP-MARKET-REF-01: the provider market -> MatchPilot market reference parser, tested on the selection texts really
// observed in the API-FOOTBALL verification of 2026-11-01 (only bet ids, names and selection texts; no prices).
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMarketRef, marketRefKey, APIFOOTBALL_PREMATCH, APIFOOTBALL_LIVE, SOURCES } from '../src/markets/market-ref.mjs';

const pre = (bet_id, value) => parseMarketRef({source: 'apifootball:prematch', bet_id, value});
const live = (bet_id, value, handicap = null) => parseMarketRef({source: 'apifootball:live', bet_id, value, handicap});

// Observed pre-match selections (Bet365, Liverpool-Arsenal, 2026-11-01) for every bet id of the explicit table.
const OBSERVED_PREMATCH = {
  1: ['Home', 'Draw', 'Away'], 2: ['Home', 'Away'], 3: ['Home', 'Draw', 'Away'],
  4: ['Home -1.25', 'Away -1.25', 'Home -1', 'Away -1', 'Home -0.75', 'Away -0.75'],
  5: ['Over 1.5', 'Under 1.5', 'Over 2.5', 'Under 2.5', 'Over 3.5', 'Under 3.5'],
  6: ['Over 1.5', 'Under 1.5', 'Over 2.5', 'Under 2.5'], 26: ['Over 1.5', 'Under 1.5', 'Over 2.5', 'Under 2.5'],
  7: ['Home/Draw', 'Home/Away', 'Draw/Away', 'Draw/Draw', 'Home/Home', 'Draw/Home'], 8: ['Yes', 'No'],
  9: ['Home -1', 'Away -1', 'Draw -1', 'Home -2', 'Draw -2', 'Away -2'],
  10: ['1:0', '2:0', '2:1', '3:0', '3:1', '3:2'], 31: ['1:0', '2:0', '2:1'], 12: ['Home/Draw', 'Home/Away', 'Draw/Away'],
  13: ['Home', 'Draw', 'Away'], 16: ['Over 1.5', 'Under 1.5', 'Over 2.5'], 17: ['Over 1.5', 'Under 1.5', 'Over 2.5'],
  19: ['Home -0.75', 'Away -0.75', 'Home -0.5', 'Away -0.5', 'Home -0.25', 'Away -0.25'], 21: ['Odd', 'Even'],
  45: ['Over 9.5', 'Under 9.5'], 50: ['Over 1.5', 'Under 1.5', 'Over 1.75', 'Under 1.75', 'Over 2.25', 'Under 2.25'],
  80: ['Over 3.5', 'Under 3.5', 'Over 4.5', 'Under 4.5']
};
// Observed in-play selections (Lazio-Cagliari at 53', 2026-11-01): [value, handicap].
const OBSERVED_LIVE = {
  59: [['Home', null], ['Draw', null], ['Away', null]],
  36: [['Over', '3.5'], ['Under', '3.5'], ['Over', '3.75'], ['Under', '3.75'], ['Over', '3'], ['Under', '3']],
  25: [['Over', '5.5'], ['Under', '5.5'], ['Over', '3.5'], ['Under', '3.5']],
  33: [['Home', '-0.75'], ['Away', '0.75'], ['Home', '-1'], ['Away', '1'], ['Home', '-0.5'], ['Away', '0.5']],
  72: [['Home or Draw', null], ['Away or Draw', null], ['Home or Away', null]],
  48: [['Home', null], ['Away', null]], 43: [['Yes', null], ['No', null]],
  20: [['Over', '8'], ['Exactly', '8'], ['Under', '8'], ['Over', '7'], ['Exactly', '7'], ['Under', '7']],
  23: [['1-0', null], ['2-0', null], ['2-1', null]]
};

test('MP-MARKET-REF-01 every observed selection of the explicit tables parses, none is guessed', () => {
  assert.deepEqual(Object.keys(OBSERVED_PREMATCH).map(Number).sort((a, b) => a - b), Object.keys(APIFOOTBALL_PREMATCH).map(Number).sort((a, b) => a - b));
  assert.deepEqual(Object.keys(OBSERVED_LIVE).map(Number).sort((a, b) => a - b), Object.keys(APIFOOTBALL_LIVE).map(Number).sort((a, b) => a - b));
  for (const [id, values] of Object.entries(OBSERVED_PREMATCH)) for (const v of values) assert.equal(pre(id, v).status, 'PARSED', `pre ${id} ${v}`);
  for (const [id, values] of Object.entries(OBSERVED_LIVE)) for (const [v, h] of values) assert.equal(live(id, v, h).status, 'PARSED', `live ${id} ${v} ${h}`);
  assert.deepEqual(SOURCES, ['apifootball:prematch', 'apifootball:live']);
});

test('MP-MARKET-REF-01 pre-match: line and side are read from the selection text, in the #100 vocabulary', () => {
  const pick = r => [r.market_type, r.period, r.team, r.selection, r.line];
  assert.deepEqual(pick(pre(1, 'Draw')), ['MATCH_ODDS', 'FT', null, 'DRAW', null]);
  assert.deepEqual(pick(pre(5, 'Over 2.5')), ['OVER_UNDER', 'FT', null, 'OVER', '2.5']);
  assert.deepEqual(pick(pre(6, 'Under 1.5')), ['HT_OVER_UNDER', '1H', null, 'UNDER', '1.5']);
  assert.deepEqual(pick(pre(4, 'Home -1.25')), ['ASIAN_HANDICAP', 'FT', null, 'HOME', '-1.25']);
  assert.deepEqual(pick(pre(9, 'Draw -2')), ['EUROPEAN_HANDICAP', 'FT', null, 'DRAW', '-2']);
  assert.deepEqual(pick(pre(10, '2:1')), ['CORRECT_SCORE', 'FT', null, '2-1', null]);
  assert.deepEqual(pick(pre(12, 'Draw/Away')), ['DOUBLE_CHANCE', 'FT', null, 'DRAW_AWAY', null]);
  assert.deepEqual(pick(pre(7, 'Draw/Home')), ['HT_FT', 'FT', null, 'DRAW/HOME', null]);
  assert.deepEqual(pick(pre(16, 'Over 1.5')), ['TEAM_GOALS_OVER_UNDER', 'FT', 'HOME', 'OVER', '1.5']);
  assert.deepEqual(pick(pre(17, 'Under 2.5')), ['TEAM_GOALS_OVER_UNDER', 'FT', 'AWAY', 'UNDER', '2.5']);
  assert.equal(marketRefKey(pre(5, 'Over 2.5')), 'OVER_UNDER|FT||OVER|2.5');
});

test('MP-MARKET-REF-01 in-play: line from the handicap field, provider order normalised, markets never merged by name', () => {
  const pick = r => [r.market_type, r.selection, r.line];
  assert.deepEqual(pick(live(36, 'Over', '3.75')), ['GOAL_LINE', 'OVER', '3.75']);
  // Over/Under Line (36) and Match Goals (25) are different markets in-play too: same side and line, different keys.
  assert.notEqual(live(36, 'Over', '3.5').key, live(25, 'Over', '3.5').key);
  assert.deepEqual(pick(live(33, 'Away', '0.75')), ['ASIAN_HANDICAP', 'AWAY', '0.75']);
  assert.deepEqual(pick(live(72, 'Away or Draw')), ['DOUBLE_CHANCE', 'DRAW_AWAY', null], 'same reference as pre-match Draw/Away');
  assert.equal(live(72, 'Away or Draw').key, pre(12, 'Draw/Away').key);
  assert.deepEqual(pick(live(20, 'Exactly', '8')), ['CORNERS_OVER_UNDER_3WAY', 'EXACTLY', '8']);
  assert.deepEqual(pick(live(23, '2-1')), ['CORRECT_SCORE', '2-1', null]);
  // Pre-match Home/Away and in-play Draw No Bet stay different markets; Goal Line stays apart from Goals Over/Under.
  assert.notEqual(pre(2, 'Home').market_type, live(48, 'Home').market_type);
  assert.notEqual(pre(50, 'Over 2.5').key, pre(5, 'Over 2.5').key);
  // The same bet id means different markets in the two sources: 25 pre-match is unknown, 25 live is Match Goals.
  assert.equal(pre(25, 'Over 2.5').status, 'UNCLASSIFIED');
  assert.equal(live(25, 'Over', '2.5').market_type, 'OVER_UNDER');
});

test('MP-MARKET-REF-01 settleable only where a #100 rule accepts exactly that market, selection and line', () => {
  assert.equal(pre(5, 'Over 2.5').settleable, true);
  assert.equal(pre(1, 'Home').settleable, true);
  assert.equal(pre(10, '1:0').settleable, true);
  assert.equal(pre(16, 'Over 1.5').settleable, true, 'team goals with its team');
  assert.equal(live(36, 'Over', '3.75').settleable, false, 'quarter line: MARKET-CORE-03');
  assert.equal(live(36, 'Over', '3').settleable, false, 'whole line: MARKET-CORE-03');
  assert.equal(pre(4, 'Home -1.25').settleable, false, 'no Asian handicap rule yet');
  assert.equal(pre(7, 'Home/Home').settleable, false);
  assert.equal(pre(45, 'Over 9.5').settleable, false, 'corners: no rule yet');
});

test('MP-MARKET-REF-01 what is not recognised stays UNCLASSIFIED with the raw provider fields', () => {
  for (const [r, reason] of [
    [pre(92, 'Christos Tzolis'), /not in the explicit table/],
    [pre(5, 'Over'), /selection not recognised/],
    [pre(5, 'Over two'), /selection not recognised/],
    [pre(1, 'Liverpool'), /selection not recognised/],
    [pre(12, 'Home/Home'), /selection not recognised/],
    [live(36, 'Exactly', '3'), /selection not recognised/],
    [live(33, 'Home', null), /selection not recognised/],
    [parseMarketRef({source: 'other', bet_id: 1, value: 'Home'}), /unknown source/],
    [pre('x', 'Home'), /not in the explicit table/]
  ]) {
    assert.equal(r.status, 'UNCLASSIFIED');
    assert.match(r.reason, reason);
    assert.ok(r.raw && 'value' in r.raw, 'the raw provider fields are kept');
  }
  // Lines are kept as normalised decimal text, never as floats.
  assert.equal(pre(5, 'Over 2.50').line, '2.5');
  assert.equal(live(33, 'Home', '+0').line, '0');
});

test('MP-MARKET-REF-01 review: ambiguous, signed, oversized or malformed inputs are never guessed', () => {
  const unclassified = [
    // in-play Asian handicap: a line in the text must agree with the handicap field
    live(33, 'Home -1', '-0.5'), live(33, 'Home foo', '-0.5'), live(33, 'Draw', '0'),
    // Asian handicap has no Draw; over/under lines are never signed
    pre(4, 'Draw -1'), pre(19, 'Draw -0.5'), pre(5, 'Over -2.5'), pre(5, 'Over +2.5'), live(25, 'Over', '-2.5'), live(20, 'Under', '-8'),
    // lines are short decimal text: no huge numbers, no exponent, no excess precision
    pre(5, 'Over 12345678901234567890.5'), pre(5, 'Over 1e3'), pre(5, 'Over 2.123456'), live(36, 'Over', '1e1'),
    // bet ids are integers or plain digit strings only
    pre('0x5', 'Over 2.5'), pre(' 5 ', 'Over 2.5'), pre(5.5, 'Over 2.5'), pre('5.0', 'Over 2.5'), pre(true, 'Home')
  ];
  for (const r of unclassified) assert.equal(r.status, 'UNCLASSIFIED', JSON.stringify(r.raw));
  assert.deepEqual([live(33, 'Home -0.5', '-0.5').selection, live(33, 'Home -0.5', '-0.5').line], ['HOME', '-0.5'], 'agreeing line accepted');
  assert.equal(pre('5', 'Over 2.5').status, 'PARSED', 'a plain digit string is a bet id');
  for (const zero of ['-0', '+0.0', '0.00', '-0.0']) assert.equal(live(33, 'Home', zero).line, '0', zero);
  assert.equal(pre(4, 'Home +0.50').line, '0.5');
  assert.equal(pre(4, 'Home -0').line, '0');
});
