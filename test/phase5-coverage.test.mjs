import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_TOKENS } from '../src/providers/futpython/schema.mjs';
import { coverageClass, coverageTags, isNonemptyValue, phase5Gate } from '../src/providers/futpython/coverage.mjs';

test('coverage density uses the stored nonempty and scoped rows, not a third bucket', () => {
  assert.equal(coverageClass(10, 0), 'always-empty');
  assert.equal(coverageClass(10, 9), 'dense');
  assert.equal(coverageClass(10, 8), 'sparse');
  assert.equal(coverageClass(161777, 161777), 'dense');
  assert.equal(coverageClass(0, 0), null);
  assert.equal(isNonemptyValue('0'), true);
  assert.equal(isNonemptyValue(' N/A '), false);
  assert.equal(isNonemptyValue('-'), false);
  assert.deepEqual(EMPTY_TOKENS.includes('n/a'), true);
});

test('scope tags are independent and are omitted when the evidence does not require them', () => {
  const everywhere = {
    leagues_present: 106,
    leagues_total: 106,
    season_gap_leagues: 0,
    introduced_late_leagues: 0,
    missing_latest_leagues: 0,
    comparable_leagues: 106
  };
  assert.deepEqual(coverageTags(everywhere), []);
  const todayOnly = {
    leagues_present: 0,
    leagues_total: 106,
    season_gap_leagues: 0,
    introduced_late_leagues: 0,
    missing_latest_leagues: 0,
    comparable_leagues: 0
  };
  assert.deepEqual(coverageTags(todayOnly), ['league-specific', 'season-specific']);
  const introduced = {
    leagues_present: 4,
    leagues_total: 106,
    season_gap_leagues: 4,
    introduced_late_leagues: 4,
    missing_latest_leagues: 0,
    comparable_leagues: 4
  };
  assert.deepEqual(coverageTags(introduced), ['league-specific', 'season-specific', 'newly-introduced']);
  const mixedStart = {...introduced, introduced_late_leagues: 3};
  assert.equal(coverageTags(mixedStart).includes('newly-introduced'), false);
  const gone = {
    leagues_present: 2,
    leagues_total: 106,
    season_gap_leagues: 2,
    introduced_late_leagues: 0,
    missing_latest_leagues: 2,
    comparable_leagues: 2
  };
  assert.deepEqual(coverageTags(gone), ['league-specific', 'season-specific', 'deprecated-field']);
});

test('phase5 gate stays closed until the independent recount matches', () => {
  const ok = {
    payload_mismatches: 0,
    rollup_mismatches: 0,
    class_mismatches: 0,
    registry_fields: 325,
    global_fields: 325,
    missing_global: 0,
    unclassified: 0,
    dataset_rows: 1,
    league_rows: 1,
    season_rows: 1,
    period_rows: 1,
    team_rows: 1,
    normalized_rows: 324,
    normalized_names: 324,
    historical_team_unresolved: 0
  };
  assert.equal(phase5Gate(ok), true);
  assert.equal(phase5Gate({...ok, payload_mismatches: 1}), false);
  assert.equal(phase5Gate({...ok, payload_mismatches: null}), false);
  assert.equal(phase5Gate(null), false);
});
