import test from 'node:test';
import assert from 'node:assert/strict';
import { reprocessingGate } from '../src/futpython-certificate.mjs';

test('reprocessing gate: current parser reproduces the stored rows, raw guarded, no failed run left', () => {
  const ok = {rows_checked: 10, rows_without_version: 0, hash_mismatch: 0, raw_guard_installed: true, failed_runs_unresolved: 0};
  assert.equal(reprocessingGate(ok), true);
  assert.equal(reprocessingGate({...ok, rows_checked: 0}), false);
  assert.equal(reprocessingGate({...ok, rows_without_version: 1}), false);
  assert.equal(reprocessingGate({...ok, hash_mismatch: 1}), false);
  assert.equal(reprocessingGate({...ok, raw_guard_installed: false}), false);
  assert.equal(reprocessingGate({...ok, failed_runs_unresolved: 1}), false);
});

const databaseUrl = process.env.FUTPYTHON_TEST_DATABASE_URL
  || 'postgres://matchpilot:matchpilot_local_test@127.0.0.1:5432/matchpilot_fpt';
const SCHEMA = 'fpt_reprocess_test';

test('a parser change is reprocessed from the raw: dry run, apply, idempotent replay, nothing destroyed', {timeout: 60000}, async t => {
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
  const { reprocessRaw } = await import('../src/providers/futpython/reprocess.mjs');
  const { refreshNormalizedLayer } = await import('../src/providers/futpython/query.mjs');
  const { parseCsv } = await import('../src/lib/csv.mjs');
  const { fullRawSweep, reprocessingSection } = await import('../src/futpython-certificate.mjs');
  try {
    await migrate();
    await db.withClient(async client => {
      // The provider pads one team name with a trailing space; parser v1 keeps it verbatim.
      const text = 'Date,Time,Home,Away,Home_Score,Away_Score\n2024-08-10,18:45,Ajax ,PSV,2,1\n2024-08-17,18:45,PSV,Twente,0,0\n';
      const parsed = parseCsv(text);
      await client.query(`INSERT INTO fpt_catalog(dataset_key,country_slug,league_slug,season,route)
        VALUES('netherlands/eredivisie/2024','netherlands','eredivisie','2024','/api/download/netherlands/eredivisie/2024')`);
      await store.storeDataset(client, {datasetKey: 'netherlands/eredivisie/2024', sourceKind: 'dataset',
        providerPath: '/api/download/netherlands/eredivisie/2024', countrySlug: 'netherlands', leagueSlug: 'eredivisie',
        season: '2024', text, headers: parsed.headers, rows: parsed.rows, acquiredAt: new Date('2024-08-18T00:00:00Z')});
      await refreshNormalizedLayer(client);
      const rawBefore = (await client.query('SELECT snapshot_id, sha256, payload_gzip FROM fpt_raw_snapshots')).rows;
      const versionsBefore = (await client.query('SELECT version_id, payload_sha256, parser_version FROM fpt_match_versions ORDER BY version_id')).rows;
      assert.deepEqual(versionsBefore.map(v => v.parser_version), ['fpt-csv-1', 'fpt-csv-1'], 'lineage written explicitly');

      // Same parser: a full reprocessing is a no-op.
      await assert.rejects(reprocessRaw(client, {mode: 'apply', reason: 'x'}), /actor/);
      let run = await reprocessRaw(client, {mode: 'apply', actor: 'owner', reason: 'replay with the current parser'});
      assert.deepEqual([run.rows, run.unchanged, run.newOutput, run.inserted], [2, 2, 0, 0]);

      // Parser v2 trims cell values. Dry run: the difference is measured, nothing is written.
      const v2 = {sourceProvider: 'futpythontrader', parserVersion: 'fpt-csv-2', schemaVersion: 'fpt-schema-4', transformVersion: 'fpt-norm-1'};
      const trimParse = txt => {
        const p = parseCsv(txt);
        return {...p, rows: p.rows.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v])))};
      };
      run = await reprocessRaw(client, {mode: 'dry_run', parse: trimParse, lineage: v2, actor: 'owner', reason: 'parser v2 dry run'});
      assert.deepEqual([run.unchanged, run.newOutput, run.inserted], [1, 1, 0]);
      assert.equal(run.versionsAfter, run.versionsBefore);
      const diff = (await client.query('SELECT changed_fields FROM fpt_reprocessing_diffs WHERE run_id=$1', [run.runId])).rows;
      assert.deepEqual(diff[0].changed_fields, {Home: {before: 'Ajax ', after: 'Ajax'}}, 'old vs new output, field by field');

      // Apply: one new version with the new lineage and the snapshot's own acquisition time; the old one stays.
      run = await reprocessRaw(client, {mode: 'apply', parse: trimParse, lineage: v2, actor: 'owner', reason: 'parser v2'});
      assert.equal(run.inserted, 1);
      const versions = (await client.query(`SELECT version_id, parser_version, acquired_at, payload->>'Home' AS home
        FROM fpt_match_versions ORDER BY version_id`)).rows;
      assert.equal(versions.length, 3);
      assert.deepEqual(versions.slice(0, 2).map(v => v.version_id), versionsBefore.map(v => v.version_id), 'old versions untouched');
      assert.equal(versions[2].parser_version, 'fpt-csv-2');
      assert.equal(versions[2].home, 'Ajax');
      assert.equal(new Date(versions[2].acquired_at).toISOString(), '2024-08-18T00:00:00.000Z', 'point-in-time timeline kept');
      await refreshNormalizedLayer(client);
      const fact = (await client.query(`SELECT home_name, parser_version FROM fpt_match_facts WHERE match_date='2024-08-10'`)).rows[0];
      assert.deepEqual(fact, {home_name: 'Ajax', parser_version: 'fpt-csv-2'}, 'facts follow the latest output');

      // Idempotent replay: applying v2 again inserts nothing.
      run = await reprocessRaw(client, {mode: 'apply', parse: trimParse, lineage: v2, actor: 'owner', reason: 'parser v2 again'});
      assert.deepEqual([run.unchanged, run.newOutput, run.inserted], [2, 0, 0]);
      const runs = (await client.query(`SELECT mode, status, versions_inserted FROM fpt_reprocessing_runs ORDER BY started_at`)).rows;
      assert.deepEqual(runs.map(r => [r.mode, r.status, Number(r.versions_inserted)]),
        [['apply', 'complete', 0], ['dry_run', 'complete', 0], ['apply', 'complete', 1], ['apply', 'complete', 0]]);

      // Raw untouched and guarded.
      assert.deepEqual((await client.query('SELECT snapshot_id, sha256, payload_gzip FROM fpt_raw_snapshots')).rows, rawBefore);
      await assert.rejects(client.query(`UPDATE fpt_raw_snapshots SET row_count = 0`), /append-only/);
      await client.query(`UPDATE fpt_raw_snapshots SET ingest_complete = true`);
      await assert.rejects(client.query(`DELETE FROM fpt_raw_snapshots`), /owner authorization/);

      // The certificate's sweep (current parser) still finds every raw row as a version: gate green.
      const sweep = await fullRawSweep(client);
      const section = await reprocessingSection(client, sweep);
      assert.equal(section.rows_without_version, 0);
      assert.equal(section.raw_guard_installed, true);
      assert.equal(section.gate, true, JSON.stringify(section));
    });
  } finally {
    await db.closePool();
    const admin = new pg.Client({connectionString: databaseUrl});
    await admin.connect();
    await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await admin.end();
  }
});
