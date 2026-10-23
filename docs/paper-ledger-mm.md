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

## Settlement dalle regole di mercato (LEDGER-CORE-03, #99 × #100)
`src/ledger/settlement.mjs` `settleFromResult(ledger, {positionId, versions, asOf, at})`. Una posizione aperta con il proprio
mercato (`openPosition(..., market: {marketType, selection, line?, team?})`, validato con `validateMarketSpec` del registro
#100: selezione ammessa per quel mercato, `line` n+0.5 solo e sempre dove la regola la usa, `team` HOME|AWAY solo e sempre
dove serve; altrimenti `BAD_SELECTION`/`UNSUPPORTED_LINE`/`BAD_INPUT` all'apertura) si regola con la
regola canonica e la versione del risultato (DEC-002, `resolveVersioned`), mai con un esito scritto dal chiamante:
- nessun FINAL validato, stato non finale o mercato non risolvibile → `PENDING`, nessuna entry (DEC-015: nessun VOID);
- primo esito → `SETTLED`; la entry `SETTLEMENT_NET` registra `resolution` (regola, versione del risultato, provenienza,
  flag di correzione);
- stessa versione di nuovo, o versione successiva con lo stesso esito → `UNCHANGED`, nessuna entry;
- versione successiva con esito diverso → `CORRECTED`: `REVERSAL` + nuovo settlement (versione +1), storico conservato;
- risultato più vecchio di quello applicato → `STALE_RESULT`; posizione senza mercato → `MARKET_BINDING_MISSING`;
  posizione regolata a mano → `MANUAL_SETTLEMENT`; cambio di fornitore (anche senza FINAL) → `PROVIDER_CHANGED`;
  stessa versione del risultato con contenuto diverso → `CONFLICTING_VERSION` (DEC-002: versioni immutabili);
  regolata con un'altra versione delle regole → `RULE_VERSION_CHANGED`;
- una correzione registra sempre `corrected: true` e `corrects_outcome_version`; con `UNCHANGED` la versione più recente
  è riportata nella risposta ma non registrata (resta la risoluzione applicata).
Solo in memoria: la persistenza è LEDGER-CORE-01.

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

## MM-PR-02 (t143): per-scope exposure caps, min/max odds, reset flags

Source: #96 "Parametri policy / risk – Minimo", "Filtri", the capability schema in the #96 comment, and "Priorità deterministica".
- `openPosition({..., scope: {match, market, league, strategy}})`: optional plain-id tags. `accountState().open_exposure_by_scope`.
- Caps `max_exposure_per_{match,market,league,strategy}`: REDUCE to the remaining room, BLOCK when none is left. A set cap
  with no scope id on the proposal fails closed (`SCOPE_ID_MISSING:<scope>`, BLOCK).
- `min_odds`/`max_odds` filters: the outcome is the profile's `filter_fail_action` (BLOCK | SIMULATION_ONLY), with no default
  (#96 "ELSE: reduce stake / block / simulation only"); reported in `failed_filters`.
- Registry capabilities now include reset_on_win/loss/void (null for DISCOVERED models).
- Hard account safety (available bankroll) is applied after every profile cap, so no cap can exceed it (#96 priority 1).
- Undefined items (formulas, per-day exposure, loss/drawdown/stop/cooldown, same-level rule ties) are owner questions; see
  the consolidated package (mm-owner-questions.md, delivered outside the repo).
