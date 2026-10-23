// HIST-01a (MP-PIT-002, MP-PIT-003, MP-RPL-003): which odds observations the engine may use at the decision time of each
// event. The decision time is the kickoff minus the configured lead; the classification is the existing PIT policy
// (src/pit/policy.mjs, mp-pit-v1) with captured knowledge: a record is usable only when its acquisition is at or before
// the decision time. The provider time never replaces the acquisition time: a record acquired after the decision is
// not admissible even when the provider dates it earlier. Only PIT_VERIFIED records are admitted.
import {PIT_STATUS, classifyRecord} from '../pit/policy.mjs';

export const ADMISSION_VERSION = 'mp-hist-admission-1';

// Reasons an observation is not admitted, besides the PIT policy's own reasons and status.
export const EXCLUSION = Object.freeze({
  KICKOFF_UNKNOWN: 'KICKOFF_UNKNOWN',
  ACQUIRED_AFTER_DECISION: 'ACQUIRED_AFTER_DECISION',
  PROVIDER_TIME_AFTER_DECISION: 'PROVIDER_TIME_AFTER_DECISION',
});

export const decisionTimeOf = (kickoffUtc, leadMinutes) => (kickoffUtc
  ? new Date(Date.parse(kickoffUtc) - leadMinutes * 60000).toISOString()
  : null);

// One observation at its event's decision time: {admitted, reasons, pit}.
export function admitObservation(observation, event, leadMinutes) {
  const decisionTime = decisionTimeOf(event.kickoff_utc, leadMinutes);
  if (!decisionTime) return {admitted: false, reasons: [EXCLUSION.KICKOFF_UNKNOWN], pit: null};
  const extraReasons = observation.provider_time && Date.parse(observation.provider_time) > Date.parse(decisionTime)
    ? [EXCLUSION.PROVIDER_TIME_AFTER_DECISION] : [];
  const pit = classifyRecord({
    eventEarliest: event.kickoff_utc,
    providerTime: observation.provider_time,
    providerTimeUsed: false,
    acquisitionTime: observation.acquired_at,
    decisionTime,
    extraReasons,
  });
  const reasons = pit.status === PIT_STATUS.NOT_AVAILABLE ? [EXCLUSION.ACQUIRED_AFTER_DECISION, ...pit.reasons] : [...pit.reasons];
  return {admitted: pit.status === PIT_STATUS.VERIFIED, reasons, pit};
}
