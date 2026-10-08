import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyResponse, createLimiter, createTcClient, rateLimitBackoffMs, redactSecrets, requestKey } from '../src/providers/totalcorner/client.mjs';
import { walkRow, phaseOf, bodyRows, createCensus } from '../src/providers/totalcorner/schema.mjs';
import { bookmakerNames, kickoffOffsetEvidence, maybeStartTcDiscovery } from '../src/jobs/totalcorner-discovery.mjs';

const TOKEN = 'tc-secret-token-value-123';

const LIVE = {id: '202309594', h: 'Ecuador', a: 'Panama', l: 'International Match', l_id: '10', start: '2026-10-08 10:00:00', status: '30',
  hg: '1', ag: '0', attacks: ['40', '30'], events: [{h: 'h', t: '12', tp: 'g'}], btts: ['1.80', '1.95'],
  goal_list: [['29', ' 2.5', '1.90', '1.90', '2026-10-08 10:29:00', '1', '1']]};
const UPCOMING = {id: '300', h: 'Inter', a: 'Milan', l: 'Italy Serie A', l_id: '1', start: '2026-10-08 18:45:00', status: null};
const ENDED = {id: '400', h: 'Lyon', a: 'Nice', l: 'France Ligue 1', l_id: '2', start: '2026-10-08 08:00:00', status: 'full', hg: '2', ag: '2'};

test('the token never appears in request keys, ledger paths or redacted errors', () => {
  assert.equal(requestKey('/match/today', {type: 'inplay', token: TOKEN, columns: 'a,b'}), '/match/today?columns=a%2Cb&type=inplay');
  assert.equal(redactSecrets(`fetch https://api.totalcorner.com/v1/match/today?token=${TOKEN}&type=x failed`).includes(TOKEN), false);
});

test('responses are classified: ok, no_data, rate limit (status or body), auth, 404, 400, 5xx, malformed, timeout', () => {
  assert.equal(classifyResponse({status: 200, text: '{"success":1,"data":[{"id":1}]}'}).outcome, 'ok');
  assert.equal(classifyResponse({status: 200, text: '{"success":1,"data":[]}'}).outcome, 'no_data');
  assert.equal(classifyResponse({status: 200, text: '{"success":0,"error":{"code":"TOO_MANY_REQUEST","message":"exceed the rate limit"}}'}).outcome, 'rate_limited');
  assert.equal(classifyResponse({status: 429, text: ''}).outcome, 'rate_limited');
  assert.equal(classifyResponse({status: 401, text: '{}'}).outcome, 'auth');
  assert.equal(classifyResponse({status: 200, text: '{"success":0,"error":{"code":"INVALID_TOKEN"}}'}).outcome, 'auth');
  assert.equal(classifyResponse({status: 404, text: 'nope'}).outcome, 'not_found');
  assert.equal(classifyResponse({status: 400, text: '{}'}).outcome, 'bad_request');
  assert.equal(classifyResponse({status: 502, text: '<html>'}).outcome, 'server_error');
  assert.equal(classifyResponse({status: 200, text: '<html>'}).outcome, 'malformed');
  assert.equal(classifyResponse({status: 200, text: '{"success":0,"error":{"code":"X"}}'}).outcome, 'upstream_error');
  assert.equal(classifyResponse({error: Object.assign(new Error('t'), {name: 'TimeoutError'})}).outcome, 'timeout');
  assert.equal(classifyResponse({error: new TypeError('fetch failed')}).outcome, 'network');
});

test('the limiter admits at most N requests per sliding window and honours a pause', async () => {
  let t = 0;
  const waits = [];
  const limiter = createLimiter({maxRequests: 4, windowMs: 10000, now: () => t, sleep: async ms => { waits.push(ms); t += ms; }});
  for (let i = 0; i < 4; i++) await limiter.acquire();
  assert.equal(t, 0);
  await limiter.acquire();
  assert.ok(t >= 10000, 'fifth request waits for the window');
  limiter.pause(30000);
  const before = t;
  await limiter.acquire();
  assert.ok(t - before >= 30000, 'a 429 pause blocks every caller');
});

