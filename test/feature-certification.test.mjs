// MP-UI-CONTINUOUS-FUNCTIONAL-CERTIFICATION-01: the feature register is valid, every control belongs to one feature, no
// declared state exceeds the evidence, and each way a certification can be false or lost is refused.
import assert from 'node:assert/strict';
import test from 'node:test';
import {checkFeatures, evidenceState, loadFeatures} from '../tools/qa/feature-certification.mjs';
import {loadInventory} from '../tools/qa/control-inventory.mjs';

const inventory = loadInventory();
const register = loadFeatures();
const copy = value => structuredClone(value);
const tools = () => copy(register.features.find(f => f.id === 'FEAT-TRADING-TOOLS'));
// The same feature without its certification record, as it was before certification.
const bare = () => { const f = tools(); delete f.certification; f.state = 'TESTED'; return f; };
const SHA = '0123456789abcdef0123456789abcdef01234567';
const T = name => ({test: 'test/math-trading.test.mjs', name});
const certification = () => ({level: 'CERTIFIED REAL', verified_commit: SHA, date: '2026-10-24',
  perimeter: 'the seven calculators with manual input, computed by the server',
  criteria: {completeness: [{file: 'docs/trading-tools.md'}], correctness: [T('Kelly: the #94 golden vectors and its outputs')],
    contracts: [{test: 'test/tools-api.test.mjs', name: 'the registry lists the tools as GET endpoints without database'}],
    integration: [{journey: 'trading-tools', step: 'strumenti: inserimento manuale dichiarato, schede, nessun calcolo senza Calcola'}],
    security: [{test: 'test/tools-api.test.mjs', name: 'refusals are 400 and name the parameter; nothing else gets through'}],
    financial: [T('Hedge: exact oracle per outcome, equalized within the cent rounding (2000 seeded cases)')]}});
const errorsOf = features => checkFeatures({...copy(register), features}, {inventory}).errors;
const others = () => copy(register.features.filter(f => f.id !== 'FEAT-TRADING-TOOLS'));

test('the repository register is valid and matches the evidence of the inventory', () => {
  const result = checkFeatures(register, {inventory});
  assert.deepEqual(result.errors, []);
  assert.ok(register.features.length >= 9);
  const counted = result.features.reduce((sum, f) => sum + f.controls, 0);
  assert.equal(counted, inventory.controls.length, 'every control belongs to exactly one feature');
});

test('a state above the evidence is refused; below it is only noted', () => {
  const over = bare();
  over.state = 'CERTIFIED REAL';
  assert.match(errorsOf([...others(), over]).join('\n'), /FEAT-TRADING-TOOLS: declared CERTIFIED REAL but the evidence supports (TESTED|IMPLEMENTED) — declare it REGRESSED/);
  const under = bare();
  under.state = 'IN DEVELOPMENT';
  const result = checkFeatures({...copy(register), features: [...others(), under]}, {inventory});
  assert.deepEqual(result.errors, []);
  assert.ok(result.notes.some(note => note.startsWith('FEAT-TRADING-TOOLS: declared IN DEVELOPMENT')));
});

test('a complete certification record certifies; each missing or false piece of evidence stops it', () => {
  const feature = bare();
  assert.equal(evidenceState(feature, {inventory}).state, 'TESTED', 'the feature is TESTED before any record');
  feature.certification = certification();
  assert.equal(evidenceState(feature, {inventory}).state, 'CERTIFIED REAL');
  const broken = [
    [f => { delete f.certification.criteria.security; }, /security: no evidence/],
    [f => { f.certification.criteria.financial = {na: 'not a financial feature, nothing to verify'}; }, /financial cannot be N\/A/],
    [f => { f.certification.criteria.contracts = {na: 'short'}; }, /contracts: N\/A needs a verifiable reason/],
    [f => { f.certification.criteria.integration = [T('Kelly: the #94 golden vectors and its outputs')]; }, /integration needs a Browser QA step/],
    [f => { f.certification.criteria.correctness = [T('a test that does not exist')]; }, /no active test/],
    [f => { f.certification.criteria.completeness = [{file: 'docs/none.md'}]; }, /docs\/none.md does not exist/],
    [f => { f.certification.criteria.integration = [{journey: 'trading-tools', step: 'no such step'}]; }, /no step «no such step»/],
    [f => { f.certification.level = 'CERTIFIED MOCK'; }, /CERTIFIED MOCK is the level of DEMO data/],
    [f => { f.data = 'DEMO'; }, /CERTIFIED REAL needs REAL or COMPUTED data/],
    [f => { f.certification.verified_commit = 'abc'; }, /verified_commit must be a full SHA/],
    [f => { f.certification.perimeter = ''; }, /the perimeter must be stated/],
  ];
  for (const [change, message] of broken) {
    const f = copy(feature);
    change(f);
    const state = evidenceState(f, {inventory});
    assert.equal(state.state, 'TESTED', String(message));
    assert.match(state.gaps.join('\n'), message);
  }
});

