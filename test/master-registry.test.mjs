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
  assert.equal(readFileSync('docs/governance/master/coverage.json', 'utf8'), JSON.stringify(coverage(reg, {uiRows: ui.length, pr00Rows: pr00.length}), null, 2) + '\n');
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
  assert.ok(validate(r1, opts).some(e => e.includes('IMPLEMENTED without code paths')));
  const r2 = clone(); r2.requirements[0].status.certified = 'INTEGRATION'; r2.requirements[0].tests = [];
  assert.ok(validate(r2, opts).some(e => e.includes('certified without tests')));
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
});
