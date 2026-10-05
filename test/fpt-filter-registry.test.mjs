import test from 'node:test';
import assert from 'node:assert/strict';
import { filtersGate } from '../src/futpython-certificate.mjs';

test('filter registry gate needs seen dates, source, phases and consistent index flags', () => {
  const ok = {registry_rows: 3, schema_fields: 3, unclassified_family: 0, timing_unset: 0, postmatch_marked_safe: 0,
    without_seen: 0, without_source: 0, without_phases: 0, indexed_fields: 2, indexed_inconsistent: 0};
  assert.equal(filtersGate(ok), true);
  assert.equal(filtersGate({...ok, without_seen: 1}), false);
  assert.equal(filtersGate({...ok, without_source: 1}), false);
  assert.equal(filtersGate({...ok, without_phases: 1}), false);
  assert.equal(filtersGate({...ok, indexed_fields: 0}), false);
  assert.equal(filtersGate({...ok, indexed_inconsistent: 1}), false);
});

const databaseUrl = process.env.FUTPYTHON_TEST_DATABASE_URL
  || 'postgres://matchpilot:matchpilot_local_test@127.0.0.1:5432/matchpilot_fpt';
const SCHEMA = 'fpt_registry_test';

test('registry reads index usage from the catalog and keeps first/last seen', {timeout: 60000}, async t => {
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
  const query = await import('../src/providers/futpython/query.mjs');
  const { parseCsv } = await import('../src/lib/csv.mjs');
  try {
    await migrate();
    await db.withClient(async client => {
      const text = 'Date,Time,Home,Away,Home_Score,Away_Score,Odd_1_FT,xG_Home_FT,Corners_Home_FT\n'
        + '2024-08-10,18:45,Ajax,PSV,2,1,2.10,1.4,6\n';
      const parsed = parseCsv(text);
      await client.query(`INSERT INTO fpt_catalog(dataset_key,country_slug,league_slug,season,route) VALUES('netherlands/eredivisie/2024','netherlands','eredivisie','2024','/api/download/netherlands/eredivisie/2024')`);
      await store.storeDataset(client, {datasetKey: 'netherlands/eredivisie/2024', sourceKind: 'dataset',
        providerPath: '/api/download/netherlands/eredivisie/2024', countrySlug: 'netherlands', leagueSlug: 'eredivisie',
        season: '2024', text, headers: parsed.headers, rows: parsed.rows, acquiredAt: new Date('2024-08-11T00:00:00Z')});
      await query.refreshNormalizedLayer(client);
      const rows = Object.fromEntries((await query.runQuery(client, 'filters', {})).rows.map(r => [r.field_name, r]));
      assert.equal(rows.Date.indexed, true);
      assert.ok(rows.Date.index_names.includes('fpt_match_facts_date_idx'));
      assert.equal(rows.Date.source, 'fpt_match_facts.match_date');
      assert.equal(rows.Home.indexed, true);
      assert.ok(rows.Home.index_names.includes('fpt_match_facts_home_idx'));
      assert.equal(rows.Odd_1_FT.fact_column, 'odd_home');
      assert.equal(rows.Odd_1_FT.indexed, false, 'odd_home has no leading index: never claimed');
      assert.equal(rows.Corners_Home_FT.source, 'fpt_match_versions.payload');
      assert.equal(rows.Corners_Home_FT.indexed, false);
      for (const r of Object.values(rows)) {
        assert.ok(r.first_seen && r.last_seen, r.field_name);
        assert.deepEqual(r.phases, ['HISTORICAL'], r.field_name);
        assert.equal(r.registry_version, 'fpt-filters-2');
      }
      // A new index on the fact column is picked up from the catalog on the next refresh.
      await client.query('CREATE INDEX fpt_match_facts_odd_home_test_idx ON fpt_match_facts(odd_home)');
      await client.query('SELECT fpt_refresh_filter_registry()');
      const after = (await client.query(`SELECT indexed, index_names FROM fpt_filter_registry WHERE field_name='Odd_1_FT'`)).rows[0];
      assert.equal(after.indexed, true);
      assert.deepEqual(after.index_names, ['fpt_match_facts_odd_home_test_idx']);
    });
  } finally {
    await db.closePool();
    const admin = new pg.Client({connectionString: databaseUrl});
    await admin.connect();
    await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await admin.end();
  }
});
