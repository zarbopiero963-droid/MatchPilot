// The certifiability matrix (MP-OWNER-CONTINUOUS-EXECUTION-02 §4). Allowed values, not forbidden words (PR #175 review
// NB-1): verdicts from the six only, requirement ids that exist, a real-data pass only on the real archive with an existing
// audit package, a deterministic pass or partial coverage only with test files that exist, and exactly the listed features.
import assert from 'node:assert/strict';
import {existsSync, readFileSync, readdirSync} from 'node:fs';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const VERDICTS = ['REAL DATA PASS', 'DETERMINISTIC TEST PASS', 'PARTIAL COVERAGE', 'NOT VERIFIED', 'BLOCKED', 'FAIL'];
export const FEATURES = ['Daily Board (Oggi)', 'Ricerca', 'Area Dati (Stato dei dati, Fornitori, API)', 'Visual conformity and states',
  'Match Center, pre-match (R-07a)', 'Match Center, finished match (#25)', 'Match Replay (#24)', 'Live Trading Board (#29)', 'Trading Tools (#94)',
  'Strategy Lab (#34)', 'Indicator Library', 'Trading Decision Engine (#28)', 'Money Management (#96)', 'Backtest', 'Paper Trading',
  'Settlement and ledger (#99, #100)', 'Trading Copilot (#102)', 'API v1 (#98)', 'MCP', 'Administration and settings',
  'FutPythonTrader ingestion', 'TotalCorner collectors', 'Archive #40'];
const inventory = JSON.parse(readFileSync(new URL('../docs/governance/mp-pr-00/requirements.json', import.meta.url), 'utf8'));
const known = new Set((inventory.requirements ?? inventory).map(requirement => requirement.id));
const REAL_SOURCE = /archive #40|real provider data/i;
const NOT_REAL = /QA[\s-]*archive|fixture|synthetic|mock|seeded|test database|sample data/i;

