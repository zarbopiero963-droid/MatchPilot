import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectDatasetCsv, phase3SqlGate, selectHardSample } from '../src/providers/futpython/integrity.mjs';
import { buildTeamEntities, normalizeTeamName } from '../src/providers/futpython/teams.mjs';
import { matchKey } from '../src/providers/futpython/identity.mjs';

test('csv audit reports malformed rows, width, identity and dates', () => {
  const malformed = inspectDatasetCsv('Home,Away,Date\n"Ajax,Benfica,2026-01-01\n', 'europe/demo/2026');
  assert.ok(malformed.malformed_csv > 0);

  const wide = inspectDatasetCsv('Home,Away,Date\nAjax,Benfica,2026-01-01,extra\n', 'europe/demo/2026');
  assert.equal(wide.header_row_mismatch, 1);
  assert.equal(wide.parser_rows, 1);

  const missing = inspectDatasetCsv('Home,Away,Date\n,Benfica,2026-01-01\n', 'europe/demo/2026');
  assert.equal(missing.missing_home, 1);

  const badDate = inspectDatasetCsv('Home,Away,Date\nAjax,Benfica,not-a-date\n', 'europe/demo/2026');
  assert.equal(badDate.date_parse_failures, 1);

  const empty = inspectDatasetCsv('Home,Away,Date\n', 'europe/demo/2026');
  assert.equal(empty.parser_rows, 0);
  assert.ok(empty.issues.some(issue => issue.code === 'empty_payload'));

  const dup = inspectDatasetCsv('Home,Away,Date\nAjax,Benfica,03/04/2026\nAjax,Benfica,03/04/2026\n', 'europe/demo/2026');
  assert.equal(dup.duplicate_match_keys, 1);
  assert.equal(dup.duplicate_payloads, 1);
  assert.equal(dup.date_parse_failures, 0);
});

test('Match_ID does not change the historical match key', () => {
  const row = {Match_ID: 'abc', Home: 'Ajax', Away: 'Benfica', Date: '03/04/2026'};
  assert.equal(matchKey(row, 'europe/champions-league/2024').startsWith('fpt:hash:'), true);
  assert.equal(matchKey({Id: 'abc', Home: 'Ajax', Away: 'Benfica'}, 'europe/x/2024'), 'fpt:id:abc');
});

test('hard sample covers countries, season shapes, small and large', () => {
  const datasets = [
    {dataset_key: 'a/small/2026', country_slug: 'argentina', season: '2026', row_count: 3},
    {dataset_key: 'b/large/2025-2026', country_slug: 'brazil', season: '2025-2026', row_count: 900},
    {dataset_key: 'c/old/2006', country_slug: 'world', season: '2006', row_count: 64},
    {dataset_key: 'd/cal/2024', country_slug: 'chile', season: '2024', row_count: 30},
    {dataset_key: 'e/split/2020-2021', country_slug: 'denmark', season: '2020-2021', row_count: 40},
    {dataset_key: 'f/more/2022', country_slug: 'argentina', season: '2022', row_count: 20},
    {dataset_key: 'g/more/2021-2022', country_slug: 'brazil', season: '2021-2022', row_count: 21},
    {dataset_key: 'h/more/2018', country_slug: 'world', season: '2018', row_count: 22},
    {dataset_key: 'i/more/2023', country_slug: 'chile', season: '2023', row_count: 23},
    {dataset_key: 'j/more/2019-2020', country_slug: 'denmark', season: '2019-2020', row_count: 24},
    {dataset_key: 'k/extra/2021', country_slug: 'ecuador', season: '2021', row_count: 25}
  ];
  const sample = selectHardSample(datasets);
  assert.equal(sample.length, 10);
  assert.equal(new Set(sample.map(row => row.country_slug)).size >= 3, true);
  assert.ok(sample.some(row => row.dataset_key === 'a/small/2026'));
  assert.ok(sample.some(row => row.dataset_key === 'b/large/2025-2026'));
  assert.ok(sample.some(row => /^\d{4}-\d{4}$/.test(row.season)));
  assert.ok(sample.some(row => /^\d{4}$/.test(row.season) && Number(row.season) >= 2020));
  assert.ok(sample.some(row => Number(row.season) < 2020));
});

test('case-only spellings share one internal team id', () => {
  const entities = buildTeamEntities([
    {country_slug: 'europe', competition_slug: 'conference-league', name: 'Ajax (NED)', seen: 4, first_seen: '2024-09-01', last_seen: '2024-11-01'},
    {country_slug: 'europe', competition_slug: 'europa-league', name: 'Ajax (Ned)', seen: 2, first_seen: '2023-09-01', last_seen: '2023-11-01'},
    {country_slug: 'netherlands', competition_slug: 'eredivisie', name: 'Ajax', seen: 9, first_seen: '2024-08-01', last_seen: '2025-05-01'},
    {country_slug: 'europe', competition_slug: 'champions-league', name: 'Benfica (POR)', seen: 3, first_seen: '2024-09-01', last_seen: '2024-11-01'}
  ]);
  const ajax = entities.filter(team => team.country_slug === 'europe' && normalizeTeamName(team.canonical_name) === normalizeTeamName('Ajax (NED)'));
  assert.equal(ajax.length, 1);
  assert.equal(ajax[0].aliases.length, 2);
  assert.equal(ajax[0].canonical_name, 'Ajax (NED)');
  assert.ok(ajax[0].aliases.some(alias => alias.name === 'Ajax (Ned)' && alias.kind === 'alias'));
  assert.notEqual(ajax[0].internal_team_id, entities.find(team => team.canonical_name.startsWith('Benfica')).internal_team_id);
  assert.notEqual(ajax[0].internal_team_id, entities.find(team => team.country_slug === 'netherlands').internal_team_id);
  assert.deepEqual(ajax[0].competitions, ['conference-league', 'europa-league']);
  assert.equal(ajax[0].first_seen, '2023-09-01');
  assert.equal(ajax[0].last_seen, '2024-11-01');
  assert.equal(ajax[0].provider_team_id, null);
  assert.equal(ajax[0].provenance.source_provider, 'futpythontrader');
});

test('a historical spelling can be attached without a second entity', () => {
  const [team] = buildTeamEntities([
    {country_slug: 'europe', competition_slug: 'champions-league', name: 'Ajax (NED)', seen: 2, first_seen: '2024-01-01', last_seen: '2024-02-01'},
    {country_slug: 'europe', competition_slug: 'champions-league', name: 'AFC Ajax', seen: 1, first_seen: '2018-01-01', last_seen: '2018-02-01', historical: true, links_to: 'Ajax (NED)'}
  ]);
  assert.equal(team.aliases.find(alias => alias.name === 'AFC Ajax').kind, 'historical');
  assert.equal(new Set(team.aliases.map(() => team.internal_team_id)).size, 1);
});

test('phase3 sql gate fails closed when a row gap remains', () => {
  const ok = {
    match_key_collisions: 0,
    provider_match_id_collisions: 0,
    orphan_versions: 0,
    orphan_snapshots: 0,
    snapshot_row_gaps: 0,
    missing_home: 0,
    missing_away: 0,
    missing_date: 0,
    date_parse_failures: 0
  };
  assert.equal(phase3SqlGate(ok), true);
  assert.equal(phase3SqlGate({...ok, snapshot_row_gaps: 6}), false);
});
