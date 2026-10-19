# Browser QA certification (QA-03)

Owner decisions: MP-OWNER-BROWSER-QA-HARD-GATE-01, MP-OWNER-QA-VISUAL-EXECUTION-01, MP-OWNER-CI-GATE-REQUIRED-CHECK-CONFIRMED. Procedures: [browser-qa.md](browser-qa.md) (level A, the gate) and [exploratory.md](exploratory.md) (level B).

**Rule:** a capability is HARD CERTIFIED only when it was demonstrated end to end on a real PR or a real run, with evidence that can be checked again. Otherwise it is CERTIFIED (proved by automated tests in CI on every web change), or NOT VERIFIED.

## Two separate certifications

| | Deterministic Browser QA (level A, rows 1–14) | AI exploratory review (level B, rows 15–16) |
|---|---|---|
| What it is | scripted journeys, page invariants, seeded crawler; same input, same result | a Claude agent in an authorized session reading a crawler bundle against the product rules |
| Where it runs | CI on every web change | authorized sessions only, never CI, never a paid API |
| Merge effect | **blocking**: `Browser QA` → `CI gate` (required check) | **none**: informational; not a gate |
| Certification | **HARD CERTIFIED** for the demonstrated capabilities (gate, CI gate linkage, merge block, RED→GREEN, evidence) | **CERTIFIED** only for the four seeded classes of the blind evaluation; agent reliability beyond them NOT VERIFIED |

One never stands in for the other: a green AI review does not replace the gate, and a green gate says nothing about what only the review can see.

## Matrix

| # | Capability | Status | Evidence |
|---|---|---|---|
| 1 | Real site start (server, throwaway PostgreSQL, QA archive through the real ingestion path) | **HARD CERTIFIED** | every Browser QA run; PR #166 runs 39273440194 and 39273942757 |
| 2 | Real Chromium, desktop and mobile, every required journey | **HARD CERTIFIED** | same runs, 10 journeys × viewport |
| 3 | Screenshots and Playwright traces kept per step and journey | **HARD CERTIFIED** | artifact `browser-qa-61ddc17…` (id 12197460041, 21 files) and `browser-qa-e761a29…` |
| 4 | Controlled injected defect detected by the gate | **HARD CERTIFIED** | PR #166, commit `61ddc17`: missing values rendered raw; Browser QA FAIL 0/10 ("raw value shown: null", providers "N/D" missing) |
| 5 | Same defect reproduced outside CI | **HARD CERTIFIED** | local run on `61ddc17`: runner exit 1, 10/10 FAIL; verifier refuses the evidence |
| 6 | Fix RED → GREEN, merge unblocked | **HARD CERTIFIED** | commit `e761a29` (revert, `src/` identical to before): Browser QA PASS 10/10 locally (verifier ok) and in CI run 39273942757, where every job and `CI gate` succeeded (check run 118134198286); PR `mergeable_state: "clean"` |
| 7 | Browser QA failure → CI gate failure, on its own | **HARD CERTIFIED** | run 39292673549 on `0137ec3`: only `Browser QA` failed (Fast checks and PostgreSQL suite success); `CI gate` failure with the single line `FAIL browser_qa` (check run 118197808532); PR `blocked`. The gate script reports every check (`test/governance-ci-gate.test.mjs`) |
| 8 | CI gate failure → merge blocked by GitHub | **HARD CERTIFIED** | PR #166 on head `61ddc17`, ready for review: `mergeable_state: "blocked"`; ruleset "MatchPilot main protection" (owner verified: PR required, required check `CI gate`, up-to-date branch, empty bypass list, force push blocked). No merge was attempted on the defective head, on purpose |
| 9 | CI gate fails closed when a dependency job is cancelled | **HARD CERTIFIED** | run 39273399334 on `eaab7b0`, superseded by a push: jobs cancelled → `CI gate` failure |
| 10 | Merge gate refuses a red Browser QA | **HARD CERTIFIED** | `node tools/governance/cli.mjs merge-gate` on the `61ddc17` facts: `allowed: false` ("browser QA is FAIL", "not verified", …) |
| 11 | Refusal of an absent, altered, other-head or other-commit report, modified tree, hidden failure, test hook | CERTIFIED | `test/browser-qa-gate.test.mjs` (11 tests) in the PostgreSQL suite of every web change |
| 12 | Same refusals for the exploration bundle and the AI review | CERTIFIED | `test/explore.test.mjs` |
| 13 | Autonomous navigation and interaction (seeded crawler) | **HARD CERTIFIED** | `Exploratory QA` on PRs #165/#166/#167 (420 actions, 7 routes, desktop and mobile), bundle verified in CI |
| 13b | Crawler findings reproduced in a fresh context | CERTIFIED | injected JS defect found and replayed (`test/explore.test.mjs`); never exercised on a real PR, since no real defect has been found |
| 14 | Crawler determinism | CERTIFIED | same seed → same trails (`test/explore.test.mjs`) |
| 15 | AI exploratory review detects the four seeded classes on a single bundle (Claude, authorized session) | CERTIFIED (blind run 2 below); the agent as a whole NOT VERIFIED; not a merge gate | blind evaluation below |
| 16 | Exploratory triage enforced before merge | NOT VERIFIED | not wired into `CI gate` or `merge-gate` (see Limits) |

