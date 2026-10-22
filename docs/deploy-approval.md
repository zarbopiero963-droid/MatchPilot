# Deploy approval gate (MP-DEPLOY-APPROVAL-01/-02, MP-DEPLOY-GATE-FINAL-01, MP-DEPLOY-UNBLOCK-FINAL)

A merge to `main` must not be an authorization to deploy. Before this change, every push to `main` started `deploy-vps.yml`, whose only job ran `mp-deploy` on the VPS runner at once.

With this change, the deploy job runs only after three things:
- the owner approves that run on GitHub;
- the gate checks GitHub's configuration again after the approval, from a root-installed copy on the VPS (a re-run is refused, §8.7);
- `mp-deploy` v3 checks a fresh OIDC proof of that approved run (phase B).

**Code ready is not protection active.** PR #180 is merged (`e127c26`), `vps-production` is configured by the owner and `mp-deploy` v3 runs on the VPS in freeze (Grok, #179 6320706638) **[NOT VERIFIED by Claude]**. Enforcement, the VPS side of §8 and #178 each need their own owner GO.

**§8 (MP-GATE-S1S2-FIX)** closes review B4 (an agent-merged change to `deploy-vps.yml` could run code on the VPS without approval) and adds the anti-stale rule (only the tip of `main` may be deployed).

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

**Encoding (reviews NB-14, B-4, NB-19, B-5).** Each file is decoded as strict UTF-8, keeping any byte-order mark so the character policy sees it. Then one character policy applies, defined by Unicode category (`UNSAFE_CHARACTER`). These are refused **[STATIC]**:
- invalid UTF-8 and UTF-16/32 byte-order marks;
- every control character except tab, LF and CR (category Cc): C0, DEL U+007F and C1 U+0080–U+009F, NEL U+0085 included;
- a CR that is not followed by LF (a lone CR, review B-5); CRLF stays accepted;
- format characters (Cf): byte-order mark anywhere, zero-width and bidirectional controls, soft hyphen;
- line and paragraph separators U+2028 and U+2029 (Zl, Zp);
- every space other than U+0020 (Zs), such as a no-break space;
- private-use, surrogate and unassigned code points.

Ordinary text stays accepted **[STATIC]**: letters (accented ones included), CJK, the em dash, `€`, guillemets. `ci.yml` and `deploy-vps.yml` contain `—`, `è`, `ò`.

Why this matters (review B-4): `yaml` 2.9.1 reads NEL, LS and PS as ordinary characters, while other parsers read them as line breaks. A line such as `# fine<NEL>  evil:<NEL>    runs-on: [...]` is a comment for `yaml` but a hidden job on the VPS runner for PyYAML 6.0.1 **[STATIC: test with PyYAML when available, and an emulation]**.
- The policy refuses the character, so no parser difference can be used.
- Whether GitHub's own parser reads these characters as line breaks is **[NOT VERIFIED]**.
- How GitHub decodes UTF-16 is **[NOT VERIFIED]**; the policy refuses it either way.

The same holds for a lone CR (review B-5). The YAML 1.2 specification (§5.4, `b-carriage-return`) and YAML 1.1 read it as a line break, and so do PyYAML 6.0.3 and Ruby Psych/libyaml **[STATIC: test with both when available]**. `yaml` 2.9.1 does not: in a comment the rest of the line disappears. The same hidden job therefore works with a lone CR, in a comment or inside a block scalar `run: |`, in `deploy-vps.yml` or in another file. Git keeps a lone CR as it is.
- The policy refuses a CR not followed by LF.
- Whether GitHub's own parser reads a lone CR as a line break is **[NOT VERIFIED]**; YamlDotNet's source treats it as one.

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
- in the `deploy` job, after the approval, and again before every retry after a busy lock. A re-run of the run is refused by the runner's job-start guard (§8.2, §8.7), so no approval is reused. This second run uses the copy installed and pinned by root on the VPS (`/usr/local/libexec/mp-gate/deploy-gate.mjs`, §8.2), never code from the approved commit, and requires `PASS` before `mp-deploy` **[SIMULATION: the step's own bash, real node, fake API]**. Until that copy is installed the step stops with `DEPLOY_GATE_NOT_INSTALLED`.

