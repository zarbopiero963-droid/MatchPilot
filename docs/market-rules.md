# Market Rules Registry (#100) — MARKET-CORE-01/02

`src/markets/rules.mjs`, version 1. Pure and deterministic: the same input and rule version give the same resolution.

Covered (regular time, extra time and penalties excluded, per exchange football rules): MATCH_ODDS, DOUBLE_CHANCE,
OVER_UNDER (n+0.5 lines), BTTS, CORRECT_SCORE (exact score plus ANY_OTHER_HOME/AWAY/DRAW, with the listed grid as input),
HT_MATCH_ODDS, HT_OVER_UNDER, TEAM_GOALS_OVER_UNDER.

Not covered yet:
- MARKET-CORE-03: Asian handicap and goal lines, whole and quarter lines, partial and dead-heat settlement.
- MARKET-CORE-04: VOID, postponed, abandoned and corrections.
- Corners, cards and next goal (they need certified event inputs).

A match that is not FINISHED, or one with a missing score, is UNRESOLVED and must not be settled by #99. No persistence;
the frozen rule version will be stored with the trade once D13 allows persistence.
