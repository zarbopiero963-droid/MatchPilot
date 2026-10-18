# Point-in-time policy `mp-pit-v1`

Issue: #31. Roadmap: R-08 (#97). Owner decision: `MP-OWNER-DECISIONS-D1-D9-20261018.D4`. Requirements: MP-PIT-001..005 in [`governance/mp-pr-00/requirements.json`](governance/mp-pr-00/requirements.json).

Code: [`src/pit/policy.mjs`](../src/pit/policy.mjs) (pure, no database, network or clock) and [`src/pit/readers.mjs`](../src/pit/readers.mjs) (applied to the readers). Tests: `test/pit-policy.test.mjs`, `test/pit-readers-postgres.test.mjs`, and the PIT checks in `test/fpt-assistant-queries.test.mjs` and `test/api-v1-contract.test.mjs`.

## The five timestamps

Every record that answers "what was known at T" carries `pit.times`:

| Field | Meaning |
|---|---|
| `event_time`, `event_time_earliest`, `event_time_latest` | when the real-world event happened. `event_time` is set only when it is known to the instant; otherwise only the interval is given. |
| `provider_time`, `provider_time_verified` | the time the provider declares for the record, in UTC, and whether that conversion is proven. |
| `acquisition_time` | when MatchPilot first stored the record. |
| `availability_time` | effective availability: the acquisition time, the only instant at which MatchPilot provably held the record. |
| `decision_time` | the simulated decision instant (`as_of`). |

A missing time stays `null` and is listed in `pit.missing`. It is never invented or repaired.

## Status of a record

- `NOT_AVAILABLE_AT_DECISION`: acquired after the decision time. With captured knowledge such a record is never returned (MP-PIT-002).
- `PIT_NOT_VERIFIED` (MP-PIT-003), with one or more `pit.reasons`:

  | Reason | Meaning |
  |---|---|
  | `ACQUISITION_TIME_MISSING` | the acquisition time is missing |
  | `DECISION_TIME_MISSING` | the decision time is missing |
  | `PROVIDER_TIME_MISSING` | the answer needs the provider time and it is missing |
  | `PROVIDER_TZ_NOT_VERIFIED`, `TZ_NOT_MEASURED`, `TZ_OFFSET_MISMATCH`, `TZ_MEASUREMENT_OUT_OF_WINDOW`, `TZ_MEASURED_AFTER_DECISION`, `TZ_DST_CHANGE_POSSIBLE`, `TZ_OFFSET_NO_IANA_ZONE` | the provider time is used but its UTC conversion is not proven |
  | `PROVIDER_TIME_AFTER_ACQUISITION` | the provider stamps the record more than 5 minutes after MatchPilot acquired it |
  | `EVENT_INTERVAL_INVERTED` | the event interval ends before it starts |
  | `EVENT_TIME_AMBIGUOUS_AT_DECISION` | the event's possible interval contains the decision instant: whether it had happened is unknown |
  | `MATCH_STATE_OBSERVED_AFTER_DECISION` | the stored TotalCorner match state (kickoff, teams, league, offset) was observed again after the decision time, so it may differ from the state known then |
- `PIT_VERIFIED`: none of the above.

## Label of an answer (MP-PIT-005)

`pit` on the answer, and `meta.pit` in API v1:

- `PIT_VERIFIED` only when the reader used captured knowledge and every record it used is `PIT_VERIFIED`. An empty answer at T (no record known yet) is `PIT_VERIFIED` with `records: 0`;
- otherwise `NON_PIT`, with `why` (`PROVIDER_KNOWLEDGE`, `RECORDS_NOT_PIT_VERIFIED`, `RECORDS_NOT_AVAILABLE_AT_DECISION`) and counts per status and reason.

`knowledge=provider` trusts provider times and is `NON_PIT` by construction. A `NON_PIT` answer must not feed certified backtest metrics (R-14).

