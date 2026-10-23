#!/usr/bin/env node
// t135u/t136u FIX-09 end-to-end: real sync process -> real HTTP client -> CSV parser -> isolated PostgreSQL.
// The provider is a local fake HTTP server. NEVER point FPT_E2E_DATABASE_URL at a real database: the script migrates it.
//   FPT_E2E_DATABASE_URL=postgres://.../scratch FPT_E2E_CSV=/path/seriea.csv node scripts/qa/fpt-e2e-cycles.mjs
import http from 'node:http'; import fs from 'node:fs'; import {spawn} from 'node:child_process'; import {once} from 'node:events';
import pg from 'pg';
const DB = process.env.FPT_E2E_DATABASE_URL; const CSV = process.env.FPT_E2E_CSV; const CODE = process.env.FPT_E2E_CODE || process.cwd();
if (!DB || !/scratch|e2e|test/i.test(DB)) { console.error('FPT_E2E_DATABASE_URL must name a scratch/test database'); process.exit(2); }
const KEY = 'italy/serie-a/2026-2027';
const orig = fs.readFileSync(CSV, 'utf8').trimEnd(); const lines = orig.split('\n'); const hdr = lines[0].split(',');
const col = n => hdr.indexOf(n); const last = lines[lines.length - 1].split(',');
const withNew = (() => { const r = [...last]; r[col('Match_ID')] = '999999001'; r[col('Date')] = '27/09/2026'; r[col('Round')] = 'Round 6'; return orig + '\n' + r.join(','); })();
const updated = (() => { const L = withNew.split('\n'); const r = L[L.length - 1].split(','); r[col('Home_Score')] = '3'; r[col('Away_Score')] = '1'; L[L.length - 1] = r.join(','); return L.join('\n'); })();
let mode = {body: orig + '\n'}; const hits = [];
const srv = http.createServer((req, res) => { const p = req.url.split('?')[0]; hits.push(p);
  if (p === '/api-docs') { res.writeHead(200, {'content-type': 'text/html'}); return res.end(`<html><table><tr><th>País</th><th>Liga</th><th>Temporadas</th><th>Rota</th></tr><tr><td>italy</td><td>serie-a</td><td>2026-2027</td><td>/api/download/${KEY}</td></tr></table></html>`); }
  if (p.startsWith('/api/jogos-do-dia')) { res.writeHead(200, {'content-type': 'text/csv'}); return res.end(''); }
  if (p === `/api/download/${KEY}`) {
    if (mode.status) { res.writeHead(mode.status); return res.end('err'); }
    res.writeHead(200, {'content-type': 'text/csv'}); return res.end(mode.body);
  }
  res.writeHead(404); res.end(); });
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const env = {PATH: process.env.PATH, HOME: process.env.HOME, DATABASE_URL: DB, FUTPYTHON_API_KEY: 'scratch-key',
  FUTPYTHON_BASE_URL: `http://127.0.0.1:${srv.address().port}`, FUTPYTHON_SYNC_DELAY_MS: '0', FUTPYTHON_REQUESTS_PER_MINUTE: '600',
  FUTPYTHON_BACKFILL_REQUESTS_PER_MINUTE: '600', FUTPYTHON_REQUESTS_PER_DAY: '1000', FUTPYTHON_MAX_ATTEMPTS: '1', FUTPYTHON_CIRCUIT_FAILURES: '50'};
const spawnSync = args => spawn(process.execPath, ['src/jobs/futpython-sync.mjs', ...args], {cwd: CODE, env, stdio: ['ignore', 'pipe', 'pipe']});
const run = async (args = []) => { const c = spawnSync(args); let o = ''; c.stdout.on('data', d => o += d); c.stderr.on('data', d => o += d); const [code] = await once(c, 'exit'); return {code, o}; };
process.env.DATABASE_URL = DB; const {migrate} = await import(CODE + '/src/migrate.mjs'); await migrate();
const db = new pg.Client({connectionString: DB}); await db.connect();
const stat = async () => (await db.query(`SELECT
   (SELECT count(*)::int FROM fpt_matches_latest WHERE dataset_key=$1) AS n,
   (SELECT max(match_date)::text FROM fpt_matches_latest WHERE dataset_key=$1) AS max_date,
   (SELECT count(*)::int FROM fpt_match_versions WHERE dataset_key=$1) AS versions,
   (SELECT count(*)::int FROM fpt_raw_snapshots WHERE dataset_key=$1) AS snapshots,
   (SELECT count(*)::int - count(DISTINCT match_key)::int FROM fpt_matches_latest WHERE dataset_key=$1) AS dup,
   (SELECT last_changed_at FROM fpt_dataset_state WHERE dataset_key=$1) AS last_changed_at,
   (SELECT payload->>'Home_Score' || '-' || (payload->>'Away_Score') FROM fpt_matches_latest WHERE dataset_key=$1 AND payload->>'Match_ID'='999999001') AS new_score,
   (SELECT datasets_changed FROM fpt_sync_runs ORDER BY started_at DESC LIMIT 1) AS run_changed`, [KEY])).rows[0];
