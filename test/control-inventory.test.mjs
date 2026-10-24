// MP-UI-PR-001 (#239): the control inventory is complete and consistent with the code and the Browser QA journeys.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {EVIDENCED, actuationsFrom, inventoryIds, loadInventory, progress, validateInventory, verifyCoverage} from '../tools/qa/control-inventory.mjs';
import {JOURNEYS} from '../tools/qa/journeys.mjs';

const source = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const app = source('src/web/app.js');
const html = source('src/web/index.html');
const inventory = loadInventory();
const ids = new Set(inventoryIds(inventory));

// The step titles of each journey, read from its source: a literal title as is, a template title as a pattern.
function journeySteps() {
  const text = source('tools/qa/journeys.mjs');
  const starts = [...text.matchAll(/^ {4}id: '([a-z-]+)'/gm)];
  const out = {};
  starts.forEach((match, i) => {
    const body = text.slice(match.index, starts[i + 1]?.index ?? text.length);
    out[match[1]] = [...body.matchAll(/\bstep\(\s*(?:'([^']*)'|`([^`]*)`)/g)].map(([, literal, template]) => (literal !== undefined ? literal
      : new RegExp(`^${template.split(/\$\{[^}]*\}/).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.+')}$`)));
  });
  return out;
}
const journeys = journeySteps();

test('the journey step titles are read for every journey', () => {
  assert.deepEqual(Object.keys(journeys).sort(), JOURNEYS.map(journey => journey.id).sort());
  for (const [id, steps] of Object.entries(journeys)) assert.ok(steps.length > 0, id);
});

test('the inventory is structurally valid against the journeys', () => {
  assert.deepEqual(validateInventory(inventory, {journeys}), []);
});

test('every literal data-control id of the page is in the inventory, and every inventory id exists in the page', () => {
  const literal = new Set([...`${app}\n${html}`.matchAll(/(?:'data-control': |data-control=")['"]?(CTL-[A-Z0-9-]+)/g)].map(match => match[1]));
  assert.ok(literal.size > 30);
  for (const id of literal) assert.ok(ids.has(id), `${id} is in the page but not in the inventory`);
  // Generated ids come from ctl('VIEW', name): their prefixes.
  const prefixes = [...app.matchAll(/\bctl\('([A-Z-]+)'/g)].map(match => `CTL-${match[1]}-`);
  assert.ok(prefixes.length >= 5);
  // A generated id must name a field the page builds: its name part is a quoted name in app.js (CTL-SIM-ODDS-MIN ->
  // 'odds_min'; compare ids carry the configuration key first, CTL-CMP-A-STRATEGY -> 'strategy').
  const cmpKeys = [...(/const CMP_KEYS = \[([^\]]*)\]/.exec(app)?.[1].matchAll(/'([a-z])'/g) ?? [])].map(match => match[1]);
  assert.deepEqual(cmpKeys, ['a', 'b', 'c']);
  for (const id of ids) {
    if (literal.has(id)) continue;
    const prefix = prefixes.find(p => id.startsWith(p));
    assert.ok(prefix, `${id} is in the inventory but not in the page`);
    let field = id.slice(prefix.length).toLowerCase().replace(/-/g, '_');
    if (prefix === 'CTL-CMP-' && cmpKeys.some(key => field.startsWith(`${key}_`)) && !app.includes(`'${field}'`)) field = field.slice(2);
    assert.ok(app.includes(`'${field}'`), `${id} names no field of the page («${field}»)`);
  }
  // No control is created without an id: every button, select and input built by el() names one, directly or through
  // the form helpers that add it.
  for (const match of app.matchAll(/el\('(button|select|input)', \{([^}]*)\}/g)) assert.match(match[2], /'data-control'/, `el('${match[1]}') without data-control: ${match[2].slice(0, 80)}`);
});

