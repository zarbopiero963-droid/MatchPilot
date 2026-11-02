// MP-PIT-LIVE-01 (#263, MP-NEXT-20261102 priority B): the time phase of a provider record (PREMATCH, LIVE, POSTMATCH,
// UNKNOWN) and whether a decision taken at a given instant may use it. Pure module: no clock, no database, no network;
// the caller passes every instant. It extends mp-pit-v1 (src/pit/policy.mjs) without changing it.
//
// Rules, all conservative:
// - availability is MatchPilot's acquisition instant, never the provider's own timestamp: a record is never back-dated;
// - the phase comes from the acquisition instant against the scheduled kickoff AND the match status reported with the
//   record; when they disagree (in play before kickoff, not started after kickoff, finished before kickoff) or anything
//   is missing or unreadable, the phase is UNKNOWN;
// - an UNKNOWN record is never usable for a point-in-time decision;
// - a PREMATCH decision (before kickoff) uses PREMATCH records only; a LIVE decision (during the match) uses PREMATCH and
//   LIVE records; a POSTMATCH decision (research on a finished match) uses every known phase; in every case only records
//   acquired at or before the decision instant.
// Provider time, acquisition time, kickoff, status, provenance and snapshot id are kept apart in the result.

export const PIT_PHASE_VERSION = 'mp-pit-live-1';
export const DATA_PHASES = Object.freeze(['PREMATCH', 'LIVE', 'POSTMATCH', 'UNKNOWN']);
export const DECISIONS = Object.freeze(['PREMATCH', 'LIVE', 'POSTMATCH']);
export const PROVIDER_CLOCK_TOLERANCE_MS = 5 * 60_000;

// API-FOOTBALL short statuses (fixture.status.short). Anything else (postponed, cancelled, abandoned, awarded, walkover,
// or a value never seen) is not classified.
export const STATUS_GROUPS = Object.freeze({
  NOT_STARTED: Object.freeze(['NS', 'TBD']),
  IN_PLAY: Object.freeze(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE', 'INT', 'SUSP']),
  FINISHED: Object.freeze(['FT', 'AET', 'PEN'])
});
const groupOf = status => {
  const s = typeof status === 'string' ? status.trim().toUpperCase() : null;
  if (!s) return null;
  for (const [group, list] of Object.entries(STATUS_GROUPS)) if (list.includes(s)) return group;
  return 'OTHER';
};

const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/;
// Calendar check on the instant as written: 2026-02-30 or 24:00 are unreadable, never rolled over to another date.
function validCalendar(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(text);
  if (!m) return false;
  const [y, mo, d, h, mi, se = 0] = m.slice(1).map(Number);
  return mo >= 1 && mo <= 12 && d >= 1 && d <= new Date(Date.UTC(y, mo, 0)).getUTCDate() && h <= 23 && mi <= 59 && se <= 59;
}
function ms(value) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  return typeof value === 'string' && ISO_WITH_OFFSET.test(value) && validCalendar(value) && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
}
const iso = v => (v === null ? null : new Date(v).toISOString());

// input: {kickoff, acquiredAt, providerTime?, matchStatus?, provenance?, snapshotId?}
export function classifyPhase(input = {}) {
  const kickoff = ms(input.kickoff);
  const acquired = ms(input.acquiredAt);
  const provider = input.providerTime == null ? null : ms(input.providerTime);
  const group = groupOf(input.matchStatus);
  const reasons = [];
  if (kickoff === null) reasons.push('KICKOFF_UNKNOWN');
  if (acquired === null) reasons.push('ACQUISITION_TIME_UNKNOWN');
  if (input.providerTime != null && provider === null) reasons.push('PROVIDER_TIME_UNREADABLE');
  if (provider !== null && acquired !== null && provider > acquired + PROVIDER_CLOCK_TOLERANCE_MS) reasons.push('PROVIDER_TIME_AFTER_ACQUISITION');
  let phase = 'UNKNOWN';
  if (!reasons.length) {
    const before = acquired < kickoff;
    if (group === null) {
      // No status: before kickoff the time alone says PREMATCH; after kickoff live and finished cannot be told apart.
      if (before) phase = 'PREMATCH'; else reasons.push('STATUS_MISSING_AFTER_KICKOFF');
    } else if (group === 'NOT_STARTED') {
      if (before) phase = 'PREMATCH'; else reasons.push('NOT_STARTED_AFTER_SCHEDULED_KICKOFF');
    } else if (group === 'IN_PLAY') {
      if (!before) phase = 'LIVE'; else reasons.push('IN_PLAY_BEFORE_SCHEDULED_KICKOFF');
    } else if (group === 'FINISHED') {
      if (!before) phase = 'POSTMATCH'; else reasons.push('FINISHED_BEFORE_SCHEDULED_KICKOFF');
    } else reasons.push('STATUS_NOT_CLASSIFIED');
  }
  return {
    version: PIT_PHASE_VERSION, phase, reasons,
    times: {kickoff: iso(kickoff), acquired_at: iso(acquired), provider_time: iso(provider), available_from: iso(acquired)},
    match_status: typeof input.matchStatus === 'string' ? input.matchStatus : null,
    provenance: input.provenance ?? null,
    snapshot_id: input.snapshotId ?? null
  };
}