const results = []; const check = (name, ok, s) => { results.push({name, ok: !!ok, ...s}); console.log((ok ? 'PASS ' : 'FAIL ') + name + ' ' + JSON.stringify(s)); };

await run(['--backfill']); const s1 = await stat();
check('cycle 1 initial import', s1.n === lines.length - 1 && s1.dup === 0 && s1.last_changed_at, s1);
await run(); const s2 = await stat();
check('cycle 2 no change: no duplicates, last_changed_at kept', s2.n === s1.n && s2.versions === s1.versions && s2.snapshots === s1.snapshots
  && String(s2.last_changed_at) === String(s1.last_changed_at) && s2.run_changed === 0, s2);
mode = {body: withNew + '\n'}; await run(); const s3 = await stat();
check('cycle 3 new match ingested on the first cycle after publish', s3.n === s1.n + 1 && s3.max_date === '2026-09-27' && s3.run_changed === 1 && s3.dup === 0, s3);
mode = {body: updated + '\n'}; await run(); const s4 = await stat();
check('cycle 4 existing match updated in place, no duplicate', s4.n === s3.n && s4.new_score === '3-1' && s4.dup === 0 && s4.run_changed === 1, s4);
mode = {status: 503}; await run(); const s5 = await stat();
check('provider error never marks the set updated', s5.n === s4.n && String(s5.last_changed_at) === String(s4.last_changed_at) && s5.snapshots === s4.snapshots, s5);
// Crash mid-import: block the ingest on a lock held here, kill -9 the sync, release, then a normal cycle.
mode = {body: updated + '\n' + updated.split('\n').slice(-1)[0].replace('999999001', '999999002').replace('27/09/2026', '04/10/2026').replace('Round 6', 'Round 7') + '\n'};
const locker = new pg.Client({connectionString: DB}); await locker.connect();
await locker.query('BEGIN'); await locker.query('LOCK TABLE fpt_match_versions IN EXCLUSIVE MODE');
const child = spawnSync([]); child.stdout.resume(); child.stderr.resume();
let waited = 0; while (waited < 60000) { const w = await db.query(`SELECT count(*)::int n FROM pg_locks WHERE NOT granted AND relation='fpt_match_versions'::regclass`); if (w.rows[0].n) break; await new Promise(r => setTimeout(r, 200)); waited += 200; }
const crashed = child.exitCode === null && child.signalCode === null; if (crashed) { child.kill('SIGKILL'); await once(child, 'exit'); } console.log('crash: child killed mid-import =', crashed, 'lockWaitSeen =', waited < 60000); await locker.query('ROLLBACK'); await locker.end();
await new Promise(r => setTimeout(r, 500)); const s6 = await stat();
check('crash mid-import (SIGKILL while ingesting): nothing half-written, set not marked updated', crashed && s6.n === s4.n && s6.snapshots === s4.snapshots
  && String(s6.last_changed_at) === String(s4.last_changed_at), {...s6, blockedMs: waited});
await run(); const s7 = await stat();
check('recovery after crash: next cycle ingests the publish exactly once', s7.n === s4.n + 1 && s7.max_date === '2026-10-04' && s7.dup === 0 && s7.run_changed === 1, s7);
await run(); const s8 = await stat();
check('after recovery a further identical cycle adds nothing', s8.versions === s7.versions && s8.snapshots === s7.snapshots, s8);
console.log('FPT_E2E ' + JSON.stringify({pass: results.filter(r => r.ok).length, fail: results.filter(r => !r.ok).length, providerHits: hits.length}));
await db.end(); srv.close(); process.exit(results.every(r => r.ok) ? 0 : 1);
