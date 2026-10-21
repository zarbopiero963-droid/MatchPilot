// MP-DEPLOY-GATE-FINAL-01: the structural policy for every GitHub Actions workflow of the repository (review B-2:
// the earlier line and indentation rules were bypassed by valid YAML: 4-space jobs, quoted job names, flow mappings, a
// reusable workflow called at another indentation). Each file is parsed as YAML 1.2 by the `yaml` package, strictly:
// a parse error or warning, a duplicate key, more than one document, an anchor, an alias, a merge key or an explicit
// tag makes the file a problem (fail closed: what this check cannot read exactly is refused). On the parsed structure:
//   - no workflow is started by workflow_call, workflow_run or repository_dispatch, and no job calls a reusable
//     workflow (job-level `uses`): the indirect ways to start jobs this check cannot see;
//   - every job of every workflow runs on one literal GitHub-hosted label (a string such as ubuntu-latest: no list,
//     group, expression or self-hosted label), except the job `deploy` of deploy-vps.yml, on [self-hosted, matchpilot-vps];
//   - outside deploy-vps.yml, no key or value of any workflow, and no line of its text (comments included), names the
//     VPS runner or mp-deploy;
//   - deploy-vps.yml is exactly the canonical workflow below, and its invariants are also checked one by one so that a
//     change is reported by name: a step that can be skipped (`if: false`), reordered, removed or rewritten, another
//     `needs`, environment, permission, checkout, SHA or mp-deploy call, are all refused.
// Changing the deploy workflow therefore needs this file changed in the same PR: both are owner-GO files.
// A static check does not protect the VPS by itself: see docs/deploy-approval.md (VPS-side proof, phase B).
import {lstatSync, readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {isScalar, parseAllDocuments, visit} from 'yaml';

export const DEPLOY_FILE = 'deploy-vps.yml';
export const DEPLOY_JOB = 'deploy';
export const VPS_RUNS_ON = Object.freeze(['self-hosted', 'matchpilot-vps']);
// The GitHub-hosted labels a job may use, exactly (review NB-10: a pattern such as ubuntu-* would also match a custom
// self-hosted label of that form). A new hosted image needs this list changed: an owner-GO file.
export const HOSTED_LABELS = Object.freeze(['ubuntu-latest', 'ubuntu-24.04', 'ubuntu-22.04', 'ubuntu-24.04-arm', 'ubuntu-22.04-arm',
  'windows-latest', 'windows-2025', 'windows-2022', 'macos-latest', 'macos-15', 'macos-14', 'macos-13']);
// Workflow files GitHub runs are the .yml/.yaml files directly in .github/workflows; this check reads exactly those and
// refuses anything else there (review B-3: a `sneak.YML` was not even read).
export const WORKFLOW_NAME = /^[a-z0-9][a-z0-9._-]*\.ya?ml$/;
// Characters a workflow may not contain (see parseWorkflow): controls but tab/LF and CR in CRLF, format, line and
// paragraph separators, spaces but U+0020, private use, surrogates, unassigned.
export const UNSAFE_CHARACTER = /(?![\t\n\r])[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Co}\p{Cs}\p{Cn}]|\r(?!\n)|(?! )\p{Zs}/u;
// Reserved names (review NB-15: the environment too, so no other job can ask for its approval or its OIDC audience).
export const PRIVATE = /self-hosted|matchpilot-vps|mp-deploy|vps-production/i;
export const INDIRECT_EVENTS = Object.freeze(['workflow_call', 'workflow_run', 'repository_dispatch']);
// Events a workflow may use, exactly as written (review NB-9: an allow-list, so `Workflow_Run` or an unknown event is
// refused rather than guessed). pull_request_target is not here: it runs fork code with this repository's rights.
export const ALLOWED_EVENTS = Object.freeze(['push', 'pull_request', 'schedule', 'workflow_dispatch', 'merge_group']);
export const GATE_IF = "github.repository == 'zarbopiero963-droid/MatchPilot' && github.ref == 'refs/heads/main'";

