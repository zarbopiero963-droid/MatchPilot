// UI requirement matrix (MP-OWNER-ROADMAP-ATOMIC-RECONCILIATION-01, #239) and the D12 ratification
// (MP-UI-D12-DECISIONS-20261024): the 1,090 approved requirements stay traced, each with a destination, and no
// requirement claims a certification the QA registers do not hold.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

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
    assert.equal(byId.get(id).status, 'SPECIFICATION PENDING');
    assert.match(byId.get(id).blocker, /\(D12-3\)$/, `${id}: the D12-3 blocker must be added to the earlier ones`);
  }
  assert.ok(byId.get('MP-REQ-UI-0478').blocker.includes('TotalCorner'), 'earlier blockers are kept');
  const mandate = decisions.find(item => item.id === 'MP-OWNER-D12-IMPLEMENTATION-20261024');
  assert.equal(mandate?.status, 'IN_FORCE');
  assert.match(mandate.decision, /NO MERGE and NO DEPLOY/);
  assert.deepEqual(decisions.find(item => item.id === 'MP-AUTOMERGE-RESTORED-20261024').superseded_by, ['MP-OWNER-D12-IMPLEMENTATION-20261024']);
});

// MP-D12-49-REQUIREMENTS-GATE-01: the reclassification of the requirements that waited for a D12 decision.
const VERIFIED = new Set(['TESTED', 'CERTIFIED CALCULATION', 'CERTIFIED MOCK', 'CERTIFIED REAL']);

test('exactly 49 requirements that waited for a decision are reconciled one by one, never promoted to a verified state', () => {
  const recon = matrix.d12_reconciliation;
  assert.equal(new Set(recon.map(item => item.id)).size, recon.length, 'a requirement reconciled twice');
  assert.equal(recon.filter(item => item.previous_status === 'DECISION REQUIRED').length, 49);
  for (const item of recon) {
    const row = byId.get(item.id);
    assert.equal(item.previous_status, row.audit_status, `${item.id}: previous status differs from the audit`);
    assert.equal(item.new_status, row.status, `${item.id}: new status differs from the matrix`);
    assert.equal(item.decision_state, 'DECISION RESOLVED');
    assert.ok(['NOT STARTED', 'BLOCKED', 'SPECIFICATION PENDING', 'IN PROGRESS'].includes(item.new_status), `${item.id}: ${item.new_status} needs evidence, not a ratification`);
    assert.ok(ratification.includes(`| ${item.d12} | ${item.approved_behaviour} |`), `${item.id}: approved behaviour is not the ratification text`);
    for (const key of ['requirement', 'reason', 'responsible_pr', 'implementation_evidence', 'test_evidence', 'open_dependencies', 'further_ratification']) {
      assert.ok(String(item[key] ?? '').trim(), `${item.id}: no ${key}`);
    }
  }
  // Two indicators (n. 35 and 36) were NOT STARTED: their change is motivated, not silent.
  for (const item of recon.filter(entry => entry.previous_status !== 'DECISION REQUIRED')) assert.match(item.reason, /previously NOT STARTED: .*minimum N/);
});

