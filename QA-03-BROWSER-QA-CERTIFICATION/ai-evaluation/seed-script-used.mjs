// Blind evaluation of the AI exploratory review (QA-03): semantic defects the crawler cannot see, injected in the page.
import {runExploration} from '/home/user/MatchPilot/tools/qa/explore.mjs';
export const SEEDED = [
  {id: 'S1', rule: 'D-3 odds with Italian comma', from: "if (typeof value === 'string' && /^-?\\d+(\\.\\d+)?$/.test(value)) return document.createTextNode(formatDecimalText(value));",
   to: "if (typeof value === 'string' && /^-?\\d+(\\.\\d+)?$/.test(value)) return document.createTextNode(value);"},
  {id: 'S2', rule: 'missing data shown N/D, never 0', from: "if (missing) return el('span', {class: 'nd', title: 'Valore non disponibile'}, ND);",
   to: "if (missing) return el('span', {class: 'nd', title: 'Valore non disponibile'}, '0');"},
  {id: 'S3', rule: 'Italian labels', from: "more: 'Carica altre partite'", to: "more: 'Load more matches'"},
  {id: 'S4', rule: 'board heading names the chosen day', from: "`Partite del ${date}`",
   to: "`Partite del ${new Date(Date.parse(date) - 864e5).toISOString().slice(0, 10)}`"},
];
const hook = context => context.route('**/assets/app.js', async route => {
  const response = await route.fetch();
  let body = await response.text();
  for (const defect of SEEDED) { if (!body.includes(defect.from)) throw new Error(`seed ${defect.id} not applicable`); body = body.replace(defect.from, defect.to); }
  await route.fulfill({response, body});
});
const [out, mode] = process.argv.slice(2);
const report = await runExploration({out, seed: 1, actions: 30, contextHook: mode === 'seeded' ? hook : null});
console.log(JSON.stringify({mode, totals: report.totals, head: report.head_sha}));
