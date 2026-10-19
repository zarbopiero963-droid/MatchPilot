# V-A-AUDIT-A1-A2-FIX — evidence package

| Field | Value |
|---|---|
| Audit | V-A: fix of the visual audit bugs A-1 (mobile search outcome not perceivable) and A-2 (deep provider values squeezed), MP-OWNER-QA-VISUAL-EXECUTION-01 |
| Commits | GREEN: 44261973156ca8ebb627bbcbeca54e40a96a26a6 (clean tree, verifier ok). RED: the same tests on 208a126 + the new tests, without the `src/web` changes (uncommitted tree, so report.json says working_tree_clean false: valid as a RED demonstration, not as gate evidence) |
| Date (UTC) | 2026-10-19, 17:51–18:00 |
| Environment | Claude Code cloud container (Linux), PostgreSQL 16 throwaway schema with the QA archive, Chromium 141.0.7390.37, desktop 1280×800 and mobile 390×844 |
| Outcome | RED: 6 journeys fail (search desktop/mobile: outcome not focused nor in view; providers and navigation desktop/mobile: squeezed text). GREEN: 10/10, verifier ok |

Contents
- `red-without-src-web-fix/` and `.log`: Browser QA run with the new regression tests and without the fixes.
- `green-4426197/` and `.log`: Browser QA run on the committed fix.
- `qa03-r2-prompts/`: the verbatim prompts given to the two blind reviewers of QA-03 run 2. They are extracted from the session transcript (QA-03 review round 2 NB-2: the archived `prompt.txt` of QA-03-BROWSER-QA-CERTIFICATION-R2 is a summary) and are identical except the folder name.
