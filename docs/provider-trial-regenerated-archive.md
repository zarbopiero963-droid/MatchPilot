# #40 — regenerated frozen archive: implementation and runbook

## Identity and authorization

- Original: ORIGINAL CERTIFIED ARCHIVE — UNRECOVERABLE FROM CURRENT INSTANCE ACCESS (m7rgj).
- New output: REGENERATED CERTIFIED ARCHIVE FROM SAME FROZEN DATASET.
- Base: post-#124 `1d835a70b68c70a449d627e32d27884b64269a43`, temporary trial branch. No automatic deploy on main or trial; autoDeploy remains off.
- Owner authorized preparation of one technical PR, not a new run before review and merge authorization. Do not merge automatically. No point10, #20, shutdown, collection or mutation of frozen data.
- Target: Google Drive, logical path `MatchPilot/Archives/BetsAPI-Trial-2026-10-05_06/`, with a separately named regenerated run directory. Resolve/create the actual folder through the Drive connector; do not invent its ID.

## Read-only preflight — 07/10/2026

Project `damp-pond-29296680`, database `neondb`, schema `provider_trial`.

| Check | Evidence |
|---|---|
| final_freeze_v1 | exists, read only; never recreated by the runner |
| freeze_at_utc | 2026-10-06T11:18:19.484Z |
| max_raw_record_id / total_raw | 82862 / 82862 |
| actual count/min/max | 82862 / 1 / 82862 |
| records after ID/time freeze | 0 / 0 |
| DB mutation needed | none |

| Dataset | Real primary key / view key |
|---|---|
| records | record_id |
| odds_observations | observation_id |
| sports | provider, sport_id |
| competitions | provider, sport_id, country_code, league_id |
| coverage | provider, sport_id, country_code, league_id |
| events | provider, event_id |
| reconciliation_state | key |
| odds_summary | VIEW: provider, event_id, bookmaker, market_key, selection_key, line_value; zero duplicate keys observed |

The stored freeze metadata includes odds_summary twice in its historical datasets array. Preserve that metadata as read; runtime dataset enumeration must match the actual eight objects, not rewrite the freeze.

### Determinism blocker — OWNER DECISION REQUIRED

Existing odds_summary uses array_agg ordered by effective_at/observed_at, without a unique final tie-break. Read-only queries found 31 price-tie groups in the observation timeline, zero at opening/latest boundaries, but **12 at the closing boundary**. A repeated DB query can select a different closing price. This invalidates an unconditional deterministic claim even with correct keyset paging.

The guard detects ambiguous selected prices, including mixed NULL/non-NULL ties, before creating output. It fails with OWNER_DECISION_REQUIRED. This PR does not choose observation_id order, min/max, or another rule; selecting one would change derived semantics and needs an explicit owner decision. Until then, the complete regenerated run is BLOCKED. That finding does not retract the historical scoped point9 PASS, which compared each run's export to that run's DB query.

## Separate runner and unchanged data semantics

`scripts/provider-trial-regenerate-archive.mjs` does not import the collector/startup, call providers, initialize tables, rebuild odds, create a freeze or perform DML/DDL on PostgreSQL. It uses one client, one `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`, checks transaction_read_only, and ends with ROLLBACK. All keyset export and independent DB-key cursors share that snapshot; reconciliation does not COMMIT the enclosing snapshot.

The guard verifies the exact freeze, all eight dataset objects, real PKs and acquisition timestamps before export. It reads the full unchanged frozen normalized tables; future event/kickoff dates are valid payload, not new acquisition. Runtime data remains authoritative; failure does not filter contaminated data away to manufacture PASS.

The analytics portable option changes physical storage only: canonical relations become materialized DuckDB tables sourced from the same Parquet; downstream SQL/formulas remain unchanged. The original collector's default build path remains unchanged. CHECKPOINT and close precede hashing. Portability is tested after moving the NEW output to another directory with its former path absent. The original m7rgj directory is never accessed or renamed.

Chain: frozen DB → ScoreTrend segregation/canonical → keyset file export → analytics/Parquet → portable DuckDB/CHECKPOINT → secret scan → final checksums → PROVIDER_TRIAL_FINAL_RECONCILIATION PASS/mismatch0 → relocated queries/content equality → complete binary bundle + inventory. The existing order segregates ScoreTrend before raw export; no step is omitted.

## Metadata and checksums

