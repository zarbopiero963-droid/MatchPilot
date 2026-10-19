# QA-03-BROWSER-QA-CERTIFICATION-R2 — evidence package

| Field | Value |
|---|---|
| Audit | QA-03 second round after review D2 on fcaf998: isolated Browser QA → CI gate demonstration (B-1) and truly blind AI evaluation, run 2 (B-2) |
| Commits | blind run 2 bundles: 82ad736feb92978151340ad6362d9c4dac20df4d (the archived QA-03-BROWSER-QA-CERTIFICATION bundles); demonstration: aba64fa (green), 0137ec3 (controlled defect 2, RED), 04016de (fix, GREEN) |
| Date (UTC) | 2026-10-19, 16:58–17:25 |
| Environment | Claude Code cloud container (Linux), PostgreSQL 16 throwaway schema with the QA archive, Chromium 141.0.7390.37, desktop 1280×800 and mobile 390×844; CI: GitHub Actions, PostgreSQL 17, runner Google Chrome |
| Outcome | Browser QA failing alone turned CI gate red (FAIL browser_qa only) and blocked the merge; fix green and mergeable. Blind run 2: 4/4 seeded defects on the seeded bundle, none of the seeded classes on the clean bundle, one bundle per reviewer |

Contents
- `ai-review-rv-k3.json` (seeded) and `ai-review-rv-p8.json` (clean): the two run-2 reviews, originals.
- `scoring.json`, `demo-runs-2.json`, `blind-run-2/prompt.txt`: written at packaging from the key, the reviews and the recorded GitHub results.
- `blind-run-2/KEY2.txt`: the original key of run 2.
- `blind-run-2/rv-*/work`: the reviewers' screenshot crops; rv-p8's script.
- `isolated-demo/`: the local Browser QA evidence of 0137ec3 (RED) and 04016de (GREEN), and of the gap found before 373537d.

The bundles reviewed are the archived `QA-03-BROWSER-QA-CERTIFICATION/ai-evaluation/bundle-1` and `bundle-2`, byte-identical.

Errata for `QA-03-BROWSER-QA-CERTIFICATION/INDEX.md` (archived packages are never rewritten):
- It says `src/` was identical to main at all three commits. In fact `61ddc17` changes `src/web/app.js` on purpose (controlled defect); `src/` is identical to main at `82ad736` and `e761a29`.
- Its AI evaluation (run 1) is not valid as a blind test: one reviewer saw both bundles and was given a primed prompt (review D2 B-2). Run 2 here replaces it.
