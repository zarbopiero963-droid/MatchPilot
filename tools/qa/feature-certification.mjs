#!/usr/bin/env node
// MP-UI-CONTINUOUS-FUNCTIONAL-CERTIFICATION-01: certification per feature, not per pull request. The register
// docs/qa/feature-certification.json lists the features a user recognizes (perimeter, views and controls, requirements,
// data, dependencies, limits). The state of each feature is COMPUTED from evidence, never taken from an agent's word:
// - IMPLEMENTED: every control of the feature exists in the control inventory, none is NOT STARTED, IN PROGRESS or
//   BLOCKED;
// - TESTED: besides, every control is TESTED (ASSERTED evidence, which verify-report re-checks against the Browser QA
//   report on every run), every test the feature names is an active test, and, with a report, every journey it names
//   passed on every viewport;
// - CERTIFIED MOCK / CERTIFIED REAL / CERTIFIED CALCULATION: besides, a certification record (CERT_FIELDS) with:
//   - evidence for each criterion of the policy (completeness, correctness, contracts, integration, security,
//     financial), or N/A with a reason; financial is never N/A for a financial feature. Every criterion rests on at least
//     one active test of the feature's own test files or one step of its own journeys (a {file} only supplements it),
//     integration on a step with recorded assertions;
//   - the requirements covered (ids of docs/governance/mp-pr-00/requirements.json), Gate A and Gate B evidence, the
//     fixtures and independent vectors, the test results on the verified commit, the contract versions (each checked
//     against the constant the code exports: a changed contract voids the certification), the limits, and an independent
//     review APPROVED on a commit that contains the verified one;
//   - the verified commit, present in this clone and, with a report, the report's head or one of its ancestors.
//   The level says what was certified, not how well (owner decision MP-UI-CERT-CALC-01): MOCK is the level of DEMO data,
//   REAL of REAL data, CALCULATION of COMPUTED features (deterministic calculations on explicit input, computed by the
//   real server; no external data, no prediction, no profitability, no real trading implied).
// The declared state must not exceed the computed one: a certified feature whose evidence no longer holds fails the
// gate until it is declared REGRESSED (or the evidence is restored). A declared state below the evidence is reported,
// not failed. BLOCKED needs a reason. The check runs in verify-report (Browser QA job, CI gate), so merge readiness,
// feature state and regressions are reported apart: an incomplete feature never blocks a merge, a false claim does.
//
// Usage: node tools/qa/feature-certification.mjs status [report.json]
import {execFileSync} from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {EVIDENCED, activeTest, journeyStepTitles, loadInventory} from './control-inventory.mjs';
import {REQUIRED_VIEWPORTS} from './journeys.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const FEATURES_PATH = join(root, 'docs/qa/feature-certification.json');
export const FEATURES_SCHEMA = 'mp-feature-certification-2';
export const FEATURE_STATES = Object.freeze(['NOT STARTED', 'IN DEVELOPMENT', 'IMPLEMENTED', 'TESTED', 'CERTIFIED MOCK', 'CERTIFIED REAL', 'CERTIFIED CALCULATION', 'BLOCKED', 'REGRESSED']);
// The order of the evidence: a state is supported when the evidence reaches it. The three certified levels are peers.
const RANK = {'NOT STARTED': 0, 'IN DEVELOPMENT': 1, IMPLEMENTED: 2, TESTED: 3, 'CERTIFIED MOCK': 4, 'CERTIFIED REAL': 4, 'CERTIFIED CALCULATION': 4};
// The certified level each kind of data can reach (MP-UI-CERT-CALC-01); NONE (navigation only) has none yet.
export const LEVEL_OF_DATA = Object.freeze({DEMO: 'CERTIFIED MOCK', REAL: 'CERTIFIED REAL', COMPUTED: 'CERTIFIED CALCULATION'});
export const CERT_FIELDS = Object.freeze(['level', 'perimeter', 'verified_commit', 'date', 'requirements', 'criteria', 'gate_a', 'gate_b', 'fixtures', 'results', 'contracts', 'limits', 'independent_review']);
const REQUIREMENTS_PATH = join(root, 'docs/governance/mp-pr-00/requirements.json');
export const FEATURE_DATA = Object.freeze(['REAL', 'DEMO', 'COMPUTED', 'NONE']);
export const CRITERIA = Object.freeze(['completeness', 'correctness', 'contracts', 'integration', 'security', 'financial']);
const ID = /^FEAT-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
const SHA = /^[0-9a-f]{40}$/;
const NOT_BUILT = ['NOT STARTED', 'IN PROGRESS', 'BLOCKED'];

