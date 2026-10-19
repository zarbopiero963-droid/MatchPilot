// R-06a (#3, #30, QUERY-CORE-02, MP-WEB-007): deterministic keyset pagination for match search and the matches of a
// day. A page never loses or repeats a match, even across matches sharing a date or with no kickoff time; a cursor
// is bound to its query and filters and is refused when tampered with.
import assert from 'node:assert/strict';
import test from 'node:test';
import {buildQuery, QueryInputError} from '../src/providers/futpython/query.mjs';
import {seedEredivisie} from './helpers/fpt-seed.mjs';

const ROOT_URL = process.env.FUTPYTHON_TEST_DATABASE_URL || 'postgres://matchpilot:matchpilot_local_test@127.0.0.1:5432/matchpilot_fpt';
const COMP = 'fpt:competition:' + 'b'.repeat(32);

test('cursors are validated: malformed, tampered, other query or other filters are refused', () => {
  for (const bad of ['not-base64!', 'eHl6', Buffer.from('2|s|2024-08-01||fpt:x|0000000000000000').toString('base64url'), 'a'.repeat(300)]) {
    assert.throws(() => buildQuery('searchMatches', {cursor: bad}), QueryInputError, bad);
    assert.throws(() => buildQuery('matchesOnDate', {date: '2024-08-01', cursor: bad}), QueryInputError, bad);
  }
});

let pg;
async function withSeed(t, fn) {
  pg ??= (await import('pg')).default;
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(ROOT_URL).hostname), 'remote PostgreSQL is forbidden');
  const admin = new pg.Client({connectionString: ROOT_URL, connectionTimeoutMillis: 2000});
  try { await admin.connect(); }
  catch (cause) {
    await admin.end().catch(() => {});
    if (process.env.CI) throw cause;
    return t.skip('throwaway postgres unavailable');
  }
  const schema = `fpt_pagination_${process.pid}_${Date.now()}`;
  const url = new URL(ROOT_URL);
  url.searchParams.set('options', `-c search_path=${schema}`);
  const client = new pg.Client({connectionString: url.toString()});
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    await client.connect();
    // The schema starts empty: apply the full migration chain on this connection.
    const {readdir, readFile} = await import('node:fs/promises');
    for (const file of (await readdir('migrations')).filter(name => name.endsWith('.sql')).sort()) {
      await client.query(await readFile(`migrations/${file}`, 'utf8'));
    }
    const seed = await seedEredivisie(client);
    return await fn(client, seed);
  } finally {
    await client.end().catch(() => {});
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
}

async function walk(runQuery, client, name, input) {
  const pages = [];
  let cursor;
  for (let guard = 0; guard < 100; guard++) {
    const page = await runQuery(client, name, {...input, ...(cursor ? {cursor} : {})});
    pages.push(page.rows.map(row => row.internal_match_id));
    cursor = page.next_cursor;
    if (!cursor) return pages;
  }
  throw new Error('pagination did not terminate');
}

test('search pages cover exactly the unpaginated result, in order, across same-date matches', {timeout: 120000}, async t => {
  await withSeed(t, async (client, seed) => {
    const {runQuery} = await import('../src/providers/futpython/query.mjs');
    const input = {competition: seed.competition, before: '2100-01-01'};
    const all = (await runQuery(client, 'searchMatches', {...input, limit: 500})).rows.map(row => row.internal_match_id);
    assert.equal(all.length, seed.matches);
    for (const limit of [1, 2, 4, 7, 30]) {
      const pages = await walk(runQuery, client, 'searchMatches', {...input, limit});
      assert.deepEqual(pages.flat(), all, `limit ${limit}: no gap, no duplicate, same order`);
      assert.ok(pages.every((page, i) => page.length === limit || i === pages.length - 1));
      assert.deepEqual(await walk(runQuery, client, 'searchMatches', {...input, limit}), pages, 'deterministic');
    }
    // A full last page reports no further page.
    const exact = await runQuery(client, 'searchMatches', {...input, limit: 30});
    assert.equal(exact.rows.length, 30);
    assert.equal(exact.next_cursor, null);

    // A cursor only works for the query and filters that produced it.
    const first = await runQuery(client, 'searchMatches', {...input, limit: 2});
    assert.ok(first.next_cursor);
    assert.throws(() => buildQuery('searchMatches', {...input, limit: 2, min_goals: 1, cursor: first.next_cursor}), QueryInputError);
    assert.throws(() => buildQuery('searchMatches', {competition: COMP, before: '2100-01-01', cursor: first.next_cursor}), QueryInputError);
    assert.throws(() => buildQuery('matchesOnDate', {date: seed.dates[0], cursor: first.next_cursor}), QueryInputError);
    // Changing only the page size keeps the cursor valid.
    assert.doesNotThrow(() => buildQuery('searchMatches', {...input, limit: 5, cursor: first.next_cursor}));
  });
});

