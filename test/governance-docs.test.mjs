import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CANONICAL_FILES, describe, loadState, validateState} from '../tools/governance/cli.mjs';
import {findClosingReferences} from '../tools/governance/policy.mjs';
import {STATES} from '../tools/governance/checkpoints.mjs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('AGENTS.md is canonical and carries the 2026-10-18 owner rules', () => {
  const agents = read('AGENTS.md');
  for (const text of ['fonte canonica delle regole operative', 'READY TO CLOSE — OWNER APPROVAL REQUIRED', "Solo l'owner chiude le issue", 'MP-OWNER-AUTOMERGE-01',
    'MP-OWNER-CERT-ISSUE-CLOSURE-01', 'MP-GITHUB-SINGLE-SOURCE-OF-TRUTH-01', 'docs/governance/owner-decisions.json', 'docs/governance/HANDOFF.md',
    'HANDOFF READY', 'review indipendente APPROVED', 'Una sola PR di implementazione attiva alla volta']) assert.ok(agents.includes(text), `AGENTS.md lacks: ${text}`);
});

test('obsolete instructions are gone from canonical documents (#149 review N-05)', () => {
  for (const file of ['AGENTS.md', 'CLAUDE.md', 'README.md']) {
    const text = read(file);
    assert.ok(!text.includes('Prossima azione: owner review e autorizzazione al merge della [PR #125]'), `${file} keeps the 07/10 entry block`);
    assert.ok(!/se l'owner autorizza esplicitamente l'agente a chiudere/i.test(text), `${file} keeps the agent closure exception`);
    assert.ok(!text.includes('salvo autorizzazione esplicita data all'), `${file} keeps the agent closure exception`);
    assert.ok(!/merge di questa PR solo dopo owner/.test(text), `${file} keeps the per-merge owner approval`);
    assert.ok(!/Dopo il merge\n- verificare deploy Render/.test(text), `${file} keeps the mandatory Render deploy check`);
  }
});

test('CLAUDE.md points to AGENTS.md without duplicating the rule set', () => {
  const claude = read('CLAUDE.md');
  assert.match(claude, /\[AGENTS\.md\]\(AGENTS\.md\)/);
  assert.match(claude, /owner-decisions\.json/);
  assert.ok(claude.split('\n').length < 60, 'CLAUDE.md should stay a short pointer');
  for (const heading of ['## Protocollo FutPythonTrader', '## Ownership di dominio', '## Regola chiusura issue']) assert.ok(!claude.includes(heading), `CLAUDE.md duplicates ${heading}`);
});

test('canonical documents and the PR template contain no auto-closing references', () => {
  for (const file of CANONICAL_FILES) assert.deepEqual(findClosingReferences(read(file)), [], file);
  assert.match(read('.github/pull_request_template.md'), /Refs #/);
});

test('CI enforces the governance gate and the closing-keyword scan on every PR', () => {
  const ci = read('.github/workflows/ci.yml');
  assert.match(ci, /types: \[opened, synchronize, reopened, edited\]/);
  assert.match(ci, /npm run governance:validate/);
  assert.match(ci, /npm run governance:check/);
  assert.match(ci, /test\/governance-\*\.test\.mjs/);
  assert.match(ci, /PR_BODY: \$\{\{ github\.event\.pull_request\.body \}\}/);
  assert.match(ci, /npm run governance:scan-closing/);
  assert.match(ci, /cli\.mjs check-append-only/);
  const gateStep = ci.indexOf('Governance gate');
  assert.ok(gateStep > 0 && !ci.slice(gateStep, ci.indexOf('Syntax checks')).includes("mode != 'docs'"), 'governance gate must run in docs mode too');
});

test('the handoff procedure documents every admitted state', () => {
  const handoff = read('docs/governance/HANDOFF.md');
  for (const state of STATES) assert.ok(handoff.includes(state), state);
  for (const text of ['resume', 'reconciled: true', 'MULTI-AGENT HANDOFF CERTIFIED', 'Idempotenza']) assert.ok(handoff.includes(text), text);
});

test('the repository registry and checkpoints are valid and resolvable', async () => {
  const state = await loadState();
  assert.deepEqual(validateState(state), []);
  const rows = describe(state);
  assert.ok(rows.some(row => row.task === 'R-01' && row.issue === 150));
  for (const row of rows.filter(item => item.latest_checkpoint)) assert.ok(row.next_action, `${row.task} has no next action`);
});
