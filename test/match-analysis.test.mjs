// R-07a (#25, #30; MP-WEB-003, MP-WEB-014): pre-match analysis of a stored match. Exact arithmetic, windows that are
// prefixes of the team's history before the match day, no same-day or later match, N/coverage/source rows that agree
// with an independent SQL oracle, and the v1 contract.
import assert from 'node:assert/strict';
import test from 'node:test';
import {matchAnalysis, matchIdOf, windowStats} from '../src/analysis/match-analysis.mjs';
import {seedEredivisie} from './helpers/fpt-seed.mjs';

const ROOT_URL = process.env.FUTPYTHON_TEST_DATABASE_URL || 'postgres://matchpilot:matchpilot_local_test@127.0.0.1:5432/matchpilot_fpt';
const T = 'fpt:team:t';
const row = (id, date, home, hs, as, extra = {}) => ({internal_match_id: id, match_date: date, home_team_id: home ? T : 'fpt:team:o',
  away_team_id: home ? 'fpt:team:o' : T, home_score: hs, away_score: as, xg_home: '1.10', xg_away: '0.40', odd_home: '2.0', odd_draw: '3.0', odd_away: '4.0', ...extra});

test('window statistics are exact, from the team side, with N and per-family coverage', () => {
  const rows = [row('a', '2024-03-03', true, 2, 1), row('b', '2024-03-02', false, 1, 1, {xg_home: null}), row('c', '2024-03-01', false, 3, 0, {odd_draw: null})];
  const s = windowStats(T, rows);
  assert.equal(s.n, 3);
  assert.deepEqual([s.won, s.drawn, s.lost], [1, 1, 1]);
  assert.equal(s.goals_for, '3');            // 2 + 1 + 0
  assert.equal(s.goals_against, '5');        // 1 + 1 + 3
  assert.equal(s.goals_for_avg, '1.00');
  assert.equal(s.goals_against_avg, '1.67');  // 5/3 = 1.666… HALF_EVEN to 2 places
  assert.equal(s.over25_rate, '0.6667');     // a (3 goals) and c (3 goals)
  assert.equal(s.btts_rate, '0.6667');       // a and b
  assert.equal(s.clean_sheet_rate, '0.0000');
  assert.equal(s.failed_to_score_rate, '0.3333');
  // xG only where both values exist (a and c): for = 1.10 (a, home) + 0.40 (c, away side) → 0.75; against = 0.40 + 1.10 → 0.75.
  assert.equal(s.coverage.xg_n, 2);
  assert.equal(s.coverage.xg, '0.6667');
  assert.equal(s.xg_for_avg, '0.75');
  assert.equal(s.xg_against_avg, '0.75');
  assert.equal(s.coverage.odds_1x2_n, 2);
  assert.deepEqual(s.source_match_ids, ['a', 'b', 'c']);
  // Percentages for the page, computed on the server (MP-WEB-011), HALF_EVEN to one place.
  assert.deepEqual(s.percent, {won: '33.3', drawn: '33.3', lost: '33.3', over25: '66.7', btts: '66.7', clean_sheet: '0.0', failed_to_score: '33.3'});
  // Form from the team's side, most recent first: a won at home, b drawn away, c lost away (3–0 for the home side).
  assert.deepEqual(s.form, [{match_id: 'a', venue: 'home', result: 'W'}, {match_id: 'b', venue: 'away', result: 'D'}, {match_id: 'c', venue: 'away', result: 'L'}]);
  assert.deepEqual([s.first_date, s.last_date], ['2024-03-01', '2024-03-03']);
  const empty = windowStats(T, []);
  assert.equal(empty.n, 0);
  for (const key of ['goals_for_avg', 'over25_rate', 'xg_for_avg']) assert.equal(empty[key], null, `${key} is N/D with no match, never 0`);
  assert.equal(empty.percent.won, null, 'no percentage without a match');
  // A tie at the rounding place goes to the even digit (HALF_EVEN): 1 win in 16 is 6.25 % → 6.2, not 6.3 (PR #176 review NB-3).
  const sixteen = Array.from({length: 16}, (_, i) => row(`m${i}`, `2024-03-${String(i + 1).padStart(2, '0')}`, true, i === 0 ? 1 : 0, i === 0 ? 0 : 1));
  assert.equal(windowStats(T, sixteen).percent.won, '6.2');
  assert.equal(windowStats(T, sixteen).percent.lost, '93.8');
  assert.deepEqual(empty.form, []);
});

test('the match id is validated before any database access', () => {
  for (const bad of ['', 'x', 'fpt:' + 'a'.repeat(400), 'fpt:a\u0000']) assert.throws(() => matchIdOf(bad), {code: 'BAD_QUERY_INPUT'});
  assert.equal(matchIdOf(' fpt:hash:abc '), 'fpt:hash:abc');
});

async function withSeed(t, fn) {
  const pg = (await import('pg')).default;
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(ROOT_URL).hostname), 'remote PostgreSQL is forbidden');
  const admin = new pg.Client({connectionString: ROOT_URL, connectionTimeoutMillis: 2000});
  try { await admin.connect(); }
  catch (cause) {
    await admin.end().catch(() => {});
    if (process.env.CI) throw cause;
    return t.skip('throwaway postgres unavailable');
  }
  const schema = `match_analysis_${process.pid}_${Date.now()}`;
  const url = new URL(ROOT_URL);
  url.searchParams.set('options', `-c search_path=${schema}`);
  const client = new pg.Client({connectionString: url.toString()});
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    await client.connect();
    const {readdir, readFile} = await import('node:fs/promises');
    for (const file of (await readdir('migrations')).filter(name => name.endsWith('.sql')).sort()) await client.query(await readFile(`migrations/${file}`, 'utf8'));
    return await fn(client, await seedEredivisie(client));
  } finally {
    await client.end().catch(() => {});
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
}

