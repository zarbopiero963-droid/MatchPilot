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

      // R-08b (MP-FPT-005): a re-parse writes new versions with the raw snapshot's acquired_at. They are usable only
      // from the end of their run, so the rows answered at an earlier T do not change.
      const {reprocessRaw} = await import('../src/providers/futpython/reprocess.mjs');
      const {LINEAGE_VERSIONS} = await import('../src/providers/futpython/schema.mjs');
      const feyId = await teamId('Feyenoord');
      const pinned = {team: feyId, as_of: '2025-08-01T00:00:00Z', before: '2025-08-01', limit: 50};
      const strip = r => ({id: r.internal_match_id, version: r.version_id, odd_home: r.odd_home, parser: r.parser_version});
      const beforeRun = await query.runQuery(c, 'teamMatchesAsOf', pinned);
      assert.ok(beforeRun.rows.every(r => r.parser_version === LINEAGE_VERSIONS.parserVersion));
      const run = await reprocessRaw(c, {mode: 'apply', actor: 'test', reason: 'R-08b reproduction', datasetKeys: [key],
        lineage: {...LINEAGE_VERSIONS, parserVersion: 'fpt-csv-test-2'},
        parse: text => { const p = parseCsv(text); return {...p, rows: p.rows.map(r => ({...r, Odd_1_FT: '9.99'}))}; }});
      assert.ok(run.inserted > 0, 'the re-parse wrote new versions');
      await query.refreshNormalizedLayer(c);
      const runEnd = (await c.query(`SELECT finished_at FROM fpt_reprocessing_runs WHERE run_id=$1`, [run.runId])).rows[0].finished_at;
      const afterRun = await query.runQuery(c, 'teamMatchesAsOf', pinned);
      assert.deepEqual(afterRun.rows.map(strip), beforeRun.rows.map(strip), 'same T, same versions and values before and after the re-parse');
      assert.equal(afterRun.pit.label, 'NON_PIT', 'the current facts now come from the re-parse, so the answer is flagged');
      assert.ok(afterRun.rows.every(r => r.changed_after_as_of === true));
      const now = await query.runQuery(c, 'teamMatchesAsOf', {...pinned, as_of: new Date(new Date(runEnd).getTime() + 1000).toISOString()});
      assert.ok(now.rows.length > 0 && now.rows.every(r => r.parser_version === 'fpt-csv-test-2' && Number(r.odd_home) === 9.99));
      assert.ok(now.rows.every(r => new Date(r.pit.times.availability_time).getTime() === new Date(runEnd).getTime()),
        'a re-parsed version is available from the end of its run');
      assert.ok(now.rows.every(r => new Date(r.pit.times.acquisition_time) < new Date(r.pit.times.availability_time)));
      assert.equal(now.pit.label, 'PIT_VERIFIED');
    });
  } finally {
    await db.closePool?.().catch?.(() => {});
    try { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); }
    finally { await admin.end(); }
  }
});