// A path in backticks that exists in the repository; a * in its last segment matches any entry of that directory.
const exists = path => {
  if (!path.includes('*')) return existsSync(`${root}${path}`);
  const slash = path.lastIndexOf('/');
  const dir = `${root}${path.slice(0, slash)}`;
  const pattern = new RegExp(`^${path.slice(slash + 1).split('*').map(part => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
  return existsSync(dir) && readdirSync(dir).some(name => pattern.test(name));
};
const paths = cell => [...cell.matchAll(/`([^`]+)`/g)].map(match => match[1]);
const testPaths = cell => paths(cell).filter(path => /^(test|tools)\//.test(path));

export function parseMatrix(text) {
  const start = text.indexOf('## Matrix');
  const end = text.indexOf('## How a verdict changes');
  const section = start >= 0 && end > start ? text.slice(start, end) : '';
  // Every line starting with a pipe is a row, whatever its spacing; the header and the separator are not.
  return section.split('\n').filter(line => line.trimStart().startsWith('|'))
    .map(line => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim()))
    .filter(cells => cells[0] !== 'Feature' && !/^-+$/.test(cells[0]));
}

// Every problem of a matrix, as messages; an empty list means the matrix is valid.
export function matrixProblems(text) {
  const problems = [];
  const rows = parseMatrix(text);
  const names = rows.map(row => row[0]);
  if (JSON.stringify(names) !== JSON.stringify(FEATURES)) problems.push(`the features are not exactly the listed ones: ${names.join('; ')}`);
  for (const row of rows) {
    const [feature, requirements, , data, tests, evidence, deterministic, real] = row;
    if (row.length !== 8) { problems.push(`${feature}: ${row.length} cells`); continue; }
    for (const [column, verdict] of [['deterministic', deterministic], ['real-data', real]]) {
      if (!VERDICTS.includes(verdict) && !/^BLOCKED \([^()\s][^()]*\)$/.test(verdict)) problems.push(`${feature}: ${column} verdict «${verdict}» is not one of the six`);
      if (verdict === 'BLOCKED') problems.push(`${feature}: ${column} block without its cause`);
    }
    if (deterministic === 'REAL DATA PASS') problems.push(`${feature}: a real-data pass in the deterministic column`);
    if (real === 'REAL DATA PASS') {
      if (!REAL_SOURCE.test(data) || NOT_REAL.test(data)) problems.push(`${feature}: a real-data pass on «${data}»`);
      const audits = paths(evidence).filter(path => path.startsWith('docs/audits/'));
      if (audits.length === 0 || !audits.every(exists)) problems.push(`${feature}: a real-data pass without an existing audit package`);
    }
    if (['DETERMINISTIC TEST PASS', 'PARTIAL COVERAGE'].includes(deterministic)) {
      const files = testPaths(tests);
      if (files.length === 0) problems.push(`${feature}: a ${deterministic.toLowerCase()} without a test file`);
      for (const file of files) if (!exists(file)) problems.push(`${feature}: ${file} does not exist`);
    }
    // Requirement ids: any token that looks like one, in any case, must be well formed and in the inventory.
    for (const token of requirements.match(/mp-[a-z]+-[0-9a-z]+/gi) ?? []) {
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

test('certifiability matrix: every tampering the reviews found is refused', () => {
  const row = feature => matrix.split('\n').find(line => line.startsWith(`| ${feature} |`));
  const tamper = (feature, edit) => matrix.replace(row(feature), edit(row(feature)));
  const real = (feature, data, evidence) => tamper(feature, line => {
    const cells = line.slice(2, -2).split(' | ');
    cells[3] = data; cells[5] = evidence; cells[7] = 'REAL DATA PASS';
    return `| ${cells.join(' | ')} |`;
  });
  const cases = [
    ['a decorated real-data pass', tamper('Visual conformity and states', line => line.replace(/\| NOT VERIFIED \|$/, '| REAL DATA PASS (on fixtures) |')), /not one of the six/],
    ['a real-data pass on the QA archive', real('Daily Board (Oggi)', 'QA archive', '`docs/audits/V-B4-DAILY-BOARD`'), /real-data pass on/],
    ['a real-data pass on the QA-archive with a hyphen', real('Daily Board (Oggi)', 'QA-archive and archive #40', '`docs/audits/V-B4-DAILY-BOARD`'), /real-data pass on/],
    ['a real-data pass on mock data', real('Ricerca', 'mock data', '`docs/audits/V-B4-DAILY-BOARD`'), /real-data pass on/],
    ['a real-data pass on synthetic vectors', real('Trading Tools (#94)', 'synthetic test vectors', '`docs/audits/V-B4-DAILY-BOARD`'), /real-data pass on/],
    ['a real-data pass without evidence', real('Indicator Library', 'archive #40', '—'), /without an existing audit package/],
    ['a real-data pass with pending evidence', real('Indicator Library', 'archive #40', 'pending'), /without an existing audit package/],
    ['a real-data pass with a missing audit package', real('Indicator Library', 'archive #40', '`docs/audits/NOT-THERE`'), /without an existing audit package/],
    ['a real-data pass in the deterministic column', tamper('Ricerca', line => line.replace('| DETERMINISTIC TEST PASS |', '| REAL DATA PASS |')), /deterministic column/],
    ['a deterministic pass without tests', tamper('Match Replay (#24)', line => line.replace('| FAIL | BLOCKED', '| DETERMINISTIC TEST PASS | BLOCKED')), /without a test file/],
    ['a deterministic pass with n/a tests', tamper('Strategy Lab (#34)', line => line.replace('| none | — | FAIL |', '| n/a | — | DETERMINISTIC TEST PASS |')), /without a test file/],
    ['a deterministic pass with a missing test', tamper('Ricerca', line => line.replace('`test/web-e2e.test.mjs`', '`test/not-there.test.mjs`')), /not-there.test.mjs does not exist/],
    ['a malformed requirement id', tamper('Strategy Lab (#34)', line => line.replace('MP-STA-001', 'MP-STA-1')), /malformed requirement id MP-STA-1/],
    ['a lower-case requirement id', tamper('MCP', line => line.replace('MP-API-005', 'mp-api-005')), /malformed requirement id mp-api-005/],
    ['an unknown requirement', tamper('Ricerca', line => line.replace('MP-WEB-007', 'MP-WEB-099')), /MP-WEB-099 is not in the inventory/],
    ['a block without its cause', tamper('Backtest', line => line.replace(/\| BLOCKED \(.*\) \|$/, '| BLOCKED |')), /block without its cause/],
    ['an empty block cause', tamper('Backtest', line => line.replace(/\| BLOCKED \(.*\) \|$/, '| BLOCKED () |')), /not one of the six/],
    ['an unknown verdict', tamper('MCP', line => line.replace(/\| NOT VERIFIED \|$/, '| CERTIFIED |')), /not one of the six/],
    ['a row without its leading space', tamper('Strategy Lab (#34)', line => line.replace('| Strategy Lab', '|Strategy Lab').replace(/\| NOT VERIFIED \|$/, '| CERTIFIED |')), /not one of the six/],
    ['a row removed', tamper('Paper Trading', () => ''), /not exactly the listed ones/],
  ];
  for (const [what, text, expected] of cases) {
    assert.notEqual(text, matrix, `${what}: the tampering applies`);
    assert.match(matrixProblems(text).join('\n'), expected, what);
  }
});
