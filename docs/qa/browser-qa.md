# Browser QA Gate (QA-01)

Owner decisions: MP-OWNER-BROWSER-QA-HARD-GATE-01, MP-OWNER-QA-01-AUTHORIZATION, MP-OWNER-PRODUCT-QUALITY-DATA-01. Rule in [AGENTS.md §4](../../AGENTS.md).

**WEB CHANGE + NO VERIFIED BROWSER QA = MERGE BLOCKED.**

What is certified, and how, is in [certification.md](certification.md) (QA-03).

## What runs

`node tools/qa/browser-qa.mjs --out <dir>` (`npm run qa:browser`):
1. starts the real server (`src/server.mjs`, `PORT=0`, test mode) on a throwaway PostgreSQL schema (local or CI service, never production);
2. loads the QA archive through the real FutPythonTrader ingestion path (`test/helpers/fpt-seed.mjs#seedQaArchive`): two competitions sharing dates, 86 matches, a day with 31 matches so the Daily Board must page;
3. drives a real Chromium/Chrome (`playwright-core`, already a pinned dev dependency; no browser download) through every required journey on every required viewport (desktop 1280×800, mobile 390×844);
4. writes the evidence: `report.json`, a screenshot per step, a Playwright trace per journey and viewport, and the SHA-256 of every file.

Required journeys (`tools/qa/journeys.mjs`):

| Journey | Covers |
|---|---|
| `general-navigation` | site opens with CSP, every menu entry and its active state, unknown route, keyboard Tab |
| `dashboard` | every tile from its route, values equal the API, coverage per league, N/D for missing data, one route unavailable → only its tile N/D with the reason |
| `daily-board` | opening from the dashboard, date field, two competitions on one day, "Carica altre partite" to the end in API order, card values, previous/next day, empty day, invalid date |
| `search` | all matches page by page, team + venue + data quality, competition + date range, xG filter, server validation error, unknown team, no result, venue without team, failed next page with retry |
| `match-center` | opening from Oggi and search, every comparison figure, form, odds and source row equal to the API for each filter, PIT cutoff, empty history, invalid and unknown match |
| `providers-endpoints` | data providers page, API registry equal to the API |
| `sim-save` | MP-UI-PR-003: no save offered without the owner login or the archive of saves (stated in words); the owner login page; a result saved once even with a double click, the same report, the request and not the result sent; saved again → already saved; opened from the result and from «Backtest salvati» (the API list); a refused save (503) shown as such; a «Personalizzata» strategy saved with the simulated definition, then unchanged; a closed session refused. On the second server of the QA environment (owner login, staged persistence schema). Its traces record the login request and the session cookie of the per-run test owner: random, void when the run ends (server stopped, schema dropped); never a real credential |