// The verified commit is the evidence's head or one of its ancestors (git in the repository; unknown commits fail).
function isAncestor(commit, head) {
  if (commit === head) return true;
  try { execFileSync('git', ['merge-base', '--is-ancestor', commit, head], {cwd: root, stdio: 'ignore'}); return true; }
  catch { return false; }
}

// A commit object present in this clone (a shallow clone lacks old ones: said, never read as "not an ancestor").
function hasCommit(commit) {
  try { execFileSync('git', ['cat-file', '-e', `${commit}^{commit}`], {cwd: root, stdio: 'ignore'}); return true; }
  catch { return false; }
}

// A contract version is the constant the code exports: `export const NAME = 'version'` in that module.
function contractErrors(contract, sources = []) {
  if (typeof contract?.module !== 'string' || !/^src\/[\w./-]+\.m?js$/.test(contract.module) || contract.module.includes('..')) return [`bad contract module ${contract?.module}`];
  if (!/^[A-Z][A-Z0-9_]*$/.test(contract.export ?? '') || typeof contract.version !== 'string' || !contract.version) return [`contract ${contract.module}: export and version are required`];
  if (!sources.includes(contract.module)) return [`contract ${contract.module} is not a source of the feature`];
  const file = join(root, contract.module);
  if (!existsSync(file)) return [`contract ${contract.module} does not exist`];
  // Comments are removed first, so a commented-out declaration never counts (review of the gate, N5).
  const code = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const declared = new RegExp(`^export const ${contract.export} = '([^']*)';`, 'm').exec(code)?.[1];
  return declared === contract.version ? [] : [`contract ${contract.module} ${contract.export} is ${declared ?? 'missing'}, certified ${contract.version}`];
}

let requirementIds = null;
const knownRequirement = id => (requirementIds ??= new Set(JSON.parse(readFileSync(REQUIREMENTS_PATH, 'utf8')).requirements.map(r => r.id))).has(id);

const withoutComments = text => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const codeOf = path => withoutComments(readFileSync(join(root, path), 'utf8'));

// A test file belongs to a feature when it imports one of the feature's sources (`from '../src/...'`, comments ignored).
function testImportsSource(testFile, sources) {
  if (!existsSync(join(root, testFile))) return false;
  const text = codeOf(testFile);
  return sources.some(source => text.includes(`from '../${source}'`));
}

// The modules an entry module reaches through its relative imports (itself included).
function reachable(entry) {
  const seen = new Set();
  const visit = path => {
    if (seen.has(path) || !existsSync(join(root, path))) return;
    seen.add(path);
    for (const [, spec] of codeOf(path).matchAll(/from '(\.{1,2}\/[^']+)'/g)) visit(join(dirname(path), spec).replace(/\\/g, '/'));
  };
  visit(entry);
  return seen;
}