// The only accepted deploy-vps.yml, as parsed.
export const CANONICAL_DEPLOY = Object.freeze({
  "name": "deploy-vps",
  "on": {
    "push": {
      "branches": [
        "main"
      ]
    }
  },
  "permissions": {
    "contents": "read"
  },
  "concurrency": {
    "group": "deploy-vps",
    "cancel-in-progress": false
  },
  "jobs": {
    "gate": {
      "name": "Deploy gate",
      "if": "github.repository == 'zarbopiero963-droid/MatchPilot' && github.ref == 'refs/heads/main'",
      "runs-on": "ubuntu-latest",
      "timeout-minutes": 5,
      "permissions": {
        "contents": "read",
        "actions": "read",
        "deployments": "read"
      },
      "steps": [
        {
          "uses": "actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683",
          "with": {
            "persist-credentials": false
          }
        },
        {
          "name": "Environment vps-production protetto e SHA ancora su main",
          "env": {
            "GH_TOKEN": "${{ github.token }}"
          },
          "run": "set -euo pipefail\nnode scripts/deploy-gate.mjs > \"$RUNNER_TEMP/deploy-gate.json\" || { cat \"$RUNNER_TEMP/deploy-gate.json\"; echo \"DEPLOY_GATE_FAIL\"; exit 1; }\ncat \"$RUNNER_TEMP/deploy-gate.json\"\ngrep -q '\"result\": \"PASS\"' \"$RUNNER_TEMP/deploy-gate.json\" || { echo \"DEPLOY_GATE_FAIL\"; exit 1; }\n"
        }
      ]
    },
    "deploy": {
      "needs": "gate",
      "if": "github.repository == 'zarbopiero963-droid/MatchPilot' && github.ref == 'refs/heads/main'",
      "runs-on": [
        "self-hosted",
        "matchpilot-vps"
      ],
      "environment": "vps-production",
      "timeout-minutes": 30,
      "permissions": {
        "contents": "read",
        "actions": "read",
        "deployments": "read",
        "id-token": "write"
      },
      "steps": [
        {
          "name": "Gate dopo l'approvazione",
          "env": {
            "GH_TOKEN": "${{ github.token }}",
            "DEPLOY_SHA": "${{ github.sha }}"
          },
          "run": "set -euo pipefail\nfor tool in node curl grep cat; do command -v \"$tool\" >/dev/null || { echo \"DEPLOY_GATE_MISSING_TOOL: $tool\"; exit 1; }; done\ngate=\"$RUNNER_TEMP/deploy-gate-$DEPLOY_SHA.mjs\"\ncurl --fail --silent --show-error --proto '=https' --max-time 60 -o \"$gate\" \"https://raw.githubusercontent.com/zarbopiero963-droid/MatchPilot/$DEPLOY_SHA/scripts/deploy-gate.mjs\" || { echo \"DEPLOY_GATE_SCRIPT_UNREADABLE\"; exit 1; }\nnode \"$gate\" > \"$RUNNER_TEMP/deploy-gate.json\" || { cat \"$RUNNER_TEMP/deploy-gate.json\"; echo \"DEPLOY_GATE_FAIL\"; exit 1; }\ncat \"$RUNNER_TEMP/deploy-gate.json\"\ngrep -q '\"result\": \"PASS\"' \"$RUNNER_TEMP/deploy-gate.json\" || { echo \"DEPLOY_GATE_FAIL\"; exit 1; }\necho \"DEPLOY_GATE_SHA_OK $DEPLOY_SHA\"\n"
        },
        {
          "name": "mp-deploy",
          "env": {
            "GH_TOKEN": "${{ github.token }}",
            "DEPLOY_SHA": "${{ github.sha }}"
          },
          "run": "set -uo pipefail\n# The request token goes to curl through a header file, never on a command line (visible in ps). The file is\n# created exclusively (noclobber, mode 0600) in a private directory made for this step (mktemp -d: 0700,\n# unique), removed on exit, error or signal; without a safe file the deploy stops. umask stays in the\n# subshell: mp-deploy keeps its own.\ndir=$(mktemp -d \"$RUNNER_TEMP/oidc.XXXXXXXX\") || { echo \"DEPLOY_OIDC_UNAVAILABLE: no private directory\"; exit 1; }\ntrap 'rm -rf \"$dir\"' EXIT\ntrap 'exit 1' INT TERM HUP\nhdr=\"$dir/request-header\"\n(umask 077 && set -C && printf 'Authorization: bearer %s\\n' \"$ACTIONS_ID_TOKEN_REQUEST_TOKEN\" > \"$hdr\") || { echo \"DEPLOY_OIDC_UNAVAILABLE: header file\"; exit 1; }\ngate=\"$RUNNER_TEMP/deploy-gate-$DEPLOY_SHA.mjs\"\nfor i in 1 2 3 4 5 6 7 8 9 10; do\n  if [ \"$i\" -gt 1 ]; then\n    node \"$gate\" > \"$RUNNER_TEMP/deploy-gate.json\" || { cat \"$RUNNER_TEMP/deploy-gate.json\"; echo \"DEPLOY_GATE_FAIL\"; exit 1; }\n    grep -q '\"result\": \"PASS\"' \"$RUNNER_TEMP/deploy-gate.json\" || { echo \"DEPLOY_GATE_FAIL\"; exit 1; }\n  fi\n  token=$(curl --fail --silent --show-error --proto '=https' --max-time 30 -H @\"$hdr\" \"$ACTIONS_ID_TOKEN_REQUEST_URL&audience=matchpilot-vps-deploy\" | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{let v;try{v=JSON.parse(s).value}catch{}if(typeof v!==\"string\"||!v)process.exit(1);process.stdout.write(v)})') || { echo \"DEPLOY_OIDC_UNAVAILABLE\"; exit 1; }\n  printf '%s' \"$token\" | sudo -n /usr/local/sbin/mp-deploy \"$DEPLOY_SHA\" && exit 0\n  rc=$?; [ \"$rc\" -eq 75 ] || exit \"$rc\"\n  echo \"deploy in corso, attendo 60s\"; sleep 60\ndone\nexit 75\n"
        }
      ]
    }
  }
});

