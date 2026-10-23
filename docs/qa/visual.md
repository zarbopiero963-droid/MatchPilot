# Visual baselines (QA-V)

Owner decisions: MP-OWNER-QA-VISUAL-EXECUTION-01 (versioned visual baselines, SHA-256 manifest, explicit thresholds, protection against arbitrary updates) and MP-OWNER-AUTONOMOUS-UI-ROADMAP-01 (desktop and mobile baselines, reproducible comparison, CI blocking only real regressions, baselines never updated automatically). It complements the [Browser QA Gate](browser-qa.md): the journeys check what the pages do, QA-V checks how they look.

## What is compared

`node tools/qa/visual.mjs --out <dir>` opens each **scene** of the site on three viewports and compares its first screen with the committed baseline:
- viewports: desktop 1280×800, tablet 820×1180, mobile 390×844;
- 18 scenes, so 54 baselines in `test/visual/baselines/`.

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
| `oggi-caricamento` | Oggi, with the matches route held | loading state |
| `oggi-errore` | Oggi, with the matches route answering 503 | error state: «Dati non disponibili», Riprova |
| `ricerca-filtro-rifiutato` | the search with «Quota favorito da» above «a»: the real server refuses it (400) | refused filter, the fields named in Italian |
| `partita` | the Match Center of the first match of the last day of the QA archive | hero, form, odds, filters |
| `partita-confronto` | the same match, scrolled to the comparison | comparison, source matches |
| `partita-senza-storico` | a match of the first day, whose teams have no earlier match | empty states and N/D |
| `dati-parziale` | Dati, with the live TotalCorner route answering 503 | partial dashboard: one tile N/D, banner |
| `simulazione` | the backtest form | form, mode selector, capital fieldset |
| `simulazione-ricerca` | Eredivisie, August 2024, research mode, scrolled to the outcome | research label, certification note, counts and result |
| `confronto` | three configurations on August 2024, research mode, scrolled to the outcome | research label, side-by-side table |

## What makes it reproducible

- **Same data on every run:** the QA archive through the real FutPythonTrader ingestion, the same one as Browser QA.
- **Same clock and language:** the browser clock is fixed at 20 October 2026, 10:00 Europe/Rome, with locale it-IT, so «Oggi», the day strip and every date stay the same. The browser also runs with an Italian environment (`LANG`, `LANGUAGE`), so the native date field reads 01/08/2024 as an Italian user sees it (review N6); the page locale alone does not change it.
- **Same fonts:** the fonts hosted with the site.
- **No motion:** reduced motion, with animations and caret switched off for the screenshot.
- **States on demand:** the QA archive never fails, so a state scene holds one route (loading) or answers it with the API's error envelope (503, code UNAVAILABLE), as the journeys do. A refused filter is the real server's answer to a real pair of filters. Every other route of the scene stays real.
- **Two API values fixed:** each answer's server time and the code version. Only these two `meta` fields are replaced with fixed values; every data value stays the API's. They change on every run and every commit, and their width moves the layout, so a mask would not be enough.
- **Measured:** two runs on the same tree give byte-identical images.

## Thresholds

The images are compared **block by block**. Each block of `block`×`block` pixels is reduced to its mean colour. A block differs when one of its mean channels moves by more than `pixel` (0–255). A scene fails when its differing blocks exceed `ratio` of the blocks, or when its size changes.

The values in `test/visual/manifest.json` are **block 8, pixel 32, ratio 0**: one block over the limit fails the scene.
- The manifest check refuses a `block` above 16, a `pixel` above 64 and a `ratio` above 1%.
- Changing any of them needs a log entry, like a baseline.

**Why blocks.** CI uses the runner's preinstalled Chrome. The rule of the Browser QA gate is no browser download (MP-OWNER-QA-01-AUTHORIZATION), so CI is not pinned to the browser that made the baselines.
- Measured on PR #174 (run 39380642895), Chrome 155 in CI against the Chromium 141 that made the baselines:
  - pixel by pixel, 0.6–6.2% of the pixels differ in every scene, because every glyph edge is drawn slightly differently (antialiasing, hinting);
  - in 8×8 blocks the largest mean difference over the 24 scenes is **26**.
- Two runs with the same browser give byte-identical images: the noise comes from the browser build alone.

**What it detects and what it does not.** Measured by changing the CSS on the busy day of Oggi and the search results, desktop and mobile:

| Change | Largest block delta | Outcome |
|---|---|---|
| rows 1 px taller | 119 | fails |
| team names in bold | 36 | fails (desktop) |
| xG removed from the rows | 102 | fails |
| title 2 px smaller | 136 | fails |
| odds text colour `#C3CEDB` → `#E9EFF6` | 20 | **passes** |
| accent `#FFB547` → `#F5A83A` | 13 | **passes** |
| day strip corner radius 9 → 4 px | 17 | **passes** |

So the gate stops layout, size and missing or added content. It does **not** stop changes that keep the mean colour of each 8×8 block within 32 of the baseline. Measured examples (PR #174 review N4):
- a uniform fill that changes by up to 32 per channel;
- text recoloured by 30–40 per channel (`oddcolor`, block delta 20);
- the accent shift and small radii;
- a changed character («Favorito» → «Favorita», 4–7);
- the decimal comma turned into a point on every number (15);
- the native date field in US instead of Italian order (22.5).

The journeys check every value and the decimal comma; QA-V does not replace them.

The sensitivity above was measured with the browser of the baselines, where the noise is 0. In CI the glyph noise reaches 26, so a change whose largest block delta is close to 32, such as bold team names at 35.7, can go either way there (review N5). Only the changes far over the threshold (layout, missing content, sizes: 75–136) are certain to fail in CI too.

The thresholds and their measurements are also in the log ([visual-baselines.md](visual-baselines.md)).

## Protection against arbitrary updates

- **The manifest is the list of baselines.** Each file has its SHA-256. It must list exactly the scenes × viewports of the code. A changed, missing or unlisted file, a missing scene, or a baseline that no scene captures fails `node tools/qa/visual.mjs verify`. So removing a view from the code requires a manifest change, and with it a log entry (review F1).
- **A comparison never writes a baseline.** Captures and diffs go to the run folder, and the CI artifact is `visual-qa-<head>`.
- **`promote` is the only way to change a baseline:** `node tools/qa/visual.mjs promote <run> --reason <why> --approval <PR or issue> [--pixel N --ratio R]`.
  - It takes the captures of a finished run on a clean tree and checks them against their report.
  - It rewrites the manifest and appends an entry to the log: reason, approval, run, thresholds, and every changed baseline with its new SHA-256.
- **CI refuses an undeclared change.** `node tools/qa/visual.mjs check-update` runs in Fast checks with the PR base and head. A change under `test/visual/` passes only if the same PR adds a log entry with an approval reference and the new SHA-256 of every changed baseline. A changed threshold needs a `Thresholds` line stating the manifest's values. The log only grows: rewriting an earlier entry is refused even when no baseline changes (review N1, N2).
- **Not covered by a check:** a threshold or a comparison loosened inside the code (`tools/qa/png.mjs`, `tools/qa/visual.mjs`). The unit tests catch some of these changes; review covers the rest (review N3).

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
- A browser update in CI can move antialiasing beyond the thresholds: the margin measured today is 26 against 32. The job then fails with the diff images. A new baseline needs a `promote` with its reason and approval: never an automatic update.
- Subtle colour changes pass (see the table above).
