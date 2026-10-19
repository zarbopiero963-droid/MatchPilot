#!/usr/bin/env node
// Blind evaluation of the AI exploratory review (QA-03, MP-OWNER-QA-VISUAL-EXECUTION-01). The seeded defects are
// semantic: the crawler cannot see them (no error, no raw value, no layout fault), only a reviewer who reads the page
// against the product rules can. The script produces a clean and a seeded bundle on the same commit; the evaluator
// blinds them (anonymous names, injected_defect cleared in the copies) and gives both to a reviewer who has not seen
// this file. The key below is the answer sheet. Result and procedure: docs/qa/certification.md.
//
// Usage: node tools/qa/ai-eval-seeds.mjs --out <dir> (--clean | --seeded)
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runExploration} from './explore.mjs';

export const SEEDED_DEFECTS = [
  {id: 'S1', rule: 'D-3: odds and decimals with the Italian comma',
    from: "if (typeof value === 'string' && /^-?\\d+(\\.\\d+)?$/.test(value)) return document.createTextNode(formatDecimalText(value));",
    to: "if (typeof value === 'string' && /^-?\\d+(\\.\\d+)?$/.test(value)) return document.createTextNode(value);"},
  {id: 'S2', rule: 'MP-OWNER-PRODUCT-QUALITY-DATA-01: missing data is N/D, never 0',
    from: "if (missing) return el('span', {class: 'nd', title: 'Valore non disponibile'}, ND);",
    to: "if (missing) return el('span', {class: 'nd', title: 'Valore non disponibile'}, '0');"},
  {id: 'S3', rule: 'Italian labels', from: "more: 'Carica altre partite'", to: "more: 'Load more matches'"},
  {id: 'S4', rule: 'the Daily Board heading names the chosen day',
    from: '`Partite del ${date}`', to: '`Partite del ${new Date(Date.parse(date) - 864e5).toISOString().slice(0, 10)}`'},
];

// Applies every seeded defect to the page script; a seed that no longer matches the source fails loudly.
export const seededHook = context => context.route('**/assets/app.js', async route => {
  const response = await route.fetch();
  let body = await response.text();
  for (const defect of SEEDED_DEFECTS) {
    if (!body.includes(defect.from)) throw new Error(`seed ${defect.id} no longer matches src/web/app.js`);
    body = body.replace(defect.from, defect.to);
  }
  await route.fulfill({response, body});
});

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const out = args[args.indexOf('--out') + 1];
  if (!args.includes('--out') || !out || args.includes('--clean') === args.includes('--seeded')) {
    console.error('usage: ai-eval-seeds.mjs --out <dir> (--clean | --seeded)');
    process.exit(2);
  }
  const report = await runExploration({out, seed: 1, actions: 30, contextHook: args.includes('--seeded') ? seededHook : null});
  console.log(JSON.stringify({seeded: args.includes('--seeded'), totals: report.totals, head_sha: report.head_sha}));
}
