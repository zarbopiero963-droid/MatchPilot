#!/usr/bin/env node
// APP-01 (#179 F3): reproducible benchmark of /api/futpython-certification and of the snapshot row-gap check on
// SYNTHETIC data, in a throwaway schema of a LOCAL PostgreSQL only. Not part of `npm test`: run it by hand.
//   node tools/perf/fpt-certification-bench.mjs [--datasets 400] [--teams 20] [--runs 3] [--keep]
// Datasets go through the real ingestion path (storeDataset); the normalized layer is refreshed once at the end.
// Output: one JSON line with volumes, the endpoint time per run, the previous and the current row-gap query (time and
// result) and whether fpt_match_versions is read once. The schema is dropped unless --keep is given.
import {readFile, readdir} from 'node:fs/promises';
import pg from 'pg';
import {parseCsv} from '../../src/lib/csv.mjs';
import {PHASE3_SQL} from '../../src/providers/futpython/integrity.mjs';
import {refreshNormalizedLayer} from '../../src/providers/futpython/query.mjs';
import {storeDataset} from '../../src/providers/futpython/store.mjs';
import {seedRows} from '../../test/helpers/fpt-seed.mjs';

// The query before APP-01, kept verbatim as the baseline.
const PREVIOUS_ROW_GAPS = `SELECT count(*)::int AS n
    FROM fpt_raw_snapshots r
    WHERE r.source_kind='dataset'
      AND NOT EXISTS (SELECT 1 FROM fpt_raw_snapshots e WHERE e.dataset_key = r.dataset_key AND e.source_kind='dataset'
                        AND e.snapshot_id < r.snapshot_id)
      AND r.row_count <> (SELECT count(*)::int FROM fpt_match_versions v WHERE v.snapshot_id=r.snapshot_id)`;

const option = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  return at < 0 ? fallback : Number(process.argv[at + 1]);
};
const datasets = option('datasets', 400);
const teamCount = option('teams', 20);
const runs = option('runs', 3);
const keep = process.argv.includes('--keep');

const ROOT = process.env.FUTPYTHON_TEST_DATABASE_URL || 'postgres://matchpilot:matchpilot_local_test@127.0.0.1:5432/matchpilot_fpt';
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(ROOT).hostname)) throw new Error('local PostgreSQL only');

const schema = `bench_${process.pid}_${Date.now()}`;
const url = new URL(ROOT);
url.searchParams.set('options', `-c search_path=${schema}`);
const admin = new pg.Client({connectionString: ROOT});
await admin.connect();
await admin.query(`CREATE SCHEMA ${schema}`);
const client = new pg.Client({connectionString: url.toString()});
await client.connect();
const ms = start => Math.round(Number(process.hrtime.bigint() - start) / 1e6);
try {
  for (const file of (await readdir('migrations')).filter(name => name.endsWith('.sql')).sort()) await client.query(await readFile(`migrations/${file}`, 'utf8'));
  const teams = Array.from({length: teamCount}, (_, i) => `Team${String(i).padStart(2, '0')}`);
  let started = process.hrtime.bigint();
  for (let d = 0; d < datasets; d++) {
    const [country, league, year] = [`country${d % 50}`, `league${Math.floor(d / 50)}`, 2015 + (d % 10)];
    const season = `${year}-${year + 1}`;
    const key = `${country}/${league}/${season}`;
    const rows = seedRows(year, {teams, perDay: 10});
    const text = [Object.keys(rows[0]).join(','), ...rows.map(row => Object.values(row).join(','))].join('\n') + '\n';
    const parsed = parseCsv(text);
    await client.query('INSERT INTO fpt_catalog(dataset_key,country_slug,league_slug,season,route) VALUES($1,$2,$3,$4,$5)', [key, country, league, season, `/api/download/${key}`]);
    await storeDataset(client, {datasetKey: key, sourceKind: 'dataset', providerPath: `/api/download/${key}`, countrySlug: country, leagueSlug: league,
      season, text, headers: parsed.headers, rows: parsed.rows, acquiredAt: new Date(`${year + 1}-06-01T00:00:00Z`)});
  }
  await refreshNormalizedLayer(client);
  await client.query('ANALYZE');
  const seedMs = ms(started);
  const volume = (await client.query(`SELECT (SELECT count(*) FROM fpt_raw_snapshots)::int AS snapshots,
    (SELECT count(*) FROM fpt_match_versions)::int AS versions, (SELECT count(*) FROM fpt_match_facts)::int AS facts`)).rows[0];

  const timed = async sql => { const start = process.hrtime.bigint(); const n = (await client.query(sql)).rows[0].n; return {n, ms: ms(start)}; };
  const versionsReadOnce = async sql => {
    const plan = (await client.query(`EXPLAIN (ANALYZE, FORMAT JSON) ${sql}`)).rows[0]['QUERY PLAN'][0].Plan;
    const loops = [];
    (function walk(node) { if (node['Relation Name'] === 'fpt_match_versions') loops.push(node['Actual Loops']); for (const child of node.Plans ?? []) walk(child); })(plan);
    return loops.every(value => value === 1);
  };
  const previous = await timed(PREVIOUS_ROW_GAPS);
  const current = await timed(PHASE3_SQL.rowGaps);

  process.env.DATABASE_URL = url.toString();
  const {getFutpythonCertificationStatus} = await import('../../src/futpython-certification.mjs');
  const {closePool} = await import('../../src/db.mjs');
  const endpoint = [];
  for (let i = 0; i < runs; i++) { started = process.hrtime.bigint(); await getFutpythonCertificationStatus(); endpoint.push(ms(started)); }
  await closePool();

  console.log(JSON.stringify({data: 'SYNTHETIC', schema: keep ? schema : null, datasets, teams: teamCount, volume, seed_ms: seedMs,
    endpoint_ms: endpoint,
    row_gaps: {previous, current, same_result: previous.n === current.n,
      versions_read_once: {previous: await versionsReadOnce(PREVIOUS_ROW_GAPS), current: await versionsReadOnce(PHASE3_SQL.rowGaps)}}}));
} finally {
  await client.end();
  if (!keep) await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
}
