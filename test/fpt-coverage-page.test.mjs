import test from 'node:test';
import assert from 'node:assert/strict';
import { renderCoverageCompetitions, renderCoverageSeasons } from '../src/coverage-page.mjs';
import { buildQuery } from '../src/providers/futpython/query.mjs';

test('coverage page lists leagues with seasons, matches, coverage and the FPT/TC overlap stated as unavailable', () => {
  const html = renderCoverageCompetitions([{country_slug: 'italy', league_slug: 'serie-a', provider: 'futpythontrader',
    first_season: '2019-2020', last_season: '2026-2027', seasons_with_data: 7, seasons_listed: 8, seasons_unavailable_404: 1,
    matches: 2660, coverage_status: 'AVAILABLE', odds_coverage: '0.9950', xg_coverage: '0.5000', season_gaps: 0, seasons_in_onboarding: 0}],
  {country: '<script>'});
  assert.match(html, /<title>Data Coverage — Competizioni<\/title>/);
  assert.match(html, /href="\/coverage\?country=italy&amp;league=serie-a">serie-a<\/a>/);
  assert.match(html, /2019-2020<\/td><td>2026-2027/);
  assert.match(html, /7 \/ 8/);
  assert.match(html, /99\.5%/);
  assert.match(html, /non disponibile \(#20\)/);
  assert.equal(html.includes('<script>'), false, 'filter values are escaped');
});

test('league drill-down shows every season, unpublished gaps included', () => {
  const html = renderCoverageSeasons('italy', 'serie-a', [
    {season: '2019-2020', availability: 'available', classification: 'AVAILABLE', onboarding_state: 'ACTIVE', matches: 380,
      first_date: '2019-08-24', last_date: '2020-08-02', odds_coverage: '1.0000', xg_coverage: null, fields_available: 120,
      last_success_at: '2026-10-04T15:00:00Z', gap: false},
    {season: '2020-2021', availability: null, classification: null, onboarding_state: null, matches: 0, gap: true}
  ]);
  assert.match(html, /2019-08-24/);
  assert.match(html, /N\/D/);
  assert.match(html, /non pubblicata/);
  assert.match(html, /buco/);
});

test('coverage queries bind every filter as a parameter and reject unsafe slugs', () => {
  const q = buildQuery('coverageCompetitions', {country: 'italy', min_seasons: '3', min_matches: '100', min_odds_coverage: '0.9'});
  assert.deepEqual(q.values, ['italy', 3, 100, 0.9, 500]);
  assert.throws(() => buildQuery('coverageSeasons', {country: "italy'; drop", league: 'x'}), /slug/);
  assert.deepEqual(buildQuery('coverageSeasons', {country: 'Italy', league: 'serie-a'}).values, ['italy', 'serie-a']);
});

const databaseUrl = process.env.FUTPYTHON_TEST_DATABASE_URL
  || 'postgres://matchpilot:matchpilot_local_test@127.0.0.1:5432/matchpilot_fpt';
const SCHEMA = 'fpt_coverage_page_test';

test('coverage queries answer from Postgres: league summary and season drill-down with gaps', {timeout: 60000}, async t => {
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
  const { runQuery, refreshNormalizedLayer } = await import('../src/providers/futpython/query.mjs');
  const { parseCsv } = await import('../src/lib/csv.mjs');
  try {
    await migrate();
    await db.withClient(async client => {
      const add = async (season, text, availability = 'available') => {
        const key = `italy/serie-a/${season}`;
        await client.query(`INSERT INTO fpt_catalog(dataset_key,country_slug,league_slug,season,route) VALUES($1,'italy','serie-a',$2,$3)`,
          [key, season, `/api/download/${key}`]);
        await client.query(`INSERT INTO fpt_dataset_state(dataset_key, availability) VALUES($1,$2)`, [key, availability]);
        if (!text) return;
        const parsed = parseCsv(text);
        await store.storeDataset(client, {datasetKey: key, sourceKind: 'dataset', providerPath: `/api/download/${key}`,
          countrySlug: 'italy', leagueSlug: 'serie-a', season, text, headers: parsed.headers, rows: parsed.rows});
      };
      // Coverage counts complete pairs only: all three 1X2 prices, both xG values.
      await add('2022-2023', 'Date,Home,Away,Odd_1_FT,Odd_X_FT,Odd_2_FT,xG_Home_FT,xG_Away_FT\n'
        + '2022-09-01,Inter,Milan,2.10,3.20,3.50,1.2,0.8\n2022-09-08,Milan,Roma,1.80,3.40,4.50,1.1,\n');
      await add('2023-2024', 'Date,Home,Away,Odd_1_FT,Odd_X_FT\n2023-09-01,Roma,Inter,2.50,3.10\n');
      await add('2024-2025', null, 'unavailable_404');
      // A league whose catalog seasons are all 404 stays visible, with a status that says so.
      for (const season of ['2023-2024', '2024-2025']) {
        const key = `france/ligue-1/${season}`;
        await client.query(`INSERT INTO fpt_catalog(dataset_key,country_slug,league_slug,season,route) VALUES($1,'france','ligue-1',$2,$3)`,
          [key, season, `/api/download/${key}`]);
        await client.query(`INSERT INTO fpt_dataset_state(dataset_key, availability) VALUES($1,'unavailable_404')`, [key]);
      }
      await client.query(`INSERT INTO fpt_season_gaps(country_slug,league_slug,season,detector,in_catalog,missing_available)
        VALUES('italy','serie-a','2021-2022','cadence',false,false)`);
      await refreshNormalizedLayer(client);
      const league = (await runQuery(client, 'coverageCompetitions', {country: 'italy'})).rows[0];
      assert.equal(league.first_season, '2022-2023');
      assert.equal(league.last_season, '2023-2024');
      assert.deepEqual([league.seasons_with_data, league.seasons_listed, league.seasons_unavailable_404, league.matches, league.season_gaps],
        [2, 3, 1, 3, 1]);
      assert.equal(Number(league.odds_coverage), 0.6667, 'a match without the away price is not 1X2 coverage');
      assert.equal(Number(league.xg_coverage), 0.3333, 'a match without the away xG is not xG coverage');
      assert.equal(league.coverage_status, 'AVAILABLE');
      const france = (await runQuery(client, 'coverageCompetitions', {country: 'france'})).rows;
      assert.deepEqual(france.map(r => [r.league_slug, r.coverage_status, r.matches, r.seasons_listed, r.seasons_unavailable_404, r.odds_coverage]),
        [['ligue-1', 'UNAVAILABLE_404', 0, 2, 2, null]]);
      assert.equal((await runQuery(client, 'coverageCompetitions', {min_seasons: '3'})).rows.length, 0);
      const seasons = (await runQuery(client, 'coverageSeasons', {country: 'italy', league: 'serie-a'})).rows;
      assert.deepEqual(seasons.map(s => [s.season, s.matches, s.gap]),
        [['2021-2022', 0, true], ['2022-2023', 2, false], ['2023-2024', 1, false], ['2024-2025', 0, false]]);
    });
  } finally {
    await db.closePool();
    const admin = new pg.Client({connectionString: databaseUrl});
    await admin.connect();
    await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await admin.end();
  }
});
