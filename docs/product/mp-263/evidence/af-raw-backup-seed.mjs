// Seeds a throwaway database for the backup/restore check: old pre-033 snapshot rows, raw answers, linked snapshots.
import pg from 'pg';
import { createApiFootballClient, apiFootballConfig } from '../../../../src/providers/apifootball/client.mjs';
import { createPgRequestLedger, saveRawResponse, saveOddsSnapshots } from '../../../../src/providers/apifootball/store.mjs';
import { oddsSnapshotsFromResult } from '../../../../src/providers/apifootball/odds-snapshots.mjs';
const pool = new pg.Pool({connectionString: process.argv[2]});
const T0 = Date.UTC(2026, 10, 2, 9), KO = T0 + 3 * 3600000;
let clock = T0;
const text = id => `{"get":"odds","parameters":{"fixture":"${id}"},"errors":[],"results":1,"x":1,"response":[{"fixture":{"id":${id},"timestamp":${KO / 1000}},"update":"2026-11-02T08:50:00+00:00","bookmakers":[{"id":8,"name":"B","bets":[{"id":1,"name":"Match Winner","values":[{"value":"Home","odd":"2.10"},{"value":"Away","odd":"3.10"}]}]}]}]}`;
const client = createApiFootballClient({config: apiFootballConfig({APIFOOTBALL_ENABLED: 'true', APIFOOTBALL_KEY: 'test-key-not-real', APIFOOTBALL_REQUESTS_PER_DAY: '100', APIFOOTBALL_REQUESTS_PER_MINUTE: '50'}),
  ledger: createPgRequestLedger(pool), now: () => clock, sleep: async () => {},
  fetchImpl: async u => { clock += 50; const t = text(new URL(u).searchParams.get('fixture')); return {status: 200, headers: new Headers({date: 'Mon, 02 Nov 2026 09:00:00 GMT'}), arrayBuffer: async () => new TextEncoder().encode(t).buffer}; }});
const conn = await pool.connect();
for (let f = 1; f <= 20; f++) {
  const r = await client.get('/odds', {fixture: f}, {purpose: 'prematch-collector'});
  const {raw_id} = await saveRawResponse(pool, r);
  await saveOddsSnapshots(conn, oddsSnapshotsFromResult(r, {rawId: raw_id}).rows);
}
conn.release();
await pool.end();
