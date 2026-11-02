// Migration helpers for the PostgreSQL tests (MP-MIG-030-PROMOTE-01). A database "as it was before" a migration is
// built by the real runner on a throwaway copy of migrations/ that stops before that file, so the upgrade the tests
// exercise is the one a deployed database goes through, not a hand-applied SQL file.
import {copyFile, mkdtemp, readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

export const MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations/', import.meta.url));
const RUNNER = pathToFileURL(fileURLToPath(new URL('../../src/migrate.mjs', import.meta.url))).href;
const DB = pathToFileURL(fileURLToPath(new URL('../../src/db.mjs', import.meta.url))).href;

export async function migrationFiles(dir = MIGRATIONS_DIR) {
  return (await readdir(dir)).filter(file => file.endsWith('.sql')).sort();
}

// A throwaway directory holding the repository migrations whose name sorts before `first` (e.g. '030'), byte for byte.
export async function migrationsBefore(first, {extra = []} = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'mp-migrations-'));
  for (const file of await migrationFiles()) if (file < first) await copyFile(join(MIGRATIONS_DIR, file), join(dir, file));
  for (const path of extra) await copyFile(path, join(dir, path.split('/').at(-1)));
  return dir;
}

// Arguments for `node` that run the real migrate() on `dir` in a child process (DATABASE_URL comes from its env).
export function migrateArgs(dir) {
  return ['--input-type=module', '-e', `const {migrate} = await import(${JSON.stringify(RUNNER)});
const {closePool} = await import(${JSON.stringify(DB)});
try { await migrate({dir: ${JSON.stringify(dir)}, log: line => console.log(line)}); } finally { await closePool(); }`];
}
