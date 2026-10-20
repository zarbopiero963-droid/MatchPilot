// GOV-01 (MP-OWNER-AUTOMERGE-03): classifies a pull request as AUTO-MERGE ELIGIBLE or OWNER-GO REQUIRED from every file
// it changes against the merge base with main, the kind of change, and the import graph (indirect effects). Fail
// closed: an unknown path, an unreadable diff, a mixed PR or any doubt is OWNER-GO REQUIRED. This classifier and the
// merge gate are themselves owner-only files, and the procedure runs them from the BASE commit (never from the PR), so
// a pull request cannot weaken the check that decides its own merge (AGENTS.md §4).
//   node tools/governance/merge-class.mjs --base <ref> --head <ref> [--repo <dir>]
// Pure classification (classifyChanges) has no git, network or clock; the CLI reads git only.
import {execFileSync} from 'node:child_process';
import {posix} from 'node:path';

export const ELIGIBLE = 'AUTO-MERGE ELIGIBLE';
export const OWNER_GO = 'OWNER-GO REQUIRED';
export const CLASSIFIER_VERSION = 'mp-merge-class-1';

// Owner-only areas, in order; the first match decides. Each has the reason the owner listed (MP-OWNER-AUTOMERGE-03).
export const OWNER_RULES = [
  ['governance', /^(AGENTS\.md|CLAUDE\.md|CODEOWNERS|\.github\/.*|scripts\/.*|tools\/governance\/.*|test\/governance-[^/]*|docs\/governance\/(owner-decisions\.json|certifiability-matrix\.md|audits\/.*|archive\/.*|HANDOFF\.md))$/],
  ['database', /^(migrations\/.*|src\/db\.mjs|src\/migrate\.mjs)$/],
  ['security', /^(src\/auth\/.*|src\/runtime-safety\.mjs|src\/server\.mjs|\.npmrc|tools\/qa\/.*|test\/visual\/.*|docs\/qa\/.*)$/],
  ['dependencies', /^(package\.json|package-lock\.json|npm-shrinkwrap\.json|\.nvmrc|\.node-version)$/],
  ['providers-collectors-telegram', /^(src\/providers\/.*|src\/jobs\/.*|src\/background\.mjs|src\/alerts\.mjs)$/],
  ['certification-pit-backtest-settlement-calculation', /^(src\/pit\/.*|src\/hist\/.*|src\/math\/.*|src\/analysis\/.*|src\/api\/.*|src\/futpython-certif[^/]*|src\/coverage-page\.mjs|tools\/hist\/.*|tools\/archive\/.*|docs\/(pit-policy|math-core|hist-backtest|postgres-independent|runtime-isolation|ci-zero-cost|auth|integration-map)\.md|docs\/futpython-certification-[^/]*|docs\/provider-trial-[^/]*|docs\/reference\/.*)$/],
  ['product-mockup', /^docs\/mockups\/.*$/],
];

// Areas where an autonomous merge is possible; everything else is unknown and therefore owner-only.
export const ELIGIBLE_RULES = [
  ['frontend', /^src\/web\/.*$/],
  ['tests', /^test\/.*$/],
  ['documentation', /^(README\.md|docs\/(web|qa-notes)\.md|docs\/governance\/(checkpoints\/[^/]+\.json|work-registry\.json|mp-pr-00\/(requirements\.json|README\.md|traceability\.md)))$/],
  ['tooling', /^tools\/perf\/.*$/],
];

const SOURCE = /\.(mjs|js|cjs)$/;

// Static imports, re-exports and dynamic imports with a literal specifier.
export function importsOf(text) {
  const found = new Set();
  for (const match of String(text).matchAll(/\b(?:import|export)\s[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)|\bimport\s+['"]([^'"]+)['"]/g)) {
    found.add(match[1] ?? match[2] ?? match[3]);
  }
  return [...found];
}

// Who imports whom inside the repository: files → resolved relative imports.
export function importGraph(files) {
  const graph = new Map();
  for (const [path, text] of files) {
    const targets = importsOf(text).filter(spec => spec.startsWith('.')).map(spec => posix.normalize(posix.join(posix.dirname(path), spec)));
    graph.set(path, targets);
  }
  return graph;
}

// Every file that imports `target`, directly or through other files.
function importersOf(target, graph) {
  const reverse = new Map();
  for (const [from, targets] of graph) for (const to of targets) { if (!reverse.has(to)) reverse.set(to, new Set()); reverse.get(to).add(from); }
  const seen = new Set();
  const queue = [target];
  while (queue.length) {
    for (const from of reverse.get(queue.shift()) ?? []) if (!seen.has(from)) { seen.add(from); queue.push(from); }
  }
  return seen;
}