const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);

// Parses one workflow file strictly. Returns {value, problems}.
export function parseWorkflow(text) {
  const problems = [];
  // Reviews NB-14, B-4 and B-5: one character policy, by Unicode category, so that no parser can see a line break, a
  // space or a structure that another parser does not. Refused: every control character except tab, LF and a CR that
  // ends a CRLF (C0, DEL and C1, NEL U+0085 included; a lone CR is a line break for YAML 1.1/1.2 parsers, not for
  // `yaml`), format characters (byte-order mark, zero-width and bidirectional controls), line and
  // paragraph separators (U+2028, U+2029), every space other than U+0020, private-use, surrogate and unassigned code
  // points. Ordinary letters, accented ones included, and punctuation such as an em dash are accepted.
  const refused = UNSAFE_CHARACTER.exec(String(text));
  if (refused) return {value: null, problems: [`ENCODING: character U+${refused[0].codePointAt(0).toString(16).toUpperCase().padStart(4, '0')} is not accepted`]};
  let documents;
  try {
    documents = parseAllDocuments(String(text), {version: '1.2', uniqueKeys: true, strict: true, merge: false, prettyErrors: false});
  } catch (error) {
    return {value: null, problems: [`YAML_ERROR: ${String(error?.message ?? error).split('\n')[0]}`]};
  }
  if (!Array.isArray(documents) || documents.length !== 1) return {value: null, problems: [`YAML_DOCUMENTS: ${Array.isArray(documents) ? documents.length : 'unreadable'}`]};
  const [document] = documents;
  for (const error of document.errors) problems.push(`YAML_ERROR: ${error.code} ${error.message.split('\n')[0]}`);
  for (const warning of document.warnings) problems.push(`YAML_WARNING: ${warning.code} ${warning.message.split('\n')[0]}`);
  // Explicit tags (`!!str`, `!custom`) are the only nodes that carry a tag after parsing: refused.
  const nodeProblems = node => {
    if (node.anchor) problems.push(`YAML_ANCHOR: &${node.anchor}`);
    if (node.tag) problems.push(`YAML_TAG: ${node.tag}`);
  };
  visit(document, {
    Alias() { problems.push('YAML_ALIAS: aliases are not accepted'); },
    Node(_, node) { nodeProblems(node); },
    // A Map visitor replaces Node for mappings in this API, so it repeats the node checks.
    Map(_, map) {
      nodeProblems(map);
      // Keys that differ only by case (`RUNS-ON` beside `runs-on`): which one GitHub reads is not something to guess.
      const seen = new Map();
      for (const pair of map.items) {
        if (!isScalar(pair.key) || typeof pair.key.value !== 'string') continue;
        const folded = pair.key.value.toLowerCase();
        if (seen.has(folded) && seen.get(folded) !== pair.key.value) problems.push(`YAML_CASE_KEYS: ${seen.get(folded)} and ${pair.key.value}`);
        seen.set(folded, pair.key.value);
      }
    },
    Pair(_, pair) {
      if (!isScalar(pair.key)) problems.push('YAML_COMPLEX_KEY: a key that is not a scalar');
      else if (pair.key.value === '<<') problems.push('YAML_MERGE_KEY: << is not accepted');
      else if (typeof pair.key.value !== 'string') problems.push(`YAML_KEY_TYPE: ${JSON.stringify(pair.key.value)} is not a string key`);
    },
  });
  if (problems.length) return {value: null, problems};
  let value;
  try { value = document.toJS({maxAliasCount: 0}); } catch (error) { return {value: null, problems: [`YAML_ERROR: ${String(error?.message ?? error).split('\n')[0]}`]}; }
  return {value, problems};
}

