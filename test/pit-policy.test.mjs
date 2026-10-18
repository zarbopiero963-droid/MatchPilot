// R-08 (#31, owner decision D4): the point-in-time policy. Pure tests: fixed instants, no clock, no database.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ANALYSIS_LABEL, OFFSET_VALIDITY_MS, PIT_POLICY_VERSION, PIT_STATUS, analysisLabel, availableAt, classifyRecord, localToUtc,
  measuredOffsetValidity, undocumentedDateInterval, undocumentedLocalInterval, zoneOffsetMinutes,
} from '../src/pit/policy.mjs';
import {classifyFptVersions, classifyTcPrematchRows} from '../src/pit/readers.mjs';

const T = '2026-10-21T12:00:00.000Z';

test('a record exposes the five timestamps separately and marks the missing ones (MP-PIT-001)', () => {
  const record = classifyRecord({eventEarliest: '2026-10-21T08:00:00Z', providerTime: '2026-10-21T08:00:00Z', providerTimeVerified: true,
    providerTimeUsed: true, acquisitionTime: '2026-10-21T08:01:00Z', decisionTime: T});
  assert.equal(record.policy_version, PIT_POLICY_VERSION);
  assert.equal(record.status, PIT_STATUS.VERIFIED);
  assert.deepEqual(record.times, {
    event_time: '2026-10-21T08:00:00.000Z', event_time_earliest: '2026-10-21T08:00:00.000Z', event_time_latest: '2026-10-21T08:00:00.000Z',
    provider_time: '2026-10-21T08:00:00.000Z', provider_time_verified: true,
    acquisition_time: '2026-10-21T08:01:00.000Z', availability_time: '2026-10-21T08:01:00.000Z', decision_time: T,
  });
  const bare = classifyRecord({acquisitionTime: '2026-10-21T08:01:00Z', decisionTime: T});
  assert.deepEqual(bare.missing, ['event_time', 'provider_time']);
  assert.equal(bare.times.event_time, null, 'a missing time is never invented');
  assert.equal(bare.times.provider_time, null);
  assert.equal(bare.times.provider_time_verified, null);
});

test('availability is the acquisition time; records acquired after the decision are never available (MP-PIT-002)', () => {
  const late = classifyRecord({acquisitionTime: '2026-10-21T12:00:01Z', decisionTime: T});
  const onTime = classifyRecord({acquisitionTime: T, decisionTime: T});
  assert.equal(late.status, PIT_STATUS.NOT_AVAILABLE);
  assert.equal(onTime.status, PIT_STATUS.VERIFIED, 'acquired exactly at T is available at T');
  assert.deepEqual(availableAt([late, onTime]), [onTime]);
  // A provider time before T does not make a record known at T.
  const claimed = classifyRecord({providerTime: '2026-10-20T00:00:00Z', providerTimeVerified: true, providerTimeUsed: true,
    acquisitionTime: '2026-10-22T00:00:00Z', decisionTime: T});
  assert.equal(claimed.status, PIT_STATUS.NOT_AVAILABLE);
});

test('a later availability (a re-parsed version) delays when a record is usable; unknown availability is not verified (MP-FPT-005)', () => {
  const reparsed = {acquisitionTime: '2026-10-01T00:00:00Z', availabilityTime: '2026-10-22T00:00:00Z', decisionTime: T};
  assert.equal(classifyRecord(reparsed).status, PIT_STATUS.NOT_AVAILABLE, 'acquired before T, usable only after T');
  assert.equal(classifyRecord(reparsed).times.availability_time, '2026-10-22T00:00:00.000Z');
  assert.equal(classifyRecord({...reparsed, decisionTime: '2026-10-23T00:00:00Z'}).status, PIT_STATUS.VERIFIED);
  assert.equal(classifyRecord({...reparsed, availabilityTime: '2026-09-01T00:00:00Z'}).times.availability_time, '2026-10-01T00:00:00.000Z',
    'availability is never earlier than acquisition');
  const unknown = classifyRecord({...reparsed, availabilityTime: null});
  assert.equal(unknown.status, PIT_STATUS.NOT_VERIFIED);
  assert.deepEqual(unknown.reasons, ['AVAILABILITY_TIME_UNKNOWN']);
  assert.equal(unknown.times.availability_time, null);
});

