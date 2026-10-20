# QA-V2-STATES-MATRIX-R2 — evidence package

| Field | Value |
|---|---|
| Audit | QA-V2 after review D2 (PR #175, CHANGES REQUESTED on 76b7435): B1 refused filter from the real server; B2 matrix test refuses every tampering found; N1 partial dashboard shows the tile |
| Commits | RED: red-visual-3c75ac9 (6 scenes over the thresholds before promote: the changed refused-filter and partial-dashboard views). GREEN local on 2c5103b3d5fe8daae127deb64cf99dd173dd6220 (visual 36/36, Browser QA 10/10, verifier ok); CI on 2c5103b (run 39394224581, Chrome 155.0.8059.39, visual 36/36, largest block delta 26.1) |
| Date (UTC) | 2026-10-20 |
| Environment | local: Claude Code cloud container, PostgreSQL 16, Chromium 141; CI: GitHub Actions, PostgreSQL 17, runner Chrome 155 |
| Outcome | PASS after the review fixes |
