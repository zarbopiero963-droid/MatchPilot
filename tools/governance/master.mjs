#!/usr/bin/env node
// MP-MASTER-01 (MP-GLOBAL-RECONCILIATION-20261102): validator and reports of the canonical MASTER registry
// (docs/governance/master/). Read only on the repository; no network unless a GitHub listing is passed in as a file.
//   node tools/governance/master.mjs validate            registry consistency (ids, links, evidence, coverage, roadmap)
//   node tools/governance/master.mjs coverage [--write]  coverage metrics computed from the registry
//   node tools/governance/master.mjs render [--write]    docs/governance/master/roadmap.md from the registry
//   node tools/governance/master.mjs issues-check <file> open issues (GitHub JSON list) without a MASTER link
//   node tools/governance/master.mjs pr-check <file>     a PR body cites requirement or card ids, or declares none
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = join(ROOT, 'docs/governance/master');
export const LIFECYCLES = ['ACTIVE', 'SUPERSEDED', 'DUPLICATE', 'IDEA_NOT_APPROVED', 'ARCHIVE_NO_ACTION'];
export const RELATIONS = ['COMPATIBLE', 'SUPERSEDED', 'DUPLICATE', 'CONFLICT_OWNER_DECISION_REQUIRED', 'UNRESOLVED'];
export const IMPLEMENTATION = ['NOT_IMPLEMENTED', 'PARTIAL', 'IMPLEMENTED', 'UNKNOWN'];
export const CERTIFIED = ['NONE', 'COMPONENT', 'INTEGRATION', 'UNKNOWN'];
export const CARD_STATES = ['NOT STARTED', 'IMPLEMENTING', 'IMPLEMENTED', 'UNIT TESTED', 'INTEGRATION TESTED', 'BROWSER TESTED', 'HARD VERIFIED REAL',
  'MERGED', 'DEPLOYED', 'OPERATIONALLY VERIFIED', 'CERTIFIED', 'BLOCKED'];
export const PHASES = {P0: 'Governance e tracciabilità', P1: 'PR MANUAL aperte in attesa del GO owner', P2: 'Dati e provider (API-FOOTBALL)', P3: 'Ricerca, mercati e analisi',
  P4: 'Strategie, backtest e replay', P5: 'Trading, Money Management e ledger', P6: 'Operator API e MCP', P7: 'Interfaccia web', P8: 'Multiutente e sicurezza',
  P9: 'Infrastruttura, deploy e monitoraggio', P10: 'Certificazione integrata e gate finale'};
const REQ_ID = /^MP-REQ-\d{4}$/;
const REF = /\b(MP-REQ-\d{4}|MP-REQ-UI-\d{4}|MP-CARD-(?:\d{3}|OPEN-\d+))\b/g;

const readLines = file => readFileSync(file, 'utf8').split('\n').filter(l => l.trim() && l.trim() !== '[' && l.trim() !== ']').map(l => JSON.parse(l.replace(/,\s*$/, '')));
export function load(dir = DIR) {
  return {
    master: JSON.parse(readFileSync(join(dir, 'master.json'), 'utf8')),
    requirements: readLines(join(dir, 'requirements.jsonl')),
    cards: readLines(join(dir, 'cards.jsonl')),
    issues: JSON.parse(readFileSync(join(dir, 'issues.json'), 'utf8')),
    prs: JSON.parse(readFileSync(join(dir, 'prs.json'), 'utf8'))
  };
}