// The entry module serves the feature's API: it names each API path of the feature's controls, or its family prefix
// ('/api/v1/tools/' for '/api/v1/tools/kelly'). The sources are the entry and the modules it imports: a module the
// feature does not run can never be its evidence (review of the gate, B1/B4).
function entryErrors(feature, controls, shared) {
  const entry = feature.entry;
  if (typeof entry !== 'string' || !/^src\/api\/[\w./-]+\.m?js$/.test(entry) || entry.includes('..') || !existsSync(join(root, entry))) return ['entry: the feature names the module of src/api/ that serves its API'];
  if (shared.includes(entry)) return [`entry: ${entry} is a shared module`];
  const text = codeOf(entry);
  const apis = [...new Set(controls.flatMap(c => [].concat(c.api ?? [])).filter(api => api.startsWith('/api/')))];
  if (!apis.length) return ['entry: the feature has no API to anchor its sources'];
  const family = api => api.slice(0, api.lastIndexOf('/') + 1);
  // The entry declares the endpoints (`path: '/api/v1/tools/kelly'` or `path: \`/api/v1/tools/${name}\``), not only calls them.
  const declares = api => text.includes(`path: '${api}'`) || (family(api).split('/').length >= 5 && text.includes(`path: \`${family(api)}`));
  const missing = apis.filter(api => !declares(api));
  const errors = missing.map(api => `entry: ${entry} does not serve ${api}`);
  const modules = reachable(entry);
  for (const source of feature.sources ?? []) {
    if (shared.includes(source)) errors.push(`sources: ${source} is a shared module, the evidence of no single feature`);
    else if (!modules.has(source)) errors.push(`sources: ${source} is not run by the entry ${entry}`);
  }
  return errors;
}

// A step exercises the feature when the control inventory records one of the feature's controls in it.
const stepOfFeature = (ref, controls) => controls.some(control => (control.exercised_by ?? []).some(e => e.journey === ref.journey && e.step === ref.step));

// Modules many features run (the Math Core, the v1 layer, the page): never a source, a contract or the anchor of a test
// file (third review of the gate). The list is in the register, so changing it is a visible, reviewed change.
let sharedList = null;
export const sharedModules = () => (sharedList ??= loadFeatures().shared_modules ?? []);

export function loadFeatures(path = FEATURES_PATH) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export const controlsOf = (feature, inventory) => {
  const views = new Set(feature.views ?? []);
  const extra = new Set(feature.controls ?? []);
  return inventory.controls.filter(control => views.has(control.view) || extra.has(control.id));
};

// A reference is {test, name} (an active test), {journey, step} (a step of a journey; with a report, asserted there
// on every viewport) or {file} (a document of the repository). Returns the problems; with `asserting`, a step must also
// have recorded assertions (asserted() after an action) on every viewport.
function refErrors(ref, {journeys, report, asserting = false, testFiles = null}) {
  if (ref?.journey) {
    if (!journeys[ref.journey]?.some(title => (title instanceof RegExp ? title.test(ref.step) : title === ref.step))) return [`no step «${ref.step}» in ${ref.journey}`];
    if (!report) return [];
    const runs = (report.journeys ?? []).filter(run => run.id === ref.journey);
    const problems = [];
    for (const viewport of REQUIRED_VIEWPORTS) {
      const run = runs.find(r => r.viewport === viewport);
      const step = run?.status === 'PASS' ? (run.steps ?? []).find(s => s.name === ref.step) : null;
      if (!step) problems.push(`${ref.journey}/${viewport} «${ref.step}» did not pass`);
      else if (asserting && !(step.assertions ?? []).length) problems.push(`${ref.journey}/${viewport} «${ref.step}» has no assertion`);
    }
    return problems;
  }
  if (typeof ref?.test === 'string' && typeof ref?.name === 'string') {
    if (!/^test\/[\w./-]+\.test\.mjs$/.test(ref.test) || ref.test.includes('..')) return [`bad test path ${ref.test}`];
    if (testFiles && !testFiles.includes(ref.test)) return [`${ref.test} is not a test file of the feature`];
    const file = join(root, ref.test);
    if (!existsSync(file)) return [`${ref.test} does not exist`];
    return activeTest(readFileSync(file, 'utf8'), ref.name) ? [] : [`no active test «${ref.name}» in ${ref.test}`];
  }
  if (typeof ref?.file === 'string') {
    if (ref.file.includes('..') || ref.file.startsWith('/')) return [`bad file path ${ref.file}`];
    return existsSync(join(root, ref.file)) ? [] : [`${ref.file} does not exist`];
  }
  return ['a reference is {test, name}, {journey, step} or {file}'];
}