// The events of `on` in its three forms; anything else is unreadable.
export function events(on) {
  if (typeof on === 'string') return [on];
  if (Array.isArray(on) && on.every(item => typeof item === 'string')) return on;
  if (plain(on)) return Object.keys(on);
  return null;
}

// Every key and scalar value of a parsed structure, as strings.
function scalars(value, out = []) {
  if (Array.isArray(value)) for (const item of value) scalars(item, out);
  else if (plain(value)) for (const [key, item] of Object.entries(value)) { out.push(key); scalars(item, out); }
  else if (value !== null && value !== undefined) out.push(String(value));
  return out;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// The deploy workflow's invariants, one message each; then the exact canonical structure.
export function deployProblems(workflow) {
  const p = [];
  const at = (what, ok) => { if (!ok) p.push(`${DEPLOY_FILE}: ${what}`); };
  const c = CANONICAL_DEPLOY;
  at('trigger is not exactly a push to main', same(workflow.on, c.on));
  at('workflow permissions are not exactly contents: read', same(workflow.permissions, c.permissions));
  at('workflow-level env or defaults are not accepted', workflow.env === undefined && workflow.defaults === undefined);
  at('concurrency changed', same(workflow.concurrency, c.concurrency));
  const jobs = plain(workflow.jobs) ? workflow.jobs : {};
  at('jobs are not exactly gate and deploy', same(Object.keys(jobs), Object.keys(c.jobs)));
  const gate = plain(jobs.gate) ? jobs.gate : {};
  const deploy = plain(jobs.deploy) ? jobs.deploy : {};
  at('gate: not on ubuntu-latest', gate['runs-on'] === 'ubuntu-latest');
  at('gate: condition changed', gate.if === GATE_IF);
  at('gate: names an environment', gate.environment === undefined);
  at('gate: permissions changed', same(gate.permissions, c.jobs.gate.permissions));
  at('gate: checkout changed (pinned SHA, no persisted credentials)', same(gate.steps?.[0], c.jobs.gate.steps[0]));
  at('gate: the check step changed (scripts/deploy-gate.mjs with an explicit PASS)', same(gate.steps?.[1], c.jobs.gate.steps[1]));
  at('gate: steps added or removed', Array.isArray(gate.steps) && gate.steps.length === c.jobs.gate.steps.length);
  at('deploy: does not need exactly the gate job', deploy.needs === 'gate');
  at('deploy: condition changed', deploy.if === GATE_IF);
  at('deploy: not on [self-hosted, matchpilot-vps]', same(deploy['runs-on'], VPS_RUNS_ON));
  at('deploy: environment is not exactly vps-production', deploy.environment === 'vps-production');
  at('deploy: permissions changed', same(deploy.permissions, c.jobs.deploy.permissions));
  for (const key of ['env', 'defaults', 'container', 'services', 'strategy', 'continue-on-error', 'outputs', 'uses']) at(`deploy: job-level ${key} is not accepted`, deploy[key] === undefined);
  const steps = Array.isArray(deploy.steps) ? deploy.steps : [];
  at('deploy: steps are not exactly the post-approval gate then mp-deploy', steps.length === 2 && steps[0]?.name === "Gate dopo l'approvazione" && steps[1]?.name === 'mp-deploy');
  steps.forEach((step, i) => {
    for (const key of ['if', 'continue-on-error', 'shell', 'working-directory', 'uses', 'timeout-minutes']) at(`deploy: step ${i + 1} has ${key}`, !plain(step) || step[key] === undefined);
  });
  at('deploy: the post-approval gate changed (env, download from the approved SHA, explicit PASS)', same(steps[0], c.jobs.deploy.steps[0]));
  at('deploy: the mp-deploy call changed', same(steps[1], c.jobs.deploy.steps[1]));
  at('differs from the canonical workflow', same(workflow, c));
  return p;
}

// entries: [[file name, text]] of every file in .github/workflows (top level, .yml/.yaml: what GitHub runs).
export function workflowPolicyProblems(entries) {
  const problems = [];
  if (!entries.some(([name]) => name === DEPLOY_FILE)) problems.push(`${DEPLOY_FILE} is missing`);
  for (const [name, text] of entries) {
    const {value, problems: parse} = parseWorkflow(text);
    problems.push(...parse.map(problem => `${name}: ${problem}`));
    if (!value) continue;
    if (!plain(value)) { problems.push(`${name}: not a mapping`); continue; }
    const list = events(value.on);
    if (!list) problems.push(`${name}: unreadable trigger`);
    else for (const event of list) {
      if (INDIRECT_EVENTS.includes(event)) problems.push(`${name}: triggered by ${event}, an indirect way to start jobs`);
      else if (!ALLOWED_EVENTS.includes(event)) problems.push(`${name}: event ${event} is not in the allowed list (${ALLOWED_EVENTS.join(', ')})`);
    }
    if (!plain(value.jobs) || Object.keys(value.jobs).length === 0) { problems.push(`${name}: no readable jobs`); continue; }
    for (const [job, body] of Object.entries(value.jobs)) {
      const where = `${name}: job ${job}`;
      if (!plain(body)) { problems.push(`${where}: not a mapping`); continue; }
      if (body.uses !== undefined) problems.push(`${where}: calls the reusable workflow ${body.uses}`);
      const vpsJob = name === DEPLOY_FILE && job === DEPLOY_JOB;
      const runsOn = body['runs-on'];
      if (vpsJob ? !same(runsOn, VPS_RUNS_ON) : !(typeof runsOn === 'string' && HOSTED_LABELS.includes(runsOn))) {
        problems.push(`${where}: runs-on ${JSON.stringify(runsOn ?? null)} is not allowed (only ${DEPLOY_FILE} job ${DEPLOY_JOB} may use the VPS runner; every other job one literal GitHub-hosted label)`);
      }
    }
    if (name !== DEPLOY_FILE) {
      const hit = scalars(value).find(item => PRIVATE.test(item));
      if (hit) problems.push(`${name}: names the VPS runner or mp-deploy (${hit.slice(0, 80)})`);
      else if (PRIVATE.test(String(text))) problems.push(`${name}: its text names the VPS runner or mp-deploy`);
    } else problems.push(...deployProblems(value));
  }
  return problems;
}

// Reads .github/workflows itself (review B-3): every entry is looked at with lstat. A symlink, a subdirectory, a file
// that is not regular or a name outside WORKFLOW_NAME (an upper-case extension, another extension, a dot file) is a
// problem; the regular .yml/.yaml files are returned for workflowPolicyProblems.
export function readWorkflowDirectory(dir) {
  const problems = [];
  const entries = [];
  let names;
  try { names = readdirSync(dir).sort(); } catch (error) { return {entries, problems: [`workflow directory unreadable: ${error.code ?? error.message}`]}; }
  for (const name of names) {
    let info;
    try { info = lstatSync(join(dir, name)); } catch (error) { problems.push(`${name}: unreadable (${error.code ?? error.message})`); continue; }
    if (info.isSymbolicLink()) problems.push(`${name}: a symlink in the workflow directory is not accepted`);
    else if (info.isDirectory()) problems.push(`${name}: a subdirectory in the workflow directory is not accepted`);
    else if (!info.isFile()) problems.push(`${name}: not a regular file`);
    else if (!WORKFLOW_NAME.test(name)) problems.push(`${name}: not a lower-case .yml/.yaml workflow name`);
    else {
      // Strict UTF-8 (review NB-14): an invalid sequence, or a UTF-16/32 byte-order mark, is refused, not repaired.
      const bytes = readFileSync(join(dir, name));
      if (bytes[0] === 0xFE && bytes[1] === 0xFF || bytes[0] === 0xFF && bytes[1] === 0xFE || bytes[0] === 0x00 && bytes[1] === 0x00) { problems.push(`${name}: UTF-16/32 is not accepted`); continue; }
      try { entries.push([name, new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(bytes)]); }
      catch { problems.push(`${name}: not valid UTF-8`); }
    }
  }
  return {entries, problems};
}

// The whole check of a workflow directory: its entries, then every workflow.
export function workflowDirectoryProblems(dir) {
  const {entries, problems} = readWorkflowDirectory(dir);
  return [...problems, ...workflowPolicyProblems(entries)];
}
