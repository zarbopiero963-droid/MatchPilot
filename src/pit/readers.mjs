// R-08 (#31): the PIT policy applied to the readers that answer "what was known at T".
import {analysisLabel, classifyRecord, measuredOffsetValidity, undocumentedDateInterval} from './policy.mjs';

// TotalCorner prematch rows. Provider times are provider-local converted with the match offset; the conversion is
// PIT-verified only while the match's persisted timezone measurement vouches for that offset at the row's time.
// `rows` are the rows the reader uses (already cut at kickoff and at the decision time).
export function classifyTcPrematchRows(rows, {match, observation, decisionTime, knowledge}) {
  const offset = Number(match?.tz_offset_minutes);
  const decision = decisionTime ? new Date(decisionTime) : null;
  const classified = rows.map(row => {
    let tz;
    if (!observation) tz = {verified: false, reason: 'TZ_NOT_MEASURED'};
    else if (Number(observation.offset_minutes) !== offset) tz = {verified: false, reason: 'TZ_OFFSET_MISMATCH'};
    // The evidence for the conversion must itself be known at the decision time, so a replay's label cannot change later.
    else if (decision && new Date(observation.observed_at) > decision) tz = {verified: false, reason: 'TZ_MEASURED_AFTER_DECISION'};
    else tz = measuredOffsetValidity({offsetMinutes: offset, observedAt: observation.observed_at, observationStatus: observation.status, at: row.provider_time_utc});
    const providerTime = row.provider_time_utc ?? null;
    return classifyRecord({
      // An odds movement happens when the provider stamps it; that instant is known only when its conversion is.
      eventEarliest: tz.verified ? providerTime : null,
      providerTime, providerTimeVerified: tz.verified, providerTimeReason: tz.reason, providerTimeUsed: true,
      acquisitionTime: row.first_acquired_at, decisionTime,
    });
  });
  // The match identity (teams, kickoff, offset) is itself a record: unknown at T when MatchPilot first saw the match
  // later. tc_matches keeps only the latest state, so when it was observed again after T the state shown may not be the
  // one known at T: not PIT-verified (a per-version history needs a migration, see docs/pit-policy.md).
  const lastSeen = match?.last_seen_at ? new Date(match.last_seen_at) : null;
  const matchRecord = classifyRecord({acquisitionTime: match?.first_seen_at, decisionTime,
    extraReasons: !lastSeen || !decision || lastSeen > decision ? ['MATCH_STATE_OBSERVED_AFTER_DECISION'] : []});
  return {classified, matchRecord, label: analysisLabel([matchRecord, ...classified], {knowledge, decisionTime})};
}

// node-postgres returns a DATE as a Date at local midnight; read it back with local fields, never through UTC.
function calendarDate(value) {
  if (!(value instanceof Date)) return String(value ?? '').slice(0, 10);
  const pad = n => String(n).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

// FutPythonTrader match versions. The kickoff time zone is undocumented (PROVIDER_TZ_UNDOCUMENTED, #12): the event is
// known only as the interval of its calendar date in every possible zone, and FPT declares no per-record time.
// The candidate set comes from the current facts: a row whose match changed after T, or matches that named the team at T
// but no longer link it (`omitted`), mean the answer may differ from what was known at T.
export function classifyFptVersions(rows, {decisionTime, omitted = 0}) {
  const classified = rows.map(row => {
    // The event date is the one the version known at T declares, not the current one.
    const date = calendarDate(row.known_match_date ?? row.match_date);
    const interval = undocumentedDateInterval(date);
    return classifyRecord({
      eventEarliest: interval?.earliest ?? null, eventLatest: interval?.latest ?? null,
      providerTime: null, providerTimeUsed: false,
      acquisitionTime: row.acquired_at, decisionTime,
      extraReasons: row.changed_after_as_of ? ['FACTS_CHANGED_AFTER_DECISION'] : [],
    });
  });
  const label = {...analysisLabel(classified, {knowledge: 'captured', decisionTime}), omitted};
  if (omitted > 0) {
    label.label = 'NON_PIT';
    label.why.push('MATCHES_OMITTED_BY_LATER_FACTS');
  }
  return {classified, label};
}
