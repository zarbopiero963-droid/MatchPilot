# Exploratory Browser QA (QA-02, level B)

Owner decisions: MP-OWNER-BROWSER-QA-HARD-GATE-01 (level B), MP-OWNER-QA-VISUAL-EXECUTION-01, MP-OWNER-PRODUCT-QUALITY-DATA-01. The deterministic gate (level A) is in [browser-qa.md](browser-qa.md).

Level B has two parts, kept separate:

| Part | What | Where | Certifies |
|---|---|---|---|
| **Crawler** | `tools/qa/explore.mjs`, seeded, deterministic | CI job `Exploratory QA` (informational) and locally | that the site survives reproducible random use without generic defects |
| **AI review** | a Claude agent reads the crawler bundle and judges what a user sees | an authorized Claude Code session only; **no paid AI API in CI** | nothing by itself: its output is verified by `verify-exploration.mjs --review` |

The crawler alone is **not** an exploratory AI agent and is never declared one.

## Crawler

`node tools/qa/explore.mjs --out <dir> [--seed N] [--actions N] [--viewports desktop,mobile]` (`npm run qa:explore`):
1. starts the same environment as the gate (real server, throwaway PostgreSQL schema, QA archive through the real ingestion path, real Chromium);
2. discovers the routes (the menu, plus the Daily Board on the busy day and a search with results);
3. on every route and viewport performs N actions chosen by a seeded PRNG among the visible controls: links, buttons, selects, checkboxes, text, date and number fields (with edge values: empty, long, markup, quotes, emoji, out-of-range dates and numbers), back and reload;
4. after every action waits until no request has been in flight for 300 ms (a hash route changes without a page load) and checks: JavaScript errors, console errors (except the browser's line for a refused 4xx input), HTTP 5xx, failed requests, a view stuck loading, a blank view, and the gate's page invariants (raw values, overflow, basic accessibility, clipped text, overlapping controls);
5. replays every finding's action sequence in a fresh browser context and marks it `reproduced` only when the same problem appears again;
6. records observations for the AI review: screenshot, accessibility snapshot and visible text of every route and viewport, when it opens and after the actions;
7. writes `exploration.json` (schema `mp-browser-explore-v1`) with the trails (SHA-256 of each route's action sequence), totals, findings with their steps, observations and the SHA-256 of every file. Exit 1 when a reproduced finding exists.

Determinism: the same seed on the same site gives the same trails (`test/explore.test.mjs`). A different seed explores differently. A route the explorer leaves (history before the first page) restarts without a check.

`node tools/qa/verify-exploration.mjs <dir> --head <PR head> --commit <checked-out commit>` accepts the bundle only when it is for that head and commit, unmodified and complete (manifest rules shared with the gate verifier), with no test hook, every finding replayable with a screenshot and a reproduction result, every trail hashed with its observations, and totals that match.

## AI review procedure

Who: a Claude agent in a Claude Code session the owner authorized. Never a paid AI API, never a CI step.

1. Get the bundle: the CI artifact `browser-exploration-<head>` of the PR head, or a local run on the same commit.
2. Verify it first: `node tools/qa/verify-exploration.mjs <dir> --head <head> --commit <commit>` must say `ok: true`.
3. Read every observation (screenshot, accessibility snapshot, text) on desktop and mobile, as a user would. Look for what the crawler cannot judge: wrong or contradictory values, unclear states, unreadable layout, missing feedback after an action, labels not in Italian, times and odds formatted against D-3/D-7, anything against the approved mockup (#103).
4. Triage every reproduced crawler finding, and add your own findings with `source: "ai"`.
5. Write `ai-review.json` **outside** the bundle directory:

```json
{
  "schema": "mp-browser-ai-review-v1",
  "head_sha": "<PR head>",
  "exploration_sha256": "<sha256 of exploration.json>",
  "reviewer": {"kind": "claude-code-session", "session": "<session link>"},
  "reviewed_at": "<date -u>",
  "observations_reviewed": ["observations/01-desktop-open.json", "..."],
  "observations_not_reviewed": {"observations/…json": "reason"},
  "findings": [
    {"id": "AI-1", "source": "ai", "classification": "BUG", "severity": "P3", "status": "OPEN",
     "summary": "…", "evidence": ["observations/05-mobile-end.png"], "regression_test": null}
  ],
  "verdict": "NO_BLOCKING"
}
```

6. Verify it: `node tools/qa/verify-exploration.mjs <dir> --head <head> --review ai-review.json`. The review is refused when it names another bundle or head, skips an observation without a reason, leaves a reproduced crawler finding untriaged, uses a classification outside BUG, DATA_MISSING, DATA_QUALITY_ISSUE, NOT_VERIFIED, BLOCKED, NOT_A_DEFECT (the last with a reason), gives a BUG no severity P0–P3, marks a finding FIXED without naming its regression test, cites evidence outside the bundle, carries a secret-like value, or declares a verdict different from the computed one (BLOCKING when an open P0/P1 BUG exists).
7. Publish the outcome in the PR (or the issue) with the verifier's output. Every confirmed BUG becomes a regression test (a journey step or a unit test), RED before the fix and GREEN after; open P0/P1 block the merge; P2/P3 may be deferred with reason, impact and follow-up.

## Limits

- **Not a merge gate:** `Exploratory QA` is informational and not part of `CI gate`; level A stays the hard gate. A reproduced finding fails that job and must be triaged before the merge.
- **The AI review is evidence about one bundle, not a certification of the agent.** Whether the AI exploratory agent is reliable is evaluated separately in QA-03; until then its status is NOT VERIFIED.
- **Scope:** the hash routes of the site; `/coverage` and `/login` are out of scope. Generic properties only: whether a value is right is the review's job and, for the API, the journeys'.
- **Data:** the QA archive fixture, not production data.
- **Cost:** none. Same runner, browser and PostgreSQL service as the gate; artifacts with 14-day retention.
