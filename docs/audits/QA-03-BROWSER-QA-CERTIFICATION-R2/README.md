# QA-03-BROWSER-QA-CERTIFICATION-R2: essential evidence

Second round of QA-03, after the independent review D2 on `fcaf998` (B-1, B-2). Conclusions are in [`docs/qa/certification.md`](../../qa/certification.md).

## B-1: isolated demonstration on PR #166

| Commit | What | CI run | Browser QA | Fast checks | PostgreSQL suite | CI gate | Merge state |
|---|---|---|---|---|---|---|---|
| `0137ec3` | controlled defect 2: menu label "Data providers" | 39292673549 | **failure** (navigation 2/10) | success | success | **failure**, only `FAIL browser_qa` | **blocked** |
| `04016de` | fix | 39293271271 | success | success | success | success | clean |

## B-2: truly blind AI evaluation (run 2)

- **Setup:** two reviewers, one bundle each, with an identical neutral prompt and restricted access.
- **Recall:** 4/4 on the seeded bundle (`ai-review-rv-k3.json`).
- **False positives:** none of the seeded classes reported on the clean bundle (`ai-review-rv-p8.json`).
- **Files written at packaging:** `scoring.json` and `demo-runs-2.json`.

## Errata

The archived `QA-03-BROWSER-QA-CERTIFICATION/INDEX.md` contains two errors, corrected here:
- **`src/`:** it says `src/` was identical to `main` at every commit. In fact `61ddc17` changes it on purpose.
- **Run 1:** its blind evaluation (run 1) is not valid as a blind test. Run 2 replaces it.

## Complete package

[`evidence/audits` @ `d589a02`](https://github.com/zarbopiero963-droid/MatchPilot/tree/d589a0220b36640d84256e189bee390464dd81fc/QA-03-BROWSER-QA-CERTIFICATION-R2): the reviewers' crops, the prompt, the key, the local RED/GREEN runs and the evidence of the gap. ZIP SHA-256: `8212315df18aa420c1249fd692cbfff0e638f9a6e252db46eb6c884c431fe0a9`.

**Read-back (19/10/2026):** fresh clone, `sha256sum -c` OK on 296 files, ZIP checksum OK.
