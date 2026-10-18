// R-08 Gate B: the PIT policy on the real TotalCorner prematch reader, over a throwaway PostgreSQL seeded with fixed
// instants around the end of European summer time (25/10/2026). No provider, no clock.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import test from 'node:test';
import {tcPrematchMatch, upsertMatch} from '../src/jobs/totalcorner-prematch.mjs';

function runNode(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {cwd: process.cwd(), env, stdio: ['ignore', 'pipe', 'pipe']});
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve(output) : reject(new Error(`node ${args.join(' ')} exited ${code}\n${output}`)));
  });
}

test('TotalCorner prematch answers carry per-row PIT status and a PIT label (MP-PIT-001..005)', {timeout: 90000}, async t => {
  const pg = (await import('pg')).default;
  const rootUrl = process.env.FUTPYTHON_TEST_DATABASE_URL || 'postgres://matchpilot:matchpilot_local_test@127.0.0.1:5432/matchpilot_fpt';
  const dbUrl = new URL(rootUrl);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(dbUrl.hostname), 'remote PostgreSQL is forbidden');
  const root = new pg.Client({connectionString: rootUrl, connectionTimeoutMillis: 2000});
  try { await root.connect(); }
  catch (cause) {
    await root.end().catch(() => {});
    if (process.env.CI) throw cause;
    return t.skip('throwaway postgres unavailable');
  }
  const schema = `pit_readers_${process.pid}`;
  const db = new pg.Client({connectionString: (() => { const u = new URL(dbUrl); u.searchParams.set('options', `-csearch_path=${schema}`); return u.toString(); })()});
  try {
    await root.query(`CREATE SCHEMA ${schema}`);
    const url = new URL(dbUrl);
    url.searchParams.set('options', `-csearch_path=${schema}`);
    await runNode(['src/migrate.mjs'], {PATH: process.env.PATH, NODE_ENV: 'test', DATABASE_URL: url.toString(), MATCHPILOT_RUNTIME_MODE: 'test', MATCHPILOT_BACKGROUND_ENABLED: 'false'});
    await db.connect();

    const obs = await db.query(`INSERT INTO tc_tz_observations(observed_at,gate_version,status,samples,offset_minutes,configured_offset_minutes,agrees)
      VALUES('2026-10-20T10:00:00Z','tc-tz-gate-v2','MEASURED',4,120,120,true) RETURNING observation_id`);
    const match = (id, observationId, lastSeen) => db.query(`INSERT INTO tc_matches(match_id,league_id,start_provider,tz_offset_minutes,kickoff_utc,first_seen_at,last_seen_at,tz_observation_id)
      VALUES($1,'7','2026-10-27 20:00:00',120,'2026-10-27T18:00:00Z','2026-10-20T10:00:00Z',$3,$2)`, [id, observationId, lastSeen]);
    await match('k1', obs.rows[0].observation_id, '2026-10-21T09:00:00Z'); // match state last observed before the decisions below
    await match('k2', null, '2026-10-27T17:00:00Z');
    const row = (matchId, n, providerUtc, acquired) => db.query(`INSERT INTO tc_market_rows(match_id,source,market,period,kind,line,price_1,price_2,
      provider_time,provider_time_utc,phase,provenance,row_hash,first_acquired_at,last_acquired_at,parser_version)
      VALUES($1,'consensus','asian','FT','movement','-0.5',1.9,1.9,$2,$3,'PREMATCH','PREMATCH_CAPTURED',$4,$5,$5,'fixture-v1')`,
    [matchId, 'provider-local', providerUtc, `h${n}`, acquired]);
    await row('k1', 1, '2026-10-21T08:00:00Z', '2026-10-21T08:01:00Z'); // verified
    await row('k1', 2, '2026-10-22T12:00:00Z', '2026-10-22T11:00:00Z'); // provider stamp an hour after our acquisition
    await row('k1', 3, '2026-10-24T12:00:00Z', '2026-10-27T17:00:00Z'); // acquired long after its provider time
    await row('k1', 4, '2026-10-26T09:00:00Z', '2026-10-26T09:02:00Z'); // after a possible DST change of the measured offset
    await row('k2', 5, '2026-10-21T08:00:00Z', '2026-10-21T08:01:00Z'); // match without a timezone measurement
    for (const acquired of ['2026-10-21T08:00:00Z', '2026-10-27T17:00:00Z']) {
      await db.query(`INSERT INTO tc_prematch_snapshots(match_id,source,acquired_at,kickoff_utc,minutes_to_kickoff) VALUES('k1','match_odds',$1,'2026-10-27T18:00:00Z',60)`, [acquired]);
    }
    await db.query(`UPDATE tc_matches SET last_status='upcoming' WHERE match_id='k1'`);

    const early = await tcPrematchMatch(db, {matchId: 'k1', asOf: '2026-10-21T12:00:00Z', knowledge: 'captured'});
    assert.equal(early.pit.label, 'PIT_VERIFIED');
    assert.equal(early.pit.records, 2, 'the match identity and one market row');
    // Review B-1: nothing acquired after as_of leaks into a captured answer.
    assert.deepEqual(early.snapshots.map(s => [s.source, s.n, new Date(s.last_at).toISOString()]), [['match_odds', 1, '2026-10-21T08:00:00.000Z']]);
    assert.equal(early.match.last_seen_at, null);
    assert.equal(early.match.last_status, null);
    assert.equal(early.match.pit.status, 'PIT_VERIFIED');
    const providerEarly = await tcPrematchMatch(db, {matchId: 'k1', asOf: '2026-10-21T12:00:00Z', knowledge: 'provider'});
    assert.equal(providerEarly.snapshots[0].n, 2, 'provider knowledge keeps the full, NON_PIT view');
    assert.equal(providerEarly.pit.label, 'NON_PIT');
    const beforeSeen = await tcPrematchMatch(db, {matchId: 'k1', asOf: '2026-10-19T00:00:00Z', knowledge: 'captured'});
    assert.equal(beforeSeen.match.pit.status, 'NOT_AVAILABLE_AT_DECISION', 'a match first seen after as_of is not known at as_of');
    assert.equal(beforeSeen.pit.label, 'NON_PIT');
    const used = early.markets[0].opening;
    assert.equal(used.pit.status, 'PIT_VERIFIED');
    assert.deepEqual(Object.keys(used.pit.times), ['event_time', 'event_time_earliest', 'event_time_latest', 'provider_time', 'provider_time_verified',
      'acquisition_time', 'availability_time', 'decision_time']);
    assert.equal(used.pit.times.availability_time, '2026-10-21T08:01:00.000Z');
    assert.equal(used.pit.times.decision_time, '2026-10-21T12:00:00.000Z');

    const late = await tcPrematchMatch(db, {matchId: 'k1', asOf: '2026-10-27T17:30:00Z', knowledge: 'captured'});
    assert.equal(late.pit.label, 'NON_PIT');
    assert.deepEqual([late.pit.records, late.pit.verified, late.pit.not_verified, late.pit.not_available], [5, 3, 2, 0]);
    assert.deepEqual(late.pit.reasons, {PROVIDER_TIME_AFTER_ACQUISITION: 1, TZ_DST_CHANGE_POSSIBLE: 1});
    assert.equal(late.markets[0].last.pit.status, 'PIT_NOT_VERIFIED', 'the last movement is after the possible DST change');

    // Captured knowledge never returns a row acquired after the decision; provider knowledge does, and is NON_PIT.
    const captured = await tcPrematchMatch(db, {matchId: 'k1', asOf: '2026-10-25T00:00:00Z', knowledge: 'captured'});
    assert.ok(captured.pit.records === 3 && captured.pit.not_available === 0);
    const provider = await tcPrematchMatch(db, {matchId: 'k1', asOf: '2026-10-25T00:00:00Z', knowledge: 'provider'});
    assert.equal(provider.pit.label, 'NON_PIT');
    assert.deepEqual(provider.pit.why, ['PROVIDER_KNOWLEDGE', 'RECORDS_NOT_PIT_VERIFIED', 'RECORDS_NOT_AVAILABLE_AT_DECISION']);
    assert.equal(provider.pit.not_available, 1);

    const unmeasured = await tcPrematchMatch(db, {matchId: 'k2', asOf: '2026-10-22T00:00:00Z', knowledge: 'captured'});
    assert.deepEqual(unmeasured.pit.reasons, {TZ_NOT_MEASURED: 1, MATCH_STATE_OBSERVED_AFTER_DECISION: 1});
    assert.equal(unmeasured.markets[0].opening.pit.times.provider_time, '2026-10-21T08:00:00.000Z', 'the declared time is reported, flagged as unverified');
    assert.equal(unmeasured.markets[0].opening.pit.times.provider_time_verified, false);

    // Review B-1 (residual): tc_matches keeps only the latest match state. A match re-observed after the decision
    // (here: postponed, renamed) cannot prove the state shown was the one known at T, so the answer is NON_PIT.
    const identity = {match_id: 'k3', league_id: '7', league_name: 'League', home: 'Home FC', home_id: '1', away: 'Away FC', away_id: '2',
      start_provider: '2026-10-27 20:00:00', tz_offset_minutes: 120, kickoff_utc: new Date('2026-10-27T18:00:00Z'), last_status: 'upcoming'};
    await upsertMatch(db, identity, null, new Date('2026-10-20T10:00:00Z'), obs.rows[0].observation_id);
    await row('k3', 6, '2026-10-21T08:00:00Z', '2026-10-21T08:01:00Z');
    const beforeChange = await tcPrematchMatch(db, {matchId: 'k3', asOf: '2026-10-21T12:00:00Z', knowledge: 'captured'});
    assert.equal(beforeChange.pit.label, 'PIT_VERIFIED');
    await upsertMatch(db, {...identity, home: 'Renamed FC', league_name: 'Renamed League', start_provider: '2026-11-05 20:00:00',
      kickoff_utc: new Date('2026-11-05T19:00:00Z'), last_status: 'postponed'}, null, new Date('2026-10-23T10:00:00Z'), null);
    const afterChange = await tcPrematchMatch(db, {matchId: 'k3', asOf: '2026-10-21T12:00:00Z', knowledge: 'captured'});
    assert.equal(afterChange.match.home, 'Renamed FC', 'the stored state is the latest one');
    assert.equal(afterChange.match.pit.status, 'PIT_NOT_VERIFIED');
    assert.deepEqual(afterChange.match.pit.reasons, ['MATCH_STATE_OBSERVED_AFTER_DECISION']);
    assert.equal(afterChange.pit.label, 'NON_PIT');
    // Deciding at the new kickoff, the postponed state was already known (observed on 10-23): consistent and PIT.
    const noAsOf = await tcPrematchMatch(db, {matchId: 'k3', knowledge: 'captured'});
    assert.equal(noAsOf.as_of, '2026-11-05T19:00:00.000Z');
    assert.equal(noAsOf.match.pit.status, 'PIT_VERIFIED');
  } finally {
    await db.end().catch(() => {});
    try { await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); }
    finally { await root.end(); }
  }
});
