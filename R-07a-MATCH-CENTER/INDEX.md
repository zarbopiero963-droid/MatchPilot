# R-07a-MATCH-CENTER — evidence package

| Field | Value |
|---|---|
| Audit | R-07a (MP-OWNER-FUNCTIONAL-DELIVERY-03 §4): Match Center, pre-match analysis, first batch of #30. /api/v1/fpt/match-analysis and the page #/match?id= with filters, comparison, source matches and head to head; QA archive only, archive #40 not materialized (R-02) |
| Commits | GREEN: Browser QA 12/12 on 46b5bc1a06f1f05e6370ec46fb072fdaf735fed2 (verifier ok); visual 45/45 on 287a5785dcbce286f6de15c2e543ac965ac02577 (same code); CI run 39397844183 on 46b5bc1 (visual 45/45, Chrome 155.0.8059.39, largest block delta 26.2). RED: journey match-center on the web code of main a1ab9fb (uncommitted tree: fails on desktop and mobile, no match link); visual run on 9b3aeea before promote (9 new scenes without baseline, 3 search baselines changed) |
| Date (UTC) | 2026-10-20 |
| Environment | local: Claude Code cloud container, PostgreSQL 16, Chromium 141; CI: GitHub Actions, PostgreSQL 17, runner Chrome 155 |
| Outcome | PASS on the QA archive (deterministic); real data NOT VERIFIED |