test('rate-limit backoff: retry-after first, reset as seconds or epoch, bounded 10..120 s', () => {
  assert.equal(rateLimitBackoffMs({retry_after: '30'}), 30000);
  assert.equal(rateLimitBackoffMs({reset: '4'}), 10000);
  assert.equal(rateLimitBackoffMs({reset: '45'}), 45000);
  assert.equal(rateLimitBackoffMs({reset: String(1791453300)}, 1791453300000 - 20000), 20000);
  assert.equal(rateLimitBackoffMs({reset: String(1791453300 + 86400)}, 1791453300000), 120000);
  assert.equal(rateLimitBackoffMs({reset: 'abc'}), 10000);
  assert.equal(rateLimitBackoffMs(null), 10000);
});

test('field census keeps every path: pairs, movement tuples, nested events, envelope; phase from status', () => {
  const paths = walkRow(LIVE);
  for (const p of ['attacks[0]', 'attacks[1]', 'events[].tp', 'goal_list[][4]', 'goal_list[][6]', 'btts[0]', 'status']) assert.ok(paths.has(p), p);
  assert.equal(phaseOf(UPCOMING), 'PREMATCH');
  assert.equal(phaseOf(LIVE), 'LIVE');
  assert.equal(phaseOf({status: 'half'}), 'LIVE');
  assert.equal(phaseOf(ENDED), 'ENDED');
  const rows = bodyRows({success: 1, pagination: {pages: 2}, data: [LIVE, UPCOMING]});
  assert.deepEqual(rows.map(r => r.phase), ['ENVELOPE', 'LIVE', 'PREMATCH']);
  const census = createCensus();
  census.add('match_today', {success: 1, data: [LIVE, {...LIVE, btts: null}]});
  const btts = census.entries().find(e => e.field_path === 'btts');
  assert.deepEqual([btts.rows, btts.nonnull, [...btts.types].sort()], [2, 1, ['array', 'null']]);
});

test('kickoff timezone evidence and bookmaker enumeration work on any body shape', () => {
  const ev = kickoffOffsetEvidence([LIVE, UPCOMING, ENDED], new Date('2026-10-08T10:31:00Z'));
  assert.deepEqual(ev, {samples: 1, median_minutes: 1, min: 1, max: 1});
  assert.deepEqual(bookmakerNames({data: {pinnacle: {}, bet365: {}}}).data_keys, ['bet365', 'pinnacle']);
  assert.deepEqual(bookmakerNames({data: [{bookmaker: 'Pinnacle'}, {bookmaker: 'SNAI'}]}).named, ['Pinnacle', 'SNAI']);
});

function memoryStore() {
  const raw = [], ledger = [];
  return {raw, ledger,
    async insertRaw(r) {
      const hit = raw.find(x => x.request_key === r.request_key && x.body_sha256 === r.body_sha256);
      if (hit) { hit.seen_count++; return {raw_id: hit.raw_id, inserted: false}; }
      raw.push({...r, raw_id: raw.length + 1, seen_count: 1}); return {raw_id: raw.length, inserted: true};
    },
    async insertLedger(r) { ledger.push(r); }};
}

test('client: bounded retry on rate limit, every attempt in the ledger, raw stored losslessly, token never stored', async () => {
  const store = memoryStore();
  const bodies = ['{"success":0,"error":{"code":"TOO_MANY_REQUEST","message":"exceed the rate limit, allowed 5 request in 10 seconds."}}',
    '{"success":1,"data":[{"id":"1","odd":" 2.5"}]}'];
  let calls = 0;
  const seen = [];
  const tc = createTcClient({token: TOKEN, store, limiter: {acquire: async () => {}, pause: ms => seen.push(ms)},
    fetchImpl: async url => { seen.push(String(url)); return new Response(bodies[calls++], {status: 200}); }, sleep: async () => {}});
  const r = await tc.get('/match/today', {type: 'inplay'}, {endpoint_family: 'match_today'});
  assert.equal(r.outcome, 'ok');
  assert.equal(r.attempts, 2);
  assert.deepEqual(store.ledger.map(l => l.outcome), ['rate_limited', 'ok']);
  assert.ok(store.ledger[0].backoff_ms >= 10000);
  assert.equal(store.raw[1].body, bodies[1], 'body kept byte for byte');
  assert.ok(String(seen[0]).includes('token='), 'token is sent upstream');
  assert.equal(JSON.stringify(store).includes(TOKEN), false, 'token never persisted');

  const gaveUp = createTcClient({token: TOKEN, store: memoryStore(), maxRetries: 2, limiter: {acquire: async () => {}, pause() {}},
    fetchImpl: async () => new Response('err', {status: 503}), sleep: async () => {}});
  const fail = await gaveUp.get('/match/view/1', {}, {endpoint_family: 'match_view'});
  assert.deepEqual([fail.outcome, fail.attempts], ['server_error', 3], 'no retry storm: 1 + 2 retries');
});

