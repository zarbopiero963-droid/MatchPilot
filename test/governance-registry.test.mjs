import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {claim, release, validateRegistry} from '../tools/governance/registry.mjs';

const now = new Date('2026-10-18T20:00:00Z');
const later = minutes => new Date(now.getTime() + minutes * 60e3);
const agentA = {id: 'agent-a', role: 'Development Agent'};
const agentB = {id: 'agent-b', role: 'Development Agent'};

const registry = () => ({
  schema_version: 'mp-work-registry-v1',
  revision: 3,
  tasks: [
    {id: 'R-01', title: 'governance', issue: 150, pr: null, branch: 'b1', kind: 'implementation', state: 'PLANNED', assignee: null, lease: null, latest_checkpoint: null},
    {id: 'R-02', title: 'archive', issue: 40, pr: null, branch: 'b2', kind: 'implementation', state: 'PLANNED', assignee: null, lease: null, latest_checkpoint: null},
    {id: 'AUDIT-1', title: 'read-only audit', issue: 97, pr: null, branch: 'main', kind: 'readonly', state: 'PLANNED', assignee: null, lease: null, latest_checkpoint: null},
  ],
});
const task = (reg, id) => reg.tasks.find(item => item.id === id);
const code = fn => { try { fn(); } catch (error) { return error.code; } return 'NO_ERROR'; };

test('claiming assigns a lease, bumps the revision and renewing is idempotent', () => {
  const claimed = claim(registry(), 'R-01', agentA, now, {expectedRevision: 3});
  assert.equal(claimed.revision, 4);
  assert.equal(task(claimed, 'R-01').state, 'RUNNING');
  assert.deepEqual(task(claimed, 'R-01').assignee, {agent: 'agent-a', role: 'Development Agent'});
  assert.equal(task(claimed, 'R-01').lease.expires_at, later(120).toISOString());
  const renewed = claim(claimed, 'R-01', agentA, later(30));
  assert.equal(task(renewed, 'R-01').lease.holder, 'agent-a');
  assert.equal(renewed.tasks.length, claimed.tasks.length);
  assert.deepEqual(validateRegistry(renewed), []);
});

test('incompatible concurrent work is refused', () => {
  const claimed = claim(registry(), 'R-01', agentA, now);
  assert.equal(code(() => claim(claimed, 'R-01', agentB, later(10))), 'CONFLICT_LEASE_ACTIVE');
  assert.equal(code(() => claim(claimed, 'R-02', agentB, later(10))), 'CONFLICT_PARALLEL_IMPLEMENTATION');
  assert.equal(code(() => claim(claimed, 'R-01', agentA, later(10), {expectedRevision: 3})), 'CONFLICT_REVISION');
  assert.equal(task(claim(claimed, 'AUDIT-1', agentB, later(10)), 'AUDIT-1').state, 'RUNNING', 'read-only work may run in parallel');
  assert.equal(code(() => claim(claimed, 'R-99', agentB, now)), 'UNKNOWN_TASK');
});

test('a BLOCKED implementation task does not block an independent one', () => {
  const reg = registry();
  reg.tasks[0].state = 'BLOCKED';
  const claimed = claim(reg, 'R-02', agentB, now);
  assert.equal(task(claimed, 'R-02').state, 'RUNNING');
  assert.deepEqual(validateRegistry(claimed), []);
});

test('an expired lease is taken over only after reconciliation', () => {
  const claimed = claim(registry(), 'R-01', agentA, now);
  assert.equal(code(() => claim(claimed, 'R-01', agentB, later(121))), 'CONFLICT_UNRECONCILED');
  const taken = claim(claimed, 'R-01', agentB, later(121), {reconciled: true});
  assert.equal(task(taken, 'R-01').lease.holder, 'agent-b');
});

test('handoff releases the lease, records the checkpoint and lets another agent continue', () => {
  const claimed = claim(registry(), 'R-01', agentA, now);
  assert.equal(code(() => release(claimed, 'R-01', 'agent-b', 'CP-x', 'HANDOFF READY')), 'NOT_LEASE_HOLDER');
  const handed = release(claimed, 'R-01', 'agent-a', 'CP-20261018T201000Z-agent-a', 'HANDOFF READY');
  assert.equal(task(handed, 'R-01').state, 'HANDOFF READY');
  assert.equal(task(handed, 'R-01').lease, null);
  assert.equal(task(handed, 'R-01').assignee, null);
  assert.equal(task(handed, 'R-01').latest_checkpoint, 'CP-20261018T201000Z-agent-a');
  const continued = claim(handed, 'R-01', agentB, later(5), {expectedRevision: handed.revision});
  assert.equal(task(continued, 'R-01').assignee.agent, 'agent-b');
  const done = release(continued, 'R-01', 'agent-b', 'CP-y', 'MERGED');
  assert.equal(code(() => claim(done, 'R-01', agentA, later(10))), 'TASK_FINISHED');
});

test('registry validation rejects two live implementation tasks and inconsistent leases', () => {
  const bad = registry();
  bad.tasks[0].state = 'RUNNING';
  bad.tasks[1].state = 'REVIEW';
  assert.ok(validateRegistry(bad).some(e => e.includes('more than one active implementation')));
  const lease = registry();
  lease.tasks[0].lease = {holder: 'agent-a', acquired_at: now.toISOString(), expires_at: later(5).toISOString()};
  lease.tasks[0].assignee = {agent: 'agent-z', role: 'Test Agent'};
  assert.ok(validateRegistry(lease).some(e => e.includes('lease holder')));
  assert.ok(validateRegistry({...registry(), tasks: [...registry().tasks, registry().tasks[0]]}).some(e => e.includes('duplicated')));
});

test('real concurrent processes: exactly one agent wins the claim', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'mp-registry-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const file = join(dir, 'work-registry.json');
  writeFileSync(file, JSON.stringify(registry(), null, 2));
  const moduleUrl = new URL('../tools/governance/registry.mjs', import.meta.url).href;
  const script = `
    const {claim, updateRegistryFile} = await import(${JSON.stringify(moduleUrl)});
    const agent = {id: process.argv[1], role: 'Development Agent'};
    try { updateRegistryFile(process.argv[2], reg => claim(reg, 'R-01', agent, new Date())); console.log('WON'); }
    catch (error) { console.log(error.code || error.message); }`;
  const runs = await Promise.all(Array.from({length: 8}, (_, i) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', script, `agent-${i}`, file], {stdio: ['ignore', 'pipe', 'inherit']});
    let out = '';
    child.stdout.on('data', chunk => { out += chunk; });
    child.on('error', reject);
    child.on('close', () => resolve(out.trim()));
  })));
  assert.equal(runs.filter(result => result === 'WON').length, 1, runs.join(','));
  assert.ok(runs.every(result => ['WON', 'CONFLICT_LOCKED', 'CONFLICT_LEASE_ACTIVE'].includes(result)), runs.join(','));
  const final = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(final.revision, 4);
  assert.match(final.tasks[0].lease.holder, /^agent-\d$/);
});
