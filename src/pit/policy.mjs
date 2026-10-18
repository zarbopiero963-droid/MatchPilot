// R-08 (#31, owner decision D4): point-in-time policy. Every record used to answer "what was known at T" carries five
// separate timestamps; it is PIT_VERIFIED only when its availability at the decision time is provable, and no time is
// ever invented. Pure module: no database, no network, no clock (the caller passes every instant).

export const PIT_POLICY_VERSION = 'mp-pit-v1';

export const PIT_STATUS = {VERIFIED: 'PIT_VERIFIED', NOT_VERIFIED: 'PIT_NOT_VERIFIED', NOT_AVAILABLE: 'NOT_AVAILABLE_AT_DECISION'};
export const ANALYSIS_LABEL = {PIT: 'PIT_VERIFIED', NON_PIT: 'NON_PIT'};

// A provider may stamp a row slightly after we fetched it (clock skew); beyond this the record is inconsistent.
export const PROVIDER_CLOCK_TOLERANCE_MS = 5 * 60_000;

// A measured fixed offset proves the provider's offset only near its measurement: an older one may predate a provider
// change. Beyond this window, or across a daylight-saving change of any zone consistent with the measurement, the
// conversion is not PIT-verified.
export const OFFSET_VALIDITY_MS = 30 * 86_400_000;

// UTC offsets in force anywhere (IANA range); a local wall time with an undocumented zone lies within these bounds.
export const MIN_OFFSET_MINUTES = -12 * 60;
export const MAX_OFFSET_MINUTES = 14 * 60;

const toDate = value => {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};
const iso = date => (date ? date.toISOString() : null);

// ---- Time zones ----

const formatters = new Map();
function formatter(zone) {
  if (!formatters.has(zone)) {
    formatters.set(zone, new Intl.DateTimeFormat('en-US', {timeZone: zone, timeZoneName: 'longOffset', year: 'numeric'}));
  }
  return formatters.get(zone);
}

// UTC offset of an IANA zone at an instant, in minutes (e.g. Europe/Rome in July: 120).
export function zoneOffsetMinutes(zone, instant) {
  const name = formatter(zone).formatToParts(instant).find(part => part.type === 'timeZoneName')?.value ?? '';
  const match = /^GMT(?:([+-])(\d{2}):?(\d{2})(?::?(\d{2}))?)?$/.exec(name);
  if (!match) throw new Error(`cannot read the offset of ${zone}`);
  if (!match[1]) return 0;
  return (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3]) + Number(match[4] ?? 0) / 60);
}

const LOCAL = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/;

function parseLocal(text) {
  const match = LOCAL.exec(String(text ?? '').trim());
  if (!match) return null;
  const [y, mo, d, h, mi, s] = match.slice(1).map(part => Number(part ?? 0));
  const asUtc = Date.UTC(y, mo - 1, d, h, mi, s);
  const check = new Date(asUtc);
  // Reject impossible calendar values instead of letting Date roll them over (2026-02-30, 24:00).
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d || check.getUTCHours() !== h || check.getUTCMinutes() !== mi) return null;
  return asUtc;
}

// Local wall time in a documented IANA zone -> UTC. A wall time skipped by a DST change (GAP) or repeated by it
// (AMBIGUOUS) has no single instant: it is reported, never resolved by guessing.
export function localToUtc(localText, zone) {
  const wall = parseLocal(localText);
  if (wall === null) return {status: 'INVALID', utc: null, candidates: []};
  const candidates = new Set();
  // The offset at the true instant is one of the offsets in force within a day of the wall time.
  for (const probe of [wall - 86_400_000, wall, wall + 86_400_000]) {
    const offset = zoneOffsetMinutes(zone, new Date(probe));
    const instant = wall - offset * 60_000;
    if (zoneOffsetMinutes(zone, new Date(instant)) === offset) candidates.add(instant);
  }
  const sorted = [...candidates].sort((a, b) => a - b).map(t => new Date(t));
  if (sorted.length === 0) return {status: 'GAP', utc: null, candidates: []};
  if (sorted.length > 1) return {status: 'AMBIGUOUS', utc: null, candidates: sorted.map(iso)};
  return {status: 'OK', utc: sorted[0], candidates: [iso(sorted[0])]};
}

