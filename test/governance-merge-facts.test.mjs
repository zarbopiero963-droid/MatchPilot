// GOV-01: the merge gate's facts come from GitHub (fake API here); every missing, failed, running or unreadable fact
// blocks, and a gate fed by hand is never certified (MP-OWNER-AUTOMERGE-02/-03).
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {deployPathCertified, mergeWithFacts, readGithubFacts} from '../tools/governance/merge-facts.mjs';
import {evaluateMergeGate} from '../tools/governance/policy.mjs';

const HEAD = 'a'.repeat(40);
const MAIN = 'b'.repeat(40);
const REPO = 'o/r';

function fakeGithub(overrides = {}) {
  const routes = {
    [`repos/${REPO}/pulls/7`]: {state: 'open', merged: false, head: {sha: HEAD}, base: {ref: 'main'}},
    [`repos/${REPO}/branches/main`]: {commit: {sha: MAIN}},
    [`repos/${REPO}/commits/${HEAD}/check-runs?check_name=CI%20gate&per_page=100`]: {check_runs: [
      {name: 'CI gate', app: {slug: 'github-actions'}, status: 'completed', conclusion: 'success', started_at: '2026-10-20T10:00:00Z'}]},
    [`repos/${REPO}/actions/workflows/deploy-vps.yml/runs?branch=main&event=push&head_sha=${MAIN}&per_page=20`]: {workflow_runs: [
      {id: 99, head_sha: MAIN, path: '.github/workflows/deploy-vps.yml', event: 'push', head_branch: 'main', status: 'completed', conclusion: 'success', created_at: '2026-10-20T09:00:00Z'}]},
    [`repos/${REPO}/actions/runs/99/jobs`]: {jobs: [{name: 'deploy', runner_name: 'matchpilot-vps', labels: ['self-hosted', 'matchpilot-vps']}]},
    ...overrides,
  };
  return async path => {
    if (!(path in routes)) throw new Error(`unexpected ${path}`);
    const value = routes[path];
    if (value instanceof Error) throw value;
    return structuredClone(value);
  };
}

const declared = () => ({scope_authorized: true, gate_a: 'PASS', gate_b: 'PASS', mandatory_tests: 'PASS', branch_protection: true,
  review: {verdict: 'APPROVED', separate_session: true, reference: 'https://github.com/o/r/pull/7#issuecomment-1', reviewed_sha: HEAD},
  blocking_findings: 0, owner_conflicts: 0, external_operations: ['vps_deploy_main'], web_impact: false, merge_class: 'AUTO-MERGE ELIGIBLE',
  title: 'UI: spacing', body: 'Refs #97', commit_messages: ['UI: spacing']});

async function gate(overrides, {certified = true, input = declared()} = {}) {
  const facts = await readGithubFacts({repo: REPO, pr: 7, api: fakeGithub(overrides)});
  const merged = mergeWithFacts(input, facts, {deployCertified: certified});
  const verdict = evaluateMergeGate(merged.input);
  return {facts, reasons: [...merged.reasons, ...verdict.reasons], allowed: merged.reasons.length === 0 && verdict.allowed};
}

test('facts read from GitHub: a green PR after a successful deploy of the current main on the VPS runner may merge', async () => {
  const result = await gate({});
  assert.deepEqual(result.reasons, []);
  assert.equal(result.allowed, true);
  assert.equal(result.facts.ci, 'SUCCESS');
  assert.deepEqual(result.facts.last_main_deploy, {sha: MAIN, conclusion: 'success', run_id: 99, runner: {name: 'matchpilot-vps', labels: ['self-hosted', 'matchpilot-vps']}});
});

test('the deploy breaker: a failed, running, missing, stale or off-runner deploy of main stops every merge', async () => {
  const runs = `repos/${REPO}/actions/workflows/deploy-vps.yml/runs?branch=main&event=push&head_sha=${MAIN}&per_page=20`;
  const run = conclusion => ({workflow_runs: [{id: 99, head_sha: MAIN, path: '.github/workflows/deploy-vps.yml', event: 'push', head_branch: 'main', status: 'completed', conclusion, created_at: 'x'}]});
  const cases = [
    [{[runs]: run('failure')}, /merges are stopped/],
    [{[runs]: run('cancelled')}, /merges are stopped/],
    [{[runs]: {workflow_runs: [{...run('success').workflow_runs[0], status: 'in_progress', conclusion: null}]}}, /merges are stopped/],
    [{[runs]: {workflow_runs: []}}, /merges are stopped/],
    [{[runs]: {workflow_runs: [{...run('success').workflow_runs[0], head_sha: 'c'.repeat(40)}]}}, /merges are stopped/],
    [{[runs]: {workflow_runs: [{...run('success').workflow_runs[0], event: 'workflow_dispatch'}]}}, /merges are stopped/],
    [{[`repos/${REPO}/actions/runs/99/jobs`]: {jobs: [{name: 'deploy', runner_name: 'GitHub Actions 2', labels: ['ubuntu-latest']}]}}, /merges are stopped/],
    [{[runs]: new Error('HTTP 403')}, /GitHub facts unreadable: deploy runs/],
  ];
  for (const [override, expected] of cases) {
    const result = await gate(override);
    assert.equal(result.allowed, false, JSON.stringify(override).slice(0, 120));
    assert.match(result.reasons.join('\n'), expected);
  }
  assert.match((await gate({}, {certified: false})).reasons.join('\n'), /not certified/);
});