After **every step** the runner also checks, on the page as rendered:
- no raw JavaScript value leaked (a text node that is exactly `null`/`undefined`/`NaN`, or `NaN` anywhere);
- no horizontal overflow;
- basic accessibility: `lang`, one `h1`, no heading level skipped, an accessible name for every visible link, button and field, `alt` on images;
- layout: no clipped text, no overlapping controls.
- control inventory (MP-UI-PR-001, #239): every visible link, button, field and `summary` of the page carries a `data-control` id listed in [`control-inventory.json`](control-inventory.json); a control without an id, or with an id the inventory does not know, fails the step.

## Control inventory

[`control-inventory.json`](control-inventory.json) lists every interactive control of the web app (schema `mp-control-inventory-1`): stable id, view, kind, label, action, API, data state (`REAL`, `DEMO`, `UNAVAILABLE`, `NONE`), issues, status (`NOT STARTED`, `IN PROGRESS`, `IMPLEMENTED`, `TESTED`, `CERTIFIED MOCK`, `CERTIFIED REAL`, `BLOCKED`), evidence level and the journey steps that give that evidence.
- Evidence follows the chain of MP-UI-HARD-GATES-01: `SEEN` (visible at the end of a step) → `ACTUATED` (clicked, typed, changed or submitted in a step) → `ASSERTED` (the result of the action checked) → `CERTIFIED MOCK`. Seeing or actuating a control is not verifying it: `TESTED` needs `ASSERTED`.
- `ASSERTED` (MP-UI-PR-002): inside a step, a journey calls `asserted(controls, description, check)` after the action. The runner runs `check` (the assertions on what the action produced: page, state, requests, API values) and only when it passes records the controls in the step's `asserted`, with the description in `assertions`. It fails the step when a control was not actuated earlier in the same step, when the check fails, when the description is missing, and when it is called outside a step: an action in one step cannot be asserted in another. The check must verify an effect of the action, so the step starts from a state where the check would fail: the menu entry or tab is not current before its click, a select gets a value other than its default, a day other than the one shown (review #241). A check that already held before the action proves nothing and is a defect of the journey.
- `CERTIFIED MOCK` needs, besides `ASSERTED`, the Gate A and Gate B evidence of MP-UI-HARD-GATES-01 in `certification`: `gate_a` positive, negative, limits (errors and edge cases), transitions and contract; `gate_b` integrated and adversarial. Each category names at least one Browser QA step where the control was asserted (`{journey, step}`, checked in the report on every viewport) or a test (`{test, name}`, a `test('<name>'` in that file under `test/`); positive, integrated and adversarial need a browser step. No control is certified yet: certification comes with the functional PRs that add the negative, limit and contract cases.
- `CERTIFIED REAL` is refused: it needs a REAL certification campaign on the real backend, schema and data, which does not exist yet. The QA archive is a fixture; nothing on it is REAL.
- The runner records, for every step, the controls actually actuated (`actuated`: click, input, change of a select or checkbox, or submit on the nearest `[data-control]`, through a page binding that survives page loads; a form sent with Enter counts as its submit button) and the controls visible at its end (`seen`).
- An id names a control, not each instance: the seven day links of the board share `CTL-BOARD-DAY`, the options of a Match Center filter share its id, `CTL-LIST-MORE` and `CTL-COMMON-RETRY` serve several views. Evidence on an id means at least one of its instances in each named step.
- Scope: the single-page app (`/`). The server-rendered `/coverage` page is not inventoried yet; it moves into the app with MP-UI-PR-006.
- A control with evidence `SEEN`, `ACTUATED` or `ASSERTED` names steps, and `verify-report` fails unless it was seen, actuated or asserted in each of them on every viewport. In every step, an asserted control must also be actuated and come from a recorded assertion with a description. A claim the report does not back, or an id missing from the inventory, refuses the evidence.
- `test/control-inventory.test.mjs` checks the inventory against the journeys' step titles and the page code: every literal `data-control` id of `src/web` is inventoried, every generated id is built by its own form (and every id a form builds is inventoried), and no `button`, `select` or `input` is built without an id.
- After a journey change, `node tools/qa/control-inventory.mjs assertions qa-evidence/report.json` (and `actuations`, `sightings`) lists the steps where each control was asserted (actuated, seen) on every viewport, to update `evidence` and `exercised_by`.
- `npm run ui:progress` computes the completion from statuses and evidence: seen, actuated and asserted counts; verified = `TESTED` or certified; `CERTIFIED MOCK` and `CERTIFIED REAL` apart (the latter impossible on the seeded QA archive).

A journey fails on any JavaScript error, failed request or HTTP error ≥ 400 that it did not declare as expected. Expected errors are declared per journey and path (for example the 400 of a refused filter), and only the browser's console line for that status is then accepted: no false positive, no blanket allowance.

## Evidence and verification

`node tools/qa/verify-report.mjs <dir> --head <PR head> --commit <checked-out commit>` (`npm run qa:verify`) accepts the evidence only when:
- `head_sha` is the PR head and `tested_commit` the checked-out commit, and the tested commit contains the head (in a pull request run it is the merge of the head into the base); clean working tree; no test hook (injected defect);
- every listed file exists with its SHA-256, every screenshot and trace cited is listed (inherited object keys never count), and no file on disk is missing from the manifest;
- every required journey ran on every required viewport, once, and passed with executed steps, a trace, a duration and no unexpected error;
- SKIP and NOT_VERIFIED carry a reason and never replace a required journey;
- counts, `missing_required` and verdict equal what the journeys imply;
- the report is not dated in the future and has no secret-like value.
- the control inventory is valid, with the same checks as its unit test (no `TESTED` or certified status without `ASSERTED`, no `CERTIFIED MOCK` without Gate A/B evidence, no `CERTIFIED REAL`); every control with evidence `SEEN`, `ACTUATED` or `ASSERTED` was seen, actuated or asserted in each step it names; every asserted control of a step was actuated in it and comes from a recorded assertion; no step actuated or showed a control the inventory does not list.

The verdict is computed, never declared. `test/browser-qa-gate.test.mjs` proves each refusal (missing report, other head, other commit, modified tree, changed or missing file, PASS without steps, hidden failure, wrong counts, duplicate, unexplained skip, missing journey, secret) and that the runner fails a real page with a deliberately injected defect, with screenshot and trace.

## Where it is enforced

- **Classification:** `scripts/ci-classify.mjs` outputs `web`. Web: every file under `src/` (the server imports most modules directly or through the query layer), `migrations/`, `package*.json`, `.npmrc`, `tools/qa/`, the classifier, the workflows, the browser tests and `test/helpers/`. The diff is read without rename detection, so a moved file counts at its old and its new path; deleted files count; an empty or unreadable diff is web. Everything else (documentation, governance records and tools, mock, other tests) is exempt by this rule only (`test/ci-classify.test.mjs`).
- **CI:** job `Browser QA` runs for web changes on PostgreSQL 17 with the runner's Chrome, verifies the evidence against the PR head and uploads it as the artifact `browser-qa-<head>` (14 days). `CI gate` fails when the change is web and `Browser QA` did not succeed, or when it is not web and the job ran anyway.
- **Merge gate:** `node tools/governance/cli.mjs merge-gate` needs `web_impact` (from the classifier) and, for a web change, `browser_qa: {verdict: PASS, verified: true, head_sha: <head>, ci_run_id}`. Like every merge-gate input, these are facts the agent copies from GitHub (the classifier output, the green `Browser QA` job and its artifact on the head); the command does not query GitHub itself, and the independent reviewer re-checks them. The enforcement that does not depend on the agent is `CI gate`.

## Visual baselines

After the journeys, the same job compares 15 approved views and states on desktop, tablet and mobile with their versioned baselines (QA-V). A view over the thresholds fails the job, and the comparison is kept as the artifact `visual-qa-<head>`. Procedure, thresholds and limits: [visual.md](visual.md).

## Phase A audit (19/10/2026, before QA-01)

| Capability | Before QA-01 | With QA-01 |
|---|---|---|
| Real Chromium | PASS | PASS |
| Playwright | PARTIAL (`playwright-core` via `node:test`) | PASS (same library, runner and traces) |
| Server start/stop, isolated QA PostgreSQL | PASS | PASS |
| Fixtures through the real ingestion path | PASS (one league) | PASS (two leagues, busy day) |
| Desktop and mobile | PASS | PASS |
| Console and JS errors | PASS | PASS |
| HTTP/API errors | PARTIAL (console only) | PASS (responses, failed requests, declared expectations) |
| Screenshots | PARTIAL (on failure, not kept) | PASS (every step, kept) |
| Playwright traces | MISSING | PASS |
| Basic accessibility | MISSING | PASS (structural checks) |
| CI artifacts | MISSING | PASS |
| Verifiable report bound to the head | MISSING | PASS |
| Web impact classification | PARTIAL | PASS |
| Merge blocked without evidence | MISSING | PASS (CI gate, merge-gate) |
| Required check on `main` | NOT VERIFIED | VERIFIED by the owner (see below) |
| Exploratory AI agent | ad hoc | NOT VERIFIED as a whole; detection of four seeded classes CERTIFIED by a blind evaluation, not a gate ([certification.md](certification.md)) |

## Limits

- **Required checks:** which checks GitHub requires cannot be read with the tools available to the agent. The owner verified the ruleset "MatchPilot main protection" (MP-OWNER-CI-GATE-REQUIRED-CHECK-CONFIRMED): pull request required, required check `CI gate`, branches up to date, empty bypass list, force push blocked. The end-to-end demonstration that a failing Browser QA blocks a real PR is part of QA-03; HARD CERTIFIED is declared only there, for what it demonstrates.
- **Trust model:** the evidence is produced and verified inside the CI job on the PR head; the verifier proves it is complete, unmodified and bound to that head, not that the runner code is honest. A change to the runner or the journeys is itself a web change, reviewed like any other.
- **Exploratory level (B):** not part of the gate; reported as `NOT_VERIFIED` in every gate report. Crawler and AI review procedure in [exploratory.md](exploratory.md).
- **Data:** the QA archive is a fixture through the real ingestion path, not the real archive (#40) nor production data.
- **Accessibility:** structural checks only, not a full WCAG audit.
- **Cost:** none. No new dependency, service or browser download; artifacts stay within GitHub's included storage with 14-day retention.

## Finding classification

A failing journey is a finding: classify it as BUG, DATA MISSING, DATA QUALITY ISSUE, NOT VERIFIED or BLOCKED (MP-OWNER-PRODUCT-QUALITY-DATA-01), with severity P0–P3. Confirmed open P0/P1 block; P2/P3 may be deferred only with reason, impact and follow-up recorded. A fixed bug gets a regression test (a journey step or a unit test), RED before the fix and GREEN after.

Example from QA-01 itself: the first run failed the providers page on the word "undefined". It was the legitimate label of the `undefined_states` field, so the check was wrong, not the page (classification: test defect). The check was narrowed to values that really leaked.
