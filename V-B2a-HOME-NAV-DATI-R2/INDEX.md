# V-B2a-HOME-NAV-DATI-R2 — evidence package

| Field | Value |
|---|---|
| Audit | V-B2a after the independent review D2 round 1 of PR #170 (B-1: Oggi never waits for /api/v1/providers; B-2: inventory verifications; focus above the phone bar). Supplements V-B2a-HOME-NAV-DATI, whose GREEN is on 58f5ebd |
| Commit | 747e4e5c02086c281f6815fa7317b5b9d06db85e (clean tree, verifier ok); PR head f8c0820 adds only a checkpoint and the registry on top of it |
| Date (UTC) | 2026-10-19 |
| Environment | Claude Code cloud container (Linux), PostgreSQL 16 throwaway schema with the QA archive, Chromium 141.0.7390.37, desktop 1280×800 and mobile 390×844 |
| Outcome | GREEN: 10/10, verifier ok. The new steps fail without the fixes: removing the scroll padding (search mobile: max_goals at 821 under the bar at 784.5) and awaiting /api/v1/providers before the matches (daily-board) |

Contents
- `green-747e4e5/` and `.log`: Browser QA on the round-1 fix (screenshots and traces).
