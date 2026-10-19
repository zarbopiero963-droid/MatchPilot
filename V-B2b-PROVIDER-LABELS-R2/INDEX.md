# V-B2b-PROVIDER-LABELS-R2 — evidence package

| Field | Value |
|---|---|
| Audit | V-B2b after the independent review D2 round 1 of PR #171 (B-1: no date leaves its tile; B-2: labels for every key a real database can return). Supplements V-B2b-PROVIDER-LABELS, whose GREEN is on 28ad1ae |
| Commit | 4f3badbe654d7717d366acb257c83a4ebc85caa0 (clean tree, verifier ok) |
| Date (UTC) | 2026-10-19 |
| Environment | Claude Code cloud container (Linux), PostgreSQL 16 throwaway schema with the QA archive, Chromium 141.0.7390.37, desktop 1280×800 and mobile 390×844 |
| Outcome | GREEN: 10/10, verifier ok. The new steps fail without the fixes: the previous date rule (a date leaves its tile) and a missing label (keys of a real database without an Italian label) |

Contents
- `green-4f3badb/` and `.log`: Browser QA on the round-1 fix (screenshots and traces).
