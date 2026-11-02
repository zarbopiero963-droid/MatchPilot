// MP-CP-WITHDRAW-01: the real fork of MP-OWNER-DEC-MIG-01 (CP-20261102T224000Z propagated, CP-20261102T230845Z corrected)
// and the parallel MERGED checkpoints of MP-OWNER-DEC-MIG-02 are resolved by explicit withdrawals, without rewriting.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {errataMap, resolveLatest, validateErrata} from '../tools/governance/checkpoints.mjs';

const dir = 'docs/governance/checkpoints';
const checkpoints = readdirSync(dir).filter(f => f.endsWith('.json')).map(f => JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')));
const errataFile = JSON.parse(readFileSync('docs/governance/checkpoint-errata.json', 'utf8'));
const errata = errataMap(errataFile);

test('MP-CP-WITHDRAW-01 real case: both siblings stay in history, the corrected one is the only active head', () => {
  assert.deepEqual(validateErrata(errataFile, checkpoints), []);
  const old = checkpoints.find(cp => cp.id === 'CP-20261102T224000Z-agent-a-claude-code');
  const fixed = checkpoints.find(cp => cp.id === 'CP-20261102T230845Z-agent-a-claude-code');
  assert.ok(old && fixed, 'both files are present');
  assert.equal(old.supersedes, fixed.supersedes);
  // the propagated copy is byte-identical to the one on the open PR branches (git blob 1a5e351)
  const raw = readFileSync(`${dir}/${old.id}.json`);
  const blob = createHash('sha1').update(`blob ${raw.length}\0`).update(raw).digest('hex');
  assert.equal(blob, '1a5e35190f3a6d434cc77ad2396c188ffc5579d6');
  assert.ok(resolveLatest(checkpoints, old.task).conflicts.some(e => e.startsWith('fork after')), 'without the errata it is a fork');
  const {latest, conflicts} = resolveLatest(checkpoints, old.task, {errata});
  assert.deepEqual(conflicts, []);
  assert.equal(latest.id, fixed.id);
  // the corrected head records the merged head as a self-review, not as the Codex review of 6b6b098
  assert.match(fixed.review.reference, /^SELF-REVIEW/);
  assert.equal(errata.withdrawn.get(old.id).replaced_by, fixed.id);
});

test('MP-CP-WITHDRAW-01 real case: one MERGED head for MP-OWNER-DEC-MIG-02, reviewed on the merged commit', () => {
  const {latest, conflicts} = resolveLatest(checkpoints, 'MP-OWNER-DEC-MIG-02', {errata});
  assert.deepEqual(conflicts, []);
  assert.equal(latest.id, 'CP-20261102T231552Z-agent-a-claude-code');
  assert.equal(latest.state, 'MERGED');
  assert.equal(latest.review.reviewed_sha, latest.commit_sha);
});
