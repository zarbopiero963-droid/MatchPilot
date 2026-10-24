// MP-UI-PR-006 (#34): rulesOf is the exact inverse of definitionOf on every definition a request can express, so the
// Strategie page reopens a saved strategy in the Simulazione with the same definition, never a converted one.
import assert from 'node:assert/strict';
import test from 'node:test';
import {definitionOf, rulesOf} from '../src/api/hist-backtest.mjs';
import {definitionId, normalizeDefinition} from '../src/hist/strategy-def.mjs';

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = (next, list) => list[Math.floor(next() * list.length)];

test('rulesOf inverts definitionOf: same definition, same strategy id (1000 seeded rule sets)', () => {
  const next = rng(34006);
  for (let i = 0; i < 1000; i++) {
    const rules = {selection: pick(next, ['FAVOURITE', 'UNDERDOG', 'HOME', 'DRAW', 'AWAY']), side: pick(next, ['BACK', 'LAY'])};
    for (const prefix of ['odds', 'home', 'draw', 'away']) {
      if (next() < 0.4) rules[`${prefix}_min`] = (1.01 + Math.floor(next() * 200) / 100).toFixed(2);
      if (next() < 0.4) rules[`${prefix}_max`] = (3.02 + Math.floor(next() * 500) / 100).toFixed(2);
    }
    if (next() < 0.5) { rules.team = pick(next, ['Ajax', 'PSV', 'Feyenoord']); if (next() < 0.5) rules.venue = pick(next, ['HOME', 'AWAY']); }
    const stored = normalizeDefinition(definitionOf(rules));
    const back = rulesOf(stored);
    assert.equal(definitionId(normalizeDefinition(definitionOf(back))), definitionId(stored), JSON.stringify(rules));
    assert.deepEqual(Object.keys(back).sort(), Object.keys(rules).sort());
  }
});

test('rulesOf: the exact fields of a known definition, and null where a request cannot express it', () => {
  assert.deepEqual(rulesOf(normalizeDefinition(definitionOf({selection: 'HOME', side: 'LAY', odds_max: '2.50', team: 'Ajax', venue: 'HOME'}))),
    {selection: 'HOME', side: 'LAY', odds_max: '2.5', team: 'Ajax', venue: 'HOME'});
  assert.deepEqual(rulesOf(normalizeDefinition({selection: 'DRAW', side: 'BACK'})), {selection: 'DRAW', side: 'BACK'});
  assert.equal(rulesOf(normalizeDefinition({selection: 'HOME', side: 'BACK', conditions: {teams: ['Ajax', 'PSV']}})), null, 'two teams');
  assert.equal(rulesOf({selection: 'HOME', side: 'BACK', market: 'OVER_UNDER'}), null, 'another market');
});
