// MP-UI-CONTINUOUS-FUNCTIONAL-CERTIFICATION-01, MP-UI-CERT-CALC-01: the feature register is valid, every control belongs to
// one feature, no declared state exceeds the evidence, and each way a certification can be false, incomplete or lost is
// refused: wrong level for the data, documents only, another feature's tests or journeys, a commit that is not the
// evidence's, a changed contract, a missing Gate A/B, fixture, result, limit or independent review.
import assert from 'node:assert/strict';
import test from 'node:test';
import {CERT_FIELDS, checkFeatures, evidenceState, featureDigest, loadFeatures, loadUiMatrix, requirementEvidenceErrors} from '../tools/qa/feature-certification.mjs';
import {loadInventory} from '../tools/qa/control-inventory.mjs';

const inventory = loadInventory();
const register = loadFeatures();
const copy = value => structuredClone(value);
const tools = () => copy(register.features.find(f => f.id === 'FEAT-TRADING-TOOLS'));
// The feature without a certification record, TESTED.
const bare = () => { const f = tools(); f.certification = null; f.state = 'TESTED'; return f; };
// Two commits of the repository's history (#243 and #244 squash merges): the older is an ancestor of the newer. The
// Trading Tools files exist from NEW on, unchanged since: their digest at NEW is the digest here.
const OLD = 'aeea5d865e2740bb2ec0c08437a87e69a0bc6a7e';
const NEW = '50baeac1d36f0ec21689dcb76193ab2a9d90ef60';
const M = name => ({test: 'test/math-trading.test.mjs', name});
const A = name => ({test: 'test/tools-api.test.mjs', name});
const J = step => ({journey: 'trading-tools', step});
const MANUAL = 'strumenti: inserimento manuale dichiarato, schede, nessun calcolo senza Calcola';
const KELLY = 'kelly: il risultato è quello del server, un campo errato è indicato, Azzera svuota';
const certification = () => ({level: 'CERTIFIED CALCULATION', perimeter: 'the seven calculators with manual input, computed by the server',
  verified_commit: NEW, verified_digest: featureDigest(bare(), NEW), date: '2026-10-24', requirements: ['MP-MTH-001'],
  criteria: {completeness: [{file: 'docs/trading-tools.md'}, J(MANUAL)], correctness: [M('Kelly: the #94 golden vectors and its outputs')],
    contracts: [A('the registry lists the tools as GET endpoints without database')], integration: [J(KELLY)],
    security: [A('refusals are 400 and name the parameter; nothing else gets through')],
    financial: [M('Hedge: exact oracle per outcome, equalized within the cent rounding (2000 seeded cases)')]},
  gate_a: {result: 'PASS', evidence: [M('Kelly: the #94 golden vectors and its outputs')]},
  gate_b: {result: 'PASS', evidence: [J(KELLY)]},
  fixtures: [M('Kelly: exact oracle and metamorphic doubling (2000 seeded cases)')],
  results: [{command: 'npm test', result: 'PASS', commit: NEW}],
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
    [f => { f.certification.results = [{command: 'npm test', result: 'FAIL', commit: NEW}]; }, /results: npm test is not PASS/],
    [f => { f.certification.results = [{command: 'npm test', result: 'PASS', commit: OLD}]; }, /was not run on the verified commit/],
    // Contracts: the version is the code's; a change voids the certification.
    [f => { f.certification.contracts = [{module: 'src/api/tools.mjs', export: 'TOOLS_VERSION', version: 'mp-tools-0'}]; }, /TOOLS_VERSION is mp-tools-1, certified mp-tools-0/],
    [f => { f.certification.contracts = [{module: '../etc/passwd', export: 'X', version: '1'}]; }, /bad contract module/],
    // Requirements, limits, review, commit.
    [f => { f.certification.requirements = ['MP-NOPE-001']; }, /requirement MP-NOPE-001 is not in the requirements inventory/],
    [f => { f.certification.limits = []; }, /limits: state them explicitly/],
    [f => { f.certification.independent_review.verdict = 'UNKNOWN'; }, /verdict must be APPROVED/],
    [f => { f.certification.independent_review.reference = 'https://example.com/review'; }, /reference must be the GitHub comment/],
    [f => { f.certification.independent_review.reviewed_sha = OLD; }, /the reviewed commit does not contain the verified one/],
    // The content binds the certification (squash merges): another digest, or a commit whose files are not these.
    [f => { f.certification.verified_digest = '0'.repeat(64); }, /the feature files changed since the verified commit: verify again/],
    [f => { f.certification.verified_digest = 'x'; }, /verified_digest must be the SHA-256/],
    [f => { f.certification.verified_commit = OLD; f.certification.results[0].commit = OLD; }, /verified_digest is not the content of verified_commit aeea5d8/],
    [f => { f.certification.verified_commit = 'abc'; }, /verified_commit must be a full SHA/],
    [f => { f.certification.perimeter = ''; }, /the perimeter must be stated/],
    // The review of the gate (cross-feature evidence): tests, journeys, requirements and contracts of other features.
    [f => { f.test_files.push('test/csv.test.mjs'); f.certification.criteria.correctness = [{test: 'test/csv.test.mjs', name: 'x'}]; }, /test\/csv.test.mjs does not import a source of the feature/],
    [f => { f.journeys.push('sim-save'); f.certification.criteria.integration = [{journey: 'sim-save', step: 'accesso del proprietario dalla pagina di accesso'}]; }, /exercises no control of the feature/],
    [f => { f.certification.requirements = ['MP-GOV-001']; }, /requirement MP-GOV-001 is not a requirement of the feature/],
    [f => { f.certification.contracts = [{module: 'src/hist/engine.mjs', export: 'ENGINE_VERSION', version: 'x'}]; }, /src\/hist\/engine.mjs is not a source of the feature/],
    [f => { f.certification.results = [{command: 'echo', result: 'PASS', commit: NEW}]; }, /echo is not a test command of the feature/],
    [f => { f.certification.criteria.integration = {na: 'no browser for this feature, nothing to integrate'}; }, /integration is never N\/A/],
    [f => { f.sources = []; }, /sources: the feature names its source modules/],
    // Second review of the gate: a module the feature does not run, claimed as a source with its tests.
    [f => { f.sources.push('src/hist/engine.mjs'); f.test_files.push('test/hist-backtest.test.mjs'); }, /sources: src\/hist\/engine.mjs is not run by the entry src\/api\/tools.mjs/],
    [f => { f.certification.results = [{command: 'node --test test/csv.test.mjs', result: 'PASS', commit: NEW}]; }, /node --test test\/csv.test.mjs is not a test command of the feature/],
    [f => { f.certification.results = [{command: 'npm run governance:status', result: 'PASS', commit: NEW}]; }, /is not a test command of the feature/],
    [f => { f.entry = 'src/api/hist-backtest.mjs'; }, /entry: src\/api\/hist-backtest.mjs does not serve \/api\/v1\/tools\//],
    [f => { delete f.entry; }, /entry: the feature names the module of src\/api\/ that serves its API/],
    // Third review of the gate: shared modules claimed as sources, and an entry that only calls the API.
    [f => { f.sources.push('src/math/core.mjs', 'src/math/decimal.mjs'); f.test_files.push('test/paper-ledger-mm.test.mjs'); }, /sources: src\/math\/core.mjs is a shared module/],
    [f => { f.test_files.push('test/paper-ledger-mm.test.mjs'); }, /test\/paper-ledger-mm.test.mjs does not import a source of the feature/],
    [f => { f.certification.contracts = [{module: 'src/math/core.mjs', export: 'MAX_ODDS', version: '1000000'}]; }, /src\/math\/core.mjs is not a source of the feature/],
    [f => { f.entry = 'src/web/app.js'; }, /entry: the feature names the module of src\/api\//],
    [f => { f.entry = 'src/api/v1.mjs'; }, /entry: src\/api\/v1.mjs is a shared module/],
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

test('with a report: integration rests on asserted steps; a squash merge keeps the certification (content, not history)', () => {
  const feature = certified();
  const steps = [MANUAL, KELLY];
  const run = (viewport, assertions) => ({id: 'trading-tools', viewport, status: 'PASS', steps: steps.map(name => ({name, assertions}))});
  const report = (assertions, head) => ({head_sha: head, journeys: ['desktop', 'mobile'].map(v => run(v, assertions))});
  const checked = [{controls: ['CTL-TOOLS-KELLY-SUBMIT'], description: 'checked'}];
  assert.match(evidenceState(feature, {inventory, report: report([], NEW)}).gaps.join('\n'), /integration needs a step with recorded assertions/);
  assert.equal(evidenceState(feature, {inventory, report: report(checked, NEW)}).state, 'CERTIFIED CALCULATION');
  // On main after a squash merge the verified commit is not an ancestor of the head (here: OLD as head): the content
  // still matches, so the certification holds (the regression of #246 on main).
  assert.equal(evidenceState(feature, {inventory, report: report(checked, OLD)}).state, 'CERTIFIED CALCULATION');
  // Commits that are not in the clone are never accepted on trust (review #247 B-1): invented SHAs do not certify.
  const gone = certified();
  gone.certification.verified_commit = '1'.repeat(40);
  gone.certification.results[0].commit = '1'.repeat(40);
  const goneState = evidenceState(gone, {inventory, report: report(checked, NEW)});
  assert.equal(goneState.state, 'TESTED');
  assert.match(goneState.gaps.join('\n'), /verified_commit 1111111 is not in this clone/);
  const unreviewed = certified();
  unreviewed.certification.independent_review.reviewed_sha = '2'.repeat(40);
  assert.match(evidenceState(unreviewed, {inventory, report: report(checked, NEW)}).gaps.join('\n'), /reviewed commit 2222222 is not in this clone/);
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
  // A module run by the entries of two features is shared, without being listed: neither can claim it.
  const twin = copy(register.features.find(f => f.id === 'FEAT-SAVED'));
  twin.entry = 'src/api/persistence-api.mjs';
  const tool = certified();
  tool.sources.push('src/math/core.mjs'); // run by both entries, and not in the list below
  const listedOnly = {...copy(register), shared_modules: ['src/web/app.js']};
  const alone = checkFeatures({...listedOnly, features: [...others(), tool]}, {inventory});
  assert.ok(!alone.features.find(f => f.id === 'FEAT-TRADING-TOOLS').gaps.join('\n').includes('core.mjs is a shared module'), 'one entry: not shared by run');
  const both = checkFeatures({...listedOnly, features: [...others().filter(f => f.id !== 'FEAT-SAVED'), twin, tool]}, {inventory});
  assert.match(both.features.find(f => f.id === 'FEAT-TRADING-TOOLS').gaps.join('\n'), /sources: src\/math\/core.mjs is a shared module/, 'two entries run it: shared');
});

// Review #251: the data a feature declares agrees with its controls, and the UI requirements it implements are its own,
// with the same data mode and evidence checked reference by reference.
test('data: REAL needs REAL controls; controls that only reach an unavailable source declare UNAVAILABLE', () => {
  const all = () => copy(register.features);
  const withData = (id, data) => all().map(f => (f.id === id ? {...f, data} : f));
  assert.match(errorsOf(withData('FEAT-STRATEGIES', 'REAL')).join('\n'), /FEAT-STRATEGIES: data REAL but no control shows REAL data \(declare UNAVAILABLE\)/);
  assert.match(errorsOf(withData('FEAT-SAVED', 'REAL')).join('\n'), /FEAT-SAVED: data REAL but no control shows REAL data/);
  assert.match(errorsOf(withData('FEAT-DAILY-BOARD', 'UNAVAILABLE')).join('\n'), /FEAT-DAILY-BOARD: data UNAVAILABLE needs UNAVAILABLE controls and no REAL or DEMO one/);
  assert.match(errorsOf(withData('FEAT-DAILY-BOARD', 'DEMO')).join('\n'), /data DEMO but no control shows DEMO data/);
  assert.deepEqual(errorsOf(all()), []);
});

test('ui_requirements: one feature each, same data mode, a TESTED one in a TESTED feature', () => {
  const strategies = () => copy(register.features.find(f => f.id === 'FEAT-STRATEGIES'));
  const rest = () => copy(register.features.filter(f => f.id !== 'FEAT-STRATEGIES' && f.id !== 'FEAT-SAVED'));
  const saved = () => copy(register.features.find(f => f.id === 'FEAT-SAVED'));
  assert.match(errorsOf([...rest(), strategies(), {...saved(), ui_requirements: ['MP-REQ-UI-0290']}]).join('\n'), /MP-REQ-UI-0290 is a requirement of (FEAT-STRATEGIES and FEAT-SAVED|FEAT-SAVED and FEAT-STRATEGIES)/);
  assert.match(errorsOf([...rest(), saved(), {...strategies(), ui_requirements: ['MP-REQ-UI-9999']}]).join('\n'), /MP-REQ-UI-9999 is not a requirement of the UI matrix/);
  // A row whose data mode is REAL does not belong to an UNAVAILABLE feature.
  const realRow = loadUiMatrix().requirements.find(row => row.data_mode === 'REAL' && row.status !== 'TESTED');
  assert.match(errorsOf([...rest(), saved(), {...strategies(), ui_requirements: [...strategies().ui_requirements, realRow.id]}]).join('\n'), new RegExp(`${realRow.id} has data REAL, the feature UNAVAILABLE`));
  assert.match(errorsOf([...rest(), saved(), {...strategies(), state: 'IMPLEMENTED'}]).join('\n'), /MP-REQ-UI-0290 is TESTED in a feature declared IMPLEMENTED/);
});

test('requirement evidence: a test titled with the requirement or a journey step with asserted controls; never a generic one', () => {
  const T = 'test/persistence-api.test.mjs';
  const own = 'MP-REQ-UI-0302: saved strategies are private: 403 READS_REQUIRE_AUTH with the owner login off, 401 without a session, before any database access';
  const proves = 'what this reference verifies';
  const step = 'strategie: elenco dalla simulazione, apertura e ritorno';
  const ok = id => requirementEvidenceErrors(id, [{test: T, name: own, proves}], {inventory});
  assert.deepEqual(ok('MP-REQ-UI-0302'), []);
  assert.match(ok('MP-REQ-UI-0290').join('\n'), /the test title does not carry MP-REQ-UI-0290/, 'another requirement\'s test');
  assert.match(ok('MP-REQ-UI-030').join('\n'), /the test title does not carry MP-REQ-UI-030/, 'an id that is only a prefix of the title\'s id');
  const generic = 'persistence API: the write gate refuses before any database access';
  assert.match(requirementEvidenceErrors('MP-REQ-UI-0302', [{test: T, name: generic, proves}], {inventory}).join('\n'), /does not carry MP-REQ-UI-0302[\s\S]*supporting evidence only/);
  assert.match(requirementEvidenceErrors('MP-REQ-UI-0302', [{test: T, name: 'MP-REQ-UI-0302: no such test', proves}], {inventory}).join('\n'), /no active test/);
  assert.match(requirementEvidenceErrors('MP-REQ-UI-0302', [{test: T, name: own}], {inventory}).join('\n'), /proves must say what it verifies/);
  assert.match(requirementEvidenceErrors('MP-REQ-UI-0302', [], {inventory}).join('\n'), /no evidence_refs/);
  // A journey step: it exists, its controls are TESTED, and with a report each one is asserted in that step.
  assert.deepEqual(requirementEvidenceErrors('MP-REQ-UI-0290', [{journey: 'sim-save', step, controls: ['CTL-STRAT-OPEN'], proves}], {inventory}), []);
  assert.match(requirementEvidenceErrors('MP-REQ-UI-0290', [{journey: 'sim-save', step: 'no such step', controls: ['CTL-STRAT-OPEN'], proves}], {inventory}).join('\n'), /no step «no such step» in sim-save/);
  const untested = inventory.controls.find(c => c.status !== 'TESTED').id;
  assert.match(requirementEvidenceErrors('MP-REQ-UI-0290', [{journey: 'sim-save', step, controls: [untested], proves}], {inventory}).join('\n'), new RegExp(`${untested} is not TESTED`));
  assert.match(requirementEvidenceErrors('MP-REQ-UI-0290', [{journey: 'sim-save', step, proves}], {inventory}).join('\n'), /supporting evidence only/, 'a step without controls supports, never proves alone');
  const report = asserted => ({journeys: ['desktop', 'tablet', 'mobile'].map(viewport => ({id: 'sim-save', viewport, status: 'PASS', steps: [{name: step, status: 'PASS', asserted, assertions: [{}]}]}))});
  assert.deepEqual(requirementEvidenceErrors('MP-REQ-UI-0290', [{journey: 'sim-save', step, controls: ['CTL-STRAT-OPEN'], proves}], {inventory, report: report(['CTL-STRAT-OPEN'])}), []);
  assert.match(requirementEvidenceErrors('MP-REQ-UI-0290', [{journey: 'sim-save', step, controls: ['CTL-STRAT-OPEN'], proves}], {inventory, report: report([])}).join('\n'), /CTL-STRAT-OPEN not asserted in this step on desktop/);
});
