// MP-UI-CONTINUOUS-FUNCTIONAL-CERTIFICATION-01, MP-UI-CERT-CALC-01: the feature register is valid, every control belongs to
// one feature, no declared state exceeds the evidence, and each way a certification can be false, incomplete or lost is
// refused: wrong level for the data, documents only, another feature's tests or journeys, a commit that is not the
// evidence's, a changed contract, a missing Gate A/B, fixture, result, limit or independent review.
import assert from 'node:assert/strict';
import test from 'node:test';
import {CERT_FIELDS, checkFeatures, evidenceState, loadFeatures} from '../tools/qa/feature-certification.mjs';
import {loadInventory} from '../tools/qa/control-inventory.mjs';

const inventory = loadInventory();
const register = loadFeatures();
const copy = value => structuredClone(value);
const tools = () => copy(register.features.find(f => f.id === 'FEAT-TRADING-TOOLS'));
// The feature without a certification record, TESTED.
const bare = () => { const f = tools(); f.certification = null; f.state = 'TESTED'; return f; };
// Two commits of the repository's history (#243 and #244 squash merges): the older is an ancestor of the newer.
const OLD = 'aeea5d865e2740bb2ec0c08437a87e69a0bc6a7e';
const NEW = '50baeac1d36f0ec21689dcb76193ab2a9d90ef60';
const M = name => ({test: 'test/math-trading.test.mjs', name});
const A = name => ({test: 'test/tools-api.test.mjs', name});
const J = step => ({journey: 'trading-tools', step});
const MANUAL = 'strumenti: inserimento manuale dichiarato, schede, nessun calcolo senza Calcola';
const KELLY = 'kelly: il risultato è quello del server, un campo errato è indicato, Azzera svuota';
const certification = () => ({level: 'CERTIFIED CALCULATION', perimeter: 'the seven calculators with manual input, computed by the server',
  verified_commit: OLD, date: '2026-10-24', requirements: ['MP-MTH-001'],
  criteria: {completeness: [{file: 'docs/trading-tools.md'}, J(MANUAL)], correctness: [M('Kelly: the #94 golden vectors and its outputs')],
    contracts: [A('the registry lists the tools as GET endpoints without database')], integration: [J(KELLY)],
    security: [A('refusals are 400 and name the parameter; nothing else gets through')],
    financial: [M('Hedge: exact oracle per outcome, equalized within the cent rounding (2000 seeded cases)')]},
  gate_a: {result: 'PASS', evidence: [M('Kelly: the #94 golden vectors and its outputs')]},
  gate_b: {result: 'PASS', evidence: [J(KELLY)]},
  fixtures: [M('Kelly: exact oracle and metamorphic doubling (2000 seeded cases)')],
  results: [{command: 'npm test', result: 'PASS', commit: OLD}],
  contracts: [{module: 'src/api/tools.mjs', export: 'TOOLS_VERSION', version: 'mp-tools-1'}],
  limits: ['manual input only'],
  independent_review: {verdict: 'APPROVED', reviewed_sha: NEW, reference: 'https://github.com/zarbopiero963-droid/MatchPilot/pull/244#issuecomment-6384598449'}});
const errorsOf = features => checkFeatures({...copy(register), features}, {inventory}).errors;
const others = () => copy(register.features.filter(f => f.id !== 'FEAT-TRADING-TOOLS'));
const certified = () => { const f = bare(); f.certification = certification(); return f; };

test('the repository register is valid and matches the evidence of the inventory', () => {
  const result = checkFeatures(register, {inventory});
  assert.deepEqual(result.errors, []);
  assert.ok(register.features.length >= 9);
  const counted = result.features.reduce((sum, f) => sum + f.controls, 0);
  assert.equal(counted, inventory.controls.length, 'every control belongs to exactly one feature');
});

test('a state above the evidence is refused; below it is only noted', () => {
  const over = bare();
  over.state = 'CERTIFIED CALCULATION';
  assert.match(errorsOf([...others(), over]).join('\n'), /FEAT-TRADING-TOOLS: declared CERTIFIED CALCULATION but the evidence supports (TESTED|IMPLEMENTED) — declare it REGRESSED/);
  const under = bare();
  under.state = 'IN DEVELOPMENT';
  const result = checkFeatures({...copy(register), features: [...others(), under]}, {inventory});
  assert.deepEqual(result.errors, []);
  assert.ok(result.notes.some(note => note.startsWith('FEAT-TRADING-TOOLS: declared IN DEVELOPMENT')));
});

