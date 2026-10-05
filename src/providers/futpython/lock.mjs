// The FutPython sync lock is scoped to the schema that holds the mirror: one lock in production (public), and
// separate locks for isolated test schemas sharing a database.
export const SYNC_LOCK_KEY = 76420311;

export async function trySyncLock(client) {
  const res = await client.query('SELECT pg_try_advisory_lock($1, hashtext(current_schema())) AS ok', [SYNC_LOCK_KEY]);
  return res.rows[0]?.ok === true;
}

export async function releaseSyncLock(client) {
  await client.query('SELECT pg_advisory_unlock($1, hashtext(current_schema()))', [SYNC_LOCK_KEY]);
}
