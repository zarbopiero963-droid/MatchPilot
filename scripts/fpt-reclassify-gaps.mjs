#!/usr/bin/env node
// t132u/t133u: re-evaluate the current_season_stale gaps closed as RECOVERED with per-row evidence. Default is a dry run.
//   node scripts/fpt-reclassify-gaps.mjs [--dry-run] [--out plan.json]
//   node scripts/fpt-reclassify-gaps.mjs --apply --batch t132u-412 --out audit.json
//   node scripts/fpt-reclassify-gaps.mjs --revert --batch t132u-412
// Only data_reconciliation_ledger.recovered_count and details (classification, evidence, history) change. No match data,
// no timestamps, no status column change. One transaction per invocation.
import { writeFileSync } from 'node:fs';
import { withClient, closePool } from '../src/db.mjs';
import { RECLASSIFY_SELECT, planReclassification, applyReclassification, revertReclassification } from '../src/providers/futpython/gap-classes.mjs';

const arg = name => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const has = name => process.argv.includes(name);

export async function run(client, {apply = false, revert = false, batch = null, out = null} = {}) {
  if ((apply || revert) && !batch) throw new Error('--batch is required');
  await client.query('BEGIN');
  try {
    if (revert) {
      const n = await revertReclassification(client, batch);
      await client.query('COMMIT');
      return {mode: 'revert', batch, reverted: n};
    }
    const rows = (await client.query(RECLASSIFY_SELECT)).rows;
    const plan = planReclassification(rows, batch || 'dry-run');
    const counts = plan.reduce((a, p) => ({...a, [p.after.classification]: (a[p.after.classification] || 0) + 1}), {});
    const applied = apply ? await applyReclassification(client, plan) : 0;
    if (out) writeFileSync(out, JSON.stringify({batch, generatedAt: new Date().toISOString(), counts, plan}, null, 1));
    await client.query(apply ? 'COMMIT' : 'ROLLBACK');
    return {mode: apply ? 'apply' : 'dry-run', batch, rows: rows.length, toChange: plan.filter(p => p.change).length, applied, counts};
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try { console.log(JSON.stringify(await withClient(c => run(c, {apply: has('--apply'), revert: has('--revert'), batch: arg('--batch'), out: arg('--out')})))); }
  catch (error) { console.error('FPT_RECLASSIFY_ERROR', String(error?.message || error)); process.exitCode = 1; }
  finally { try { await closePool(); } catch {} }
}
