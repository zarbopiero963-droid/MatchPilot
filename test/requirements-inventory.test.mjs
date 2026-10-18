import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadDecisions, loadInventory, summarize, validateDecisions, validateInventory} from '../tools/validate-requirements.mjs';
import {apply, renderBlocks, TARGETS} from '../tools/governance/render-inventory.mjs';

const clone = value => structuredClone(value);
const find = (inventory, id) => inventory.requirements.find(req => req.id === id);

test('MP-PR-00 inventory and owner-decision register are schema-valid', async () => {
  const inventory = await loadInventory();
  assert.deepEqual(validateInventory(inventory), []);
  assert.deepEqual(validateDecisions(await loadDecisions()), []);
  const summary = summarize(inventory);
  assert.equal(summary.denominator, inventory.requirements.length);
  assert.equal(summary.census, 'PROVISIONAL');
  assert.equal(inventory.census.denominator_ratified, false);
  assert.equal(summary.pass_with_evidence, summary.by_verdict.PASS);
});

test('group sizes follow the sources, not a fixed quota (B-03)', async () => {
  const sizes = new Set(Object.values(summarize(await loadInventory()).by_group));
  assert.ok(sizes.size > 1, 'every group has the same size: artificial quota suspected');
});

test('validator rejects PASS without evidence (B-01/B-02)', async () => {
  const inventory = clone(await loadInventory());
  const pass = inventory.requirements.find(req => req.verdict === 'PASS');
  pass.evidence = [];
  assert.ok(validateInventory(inventory).includes(`${pass.id} PASS without evidence`));
});

test('validator rejects target PRs outside the registry and PRs without requirements (B-05)', async () => {
  const inventory = clone(await loadInventory());
  find(inventory, 'MP-FPT-008').target_prs = ['FPT-412-AUDIT'];
  inventory.pr_registry.push({id: 'R-99', title: 'orphan', issues: [], cards: [], status: 'PLANNED'});
  const errors = validateInventory(inventory);
  assert.ok(errors.includes('MP-FPT-008 target PR FPT-412-AUDIT not in pr_registry'));
  assert.ok(errors.includes('PR R-99 has no requirement'));
});

test('validator rejects PASS depending on unresolved requirements and missing paths (B-07)', async () => {
  const inventory = clone(await loadInventory());
  find(inventory, 'MP-TC-012').verdict = 'PASS';
  find(inventory, 'MP-TC-012').evidence = ['fabricated'];
  find(inventory, 'MP-FPT-001').code.push('src/does-not-exist.mjs');
  const errors = validateInventory(inventory);
  assert.ok(errors.some(error => error.startsWith('MP-TC-012 is PASS but depends on')));
  assert.ok(errors.includes('MP-FPT-001 mapped path src/does-not-exist.mjs does not exist'));
});

test('owner-decision register rejects incomplete or dangling entries (B-06)', async () => {
  const register = clone(await loadDecisions());
  register.decisions.push({id: 'X', date: '18/10', decision: 'd', scope: 's', precedence: 'owner', references: [], status: 'SUPERSEDED'});
  const errors = validateDecisions(register);
  assert.ok(errors.includes('decision X missing references'));
  assert.ok(errors.includes('decision X invalid date'));
  assert.ok(errors.includes('decision X SUPERSEDED without superseded_by'));
});

test('2026-10-18 owner decisions are registered and drive the inventory', async () => {
  const ids = new Set((await loadDecisions()).decisions.map(item => item.id));
  for (const id of ['MP-OWNER-CERT-ISSUE-CLOSURE-01', 'MP-OWNER-AUTOMERGE-01', 'MP-GITHUB-SINGLE-SOURCE-OF-TRUTH-01', 'MP-OWNER-MASTER-GOVERNANCE-2026-10-18']) assert.ok(ids.has(id), id);
  for (let n = 1; n <= 11; n++) assert.ok(ids.has(`MP-OWNER-DECISIONS-D1-D9-20261018.D${n}`), `D${n}`);
  const inventory = await loadInventory();
  assert.match(find(inventory, 'MP-GOV-005').statement, /MP-OWNER-AUTOMERGE-01/);
  for (const id of ['MP-PIT-001', 'MP-PIT-002', 'MP-PIT-003', 'MP-PIT-004', 'MP-PIT-005', 'MP-GOV-013', 'MP-GOV-017', 'MP-GOV-019', 'MP-API-001']) assert.ok(find(inventory, id), id);
});

test('excluded future domains remain visible but outside the v1 denominator', async () => {
  const inventory = await loadInventory();
  const future = inventory.future_register.map(item => item.domain);
  for (const domain of ['Exchange execution', 'SaaS billing', 'production LIVE activation', 'Trading Engine']) assert.ok(future.includes(domain), domain);
  assert.ok(inventory.future_register.some(item => item.status.startsWith('NOT_APPROVED')));
  const denominatorIds = new Set(inventory.requirements.map(req => req.id));
  assert.ok(inventory.future_register.every(item => !denominatorIds.has(item.id)));
  assert.ok(!denominatorIds.has('MP-SEC-011'));
});

test('P0 blockers cannot be hidden by aggregate coverage', async () => {
  const inventory = await loadInventory();
  const blocking = inventory.requirements.filter(req => req.priority === 'P0' && req.verdict !== 'PASS' && req.verdict !== 'NOT_APPLICABLE');
  for (const id of ['MP-WEB-001', 'MP-RPL-001', 'MP-STA-005', 'MP-PIT-002', 'MP-ARC-002']) assert.ok(blocking.some(req => req.id === id), id);
  assert.equal(summarize(inventory).p0_open, blocking.length);
});

test('human-readable inventory docs carry the generated counts (no drift)', async () => {
  const blocks = renderBlocks(await loadInventory());
  for (const [file, names] of Object.entries(TARGETS)) {
    const text = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.equal(apply(text, blocks, names), text, `${file} is stale: run npm run governance:render`);
  }
});

test('persisted audit report matches its recorded SHA-256', async () => {
  const dir = new URL('../docs/governance/audits/', import.meta.url);
  for (const name of ['2026-10-18-MP-GATE-A-REVIEW-ROADMAP-01.md', '2026-10-18-MP-GATE-A-REVIEW-ROADMAP-01-appendix-B-governance.md']) {
    const [expected, file] = (await readFile(new URL(name + '.sha256', dir), 'utf8')).trim().split(/\s+/);
    assert.equal(file, name);
    assert.equal(createHash('sha256').update(await readFile(new URL(name, dir))).digest('hex'), expected, name);
  }
});
