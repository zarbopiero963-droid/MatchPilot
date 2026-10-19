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
