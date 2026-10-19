# Browser QA certification (QA-03)

Owner decisions: MP-OWNER-BROWSER-QA-HARD-GATE-01, MP-OWNER-QA-VISUAL-EXECUTION-01, MP-OWNER-CI-GATE-REQUIRED-CHECK-CONFIRMED. Procedures: [browser-qa.md](browser-qa.md) (level A, the gate) and [exploratory.md](exploratory.md) (level B).

**Rule:** a capability is HARD CERTIFIED only when it was demonstrated end to end on a real PR or a real run, with evidence that can be checked again. Otherwise it is CERTIFIED (proved by automated tests in CI on every web change), or NOT VERIFIED.

## Matrix

| # | Capability | Status | Evidence |
|---|---|---|---|
| 1 | Real site start (server, throwaway PostgreSQL, QA archive through the real ingestion path) | **HARD CERTIFIED** | every Browser QA run; PR #166 runs 39273440194 and 39273942757 |
| 2 | Real Chromium, desktop and mobile, every required journey | **HARD CERTIFIED** | same runs, 10 journeys × viewport |
| 3 | Screenshots and Playwright traces kept per step and journey | **HARD CERTIFIED** | artifact `browser-qa-61ddc17…` (id 12197460041, 21 files) and `browser-qa-e761a29…` |
| 4 | Controlled injected defect detected by the gate | **HARD CERTIFIED** | PR #166, commit `61ddc17`: missing values rendered raw; Browser QA FAIL 0/10 ("raw value shown: null", providers "N/D" missing) |
| 5 | Same defect reproduced outside CI | **HARD CERTIFIED** | local run on `61ddc17`: runner exit 1, 10/10 FAIL; verifier refuses the evidence |
| 6 | Fix RED → GREEN, merge unblocked | **HARD CERTIFIED** | commit `e761a29` (revert, `src/` identical to before): Browser QA PASS 10/10 locally (verifier ok) and in CI run 39273942757, where every job and `CI gate` succeeded (check run 118134198286); PR `mergeable_state: "clean"` |
| 7 | Browser QA failure → CI gate failure | **HARD CERTIFIED** | run 39273440194: `Browser QA` failure → `CI gate` failure (check run 118132874185) |
| 8 | CI gate failure → merge blocked by GitHub | **HARD CERTIFIED** | PR #166 on head `61ddc17`, ready for review: `mergeable_state: "blocked"`; ruleset "MatchPilot main protection" (owner verified: PR required, required check `CI gate`, up-to-date branch, empty bypass list, force push blocked). No merge was attempted on the defective head, on purpose |
| 9 | CI gate fails closed when a dependency job is cancelled | **HARD CERTIFIED** | run 39273399334 on `eaab7b0`, superseded by a push: jobs cancelled → `CI gate` failure |
| 10 | Merge gate refuses a red Browser QA | **HARD CERTIFIED** | `node tools/governance/cli.mjs merge-gate` on the `61ddc17` facts: `allowed: false` ("browser QA is FAIL", "not verified", …) |
| 11 | Refusal of an absent, altered, other-head or other-commit report, modified tree, hidden failure, test hook | CERTIFIED | `test/browser-qa-gate.test.mjs` (11 tests) in the PostgreSQL suite of every web change |
| 12 | Same refusals for the exploration bundle and the AI review | CERTIFIED | `test/explore.test.mjs` |
| 13 | Autonomous navigation and interaction (seeded crawler), findings reproduced in a fresh context | **HARD CERTIFIED** | `Exploratory QA` on PRs #165/#166 (420 actions, 7 routes, desktop and mobile); injected JS defect found and reproduced (`test/explore.test.mjs`) |
| 14 | Crawler determinism | CERTIFIED | same seed → same trails (`test/explore.test.mjs`) |
| 15 | AI exploratory agent (Claude, authorized session) | **CERTIFIED for the seeded classes below; not a merge gate** | blind evaluation below |
| 16 | Exploratory triage enforced before merge | NOT VERIFIED | not wired into `CI gate` or `merge-gate` (see Limits) |

## Demonstration on PR #166 (19/10/2026, UTC)

