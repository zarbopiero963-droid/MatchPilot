import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyRow, isDue, matchIdentity, measureProviderOffset, normalizeBookmakerRows, normalizeOddsRows, pitSummary, providerToUtc,
  snapshotIntervalMinutes, tzDecision } from '../src/providers/totalcorner/prematch.mjs';

const OFF = 120;
// Shapes copied from real /match/odds and /match/bookmaker_odds bodies (08/10/2026), match 200583718, start 00:00 UTC+2.
const ended = {
  id: '200583718', l_id: '515', l: 'Romania Liga II', h: 'A', a: 'B', start: '2026-09-04 00:00:00', status: 'full',
  asian_list: [
    ['92', ' 0.0', '1.675', '2.150', '2026-09-04 01:52:38', '1', '1'],
    [null, '0.0, -0.5', '2.050', '1.750', '2026-09-04 00:13:04', null, null],
    [null, '0.0, -0.5', '1.850', '1.950', '2026-09-03 23:53:11', null, null],
    [null, '0.0, -0.5', '1.800', '2.000', '2026-09-03 22:57:51', null, null]
  ],
  odds_list: [[null, '2.40', '3.10', '2.90', '2026-09-03 20:00:00', null, null], [null, '2.30', '3.10', '3.00', '2026-09-03 23:00:00', null, null]],
  btts_list: [[null, '1.833', '1.833', '2026-09-04 00:13:04', null, null], [null, '1.800', '1.909', '2026-09-03 22:57:51', null, null]],
  corner_list: []
};
const kickoffUtc = providerToUtc(ended.start, OFF);
const acquiredAt = new Date('2026-10-08T10:12:34Z');

test('provider-local time converts to UTC and garbage is rejected', () => {
  assert.equal(providerToUtc('2026-09-04 00:00:00', OFF).toISOString(), '2026-09-03T22:00:00.000Z');
  assert.equal(providerToUtc('', OFF), null);
  assert.equal(providerToUtc('04/09/2026', OFF), null);
});

test('movement rows: in-play rows are INPLAY, minute-less rows after the scheduled kickoff are QUARANTINE', () => {
  const rows = normalizeOddsRows(ended, {offset: OFF, kickoffUtc, acquiredAt});
  const asian = rows.filter(r => r.market === 'asian');
  assert.deepEqual(asian.map(r => r.phase), ['INPLAY', 'QUARANTINE', 'PREMATCH', 'PREMATCH']);
  assert.equal(asian[0].minute, 92);
  assert.equal(asian[0].score_home, 1);
  assert.equal(asian[1].quarantine_reason, 'no_minute_at_or_after_scheduled_kickoff');
  assert.equal(asian[2].line, '0.0, -0.5');
  assert.equal(asian[2].price_1, 1.85);
  // Acquired after kickoff: the pre-kickoff rows are upstream history, not captured prematch.
  assert.equal(asian[2].provenance, 'HISTORICAL_UPSTREAM');
  const btts = rows.filter(r => r.market === 'btts');
  assert.deepEqual(btts.map(r => [r.phase, r.price_1, r.price_2]), [['QUARANTINE', 1.833, 1.833], ['PREMATCH', 1.8, 1.909]]);
  const odds = rows.filter(r => r.market === 'odds');
  assert.deepEqual(odds.map(r => r.price_3), [2.9, 3]);
  assert.equal(new Set(rows.map(r => r.row_hash)).size, rows.length, 'distinct rows hash differently');
  assert.ok(rows.every(r => r.phase !== 'PREMATCH' || (r.minute === null && Date.parse(r.provider_time_utc) < kickoffUtc.getTime())));
});

test('rows acquired before kickoff are PREMATCH_CAPTURED', () => {
  const r = classifyRow({inPlay: false, providerUtc: new Date('2026-09-03T20:00:00Z'), kickoffUtc, acquiredAt: new Date('2026-09-03T21:00:00Z')});
  assert.deepEqual(r, {phase: 'PREMATCH', quarantine_reason: null, provenance: 'PREMATCH_CAPTURED'});
  assert.equal(classifyRow({inPlay: false, providerUtc: kickoffUtc, kickoffUtc, acquiredAt}).phase, 'QUARANTINE', 'exactly at kickoff is not prematch');
  assert.equal(classifyRow({inPlay: false, providerUtc: null, kickoffUtc, acquiredAt}).quarantine_reason, 'unparseable_provider_time');
});

