# V-B3-IDENTITY-R2 — evidence package

| Field | Value |
|---|---|
| Audit | V-B3 after the independent review D2 of PR #172 (NB-1 login logo, NB-3 identity tests, NB-4 login width). Supplements V-B3-IDENTITY (34c0cfe) |
| Commit | c5894d1816f087cb957dbb3859e4f10b4f43a7f2 (clean tree, verifier ok) |
| Date (UTC) | 2026-10-19 |
| Environment | Claude Code cloud container (Linux), PostgreSQL 16 throwaway schema with the QA archive, Chromium 141.0.7390.37, desktop 1280×800 and mobile 390×844 |
| Outcome | GREEN: 10/10, verifier ok. Without the login fix the web-e2e login test fails (logo «MATCH\nPILOT»); with the focus ring removed the identity step fails |

Contents
- `green-c5894d1/` and `.log`: Browser QA on the review fix (screenshots and traces).
