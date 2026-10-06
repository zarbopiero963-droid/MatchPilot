# MatchPilot UX / Product References

## Canonical demo reference — 2026-10-06

- File: `matchpilot-trading-os-demo-2026-10-06.html`
- Title: `MatchPilot Trading OS`
- SHA-256: `8c7d22038559f1c2e781f2c5e7c1c8613c5106b4a6ef86fe6aa86bf48fc665e1`
- Size: 285481 bytes
- Based on: the 2026-10-05 reference below, same information architecture and visual language.
- Purpose: UX/product reference updated with the issues opened on 2026-10-05 and 2026-10-06.

### What changed from 2026-10-05

- **Trading Tools (#94)**: new `Tools` section with the tool tree, the shared LIVE / PRE-MATCH / MANUAL match selector, the calculators of the issue (decimal odds only), `LIQUIDITY_UNAVAILABLE`, outdated-calculation state, and CALCULATE / PREPARE / EXECUTE separation (EXECUTE only through #45).
- **Account settings (#95)**: Exchange, Trading, Risk, Display, Data and Advanced tabs; exchange commission propagated to tools, backtest and Money Management with a settings version.
- **Money Management (#96)**: new `Money` section with multiple versioned profiles, shared or segregated bankroll, bankroll accounting, trade lifecycle and append-only ledger with reversal, rule priority and filters, model registry (DISCOVERED → CERTIFIED) and the ALLOW / REDUCE / BLOCK / SIMULATION_ONLY decision.
- **Strategy Lab (#34)**: Money Management profile per strategy, filter by profile, Money Management tab in the rule editor; backtest commission read from the account.
- **Portfolio (#28 / #45)**: positions with lifecycle state and profile, paper-trading execution panel, links to the shared tools instead of duplicated calculators.
- **Integration map**: all open issues, including #44, #45, #46, #87, #91 (proposal only, not approved), #94, #95, #96; #12 shown as ready to close.
- **Data status**: values read from the public MatchPilot routes on 2026-10-06 08:01 UTC (certificate 20/20, reconciliation ledger, coverage per competition). This corrects the 2026-10-05 demo, which showed Serie A history from 2000: FutPythonTrader has Serie A from 2021-22.

Outside the Data status section the values remain demonstrative. In the prototype settings live in the browser; in the product they are account-level and server-side as required by #95.

## Previous demo reference — 2026-10-05

- File: `matchpilot-trading-os-demo-2026-10-05.html`
- Original uploaded artifact title: `MatchPilot Trading OS`
- Original SHA-256: `db0317034d0549e839a6637ee329dd512b12cc424f09a1989c37ec92e84bf3da`
- Original size: 192479 bytes
- Purpose: UX/product reference for the intended MatchPilot Trading OS experience.

### Contract

Both artifacts are **reference prototypes**, not a statement that the shown features are implemented or certified.

Use it to preserve:
- information architecture;
- page structure and navigation;
- visual language;
- intended interaction flows;
- mapping between product areas and GitHub issues;
- expected user-facing concepts.

Do **not** use hard-coded demo values as technical truth. Current code, Neon/Render state, README/CLAUDE.md/AGENTS.md, issue acceptance gates and real hard evidence remain authoritative for implementation status.

When implementation differs from the prototype for correctness, data availability, security, temporal integrity or certified provider capability, correctness wins. Material intentional UX deviations should be documented.
