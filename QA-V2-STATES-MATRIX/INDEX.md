# QA-V2-STATES-MATRIX — evidence package

| Field | Value |
|---|---|
| Audit | QA-V2 (MP-OWNER-CONTINUOUS-EXECUTION-02 P1, §4): loading, error, refused-filter and partial-dashboard states in the visual baselines (12 new baselines, the 24 earlier ones unchanged); certifiability matrix with its governance test |
| Commits | GREEN local on 6680fe9362a19304117d0750ac702899fb0041f7 (visual 36/36, Browser QA 10/10, verifier ok); CI on 6680fe9 (run 39388983169, Chrome 155.0.8059.84, visual 36/36, largest block delta 26.1); baselines promoted from a run on 88eb59d9b1d78f1bdf933273a9d6375a3799d8ec |
| Date (UTC) | 2026-10-20 |
| Environment | local: Claude Code cloud container, PostgreSQL 16, Chromium 141; CI: GitHub Actions, PostgreSQL 17, runner Chrome 155 |
| Outcome | PASS; RED: visual-gate test fails until the manifest lists the new scenes; 4 tampered matrices fail test/governance-certifiability.test.mjs |
