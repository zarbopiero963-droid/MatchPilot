import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCatalogHtml, isCurrentSeason } from '../src/providers/futpython/catalog.mjs';

test('catalog parser discovers and deduplicates dataset routes', () => {
  const html='<a>/api/download/spain/laliga2/2026-2027</a><a>/api/download/spain/laliga2/2026-2027</a><a>/api/download/brazil/serie-a/2026</a>';
  const rows=parseCatalogHtml(html);
  assert.equal(rows.length,2);
  assert.equal(rows[1].datasetKey,'spain/laliga2/2026-2027');
});

test('current season handles calendar and split-year leagues', () => {
  const october=new Date('2026-10-04T12:00:00Z');
  assert.equal(isCurrentSeason('2026',october),true);
  assert.equal(isCurrentSeason('2026-2027',october),true);
  assert.equal(isCurrentSeason('2025-2026',october),false);
  const feb=new Date('2027-02-01T12:00:00Z');
  assert.equal(isCurrentSeason('2026-2027',feb),true);
});
