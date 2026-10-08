import test from 'node:test';
import assert from 'node:assert/strict';
import { categoryOf, classifyMappings, namingDiffers, normalizeName, pairFixtures, similarity, tcUtcDate, teamKey } from '../src/providers/totalcorner/mapping.mjs';

test('team names normalise accents, club tokens and B-team synonyms', () => {
  assert.deepEqual(normalizeName('Atlético de Madrid'), ['atletico', 'madrid']);
  assert.deepEqual(normalizeName('Real Sociedad II'), ['real', 'sociedad', 'b']);
  assert.ok(similarity(teamKey('Real Sociedad B'), teamKey('Real Sociedad II')) === 1);
  assert.ok(similarity(teamKey('Manchester Utd'), teamKey('Manchester United')) === 1);
  assert.ok(similarity(teamKey('Bayern München'), teamKey('Bayern Munchen')) === 1);
  assert.ok(similarity(teamKey('Inter'), teamKey('Juventus')) < 0.2);
});

test('youth, reserve and women leagues never pair with senior competitions (run 1: Liga MX vs Mexico U21)', () => {
  assert.equal(categoryOf('Mexico U21 League'), 'youth');
  assert.equal(categoryOf('Türkiye U19 League'), 'youth');
  assert.equal(categoryOf('Paraguay Reserve League'), 'reserve');
  assert.equal(categoryOf('England WSL'), 'women');
  assert.equal(categoryOf('usa/nwsl-women'), 'women');
  assert.equal(categoryOf('Mexico Liga MX'), 'senior');
  assert.equal(categoryOf('Germany Bundesliga II'), 'senior');
  const f = [1, 2, 3, 4].map(i => ({league_key: 'mexico/liga-mx', date: '2026-09-20', home: `Club ${i}`, away: `Team ${i}`}));
  const t = [...f.map((x, i) => ({league_id: '779', league_name: 'Mexico Liga MX', date: x.date, home: x.home, away: x.away, id: 's' + i})),
    ...f.map((x, i) => ({league_id: '10', league_name: 'Mexico U21 League', date: x.date, home: x.home, away: x.away, id: 'y' + i}))];
  const pairs = pairFixtures(f, t);
  assert.ok(pairs.every(p => p.tc.league_id === '779'));
  const [m] = classifyMappings({fptLeagues: [{country_slug: 'mexico', league_slug: 'liga-mx', league_key: 'mexico/liga-mx'}], fpt: f, tc: t, pairs});
  assert.equal(m.status, 'VERIFIED');
});

test('TotalCorner provider-local start converts to a UTC date', () => {
  assert.equal(tcUtcDate('2026-10-08 01:30:00', 120), '2026-10-07');
  assert.equal(tcUtcDate('2026-10-08 14:00:00', 120), '2026-10-08');
  assert.equal(tcUtcDate('garbage', 120), null);
});

