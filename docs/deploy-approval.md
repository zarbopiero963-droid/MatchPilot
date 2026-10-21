# Deploy approval gate (MP-DEPLOY-APPROVAL-01/-02)

A merge to `main` is not an authorization to deploy. Before this change, every push to `main` started `deploy-vps.yml`, whose only job ran `mp-deploy` on the VPS runner at once. After it, the deploy job runs only once the owner approves that run on GitHub, and only after the gate has checked GitHub's configuration again, at every attempt.

**Owner decisions**
- GO for the preparation: #97 comments 6313461364 (MP-DEPLOY-APPROVAL-01) and 6314059221 (triage), plus mandate MP-DEPLOY-APPROVAL-02.
- Merge, activation and every change on the VPS, runner or secrets each need a separate owner GO.

Each statement below is marked **[tested]** (a test in this repository), **[documented]** (GitHub documentation, quoted in #97) or **[NOT VERIFIED]** (to be observed in phases C–D, or on the VPS in phase B).

## 1. GitHub side (this branch)

`deploy-vps.yml` still runs only on a push to `main`. It has two jobs.

**`gate`**
- Runs on a GitHub-hosted runner, with no secrets and a read-only token.
- Executes `scripts/deploy-gate.mjs` and requires an explicit `"result": "PASS"` in its report: a script that exits 0 without checking cannot pass **[tested]**.
- Reads from the GitHub API, not from the repository:
  - the run is a push to `main` of this repository;
  - `vps-production` exists;
  - its only required reviewer is the owner, `zarbopiero963-droid`, with *prevent self-review* off;
  - administrators cannot bypass it;
  - only the branch `main` may deploy to it;
  - the run's SHA is still the tip of `main`.

  Each case is **[tested]** against a fake API.
- Missing, different or unreadable answers fail it **[tested]**. This includes the unprotected environment GitHub creates when a workflow names one that does not exist **[documented]**.
- Its report lists the settings it read (reviewers, `prevent_self_review`, `can_admins_bypass`, branch policy), never the token **[tested]**. The first real run is the evidence of what GitHub returns.

**`deploy`**
- Runs on `[self-hosted, matchpilot-vps]`, with `needs: gate` and `environment: vps-production` **[tested, static]**.
- GitHub holds it until a required reviewer approves that run **[documented; NOT VERIFIED on this repository]**.
- Its first step runs the same gate script again, downloaded from the approved SHA (`raw.githubusercontent.com/…/<sha>/scripts/deploy-gate.mjs`), and requires `PASS` before `mp-deploy` **[tested, simulated VPS: fake curl, real node, fake API]**.
- This also covers a re-run of the deploy job alone. Such a re-run does not re-run `gate` (review NB-1), but the step checks again: an environment that has lost its protection and a superseded SHA both stop it **[tested]**.
- No `node`, `curl`, `grep` or `cat`, an unreadable script, or a missing `PASS` stop it **[tested]**.
- Whether `node` and `curl` exist for the runner user `ghrunner` on the VPS is **[NOT VERIFIED]**. If they do not, the deploy stops before `mp-deploy`.
- The `mp-deploy` step is unchanged: same command, same retry on exit 75 **[tested: byte-identical to main, review 6313944252]**.

**Every workflow is checked, not only `deploy-vps.yml`** (review B-1). The check is in `test/governance-workflows.test.mjs`, which the CI fast lane runs.
- Only job `deploy` of `deploy-vps.yml` may use the VPS runner or name `mp-deploy`.
- Every other `runs-on`, in every workflow, must be a literal GitHub-hosted label. That excludes expressions, runner groups and any self-hosted label.
- No workflow may call a reusable workflow, or be started by `workflow_call`, `workflow_run` or `repository_dispatch`.
- Nothing in the deploy path may be `continue-on-error`.

**Proofs** (the B-1 RED→GREEN is shown in the table that follows):
- The reviewer's second workflow `sneak.yml` is refused, and so are 9 other indirect paths and 13 ways to tamper with `deploy-vps.yml` **[tested]**.

| Experiment, in a copy of the branch | 9a7124a | this head |
|---|---|---|
| `sneak.yml` added to `.github/workflows/`, workflow tests run | 12/12 pass (bypass not seen) | test fails: `sneak.yml: job sneak: runs-on [self-hosted, matchpilot-vps] is not allowed`, `names mp-deploy` |
| `deploy-gate.mjs` run from a path with spaces | exit 0, no output (NB-2) | exit 1, `GATE_ERROR …` |
| new tests against the 9a7124a workflow | — | 5 tests fail (no post-approval gate, no explicit PASS) |

## 2. Required environment configuration (owner, phase C)

Only the repository owner can configure environments in a personal-account repository **[documented]**. The agents' GitHub access gets HTTP 403 on the environments API **[observed 21/10]**.

Settings → Environments → `vps-production`:

| Setting | Value | Gate code if different |
|---|---|---|
| Required reviewers | `zarbopiero963-droid` only | `GATE_NO_REQUIRED_REVIEWERS`, `GATE_UNEXPECTED_REVIEWER` |
| Prevent self-review | **off** (review NB-4: the owner merges and approves; with it on, nobody could approve) | `GATE_SELF_REVIEW` |
| Allow administrators to bypass configured protection rules | **off** | `GATE_ADMIN_BYPASS` |
| Deployment branches and tags | Selected branches and tags, one branch rule `main` | `GATE_BRANCH_POLICY` |
| Wait timer, environment secrets | none | — |

**Not documented by GitHub, and so [NOT VERIFIED] until phase C** (in each case the gate fails closed):
- whether `GITHUB_TOKEN` (`actions: read`) can read the environment and its branch policies;
- whether the answer contains `can_admins_bypass` and `prevent_self_review`;
- whether a re-run asks for the approval again.

## 3. VPS side: proof of authorization (design for phase B, not wired)

**Why a VPS-side proof is needed.** A run created before the gate keeps its old workflow. A re-run of such a run would deploy without any approval. This is how run 39412733270 deployed on 21/10 (#179 comment 6313551158). Code on GitHub cannot close this path. Only the VPS can, by refusing a deploy that lacks a proof that the old run cannot produce.

**The proof is a GitHub Actions OIDC token.**
- The deploy job requests it with a fixed audience (`matchpilot-vps-deploy`). It is a JWT that GitHub signs, valid for minutes.
- GitHub puts `environment: vps-production` and a subject ending in `:environment:vps-production` only in the token of a job that uses that environment **[documented: OIDC reference, "The subject claim includes the environment name when the job references an environment"]**.
- Such a job runs only after the approval **[documented for required reviewers; NOT VERIFIED here]**.
- No static secret is involved. A run older than the gate has no `id-token` permission and no environment, so it cannot obtain such a token.

**The reference verifier is `scripts/deploy-authz.mjs`**, with tests in `test/governance-deploy-authz.test.mjs`. Its tokens are signed with a throwaway key **[tested, simulated]**. It requires:
1. **Identity and provenance:**
   - an RS256 signature by a key in GitHub's JWKS;
   - issuer `https://token.actions.githubusercontent.com` and audience `matchpilot-vps-deploy`;
   - repository by name **and** numeric id (`1401571874`) and owner id (`249075720`);
   - `ref` `refs/heads/main` and `event_name` `push`;
   - `workflow_ref` and `job_workflow_ref` equal to `…/.github/workflows/deploy-vps.yml@refs/heads/main`;
   - `runner_environment` `self-hosted`.

   A different workflow file (`sneak.yml`), a reusable workflow from elsewhere, another repository, a dispatch, a GitHub-hosted runner or a forged, unsigned (`alg: none`/`HS256`) or foreign-key token is refused **[tested]**.
2. **The approval:** `environment` = `vps-production`, plus the subject. A token from a job without the environment (a run older than the gate) is refused **[tested]**.

   Optionally, it also reads the run's approvals from the public API (`GET /repos/…/actions/runs/{run_id}/approvals`) and requires one by the owner for `vps-production` (`approvalProblems`) **[tested]**.
3. **The commit:**
   - `workflow_sha` (and `sha` when present) must equal the SHA `mp-deploy` is asked to deploy. GitHub's reference does not list `sha`; `workflow_sha` is listed.
   - A token for another SHA is refused **[tested]**.
4. **Anti-replay:**
   - the token id (`jti`) and the run attempt (`run_id:run_attempt`) are each accepted once and recorded before the deploy;
   - the token must be issued at most 10 minutes earlier, not be expired, and live at most 15 minutes;
   - a re-run is a new attempt, so it needs its own approval and its own token **[tested]**.
5. **Refusal of unauthorized workflows:** points 1–2, independent of the runner guard's workflow-name check.
6. **Failure and rollback:**
   - any failure, including an unreachable JWKS or ledger, refuses the deploy (fail closed) and leaves the current release running;
   - rollback of phase B is the reinstallation of the previous `mp-deploy` and guard, whose hashes Grok already records (`caf9233f…`, `6e32cfff…`).

**Wiring proposed for phase B** (owner GO, Grok on the VPS, a PR for the workflow), in an order that never leaves a deploy without a proof:

**B1. Grok (VPS):** installs `mp-deploy` v3 and the verifier.
- `mp-deploy` v3 accepts the token on stdin and verifies it in **report-only** mode: it logs the verdict and still deploys as today.
- The verifier is a copy of `scripts/deploy-authz.mjs` pinned by SHA-256, plus a small CLI that:
  - fetches the JWKS from `https://token.actions.githubusercontent.com/.well-known/openid-configuration` → `jwks_uri`;
  - keeps the ledger `/var/lib/mp-deploy/authz-ledger`, root 600, under `flock`.
- The sudo rule stays limited to `mp-deploy`.

**B2. PR (workflow):** the deploy job gets `permissions: id-token: write`. Before `mp-deploy`, it requests the token with
```
curl -sSf -H "Authorization: bearer $ACTIONS_ID_TOKEN_REQUEST_TOKEN" "$ACTIONS_ID_TOKEN_REQUEST_URL&audience=matchpilot-vps-deploy"
```
and pipes its `value` to `sudo -n /usr/local/sbin/mp-deploy <sha>` on stdin. Whether self-hosted runners receive OIDC tokens is **[NOT VERIFIED]**: the docs list `runner_environment: self-hosted` but do not state it.

**B3. Grok:** after one deploy whose report-only verdict is ACCEPT, switches `mp-deploy` to **enforce**.
- From then on, a deploy without a valid, unused token for that SHA is refused.
- That includes a re-run of 39412733270 or any other run older than the gate.

Steps B1–B3 change the VPS, `mp-deploy`, the runner's sudo usage and the workflow's permissions. None of them is done or authorized on this branch.

## 4. Activation plan

**Phase A — code and tests (this branch)**
- Done: the gate, the all-workflow check, the post-approval gate and the reference verifier, with RED→GREEN, mutation tests and a separate review.
- No PR while #178 is open, unless the owner authorizes an exception.

**Phase B — VPS protection (Grok, separate owner GO).** Steps B1–B3 above. Grok first verifies, read-only and as `ghrunner`:
- `command -v node curl grep cat`;
- `curl -sSf https://raw.githubusercontent.com/zarbopiero963-droid/MatchPilot/3dd833f38bf8a7de3b51dfbebd3118e1602185ac/README.md >/dev/null`;
- `curl -sSf https://api.github.com/repos/zarbopiero963-droid/MatchPilot >/dev/null`.

**STOP if** any is missing: the post-approval gate would block every deploy.

Phase B may come after phases C–D. Until B3, a re-run of a run older than the gate remains possible. Today only run 39412733270 exists, and on 21/10 `mp-deploy` answered `ALREADY_DEPLOYED` for it **[observed in the job log]**. Whether `mp-deploy` refuses `3dd833f` once a newer release is current (forward-only) is **[NOT VERIFIED]**.

**Phase C — GitHub bootstrap** (separate owner GO: the PR, then its merge)
1. Open the PR. CI runs (`CI gate`), then a separate review and Gate B on its head.
2. Merge with `vps-production` **not yet configured**. Expected run of the merge commit:
   - `gate` fails with `GATE_ENVIRONMENT_MISSING`, or with `GATE_NO_REQUIRED_REVIEWERS`/`GATE_ADMIN_BYPASS`/`GATE_BRANCH_POLICY` if GitHub created the environment from the workflow;
   - `deploy` is skipped.

   **STOP if** `deploy` starts.
3. The owner configures `vps-production` per section 2.
4. Owner: *Re-run all jobs*. Expected:
   - `gate` PASS, with its report showing the settings;
   - `deploy` *Waiting for review*.

   **STOP if** `gate` fails with `GATE_API_ERROR … 403`: the token cannot read the environment, and the design must change. **STOP if** `deploy` starts without waiting.

**Phase D — certification on GitHub (and the VPS after B)**

| Step | Action | Expected | STOP if |
|---|---|---|---|
| D1 | wait 10 min without acting | `deploy` still waiting (approval missing) | it starts |
| D2 | Reject | run fails, nothing on the VPS (Grok: no new `deploy.log` line) | anything on the VPS |
| D3 | Re-run failed jobs | `deploy` waits again (re-run of the job alone) | it starts without approval |
| D4 | Reject, then Re-run all jobs | `gate` runs again, `deploy` waits again | it starts without approval |
| D5 | Approve | post-approval gate PASS (`DEPLOY_GATE_SHA_OK <sha>`), `mp-deploy` deploys the gate commit (application identical to `3dd833f`); Grok checks guard log, `deploy.log`, release, health | any check fails |
| D6 | (after B3) Grok re-uses a recorded token, or re-runs the token step | refused as `AUTHZ_REPLAY` | accepted |
| D7 | (after B3) re-run of the old run 39412733270 (owner, deliberately) | refused: no token | it deploys |

The cases not exercised on GitHub stay as the test matrix states: runner unavailable, SHA superseded in a real race, an alternative workflow on a real merge.

**Phase E — PR #178.** Only after phases C–D pass, and with its own owner GO. Its merge run waits for approval. Approving it deploys the squash commit of `57aab63`. Not approving it leaves the current release.

**Rollback**
- **Stop every deploy now:** the owner removes the required reviewer or deletes `vps-production`. Every later gate fails closed **[tested, simulated]**. What GitHub does to a job already waiting when its environment is deleted is **[documented: "will automatically fail"; NOT VERIFIED here]**.
- **Back to deploy-on-merge:** a PR reverting this change, with an owner GO. Its own merge runs the old workflow, and so deploys the revert commit without approval.
- **Phase B:** reinstall the previous `mp-deploy` and guard. Their hashes are recorded by Grok in the infra repository.

## 5. Test matrix

**Kinds:**
- **S** — simulated: a test in this repository with a fake API, git, curl or keys.
- **T** — static: the workflow files.
- **G** — real GitHub run.
- **V** — real VPS.

| # | Case | Kind and result | Real check |
|---|---|---|---|
| 1 | second workflow on the VPS runner (B-1) | T: RED on 9a7124a → GREEN | G: none needed (the merge is refused by CI) |
| 2 | several workflows: every runs-on, mp-deploy, reusable, workflow_call/run, repository_dispatch, groups, expressions | T: PASS (10 cases) | — |
| 3 | indirect triggers (dispatch, workflow_run, workflow_call, repository_dispatch, PR events) | T: PASS; S: `GATE_EVENT`; V after B: `event_name` | — |
| 4 | different SHA | S: `GATE_SUPERSEDED` (before and after approval), `AUTHZ_SHA` | G: NOT VERIFIED |
| 5 | environment missing | S: `GATE_ENVIRONMENT_MISSING` | G: phase C2 |
| 6 | environment unprotected or misconfigured | S: reviewers, team, self-review, bypass, branch policies | G: phase C2/C4 |
| 7 | approval rejected | — | G: D2, NOT VERIFIED |
| 8 | approval missing | — | G: D1, NOT VERIFIED |
| 9 | full re-run | T: the VPS job always has the environment and the gate | G: D4, NOT VERIFIED |
| 10 | re-run of the deploy job alone | S: the post-approval gate stops an unprotected environment or a stale SHA | G: D3, NOT VERIFIED |
| 11 | run older than the gate | S: a token without environment is `AUTHZ_CLAIM environment` | V: D7 after B3, NOT VERIFIED; until then open (section 3) |
| 12 | script path with spaces (NB-2) | S: RED on 9a7124a (exit 0, no output) → GREEN (exit 1); workflow requires an explicit PASS | — |
| 13 | API error | S: 401, 403, 404, 500, network, malformed answers → fail closed | G: phase C4 |
| 14 | runner unavailable | T: the job has no fallback runner label, so it stays queued | G/V: NOT VERIFIED |
| 15 | replay of an authorization | S: `jti` and run attempt used twice → `AUTHZ_REPLAY` | V: D6 after B3, NOT VERIFIED |

**Mutations** (gate, verifier, workflow and the check itself): 16/16 killed. Commands and output are in #97.

## 6. Residual risks

1. **Same GitHub identity.**
   - The agents act through the owner's account. They cannot approve a deployment or configure environments (403 **[observed]**).
   - They can merge a PR, since the rulesets require a PR and `CI gate`, not an approval. Until phase B3, a merged workflow that dropped the environment would deploy without approval.
   - The CI check of section 1 turns such a PR red. A PR that also weakened the check itself would pass CI, so only governance stops it: workflows, `scripts/` and `test/governance-*` are owner-GO files.
   - After B3, the VPS refuses a deploy without a token from `vps-production`, whatever the workflow says.
2. **Runs older than the gate** can be re-run until B3 (section 3).
3. **Waiting runs and concurrency.** The concurrency group `deploy-vps` lets one run wait while newer runs queue behind it. How GitHub treats a third run while one is waiting is **[NOT VERIFIED]**. Reject a stale run to let the newer one through; the post-approval gate refuses a stale SHA in any case.
4. **Fork pull requests** cannot reach this workflow, which runs only on push to `main`. The runner rule is unchanged.
