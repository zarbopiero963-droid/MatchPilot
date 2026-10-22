import {test} from 'node:test';
import assert from 'node:assert/strict';
import {decide, settle, RULE} from '../src/signals/simulated.mjs';

const an = (h, a, hn = 10, anN = 10) => ({method: {cutoff_before: '2025-01-01', pit: 'PIT_NOT_VERIFIED'}, teams: {
  home: {venues: {both: {windows: {10: {n: hn, over25_rate: h, source_match_ids: []}}}}},
  away: {venues: {both: {windows: {10: {n: anN, over25_rate: a, source_match_ids: []}}}}}}});

test('signal when the average over 2.5 rate reaches the threshold', () => {
  assert.equal(decide(an('0.7000', '0.5000')).decision, 'SIGNAL');
  assert.equal(decide(an('0.6000', '0.5000')).decision, 'NO_SIGNAL');
});
test('insufficient data below min_n or without a team', () => {
  assert.equal(decide(an('0.9000', '0.9000', RULE.min_n - 1)).decision, 'INSUFFICIENT_DATA');
  assert.equal(decide({teams: {home: null, away: null}}).decision, 'INSUFFICIENT_DATA');
});
test('settlement uses the stored final score and odd', () => {
  assert.deepEqual(settle({result_status: 'FINAL', home_score: 2, away_score: 1, odd_over25: '1.80'}, 'SIGNAL'), {outcome: 'HIT', profit: '0.80'});
  assert.deepEqual(settle({result_status: 'FINAL', home_score: 1, away_score: 1, odd_over25: null}, 'SIGNAL'), {outcome: 'MISS', profit: null});
  assert.equal(settle({result_status: 'SCHEDULED', home_score: null, away_score: null}, 'SIGNAL').outcome, 'PENDING');
  assert.equal(settle({}, 'NO_SIGNAL').outcome, 'NOT_APPLICABLE');
});