// FPT leagues and fixtures; TotalCorner fixtures named differently, on the same days (one a day off).
const L = (c, l) => ({country_slug: c, league_slug: l, league_key: `${c}/${l}`, internal_competition_id: `${c}:${l}`});
const fptLeagues = [L('spain', 'laliga2'), L('italy', 'serie-d-group-a'), L('italy', 'serie-d-group-b'), L('england', 'premier-league'), L('peru', 'liga-1'), L('chile', 'copa-chile')];
const fx = (league_key, date, home, away) => ({league_key, date, home, away});
const tcx = (league_id, league_name, date, home, away, id) => ({league_id, league_name, date, home, away, id});
const fpt = [
  fx('spain/laliga2', '2026-10-03', 'Real Sociedad B', 'Granada CF'), fx('spain/laliga2', '2026-10-03', 'Huesca', 'Cadiz'),
  fx('spain/laliga2', '2026-10-04', 'Sporting Gijon', 'Malaga'), fx('spain/laliga2', '2026-10-04', 'Zaragoza', 'Eibar'),
  fx('italy/serie-d-group-a', '2026-10-04', 'Varese', 'Novara'), fx('italy/serie-d-group-a', '2026-10-04', 'Bra', 'Asti'),
  fx('italy/serie-d-group-b', '2026-10-04', 'Caldiero', 'Breno'), fx('italy/serie-d-group-b', '2026-10-04', 'Desenzano', 'Pavia'),
  fx('england/premier-league', '2026-10-04', 'Arsenal', 'Chelsea'), fx('england/premier-league', '2026-10-04', 'Everton', 'Fulham'),
  fx('peru/liga-1', '2026-10-03', 'Alianza Lima', 'Universitario')
];
const tc = [
  tcx('15', 'Spain Segunda', '2026-10-03', 'Real Sociedad II', 'Granada', 'a1'), tcx('15', 'Spain Segunda', '2026-10-03', 'SD Huesca', 'Cadiz CF', 'a2'),
  tcx('15', 'Spain Segunda', '2026-10-05', 'Sporting de Gijon', 'Malaga CF', 'a3'), tcx('15', 'Spain Segunda', '2026-10-04', 'Real Zaragoza', 'SD Eibar', 'a4'),
  tcx('900', 'Italy Serie D', '2026-10-04', 'Varese', 'Novara', 'b1'), tcx('900', 'Italy Serie D', '2026-10-04', 'Bra', 'Asti', 'b2'),
  tcx('900', 'Italy Serie D', '2026-10-04', 'Caldiero Terme', 'Breno', 'b3'), tcx('900', 'Italy Serie D', '2026-10-04', 'Desenzano', 'Pavia', 'b4'),
  tcx('1', 'England Premier League', '2026-10-04', 'Arsenal', 'Chelsea', 'c1'),
  tcx('77', 'Peru Liga 1', '2026-10-03', 'Alianza Lima', 'Universitario de Deportes', 'd1'),
  tcx('5000', 'Esoccer Battle - 8 mins play', '2026-10-04', 'Arsenal (Esports)', 'Chelsea (Esports)', 'e1')
];

test('fixture overlap: VERIFIED across naming differences, AMBIGUOUS when one TC league backs two FPT leagues, CANDIDATE and UNMAPPED kept', () => {
  const pairs = pairFixtures(fpt, tc);
  const byLeague = Object.fromEntries(classifyMappings({fptLeagues, fpt, tc, pairs}).map(m => [m.league_key, m]));
  const laliga2 = byLeague['spain/laliga2'];
  assert.equal(laliga2.status, 'VERIFIED');
  assert.equal(laliga2.totalcorner_league_id, '15');
  assert.equal(laliga2.evidence.matched, 4, 'a fixture one day off still pairs');
  assert.equal(laliga2.confidence, 1);
  assert.ok(laliga2.evidence.sample.some(s => s.tc === 'Real Sociedad II - Granada'));
  assert.ok(namingDiffers('laliga2', 'Spain Segunda'));
  assert.equal(byLeague['italy/serie-d-group-a'].status, 'AMBIGUOUS', 'TC Serie D also matches group B');
  assert.equal(byLeague['italy/serie-d-group-b'].status, 'AMBIGUOUS');
  assert.ok(byLeague['italy/serie-d-group-a'].evidence.reverse_others.some(r => r.league_key === 'italy/serie-d-group-b'));
  assert.equal(byLeague['england/premier-league'].status, 'CANDIDATE', 'one matched fixture is not enough');
  assert.equal(byLeague['england/premier-league'].totalcorner_league_id, '1', 'esoccer copies are not paired');
  assert.equal(byLeague['peru/liga-1'].status, 'CANDIDATE');
  assert.equal(byLeague['chile/copa-chile'].status, 'UNMAPPED');
  assert.equal(byLeague['chile/copa-chile'].evidence.reason, 'no_fpt_fixtures_in_window');
});

