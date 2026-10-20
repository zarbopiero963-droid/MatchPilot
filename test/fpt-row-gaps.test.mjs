// APP-01 (#179 F3): the snapshot row-gap check (PHASE3_SQL.rowGaps) rewritten as one aggregation instead of a subquery
// that scanned fpt_match_versions once per snapshot. The ORACLE is the previous query, kept here verbatim: on the same
// database state both must return the same number, for a clean archive and for every kind of injected difference.
// The performance regression is checked on the plan: fpt_match_versions is read once, never once per snapshot.
import assert from 'node:assert/strict';
import test from 'node:test';
import {PHASE3_SQL} from '../src/providers/futpython/integrity.mjs';
import {seedLeague} from './helpers/fpt-seed.mjs';

const ROOT_URL = process.env.FUTPYTHON_TEST_DATABASE_URL || 'postgres://matchpilot:matchpilot_local_test@127.0.0.1:5432/matchpilot_fpt';

// The query of main 3dd833f, unchanged: the reference the new one must agree with.
const ORACLE = `SELECT count(*)::int AS n
    FROM fpt_raw_snapshots r
    WHERE r.source_kind='dataset'
      AND NOT EXISTS (SELECT 1 FROM fpt_raw_snapshots e WHERE e.dataset_key = r.dataset_key AND e.source_kind='dataset'
                        AND e.snapshot_id < r.snapshot_id)
      AND r.row_count <> (SELECT count(*)::int FROM fpt_match_versions v WHERE v.snapshot_id=r.snapshot_id)`;

async function withArchive(t, fn) {
  const pg = (await import('pg')).default;
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(ROOT_URL).hostname), 'remote PostgreSQL is forbidden');
  const admin = new pg.Client({connectionString: ROOT_URL, connectionTimeoutMillis: 2000});
  try { await admin.connect(); }
  catch (cause) {
    await admin.end().catch(() => {});
    if (process.env.CI) throw cause;
    return t.skip('throwaway postgres unavailable');
  }
  const schema = `row_gaps_${process.pid}_${Date.now()}`;
  const url = new URL(ROOT_URL);
  url.searchParams.set('options', `-c search_path=${schema}`);
  const client = new pg.Client({connectionString: url.toString()});
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    await client.connect();
    const {readdir, readFile} = await import('node:fs/promises');
    for (const file of (await readdir('migrations')).filter(name => name.endsWith('.sql')).sort()) await client.query(await readFile(`migrations/${file}`, 'utf8'));
    // Six datasets through the real ingestion path; two of them get a later snapshot too.
    for (const [i, league] of ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta'].entries()) {
      await seedLeague(client, {country: `c${i}`, league, teams: ['A', 'B', 'C', 'D', 'E'], perDay: 2, year: 2020 + (i % 3)});
    }
    return await fn(client);
  } finally {
    await client.end().catch(() => {});
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
}

const count = async (client, sql) => (await client.query(sql)).rows[0].n;

// Every mutation runs in a transaction that is rolled back, so each case starts from the same clean archive.
async function inTx(client, fn) {
  await client.query('BEGIN');
  try {
    // The raw-snapshot guard trigger forbids edits of stored raw; the test needs them to build broken archives.
    await client.query('ALTER TABLE fpt_raw_snapshots DISABLE TRIGGER USER');
    return await fn();
  } finally {
    await client.query('ROLLBACK');
  }
}

async function snapshotCopy(client, {from, datasetKey, sha, rowCount, kind = 'dataset'}) {
  const cols = (await client.query(`SELECT string_agg(quote_ident(column_name), ',' ORDER BY ordinal_position) AS c
    FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'fpt_raw_snapshots'
      AND column_name NOT IN ('snapshot_id', 'dataset_key', 'sha256', 'row_count', 'source_kind')`)).rows[0].c;
  return (await client.query(`INSERT INTO fpt_raw_snapshots(dataset_key, sha256, row_count, source_kind, ${cols})
    SELECT $2, $3, $4, $5, ${cols} FROM fpt_raw_snapshots WHERE snapshot_id = $1 RETURNING snapshot_id`,
  [from, datasetKey ?? null, sha, rowCount, kind])).rows[0].snapshot_id;
}

async function dropVersions(client, snapshotId, howMany) {
  const ids = (await client.query('SELECT version_id FROM fpt_match_versions WHERE snapshot_id = $1 ORDER BY version_id LIMIT $2', [snapshotId, howMany])).rows.map(r => r.version_id);
  await client.query('DELETE FROM fpt_match_facts WHERE version_id = ANY($1)', [ids]);
  await client.query('DELETE FROM fpt_match_versions WHERE version_id = ANY($1)', [ids]);
}