test('boot hook skips without token and never prints it', async () => {
  const lines = [];
  await maybeStartTcDiscovery({env: {DATABASE_URL: 'postgres://x'}, log: l => lines.push(l)});
  await maybeStartTcDiscovery({env: {TOTALCORNER_API_TOKEN: TOKEN, TOTALCORNER_DISCOVERY_ON_BOOT: 'false'}, log: l => lines.push(l)});
  assert.match(lines[0], /no_token/);
  assert.match(lines[1], /disabled/);
  assert.equal(lines.join('').includes(TOKEN), false);
});

const databaseUrl = process.env.FUTPYTHON_TEST_DATABASE_URL
  || 'postgres://matchpilot:matchpilot_local_test@127.0.0.1:5432/matchpilot_fpt';
const SCHEMA = 'tc_core_discovery_test';

function fakeApi() {
  const hits = [];
  const fetchImpl = async url => {
    const u = new URL(url);
    hits.push(u.pathname + '?' + [...u.searchParams].filter(([k]) => k !== 'token').map(([k, v]) => `${k}=${v}`).join('&'));
    const p = u.pathname.replace('/v1', '');
    const ok = data => new Response(JSON.stringify({success: 1, data}), {status: 200});
    if (p === '/match/today') {
      const type = u.searchParams.get('type');
      return ok(type === 'upcoming' ? [UPCOMING] : type === 'inplay' ? [LIVE] : [ENDED]);
    }
    if (p === '/match/schedule') {
      if (!/^\d{8}$/.test(u.searchParams.get('date'))) return new Response('{"success":0,"error":{"code":"BAD_DATE"}}', {status: 400});
      return ok([{...ENDED, id: '500' + u.searchParams.get('date'), l_id: '3'}]);
    }
    if (p.startsWith('/match/view/')) return ok([LIVE]);
    if (p.startsWith('/match/odds/')) return ok([{...LIVE, bttsList: [['1.8', '1.9', '2026-10-08 09:00:00']]}]);
    if (p.startsWith('/match/bookmaker_odds/')) {
      if (u.searchParams.get('bookmaker') === 'snai') return ok([]);
      return ok({pinnacle: {opening: ['1.9', '3.4', '4.0'], closing: ['1.8', '3.5', '4.2'], suspended: '0', time: '2026-10-08 09:59:00'}, bet365: {}});
    }
    if (p.startsWith('/league/')) return new Response('{"success":0,"error":{"code":"NO_DATA"}}', {status: 404});
    return new Response('nope', {status: 404});
  };
  return {fetchImpl, hits};
}

