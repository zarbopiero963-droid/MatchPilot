// R-08 (#31): the PIT policy applied to the readers that answer "what was known at T".
import {analysisLabel, classifyRecord, measuredOffsetValidity, undocumentedDateInterval} from './policy.mjs';

// TotalCorner prematch rows. Provider times are provider-local converted with the match offset; the conversion is
// PIT-verified only while the match's persisted timezone measurement vouches for that offset at the row's time.
// `rows` are the rows the reader uses (already cut at kickoff and at the decision time).
export function classifyTcPrematchRows(rows, {match, observation, decisionTime, knowledge}) {
  const offset = Number(match?.tz_offset_minutes);
  const classified = rows.map(row => {
    let tz;
    if (!observation) tz = {verified: false, reason: 'TZ_NOT_MEASURED'};
    else if (Number(observation.offset_minutes) !== offset) tz = {verified: false, reason: 'TZ_OFFSET_MISMATCH'};
    else tz = measuredOffsetValidity({offsetMinutes: offset, observedAt: observation.observed_at, observationStatus: observation.status, at: row.provider_time_utc});
    const providerTime = row.provider_time_utc ?? null;
    return classifyRecord({
      // An odds movement happens when the provider stamps it; that instant is known only when its conversion is.
      eventEarliest: tz.verified ? providerTime : null,
      providerTime, providerTimeVerified: tz.verified, providerTimeReason: tz.reason, providerTimeUsed: true,
      acquisitionTime: row.first_acquired_at, decisionTime,
    });
  });
  return {classified, label: analysisLabel(classified, {knowledge, decisionTime})};
}

// node-postgres returns a DATE as a Date at local midnight; read it back with local fields, never through UTC.
function calendarDate(value) {
  if (!(value instanceof Date)) return String(value ?? '').slice(0, 10);
  const pad = n => String(n).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

// FutPythonTrader match versions. The kickoff time zone is undocumented (PROVIDER_TZ_UNDOCUMENTED, #12): the event is
// known only as the interval of its calendar date in every possible zone, and FPT declares no per-record time.
export function classifyFptVersions(rows, {decisionTime}) {
  const classified = rows.map(row => {
    const date = calendarDate(row.match_date);
    const interval = undocumentedDateInterval(date);
    return classifyRecord({
      eventEarliest: interval?.earliest ?? null, eventLatest: interval?.latest ?? null,
      providerTime: null, providerTimeUsed: false,
      acquisitionTime: row.acquired_at, decisionTime,
    });
  });
  return {classified, label: analysisLabel(classified, {knowledge: 'captured', decisionTime})};
}