test('a complete record certifies; each missing or false piece stops it at TESTED', () => {
  assert.equal(evidenceState(bare(), {inventory}).state, 'TESTED', 'the feature is TESTED before any record');
  assert.equal(evidenceState(certified(), {inventory}).state, 'CERTIFIED CALCULATION');
  const broken = [
    // The level says what was certified, and follows the data (MP-UI-CERT-CALC-01).
    [f => { f.certification.level = 'CERTIFIED REAL'; }, /CERTIFIED REAL is not the level of COMPUTED data \(CERTIFIED CALCULATION\)/],
    [f => { f.data = 'REAL'; }, /CERTIFIED CALCULATION is not the level of REAL data \(CERTIFIED REAL\)/],
    [f => { f.data = 'DEMO'; }, /CERTIFIED CALCULATION is not the level of DEMO data \(CERTIFIED MOCK\)/],
    [f => { f.certification.level = 'CERTIFIED BEST'; }, /level must be CERTIFIED MOCK, CERTIFIED REAL or CERTIFIED CALCULATION/],
    // Every field of the record is required.
    ...CERT_FIELDS.filter(field => !['level'].includes(field)).map(field => [f => { delete f.certification[field]; }, new RegExp(`certification needs ${field}`)]),
    // Criteria: evidence, N/A, documents only, other features' tests and journeys.
    [f => { f.certification.criteria.financial = {na: 'not a financial feature, nothing to verify'}; }, /financial cannot be N\/A/],
    [f => { f.certification.criteria.contracts = {na: 'short'}; }, /contracts: N\/A needs a verifiable reason/],
    [f => { f.certification.criteria.correctness = [{file: 'package.json'}]; }, /correctness: needs a test or a Browser QA step, not only documents/],
    [f => { f.certification.criteria.correctness = [{test: 'test/math-core.test.mjs', name: 'Decimal parses only plain decimal text and refuses binary floats'}]; }, /test\/math-core.test.mjs is not a test file of the feature/],
    [f => { f.certification.criteria.integration = [{journey: 'general-navigation', step: 'apertura del sito'}]; }, /integration: general-navigation is not a journey of the feature/],
    [f => { f.certification.criteria.integration = [M('Kelly: the #94 golden vectors and its outputs')]; }, /integration needs a Browser QA step/],
    [f => { f.certification.criteria.correctness = [M('a test that does not exist')]; }, /no active test/],
    [f => { f.certification.criteria.integration = [J('no such step')]; }, /no step «no such step»/],
    // Gate A, Gate B, fixtures, results.
    [f => { f.certification.gate_a.result = 'FAIL'; }, /gate_a: result must be PASS/],
    [f => { f.certification.gate_a.evidence = [J(KELLY)]; }, /gate_a: needs a test/],
    [f => { f.certification.gate_b.evidence = [M('Kelly: the #94 golden vectors and its outputs')]; }, /gate_b needs a Browser QA step/],
    [f => { f.certification.fixtures = [{file: 'docs/trading-tools.md'}]; }, /fixtures: needs a test or a Browser QA step/],
    [f => { f.certification.results = [{command: 'npm test', result: 'FAIL', commit: OLD}]; }, /results: npm test is not PASS/],
    [f => { f.certification.results = [{command: 'npm test', result: 'PASS', commit: NEW}]; }, /was not run on the verified commit/],
    // Contracts: the version is the code's; a change voids the certification.
    [f => { f.certification.contracts = [{module: 'src/api/tools.mjs', export: 'TOOLS_VERSION', version: 'mp-tools-0'}]; }, /TOOLS_VERSION is mp-tools-1, certified mp-tools-0/],
    [f => { f.certification.contracts = [{module: '../etc/passwd', export: 'X', version: '1'}]; }, /bad contract module/],
    // Requirements, limits, review, commit.
    [f => { f.certification.requirements = ['MP-NOPE-001']; }, /requirement MP-NOPE-001 is not in the requirements inventory/],
    [f => { f.certification.limits = []; }, /limits: state them explicitly/],
    [f => { f.certification.independent_review.verdict = 'UNKNOWN'; }, /verdict must be APPROVED/],
    [f => { f.certification.independent_review.reference = 'https://example.com/review'; }, /reference must be the GitHub comment/],
    [f => { f.certification.independent_review.reviewed_sha = OLD; f.certification.verified_commit = NEW; f.certification.results[0].commit = NEW; }, /the reviewed commit does not contain the verified one/],
    [f => { f.certification.verified_commit = '0'.repeat(40); f.certification.results[0].commit = '0'.repeat(40); }, /is not in this clone/],
    [f => { f.certification.verified_commit = 'abc'; }, /verified_commit must be a full SHA/],
    [f => { f.certification.perimeter = ''; }, /the perimeter must be stated/],
    // The review of the gate (cross-feature evidence): tests, journeys, requirements and contracts of other features.
    [f => { f.test_files.push('test/csv.test.mjs'); f.certification.criteria.correctness = [{test: 'test/csv.test.mjs', name: 'x'}]; }, /test\/csv.test.mjs does not import a source of the feature/],
    [f => { f.journeys.push('sim-save'); f.certification.criteria.integration = [{journey: 'sim-save', step: 'accesso del proprietario dalla pagina di accesso'}]; }, /exercises no control of the feature/],
    [f => { f.certification.requirements = ['MP-GOV-001']; }, /requirement MP-GOV-001 is not a requirement of the feature/],
    [f => { f.certification.contracts = [{module: 'src/hist/engine.mjs', export: 'ENGINE_VERSION', version: 'x'}]; }, /src\/hist\/engine.mjs is not a source of the feature/],
    [f => { f.certification.results = [{command: 'echo', result: 'PASS', commit: OLD}]; }, /echo is not a test command of the feature/],
    [f => { f.certification.criteria.integration = {na: 'no browser for this feature, nothing to integrate'}; }, /integration is never N\/A/],
    [f => { f.sources = []; }, /sources: the feature names its source modules/],
    // Second review of the gate: a module the feature does not run, claimed as a source with its tests.
    [f => { f.sources.push('src/hist/engine.mjs'); f.test_files.push('test/hist-backtest.test.mjs'); }, /sources: src\/hist\/engine.mjs is not run by the entry src\/api\/tools.mjs/],
    [f => { f.certification.results = [{command: 'node --test test/csv.test.mjs', result: 'PASS', commit: OLD}]; }, /node --test test\/csv.test.mjs is not a test command of the feature/],
    [f => { f.certification.results = [{command: 'npm run governance:status', result: 'PASS', commit: OLD}]; }, /is not a test command of the feature/],
    [f => { f.entry = 'src/hist/engine.mjs'; }, /entry: src\/hist\/engine.mjs does not serve \/api\/v1\/tools\//],
    [f => { delete f.entry; }, /entry: the feature names the module that serves its API/],
  ];
  for (const [change, message] of broken) {
    const f = certified();
    change(f);
    const state = evidenceState(f, {inventory});
    assert.equal(state.state, 'TESTED', String(message));
    assert.match(state.gaps.join('\n'), message);
  }
});

test('a lost certification fails until it is declared REGRESSED', () => {
  const feature = certified();
  feature.certification.contracts[0].version = 'mp-tools-0'; // the contract changed after the certification
  feature.state = 'CERTIFIED CALCULATION';
  assert.match(errorsOf([...others(), feature]).join('\n'), /declared CERTIFIED CALCULATION but the evidence supports TESTED — declare it REGRESSED/);
  feature.state = 'REGRESSED';
  assert.deepEqual(errorsOf([...others(), feature]), []);
  feature.certification = null;
  assert.match(errorsOf([...others(), feature]).join('\n'), /REGRESSED needs the certification it lost/);
});

test('with a report: integration rests on asserted steps, and the verified commit is the head or an ancestor', () => {
  const feature = certified();
  const steps = [MANUAL, KELLY];
  const run = (viewport, assertions) => ({id: 'trading-tools', viewport, status: 'PASS', steps: steps.map(name => ({name, assertions}))});
  const report = (assertions, head) => ({head_sha: head, journeys: ['desktop', 'mobile'].map(v => run(v, assertions))});
  const checked = [{controls: ['CTL-TOOLS-KELLY-SUBMIT'], description: 'checked'}];
  assert.match(evidenceState(feature, {inventory, report: report([], NEW)}).gaps.join('\n'), /integration needs a step with recorded assertions/);
  assert.equal(evidenceState(feature, {inventory, report: report(checked, NEW)}).state, 'CERTIFIED CALCULATION', 'an ancestor of the head');
  assert.equal(evidenceState(feature, {inventory, report: report(checked, OLD)}).state, 'CERTIFIED CALCULATION', 'the head itself');
  const later = certified();
  later.certification.verified_commit = NEW;
  later.certification.results[0].commit = NEW;
  const stale = evidenceState(later, {inventory, report: report(checked, OLD)});
  assert.match(stale.gaps.join('\n'), /verified_commit 50baeac is not the report head or one of its ancestors/);
});

test('with a report, the journeys must have passed on every viewport', () => {
  const report = {journeys: [{id: 'trading-tools', viewport: 'desktop', status: 'PASS', steps: []}]};
  const state = evidenceState(bare(), {inventory, report});
  assert.notEqual(state.state, 'TESTED');
  assert.match(state.gaps.join('\n'), /journey trading-tools\/mobile did not pass/);
});

test('structure: ids, duplicate ownership, unowned controls, BLOCKED without reason, schema', () => {
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
  // A test file and a source module are the evidence of one feature only.
  const saved = copy(register.features.find(f => f.id === 'FEAT-SAVED'));
  saved.test_files = ['test/tools-api.test.mjs'];
  saved.sources = ['src/api/tools.mjs'];
  const shared = errorsOf([...others().filter(f => f.id !== 'FEAT-SAVED'), saved, tools()]).join('\n');
  assert.match(shared, /test\/tools-api.test.mjs is a test file of FEAT-SAVED and FEAT-TRADING-TOOLS/);
  assert.match(shared, /src\/api\/tools.mjs is a source of FEAT-SAVED and FEAT-TRADING-TOOLS/);
});
