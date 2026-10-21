// VPS-DEPLOY-01: the private VPS runner (labels self-hosted, matchpilot-vps) runs only the deploy of main. The repository
// is public, so a workflow triggered by a pull request (or anything but a push to main) must never reach that runner:
// every runs-on of such a workflow is a literal GitHub-hosted label and none of its jobs calls a reusable workflow; a
// workflow that names the VPS runner is triggered only by a push to main and gates each job on exactly the repository and
// refs/heads/main. A guard for changes made in this repository, not a security boundary: a fork pull request runs the
// workflows of its own head, test included, so fork workflows need the owner's approval setting on GitHub.
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import test from 'node:test';

const DIR = new URL('../.github/workflows/', import.meta.url);
const HOSTED = /^(ubuntu|windows|macos)-[\w.-]+$/;
const PRIVATE = /self-hosted|matchpilot-vps/;

// Lines without comments; quoted strings are kept as they are.
const code = text => text.split('\n').map(line => line.replace(/(^|\s)#.*$/, '')).filter(line => line.trim() !== '');

// The trigger block of a workflow: the events and, for push, its branches. Accepts `on: push`, `on: [a, b]` and the
// mapping form; anything it cannot read is reported as an unknown trigger, so it fails closed.
export function triggers(text) {
  const lines = code(text);
  const start = lines.findIndex(line => /^['"]?on['"]?\s*:/.test(line));
  if (start < 0) return {events: ['<none>'], pushBranches: null};
  const inline = lines[start].replace(/^['"]?on['"]?\s*:\s*/, '').trim();
  if (inline) {
    const events = inline.replace(/^\[|\]$/g, '').split(',').map(event => event.trim()).filter(Boolean);
    return {events, pushBranches: null};
  }
  const block = [];
  for (const line of lines.slice(start + 1)) {
    if (!/^\s/.test(line)) break;
    block.push(line);
  }
  const indent = Math.min(...block.map(line => line.match(/^\s*/)[0].length));
  const events = block.filter(line => line.match(/^\s*/)[0].length === indent).map(line => line.trim().replace(/:.*$/, ''));
  const push = block.findIndex(line => line.trim().startsWith('push:') && line.match(/^\s*/)[0].length === indent);
  let pushBranches = null;
  if (push >= 0) {
    const body = [];
    for (const line of block.slice(push + 1)) {
      if (line.match(/^\s*/)[0].length <= indent) break;
      body.push(line.trim());
    }
    const keys = body.filter(line => /^[\w-]+\s*:/.test(line)).map(line => line.replace(/\s*:.*$/, ''));
    const branches = body.find(line => line.startsWith('branches:'));
    pushBranches = keys.length === 1 && branches && /\[.*\]/.test(branches)
      ? branches.replace(/^branches:\s*\[|\]\s*$/g, '').split(',').map(branch => branch.trim().replace(/^['"]|['"]$/g, ''))
      : ['<unreadable>'];
  }
  return {events, pushBranches};
}

// Every runs-on value of a workflow, as written.
const runsOn = text => code(text).filter(line => /^\s*runs-on\s*:/.test(line)).map(line => line.replace(/^\s*runs-on\s*:\s*/, '').trim());
// The only accepted gate of a job on the VPS runner: exactly this expression, so nothing can be OR-ed in front of it.
const GATE = "github.repository == 'zarbopiero963-droid/MatchPilot' && github.ref == 'refs/heads/main'";
// Jobs that call a reusable workflow (job-level uses:): its jobs run on this repository's runners, so it could name the VPS.
const reusableCalls = text => code(text).filter(line => /^\s{4}uses\s*:/.test(line)).map(line => line.replace(/^\s*uses\s*:\s*/, '').trim());
const jobIfs = text => code(text).filter(line => /^\s{4}if\s*:/.test(line)).map(line => line.replace(/^\s*if\s*:\s*/, ''));

export function workflowProblems(name, text) {
  const problems = [];
  const {events, pushBranches} = triggers(text);
  const pushToMainOnly = events.length === 1 && events[0] === 'push' && JSON.stringify(pushBranches) === '["main"]';
  if (PRIVATE.test(code(text).join('\n'))) {
    if (!pushToMainOnly) problems.push(`${name}: names the VPS runner but is triggered by ${events.join(', ')}${pushBranches ? ` on ${pushBranches.join(', ')}` : ''}, not only by a push to main`);
    const lines = code(text);
    const jobsAt = lines.findIndex(line => /^jobs\s*:/.test(line));
    const jobs = jobsAt < 0 ? 1 : lines.slice(jobsAt + 1).filter(line => /^\s{2}[\w-]+\s*:\s*$/.test(line)).length;
    const gated = jobIfs(text).filter(cond => cond.trim() === GATE);
    if (gated.length < jobs) problems.push(`${name}: a job is not gated on the repository and refs/heads/main`);
  } else if (!pushToMainOnly) {
    for (const value of runsOn(text)) if (!HOSTED.test(value)) problems.push(`${name}: runs-on ${value} is not a literal GitHub-hosted label`);
    for (const target of reusableCalls(text)) problems.push(`${name}: a job calls the reusable workflow ${target}, whose runners this test cannot see`);
  }
  return problems;
}

const files = readdirSync(DIR).filter(file => /\.ya?ml$/.test(file)).sort();
const read = file => readFileSync(new URL(file, DIR), 'utf8');

test('workflows: the VPS runner is reachable only from a push to main', () => {
  assert.ok(files.includes('deploy-vps.yml') && files.includes('ci.yml'));
  assert.deepEqual(files.flatMap(file => workflowProblems(file, read(file))), []);
  assert.deepEqual(triggers(read('deploy-vps.yml')), {events: ['push'], pushBranches: ['main']});
  assert.deepEqual(triggers(read('ci.yml')).events, ['pull_request', 'push']);
});

test('workflows: every way to reach the VPS runner from a pull request is refused', () => {
  const deploy = read('deploy-vps.yml');
  const ci = read('ci.yml');
  const cases = [
    ['a pull_request trigger added to the deploy', deploy.replace('on:\n  push:', 'on:\n  pull_request:\n  push:'), /not only by a push to main/],
    ['pull_request_target', deploy.replace('on:\n  push:', 'on:\n  pull_request_target:\n  push:'), /not only by a push to main/],
    ['a manual dispatch', deploy.replace('on:\n  push:', 'on:\n  workflow_dispatch:\n  push:'), /not only by a push to main/],
    ['inline events', deploy.replace(/on:\n  push:\n    branches: \[main\]/, 'on: [push, pull_request]'), /not only by a push to main/],
    ['another branch', deploy.replace('branches: [main]', 'branches: [main, dev]'), /not only by a push to main/],
    ['a tag filter beside the branch', deploy.replace('branches: [main]', 'branches: [main]\n    tags: [v*]'), /not only by a push to main/],
    ['an ungated job', deploy.replace(/    if: .*\n/, ''), /not gated/],
    ['a second job without a gate', `${deploy}  shell:\n    runs-on: [self-hosted, matchpilot-vps]\n    steps:\n      - run: id\n`, /not gated/],
    ['a gate that anything can satisfy', deploy.replace("if: github.repository", "if: true || github.repository"), /not gated/],
    ['a gate without the ref', deploy.replace(" && github.ref == 'refs/heads/main'", ''), /not gated/],
    ['the VPS runner in CI', ci.replace('runs-on: ubuntu-latest', 'runs-on: [self-hosted, matchpilot-vps]'), /not only by a push to main/],
    ['a runner from an expression in CI', ci.replace('runs-on: ubuntu-latest', 'runs-on: ${{ inputs.runner }}'), /not a literal GitHub-hosted label/],
    ['a reusable workflow called from CI', ci.replace('jobs:\n', 'jobs:\n  evil:\n    uses: attacker/x/.github/workflows/w.yml@main\n'), /calls the reusable workflow attacker/],
    ['a self-hosted runner without the label in CI', ci.replace('runs-on: ubuntu-latest', 'runs-on: self-hosted'), /not only by a push to main/],
  ];
  for (const [what, text, expected] of cases) {
    const name = what.includes('CI') ? 'ci.yml' : 'deploy-vps.yml';
    assert.notEqual(text, name === 'ci.yml' ? ci : deploy, `${what}: the tampering applies`);
    assert.match(workflowProblems(name, text).join('\n'), expected, what);
  }
});

// MP-DEPLOY-APPROVAL-01: a merge to main is not an authorization to deploy. Every job on the VPS runner deploys only to
// the environment vps-production (whose required reviewer is the owner, checked by the gate job at run time), only
// after the gate job, and checks that the approved SHA is still the tip of main before mp-deploy. The gate job runs on
// a GitHub-hosted runner and cannot be skipped or made optional.
const jobBlocks = text => {
  const lines = code(text);
  const at = lines.findIndex(line => /^jobs\s*:/.test(line));
  const jobs = new Map();
  let current = null;
  for (const line of lines.slice(at + 1)) {
    const head = /^\s{2}([\w-]+)\s*:\s*$/.exec(line);
    if (head) { current = head[1]; jobs.set(current, []); } else if (current) jobs.get(current).push(line);
  }
  return jobs;
};
const field = (lines, key) => lines.filter(line => new RegExp(`^\\s{4}${key}\\s*:`).test(line)).map(line => line.replace(/^\s*[\w-]+\s*:\s*/, '').trim());

export function deployApprovalProblems(text, environment) {
  const problems = [];
  const jobs = jobBlocks(text);
  const gate = jobs.get('gate');
  if (!gate) problems.push('no gate job');
  else {
    if (JSON.stringify(field(gate, 'runs-on')) !== '["ubuntu-latest"]') problems.push('the gate job does not run on ubuntu-latest');
    if (!gate.some(line => line.trim() === 'run: node scripts/deploy-gate.mjs')) problems.push('the gate job does not run scripts/deploy-gate.mjs');
    if (field(gate, 'environment').length) problems.push('the gate job names an environment');
  }
  if (/continue-on-error/.test(code(text).join('\n'))) problems.push('a job or step may fail without stopping the deploy');
  for (const [name, lines] of jobs) {
    if (!PRIVATE.test(lines.join('\n'))) continue;
    if (JSON.stringify(field(lines, 'environment')) !== JSON.stringify([environment])) problems.push(`${name}: runs on the VPS without the environment ${environment}`);
    if (JSON.stringify(field(lines, 'needs')) !== '["gate"]') problems.push(`${name}: runs on the VPS without needing the gate job`);
    const steps = lines.filter(line => /^\s{6}- /.test(line));
    if (steps[0]?.trim() !== '- name: SHA approvato ancora su main') problems.push(`${name}: the first step is not the SHA check`);
    const check = lines.findIndex(line => line.includes('DEPLOY_GATE_STALE_SHA'));
    const deploy = lines.findIndex(line => line.includes('/usr/local/sbin/mp-deploy'));
    if (check < 0 || deploy < 0 || deploy < check) problems.push(`${name}: mp-deploy is not preceded by the SHA check`);
  }
  return problems;
}

test('deploy approval: the VPS job waits for vps-production and the gate, and checks the approved SHA first', async () => {
  const {ENVIRONMENT} = await import('../scripts/deploy-gate.mjs');
  const deploy = read('deploy-vps.yml');
  assert.equal(ENVIRONMENT, 'vps-production');
  assert.deepEqual(deployApprovalProblems(deploy, ENVIRONMENT), []);
  const cases = [
    ['the environment removed', deploy.replace('    environment: vps-production\n', ''), /without the environment/],
    ['another environment', deploy.replace('environment: vps-production', 'environment: production'), /without the environment/],
    ['an environment from an expression', deploy.replace('environment: vps-production', 'environment: ${{ inputs.env }}'), /without the environment/],
    ['the gate dependency removed', deploy.replace('    needs: gate\n', ''), /without needing the gate job/],
    ['the gate job removed', deploy.replace(/  gate:\n[\s\S]*?(?=  deploy:)/, ''), /no gate job/],
    ['the gate made optional', deploy.replace('    timeout-minutes: 5\n', '    timeout-minutes: 5\n    continue-on-error: true\n'), /may fail without stopping/],
    ['the gate check not run', deploy.replace('run: node scripts/deploy-gate.mjs', 'run: echo ok'), /does not run scripts\/deploy-gate\.mjs/],
    ['the gate on the VPS runner', deploy.replace('    runs-on: ubuntu-latest\n    timeout-minutes: 5', '    runs-on: [self-hosted, matchpilot-vps]\n    timeout-minutes: 5'), /gate job does not run on ubuntu-latest/],
    ['the SHA check removed', deploy.replace(/      - name: SHA approvato ancora su main\n[\s\S]*?(?=      # Nessun checkout)/, ''), /first step is not the SHA check|not preceded/],
    ['mp-deploy before the SHA check', deploy.replace(/(      - name: SHA approvato ancora su main\n[\s\S]*?)(      # Nessun checkout[\s\S]*)$/, '$2$1'), /first step is not the SHA check|not preceded/],
    ['a second VPS job without approval', `${deploy}  again:\n    if: ${GATE}\n    runs-on: [self-hosted, matchpilot-vps]\n    steps:\n      - run: sudo -n /usr/local/sbin/mp-deploy x\n`, /again: runs on the VPS without the environment/],
  ];
  for (const [what, text, expected] of cases) {
    assert.notEqual(text, deploy, `${what}: the tampering applies`);
    assert.match(deployApprovalProblems(text, ENVIRONMENT).join('\n'), expected, what);
  }
});
