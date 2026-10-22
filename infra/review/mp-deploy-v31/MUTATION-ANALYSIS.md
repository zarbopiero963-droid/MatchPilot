# Mutation testing (manual mutants, mutmut-style) — v3.1-r2

Run 1 (`mutation-results.txt`): 66 mutants + 3 no-op controls. 54/66 killed. All 3 controls survived, so the suites
are not flaky under parallel load (6 jobs).
Two new tests were then added: A16d3 (conf 0644) and I01a (forged consistent MANIFEST). Run 2 (`mutation-rerun-results.txt`): D06 and I01 killed.
**Final: 56/66 killed (84.8%).** The 10 survivors are listed below. None of them opens a path to a deploy: in each case another layer still refuses.

| Mutant | Change | Why it survives / equivalence |
|---|---|---|
| D08 | report+FREEZE final `deny FROZEN` → log only | equivalent: the next gate (`[ FREEZE=1 ] && finish FROZEN`) still exits 78 before any fetch (D02 snapshot diff stays empty) |
| D15 | verifier re-hash right before each use removed | redundant with the integrity hash at start. It only narrows a TOCTOU window on root-only paths, which an offline test cannot race reliably |
| D30 | verifier exact mode 644 dropped | `safe_file` still forbids g/o write, symlink, non-root, ACL. 0600 would also be safe |
| D32 | hook exact mode 755 dropped | same as D30 |
| D44 | sudoers line-continuation join removed | defence in depth: a continued ghrunner line or alias is still not the exact rule (S10 killed by the exact-match check). Effective `sudo -l` covers it as well |
| K01 | hook stage-1 workflow_ref check removed | redundant: runner-job-guard.mjs checks GITHUB_WORKFLOW_REF and the run path from the API (H05/H16 still refused) |
| K07 | guard exit code not checked | redundant: the guard prints `"result":"ALLOW"` only when it also exits 0 |
| K08 | ALLOW grep loosened | redundant with K07 for the real guard, whose output starts with `{"guard":…,"result":…}`. Only a tampered guard could exploit it, and stage 2 pins the guard's hash |
| K09 | `timeout` around guard removed | redundant: every GitHub read in deploy-authz.mjs has `AbortSignal.timeout` (H41 still refuses) |
| K11 | symlink check in hook `pinned()` removed | the hash pin plus root ownership of the target still hold. Kept as defence in depth |