const count = (list, f) => list.reduce((acc, x) => { const k = f(x); acc[k] = (acc[k] ?? 0) + 1; return acc; }, {});
const sorted = o => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));
// Coverage metrics, with their denominators. Only counts derived from the registry; nothing is estimated.
export function coverage({requirements, cards, issues, prs}, {uiRows = 0, pr00Rows = 0} = {}) {
  const active = requirements.filter(r => r.lifecycle === 'ACTIVE');
  return {
    issues: {total: issues.length, open: issues.filter(i => i.state === 'OPEN').length, closed: issues.filter(i => i.state === 'CLOSED').length,
      open_without_master_link: issues.filter(i => i.state === 'OPEN' && !i.master_link).length},
    pull_requests: {total: prs.length, open: prs.filter(p => p.state === 'open').length, merged: prs.filter(p => p.merged).length,
      closed_unmerged: prs.filter(p => p.state === 'closed' && !p.merged).length},
    requirements: {
      master_atomic: requirements.length, existing_registers: {ui_matrix: uiRows, mp_pr_00: pr00Rows},
      by_lifecycle: sorted(count(requirements, r => r.lifecycle)), by_relation: sorted(count(requirements, r => r.relation)),
      active_by_implementation: sorted(count(active, r => r.status.implementation)),
      active_by_tested: sorted(count(active, r => r.status.tested)),
      active_by_certified: sorted(count(active, r => r.status.certified)),
      active_merged: active.filter(r => r.status.merged === true).length,
      active_in_open_pr: active.filter(r => (r.status.in_open_pr ?? []).length).length,
      active_deployed_verified: active.filter(r => r.status.deployed === 'YES').length,
      active_operational: active.filter(r => r.status.active === 'YES').length,
      active_blocked: active.filter(r => r.status.blocked).length,
      active_with_provider_gap: active.filter(r => r.provider_gap).length,
      active_without_evidence: active.filter(r => !(r.tests ?? []).length && !(r.code_paths ?? []).length).length,
      conflicts_owner_decision_required: requirements.filter(r => r.relation === 'CONFLICT_OWNER_DECISION_REQUIRED').length,
      unresolved: requirements.filter(r => r.relation === 'UNRESOLVED').length,
      by_domain: sorted(count(active, r => r.domain))
    },
    cards: {total: cards.length, by_origin: sorted(count(cards, c => c.origin)), by_phase: sorted(count(cards, c => c.phase)), by_state: sorted(count(cards, c => c.state)),
      certified: cards.filter(c => c.state === 'CERTIFIED').length}
  };
}