// A local wall time whose zone is not documented: only the interval of every possible instant is known.
export function undocumentedLocalInterval(localText) {
  const wall = parseLocal(localText);
  if (wall === null) return null;
  return {earliest: new Date(wall - MAX_OFFSET_MINUTES * 60_000), latest: new Date(wall - MIN_OFFSET_MINUTES * 60_000)};
}

// A calendar date whose zone is not documented: from its first possible instant to its last.
export function undocumentedDateInterval(dateText) {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(dateText ?? '')) ? parseLocal(`${dateText} 00:00`) : null;
  if (day === null) return null;
  return {earliest: new Date(day - MAX_OFFSET_MINUTES * 60_000), latest: new Date(day + 86_400_000 - 1 - MIN_OFFSET_MINUTES * 60_000)};
}

let zoneList;
const allZones = () => (zoneList ??= Intl.supportedValuesOf('timeZone'));
const consistentZones = new Map();

// Is a fixed provider offset, measured at `observedAt`, still provably the provider's offset at `at`?
// Verified only when the measurement is MEASURED, within OFFSET_VALIDITY_MS of `at`, and every IANA zone with that
// offset at `observedAt` still has it at `at` (no zone consistent with the measurement changed offset in between).
export function measuredOffsetValidity({offsetMinutes, observedAt, observationStatus, at}) {
  const observed = toDate(observedAt);
  const instant = toDate(at);
  if (observationStatus !== 'MEASURED' || !Number.isFinite(offsetMinutes) || !observed) return {verified: false, reason: 'TZ_NOT_MEASURED'};
  if (!instant) return {verified: false, reason: 'TIME_MISSING'};
  if (Math.abs(instant - observed) > OFFSET_VALIDITY_MS) return {verified: false, reason: 'TZ_MEASUREMENT_OUT_OF_WINDOW'};
  const key = `${offsetMinutes}|${observed.getTime()}`;
  if (!consistentZones.has(key)) {
    if (consistentZones.size >= 1000) consistentZones.clear();
    consistentZones.set(key, allZones().filter(zone => zoneOffsetMinutes(zone, observed) === offsetMinutes));
  }
  const consistent = consistentZones.get(key);
  const changed = consistent.filter(zone => zoneOffsetMinutes(zone, instant) !== offsetMinutes);
  if (changed.length) return {verified: false, reason: 'TZ_DST_CHANGE_POSSIBLE', zones_changed: changed.length, zones_consistent: consistent.length};
  // An offset no IANA zone uses cannot be checked for DST changes: it is not verified.
  if (!consistent.length) return {verified: false, reason: 'TZ_OFFSET_NO_IANA_ZONE', zones_consistent: 0};
  return {verified: true, reason: 'TZ_OFFSET_STABLE', zones_consistent: consistent.length};
}

// ---- Records ----

