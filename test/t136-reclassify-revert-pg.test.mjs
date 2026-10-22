// t136u: the 412 reclassification revert is byte-exact on a real PostgreSQL (the SQL itself, not a fake ledger).
// Throwaway schema on a local server only; skipped outside CI when no server is reachable.
import assert from 'node:assert/strict';
import test from 'node:test';
import { planReclassification, applyReclassification, revertReclassification } from '../src/providers/futpython/gap-classes.mjs';

test('t136u reclassify apply then revert restores details and recovered_count exactly (real SQL)', {timeout: 30000}, async t => {
  const pg = (await import('pg')).default;
  const url = process.env.FUTPYTHON_TEST_DATABASE_URL || 'postgres://matchpilot:matchpilot_local_test@127.0.0.1:5432/matchpilot_fpt';
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname), 'remote PostgreSQL is forbidden');
  const c = new pg.Client({connectionString: url, connectionTimeoutMillis: 2000});
  try { await c.connect(); } catch (cause) { await c.end().catch(() => {}); if (process.env.CI) throw cause; return t.skip('throwaway postgres unavailable'); }
  const schema = `t136_${process.pid}`;
  try {
    await c.query(`CREATE SCHEMA ${schema}`); await c.query(`SET search_path TO ${schema}`);
    await c.query(`CREATE TABLE data_reconciliation_ledger (reconciliation_id bigint PRIMARY KEY, source text NOT NULL,
      status text NOT NULL, recovered_count int, details jsonb NOT NULL DEFAULT '{}'::jsonb)`);
    await c.query(`INSERT INTO data_reconciliation_ledger VALUES
      (1,'futpython','RECOVERED',1,'{"run_id":"r1","current_kind":"current_season_stale"}'),
      (2,'futpython','RECOVERED',1,'{"classification_evidence":{"rule":"old"},"x":1}')`);
    const before = (await c.query('SELECT reconciliation_id, recovered_count, details::text FROM data_reconciliation_ledger ORDER BY 1')).rows;
    const gap = {status: 'RECOVERED', gap_kind: 'current_season_stale', detected_at: '2026-10-10T00:00:00Z', last_changed_at: '2026-10-01T00:00:00Z',
      last_http_status: 200, availability: 'available', http_disposition: 'ok', last_error: null, ingest_complete: true};
    const rows = (await c.query('SELECT reconciliation_id, recovered_count, details FROM data_reconciliation_ledger ORDER BY 1')).rows
      .map(r => ({...gap, ...r, entity: `e${r.reconciliation_id}`}));
    const plan = planReclassification(rows, 'b1');
    assert.equal(await applyReclassification(c, plan), 2);
    const mid = (await c.query(`SELECT count(*)::int n FROM data_reconciliation_ledger WHERE details->>'classification'='ALREADY_COMPLETE' AND recovered_count=0`)).rows[0].n;
    assert.equal(mid, 2);
    assert.equal(await revertReclassification(c, 'b1'), 2);
    const after = (await c.query('SELECT reconciliation_id, recovered_count, details::text FROM data_reconciliation_ledger ORDER BY 1')).rows;
    assert.deepEqual(after, before, 'byte-exact revert: no empty history, prior evidence back');
  } finally {
    await c.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {}); await c.end();
  }
});