test('a lost certification fails until it is declared REGRESSED', () => {
  const feature = bare();
  feature.certification = certification();
  feature.certification.criteria.correctness = [T('a test removed later')];
  feature.state = 'CERTIFIED REAL';
  assert.match(errorsOf([...others(), feature]).join('\n'), /declared CERTIFIED REAL but the evidence supports TESTED — declare it REGRESSED/);
  feature.state = 'REGRESSED';
  assert.deepEqual(errorsOf([...others(), feature]), []);
  delete feature.certification;
  assert.match(errorsOf([...others(), feature]).join('\n'), /REGRESSED needs the certification it lost/);
});

test('the certification of the register holds on its evidence (without a report: tests and step titles)', () => {
  const feature = tools();
  assert.equal(feature.state, 'CERTIFIED REAL');
  assert.equal(feature.data, 'COMPUTED', 'REAL here is the real server computing from manual input, not real market data');
  assert.deepEqual(evidenceState(feature, {inventory}), {state: 'CERTIFIED REAL', gaps: [], controls: evidenceState(feature, {inventory}).controls});
});

test('integration rests on a step with recorded assertions on every viewport', () => {
  const feature = tools();
  const steps = Object.values(feature.certification.criteria).flat().filter(ref => ref?.journey === 'trading-tools').map(ref => ref.step);
  const run = (viewport, assertions) => ({id: 'trading-tools', viewport, status: 'PASS', steps: steps.map(name => ({name, assertions}))});
  const nav = viewport => ({id: 'general-navigation', viewport, status: 'PASS', steps: [{name: 'menu: Strumenti', assertions: []}, {name: 'apertura del sito', assertions: []}]});
  const report = assertions => ({journeys: ['desktop', 'mobile'].flatMap(v => [run(v, assertions), nav(v)])});
  const without = evidenceState(feature, {inventory, report: report([])});
  assert.equal(without.state, 'TESTED');
  assert.match(without.gaps.join('\n'), /integration needs a step with recorded assertions/);
  assert.equal(evidenceState(feature, {inventory, report: report([{controls: ['CTL-TOOLS-KELLY-SUBMIT'], description: 'checked'}])}).state, 'CERTIFIED REAL');
});

test('with a report, the journeys and the certification steps must have passed on every viewport', () => {
  const feature = bare();
  const report = {journeys: [{id: 'trading-tools', viewport: 'desktop', status: 'PASS', steps: []}]};
  const state = evidenceState(feature, {inventory, report});
  assert.notEqual(state.state, 'TESTED');
  assert.match(state.gaps.join('\n'), /journey trading-tools\/mobile did not pass/);
});

test('structure: ids, duplicate ownership, unowned controls, BLOCKED without reason', () => {
  const dup = bare();
  dup.id = 'FEAT-TOOLS-AGAIN';
  assert.match(errorsOf([...others(), tools(), dup]).join('\n'), /belongs to FEAT-TRADING-TOOLS and FEAT-TOOLS-AGAIN/);
  assert.match(errorsOf(others()).join('\n'), /CTL-TOOLS-TAB-ODDS belongs to no feature/);
  const blocked = bare();
  blocked.state = 'BLOCKED';
  assert.match(errorsOf([...others(), blocked]).join('\n'), /BLOCKED needs a reason/);
  const bad = bare();
  bad.id = 'tools';
  assert.match(errorsOf([...others(), tools(), bad]).join('\n'), /id must match/);
  assert.match(checkFeatures({...copy(register), schema: 'x'}, {inventory}).errors.join('\n'), /schema must be/);
});