// A result is the whole suite, Browser QA, a QA tool, or `node --test` on the feature's own test files only.
function resultCommand(command, testFiles) {
  if (typeof command !== 'string') return false;
  if (['npm test', 'npm run qa:browser', 'npm run qa:verify'].includes(command) || /^node tools\/qa\/[\w-]+\.mjs( [\w./-]+)*$/.test(command)) return true;
  const files = /^node --test( test\/[\w./-]+\.test\.mjs)+$/.test(command) ? command.split(' ').slice(2) : null;
  return Boolean(files?.length && files.every(file => testFiles.includes(file)));
}

// The state the evidence supports, with the reasons it stops there.
export function evidenceState(feature, {inventory, report = null, journeys = journeyStepTitles(), shared = sharedModules()}) {
  const gaps = [];
  const controls = controlsOf(feature, inventory);
  const known = new Set(inventory.controls.map(c => c.id));
  for (const id of feature.controls ?? []) if (!known.has(id)) gaps.push(`control ${id} is not in the inventory`);
  if (!controls.length) return {state: 'NOT STARTED', gaps: [...gaps, 'no control in the inventory'], controls: []};
  const unbuilt = controls.filter(c => NOT_BUILT.includes(c.status));
  if (unbuilt.length || gaps.length) return {state: 'IN DEVELOPMENT', gaps: [...gaps, ...unbuilt.map(c => `${c.id} is ${c.status}`)], controls};
  const untested = controls.filter(c => !EVIDENCED.includes(c.status));
  gaps.push(...untested.map(c => `${c.id} is ${c.status} (evidence ${c.evidence})`));
  for (const ref of feature.tests ?? []) gaps.push(...refErrors(ref, {journeys, report, testFiles: feature.test_files ?? null}).map(e => `test: ${e}`));
  if (report) for (const id of feature.journeys ?? []) for (const viewport of REQUIRED_VIEWPORTS) {
    if (!(report.journeys ?? []).some(run => run.id === id && run.viewport === viewport && run.status === 'PASS')) gaps.push(`journey ${id}/${viewport} did not pass`);
  }
  if (gaps.length) return {state: 'IMPLEMENTED', gaps, controls};
  const cert = feature.certification;
  if (!cert) return {state: 'TESTED', gaps: ['no certification record'], controls};
  const certGaps = [];
  const testFiles = feature.test_files ?? [];
  const sources = feature.sources ?? [];
  // The feature's own code and tests: sources exist, and every test file imports one of them (review of the gate, B1/B4).
  if (!sources.length) certGaps.push('sources: the feature names its source modules');
  for (const source of sources) if (!/^src\/[\w./-]+\.m?js$/.test(source) || source.includes('..') || !existsSync(join(root, source))) certGaps.push(`sources: ${source} is not a source module`);
  certGaps.push(...entryErrors(feature, controls, shared));
  for (const testFile of testFiles) if (!testImportsSource(testFile, sources)) certGaps.push(`${testFile} does not import a source of the feature`);
  const refs = (field, list, {needTest = false, needJourney = false} = {}) => {
    if (!Array.isArray(list) || !list.length) { certGaps.push(`${field}: no evidence`); return; }
    if (!list.some(ref => ref?.test || ref?.journey)) certGaps.push(`${field}: needs a test or a Browser QA step, not only documents`);
    if (needTest && !list.some(ref => ref?.test)) certGaps.push(`${field}: needs a test`);
    if (needJourney && !list.some(ref => ref?.journey)) certGaps.push(`${field} needs a Browser QA step`);
    for (const ref of list) if (ref?.journey && !(feature.journeys ?? []).includes(ref.journey)) certGaps.push(`${field}: ${ref.journey} is not a journey of the feature`);
    for (const ref of list) if (ref?.journey && !stepOfFeature(ref, controls)) certGaps.push(`${field}: «${ref.step}» exercises no control of the feature`);
    for (const ref of list) certGaps.push(...refErrors(ref, {journeys, report, testFiles}).map(e => `${field}: ${e}`));
  };
  for (const field of CERT_FIELDS) if (cert[field] === undefined) certGaps.push(`certification needs ${field}`);
  const expected = LEVEL_OF_DATA[feature.data];
  if (!['CERTIFIED MOCK', 'CERTIFIED REAL', 'CERTIFIED CALCULATION'].includes(cert.level)) certGaps.push('certification level must be CERTIFIED MOCK, CERTIFIED REAL or CERTIFIED CALCULATION');
  else if (cert.level !== expected) certGaps.push(`${cert.level} is not the level of ${feature.data} data${expected ? ` (${expected})` : ''}`);
  if (!SHA.test(cert.verified_commit ?? '')) certGaps.push('verified_commit must be a full SHA');
  else if (!hasCommit(cert.verified_commit)) certGaps.push(`verified_commit ${cert.verified_commit.slice(0, 7)} is not in this clone (a full history is needed)`);
  else if (report && SHA.test(report.head_sha ?? '') && !isAncestor(cert.verified_commit, report.head_sha)) certGaps.push(`verified_commit ${cert.verified_commit.slice(0, 7)} is not the report head or one of its ancestors`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cert.date ?? '')) certGaps.push('date must be YYYY-MM-DD');
  if (typeof cert.perimeter !== 'string' || cert.perimeter.trim().length < 20) certGaps.push('the perimeter must be stated');
  if (Array.isArray(cert.requirements) && cert.requirements.length) {
    for (const id of cert.requirements) {
      if (!knownRequirement(id)) certGaps.push(`requirement ${id} is not in the requirements inventory`);
      else if (!(feature.requirements ?? []).includes(id)) certGaps.push(`requirement ${id} is not a requirement of the feature`);
    }
  } else if (cert.requirements !== undefined) certGaps.push('requirements: at least one requirement id');
  for (const criterion of CRITERIA) {
    const value = cert.criteria?.[criterion];
    if (value && typeof value === 'object' && !Array.isArray(value) && 'na' in value) {
      if (criterion === 'financial' && feature.financial) certGaps.push('financial cannot be N/A for a financial feature');
      else if (['completeness', 'correctness', 'integration'].includes(criterion)) certGaps.push(`${criterion} is never N/A`);
      else if (typeof value.na !== 'string' || value.na.trim().length < 20) certGaps.push(`${criterion}: N/A needs a verifiable reason`);
      continue;
    }
    refs(criterion, value, {needJourney: criterion === 'integration'});
    // Integration rests on at least one step that checked the result of an action (ASSERTED), on every viewport.
    if (criterion === 'integration' && report && Array.isArray(value) && !value.some(ref => ref?.journey && !refErrors(ref, {journeys, report, asserting: true}).length)) certGaps.push('integration needs a step with recorded assertions');
  }
  // Gate A (atomic: tests) and Gate B (integration: browser steps), each declared PASS and backed by its evidence.
  for (const [gate, options] of [['gate_a', {needTest: true}], ['gate_b', {needJourney: true}]]) {
    if (cert[gate] === undefined) continue;
    if (cert[gate]?.result !== 'PASS') certGaps.push(`${gate}: result must be PASS`);
    refs(gate, cert[gate]?.evidence, options);
  }
  if (cert.fixtures !== undefined) refs('fixtures', cert.fixtures, {needTest: true});
  if (cert.results !== undefined) {
    if (!Array.isArray(cert.results) || !cert.results.length) certGaps.push('results: at least one test result');
    else for (const result of cert.results) {
      if (!resultCommand(result?.command, testFiles)) certGaps.push(`results: ${result?.command ?? '(no command)'} is not a test command of the feature`);
      if (result?.result !== 'PASS') certGaps.push(`results: ${result?.command ?? '(no command)'} is not PASS`);
      if (result?.commit !== cert.verified_commit) certGaps.push(`results: ${result?.command ?? '(no command)'} was not run on the verified commit`);
    }
  }
  if (cert.contracts !== undefined) {
    if (!Array.isArray(cert.contracts) || !cert.contracts.length) certGaps.push('contracts: at least one contract version');
    else for (const contract of cert.contracts) certGaps.push(...contractErrors(contract, sources));
  }
  if (cert.limits !== undefined && (!Array.isArray(cert.limits) || !cert.limits.length || cert.limits.some(l => typeof l !== 'string' || !l.trim()))) certGaps.push('limits: state them explicitly');
  const review = cert.independent_review;
  if (review !== undefined) {
    if (review?.verdict !== 'APPROVED') certGaps.push('independent_review: verdict must be APPROVED');
    if (!/^https:\/\/github\.com\/zarbopiero963-droid\/MatchPilot\/(pull|issues)\/\d+#issuecomment-\d+$/.test(review?.reference ?? '')) certGaps.push('independent_review: reference must be the GitHub comment of the review');
    if (!SHA.test(review?.reviewed_sha ?? '')) certGaps.push('independent_review: reviewed_sha must be a full SHA');
    else if (SHA.test(cert.verified_commit ?? '') && hasCommit(review.reviewed_sha) && !isAncestor(cert.verified_commit, review.reviewed_sha)) certGaps.push('independent_review: the reviewed commit does not contain the verified one');
    else if (!hasCommit(review.reviewed_sha)) certGaps.push(`independent_review: ${review.reviewed_sha.slice(0, 7)} is not in this clone`);
  }
  if (certGaps.length) return {state: 'TESTED', gaps: certGaps, controls};
  return {state: cert.level, gaps: [], controls};
}