test('bookmaker open/close/inplay: a close stamped after kickoff and every inplay quote stay out of PREMATCH', () => {
  const record = {...ended, bookmakers: [{slug: 'pinnacle', name: 'Pinnacle',
    goal: {open: {line: 2.25, over: 1.83, under: 1.88, time: '2026-09-03 12:12:34'}, close: {line: 2.5, over: 1.82, under: 1.85, time: '2026-09-04 00:00:30'},
      inplay: {line: 2.5, over: 3.12, under: 1.27, time: '2026-09-04 01:47:50', minute: '87'}},
    odds: {open: {home: 2.4, draw: 2.95, away: 2.71, time: '2026-09-03 12:12:00'}, close: {home: 2.18, draw: 2.98, away: 2.82, time: '2026-09-03 23:59:00'}, inplay: null}},
  {slug: 'snai', name: 'Snai', asian: {open: {line: -0.25, home: 1.9, away: 1.9, time: '2026-09-02 10:00:00'}, inplay: {line: 0, home: 1.8, away: 2, time: '2026-09-04 01:00:00'}}}]};
  const rows = normalizeBookmakerRows(record, {offset: OFF, kickoffUtc, acquiredAt});
  const by = (s, m, k) => rows.find(r => r.source === `bookmaker:${s}` && r.market === m && r.kind === k);
  assert.equal(by('pinnacle', 'goal', 'open').phase, 'PREMATCH');
  assert.equal(by('pinnacle', 'goal', 'close').phase, 'QUARANTINE');
  assert.equal(by('pinnacle', 'goal', 'inplay').phase, 'INPLAY');
  assert.equal(by('pinnacle', 'goal', 'inplay').minute, 87);
  assert.equal(by('pinnacle', 'odds', 'close').phase, 'PREMATCH');
  assert.deepEqual([by('pinnacle', 'odds', 'close').price_1, by('pinnacle', 'odds', 'close').price_3], [2.18, 2.82]);
  assert.equal(by('snai', 'asian', 'inplay').phase, 'INPLAY', 'inplay without minute is still in-play');
  assert.equal(by('pinnacle', 'odds', 'inplay'), undefined);
});

test('point-in-time summary: opening and last strictly before kickoff and not after as_of', () => {
  const rows = normalizeOddsRows(ended, {offset: OFF, kickoffUtc, acquiredAt});
  const atKickoff = pitSummary(rows, {kickoffUtc, asOf: kickoffUtc});
  const asian = atKickoff.find(g => g.market === 'asian');
  assert.equal(asian.rows, 2);
  assert.equal(asian.opening.provider_time, '2026-09-03 22:57:51');
  assert.equal(asian.last.provider_time, '2026-09-03 23:53:11');
  const early = pitSummary(rows, {kickoffUtc, asOf: new Date('2026-09-03T19:00:00Z')});
  assert.equal(early.find(g => g.market === 'asian'), undefined, 'nothing known yet at 21:00 provider time');
  assert.equal(early.find(g => g.market === 'odds').last.provider_time, '2026-09-03 20:00:00');
  const later = pitSummary(rows, {kickoffUtc, asOf: new Date('2026-09-05T00:00:00Z')});
  assert.deepEqual(later, atKickoff, 'an as_of after kickoff never reveals more prematch rows');
});

test('cadence: sparse far from kickoff, dense near it, nothing at or after kickoff', () => {
  assert.equal(snapshotIntervalMinutes(600), 180);
  assert.equal(snapshotIntervalMinutes(120), 60);
  assert.equal(snapshotIntervalMinutes(30), 15);
  assert.equal(snapshotIntervalMinutes(10), 5);
  const k = new Date('2026-10-08T18:00:00Z');
  assert.equal(isDue({kickoffUtc: k, lastAt: null, now: new Date('2026-10-08T10:00:00Z')}), true);
  assert.equal(isDue({kickoffUtc: k, lastAt: new Date('2026-10-08T09:00:00Z'), now: new Date('2026-10-08T10:00:00Z')}), false);
  assert.equal(isDue({kickoffUtc: k, lastAt: new Date('2026-10-08T17:50:00Z'), now: new Date('2026-10-08T17:55:00Z')}), true);
  assert.equal(isDue({kickoffUtc: k, lastAt: null, now: k}), false);
  assert.equal(matchIdentity({id: 1, l_id: 2, start: 'x'}, OFF), null);
});