export function validate(reg, {uiIds = null, pr00Ids = null} = {}) {
  const errors = [];
  const ids = new Set();
  const cardIds = new Set(reg.cards.map(c => c.id));
  if (cardIds.size !== reg.cards.length) errors.push('duplicate card id');
  const issueNums = new Set(reg.issues.map(i => i.issue));
  for (const r of reg.requirements) {
    const at = r.id ?? '(no id)';
    if (!REQ_ID.test(r.id ?? '')) errors.push(`${at}: invalid id`);
    if (ids.has(r.id)) errors.push(`${at}: duplicate id`);
    ids.add(r.id);
    for (const k of ['title', 'description', 'issue', 'domain', 'lifecycle', 'relation', 'status', 'acceptance']) if (r[k] === undefined || r[k] === null || r[k] === '') errors.push(`${at}: missing ${k}`);
    if (!LIFECYCLES.includes(r.lifecycle)) errors.push(`${at}: lifecycle ${r.lifecycle}`);
    if (!RELATIONS.includes(r.relation)) errors.push(`${at}: relation ${r.relation}`);
    if (!IMPLEMENTATION.includes(r.status?.implementation)) errors.push(`${at}: implementation ${r.status?.implementation}`);
    if (!CERTIFIED.includes(r.status?.certified)) errors.push(`${at}: certified ${r.status?.certified}`);
    if (!issueNums.has(r.issue)) errors.push(`${at}: issue #${r.issue} not in the issue index`);
    if (['SUPERSEDED', 'DUPLICATE'].includes(r.relation) && !r.relation_ref) errors.push(`${at}: ${r.relation} without a reference`);
    if (r.lifecycle === 'ACTIVE' && !(r.cards ?? []).length) errors.push(`${at}: active requirement without a PR card`);
    for (const c of r.cards ?? []) if (!cardIds.has(c)) errors.push(`${at}: unknown card ${c}`);
    // Nothing is declared implemented or certified without evidence in the registry.
    if (r.status?.implementation === 'IMPLEMENTED' && !(r.code_paths ?? []).length) errors.push(`${at}: IMPLEMENTED without code paths`);
    if (['COMPONENT', 'INTEGRATION'].includes(r.status?.certified) && !(r.tests ?? []).length) errors.push(`${at}: certified without tests`);
    if (r.status?.deployed === 'YES' && !r.status?.deploy_evidence) errors.push(`${at}: deployed without deploy evidence`);
    for (const e of r.existing_ids ?? []) {
      if (uiIds && /^MP-REQ-UI-\d{4}$/.test(e) && !uiIds.has(e)) errors.push(`${at}: unknown UI requirement ${e}`);
      if (pr00Ids && /^MP-[A-Z]{3}-\d{3}$/.test(e) && !pr00Ids.has(e)) errors.push(`${at}: unknown MP-PR-00 requirement ${e}`);
    }
  }
  for (const r of reg.requirements) for (const d of r.dependencies ?? []) if (REQ_ID.test(d) && !ids.has(d)) errors.push(`${r.id}: unknown dependency ${d}`);
  for (const c of reg.cards) {
    for (const k of ['id', 'title', 'phase', 'objective', 'requirements', 'tests', 'evidence', 'gates', 'certification', 'state']) if (c[k] === undefined) errors.push(`${c.id}: card missing ${k}`);
    if (!PHASES[c.phase]) errors.push(`${c.id}: unknown phase ${c.phase}`);
    if (!CARD_STATES.includes(c.state)) errors.push(`${c.id}: unknown state ${c.state}`);
    for (const id of c.requirements ?? []) if (!ids.has(id)) errors.push(`${c.id}: unknown requirement ${id}`);
    if ((c.state === 'CERTIFIED' || c.certification?.CERTIFIED) && !(c.evidence_records ?? []).length) errors.push(`${c.id}: CERTIFIED without evidence records`);
    if (c.certification?.['HARD VERIFIED REAL'] && !(c.evidence_records ?? []).some(e => e.kind === 'HARD_REAL')) errors.push(`${c.id}: HARD VERIFIED REAL without a real-test evidence record`);
  }
  for (const i of reg.issues) {
    if (!i.domain || !i.lifecycle) errors.push(`#${i.issue}: issue without domain or lifecycle`);
    if (!['OPEN', 'CLOSED'].includes(i.state)) errors.push(`#${i.issue}: state ${i.state}`);
    if (i.state === 'OPEN' && i.master_link !== null && i.master_link !== undefined && i.master_link !== 'SELF' && !/^https:\/\/github\.com\/.+#issuecomment-\d+$/.test(i.master_link)) errors.push(`#${i.issue}: master_link is not a comment URL`);
  }
  if (!Number.isInteger(reg.master.master_issue)) errors.push('master.json: master_issue missing');
  if (!/^[0-9a-f]{40}$/.test(reg.master.reconciled_base_sha ?? '')) errors.push('master.json: reconciled_base_sha missing');
  return errors;
}

// Roadmap (Markdown) generated from the registry, so the document never disagrees with it.
export function render(reg) {
  const byPhase = {};
  for (const c of reg.cards) (byPhase[c.phase] ??= []).push(c);
  const lines = ['# MatchPilot — Roadmap MASTER (generata da `tools/governance/master.mjs render`, non modificare a mano)', '',
    `MASTER: #${reg.master.master_issue} · base riconciliata \`${reg.master.reconciled_base_sha.slice(0, 7)}\` · ${reg.master.reconciled_at}`, '',
    'Ogni scheda elenca i requisiti (`requirements.jsonl`) e porta test, HARD TEST REALI, browser QA, evidenze e gate in `cards.jsonl`.', ''];
  for (const [p, name] of Object.entries(PHASES)) {
    const list = byPhase[p] ?? [];
    lines.push(`## ${p} — ${name} (${list.length} schede)`, '');
    if (!list.length) { lines.push('_Nessuna scheda: la fase si chiude con il gate finale descritto nel README._', ''); continue; }
    lines.push('| Scheda | Titolo | Requisiti | Stato | GUI |', '|---|---|---|---|---|');
    for (const c of list) lines.push(`| ${c.id} | ${String(c.title).replace(/\|/g, '/')} | ${c.requirements.length} | ${c.state} | ${String(c.gui).startsWith('SÌ') ? 'SÌ' : 'NO'} |`);
    lines.push('');
  }
  return lines.join('\n');
}

export function issuesCheck(reg, listing) {
  const linked = new Set(reg.issues.filter(i => i.master_link).map(i => i.issue));
  return listing.filter(i => String(i.state).toUpperCase() === 'OPEN' && !i.pull_request && i.number !== reg.master.master_issue && !linked.has(i.number)
    && !String(i.body ?? '').includes(`#${reg.master.master_issue}`)).map(i => i.number);
}

export function prCheck(body, reg) {
  const ids = new Set([...reg.requirements.map(r => r.id), ...reg.cards.map(c => c.id)]);
  const refs = [...String(body).matchAll(REF)].map(m => m[1]);
  const unknown = refs.filter(r => (r.startsWith('MP-REQ-') && !r.startsWith('MP-REQ-UI-') || r.startsWith('MP-CARD-')) && !ids.has(r));
  const declared = /NO-NEW-REQUIREMENT:\s*\S+/.test(body);
  return {ok: (refs.length > 0 || declared) && unknown.length === 0, refs, unknown, declared};
}

function main() {
  const [cmd, arg] = process.argv.slice(2);
  const reg = load();
  const ui = JSON.parse(readFileSync(join(ROOT, 'docs/governance/ui-requirements-matrix.json'), 'utf8')).requirements;
  const pr00 = JSON.parse(readFileSync(join(ROOT, 'docs/governance/mp-pr-00/requirements.json'), 'utf8')).requirements;
  const opts = {uiRows: ui.length, pr00Rows: pr00.length};
  if (cmd === 'validate') {
    const errors = validate(reg, {uiIds: new Set(ui.map(r => r.id)), pr00Ids: new Set(pr00.map(r => r.id))});
    const cov = JSON.stringify(coverage(reg, opts), null, 2) + '\n';
    if (readFileSync(join(DIR, 'coverage.json'), 'utf8') !== cov) errors.push('coverage.json is stale: run master.mjs coverage --write');
    if (readFileSync(join(DIR, 'roadmap.md'), 'utf8') !== render(reg) + '\n') errors.push('roadmap.md is stale: run master.mjs render --write');
    console.log(JSON.stringify({result: errors.length ? 'FAIL' : 'PASS', errors: errors.slice(0, 50), error_count: errors.length}, null, 2));
    process.exitCode = errors.length ? 1 : 0;
  } else if (cmd === 'coverage') {
    const cov = JSON.stringify(coverage(reg, opts), null, 2) + '\n';
    if (arg === '--write') writeFileSync(join(DIR, 'coverage.json'), cov); else process.stdout.write(cov);
  } else if (cmd === 'render') {
    if (arg === '--write') writeFileSync(join(DIR, 'roadmap.md'), render(reg) + '\n'); else console.log(render(reg));
  } else if (cmd === 'issues-check') {
    const orphans = issuesCheck(reg, JSON.parse(readFileSync(arg, 'utf8')));
    console.log(JSON.stringify({result: orphans.length ? 'FAIL' : 'PASS', open_issues_without_master_link: orphans}));
    process.exitCode = orphans.length ? 1 : 0;
  } else if (cmd === 'pr-check') {
    const r = prCheck(existsSync(arg) ? readFileSync(arg, 'utf8') : String(process.env.PR_BODY ?? ''), reg);
    console.log(JSON.stringify({result: r.ok ? 'PASS' : 'FAIL', ...r}));
    process.exitCode = r.ok ? 0 : 1;
  } else {
    console.error('usage: master.mjs validate | coverage [--write] | render [--write] | issues-check <file> | pr-check <file>');
    process.exitCode = 2;
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