// PR #155 review B-1: a later snapshot that repeats an unchanged match stores no version for it (UNIQUE(match_key,
// payload_sha256)). A re-parse may write the first version of that match there; it must still be usable only from the
// end of its run, never from that snapshot's acquisition.
test('a re-parsed version written into a later snapshot is not dated with that snapshot (MP-FPT-005)', {timeout: 90000}, async t => {
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
  const schema = `pit_fpt_b_${process.pid}`;
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
    const {reprocessRaw} = await import('../src/providers/futpython/reprocess.mjs');
    const {LINEAGE_VERSIONS} = await import('../src/providers/futpython/schema.mjs');
    const {parseCsv} = await import('../src/lib/csv.mjs');
    await migrate();
    await db.withClient(async c => {
      const H = ['Id', 'Date', 'Time', 'Home', 'Away', 'Home_Score', 'Away_Score', 'Odd_1_FT', 'Odd_X_FT', 'Odd_2_FT'];
      const line = (r, extra) => H.map(h => r[h] ?? '').join(',') + (extra ? ',' + extra : '');
      const key = 'netherlands/eredivisie/2024-2025';
      await c.query(`INSERT INTO fpt_catalog(dataset_key,country_slug,league_slug,season,route) VALUES($1,'netherlands','eredivisie','2024-2025','/x')`, [key]);
      const put = async (text, at) => {
        const p = parseCsv(text);
        await store.storeDataset(c, {datasetKey: key, sourceKind: 'dataset', providerPath: '/x', countrySlug: 'netherlands', leagueSlug: 'eredivisie',
          season: '2024-2025', text, headers: p.headers, rows: p.rows, acquiredAt: new Date(at)});
      };
      const m = (id, home, away) => ({Id: id, Date: '2025-03-01', Time: '20:00', Home: home, Away: away, Home_Score: '2', Away_Score: '1',
        Odd_1_FT: '1.8', Odd_X_FT: '3.5', Odd_2_FT: '4.0'});
      // S2 repeats match 100 with a trailing cell the ingest parser drops: S2 stores no version for match 100.
      await put(H.join(',') + '\n' + line(m('100', 'Ajax', 'PSV')) + '\n' + line(m('101', 'PSV', 'Ajax')) + '\n', '2025-05-01T00:00:00Z');
      await put(H.join(',') + '\n' + line(m('100', 'Ajax', 'PSV'), '7.77') + '\n' + line({...m('101', 'PSV', 'Ajax'), Home_Score: '3'}) + '\n', '2025-07-01T00:00:00Z');
      await teams.replaceTeamEntities(c, teams.buildTeamEntities(await teams.loadTeamSpellings(c)));
      await query.refreshNormalizedLayer(c);
      const ajax = (await query.runQuery(c, 'teamSearch', {q: 'Ajax'})).rows[0].internal_team_id;
      const at = {team: ajax, as_of: '2025-08-01T00:00:00Z', before: '2100-01-01', limit: 50};
      const view = r => r.rows.map(x => [x.internal_match_id, x.version_id, String(x.odd_home), x.parser_version]);
      const before = await query.runQuery(c, 'teamMatchesAsOf', at);
      // A parser that keeps the trailing cell as Odd_1_FT: it writes match 100's first version in S2.
      const keepExtra = text => {
        const lines = text.trim().split('\n');
        const hs = lines[0].split(',');
        return {headers: hs, rows: lines.slice(1).map(l => {
          const cells = l.split(',');
          const o = Object.fromEntries(hs.map((h, i) => [h, cells[i] ?? '']));
          if (cells.length > hs.length) o.Odd_1_FT = cells[hs.length];
          return o;
        })};
      };
      const run = await reprocessRaw(c, {mode: 'apply', actor: 'test', reason: 'review B-1', datasetKeys: [key],
        lineage: {...LINEAGE_VERSIONS, parserVersion: 'fpt-csv-test-3'}, parse: keepExtra});
      assert.ok(run.inserted > 0);
      await query.refreshNormalizedLayer(c);
      const reparsed = (await c.query(`SELECT v.snapshot_id, v.acquired_at FROM fpt_match_versions v WHERE v.parser_version = 'fpt-csv-test-3'
        AND v.payload->>'Odd_1_FT' = '7.77'`)).rows;
      assert.equal(reparsed.length, 1, 'the re-parse wrote the first version of match 100 in S2');
      const after = await query.runQuery(c, 'teamMatchesAsOf', at);
      assert.deepEqual(view(after), view(before), 'same T: the re-parsed version is not usable before its run ended');
      assert.ok(after.rows.every(r => r.parser_version === LINEAGE_VERSIONS.parserVersion));
      assert.equal(after.pit.label, 'NON_PIT', 'the current facts now come from the re-parse');

      // Review B-3: the reprocess job marks a run 'failed' when the facts refresh fails after the versions were
      // committed. Those versions must stay unusable before the run's end.
      await c.query(`UPDATE fpt_reprocessing_runs SET status='failed', finished_at=now(), error='facts refresh failed' WHERE run_id=$1`, [run.runId]);
      const afterFailed = await query.runQuery(c, 'teamMatchesAsOf', at);
      assert.deepEqual(view(afterFailed), view(before), 'a committed run marked failed still delays its versions');
      assert.equal(afterFailed.pit.label, 'NON_PIT');
    });
  } finally {
    await db.closePool?.().catch?.(() => {});
    try { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); }
    finally { await admin.end(); }
  }
});

