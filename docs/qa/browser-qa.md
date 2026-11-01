# Browser QA Gate (QA-01)

Owner decisions: MP-OWNER-BROWSER-QA-HARD-GATE-01, MP-OWNER-QA-01-AUTHORIZATION, MP-OWNER-PRODUCT-QUALITY-DATA-01. Rule in [AGENTS.md §4](../../AGENTS.md).

**WEB CHANGE + NO VERIFIED BROWSER QA = MERGE BLOCKED.**

What is certified, and how, is in [certification.md](certification.md) (QA-03).

## What runs

`node tools/qa/browser-qa.mjs --out <dir>` (`npm run qa:browser`):
1. starts the real server (`src/server.mjs`, `PORT=0`, test mode) on a throwaway PostgreSQL schema (local or CI service, never production);
2. loads the QA archive through the real FutPythonTrader ingestion path (`test/helpers/fpt-seed.mjs#seedQaArchive`): two competitions sharing dates, 86 matches, a day with 31 matches so the Daily Board must page;
3. drives a real Chromium/Chrome (`playwright-core`, already a pinned dev dependency; no browser download) through every required journey on every required viewport (desktop 1280×800, tablet 820×1180, mobile 390×844; tablet since MP-UI-PR-007, D12 decision 24/10);
4. writes the evidence: `report.json`, a screenshot per step, a Playwright trace per journey and viewport, and the SHA-256 of every file.

Required journeys (`tools/qa/journeys.mjs`):