test('matches of a day: kickoff order, missing kickoff last, every match once', {timeout: 120000}, async t => {
  await withSeed(t, async (client, seed) => {
    const {runQuery} = await import('../src/providers/futpython/query.mjs');
    const date = seed.dates[0];
    const all = (await runQuery(client, 'matchesOnDate', {date})).rows;
    assert.equal(all.length, 3);
    assert.deepEqual(all.map(row => row.kickoff_local_time ?? null), ['15:00', '20:45', null]);
    assert.equal((await runQuery(client, 'matchesOnDate', {date})).next_cursor, null, 'the whole day fits: no next page');
    const pages = await walk(runQuery, client, 'matchesOnDate', {date, limit: 1});
    assert.deepEqual(pages.flat(), all.map(row => row.internal_match_id));
    const cursor = (await runQuery(client, 'matchesOnDate', {date, limit: 1})).next_cursor;
    assert.throws(() => buildQuery('matchesOnDate', {date: seed.dates[1], limit: 1, cursor}), QueryInputError, 'a cursor of another day is refused');
  });
});

test('API v1 exposes cursor and next_cursor and answers 400 for a bad cursor', {timeout: 120000}, async t => {
  await withSeed(t, async (client, seed) => {
    const {handleV1} = await import('../src/api/v1.mjs');
    const call = async path => handleV1({method: 'GET', url: new URL(path, 'http://localhost')}, {withClient: fn => fn(client), tc: {}, codeVersion: 'test'});
    const first = await call(`/api/v1/fpt/search?competition=${encodeURIComponent(seed.competition)}&before=2100-01-01&limit=4`);
    assert.equal(first.status, 200);
    assert.equal(first.body.data.rows.length, 4);
    assert.match(first.body.data.next_cursor, /^[A-Za-z0-9_-]+$/);
    assert.ok(first.body.data.next_cursor.length <= 200, 'fits the v1 parameter limit');
    const second = await call(`/api/v1/fpt/search?competition=${encodeURIComponent(seed.competition)}&before=2100-01-01&limit=4&cursor=${first.body.data.next_cursor}`);
    assert.equal(second.status, 200);
    assert.notEqual(second.body.data.rows[0].internal_match_id, first.body.data.rows[0].internal_match_id);
    const bad = await call(`/api/v1/fpt/search?competition=${encodeURIComponent(seed.competition)}&cursor=garbage`);
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error.code, 'BAD_REQUEST');
    assert.match(bad.body.error.message, /cursor/);
    const day = await call(`/api/v1/fpt/matches?date=${seed.dates[0]}&limit=2`);
    assert.equal(day.status, 200);
    assert.equal(day.body.data.rows.length, 2);
    assert.ok(day.body.data.next_cursor);
  });
});