// The register is valid and no declared state exceeds its evidence. Returns {errors, notes, features}.
export function checkFeatures(register, {inventory, report = null, journeys = journeyStepTitles()} = {}) {
  const errors = [], notes = [], features = [];
  if (register?.schema !== FEATURES_SCHEMA) errors.push(`schema must be ${FEATURES_SCHEMA}`);
  if (!Array.isArray(register?.features) || !register.features.length) return {errors: [...errors, 'no features'], notes, features};
  const seen = new Set(), owner = new Map(), testOwner = new Map();
  const listed = Array.isArray(register.shared_modules) ? register.shared_modules : [];
  // Besides the list, a module run by the entries of two features is shared too, mechanically (fourth review of the
  // gate): no future feature can claim the engine or the ledger another feature also runs.
  const runBy = new Map();
  for (const feature of register.features) if (typeof feature?.entry === 'string' && existsSync(join(root, feature.entry))) {
    for (const module of reachable(feature.entry)) runBy.set(module, (runBy.get(module) ?? 0) + 1);
  }
  const shared = [...new Set([...listed, ...[...runBy].filter(([, n]) => n > 1).map(([module]) => module)])];
  if (!Array.isArray(register.shared_modules)) errors.push('shared_modules must be a list');
  for (const module of listed) if (!/^src\/[\w./-]+\.m?js$/.test(module) || !existsSync(join(root, module))) errors.push(`shared module ${module} does not exist`);
  for (const feature of register.features) {
    const at = feature?.id ?? '(no id)';
    if (!ID.test(feature?.id ?? '')) { errors.push(`${at}: id must match ${ID}`); continue; }
    if (seen.has(feature.id)) errors.push(`${at}: duplicate id`);
    seen.add(feature.id);
    for (const key of ['name', 'perimeter']) if (typeof feature[key] !== 'string' || !feature[key].trim()) errors.push(`${at}: ${key} is required`);
    if (!FEATURE_STATES.includes(feature.state)) { errors.push(`${at}: state must be one of ${FEATURE_STATES.join(', ')}`); continue; }
    if (!FEATURE_DATA.includes(feature.data)) errors.push(`${at}: data must be one of ${FEATURE_DATA.join(', ')}`);
    if (typeof feature.financial !== 'boolean') errors.push(`${at}: financial must be true or false`);
    for (const key of ['views', 'controls', 'requirements', 'journeys', 'test_files', 'dependencies', 'limits']) if (feature[key] !== undefined && !Array.isArray(feature[key])) errors.push(`${at}: ${key} must be a list`);
    if (typeof feature.next !== 'string' || !feature.next.trim()) errors.push(`${at}: next (the next activity needed) is required`);
    // A test file is the evidence of one feature only (review of the gate, B1).
    for (const testFile of feature.test_files ?? []) {
      if (testOwner.has(testFile) && testOwner.get(testFile) !== feature.id) errors.push(`${testFile} is a test file of ${testOwner.get(testFile)} and ${feature.id}`);
      testOwner.set(testFile, feature.id);
    }
    if (feature.sources !== undefined && !Array.isArray(feature.sources)) errors.push(`${at}: sources must be a list`);
    // A source module is the code of one feature only: shared modules (the Math Core, the v1 layer) are not listed.
    for (const source of feature.sources ?? []) {
      if (testOwner.has(`src:${source}`) && testOwner.get(`src:${source}`) !== feature.id) errors.push(`${source} is a source of ${testOwner.get(`src:${source}`)} and ${feature.id}`);
      testOwner.set(`src:${source}`, feature.id);
    }
    if (feature.entry !== undefined) {
      if (testOwner.has(`entry:${feature.entry}`)) errors.push(`${feature.entry} is the entry of ${testOwner.get(`entry:${feature.entry}`)} and ${feature.id}`);
      testOwner.set(`entry:${feature.entry}`, feature.id);
    }
    const computed = evidenceState(feature, {inventory, report, journeys, shared});
    for (const control of computed.controls) {
      if (owner.has(control.id) && owner.get(control.id) !== feature.id) errors.push(`${control.id} belongs to ${owner.get(control.id)} and ${feature.id}`);
      owner.set(control.id, feature.id);
    }
    features.push({id: feature.id, name: feature.name, declared: feature.state, computed: computed.state, controls: computed.controls.length, gaps: computed.gaps});
    if (feature.state === 'BLOCKED') {
      if (!String(feature.reason ?? '').trim()) errors.push(`${at}: BLOCKED needs a reason`);
      continue;
    }
    if (feature.state === 'REGRESSED') {
      if (!feature.certification) errors.push(`${at}: REGRESSED needs the certification it lost`);
      else if (RANK[computed.state] >= RANK[feature.certification.level]) notes.push(`${at}: declared REGRESSED but the evidence supports ${computed.state} again`);
      continue;
    }
    const wrongLevel = feature.state.startsWith('CERTIFIED') && computed.state.startsWith('CERTIFIED') && feature.state !== computed.state;
    if (RANK[feature.state] > RANK[computed.state] || wrongLevel) {
      const regressed = feature.state.startsWith('CERTIFIED') ? ' — declare it REGRESSED or restore the evidence' : '';
      errors.push(`${at}: declared ${feature.state} but the evidence supports ${computed.state}${regressed} (${computed.gaps.slice(0, 5).join('; ')})`);
    } else if (RANK[feature.state] < RANK[computed.state]) notes.push(`${at}: declared ${feature.state}, the evidence supports ${computed.state}`);
  }
  // Every control of the inventory belongs to a feature: nothing is left out of the certification.
  for (const control of inventory.controls) if (!owner.has(control.id)) errors.push(`${control.id} belongs to no feature`);
  return {errors, notes, features};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, reportPath] = process.argv.slice(2);
  if (command !== 'status') { console.error('usage: feature-certification.mjs status [report.json]'); process.exit(2); }
  const report = reportPath ? JSON.parse(readFileSync(reportPath, 'utf8')) : null;
  const result = checkFeatures(loadFeatures(), {inventory: loadInventory(), report});
  console.log(JSON.stringify({ok: result.errors.length === 0, with_report: Boolean(report), ...result}, null, 2));
  process.exit(result.errors.length ? 1 : 0);
}
