import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SHA = /^[0-9a-f]{40}$/i;

const RULES = [
  ['ui', /^docs\/mockups\//],
  ['database', /^(migrations\/|src\/(db|migrate)\.mjs$|test\/.*(?:db|migration|postgres))/],
  ['totalcorner', /^(src\/(?:jobs|providers)\/totalcorner|test\/totalcorner)/],
  ['fpt', /^(src\/(?:jobs|providers)\/futpython|test\/futpython)/],
  ['api', /^(src\/(?:server|.*api).*\.mjs$|test\/.*(?:api|contract))/],
  ['math', /^(src\/.*(?:math|model)|test\/.*(?:math|model|formula|invariant))/],
  ['trading', /^(src\/.*(?:trading|strategy)|test\/.*(?:trading|strategy|risk))/],
  ['money-management', /^(src\/.*(?:money|bankroll|stake|settlement)|test\/.*(?:money|bankroll|stake|settlement))/],
  ['replay', /^(src\/.*replay|test\/.*(?:replay|timeline|determinism))/],
  ['mcp', /^(src\/.*mcp|test\/.*mcp)/],
  ['security', /^(src\/.*(?:auth|security)|test\/.*(?:auth|security))/],
  ['shared', /^(src\/|test\/)/],
];

const DEPENDENTS = new Map([
  ['database', ['api', 'fpt', 'totalcorner', 'replay', 'trading', 'money-management']],
  ['api', ['mcp']],
  ['math', ['trading', 'money-management', 'replay']],
  ['fpt', ['api', 'replay']],
  ['totalcorner', ['api', 'replay', 'trading']],
  ['trading', ['replay']],
  ['shared', ['database', 'api', 'fpt', 'totalcorner', 'math', 'trading', 'money-management', 'replay', 'mcp', 'security']],
]);

function isDocumentation(file) {
  return /^(README\.md|CLAUDE\.md|AGENTS\.md|docs\/(?!mockups\/).+|\.github\/pull_request_template\.md|\.github\/(?:ISSUE_TEMPLATE|PULL_REQUEST_TEMPLATE)\/.*)$/i.test(file);
}

function expandTransitively(categories) {
  const queue = [...categories];
  while (queue.length > 0) {
    const category = queue.shift();
    for (const dependent of DEPENDENTS.get(category) ?? []) {
      if (!categories.has(dependent)) {
        categories.add(dependent);
        queue.push(dependent);
      }
    }
  }
  return categories;
}

export function classifyFiles(inputFiles) {
  const files = [...new Set(inputFiles.map((file) => file.trim()).filter(Boolean))];
  if (files.length === 0) return { mode: 'full', categories: ['unknown'] };

  const categories = new Set();
  let docsOnly = true;
  let uiOnly = true;

  for (const file of files) {
    if (isDocumentation(file)) {
      uiOnly = false;
      continue;
    }

    docsOnly = false;
    const rule = RULES.find(([, pattern]) => pattern.test(file));
    if (!rule) {
      categories.add('unknown');
      uiOnly = false;
      continue;
    }
    categories.add(rule[0]);
    if (rule[0] !== 'ui') uiOnly = false;
  }

  if (docsOnly) return { mode: 'docs', categories: ['documentation'] };
  if (uiOnly && categories.size === 1 && categories.has('ui')) return { mode: 'ui', categories: ['ui'] };

  expandTransitively(categories);
  return { mode: 'full', categories: [...categories].sort() };
}

function changedFiles(baseSha, headSha) {
  if (!SHA.test(baseSha ?? '') || !SHA.test(headSha ?? '')) return [];
  try {
    return execFileSync('git', ['diff', '--name-only', '--diff-filter=ACMR', `${baseSha}...${headSha}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function emit(result) {
  const lines = [`mode=${result.mode}`, `categories=${result.categories.join(',')}`];
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`);
  console.log(lines.join('\n'));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  emit(classifyFiles(changedFiles(process.env.BASE_SHA, process.env.HEAD_SHA)));
}
