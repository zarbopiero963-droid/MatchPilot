// The certifiability matrix (MP-OWNER-CONTINUOUS-EXECUTION-02 §4): only the six verdicts, only requirements that exist,
// never a real-data pass on fixture data or without evidence, and a deterministic pass only with tests (PR #175 review B2).
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const VERDICTS = ['REAL DATA PASS', 'DETERMINISTIC TEST PASS', 'PARTIAL COVERAGE', 'NOT VERIFIED', 'BLOCKED', 'FAIL'];
const inventory = JSON.parse(readFileSync(new URL('../docs/governance/mp-pr-00/requirements.json', import.meta.url), 'utf8'));
const known = new Set((inventory.requirements ?? inventory).map(requirement => requirement.id));
const NOT_REAL = /QA archive|fixture|synthetic|seeded|test database|^none\b|^—$/i;
const NO_EVIDENCE = /^(—|none)$/i;

export function parseMatrix(text) {
  const section = text.slice(text.indexOf('## Matrix'), text.indexOf('## How a verdict changes'));
  return section.split('\n').filter(line => line.startsWith('| ') && !line.startsWith('| Feature') && !line.startsWith('|---'))
    .map(line => line.slice(2, -2).split(' | ').map(cell => cell.trim()));
}

// Every problem of a matrix, as messages; an empty list means the matrix is valid.
export function matrixProblems(text) {
  const problems = [];
  const rows = parseMatrix(text);
  if (rows.length < 20) problems.push(`only ${rows.length} rows`);
  for (const row of rows) {
    const [feature, requirements, , data, tests, evidence, deterministic, real] = row;
    if (row.length !== 8) { problems.push(`${feature}: ${row.length} cells`); continue; }
    // A verdict is exactly one of the six; only BLOCKED may carry a cause, in brackets.
    for (const [column, verdict] of [['deterministic', deterministic], ['real-data', real]]) {
      const blocked = /^BLOCKED \(.+\)$/.test(verdict);
      if (!VERDICTS.includes(verdict) && !blocked) problems.push(`${feature}: ${column} verdict «${verdict}» is not one of the six`);
      if (verdict === 'BLOCKED') problems.push(`${feature}: ${column} block without its cause`);
    }
    if (deterministic === 'REAL DATA PASS') problems.push(`${feature}: a real-data pass in the deterministic column`);
    if (real === 'REAL DATA PASS' && NOT_REAL.test(data)) problems.push(`${feature}: a real-data pass on «${data}»`);
    if (real === 'REAL DATA PASS' && NO_EVIDENCE.test(evidence)) problems.push(`${feature}: a real-data pass without evidence`);
    if (deterministic === 'DETERMINISTIC TEST PASS' && /^(none|—)/i.test(tests)) problems.push(`${feature}: a deterministic pass without tests`);
    if (deterministic === 'DETERMINISTIC TEST PASS' && NO_EVIDENCE.test(evidence)) problems.push(`${feature}: a deterministic pass without evidence`);
    // Requirement ids: well formed, and every one named (both ends of a range) is in the inventory.
    for (const token of requirements.match(/MP-[A-Z]+-[0-9A-Za-z]+/g) ?? []) {
      if (!/^MP-[A-Z]+-\d{3}$/.test(token)) problems.push(`${feature}: malformed requirement id ${token}`);
    }
    for (const [, group, from, to = from] of requirements.matchAll(/MP-([A-Z]+)-(\d{3})(?:…(\d{3}))?/g)) {
      for (const n of new Set([from, to])) if (!known.has(`MP-${group}-${n}`)) problems.push(`${feature}: MP-${group}-${n} is not in the inventory`);
    }
  }
  for (const verdict of VERDICTS) if (!text.includes(`| \`${verdict}\` |`)) problems.push(`${verdict} is not defined`);
  return problems;
}

const matrix = readFileSync(new URL('../docs/governance/certifiability-matrix.md', import.meta.url), 'utf8');

test('certifiability matrix: the committed matrix has no problem', () => {
  assert.deepEqual(matrixProblems(matrix), []);
});

test('certifiability matrix: every tampering the review found is refused', () => {
  const row = feature => matrix.split('\n').find(line => line.startsWith(`| ${feature} |`));
  const tamper = (feature, edit) => matrix.replace(row(feature), edit(row(feature)));
  const cases = [
    ['a decorated real-data pass on the QA archive', tamper('Visual conformity and states', line => line.replace(/\| NOT VERIFIED \|$/, '| REAL DATA PASS (on fixtures) |')), /not one of the six/],
    ['a real-data pass on the QA archive', tamper('Daily Board (Oggi)', line => line.replace(/\| NOT VERIFIED \|$/, '| REAL DATA PASS |')), /real-data pass on «QA archive/],
    ['a real-data pass on synthetic vectors', tamper('Trading Tools (#94)', line => line.replace(/\| NOT VERIFIED \|$/, '| REAL DATA PASS |')), /real-data pass on «synthetic/],
    ['a real-data pass without evidence', tamper('Indicator Library', line => line.replace('| — | none | — | FAIL | NOT VERIFIED |', '| real archive | none | — | FAIL | REAL DATA PASS |')), /without evidence/],
    ['a real-data pass in the deterministic column', tamper('Ricerca', line => line.replace('| DETERMINISTIC TEST PASS |', '| REAL DATA PASS |')), /deterministic column/],
    ['a deterministic pass without tests', tamper('Match Replay (#24)', line => line.replace('| FAIL | BLOCKED', '| DETERMINISTIC TEST PASS | BLOCKED')), /deterministic pass without tests/],
    ['a malformed requirement id', tamper('Strategy Lab (#34)', line => line.replace('MP-STA-001', 'MP-STA-1')), /malformed requirement id MP-STA-1/],
    ['an unknown requirement', tamper('Ricerca', line => line.replace('MP-WEB-007', 'MP-WEB-099')), /MP-WEB-099 is not in the inventory/],
    ['a block without its cause', tamper('Backtest', line => line.replace(/\| BLOCKED \(.*\) \|$/, '| BLOCKED |')), /block without its cause/],
    ['an unknown verdict', tamper('MCP', line => line.replace(/\| NOT VERIFIED \|$/, '| CERTIFIED |')), /not one of the six/],
  ];
  for (const [what, text, expected] of cases) {
    assert.notEqual(text, matrix, `${what}: the tampering applies`);
    assert.match(matrixProblems(text).join('\n'), expected, what);
  }
});
