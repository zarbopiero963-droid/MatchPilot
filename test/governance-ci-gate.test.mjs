// CI gate (the required check on main): the script in .github/workflows/ci.yml, run as CI runs it, fails whenever a
// selected check did not pass, reports every blocking check, and blocks a web change without a successful Browser QA
// (MP-OWNER-BROWSER-QA-HARD-GATE-01) even when everything else is green.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
const block = /- name: Enforce selected checks\n\s+shell: bash\n\s+run: \|\n((?: {10}.*\n|\n)+)/.exec(workflow);
assert.ok(block, 'CI gate script found in ci.yml');
const script = block[1].split('\n').map(line => line.slice(10)).join('\n');

const green = {MODE: 'full', CLASSIFY_RESULT: 'success', FAST_RESULT: 'success', UI_RESULT: 'skipped', FULL_RESULT: 'success', WEB: 'true', BROWSER_QA_RESULT: 'success'};
const gate = env => spawnSync('bash', ['-c', script], {env: {PATH: process.env.PATH, ...green, ...env}, encoding: 'utf8'});

test('the CI gate passes only when every selected check passed', () => {
  assert.equal(gate({}).status, 0);
  assert.equal(gate({MODE: 'docs', FULL_RESULT: 'skipped', WEB: 'false', BROWSER_QA_RESULT: 'skipped'}).status, 0);
  assert.equal(gate({MODE: 'ui', UI_RESULT: 'success', FULL_RESULT: 'skipped', WEB: 'false', BROWSER_QA_RESULT: 'skipped'}).status, 0);
});

test('a failed, cancelled or skipped Browser QA on a web change fails the CI gate on its own, and the log names it', () => {
  for (const result of ['failure', 'cancelled', 'skipped', '']) {
    const run = gate({BROWSER_QA_RESULT: result});
    assert.equal(run.status, 1, `Browser QA ${result || 'missing'}`);
    assert.match(run.stderr, /FAIL browser_qa/);
    assert.doesNotMatch(run.stderr, /FAIL (classify|fast|ui|full)/);
  }
  // A non-web change that still ran Browser QA is not what the classifier selected: refused.
  assert.equal(gate({WEB: 'false', BROWSER_QA_RESULT: 'success'}).status, 1);
});

test('every blocking check is reported, not only the first', () => {
  const run = gate({FAST_RESULT: 'failure', FULL_RESULT: 'failure', BROWSER_QA_RESULT: 'failure'});
  assert.equal(run.status, 1);
  for (const name of ['fast', 'full', 'browser_qa']) assert.match(run.stderr, new RegExp(`FAIL ${name}`));
});

test('an unknown classification fails closed', () => {
  assert.equal(gate({MODE: 'weird'}).status, 1);
  assert.equal(gate({WEB: ''}).status, 1);
  assert.equal(gate({CLASSIFY_RESULT: 'cancelled'}).status, 1);
});
