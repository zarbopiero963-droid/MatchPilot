# Audit evidence

Owner decision MP-OWNER-PERMANENT-EVIDENCE-01: every important piece of evidence produced by AI agents, from audits, certifications, Browser QA or reviews, is kept durable, verifiable and recoverable. Temporary container folders and CI artifacts (14-day retention) are never an archive by themselves.

## Where evidence lives

| What | Where |
|---|---|
| **Essential evidence** (report, key comparisons) | `docs/audits/<audit-id>/` on `main`, through a governed PR. Each file is at most 1 MiB and each package at most 4 MiB, enforced by the check below |
| **Complete package** (every screenshot, scripts, ZIP) | branch [`evidence/audits`](https://github.com/zarbopiero963-droid/MatchPilot/tree/evidence/audits), outside the history of `main`; it only grows. Packages are referenced by commit permalink, so a later rewrite of the branch cannot alter what `main` points to: the check fails instead |

## Package rules

Every package in `docs/audits/<audit-id>/` has:
- `evidence.json` (schema `mp-evidence-v1`): `audit_id`, `commit_sha` of the commit analysed, `date`, `environment`, `outcome`, and `archive` (branch, commit, path, permalink, SHA-256 of the ZIP);
- `MANIFEST.sha256`: every other file of the folder, in `sha256sum` format;
- original files only, never regenerated. A missing original is declared LOST in the package `README.md`, and no new image is presented in its place.

**When it counts as archived:** only once the complete package has been read back from `evidence/audits` (fresh clone, `sha256sum -c MANIFEST.sha256`) and the essential package passes the check.

**Tooling:**
- `node tools/governance/evidence.mjs pack <dir> …` writes `evidence.json` and the manifest;
- `node tools/governance/evidence.mjs verify docs/audits --archive` (`npm run governance:evidence`) checks every package and this index. It also reads every archive back from git: the commit must be on `evidence/audits`, and every file of its manifest and the ZIP must match. It runs in CI Fast checks on every PR (`test/governance-evidence.test.mjs`).

**Branch protection (owner action, not yet in place):** nothing technical stops a force push or a deletion of `evidence/audits` today. The owner can add a ruleset in the repository settings that blocks force push and deletion on `evidence/audits`, as for `main`. Until then, "only grows" is a rule, and the CI check is the detector.

**Before publishing:** check secrets, personal data, sensitive URLs and sizes. No paid resource.

## Index

| Package | Audit | Commit analysed | Date | Complete package |
|---|---|---|---|---|
| [MP-OWNER-VISUAL-BASELINE-AUDIT-01](MP-OWNER-VISUAL-BASELINE-AUDIT-01/README.md) | visual audit, approved mockup vs real site | `3d8f5c9` | 2026-10-19 | [`evidence/audits` @ `0c9e5d3`](https://github.com/zarbopiero963-droid/MatchPilot/tree/0c9e5d3e1920d29f2857fbc7e72eee83452d4476/MP-OWNER-VISUAL-BASELINE-AUDIT-01): 56 screenshots, 6 comparisons, ZIP `9478d854…` |