test('discovery on Postgres: every endpoint family called, raw + ledger + registry persisted, list vs detail, no token', {timeout: 60000}, async t => {
  let pg;
  try {
    pg = (await import('pg')).default;
    const admin = new pg.Client({connectionString: databaseUrl});
    await admin.connect();
    await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await admin.query(`CREATE SCHEMA ${SCHEMA}`);
    await admin.end();
  } catch {
    if (process.env.CI) throw new Error('throwaway postgres unavailable');
    return t.skip('throwaway postgres unavailable');
  }
  const url = new URL(databaseUrl);
  url.searchParams.set('options', `-c search_path=${SCHEMA}`);
  process.env.DATABASE_URL = url.toString();
  const db = await import('../src/db.mjs');
  const {migrate} = await import('../src/migrate.mjs');
  const {createPgStore} = await import('../src/providers/totalcorner/client.mjs');
  const {runTcDiscovery} = await import('../src/jobs/totalcorner-discovery.mjs');
  try {
    await migrate();
    const api = fakeApi();
    const tc = createTcClient({token: TOKEN, store: createPgStore(db.withClient), limiter: {acquire: async () => {}, pause() {}},
      fetchImpl: api.fetchImpl, sleep: async () => {}});
    const lines = [];
    const summary = await db.withClient(c => runTcDiscovery({tc, db: c, log: l => lines.push(l), now: () => new Date('2026-10-08T10:31:00Z')}));
    assert.equal(summary.schedule_date_format, 'YYYYMMDD');
    assert.deepEqual(Object.keys(summary.outcomes).sort(), ['bookmaker_movement', 'bookmaker_odds', 'league_schedule', 'league_table_card',
      'league_table_corner', 'league_table_table', 'match_odds', 'match_schedule', 'match_today', 'match_today_default', 'match_view'].sort());
    assert.ok(summary.movement.some(m => m.bookmaker === 'snai' && m.outcome === 'no_data'), 'empty bookmaker answer recorded, not dropped');
    const pin = summary.movement.filter(m => m.bookmaker === 'pinnacle');
    assert.equal(new Set(pin.map(m => m.match_id)).size, 2, 'a recent and a historical match');
    assert.deepEqual([...new Set(pin.map(m => m.columns))].sort(), ['asianList', 'cornerList', 'goalList', 'oddsList'], 'pinnacle: 1X2, Asian, Goal, Corner movement');
    assert.equal(summary.kickoff_tz_evidence.samples, 1, 'first-half live rows feed the kickoff timezone check');
    assert.ok(summary.btts_fields.some(f => f.field_path === 'btts[0]' && f.endpoint_family === 'match_today'));
    assert.ok(summary.btts_fields.some(f => f.field_path.startsWith('bttsList') && f.endpoint_family === 'match_odds'));
    assert.ok(summary.detail_only_fields > 0, 'fields only in detail endpoints are listed');
    assert.ok(Object.values(summary.bookmakers).some(b => b.data_keys.includes('pinnacle')));
    await db.withClient(async c => {
      const run = await c.query(`SELECT status FROM tc_discovery_runs WHERE run_id=$1`, [summary.run_id]);
      assert.equal(run.rows[0].status, 'complete');
      const counts = await c.query(`SELECT (SELECT count(*) FROM tc_request_ledger)::int AS ledger, (SELECT count(*) FROM tc_raw_responses)::int AS raw,
                                            (SELECT count(*) FROM tc_raw_responses WHERE outcome='not_found')::int AS nf`);
      assert.equal(counts.rows[0].ledger, api.hits.length, 'one ledger row per real upstream call');
      assert.ok(counts.rows[0].raw > 0 && counts.rows[0].nf > 0, 'error bodies are retained too');
      const leak = await c.query(`SELECT count(*)::int AS n FROM tc_raw_responses r JOIN tc_request_ledger l USING (raw_id)
                                  WHERE r.body LIKE '%'||$1||'%' OR r.url_path LIKE '%'||$1||'%' OR l.url_path LIKE '%'||$1||'%'`, [TOKEN]);
      assert.equal(leak.rows[0].n, 0);
      const pin = await c.query(`SELECT 1 FROM tc_schema_registry WHERE endpoint_family='bookmaker_odds' AND field_path='pinnacle.suspended'`);
      assert.equal(pin.rowCount, 1, 'suspension flag preserved in the registry');
    });
    assert.equal(lines.join('').includes(TOKEN), false);
    assert.equal(api.hits.join('').includes(TOKEN), false);

    // A second run stores identical bodies once (seen_count) and adds registry counts, it does not duplicate raw rows.
    const before = await db.withClient(c => c.query(`SELECT count(*)::int AS n FROM tc_raw_responses`));
    await db.withClient(c => runTcDiscovery({tc, db: c, log: () => {}, now: () => new Date('2026-10-08T10:31:00Z')}));
    const after = await db.withClient(c => c.query(`SELECT count(*)::int AS n, max(seen_count)::int AS seen FROM tc_raw_responses`));
    assert.equal(after.rows[0].n, before.rows[0].n);
    assert.ok(after.rows[0].seen >= 2);
  } finally {
    await db.closePool();
  }
});
