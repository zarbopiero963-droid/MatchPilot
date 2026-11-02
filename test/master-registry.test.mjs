// MP-MASTER-01: the canonical MASTER registry (docs/governance/master/) is consistent, and the traceability checks
// reject what the owner mandate forbids (no evidence, orphan issues, PRs without requirement ids).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { coverage, issuesCheck, load, prCheck, render, validate } from '../tools/governance/master.mjs';

const reg = load();
const ui = JSON.parse(readFileSync('docs/governance/ui-requirements-matrix.json', 'utf8')).requirements;
const pr00 = JSON.parse(readFileSync('docs/governance/mp-pr-00/requirements.json', 'utf8')).requirements;
const opts = {uiIds: new Set(ui.map(r => r.id)), pr00Ids: new Set(pr00.map(r => r.id))};
const clone = () => structuredClone(reg);

test('MP-MASTER-01 the registry is valid, coverage and roadmap are up to date', () => {
  assert.deepEqual(validate(reg, opts), []);
  assert.equal(readFileSync('docs/governance/master/coverage.json', 'utf8'), JSON.stringify(coverage(reg), null, 2) + '\n');
  assert.equal(readFileSync('docs/governance/master/roadmap.md', 'utf8'), render(reg) + '\n');
  assert.equal(reg.master.master_issue, 288);
  assert.ok(reg.requirements.length > 1000 && reg.cards.length > 300 && reg.issues.length >= 48);
});

test('MP-MASTER-01 every active requirement has a card; every issue is indexed; ids are unique', () => {
  const active = reg.requirements.filter(r => r.lifecycle === 'ACTIVE');
  assert.ok(active.every(r => r.cards.length));
  const ids = reg.requirements.map(r => r.id);
  assert.equal(new Set(ids).size, ids.length);
  const issues = new Set(reg.issues.map(i => i.issue));
  for (const n of [3, 12, 20, 23, 24, 28, 31, 34, 40, 45, 91, 94, 95, 96, 97, 98, 99, 100, 104, 182, 239, 263]) assert.ok(issues.has(n), `#${n}`);
});

test('MP-MASTER-01 claims without evidence are refused', () => {
  const r1 = clone(); const a = r1.requirements.find(r => r.status.implementation === 'IMPLEMENTED'); a.code_paths = [];
  assert.ok(validate(r1, opts).some(e => e.includes('IMPLEMENTED without code paths on main')));
  const r2 = clone(); r2.requirements[0].status.certified = 'INTEGRATION'; r2.requirements[0].tests = [];
  assert.ok(validate(r2, opts).some(e => e.includes('certified without tests')));
  assert.ok(validate(r2, opts).some(e => e.includes('certified without a certificate record')));
  const r3 = clone(); r3.requirements[0].status.deployed = 'YES';
  assert.ok(validate(r3, opts).some(e => e.includes('deployed without deploy evidence')));
  const r4 = clone(); r4.cards[0].state = 'CERTIFIED';
  assert.ok(validate(r4, opts).some(e => e.includes('CERTIFIED without evidence records')));
  const r5 = clone(); r5.cards[0].certification['HARD VERIFIED REAL'] = true; r5.cards[0].evidence_records = [{kind: 'SIMULATION'}];
  assert.ok(validate(r5, opts).some(e => e.includes('HARD VERIFIED REAL without a real-test evidence record')));
});

test('MP-MASTER-01 broken links, duplicates and unreferenced supersessions are refused', () => {
  const r1 = clone(); r1.requirements[1].id = r1.requirements[0].id;
  assert.ok(validate(r1, opts).some(e => e.includes('duplicate id')));
  const r2 = clone(); const a = r2.requirements.find(r => r.lifecycle === 'ACTIVE'); a.cards = [];
  assert.ok(validate(r2, opts).some(e => e.includes('active requirement without a PR card')));
  const r3 = clone(); r3.requirements[0].relation = 'SUPERSEDED'; r3.requirements[0].relation_ref = '';
  assert.ok(validate(r3, opts).some(e => e.includes('SUPERSEDED without a reference')));
  const r4 = clone(); r4.requirements[0].existing_ids = ['MP-REQ-UI-9999'];
  assert.ok(validate(r4, opts).some(e => e.includes('unknown UI requirement')));
  const r5 = clone(); r5.requirements[0].dependencies = ['MP-REQ-9999'];
  assert.ok(validate(r5, opts).some(e => e.includes('unknown dependency')));
  const r6 = clone(); r6.cards[0].requirements = ['MP-REQ-9999'];
  assert.ok(validate(r6, opts).some(e => e.includes('unknown requirement')));
});

