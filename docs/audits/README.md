# Audit evidence

Owner decision MP-OWNER-PERMANENT-EVIDENCE-01: every important piece of evidence produced by AI agents, from audits, certifications, Browser QA or reviews, is kept durable, verifiable and recoverable. Temporary container folders and CI artifacts (14-day retention) are never an archive by themselves.

## Where evidence lives

| What | Where |
|---|---|
| **Essential evidence** (report, key comparisons) | `docs/audits/<audit-id>/` on `main`, through a governed PR. Each file is at most 1 MiB and each package at most 4 MiB, enforced by the check below |
| **Complete package** (every screenshot, scripts, ZIP) | branch [`evidence/audits`](https://github.com/zarbopiero963-droid/MatchPilot/tree/evidence/audits), outside the history of `main`, protected against deletion and force push; it only grows. Packages are referenced by commit permalink, so a later rewrite of the branch cannot alter what `main` points to: the check fails instead |

## Package rules

Every package in `docs/audits/<audit-id>/` has:
- `evidence.json` (schema `mp-evidence-v1`): `audit_id`, `commit_sha` of the commit analysed, `date`, `environment`, `outcome`, and `archive` (branch, commit, path, permalink, SHA-256 of the ZIP);
- `MANIFEST.sha256`: every other file of the folder, in `sha256sum` format;
- original files only, never regenerated. A missing original is declared LOST in the package `README.md`, and no new image is presented in its place.

**When it counts as archived:** only once the complete package has been read back from `evidence/audits` (fresh clone, `sha256sum -c MANIFEST.sha256`) and the essential package passes the check.

**Tooling:**
- `node tools/governance/evidence.mjs pack <dir> …` writes `evidence.json` and the manifest;
- `node tools/governance/evidence.mjs verify docs/audits --archive` (`npm run governance:evidence`) checks every package and this index. It also reads every archive back from git: the commit must be on `evidence/audits`, and every file of its manifest and the ZIP must match. It runs in CI Fast checks on every PR (`test/governance-evidence.test.mjs`).

**Branch protection:** ruleset `25414280` "MatchPilot evidence archive protection", created by the owner on 19/10/2026. Verified through the GitHub API (`repos/…/rulesets/25414280` and `repos/…/rules/branches/evidence/audits`):
- `enforcement: active`;
- target `refs/heads/evidence/audits` exactly, nothing excluded;
- rules `deletion` and `non_fast_forward`, so the branch cannot be deleted or force-pushed;
- `bypass_actors: []`.

Packages are also referenced by commit permalink, and the CI check fails if an archive no longer matches.

**Before publishing:** check secrets, personal data, sensitive URLs and sizes. No paid resource.

## Index

| Package | Audit | Commit analysed | Date | Complete package |
|---|---|---|---|---|
| [MP-OWNER-VISUAL-BASELINE-AUDIT-01](MP-OWNER-VISUAL-BASELINE-AUDIT-01/README.md) | visual audit, approved mockup vs real site | `3d8f5c9` | 2026-10-19 | [`evidence/audits` @ `0c9e5d3`](https://github.com/zarbopiero963-droid/MatchPilot/tree/0c9e5d3e1920d29f2857fbc7e72eee83452d4476/MP-OWNER-VISUAL-BASELINE-AUDIT-01): 56 screenshots, 6 comparisons, ZIP `9478d854…` |
| [QA-03-BROWSER-QA-CERTIFICATION](QA-03-BROWSER-QA-CERTIFICATION/README.md) | Browser QA end-to-end certification (PR #166) and blind AI review evaluation | `e761a29` | 2026-10-19 | [`evidence/audits` @ `50dc711`](https://github.com/zarbopiero963-droid/MatchPilot/tree/50dc711cd3747195cc64ee9c2ac05c3f8430937c/QA-03-BROWSER-QA-CERTIFICATION): blinded bundles, reviews, key, local RED/GREEN runs, ZIP `879f5a7c…` |
| [QA-03-BROWSER-QA-CERTIFICATION-R2](QA-03-BROWSER-QA-CERTIFICATION-R2/README.md) | QA-03 round 2: isolated Browser QA → CI gate demonstration, truly blind AI evaluation (run 2), errata | `04016de` | 2026-10-19 | [`evidence/audits` @ `d589a02`](https://github.com/zarbopiero963-droid/MatchPilot/tree/d589a0220b36640d84256e189bee390464dd81fc/QA-03-BROWSER-QA-CERTIFICATION-R2) |
| [V-A-AUDIT-A1-A2-FIX](V-A-AUDIT-A1-A2-FIX/README.md) | V-A: audit A-1 and A-2 fixed, RED/GREEN Browser QA; verbatim QA-03 run-2 prompts | `4426197` | 2026-10-19 | [`evidence/audits` @ `df133c4`](https://github.com/zarbopiero963-droid/MatchPilot/tree/df133c4fe67a6f6bd15087996d12f52a6f8ea7fc/V-A-AUDIT-A1-A2-FIX) |
| [V-B1-UI-NO-RAW-TEXT](V-B1-UI-NO-RAW-TEXT/README.md) | V-B1: no technical text in user views (MP-OWNER-UI-NO-RAW-TEXT-01), before/after and RED/GREEN Browser QA | `629be0d` | 2026-10-19 | [`evidence/audits` @ `1129bab`](https://github.com/zarbopiero963-droid/MatchPilot/tree/1129bab6e2ca0fc743922282ba7bb11362d362c4/V-B1-UI-NO-RAW-TEXT) |
| [V-B2a-HOME-NAV-DATI](V-B2a-HOME-NAV-DATI/README.md) | V-B2a: home Oggi, menu Oggi · Ricerca · Dati, technical area with tabs, phone bottom bar; before/after and RED/GREEN Browser QA | `58f5ebd` | 2026-10-19 | [`evidence/audits` @ `4ee5907`](https://github.com/zarbopiero963-droid/MatchPilot/tree/4ee5907b445207ce746ae4acf567c586ab3a8b38/V-B2a-HOME-NAV-DATI) |
| [V-B2b-PROVIDER-LABELS](V-B2b-PROVIDER-LABELS/README.md) | V-B2b: Italian labels of the provider tree, review notes of PR #170; before/after and RED/GREEN Browser QA | `28ad1ae` | 2026-10-19 | [`evidence/audits` @ `fa6405d`](https://github.com/zarbopiero963-droid/MatchPilot/tree/fa6405d9e7486fc65d4811350039c68ba58324a6/V-B2b-PROVIDER-LABELS) |
| [V-B3-IDENTITY](V-B3-IDENTITY/README.md) | V-B3: identity of the approved mockup (tokens, amber accent, logo, local fonts); before/after and RED/GREEN Browser QA | `34c0cfe` | 2026-10-19 | [`evidence/audits` @ `73e4a9c`](https://github.com/zarbopiero963-droid/MatchPilot/tree/73e4a9cc067c26ee0a493757f2f0e5e5de8e1577/V-B3-IDENTITY) |
| [V-B4-DAILY-BOARD](V-B4-DAILY-BOARD/README.md) | V-B4: compact Daily Board rows and day strip of the mockup, search results as cards on a phone; before/after and RED/GREEN Browser QA | `fe8eba2` | 2026-10-19 | [`evidence/audits` @ `a9feb5f`](https://github.com/zarbopiero963-droid/MatchPilot/tree/a9feb5f2a5b70adb759b61714056ec2c3c31e661/V-B4-DAILY-BOARD) |
| [QA-V-VISUAL-BASELINES](QA-V-VISUAL-BASELINES/README.md) | QA-V: versioned visual baselines, CI measurement, thresholds and sensitivity; local and CI GREEN | `9dac79d` | 2026-10-20 | [`evidence/audits` @ `a363809`](https://github.com/zarbopiero963-droid/MatchPilot/tree/a3638092f4178d6d253e5992e9fcd0ebc6c10765/QA-V-VISUAL-BASELINES) |
| [QA-V-VISUAL-BASELINES-R2](QA-V-VISUAL-BASELINES-R2/README.md) | QA-V after review D2 (PR #174): review fixes, baselines with the date field in Italian; RED/GREEN local and CI | `dce4e30` | 2026-10-20 | [`evidence/audits` @ `c4c8e1b`](https://github.com/zarbopiero963-droid/MatchPilot/tree/c4c8e1bdac0755cbeebb3692e1a394fe1fe7fe58/QA-V-VISUAL-BASELINES-R2) |
| [QA-V2-STATES-MATRIX](QA-V2-STATES-MATRIX/README.md) | QA-V2: loading, error, refused-filter and partial states in the visual baselines; certifiability matrix | `6680fe9` | 2026-10-20 | [`evidence/audits` @ `a014d6d`](https://github.com/zarbopiero963-droid/MatchPilot/tree/a014d6d9c82099d04c451172b6e252078e17328e/QA-V2-STATES-MATRIX) |
| [QA-V2-STATES-MATRIX-R2](QA-V2-STATES-MATRIX-R2/README.md) | QA-V2 after review D2 (PR #175): real refused filter, hardened matrix test; RED/GREEN local and CI | `2c5103b` | 2026-10-20 | [`evidence/audits` @ `1a3dad9`](https://github.com/zarbopiero963-droid/MatchPilot/tree/1a3dad9342efcf32b7141a55c92469b79cc5b45a/QA-V2-STATES-MATRIX-R2) |
