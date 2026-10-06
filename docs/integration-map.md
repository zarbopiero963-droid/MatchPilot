# MatchPilot — mappa integrazioni e ownership di dominio

Fonte canonica dell'ordine di lavoro: issue **#97 — ROADMAP**, revisione owner del 06/10/2026.
Questo file la riassume per chi lavora nel repository. Se diverge da #97, prevale #97.

Gerarchia delle fonti di verità:

1. decisioni dell'owner;
2. #97;
3. issue di dominio;
4. README.md, CLAUDE.md, AGENTS.md;
5. `docs/`;
6. mock UX (`docs/mockups/matchpilot-trading-os.html`).

Il mock non è l'architettura. Se contraddice una issue, si corregge il mock.

## Principio

Backend / API-first, UI per ultima. Ogni componente segue:

**DATA CONTRACT → DOMAIN / MATH → DB → API → TEST MATEMATICI → HARD TEST REALI → TOOL / MCP → UI**

Ogni dominio espone subito i propri tool. #98 non è una fase di implementazione monolitica: certifica il percorso completo, senza sito, prima della UI finale.

## Ordine canonico

| Fase | Issue | Scope |
| --- | --- | --- |
| 0 | #23 | identità + security baseline |
| 1 | #95 | settings e commissione via API |
| 2 | #12 → #20 → #31 (#40 solo dove serve) | dati certificati |
| 3 | #24 | replay backend / PIT minimo |
| 4 | #94 | Math Core + API/tool |
| 5 | #96 | MM Registry / Profiles / Policy + API/tool |
| 6 | #100 | Market Rules |
| 7 | #99 | Position / Settlement / Ledger + API/tool |
| 8 | #34 | Strategy Lab / Backtest + API/tool |
| 9 | #28 | Trading Engine + API/tool |
| 10 | #27, query backend #25 / #30 dove servono | benchmark e contratti backend |
| 11 | #98 | certificazione integrata pre-UI |
| 12 | #44 | AI Assistant |
| 13 | #45 | Exchange Gateway, owner-gated |
| 14 | #32 | hardening avanzato |
| 15 | #30, #29, #24, #25, #94, #95, #96, #34, #102, eventuale #91 | UI finale |
| 16 | #46 | Billing / SaaS |

#102 Trading Copilot attraversa più fasi. I tool contestuali (TCOP-PR-01…06) arrivano dopo #28. La spiegazione conversazionale (TCOP-PR-07) arriva dopo #44. La certificazione agent-driven passa da #98. La card visuale è fase 15 (TCOP-PR-09). Dipende da #94, #96, #100, #99, #34, #28, #98 e #44.

Governance e valutazioni fuori dalle fasi: #3 master, #97 roadmap, #87 costi infrastruttura (decision record), #91 proposta WeWeb (non approvata, non cambia lo scope).

## Tool / API incrementali

| Dominio | Superficie tool / API |
| --- | --- |
| #12 / #20 / #31 | search match, match detail, coverage, provenance, PIT, accesso ai dati del replay |
| #95 | settings read/update, commission snapshot, versione |
| #94 | math tools |
| #96 | MM registry, profile CRUD, evaluate, operational mode (`set/get_money_management_operational_mode`, `stop_new_operations`, `resume_operations`) |
| #100 | regole di risoluzione dei mercati, versione congelata |
| #99 | posizioni, P/L, ledger, settlement, reversal |
| #34 | strategie, backtest |
| #28 | segnali, piano pre-partita, live state |
| #24 + #96 | `start_match_replay`, `set/clear_replay_money_management`, `get_replay_state_at_timestamp`, `get_replay_mm_decision_at_timestamp`, `get_replay_simulated_positions`, `get_replay_simulated_pnl`, `reset_replay_simulation` |
| #102 | `get_match_trading_context`, `get_prematch_plan`, `get_live_signal_state`, `get_position_state`, `get_position_pnl`, `get_position_outcome_matrix`, `propose_position_management`, `prepare_paper_entry`, `prepare_hedge`, `prepare_cashout`, `get_settlement`, `get_postmortem` |
| #98 | certificazione end-to-end finale |

## Ownership di dominio