// Whether a decision taken at decisionTime may use a classified record. Returns {usable, reason}.
// - The record is re-classified from its own times and status: an edited or hand-built object whose phase does not follow
//   from them is refused (RECORD_INCONSISTENT).
// - The kickoff is the record's own; a caller kickoff that differs from it is refused (KICKOFF_MISMATCH), so a decision
//   can never be relabelled with another kickoff.
// - A POSTMATCH decision (research on a finished match) needs matchFinishedAt, the observed instant at which MatchPilot
//   acquired the finished status, and is taken at or after it; otherwise it is refused (MATCH_END_UNKNOWN).
export function usableAt(classified, {decision, decisionTime, kickoff, matchFinishedAt} = {}) {
  if (!DECISIONS.includes(decision)) throw new TypeError(`decision must be one of ${DECISIONS.join(', ')}`);
  const at = ms(decisionTime);
  if (at === null) return {usable: false, reason: 'DECISION_TIME_UNKNOWN'};
  if (!classified || classified.phase === 'UNKNOWN') return {usable: false, reason: 'PHASE_UNKNOWN'};
  const again = classifyPhase({kickoff: classified.times?.kickoff ?? null, acquiredAt: classified.times?.acquired_at ?? null,
    providerTime: classified.times?.provider_time ?? null, matchStatus: classified.match_status});
  if (again.phase !== classified.phase || again.times.available_from !== classified.times?.available_from) return {usable: false, reason: 'RECORD_INCONSISTENT'};
  const ko = ms(classified.times.kickoff);
  if (kickoff !== undefined && kickoff !== null && ms(kickoff) !== ko) return {usable: false, reason: 'KICKOFF_MISMATCH'};
  const available = ms(classified.times?.available_from ?? null);
  if (available === null) return {usable: false, reason: 'AVAILABILITY_UNKNOWN'};
  if (available > at) return {usable: false, reason: 'NOT_AVAILABLE_AT_DECISION'};
  if (ko === null) return {usable: false, reason: 'KICKOFF_UNKNOWN'};
  if (decision === 'PREMATCH') {
    if (at >= ko) return {usable: false, reason: 'PREMATCH_DECISION_AFTER_KICKOFF'};
    return classified.phase === 'PREMATCH' ? {usable: true, reason: null} : {usable: false, reason: `${classified.phase}_DATA_IN_PREMATCH_DECISION`};
  }
  if (decision === 'LIVE') {
    if (at < ko) return {usable: false, reason: 'LIVE_DECISION_BEFORE_KICKOFF'};
    return ['PREMATCH', 'LIVE'].includes(classified.phase) ? {usable: true, reason: null} : {usable: false, reason: 'POSTMATCH_DATA_IN_LIVE_DECISION'};
  }
  const end = ms(matchFinishedAt ?? null);
  if (end === null || end < ko) return {usable: false, reason: 'MATCH_END_UNKNOWN'};
  if (at < end) return {usable: false, reason: 'POSTMATCH_DECISION_BEFORE_MATCH_END'};
  return {usable: true, reason: null};
}

// Records a decision may use, with the count of each refusal reason, so that what was left out is visible.
export function usableRecords(classifiedList, options) {
  const usable = [];
  const refused = {};
  for (const record of classifiedList) {
    const r = usableAt(record, options);
    if (r.usable) usable.push(record); else refused[r.reason] = (refused[r.reason] ?? 0) + 1;
  }
  return {usable, refused};
}