## Time zones and daylight saving (MP-PIT-004)

- **Documented IANA zone:** `localToUtc` converts a local wall time. A time skipped by a DST change is `GAP`, a repeated one is `AMBIGUOUS` with both candidates. Neither is resolved by guessing. Impossible calendar values (30 February, 24:00) are `INVALID`.
- **Undocumented zone** (FutPythonTrader kickoff, `PROVIDER_TZ_UNDOCUMENTED`, #12): only the interval of every possible instant is known, between UTC−12 and UTC+14. A match date gives `[date 00:00 at UTC+14, date 23:59:59.999 at UTC−12]`.
- **Measured fixed offset** (TotalCorner, `tc_tz_observations`, gate `tc-tz-gate-v2`): a provider time converted with the match offset is verified only when all of the following hold:
  1. the match is linked to a `MEASURED` observation with the same offset;
  2. the measurement was taken at or before the decision time. A later cycle can still link the match to a newer measurement; the label then can only move from `PIT_VERIFIED` to `NON_PIT` (fail-safe);
  3. the time is within 30 days of the measurement;
  4. at least one IANA zone uses that offset, and every IANA zone that had it at the measurement still has it at that time.

  Example: UTC+2 measured on 08/10/2026 is consistent with Central European Summer Time, which ends on 25/10/2026, so any TotalCorner time after that date needs a new measurement. Historical bodies have no measurement (`tz_observation_id` NULL) and stay `TZ_NOT_MEASURED`.

## Applied readers

| Reader | Decision time | Records |
|---|---|---|
| `tcPrematchMatch` (`/api/tc/prematch/match`, `/api/v1/tc/prematch/match`) | `as_of`, default kickoff | the match identity (`match.pit`, acquired at `first_seen_at`; `PIT_NOT_VERIFIED` when `last_seen_at` is after the decision, because `tc_matches` keeps only the latest state) and every prematch row the summary uses, including `opening` and `last`. With captured knowledge, `snapshots` counts only snapshots taken by `as_of`, and the match fields observed later (`last_status`, `last_seen_at`) are `null` |
| FPT `teamMatchesAsOf` (`/api/fpt/team-matches-asof`, `/api/v1/fpt/team-matches-asof`) | `as_of` | every returned match version |

## Parameters chosen by the agent (PROPOSAL, versioned)

D4 requires an explicit, tested policy but does not fix these values. They are part of `mp-pit-v1`; changing any of them means a new policy version.

| Parameter | Value | Why |
|---|---|---|
| provider clock tolerance | 5 minutes | provider stamps slightly ahead of our fetch are clock skew, not later knowledge |
| validity of a measured offset | 30 days | an older measurement may predate a provider change |
| range of possible offsets | UTC−12 to UTC+14 | the IANA range |

## Limits

- Replay (R-09), statistics (R-12) and backtest (R-14) do not exist yet. They must build on these records, so MP-PIT-001, 002 and 005 stay NOT_VERIFIED until they do.
- The PIT label is in the API and not yet in a UI (R-05+).
- Version pinning of parser/schema/transform (MP-FPT-005) and cross-provider identity (MP-XPR-001/002) are later parts of R-08.
- FPT `teamMatchesAsOf` takes the payload from the version known at T, but candidate fields (phase, date, team names) come from the current facts table. Pinning them to T is part of MP-FPT-005.
- TotalCorner rows do not store the offset used to convert their provider time: the reader assumes the match offset (`tz_offset_minutes`), which the gate applied at acquisition.
- Without `as_of`, `tc/prematch/match` decides at the kickoff, itself a converted provider time.
- **TotalCorner match state:** `tc_matches` keeps only the latest state of each match, and an answer is PIT for it only when that state was last observed by the decision time. Making older decisions PIT needs a per-version history of the match state. That is a schema migration, which on an auto-deployed service would also write to the production database, so it requires owner authorisation (PROPOSAL).
