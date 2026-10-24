// UI requirement matrix (MP-OWNER-ROADMAP-ATOMIC-RECONCILIATION-01, #239) and the D12 ratification
// (MP-UI-D12-DECISIONS-20261024): the 1,090 approved requirements stay traced, each with a destination, and no
// requirement claims a certification the QA registers do not hold.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
const matrix = read('docs/governance/ui-requirements-matrix.json');
const decisions = read('docs/governance/owner-decisions.json').decisions;
const features = read('docs/qa/feature-certification.json');
const rows = matrix.requirements;
const byId = new Map(rows.map(row => [row.id, row]));
const d12 = decisions.find(item => item.id === 'MP-UI-D12-DECISIONS-20261024');
const ratification = readFileSync(new URL('../docs/governance/owner-ratifications/MP-UI-D12-DECISIONS-20261024.md', import.meta.url), 'utf8');
// A destination is a planned UI PR, a backend card of #29/#104, delivered work on main, a governance rule, an owner
// exclusion or decision, or "none" for a capability the owner keeps off.
const DESTINATION = /MP-UI-PR-0\d\d|LIVE-PR-|TRADE-CORE|STRAT-CORE|TCOP-CORE|TC-CORE|REPLAY-CORE|BENCH-CORE|MATH-CORE|MCP-CORE|OPERATOR-API|HIST-01b|R-\d\d|^CONSEGNATO|^TRASVERSALE|^ESCLUSO|^NESSUNA|^decisione owner|MP-OWNER-D12-IMPLEMENTATION/;

test('the matrix holds 1,090 approved requirements and 10 proposals, with unique stable ids', () => {
  assert.equal(byId.size, rows.length, 'duplicate requirement id');
  for (const row of rows) assert.match(row.id, /^MP-REQ-UI-\d{4}$/);
  const approved = rows.filter(row => row.status !== 'PROPOSAL_NOT_APPROVED');
  assert.equal(approved.length, 1090);
  assert.equal(rows.length - approved.length, 10);
  assert.deepEqual(matrix.counts, {rows: rows.length, approved: approved.length, proposals_not_approved: rows.length - approved.length,
    by_status: Object.fromEntries(Object.entries(Object.groupBy(rows, row => row.status)).map(([key, list]) => [key, list.length]).sort())});
});

test('every requirement has an admitted status, a destination, a source and evidence', () => {
  const statuses = new Set(matrix.statuses);
  for (const row of rows) {
    assert.ok(statuses.has(row.status), `${row.id}: status ${row.status}`);
    for (const key of ['target_pr', 'source', 'evidence', 'requirement']) assert.ok(String(row[key] ?? '').trim() && row[key] !== '—', `${row.id}: no ${key}`);
    assert.match(row.target_pr, DESTINATION, `${row.id}: ${row.target_pr} is not a destination`);
    // A verified state rests on cited test evidence, never on a bare claim.
    if (['TESTED', 'CERTIFIED CALCULATION'].includes(row.status)) {
      assert.match(String(row.evidence), /test\/|journey|tools\/qa|control-inventory|feature-certification|CTL-/, `${row.id}: ${row.status} without test evidence`);
    }
    assert.ok(!/(^|[^\w/])main\//.test(String(row.evidence)), `${row.id}: evidence path outside the repository`);
  }
  // D12 ratified every pending decision: none is left open in the matrix.
  assert.equal(rows.filter(row => row.status === 'DECISION REQUIRED').length, 0);
});

test('every planned UI PR named as a destination is in the PR register', () => {
  for (const row of rows) for (const id of row.target_pr.match(/MP-UI-PR-0\d\d-[A-Z0-9-]+/g) ?? []) {
    assert.ok(id in matrix.pr_register, `${row.id}: ${id} is not in the PR register`);
  }
});

test('superseded rows and aliases point to requirements of the matrix', () => {
  for (const {id, superseded_by: by} of matrix.superseded) {
    assert.ok(!byId.has(id), `${id} is superseded but still a row`);
    for (const target of by) assert.ok(byId.has(target), `${id} -> unknown ${target}`);
  }
  for (const {id, alias_of: of} of matrix.aliases) {
    assert.ok(!byId.has(id), `${id} is an alias but still a row`);
    assert.equal(byId.get(of)?.alias, id);
  }
});

test('no requirement claims a certification the feature register does not hold', () => {
  assert.equal(rows.filter(row => ['CERTIFIED MOCK', 'CERTIFIED REAL'].includes(row.status)).length, 0);
  const calculation = rows.filter(row => row.status === 'CERTIFIED CALCULATION');
  const tools = features.features.find(feature => feature.id === 'FEAT-TRADING-TOOLS');
  assert.equal(tools.state, 'CERTIFIED CALCULATION');
  for (const row of calculation) assert.match(row.target_pr, /MP-UI-PR-005/, `${row.id} is certified outside the Trading Tools perimeter`);
});

test('the D12 decisions are registered, complete and tied to existing requirements', () => {
  assert.equal(d12?.status, 'IN_FORCE');
  assert.deepEqual(d12.items.map(item => item.d12), Array.from({length: 19}, (_, index) => index + 1));
  for (const item of d12.items) {
    for (const key of ['title', 'decision', 'issues', 'target_prs', 'acceptance', 'dependencies', 'pending_specification', 'resolves', 'impacts_lexical_candidates']) {
      assert.ok(key in item, `D12-${item.d12}: no ${key}`);
    }
    assert.ok(item.acceptance.length, `D12-${item.d12}: no acceptance criteria`);
    // The decision text is the owner's, verbatim: an agent cannot reword or extend a ratified item.
    assert.ok(ratification.includes(`| ${item.d12} | ${item.decision} |`), `D12-${item.d12}: decision differs from the ratification`);
    for (const id of [...item.resolves, ...item.impacts_lexical_candidates]) {
      assert.ok(byId.has(id), `D12-${item.d12}: unknown requirement ${id}`);
      assert.ok(byId.get(id).d12_candidate_impacts?.includes(item.d12), `D12-${item.d12}: ${id} does not point back`);
    }
    for (const id of item.resolves) assert.equal(byId.get(id).d12_resolved_by, item.d12);
  }
  // The 37 indicators are candidates under KEEP/MERGE/REJECT: none is presented as working.
  const indicators = d12.items.find(item => item.d12 === 3).resolves;
  assert.equal(indicators.length, 37);
  for (const id of indicators) {
    assert.equal(byId.get(id).status, 'PENDING SPECIFICATION');
    assert.match(byId.get(id).blocker, /\(D12-3\)$/, `${id}: the D12-3 blocker must be added to the earlier ones`);
  }
  assert.ok(byId.get('MP-REQ-UI-0478').blocker.includes('TotalCorner'), 'earlier blockers are kept');
  const mandate = decisions.find(item => item.id === 'MP-OWNER-D12-IMPLEMENTATION-20261024');
  assert.equal(mandate?.status, 'IN_FORCE');
  assert.match(mandate.decision, /NO MERGE and NO DEPLOY/);
  assert.deepEqual(decisions.find(item => item.id === 'MP-AUTOMERGE-RESTORED-20261024').superseded_by, ['MP-OWNER-D12-IMPLEMENTATION-20261024']);
});
