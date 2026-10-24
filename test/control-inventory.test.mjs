// MP-UI-PR-001 (#239): the control inventory is complete and consistent with the code and the Browser QA journeys.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {EVIDENCED, actuationsFrom, activeTest, inventoryIds, journeyStepTitles, loadInventory, progress, validateInventory, verifyCoverage} from '../tools/qa/control-inventory.mjs';
import {JOURNEYS} from '../tools/qa/journeys.mjs';

const source = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const app = source('src/web/app.js');
const html = source('src/web/index.html');
const inventory = loadInventory();
const ids = new Set(inventoryIds(inventory));

const journeys = journeyStepTitles();

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
  // Generated ids come from ctl('VIEW', name): each prefix is one of the forms or lists checked below.
  const prefixes = new Set([...app.matchAll(/\bctl\('([A-Z-]+)'/g)].map(match => match[1]));
  assert.deepEqual([...prefixes].sort(), ['CMP', 'DATA-TAB', 'MATCH-FILTER', 'SEARCH', 'SIM']);
  // A generated id must name a field its own form builds: the names passed to the field helpers inside that function
  // (a ghost CTL-SEARCH-STAKE fails although 'stake' exists in another form).
  const body = name => {
    const start = app.search(new RegExp(`^(?:async )?function ${name}\\(`, 'm'));
    assert.ok(start >= 0, `function ${name} not found`);
    const rest = app.slice(start + 1);
    const end = rest.search(/^(?:async function|function|const|let) /m);
    return app.slice(start, end < 0 ? app.length : start + 1 + end);
  };
  const fields = text => [...text.matchAll(/\b(?:select|input|check|price)\(\s*'([a-z_]+)'/g)].map(match => match[1]);
  const cmpKeys = [...(/const CMP_KEYS = \[([^\]]*)\]/.exec(app)?.[1].matchAll(/'([a-z])'/g) ?? [])].map(match => match[1]);
  assert.deepEqual(cmpKeys, ['a', 'b', 'c']);
  const dataTabs = [.../const DATA_TABS = (\[.*\]);/.exec(app)[1].matchAll(/\[(?:'([a-z]+)'|null),/g)].map(match => match[1] ?? 'coverage');
  const generated = new Set([
    ...fields(body('searchForm')).map(name => `CTL-SEARCH-${name}`),
    ...fields(body('simForm')).map(name => `CTL-SIM-${name}`),
    ...fields(body('cmpForm')).map(name => `CTL-CMP-${name}`),
    ...cmpKeys.flatMap(key => fields(body('cmpConfiguration')).map(name => `CTL-CMP-${key}_${name}`)),
    ...[...app.matchAll(/\bfilter\('[^']*', '([a-z]+)'/g)].map(match => `CTL-MATCH-FILTER-${match[1]}`),
    ...dataTabs.map(view => `CTL-DATA-TAB-${view}`),
  ].map(id => id.toUpperCase().replace(/_/g, '-')));
  assert.ok(generated.size > 80);
  for (const id of ids) assert.ok(literal.has(id) || generated.has(id), `${id} is in the inventory but no form of the page builds it`);
  for (const id of generated) assert.ok(ids.has(id), `${id} is built by the page but not in the inventory`);
  // No control is created without an id: every button, select and input built by el() names one, directly or through
  // the form helpers that add it.
  for (const match of app.matchAll(/el\('(button|select|input)', \{([^}]*)\}/g)) assert.match(match[2], /'data-control'/, `el('${match[1]}') without data-control: ${match[2].slice(0, 80)}`);
});

test('the validator refuses a forged or incomplete inventory', () => {
  const tested = inventory.controls.find(control => control.evidence === 'ASSERTED');
  assert.equal(tested.status, 'TESTED');
  const mutate = change => { const copy = structuredClone(inventory); change(copy, copy.controls.find(control => control.id === tested.id)); return validateInventory(copy, {journeys}); };
  assert.match(mutate((_, c) => { c.exercised_by = []; }).join(), /evidence ASSERTED without a step/);
  assert.match(mutate((_, c) => { c.exercised_by = [{journey: c.exercised_by[0].journey, step: 'no such step'}]; }).join(), /has no step/);
  assert.match(mutate((_, c) => { c.exercised_by = [{journey: 'ghost', step: 'x'}]; }).join(), /unknown journey/);
  assert.match(mutate((_, c) => { c.evidence = 'NONE'; }).join(), /evidence is NONE/);
  assert.match(mutate((_, c) => { c.evidence = 'CLICKED'; }).join(), /evidence must be/);
  assert.match(mutate((_, c) => { c.status = 'BLOCKED'; }).join(), /needs a reason/);
  assert.match(mutate((copy, c) => { copy.controls.push({...c}); }).join(), /duplicate id/);
  assert.match(mutate((_, c) => { c.id = 'ctl-lower'; }).join(), /id must match/);
  assert.match(mutate((_, c) => { c.kind = 'widget'; }).join(), /kind must be/);
  assert.match(mutate(copy => { copy.controls.push(null); }).join(), /a control must be an object/);
  // MP-UI-HARD-GATES-01 §8: being actuated is not a verified result. TESTED and the certified statuses need ASSERTED.
  for (const evidence of ['ACTUATED', 'SEEN']) assert.match(mutate((_, c) => { c.evidence = evidence; }).join(), new RegExp(`TESTED needs ASSERTED evidence \\(a verified result\\), not ${evidence}`));
  // CERTIFIED MOCK needs the Gate A and Gate B evidence; CERTIFIED REAL needs a REAL campaign, which does not exist.
  assert.match(mutate((_, c) => { c.status = 'CERTIFIED MOCK'; }).join(), /CERTIFIED MOCK needs certification evidence/);
  assert.match(mutate((_, c) => { c.status = 'CERTIFIED REAL'; }).join(), /CERTIFIED REAL needs a REAL certification campaign/);
  assert.match(mutate((_, c) => { c.status = 'CERTIFIED REAL'; c.data = 'DEMO'; }).join(), /needs REAL data/);
  assert.match(mutate((_, c) => { c.certification = {}; }).join(), /certification evidence on a TESTED control/);
});

// A complete Gate A/B certification for one asserted control: its browser steps and tests that exist in this file.
const certificationFor = control => {
  const step = control.exercised_by[0];
  const unit = {test: 'test/control-inventory.test.mjs', name: 'the inventory is structurally valid against the journeys'};
  return {gate_a: {positive: [step], negative: [unit], limits: [unit], transitions: [step], contract: [unit]}, gate_b: {integrated: [step], adversarial: [step]}};
};

test('CERTIFIED MOCK: every Gate A and Gate B category needs evidence, browser steps where the category requires them', () => {
  const tested = inventory.controls.find(control => control.evidence === 'ASSERTED');
  const check = change => {
    const copy = structuredClone(inventory);
    const c = copy.controls.find(control => control.id === tested.id);
    Object.assign(c, {status: 'CERTIFIED MOCK', certification: certificationFor(tested)});
    change?.(c.certification, c);
    return validateInventory(copy, {journeys});
  };
  assert.deepEqual(check(), []);
  for (const category of ['positive', 'negative', 'limits', 'transitions', 'contract']) assert.match(check(cert => { cert.gate_a[category] = []; }).join(), new RegExp(`gate_a\\.${category} has no evidence`));
  for (const category of ['integrated', 'adversarial']) assert.match(check(cert => { delete cert.gate_b[category]; }).join(), new RegExp(`gate_b\\.${category} has no evidence`));
  assert.match(check(cert => { cert.gate_a.positive = [cert.gate_a.contract[0]]; }).join(), /gate_a\.positive needs a Browser QA step/);
  assert.match(check(cert => { cert.gate_b.adversarial = [cert.gate_a.contract[0]]; }).join(), /gate_b\.adversarial needs a Browser QA step/);
  assert.match(check(cert => { cert.gate_a.contract = [{test: 'test/missing.test.mjs', name: 'x'}]; }).join(), /does not exist/);
  assert.match(check(cert => { cert.gate_a.contract = [{test: 'test/control-inventory.test.mjs', name: 'no such test'}]; }).join(), /no active test «no such test»/);
  // A skipped, todo or commented-out test is not evidence (review #241 N1).
  const live = "test('x', async () => {});";
  assert.equal(activeTest(live, 'x'), true);
  assert.equal(activeTest("test('x', {timeout: 1000}, async () => {});", 'x'), true);
  for (const dead of ["test('x', {skip: 'later'}, () => {});", "test('x', {todo: true}, () => {});", "// test('x', () => {});", "  * test('x', () => {})",
    "test.skip('x', () => {});", "mytest('x', () => {});", "test('xy', () => {});"]) assert.equal(activeTest(dead, 'x'), false, dead);
  assert.match(check(cert => { cert.gate_a.contract = [{test: '../etc/passwd', name: 'x'}]; }).join(), /a reference is/);
  assert.match(check(cert => { cert.gate_b.integrated = [{journey: 'search', step: 'no such step'}]; }).join(), /no step «no such step» in search/);
});

// A report that backs exactly the inventory's claims: seen for every claim, actuated and asserted for ASSERTED ones.
function reportFor(inv) {
  const runs = [];
  for (const journey of JOURNEYS) for (const viewport of ['desktop', 'mobile']) {
    const steps = new Map();
    const stepOf = name => {
      if (!steps.has(name)) steps.set(name, {name, status: 'PASS', actuated: [], seen: [], asserted: [], assertions: []});
      return steps.get(name);
    };
    for (const control of inv.controls) {
      const refs = [...control.exercised_by.map(ref => [ref, control.evidence]),
        ...Object.values(control.certification ?? {}).flatMap(gate => Object.values(gate).flat()).filter(ref => ref.journey).map(ref => [ref, 'ASSERTED'])];
      for (const [ref, evidence] of refs) if (ref.journey === journey.id) {
        const step = stepOf(ref.step);
        if (!step.seen.includes(control.id)) step.seen.push(control.id);
        if (['ACTUATED', 'ASSERTED'].includes(evidence) && !step.actuated.includes(control.id)) step.actuated.push(control.id);
        if (evidence === 'ASSERTED' && !step.asserted.includes(control.id)) {
          step.asserted.push(control.id);
          step.assertions.push({controls: [control.id], description: 'the result of the action is the expected one'});
        }
      }
    }
    runs.push({id: journey.id, viewport, status: 'PASS', steps: [...steps.values()]});
  }
  return {journeys: runs};
}

test('coverage: every claimed control was seen, actuated or asserted in each step it names, on every viewport', () => {
  const claimed = inventory.controls.filter(control => control.evidence !== 'NONE');
  for (const level of ['SEEN', 'ASSERTED']) assert.ok(claimed.some(c => c.evidence === level), level);
  const report = reportFor(inventory);
  assert.deepEqual(verifyCoverage(inventory, report, {journeys}), []);
  assert.equal(Object.keys(actuationsFrom(report, 'asserted')).length, claimed.filter(c => c.evidence === 'ASSERTED').length);
  assert.equal(Object.keys(actuationsFrom(report, 'seen')).length, claimed.length);
  const forge = (change, pattern) => {
    const forged = structuredClone(report);
    change(forged);
    assert.match(verifyCoverage(inventory, forged).join(), pattern);
  };
  const assertedId = claimed.find(c => c.evidence === 'ASSERTED').id;
  const seenId = claimed.find(c => c.evidence === 'SEEN').id;
  const mobileSteps = r => r.journeys.filter(run => run.viewport === 'mobile').flatMap(run => run.steps);
  // A missing assertion on one viewport, an assertion without the action, an asserted id without a recorded assertion.
  forge(r => { for (const s of mobileSteps(r)) { s.asserted = s.asserted.filter(x => x !== assertedId); s.assertions = s.assertions.filter(a => !a.controls.includes(assertedId)); } }, /not asserted in .*\/mobile/);
  forge(r => { for (const s of mobileSteps(r)) s.actuated = s.actuated.filter(x => x !== assertedId); }, new RegExp(`${assertedId} asserted but not actuated`));
  forge(r => { for (const s of mobileSteps(r)) s.assertions = s.assertions.filter(a => !a.controls.includes(assertedId)); }, new RegExp(`${assertedId} asserted without a recorded assertion`));
  forge(r => { const s = mobileSteps(r).find(x => x.assertions.length); s.assertions[0].description = ''; }, /an assertion without a description/);
  forge(r => { for (const s of mobileSteps(r)) s.seen = s.seen.filter(x => x !== seenId); }, /not seen in .*\/mobile/);
  forge(r => { r.journeys[0].steps.push({name: 'x', status: 'PASS', actuated: [], seen: ['CTL-NOT-INVENTORIED']}); }, /CTL-NOT-INVENTORIED not in the inventory/);
  // The evidence gate itself refuses a verified status without ASSERTED and every CERTIFIED REAL, not only the unit validator.
  const promoted = structuredClone(inventory);
  promoted.controls.find(c => c.evidence === 'SEEN').status = 'TESTED';
  assert.match(verifyCoverage(promoted, report).join(), /TESTED needs ASSERTED evidence \(a verified result\), not SEEN/);
  const real = structuredClone(inventory);
  for (const c of real.controls) Object.assign(c, {status: 'CERTIFIED REAL', evidence: 'ASSERTED', data: 'REAL', exercised_by: c.exercised_by.length ? c.exercised_by : []});
  assert.match(verifyCoverage(real, reportFor(real)).join(), /CERTIFIED REAL needs a REAL certification campaign/);
  // A certified control whose certification steps are not asserted in the report is refused.
  const certified = structuredClone(inventory);
  const c = certified.controls.find(x => x.evidence === 'ASSERTED');
  Object.assign(c, {status: 'CERTIFIED MOCK', certification: certificationFor(c)});
  assert.deepEqual(verifyCoverage(certified, reportFor(certified), {journeys}), []);
  const other = JOURNEYS.find(j => j.id !== c.exercised_by[0].journey && journeys[j.id].some(t => typeof t === 'string'));
  c.certification.gate_b.adversarial = [{journey: other.id, step: journeys[other.id].find(t => typeof t === 'string')}];
  const unasserted = reportFor(certified);
  for (const run of unasserted.journeys) if (run.id === other.id) for (const st of run.steps) {
    st.asserted = st.asserted.filter(x => x !== c.id);
    st.assertions = st.assertions.filter(x => !x.controls.includes(c.id));
  }
  assert.match(verifyCoverage(certified, unasserted).join(), new RegExp(`${c.id}: not asserted in ${other.id}/desktop .*\\(gate_b\\.adversarial\\)`));
  // A malformed report is refused with errors, never a crash.
  for (const bad of [{}, {journeys: 'x'}, {journeys: [{id: claimed[0].exercised_by[0].journey, viewport: 'desktop', status: 'PASS'}]}, {journeys: [null]}]) {
    assert.ok(verifyCoverage(inventory, bad).length > 0, JSON.stringify(bad));
  }
});

test('progress is computed from statuses and evidence: verified means ASSERTED, nothing is certified', () => {
  const result = progress(inventory);
  assert.equal(result.total, inventory.controls.length);
  assert.equal(Object.values(result.by_status).reduce((a, b) => a + b, 0), result.total);
  assert.equal(Object.values(result.by_evidence).reduce((a, b) => a + b, 0), result.total);
  assert.equal(result.actuated, inventory.controls.filter(c => ['ACTUATED', 'ASSERTED'].includes(c.evidence)).length);
  assert.ok(result.seen >= result.actuated && result.actuated >= result.asserted);
  assert.equal(result.verified, inventory.controls.filter(c => c.evidence === 'ASSERTED').length);
  assert.equal(result.verified, result.by_status.TESTED);
  assert.equal(result.certified_mock, 0);
  assert.equal(result.certified_real, 0); // QA data is a seeded fixture: nothing is certified on real data here
});

