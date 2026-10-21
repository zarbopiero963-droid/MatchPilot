# Deploy approval gate (MP-DEPLOY-APPROVAL-01)

A merge to `main` is not an authorization to deploy. Before this change, every push to `main` started `deploy-vps.yml`, whose only job ran `mp-deploy` on the VPS runner at once. After it, the deploy job runs only when the owner approves that run on GitHub.

Owner GO for the preparation: #97, comment 6313461364. It authorizes neither the merge nor the activation; each needs a separate owner GO.

## How it works

`deploy-vps.yml` still runs only on a push to `main`, as two jobs.

**1. `gate`**
- Runs on a GitHub-hosted runner, with no secrets and a read-only token. It executes `scripts/deploy-gate.mjs`.
- It reads from the GitHub API, not from the repository, that:
  - the run is a push to `main` of this repository;
  - the environment `vps-production` exists;
  - its required reviewers are exactly the owner, `zarbopiero963-droid` (no team, no other user);
  - administrators cannot bypass it (`can_admins_bypass: false`);
  - only the branch `main` may deploy to it (selected branches, a single branch rule `main`);
  - the SHA of this run is still the tip of `main`.
- Anything missing, different or unreadable fails the job, and the deploy job never starts.
- GitHub creates an environment named by a workflow when it does not exist, without any protection rule. That environment fails this gate.

**2. `deploy`**
- Runs on the runner `[self-hosted, matchpilot-vps]` and has `needs: gate` and `environment: vps-production`.
- GitHub holds it in *Waiting* until a required reviewer approves it on that run's page. Each run has one commit, so an approval covers exactly one run and one SHA.
- After the approval, and before `mp-deploy`, the first step reads the tip of `main` with `git ls-remote`. A different SHA (`DEPLOY_GATE_STALE_SHA`), git missing or an unreadable `main` stops the job. An old approved run therefore cannot deploy over a newer `main`; the newer merge has its own run to approve.
- The `mp-deploy` step is unchanged: same command, same retry on exit 75.

**Unchanged:**
- the triggers, `push` to `main` only;
- the repository and `refs/heads/main` condition on every job;
- the VPS runner, its job-started guard (event `push`, ref `main`, workflow `deploy-vps.yml`) and the sudo rule limited to `mp-deploy`;
- `mp-deploy` itself (SHA on `main`, forward only), the logs and the release rollback on the VPS.

## Required environment configuration

Only the repository owner can configure environments in a personal-account repository. The agents' GitHub access gets HTTP 403 on the environments API.

Settings → Environments → `vps-production`:

| Setting | Value | Why |
|---|---|---|
| Required reviewers | `zarbopiero963-droid` only | the gate rejects any other user or team |
| Prevent self-review | **off** | the owner both merges and approves; with it on, nobody could approve a run the owner triggered |
| Allow administrators to bypass configured protection rules | **off** | the gate requires `can_admins_bypass: false` |
| Deployment branches and tags | Selected branches and tags, one branch rule `main` | the gate rejects "No restriction", "Protected branches only", tags and patterns |
| Wait timer, environment secrets | none | not needed |

## GitHub features: what the documentation says and what remains to be observed

| Fact | Source | State |
|---|---|---|
| Required reviewers exist on GitHub Free for public repositories | GitHub docs, *Deployments and environments*: "required reviewers are only available for public repositories" (Free, Pro, Team) | documented |
| A workflow that names a missing environment creates it without protection rules | GitHub docs, *Managing environments for deployment* | documented; the gate handles it |
| Only the repository owner configures environments of a personal-account repository | same page | documented |
| A rejected job fails the workflow | GitHub docs, *Reviewing deployments* | documented |
| A re-run of a job with a protected environment asks for the approval again | not stated by the documentation | **to be observed at activation** |
| `GITHUB_TOKEN` (`actions: read`) can read the environment and its branch policies | the docs say "anyone with read access" and do not mention `GITHUB_TOKEN` | **to be observed at activation**; on 403 the gate fails closed |
| The environment answer contains `can_admins_bypass` | not in the documented schema | **to be observed at activation**; if absent the gate fails closed (`GATE_ADMIN_BYPASS: … undefined`) |
| The agents' token cannot approve a deployment | probe on 21/10: `POST …/actions/runs/39412733270/pending_deployments` returned 403 (no deployment was pending) | observed |
| The agents' token can re-run a deploy run | 21/10, 10:16Z: run 39412733270 re-run by mistake (attempt 3, `ALREADY_DEPLOYED`, #179 comment 6313551158) | observed: with the gate, a re-run waits for the approval |

## Activation sequence (bootstrap)

The workflow of a push is the one in the pushed commit. The merge of this change therefore already runs the gated workflow; no deploy of that merge can bypass the approval.

**Phase 0 — owner decision on the order**
- The rule allows one implementation PR at a time, and #178 is open.
- Either the owner authorizes this PR as an exception, or #178 waits.
- #178 must not be merged before this gate: its merge would deploy `57aab63` without approval.

