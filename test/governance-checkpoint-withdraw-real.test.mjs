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
  // the adopted CP-20261102T231552Z declared PASS while CI jobs were still running; its successor records the
  // completed runs (PR #302 review), so the canonical head carries verified CI results
  assert.equal(latest.id, 'CP-20261102T235930Z-agent-a-claude-code');
  assert.equal(latest.supersedes, 'CP-20261102T235352Z-agent-a-claude-code');
  const chain = [];
  for (let cp = latest; cp; cp = checkpoints.find(other => other.id === cp.supersedes)) chain.push(cp.id);
  assert.ok(chain.includes('CP-20261102T233544Z-agent-a-claude-code') && chain.includes('CP-20261102T231552Z-agent-a-claude-code'));
  // the refused deploy is recorded as it happened (FAIL), as in the withdrawn checkpoint
  assert.ok(latest.tests.some(t => t.command.startsWith('deploy-vps') && t.result === 'FAIL'));
  // the tracked finding of the withdrawn CP-20261102T232003Z stays in the active chain
  assert.ok(latest.findings.some(f => f.id === 'PROC-MERGED-REVIEWED-SHA' && f.status === 'TRACKED'));
  assert.equal(latest.state, 'MERGED');
  assert.equal(latest.review.reviewed_sha, latest.commit_sha);
  assert.equal(latest.ci.run_id, 41543281345);
  assert.ok(latest.tests.every(t => t.limits.every(l => !/running/.test(l))));
});
