#!/usr/bin/env node
// Rewrites the generated inventory count blocks (between `<!-- inventory:<name>:start -->` and
// `<!-- inventory:<name>:end -->`) from requirements.json, so human-readable counts never drift.
// Usage: node tools/governance/render-inventory.mjs [--check]
import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {loadInventory, summarize} from '../validate-requirements.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));

export function renderBlocks(inventory) {
  const s = summarize(inventory);
  const v = name => s.by_verdict[name] || 0;
  const groups = {};
  for (const req of inventory.requirements) {
    const g = groups[req.group] ??= {n: 0, P0: 0, PASS: 0, FAIL: 0, BLOCKED: 0, NOT_VERIFIED: 0};
    g.n++; g[req.verdict]++;
    if (req.priority === 'P0') g.P0++;
  }
  const byPr = {};
  for (const req of inventory.requirements) for (const pr of req.target_prs) byPr[pr] = (byPr[pr] || 0) + 1;
  return {
    summary: [
      `- **Requisiti:** ${s.denominator} (census ${s.census}), di cui ${s.by_priority.P0 || 0} P0 e ${s.by_priority.P1 || 0} P1.`,
      `- **Verdetti:** ${v('PASS')} PASS (tutti con evidenza, ciascuno limitato al proprio scope), ${v('FAIL')} FAIL, ${v('BLOCKED')} BLOCKED, ${v('NOT_VERIFIED')} NOT_VERIFIED.`,
      `- **Gate:** ${s.p0_open} P0 aperti. Gate A del prodotto **NON PASS**.`,
    ].join('\n'),
    counts: [
      '| Dimensione | Conteggio |', '|---|---:|',
      `| Totale | ${s.denominator} |`,
      `| P0 / P1 | ${s.by_priority.P0 || 0} / ${s.by_priority.P1 || 0} |`,
      `| PASS (tutti con evidenza, ciascuno limitato al proprio scope) | ${s.pass_with_evidence} |`,
      `| FAIL | ${v('FAIL')} |`, `| BLOCKED | ${v('BLOCKED')} |`, `| NOT_VERIFIED | ${v('NOT_VERIFIED')} |`,
      `| P0 aperti | ${s.p0_open} |`,
      `| Con mapping a codice / test / evidenza | ${s.mapped_code} / ${s.mapped_tests} / ${s.with_evidence} |`,
      `| Future register (fuori denominatore) | ${s.future_register} |`,
    ].join('\n'),
    groups: [
      '| Gruppo | Requisiti | P0 | PASS | FAIL | BLOCKED | NOT_VERIFIED |', '|---|---:|---:|---:|---:|---:|---:|',
      ...Object.entries(groups).map(([k, g]) => `| ${k} | ${g.n} | ${g.P0} | ${g.PASS} | ${g.FAIL} | ${g.BLOCKED} | ${g.NOT_VERIFIED} |`),
      `| **Totale** | **${s.denominator}** | **${s.by_priority.P0 || 0}** | **${v('PASS')}** | **${v('FAIL')}** | **${v('BLOCKED')}** | **${v('NOT_VERIFIED')}** |`,
    ].join('\n'),
    prs: [
      '| PR | Scope | Issue | Card #104 | Requisiti |', '|---|---|---|---|---:|',
      ...inventory.pr_registry.map(pr => `| ${pr.id} | ${pr.title} | ${pr.issues.join(' ') || '—'} | ${pr.cards.join(', ') || '—'} | ${byPr[pr.id] || 0} |`),
    ].join('\n'),
  };
}

export const TARGETS = {'README.md': ['summary'], 'docs/governance/mp-pr-00/README.md': ['counts'], 'docs/governance/mp-pr-00/traceability.md': ['groups', 'prs']};

export function apply(text, blocks, names) {
  let out = text;
  for (const name of names) {
    const start = `<!-- inventory:${name}:start -->`;
    const end = `<!-- inventory:${name}:end -->`;
    const a = out.indexOf(start);
    const b = out.indexOf(end);
    if (a < 0 || b < a) throw new Error(`missing block ${name}`);
    out = out.slice(0, a + start.length) + '\n' + blocks[name] + '\n' + out.slice(b);
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const blocks = renderBlocks(await loadInventory());
  const stale = [];
  for (const [file, names] of Object.entries(TARGETS)) {
    const path = `${root}${file}`;
    const text = readFileSync(path, 'utf8');
    const next = apply(text, blocks, names);
    if (next !== text) {
      if (process.argv.includes('--check')) stale.push(file);
      else writeFileSync(path, next);
    }
  }
  if (stale.length) { console.error(`stale generated blocks: ${stale.join(', ')} (run npm run governance:render)`); process.exitCode = 1; }
}
