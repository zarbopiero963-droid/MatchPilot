# QA-03-BROWSER-QA-CERTIFICATION — evidence package

| Field | Value |
|---|---|
| Audit | QA-03 Browser QA end-to-end certification and blind evaluation of the AI exploratory review (MP-OWNER-QA-VISUAL-EXECUTION-01) |
| Commits | AI evaluation bundles: 82ad736feb92978151340ad6362d9c4dac20df4d; CI demonstration on PR #166: 61ddc17 (controlled defect, RED), e761a29 (fix, GREEN); `src/` identical to main 64df52b at all three |
| Date (UTC) | 2026-10-19, 14:54–15:03 |
| Environment | Claude Code cloud container (Linux), PostgreSQL 16 throwaway schema with the QA archive, Chromium 141.0.7390.37 via playwright-core 1.56.1, desktop 1280×800 and mobile 390×844; CI: GitHub Actions, PostgreSQL 17, runner Google Chrome |
| Outcome | gate: controlled defect detected (0/10), CI gate red, merge blocked, fix green; AI review: 4/4 seeded semantic defects found on the blinded seeded bundle, none reported on the clean bundle; the crawler found 0 on both |

Contents
- `ai-review-bundle-{1,2}.json`, `exploration-bundle-{1,2}.json`: the two blind reviews and the bundles they reviewed (originals).
- `ai-evaluation/bundle-{1,2}/`: the complete blinded bundles (observations, screenshots, traces) as given to the reviewer.
- `ai-evaluation/unblinded-*-exploration.json`, `KEY.txt`, `seed-script-used.mjs`: the original unblinded reports, the original key and the script that produced the bundles.
- `answer-key.json`, `demo-runs.json`: written at packaging from the key, the seeds and the recorded GitHub results.
- `local-runs/`: the local Browser QA evidence of the RED (61ddc17) and GREEN (e761a29) runs, with their logs.