| Owner | Possiede | Non possiede |
| --- | --- | --- |
| #94 Math | Kelly, EV, liability, hedge, cashout, dutching, arbitraggio, Poisson, formule delle progressioni, Decimal/fixed precision, solver, oracle e test vector | stato, saldo, policy |
| #95 Settings | impostazioni account, commissione, default exchange e preferenze, versioni, snapshot, concorrenza | policy MM, saldo |
| #96 Money Management | registry, profili, capability, staking policy, limiti di rischio, filtri, regole, sequence state solo se il modello lo richiede, ALLOW / REDUCE / BLOCK / SIMULATION_ONLY, `operational_mode` | posizioni, ledger, settlement, saldo, equity |
| #100 Market Rules | WIN/LOSS, VOID, PUSH, rinviata, abbandonata, dead heat, esiti asiatici a metà, supplementari e rigori, correzioni, versione della regola | contabilità |
| #99 Settlement / Ledger | posizione, fill e leg, fondi riservati, esposizione, contabilità, P/L realizzato e non realizzato, equity, settlement, commissione applicata, ledger append-only, reversal, correzioni, idempotenza | policy, regole di mercato, ordini reali |
| #34 Strategy Lab | definizione, DSL, versioni, backtest, assegnazione MM, matching | ledger |
| #28 Trading Engine | piano pre-partita, segnale live, BACK / LAY / DUTCH / NO TRADE, entry intent, invalidation, exit intent, hedge intent | ledger, esecuzione |
| #45 Execution | ordini reali, place / cancel / replace, fill, riconciliazione provider, kill switch | policy, settlement |
| #44 Assistente globale | assistente generale, query, explainability | logica finanziaria |
| #102 Trading Copilot | orchestrazione del contesto e spiegazione dentro la partita | qualunque calcolo o stato: consuma #94, #96, #100, #99, #34, #28 via #98 |

Regola: #96 legge da #99 bankroll, fondi riservati, liability aperta, esposizione e P/L, ma non li scrive. Le progressioni avanzano solo sugli eventi di settlement finale pubblicati da #99.

## Stati operativi del Money Management

| Stato | Comportamento |
| --- | --- |
| `ACTIVE_OPERATIONAL` | decide ALLOW / REDUCE / BLOCK / SIMULATION_ONLY, può preparare/registrare paper trade, aggiorna la sequenza dopo il settlement |
| `ADVISORY_ONLY` | continua dati, segnali, analisi, stake e liability teorici, consigli HOLD / HEDGE / EXIT; blocca nuove paper position, riserve, modifiche all'esposizione, scritture finanziarie nel ledger e avanzamento delle progressioni per trade non registrati. Output marcato "ADVISORY ONLY — operazione non registrata" |
| `PAUSED` | nessuna valutazione operativa automatica; dati e storico leggibili |
| `ARCHIVED` | non utilizzabile per nuove strategie o trade; storico immutabile |

STOP OPERATIONS porta in `ADVISORY_ONLY`, RESUME OPERATIONS riporta `ACTIVE_OPERATIONAL`. Le posizioni già aperte continuano: P/L live, chiusura e settlement. Nessun trade viene ricostruito retroattivamente per il periodo advisory.

## Profili MM: identità e versioni

- `profile_id` stabile, versioni immutabili, puntatore `active_version`.
- Modificare i parametri crea una nuova versione. Trade e backtest già registrati restano sulla versione usata.
- Rinominare o cambiare la descrizione non crea una versione.
- Eliminazione: controllo delle dipendenze (strategie, backtest, posizioni, trade, settlement, storico). Se il profilo è referenziato: archiviazione ed eventuale riassegnazione. Eliminazione fisica solo se mai referenziato.
- Bankroll separato per profilo: previsto, richiede l'accounting #99.

## Replay + Money Management

- Replay neutro: score, statistiche, eventi, quote, segnali, freschezza e buchi. Nessuna operazione attribuita a un profilo.
- Replay con MM: aggiunge decisione MM al timestamp, stake teorico e ridotto, liability, entry candidate, posizione simulata, P/L, HOLD / HEDGE / EXIT, settlement e stato di sequenza quando serve.
- Sessione di simulazione separata: `replay_simulation_id`, `match_id`, versione dello snapshot, profilo MM e versione, strategia e versione, snapshot di impostazioni e commissione, bankroll virtuale iniziale. Non scrive mai nel ledger paper principale.
- Cambio MM solo prima del Play, in pausa o con Reset. Stessi dati partita; si ricalcola solo il layer MM. Mai mescolare profili senza un reset esplicito.
- Nessun dato futuro: al timestamp T solo dati ≤ T e versioni congelate per quella simulazione.

## Ciclo di certificazione

DISCOVERED → SPECIFIED → CONTRACT_FROZEN → IMPLEMENTED → TESTED → MATH_VERIFIED (se applicabile) → HARD_VERIFIED_REAL → TOOL_VERIFIED → CERTIFIED → OWNER_ACCEPTED

HARD_VERIFIED_REAL vieta la certificazione con soli mock o fixture. TOOL_VERIFIED è obbligatorio prima della UI.

## Stato al 06/10/2026

| Issue | Stato |
| --- | --- |
| #12 | CERTIFIED WITH KNOWN LIMITATIONS (certificato 20/20), READY TO CLOSE, in attesa dell'owner |
| #31 | parte FutPythonTrader implementata e verificata dentro il certificato #12; parte TotalCorner dopo #20 |
| #40 | discovery |
| tutte le altre issue di dominio | SPECIFIED: nessuna implementazione backend |

Il mock rappresenta come DEMO molte funzioni di issue ancora SPECIFIED. Questo non le rende IMPLEMENTED.