const databaseUrl = process.env.FUTPYTHON_TEST_DATABASE_URL
  || 'postgres://matchpilot:matchpilot_local_test@127.0.0.1:5432/matchpilot_fpt';
const SCHEMA = 'tc_core_prematch_test';

const local = d => new Date(d.getTime() + OFF * 60000).toISOString().slice(0, 19).replace('T', ' ');

test('prematch collector on Postgres: verified-only, snapshots before kickoff, dedup, zero leakage, raw replay', {timeout: 60000}, async t => {
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
  const {createPgStore, createTcClient} = await import('../src/providers/totalcorner/client.mjs');
  const {runPrematchCycle, runPrematchRawReplay, tcPrematchMatch, tcPrematchReport} = await import('../src/jobs/totalcorner-prematch.mjs');
  try {
    await migrate();
    await db.withClient(async c => {
      for (const [slug, id] of [['liga-2', '515'], ['serie-a', '129'], ['premier', '1']]) {
        await c.query(`INSERT INTO competition_mapping(internal_competition_id,country,futpython_country_slug,futpython_league_slug,totalcorner_league_id,
          mapping_status,mapping_method,evidence) VALUES($1,'x','x',$1,$2,'VERIFIED','fixture-overlap-v2','{}')`, [slug, id]);
      }
      await c.query(`INSERT INTO competition_mapping(internal_competition_id,country,futpython_country_slug,futpython_league_slug,totalcorner_league_id,
        mapping_status,mapping_method,evidence) VALUES('u19','x','x','u19','999','AMBIGUOUS','fixture-overlap-v2','{}')`);
    });
    const now0 = new Date();
    const ko = h => new Date(now0.getTime() + h * 3600000);
    const list = [
      {id: 'm1', l_id: '515', l: 'Romania Liga II', h: 'H1', a: 'A1', start: local(ko(3)), status: null},
      {id: 'm2', l_id: '129', l: 'Brazil Serie A', h: 'H2', a: 'A2', start: local(ko(10)), status: null},
      {id: 'm3', l_id: '1', l: 'England Premier League', h: 'H3', a: 'A3', start: local(ko(0.2)), status: null},
      {id: 'x1', l_id: '999', l: 'Unverified U19', h: 'H', a: 'A', start: local(ko(2)), status: null},
      {id: 'x2', l_id: '515', l: 'Romania Liga II', h: 'H', a: 'A', start: local(ko(80)), status: null}
    ];
    const byId = Object.fromEntries(list.map(m => [m.id, m]));
    const t1 = local(new Date(now0.getTime() - 3600000)), t2 = local(new Date(now0.getTime() - 600000));
    const hits = [];
    // In-play list used by the timezone gate: first-half rows whose start is consistent with offset `liveOffset`.
    let liveOffset = OFF;
    const inplay = () => {
      const at = Date.now();
      const start = (minute, delayMin = 0) => new Date(at - minute * 60000 + liveOffset * 60000 + delayMin * 60000).toISOString().slice(0, 19).replace('T', ' ');
      return [{id: 'l1', l_id: '7', l: 'Japan J-League', start: start(23), status: '23'},
        {id: 'l2', l_id: '8', l: 'Thailand U21 League', start: start(39, 1), status: '39'},
        {id: 'l3', l_id: '9', l: 'Esoccer Battle - 8 mins play', start: start(3, -50), status: '03'},
        {id: 'l4', l_id: '7', l: 'Japan J-League', start: start(80), status: '80'},
        {id: 'l5', l_id: '7', l: 'Japan J-League', start: start(50), status: 'half'}];
    };
    const fetchImpl = async u => {
      const url = new URL(u);
      hits.push(url.pathname + url.search.replace(/token=[^&]+/, 'token=X'));
      const p = url.pathname.replace('/v1', '');
      const ok = (data, pagination) => new Response(JSON.stringify({success: 1, ...(pagination ? {pagination} : {}), data}), {status: 200});
      if (p === '/match/today' && url.searchParams.get('type') === 'inplay') return ok(inplay(), {current: 1, pages: 1, next: false, prev: false, per_page: 30});
      if (p === '/match/today') {
        const page = Number(url.searchParams.get('page') || 1);
        return ok(page === 1 ? list.slice(0, 3) : list.slice(3), {current: page, pages: 2, next: page < 2, prev: page > 1, per_page: 3});
      }
      const id = p.split('/').pop();
      if (p.startsWith('/match/odds/')) return ok([{...byId[id], asian_list: [[null, '-0.5', '1.90', '1.90', t2, null, null], [null, '-0.5', '1.95', '1.85', t1, null, null],
        [null, '-0.5', '1.95', '1.85', t1, null, null]], odds_list: [[null, '2.0', '3.2', '3.9', t1, null, null]], btts_list: []}]);
      if (p.startsWith('/match/bookmaker_odds/')) return ok([{...byId[id], bookmakers: [{slug: 'pinnacle', name: 'Pinnacle', odds: {open: {home: 2, draw: 3.3, away: 4, time: t1}, close: {home: 1.95, draw: 3.3, away: 4.1, time: t2}, inplay: null}}]}]);
      return new Response('{}', {status: 404});
    };
    const tc = createTcClient({token: 'secret-token', store: createPgStore(db.withClient), limiter: {acquire: async () => {}, pause() {}}, fetchImpl, sleep: async () => {}});
    const config = {tzOffsetMinutes: OFF, horizonHours: 36, maxMatchesPerCycle: 60, intervalMs: 300000, authPauseMs: 60000, tzCheckMinutes: 30, tzMaxAgeMinutes: 360};

    const s1 = await db.withClient(c => runPrematchCycle({tc, db: c, config, log: () => {}, now: () => now0}));
    assert.equal(s1.tz.reason, 'agree');
    assert.equal(s1.tz.measured_now.samples, 2, 'first-half real-time rows only: e-soccer, second half and HT are excluded');
    assert.equal(s1.tz.measured_now.offset_minutes, OFF);
    assert.equal(s1.upcoming, 5);
    assert.equal(s1.verified_upcoming, 3, 'unverified league and fixtures beyond the horizon stay out');
    assert.equal(s1.verified_leagues_upcoming, 3);
    assert.equal(s1.snapshots, 6, 'odds + bookmaker snapshot per verified match');
    assert.ok(!hits.some(h => h.includes('/x1') || h.includes('/x2')));
    assert.ok(hits.every(h => !h.includes('secret-token')));

    const r1 = await db.withClient(c => c.query(`SELECT phase, seen_count, count(*)::int AS n FROM tc_market_rows GROUP BY 1,2 ORDER BY 1,2`));
    assert.deepEqual(r1.rows, [{phase: 'PREMATCH', seen_count: 1, n: 3 * 3 + 3 * 2}], 'identical rows inside one body are stored once');

    // Immediately again: nothing is due, no odds call.
    const oddsCalls = () => hits.filter(h => h.includes('/match/odds/')).length;
    const before = oddsCalls();
    const s2 = await db.withClient(c => runPrematchCycle({tc, db: c, config, log: () => {}, now: () => new Date(now0.getTime() + 60000)}));
    assert.equal(s2.due, 0);
    assert.equal(oddsCalls(), before);
    const tzCalls = () => hits.filter(h => h.includes('type=inplay')).length;
    assert.equal(tzCalls(), 1, 'the offset is re-measured only every tzCheckMinutes');

    // Ten minutes later only m3 (12 min to kickoff, 5 min cadence) is due; its rows are already known.
    const s3 = await db.withClient(c => runPrematchCycle({tc, db: c, config, log: () => {}, now: () => new Date(now0.getTime() + 6 * 60000)}));
    assert.equal(s3.due, 1);
    assert.equal(s3.rows_new, 0, 'dedup: re-acquired rows are not inserted again');
    const seen = await db.withClient(c => c.query(`SELECT max(seen_count)::int AS m FROM tc_market_rows WHERE match_id='m3' AND source='consensus'`));
    assert.equal(seen.rows[0].m, 2);

    // Raw replay: an ended body of a verified league acquired after kickoff; an unverified body is skipped.
    await db.withClient(async c => {
      for (const [fam, rec] of [['verified_match_odds', ended], ['match_odds', {...ended, id: 'zz', l_id: '999'}]]) {
        await c.query(`INSERT INTO tc_raw_responses(endpoint_family,provenance,request_key,url_path,outcome,body_sha256,body_bytes,body,first_acquired_at,last_acquired_at,
          schema_version,parser_version) VALUES($1,'DISCOVERY',$2,$2,'ok',md5($2),1,$3,$4,$4,'tc-raw-v1','tc-discovery-v1')`,
          [fam, '/match/odds/' + rec.id, JSON.stringify({success: 1, data: [rec]}), acquiredAt]);
      }
    });
    const rep = await db.withClient(c => runPrematchRawReplay({db: c, config, log: () => {}}));
    assert.equal(rep.ingested, 1);
    assert.equal(rep.skipped_unverified, 1);
    assert.equal(rep.snapshots, 0, 'a body acquired after kickoff is not a prematch snapshot');
    assert.equal(rep.INPLAY, 1);
    assert.equal(rep.QUARANTINE, 2);

    // The provider moves to UTC+1 (e.g. DST end): the next measurement disagrees and the cycle holds — no list, no
    // odds, no normalization under an unverified offset.
    liveOffset = 60;
    const callsBefore = hits.length;
    const rowsBefore = (await db.withClient(c => c.query(`SELECT count(*)::int AS n FROM tc_market_rows`))).rows[0].n;
    const sHold = await db.withClient(c => runPrematchCycle({tc, db: c, config, log: () => {}, now: () => new Date(now0.getTime() + 40 * 60000)}));
    assert.equal(sHold.tz_hold, true);
    assert.equal(sHold.tz.reason, 'mismatch');
    assert.equal(sHold.tz.measured, 60);
    assert.deepEqual(hits.slice(callsBefore).map(h => h.split('?')[0]), ['/v1/match/today'], 'only the in-play measurement call');
    assert.equal((await db.withClient(c => c.query(`SELECT count(*)::int AS n FROM tc_market_rows`))).rows[0].n, rowsBefore);
    const obs = await db.withClient(c => c.query(`SELECT status, offset_minutes, agrees, configured_offset_minutes, cardinality(raw_ids) AS raws
      FROM tc_tz_observations ORDER BY observation_id`));
    assert.deepEqual(obs.rows, [{status: 'MEASURED', offset_minutes: 120, agrees: true, configured_offset_minutes: 120, raws: 1},
      {status: 'MEASURED', offset_minutes: 60, agrees: false, configured_offset_minutes: 120, raws: 1}]);
    const held = await db.withClient(c => c.query(`SELECT status, tz_observation_id IS NOT NULL AS linked FROM tc_prematch_runs WHERE run_id=$1`, [sHold.run_id]));
    assert.deepEqual(held.rows[0], {status: 'complete', linked: true});
    const linked = await db.withClient(c => c.query(`SELECT count(*)::int AS n FROM tc_matches WHERE match_id IN ('m1','m2','m3') AND tz_observation_id IS NOT NULL`));
    assert.equal(linked.rows[0].n, 3, 'captured matches record the observation that vouched for their offset');

    const report = await db.withClient(c => tcPrematchReport(c));
    assert.equal(report.tz_observations.length, 2);
    assert.equal(report.replay_version, 'tc-core-03-v1');
    assert.deepEqual(report.leakage, {prematch_rows_at_or_after_kickoff: 0, snapshots_at_or_after_kickoff: 0, duplicate_rows: 0, matches_outside_verified: 0});
    assert.equal(report.matches.with_snapshot, 3);

    // The database refuses a prematch snapshot taken at kickoff.
    await assert.rejects(db.withClient(c => c.query(`INSERT INTO tc_prematch_snapshots(match_id,source,acquired_at,kickoff_utc,minutes_to_kickoff)
      SELECT match_id,'match_odds',kickoff_utc,kickoff_utc,0 FROM tc_matches WHERE match_id='m1'`)));

    const view = await db.withClient(c => tcPrematchMatch(c, {matchId: '200583718'}));
    const asian = view.markets.find(g => g.source === 'consensus' && g.market === 'asian');
    assert.equal(asian.opening.provider_time, '2026-09-03 22:57:51');
    assert.equal(asian.last.provider_time, '2026-09-03 23:53:11');
    const captured = await db.withClient(c => tcPrematchMatch(c, {matchId: '200583718', knowledge: 'captured'}));
    assert.equal(captured.markets.length, 0, 'acquired after kickoff: nothing was known to MatchPilot before it');
    assert.equal(await db.withClient(c => tcPrematchMatch(c, {matchId: 'nope'})), null);
  } finally {
    await db.closePool();
  }
});