test('row gaps: the rewritten query agrees with the previous one on a clean and on broken archives', {timeout: 180000}, async t => {
  await withArchive(t, async client => {
    const snaps = (await client.query(`SELECT snapshot_id, dataset_key, row_count FROM fpt_raw_snapshots WHERE source_kind='dataset' ORDER BY snapshot_id`)).rows;
    assert.equal(snaps.length, 6);
    assert.equal(await count(client, ORACLE), 0);
    assert.equal(await count(client, PHASE3_SQL.rowGaps), 0, 'clean archive: no gap');

    const cases = [
      ['versions missing from one first snapshot', 1, async () => dropVersions(client, snaps[0].snapshot_id, 3)],
      ['versions missing from three first snapshots', 3, async () => { for (const s of snaps.slice(0, 3)) await dropVersions(client, s.snapshot_id, 1); }],
      ['row_count above the stored versions', 2, async () => client.query('UPDATE fpt_raw_snapshots SET row_count = row_count + 1 WHERE snapshot_id = ANY($1)', [[snaps[1].snapshot_id, snaps[4].snapshot_id]])],
      ['row_count below the stored versions', 1, async () => client.query('UPDATE fpt_raw_snapshots SET row_count = row_count - 2 WHERE snapshot_id = $1', [snaps[5].snapshot_id])],
      ['a later snapshot that differs is not a first snapshot', 0, async () => snapshotCopy(client, {from: snaps[0].snapshot_id, datasetKey: snaps[0].dataset_key, sha: 'later', rowCount: 999})],
      ['a first snapshot without versions and row_count 0 is no gap', 0, async () => snapshotCopy(client, {from: snaps[0].snapshot_id, datasetKey: 'zz/empty/0', sha: 'e0', rowCount: 0})],
      ['a first snapshot without versions and row_count 5 is a gap', 1, async () => snapshotCopy(client, {from: snaps[0].snapshot_id, datasetKey: 'zz/empty/5', sha: 'e5', rowCount: 5})],
      ['a today snapshot is never counted', 0, async () => snapshotCopy(client, {from: snaps[0].snapshot_id, datasetKey: 'zz/today', sha: 't', rowCount: 7, kind: 'today'})],
    ];
    for (const [what, expected, mutate] of cases) {
      await inTx(client, async () => {
        await mutate();
        const oracle = await count(client, ORACLE);
        const got = await count(client, PHASE3_SQL.rowGaps);
        assert.equal(oracle, expected, `${what}: oracle`);
        assert.equal(got, oracle, `${what}: rewritten query`);
      });
    }
    // Seeded combinations of the mutations above: the two queries always agree.
    let seed = 20261020;
    const next = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let round = 0; round < 25; round++) {
      await inTx(client, async () => {
        for (const s of snaps) {
          const pick = next();
          if (pick < 0.25) await dropVersions(client, s.snapshot_id, 1 + Math.floor(next() * 3));
          else if (pick < 0.45) await client.query('UPDATE fpt_raw_snapshots SET row_count = row_count + $2 WHERE snapshot_id = $1', [s.snapshot_id, 1 + Math.floor(next() * 4)]);
          else if (pick < 0.6) await snapshotCopy(client, {from: s.snapshot_id, datasetKey: s.dataset_key, sha: `later-${round}-${s.snapshot_id}`, rowCount: Math.floor(next() * 50)});
        }
        assert.equal(await count(client, PHASE3_SQL.rowGaps), await count(client, ORACLE), `round ${round}`);
      });
    }
  });
});

test('row gaps: fpt_match_versions is read once, not once per snapshot (performance regression)', {timeout: 180000}, async t => {
  await withArchive(t, async client => {
    await client.query('ANALYZE');
    const plan = (await client.query(`EXPLAIN (ANALYZE, FORMAT JSON) ${PHASE3_SQL.rowGaps}`)).rows[0]['QUERY PLAN'][0].Plan;
    const scans = [];
    (function walk(node) {
      if (node['Relation Name'] === 'fpt_match_versions') scans.push({type: node['Node Type'], loops: node['Actual Loops']});
      for (const child of node.Plans ?? []) walk(child);
    })(plan);
    assert.ok(scans.length >= 1, 'the query reads fpt_match_versions');
    assert.ok(scans.every(scan => scan.loops === 1), `each read of fpt_match_versions runs once: ${JSON.stringify(scans)}`);
    // The previous query fails this check: its correlated subquery ran once per dataset snapshot.
    const oldPlan = (await client.query(`EXPLAIN (ANALYZE, FORMAT JSON) ${ORACLE}`)).rows[0]['QUERY PLAN'][0].Plan;
    const oldLoops = [];
    (function walk(node) {
      if (node['Relation Name'] === 'fpt_match_versions') oldLoops.push(node['Actual Loops']);
      for (const child of node.Plans ?? []) walk(child);
    })(oldPlan);
    assert.ok(oldLoops.some(loops => loops > 1), `oracle sanity: the old plan reads fpt_match_versions once per snapshot (${oldLoops})`);
  });
});
