import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildQuery, QueryInputError, QUERY_CATALOG, ROUTES, SEARCH_FILTERS, perfInputs, ASSISTANT_PERF_QUERIES } from '../src/providers/futpython/query.mjs';
import { assistantChecks } from '../src/futpython-certificate.mjs';

const TEAM = 'fpt:team:' + 'a'.repeat(24);
const COMP = 'fpt:competition:' + 'b'.repeat(32);
const SEASON = 'fpt:season:' + 'c'.repeat(32);

test('away matches, odds range and combined search build parameterized SQL only', () => {
  const away = buildQuery('awayMatches', {team: TEAM, before: '2025-01-01'});
  assert.match(away.sql, /WHERE away_team_id = \$1/);
  assert.deepEqual(away.values, [TEAM, '2025-01-01', 20]);
  const venue = buildQuery('teamMatches', {team: TEAM, venue: 'home', before: '2025-01-01'});
  assert.match(venue.sql, /WHERE home_team_id = \$1/);
  assert.throws(() => buildQuery('teamMatches', {team: TEAM, venue: 'x'}), QueryInputError);

  const odds = buildQuery('favoriteOddsRange', {min: '1.50', max: '1.90', side: 'home', before: '2025-01-01'});
  assert.deepEqual(odds.filters_applied, ['before', 'fav_min', 'fav_max', 'fav_side']);
  assert.ok(odds.values.includes(1.5) && odds.values.includes(1.9) && odds.values.includes('HOME'));
  assert.throws(() => buildQuery('favoriteOddsRange', {min: 1.9}), QueryInputError);
  assert.throws(() => buildQuery('favoriteOddsRange', {min: 0, max: 2}), QueryInputError);
  assert.throws(() => buildQuery('searchMatches', {fav_min: 2, fav_max: 1.5}), QueryInputError);

  const search = buildQuery('searchMatches', {
    competition: COMP, season: SEASON, team: TEAM, venue: 'away', fav_min: 1.2, fav_max: 3,
    result: 'final', min_goals: 2, before: '2025-01-01', limit: 10
  });
  assert.ok(search.filters_applied.length >= 8);
  assert.equal(/'|;/.test(search.sql), false, 'no literal reaches the SQL text');
  assert.equal(search.sql.includes(TEAM), false, 'ids are bound, never inlined');
  assert.throws(() => buildQuery('searchMatches', {venue: 'home'}), QueryInputError);
  assert.throws(() => buildQuery('searchMatches', {result: 'WON'}), QueryInputError);
  assert.throws(() => buildQuery('searchMatches', {competition: "x' OR 1=1 --"}), QueryInputError);
});

test('xg by season, point in time and coverage validate their inputs', () => {
  assert.equal(buildQuery('xgBySeason', {team: TEAM}).scope, 'team');
  assert.equal(buildQuery('xgBySeason', {competition: COMP}).scope, 'competition');
  assert.throws(() => buildQuery('xgBySeason', {}), QueryInputError);
  assert.throws(() => buildQuery('xgBySeason', {team: TEAM, competition: COMP}), QueryInputError);
  const pit = buildQuery('teamMatchesAsOf', {team: TEAM, as_of: '2025-06-01T12:00:00+02:00', before: '2025-06-01'});
  assert.equal(pit.values[1], '2025-06-01T10:00:00.000Z');
  assert.match(pit.sql, /v\.acquired_at <= \$2::timestamptz/);
  assert.throws(() => buildQuery('teamMatchesAsOf', {team: TEAM, as_of: '2025-06-01'}), QueryInputError);
  assert.throws(() => buildQuery('leagueFieldCoverage', {field: 'xG; DROP'}), QueryInputError);
  assert.throws(() => buildQuery('leaguesWithCoverage', {field: 'xG_Home_FT', min_ratio: 2}), QueryInputError);
});

test('the catalog describes every route for Copilot and stays DB-only', () => {
  const routed = new Set(Object.values(ROUTES));
  for (const entry of QUERY_CATALOG) {
    assert.ok(routed.has(entry.name), entry.name);
    assert.equal(ROUTES[entry.route], entry.name);
    assert.ok(entry.rules.some(r => r.includes('nessuna chiamata')));
  }
  assert.ok(Object.keys(SEARCH_FILTERS).length >= 10);
  const source = readFileSync(new URL('../src/providers/futpython/query.mjs', import.meta.url), 'utf8');
  assert.equal(/client\.mjs|fetch\(|budget\.mjs/.test(source), false);
  const inputs = perfInputs({team_id: TEAM, opponent_id: TEAM, internal_competition_id: COMP, season_id: SEASON,
    match_date: '2024-01-01', internal_match_id: 'fpt:hash:abc', normalized_name: 'ajax',
    xg_team_id: TEAM, xg_competition_id: COMP, xg_season_id: SEASON});
  assert.ok(inputs.length >= 15);
  for (const name of ASSISTANT_PERF_QUERIES) assert.ok(inputs.some(([n]) => n === name), name);
});

test('assistant checks look at the returned rows, not only at counts', () => {
  const base = {upstream_calls: 0};
  const away = {...base, name: 'awayMatches', input: {team: TEAM}, rows: Array.from({length: 20}, () => ({away_team_id: TEAM, match_date: '2024-01-01'}))};
  const odds = {...base, name: 'favoriteOddsRange', rows: [{favorite_odd: '1.62', match_date: '2024-01-01'}]};
  const xg = {...base, name: 'xgBySeason', rows: [{matches: 10, matches_with_xg: 4}]};
  const search = {...base, name: 'searchMatches', filters_applied: ['before', 'team', 'venue:home', 'competition', 'season', 'result'],
    input: {team: TEAM, competition: COMP, season: SEASON},
    rows: [{home_team_id: TEAM, result_status: 'FINAL', internal_competition_id: COMP, season_id: SEASON, match_date: '2024-01-01'}]};
  const pitRows = [{acquired_at: '2024-06-01T00:00:00Z'}];
  const pit = {...base, name: 'teamMatchesAsOf', as_of: '2025-01-01T00:00:00Z', rows: pitRows};
  const pitRepeat = {...base, name: 'teamMatchesAsOfRepeat', rows: pitRows};
  const pitEmpty = {...base, name: 'teamMatchesAsOfBeforeMirror', rows: []};
  const leagues = {...base, name: 'leaguesWithCoverage', rows: [{seasons_meeting_coverage: 3}]};
  const all = [away, odds, xg, search, pit, pitRepeat, pitEmpty, leagues];
  assert.equal(assistantChecks(all, {before: '2100-01-01'}).gate, true);
  const badOdds = {...odds, rows: [{favorite_odd: '2.10', match_date: '2024-01-01'}]};
  assert.equal(assistantChecks([away, badOdds, xg, search, pit, pitRepeat, pitEmpty, leagues], {before: '2100-01-01'}).checks.favorite_150_190, false);
  const leak = {...away, rows: away.rows.map(r => ({...r, match_date: '2100-01-02'}))};
  assert.equal(assistantChecks([leak, odds, xg, search, pit, pitRepeat, pitEmpty, leagues], {before: '2100-01-01'}).checks.away_last_20, false);
  const fourFilters = {...search, filters_applied: ['before', 'team', 'venue:home', 'competition']};
  assert.equal(assistantChecks([away, odds, xg, fourFilters, pit, pitRepeat, pitEmpty, leagues], {before: '2100-01-01'}).checks.five_plus_filters, false);
  const future = {...pit, rows: [{acquired_at: '2026-01-01T00:00:00Z'}]};
  assert.equal(assistantChecks([away, odds, xg, search, future, {...pitRepeat, rows: future.rows}, pitEmpty, leagues], {before: '2100-01-01'}).checks.point_in_time, false);
  assert.equal(assistantChecks([away, odds, xg, search, pit, pitRepeat, pitEmpty, leagues, {...base, name: 'x', upstream_calls: 1, rows: []}], {before: '2100-01-01'}).checks.no_upstream, false);
});

const databaseUrl = process.env.FUTPYTHON_TEST_DATABASE_URL
  || 'postgres://matchpilot:matchpilot_local_test@127.0.0.1:5432/matchpilot_fpt';
const SCHEMA = 'fpt_assistant_test';
const TEAMS = ['Ajax', 'PSV', 'Feyenoord', 'AZ', 'Twente', 'Utrecht'];
const HEADERS = ['Date', 'Time', 'Home', 'Away', 'Home_Score', 'Away_Score', 'Odd_1_FT', 'Odd_X_FT', 'Odd_2_FT',
  'Over_FT_2_5', 'BTTS_Yes', 'xG_Home_FT', 'xG_Away_FT'];

function seasonRows(year, withXg) {
  const rows = [];
  let day = 0;
  for (const home of TEAMS) {
    for (const away of TEAMS) {
      if (home === away) continue;
      day++;
      const d = new Date(Date.UTC(year, 7, 1) + day * 86400000).toISOString().slice(0, 10);
      const hs = (home.length + day) % 4;
      const as = (away.length + day) % 3;
      const oddHome = (1.3 + (day % 9) * 0.15).toFixed(2);
      rows.push({
        Date: d, Time: '20:00', Home: home, Away: away, Home_Score: String(hs), Away_Score: String(as),
        Odd_1_FT: day % 11 === 0 ? '0' : oddHome, Odd_X_FT: '3.40', Odd_2_FT: (6.2 - Number(oddHome)).toFixed(2),
        Over_FT_2_5: '1.90', BTTS_Yes: '1.80',
        xG_Home_FT: withXg ? (hs * 0.8 + 0.3).toFixed(2) : '', xG_Away_FT: withXg ? (as * 0.7 + 0.2).toFixed(2) : ''
      });
    }
  }
  return rows;
}

function csv(rows) {
  return HEADERS.join(',') + '\n' + rows.map(r => HEADERS.map(h => r[h] ?? '').join(',')).join('\n') + '\n';
}

test('assistant queries answer from Postgres with indexes and point-in-time', {timeout: 90000}, async t => {
  let pg;
  try {
    pg = (await import('pg')).default;
    const admin = new pg.Client({connectionString: databaseUrl});
    await admin.connect();
    await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await admin.query(`CREATE SCHEMA ${SCHEMA}`);
    await admin.end();
  } catch {
    if (process.env.CI) throw new Error('throwaway postgres unavailable');
    return t.skip('throwaway postgres unavailable');
  }
  const url = new URL(databaseUrl);
  url.searchParams.set('options', `-c search_path=${SCHEMA}`);
  process.env.DATABASE_URL = url.toString();
  const db = await import('../src/db.mjs');
  const { migrate } = await import('../src/migrate.mjs');
  const store = await import('../src/providers/futpython/store.mjs');
  const teams = await import('../src/providers/futpython/teams.mjs');
  const query = await import('../src/providers/futpython/query.mjs');
  const { parseCsv } = await import('../src/lib/csv.mjs');
  try {
    await migrate();
    await db.withClient(async client => {
      const seasons = [['2023-2024', 2023, false, '2024-06-01T00:00:00Z'], ['2024-2025', 2024, true, '2025-06-01T00:00:00Z']];
      for (const [season, year, withXg, acquired] of seasons) {
        const key = `netherlands/eredivisie/${season}`;
        const text = csv(seasonRows(year, withXg));
        const parsed = parseCsv(text);
        await client.query(`INSERT INTO fpt_catalog(dataset_key,country_slug,league_slug,season,route) VALUES($1,'netherlands','eredivisie',$2,$3)`,
          [key, season, `/api/download/${key}`]);
        await store.storeDataset(client, {datasetKey: key, sourceKind: 'dataset', providerPath: `/api/download/${key}`,
          countrySlug: 'netherlands', leagueSlug: 'eredivisie', season, text, headers: parsed.headers, rows: parsed.rows,
          acquiredAt: new Date(acquired)});
      }
      await teams.replaceTeamEntities(client, teams.buildTeamEntities(await teams.loadTeamSpellings(client)));
      await query.refreshNormalizedLayer(client);
      const facts = (await client.query(`SELECT count(*)::int AS n, count(favorite_odd)::int AS fav, count(xg_home)::int AS xg,
        count(*) FILTER (WHERE odd_home IS NULL)::int AS odd_missing, max(facts_version) AS v FROM fpt_match_facts`)).rows[0];
      assert.deepEqual({n: facts.n, xg: facts.xg, v: facts.v}, {n: 60, xg: 30, v: 'fpt-facts-2'});
      assert.ok(facts.odd_missing > 0, 'a market 0 is N/D, not a price');
      assert.equal(facts.fav, 60 - facts.odd_missing);

      const comp = (await client.query('SELECT DISTINCT internal_competition_id AS c FROM fpt_match_facts')).rows[0].c;
      const seasonIds = (await client.query('SELECT season, season_id FROM fpt_match_facts GROUP BY 1, 2 ORDER BY 1')).rows;
      for (const s of seasonIds) {
        await client.query(`INSERT INTO fpt_competition_season(dataset_key, internal_competition_id, country_slug, league_slug,
          canonical_league_name, season, match_count, coverage_status, fields_available, historical_complete, prematch_available)
          VALUES ($1,$2,'netherlands','eredivisie','eredivisie',$3,30,'AVAILABLE',13,false,true)`,
          [`netherlands/eredivisie/${s.season}`, comp, s.season]);
        const ratio = s.season === '2024-2025' ? 1 : 0;
        await client.query(`INSERT INTO fpt_field_coverage(dimension, dimension_key, field_name, rows_scoped, nonempty_rows, coverage_ratio)
          VALUES ('dataset',$1,'xG_Home_FT',30,$2,$3)`, [`netherlands/eredivisie/${s.season}`, ratio * 30, ratio]);
      }

      const ajax = (await query.runQuery(client, 'teamSearch', {q: 'Ajax'})).rows[0].internal_team_id;
      const away = await query.runQuery(client, 'awayMatches', {team: ajax, before: '2100-01-01', limit: 20});
      assert.equal(away.rows.length, 10, 'Ajax plays 5 away games per season');
      assert.ok(away.rows.every(r => r.away_team_id === ajax));
      assert.equal(away.provenance.upstream_calls, 0);
      const cut = await query.runQuery(client, 'awayMatches', {team: ajax, before: '2024-08-01'});
      assert.equal(cut.rows.length, 5, 'strictly before the cut-off date');

      const odds = await query.runQuery(client, 'favoriteOddsRange', {min: 1.5, max: 1.9, before: '2100-01-01', limit: 500});
      assert.ok(odds.rows.length > 0);
      assert.ok(odds.rows.every(r => Number(r.favorite_odd) >= 1.5 && Number(r.favorite_odd) <= 1.9));
      const expectOdds = (await client.query(`SELECT count(*)::int AS n FROM fpt_match_facts WHERE favorite_odd BETWEEN 1.5 AND 1.9`)).rows[0].n;
      assert.equal(odds.rows.length, expectOdds);

      const xgTeam = await query.runQuery(client, 'xgBySeason', {team: ajax, before: '2100-01-01'});
      assert.deepEqual(xgTeam.rows.map(r => [r.season, r.matches, r.matches_with_xg]), [['2023-2024', 10, 0], ['2024-2025', 10, 10]]);
      assert.equal(xgTeam.rows[0].xg_for_avg, null, 'no xG is never shown as 0');
      const xgComp = await query.runQuery(client, 'xgBySeason', {competition: comp, before: '2100-01-01'});
      assert.equal(xgComp.rows.length, 2);

      const search = await query.runQuery(client, 'searchMatches', {competition: comp, season: seasonIds[1].season_id, team: ajax,
        venue: 'home', fav_min: 1.01, fav_max: 10, result: 'FINAL', before: '2100-01-01', limit: 50});
      assert.ok(search.provenance.filters_applied.length >= 7);
      assert.ok(search.rows.length > 0 && search.rows.every(r => r.home_team_id === ajax && r.season_id === seasonIds[1].season_id));

      const pitBetween = await query.runQuery(client, 'teamMatchesAsOf', {team: ajax, as_of: '2025-01-01T00:00:00Z', before: '2100-01-01', limit: 500});
      assert.equal(pitBetween.rows.length, 10, 'only the season acquired before as_of is known');
      assert.ok(pitBetween.rows.every(r => new Date(r.acquired_at) <= new Date('2025-01-01T00:00:00Z')));
      const pitAll = await query.runQuery(client, 'teamMatchesAsOf', {team: ajax, as_of: '2026-01-01T00:00:00Z', before: '2100-01-01', limit: 500});
      assert.equal(pitAll.rows.length, 20);
      const pitNone = await query.runQuery(client, 'teamMatchesAsOf', {team: ajax, as_of: '2000-01-01T00:00:00Z', before: '2100-01-01'});
      assert.equal(pitNone.rows.length, 0);

      const coverage = await query.runQuery(client, 'leagueFieldCoverage', {field: 'xG_Home_FT', competition: comp});
      assert.deepEqual(coverage.rows.map(r => [r.season, Number(r.coverage_ratio)]), [['2023-2024', 0], ['2024-2025', 1]]);
      const leagues1 = await query.runQuery(client, 'leaguesWithCoverage', {field: 'xG_Home_FT', min_ratio: 0.9, min_seasons: 1});
      assert.equal(leagues1.rows.length, 1);
      const leagues2 = await query.runQuery(client, 'leaguesWithCoverage', {field: 'xG_Home_FT', min_ratio: 0.9, min_seasons: 2});
      assert.equal(leagues2.rows.length, 0);

      const catalog = await query.runQuery(client, 'catalog', {});
      assert.ok(catalog.rows.length >= 16);

      const perf = await query.runPerfGate(client);
      assert.equal(perf.sample_found, true);
      assert.ok(perf.queries.length >= 15);
      assert.ok(perf.combined_filter_count >= 5);
      assert.ok(perf.queries.every(q => Number.isFinite(q.execution_ms)));
    });
  } finally {
    await db.closePool();
    const admin = new pg.Client({connectionString: databaseUrl});
    await admin.connect();
    await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await admin.end();
  }
});