test('a competition is not VERIFIED when a second TotalCorner league competes for its fixtures', () => {
  const dupTc = [...tc.filter(m => m.league_id === '15'), ...tc.filter(m => m.league_id === '15').map(m => ({...m, league_id: '16', league_name: 'Spain Segunda Copy', id: m.id + 'x'}))];
  const pairs = pairFixtures(fpt.filter(f => f.league_key === 'spain/laliga2'), dupTc.slice(0, 6));
  const [m] = classifyMappings({fptLeagues: [fptLeagues[0]], fpt: fpt.filter(f => f.league_key === 'spain/laliga2'), tc: dupTc, pairs});
  assert.notEqual(m.status, 'VERIFIED');
});

const databaseUrl = process.env.FUTPYTHON_TEST_DATABASE_URL
  || 'postgres://matchpilot:matchpilot_local_test@127.0.0.1:5432/matchpilot_fpt';
const SCHEMA = 'tc_core_mapping_test';

test('mapping on Postgres: paginated schedules, persisted states with evidence, zero duplicates, verified-only discovery', {timeout: 60000}, async t => {
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
  const {migrate} = await import('../src/migrate.mjs');
  const {createPgStore, createTcClient} = await import('../src/providers/totalcorner/client.mjs');
  const {runTcMapping} = await import('../src/jobs/totalcorner-mapping.mjs');
  try {
    await migrate();
    await db.withClient(async c => {
      for (const l of fptLeagues) {
        await c.query(`INSERT INTO fpt_competition_season(dataset_key,internal_competition_id,country_slug,league_slug,canonical_league_name,season,match_count,
          coverage_status,fields_available,historical_complete,prematch_available) VALUES($1,$2,$3,$4,$5,'2026-2027',10,'AVAILABLE',10,false,true)`,
          [l.league_key + '/2026-2027', l.internal_competition_id, l.country_slug, l.league_slug, l.league_slug]);
      }
      // Test fixture: the FPT mirror view is replaced by a plain table with the columns the mapping reads.
      await c.query(`DROP VIEW fpt_matches_latest CASCADE`);
      await c.query(`CREATE TABLE fpt_matches_latest(country_slug text, league_slug text, match_date date, home text, away text)`);
      for (const f of fpt) {
        const [cs, ls] = f.league_key.split('/');
        await c.query(`INSERT INTO fpt_matches_latest VALUES($1,$2,$3,$4,$5)`, [cs, ls, f.date, f.home, f.away]);
      }
    });
    // Fake API: schedule split over two pages per date, provider-local start = UTC + 2h.
    const toTc = m => ({id: m.id, l_id: m.league_id, l: m.league_name, h: m.home, a: m.away, start: `${m.date} 16:00:00`, status: 'full'});
    const hits = [];
    const fetchImpl = async u => {
      const url = new URL(u);
      hits.push(url.pathname + url.search.replace(/token=[^&]+/, 'token=X'));
      const p = url.pathname.replace('/v1', '');
      const ok = (data, pagination) => new Response(JSON.stringify({success: 1, ...(pagination ? {pagination} : {}), data}), {status: 200});
      if (p === '/match/schedule') {
        const d = url.searchParams.get('date'); const page = Number(url.searchParams.get('page') || 1);
        const rows = tc.filter(m => m.date.replaceAll('-', '') === d).map(toTc);
        const half = Math.ceil(rows.length / 2);
        return ok(page === 1 ? rows.slice(0, half) : rows.slice(half), {current: page, pages: 2, next: page < 2, prev: page > 1, per_page: half || 1});
      }
      if (p === '/match/today') return ok(url.searchParams.get('type') === 'inplay' ? [{...toTc(tc[0]), id: 'live1', status: '55', p_btts: ['1.7', '2.0']}] : [], {current: 1, pages: 1, next: false});
      if (p.startsWith('/match/view/')) return ok([{...toTc(tc[0]), status: 'full', attacks: ['50', '40']}]);
      if (p.startsWith('/match/odds/')) return ok([{...toTc(tc[0]), status: 'full', btts_list: [['', '1.8', '1.9', '2026-10-03 10:00:00']]}]);
      if (p.startsWith('/match/bookmaker_odds/')) return ok({...toTc(tc[0]), bookmakers: [{name: 'Pinnacle', slug: 'pinnacle', odds: {open: {home: 2, draw: 3, away: 4, time: '2026-10-01 10:00:00'}}}]});
      return new Response('{}', {status: 404});
    };
    const tcClient = createTcClient({token: 'secret-token', store: createPgStore(db.withClient), limiter: {acquire: async () => {}, pause() {}}, fetchImpl, sleep: async () => {}});
    const summary = await db.withClient(c => runTcMapping({tc: tcClient, db: c, log: () => {}, config: {dates: 5, windowDays: 30, tzOffsetMinutes: 120}}));
    assert.deepEqual(summary.window_dates, ['2026-10-03', '2026-10-04']);
    assert.ok(hits.some(h => h.includes('/match/schedule') && h.includes('page=2')), 'every schedule page is read');
    assert.equal(summary.status.VERIFIED, 1);
    assert.equal(summary.status.AMBIGUOUS, 2);
    assert.deepEqual(summary.duplicates, {dup_tc: 0, dup_fpt: 0});
    assert.ok(summary.naming_differs.includes('spain/laliga2 -> Spain Segunda'));
    assert.ok(summary.verified_discovery.sample.some(s => s.why === 'ended_window' && s.league_id === '15'));
    assert.ok(summary.verified_discovery.sample.some(s => s.why === 'inplay'));
    await db.withClient(async c => {
      const rows = await c.query(`SELECT futpython_league_slug, mapping_status, totalcorner_league_id, evidence FROM competition_mapping WHERE active ORDER BY 1`);
      assert.equal(rows.rowCount, fptLeagues.length, 'every FPT competition has a state');
      const v = rows.rows.find(r => r.futpython_league_slug === 'laliga2');
      assert.equal(v.totalcorner_league_id, '15');
      assert.deepEqual(v.evidence.window_dates, ['2026-10-03', '2026-10-04']);
      const tcs = await c.query(`SELECT totalcorner_league_id, mapping_status FROM tc_competitions ORDER BY 1`);
      assert.ok(tcs.rows.some(r => r.totalcorner_league_id === '5000' && r.mapping_status === 'UNMAPPED'), 'esoccer stays in the non-overlap list');
      const leak = await c.query(`SELECT count(*)::int AS n FROM tc_raw_responses WHERE url_path LIKE '%secret-token%' OR body LIKE '%secret-token%'`);
      assert.equal(leak.rows[0].n, 0);
    });
    // Re-run: the mapping is replaced, not duplicated, and the verified TC league stays unique.
    await db.withClient(c => c.query(`UPDATE tc_mapping_runs SET version='old'`));
    const scheduleCalls = hits.filter(h => h.includes('/match/schedule')).length;
    const second = await db.withClient(c => runTcMapping({tc: tcClient, db: c, log: () => {}, config: {dates: 5, windowDays: 30, tzOffsetMinutes: 120}}));
    assert.equal(hits.filter(h => h.includes('/match/schedule')).length, scheduleCalls, 'past schedule pages come from the raw store');
    assert.equal(second.cache.hits, scheduleCalls);
    const ledgerHits = await db.withClient(c => c.query(`SELECT count(*)::int AS n FROM tc_request_ledger WHERE outcome='cache_hit'`));
    assert.equal(ledgerHits.rows[0].n, scheduleCalls, 'every cache hit is in the ledger');
    const again = await db.withClient(c => c.query(`SELECT count(*)::int AS n FROM competition_mapping`));
    assert.equal(again.rows[0].n, fptLeagues.length);
  } finally {
    await db.closePool();
  }
});
