# QA-03-BROWSER-QA-CERTIFICATION: essential evidence

**What it was:** the end-to-end certification of the Browser QA gate on PR #166, and the blind evaluation of the AI exploratory review. The matrix and the conclusions are in [`docs/qa/certification.md`](../../qa/certification.md).

**What is here** (originals, except the two files written at packaging):
- `exploration-bundle-1.json` (seeded) and `exploration-bundle-2.json` (clean): the blinded crawler reports given to the reviewer;
- `ai-review-bundle-1.json` and `ai-review-bundle-2.json`: the two blind reviews, both accepted by `verify-exploration.mjs --review`;
- `answer-key.json`: the seeded defects S1–S4 and the scoring (4/4 found on the seeded bundle, none reported on the clean one). Written at packaging from the original `KEY.txt` and `tools/qa/ai-eval-seeds.mjs`;
- `demo-runs.json`: the PR #166 runs, written at packaging from the recorded GitHub results:
  - `61ddc17`, controlled defect: Browser QA 0/10, CI gate failure, merge blocked;
  - `e761a29`, fix: everything green, mergeable.

**Complete package:** branch [`evidence/audits`](https://github.com/zarbopiero963-droid/MatchPilot/tree/50dc711cd3747195cc64ee9c2ac05c3f8430937c/QA-03-BROWSER-QA-CERTIFICATION) at commit `50dc711`. ZIP SHA-256: `879f5a7c17a3c01ed32392b99342397285ae2325030e1fac12ed19a5f77ac718`.

**Read-back (19/10/2026):** fresh clone of `evidence/audits` → `sha256sum -c MANIFEST.sha256` OK on 241 files, ZIP checksum OK, package identical to the staged originals.
