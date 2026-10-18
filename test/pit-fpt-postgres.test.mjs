// R-08 Gate B (PR #154 reviews B-2, B-3): FPT teamMatchesAsOf builds its answer from the current facts. A provider
// correction acquired after as_of must never reach a PIT_VERIFIED answer, whether it changes, drops or reorders rows.
import assert from 'node:assert/strict';
import test from 'node:test';

test('FPT team-matches-asof flags facts corrected after as_of (MP-PIT-002, MP-PIT-003)', {timeout: 90000}, async t => {
  const pg = (await import('pg')).default;
  const rootUrl = process.env.FUTPYTHON_TEST_DATABASE_URL || 'postgres://matchpilot:matchpilot_local_test@127.0.0.1:5432/matchpilot_fpt';
  const base = new URL(rootUrl);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(base.hostname), 'remote PostgreSQL is forbidden');
  const admin = new pg.Client({connectionString: rootUrl, connectionTimeoutMillis: 2000});
  try { await admin.connect(); }
  catch (cause) {
    await admin.end().catch(() => {});
    if (process.env.CI) throw cause;
    return t.skip('throwaway postgres unavailable');
  }
  const schema = `pit_fpt_${process.pid}`;
  await admin.query(`CREATE SCHEMA ${schema}`);
  base.searchParams.set('options', `-c search_path=${schema}`);
  process.env.DATABASE_URL = base.toString();
  process.env.MATCHPILOT_RUNTIME_MODE = 'test';
  const db = await import('../src/db.mjs');
  try {
    const {migrate} = await import('../src/migrate.mjs');
    const store = await import('../src/providers/futpython/store.mjs');
    const teams = await import('../src/providers/futpython/teams.mjs');
    const query = await import('../src/providers/futpython/query.mjs');
    const {parseCsv} = await import('../src/lib/csv.mjs');
    await migrate();
    await db.withClient(async c => {
      const H = ['Id', 'Date', 'Time', 'Home', 'Away', 'Home_Score', 'Away_Score', 'Odd_1_FT', 'Odd_X_FT', 'Odd_2_FT'];
      const csv = rows => H.join(',') + '\n' + rows.map(r => H.map(h => r[h] ?? '').join(',')).join('\n') + '\n';
      const key = 'netherlands/eredivisie/2024-2025';
      await c.query(`INSERT INTO fpt_catalog(dataset_key,country_slug,league_slug,season,route) VALUES($1,'netherlands','eredivisie','2024-2025',$2)`, [key, '/api/download/' + key]);
      const put = async (rows, at) => {
        const text = csv(rows);
        const parsed = parseCsv(text);
        await store.storeDataset(c, {datasetKey: key, sourceKind: 'dataset', providerPath: '/api/download/' + key, countrySlug: 'netherlands',
          leagueSlug: 'eredivisie', season: '2024-2025', text, headers: parsed.headers, rows: parsed.rows, acquiredAt: new Date(at)});
      };
      const match = (id, date, home, away) => ({Id: id, Date: date, Time: '20:00', Home: home, Away: away, Home_Score: '2', Away_Score: '1',
        Odd_1_FT: '1.8', Odd_X_FT: '3.5', Odd_2_FT: '4.0'});
      const stable = [match('200', '2025-03-01', 'Feyenoord', 'PSV'), match('201', '2025-03-02', 'PSV', 'Ajax')];
      // Known at T: match 100 is Ajax v PSV on 2025-04-10. After T the provider corrects it to Feyenoord v Ajax on 2025-04-12.
      // Known at T: match 300 is Ajax v Utrecht on 2025-05-20. After T its date is corrected to 2025-06-10 (review B-3).
      await put([match('100', '2025-04-10', 'Ajax', 'PSV'), match('300', '2025-05-20', 'Ajax', 'Utrecht'), ...stable], '2025-05-01T00:00:00Z');
      await put([match('100', '2025-04-12', 'Feyenoord', 'Ajax'), match('300', '2025-06-10', 'Ajax', 'Utrecht'), ...stable], '2025-07-01T00:00:00Z');
      await teams.replaceTeamEntities(c, teams.buildTeamEntities(await teams.loadTeamSpellings(c)));
      await query.refreshNormalizedLayer(c);
      const teamId = async name => (await query.runQuery(c, 'teamSearch', {q: name})).rows[0].internal_team_id;
      const asOf = {as_of: '2025-06-01T00:00:00Z', before: '2025-06-01', limit: 50};

      // Feyenoord: match 100 appears only through the later correction.
      const fey = await query.runQuery(c, 'teamMatchesAsOf', {team: await teamId('Feyenoord'), ...asOf});
      const corrected = fey.rows.find(r => r.known_home === 'Ajax');
      assert.ok(corrected, 'the corrected match is returned with the facts known at T alongside');
      assert.equal(corrected.known_away, 'PSV');
      assert.equal(corrected.pit.status, 'PIT_NOT_VERIFIED');
      assert.deepEqual(corrected.pit.reasons, ['FACTS_CHANGED_AFTER_DECISION']);
      assert.equal(corrected.pit.times.event_time_earliest, '2025-04-09T10:00:00.000Z', 'the event date is the one known at T (2025-04-10)');
      assert.equal(fey.pit.label, 'NON_PIT');
      assert.equal(fey.pit.changed_matches, 1);
      const unchanged = fey.rows.find(r => r.known_home === 'Feyenoord');
      assert.equal(unchanged.pit.status, 'PIT_VERIFIED', 'a match unchanged since T stays verified');

      // PSV: match 100 named PSV at T but its current facts no longer do, so it is missing from the answer.
      const psv = await query.runQuery(c, 'teamMatchesAsOf', {team: await teamId('PSV'), ...asOf});
      assert.ok(psv.rows.every(r => r.pit.status === 'PIT_VERIFIED'));
      assert.equal(psv.pit.label, 'NON_PIT');
      assert.deepEqual(psv.pit.why, ['TEAM_MATCHES_CHANGED_AFTER_DECISION']);
      assert.equal(psv.pit.changed_matches, 1);

      // Utrecht (review B-3): match 300 was known at T (2025-05-20 < before) but its later date correction drops it
      // from the current-facts answer. The answer must not be PIT_VERIFIED.
      const utrecht = await query.runQuery(c, 'teamMatchesAsOf', {team: await teamId('Utrecht'), ...asOf});
      assert.equal(utrecht.rows.length, 0, 'the current facts no longer place match 300 before 2025-06-01');
      assert.equal(utrecht.pit.label, 'NON_PIT');
      assert.equal(utrecht.pit.changed_matches, 1);

      // After the correction was acquired, the same questions are PIT again.
      const later = {as_of: '2025-08-01T00:00:00Z', before: '2025-08-01', limit: 50};
      assert.equal((await query.runQuery(c, 'teamMatchesAsOf', {team: await teamId('Feyenoord'), ...later})).pit.label, 'PIT_VERIFIED');
      assert.equal((await query.runQuery(c, 'teamMatchesAsOf', {team: await teamId('PSV'), ...later})).pit.label, 'PIT_VERIFIED');
      assert.equal((await query.runQuery(c, 'teamMatchesAsOf', {team: await teamId('Utrecht'), ...later})).pit.label, 'PIT_VERIFIED');
    });
  } finally {
    await db.closePool?.().catch?.(() => {});
    try { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); }
    finally { await admin.end(); }
  }
});