1. `eaab7b0`: QA-03 tools; run superseded by the next push (matrix row 9).
2. `61ddc17` (14:56:04): **CONTROLLED DEFECT**, `formatScalar` no longer renders N/D for a missing value.
   - CI run 39273440194: `Browser QA` failure, verifier `verdict: FAIL`, 0/10, artifact 12197460041; `PostgreSQL integration suite` failure (the web E2E test sees it too); `CI gate` failure.
   - PR marked ready for review: `mergeable_state: "blocked"` (14:59).
   - Local reproduction (14:56:17): runner exit 1, all ten journeys `raw value shown: "null"` or `Ultimo backfill N/D` missing.
   - `merge-gate` on those facts: `allowed: false`.
3. `e761a29` (14:59:22): revert. Local Browser QA PASS 10/10, verifier ok (14:59:57). CI run 39273942757: every job green, `CI gate` success at 15:01:24; PR `mergeable_state: "clean"`.

The defect never reached `main`: the PR is squash-merged from its final state, and `src/` at the head equals `main`.

## AI exploratory agent: blind evaluation

**Question:** does the AI review (level B) find defects the crawler cannot see, without inventing them where they are absent?

**Method** (`tools/qa/ai-eval-seeds.mjs`):
1. Two bundles on the same commit `82ad736`, seed 1, 30 actions per route, 7 routes, desktop and mobile:
   - one clean;
   - one with four semantic defects injected in the page.
2. The crawler reports **0 findings on both**: these defects are outside its reach.
3. The bundles were blinded: anonymous names (`bundle-1` seeded, `bundle-2` clean), and `injected_defect` cleared in the copies.
4. A fresh Claude agent, told only to follow [exploratory.md](exploratory.md), reviewed both. It was not allowed to read the seeds, `tools/qa/`, `test/` or the git history.
5. Both reviews pass `verify-exploration.mjs --review`.

Evidence in [`docs/qa/evidence/qa-03/`](evidence/qa-03/): both `exploration.json` and both `ai-review.json`. The screenshots stayed out of the repository for size; their SHA-256 values are in the manifests.

| Seeded defect | Rule | Bundle 1 (seeded) | Bundle 2 (clean) |
|---|---|---|---|
| S1 odds with a decimal point | D-3 | found, AI-4 BUG P1 | not reported (correct) |
| S2 missing data shown as 0 | MP-OWNER-PRODUCT-QUALITY-DATA-01 | found, AI-2 and AI-3 BUG P1 | not reported (correct) |
| S3 English button label | Italian labels | found, AI-5 BUG P2 | not reported (correct) |
| S4 board heading names the day before | chosen day | found, AI-1 BUG P1 | not reported (correct) |

**Result:**
- recall 4/4 on the seeded defects, with no seeded defect reported on the clean bundle;
- computed verdicts BLOCKING (seeded) and NO_BLOCKING (clean).

**Real findings on the clean bundle**, the same in both reviews. They are not seeded and are now product backlog:
- deep provider values wrapping a few characters per line on desktop: the audit's A-2, confirmed;
- "generato" timestamps as raw UTC (D-7);
- untranslated labels and raw codes (`PROVIDER_TZ_UNDOCUMENTED`, `FINAL`, `KEPT`, …);
- mobile tables cut without a scroll cue;
- same-day matches in search not in time order;
- "Favorito N/D N/D" repeated;
- "Successore N/D" for kept routes.

**Missed:** the audit's A-1 (the mobile search result is not perceivable after submitting). It depends on the interaction and the scroll position, not on what a page shows at rest, so static observations cannot reveal it. V-A covers it with a browser regression test.

**Certification:**
- **Certified:** the AI review is CERTIFIED as a detector of rule violations visible on the page (number format, missing-data representation, language, contradictions between the chosen value and the page).
- **Not certified, not a gate:**
  - interaction-only defects;
  - values that are wrong but plausible, since the bundle has no API values to compare with;
  - recall beyond these four classes.

  The evaluation is one blind run with four seeds; it gives no statistical bound. Level A stays the only hard gate.

## Limits

- **Triage not enforced:** nothing yet forces a reproduced crawler finding, or an AI review, to be triaged before merge. `Exploratory QA` is informational, and an AI review needs an authorized session, never CI. Making it a gate would need an owner decision (who runs the review, on which PRs).
- **Trust model:** unchanged from [browser-qa.md](browser-qa.md). The verifiers prove the evidence is complete, unmodified and bound to the head; they do not prove the runner is honest. A runner change is a web change, reviewed like any other.
- **Data:** QA fixture through the real ingestion path, not production data.
