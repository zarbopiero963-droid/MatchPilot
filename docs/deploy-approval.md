# Deploy approval gate (MP-DEPLOY-APPROVAL-01/-02, MP-DEPLOY-GATE-FINAL-01)

A merge to `main` must not be an authorization to deploy. Before this change, every push to `main` started `deploy-vps.yml`, whose only job ran `mp-deploy` on the VPS runner at once. With this change, the deploy job runs only after two things:
- the owner approves that run on GitHub;
- the gate has checked GitHub's configuration again, at every attempt.

Code ready is not protection active. Nothing here is merged, configured or installed. The merge, the environment, the VPS side and #178 each need their own owner GO.

**Owner decisions:**
- #97 comments 6313461364 (MP-DEPLOY-APPROVAL-01) and 6314059221 (triage);
- mandates MP-DEPLOY-APPROVAL-02 and MP-DEPLOY-GATE-FINAL-01.

**Reviews (#97):**
- 6313944252 (9a7124a, NOT APPROVED: B-1);
- 6314826174 (2af874f, NOT APPROVED: B-2);
- the review of this head is pending.

**Evidence labels** (every statement below carries one):

| Label | Meaning |
|---|---|
| **[STATIC]** | verified statically on the files of this repository, by a test |
| **[SIMULATION]** | verified by a test with a fake GitHub API, fake curl/git, throwaway keys |
| **[GITHUB]** | observed on github.com, with the reference given |
| **[VPS]** | observed on the VPS by Claude; nothing is in this category, because Claude has no VPS access |
| **[NOT VERIFIED]** | anything else, including GitHub documentation not yet observed here, and Grok's reports not re-checked |

## 1. GitHub side (this branch)

### Workflow policy (`scripts/workflow-policy.mjs`, tested by `test/governance-workflows.test.mjs`)

**Parsing.** Every file in `.github/workflows/` with the extension `.yml` or `.yaml` is parsed by the `yaml` package (2.9.1, a devDependency, no runtime use) as YAML 1.2, strictly **[STATIC]**.

YAML 1.2 matters here. Under YAML 1.1 the key `on` would become `true`; PyYAML shows exactly that on the attack files (§5).

These are refusals, so the policy fails closed:
- a parse error or warning;
- a duplicate key;
- more than one document;
- an anchor, an alias, a merge key `<<` or an explicit tag;
- a key that is not a string.

GitHub Actions accepts YAML anchors. This repository's workflows do not use them, and the policy refuses them because they make the structure harder to check.

**Rules on the parsed structure, for every workflow** **[STATIC]**:
- No `workflow_call`, `workflow_run` or `repository_dispatch` trigger, and no job-level `uses` (reusable workflow).
- Every job runs on one literal GitHub-hosted label, a string such as `ubuntu-latest`. A list, a group, an expression or any self-hosted label is refused.
- The only exception is job `deploy` of `deploy-vps.yml`, on exactly `[self-hosted, matchpilot-vps]`.
- Outside `deploy-vps.yml`, no key or value names `self-hosted`, `matchpilot-vps` or `mp-deploy`, even when written with escapes. No line of text names them either, comments included.
- Ordinary CI is not blocked: `ci.yml` passes unchanged, with its services and env **[STATIC]**.

**Rules for `deploy-vps.yml`.** It must equal the canonical structure in `scripts/workflow-policy.mjs` exactly. In addition, each invariant is checked by name **[STATIC]**:
- the trigger is a push to `main` only;
- permissions and concurrency are unchanged;
- there is no workflow-level `env` or `defaults`;
- the jobs are exactly `gate` and `deploy`;
- `gate` runs on `ubuntu-latest`, with the pinned checkout and no persisted credentials, and its check step requires an explicit `PASS`;
- `deploy`:
  - has `needs: gate`, the exact condition, `[self-hosted, matchpilot-vps]`, `environment: vps-production` and unchanged permissions;
  - has no job-level `env`, `defaults`, `container`, `services`, `strategy`, `continue-on-error`, `outputs` or `uses`;
  - has exactly two steps, the post-approval gate and then the unchanged `mp-deploy` call;
  - has no step-level `if`, `continue-on-error`, `shell`, `working-directory`, `uses` or `timeout-minutes`.

The NB-5 bypass, `if: false` on the gate step, is therefore refused. So are its equivalents, a removed or reordered step, and a changed `needs`, environment, permission, checkout, SHA or `mp-deploy` call **[STATIC]**.

Changing the deploy workflow needs the canonical structure changed in the same PR. Both are owner-GO files.

**What the policy cannot prove.** It is a CI check on the files of a commit. It cannot:
- see secrets or network access that a GitHub-hosted job could use to reach the VPS. No such deploy credential is known, but that is **[NOT VERIFIED]** by Claude;
- stop a PR that changes the policy and the workflow together; only governance does that;
- protect runs created before the gate (§3).

### `gate` job and post-approval gate (`scripts/deploy-gate.mjs`, tested by `test/governance-deploy-gate.test.mjs`)

**What the gate script reads from the GitHub API** **[SIMULATION]**:
- the run is a push to `main` of this repository;
- `vps-production` exists;
- its only required reviewer is the owner, `zarbopiero963-droid`, with prevent self-review off;
- administrators cannot bypass it (`can_admins_bypass: false`);
- only the branch `main` may deploy to it;
- the run's SHA is still the tip of `main`.

Every missing, different or unreadable answer fails it:
- HTTP 401, 403, 404, 500;
- a network error;
- a malformed body;
- an unprotected environment, which is what GitHub creates when a workflow names a missing one.

Its report lists the settings it read, never the token **[SIMULATION]**.

**Where it runs.**
- In the `gate` job, before the approval. That job's step requires an explicit `"result": "PASS"` **[STATIC]**.
- In the `deploy` job, after the approval and at every attempt. A re-run of the deploy job alone does not re-run `gate`, so this step checks again. It downloads the script from the approved SHA (`raw.githubusercontent.com/…/<sha>/…`) and requires `PASS` before `mp-deploy` **[SIMULATION]**:
  - a simulated VPS runs the step's own bash, with a fake curl, the real node and a fake API;
  - an environment that lost its protection, a superseded SHA, no `node`/`curl`/`grep`, an unreadable script, or a script that exits 0 without saying `PASS` all stop it.

**Entry point (review NB-2).** The script runs its checks from a path with spaces or through a symlink **[SIMULATION]**. The 9a7124a version exited 0 with no output there.

**What GitHub itself does: [NOT VERIFIED] on this repository.** GitHub's documentation describes all of these. They are observed only in phase C/D:
- that the deploy job waits for the approval;
- that a re-run asks for it again;
- whether `GITHUB_TOKEN` (`actions: read`) can read the environment and its branch policies;
- whether the answer contains `can_admins_bypass` and `prevent_self_review`.

In each case a failure stops the deploy.

### Observations on GitHub

- **The agents' token cannot approve a deployment or read or configure environments** **[GITHUB]**:
  - `POST /repos/…/actions/runs/39412733270/pending_deployments` → 403 (21/10, no deployment was pending);
  - `GET /repos/…/environments` → 403 from the proxy.
- **The agents' token can re-run a deploy run** **[GITHUB]**:
  - run 39412733270, attempt 3, 21/10 10:16Z, triggered by mistake (#179 comment 6313551158);
  - its job log (job 119165978089, read through the API) shows `mp-runner-guard: ALLOW …` and `mp-deploy … result=ALREADY_DEPLOYED`;
  - what happened on the VPS itself is **[NOT VERIFIED]** by Claude; Grok was asked to check.
- **Only one run predates the gate**: 39412733270 on `3dd833f` **[GITHUB]**, the `deploy-vps.yml` run list read on 21/10.

## 2. Environment configuration (owner, phase C)

Only the repository owner can configure environments in a personal-account repository (GitHub documentation) **[NOT VERIFIED]** here.

Settings → Environments → `vps-production`:

| Setting | Value | Gate code if different **[SIMULATION]** |
|---|---|---|
| Required reviewers | `zarbopiero963-droid` only | `GATE_NO_REQUIRED_REVIEWERS`, `GATE_UNEXPECTED_REVIEWER` |
| Prevent self-review | **off**: the owner merges and approves; with it on, nobody could approve and every deploy would stay blocked | `GATE_SELF_REVIEW` |
| Allow administrators to bypass configured protection rules | **off** | `GATE_ADMIN_BYPASS` |
| Deployment branches and tags | Selected branches and tags, one branch rule `main` | `GATE_BRANCH_POLICY` |
| Wait timer, environment secrets | none | — |

## 3. VPS side: proof of authorization (package for Grok, phase B, not wired)

### Why

A run created before the gate keeps its old workflow. A re-run of it reaches `mp-deploy` without any approval; run 39412733270 did exactly that on 21/10 **[GITHUB]**. Code on GitHub cannot close this path. Only the VPS can, by requiring a proof that such a run cannot produce.

### The proof

The proof is a GitHub Actions OIDC token, requested by the deploy job with the audience `matchpilot-vps-deploy`.
- It is a JWT signed by GitHub and valid for minutes.
- GitHub's OIDC reference states that the subject "includes the environment name when the job references an environment", and lists the `environment` claim **[NOT VERIFIED]** here.
- A run older than the gate has no `id-token` permission and no environment, so it cannot obtain one.
- No static secret is involved.
- That self-hosted runners receive OIDC tokens is implied by the documented claim `runner_environment: self-hosted`, but **[NOT VERIFIED]**.

### Specification of the verifier (`scripts/deploy-authz.mjs`, tested by `test/governance-deploy-authz.test.mjs` **[SIMULATION]**)

**1. Input.** The token is read on stdin, never from the command line.

These are refused without an exception:
- a token that is not a string, or longer than 16 KiB;
- not three base64url parts;
- a header or payload that is not a JSON object, including `null`, arrays and strings;
- a non-integer clock.

The 2af874f version threw on a `null` header or payload (NB-7).

**2. Signature.**
- `alg` must be exactly `RS256`; `none`, `HS256` and others are refused, and so is any `crit` header.
- The key is the single RSA key with that `kid` in GitHub's JWKS. An unknown or ambiguous `kid` is refused.
- The signature is checked with `RSA-SHA256` on the key's `n` and `e`.

**3. Claims.** Exact strings, with no coercion of arrays, numbers or objects:
- `iss` = `https://token.actions.githubusercontent.com`;
- `aud` = `matchpilot-vps-deploy` (or a one-element array);
- `repository`, plus `repository_id` `1401571874` and `repository_owner_id` `249075720` (read from the GitHub API on 21/10 **[GITHUB]**);
- `ref` = `refs/heads/main` and `event_name` = `push`;
- `environment` = `vps-production`, and `sub` ending in `:environment:vps-production`;
- `workflow_ref`, and `job_workflow_ref` when present, = `zarbopiero963-droid/MatchPilot/.github/workflows/deploy-vps.yml@refs/heads/main`;
- `runner_environment` = `self-hosted`.

**4. Commit.**
- `workflow_sha`, and `sha` when present, must equal the SHA `mp-deploy` is asked to deploy, which must be 40 hex digits.
- GitHub's reference lists `workflow_sha` and not `sha` **[NOT VERIFIED]** in a real token.

**5. Time** (skew 60 s): `exp` in the future, `iat`/`nbf` not in the future, `exp - iat` ≤ 15 min, and **`now - iat` ≤ 5 min**. A token kept across the workflow's 60-second retries ages out.

**6. Anti-replay.** The ledger is a directory with one file per used key, named by its SHA-256.
- **`verify`** checks without side effects whether `run:<run_id>:<run_attempt>` or `jti:<jti>` is already there.
- **`consume`** records the run attempt and then the token id, each with an exclusive create (`O_CREAT|O_EXCL`, mode 600) followed by `fsync` of the file and of the directory. An existing key is a replay.
- Two processes racing with the same token: exactly one consumes it **[SIMULATION]**, and a later process sees the record.
- A timestamp alone is never the protection.

**7. Not provable from the token.**
- That the reviewer was the owner. The optional `approvalProblems` reads `GET /repos/…/actions/runs/{run_id}/approvals` and requires an approval of `vps-production` by `zarbopiero963-droid`.
- That the environment was protected at that moment. The gate and the post-approval gate check this on GitHub.
- The job's identity beyond workflow, run and attempt. `check_run_id` exists in the reference but is not required.

**8. CLI.**
```
node deploy-authz.mjs verify  --sha <sha> --jwks <file> --ledger <dir>   # exit 0: valid and unused
node deploy-authz.mjs consume --sha <sha> --jwks <file> --ledger <dir>   # exit 0: valid, unused, now recorded
```
Any other outcome, including an exception, exits 1, with the reasons as JSON on stdout.

### Changes to `mp-deploy` (Grok, phase B, owner GO)

**Runtime requirements**, to be verified read-only as the runner user `ghrunner`, then as root for `mp-deploy`:
- `node` ≥ 20, `curl`, `grep`, `cat`;
- HTTPS to `raw.githubusercontent.com`, `api.github.com` and `token.actions.githubusercontent.com`.

**`mp-deploy` v3** (root, sudo rule unchanged, `<sha>` argument unchanged):
1. Read the token from stdin; with none, refuse once enforcing.
2. Fetch the JWKS from `https://token.actions.githubusercontent.com/.well-known/openid-configuration` → `jwks_uri` into a root-only temporary file. **STOP** on failure.
3. `deploy-authz.mjs verify`. A refusal stops before the lock.
4. Take the existing deploy lock. If it is held, exit 75 as today: nothing is consumed.
5. `deploy-authz.mjs consume`, under the lock. A refusal releases the lock and exits non-zero.
6. Deploy as today. A deploy that fails after `consume` cannot be retried in the same run attempt; a new attempt needs a new approval.

**Pinned copy.** `deploy-authz.mjs` is installed at `/usr/local/libexec/mp-deploy-authz.mjs`, root:root 0755, pinned by SHA-256 in the infra repository. The ledger is `/var/lib/mp-deploy/authz-ledger/`, root:root 0700.

**Trust policy.**
- Only GitHub's issuer and keys are trusted, and only for this repository (name and ids), this workflow, `main`, `push`, the environment `vps-production`, a self-hosted runner and the requested SHA.
- No other identity provider and no static credential.

**Retry.** Each try of the workflow's exit-75 loop requests a **new** token: same run attempt, new `jti`. Nothing is consumed until the lock is held, so a try that meets a busy lock does not burn the attempt.

### Workflow change for phase B (a PR, owner GO)

The deploy job gets `permissions: id-token: write`. Inside the retry loop, before each `sudo -n /usr/local/sbin/mp-deploy <sha>`, it runs:
```
curl -sSf -H "Authorization: bearer $ACTIONS_ID_TOKEN_REQUEST_TOKEN" "$ACTIONS_ID_TOKEN_REQUEST_URL&audience=matchpilot-vps-deploy"
```
and pipes the `value` field to that call's stdin. The canonical structure in `scripts/workflow-policy.mjs` changes in the same PR.

### Sequence, evidence and STOP conditions

| Step | Who | What | Evidence | STOP if |
|---|---|---|---|---|
| B0 | Grok, read-only | runtime requirements above; hashes of the installed `mp-deploy` and guard | command output in #179 | anything missing |
| B1 | Grok | install the verifier and `mp-deploy` v3 in **report-only**: verify and log the verdict, deploy as today | install log, SHA-256 of the files, a dry verify with a token from a test run, which must REFUSE (wrong audience/SHA) | v3 changes any deploy behaviour |
| B2 | PR, owner GO | the workflow sends the token | CI green; review | — |
| B3 | Grok | after one real deploy whose report-only verdict is ACCEPT, switch to **enforce** | `deploy.log` lines with ACCEPT/REFUSE, ledger entries | any REFUSE on a legitimate deploy |
| D6 | Grok | replay: the recorded token, or a second token of a consumed attempt | `AUTHZ_REPLAY` | accepted |
| D7 | owner, deliberately | re-run the old run 39412733270 | refused (no token) | it deploys |

**Rollback of phase B:** reinstall the previous `mp-deploy` and guard. Grok reports their SHA-256 as `caf9233f…` and `6e32cfff…` (#179) **[NOT VERIFIED by Claude]**. Keep the ledger directory, which is only an append record.

Until B3, a re-run of a run older than the gate can still reach `mp-deploy` **[GITHUB: 21/10]**. Whether `mp-deploy` refuses `3dd833f` once a newer release is current (forward-only) is **[NOT VERIFIED]**.

## 4. Activation plan

**Phase A — code and tests (this branch).**
- Code, RED→GREEN, mutations and Gate A are done.
- The separate review of this head is pending.
- No PR while #178 is open, unless the owner authorizes an exception.

**Phase B — VPS** (Grok, separate owner GO). Section 3. It may come before or after phases C–D. Until B3, runs older than the gate stay open.

**Phase C — GitHub bootstrap** (owner GOs: open the PR, then merge it)
1. The PR opens. CI runs, including `test/governance-*.test.mjs`. Then Gate B on its head and a separate review.
2. **Merge with `vps-production` not yet configured.** Expected run of the merge commit:
   - `gate` fails with `GATE_ENVIRONMENT_MISSING`, or with `GATE_NO_REQUIRED_REVIEWERS`/`GATE_ADMIN_BYPASS`/`GATE_BRANCH_POLICY` if GitHub created the environment from the workflow;
   - `deploy` is skipped.

   **STOP if** `deploy` starts.
3. The owner configures `vps-production` per section 2.
4. Owner: *Re-run all jobs*. Expected:
   - `gate` PASS, with its report showing `can_admins_bypass: false`, `prevent_self_review: false`, the reviewer and `branch:main`;
   - `deploy` *Waiting for review*.

   **STOP if** `gate` reports `GATE_API_ERROR … 403` (the token cannot read the environment: redesign before going on), if the fields are absent, or if `deploy` starts without waiting.

**Phase D — certification on GitHub** (owner actions, Grok checks on the VPS)

| Step | Action | Expected | STOP if |
|---|---|---|---|
| D1 | wait 10 min | `deploy` still waiting (approval missing) | it starts |
| D2 | Reject | run fails, nothing on the VPS (no new `deploy.log` line) | anything on the VPS |
| D3 | Re-run failed jobs | `deploy` waits again (re-run of the job alone) | it starts without approval |
| D4 | Reject, then Re-run all jobs | `gate` runs again, `deploy` waits again | it starts without approval |
| D5 | Approve | post-approval gate PASS (`DEPLOY_GATE_SHA_OK <sha>`), `mp-deploy` deploys the gate commit (application unchanged from `3dd833f`); Grok checks guard log, `deploy.log`, release, health | any check fails |
| D6, D7 | after B3 | section 3 | section 3 |

**Phase E — PR #178.** Only after phase D, with its own owner GO. Its merge run waits for approval. Approving it deploys the squash commit of `57aab63`; not approving it leaves the current release.

**Rollback**
- **Stop every deploy now:** the owner removes the required reviewer or deletes `vps-production`. Every later gate fails closed **[SIMULATION]**. GitHub documents that jobs waiting on a deleted environment fail **[NOT VERIFIED]**.
- **Back to deploy-on-merge:** a PR reverting this change, with an owner GO. Its own merge runs the old workflow and so deploys the revert commit without approval.
- **Phase B:** section 3.

## 5. Evidence

### RED → GREEN

Each attack file was placed in `.github/workflows/` of a copy, then `node --test test/governance-workflows.test.mjs` was run.

| Finding | Attack | Vulnerable head | This head |
|---|---|---|---|
| B-1 | `sneak.yml`: push to main, VPS runner, `mp-deploy`, no environment | 9a7124a: 12/12 pass (bypass) | refused |
| B-2 v1 | jobs indented by four spaces | 2af874f: fail 0 (bypass) | fail 1: `runs-on ["self-hosted","matchpilot-vps"] is not allowed` |
| B-2 v2 | quoted job name | 2af874f: fail 0 | fail 1 |
| B-2 v3 | `jobs:` as a flow mapping | 2af874f: fail 0 | fail 1 |
| B-2 v7 | `on: [pull_request]`, four-space job calling `attacker/x/…@main`, file `.yaml` | 2af874f: fail 0 | fail 1: `calls the reusable workflow attacker/x/…` |
| NB-5 | `if: false` on the post-approval gate | 2af874f: survived (review M6) | refused: `deploy: step 1 has if` |
| NB-2 | gate script from a path with spaces | 9a7124a: exit 0, no output | exit 1, report with `GATE_ERROR` |
| NB-7 | `null` header / `null` payload | 2af874f: throws `Cannot read properties of null` | refused `AUTHZ_MALFORMED_TOKEN` |

Each attack is also checked inside the permanent tests:
- it parses cleanly with `yaml`, so it is a true positive and not a parse failure;
- its job is structurally a VPS job or a reusable call.

As an independent cross-check, PyYAML 6.0.1 (`yaml.safe_load`) gives the same jobs for the five files, with `runs-on ['self-hosted', 'matchpilot-vps']` or the reusable `uses`.

**Permanent tests** **[STATIC]**:
- 18 equivalent valid YAML forms, including quoted keys and labels, block sequences, runner groups, expressions, a `matchpilot-vps` or `mp-deploy` written with YAML escapes (`\x2d`, `\u002d`), comments and a renamed copy of the deploy workflow;
- 14 unreadable forms, including duplicates, anchors, aliases, merge keys, tags, two documents, tabs, boolean keys and empty jobs;
- 40 changes to `deploy-vps.yml`;
- 4 changes to `ci.yml`.

### Mutations

Each mutation was applied to a copy, the three gate test files were run, and the file was restored. **29/30 killed, 1 equivalent.**

| Id | Mutation | Expected | Observed |
|---|---|---|---|
| P1 | parse errors ignored | killed | killed |
| P2 | duplicate keys accepted | killed | killed |
| P3 | aliases accepted | killed | **survived, equivalent**: an alias needs an anchor, which stays refused, and an alias without one does not parse |
| P4 | explicit tags accepted | killed | killed |
| P5 | merge keys accepted | killed | killed |
| P6 | several documents accepted | killed | killed |
| P7 | reusable workflows accepted | killed | killed |
| P8 | workflow_call/run, repository_dispatch accepted | killed | killed |
| P9 | any `runs-on` accepted outside the deploy job | killed | killed |
| P10 | names in parsed values not checked | killed | survived first; killed after adding the escaped-name tests |
| P11 | other workflows not scanned | killed | killed |
| P12 | `deploy-vps.yml` not checked | killed | killed |
| P13 | step-level `if` accepted (NB-5) | killed | killed |
| P14 | canonical equality removed | killed | survived first; killed after adding timeout/name tests |
| P15 | empty `jobs` accepted | killed | survived first; killed after adding `jobs: {}` |
| P16 | YAML 1.1 instead of 1.2 | killed | killed |
| A1 | `null` header/payload not refused | killed | killed |
| A2 | signature ignored | killed | killed |
| A3 | `alg` ignored | killed | killed |
| A4 | claims coerced to strings | killed | killed |
| A5 | token age ignored | killed | killed |
| A6 | replay check in verify off | killed | killed |
| A7 | non-exclusive consume | killed | killed |
| A8 | SHA binding off | killed | killed |
| A9 | ambiguous `kid` accepted | killed | killed |
| A10 | environment claim not pinned | killed | killed |
| A11 | `crit` header accepted | killed | killed |
| G1 | prevent self-review not checked | killed | killed |
| G2 | entry check as in 9a7124a | killed | killed |
| G3 | absent `can_admins_bypass` accepted | killed | killed |

The earlier 16 mutations on 2af874f (signature, replay, SHA, age, approver, self-review, entry check, the VPS step, the B-1 scan) were all killed. They are covered again by the rows above.

### Test matrix

| # | Case | Result | Real check |
|---|---|---|---|
| 1 | second workflow on the VPS runner | [STATIC] RED→GREEN | CI on the PR: [NOT VERIFIED] until it opens |
| 2 | several workflows, every YAML form above | [STATIC] | — |
| 3 | indirect triggers | [STATIC]; [SIMULATION] `GATE_EVENT`, `AUTHZ_CLAIM event_name` | — |
| 4 | different SHA | [SIMULATION] `GATE_SUPERSEDED`, `AUTHZ_SHA` | [NOT VERIFIED] |
| 5 | environment missing | [SIMULATION] | phase C2 [NOT VERIFIED] |
| 6 | environment unprotected or misconfigured | [SIMULATION] | phase C2/C4 [NOT VERIFIED] |
| 7 | approval rejected | — | D2 [NOT VERIFIED] |
| 8 | approval missing | — | D1 [NOT VERIFIED] |
| 9 | full re-run | [STATIC] the VPS job always has the environment and the gate | D4 [NOT VERIFIED] |
| 10 | re-run of the deploy job alone | [SIMULATION] post-approval gate | D3 [NOT VERIFIED] |
| 11 | run older than the gate | [SIMULATION] a token without environment is refused | D7 after B3 [NOT VERIFIED]; open until B3 |
| 12 | script path with spaces | [SIMULATION] RED→GREEN | — |
| 13 | API error | [SIMULATION] | C4 [NOT VERIFIED] |
| 14 | runner unavailable | [STATIC] no fallback runner label | [NOT VERIFIED] |
| 15 | replay of an authorization | [SIMULATION] exclusive, persistent, racing | D6 after B3 [NOT VERIFIED] |

## 6. Residual risks

1. **Same GitHub identity.**
   - The agents act through the owner's account. They cannot approve deployments or read or configure environments **[GITHUB: 403]**.
   - They can merge a PR: the rulesets require a PR and `CI gate`, not an approval.
   - A PR that changed the workflow, the policy and its tests together would pass CI. Only governance stops it: workflows, `scripts/` and `test/governance-*` are owner-GO files.
   - After B3, the VPS refuses a deploy without a token from `vps-production`, whatever the workflow says.
2. **Runs older than the gate** can be re-run until B3.
3. **Concurrency.** The group `deploy-vps` lets one run wait while newer ones queue. How GitHub treats a third run while one waits is **[NOT VERIFIED]**. Reject a stale run; the post-approval gate refuses a stale SHA anyway **[SIMULATION]**.
4. **Window between the post-approval gate and `mp-deploy`.** The exit-75 retries can last up to about 10 minutes, during which `main` can move. That window is covered only by `mp-deploy`'s own check that the SHA is on `main` **[NOT VERIFIED]**. In phase B, each try's fresh token is still bound to the approved SHA.
