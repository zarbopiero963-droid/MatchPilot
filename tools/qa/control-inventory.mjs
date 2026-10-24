// MP-UI-PR-001 (MP-UI-ROADMAP-01, #239): the atomic inventory of the web app's interactive controls.
// docs/qa/control-inventory.json lists every control with a stable id (the `data-control` attribute in the page), where
// it lives, what it does, which API it calls, where its data comes from, the issues it serves, its status, its evidence
// level and the Browser QA steps that give that evidence (MP-UI-HARD-GATES-01: SEEN -> ACTUATED -> ASSERTED -> CERTIFIED
// MOCK). Three checks keep it honest:
// - the Browser QA gate fails on any visible control without `data-control`, or with an id this file does not list;
// - the gate records, for every step, the controls seen at its end and those actually actuated (click, input, change,
//   submit);
// - verify-report fails when a control declared SEEN or ACTUATED was not seen or actuated in each step it names.
// Being actuated is not being verified: TESTED and the certified statuses need ASSERTED evidence (the result of the
// action checked), which this gate does not record yet (the ASSERTED gate is a separate PR), so none is accepted today.
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
// Evidence levels, each implying the previous one; SEEN and ACTUATED are checked against the report (`seen`, `actuated`).
export const EVIDENCE_LEVELS = Object.freeze(['NONE', 'SEEN', 'ACTUATED', 'ASSERTED']);
const REPORT_KEY = {SEEN: 'seen', ACTUATED: 'actuated'};
// The statuses that claim a verified result: they need ASSERTED evidence.
export const EVIDENCED = Object.freeze(['TESTED', 'CERTIFIED MOCK', 'CERTIFIED REAL']);
export const ASSERTED_SUPPORTED = false; // true once the Browser QA report records assertions per control

export function loadInventory(path = INVENTORY_PATH) {
  if (!existsSync(path)) throw new Error(`control inventory missing: ${path}`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

export const inventoryIds = inventory => inventory.controls.map(control => control.id);

// Structural checks; `journeys` is {id: [step titles]} of tools/qa/journeys.mjs (a RegExp for a title built at run time).
export function validateInventory(inventory, {journeys}) {
  const errors = [];
  if (inventory.schema !== INVENTORY_SCHEMA) errors.push(`schema must be ${INVENTORY_SCHEMA}`);
  if (!Array.isArray(inventory.controls) || !inventory.controls.length) return [...errors, 'no controls'];
  const seen = new Set();
  for (const control of inventory.controls) {
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
    if (control.evidence === 'ASSERTED' && !ASSERTED_SUPPORTED) errors.push(`${at}: ASSERTED evidence is not recorded by the gate yet`);
    if (EVIDENCED.includes(control.status) && control.evidence !== 'ASSERTED') errors.push(`${at}: ${control.status} needs ASSERTED evidence (a verified result), not ${control.evidence}`);
    if (control.status === 'CERTIFIED REAL' && control.data !== 'REAL') errors.push(`${at}: CERTIFIED REAL needs REAL data`);
    if (['BLOCKED', 'NOT STARTED'].includes(control.status) && !String(control.reason ?? '').trim()) errors.push(`${at}: ${control.status} needs a reason`);
  }
  return errors;
}

// Every SEEN or ACTUATED control was seen or actuated in each step it names, in every passed run of that journey.
export function verifyCoverage(inventory, report) {
  const errors = [];
  const all = Array.isArray(report?.journeys) ? report.journeys : [];
  const stepsOf = run => (Array.isArray(run?.steps) ? run.steps : []);
  const runs = all.filter(journey => journey?.status === 'PASS');
  for (const control of inventory.controls) {
    const key = REPORT_KEY[control.evidence];
    if (!key) continue;
    for (const ref of control.exercised_by) {
      const matching = runs.filter(journey => journey.id === ref.journey);
      if (!matching.length) { errors.push(`${control.id}: no passed run of ${ref.journey}`); continue; }
      for (const run of matching) {
        const step = stepsOf(run).find(s => s?.name === ref.step);
        if (!step) errors.push(`${control.id}: ${ref.journey}/${run.viewport} has no step «${ref.step}»`);
        else if (!(Array.isArray(step[key]) && step[key].includes(control.id))) errors.push(`${control.id}: not ${key === 'seen' ? 'seen' : 'actuated'} in ${ref.journey}/${run.viewport} «${ref.step}»`);
      }
    }
  }
  const known = new Set(inventoryIds(inventory));
  for (const run of all) for (const step of stepsOf(run)) {
    for (const id of [...(Array.isArray(step?.actuated) ? step.actuated : []), ...(Array.isArray(step?.seen) ? step.seen : [])]) if (!known.has(id)) errors.push(`${run.id}/${run.viewport} «${step.name}»: control ${id} not in the inventory`);
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

// For curation: the steps where each control was actuated (key 'actuated') or seen (key 'seen') in every passed run of
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
  if (command === 'progress') console.log(JSON.stringify(progress(loadInventory()), null, 2));
  else if (['actuations', 'sightings'].includes(command) && rest[0]) {
    console.log(JSON.stringify(actuationsFrom(JSON.parse(readFileSync(rest[0], 'utf8')), command === 'actuations' ? 'actuated' : 'seen'), null, 2));
  } else { console.error('usage: control-inventory.mjs progress | actuations <report.json> | sightings <report.json>'); process.exit(2); }
}
