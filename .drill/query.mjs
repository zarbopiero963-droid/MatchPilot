import pg from 'pg';
const sql = process.argv[2];
if (!sql) {
  console.error('missing sql');
  process.exit(2);
}
function redact(s) {
  return String(s || '')
    .replace(/postgres(?:ql)?:\/\/\S+/gi, 'postgres://[REDACTED]')
    .replace(/api_key=[^&\s]+/gi, 'api_key=[REDACTED]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]');
}
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  connectionTimeoutMillis: 20000,
  statement_timeout: 60000
});
try {
  const res = await pool.query(sql);
  process.stdout.write(JSON.stringify(res.rows, (k, v) => typeof v === 'bigint' ? String(v) : v) + '\n');
} catch (e) {
  console.error('QUERY_FAIL', redact(e.message));
  process.exit(1);
} finally {
  await pool.end();
}
