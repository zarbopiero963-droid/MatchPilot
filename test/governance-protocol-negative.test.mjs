// GOV-PROTOCOL-01 (#150, t141u): negative scenarios of the vendor-neutral protocol (docs/governance/PROTOCOL.md).
// Each scenario must STOP or fail; none may let a second agent proceed silently.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync, readFileSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';
import {reconcile} from '../tools/governance/checkpoints.mjs';
import {claim, updateRegistryFile, RegistryConflict} from '../tools/governance/registry.mjs';
import {detectDrift} from '../tools/governance/drift.mjs';

const now = new Date('2026-10-23T10:00:00Z');
const cp = {id: 'CP-X', task: 'T', branch: 'b', pr: 9, commit_sha: 'a'.repeat(40), tree_sha: 't'.repeat(40), state: 'RUNNING', timestamp_utc: '2026-10-21T09:00:00Z'};
const registry = () => ({schema_version: 'mp-work-registry-v1', revision: 5, tasks: [
  {id: 'T', issue: 1, pr: null, branch: 'b', kind: 'readonly', state: 'HANDOFF READY', assignee: null, lease: null, latest_checkpoint: null}]});
const codes = list => list.map(d => d.code);

test('NEG-1 stale checkpoint: active state older than 24h is STALE', () => {
  assert.ok(codes(reconcile(cp, {branchHead: cp.commit_sha, treeSha: cp.tree_sha}, {now})).includes('STALE'));
});
test('NEG-2 SHA divergence: branch rewritten (checkpoint not an ancestor) is SHA_MISMATCH', () => {
  assert.ok(codes(reconcile({...cp, timestamp_utc: now.toISOString()}, {branchHead: 'b'.repeat(40), checkpointIsAncestor: false}, {now})).includes('SHA_MISMATCH'));
});
test('NEG-3 expired lease: drift fails and a new agent must reconcile before claiming', () => {
  const reg = registry(); reg.tasks[0] = {...reg.tasks[0], state: 'RUNNING', lease: {holder: 'agent-a', acquired_at: '2026-10-23T06:00:00Z', expires_at: '2026-10-23T08:00:00Z'}};
  assert.deepEqual(codes(detectDrift({registry: reg, prs: [], now})), ['LEASE_EXPIRED']);
  assert.throws(() => claim(reg, 'T', {id: 'agent-b', role: 'Test Agent'}, now), e => e.code === 'CONFLICT_UNRECONCILED');
  assert.equal(claim(reg, 'T', {id: 'agent-b', role: 'Test Agent'}, now, {reconciled: true}).tasks[0].lease.holder, 'agent-b');
});
test('NEG-4 abrupt interruption: work committed after the checkpoint is UNRECONCILED_COMMITS', () => {
  const d = reconcile({...cp, timestamp_utc: now.toISOString()}, {branchHead: 'c'.repeat(40), checkpointIsAncestor: true, changedSinceCheckpoint: [{status: 'M', file: 'src/x.mjs'}]}, {now});
  assert.deepEqual(codes(d), ['UNRECONCILED_COMMITS']);
});
test('NEG-5 concurrent double claim: second writer is refused (lease, revision CAS, file lock)', () => {
  const first = claim(registry(), 'T', {id: 'agent-a', role: 'Development Agent'}, now);
  assert.throws(() => claim(first, 'T', {id: 'agent-b', role: 'Test Agent'}, now), e => e.code === 'CONFLICT_LEASE_ACTIVE');
  assert.throws(() => claim(first, 'T', {id: 'agent-b', role: 'Test Agent'}, now, {expectedRevision: 5}), e => e.code === 'CONFLICT_REVISION');
  const dir = mkdtempSync(join(tmpdir(), 'mp-neg5-')); const file = join(dir, 'work-registry.json');
  writeFileSync(file, JSON.stringify(registry())); writeFileSync(`${file}.lock`, '');
  assert.throws(() => updateRegistryFile(file, r => r), e => e instanceof RegistryConflict && e.code === 'CONFLICT_LOCKED');
});
test('CLI: orient, claim and release exist and orient reports runtime state + next action', () => {
  const out = spawnSync('node', ['tools/governance/cli.mjs', 'orient', '--json', '--offline'], {encoding: 'utf8'});
  const report = JSON.parse(out.stdout);
  assert.match(report.production_release_sha, /^[0-9a-f]{40}$/);
  assert.ok(report.next_action && Array.isArray(report.pending_runtime_checks) && Array.isArray(report.live_tasks));
  for (const cmd of ['claim', 'release']) assert.match(readFileSync('tools/governance/cli.mjs', 'utf8'), new RegExp(`command === '${cmd}'`));
  assert.ok(existsSync('docs/governance/PROTOCOL.md') && existsSync('docs/governance/schemas/checkpoint-v3.schema.json'));
});

import {takeoverCheck} from '../tools/governance/drift.mjs';
test('NEG-6 takeover rule (t145u): active lease, open PR of the holder or running CI => STOP; expired or released => PROCEED', () => {
  const reg = registry(); reg.tasks[0] = {...reg.tasks[0], pr: 9, state: 'RUNNING', lease: {holder: 'agent-a', acquired_at: '2026-10-23T09:00:00Z', expires_at: '2026-10-23T11:00:00Z'}};
  const stop = takeoverCheck({registry: reg, task: 'T', agentId: 'agent-b', openPrs: [{number: 9, branch: 'b'}], runningRuns: [{id: 1, branch: 'b', status: 'in_progress'}], now});
  assert.equal(stop.verdict, 'STOP');
  assert.deepEqual(stop.reasons.map(r => r.code).sort(), ['CI_RUNNING', 'LEASE_ACTIVE', 'OPEN_PR_OF_ACTIVE_AGENT']);
  reg.tasks[0].lease.expires_at = '2026-10-23T09:30:00Z';
  assert.equal(takeoverCheck({registry: reg, task: 'T', agentId: 'agent-b', openPrs: [{number: 9, branch: 'b'}], now}).verdict, 'PROCEED');
  assert.equal(takeoverCheck({registry: registry(), task: 'T', agentId: 'agent-b', now}).verdict, 'PROCEED');
  assert.equal(takeoverCheck({registry: registry(), task: 'NOPE', agentId: 'agent-b', now}).verdict, 'STOP');
});
