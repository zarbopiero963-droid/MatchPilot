import test from 'node:test';
import assert from 'node:assert/strict';
import {loadInventory, summarize, validateInventory} from '../tools/validate-requirements.mjs';

test('MP-PR-00 inventory has a unique, schema-valid atomic denominator', async () => {
  const inventory = await loadInventory();
  assert.deepEqual(validateInventory(inventory), []);
  const summary = summarize(inventory);
  assert.equal(summary.denominator, 96);
  assert.deepEqual(summary.by_group, {GOV:12,FPT:12,TC:12,WEB:12,RPL:12,STA:12,QAC:12,SEC:12});
  assert.equal(summary.by_priority.P0 > 0, true);
  assert.equal(summary.by_verdict.FAIL > 0, true);
  assert.equal(summary.by_verdict.BLOCKED > 0, true);
  assert.equal(summary.by_verdict.NOT_VERIFIED > 0, true);
});

test('every atomic requirement resolves full operational fields through its group', async () => {
  const inventory = await loadInventory();
  for (const req of inventory.requirements) {
    const group = inventory.groups[req.group];
    for (const key of ['conditions','inputs','outputs','invariants','failure_modes']) {
      assert.ok(Array.isArray(group[key]) && group[key].length, `${req.id} lacks inherited ${key}`);
    }
    assert.ok(req.statement.length >= 20, `${req.id} statement is not atomic enough`);
    assert.ok(req.behavior.length >= 20, `${req.id} behavior is not explicit`);
    assert.ok(req.source_ref, `${req.id} lacks verifiable source reference`);
  }
});

test('excluded future domains remain visible but outside the v1 denominator', async () => {
  const inventory = await loadInventory();
  const future = inventory.future_register.map(item => item.domain);
  assert.ok(future.includes('Exchange execution'));
  assert.ok(future.includes('SaaS billing'));
  assert.ok(future.includes('production LIVE activation'));
  const denominatorIds = new Set(inventory.requirements.map(req => req.id));
  assert.ok(inventory.future_register.every(item => !denominatorIds.has(item.id)));
});

test('P0 blockers cannot be hidden by aggregate coverage', async () => {
  const inventory = await loadInventory();
  const blocking = inventory.requirements.filter(req => req.priority === 'P0' && req.verdict !== 'PASS' && req.verdict !== 'NOT_APPLICABLE');
  assert.ok(blocking.length > 0);
  assert.ok(blocking.some(req => req.id === 'MP-WEB-001'));
  assert.ok(blocking.some(req => req.id === 'MP-RPL-001'));
  assert.ok(blocking.some(req => req.id === 'MP-STA-005'));
});

test('production-code reverse mappings use repository paths', async () => {
  const inventory = await loadInventory();
  const mapped = inventory.requirements.flatMap(req => req.code.map(path => [path, req.id]));
  assert.ok(mapped.some(([path]) => path === 'src/server.mjs'));
  assert.ok(mapped.some(([path]) => path === 'src/providers/futpython/query.mjs'));
  assert.ok(mapped.some(([path]) => path === 'src/providers/totalcorner/prematch.mjs'));
});