test('the validator refuses a forged or incomplete inventory', () => {
  const actuated = inventory.controls.find(control => control.evidence === 'ACTUATED');
  const mutate = change => { const copy = structuredClone(inventory); change(copy, copy.controls.find(control => control.id === actuated.id)); return validateInventory(copy, {journeys}); };
  assert.match(mutate((_, c) => { c.exercised_by = []; }).join(), /evidence ACTUATED without a step/);
  assert.match(mutate((_, c) => { c.exercised_by = [{journey: c.exercised_by[0].journey, step: 'no such step'}]; }).join(), /has no step/);
  assert.match(mutate((_, c) => { c.exercised_by = [{journey: 'ghost', step: 'x'}]; }).join(), /unknown journey/);
  assert.match(mutate((_, c) => { c.evidence = 'NONE'; }).join(), /evidence is NONE/);
  assert.match(mutate((_, c) => { c.evidence = 'CLICKED'; }).join(), /evidence must be/);
  assert.match(mutate((_, c) => { c.status = 'BLOCKED'; }).join(), /needs a reason/);
  assert.match(mutate((copy, c) => { copy.controls.push({...c}); }).join(), /duplicate id/);
  assert.match(mutate((_, c) => { c.id = 'ctl-lower'; }).join(), /id must match/);
  assert.match(mutate((_, c) => { c.kind = 'widget'; }).join(), /kind must be/);
  // MP-UI-HARD-GATES-01 §8: being actuated is not a verified result. TESTED and the certified statuses need ASSERTED
  // evidence, which the gate does not record yet: no claim of it is accepted.
  for (const status of EVIDENCED) assert.match(mutate((_, c) => { c.status = status; }).join(), new RegExp(`${status} needs ASSERTED evidence`), status);
  assert.match(mutate((_, c) => { c.evidence = 'ASSERTED'; }).join(), /not recorded by the gate yet/);
  assert.match(mutate((_, c) => { c.status = 'CERTIFIED REAL'; c.evidence = 'ASSERTED'; c.data = 'DEMO'; }).join(), /needs REAL data/);
});

test('coverage: a SEEN or ACTUATED control must be seen or actuated in each step it names, on every viewport', () => {
  const claimed = inventory.controls.filter(control => ['SEEN', 'ACTUATED'].includes(control.evidence));
  assert.ok(claimed.some(c => c.evidence === 'SEEN') && claimed.some(c => c.evidence === 'ACTUATED'));
  // A report built from the inventory's own claims passes; dropping one sighting or actuation on one viewport fails.
  const runs = [];
  for (const journey of JOURNEYS) for (const viewport of ['desktop', 'mobile']) {
    const steps = new Map();
    for (const control of claimed) for (const ref of control.exercised_by) if (ref.journey === journey.id) {
      if (!steps.has(ref.step)) steps.set(ref.step, {name: ref.step, status: 'PASS', actuated: [], seen: []});
      const step = steps.get(ref.step);
      step.seen.push(control.id);
      if (control.evidence === 'ACTUATED') step.actuated.push(control.id);
    }
    runs.push({id: journey.id, viewport, status: 'PASS', steps: [...steps.values()]});
  }
  const report = {journeys: runs};
  assert.deepEqual(verifyCoverage(inventory, report), []);
  assert.equal(Object.keys(actuationsFrom(report)).length, claimed.filter(c => c.evidence === 'ACTUATED').length);
  assert.equal(Object.keys(actuationsFrom(report, 'seen')).length, claimed.length);
  const drop = (key, evidence, pattern) => {
    const forged = structuredClone(report);
    const id = claimed.find(c => c.evidence === evidence).id;
    for (const run of forged.journeys) if (run.viewport === 'mobile') for (const step of run.steps) step[key] = step[key].filter(x => x !== id);
    assert.match(verifyCoverage(inventory, forged).join(), pattern);
  };
  drop('actuated', 'ACTUATED', /not actuated in .*\/mobile/);
  drop('seen', 'SEEN', /not seen in .*\/mobile/);
  const unknown = structuredClone(report);
  unknown.journeys[0].steps.push({name: 'x', status: 'PASS', actuated: [], seen: ['CTL-NOT-INVENTORIED']});
  assert.match(verifyCoverage(inventory, unknown).join(), /CTL-NOT-INVENTORIED not in the inventory/);
  // A malformed report is refused with errors, never a crash.
  for (const bad of [{}, {journeys: 'x'}, {journeys: [{id: claimed[0].exercised_by[0].journey, viewport: 'desktop', status: 'PASS'}]}, {journeys: [null]}]) {
    assert.ok(verifyCoverage(inventory, bad).length > 0, JSON.stringify(bad));
  }
});

test('progress is computed from statuses and evidence, and nothing counts as verified without ASSERTED', () => {
  const result = progress(inventory);
  assert.equal(result.total, inventory.controls.length);
  assert.equal(Object.values(result.by_status).reduce((a, b) => a + b, 0), result.total);
  assert.equal(Object.values(result.by_evidence).reduce((a, b) => a + b, 0), result.total);
  assert.equal(result.actuated, inventory.controls.filter(c => ['ACTUATED', 'ASSERTED'].includes(c.evidence)).length);
  assert.ok(result.seen >= result.actuated && result.actuated >= result.asserted);
  assert.equal(result.verified, 0);
  assert.equal(result.certified_mock, 0);
  assert.equal(result.certified_real, 0); // QA data is a seeded fixture: nothing is certified on real data here
});