test('CI and the PR come from GitHub too; a declared value that disagrees, or an unreadable fact, blocks', async () => {
  const checks = `repos/${REPO}/commits/${HEAD}/check-runs?check_name=CI%20gate&per_page=100`;
  assert.match((await gate({[checks]: {check_runs: []}})).reasons.join(), /GitHub Actions are not green/);
  assert.match((await gate({[checks]: {check_runs: [{name: 'CI gate', app: {slug: 'github-actions'}, status: 'in_progress', conclusion: null, started_at: 'x'}]}})).reasons.join(), /not green/);
  assert.match((await gate({[checks]: {check_runs: [{name: 'CI gate', app: {slug: 'some-other-app'}, status: 'completed', conclusion: 'success', started_at: 'x'}]}})).reasons.join(), /not green/, 'only GitHub Actions counts');
  assert.match((await gate({[`repos/${REPO}/pulls/7`]: {state: 'closed', merged: true, head: {sha: HEAD}, base: {ref: 'main'}}})).reasons.join(), /merged|PR is/);
  assert.match((await gate({[`repos/${REPO}/pulls/7`]: {state: 'open', merged: false, head: {sha: HEAD}, base: {ref: 'release'}}})).reasons.join(), /not main/);
  assert.match((await gate({}, {input: {...declared(), head_sha: 'd'.repeat(40)}})).reasons.join(), /declared head_sha .* differs from GitHub/);
  assert.match((await gate({}, {input: {...declared(), ci: 'SUCCESS', last_main_deploy: {sha: MAIN, conclusion: 'success'}}})).reasons.join() || 'none', /none/, 'matching declared values are fine');
  assert.match((await gate({[`repos/${REPO}/pulls/7`]: new Error('timeout')})).reasons.join(), /GitHub facts unreadable: pull request/);
});

test('a gate fed by hand is never certified', () => {
  const manual = {...declared(), pr_state: 'open', head_sha: HEAD, base_sha: MAIN, ci: 'SUCCESS', deploy_path_certified: true, last_main_deploy: {sha: MAIN, conclusion: 'success'}};
  assert.match(evaluateMergeGate(manual).reasons.join(), /not read from GitHub/);
  assert.match(evaluateMergeGate({...manual, facts_source: 'github-incomplete'}).reasons.join(), /not read from GitHub/);
});

test('the deploy path is certified only by an IN_FORCE owner decision in the register of the base commit', () => {
  const dir = mkdtempSync(join(tmpdir(), 'deploy-cert-'));
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], {encoding: 'utf8', env: {...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t'}});
  git('init', '-q', '-b', 'main');
  mkdirSync(join(dir, 'docs/governance'), {recursive: true});
  const register = decisions => writeFileSync(join(dir, 'docs/governance/owner-decisions.json'), JSON.stringify({decisions}));
  register([{id: 'MP-OWNER-VPS-DEPLOY-01', status: 'IN_FORCE'}]);
  git('add', '-A'); git('commit', '-qm', 'base');
  assert.equal(deployPathCertified(dir, 'main'), false);
  git('checkout', '-qb', 'pr');
  register([{id: 'MP-OWNER-DEPLOY-PATH-CERTIFIED-01', status: 'IN_FORCE'}]);
  git('commit', '-qam', 'pr adds the decision');
  assert.equal(deployPathCertified(dir, 'main'), false, 'a PR cannot certify the path for itself: the base register decides');
  assert.equal(deployPathCertified(dir, 'pr'), true);
  register([{id: 'MP-OWNER-DEPLOY-PATH-CERTIFIED-01', status: 'SUPERSEDED'}]);
  git('commit', '-qam', 'superseded');
  assert.equal(deployPathCertified(dir, 'pr'), false);
  assert.equal(deployPathCertified(dir, 'no-such-ref'), false, 'unreadable means not certified');
});
