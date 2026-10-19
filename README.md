# MatchPilot — permanent audit evidence

Owner decision MP-OWNER-PERMANENT-EVIDENCE-01. This branch holds the complete evidence packages of MatchPilot audits, outside the history of `main`. It has no common history with `main`, is never merged, and only grows: a package is never rewritten or deleted.

Every package has:
- `INDEX.md`: audit ID, commit SHA analysed, date, environment, outcome;
- `MANIFEST.sha256`: SHA-256 of every file;
- the original files, byte-identical to those produced by the audit.

`archives/` holds the same package as a ZIP, with its SHA-256.

Verify a package: `cd <package> && sha256sum -c MANIFEST.sha256`.

The index of the essential evidence, and the link to each package here, is `docs/audits/README.md` on `main`.

| Package | Audit | Date (UTC) | Files |
|---|---|---|---|
| [MP-OWNER-VISUAL-BASELINE-AUDIT-01](MP-OWNER-VISUAL-BASELINE-AUDIT-01/INDEX.md) | visual audit, mockup vs real site, `main` 3d8f5c9 | 2026-10-19 | 56 screenshots, 6 comparisons, report, capture script |
| [QA-03-BROWSER-QA-CERTIFICATION](QA-03-BROWSER-QA-CERTIFICATION/INDEX.md) | Browser QA end-to-end certification (PR #166) and blind AI review evaluation | 2026-10-19 | 2 blinded bundles + reviews, answer key, local RED/GREEN runs |
| [QA-03-BROWSER-QA-CERTIFICATION-R2](QA-03-BROWSER-QA-CERTIFICATION-R2/INDEX.md) | QA-03 round 2: isolated Browser QA → CI gate demo, truly blind AI evaluation (run 2), errata of the first package | 2026-10-19 | 2 blind reviews with crops, scoring, local RED/GREEN runs, gap evidence |
