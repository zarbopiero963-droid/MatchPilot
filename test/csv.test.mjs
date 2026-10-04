import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv } from '../src/lib/csv.mjs';

test('CSV parser preserves quoted commas, quotes and trailing empty cells', () => {
  const csv='Id,Home,Note,Empty\n1,"Team, A","He said ""go""",\n';
  const out=parseCsv(csv);
  assert.deepEqual(out.headers,['Id','Home','Note','Empty']);
  assert.deepEqual(out.rows,[{Id:'1',Home:'Team, A',Note:'He said "go"',Empty:''}]);
});
