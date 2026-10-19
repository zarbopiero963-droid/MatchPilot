# R-07a — local state preserved before QA-01

Owner decision MP-OWNER-QA-01-AUTHORIZATION, condition 1. R-07a (Match Center, pre-match analysis; #25, #30, QUERY-CORE-01) was paused on 19/10/2026 when MP-OWNER-BROWSER-QA-HARD-GATE-01 arrived. It resumes after the verified activation of the Browser QA Gate, and will be the first web PR to go through it.

**State: work in progress. It has never been pushed, run or reviewed.** The work was saved as local commit `474f59d` on top of `main` `56fe579`, never pushed, and exported as the patch [`R-07a-match-analysis.patch`](R-07a-match-analysis.patch), which applies cleanly to that base with `git apply`.

## What the patch contains

- `src/analysis/match-analysis.mjs` (new). Pre-match analysis of one stored match, computed by the server:
  - **Scope:** for each team and venue scope (home, away, both), windows of 5, 10 and 20 matches and the season.
  - **Matches used:** FINAL historical matches dated strictly before the match day. Same-day matches are excluded, because the provider time zone is undocumented.
  - **Figures:** win/draw/loss, goals, averages and rates in exact Decimal (HALF_EVEN), xG with its own N.
  - **Traceability:** per-family coverage and the source match ids for drill-down.
  - **Head to head:** included.
  - **PIT status:** labelled `PIT_NOT_VERIFIED` (date cutoff on current fact versions).
- `src/api/v1.mjs`. New endpoint `/api/v1/fpt/match-analysis?id=`.
- `test/match-analysis.test.mjs` (new). Covers:
  - exact window statistics;
  - id validation;
  - agreement with an independent SQL oracle;
  - no same-day or later match, checked by inserting such matches;
  - the v1 contract.

## Not done yet

- **Tests never run:** `test/match-analysis.test.mjs` has not been run. Its first run is part of R-07a Gate B.
- **No page:** the Match Center page (`#/match?id=`) is not written.
- **Not wired up:** no links from the Daily Board or search yet, no Browser QA journey, no docs and no mock update.
- **Out of R-07a:** charts (MP-WEB-008) and the finished-match page (MP-WEB-004) belong to R-07b.

## To resume

1. `git apply docs/governance/wip/R-07a-match-analysis.patch` on the current `main`, resolving any conflicts.
2. Run Gate A again against the requirements MP-WEB-003, MP-WEB-014 and MP-WEB-006.
3. Run the tests: `CI=1 npm test`.
4. Add the Match Center page and its journey in `tools/qa/journeys.mjs`.
5. Delete this folder in the R-07a PR.