// PR #155 review B-2: a re-parse that reuses the ingest lineage delays every version of that lineage, so matches known
// at T can vanish from the answer at T. Such an answer must be NON_PIT, never a silently shorter PIT_VERIFIED one. A
// no-op apply (0 versions written) must change nothing.
test('a re-parse reusing the ingest lineage cannot silently drop matches known at T (MP-FPT-005)', {timeout: 90000}, async t => {
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
  const schema = `pit_fpt_c_${process.pid}`;
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
    const {reprocessRaw} = await import('../src/providers/futpython/reprocess.mjs');
    const {parseCsv} = await import('../src/lib/csv.mjs');
    await migrate();
    await db.withClient(async c => {
      const H = ['Id', 'Date', 'Time', 'Home', 'Away', 'Home_Score', 'Away_Score', 'Odd_1_FT', 'Odd_X_FT', 'Odd_2_FT'];
      const line = r => H.map(h => r[h] ?? '').join(',');
      const key = 'netherlands/eredivisie/2024-2025';
      await c.query(`INSERT INTO fpt_catalog(dataset_key,country_slug,league_slug,season,route) VALUES($1,'netherlands','eredivisie','2024-2025','/x')`, [key]);
      const m = (id, home, away) => ({Id: id, Date: '2025-03-01', Time: '20:00', Home: home, Away: away, Home_Score: '2', Away_Score: '1',
        Odd_1_FT: '1.8', Odd_X_FT: '3.5', Odd_2_FT: '4.0'});
      const text = H.join(',') + '\n' + line(m('100', 'Ajax', 'PSV')) + '\n' + line(m('101', 'PSV', 'Ajax')) + '\n';
      const parsed = parseCsv(text);
      await store.storeDataset(c, {datasetKey: key, sourceKind: 'dataset', providerPath: '/x', countrySlug: 'netherlands', leagueSlug: 'eredivisie',
        season: '2024-2025', text, headers: parsed.headers, rows: parsed.rows, acquiredAt: new Date('2025-05-01T00:00:00Z')});
      await teams.replaceTeamEntities(c, teams.buildTeamEntities(await teams.loadTeamSpellings(c)));
      await query.refreshNormalizedLayer(c);
      const ajax = (await query.runQuery(c, 'teamSearch', {q: 'Ajax'})).rows[0].internal_team_id;
      const at = {team: ajax, as_of: '2025-08-01T00:00:00Z', before: '2100-01-01', limit: 50};
      const before = await query.runQuery(c, 'teamMatchesAsOf', at);
      assert.equal(before.rows.length, 2);
      assert.equal(before.pit.label, 'PIT_VERIFIED');

      // The default command: apply with the ingest lineage and the ingest parser writes nothing and changes nothing.
      const noop = await reprocessRaw(c, {mode: 'apply', actor: 'test', reason: 'no-op'});
      assert.equal(noop.inserted, 0);
      const afterNoop = await query.runQuery(c, 'teamMatchesAsOf', at);
      assert.deepEqual(afterNoop.rows.map(r => r.version_id), before.rows.map(r => r.version_id));
      assert.equal(afterNoop.pit.label, 'PIT_VERIFIED');

      // A re-parse with the ingest lineage that changes match 100: every version of the lineage now waits for the run.
      const reuse = await reprocessRaw(c, {mode: 'apply', actor: 'test', reason: 'reuse lineage',
        parse: t2 => { const p = parseCsv(t2); return {...p, rows: p.rows.map(r => r.Id === '100' ? {...r, Odd_1_FT: '9.99'} : r)}; }});
      assert.ok(reuse.inserted > 0);
      await query.refreshNormalizedLayer(c);
      const afterReuse = await query.runQuery(c, 'teamMatchesAsOf', at);
      assert.ok(afterReuse.rows.length < before.rows.length, 'the delayed ingest versions are no longer usable at T');
      assert.equal(afterReuse.pit.label, 'NON_PIT', 'the missing matches are reported, not hidden');
      assert.ok(afterReuse.pit.changed_matches >= 2);
    });
  } finally {
    await db.closePool?.().catch?.(() => {});
    try { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); }
    finally { await admin.end(); }
  }
});

