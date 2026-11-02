// MP-PIT-LIVE-01: time phase of provider records and the leakage rules. Negative tests first: no in-play or post-match
// value may reach a pre-match decision, no record may be used before MatchPilot acquired it, and anything ambiguous is
// UNKNOWN and unusable.
import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyPhase, DATA_PHASES, usableAt, usableRecords } from '../src/pit/phase.mjs';
import { normalizeExpression, pitReport, pitViolations } from '../src/conditions/expression.mjs';
import { buildCatalog, fptFieldCapability } from '../src/capabilities/catalog.mjs';
import { apiFootballCapabilities } from '../src/capabilities/apifootball.mjs';

const KO = '2026-11-02T18:00:00Z';
const t = min => new Date(Date.parse(KO) + min * 60000).toISOString();
const rec = (min, status, extra = {}) => classifyPhase({kickoff: KO, acquiredAt: t(min), matchStatus: status, ...extra});

test('MP-PIT-LIVE-01 phase from acquisition time, kickoff and status; disagreements are UNKNOWN', () => {
  assert.deepEqual(DATA_PHASES, ['PREMATCH', 'LIVE', 'POSTMATCH', 'UNKNOWN']);
  for (const [min, status, phase, reason] of [
    [-60, 'NS', 'PREMATCH'], [-60, null, 'PREMATCH'], [-1, 'TBD', 'PREMATCH'],
    [10, '1H', 'LIVE'], [50, 'HT', 'LIVE'], [70, '2h', 'LIVE'], [80, 'SUSP', 'LIVE'],
    [110, 'FT', 'POSTMATCH'], [140, 'PEN', 'POSTMATCH'],
    [5, 'NS', 'UNKNOWN', 'NOT_STARTED_AFTER_SCHEDULED_KICKOFF'],
    [-5, '1H', 'UNKNOWN', 'IN_PLAY_BEFORE_SCHEDULED_KICKOFF'],
    [-5, 'FT', 'UNKNOWN', 'FINISHED_BEFORE_SCHEDULED_KICKOFF'],
    [10, null, 'UNKNOWN', 'STATUS_MISSING_AFTER_KICKOFF'],
    [10, 'PST', 'UNKNOWN', 'STATUS_NOT_CLASSIFIED'], [10, 'CANC', 'UNKNOWN', 'STATUS_NOT_CLASSIFIED'], [10, 'XYZ', 'UNKNOWN', 'STATUS_NOT_CLASSIFIED']
  ]) {
    const r = rec(min, status);
    assert.equal(r.phase, phase, `${min} ${status}`);
    if (reason) assert.deepEqual(r.reasons, [reason], `${min} ${status}`);
  }
  // Exactly at kickoff the match is no longer pre-match.
  assert.equal(rec(0, 'NS').phase, 'UNKNOWN');
  assert.equal(rec(0, '1H').phase, 'LIVE');
  for (const input of [{acquiredAt: t(-10), matchStatus: 'NS'}, {kickoff: KO, matchStatus: 'NS'}, {kickoff: '2026-11-02 18:00', acquiredAt: t(-10)},
    {kickoff: KO, acquiredAt: t(-10), providerTime: 'yesterday'}, {kickoff: KO, acquiredAt: 1730570400000}]) {
    assert.equal(classifyPhase(input).phase, 'UNKNOWN', JSON.stringify(input));
  }
});

test('MP-PIT-LIVE-01 a record is never back-dated: availability is the acquisition instant, not the provider time', () => {
  const r = rec(20, '1H', {providerTime: t(12), provenance: 'apifootball:/odds/live', snapshotId: 42});
  assert.deepEqual(r.times, {kickoff: '2026-11-02T18:00:00.000Z', acquired_at: t(20), provider_time: t(12), available_from: t(20)});
  assert.deepEqual([r.match_status, r.provenance, r.snapshot_id], ['1H', 'apifootball:/odds/live', 42], 'provenance and snapshot id kept apart');
  // A decision at minute 15 cannot use it, although the provider says minute 12.
  assert.deepEqual(usableAt(r, {decision: 'LIVE', decisionTime: t(15)}), {usable: false, reason: 'NOT_AVAILABLE_AT_DECISION'});
  assert.deepEqual(usableAt(r, {decision: 'LIVE', decisionTime: t(20)}), {usable: true, reason: null});
  // A provider time later than the acquisition (beyond tolerance) is inconsistent: UNKNOWN, unusable.
  const late = rec(20, '1H', {providerTime: t(30)});
  assert.deepEqual([late.phase, late.reasons], ['UNKNOWN', ['PROVIDER_TIME_AFTER_ACQUISITION']]);
  assert.equal(usableAt(late, {decision: 'POSTMATCH', decisionTime: t(200), matchFinishedAt: t(110)}).usable, false);
});