test('no requirement id is lost or duplicated and every status change is listed with its reason', () => {
  const ids = [...rows.map(row => row.id), ...matrix.superseded.map(item => item.id), ...matrix.aliases.map(item => item.id)].sort();
  assert.equal(new Set(ids).size, ids.length, 'duplicate id across rows, superseded and aliases');
  assert.equal(ids.length, matrix.baseline.audit_ids);
  assert.equal(createHash('sha256').update(ids.join('\n')).digest('hex'), matrix.baseline.audit_ids_sha256, 'the id set differs from the audit baseline');
  // Audit status and requirement text are anchored too: a promotion that rewrites audit_status, or a reworded
  // requirement, changes this digest.
  const snapshot = rows.map(row => `${row.id}\t${row.audit_status}\t${row.requirement}`).join('\n');
  assert.equal(createHash('sha256').update(snapshot).digest('hex'), matrix.baseline.audit_rows_sha256, 'audit status or requirement text differs from the audit baseline');
  const changes = new Map(matrix.status_changes.map(item => [item.id, item]));
  for (const row of rows) {
    if (row.status === row.audit_status) { assert.ok(!changes.has(row.id), `${row.id}: listed change without change`); continue; }
    const change = changes.get(row.id);
    assert.ok(change && change.from === row.audit_status && change.to === row.status && change.reason.trim(), `${row.id}: unlisted change ${row.audit_status} -> ${row.status}`);
    assert.ok(!VERIFIED.has(row.status), `${row.id}: promoted to ${row.status} without evidence`);
  }
  for (const row of rows) if (VERIFIED.has(row.status)) assert.equal(row.status, row.audit_status, `${row.id}: verified state not in the audit`);
});

test('the 37 indicators are candidates with visible formula dependencies, none presented as working', () => {
  const indicators = rows.filter(row => row.indicator);
  assert.equal(indicators.length, 37);
  for (const row of indicators) {
    const ind = row.indicator;
    assert.equal(row.status, 'SPECIFICATION PENDING', row.id);
    assert.equal(ind.owner_ratification, 'PENDING', row.id);
    assert.match(ind.keep_merge_reject, /^NOT ASSESSED/, row.id);
    assert.match(ind.technical_status, /^NOT IMPLEMENTED/, row.id);
    assert.ok(ind.undefined_parameters.length, `${row.id}: undefined parameters hidden`);
    assert.ok(ind.name && ind.data_availability && ind.pit, row.id);
    if (ind.formula === 'missing') assert.equal(ind.formula_source, '—', row.id);
    else assert.match(ind.formula_source, /#28/, row.id);
  }
  // #28 gives a conceptual formula only for n. 19, 35 and 36.
  assert.deepEqual(indicators.filter(row => row.indicator.formula !== 'missing').map(row => row.indicator.name).sort(),
    ['Fair Price Gap', 'Finishing Overperformance', 'Finishing Underperformance']);
});

test('no Money Management model of the catalog is left out of the roadmap (D12-8)', async () => {
  const {REGISTRY} = await import('../src/mm/registry.mjs');
  const models = d12.items.find(item => item.d12 === 8).mm_models;
  assert.deepEqual(models.map(model => model.type_id), REGISTRY.map(model => model.type_id));
  for (const model of models) {
    assert.match(model.roadmap, /^in scope \(D12-8\)/, model.type_id);
    assert.equal(model.specification, model.registry_status === 'IMPLEMENTED' ? 'SPECIFIED AND IMPLEMENTED (formula_version 1)' : 'SPECIFICATION PENDING', model.type_id);
  }
});

test('the suspension of the automatic merge adds a stop, never removes a gate', () => {
  const agents = readFileSync(new URL('../AGENTS.md', import.meta.url), 'utf8');
  assert.match(agents, /Sospensione owner MP-OWNER-D12-IMPLEMENTATION-20261024/);
  for (const gate of ['Gate A locale PASS', 'Gate B locale PASS', 'test obbligatori PASS', 'GitHub Actions verdi', 'branch protection soddisfatta',
    'review indipendente APPROVED', 'nessun finding bloccante', 'Browser QA Gate PASS']) assert.ok(agents.includes(gate), `AGENTS §4 lost: ${gate}`);
  const ci = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  for (const job of ['Fast checks', 'UI checks', 'PostgreSQL integration suite', 'Browser QA', 'CI gate']) assert.match(ci, new RegExp(`name: ${job}`), `CI lost the job ${job}`);
  const deploy = readFileSync(new URL('../.github/workflows/deploy-vps.yml', import.meta.url), 'utf8');
  assert.match(deploy, /name: Deploy gate/);
});
