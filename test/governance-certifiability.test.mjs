// The certifiability matrix (MP-OWNER-CONTINUOUS-EXECUTION-02 §4): only the six verdicts, only requirements that exist,
// and never a real-data pass on fixture data alone.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const VERDICTS = ['REAL DATA PASS', 'DETERMINISTIC TEST PASS', 'PARTIAL COVERAGE', 'NOT VERIFIED', 'BLOCKED', 'FAIL'];
const matrix = readFileSync(new URL('../docs/governance/certifiability-matrix.md', import.meta.url), 'utf8');
const inventory = JSON.parse(readFileSync(new URL('../docs/governance/mp-pr-00/requirements.json', import.meta.url), 'utf8'));
const known = new Set((inventory.requirements ?? inventory).map(requirement => requirement.id));

const section = matrix.slice(matrix.indexOf('## Matrix'), matrix.indexOf('## How a verdict changes'));
const rows = section.split('\n').filter(line => line.startsWith('| ') && !line.startsWith('| Feature') && !line.startsWith('|---'))
  .map(line => line.slice(2, -2).split(' | ').map(cell => cell.trim()));

test('certifiability matrix: every row has 8 cells and two verdicts from the allowed list', () => {
  assert.ok(rows.length >= 20, `rows: ${rows.length}`);
  for (const row of rows) {
    assert.equal(row.length, 8, row[0]);
    const [deterministic, real] = row.slice(6);
    assert.ok(VERDICTS.includes(deterministic), `${row[0]}: deterministic verdict «${deterministic}»`);
    assert.ok(VERDICTS.some(verdict => real === verdict || real.startsWith(`${verdict} (`)), `${row[0]}: real-data verdict «${real}»`);
    if (real.startsWith('BLOCKED')) assert.match(real, /^BLOCKED \(.+\)$/, `${row[0]}: a block names its blocker`);
  }
});

test('certifiability matrix: requirements exist in the inventory, ranges included', () => {
  for (const row of rows) {
    for (const match of row[1].matchAll(/MP-([A-Z]+)-(\d{3})(?:…(\d{3}))?/g)) {
      const [, group, from, to = from] = match;
      for (let n = Number(from); n <= Number(to); n++) {
        const id = `MP-${group}-${String(n).padStart(3, '0')}`;
        if (n === Number(from) || n === Number(to)) assert.ok(known.has(id), `${row[0]}: ${id} is not in the inventory`);
      }
    }
  }
});

test('certifiability matrix: no real-data pass on the QA archive or without evidence', () => {
  for (const row of rows) {
    if (row[7] !== 'REAL DATA PASS') continue;
    assert.doesNotMatch(row[3], /^QA archive\b|^none|^—/, `${row[0]}: a real-data pass needs real data`);
    assert.notEqual(row[5], '—', `${row[0]}: a real-data pass needs evidence`);
  }
  for (const verdict of VERDICTS) assert.ok(matrix.includes(`| \`${verdict}\` |`), `${verdict} is defined`);
});