**Phase 1 — merge with no environment configured**
- Requires the owner GO for the merge.
- Expected result:
  - the run of the merge commit shows `gate` failed, with `GATE_ENVIRONMENT_MISSING`, or with `GATE_NO_REQUIRED_REVIEWERS` + `GATE_ADMIN_BYPASS` + `GATE_BRANCH_POLICY` if GitHub created `vps-production` from the workflow;
  - `deploy` is skipped, and nothing reaches the VPS.
- This exercises cases 8 and 11 on GitHub.

**Phase 2 — owner configures `vps-production`** as in the table above.

**Phase 3 — owner re-runs all jobs of that run**
- Expected:
  - `gate` passes (this proves the token can read the environment, `can_admins_bypass` and the branch policy);
  - `deploy` shows *Waiting* for review, with nothing on the VPS (case 1).

**Phase 4 — owner rejects**
- Expected: the run fails and nothing runs on the VPS (case 4).

**Phase 5 — owner re-runs failed jobs, then all jobs**
- Expected: each re-run of `deploy` waits for review again (case 5).
- If a re-run does not wait, stop: the gate is not active and the design must be reviewed.

**Phase 6 — owner approves once** (or rejects, if the gate commit should not be deployed)
- The SHA step prints `DEPLOY_GATE_SHA_OK <sha>`, then `mp-deploy` deploys the gate commit (case 2).
- That commit changes only the workflow, the gate script, tests and documentation; the application is the same as `3dd833f`.

**Phase 7 — Grok checks the VPS side** (read-only): the guard log, `deploy.log`, release and health.

**Phase 8 — then, and only with its own GO, #178**
- Its merge run waits for approval.
- Approving deploys `57aab63…`'s squash commit.
- Not approving leaves the VPS on the previous release.

## Test matrix

| # | Case | Kind | Where |
|---|---|---|---|
| 1 | push to `main` without approval | simulated + static; GitHub at phase 3 | `test/governance-deploy-gate.test.mjs`, `test/governance-workflows.test.mjs` |
| 2 | valid approval | simulated (gate PASS, SHA step OK); GitHub at phase 6 | same |
| 3 | approval missing | GitHub behaviour (the job waits); observed at phase 3 | — |
| 4 | approval rejected | GitHub behaviour; observed at phase 4 | — |
| 5 | re-run | static (the VPS job always has the environment and the gate); GitHub at phase 5 | `test/governance-workflows.test.mjs` |
| 6 | manual dispatch | static (trigger refused) + gate (`GATE_EVENT`) + VPS guard (event `push`) | both test files |
| 7 | SHA different from the approved one | simulated: gate `GATE_SUPERSEDED`, SHA step `DEPLOY_GATE_STALE_SHA` | `test/governance-deploy-gate.test.mjs` |
| 8 | environment missing or misconfigured | simulated (missing, auto-created, reviewers, team, bypass, branch policies, 403/500/network); GitHub at phase 1 | same |
| 9 | runner unavailable | the job stays queued, so no deploy; not exercised | — |
| 10 | bypass through another workflow | static: any workflow naming the VPS runner must be push-to-`main` only, gated, with the environment, the gate and the SHA step; plus the VPS guard (workflow `deploy-vps.yml`) and the environment branch rule | `test/governance-workflows.test.mjs` |
| 11 | bootstrap | GitHub at phase 1 | — |
| 12 | rollback of this change | procedure below; not exercised | — |

## Rollback

- **To stop all deploys at once:** the owner removes the required reviewer, or deletes `vps-production`. Every later gate then fails closed. A waiting job fails when its environment is deleted.
- **To go back to deploy-on-merge:** a normal PR that reverts this change. The revert's own merge runs the old workflow, and so deploys the revert commit without approval. That needs the owner GO like any change to the deploy workflow.
- The VPS keeps its release history and `mp-deploy` rollback; this change does not touch them.

## Limits and residual risks

1. **Same GitHub identity.**
   - The agents act through the owner's account. They cannot approve deployments or configure environments (403).
   - They can, however, merge a PR: the rulesets require a PR and the `CI gate` check, not an approval.
   - A merged workflow change that removed the environment would deploy its own push without approval. Only governance blocks that: workflows are owner-GO files (AGENTS.md).
   - A technical barrier would be an environment-only secret that the VPS (`mp-deploy` or its guard) requires. That is a credentials and VPS change, so it needs a separate owner GO and Grok.
2. **Runs that predate the gate.**
   - Re-running such a run uses that commit's old workflow, without the environment. This is how run 39412733270 deployed on 21/10.
   - Today the only such run is the deploy of `3dd833f`, and `mp-deploy` answers `ALREADY_DEPLOYED` while that release is current. Once a newer release is deployed, its forward-only rule refuses `3dd833f`.
   - The environment secret of point 1 would close this path too.
3. **SHA step on the VPS.** It needs `git` and HTTPS to github.com for the runner user `ghrunner`. To be confirmed by Grok (read-only `git ls-remote` as `ghrunner`). If unavailable it fails closed, and an approved deploy stops before `mp-deploy`.
4. **Waiting runs and concurrency.** The `deploy-vps` concurrency group lets one run wait for approval while newer runs queue behind it. Reject a stale run to let the newer one through. A third push cancels the queued (not the waiting) run, as before.
5. **Fork pull requests** cannot reach this workflow, which runs only on push to `main`. The runner rule in `test/governance-workflows.test.mjs` is unchanged.