test('missing, ambiguous or inconsistent timestamps are PIT_NOT_VERIFIED, never repaired (MP-PIT-003)', () => {
  const cases = [
    [{decisionTime: T}, 'ACQUISITION_TIME_MISSING'],
    [{acquisitionTime: '2026-10-21T08:00:00Z'}, 'DECISION_TIME_MISSING'],
    [{providerTimeUsed: true, acquisitionTime: '2026-10-21T08:00:00Z', decisionTime: T}, 'PROVIDER_TIME_MISSING'],
    [{providerTime: '2026-10-21T08:00:00Z', providerTimeUsed: true, providerTimeVerified: false, acquisitionTime: '2026-10-21T08:00:00Z', decisionTime: T}, 'PROVIDER_TZ_NOT_VERIFIED'],
    [{providerTime: '2026-10-21T09:00:00Z', providerTimeVerified: true, acquisitionTime: '2026-10-21T08:00:00Z', decisionTime: T}, 'PROVIDER_TIME_AFTER_ACQUISITION'],
    [{eventEarliest: '2026-10-21T10:00:00Z', eventLatest: '2026-10-21T09:00:00Z', acquisitionTime: '2026-10-21T08:00:00Z', decisionTime: T}, 'EVENT_INTERVAL_INVERTED'],
    [{eventEarliest: '2026-10-21T10:00:00Z', eventLatest: '2026-10-21T14:00:00Z', acquisitionTime: '2026-10-21T08:00:00Z', decisionTime: T}, 'EVENT_TIME_AMBIGUOUS_AT_DECISION'],
  ];
  for (const [input, reason] of cases) {
    const record = classifyRecord(input);
    assert.equal(record.status, PIT_STATUS.NOT_VERIFIED, reason);
    assert.ok(record.reasons.includes(reason), `${reason} in ${record.reasons}`);
  }
  // Provider clocks may run a few minutes ahead of ours; beyond the tolerance the record is inconsistent.
  assert.equal(classifyRecord({providerTime: '2026-10-21T08:04:00Z', providerTimeVerified: true, acquisitionTime: '2026-10-21T08:00:00Z', decisionTime: T}).status, PIT_STATUS.VERIFIED);
  // An uncertain event entirely before the decision does not change the answer.
  assert.equal(classifyRecord({eventEarliest: '2026-10-20T00:00:00Z', eventLatest: '2026-10-21T11:00:00Z', acquisitionTime: '2026-10-21T11:30:00Z', decisionTime: T}).status, PIT_STATUS.VERIFIED);
});

test('documented zones: DST gaps and repeated hours are reported, never guessed (MP-PIT-004)', () => {
  assert.deepEqual(localToUtc('2026-07-01 20:45', 'Europe/Rome').utc, new Date('2026-07-01T18:45:00Z'));
  assert.deepEqual(localToUtc('2026-01-15 20:45', 'Europe/Rome').utc, new Date('2026-01-15T19:45:00Z'));
  assert.deepEqual(localToUtc('2026-03-29 02:30', 'Europe/Rome'), {status: 'GAP', utc: null, candidates: []});
  assert.deepEqual(localToUtc('2026-10-25 02:30', 'Europe/Rome'),
    {status: 'AMBIGUOUS', utc: null, candidates: ['2026-10-25T00:30:00.000Z', '2026-10-25T01:30:00.000Z']});
  assert.equal(localToUtc('2026-10-25 03:00', 'Europe/Rome').status, 'OK');
  assert.deepEqual(localToUtc('2026-03-08 02:30', 'America/New_York').status, 'GAP');
  assert.deepEqual(localToUtc('2026-11-01 01:30', 'America/New_York').candidates, ['2026-11-01T05:30:00.000Z', '2026-11-01T06:30:00.000Z']);
  assert.deepEqual(localToUtc('2026-10-25 02:30', 'Asia/Shanghai').utc, new Date('2026-10-24T18:30:00Z'), 'no DST: always one instant');
  for (const bad of ['2026-02-30 10:00', '2026-01-10 24:00', '2026-13-01 10:00', 'garbage', '']) assert.equal(localToUtc(bad, 'UTC').status, 'INVALID', bad);
  assert.equal(zoneOffsetMinutes('Asia/Kolkata', new Date('2026-01-01T00:00:00Z')), 330);
  assert.equal(zoneOffsetMinutes('Asia/Kathmandu', new Date('2026-01-01T00:00:00Z')), 345);
});

