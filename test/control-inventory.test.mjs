// MP-UI-PR-001 (#239): the control inventory is complete and consistent with the code and the Browser QA journeys.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {EVIDENCED, inventoryIds, loadInventory, progress, validateInventory, verifyCoverage, actuationsFrom} from '../tools/qa/control-inventory.mjs';
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
  for (const id of ids) assert.ok(literal.has(id) || prefixes.some(prefix => id.startsWith(prefix)), `${id} is in the inventory but not in the page`);
  // No control is created without an id: every button, select and input built by el() names one, directly or through
  // the form helpers that add it.
  for (const match of app.matchAll(/el\('(button|select|input)', \{([^}]*)\}/g)) assert.match(match[2], /'data-control'/, `el('${match[1]}') without data-control: ${match[2].slice(0, 80)}`);
});

test('the validator refuses a forged or incomplete inventory', () => {
  const tested = inventory.controls.find(control => control.status === 'TESTED');
  const mutate = change => { const copy = structuredClone(inventory); change(copy, copy.controls.find(control => control.id === tested.id)); return validateInventory(copy, {journeys}); };
  assert.match(mutate((_, c) => { c.exercised_by = []; }).join(), /TESTED without a step/);
  assert.match(mutate((_, c) => { c.exercised_by = [{journey: c.exercised_by[0].journey, step: 'no such step'}]; }).join(), /has no step/);
  assert.match(mutate((_, c) => { c.exercised_by = [{journey: 'ghost', step: 'x'}]; }).join(), /unknown journey/);
  assert.match(mutate((_, c) => { c.status = 'IMPLEMENTED'; }).join(), /claims no evidence/);
  assert.match(mutate((_, c) => { c.status = 'CERTIFIED REAL'; c.data = 'DEMO'; }).join(), /needs REAL data/);
  assert.match(mutate((_, c) => { c.status = 'BLOCKED'; c.exercised_by = []; }).join(), /needs a reason/);
  assert.match(mutate((copy, c) => { copy.controls.push({...c}); }).join(), /duplicate id/);
  assert.match(mutate((_, c) => { c.id = 'ctl-lower'; }).join(), /id must match/);
  assert.match(mutate((_, c) => { c.kind = 'widget'; }).join(), /kind must be/);
});

test('coverage: a TESTED control must be actuated in each step it names, on every viewport', () => {
  const tested = inventory.controls.filter(control => EVIDENCED.includes(control.status));
  // A report built from the inventory's own claims passes; dropping one actuation on one viewport fails.
  const runs = [];
  for (const journey of JOURNEYS) for (const viewport of ['desktop', 'mobile']) {
    const steps = new Map();
    for (const control of tested) for (const ref of control.exercised_by) if (ref.journey === journey.id) {
      if (!steps.has(ref.step)) steps.set(ref.step, {name: ref.step, status: 'PASS', actuated: [], seen: []});
      steps.get(ref.step).actuated.push(control.id);
    }
    runs.push({id: journey.id, viewport, status: 'PASS', steps: [...steps.values()]});
  }
  const report = {journeys: runs};
  assert.deepEqual(verifyCoverage(inventory, report), []);
  assert.equal(Object.keys(actuationsFrom(report)).length, tested.length);
  const forged = structuredClone(report);
  const run = forged.journeys.find(item => item.viewport === 'mobile' && item.steps.length);
  run.steps[0].actuated.shift();
  assert.match(verifyCoverage(inventory, forged).join(), /not actuated in .*\/mobile/);
  const unknown = structuredClone(report);
  unknown.journeys[0].steps.push({name: 'x', status: 'PASS', actuated: [], seen: ['CTL-NOT-INVENTORIED']});
  assert.match(verifyCoverage(inventory, unknown).join(), /CTL-NOT-INVENTORIED not in the inventory/);
});

test('progress is computed from the statuses', () => {
  const result = progress(inventory);
  assert.equal(result.total, inventory.controls.length);
  assert.equal(Object.values(result.by_status).reduce((a, b) => a + b, 0), result.total);
  assert.equal(result.verified, inventory.controls.filter(control => EVIDENCED.includes(control.status)).length);
  assert.equal(result.certified_real, 0); // QA data is a seeded fixture: nothing is certified on real data here
});
