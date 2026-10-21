// VPS-DEPLOY-01 and MP-DEPLOY-APPROVAL-01/-02, MP-DEPLOY-GATE-FINAL-01: the private VPS runner (labels self-hosted,
// matchpilot-vps) runs only the approved deploy of main. The policy is scripts/workflow-policy.mjs: every workflow file
// is parsed as YAML (strictly, fail closed) and checked on its structure, never on lines or indentation:
//   - no reusable workflow, workflow_call, workflow_run or repository_dispatch;
//   - every job on one literal GitHub-hosted label, except job deploy of deploy-vps.yml on [self-hosted, matchpilot-vps];
//   - no other workflow names the VPS runner or mp-deploy;
//   - deploy-vps.yml is exactly the canonical workflow (push to main only, gate job, environment vps-production,
//     post-approval gate, unchanged mp-deploy call).
// A guard for changes made in this repository, not a security boundary: a fork pull request runs the workflows of its
// own head, test included, and the VPS refuses a deploy without the proof of approval only after phase B
// (docs/deploy-approval.md).
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import test from 'node:test';
import {parse} from 'yaml';
import {CANONICAL_DEPLOY, DEPLOY_FILE, GATE_IF, parseWorkflow, workflowPolicyProblems} from '../scripts/workflow-policy.mjs';

const DIR = new URL('../.github/workflows/', import.meta.url);
const files = readdirSync(DIR).filter(file => /\.ya?ml$/.test(file)).sort();
const read = file => readFileSync(new URL(file, DIR), 'utf8');
const entries = () => files.map(file => [file, read(file)]);
const withFile = (name, text) => [...entries().filter(([file]) => file !== name), [name, text]];
const problems = set => workflowPolicyProblems(set).join('\n');
const deploy = read(DEPLOY_FILE);
const ci = read('ci.yml');

test('workflows: the repository passes the structural policy, and deploy-vps.yml is the canonical workflow', () => {
  assert.ok(files.includes(DEPLOY_FILE) && files.includes('ci.yml'));
  assert.deepEqual(workflowPolicyProblems(entries()), []);
  assert.deepEqual(parse(deploy, {version: '1.2'}), CANONICAL_DEPLOY);
  // Ordinary GitHub-hosted CI is not blocked.
  assert.deepEqual(workflowPolicyProblems([['ci.yml', ci], [DEPLOY_FILE, deploy]]), []);
});

// ---- review 6313944252 (B-1) and 6314826174 (B-2): the attacks, exactly; RED on 2af874f, GREEN here ----
const sneakSteps = '      - run: sudo -n /usr/local/sbin/mp-deploy "${{ github.sha }}"\n';
const ATTACKS = [
  ['B-1 sneak.yml', 'sneak.yml', `name: sneak\non:\n  push:\n    branches: [main]\npermissions:\n  contents: read\njobs:\n  sneak:\n    if: ${GATE_IF}\n    runs-on: [self-hosted, matchpilot-vps]\n    steps:\n${sneakSteps}`],
  ['B-2 v1: jobs indented by four spaces', 'sneak.yml', `on:\n  push:\n    branches: [main]\njobs:\n    sneak:\n        runs-on: [self-hosted, matchpilot-vps]\n        steps:\n            - run: sudo -n /usr/local/sbin/mp-deploy x\n`],
  ['B-2 v2: quoted job name', 'sneak.yml', `on:\n  push:\n    branches: [main]\njobs:\n  "sneak":\n    runs-on: [self-hosted, matchpilot-vps]\n    steps:\n${sneakSteps}`],
  ['B-2 v3: flow mapping', 'sneak.yml', `on:\n  push:\n    branches: [main]\njobs: {sneak: {runs-on: [self-hosted, matchpilot-vps], steps: [{run: "sudo -n /usr/local/sbin/mp-deploy x"}]}}\n`],
  ['B-2 v7: pull_request calling an external reusable workflow, four-space job, .yaml', 'evil.yaml', `on: [pull_request]\njobs:\n    evil:\n        uses: attacker/x/.github/workflows/w.yml@main\n`],
];

