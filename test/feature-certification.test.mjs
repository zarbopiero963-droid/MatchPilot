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
// The feature as registered: TESTED, no certification record.
const bare = () => { const f = tools(); f.certification = null; f.state = 'TESTED'; return f; };
// A twin with REAL data, to exercise the certification rules (the register's own feature is COMPUTED: no level yet).
const realTwin = () => ({...bare(), data: 'REAL'});
const SHA = '0123456789abcdef0123456789abcdef01234567';
const T = name => ({test: 'test/math-trading.test.mjs', name});
const certification = () => ({level: 'CERTIFIED REAL', verified_commit: SHA, date: '2026-10-24',
  perimeter: 'the seven calculators with manual input, computed by the server',
  criteria: {completeness: [{file: 'docs/trading-tools.md'}, {journey: 'trading-tools', step: 'strumenti: inserimento manuale dichiarato, schede, nessun calcolo senza Calcola'}], correctness: [T('Kelly: the #94 golden vectors and its outputs')],
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
  const feature = realTwin();
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
    [f => { f.data = 'DEMO'; }, /CERTIFIED REAL is the level of REAL data/],
    [f => { f.data = 'COMPUTED'; }, /a COMPUTED feature has no certification level until the owner decides one/],
    // Review of PR #244, B1: documents alone, a step of another feature's journey.
    [f => { f.certification.criteria.correctness = [{file: 'package.json'}]; }, /correctness: needs a test or a Browser QA step, not only documents/],
    [f => { f.certification.criteria.integration = [{journey: 'general-navigation', step: 'apertura del sito'}]; }, /integration: general-navigation is not a journey of the feature/],
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
  const feature = realTwin();
  feature.certification = certification();
  feature.certification.criteria.correctness = [T('a test removed later')];
  feature.state = 'CERTIFIED REAL';
  assert.match(errorsOf([...others(), feature]).join('\n'), /declared CERTIFIED REAL but the evidence supports TESTED — declare it REGRESSED/);
  feature.state = 'REGRESSED';
  assert.deepEqual(errorsOf([...others(), feature]), []);
  delete feature.certification;
  assert.match(errorsOf([...others(), feature]).join('\n'), /REGRESSED needs the certification it lost/);
});

test('the register certifies nothing on the owner\'s behalf: Trading Tools (COMPUTED) stays TESTED', () => {
  const feature = tools();
  assert.deepEqual([feature.state, feature.data, feature.certification], ['TESTED', 'COMPUTED', null]);
  assert.equal(evidenceState(feature, {inventory}).state, 'TESTED');
});

test('with a report: integration rests on asserted steps, and the verified commit is the head or an ancestor', () => {
  const feature = realTwin();
  feature.certification = certification();
  const steps = Object.values(feature.certification.criteria).flat().filter(ref => ref?.journey === 'trading-tools').map(ref => ref.step);
  const run = (viewport, assertions) => ({id: 'trading-tools', viewport, status: 'PASS', steps: steps.map(name => ({name, assertions}))});
  const report = (assertions, head) => ({head_sha: head, journeys: ['desktop', 'mobile'].map(v => run(v, assertions))});
  const checked = [{controls: ['CTL-TOOLS-KELLY-SUBMIT'], description: 'checked'}];
  const without = evidenceState(feature, {inventory, report: report([], SHA)});
  assert.match(without.gaps.join('\n'), /integration needs a step with recorded assertions/);
  assert.equal(evidenceState(feature, {inventory, report: report(checked, SHA)}).state, 'CERTIFIED REAL', 'the head itself');
  const other = evidenceState(feature, {inventory, report: report(checked, 'f'.repeat(40))});
  assert.equal(other.state, 'TESTED');
  assert.match(other.gaps.join('\n'), /verified_commit 0123456 is not the report head or one of its ancestors/);
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
