<!-- Verbatim copy of the owner ratification comment https://github.com/zarbopiero963-droid/MatchPilot/issues/239#issuecomment-6388524544 (author zarbopiero963-droid, 2026-10-24T19:25:45Z). Do not edit: the GitHub comment is the source. -->

# OWNER RATIFICATION — MP-UI-D12-DECISIONS-20261024

**Authority:** explicit owner ratification on 24 October 2026, following D12 in [the atomic audit](https://github.com/zarbopiero963-droid/MatchPilot/issues/239#issuecomment-6386194763). **Status: APPROVED PRODUCT DECISIONS / NO MERGE / NO DEPLOY.** This comment is a decision record, not evidence of implementation or certification.

| D12 | Binding owner decision |
|---|---|
| 1 | Live and Replay without real source may be built as explicitly labeled **DEMO**, never represented as REAL; no invented data presented as real. |
| 2 | Hard tests for #29/#28 on isolated **VPS + replay** of existing snapshots; certification restricted to the replay scope. VPS production deploy remains blocked. |
| 3 | All 37 indicators undergo documented **KEEP/MERGE/REJECT** assessment; technical agents propose formulas, weights, thresholds and tests; owner ratifies substantive choices before implementation as approved indicators. Do not invent formulas. |
| 4 | Rule Builder uses a closed, typed **AND/OR/NOT** expression tree, bounded depth, without executable user code. |
| 5 | Evolve the **actual application's menu** incrementally, rather than replace it wholesale with mock/prototype navigation. |
| 6 | **REAL certification deferred** until verified real datasets, authorized deployment and verifiable URL are available. Mock/replay are not REAL. |
| 7 | **Persistent watchlist** with user-specific server-side persistence and appropriate authentication; no public cross-user access. |
| 8 | **Implement all progression and Money Management models** in the approved catalog, not merely the already specified ones. First reconcile the full catalog and define/approve missing formulas, advancement/loss rules, rounding, risk semantics and tests. Do not invent defaults or monetary caps; models requiring owner choices remain blocked individually until ratified. This is implementation scope approval, not approval of undefined algorithms or live betting. |
| 9 | Allow **read-only Replay** against archive #40, conditional on integrity checks, R-02 and separately authorized schema/infrastructure changes; preserve PIT/provenance and immutability. |
| 10 | FPT odds lacking capture timestamps may prefill tools only with explicit **NON_PIT** warning; never present as historically observed pre-kickoff odds. |
| 11 | Poisson λ remains **manual input** until an xG-to-λ model and PIT qualification are approved. |
| 12 | STOP/RESUME/PAUSE controls at both **account and MM-profile** levels; account STOP overrides profile RESUME. Server is authoritative, with durable/auditable state. |
| 13 | VOID, cup extra time and cancellations require **market-specific settlement rules and verified authoritative source**; ambiguous cases remain unresolved, never guessed. |
| 14 | OpenRouter/AI and conversational Copilot **OFF** pending explicit cost authorization; UI may be prepared with honest disabled states. |
| 15 | Specify and test Similar Odds bands, opponent strength, C19 confidence intervals and C20 criteria **before implementation**; no arbitrary numerical semantics. |
| 16 | LIVEMATCH near-match uses **transparent, deterministic, documented, configurable** matching criteria, not an invented fixed ±10% tolerance. |
| 17 | **Minimum sample N defined per statistic**, based on methodology and evidence; no universal N=30/N=50. Missing thresholds require specification and appropriate approval, with visible warning. |
| 18 | Technical/admin views and sensitive APIs **access-protected**; authentication and server-side authorization before production persistence, no sensitive public diagnostics. |
| 19 | Reconcile #97 and #104 with **incremental UI alongside required backend**, preserving existing requirements, gates, one-PR-at-a-time governance and the 1,090-requirement traceability matrix. |

## Mandatory reconciliation and next steps

- Preserve the full 1,090-item traceability matrix in #239; map each decision to impacted requirement IDs, blockers, PR cards and tests. Do not silently change status to TESTED/CERTIFIED.
- Record decisions in the canonical governance register following repository conventions; reconcile #97/#104 via appropriately reviewed documentation changes. Avoid overwriting unrelated owner decisions.
- Prepare **MP-UI-PR-006 Strategie** first; then #007 and later PRs sequentially. PR opening, CI, offline tests and review may proceed under existing permissions; **no merge or deploy** from this ratification.
- Correct mock/prototype discrepancies (LAY example, arbitrary financial caps, browser-side authoritative trading logic) in the relevant scoped PRs; never import them as approved semantics.
- **Separate authorizations still pending:** production schema migration and production login activation. No VPS production deployment, TotalCorner restart, Render/Neon use, paid AI, paid provider, real order execution or live API purchase is authorized.
- When a choice requires an as-yet undefined formula or parameter, record it as **approved scope / pending detailed specification**, not an invented owner decision.

**Source of authority:** owner's explicit 19-item confirmation in ChatGPT, 2026-10-24.