test('undocumented zones yield only the interval of every possible instant (FPT kickoff, #12)', () => {
  assert.deepEqual(undocumentedDateInterval('2026-10-08'), {earliest: new Date('2026-10-07T10:00:00.000Z'), latest: new Date('2026-10-09T11:59:59.999Z')});
  assert.deepEqual(undocumentedLocalInterval('2026-10-08 20:45'), {earliest: new Date('2026-10-08T06:45:00Z'), latest: new Date('2026-10-09T08:45:00Z')});
  assert.equal(undocumentedDateInterval('2026-02-30'), null);
  assert.equal(undocumentedDateInterval(''), null);
});

test('a measured fixed offset is valid only near its measurement and while no consistent zone changes offset (MP-PIT-004)', () => {
  const measured = {offsetMinutes: 120, observedAt: '2026-10-08T15:41:00Z', observationStatus: 'MEASURED'};
  assert.equal(measuredOffsetValidity({...measured, at: '2026-10-20T00:00:00Z'}).verified, true);
  const acrossDst = measuredOffsetValidity({...measured, at: '2026-10-26T00:00:00Z'});
  assert.equal(acrossDst.verified, false, 'UTC+2 on 08/10 can be CEST, which ends on 25/10');
  assert.equal(acrossDst.reason, 'TZ_DST_CHANGE_POSSIBLE');
  assert.ok(acrossDst.zones_changed > 0 && acrossDst.zones_changed < acrossDst.zones_consistent);
  assert.equal(measuredOffsetValidity({...measured, at: '2026-10-07T00:00:00Z'}).verified, true, 'before the measurement too, within the window');
  assert.equal(measuredOffsetValidity({...measured, offsetMinutes: 480, at: '2026-10-26T00:00:00Z'}).verified, true, 'UTC+8 zones have no DST in 2026');
  assert.equal(measuredOffsetValidity({...measured, offsetMinutes: 480,
    at: new Date(Date.parse(measured.observedAt) + OFFSET_VALIDITY_MS + 1)}).reason, 'TZ_MEASUREMENT_OUT_OF_WINDOW');
  for (const status of ['INSUFFICIENT', 'INCONSISTENT', 'UNAVAILABLE', undefined]) {
    assert.equal(measuredOffsetValidity({...measured, observationStatus: status, at: '2026-10-09T00:00:00Z'}).reason, 'TZ_NOT_MEASURED');
  }
  assert.equal(measuredOffsetValidity({...measured, at: null}).reason, 'TIME_MISSING');
  assert.deepEqual(measuredOffsetValidity({...measured, offsetMinutes: 75, at: '2026-10-09T00:00:00Z'}), {verified: false, reason: 'TZ_OFFSET_NO_IANA_ZONE', zones_consistent: 0});
});

test('an analysis is PIT only when every record is PIT_VERIFIED under captured knowledge (MP-PIT-005)', () => {
  const ok = classifyRecord({acquisitionTime: '2026-10-21T08:00:00Z', decisionTime: T});
  const weak = classifyRecord({providerTime: '2026-10-21T08:00:00Z', providerTimeUsed: true, providerTimeVerified: false, acquisitionTime: '2026-10-21T08:00:00Z', decisionTime: T});
  const late = classifyRecord({acquisitionTime: '2026-10-22T08:00:00Z', decisionTime: T});
  assert.equal(analysisLabel([ok], {decisionTime: T}).label, ANALYSIS_LABEL.PIT);
  assert.equal(analysisLabel([], {decisionTime: T}).label, ANALYSIS_LABEL.PIT, 'an empty answer at T is still a PIT answer');
  assert.deepEqual(analysisLabel([ok, weak], {decisionTime: T}), {policy_version: PIT_POLICY_VERSION, label: 'NON_PIT', why: ['RECORDS_NOT_PIT_VERIFIED'],
    knowledge: 'captured', decision_time: T, records: 2, verified: 1, not_verified: 1, not_available: 0, reasons: {PROVIDER_TZ_NOT_VERIFIED: 1}});
  assert.deepEqual(analysisLabel([ok, late], {knowledge: 'provider', decisionTime: T}).why, ['PROVIDER_KNOWLEDGE', 'RECORDS_NOT_AVAILABLE_AT_DECISION']);
  assert.equal(analysisLabel([ok], {knowledge: 'provider', decisionTime: T}).label, ANALYSIS_LABEL.NON_PIT, 'provider knowledge is never PIT');
});

