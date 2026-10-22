# Paper ledger (#99) e Money Management (#96) — `mp-paper-ledger-1` / `mp-mm-1`

Solo denaro simulato. Moduli puri (nessun DB, rete, orologio): `src/ledger/paper-ledger.mjs`, `src/mm/money-management.mjs`,
`src/mm/paper-trading.mjs`. Test: `test/paper-ledger-mm.test.mjs`. Aritmetica: `src/math/decimal.mjs` (DEC-013).

## DEC-001 STOP / ADVISORY_ONLY
- `stopOperations` → `ADVISORY_ONLY` con audit who/when/reason; `resumeOperations` → `ACTIVE_OPERATIONAL`, nessun trade retroattivo.
- Fuori da `ACTIVE_OPERATIONAL` `openPosition` rifiuta (`OPEN_BLOCKED_BY_MODE`) senza scrivere nulla.
- `hedgePosition` (hedge/chiusura/cashout) ammesso in STOP solo se l'esposizione della posizione scende strettamente.
- Settlement, commissione, correzione ammessi in ogni modalità. `evaluate` in ADVISORY_ONLY calcola stake/liability teorici,
  restituisce `SIMULATION_ONLY`, `execution_permission=false` e l'etichetta "ADVISORY ONLY — operazione non registrata";
  `proposePaperTrade` non muta mai il ledger senza `execution_permission`.
- La sequence state avanza una sola volta per posizione da un settlement finale (anche in STOP); eventi duplicati idempotenti.

## DEC-013 default
- `SHARED_ACCOUNT_BANKROLL`: lo stake % usa `available_bankroll` del conto = cassa − esposizione di tutte le posizioni aperte.
  `SEGREGATED` rifiutata (`NOT_IMPLEMENTED`).
- VOID/PUSH non avanzano la progressione (`void_push_advances_progression=false`, configurabile). Settlement VOID/PUSH: P/L 0.
- Commissione: `commission_rate` registrato sull'entry `OPEN` (fill simulato) e usato al settlement, anche dopo correzioni.
  Calcolata sul guadagno netto positivo della posizione, arrotondata al centesimo (HALF_EVEN).
- Nessun limite monetario di default: `max_stake`/`max_liability` esistono solo se configurati.

## Ledger (#99)
Append-only (entry congelate): `INITIAL_ALLOCATION`, `OPEN`, `HEDGE`, `SETTLEMENT_GROSS`, `COMMISSION`, `SETTLEMENT_NET`, `REVERSAL`.
Stato = replay delle entry. Idempotency key per operazione (stessa chiave/contenuto → `ALREADY_APPLIED`; contenuto diverso →
`IDEMPOTENCY_CONFLICT`); doppio settlement → `DOUBLE_SETTLEMENT`. Correzione: `REVERSAL` + settlement `version+1`.
Gate di riconciliazione: allocazione + P/L netto realizzato = cassa. `unrealized_pnl` = null (servono prezzi live, mai inventati).

## Non ancora fatto
Persistenza PG18 (tabelle append-only: migrazione additiva che richiede approvazione owner D13 e `allow-migrations-<sha>`),
API/UI, modelli oltre FIXED_STAKE / PERCENT_BANKROLL, filtri/regole condizionali, limiti di perdita giornaliera/drawdown.

## MM-PR-01 (t142): registry, liability models, exposure/concurrency caps

- `src/mm/registry.mjs`: full #96 census (16 types) with every registry field and the 14 capability flags.
  IMPLEMENTED: FIXED_STAKE, PERCENT_BANKROLL, FIXED_LIABILITY, LIABILITY_PERCENT_BANKROLL. All others are
  DISCOVERED with `formula=null`: they are refused (`MODEL_NOT_IMPLEMENTED`) until the owner specifies formula,
  VOID/reset policy and test vectors. Nothing is invented.
- New optional caps (default null, no arbitrary limits): `max_total_exposure` (REDUCE to remaining room, BLOCK if none),
  `max_concurrent_trades` (BLOCK at the limit). Unknown caps are refused.
- Decision output adds `exposure_snapshot_ref`, `matched_rules`, `failed_filters` (empty until the rule engine).

### Gap vs #96/#99 still open
| Area | Status |
|---|---|
| Kelly, Target Profit, Recovery, Risk-based, progressions, Exposure-aware, Composite, Manual | DISCOVERED, formula needed from owner |
| Exposure per match/market/league/day/strategy, min/max odds, daily/weekly loss, drawdown, stop loss, cooldown | not done (needs owner rule definitions / per-dimension ledger tags) |
| Filters + rule engine with deterministic priority | not done (MM-PR-03) |
| Profile CRUD/versioning/safe delete, replay evaluation | not done |
| Persistence, API/UI | blocked by D13 |