test('MP-MASTER-01 issues-check reports open issues without a MASTER link; pr-check needs valid ids or an explicit declaration', () => {
  const r = clone();
  r.issues = r.issues.map(i => ({...i, master_link: i.issue === 3 ? 'https://github.com/x/y/issues/3#issuecomment-1' : i.master_link}));
  const listing = [{number: 3, state: 'open'}, {number: 999, state: 'open', body: 'nuova funzione'}, {number: 1000, state: 'open', body: 'Refs #288 MP-REQ-0001'},
    {number: 288, state: 'open'}, {number: 1001, state: 'closed'}, {number: 1002, state: 'open', pull_request: {}}];
  assert.deepEqual(issuesCheck(r, listing), [999]);
  assert.equal(prCheck('Implementa MP-REQ-0001 (MP-CARD-OPEN-285)', reg).ok, true);
  assert.equal(prCheck('NO-NEW-REQUIREMENT: solo registri', reg).ok, true);
  assert.equal(prCheck('nessun riferimento', reg).ok, false);
  assert.deepEqual(prCheck('MP-REQ-9999', reg).unknown, ['MP-REQ-9999']);
  assert.equal(prCheck('MP-REQ-UI-0001', reg).ok, true);
  const uiIds = opts.uiIds;
  assert.equal(prCheck('MP-REQ-UI-0001', reg, {uiIds}).ok, uiIds.has('MP-REQ-UI-0001'));
  assert.deepEqual(prCheck('MP-REQ-UI-9999', reg, {uiIds}).unknown, ['MP-REQ-UI-9999']);
  assert.deepEqual(issuesCheck(r, [{number: 2000, state: 'open', body: 'Refs #2880'}, {number: 2001, state: 'open', body: 'Refs #288.'}]), [2000]);
});

test('MP-MASTER-01 evidence rules: paths on disk, merged implementation, tests, certificates, activity, card states', () => {
  const impl = r => r.requirements.find(x => x.status.implementation === 'IMPLEMENTED');
  const r1 = clone(); impl(r1).code_paths = ['src/does-not-exist.mjs'];
  assert.ok(validate(r1, opts).some(e => e.includes('does not exist on disk')));
  const r2 = clone(); impl(r2).status.merged = false;
  assert.ok(validate(r2, opts).some(e => e.includes('IMPLEMENTED but not merged on main')));
  const r3 = clone(); const a3 = impl(r3); a3.code_paths = ['origin/mp-x:src/x.mjs']; a3.status.in_open_pr = [999];
  assert.ok(validate(r3, opts).some(e => e.includes('IMPLEMENTED without code paths on main')));
  const r4 = clone(); const a4 = r4.requirements.find(x => x.status.implementation === 'NOT_IMPLEMENTED'); a4.code_paths = ['origin/mp-x:src/x.mjs']; a4.status.in_open_pr = [];
  assert.ok(validate(r4, opts).some(e => e.includes('points to a branch but in_open_pr is empty')));
  const r5 = clone(); r5.requirements[0].status.tested = 'UNIT'; r5.requirements[0].tests = [];
  assert.ok(validate(r5, opts).some(e => e.includes('tested UNIT without a test on main')));
  const r6 = clone(); r6.requirements[0].status.tested = 'BROWSER'; r6.requirements[0].tests = ['origin/mp-x:test/x.test.mjs']; r6.requirements[0].status.in_open_pr = [999];
  assert.ok(validate(r6, opts).some(e => e.includes('tested BROWSER without a test on main')));
  const r7 = clone(); const a7 = r7.requirements.find(x => x.status.certified === 'COMPONENT'); a7.certification_evidence = [];
  assert.ok(validate(r7, opts).some(e => e.includes('certified without a certificate record')));
  const r8 = clone(); r8.requirements[0].status.active = 'YES'; r8.requirements[0].active_evidence = [];
  assert.ok(validate(r8, opts).some(e => e.includes('active without evidence')));
  const r9 = clone(); r9.requirements[0].tests = ['test/nope.test.mjs'];
  assert.ok(validate(r9, opts).some(e => e.includes('test/nope.test.mjs does not exist on disk')));
  for (const state of ['IMPLEMENTED', 'UNIT TESTED', 'INTEGRATION TESTED', 'BROWSER TESTED', 'HARD VERIFIED REAL', 'MERGED', 'DEPLOYED', 'OPERATIONALLY VERIFIED', 'CERTIFIED']) {
    const rc = clone(); const c = rc.cards.find(x => x.state === 'NOT STARTED'); c.state = state; c.evidence_records = [];
    assert.ok(validate(rc, opts).some(e => e.includes(`state ${state} without evidence records`)), state);
  }
  const rs = clone(); const cs = rs.cards.find(x => x.state === 'NOT STARTED'); cs.state = 'HARD VERIFIED REAL'; cs.evidence_records = [{kind: 'TEST_REPORT', ref: 'simulated run'}];
  assert.ok(validate(rs, opts).some(e => e.includes('state HARD VERIFIED REAL without evidence records')));
  const rd = clone(); rd.requirements[0].tests = ['test/']; rd.requirements[1].code_paths = ['../outside.mjs'];
  assert.ok(validate(rd, opts).some(e => e.includes('is a directory, not a test file')));
  assert.ok(validate(rd, opts).some(e => e.includes('leaves the repository')));
  const ri = clone(); ri.issues.find(i => i.issue === 263).requirements.pop();
  assert.ok(validate(ri, opts).some(e => e.includes('#263: issue requirement list differs')));
  const rk = clone(); rk.cards[0].evidence_records = [{kind: 'SCREENSHOT_OF_MOCK', ref: 'x'}];
  assert.ok(validate(rk, opts).some(e => e.includes('evidence record without a valid kind and ref')));
});