test('reader adapters: TotalCorner rows follow their match timezone measurement, FPT dates their undocumented zone', () => {
  const match = {tz_offset_minutes: 120, first_seen_at: '2026-10-20T10:00:00Z', last_seen_at: '2026-10-20T10:00:00Z'};
  const observation = {observed_at: '2026-10-20T10:00:00Z', status: 'MEASURED', offset_minutes: 120};
  const rows = [
    {provider_time_utc: '2026-10-21T08:00:00.000Z', first_acquired_at: '2026-10-21T08:01:00Z'},
    {provider_time_utc: '2026-10-26T09:00:00.000Z', first_acquired_at: '2026-10-26T09:02:00Z'},
  ];
  const decision = '2026-10-27T00:00:00Z';
  const tc = classifyTcPrematchRows(rows, {match, observation, decisionTime: decision, knowledge: 'captured'});
  assert.deepEqual(tc.classified.map(r => [r.status, r.reasons]), [[PIT_STATUS.VERIFIED, []], [PIT_STATUS.NOT_VERIFIED, ['TZ_DST_CHANGE_POSSIBLE']]]);
  assert.equal(tc.classified[1].times.event_time, null, 'an unverified conversion gives no event instant');
  assert.equal(tc.label.label, 'NON_PIT');
  assert.deepEqual(classifyTcPrematchRows(rows, {match, observation: null, decisionTime: decision, knowledge: 'captured'}).label.reasons, {TZ_NOT_MEASURED: 2});
  assert.deepEqual(classifyTcPrematchRows(rows.slice(0, 1), {match, observation, decisionTime: '2026-10-20T09:00:00Z', knowledge: 'provider'}).classified[0].reasons,
    ['TZ_MEASURED_AFTER_DECISION'], 'a measurement taken after the decision cannot vouch for it');
  assert.deepEqual(classifyTcPrematchRows(rows, {match, observation: {...observation, offset_minutes: 60}, decisionTime: decision, knowledge: 'captured'}).label.reasons,
    {TZ_OFFSET_MISMATCH: 2});

  const fpt = classifyFptVersions([
    {match_date: '2026-10-08', acquired_at: '2026-10-10T06:00:00Z'},
    {match_date: new Date(2026, 9, 20), acquired_at: '2026-10-20T06:00:00Z'},
  ], {decisionTime: '2026-10-20T12:00:00Z'});
  assert.deepEqual(fpt.classified.map(r => r.status), [PIT_STATUS.VERIFIED, PIT_STATUS.NOT_VERIFIED]);
  assert.deepEqual(fpt.classified[1].reasons, ['EVENT_TIME_AMBIGUOUS_AT_DECISION'], 'a match on the decision day may not have happened yet');
  assert.equal(fpt.classified[1].times.event_time_earliest, '2026-10-19T10:00:00.000Z', 'a local-midnight Date keeps its calendar day');
});

test('classification is deterministic and does not read the clock', () => {
  const input = {providerTime: '2026-10-21T08:00:00Z', providerTimeUsed: true, providerTimeVerified: true, acquisitionTime: '2026-10-21T08:01:00Z', decisionTime: T};
  const first = JSON.stringify(classifyRecord(input));
  const realNow = Date.now;
  Date.now = () => { throw new Error('the policy must not read the clock'); };
  try { assert.equal(JSON.stringify(classifyRecord(input)), first); }
  finally { Date.now = realNow; }
});
