# Visual baselines (QA-V)

Owner decisions: MP-OWNER-QA-VISUAL-EXECUTION-01 (versioned visual baselines, SHA-256 manifest, explicit thresholds, protection against arbitrary updates) and MP-OWNER-AUTONOMOUS-UI-ROADMAP-01 (desktop and mobile baselines, reproducible comparison, CI blocking only real regressions, baselines never updated automatically). It complements the [Browser QA Gate](browser-qa.md): the journeys check what the pages do, QA-V checks how they look.

## What is compared

`node tools/qa/visual.mjs --out <dir>` opens each **scene** of the site on three viewports and compares its first screen with the committed baseline:
- viewports: desktop 1280×800, tablet 820×1180, mobile 390×844;
- 8 scenes, so 24 baselines in `test/visual/baselines/`.

| Scene | Address | What it fixes |
|---|---|---|
| `oggi` | Oggi on the busy day of the QA archive | compact rows, day strip, controls |
| `oggi-righe` | the same day, scrolled to the sixth row | rows further down, the phone's bottom bar over the list |
| `oggi-vuoto` | the day before (no match) | empty state |
| `oggi-oggi` | `#/`, the current day | title «Oggi», «Oggi» in the strip |
| `ricerca` | the search form | form, fields, amber action |
| `ricerca-risultati` | LaLiga, 2 August 2024 | results table, cards on a phone |
| `dati` | the technical overview | tiles, coverage table |
| `non-trovata` | an unknown address | not-found page |

## What makes it reproducible

- **Same data on every run:** the QA archive through the real FutPythonTrader ingestion, the same one as Browser QA.
- **Same clock:** the browser clock is fixed at 20 October 2026, 10:00 Europe/Rome, with locale it-IT, so «Oggi», the day strip and every date stay the same.
- **Same fonts:** the fonts hosted with the site.
- **No motion:** reduced motion, with animations and caret switched off for the screenshot.
- **Two API values fixed:** each answer's server time and the code version. Only these two `meta` fields are replaced with fixed values; every data value stays the API's. They change on every run and every commit, and their width moves the layout, so a mask would not be enough.
- **Measured:** two runs on the same tree give byte-identical images.

## Thresholds

A pixel differs when one of its colour channels moves by more than `thresholds.pixel` (0–255). A scene fails when its differing pixels exceed `thresholds.ratio` of the image, or when its size changes. Both values are in `test/visual/manifest.json`:
- the manifest check refuses a `pixel` above 64 and a `ratio` above 1%;
- changing either value needs a log entry, like a baseline.

The values, and why they are sufficient to absorb the rendering differences between the browser that made the baselines and the browser of CI without hiding a real regression, are recorded in the log ([visual-baselines.md](visual-baselines.md)).

## Protection against arbitrary updates

- **The manifest is the list of baselines.** Each file has its SHA-256. A changed, missing or unlisted file, or a missing scene, fails `node tools/qa/visual.mjs verify`.
- **A comparison never writes a baseline.** Captures and diffs go to the run folder, and the CI artifact is `visual-qa-<head>`.
- **`promote` is the only way to change a baseline:** `node tools/qa/visual.mjs promote <run> --reason <why> --approval <PR or issue> [--pixel N --ratio R]`.
  - It takes the captures of a finished run on a clean tree and checks them against their report.
  - It rewrites the manifest and appends an entry to the log: reason, approval, run, thresholds, and every changed baseline with its new SHA-256.
- **CI refuses an undeclared change.** `node tools/qa/visual.mjs check-update` runs in Fast checks with the PR base and head. A change under `test/visual/` passes only if the same PR adds a log entry with an approval reference and the new SHA-256 of every changed baseline; a changed threshold needs a `Thresholds` line.

## Where it is enforced

- **Fast checks**, on every PR: manifest integrity and declared updates.
- **Browser QA**, on every web change:
  - the comparison runs after the journeys;
  - a scene over the thresholds fails the job, so `CI gate` blocks the merge;
  - `test/visual/` counts as a web change (`scripts/ci-classify.mjs`).
- **Unit tests** (`test/visual-gate.test.mjs`): the PNG codec, the thresholds, the manifest refusals, `promote` and `check-update`.

## Limits

- Each scene is the first screen of one address, or of one scrolled position. A defect below it is outside the baseline; the journeys still check it.
- Browser QA runs the journeys on desktop and mobile only. Tablet is covered by QA-V alone.
- A browser update in CI can move antialiasing beyond the thresholds. The job then fails with the diff images. A new baseline needs a `promote` with its reason and approval: never an automatic update.