test('provider offset is measured from first-half real-time rows, rounded, and rejected when thin or inconsistent', () => {
  const at = new Date('2026-10-08T10:09:43Z');
  // Real rows of the stored in-play list (raw 3, 08/10/2026): Thailand U21 11:30 at 39', e-soccer 12:00 at 07'.
  const real = [{l: 'Thailand U21 League', start: '2026-10-08 11:30:00', status: '39'}, {l: 'Esoccer GT Leagues - 12 mins play', start: '2026-10-08 12:00:00', status: '07'},
    {l: 'World Club Friendlies', start: '2026-10-08 10:30:00', status: '75'}, {l: 'Myanmar U20 League', start: '2026-10-08 11:00:00', status: 'half'},
    {l: 'Some League', start: '2026-10-08 11:45:00', status: '23'}];
  const m = measureProviderOffset(real.map(row => ({row, acquiredAt: at})));
  assert.equal(m.status, 'MEASURED');
  assert.equal(m.samples, 2);
  assert.equal(m.excluded_not_real_time, 1);
  assert.equal(m.offset_minutes, 120);
  assert.equal(measureProviderOffset([{row: real[0], acquiredAt: at}]).status, 'INSUFFICIENT');
  assert.equal(measureProviderOffset([]).status, 'INSUFFICIENT');
  const wide = [{l: 'A', start: '2026-10-08 11:30:00', status: '39'}, {l: 'B', start: '2026-10-08 12:30:00', status: '20'}];
  assert.equal(measureProviderOffset(wide.map(row => ({row, acquiredAt: at}))).status, 'INCONSISTENT');
  // Same rows read in winter at UTC+1 would round to 60, never silently to 120.
  const winter = [{l: 'A', start: '2026-10-08 10:30:00', status: '39'}, {l: 'B', start: '2026-10-08 10:45:00', status: '23'}];
  assert.equal(measureProviderOffset(winter.map(row => ({row, acquiredAt: at}))).offset_minutes, 60);
});

test('timezone decision: fresh agreement passes, mismatch / stale / missing hold', () => {
  const now = new Date('2026-10-08T12:00:00Z');
  const o = (min, status, offset) => ({observed_at: new Date(now.getTime() - min * 60000), status, offset_minutes: offset});
  assert.equal(tzDecision({observations: [o(10, 'MEASURED', 120)], configuredOffset: 120, now}).verified, true);
  assert.equal(tzDecision({observations: [o(5, 'INSUFFICIENT', null), o(100, 'MEASURED', 120)], configuredOffset: 120, now}).verified, true);
  const mm = tzDecision({observations: [o(5, 'MEASURED', 60), o(40, 'MEASURED', 120)], configuredOffset: 120, now});
  assert.deepEqual([mm.verified, mm.reason, mm.measured], [false, 'mismatch', 60]);
  assert.equal(tzDecision({observations: [o(400, 'MEASURED', 120)], configuredOffset: 120, now}).reason, 'stale');
  assert.equal(tzDecision({observations: [o(5, 'UNAVAILABLE', null)], configuredOffset: 120, now}).reason, 'no_measurement');
  assert.equal(tzDecision({observations: [], configuredOffset: 120, now}).verified, false);
});