// Inputs (all optional, all instants as Date or ISO strings):
//   eventEarliest / eventLatest  when the real-world event happened (equal when known to the instant)
//   providerTime                 the time the provider declares for the record, already in UTC
//   providerTimeVerified         whether that UTC conversion is proven (false: time zone not verified)
//   providerTimeUsed             whether the answer depends on providerTime (ordering, cutoffs)
//   acquisitionTime              when MatchPilot first stored the record
//   decisionTime                 the simulated decision instant
// Effective availability is the acquisition time: the only instant at which MatchPilot provably held the record.
export function classifyRecord(input) {
  const eventEarliest = toDate(input.eventEarliest);
  const eventLatest = toDate(input.eventLatest ?? input.eventEarliest);
  const providerTime = toDate(input.providerTime);
  const acquisition = toDate(input.acquisitionTime);
  const decision = toDate(input.decisionTime);
  const reasons = [];
  const missing = [];
  if (!eventEarliest) missing.push('event_time');
  if (!providerTime) missing.push('provider_time');
  if (!acquisition) missing.push('acquisition_time');
  if (!decision) missing.push('decision_time');

  let status = PIT_STATUS.VERIFIED;
  if (!acquisition) reasons.push('ACQUISITION_TIME_MISSING');
  if (!decision) reasons.push('DECISION_TIME_MISSING');
  if (acquisition && decision && acquisition > decision) status = PIT_STATUS.NOT_AVAILABLE;
  if (input.providerTimeUsed && !providerTime) reasons.push('PROVIDER_TIME_MISSING');
  if (input.providerTimeUsed && providerTime && input.providerTimeVerified !== true) reasons.push(input.providerTimeReason ?? 'PROVIDER_TZ_NOT_VERIFIED');
  if (providerTime && acquisition && providerTime.getTime() > acquisition.getTime() + PROVIDER_CLOCK_TOLERANCE_MS) reasons.push('PROVIDER_TIME_AFTER_ACQUISITION');
  if (eventEarliest && eventLatest && eventEarliest > eventLatest) reasons.push('EVENT_INTERVAL_INVERTED');
  // An uncertain event time matters only when the uncertainty straddles the decision instant.
  if (eventEarliest && eventLatest && decision && eventEarliest <= decision && eventLatest > decision) reasons.push('EVENT_TIME_AMBIGUOUS_AT_DECISION');
  if (status === PIT_STATUS.VERIFIED && reasons.length) status = PIT_STATUS.NOT_VERIFIED;

  const exact = eventEarliest && eventLatest && eventEarliest.getTime() === eventLatest.getTime();
  return {
    policy_version: PIT_POLICY_VERSION,
    status,
    reasons,
    missing,
    times: {
      event_time: exact ? iso(eventEarliest) : null,
      event_time_earliest: iso(eventEarliest),
      event_time_latest: iso(eventLatest),
      provider_time: iso(providerTime),
      provider_time_verified: providerTime ? input.providerTimeVerified === true : null,
      acquisition_time: iso(acquisition),
      availability_time: iso(acquisition),
      decision_time: iso(decision),
    },
  };
}

// Records knowable at the decision time; records acquired later never pass (MP-PIT-002).
export const availableAt = classified => classified.filter(record => record.status !== PIT_STATUS.NOT_AVAILABLE);

// Label of an analysis built from classified records: PIT only when every record is PIT_VERIFIED and the reader used
// captured knowledge. `knowledge: 'provider'` trusts provider times and is NON_PIT by construction (MP-PIT-005).
export function analysisLabel(classified, {knowledge = 'captured', decisionTime = null} = {}) {
  const counts = {[PIT_STATUS.VERIFIED]: 0, [PIT_STATUS.NOT_VERIFIED]: 0, [PIT_STATUS.NOT_AVAILABLE]: 0};
  const reasons = {};
  for (const record of classified) {
    counts[record.status]++;
    for (const reason of record.reasons) reasons[reason] = (reasons[reason] ?? 0) + 1;
  }
  const why = [];
  if (knowledge !== 'captured') why.push('PROVIDER_KNOWLEDGE');
  if (counts[PIT_STATUS.NOT_VERIFIED]) why.push('RECORDS_NOT_PIT_VERIFIED');
  if (counts[PIT_STATUS.NOT_AVAILABLE]) why.push('RECORDS_NOT_AVAILABLE_AT_DECISION');
  return {
    policy_version: PIT_POLICY_VERSION,
    label: why.length ? ANALYSIS_LABEL.NON_PIT : ANALYSIS_LABEL.PIT,
    why,
    knowledge,
    decision_time: iso(toDate(decisionTime)),
    records: classified.length,
    verified: counts[PIT_STATUS.VERIFIED],
    not_verified: counts[PIT_STATUS.NOT_VERIFIED],
    not_available: counts[PIT_STATUS.NOT_AVAILABLE],
    reasons,
  };
}
