#!/usr/bin/env node
// MP-UI-CONTINUOUS-FUNCTIONAL-CERTIFICATION-01: certification per feature, not per pull request. The register
// docs/qa/feature-certification.json lists the features a user recognizes (perimeter, views and controls, requirements,
// data, dependencies, limits). The state of each feature is COMPUTED from evidence, never taken from an agent's word:
// - IMPLEMENTED: every control of the feature exists in the control inventory, none is NOT STARTED, IN PROGRESS or
//   BLOCKED;
// - TESTED: besides, every control is TESTED (ASSERTED evidence, which verify-report re-checks against the Browser QA
//   report on every run), every test the feature names is an active test, and, with a report, every journey it names
//   passed on every viewport;
// - CERTIFIED MOCK / CERTIFIED REAL: besides, a certification record with evidence for each criterion of the policy
//   (completeness, correctness, contracts, integration, security, financial), or N/A with a reason; financial is never
//   N/A for a financial feature. Every criterion rests on at least one active test or one step of the feature's own
//   journeys (a {file} is only supplementary), integration on a step with recorded assertions, and the verified commit
//   is the report's head or one of its ancestors. MOCK is the level of DEMO data, REAL of REAL data. A COMPUTED feature
//   (the real server computing from what the user types, no data source) has no certification level until the owner
//   decides one: it stops at TESTED (review of PR #244).
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
export const FEATURES_SCHEMA = 'mp-feature-certification-1';
export const FEATURE_STATES = Object.freeze(['NOT STARTED', 'IN DEVELOPMENT', 'IMPLEMENTED', 'TESTED', 'CERTIFIED MOCK', 'CERTIFIED REAL', 'BLOCKED', 'REGRESSED']);
// The order of the evidence: a state is supported when the evidence reaches it.
const RANK = {'NOT STARTED': 0, 'IN DEVELOPMENT': 1, IMPLEMENTED: 2, TESTED: 3, 'CERTIFIED MOCK': 4, 'CERTIFIED REAL': 4};
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
function refErrors(ref, {journeys, report, asserting = false}) {
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

// The state the evidence supports, with the reasons it stops there.
export function evidenceState(feature, {inventory, report = null, journeys = journeyStepTitles()}) {
  const gaps = [];
  const controls = controlsOf(feature, inventory);
  const known = new Set(inventory.controls.map(c => c.id));
  for (const id of feature.controls ?? []) if (!known.has(id)) gaps.push(`control ${id} is not in the inventory`);
  if (!controls.length) return {state: 'NOT STARTED', gaps: [...gaps, 'no control in the inventory'], controls: []};
  const unbuilt = controls.filter(c => NOT_BUILT.includes(c.status));
  if (unbuilt.length || gaps.length) return {state: 'IN DEVELOPMENT', gaps: [...gaps, ...unbuilt.map(c => `${c.id} is ${c.status}`)], controls};
  const untested = controls.filter(c => !EVIDENCED.includes(c.status));
  gaps.push(...untested.map(c => `${c.id} is ${c.status} (evidence ${c.evidence})`));
  for (const ref of feature.tests ?? []) gaps.push(...refErrors(ref, {journeys, report}).map(e => `test: ${e}`));
  if (report) for (const id of feature.journeys ?? []) for (const viewport of REQUIRED_VIEWPORTS) {
    if (!(report.journeys ?? []).some(run => run.id === id && run.viewport === viewport && run.status === 'PASS')) gaps.push(`journey ${id}/${viewport} did not pass`);
  }
  if (gaps.length) return {state: 'IMPLEMENTED', gaps, controls};
  const cert = feature.certification;
  if (!cert) return {state: 'TESTED', gaps: ['no certification record'], controls};
  const certGaps = [];
  if (!['CERTIFIED MOCK', 'CERTIFIED REAL'].includes(cert.level)) certGaps.push('certification level must be CERTIFIED MOCK or CERTIFIED REAL');
  if (cert.level === 'CERTIFIED MOCK' && feature.data !== 'DEMO') certGaps.push('CERTIFIED MOCK is the level of DEMO data');
  if (cert.level === 'CERTIFIED REAL' && feature.data !== 'REAL') certGaps.push(feature.data === 'COMPUTED'
    ? 'a COMPUTED feature has no certification level until the owner decides one' : 'CERTIFIED REAL is the level of REAL data');
  if (!SHA.test(cert.verified_commit ?? '')) certGaps.push('verified_commit must be a full SHA');
  else if (report && SHA.test(report.head_sha ?? '') && !isAncestor(cert.verified_commit, report.head_sha)) certGaps.push(`verified_commit ${cert.verified_commit.slice(0, 7)} is not the report head or one of its ancestors`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cert.date ?? '')) certGaps.push('date must be YYYY-MM-DD');
  if (typeof cert.perimeter !== 'string' || cert.perimeter.trim().length < 20) certGaps.push('the perimeter must be stated');
  for (const criterion of CRITERIA) {
    const value = cert.criteria?.[criterion];
    if (value && typeof value === 'object' && !Array.isArray(value) && 'na' in value) {
      if (criterion === 'financial' && feature.financial) certGaps.push('financial cannot be N/A for a financial feature');
      else if (typeof value.na !== 'string' || value.na.trim().length < 20) certGaps.push(`${criterion}: N/A needs a verifiable reason`);
      continue;
    }
    if (!Array.isArray(value) || !value.length) { certGaps.push(`${criterion}: no evidence`); continue; }
    // A document is supplementary: each criterion rests on a test or a step of the feature's own journeys.
    if (!value.some(ref => ref?.test || ref?.journey)) certGaps.push(`${criterion}: needs a test or a Browser QA step, not only documents`);
    for (const ref of value) if (ref?.journey && !(feature.journeys ?? []).includes(ref.journey)) certGaps.push(`${criterion}: ${ref.journey} is not a journey of the feature`);
    if (criterion === 'integration' && !value.some(ref => ref?.journey)) certGaps.push('integration needs a Browser QA step');
    // Integration rests on at least one step that checked the result of an action (ASSERTED), on every viewport.
    if (criterion === 'integration' && report && !value.some(ref => ref?.journey && !refErrors(ref, {journeys, report, asserting: true}).length)) certGaps.push('integration needs a step with recorded assertions');
    for (const ref of value) certGaps.push(...refErrors(ref, {journeys, report}).map(e => `${criterion}: ${e}`));
  }
  if (certGaps.length) return {state: 'TESTED', gaps: certGaps, controls};
  return {state: cert.level, gaps: [], controls};
}

