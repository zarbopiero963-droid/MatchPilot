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
| [V-A-AUDIT-A1-A2-FIX](V-A-AUDIT-A1-A2-FIX/INDEX.md) | V-A: audit A-1 and A-2 fixed (RED/GREEN Browser QA), verbatim QA-03 run-2 prompts | 2026-10-19 | 2 Browser QA runs with screenshots and traces, 2 prompts |
| [V-B1-UI-NO-RAW-TEXT](V-B1-UI-NO-RAW-TEXT/INDEX.md) | V-B1: no technical text in user views (MP-OWNER-UI-NO-RAW-TEXT-01), before/RED/GREEN Browser QA | 2026-10-19 | 4 Browser QA runs with screenshots and traces, 12 before/after crops |
| [V-B2a-HOME-NAV-DATI](V-B2a-HOME-NAV-DATI/INDEX.md) | V-B2a: home Oggi, menu Oggi · Ricerca · Dati, technical area with tabs, phone bottom bar; before/RED/GREEN Browser QA | 2026-10-19 | 3 Browser QA runs with screenshots and traces, 10 crops |
| [V-B2a-HOME-NAV-DATI-R2](V-B2a-HOME-NAV-DATI-R2/INDEX.md) | V-B2a after review D2 round 1 (PR #170): GREEN Browser QA of 747e4e5 | 2026-10-19 | 1 Browser QA run with screenshots and traces |
| [V-B2b-PROVIDER-LABELS](V-B2b-PROVIDER-LABELS/INDEX.md) | V-B2b: Italian labels of the provider tree, review notes of PR #170; before/RED/GREEN Browser QA | 2026-10-19 | 3 Browser QA runs with screenshots and traces, 5 crops |
| [V-B2b-PROVIDER-LABELS-R2](V-B2b-PROVIDER-LABELS-R2/INDEX.md) | V-B2b after review D2 round 1 (PR #171): GREEN Browser QA of 4f3badb | 2026-10-19 | 1 Browser QA run with screenshots and traces |
| [V-B2b-PROVIDER-LABELS-R3](V-B2b-PROVIDER-LABELS-R3/INDEX.md) | V-B2b after review D2 round 2 (PR #171): GREEN Browser QA of 2d009fb | 2026-10-19 | 1 Browser QA run with screenshots and traces |
| [V-B3-IDENTITY](V-B3-IDENTITY/INDEX.md) | V-B3: identity of the approved mockup (tokens, amber accent, logo, local fonts); before/RED/GREEN Browser QA | 2026-10-19 | 3 Browser QA runs with screenshots and traces, 10 crops |
| [V-B3-IDENTITY-R2](V-B3-IDENTITY-R2/INDEX.md) | V-B3 after review D2 (PR #172): GREEN Browser QA of c5894d1 | 2026-10-19 | 1 Browser QA run with screenshots and traces |
| [V-B4-DAILY-BOARD](V-B4-DAILY-BOARD/INDEX.md) | V-B4: compact Daily Board rows and day strip of the mockup, search results as cards on a phone; before/RED/GREEN Browser QA | 2026-10-19 | 5 Browser QA runs with screenshots and traces, 10 crops |
| [V-B4-DAILY-BOARD-R2](V-B4-DAILY-BOARD-R2/INDEX.md) | V-B4 after review D2 (PR #173): RED of the review notes and GREEN Browser QA of c02db2f | 2026-10-20 | 4 Browser QA runs with screenshots and traces |