The script runs its checks from a path with spaces or through a symlink **[SIMULATION]** (review NB-2).

### 1.3 `mp-deploy` step: a fresh OIDC token on every try

The request token (`ACTIONS_ID_TOKEN_REQUEST_TOKEN`) goes to curl through a header file, never on a command line visible in `ps` (review NB-16). How the file is handled (review NB-21) **[SIMULATION]**:
- it lives in a private directory made for this step with `mktemp -d` (mode 0700, unique name, so no reuse or symlink at a predictable path);
- it is created with `noclobber` under `umask 077`, so it is mode 0600 from the start and an existing file is never written through;
- a stale, world-readable file at the old fixed path is neither used nor touched;
- the directory is removed on success, on error and on SIGINT/SIGTERM/SIGHUP (tested with SIGTERM while `mp-deploy` runs);
- if the directory or the file cannot be created safely, the step stops with `DEPLOY_OIDC_UNAVAILABLE` before any request or deploy;
- `umask` is changed only in a subshell, so `mp-deploy` keeps its own.

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
| B0 | read-only, as `ghrunner` and as root: `node` ≥ 20, `curl` (OIDC request only), `grep`, `cat`; HTTPS to `api.github.com`, `github.com` (git ref advertisement) and `token.actions.githubusercontent.com` (no script is downloaded from `raw.githubusercontent.com` any more: §8.2); the installed `/usr/local/libexec/mp-gate/*` (owner, mode, SHA-256 against the protected record, §8.2 "Integrity"); the runner's labels (none of the hosted allow-list); the guard's source (variables read: `GITHUB_WORKFLOW_REF`, event, ref, repository); the fork-workflow approval setting; hashes of `mp-deploy` and the guard | command output | anything missing, or the guard reading `GITHUB_WORKFLOW` |
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
| 9 | D3: re-run failed jobs | owner | `deploy` waits again; once approved, the job-start guard refuses it (`GUARD_RERUN_APPROVAL_UNBOUND`, §8.7) | it starts without approval, or the guard allows it |
| 10 | D4: reject, then re-run all jobs | owner | `gate` again, `deploy` waits; once approved, refused by the guard as in step 9 | it starts without approval, or the guard allows it |
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
| B-4 | a job hidden behind NEL in `deploy-vps.yml` (the review's line), also with U+2028/U+2029 and in another file | 10f6f95: workflow tests 8/8 pass, policy `[]` | refused: `ENCODING: character U+0085 is not accepted` |
| NB-19 | a leading UTF-8 BOM on disk; U+007F | 10f6f95: survived as review mutations M4, M13 | refused (E4, E7 killed) |
| B-5 | the B-4 line with a lone CR instead of NEL, in `deploy-vps.yml`, in a comment and in a block scalar of another file | be8d4e4: policy `[]`; PyYAML and Ruby/libyaml read the job `evil` | refused: `ENCODING: character U+000D is not accepted` |
| NB-21 | header file at a fixed path written over an existing file | 10f6f95: an existing file kept its mode | private `mktemp -d` directory, `noclobber`; a collision stops the step |

PyYAML 6.0.1 gives the same jobs as `yaml` for the B-1/B-2 attack files. That is an independent parser cross-check.

**Permanent tests** **[STATIC]**:
- the directory checks of B-3 and NB-14: 12 entries, plus an unreadable directory;
- 20 equivalent YAML forms;
- 20 unreadable forms;
- 8 key, event and label cases with 2 accepted ordinary workflows;
- 46 changes to `deploy-vps.yml`;
- 4 changes to `ci.yml`.

### 5.2 Mutations

The complete catalogue was run on `e998815`. Each mutation was applied to a copy, then the three gate test files were run (60 s timeout per test), and the file was restored. The B-5 fix changes only `UNSAFE_CHARACTER` and its tests. On that code, E4–E9 and the new E12 were run again, together with a sample of the other groups (P3, P16, A14, W7–W10), and gave the same results.

**70 mutations: 69 killed, 1 equivalent, 0 surviving.** The equivalent mutation is listed apart and not counted as killed.

The full matrix, with ID, component, change, observed result, class and the tests that fail, is published in #97 together with the head it was run on (review NB-20). E12 (a lone CR accepted) is added on PR #180 with the B-5 fix.

| Group | Ids | Result |
|---|---|---|
| Workflow policy and directory | P1, P2, P4–P24, R5 | 24 killed |
| Encoding and reserved names | E1–E12 | 12 killed |
| OIDC verifier, ledger, CLI | A1–A16, R8, R9, R9b | 19 killed |
| Gate script | G1–G4 | 4 killed |
| `mp-deploy` step (token, header file) | W1–W10 | 10 killed |
| **Equivalent** | P3 (aliases accepted) | an alias needs an anchor, which R5 and P24 keep refused; without one it is not valid YAML |

**Limits:**
- the mutations cover the code in this repository, not GitHub or the VPS;
- review 6318631568 ran its own 14 mutations. M4 and M13 survived there; they are E4 and E7 here, now killed.

### 5.3 Test counts

`node --test test/requirements-inventory.test.mjs test/governance-*.test.mjs test/ci-classify.test.mjs`:
- here: every test passes, including 3 that read the `evidence/audits` archive branch (fetched in this container);
- without that branch, the same 3 are skipped. Review 6316028694 had 101 pass and 3 skipped at 512ef32.

## 6. Attack surfaces

| # | Surface | Defense | Proof | Real check still needed |
|---|---|---|---|---|
| 1 | workflow directory entries | `readWorkflowDirectory` | [STATIC] B-3 tests | — |
| 2 | YAML forms and encodings | strict UTF-8, one character policy by Unicode category, strict YAML 1.2 parser | [STATIC] 40 forms, 25 refused characters, B-4 and B-5 attacks + PyYAML, Ruby/libyaml | GitHub's own parser on NEL/LS/PS and a lone CR: NOT VERIFIED (refused anyway) |
| 3 | paths to the VPS runner and `mp-deploy` | label allow-list, single exception, name scan; VPS guard; `mp-deploy` v3 | [STATIC]; guard [NOT VERIFIED] | B0, D7 |
| 4 | triggers and reusable workflows | event allow-list, no job `uses` | [STATIC] | — |
| 5 | canonical deploy workflow | exact structure + named invariants | [STATIC] 46 changes | — |
| 6 | full re-run, single-job re-run | environment on the job; job-start guard refuses any attempt but the first; post-approval gate | [STATIC]; [SIMULATION] | steps 9–10 |
| 7 | runs before the gate | `mp-deploy` freeze, then OIDC enforcement | [SIMULATION] verifier | B1-old, D7 |
| 8 | OIDC trust, replay, concurrency | verifier + ledger | [SIMULATION] incl. races, fsync | D6 |
| 9 | environment configuration | gate script, twice | [SIMULATION] | steps 6, 11 |
| 10 | bootstrap, rollback, recovery | §4 sequence with freeze | design | steps 3–13 |
| 11 | pre-merge runs of branch and fork workflows (NB-8) | guard, fork approval setting, rulesets, `mp-deploy` v3 | rulesets [GITHUB]; others [NOT VERIFIED] | B0 |

## 7. Residual risks

1. **Same GitHub identity.**
   - The agents act through the owner's account. They cannot approve deployments or touch environments **[GITHUB: 403]**.
   - They can merge a PR, since the rulesets require only a PR and `CI gate`. A PR that rewrites the workflow and the policy together is stopped on the VPS by the job-start guard of §8, once installed.
2. **Until step 3**, the exposure is unchanged from today: the old run 39412733270 can be re-run (`ALREADY_DEPLOYED`).
3. **Concurrency of waiting runs** is **[NOT VERIFIED]**. Reject a stale run; the post-approval gate refuses a stale SHA anyway **[SIMULATION]**.
4. **The retry window** between the post-approval gate and `mp-deploy` (up to about 10 min): closed by §8.3 (the gate runs again before every retry) **[SIMULATION]**, and under the lock by `mp-deploy` v3.1 (§8.4).

## 8. MP-GATE-S1S2-FIX: no code on the VPS without the owner's approval, and only the tip of `main`

Owner requirements:
- anti-stale, #97 6321186934;
- agent permissions, #179 6321275419;
- S1 audit, #179 6321726326 (findings B4 and B8);
- implementation GO in session (2026-10-21).

### 8.1 What GitHub can and cannot separate

- **One identity.** The owner and the agents act on GitHub as the same account, `zarbopiero963-droid`; the owner keeps this account as the only approver. The agents use the Claude GitHub App, which has these permissions **[GITHUB: owner's screen]**:
  - Administration: read;
  - Actions, Checks, Contents, Issues, Pull requests, Repository hooks and Workflows: read/write;
  - **no Deployments**.
- **Approving is the one owner-only act.** An approval call with the app's token was refused with `403 Resource not accessible by integration` **[GITHUB, 21/10]**. Approving a deployment is therefore the one act GitHub reserves to the owner's own sessions (browser or mobile).
- **The installer cannot narrow the app.** GitHub's documentation describes the installer as granting the permissions the app requests. The installer's controls are repository access, suspension and removal. Removing only Workflows or Actions from the Claude app is **[NOT VERIFIED: not offered by GitHub's documentation]**.
- **Branch rules cannot tell owner and agent apart.** A PR opened by an agent is authored by the owner's account, so the owner cannot approve it. A code-owner rule on `.github/workflows/**` would therefore block every such PR, including the owner's own changes, unless a bypass is used. The bypass belongs to the same account, so it does not tell the owner from the agents either.
- **Push rulesets (file path restrictions)** are documented for private and internal repositories only.
- **Conclusion.** No setting on GitHub's free plan separates the owner from the agents on merges. The barrier is put where the agents cannot reach: the VPS, keyed on the owner's approval.

### 8.2 Job-start guard of the VPS runner (`scripts/runner-job-guard.mjs`, tested by `test/governance-runner-guard.test.mjs`)

**Finding B4.**
- A PR merged by an agent can change `deploy-vps.yml`, for example by dropping `environment` or adding a job, together with `workflow-policy.mjs` and its tests. `CI gate` stays green.
- The push to `main` then starts a job on the VPS runner. The current guard allows `deploy-vps.yml` + `push` + `main` without looking at the file **[NOT VERIFIED: Grok's report]**.
- That job would run code as `ghrunner` with no approval. It could not deploy (v3 freeze; in enforce, no token for `vps-production`), but it could execute code.

**The guard** is the runner's `ACTIONS_RUNNER_HOOK_JOB_STARTED` script. GitHub runs it after a job is assigned and before any step; any exit code other than 0 fails the job before it runs **[NOT VERIFIED: GitHub documentation]**. It allows a job only when all of these hold. Facts are read from GitHub with public, unauthenticated reads; any read error refuses.

| Check | Read from | Refusal |
|---|---|---|
| repository, `push`, `refs/heads/main`, `GITHUB_WORKFLOW_REF` = `deploy-vps.yml@refs/heads/main`, job `deploy`, numeric run id/attempt, SHA, runner name | runner environment (GitHub does not let a workflow overwrite `GITHUB_*`) | `GUARD_REPOSITORY`, `GUARD_EVENT`, `GUARD_REF`, `GUARD_WORKFLOW`, `GUARD_JOB`, … (no GitHub read at all) |
| first attempt only: GitHub's review history of a run (`GET …/approvals`) carries no attempt and no time, so an approval cannot be tied to a re-run | runner environment | `GUARD_RERUN_APPROVAL_UNBOUND` (no GitHub read) |
| the run: id, attempt, `push`, branch `main`, head SHA, path `.github/workflows/deploy-vps.yml`, repository, **in progress and without a conclusion** | `GET /actions/runs/{id}` | `GUARD_RUN_MISMATCH` (also catches a run id pointing at another, approved run) |
| this attempt has exactly one job `deploy`, assigned to this runner, **`in_progress` and without a conclusion** (not completed, cancelled, queued or waiting) | `GET /actions/runs/{id}/attempts/{n}/jobs` | `GUARD_JOB_NOT_ASSIGNED_HERE`, `GUARD_JOB_NOT_ACTIVE` |
| `deploy-vps.yml` at that SHA is byte for byte the pinned file: its git blob SHA equals `workflow_blob_sha` in the root-owned config | `GET /contents/.github/workflows/deploy-vps.yml?ref=<sha>` | `GUARD_WORKFLOW_NOT_PINNED` |
| the owner approved `vps-production` for this run, and nothing of it still waits | `GET …/approvals`, `GET …/pending_deployments` | `GUARD_NO_OWNER_APPROVAL`, `GUARD_DEPLOYMENT_STILL_WAITING` |
| the SHA is the tip of `main` for both sources (§8.4) | git ref advertisement and `GET /branches/main` | `TIP_STALE`, `TIP_UNVERIFIABLE`, `TIP_REFS_MALFORMED` |

**Why the hash alone is not enough.**
- **Hash pin:** stops a changed workflow, even one that was approved.
- **Approval:** stops an unchanged workflow started without the owner's approval. Removing `environment` would need a changed file, but the approval check refuses even if a pin were wrong.
- **Run, job and runner checks:** stop a job that points at another, approved run, or at a job of this run that is already over (review NB-1).
- **First attempt only:** stops an approval given to an earlier attempt from counting for a re-run (review NB-2).
- **Anti-stale:** stops an approval of an older run.
- **The guard runs before every job on that runner,** whatever starts it: another workflow, a branch, a fork, `workflow_dispatch` or a re-run.
- **No security code from the commit runs on the VPS** (owner hardening point 4, review NB-5). The `deploy` job runs only:
  - the inline bash of the pinned `deploy-vps.yml`;
  - the gate script installed by root, `/usr/local/libexec/mp-gate/deploy-gate.mjs`, after the approval and before every retry;
  - `sudo mp-deploy`, root-owned.

  The job checks out nothing and downloads no script. The application code of the approved commit is fetched and built by `mp-deploy` itself (the release being deployed), not by the job.

**Install (Grok, separate owner GO):**
- copy `scripts/deploy-authz.mjs`, `scripts/runner-job-guard.mjs` and `scripts/deploy-gate.mjs` at the merged SHA into `/usr/local/libexec/mp-gate/` (0755 root:root, files 0644, SHA-256 recorded in the infra repository). The guard imports `./deploy-authz.mjs`; the workflow runs `deploy-gate.mjs` from there;
- write the config `/etc/mp-deploy/runner-guard.json`, root:root 0644: `{"workflow_blob_sha": "<git hash-object .github/workflows/deploy-vps.yml at the merged SHA>"}`. The value is the same as the `sha` the contents API returns;
- extend the existing hook, referenced from `/opt/actions-runner/.env`, which is root:ghrunner 0640. Keep its current checks, then add `node /usr/local/libexec/mp-gate/runner-job-guard.mjs /etc/mp-deploy/runner-guard.json`, logging its JSON line to the journal (`logger -t mp-runner-guard`);
- any later change to `deploy-vps.yml` needs a new pin by root, which needs an owner GO.

**Integrity of the installed scripts (binding requirement for S3 and S4, owner mandate PR #181 FINAL DELTA CLOSURE, review NB-D).** The workflow only checks that `/usr/local/libexec/mp-gate/deploy-gate.mjs` exists (`[ -f ]`). Its integrity rests on root ownership and on a protected record. Before S3 is certified and at every S4 test run, Grok must verify, and report in #179, that:
- the directory `/usr/local/libexec/mp-gate/` and each file in it (`deploy-gate.mjs`, `deploy-authz.mjs`, `runner-job-guard.mjs`) are owned by root:root, the directory 0755 and the files 0644, with no group or other write bit, no ACL and no symlink, and that no ancestor directory is writable by anyone but root;
- the same holds for the config `/etc/mp-deploy/runner-guard.json` and the hook referenced from `/opt/actions-runner/.env`;
- the SHA-256 of each file equals the value recorded at install in the root-owned infra repository on the VPS (`installed/SHA256SUMS.installed`, the protected source of verification). That value in turn equals the SHA-256 of the same file at the merged commit of `main`, recomputed from GitHub at install time;
- `ghrunner` cannot write, rename or replace any of these paths (tested as `ghrunner`, as T11 in #179 6320706638).

A mismatch stops S3 or S4 (fail closed). Making the hook itself check these hashes at every job is a possible later hardening, with its own owner GO. It is not in this PR.

### 8.3 Anti-stale in the workflow (`deploy-vps.yml`, step `mp-deploy`)

**Before every retry** after a busy lock (exit 75), the step runs again the root-installed gate script. A merge on `main` during the wait therefore stops the run with `GATE_SUPERSEDED` before another token is requested **[SIMULATION; RED on `e127c26`: the step retried with a new token]**. Exit codes other than 75, including `mp-deploy` v3.1's 79, are not retried.

**A superseded run** writes on its own page, in the step summary: "Run obsoleto: non approvarlo", the SHA of this run, and the tip of `main` to approve instead. It approves nothing and never deploys another SHA.

### 8.4 Anti-stale in `mp-deploy` v3.1 (Grok, separate owner GO)

New verifier commands:
- `deploy-authz.mjs main-tip --sha <sha>` reads the tip of `refs/heads/main` from two sources:
  - the git smart-HTTP ref advertisement, read strictly: pkt-lines, exactly one `refs/heads/main`, nothing after the final flush;
  - `GET /branches/main`.

  Each read has a 10 s timeout, a 1 MiB limit, no redirect and must answer 200. The two sources must agree with each other and with `<sha>`.
- `deploy-authz.mjs approved --run-id <id> --run-attempt <n>` checks the owner's approval of that run, for attempt 1 only (`AUTHZ_RERUN_APPROVAL_UNBOUND` otherwise).

**Order in v3.1:**
1. stdin;
2. validate `<sha>`;
3. freeze (78);
4. `verify` (77);
5. lock (75, nothing consumed);
6. `consume`;
7. `approved --run-id <run_id> --run-attempt <run_attempt>` of the token (77);
8. `main-tip` (79);
9. fetch and build **`<sha>` only, never a substitute**;
10. `main-tip` again (79), just before the atomic switch of `current`;
11. switch, restart, health.

A refusal at steps 7–10 leaves `current` and `deployed` unchanged and the token consumed.

**Guarantee.**
- Under the lock, no switch happens without a successful second tip check.
- An SHA superseded by a merge that GitHub shows before that check is refused, even with a valid token and the owner's approval.

**Limits.**
- The propagation delay of GitHub just after a merge: the two sources disagree, which counts as `TIP_UNVERIFIABLE`.
- The milliseconds between the second check and the switch.
- A merge after that check is deployed by its own run, once approved (forward-only).

**Acceptance (S4/S5).** For every `DEPLOYED` line of `deploy.log`:
- the SHA equals the tip both sources gave at the second check;
- that check ended at most 5 s before the switch;
- the run had the owner's approval.

### 8.5 B8: cancelling runs and deleting run logs

The app's Actions: write lets an agent cancel a run or delete its logs. That cannot approve or deploy anything (availability and evidence only), and GitHub does not let the installer remove that permission (§8.1).

Defenses:
- `.claude/settings.json` denies the GitHub MCP tool `actions_run_trigger` (re-run, cancel, delete logs, dispatch) in Claude Code sessions on this repository. This is a harness rule, not a GitHub barrier: a session could still use the REST API through its shell, and the file is part of the repository.
- The authoritative evidence of every deploy is on the VPS, where the agents cannot write: `deploy.log`, the OIDC ledger and the guard's journal lines. GitHub's run logs are a copy.

### 8.6 Tests (this PR)

| Area | Cases | Evidence |
|---|---|---|
| guard | allowed job; changed workflow even approved; no environment; extra job; `ci.yml`, `pull_request`, `workflow_dispatch`, branch, fork on the VPS runner; approval by another user, rejected, for another environment, unreadable; still waiting; job on another runner, two `deploy` jobs; run id pointing at another run (SHA, attempt, path, event, branch, repository); merges A/B/C; API down, workflow unreadable, tip source down, sources disagreeing, malformed refs; bad config; CLI | [SIMULATION] `test/governance-runner-guard.test.mjs` |
| tip and approval | strict ref advertisement (14 malformed forms); agree, stale, three merges; a source down or malformed, disagreement; HTTP 200 only, no redirect, size limit (local server); run approval read and refusals; CLI arguments | [SIMULATION] `test/governance-deploy-authz.test.mjs` |
| workflow | retry after a busy lock with `main` moved: stopped before a second token; two busy locks with `main` unchanged: two checks, three tries; 79 not retried; the step summary of a superseded run | [SIMULATION] `test/governance-deploy-gate.test.mjs`, RED on `e127c26` |
| canonical | `deploy-vps.yml` equals `CANONICAL_DEPLOY` (regenerated from the file) | [STATIC] `test/governance-workflows.test.mjs` |
| hardening (owner, after review 6322314877) | job completed, cancelled, queued, waiting or with a conclusion, and run over, all refused (NB-1); re-runs refused by the guard and by `approved` before any read (NB-2); the VPS steps use only the root-installed gate, nothing downloaded or checked out (NB-5); 204, a declared oversize answer, `git-receive-pack`, a NUL on a later ref line, a job record of another attempt, a workflow path that is not a file (NB-3) | [SIMULATION]/[STATIC]; RED on `5e79bfc` for the guard, `approved` and the VPS steps |

**Not verified until S3–S5 (owner GOs):**
- the guard on the real runner, in particular that this attempt's `deploy` job already shows this runner's name when the hook runs. If GitHub reports it later, the guard refuses (fail closed) and the check is adjusted in a follow-up;
- approvals bound to a run attempt;
- the real OIDC token;
- `mp-deploy` v3.1.

### 8.7 Operational limits (review NB-4)

**API rate limit.**
- The guard and `mp-deploy` v3.1 read GitHub without a token: 60 requests per hour per IP address **[NOT VERIFIED: GitHub documentation]**.
- The guard makes 6 REST reads per job (run, jobs, contents, approvals, pending deployments, branch) plus one read of the git ref advertisement on `github.com`. `mp-deploy` v3.1 makes 3 per deploy (approvals and the branch twice).
- About 9 per deploy, so a few deploys an hour stay far below the limit. When the limit is exceeded, GitHub answers 403 and the deploy is refused (fail closed): wait for the next hour.
- A shared outbound IP (other software on the VPS calling the API) counts against the same limit. Grok checks this in S3.

**`GITHUB_*` and `RUNNER_NAME` in the hook.** The guard needs these from the runner's environment when the hook runs:
- `GITHUB_REPOSITORY`, `GITHUB_EVENT_NAME`, `GITHUB_REF`, `GITHUB_WORKFLOW_REF`, `GITHUB_JOB`;
- `GITHUB_RUN_ID`, `GITHUB_RUN_ATTEMPT`, `GITHUB_SHA`;
- `RUNNER_NAME`.

Two points are **[NOT VERIFIED]**: that all of them are present in the hook's environment, and that a workflow's `env:` cannot overwrite them there. Any missing one refuses the job. **S3 check:** a hook in log-only mode prints the names (not the values of anything secret) for one real run, before the guard is enforced.

**Runner assignment.** The guard requires this attempt's `deploy` job to be `in_progress`, without a conclusion, with `runner_name` equal to this runner when the hook runs **[NOT VERIFIED]**. If GitHub sets these later, every deploy is refused (fail closed). S3/S4 then show it, and the check is adjusted with an owner GO, never relaxed silently.

**Re-runs.**
- A re-run is refused (`GUARD_RERUN_APPROVAL_UNBOUND`), because no GitHub record ties an approval to an attempt.
- A deploy that failed is redeployed by a new run, that is a new commit on `main` approved by the owner.
- Lifting this needs GitHub evidence, gathered in S4, that every attempt requires its own approval and that this can be read back. That is a concrete blocker for re-runs, not for first attempts.

### 8.8 Owner actions

- **None is needed to merge this PR.** Merging deploys nothing: FREEZE refuses any new SHA, and the run of the merge commit waits for an approval. Do not approve it.
- **Before enforcement (S5)**, these need separate GOs:
  - Grok installs the guard (§8.2) and `mp-deploy` v3.1 (§8.4), keeping freeze on;
  - Grok runs the S4 tests: a run of a changed workflow refused by the guard; approvals of older runs refused; replay; old runs.
- **Owner checks** (S1 inventory, #179 6321726326): no other GitHub App, OAuth app or personal access token with Deployments or full `repo` access exists in your account settings, and Grok reports the credentials it uses and any found on the VPS.

## 9. MP-AUTODEPLOY-01: deploy automatico dopo un merge autorizzato (owner t123u, t124u)

**Cosa sostituisce l'approvazione umana.** Il guard del runner (root, `/usr/local/libexec/mp-gate/runner-job-guard.mjs`) e il gate
(`deploy-gate.mjs`) ammettono il job `deploy` solo se, letti da GitHub e mai dal commit:
- lo SHA è il `merge_commit_sha` di una PR **mergiata** su `main` di questo repository (`GET /commits/{sha}/pulls`): mai un push diretto;
- il check `CI gate` dell'app `github-actions` è **completed/success** su esattamente quello SHA, e il più recente decide;
- quel check appartiene alla check suite di un run **push su main** di `.github/workflows/ci.yml` concluso con successo, e
  `ci.yml` a quello SHA è il blob pinnato da root in `/etc/mp-deploy/runner-guard.json` (`ci_workflow_blob_sha`): un ci.yml
  modificato nella stessa PR non può fingere il check (owner t124u, punto a);
- invariati: `deploy-vps.yml` pinnato, primo tentativo (`GUARD_RERUN_APPROVAL_UNBOUND`), job assegnato a questo runner,
  run in corso, SHA punta di `main` da due fonti.

**Run più vecchi (owner t124u, punto b).** `concurrency: cancel-in-progress: true`: un push più recente cancella il run
più vecchio. `mp-deploy` ignora il segnale di cancellazione dentro il protocollo atomico e ricontrolla la punta di `main`
subito prima dello switch (`deploy-authz.mjs main-tip`): uno SHA superato è rifiutato senza toccare `current`.

**Il job gate attende la CI** (`DEPLOY_GATE_WAIT_CI_S=2400`): solo CI mancante o in corso viene atteso; ogni altro problema ferma subito.
Sulla VPS l'attesa è 0: la CI deve essere già verde.

**Environment.** `vps-production` mantiene la branch policy solo `main` e nessun bypass admin; la regola required reviewers
non è più richiesta (se presente può contenere solo l'owner). La rimozione del reviewer è un'azione dell'owner sulle
impostazioni GitHub, fatta solo all'attivazione, dopo i test.

**Attivazione (ordine):** merge di questa PR → root installa gli script al merge SHA e i due pin → test S4 positivi e
negativi sulla VPS → mp-deploy v3.2 (segnali ignorati nel protocollo, ricontrollo punta prima dello switch, notifica
Telegram tecnica dell'esito) → enforce del guard (`/etc/mp-deploy/runner-guard.enforce`) → rimozione del required reviewer.
