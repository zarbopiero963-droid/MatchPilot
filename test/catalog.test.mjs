import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCatalogHtml, extractSeasons, isCurrentSeason } from '../src/providers/futpython/catalog.mjs';

function row(country, league, seasons, exampleSeason) {
  return `<tr>
    <td><div>Country</div><div>${country}</div></td>
    <td><div>League</div><div>${league}</div></td>
    <td class="px-6 py-3 text-xs">${seasons}</td>
    <td><span>/api/download/${country}/${league}/${exampleSeason}</span></td>
  </tr>`;
}

test('season extractor supports calendar, split and sparse tournament seasons',()=>{
  assert.deepEqual(extractSeasons('2026, 2025, 2024'),['2026','2025','2024']);
  assert.deepEqual(extractSeasons('2026-2027, 2025-2026, 2021-2022'),
    ['2026-2027','2025-2026','2021-2022']);
  assert.deepEqual(extractSeasons('2020, 2016, 2012, 2008, 2004, 2000'),
    ['2020','2016','2012','2008','2004','2000']);
  assert.deepEqual(extractSeasons('2026-2027, 2026, 2025, 2024'),
    ['2026-2027','2026','2025','2024']);
});

test('catalog parser expands every season from official table rows',()=>{
  const html='<table><tbody>'+
    row('argentina','primera-nacional','2026, 2025, 2024, 2023, 2022, 2021','2026')+
    row('australia','a-league','2025-2026, 2024-2025, 2023-2024, 2022-2023, 2021-2022, 2020-2021','2025-2026')+
    row('europe','euro','2020, 2016, 2012, 2008, 2004, 2000','2020')+
    row('japan','j1-league','2026-2027, 2026, 2025, 2024, 2023, 2022, 2021','2026-2027')+
    '</tbody></table>';
  const rows=parseCatalogHtml(html);
  assert.equal(rows.length,25);
  assert.ok(rows.some(x=>x.datasetKey==='argentina/primera-nacional/2021'));
  assert.ok(rows.some(x=>x.datasetKey==='australia/a-league/2020-2021'));
  assert.ok(rows.some(x=>x.datasetKey==='europe/euro/2000'));
  assert.ok(rows.some(x=>x.datasetKey==='japan/j1-league/2026'));
  assert.ok(rows.some(x=>x.datasetKey==='japan/j1-league/2026-2027'));
});

test('catalog parser keeps route-only fallback and deduplicates',()=>{
  const html='<a>/api/download/spain/laliga2/2026-2027</a>'+
    '<a>/api/download/spain/laliga2/2026-2027</a>'+
    '<a>/api/download/brazil/serie-a/2026</a>';
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