## Demonstration on PR #166 (19/10/2026, UTC)

**Round 1** (`61ddc17`): the defect was caught by Browser QA and by the PostgreSQL suite together, so it did not isolate the Browser QA → CI gate link. That is review D2 B-1; round 2 below isolates it.


1. `eaab7b0`: QA-03 tools; run superseded by the next push (matrix row 9).
2. `61ddc17` (14:56:04): **CONTROLLED DEFECT**, `formatScalar` no longer renders N/D for a missing value.
   - CI run 39273440194: `Browser QA` failure, verifier `verdict: FAIL`, 0/10, artifact 12197460041; `PostgreSQL integration suite` failure (the web E2E test sees it too); `CI gate` failure.
   - PR marked ready for review: `mergeable_state: "blocked"` (14:59).
   - Local reproduction (14:56:17): runner exit 1, all ten journeys `raw value shown: "null"` or `Ultimo backfill N/D` missing.
   - `merge-gate` on those facts: `allowed: false`.
3. `e761a29` (14:59:22): revert. Local Browser QA PASS 10/10, verifier ok (14:59:57). CI run 39273942757: every job green, `CI gate` success at 15:01:24; PR `mergeable_state: "clean"`.

**Round 2** (isolated; evidence in [`QA-03-BROWSER-QA-CERTIFICATION-R2`](../audits/QA-03-BROWSER-QA-CERTIFICATION-R2/README.md)):
1. **Gap found first.** An untranslated menu label passed every journey: the navigation journey checked only the page title. `373537d` adds the label check (RED with the defect, GREEN without).
2. **`aba64fa`, green baseline** (run 39292006235). The new gate log prints `PASS` for every check.
3. **`0137ec3` (17:16:12), CONTROLLED DEFECT 2:** the menu label becomes "Data providers".
   - **CI** (run 39292673549):
     - Fast checks: success.
     - PostgreSQL suite: success.
     - Browser QA: failure (general-navigation desktop and mobile; 8/10 passed; artifact 12207071161).
     - Exploratory QA: success.
     - `CI gate`: failure. Log: `FAIL browser_qa: failure (expected success)`, every other check `PASS`.
     - PR: `mergeable_state: "blocked"`.
   - **Local reproduction:** runner exit 1, the verifier refuses, web E2E 4/4 pass.
4. **`04016de` (17:20:24), fix** (tree identical to `aba64fa`): run 39293271271 all green, `CI gate` success, PR `clean`. Local Browser QA PASS 10/10.

Neither defect reaches `main`: the PR is squash-merged from its final state, and `src/` at the head equals `main`.

## AI exploratory agent: blind evaluation

**Question:** does the AI review (level B) find defects the crawler cannot see, without inventing them where they are absent?

**Method** (`tools/qa/ai-eval-seeds.mjs`):
1. Two bundles on the same commit `82ad736`, seed 1, 30 actions per route, 7 routes, desktop and mobile:
   - one clean;
   - one with four semantic defects injected in the page.
2. The crawler reports **0 findings on both**: these defects are outside its reach.
3. The bundles were blinded: anonymous names, and `injected_defect` cleared in the copies. Nothing else changed.

**Evidence** (MP-OWNER-PERMANENT-EVIDENCE-01):
- **Run 1:** [`docs/audits/QA-03-BROWSER-QA-CERTIFICATION/`](../audits/QA-03-BROWSER-QA-CERTIFICATION/README.md) holds the reviews, bundles, key and the round 1 demo. The full package (blinded bundles, unblinded originals, seed script, local runs) is in `evidence/audits` @ `50dc711`.
- **Run 2 and the isolated demo:** [`docs/audits/QA-03-BROWSER-QA-CERTIFICATION-R2/`](../audits/QA-03-BROWSER-QA-CERTIFICATION-R2/README.md) holds the reviews, scoring and runs. The full package (crops, prompt, key, local runs) is in `evidence/audits` @ `d589a02`.
- **Read-back:** both packages were read back from GitHub and verified.