Logical determinism is distinguished from physical byte identity. manifest.created_at, analytics_manifest.created_at, secret_scan.scanned_at and root, final_checksums.created_at, reconciliation.created_at vary by generation. Portable DuckDB deliberately differs physically from the old externally referenced database; native DuckDB/Parquet serialization or unordered derived comparison output may also differ. **Do not claim that any hash difference from the unavailable original is exclusively metadata, or claim byte-for-byte equivalence.** Preserve pg/@duckdb versions from package.json and record Node/version/commit in run evidence outside the certified directory. No new lockfile or dependency upgrade is included here.

The legacy final_checksums excludes its two own outputs and the late-written reconciliation report. The separate transfer inventory hashes **every final file**, including both checksum files and report, after reconciliation. It also records the tar.gz size/hash. It is outside the certified directory to avoid self-referential checksums. No file is rewritten after sealing. A failed partial output is retained, never accepted; use a fresh run directory for retries.

## Execution — only after owner clears blocker, review and merge authorization

Use a machine with installed Node >=22, pinned package dependencies, read access to the confirmed Neon DB and connectivity, and sufficient disk/memory. Use an existing configured DATABASE_URL through secure runtime configuration; never paste/print it. Running the separate command on that machine does not restart Render. Do not use the collector start command or restart the Render service.

1. Pick a new absolute output directory outside /tmp on the execution machine. Its parent must exist; no symlink to /tmp, existing output or sibling bundle/inventory is accepted.
2. Run `node scripts/provider-trial-regenerate-archive.mjs generate /absolute/new-run-directory`.
3. Require all live gate markers, especially PROVIDER_TRIAL_FINAL_RECONCILIATION with PASS and mismatch_count=0. Preserve stdout as sanitized run evidence; never substitute unit-test PASS. The runner rejects secrets through the original secret scanner and logs no connection string on error.
4. Confirm the sibling new-run-directory.tar.gz and new-run-directory.inventory.json exist with complete inventory and bundle digest. The complete output is outside /tmp and downloadable on the execution machine; do not start on an inaccessible Render free instance. Local output is staging, not durable final approval. Never restart/redeploy as a transfer mechanism.

## Drive upload and independent readback — connector orchestration

No Drive credentials are stored in repository code. Use the existing connected Google Drive upload/fetch tools; this is a required operational stage, not implemented by silently inventing a service account.

1. Upload the WHOLE tar.gz and transfer inventory to a separately named regenerated folder under the verified final path. Preserve sharing. Record actual Drive folder/file IDs, MIME, uploaded size and timestamps.
2. Fetch/download the uploaded binary by its actual Drive file ID in an independent download operation. Do not copy the local staged file, query the DB again, or trust upload success/Drive MD5 as SHA evidence. Download the inventory separately; retain the original trusted inventory and compare downloaded inventory bytes to its recorded SHA.
3. Before extraction, compare the downloaded tar.gz size and SHA to the original trusted transfer inventory. Reject any mismatch. `node scripts/provider-trial-regenerate-archive.mjs extract-readback /absolute/downloaded.tar.gz /absolute/original-trusted-inventory.json /absolute/new-readback-directory` verifies that digest before extraction, then checks the file inventory and full package. The digest must match the runner's own archive of regular relative files (its inventory rejects links/special files), not an untrusted third-party archive. The readback parent must exist outside /tmp. Never extract over the source.
4. Run `node scripts/provider-trial-regenerate-archive.mjs verify-readback /absolute/readback-directory /absolute/original-trusted-inventory.json`.
5. This compares exact file set, per-file size/SHA including report/checksum files, manifests/freeze, legacy checksums, report/key gates, all analytics hashes, read-only DuckDB query counts, canonical DB vs Parquet via EXCEPT ALL both directions, and opens every quality/comparison Parquet. It writes no files into the readback package. Confirm source and readback inventory remain unchanged.
6. Record independent Drive-download evidence separately, along with local verification. The local verifier alone intentionally does NOT print SAFE WINDOW ATTESTED: it cannot know the folder actually came from Drive.

Only after both independent Drive provenance and local checks PASS/mismatch0 may the agent report #40 SAFE WINDOW — ATTESTED, with qualification, commit/PR, archive structure/file count, bundle/inventory/per-file hashes, portability, actual Drive path/IDs and readback evidence. Then stop; no #20 or shutdown without subsequent authorization.

## Current status and verification limits

Prepared/tested code; no full dataset generation, no Drive upload/readback, no safe-window attestation. The native relocated DuckDB tests are small fixtures, not certification of the complete trial archive. The closing-tie finding is blocking for a real deterministic run. This PR is a draft until its decision-dependent behavior and reviews are resolved. Mock update: NO, archival tooling does not change product UX.
