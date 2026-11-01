import test from 'node:test';
import assert from 'node:assert/strict';
import { inferValueType, mergeTypes, profileSchema, fieldFamily, fieldTiming, IDENTITY_FIELDS } from '../src/providers/futpython/schema.mjs';

test('schema inference preserves mixed columns as text',()=>{
  assert.equal(inferValueType('12'),'integer');
  assert.equal(inferValueType('1.25'),'number');
  assert.equal(mergeTypes(['integer','number']),'number');
  assert.equal(mergeTypes(['number','text']),'text');
});

test('profile tracks coverage and families',()=>{
  const p=profileSchema(['xG_Home_FT','Odd_1_FT'],[
    {xG_Home_FT:'1.2',Odd_1_FT:'2.1'},
    {xG_Home_FT:'',Odd_1_FT:'2.2'}
  ]);
  assert.equal(p[0].nonemptySeen,1);
  assert.equal(p[0].family,'expected_goals');
  assert.equal(fieldFamily('Shots_On_Target_Home_FT'),'shooting');
});

// MP-PIT-TIMING-01 (MP-PRODUCT-100 audit BE-08): only the explicit identity names are pre-match identity; a statistic
// that merely contains «home», «away», «id» or «time» is never pre-match.
test('MP-PIT-TIMING-01 identity is an explicit list; unknown or post-match statistics are never pre-match', () => {
  assert.deepEqual([...IDENTITY_FIELDS].sort(), ['away', 'country', 'date', 'div', 'home', 'id', 'league', 'match_id', 'round', 'season', 'time']);
  assert.equal(IDENTITY_FIELDS.length, 11, 'the 11 identity fields of the 2026-10-05 certificate');
  for (const name of ['Date', 'Time', 'Home', 'Away', 'League', 'Season', 'Country', 'Div', 'Round', 'Match_ID', 'Id', 'ID']) {
    assert.equal(fieldFamily(name), 'identity', name);
    assert.equal(fieldTiming(fieldFamily(name)), 'PREMATCH_IDENTITY', name);
  }
  // Post-match statistics the old regex made «identity» (and so pre-match): now unclassified, timing post-match.
  for (const name of ['Dribbles_Home_FT', 'Aerials_Won_Away_FT', 'Blocks_Home_FT', 'Long_Balls_Home_FT', 'Dispossessed_Home_FT',
    'Home_Team_Rating_FT', 'Away_Possession_Time', 'Referee', 'Stadium', 'Temperature']) {
    assert.notEqual(fieldFamily(name), 'identity', name);
    assert.equal(fieldTiming(fieldFamily(name)), 'POSTMATCH_OUTCOME', `${name} is never pre-match`);
  }
  // Families that were already right stay as they were.
  assert.deepEqual(['Odd_1_FT', 'AH_Home_neg_1', 'xG_Home_FT', 'Corners_Home_FT', 'Home_Score', 'Shots_On_Target_Home_FT', 'Throw_In_Home_FT']
    .map(fieldFamily), ['market', 'market', 'expected_goals', 'corners', 'goals', 'shooting', 'set_pieces']);
  // Whatever the name, a field whose family is not identity or market is post-match: unknown is never pre-match.
  for (const family of ['unclassified', 'goals', 'corners', 'shooting', 'defense', 'discipline', 'possession_creation', 'period_split', 'expected_goals', 'set_pieces']) {
    assert.equal(fieldTiming(family), 'POSTMATCH_OUTCOME', family);
  }
});
