# MatchPilot multi-agent protocol (vendor-neutral)

**Status:** binding for every agent (Claude Code, Codex, Grok or any other). Source: owner t141u/t145u, decision `OWN-T141U-GOV150`, issue #150.
**You need only:** this repository, `git`, `node` (>= 20) and network read access to the public GitHub API. `gh` is optional.
GitHub is the single source of truth. A local `CHECKPOINT.md` or similar note is only a derived copy and never overrides GitHub.

## 1. Orient (read-only, always first)

```
git clone https://github.com/zarbopiero963-droid/MatchPilot && cd MatchPilot   # or: git fetch origin && git checkout origin/main
npm ci --ignore-scripts      # only once; governance tools have no runtime deps besides node
node tools/governance/cli.mjs orient            # human summary; --json for machines; --offline skips GitHub
```

`orient` prints:
- the deployed release SHA, the current task and the next action (`docs/governance/runtime-state.json`, schema `docs/governance/schemas/runtime-state.schema.json`);
- the blockers and pending runtime checks;
- the IN_FORCE owner decisions (`docs/governance/owner-decisions.json`; the relayed owner texts are in `runtime-state.json → owner_decisions_relayed`);
- the live tasks with lease, latest checkpoint and divergences;
- the tasks in HANDOFF READY;
- the drift between the registry and GitHub.

It ends with `verdict: PROCEED` (exit 0) or `STOP` (exit 2).

## 2. Find and verify the latest valid checkpoint

```
node tools/governance/cli.mjs resume <TASK>      # latest head of the supersedes chain + divergences
```

The latest valid checkpoint is the single head of the task's `supersedes` chain in `docs/governance/checkpoints/`. Its schema is `docs/governance/schemas/checkpoint-v3.schema.json`, with full rules in HANDOFF.md.

`resume` compares `commit_sha`/`tree_sha` with the real branch and the PR state. Any of these codes means STOP:
- `SHA_MISMATCH`, `UNRECONCILED_COMMITS`, `TREE_MISMATCH`, `BRANCH_MISSING`;
- `PR_ALREADY_MERGED`, `MERGE_NOT_REAL`;
- `STALE` (active state older than 24h).

Telling done from running from blocked:
- **Done:** registry state MERGED/COMPLETED.
- **Running:** RUNNING with an active lease.
- **Blocked:** BLOCKED, or any divergence.
- **Ready for you:** HANDOFF READY with no lease.

## 3. Takeover rule (owner t145u, executable)

Before modifying anything:

```
node tools/governance/cli.mjs takeover-check <TASK> --agent <your-agent-id>
```

The check reads the active leases (registry), the open PRs and unmerged branches (GitHub, git) and the running or queued CI.

You may take over a task only if:
- its lease was explicitly released (`lease: null`, e.g. HANDOFF READY), or
- its lease has expired.

The check returns STOP on any of:
- `LEASE_ACTIVE`;
- `OPEN_PR_OF_ACTIVE_AGENT`;
- `CI_RUNNING`;
- `TASK_FINISHED`;
- `GITHUB_UNREADABLE`.

An abruptly interrupted agent is handled **only by lease expiry**. Never overwrite its branch, checkpoint or registry entry. Instead:
- record a reconciliation, then claim with `--reconciled`;
- if the branch moved after its checkpoint (`UNRECONCILED_COMMITS`), stop and write a BLOCKED checkpoint.

## 4. Claim with a lease (no conflicts)

```
node tools/governance/cli.mjs handoff-in <TASK> --agent <id>      # for HANDOFF READY tasks: full fail-closed checks
node tools/governance/cli.mjs claim <TASK> --agent <id> --role "Test Agent" --minutes 120 --expected-revision <rev> [--reconciled]
git add docs/governance/work-registry.json && git commit -m "claim <TASK>" && git push      # the claim is real only once on GitHub
```

`claim` is refused when:
- another agent holds an active lease (`CONFLICT_LEASE_ACTIVE`);
- an expired lease has not been reconciled (`CONFLICT_UNRECONCILED`);
- the registry revision changed (`CONFLICT_REVISION`);
- another writer holds the file lock (`CONFLICT_LOCKED`);
- a shared resource is leased (`CONFLICT_RESOURCE_LEASED`);
- a second implementation task would run without `parallel_authorization` (`CONFLICT_PARALLEL_IMPLEMENTATION`).

If your push is rejected because main moved: fetch, re-run `takeover-check`, and claim again on the new revision.

## 5. Work, checkpoint, release

1. Work on the task branch: one branch per task, never reused. One implementation PR at a time.
2. Every PR must:
   - update `docs/governance/work-registry.json` (own task + reconcile the previous merged one);
   - update `docs/governance/runtime-state.json` when production, the plan or the pending checks change;
   - pass `node tools/governance/cli.mjs validate`, `runtime-state --check` and `drift` (CI runs all three).
3. Checkpoint: add `docs/governance/checkpoints/CP-<YYYYMMDDTHHMMSSZ>-<agent>.json` (mp-checkpoint-v3) with `supersedes` = the previous head.
4. Stopping before the end: write a checkpoint in state `HANDOFF READY` with `handoff: {status: "OUT", to: "ANY"}`, then run:
   ```
   node tools/governance/cli.mjs release <TASK> --agent <id> --checkpoint <CP-ID> --state "HANDOFF READY"
   ```
   Commit and push.
5. Reviews you write are labelled by what they are: a self-review is never "independent". Gate/CI PASS are claims that the next agent re-verifies.

## 6. Negative scenarios (tested in `test/governance-protocol-negative.test.mjs`)

| Scenario | Expected |
|---|---|
| Stale checkpoint (> 24h active) | `STALE` → STOP |
| SHA divergence (branch rewritten) | `SHA_MISMATCH` → STOP |
| Expired lease | drift `LEASE_EXPIRED`; claim without `--reconciled` → `CONFLICT_UNRECONCILED` |
| Abrupt interruption (work after checkpoint) | `UNRECONCILED_COMMITS` → STOP, never overwrite |
| Concurrent double claim | `CONFLICT_LEASE_ACTIVE` / `CONFLICT_REVISION` / `CONFLICT_LOCKED` |
| Takeover while work is in progress | `LEASE_ACTIVE` / `OPEN_PR_OF_ACTIVE_AGENT` / `CI_RUNNING` → STOP |

Run them with `node --test test/governance-protocol-negative.test.mjs`.

## 7. Hard limits (owner)

- Simulated money only, football only, no spend.
- Render, Neon and TotalCorner stay off; #40 is immutable.
- No destructive migrations: additive ones only under D13 = A.
- No invented economic rules.
- No deploys 03:15–04:45 Europe/Rome.
- Never print secrets.
- Do not post certifications on #150 without an owner mandate.
