import test from 'node:test';
import assert from 'node:assert/strict';
import { inferValueType, mergeTypes, profileSchema, fieldFamily } from '../src/providers/futpython/schema.mjs';

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
