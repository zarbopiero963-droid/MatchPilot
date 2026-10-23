# Market Rules Registry (#100) — MARKET-CORE-01/02/04

`src/markets/rules.mjs`, version 2 (v1 was never persisted). Pure and deterministic: the same input and rule version give the same resolution.

Covered (internal rules on the validated final score from FutPythonTrader or TotalCorner; penalties excluded): MATCH_ODDS, DOUBLE_CHANCE,
OVER_UNDER (n+0.5 lines), BTTS, CORRECT_SCORE (exact score plus ANY_OTHER_HOME/AWAY/DRAW, with the listed grid as input),
HT_MATCH_ODDS, HT_OVER_UNDER, TEAM_GOALS_OVER_UNDER.

Not covered yet:
- MARKET-CORE-03: Asian handicap and goal lines, whole and quarter lines, partial and dead-heat settlement.
- Corners, cards and next goal (they need certified event inputs).

A match that is not FINISHED (postponed, abandoned, cancelled), or one with a missing score, is UNRESOLVED and must not
be settled by #99.

MARKET-CORE-04 (owner rectification: outcomes from MatchPilot's two football APIs only, no exchange, bookmaker or
external settlement):
- Inputs: `src/markets/outcomes.mjs` adapters. FutPythonTrader has no status field: MatchPilot's derived `FINAL` with both
  `Home_Score`/`Away_Score` is a final; `NO_RESULT`/`NOT_STARTED` are not; no half-time score, so HT markets stay
  UNRESOLVED. TotalCorner: only the provider status `full` with `hg`/`ag` is a final; `FT` is written by MatchPilot's
  terminal capture and is not accepted. Versions of different providers are never mixed (`MIXED_PROVIDERS`).
- Non-final matches (postponed, suspended, cancelled, unknown) and missing or contradictory data are UNRESOLVED, with no
  time window (DEC-015). No internal VOID rule is approved: the resolvers never return VOID (OWNER DECISION REQUIRED).
- Corrections (DEC-002): the outcome used is the latest validated FINAL version available at run time (`asOf`); the
  resolution records `provider`, `outcome_version`, `provenance` and `correction_timestamp`, sets `corrected` when the
  score differs from the first validated FINAL, with the first-FINAL outcome and `outcome_changed`. Two different
  records with the same version number fail closed. Settled positions are corrected by #99 (`correctSettlement`); the MM
  sequence records the correction without advancing again (DEC-013).
- Extra time: the rules settle on the provider's final score; whether FPT/TC include extra time in cup ties is not
  documented (OWNER DECISION REQUIRED before cup matches are certified).
