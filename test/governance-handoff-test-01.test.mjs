// HANDOFF-TEST-01 (#150, MP-OWNER-AGENTS-INTERCHANGEABLE-01): the real A -> B -> A handoff leaves a linear, append-only
// checkpoint chain in the repository. This test reads the real checkpoints (not fixtures) and checks the legs recorded
// so far: A hands OUT to ANY, a different agent takes it IN with structured verifications, and that agent hands it back
// OUT. A later return leg (A takes it IN again) may extend the chain without breaking these assertions.
import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {loadCheckpoints, resolveLatest} from '../tools/governance/checkpoints.mjs';

const DIR = fileURLToPath(new URL('../docs/governance/checkpoints/', import.meta.url));
const TASK = 'HANDOFF-TEST-01';

function chain() {
  const own = loadCheckpoints(DIR).filter(cp => cp.task === TASK);
  const bySupersedes = new Map(own.map(cp => [cp.supersedes, cp]));
  const ordered = [];
  for (let cp = bySupersedes.get(null); cp; cp = bySupersedes.get(cp.id)) ordered.push(cp);
  return {own, ordered};
}

test('HANDOFF-TEST-01 chain is linear: one root, one head, every checkpoint reachable', () => {
  const {own, ordered} = chain();
  assert.ok(own.length >= 3, `expected at least the OUT, IN and OUT legs, found ${own.length}`);
  assert.equal(ordered.length, own.length, 'every checkpoint of the task is on the single supersedes chain');
  const {latest, conflicts} = resolveLatest(own, TASK);
  assert.deepEqual(conflicts, []);
  assert.equal(latest.id, ordered.at(-1).id);
});

test('leg A: the root hands the task OUT to ANY with the lease released', () => {
  const [root] = chain().ordered;
  assert.equal(root.supersedes, null);
  assert.equal(root.state, 'HANDOFF READY');
  assert.equal(root.handoff.status, 'OUT');
  assert.equal(root.handoff.to, 'ANY');
  assert.ok(root.resume_conditions.length > 0);
});

test('leg B: a different agent takes it IN with structured verifications, then hands it back OUT to A', () => {
  const [root, inLeg, outLeg] = chain().ordered;
  assert.notEqual(inLeg.agent.id, root.agent.id, 'B is a different agent from A');
  assert.notEqual(inLeg.agent.session, root.agent.session, 'B runs in a different session');
  assert.equal(inLeg.handoff.status, 'IN');
  assert.equal(inLeg.handoff.from, root.agent.id);
  assert.ok(inLeg.handoff.verified.length > 0);
  for (const entry of inLeg.handoff.verified) {
    assert.equal(entry.result, 'VERIFIED', entry.claim);
    assert.equal(entry.observer, inLeg.agent.id, entry.claim);
  }
  assert.equal(outLeg.agent.id, inLeg.agent.id);
  assert.equal(outLeg.state, 'HANDOFF READY');
  assert.equal(outLeg.handoff.status, 'OUT');
  assert.equal(outLeg.handoff.to, root.agent.id, 'B hands the return leg back to A');
});

test('HANDOFF-TEST-01 stays inside its limits: no cost, no authorization consumed, production untouched', () => {
  for (const cp of chain().ordered) {
    assert.equal(cp.costs.incurred, 'none', cp.id);
    assert.deepEqual(cp.authorizations, [], cp.id);
    assert.equal(cp.vps?.production, 'untouched', cp.id);
    for (const file of cp.changes) assert.match(file, /^(test|docs)\//, `${cp.id} changes ${file} outside tests/docs`);
  }
});
