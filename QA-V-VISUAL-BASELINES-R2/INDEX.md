# QA-V-VISUAL-BASELINES-R2 — evidence package

| Field | Value |
|---|---|
| Audit | QA-V after review D2 (PR #174, CHANGES REQUESTED on 99cec9a): F1 the manifest must list exactly the scenes × viewports of the code; N1 the Thresholds line must state the manifest's values; N2 the log only grows; N6 the browser runs with an Italian environment, so the native date field reads dd/mm/yyyy (baselines regenerated); N7, N8 tests and refusal instead of crash; N4, N5 documented limits corrected |
| Commits | GREEN local on dce4e302cd92e613b1d0832b5ec1b3d9481c92d4 (visual 24/24, Browser QA 10/10, verifier ok); CI GREEN on dce4e30 (run 39384100762, Chrome 155.0.8059.39, visual 24/24, largest block delta 26.1); RED: test/visual-gate.test.mjs of dce4e30 against the code of 99cec9a fails 2 of 7 (manifest, check-update) |
| Date (UTC) | 2026-10-20 |
| Environment | local: Claude Code cloud container, PostgreSQL 16, Chromium 141; CI: GitHub Actions, PostgreSQL 17, runner Chrome 155 |
| Outcome | review findings F1, N1, N2, N6, N7, N8 fixed with tests; N4, N5 documented; N3 left to review (documented) |
