import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolveDate} from '../src/signals/schedule.mjs';

test('relative days are Europe/Rome calendar days', () => {
  // 23:30 UTC on 21 Oct is already 22 Oct in Rome (UTC+2).
  const now = new Date('2026-10-21T23:30:00Z');
  assert.equal(resolveDate('today', now), '2026-10-22');
  assert.equal(resolveDate('yesterday', now), '2026-10-21');
});
test('DST changes and month/year boundaries', () => {
  assert.equal(resolveDate('yesterday', new Date('2026-03-29T05:00:00Z')), '2026-03-28');
  assert.equal(resolveDate('yesterday', new Date('2026-10-25T23:30:00Z')), '2026-10-25');
  assert.equal(resolveDate('yesterday', new Date('2027-01-01T00:30:00Z')), '2026-12-31');
});
test('explicit dates are validated strictly', () => {
  assert.equal(resolveDate('2026-09-19'), '2026-09-19');
  assert.equal(resolveDate(' 2024-02-29 '), '2024-02-29');
  for (const bad of ['2026-02-30', '2026-13-01', '19-09-2026', 'tomorrow', '', null, undefined, '2026-09-19; rm']) assert.equal(resolveDate(bad), null, String(bad));
});