// PR #155 review B-4: the phase 3 repair (repairShortSnapshots) re-parses stored raw with the current parser and writes
// versions dated with the snapshot's acquired_at. It records itself as a reprocessing run, so its versions are not
// usable before it ran and an answer at an earlier T that they affect is NON_PIT.
test('the short-snapshot repair is a recorded re-parse (MP-FPT-005)', {timeout: 90000}, async t => {
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
  const schema = `pit_fpt_d_${process.pid}`;
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
    const integrity = await import('../src/providers/futpython/integrity.mjs');
    const {parseCsv} = await import('../src/lib/csv.mjs');
    await migrate();
    await db.withClient(async c => {
      const H = ['Id', 'Date', 'Time', 'Home', 'Away', 'Home_Score', 'Away_Score', 'Odd_1_FT', 'Odd_X_FT', 'Odd_2_FT'];
      const line = r => H.map(h => r[h] ?? '').join(',');
      const key = 'netherlands/eredivisie/2024-2025';
      await c.query(`INSERT INTO fpt_catalog(dataset_key,country_slug,league_slug,season,route) VALUES($1,'netherlands','eredivisie','2024-2025','/x')`, [key]);
      // The parser in force at ingest did not keep Odd_1_FT (stands for any parser change deployed later).
      const oldParse = text => { const p = parseCsv(text); return {...p, rows: p.rows.map(({Odd_1_FT, ...r}) => r)}; };
      const put = async (text, at) => {
        const p = oldParse(text);
        await store.storeDataset(c, {datasetKey: key, sourceKind: 'dataset', providerPath: '/x', countrySlug: 'netherlands', leagueSlug: 'eredivisie',
          season: '2024-2025', text, headers: p.headers, rows: p.rows, acquiredAt: new Date(at)});
      };
      const m = (id, home, away) => ({Id: id, Date: '2025-03-01', Time: '20:00', Home: home, Away: away, Home_Score: '2', Away_Score: '1',
        Odd_1_FT: '1.8', Odd_X_FT: '3.5', Odd_2_FT: '4.0'});
      await put(H.join(',') + '\n' + line(m('100', 'Ajax', 'PSV')) + '\n' + line(m('101', 'PSV', 'Ajax')) + '\n', '2025-05-01T00:00:00Z');
      await put(H.join(',') + '\n' + line(m('100', 'Ajax', 'PSV')) + '\n' + line(m('101', 'PSV', 'Ajax')) + '\n' + line(m('102', 'PSV', 'Twente')) + '\n',
        '2025-07-01T00:00:00Z');
      await teams.replaceTeamEntities(c, teams.buildTeamEntities(await teams.loadTeamSpellings(c)));
      await query.refreshNormalizedLayer(c);
      const ajax = (await query.runQuery(c, 'teamSearch', {q: 'Ajax'})).rows[0].internal_team_id;
      const at = {team: ajax, as_of: '2025-08-01T00:00:00Z', before: '2100-01-01', limit: 50};
      const before = await query.runQuery(c, 'teamMatchesAsOf', at);
      assert.equal(before.pit.label, 'PIT_VERIFIED');
      assert.ok(before.rows.every(r => r.odd_home === null), 'the old parser kept no Odd_1_FT');

      const repaired = await integrity.repairShortSnapshots(c);
      assert.ok(repaired.some(r => r.inserted > 0), 'the repair wrote versions with the current parser');
      const runs = (await c.query(`SELECT mode, status, actor, versions_inserted, finished_at FROM fpt_reprocessing_runs`)).rows;
      assert.equal(runs.length, 1);
      assert.deepEqual([runs[0].mode, runs[0].status, runs[0].actor], ['apply', 'complete', 'repairShortSnapshots']);
      assert.equal(Number(runs[0].versions_inserted), repaired.reduce((n, r) => n + r.inserted, 0));
      await query.refreshNormalizedLayer(c);
      const after = await query.runQuery(c, 'teamMatchesAsOf', at);
      assert.ok(after.rows.every(r => r.odd_home === null), 'no repaired value reaches the answer at T');
      assert.equal(after.pit.label, 'NON_PIT');
      const now = await query.runQuery(c, 'teamMatchesAsOf', {...at, as_of: new Date(new Date(runs[0].finished_at).getTime() + 1000).toISOString()});
      assert.ok(now.rows.some(r => Number(r.odd_home) === 1.8), 'after the repair its versions are usable');
    });
  } finally {
    await db.closePool?.().catch?.(() => {});
    try { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); }
    finally { await admin.end(); }
  }
});