test('MP-PIT-LIVE-01 leakage: no in-play or post-match record in a pre-match decision, no post-match record in play', () => {
  const pre = rec(-30, 'NS'), live = rec(10, '1H'), post = rec(110, 'FT'), unknown = rec(5, 'NS');
  const at = (decision, min) => [pre, live, post, unknown].map(r => usableAt(r, {decision, decisionTime: t(min), matchFinishedAt: t(110)}));
  assert.deepEqual(at('PREMATCH', -10).map(r => r.usable), [true, false, false, false]);
  assert.deepEqual(at('PREMATCH', -10).map(r => r.reason), [null, 'NOT_AVAILABLE_AT_DECISION', 'NOT_AVAILABLE_AT_DECISION', 'PHASE_UNKNOWN']);
  // Even a later decision labelled PREMATCH is refused: a pre-match decision is before kickoff by definition.
  assert.deepEqual(usableAt(pre, {decision: 'PREMATCH', decisionTime: t(30)}), {usable: false, reason: 'PREMATCH_DECISION_AFTER_KICKOFF'});
  assert.deepEqual(at('LIVE', 60).map(r => r.usable), [true, true, false, false]);
  assert.deepEqual(at('LIVE', 120).map(r => r.reason), [null, null, 'POSTMATCH_DATA_IN_LIVE_DECISION', 'PHASE_UNKNOWN']);
  assert.deepEqual(usableAt(pre, {decision: 'LIVE', decisionTime: t(-5)}), {usable: false, reason: 'LIVE_DECISION_BEFORE_KICKOFF'});
  assert.deepEqual(at('POSTMATCH', 200).map(r => r.usable), [true, true, true, false], 'UNKNOWN is never usable');
  assert.deepEqual(usableAt(pre, {decision: 'PREMATCH', decisionTime: null}), {usable: false, reason: 'DECISION_TIME_UNKNOWN'});
  assert.throws(() => usableAt(pre, {decision: 'BACKTEST', decisionTime: t(-10)}), /decision must be one of/);
  const {usable, refused} = usableRecords([pre, live, post, unknown], {decision: 'PREMATCH', decisionTime: t(-10)});
  assert.deepEqual([usable.length, refused], [1, {NOT_AVAILABLE_AT_DECISION: 2, PHASE_UNKNOWN: 1}], 'what is left out is counted');
});

test('MP-PIT-LIVE-01 backtest replay: a LIVE price is not visible before the instant it was acquired', () => {
  // Odds acquired at minutes 5, 12 and 31; a replay at each minute sees only what was acquired by then.
  const series = [5, 12, 31].map(m => rec(m, '1H', {snapshotId: m}));
  const seen = minute => usableRecords(series, {decision: 'LIVE', decisionTime: t(minute)}).usable.map(r => r.snapshot_id);
  assert.deepEqual([seen(4), seen(5), seen(20), seen(40)], [[], [5], [5, 12], [5, 12, 31]]);
});

test('MP-PIT-LIVE-01 catalog and conditions: in-play prices are LIVE_ACQUIRED, refused before kickoff, allowed in play', () => {
  const catalog = buildCatalog([fptFieldCapability({field_name: 'League', inferred_type: 'text', nonempty_seen: 1}), ...apiFootballCapabilities()]);
  assert.deepEqual(catalog.errors, []);
  const live = catalog.capabilities.find(c => c.id === 'apifootball:market:odds/live/bet:36');
  assert.deepEqual([live.timing, live.phases], ['LIVE_ACQUIRED', ['LIVE']]);
  const expr = normalizeExpression({all: [{field: 'fpt:identity:League', op: 'eq', value: 'Serie A'},
    {field: 'apifootball:market:odds/live/bet:36', op: 'lte', value: '1.9'}, {field: 'apifootball:statistic:Corner Kicks', op: 'gte', value: 5}]}, catalog);
  assert.deepEqual(pitViolations(expr, catalog, {decision: 'PREMATCH'}).map(v => v.field), ['apifootball:market:odds/live/bet:36', 'apifootball:statistic:Corner Kicks']);
  assert.match(pitViolations(expr, catalog, {decision: 'PREMATCH'})[0].reason, /in-play price/);
  assert.deepEqual(pitViolations(expr, catalog, {decision: 'LIVE'}).map(v => v.field), ['apifootball:statistic:Corner Kicks'], 'post-match outcome refused in play');
  assert.deepEqual(pitViolations(expr, catalog, {decision: 'POSTMATCH'}), []);
  const report = pitReport(expr, catalog, {decision: 'LIVE'});
  assert.deepEqual([report.acquisition_bound, report.pit_verifiable], [['apifootball:market:odds/live/bet:36'], false]);
});