const ownerRuleOf = path => OWNER_RULES.find(([, pattern]) => pattern.test(path))?.[0] ?? null;
const eligibleRuleOf = path => ELIGIBLE_RULES.find(([, pattern]) => pattern.test(path))?.[0] ?? null;

// changes: [{status: 'A'|'M'|'D'|'R'|'C'|..., path, oldPath?}]; graph: import graph of base ∪ head.
// A test file that is changed or deleted (not added) and imports an owner-only module could weaken a certified check,
// so it is owner-only; a new test file only adds coverage.
export function classifyChanges(changes, graph) {
  const files = [];
  const reasons = [];
  if (!Array.isArray(changes) || changes.length === 0) reasons.push('EMPTY_OR_UNREADABLE_DIFF');
  for (const change of changes ?? []) {
    const paths = [change.path, change.oldPath].filter(Boolean);
    for (const path of paths) {
      const entry = {path, status: change.status, class: OWNER_GO, rule: null};
      if (!/^[ACDMR]\d*$/.test(change.status ?? '')) entry.rule = 'UNKNOWN_CHANGE_TYPE';
      else if (path.includes('..') || path.startsWith('/')) entry.rule = 'UNSAFE_PATH';
      else {
        const owner = ownerRuleOf(path);
        if (owner) entry.rule = owner;
        else {
          const eligible = eligibleRuleOf(path);
          if (!eligible) entry.rule = 'UNKNOWN_PATH';
          else {
            entry.rule = eligible;
            entry.class = ELIGIBLE;
            // Indirect effect: an owner-only module that imports this file (directly or not).
            if (SOURCE.test(path)) {
              const critical = [...importersOf(path, graph)].filter(importer => ownerRuleOf(importer));
              if (critical.length) { entry.class = OWNER_GO; entry.rule = `indirect:${critical.sort()[0]}`; }
            }
            // A changed or deleted test that exercises an owner-only module.
            if (entry.class === ELIGIBLE && eligible === 'tests' && change.status !== 'A') {
              const imported = (graph.get(path) ?? []).filter(target => ownerRuleOf(target));
              if (imported.length) { entry.class = OWNER_GO; entry.rule = `test-of-owner-only:${imported.sort()[0]}`; }
            }
          }
        }
      }
      files.push(entry);
    }
  }
  for (const entry of files) if (entry.class === OWNER_GO) reasons.push(`${entry.path}: ${entry.rule}`);
  return {classifier: CLASSIFIER_VERSION, class: reasons.length ? OWNER_GO : ELIGIBLE, reasons, files};
}

// ---- CLI (git only) ----
const git = (repo, args) => execFileSync('git', ['-C', repo, ...args], {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});

function sourcesAt(repo, ref) {
  const names = git(repo, ['ls-tree', '-r', '--name-only', ref]).split('\n').filter(name => SOURCE.test(name) && /^(src|tools|scripts|test)\//.test(name));
  return names.map(name => [name, git(repo, ['show', `${ref}:${name}`])]);
}

export function classifyRange(repo, base, head) {
  const mergeBase = git(repo, ['merge-base', base, head]).trim();
  const raw = git(repo, ['diff', '--name-status', '-M', '-z', mergeBase, head]).split('\0').filter(Boolean);
  const changes = [];
  for (let i = 0; i < raw.length;) {
    const status = raw[i++];
    if (/^[RC]/.test(status)) { const oldPath = raw[i++]; const path = raw[i++]; changes.push({status, path, oldPath}); }
    else changes.push({status, path: raw[i++]});
  }
  // Import graph of the merge base and of the head together: an import the PR removes still counts.
  const union = new Map();
  for (const ref of [mergeBase, head]) {
    for (const [path, targets] of importGraph(sourcesAt(repo, ref))) union.set(path, [...new Set([...(union.get(path) ?? []), ...targets])]);
  }
  return {base, head, merge_base: mergeBase, ...classifyChanges(changes, union)};
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = name => { const at = process.argv.indexOf(`--${name}`); return at < 0 ? null : process.argv[at + 1]; };
  let result;
  try {
    const base = arg('base');
    const head = arg('head');
    if (!base || !head) throw new Error('--base and --head are required');
    result = classifyRange(arg('repo') ?? process.cwd(), base, head);
  } catch (error) {
    result = {classifier: CLASSIFIER_VERSION, class: OWNER_GO, reasons: [`CLASSIFIER_ERROR: ${error.message.split('\n')[0]}`], files: []};
  }
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.class === ELIGIBLE ? 0 : 4;
}
