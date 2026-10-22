# mp-deploy v3.1-r2: package for a new independent review (MP-VPS-V31-REVIEW-REMEDIATION-01)

OFFLINE ONLY. Nothing here has been installed on the VPS. FREEZE=1 and v3 (`07dbed21`) remain live, as read at 10:29 Rome time on 2026-10-22.
The only VPS access was a read-only SSH session to read the v1 hook, `sudo -l`, the sudoers rules (no secrets), and the runner .env keys and permissions. Results are in `live-readonly-2026-10-22.txt`.

## Files
- `mp-deploy.v31`: production script (r2). `mp-deploy.v3`: the installed v3. `mp-deploy.v31-r1`: the version under review (t97u).
- `mp-runner-guard.sh.in`: hook v2 template. `mp-runner-guard.sh.v1-live`: hook currently on the VPS (`6e32cfff…`). `render-hook.sh`: pin substitution.
- `deploy-authz.mjs`, `runner-job-guard.mjs`, `deploy-gate.mjs`: identical to `scripts/*` on main (`69d88f58…`, `22566f20…`, `1ce2dbf0…`). `deploy-authz.a4123e44.mjs`: legacy verifier, used only by tests.
- `install-v31.sh`: install and rollback.
- Patches: `diff-v3-v31.patch`, `diff-v31r1-v31r2.patch`, `diff-hook-v1-v2.patch`.
- Test only, never installed: `test-shim.sh`, `hook-test-shim.sh`, `fetch-mock.mjs`, `harness.py`, `fixtures/`.
- Tests: `test_v31.py`, `test_hook.py`, `test_install.py`. Mutation: `mutants.py`, `run_mutants.py`, `mutants_rerun.py`, `run_mutants_rerun.py`.
- Results: `test-results-*.txt`, `mutation-*.txt`, `test-env.txt`.
- Documents: `SIDE-EFFECTS-AUDIT.md`, `FINDINGS.md`, `MUTATION-ANALYSIS.md`, `S3-INSTALL-PLAN.md`, `ROLLBACK-PLAN.md`, `CHECKPOINT-PROVVISORIO.md`.

## Reproducing (Linux, non-root user, node ≥ 20, python3 + `cryptography`, git, bash, flock)
```
git clone https://github.com/zarbopiero963-droid/MatchPilot && cd MatchPilot && git checkout <commit>
cd infra/review/mp-deploy-v31
sha256sum -c MANIFEST.sha256
python3 test_v31.py        # 142 tests, ~5-6 min: real code path (git origin, release, symlink switch)
python3 test_hook.py       # 39 tests (B4)
python3 test_install.py    # 19 tests (install, rollback, post-install smoke)
J=6 python3 run_mutants.py # ~35 min; then python3 run_mutants_rerun.py
```
`test_install.py` E06d and I-tests need nothing special. E06d is skipped if the user is not in a second group.
The tests refuse to run as root: the shim exits with 99.
