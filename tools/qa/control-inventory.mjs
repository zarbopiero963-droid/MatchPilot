// MP-UI-PR-001 (MP-UI-ROADMAP-01, #239): the atomic inventory of the web app's interactive controls.
// docs/qa/control-inventory.json lists every control with a stable id (the `data-control` attribute in the page), where
// it lives, what it does, which API it calls, where its data comes from, the issues it serves, its status, its evidence
// level and the Browser QA steps that give that evidence (MP-UI-HARD-GATES-01: SEEN -> ACTUATED -> ASSERTED -> CERTIFIED
// MOCK). Three checks keep it honest:
// - the Browser QA gate fails on any visible control without `data-control`, or with an id this file does not list;
// - the gate records, for every step, the controls seen at its end, those actually actuated (click, input, change,
//   submit) and those asserted: a journey's `asserted(controls, description, check)` passed after the control was
//   actuated in the same step (MP-UI-PR-002);
// - verify-report fails when a control declared SEEN, ACTUATED or ASSERTED was not seen, actuated or asserted in each step
//   it names, on every viewport.
// Being actuated is not being verified: TESTED needs ASSERTED evidence. CERTIFIED MOCK needs, besides, the Gate A and
// Gate B evidence of MP-UI-HARD-GATES-01 (`certification`, below). CERTIFIED REAL needs a REAL certification campaign on
// the real backend and data, which does not exist yet: it is refused.
// `node tools/qa/control-inventory.mjs progress` prints the completion computed from statuses and evidence, never estimated.
import {existsSync, readFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const INVENTORY_PATH = join(root, 'docs/qa/control-inventory.json');
export const INVENTORY_SCHEMA = 'mp-control-inventory-1';
export const CONTROL_STATUSES = Object.freeze(['NOT STARTED', 'IN PROGRESS', 'IMPLEMENTED', 'TESTED', 'CERTIFIED MOCK', 'CERTIFIED REAL', 'BLOCKED']);
export const DATA_STATES = Object.freeze(['REAL', 'DEMO', 'UNAVAILABLE', 'NONE']);
export const KINDS = Object.freeze(['link', 'button', 'input', 'select', 'checkbox', 'textarea', 'summary']);
const ID = /^CTL-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
// Evidence levels, each implying the previous one, checked against the report (`seen`, `actuated`, `asserted`).
export const EVIDENCE_LEVELS = Object.freeze(['NONE', 'SEEN', 'ACTUATED', 'ASSERTED']);
const REPORT_KEY = {SEEN: 'seen', ACTUATED: 'actuated', ASSERTED: 'asserted'};
// The statuses that claim a verified result: they need ASSERTED evidence.
export const EVIDENCED = Object.freeze(['TESTED', 'CERTIFIED MOCK', 'CERTIFIED REAL']);
export const ASSERTED_SUPPORTED = true; // the Browser QA report records assertions per control (MP-UI-PR-002)
export const REAL_CERTIFICATION_SUPPORTED = false; // no REAL campaign on the real backend and data exists yet
// The evidence CERTIFIED MOCK needs (MP-UI-HARD-GATES-01 §3-4): Gate A per control (positive, negative, limits and
// errors, state transitions, API or mock contract) and Gate B (an integrated path and an adversarial one). Each category
// lists at least one reference: a Browser QA step that asserted the control ({journey, step}) or a unit/integration test
// ({test: 'test/<file>.test.mjs', name}). The positive case and both Gate B categories need a browser step.
export const GATE_A = Object.freeze(['positive', 'negative', 'limits', 'transitions', 'contract']);
export const GATE_B = Object.freeze(['integrated', 'adversarial']);
const BROWSER_REQUIRED = new Set(['positive', 'integrated', 'adversarial']);

export function loadInventory(path = INVENTORY_PATH) {
  if (!existsSync(path)) throw new Error(`control inventory missing: ${path}`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

export const inventoryIds = inventory => inventory.controls.map(control => control?.id).filter(Boolean);

// The step titles of each journey, read from the source of tools/qa/journeys.mjs: a literal title as is, a template
// title as a pattern. Used to check the steps the inventory names, in the unit test and in verify-report.
export function journeyStepTitles(text = readFileSync(join(root, 'tools/qa/journeys.mjs'), 'utf8')) {
  const starts = [...text.matchAll(/^ {4}id: '([a-z-]+)'/gm)];
  const out = {};
  starts.forEach((match, i) => {
    const body = text.slice(match.index, starts[i + 1]?.index ?? text.length);
    out[match[1]] = [...body.matchAll(/\bstep\(\s*(?:'([^']*)'|`([^`]*)`)/g)].map(([, literal, template]) => (literal !== undefined ? literal
      : new RegExp(`^${template.split(/\$\{[^}]*\}/).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.+')}$`)));
  });
  return out;
}

// Structural checks; `journeys` is {id: [step titles]} of tools/qa/journeys.mjs (a RegExp for a title built at run time).
export function validateInventory(inventory, {journeys}) {
  const errors = [];
  if (inventory.schema !== INVENTORY_SCHEMA) errors.push(`schema must be ${INVENTORY_SCHEMA}`);
  if (!Array.isArray(inventory.controls) || !inventory.controls.length) return [...errors, 'no controls'];
  const seen = new Set();
  for (const control of inventory.controls) {
    if (control === null || typeof control !== 'object' || Array.isArray(control)) { errors.push('a control must be an object'); continue; }
    const at = control.id ?? '(no id)';
    if (!ID.test(control.id ?? '')) errors.push(`${at}: id must match ${ID}`);
    if (seen.has(control.id)) errors.push(`${at}: duplicate id`);
    seen.add(control.id);
    for (const field of ['view', 'label', 'action']) if (typeof control[field] !== 'string' || !control[field].trim()) errors.push(`${at}: ${field} is required`);
    if (!KINDS.includes(control.kind)) errors.push(`${at}: kind must be one of ${KINDS.join(', ')}`);
    if (!DATA_STATES.includes(control.data)) errors.push(`${at}: data must be one of ${DATA_STATES.join(', ')}`);
    if (!CONTROL_STATUSES.includes(control.status)) errors.push(`${at}: status must be one of ${CONTROL_STATUSES.join(', ')}`);
    const apis = Array.isArray(control.api) ? control.api : [control.api];
    if (control.api !== null && (!apis.length || apis.some(api => typeof api !== 'string' || !api.startsWith('/')))) errors.push(`${at}: api must be a path, a list of paths or null`);
    if (!Array.isArray(control.issues) || control.issues.some(issue => !Number.isInteger(issue))) errors.push(`${at}: issues must be a list of issue numbers`);
    if (!Array.isArray(control.exercised_by)) { errors.push(`${at}: exercised_by must be a list`); continue; }
    for (const ref of control.exercised_by) {
      if (!journeys[ref?.journey]) errors.push(`${at}: unknown journey ${ref?.journey}`);
      else if (!journeys[ref.journey].some(title => (title instanceof RegExp ? title.test(ref.step) : title === ref.step))) errors.push(`${at}: journey ${ref.journey} has no step «${ref.step}»`);
    }
    if (!EVIDENCE_LEVELS.includes(control.evidence)) { errors.push(`${at}: evidence must be one of ${EVIDENCE_LEVELS.join(', ')}`); continue; }
    if (control.evidence === 'NONE' && control.exercised_by.length) errors.push(`${at}: names steps but its evidence is NONE`);
    if (control.evidence !== 'NONE' && !control.exercised_by.length) errors.push(`${at}: evidence ${control.evidence} without a step that gives it`);
    errors.push(...certificationErrors(control, journeys));
    if (control.status === 'CERTIFIED REAL' && control.data !== 'REAL') errors.push(`${at}: CERTIFIED REAL needs REAL data`);
    if (['BLOCKED', 'NOT STARTED'].includes(control.status) && !String(control.reason ?? '').trim()) errors.push(`${at}: ${control.status} needs a reason`);
  }
  return errors;
}

// The rules that tie the status to the evidence, shared by validateInventory and verifyCoverage (one message each).
// With `journeys`, the step references of `certification` are checked too; test references are checked on disk.
function certificationErrors(control, journeys = null) {
  const at = control.id ?? '(no id)';
  const errors = [];
  if (control.evidence === 'ASSERTED' && !ASSERTED_SUPPORTED) errors.push(`${at}: ASSERTED evidence is not recorded by the gate yet`);
  if (EVIDENCED.includes(control.status) && control.evidence !== 'ASSERTED') errors.push(`${at}: ${control.status} needs ASSERTED evidence (a verified result), not ${control.evidence}`);
  if (control.status === 'CERTIFIED REAL' && !REAL_CERTIFICATION_SUPPORTED) errors.push(`${at}: CERTIFIED REAL needs a REAL certification campaign, which does not exist yet`);
  const certified = ['CERTIFIED MOCK', 'CERTIFIED REAL'].includes(control.status);
  if (!certified) {
    if (control.certification !== undefined) errors.push(`${at}: certification evidence on a ${control.status} control`);
    return errors;
  }
  const cert = control.certification;
  if (cert === null || typeof cert !== 'object') return [...errors, `${at}: ${control.status} needs certification evidence (Gate A and Gate B)`];
  for (const [gate, categories] of [['gate_a', GATE_A], ['gate_b', GATE_B]]) for (const category of categories) {
    const refs = cert[gate]?.[category];
    if (!Array.isArray(refs) || !refs.length) { errors.push(`${at}: ${gate}.${category} has no evidence`); continue; }
    if (BROWSER_REQUIRED.has(category) && !refs.some(ref => ref?.journey)) errors.push(`${at}: ${gate}.${category} needs a Browser QA step`);
    for (const ref of refs) {
      if (ref?.journey) {
        if (journeys && !journeys[ref.journey]?.some(title => (title instanceof RegExp ? title.test(ref.step) : title === ref.step))) errors.push(`${at}: ${gate}.${category}: no step «${ref.step}» in ${ref.journey}`);
      } else if (typeof ref?.test === 'string' && typeof ref?.name === 'string' && /^test\/[\w./-]+\.test\.mjs$/.test(ref.test) && !ref.test.includes('..')) {
        const file = join(root, ref.test);
        if (!existsSync(file)) errors.push(`${at}: ${gate}.${category}: ${ref.test} does not exist`);
        else if (!readFileSync(file, 'utf8').includes(`test('${ref.name}'`)) errors.push(`${at}: ${gate}.${category}: no test «${ref.name}» in ${ref.test}`);
      } else errors.push(`${at}: ${gate}.${category}: a reference is {journey, step} or {test, name}`);
    }
  }
  return errors;
}

// The browser steps a control's claims rely on: its evidence steps and the browser steps of its certification.
const browserRefs = control => [...(control.exercised_by ?? []).map(ref => ({...ref, key: REPORT_KEY[control.evidence], why: 'evidence'})),
  ...[['gate_a', GATE_A], ['gate_b', GATE_B]].flatMap(([gate, categories]) => categories.flatMap(category =>
    (control.certification?.[gate]?.[category] ?? []).filter(ref => ref?.journey).map(ref => ({...ref, key: 'asserted', why: `${gate}.${category}`}))))];

// Every SEEN, ACTUATED or ASSERTED control was seen, actuated or asserted in each step it names, in every passed run of
// that journey, and so was every browser step of a certification; no verified status is claimed that the report cannot
// back; in each step, what was asserted was actuated. With `journeys`, the inventory is also validated in full, as
// verify-report does: the evidence gate never relies on the unit tests alone.
export function verifyCoverage(inventory, report, {journeys = null} = {}) {
  const errors = journeys ? validateInventory(inventory, {journeys}) : [];
  if (!Array.isArray(inventory?.controls)) return [...errors, 'inventory has no controls'];
  const all = Array.isArray(report?.journeys) ? report.journeys : [];
  const stepsOf = run => (Array.isArray(run?.steps) ? run.steps : []);
  const runs = all.filter(journey => journey?.status === 'PASS');
  const list = value => (Array.isArray(value) ? value : []);
  for (const control of inventory.controls) {
    if (control === null || typeof control !== 'object') { errors.push('a control must be an object'); continue; }
    errors.push(...certificationErrors(control));
    if (control.evidence === 'ASSERTED' && !ASSERTED_SUPPORTED) continue;
    if (!Array.isArray(control.exercised_by)) { errors.push(`${control.id}: exercised_by must be a list`); continue; }
    for (const ref of browserRefs(control)) {
      if (!ref.key) continue;
      const matching = runs.filter(journey => journey.id === ref.journey);
      if (!matching.length) { errors.push(`${control.id}: no passed run of ${ref.journey}`); continue; }
      for (const run of matching) {
        const step = stepsOf(run).find(s => s?.name === ref.step);
        if (!step) errors.push(`${control.id}: ${ref.journey}/${run.viewport} has no step «${ref.step}»`);
        else if (!list(step[ref.key]).includes(control.id)) errors.push(`${control.id}: not ${ref.key} in ${ref.journey}/${run.viewport} «${ref.step}»${ref.why === 'evidence' ? '' : ` (${ref.why})`}`);
      }
    }
  }
  const known = new Set(inventoryIds(inventory));
  for (const run of all) for (const step of stepsOf(run)) {
    const where = `${run.id}/${run.viewport} «${step.name}»`;
    for (const id of [...list(step?.actuated), ...list(step?.seen), ...list(step?.asserted)]) if (!known.has(id)) errors.push(`${where}: control ${id} not in the inventory`);
    // A step's asserted controls were actuated in that step, and each comes from a recorded assertion.
    for (const id of list(step?.asserted)) if (!list(step.actuated).includes(id)) errors.push(`${where}: ${id} asserted but not actuated`);
    const fromAssertions = new Set(list(step?.assertions).flatMap(a => list(a?.controls)));
    for (const id of list(step?.asserted)) if (!fromAssertions.has(id)) errors.push(`${where}: ${id} asserted without a recorded assertion`);
    for (const a of list(step?.assertions)) if (typeof a?.description !== 'string' || a.description.trim().length < 8) errors.push(`${where}: an assertion without a description`);
  }
  return [...new Set(errors)];
}

// Completion from statuses and evidence: verified = TESTED or certified (a checked result); the evidence chain is counted
// cumulatively (an ACTUATED control was also seen); certified mock and real apart.
export function progress(inventory) {
  const by = Object.fromEntries(CONTROL_STATUSES.map(status => [status, 0]));
  const evidence = Object.fromEntries(EVIDENCE_LEVELS.map(level => [level, 0]));
  for (const control of inventory.controls) { by[control.status]++; evidence[control.evidence]++; }
  const total = inventory.controls.length;
  const atLeast = level => EVIDENCE_LEVELS.slice(EVIDENCE_LEVELS.indexOf(level)).reduce((sum, l) => sum + evidence[l], 0);
  const verified = EVIDENCED.reduce((sum, status) => sum + by[status], 0);
  const pct = n => (total ? Math.round((n / total) * 1000) / 10 : 0);
  return {total, by_status: by, by_evidence: evidence,
    seen: atLeast('SEEN'), seen_pct: pct(atLeast('SEEN')), actuated: atLeast('ACTUATED'), actuated_pct: pct(atLeast('ACTUATED')),
    asserted: atLeast('ASSERTED'), asserted_pct: pct(atLeast('ASSERTED')), verified, verified_pct: pct(verified),
    certified_mock: by['CERTIFIED MOCK'], certified_mock_pct: pct(by['CERTIFIED MOCK']), certified_real: by['CERTIFIED REAL'], certified_real_pct: pct(by['CERTIFIED REAL'])};
}

const CURATION_KEY = {assertions: 'asserted', actuations: 'actuated', sightings: 'seen'};
// For curation: the steps where each control was asserted, actuated or seen (the report key) in every passed run of
// the journey (each viewport), so that what it proposes passes verifyCoverage on the same report.
export function actuationsFrom(report, key = 'actuated') {
  const runs = (report.journeys ?? []).filter(run => run.status === 'PASS');
  const out = {};
  for (const run of runs) for (const step of run.steps ?? []) for (const id of step[key] ?? []) {
    if (out[id]?.some(ref => ref.journey === run.id && ref.step === step.name)) continue;
    const everywhere = runs.filter(other => other.id === run.id)
      .every(other => (other.steps ?? []).find(s => s.name === step.name)?.[key]?.includes(id));
    if (everywhere) (out[id] ??= []).push({journey: run.id, step: step.name});
  }
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...rest] = process.argv.slice(2);
  if (command === 'progress') {
    // Completion is printed only for an inventory that passes validation.
    const inventory = loadInventory();
    const errors = validateInventory(inventory, {journeys: journeyStepTitles()});
    if (errors.length) { console.error(JSON.stringify({ok: false, errors}, null, 2)); process.exit(1); }
    console.log(JSON.stringify(progress(inventory), null, 2));
  }
  else if (Object.hasOwn(CURATION_KEY, command) && rest[0]) {
    console.log(JSON.stringify(actuationsFrom(JSON.parse(readFileSync(rest[0], 'utf8')), CURATION_KEY[command]), null, 2));
  } else { console.error('usage: control-inventory.mjs progress | assertions|actuations|sightings <report.json>'); process.exit(2); }
}