| Journey | Covers |
|---|---|
| `general-navigation` | site opens with CSP, no login marker and no session or «Esci» with the owner login off, every menu entry and its active state, unknown route, keyboard Tab |
| `dashboard` | every tile from its route, values equal the API, coverage per league, N/D for missing data, one route unavailable → only its tile N/D with the reason |
| `daily-board` | opening from the dashboard, date field, two competitions on one day, "Carica altre partite" to the end in API order, card values, previous/next day, empty day, invalid date |
| `search` | all matches page by page, team + venue + data quality, competition + date range, xG filter, server validation error, unknown team, no result, venue without team, failed next page with retry |
| `match-center` | opening from Oggi and search, every comparison figure, form, odds and source row equal to the API for each filter, PIT cutoff, empty history, invalid and unknown match |
| `providers-endpoints` | data providers page, API registry equal to the API |
| `trading-tools` | MP-UI-PR-005 (#94): the manual-input label and the tools not yet available named; every tab; for each of the seven calculators, every field reaches the request and the page shows the server's display values, one invalid field is refused (400) and named, «Azzera» empties the form; the address carries the calculation across a reload; a server error (503) and a lost connection stated, «Riprova» recalculates; 401 without the owner session when the login is enforced ([`../trading-tools.md`](../trading-tools.md)) |
| `sim-save` | MP-UI-PR-003: no save offered without the owner login or the archive of saves (stated in words); the owner login page; a result saved once even with a double click, the same report, the request and not the result sent; saved again → already saved; opened from the result and from «Backtest salvati» (the API list); a refused save (503) shown as such; a «Personalizzata» strategy saved with the simulated definition, then unchanged; a closed session refused; the header shows «Proprietario» and «Esci», which closes the session on the server; a failed logout (500) is reported beside the role, which stays, with the session still open (MP-UI-PR-004). MP-UI-PR-006, the Strategie page: the saved strategy opens with its rules in words and its history; a new version keeps the earlier one, which opens as it was; «Apri in Simulazione» pre-fills the rules; an earlier version is cloned as the next version and becomes current, then cloning again changes nothing; from the current version the Simulazione pre-fills code and name and the changed rules are saved as the next version; the list from the Simulazione, opening and the way back; an invalid address, a missing strategy, the archive not active (503), saving off, and the strategies private without the owner login (403). On the second server of the QA environment (owner login, staged persistence schema). Its traces record the login request and the session cookie of the per-run test owner: random, void when the run ends (server stopped, schema dropped); never a real credential |

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
- Scope: the single-page app (`/`). The server-rendered `/coverage` page is not inventoried; its content lives in the app as `#/coverage` since MP-UI-PR-008-COV.
- A control with evidence `SEEN`, `ACTUATED` or `ASSERTED` names steps, and `verify-report` fails unless it was seen, actuated or asserted in each of them on every viewport. In every step, an asserted control must also be actuated and come from a recorded assertion with a description. A claim the report does not back, or an id missing from the inventory, refuses the evidence.
- `test/control-inventory.test.mjs` checks the inventory against the journeys' step titles and the page code: every literal `data-control` id of `src/web` is inventoried, every generated id is built by its own form (and every id a form builds is inventoried), and no `button`, `select` or `input` is built without an id.
- After a journey change, `node tools/qa/control-inventory.mjs assertions qa-evidence/report.json` (and `actuations`, `sightings`) lists the steps where each control was asserted (actuated, seen) on every viewport, to update `evidence` and `exercised_by`.
- `npm run ui:progress` computes the completion from statuses and evidence: seen, actuated and asserted counts; verified = `TESTED` or certified; `CERTIFIED MOCK` and `CERTIFIED REAL` apart (the latter impossible on the seeded QA archive).

The journey `controls-coverage` (MP-UI-PR-007 follow-up, MP-REQ-UI-1028) asserts the controls no other journey asserted: logo, Copertura tab, Oggi and empty day, the Match Center links, the Ricerca filters, open day, homonym choice and reset, the Simulazione parameters and reset. Since then every control of the inventory is `ASSERTED`, and `test/ui-foundations.test.mjs` fails when a control is only seen or actuated: a new control needs an asserted step.

The journey `coverage` (MP-UI-PR-008-COV) checks the coverage inside the app against the API: competitions with seasons, matches and shares (percentages without rounding), the country filter reloaded from the server, the seasons of a competition and the way back, the unavailable archive and unavailable seasons (503, nothing invented), and a country of the address the archive does not have (kept in the filter, empty list). The percentages come from `percentText` in `src/web/states.js`, whose fixed vectors are in `test/ui-foundations.test.mjs`.

The journey `search` checks the season filter of MP-UI-PR-011-SEASON: disabled without a competition, the seasons listed are the API's, the chosen season reaches the search and every row is of it, an invalid id is named on its field, an unavailable list leaves the filter off. It also checks the filters added by MP-UI-PR-011-SRCHX (favourite side, home and Over 2.5 price ranges, minimum total xG): each reaches the API, every row of the answer satisfies it and the rows shown are the API's; a refused value is named on its field.

The journey `daily-board` checks the competition filter of MP-UI-PR-010-BOARD-COMP: the competition reaches the API, the day shows only its matches in the API's order, the day links keep it, an empty day names the competition, an unavailable list leaves the filter off.

The journey `global-search` (MP-UI-PR-009-NAV) checks the search of the header on every viewport: the words typed reach the teams API, the squads listed are its answer and a squad opens its matches from the search API; the pages of the app are found by name without accents or capitals; no result and an empty field are said as such.

The journey `http-errors` (MP-UI-PR-007) is the browser negative matrix: every view that reads the API (Oggi, Ricerca, Partita, Simulazione, Confronto, Strumenti, Fornitori, API, Copertura, Cerca) is opened with its request answered by 401, 403, 404, 409, 414, 429, 500, 503 and a network timeout in turn. The page must show the state of that status in the words of `src/web/states.js`, keep the code, offer «Riprova» (which reloads the view once the source answers), go to the login and back on a 401, and never show a blank page. A view with a state of its own (another run in progress, too many rules) shows that state.

The invariants also check the shared badges (`src/web/states.js`): an area declared DEMO (`data-mode="DEMO"`, the view included) must show a visible DEMO badge, and every badge must show exactly the text of its kind.

A journey fails on any JavaScript error, failed request or HTTP error ≥ 400 that it did not declare as expected. Expected errors are declared per journey and path (for example the 400 of a refused filter), and only the browser's console line for that status is then accepted: no false positive, no blanket allowance. An expected error can be bound to the one step that provokes it (`allowHttp: [{path, status, step}]`, review #251): outside that step the same status on the same path fails the journey. Every server error (5xx) must name its step, or the list of steps that provoke it (MP-UI-PR-007, review #251 T-2), and an allowance bound to a step that never ran fails the journey too (`test/browser-qa-gate.test.mjs` proves the cases). A step ends only once its requests have their answers (at most 5 seconds), so a late answer is judged in the step that asked for it. Each allowed response excuses exactly the console line the browser writes for that resource (same status, same path), never a line of another resource (`unexpectedConsoleLines`, tested in `test/ui-foundations.test.mjs`). The report lists the allowed responses with their step (`allowed_http`). A network failure a journey provokes on purpose is declared the same way (`allowNetwork: [{path, error}]`, MP-UI-PR-005): only that request failing with that error, and its console line, are accepted.

## Feature certification

Owner decision MP-UI-CONTINUOUS-FUNCTIONAL-CERTIFICATION-01: certification is per feature, not per pull request. [`feature-certification.json`](feature-certification.json) (schema `mp-feature-certification-2`) lists the features a user recognizes, each with:
- its perimeter, views and controls;
- requirements, issues, PRs and journeys;
- data: `REAL`, `DEMO`, `COMPUTED` (the real server computes from what the user types), `UNAVAILABLE` (a real source the deployed app does not have yet, such as the persistence archive; no certified level) or `NONE`. The declaration agrees with the controls (review #251): `REAL` needs a `REAL` control, `DEMO` a `DEMO` one, and a feature whose controls only reach an unavailable source declares `UNAVAILABLE`;
- `ui_requirements`: the ids of the 1,090-requirement matrix (`docs/governance/ui-requirements-matrix.json`) the feature implements. Each id belongs to one feature, with the same data mode; a `TESTED` one sits in a feature at least `TESTED`, and its `evidence_refs` are checked one by one (`requirementEvidenceErrors`): a test whose title carries the requirement id, or a journey step whose controls are `TESTED` and, with a report, asserted in that very step on every viewport. A step without controls is supporting evidence only;
- the register's `cross_cutting_ui_requirements` lists the foundations every view shares (viewports, badges, HTTP states, negative matrix; MP-UI-PR-007): each id is in no feature, and a `TESTED` one has its `evidence_refs` checked the same way;
- whether it is financial;
- dependencies, limits and the next activity;
- its entry module (`entry`), source modules (`sources`) and test files (`test_files`):
  - the entry is a module of `src/api/` that declares the endpoints of the feature's controls (`path: '…'`, or the family such as `` path: `/api/v1/tools/${name}` ``). It is the entry of one feature only;
  - the modules many features run are listed in `shared_modules` (Math Core, Decimal, money, the v1 layer, the page). A module run by the entries of two features counts as shared too, without being listed. Shared modules are never a source, a contract or the anchor of a test file;
  - the sources are the entry and the modules it imports, so a module the feature does not run can never be its evidence;
  - a source module and a test file belong to one feature only;
  - every test file imports one of the sources (comments ignored), and the evidence may cite only these tests;
- its state: `NOT STARTED`, `IN DEVELOPMENT`, `IMPLEMENTED`, `TESTED`, `CERTIFIED MOCK`, `CERTIFIED REAL`, `CERTIFIED CALCULATION`, `BLOCKED` or `REGRESSED`.

Every control of the inventory belongs to exactly one feature.

`tools/qa/feature-certification.mjs` **computes** the state from the evidence; no agent declares it on its own word.
- **IMPLEMENTED:** every control of the feature exists and is built.
- **TESTED:** besides, every control is `TESTED` (`ASSERTED`), every test the feature names is active, and every journey it names passed on every viewport.
- **CERTIFIED:** besides, a `certification` record (MP-UI-CERT-CALC-01) with every one of these fields, each checked:
  - `level` and `perimeter`;
  - `verified_commit`, `verified_digest` and `date`. `verified_digest` is the SHA-256 of the feature's files (`entry`, `sources`, `test_files`, path and content, sorted by path), computed by `featureDigest`:
    - the files in the clone must have that digest, so any change to them voids the certification until it is verified again;
    - `verified_commit` must be in the clone and its files must have the same digest; a commit that is not in the clone is a gap, never accepted on trust;
    - the commit need not be an ancestor of the head: a squash merge rewrites the history but keeps the content, and the digest binds the certification to the content. The branch commits stay reachable through the PR refs: CI checks out the full history and fetches `refs/pull/*/head`; locally, `git fetch origin '+refs/pull/*/head:refs/remotes/origin/pull/*'`;
    - the digest covers the feature's own files only: shared modules, the page code and the journeys are outside it, and CI runs the cited tests and journeys again on every change;
  - `requirements`: ids that exist in `docs/governance/mp-pr-00/requirements.json`;
  - `requirements` must also be requirements of the feature itself;
  - `criteria`: evidence for completeness, correctness, contracts, integration, security and financial, or N/A with a reason.
    - Completeness, correctness and integration are never N/A, and a financial feature never marks financial N/A.
    - Each criterion rests on at least one active test of the feature's own `test_files`, or on a step of its own journeys that the control inventory records as exercising one of the feature's controls. A document only supplements them.
    - Integration needs a step whose assertions passed on every viewport;
  - `gate_a` (result PASS, test evidence) and `gate_b` (result PASS, Browser QA evidence);
  - `fixtures`: the fixtures and independent vectors, at least one test;
  - `results`: the test runs, all PASS on the verified commit. Accepted commands: `npm test`, `npm run qa:browser`, `npm run qa:verify`, a QA tool `node tools/qa/….mjs`, or `node --test` on the feature's own test files. They are declarations; CI runs every cited test and journey again on each change;
  - `contracts`: module (one of the feature's `sources`), exported constant and version. The gate compares each with the constant in the code, ignoring comments, so a changed contract voids the certification;
  - `limits`, stated explicitly;
  - `independent_review`: verdict APPROVED, the reviewed commit (in the clone, containing the verified one) and the GitHub comment of the review.
- **Levels** (MP-UI-CERT-CALC-01). They say what was certified, not how well:
  - `CERTIFIED MOCK` for `DEMO` data;
  - `CERTIFIED REAL` for `REAL` data;
  - `CERTIFIED CALCULATION` for `COMPUTED` features: deterministic calculations on explicit input, by the real server. It implies no REAL feed, no prediction, no profitability and no real trading.
  - A feature with `NONE` data has no certified level yet.

A control `TESTED` does not certify its feature, and a merged PR certifies nothing.

`verify-report` runs the check on every Browser QA run (CI gate):
- a declared state above what the evidence supports fails the gate;
- a certification whose evidence no longer holds (a test removed or skipped, a journey or a step that stopped passing) fails until the feature is declared `REGRESSED` or the evidence is restored;
- a declared state below the evidence is only noted.

So an incomplete feature never blocks a merge, and a false claim always does. `node tools/qa/feature-certification.mjs status [report.json]` prints the computed states and their gaps. Tests: `test/feature-certification.test.mjs`.

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
| Desktop and mobile (tablet since MP-UI-PR-007) | PASS | PASS |
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
