# Deploy approval gate (MP-DEPLOY-APPROVAL-01/-02, MP-DEPLOY-GATE-FINAL-01, MP-DEPLOY-UNBLOCK-FINAL)

A merge to `main` must not be an authorization to deploy. Before this change, every push to `main` started `deploy-vps.yml`, whose only job ran `mp-deploy` on the VPS runner at once.

With this change, the deploy job runs only after three things:
- the owner approves that run on GitHub;
- the gate checks GitHub's configuration again, at every attempt;
- `mp-deploy` v3 checks a fresh OIDC proof of that approved run (phase B).

**Code ready is not protection active.** Nothing here is merged, configured or installed. The merge, the environment, the VPS side and #178 each need their own owner GO.

**Owner decisions**
- #97 comments 6313461364 (MP-DEPLOY-APPROVAL-01), 6314059221 (triage) and 6316562293 (PR exception);
- mandates MP-DEPLOY-APPROVAL-02, MP-DEPLOY-GATE-FINAL-01 and MP-DEPLOY-UNBLOCK-FINAL / MP-DEPLOY-PR-GATE-B-01.

**Reviews (#97), all NOT APPROVED, each finding fixed after it:**

| Comment | Head | Blocking finding |
|---|---|---|
| 6313944252 | 9a7124a | B-1 |
| 6314826174 | 2af874f | B-2 |
| 6316028694 | 512ef32 | B-3 |

The review of this head is reported in #97.

**Evidence labels.** Every statement below carries one of these:

| Label | Meaning |
|---|---|
| **[STATIC]** | verified on the files of this repository by a test |
| **[SIMULATION]** | verified by a test with a fake GitHub API, fake curl/sudo/git or throwaway keys |
| **[GITHUB]** | observed on github.com, with the reference |
| **[VPS]** | observed on the VPS by Claude. Nothing is in this category: Claude has no VPS access |
| **[NOT VERIFIED]** | anything else. This includes GitHub documentation not observed here and Grok's reports not re-checked |

## 1. GitHub side

### 1.1 Workflow policy (`scripts/workflow-policy.mjs`, tested by `test/governance-workflows.test.mjs`)

**Directory (review B-3).** `readWorkflowDirectory` looks at every entry of `.github/workflows` with `lstat`. A test asserts that every entry of the real directory is a checked workflow **[STATIC]**. These entries are refused:
- a symlink;
- a subdirectory;
- anything that is not a regular file;
- any name outside `^[a-z0-9][a-z0-9._-]*\.ya?ml$`, such as `sneak.YML`, `sneak.Yaml`, `Sneak.yml`, a dot file or another extension.

What GitHub itself would run among such entries is **[NOT VERIFIED]**: its documentation says only ".yml or .yaml" in that directory. The policy refuses them all, so the question does not matter for this check.

**Encoding (review NB-14).** Each file is decoded as strict UTF-8. These are refused **[STATIC]**:
- invalid sequences;
- UTF-16/32 byte-order marks;
- a UTF-8 byte-order mark, NUL, or any control character other than tab, LF and CR.

How GitHub decodes UTF-16 is **[NOT VERIFIED]**; the policy refuses it either way.

**Parsing.** Each workflow is parsed by `yaml` 2.9.1 (devDependency) as YAML 1.2, strictly **[STATIC]**. Under YAML 1.1, `on` would become `true`; PyYAML does that on the attack files (§5).

These are refused (fail closed):
- parse errors or warnings (a document with only a warning, such as an unknown directive, included);
- duplicate keys;
- keys that differ only by case (`RUNS-ON` beside `runs-on`, review NB-9);
- several documents;
- anchors on any node, aliases, merge keys `<<`, explicit tags on any node;
- non-string keys.

GitHub Actions accepting YAML anchors is **[NOT VERIFIED]** here. This repository's workflows use none, and the policy refuses them.

**Structure, for every workflow** **[STATIC]**:
- **Events from an allow-list** (review NB-9): `push`, `pull_request`, `schedule`, `workflow_dispatch`, `merge_group`, exactly as written.
  - Explicitly refused: `workflow_call`, `workflow_run`, `repository_dispatch` (indirect starts), `pull_request_target` (fork code with this repository's rights), any other event and any other spelling (`Workflow_Run`).
- **No job-level `uses`**, so no reusable workflow.
- **Every job runs on one label from the hosted allow-list** (review NB-10): `ubuntu-latest`, `ubuntu-24.04`, `ubuntu-22.04`, `ubuntu-24.04-arm`, `ubuntu-22.04-arm`, `windows-latest`, `windows-2025`, `windows-2022`, `macos-latest`, `macos-15`, `macos-14`, `macos-13`.
  - A custom label of that shape (`ubuntu-vps`), a list, a group, an expression or any self-hosted label is refused.
  - The only exception is job `deploy` of `deploy-vps.yml`, on exactly `[self-hosted, matchpilot-vps]`.
- **Outside `deploy-vps.yml`**, no key or value names `self-hosted`, `matchpilot-vps`, `mp-deploy` or `vps-production`, including when written with YAML escapes (`\x2d`, `\u002d`). No line of text names them either, comments included.
  - `vps-production` is reserved too (review NB-15), so no other job can ask for that environment's approval or use the deploy audience `matchpilot-vps-deploy`.

**`deploy-vps.yml`** must equal the canonical structure in `scripts/workflow-policy.mjs` exactly. Each invariant is also checked by name, so a change is reported precisely **[STATIC]**:
- the trigger is a push to `main` only;
- permissions and concurrency are unchanged;
- there is no workflow-level `env` or `defaults`;
- the jobs are exactly `gate` and `deploy`;
- `gate` runs on `ubuntu-latest`, with a pinned checkout without persisted credentials, and its check step requires an explicit `PASS`;
- `deploy`:
  - has `needs: gate`, the exact condition, `[self-hosted, matchpilot-vps]` and `environment: vps-production`;
  - has permissions `contents/actions/deployments: read` and `id-token: write`;
  - has no job-level `env`, `defaults`, `container`, `services`, `strategy`, `continue-on-error`, `outputs` or `uses`;
  - has exactly the post-approval gate step and then the `mp-deploy` step;
  - has no step-level `if`, `continue-on-error`, `shell`, `working-directory`, `uses` or `timeout-minutes`.

So `if: false` on the gate step (review NB-5) is refused. The same holds for its equivalents, a removed or reordered step, and a changed `needs`, environment, permission, checkout, SHA, audience, token passing or `mp-deploy` call.

**What a static check cannot cover**, and what does instead:
- **Code that runs before any CI result** (review NB-8). This repository is public. A pushed branch, a pull request and a fork pull request run the workflows of their own head, so their YAML runs before this test can refuse it. The VPS is protected from such runs only by measures outside this policy:
  - the runner's job-started guard. Grok reports that it allows only repository, event `push`, ref `main` and workflow `deploy-vps.yml` **[NOT VERIFIED by Claude]**. B0 must show which variable it reads: `GITHUB_WORKFLOW_REF` is sound; `GITHUB_WORKFLOW` could be forged with `name:`;
  - the repository setting that requires approval for fork workflows **[NOT VERIFIED]**;
  - the rulesets: only a PR with `CI gate` green reaches `main` **[GITHUB: ruleset 25478832]**;
  - after phase B, `mp-deploy` itself refuses any deploy without an OIDC token issued for `deploy-vps.yml@refs/heads/main` in `vps-production`.
- **Secrets or network access** that a GitHub-hosted job could use to reach the VPS. No deploy credential is known, but this is **[NOT VERIFIED]** by Claude.
- **A PR that changes the workflow, this policy and its tests together.** Only governance stops it (these are owner-GO files) until phase B, where the VPS check does not depend on the workflow text.
- **Runs created before the gate.** Only phase B covers them (§3).

### 1.2 `gate` job and post-approval gate (`scripts/deploy-gate.mjs`, tested by `test/governance-deploy-gate.test.mjs`)

**What the script reads from the GitHub API** **[SIMULATION]**:
- the run is a push to `main` of this repository;
- `vps-production` exists;
- its only required reviewer is the owner, `zarbopiero963-droid`, with prevent self-review off;
- administrators cannot bypass it;
- only the branch `main` may deploy;
- the run's SHA is still the tip of `main`.

**It fails closed** on all of these **[SIMULATION]**:
- HTTP 401, 403, 404, 500, a network error or a malformed body;
- the unprotected environment GitHub creates when a workflow names a missing one;
- an answer of an unexpected shape.

In every case it still writes its structured report, listing the settings read, never the token. Review NB-11: the 512ef32 version printed nothing for `reviewers: "x"`.

**It runs twice:**
- in the `gate` job, with an explicit `"result": "PASS"` required **[STATIC]**;
- in the `deploy` job, after the approval and at every attempt. A re-run of the deploy job alone does not re-run `gate`. This second run downloads the script from the approved SHA and requires `PASS` before `mp-deploy` **[SIMULATION: the step's own bash, fake curl, real node, fake API]**.

The script runs its checks from a path with spaces or through a symlink **[SIMULATION]** (review NB-2).

### 1.3 `mp-deploy` step: a fresh OIDC token on every try

The request token (`ACTIONS_ID_TOKEN_REQUEST_TOKEN`) goes to curl through a header file, never on a command line visible in `ps` (review NB-16). The file is written mode 0600 in `$RUNNER_TEMP` and removed on exit **[SIMULATION]**.

On every try of the exit-75 retry loop, the step does three things:
1. requests a new OIDC token for the audience `matchpilot-vps-deploy`;
2. pipes it on stdin to `sudo -n /usr/local/sbin/mp-deploy <sha>`;
3. stops with `DEPLOY_OIDC_UNAVAILABLE`, before calling `mp-deploy`, if no token comes back.

This is **[SIMULATION]**: one try sends one token; three tries send three different tokens; an endpoint down, an empty or non-JSON answer, or an empty `value` stop the step.

Whether GitHub issues OIDC tokens to this self-hosted runner is **[NOT VERIFIED]**. The documented claim `runner_environment: self-hosted` implies it. If it does not, the deploy stops (fail closed).

**Precondition:** the installed `mp-deploy` must be v3, which reads stdin, **before** this workflow reaches `main` (§4, step 3). How v2 treats unexpected stdin is **[NOT VERIFIED]**.

### 1.4 Observations on GitHub

- **The agents' token cannot approve deployments or read or configure environments** **[GITHUB]**:
  - `POST /repos/…/actions/runs/39412733270/pending_deployments` → 403 (21/10);
  - `GET /repos/…/environments` → 403.
- **The agents' token can re-run a deploy run** **[GITHUB]**: run 39412733270, attempt 3, 21/10 10:16Z, by mistake (#179 comment 6313551158).
  - Job 119165978089 log: `mp-runner-guard: ALLOW deploy-vps.yml push refs/heads/main`, then `mp-deploy … result=ALREADY_DEPLOYED`.
  - The VPS side of that run is **[NOT VERIFIED]** by Claude.
- **Only one run predates the gate:** 39412733270 on `3dd833f` **[GITHUB]**.
- **The repository ids are** `1401571874` (repository) and `249075720` (owner) **[GITHUB]**.

## 2. Environment configuration (owner, step 5 of §4)

Only the repository owner can configure environments in a personal-account repository (GitHub documentation) **[NOT VERIFIED]**.

Settings → Environments → `vps-production`:

| Setting | Value | Gate code if different **[SIMULATION]** |
|---|---|---|
| Required reviewers | `zarbopiero963-droid` only | `GATE_NO_REQUIRED_REVIEWERS`, `GATE_UNEXPECTED_REVIEWER` |
| Prevent self-review | **off**: the owner merges and approves; with it on, nobody could approve | `GATE_SELF_REVIEW` |
| Allow administrators to bypass configured protection rules | **off** | `GATE_ADMIN_BYPASS` |
| Deployment branches and tags | Selected branches and tags, one branch rule `main` | `GATE_BRANCH_POLICY` |
| Wait timer, environment secrets | none | — |

The following are **[NOT VERIFIED]** until step 6 of §4: that GitHub returns these fields to the workflow token, that the deploy job waits, and that a re-run asks for approval again. Each failure stops the deploy.

## 3. VPS side: package for Grok (phase B, separate owner GO)

### 3.1 Why

A run created before the gate keeps its old workflow. A re-run of it reaches `mp-deploy` without approval; that happened on 21/10 **[GITHUB]**.

Nothing in a new workflow can stop an old run. Only `mp-deploy` can, by requiring a proof that the old run cannot produce, and until then by refusing new releases (freeze).

### 3.2 Proof and trust policy

The proof is a GitHub Actions OIDC token (RS256 JWT) from the issuer `https://token.actions.githubusercontent.com`, for the audience `matchpilot-vps-deploy`.

The only claims trusted are:
- this repository, by name, `repository_id` and `repository_owner_id`;
- `ref` `refs/heads/main` and `event_name` `push`;
- `environment` `vps-production` and a `sub` ending in `:environment:vps-production`;
- `workflow_ref` (and `job_workflow_ref`) `…/.github/workflows/deploy-vps.yml@refs/heads/main`;
- `runner_environment` `self-hosted`;
- `workflow_sha` (and `sha` when present) equal to the SHA to deploy.

No other identity provider and no static credential are trusted. GitHub documents the subject format with an environment ("includes the environment name when the job references an environment") **[NOT VERIFIED]** in a real token here.

A run older than the gate has neither `id-token` nor an environment, so it cannot obtain such a token.

### 3.3 Verifier (`scripts/deploy-authz.mjs`, tested by `test/governance-deploy-authz.test.mjs` **[SIMULATION]**)

**Input.** The token comes on stdin.

These are refused without an exception (review NB-7):
- a token that is not a string or exceeds 16 KiB (tested with a well-formed, signed token);
- not three base64url parts;
- a header or payload that is not a JSON object;
- a non-integer clock.

**Signature.**
- `alg` must be exactly `RS256`, with no `crit`.
- The key must be the single RSA key with that `kid` in the JWKS. An unknown or ambiguous `kid` is refused.
- The signature is checked with `RSA-SHA256` on the key's `n` and `e`.

**Claims.** As in §3.2, compared as exact strings, never coerced.

**Time.** With 60 s of skew:
- `exp` in the future;
- `iat` and `nbf` not in the future;
- `exp - iat` ≤ 15 min;
- `now - iat` ≤ 5 min.

A token kept across retries ages out.

**Anti-replay.** The ledger is a directory with one file per used key, named by its SHA-256.
- `verify` reads the ledger, without side effects. It refuses if the ledger directory does not exist (review NB-12; the 512ef32 version said ACCEPT).
- `consume` records `run:<run_id>:<run_attempt>` and then `jti:<jti>`. Each record is an exclusive create (`O_CREAT|O_EXCL`, mode 600), `fsync` of the file, then `fsync` of the directory.
- A record that cannot be made durable refuses, and the key stays used.
- An existing key is a replay.

Tests cover these, with every open, write and fsync observed:
- two and twelve processes racing on the same token: exactly one wins (the second figure is from review 6316028694);
- persistence across processes;
- a new token in the same attempt is refused;
- a re-run (new attempt) is accepted.

**Initialization.** The ledger directory is created once at install (root:root 0700), never by `verify` or `consume`.

**Optional check** (`approvalProblems`). The run's approvals from `GET /repos/…/actions/runs/{run_id}/approvals` include an approval of `vps-production` by the owner.

**CLI.** Exit 0 only for ACCEPT; JSON on stdout.
```
node deploy-authz.mjs verify  --sha <sha> --jwks <file> --ledger <dir>
node deploy-authz.mjs consume --sha <sha> --jwks <file> --ledger <dir>
```

### 3.4 `mp-deploy` v3 (Grok)

**Installation.**
- The sudo rule is unchanged (`ghrunner` may run only `/usr/local/sbin/mp-deploy`, `env_reset`), and so is the `<sha>` argument.
- `/usr/local/libexec/mp-deploy-authz.mjs` is a copy of `scripts/deploy-authz.mjs` at the merged SHA, root:root 0755, with its SHA-256 recorded in the infra repository.
- The ledger is `/var/lib/mp-deploy/authz-ledger/`, root:root 0700.

**Modes.** Set in a root-only configuration file:

| Mode | Behaviour |
|---|---|
| `freeze` | refuse every SHA except the current release (`ALREADY_DEPLOYED` stays a success), whatever the token |
| `report` | verify and log ACCEPT/REFUSE; deploy as v2 |
| `enforce` | deploy only on ACCEPT |

`freeze` combines with `report`.

**Order of operations.**
1. Read stdin (the token, possibly empty).
2. Validate `<sha>` as today.
3. If `freeze` and `<sha>` ≠ current release: refuse.
4. Fetch the JWKS from `https://token.actions.githubusercontent.com/.well-known/openid-configuration` → `jwks_uri` into a root-only temporary file. On failure: refuse in `enforce`, log in `report`.
5. `mp-deploy-authz.mjs verify`. In `enforce`, a REFUSE stops before the lock.
6. Take the existing deploy lock, or exit 75 as today. Nothing is consumed.
7. `mp-deploy-authz.mjs consume`, under the lock. In `enforce`, a REFUSE releases the lock and exits non-zero.
8. Deploy as today.

**Retry.** A deploy that fails after step 7 needs a new run attempt, hence a new approval. Exit 75 never consumes, and the next try sends a new token (§1.3).

### 3.5 Phase B checks (Grok, evidence in #179)

| Step | What | Evidence | STOP if |
|---|---|---|---|
| B0 | read-only, as `ghrunner` and as root: `node` ≥ 20, `curl`, `grep`, `cat`; HTTPS to `raw.githubusercontent.com`, `api.github.com`, `token.actions.githubusercontent.com`; the runner's labels (none of the hosted allow-list); the guard's source (variables read: `GITHUB_WORKFLOW_REF`, event, ref, repository); the fork-workflow approval setting; hashes of `mp-deploy` and the guard | command output | anything missing, or the guard reading `GITHUB_WORKFLOW` |
| B1 | install v3 + verifier + ledger in **freeze + report** | file hashes; `mp-deploy` of the current SHA → `ALREADY_DEPLOYED`; of any other SHA → refused (freeze) | any other behaviour |
| B1-old | owner, deliberately: re-run run 39412733270 | `ALREADY_DEPLOYED`, no change (freeze: an older SHA would be refused) | any change on the VPS |
| B3 | after phase D, switch to **enforce**, lift **freeze** | config hash; `deploy.log` | — |
| D6 | replay: a recorded token, or a second token of a consumed attempt | `AUTHZ_REPLAY` | accepted |
| D7 | re-run of 39412733270 under enforce | refused: no token | it deploys |

**Rollback of phase B:** reinstall the previous `mp-deploy` and guard. Grok reports their SHA-256 as `caf9233f…` and `6e32cfff…` **[NOT VERIFIED by Claude]**. Keep the ledger, which is an append record. Whether the forward-only rule of the current `mp-deploy` refuses `3dd833f` after a newer release is **[NOT VERIFIED]**.

## 4. Activation sequence: no window for an unauthorized deploy

| # | Step | Who / GO | Expected | STOP if |
|---|---|---|---|---|
| 1 | open the gate PR | owner exception (#97 6316562293) | CI runs | — |
| 2 | CI green, Gate A/B, separate review on the PR head | agent | evidence in #97 | any finding |
| 3 | **phase B0–B1: `mp-deploy` v3 in freeze + report** | owner GO, Grok | §3.5 | §3.5 |
| 4 | merge the gate PR, with `vps-production` not yet configured | owner GO | run of the merge commit: `gate` FAIL (`GATE_ENVIRONMENT_MISSING`, or the codes for an unprotected environment); `deploy` skipped | **before merging:** B1 (`mp-deploy` v3 in freeze + report) not certified in #179 → do not merge (review NB-17); after: `deploy` starts |
| 5 | configure `vps-production` (§2) | owner GO | — | — |
| 6 | re-run all jobs of that run | owner | `gate` PASS, report showing the settings; `deploy` *Waiting* | `GATE_API_ERROR … 403` (token cannot read the environment), missing fields, or `deploy` starting |
| 7 | D1: wait 10 min | owner | still waiting | it starts |
| 8 | D2: reject | owner | run fails; no new `deploy.log` line | anything on the VPS |
| 9 | D3: re-run failed jobs | owner | `deploy` waits again | it starts without approval |
| 10 | D4: reject, then re-run all jobs | owner | `gate` again, `deploy` waits | it starts without approval |
| 11 | D5: approve | owner | post-approval gate PASS; token sent; `mp-deploy` v3 logs ACCEPT (report) and refuses the new SHA (freeze) | REFUSE in report, or a deploy |
| 12 | B3: enforce on, freeze off; then D5 again (a new approval) | owner GO, Grok | ACCEPT, deploy of the gate commit (application unchanged from `3dd833f`); health | any failed check |
| 13 | D6, D7 | Grok, owner | §3.5 | §3.5 |
| 14 | certification of the activation | agent + review | evidence in #97 and #179 | — |
| 15 | PR #178: merge GO | owner GO | run waits; approval deploys `57aab63`'s squash commit | — |
| 16 | GOV-01, APP-01, APP-02, one PR at a time | owner GOs as per the policy | — | — |

From step 3 on, `mp-deploy` refuses every new release until enforcement, so neither an old run nor a premature approval can deploy. Before step 3, nothing changes the current exposure: the only old run is 39412733270, already deployed.

**Rollback at any step:**
- **Stop every deploy:** set `freeze` on the VPS, or remove the reviewer / delete `vps-production` on GitHub. Every later gate fails closed **[SIMULATION]**.
- **Back to deploy-on-merge:** a reverting PR with an owner GO, plus `mp-deploy` back to v2.

## 5. Evidence

### 5.1 RED → GREEN

In each case the attack file was put in `.github/workflows/` of a copy, or the input was run against both versions.

| Finding | Attack | Vulnerable head | This branch |
|---|---|---|---|
| B-1 | `sneak.yml` (VPS runner, `mp-deploy`, no environment) | 9a7124a: 12/12 pass | refused |
| B-2 v1 | jobs indented by four spaces | 2af874f: fail 0 (2af874f is on branch `deploy-approval-01-history-2af874f`; same tree as `97e9eea` here) | refused |
| B-2 v2 | quoted job name | 2af874f: fail 0 | refused |
| B-2 v3 | `jobs:` in flow style | 2af874f: fail 0 | refused |
| B-2 v7 | `.yaml`, `pull_request`, external reusable workflow | 2af874f: fail 0 | refused |
| B-3 | `sneak.YML` | 512ef32: 6/6 pass, file not read | refused: `not a lower-case .yml/.yaml workflow name` |
| NB-5 | `if: false` on the post-approval gate | 2af874f: survived | refused: `deploy: step 1 has if` |
| NB-2 | gate script from a path with spaces | 9a7124a: exit 0, no output | exit 1, report |
| NB-7 | `null` header/payload | 2af874f: throws | `AUTHZ_MALFORMED_TOKEN` |
| NB-11 | `reviewers: "x"` | 512ef32: exit 1, 0 bytes of report | exit 1, 286-byte report |
| NB-12 | `verify` with a missing ledger | 512ef32: ACCEPT (review) | refused (`AUTHZ_ERROR`) |
| CI on PR #180 | the `mp-deploy` step simulation as a non-root user | a6abe28: `EACCES` (a fake `sleep` written through a symlink to the real one) | passes; fake tools are created with `wx` |

PyYAML 6.0.1 gives the same jobs as `yaml` for the B-1/B-2 attack files. That is an independent parser cross-check.

**Permanent tests** **[STATIC]**:
- the directory checks of B-3 and NB-14: 12 entries, plus an unreadable directory;
- 20 equivalent YAML forms;
- 20 unreadable forms;
- 8 key, event and label cases with 2 accepted ordinary workflows;
- 44 changes to `deploy-vps.yml`;
- 4 changes to `ci.yml`.

### 5.2 Mutations

Final run on this code; the list of replacements is published with the #97 report. Each mutation was applied to a copy, then the three gate test files were run with a 60 s timeout per test, and the file was restored.

**58 mutations: 57 killed, 1 equivalent.** Equivalent mutations are listed apart and not counted as killed.

| Id | Mutation | Result |
|---|---|---|
| P1, P2, P4–P16 | parse errors, duplicates, tags, merge keys, several documents, reusable, indirect events, any runs-on, names in values, other files, deploy file, step `if`, canonical equality, empty jobs, YAML 1.1 | 15/15 killed |
| P17–P24, R5 | any name read, case-insensitive extension, symlinks, subdirectories, case-only keys, any event, hosted pattern, anchors/tags on mappings, anchors accepted | 9/9 killed |
| A1–A13 | malformed tokens, signature, alg, claim coercion, age, replay in verify, non-exclusive consume, SHA binding, ambiguous kid, environment claim, crit, missing ledger, 16 KiB | 13/13 killed |
| R8, R9, R9b | no `fsync` of the directory; no `fsync` of the file; file `fsync` error not handled | 3/3 killed (fs injected and observed) |
| G1–G4 | self-review, entry check, absent admin bypass, unprotected report | 4/4 killed |
| W1–W4 | one token reused across retries; missing token tolerated; token not piped; `pipefail` removed | 4/4 killed |
| N1–N9 | encoding check off; UTF-16 check off; non-fatal decoding; `vps-production` not reserved; `ledgerHas` swallowing errors; `nbf` unchecked; warnings ignored; header file not removed; header file not 0600 | 9/9 killed (review NB-13…NB-16) |
| **P3 (equivalent)** | aliases accepted | an alias needs an anchor, which is refused; without one it does not parse |

Notes:
- **W4** is killed only by the canonical check. In the simulation it is equivalent: with no token, `node` exits 1, so the step fails anyway.
- **R11 and R16** (empty parts; both branch flags) are review 6316028694's own mutations, classified equivalent there. They were not re-run here.

### 5.3 Test counts

`node --test test/requirements-inventory.test.mjs test/governance-*.test.mjs test/ci-classify.test.mjs`:
- here: every test passes, including 3 that read the `evidence/audits` archive branch (fetched in this container);
- without that branch, the same 3 are skipped. Review 6316028694 had 101 pass and 3 skipped at 512ef32.

## 6. Attack surfaces

| # | Surface | Defense | Proof | Real check still needed |
|---|---|---|---|---|
| 1 | workflow directory entries | `readWorkflowDirectory` | [STATIC] B-3 tests | — |
| 2 | YAML forms and encodings | strict UTF-8, strict YAML 1.2 parser, refusals | [STATIC] 40 forms + PyYAML | — |
| 3 | paths to the VPS runner and `mp-deploy` | label allow-list, single exception, name scan; VPS guard; `mp-deploy` v3 | [STATIC]; guard [NOT VERIFIED] | B0, D7 |
| 4 | triggers and reusable workflows | event allow-list, no job `uses` | [STATIC] | — |
| 5 | canonical deploy workflow | exact structure + named invariants | [STATIC] 43 changes | — |
| 6 | full re-run, single-job re-run | environment on the job; post-approval gate | [STATIC]; [SIMULATION] | steps 9–10 |
| 7 | runs before the gate | `mp-deploy` freeze, then OIDC enforcement | [SIMULATION] verifier | B1-old, D7 |
| 8 | OIDC trust, replay, concurrency | verifier + ledger | [SIMULATION] incl. races, fsync | D6 |
| 9 | environment configuration | gate script, twice | [SIMULATION] | steps 6, 11 |
| 10 | bootstrap, rollback, recovery | §4 sequence with freeze | design | steps 3–13 |
| 11 | pre-merge runs of branch and fork workflows (NB-8) | guard, fork approval setting, rulesets, `mp-deploy` v3 | rulesets [GITHUB]; others [NOT VERIFIED] | B0 |

## 7. Residual risks

1. **Same GitHub identity.**
   - The agents act through the owner's account. They cannot approve deployments or touch environments **[GITHUB: 403]**.
   - They can merge a PR, since the rulesets require only a PR and `CI gate`. Governance alone stops a PR that rewrites the workflow and the policy together, until enforcement.
2. **Until step 3**, the exposure is unchanged from today: the old run 39412733270 can be re-run (`ALREADY_DEPLOYED`).
3. **Concurrency of waiting runs** is **[NOT VERIFIED]**. Reject a stale run; the post-approval gate refuses a stale SHA anyway **[SIMULATION]**.
4. **The retry window** between the post-approval gate and `mp-deploy` (up to about 10 min). Each try's token is bound to the approved SHA; whether `main` has moved meanwhile is checked only by `mp-deploy` **[NOT VERIFIED]**.
