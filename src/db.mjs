import pg from 'pg';

let pool;

export function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL missing');
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.DB_POOL_MAX || 4),
      connectionTimeoutMillis: 15000,
      idleTimeoutMillis: 30000
    });
  }
  return pool;
}

export async function closePool() {
  if (pool) {
    const p = pool;
    pool = undefined;
    await p.end();
  }
}

export async function withClient(fn) {
  const client = await getPool().connect();
  try { return await fn(client); }
  finally { client.release(); }
}
