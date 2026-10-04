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
    pool.on('error', error => {
      console.error('PG_POOL_ERROR', String(error?.message || error).replace(/postgres(?:ql)?:\/\/\S+/gi, 'postgres://[REDACTED]'));
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
  const onError = error => {
    console.error('PG_CLIENT_ERROR', String(error?.message || error).replace(/postgres(?:ql)?:\/\/\S+/gi, 'postgres://[REDACTED]'));
  };
  client.on('error', onError);
  try { return await fn(client); }
  finally {
    client.removeListener('error', onError);
    client.release();
  }
}
