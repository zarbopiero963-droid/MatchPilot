import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { withClient, closePool } from './db.mjs';

export async function migrate() {
  const dir = resolve('migrations');
  const files = (await readdir(dir)).filter(f => f.endsWith('.sql')).sort();
  await withClient(async client => {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations(
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    for (const file of files) {
      const done = await client.query('SELECT 1 FROM schema_migrations WHERE filename=$1',[file]);
      if (done.rowCount) continue;
      const sql = await readFile(resolve(dir,file),'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations(filename) VALUES($1)',[file]);
        await client.query('COMMIT');
        console.log('MIGRATION_APPLIED '+file);
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      }
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrate().then(closePool).catch(e => { console.error(e); process.exitCode=1; });
}
