# QA-V-VISUAL-BASELINES — evidence package

| Field | Value |
|---|---|
| Audit | QA-V (MP-OWNER-QA-VISUAL-EXECUTION-01, MP-OWNER-AUTONOMOUS-UI-ROADMAP-01): versioned visual baselines of 8 approved views on desktop, tablet and mobile (24), SHA-256 manifest, explicit thresholds, comparison in the Browser QA job, baseline changes only through `promote` with a reason, an approval and a log entry checked in CI |
| Commits | baselines made on 3bf69f43378700ff2e568eb6728ec74e839f00d4 (Chromium 141.0.7390.37); local GREEN on 9dac79d7fe3309b7784e04f6cf26b821391e7047 (visual 24/24, Browser QA 10/10, verifier ok); CI GREEN on 8c761ba4b23e635be305f57e42273065e372c797 (run 39381265101, Chrome 155.0.8059.84, visual 24/24); CI measurement pixel by pixel on 9cde8d2176793e0c98a415139a7ac28fd909d827 (run 39380642895, Chrome 155.0.8059.39, 24/24 over 0.1%) |
| Date (UTC) | 2026-10-20 |
| Environment | local: Claude Code cloud container (Linux), PostgreSQL 16 throwaway schema, Chromium 141; CI: GitHub Actions ubuntu-latest, PostgreSQL 17 service, runner Chrome 155; QA archive through the real ingestion path; fixed clock 2026-10-20 10:00 Europe/Rome; API meta generated_at and code_version fixed |
| Outcome | Pixel by pixel the CI browser differs from the baseline browser on every glyph edge (0.6–6.2% of pixels): not usable. In 8×8 blocks the largest mean delta is 26 (both CI runs); thresholds block 8, pixel 32, ratio 0: CI 24/24 PASS. Sensitivity (same browser): rows 1 px taller, bold team names, xG removed, title 2 px smaller fail; odds colour, accent shift and corner radius pass (block deltas 20, 13, 17) |

Contents
- `green-visual-9dac79d/`, `green-browser-qa-9dac79d/`: local runs on the committed head (report, captures or screenshots and traces).
- `ci-visual-8c761ba-run39381265101/`: the CI comparison artifact (`visual-qa-<head>`), PASS.
- `ci-pixel-measure-9cde8d2-run39380642895/`: the first CI comparison, pixel by pixel, with its diffs (the measurement behind the block comparison).
- `sensitivity/<change>/`: the CSS changes of docs/qa/visual.md on Oggi and the search results, desktop and mobile, with the final thresholds (uncommitted trees, demonstrations): base, accent, pad2px, weight, oddcolor, noxg, radius, h1.