test('B-1/B-2 attacks: each is valid YAML that reaches the VPS or a reusable workflow, and each is refused by structure', () => {
  for (const [what, name, text] of ATTACKS) {
    // A true positive, not a parse failure: the strict parser reads the file without problems.
    assert.deepEqual(parseWorkflow(text).problems, [], `${what}: parses cleanly`);
    const value = parse(text, {version: '1.2'});
    const job = Object.values(value.jobs)[0];
    assert.ok(JSON.stringify(job['runs-on']) === '["self-hosted","matchpilot-vps"]' || /^attacker\//.test(job.uses), `${what}: structurally a VPS job or a reusable call`);
    const found = problems(withFile(name, text));
    assert.match(found, job.uses ? /calls the reusable workflow attacker\/x/ : /runs-on \["self-hosted","matchpilot-vps"\] is not allowed/, what);
  }
});

test('equivalent valid YAML forms that reach the VPS are refused too', () => {
  const vpsJob = runsOn => `on:\n  push:\n    branches: [main]\njobs:\n  x:\n    runs-on: ${runsOn}\n    steps:\n      - run: id\n`;
  const cases = [
    ['quoted labels', vpsJob('["self-hosted", "matchpilot-vps"]'), /runs-on .* is not allowed/],
    ['block sequence', `on: push\njobs:\n  x:\n    runs-on:\n      - self-hosted\n      - matchpilot-vps\n    steps:\n      - run: id\n`, /runs-on .* is not allowed/],
    ['a runner group mapping', vpsJob('{group: vps, labels: [matchpilot-vps]}'), /runs-on .* is not allowed/],
    ['a bare self-hosted label', vpsJob('self-hosted'), /runs-on "self-hosted" is not allowed/],
    ['a list of one hosted label', vpsJob('[ubuntu-latest]'), /runs-on \["ubuntu-latest"\] is not allowed/],
    ['a runner from an expression', vpsJob('${{ vars.RUNNER }}'), /runs-on "\$\{\{ vars\.RUNNER \}\}" is not allowed/],
    ['a quoted "on" and quoted keys', `"on": {"push": {"branches": ["main"]}}\n"jobs": {"x": {"runs-on": ["self-hosted", "matchpilot-vps"], "steps": [{"run": "id"}]}}\n`, /runs-on .* is not allowed/],
    ['a job without runs-on', `on: push\njobs:\n  x:\n    steps:\n      - run: id\n`, /runs-on null is not allowed/],
    ['a reusable workflow of this repository', `on: push\njobs:\n  x:\n    uses: ./.github/workflows/deploy-vps.yml\n`, /calls the reusable workflow \.\/\.github\/workflows\/deploy-vps\.yml/],
    ['workflow_call', `on:\n  workflow_call:\njobs:\n  x:\n    runs-on: ubuntu-latest\n    steps:\n      - run: id\n`, /triggered by workflow_call/],
    ['workflow_run', `on:\n  workflow_run:\n    workflows: [CI]\njobs:\n  x:\n    runs-on: ubuntu-latest\n    steps:\n      - run: id\n`, /triggered by workflow_run/],
    ['repository_dispatch', `on: [repository_dispatch]\njobs:\n  x:\n    runs-on: ubuntu-latest\n    steps:\n      - run: id\n`, /triggered by repository_dispatch/],
    ['mp-deploy from a GitHub-hosted job', `on: push\njobs:\n  x:\n    runs-on: ubuntu-latest\n    steps:\n      - run: ssh vps sudo /usr/local/sbin/mp-deploy x\n`, /names the VPS runner or mp-deploy/],
    ['the VPS label in an env value', `on: push\nenv:\n  R: matchpilot-vps\njobs:\n  x:\n    runs-on: ubuntu-latest\n    steps:\n      - run: id\n`, /names the VPS runner or mp-deploy/],
    // Escapes hide the name from the text but not from the parsed value (mutation P10).
    ['the VPS label written with an escape', `on: push\nenv:\n  R: "matchpilot\\x2dvps"\njobs:\n  x:\n    runs-on: ubuntu-latest\n    steps:\n      - run: id\n`, /names the VPS runner or mp-deploy \(matchpilot-vps\)/],
    ['mp-deploy written with a unicode escape', `on: push\njobs:\n  x:\n    runs-on: ubuntu-latest\n    steps:\n      - run: "sudo /usr/local/sbin/mp\\u002ddeploy x"\n`, /names the VPS runner or mp-deploy \(sudo \/usr\/local\/sbin\/mp-deploy x\)/],
    ['the VPS runner in a comment only', `# runs-on: [self-hosted, matchpilot-vps]\non: push\njobs:\n  x:\n    runs-on: ubuntu-latest\n    steps:\n      - run: id\n`, /its text names the VPS runner or mp-deploy/],
    ['a copy of the deploy workflow under another name', deploy, /runs-on \["self-hosted","matchpilot-vps"\] is not allowed/],
  ];
  for (const [what, text, expected] of cases) assert.match(problems(withFile('x.yml', text)), expected, what);
});

test('YAML that cannot be read exactly is refused: duplicates, anchors, aliases, merge keys, tags, several documents, errors', () => {
  const cases = [
    ['a duplicate runs-on', `on: push\njobs:\n  x:\n    runs-on: ubuntu-latest\n    runs-on: [self-hosted, matchpilot-vps]\n    steps:\n      - run: id\n`, /YAML_ERROR: DUPLICATE_KEY/],
    ['a duplicate job', `on: push\njobs:\n  x:\n    runs-on: ubuntu-latest\n    steps: [{run: id}]\n  x:\n    runs-on: ubuntu-latest\n    steps: [{run: id}]\n`, /YAML_ERROR: DUPLICATE_KEY/],
    ['an anchor and an alias', `on: push\nx: &r [self-hosted, matchpilot-vps]\njobs:\n  x:\n    runs-on: *r\n    steps:\n      - run: id\n`, /YAML_ALIAS|YAML_ANCHOR/],
    ['a merge key', `on: push\nbase: {runs-on: ubuntu-latest}\njobs:\n  x:\n    <<: {runs-on: ubuntu-latest}\n    steps:\n      - run: id\n`, /YAML_MERGE_KEY/],
    ['an explicit tag', `on: push\njobs:\n  x:\n    runs-on: !!str ubuntu-latest\n    steps:\n      - run: id\n`, /YAML_TAG/],
    ['a custom tag', `on: push\njobs:\n  x:\n    runs-on: !vps ubuntu-latest\n    steps:\n      - run: id\n`, /YAML_TAG/],
    ['two documents', `on: push\njobs:\n  x:\n    runs-on: ubuntu-latest\n    steps: [{run: id}]\n---\njobs: {}\n`, /YAML_DOCUMENTS: 2/],
    ['a syntax error', `on: push\njobs:\n  x: [unclosed\n`, /YAML_ERROR/],
    ['a tab indentation', `on: push\njobs:\n\tx:\n\t\truns-on: ubuntu-latest\n`, /YAML_ERROR/],
    ['a boolean key', `on: push\njobs:\n  true:\n    runs-on: ubuntu-latest\n    steps: [{run: id}]\n`, /YAML_KEY_TYPE/],
    ['no jobs', `on: push\n`, /no readable jobs/],
    ['an empty jobs mapping', `on: push\njobs: {}\n`, /no readable jobs/],
    ['a list instead of a workflow', `- on: push\n`, /not a mapping/],
    ['an unreadable trigger', `on: 1\njobs:\n  x:\n    runs-on: ubuntu-latest\n    steps: [{run: id}]\n`, /unreadable trigger/],
  ];
  for (const [what, text, expected] of cases) assert.match(problems(withFile('x.yml', text)), expected, what);
});

// ---- review NB-5: any change to the approved structure of deploy-vps.yml is refused, by name ----
test('deploy-vps.yml: skipping, reordering, removing or rewriting any part of the approval is refused', () => {
  const step0 = "      - name: Gate dopo l'approvazione\n";
  const cases = [
    ['if: false on the post-approval gate (NB-5)', deploy.replace(step0, `${step0}        if: false\n`), /deploy: step 1 has if/],
    ['an equivalent always-false condition', deploy.replace(step0, `${step0}        if: \${{ github.event_name == 'never' }}\n`), /deploy: step 1 has if/],
    ['if on the mp-deploy step', deploy.replace('      - name: mp-deploy\n', '      - name: mp-deploy\n        if: always()\n'), /deploy: step 2 has if/],
    ['continue-on-error on the post-approval gate', deploy.replace(step0, `${step0}        continue-on-error: true\n`), /deploy: step 1 has continue-on-error/],
    ['another shell for the post-approval gate', deploy.replace(step0, `${step0}        shell: sh\n`), /deploy: step 1 has shell/],
    ['the post-approval gate removed', deploy.replace(/      # Dopo l'approvazione[\s\S]*?(?=      # Nessun checkout)/, ''), /steps are not exactly the post-approval gate then mp-deploy/],
    ['the steps reordered', deploy.replace(/(      # Dopo l'approvazione[\s\S]*?)(      # Nessun checkout[\s\S]*)$/, '$2$1'), /steps are not exactly the post-approval gate then mp-deploy/],
    ['the PASS check of the post-approval gate removed', deploy.replace(`          grep -q '"result": "PASS"' "$RUNNER_TEMP/deploy-gate.json" || { echo "DEPLOY_GATE_FAIL"; exit 1; }\n          echo "DEPLOY_GATE_SHA_OK`, '          echo "DEPLOY_GATE_SHA_OK'), /the post-approval gate changed/],
    ['the gate script downloaded from main', deploy.replace('MatchPilot/$DEPLOY_SHA/scripts', 'MatchPilot/main/scripts'), /the post-approval gate changed/],
    ['DEPLOY_SHA changed', deploy.replace('DEPLOY_SHA: ${{ github.sha }}', 'DEPLOY_SHA: main'), /the post-approval gate changed/],
    ['the mp-deploy call changed', deploy.replace('sudo -n /usr/local/sbin/mp-deploy "${{ github.sha }}"', 'sudo -n /usr/local/sbin/mp-deploy "$(cat /tmp/sha)"'), /the mp-deploy call changed/],
    ['needs removed', deploy.replace('    needs: gate\n', ''), /does not need exactly the gate job/],
    ['needs widened', deploy.replace('    needs: gate\n', '    needs: [gate, other]\n'), /does not need exactly the gate job/],
    ['the deploy job condition made always()', deploy.replace(/(  deploy:\n    needs: gate\n    if: )/, '$1always() && '), /deploy: condition changed/],
    ['the environment removed', deploy.replace('    environment: vps-production\n', ''), /environment is not exactly vps-production/],
    ['another environment', deploy.replace('environment: vps-production', 'environment: production'), /environment is not exactly vps-production/],
    ['an environment from an expression', deploy.replace('environment: vps-production', 'environment: ${{ inputs.env }}'), /environment is not exactly vps-production/],
    ['the environment as a mapping', deploy.replace('environment: vps-production', 'environment: {name: vps-production, url: "https://x"}'), /environment is not exactly vps-production/],
    ['id-token permission added', deploy.replace(/(  deploy:[\s\S]*?permissions:\n)/, '$1      id-token: write\n'), /deploy: permissions changed/],
    ['a write permission on the deploy job', deploy.replace(/(  deploy:[\s\S]*?permissions:\n      contents: )read/, '$1write'), /deploy: permissions changed/],
    ['job-level env on deploy', deploy.replace('    timeout-minutes: 30\n', '    timeout-minutes: 30\n    env:\n      X: y\n'), /deploy: job-level env is not accepted/],
    ['a matrix on deploy', deploy.replace('    timeout-minutes: 30\n', '    timeout-minutes: 30\n    strategy:\n      matrix: {a: [1, 2]}\n'), /deploy: job-level strategy is not accepted/],
    ['a container on deploy', deploy.replace('    timeout-minutes: 30\n', '    timeout-minutes: 30\n    container: node:22\n'), /deploy: job-level container is not accepted/],
    ['workflow-level defaults', deploy.replace('permissions:\n  contents: read\nconcurrency:', 'permissions:\n  contents: read\ndefaults:\n  run:\n    shell: sh\nconcurrency:'), /workflow-level env or defaults/],
    ['a manual dispatch trigger', deploy.replace('on:\n  push:', 'on:\n  workflow_dispatch:\n  push:'), /trigger is not exactly a push to main/],
    ['a pull_request trigger', deploy.replace('on:\n  push:', 'on:\n  pull_request:\n  push:'), /trigger is not exactly a push to main/],
    ['pull_request_target', deploy.replace('on:\n  push:', 'on:\n  pull_request_target:\n  push:'), /trigger is not exactly a push to main/],
    ['another branch', deploy.replace('branches: [main]', 'branches: [main, dev]'), /trigger is not exactly a push to main/],
    ['a tag filter', deploy.replace('branches: [main]', 'branches: [main]\n    tags: [v*]'), /trigger is not exactly a push to main/],
    ['the checkout unpinned', deploy.replace('actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683', 'actions/checkout@v4'), /gate: checkout changed/],
    ['the checkout persisting credentials', deploy.replace('persist-credentials: false', 'persist-credentials: true'), /gate: checkout changed/],
    ['the gate check not requiring PASS', deploy.replace(/(  gate:[\s\S]*?)grep -q '"result": "PASS"' "\$RUNNER_TEMP\/deploy-gate\.json" \|\| \{ echo "DEPLOY_GATE_FAIL"; exit 1; \}/, '$1true'), /gate: the check step changed/],
    ['the gate job on the VPS', deploy.replace('    runs-on: ubuntu-latest\n    timeout-minutes: 5', '    runs-on: [self-hosted, matchpilot-vps]\n    timeout-minutes: 5'), /gate: not on ubuntu-latest|job gate: runs-on/],
    ['the gate job given an environment', deploy.replace('    runs-on: ubuntu-latest\n', '    runs-on: ubuntu-latest\n    environment: vps-production\n'), /gate: names an environment/],
    ['a third job', `${deploy}  again:\n    needs: gate\n    if: ${GATE_IF}\n    runs-on: ubuntu-latest\n    steps:\n      - run: id\n`, /jobs are not exactly gate and deploy/],
    ['the deploy job on another runner', deploy.replace('runs-on: [self-hosted, matchpilot-vps]', 'runs-on: [self-hosted, matchpilot-vps, extra]'), /deploy: not on \[self-hosted, matchpilot-vps\]/],
    // Changes no named invariant covers, caught by the exact canonical structure (mutation P14).
    ['the deploy timeout changed', deploy.replace('    timeout-minutes: 30\n', '    timeout-minutes: 300\n'), /differs from the canonical workflow/],
    ['the workflow renamed', deploy.replace('name: deploy-vps\n', 'name: deploy\n'), /differs from the canonical workflow/],
    ['concurrency cancelling runs', deploy.replace('cancel-in-progress: false', 'cancel-in-progress: true'), /concurrency changed/],
    ['the deploy workflow removed', null, /deploy-vps\.yml is missing/],
  ];
  for (const [what, text, expected] of cases) {
    if (text !== null) assert.notEqual(text, deploy, `${what}: the tampering applies`);
    const set = text === null ? entries().filter(([file]) => file !== DEPLOY_FILE) : withFile(DEPLOY_FILE, text);
    assert.match(problems(set), expected, what);
  }
});

test('CI: the VPS runner, an expression, a reusable workflow or a self-hosted label in ci.yml is refused', () => {
  const cases = [
    ['the VPS runner in CI', ci.replace('runs-on: ubuntu-latest', 'runs-on: [self-hosted, matchpilot-vps]'), /ci\.yml: job .*runs-on .* is not allowed/],
    ['a runner from an expression in CI', ci.replace('runs-on: ubuntu-latest', 'runs-on: ${{ inputs.runner }}'), /ci\.yml: job .*runs-on .* is not allowed/],
    ['a reusable workflow called from CI', ci.replace('jobs:\n', 'jobs:\n  evil:\n    uses: attacker/x/.github/workflows/w.yml@main\n'), /ci\.yml: job evil: calls the reusable workflow attacker/],
    ['a self-hosted runner without the label in CI', ci.replace('runs-on: ubuntu-latest', 'runs-on: self-hosted'), /ci\.yml: job .*runs-on "self-hosted" is not allowed/],
  ];
  for (const [what, text, expected] of cases) {
    assert.notEqual(text, ci, `${what}: the tampering applies`);
    assert.match(problems(withFile('ci.yml', text)), expected, what);
  }
});