test('real-world ids and kickoffs paginate through the API; order is byte order on every collation', {timeout: 120000}, async t => {
  await withSeed(t, async (client, seed) => {
    const {handleV1} = await import('../src/api/v1.mjs');
    // Provider ids are fpt:id:<any CSV Id> and kickoffs are raw provider text (PR #162 review B-2, NB-1).
    const odd = ['fpt:id:12345.0', 'fpt:id:AB 12', 'fpt:id:a1', 'fpt:id:B1', 'fpt:id:_x', `fpt:id:${'Z'.repeat(150)}`];
    const day = seed.dates[1];
    const ids = (await client.query("SELECT internal_match_id FROM fpt_match_facts ORDER BY internal_match_id COLLATE \"C\" LIMIT 6")).rows.map(row => row.internal_match_id);
    for (let i = 0; i < ids.length; i++) {
      await client.query(`UPDATE fpt_match_facts SET internal_match_id = $1, match_date = $2::date, kickoff_local_time = $3 WHERE internal_match_id = $4`,
        [odd[i], day, i < 4 ? '15:00' : '15:00 (CET, posticipo)', ids[i]]);
    }
    const call = async path => handleV1({method: 'GET', url: new URL(path, 'http://localhost')}, {withClient: fn => fn(client), tc: {}, codeVersion: 'test'});
    for (const base of [`/api/v1/fpt/search?competition=${encodeURIComponent(seed.competition)}&before=2100-01-01`, `/api/v1/fpt/matches?date=${day}`]) {
      const all = (await call(`${base}&limit=500`)).body.data.rows.map(row => row.internal_match_id);
      const seen = [];
      let cursor = null;
      for (let guard = 0; guard < 100; guard++) {
        const page = await call(`${base}&limit=1${cursor ? `&cursor=${cursor}` : ''}`);
        assert.equal(page.status, 200, JSON.stringify(page.body.error));
        seen.push(...page.body.data.rows.map(row => row.internal_match_id));
        cursor = page.body.data.next_cursor;
        if (!cursor) break;
      }
      assert.deepEqual(seen, all, base);
    }
    // Within one date and kickoff, ids come in byte order, whatever the database collation.
    const sameKick = (await call(`/api/v1/fpt/matches?date=${day}&limit=500`)).body.data.rows
      .filter(row => row.kickoff_local_time === '15:00').map(row => row.internal_match_id);
    assert.deepEqual(sameKick, [...sameKick].sort((a, b) => (Buffer.compare(Buffer.from(a), Buffer.from(b)))));
    assert.ok(sameKick.includes('fpt:id:B1') && sameKick.includes('fpt:id:a1'));
    assert.ok(sameKick.indexOf('fpt:id:B1') < sameKick.indexOf('fpt:id:a1'), 'uppercase before lowercase: byte order, not a linguistic collation');
  });
});

test('a deep search page scans only its own rows (PR #162 review B-1)', {timeout: 180000}, async t => {
  await withSeed(t, async (client, seed) => {
    const {buildQuery, runQuery} = await import('../src/providers/futpython/query.mjs');
    // 60,000 synthetic rows in the throwaway schema (the version foreign key is dropped there only).
    await client.query('ALTER TABLE fpt_match_facts DROP CONSTRAINT IF EXISTS fpt_match_facts_version_id_fkey');
    await client.query(`INSERT INTO fpt_match_facts(internal_match_id, match_key, version_id, snapshot_id, dataset_key, phase, acquired_at,
        internal_competition_id, season_id, match_date, kickoff_local_time, kickoff_tz_status, result_status, source_provider,
        parser_version, schema_version, transform_version, facts_version)
      SELECT 'fpt:id:perf' || g, 'perf' || g, t.version_id, t.snapshot_id, t.dataset_key, t.phase, t.acquired_at,
        t.internal_competition_id, t.season_id, DATE '2000-01-01' + (g / 20), '12:00', t.kickoff_tz_status, t.result_status, t.source_provider,
        t.parser_version, t.schema_version, t.transform_version, t.facts_version
      FROM generate_series(1, 60000) AS g, (SELECT * FROM fpt_match_facts LIMIT 1) AS t`);
    await client.query('ANALYZE fpt_match_facts');
    const input = {competition: seed.competition, before: '2100-01-01', limit: 50};
    // Walk to a page roughly in the middle, using limit 500 pages and then a normal page.
    let cursor;
    for (let i = 0; i < 60; i++) cursor = (await runQuery(client, 'searchMatches', {...input, limit: 500, ...(cursor ? {cursor} : {})})).next_cursor;
    const q = buildQuery('searchMatches', {...input, cursor});
    const plan = (await client.query(`EXPLAIN (ANALYZE, FORMAT JSON) ${q.sql}`, q.values)).rows[0]['QUERY PLAN'][0];
    let removed = 0;
    const visit = node => { removed += node['Rows Removed by Filter'] || 0; (node.Plans || []).forEach(visit); };
    visit(plan.Plan);
    assert.ok(removed < 1000, `deep page discarded ${removed} rows`);
  });
});
