// MARKET-CORE-01/02 (#100): registry fields + deterministic core football resolvers.
import test from 'node:test';
import assert from 'node:assert/strict';
import {MARKET_RULES, resolve, getMarketRule} from '../src/markets/rules.mjs';

const FT = (h, a, extra = {}) => ({status: 'FINISHED', ft_home: h, ft_away: a, ...extra});
const out = (o) => resolve(o).outcome;
const FIELDS = ['market_rule_id', 'market_type', 'venue', 'version', 'effective_from', 'effective_to', 'resolution_inputs', 'result_mapping',
  'void_policy', 'postponed_policy', 'abandoned_policy', 'dead_heat_policy', 'extra_time_policy', 'penalty_policy', 'partial_policy',
  'provenance', 'source_reference', 'created_at'];

test('registry: every #100 minimum field on every rule, ids carry the version', () => {
  for (const r of MARKET_RULES) { for (const f of FIELDS) assert.ok(f in r, `${r.market_type}.${f}`); assert.match(r.market_rule_id, /@v1$/); }
  assert.equal(getMarketRule('ASIAN_HANDICAP'), null);
  assert.throws(() => resolve({marketType: 'ASIAN_HANDICAP', selection: 'x', match: FT(1, 0)}), {code: 'UNKNOWN_MARKET'});
});

test('Match Odds / Double Chance / BTTS vectors', () => {
  assert.equal(out({marketType: 'MATCH_ODDS', selection: 'HOME', match: FT(2, 1)}), 'WIN');
  assert.equal(out({marketType: 'MATCH_ODDS', selection: 'DRAW', match: FT(2, 1)}), 'LOSE');
  assert.equal(out({marketType: 'MATCH_ODDS', selection: 'DRAW', match: FT(0, 0)}), 'WIN');
  assert.equal(out({marketType: 'DOUBLE_CHANCE', selection: 'DRAW_AWAY', match: FT(1, 1)}), 'WIN');
  assert.equal(out({marketType: 'DOUBLE_CHANCE', selection: 'HOME_DRAW', match: FT(0, 1)}), 'LOSE');
  assert.equal(out({marketType: 'BTTS', selection: 'YES', match: FT(1, 1)}), 'WIN');
  assert.equal(out({marketType: 'BTTS', selection: 'YES', match: FT(3, 0)}), 'LOSE');
});

test('Over/Under, HT and team goals: half lines only; whole/quarter lines are refused (MARKET-CORE-03)', () => {
  assert.equal(out({marketType: 'OVER_UNDER', selection: 'OVER', line: '2.5', match: FT(2, 1)}), 'WIN');
  assert.equal(out({marketType: 'OVER_UNDER', selection: 'OVER', line: '2.5', match: FT(1, 1)}), 'LOSE');
  assert.throws(() => resolve({marketType: 'OVER_UNDER', selection: 'OVER', line: '2', match: FT(1, 1)}), {code: 'UNSUPPORTED_LINE'});
  assert.throws(() => resolve({marketType: 'OVER_UNDER', selection: 'OVER', line: '2.25', match: FT(1, 1)}), {code: 'UNSUPPORTED_LINE'});
  assert.equal(out({marketType: 'HT_MATCH_ODDS', selection: 'DRAW', match: FT(3, 1, {ht_home: 0, ht_away: 0})}), 'WIN');
  assert.equal(out({marketType: 'HT_OVER_UNDER', selection: 'UNDER', line: '0.5', match: FT(3, 1, {ht_home: 0, ht_away: 0})}), 'WIN');
  assert.equal(out({marketType: 'TEAM_GOALS_OVER_UNDER', team: 'AWAY', selection: 'OVER', line: '1.5', match: FT(0, 2)}), 'WIN');
  assert.throws(() => resolve({marketType: 'TEAM_GOALS_OVER_UNDER', team: 'X', selection: 'OVER', line: '1.5', match: FT(0, 2)}), {code: 'BAD_INPUT'});
});

test('Correct Score: exact score and the "any other" buckets', () => {
  assert.equal(out({marketType: 'CORRECT_SCORE', selection: '2-1', match: FT(2, 1)}), 'WIN');
  assert.equal(out({marketType: 'CORRECT_SCORE', selection: '1-2', match: FT(2, 1)}), 'LOSE');
  assert.equal(out({marketType: 'CORRECT_SCORE', selection: 'ANY_OTHER_HOME', match: FT(4, 1)}), 'WIN');
  assert.equal(out({marketType: 'CORRECT_SCORE', selection: 'ANY_OTHER_DRAW', match: FT(4, 4)}), 'WIN');
  assert.equal(out({marketType: 'CORRECT_SCORE', selection: 'ANY_OTHER_AWAY', match: FT(1, 4)}), 'WIN');
});

test('never guessed: non-finished match or missing score is UNRESOLVED; bad scores refused; deterministic', () => {
  for (const status of ['POSTPONED', 'ABANDONED', 'LIVE']) assert.equal(resolve({marketType: 'MATCH_ODDS', selection: 'HOME', match: {status, ft_home: 1, ft_away: 0}}).status, 'UNRESOLVED');
  assert.equal(resolve({marketType: 'MATCH_ODDS', selection: 'HOME'}).reason, 'MATCH_STATUS_MISSING');
  assert.equal(resolve({marketType: 'HT_MATCH_ODDS', selection: 'HOME', match: FT(1, 0)}).status, 'UNRESOLVED');
  assert.throws(() => resolve({marketType: 'MATCH_ODDS', selection: 'HOME', match: FT(-1, 0)}), {code: 'BAD_INPUT'});
  assert.throws(() => resolve({marketType: 'MATCH_ODDS', selection: 'HOME', match: FT(1.5, 0)}), {code: 'BAD_INPUT'});
  const a = resolve({marketType: 'OVER_UNDER', selection: 'UNDER', line: '3.5', match: FT(2, 2)});
  assert.deepEqual(a, resolve({marketType: 'OVER_UNDER', selection: 'UNDER', line: '3.5', match: FT(2, 2)}));
  assert.equal(a.market_rule_id, 'OVER_UNDER@v1'); assert.ok(Object.isFrozen(a));
});