test('MP-PIT-LIVE-01 review: no relabelling, no edited records, POSTMATCH only after the observed end, no impossible dates', () => {
  const pre = rec(-60, 'NS');
  // A caller kickoff different from the record's own is refused, so a decision cannot be moved past the real kickoff.
  assert.deepEqual(usableAt(pre, {decision: 'PREMATCH', decisionTime: t(60), kickoff: t(120)}), {usable: false, reason: 'KICKOFF_MISMATCH'});
  assert.deepEqual(usableAt(pre, {decision: 'LIVE', decisionTime: t(-30), kickoff: t(-45)}), {usable: false, reason: 'KICKOFF_MISMATCH'});
  assert.deepEqual(usableAt(pre, {decision: 'PREMATCH', decisionTime: t(-10), kickoff: KO}), {usable: true, reason: null}, 'the same kickoff is accepted');
  // An edited or hand-built record is refused.
  const live = rec(10, '1H');
  assert.deepEqual(usableAt({...live, phase: 'PREMATCH'}, {decision: 'PREMATCH', decisionTime: t(-5)}).reason, 'RECORD_INCONSISTENT');
  assert.deepEqual(usableAt({...pre, times: {...pre.times, available_from: t(-90)}}, {decision: 'PREMATCH', decisionTime: t(-80)}).reason, 'RECORD_INCONSISTENT');
  // POSTMATCH needs the observed end of the match, and comes after it.
  const post = rec(110, 'FT');
  assert.deepEqual(usableAt(post, {decision: 'POSTMATCH', decisionTime: t(200)}), {usable: false, reason: 'MATCH_END_UNKNOWN'});
  assert.deepEqual(usableAt(live, {decision: 'POSTMATCH', decisionTime: t(30), matchFinishedAt: t(110)}), {usable: false, reason: 'POSTMATCH_DECISION_BEFORE_MATCH_END'});
  assert.deepEqual(usableAt(live, {decision: 'POSTMATCH', decisionTime: t(120), matchFinishedAt: t(110)}), {usable: true, reason: null});
  assert.deepEqual(usableAt(live, {decision: 'POSTMATCH', decisionTime: t(120), matchFinishedAt: t(-5)}).reason, 'MATCH_END_UNKNOWN', 'an end before kickoff is not an end');
  // Impossible dates are unreadable; Date objects and statuses with spaces are read.
  for (const v of ['2026-02-30T10:00:00Z', '2026-11-02T24:00:00Z', '2026-13-01T10:00:00Z']) assert.equal(classifyPhase({kickoff: v, acquiredAt: t(-10), matchStatus: 'NS'}).phase, 'UNKNOWN', v);
  assert.equal(classifyPhase({kickoff: new Date(KO), acquiredAt: new Date(t(110)), matchStatus: ' ft '}).phase, 'POSTMATCH');
  // Provider time exactly at the tolerance is accepted; one millisecond beyond is not.
  assert.equal(rec(20, '1H', {providerTime: t(25)}).phase, 'LIVE');
  assert.equal(classifyPhase({kickoff: KO, acquiredAt: t(20), matchStatus: '1H', providerTime: new Date(Date.parse(t(25)) + 1).toISOString()}).phase, 'UNKNOWN');
  // A LIVE decision exactly at kickoff may use pre-match data.
  assert.deepEqual(usableAt(pre, {decision: 'LIVE', decisionTime: KO}), {usable: true, reason: null});
});

test('MP-PIT-LIVE-01 review: an in-play condition is never PIT verified by the expression alone; POSTMATCH reports unknown fields', () => {
  const catalog = buildCatalog(apiFootballCapabilities());
  const onlyLive = normalizeExpression({field: 'apifootball:market:odds/live/bet:36', op: 'lte', value: '1.9'}, catalog);
  const r = pitReport(onlyLive, catalog, {decision: 'LIVE'});
  assert.deepEqual([r.violations, r.untimed, r.acquisition_bound, r.pit_verifiable], [[], [], ['apifootball:market:odds/live/bet:36'], false]);
  const withUnknown = normalizeExpression({field: 'apifootball:market:odds/bet:5', op: 'gt', value: '1.5'}, catalog);
  assert.deepEqual(pitViolations(withUnknown, new Map(), {decision: 'POSTMATCH'}), [{field: 'apifootball:market:odds/bet:5', timing: null, reason: 'not in the catalog'}]);
});