// The register is valid and no declared state exceeds its evidence. Returns {errors, notes, features}.
export function checkFeatures(register, {inventory, report = null, journeys = journeyStepTitles()} = {}) {
  const errors = [], notes = [], features = [];
  if (register?.schema !== FEATURES_SCHEMA) errors.push(`schema must be ${FEATURES_SCHEMA}`);
  if (!Array.isArray(register?.features) || !register.features.length) return {errors: [...errors, 'no features'], notes, features};
  const seen = new Set(), owner = new Map();
  for (const feature of register.features) {
    const at = feature?.id ?? '(no id)';
    if (!ID.test(feature?.id ?? '')) { errors.push(`${at}: id must match ${ID}`); continue; }
    if (seen.has(feature.id)) errors.push(`${at}: duplicate id`);
    seen.add(feature.id);
    for (const key of ['name', 'perimeter']) if (typeof feature[key] !== 'string' || !feature[key].trim()) errors.push(`${at}: ${key} is required`);
    if (!FEATURE_STATES.includes(feature.state)) { errors.push(`${at}: state must be one of ${FEATURE_STATES.join(', ')}`); continue; }
    if (!FEATURE_DATA.includes(feature.data)) errors.push(`${at}: data must be one of ${FEATURE_DATA.join(', ')}`);
    if (typeof feature.financial !== 'boolean') errors.push(`${at}: financial must be true or false`);
    for (const key of ['views', 'controls', 'requirements', 'journeys', 'dependencies', 'limits']) if (feature[key] !== undefined && !Array.isArray(feature[key])) errors.push(`${at}: ${key} must be a list`);
    if (typeof feature.next !== 'string' || !feature.next.trim()) errors.push(`${at}: next (the next activity needed) is required`);
    const computed = evidenceState(feature, {inventory, report, journeys});
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