test('analysis of a stored match agrees with an independent SQL oracle and never looks at the match day or later', {timeout: 120000}, async t => {
  await withSeed(t, async (client, seed) => {
    const day = seed.dates[seed.dates.length - 1];
    const target = (await client.query(`SELECT internal_match_id, home_team_id, away_team_id, season_id FROM fpt_match_facts
      WHERE match_date = $1::date ORDER BY internal_match_id COLLATE "C" LIMIT 1`, [day])).rows[0];
    const before = await matchAnalysis(client, {id: target.internal_match_id});
    assert.equal(before.match.internal_match_id, target.internal_match_id);
    assert.equal(before.method.cutoff_before, day);
    assert.equal(before.method.pit, 'PIT_NOT_VERIFIED');
    assert.equal(before.provenance.upstream_calls, 0);

    const venueSql = {home: 'home_team_id = $1', away: 'away_team_id = $1', both: '(home_team_id = $1 OR away_team_id = $1)'};
    for (const [side, team] of [['home', target.home_team_id], ['away', target.away_team_id]]) {
      for (const venue of ['home', 'away', 'both']) {
        const oracle = (await client.query(`SELECT internal_match_id,
            CASE WHEN home_team_id = $1 THEN home_score ELSE away_score END AS gf
          FROM fpt_match_facts WHERE ${venueSql[venue]} AND result_status = 'FINAL' AND phase = 'HISTORICAL' AND match_date < $2::date
          ORDER BY match_date DESC, internal_match_id COLLATE "C"`, [team, day])).rows;
        const analysis = before.teams[side].venues[venue];
        for (const window of [5, 10, 20]) {
          const expected = oracle.slice(0, window);
          const got = analysis.windows[window];
          assert.deepEqual(got.source_match_ids, expected.map(r => r.internal_match_id), `${side}/${venue}/${window}`);
          assert.equal(got.goals_for, String(expected.reduce((acc, r) => acc + r.gf, 0)));
        }
        // One season seeded: the season window is every earlier match of the team at that venue.
        assert.deepEqual(analysis.windows.season.source_match_ids, oracle.map(r => r.internal_match_id));
        const ids = new Set(analysis.rows.map(r => r.internal_match_id));
        assert.ok(analysis.windows.season.source_match_ids.every(id => ids.has(id)), 'every source row is in the payload');
        assert.ok(analysis.rows.every(r => r.match_date < day), 'no row on the match day or later');
      }
    }

    // Leakage: a same-day and a later match of the home team, with extreme scores, change nothing.
    const template = (await client.query('SELECT * FROM fpt_match_facts WHERE internal_match_id = $1', [target.internal_match_id])).rows[0];
    await client.query('ALTER TABLE fpt_match_facts DROP CONSTRAINT IF EXISTS fpt_match_facts_version_id_fkey');
    for (const [id, date] of [['fpt:id:same-day', day], ['fpt:id:later', '2030-01-01']]) {
      await client.query(`INSERT INTO fpt_match_facts(internal_match_id, match_key, version_id, snapshot_id, dataset_key, phase, acquired_at,
          internal_competition_id, season_id, match_date, kickoff_local_time, kickoff_tz_status, result_status, source_provider,
          parser_version, schema_version, transform_version, facts_version, home_team_id, away_team_id, home_name, away_name, home_score, away_score)
        SELECT $1, $1, version_id, snapshot_id, dataset_key, phase, acquired_at, internal_competition_id, season_id, $2::date, '00:01',
          kickoff_tz_status, 'FINAL', source_provider, parser_version, schema_version, transform_version, facts_version,
          home_team_id, away_team_id, home_name, away_name, 9, 0
        FROM fpt_match_facts WHERE internal_match_id = $3`, [id, date, template.internal_match_id]);
    }
    const after = await matchAnalysis(client, {id: target.internal_match_id});
    assert.deepEqual(after.teams, before.teams);
    assert.deepEqual(after.head_to_head, before.head_to_head);

    const unknown = await matchAnalysis(client, {id: 'fpt:id:unknown'});
    assert.equal(unknown.match, null);
    assert.equal(unknown.reason, 'MATCH_NOT_FOUND');
    assert.equal(unknown.provenance.upstream_calls, 0, 'an unknown match still carries its provenance');
    assert.equal(before.provenance.source_provider, 'futpythontrader', 'the provider comes from the stored match');
  });
});

test('API v1 serves the analysis, refuses a bad id and lists the endpoint', {timeout: 120000}, async t => {
  await withSeed(t, async (client, seed) => {
    const {handleV1} = await import('../src/api/v1.mjs');
    const call = async path => handleV1({method: 'GET', url: new URL(path, 'http://localhost')}, {withClient: fn => fn(client), tc: {}, codeVersion: 'test'});
    const id = (await client.query('SELECT internal_match_id FROM fpt_match_facts WHERE match_date = $1::date LIMIT 1', [seed.dates[5]])).rows[0].internal_match_id;
    const ok = await call(`/api/v1/fpt/match-analysis?id=${encodeURIComponent(id)}`);
    assert.equal(ok.status, 200);
    assert.equal(ok.body.data.match.internal_match_id, id);
    assert.equal(ok.body.meta.provenance.upstream_calls, 0);
    assert.equal((await call('/api/v1/fpt/match-analysis?id=nope')).status, 400);
    assert.equal((await call('/api/v1/fpt/match-analysis')).status, 400);
    const registry = await call('/api/v1/endpoints');
    assert.ok(registry.body.data.endpoints.some(endpoint => endpoint.path === '/api/v1/fpt/match-analysis'));
  });
});
