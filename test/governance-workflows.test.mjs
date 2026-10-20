// VPS-DEPLOY-01: the private VPS runner (labels self-hosted, matchpilot-vps) runs only the deploy of main. The repository
// is public, so a workflow triggered by a pull request (or anything but a push to main) must never reach that runner:
// every runs-on of such a workflow is a literal GitHub-hosted label, and a workflow that names the VPS runner is
// triggered only by a push to main and gates each job on the repository and refs/heads/main.
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
    const gated = jobIfs(text).filter(cond => cond.includes("github.ref == 'refs/heads/main'") && cond.includes("github.repository == 'zarbopiero963-droid/MatchPilot'"));
    if (gated.length < jobs) problems.push(`${name}: a job is not gated on the repository and refs/heads/main`);
  } else if (!pushToMainOnly) {
    for (const value of runsOn(text)) if (!HOSTED.test(value)) problems.push(`${name}: runs-on ${value} is not a literal GitHub-hosted label`);
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
    ['a gate without the ref', deploy.replace(" && github.ref == 'refs/heads/main'", ''), /not gated/],
    ['the VPS runner in CI', ci.replace('runs-on: ubuntu-latest', 'runs-on: [self-hosted, matchpilot-vps]'), /not only by a push to main/],
    ['a runner from an expression in CI', ci.replace('runs-on: ubuntu-latest', 'runs-on: ${{ inputs.runner }}'), /not a literal GitHub-hosted label/],
    ['a self-hosted runner without the label in CI', ci.replace('runs-on: ubuntu-latest', 'runs-on: self-hosted'), /not only by a push to main/],
  ];
  for (const [what, text, expected] of cases) {
    const name = what.includes('CI') ? 'ci.yml' : 'deploy-vps.yml';
    assert.notEqual(text, name === 'ci.yml' ? ci : deploy, `${what}: the tampering applies`);
    assert.match(workflowProblems(name, text).join('\n'), expected, what);
  }
});