**Run 1 — not valid as a blind test (PR #166 review B-2).**
- One reviewer received both bundles. It compared them and found the seeded defects as the differences between the two.
- Its prompt also listed the rule families the seeds were drawn from.
- Its 4/4 is kept in the evidence but proves nothing about single-bundle detection.

**Run 2 — the evaluation that counts.**
- **Reviewers:** two fresh Claude agents, one bundle each (`rv-k3` seeded, `rv-p8` clean; neither knew which).
- **Prompt:** identical and neutral: follow [exploratory.md](exploratory.md) on this bundle. It names no defect.
- **Access:** only their bundle, `exploratory.md`, the owner decisions, AGENTS.md, the mockup and `src/`. Forbidden: other folders, `docs/audits`, this file, `tools/`, `test/` and git history.
- **Coverage:** each viewed all 28 observations and all 28 screenshots, in crops for tall pages: 74 and 46 image views.
- **Verification:** both reviews pass `verify-exploration.mjs --review`.
- **Limit:** `src/` shows the intended behaviour (comma format, N/D, the Italian label), so a reviewer could compare the screenshots with the code. The procedure allows it: the reviewer judges against the product, as it would on a real PR.
- **Working-tree slip:** while the reviewers ran, the agent's working tree briefly carried an uncommitted test label ("Data providers" in the menu). The seeded reviewer saw it while reading `src/`. It is unrelated to the four seeds and not part of any finding scored below.

| Seeded defect | Rule | Seeded bundle (rv-k3) | Clean bundle (rv-p8) |
|---|---|---|---|
| S1 odds with a decimal point | D-3 | found, AI-4 BUG P2 | not reported (correct) |
| S2 missing data shown as 0 | MP-OWNER-PRODUCT-QUALITY-DATA-01 | found, AI-1 BUG **P1** and AI-2 BUG P2 | not reported (correct) |
| S3 English button label | Italian labels | found, AI-5 BUG P3 | not reported (correct) |
| S4 board heading names the day before | chosen day | found, AI-3 BUG P2 | not reported (correct) |

**Result of run 2:**
- **Recall:** 4/4 on the seeded bundle, each reviewer seeing one bundle only.
- **False positives:** none of the four classes reported on the clean bundle.
- **Verdicts:** BLOCKING on the seeded bundle (S2 as P1), NO_BLOCKING on the clean one.
- **Severity:** lower than in run 1. Only the missing-data rule was judged blocking, which shows the review's severity is not calibrated beyond that.

**Real findings on the clean bundle** (run 2, and the same in run 1). They are not seeded and are now product backlog:
- deep provider values wrapping a few characters per line on desktop: the audit's A-2, confirmed;
- "generato" timestamps as raw UTC (D-7);
- untranslated labels and raw codes (`PROVIDER_TZ_UNDOCUMENTED`, `FINAL`, `KEPT`, …);
- mobile tables cut without a scroll cue;
- same-day matches in search not in time order;
- "Favorito N/D N/D" repeated;
- "Successore N/D" for kept routes;
- the home page is the Dashboard, not Oggi / Daily Board (D-2);
- data-health panels that contradict themselves ("Stato ok" next to listed issues).

**Missed:** the audit's A-1 (the mobile search result is not perceivable after submitting). It depends on the interaction and the scroll position, not on what a page shows at rest, so static observations cannot reveal it. V-A covers it with a browser regression test.

**Certification:**
- **Certified:** the AI review is CERTIFIED as a detector of these four classes of rule violation visible on a page at rest:
  - number format;
  - missing-data representation;
  - language;
  - a contradiction between the chosen value and the page.

  Basis: one blind run, one bundle per reviewer.
- **Not certified, and not a gate:**
  - interaction-only defects;
  - values that are wrong but plausible, since the bundle has no API values to compare with;
  - severity calibration;
  - recall beyond these four classes.

  One run with four seeds gives no statistical bound. The exploratory AI agent as a whole stays NOT VERIFIED (AGENTS §4).

## Limits

- **Triage not enforced:** nothing yet forces a reproduced crawler finding, or an AI review, to be triaged before merge. `Exploratory QA` is informational, and an AI review needs an authorized session, never CI. Making it a gate would need an owner decision (who runs the review, on which PRs).
- **Trust model:** unchanged from [browser-qa.md](browser-qa.md). The verifiers prove the evidence is complete, unmodified and bound to the head; they do not prove the runner is honest. A runner change is a web change, reviewed like any other.
- **Data:** QA fixture through the real ingestion path, not production data.
