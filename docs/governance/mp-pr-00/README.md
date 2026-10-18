# MP-PR-00 — Gate A Atomic Requirements Inventory

- **Baseline:** `353dfc6523d357aae52615fdfb102fdf1e2a6795`
- **Perimetro:** HARD CERTIFIED OFFLINE v1, ratificato da `MP-OWNER-DECISIONS-D1-D9-20261018` D3
- **Revisione:** R-00 (inventario v2), correzioni B-01…B-07 dell'audit indipendente `MP-GATE-A-REVIEW-ROADMAP-01`
- **Stato Gate A:** **NON PASS**. Censimento **PROVISIONAL**, denominatore non ratificato.
- **Mock MatchPilot:** NO UPDATE, perché nessun comportamento né UX cambia.

## Risultato concreto

`requirements.json` è il denominatore Gate A v1 corrente. Ogni requisito ha:

- fonte autorevole e riferimento;
- priorità;
- comportamento atteso;
- condizioni, input, output, invarianti e failure mode ereditati dal gruppo;
- design, codice, test ed evidenze;
- verdict controllato;
- conflitti, dipendenze e PR di destinazione (`target_prs`) prese dal `pr_registry`.

Le decisioni owner che fanno da fonte stanno in [`../owner-decisions.json`](../owner-decisions.json), il registro canonico. L'audit e la sua appendice sono in [`../audits/`](../audits/), ciascuno con il proprio `.sha256`.

Il validatore (`npm run governance:validate`) rifiuta:

- ID duplicati o con prefisso diverso dal gruppo;
- campi o `source_ref` vuoti;
- gruppi incompleti;
- stati o priorità sconosciuti;
- **PASS senza evidenza**;
- **PASS che dipende da un requisito non PASS**;
- **path di codice o test inesistenti**;
- **PR di destinazione fuori dal `pr_registry`** e **PR del registro senza requisiti**;
- voci del future register incomplete o presenti nel denominatore;
- decisioni owner incomplete, con data invalida o con `superseded_by` irrisolto.

## Denominatore corrente (calcolato dal JSON)

<!-- inventory:counts:start -->
| Dimensione | Conteggio |
|---|---:|
| Totale | 138 |
| P0 / P1 | 104 / 34 |
| PASS (tutti con evidenza, ciascuno limitato al proprio scope) | 36 |
| FAIL | 52 |
| BLOCKED | 7 |
| NOT_VERIFIED | 43 |
| P0 aperti | 75 |
| Con mapping a codice / test / evidenza | 54 / 62 / 56 |
| Future register (fuori denominatore) | 22 |
<!-- inventory:counts:end -->

**La dimensione dei gruppi segue le fonti, non una quota.** L'inventario v1 imponeva 8 gruppi da 12 requisiti e il suo test lo bloccava. Il vincolo è stato rimosso (B-03).

**Il denominatore è PROVISIONAL (D3).** `census.known_gaps` elenca le parti ancora aggregate:

- card web di #3, #25 e #30;
- sezioni del contratto #20.

Saranno atomizzate nel Gate A locale delle PR R-06, R-07 e R-15 prima dell'implementazione. Accessibilità, i18n, disclaimer legale e retention per dimensione non hanno fonte e restano decisioni owner aperte.

## Correzioni R-00 rispetto all'inventario v1

| Finding | Correzione |
|---|---|
| B-01 | Il v1 dichiarava "25 PASS con evidenza", ma erano 19. `summarize()` ora calcola `pass_with_evidence`. |
| B-02 | Dei 7 PASS senza evidenza, 5 hanno ricevuto un'evidenza citata (GOV-008, GOV-011, GOV-012, FPT-007, FPT-010) e TC-009 l'evidenza del limiter reale. FPT-004 è sceso a NOT_VERIFIED. |
| B-03 | Il test 12×8 è eliminato. |
| B-04 | 41 requisiti aggiunti: API-001..006, ARC-001..005, PIT-001..005 (policy D4), XPR-001..002, MKT-001..003, MTH-001..003, OPS-001, WEB-013..014 (D3), TC-013..015, STA-013, QAC-013 (D5), GOV-013..021. |
| B-05 | `pr_registry` R-00…R-18 sostituisce MP-PR-00…15 e le 6 destinazioni fuori sequenza. MP-PR-02 confluisce in R-01, MP-PR-03 in R-05, MP-PR-05 in R-09. |
| B-06 | Decisioni del 18/10 registrate. MP-GOV-005 segue MP-OWNER-AUTOMERGE-01 invece del vecchio "STOP before merge". |
| B-07 | GOV-010 è NOT_VERIFIED finché SEC-010 e ARC-002 non passano. TC-007 è diviso: snapshot ed eventi sono PASS con scope #145, il market va in TC-015. TC-008 è PASS con scope #145; il multi-day live passa a MP-FUT-007. SEC-011 è nel future register come MP-FUT-008. |

Ogni verdict cambiato porta il campo `history`. Le evidenze originali dell'audit non sono state riscritte.

## Fonti e classificazione

| Fonte | Classificazione Gate A v1 |
|---|---|
| Decisioni owner 18/10 (`owner-decisions.json`) | autorità primaria e scope |
| #3 | master prodotto: dati, web, intelligence, DoD |
| #12 | FPT incluso; residui PIT (policy D4) e audit 412 (parte read-only, D7) |
| #20 | TotalCorner incluso; normalizzazione residua offline; multi-day LIVE futuro (D6) |
| #23 | security baseline owner/admin inclusa; SaaS e second admin futuri |
| #24 | replay incluso |
| #25 / #30 | Match Center e analisi partita inclusi (D3) |
| #31 | riconciliazione, identità cross-provider inclusa |
| #32 | baseline inclusa; hardening avanzato futuro (MP-FUT-008) |
| #34 | backtest incluso; DSL e live matcher futuri |
| #40 | archivio incluso, accesso read-only (D7); resta OPEN (D9) |
| #94 | oracle, baseline e metriche inclusi; trading tools futuri |
| #95 | snapshot di configurazione incluso; settings completi futuri |
| #98 | contratto API v1 incluso; MCP integrato futuro |
| #100 | esiti per backtest inclusi; market rules complete future |
| #97 | roadmap operativa canonica (D8) |
| #104 | catalogo storico delle 82 card (D8); card collegate in `pr_registry.cards` |
| #144 | CI zero-cost, isolamento e licenze dataset inclusi |
| #27, #28, #29, #44, #45, #46, #87, #96, #99, #102 | future register, roadmap approvata |
| #91, #132 | future register, non approvate |

## Conflitti registrati

| ID | Conflitto | Stato |
|---|---|---|
| C-01 | Autorizzazione storica al merge autonomo in #3 contro lo STOP del mandato iniziale | risolto da MP-OWNER-AUTOMERGE-01: merge solo con tutti i gate |
| C-02 | "82 PR" letto come residuo | risolto da D8: #104 è catalogo storico, #97 è la roadmap |
| C-03 | Certificato FPT 20/20 contro audit 412 e rischio PIT | certificato limitato al suo scope; policy PIT D4; audit 412 in R-16 |
| C-04 | Componenti TC certificati contro #20 globale | nessuna promozione; #20 OPEN (D9) |
| C-05 | #40 "READY TO CLOSE" contro issue OPEN | D9: OPEN fino alla verifica indipendente di portabilità e hash |
| C-06 | UI in fase 15 contro sito reale v1 | D3: sito reale in v1, UI consumer di contratti API |
| C-07 | #23 include SaaS | baseline owner/admin in v1, SaaS futuro |
| C-08 | Live Board contro LIVE escluso | dati catturati offline; LIVE solo con autorizzazione (D6) |
| C-09 | Backtest dipendente da MM, ledger e market rules | v1 neutro con MKT-001..003; MM e ledger futuri |
| C-10 | AGENTS/CLAUDE: chiusura issue consentita su autorizzazione e prove Render/Neon obbligatorie | prevalgono CLOSURE-01 e D5; allineamento testi in R-01 |

## Criteri obbligatori delle PR successive

Ogni PR successiva deve:

1. dichiarare `Refs #<issue>` (mai Closes/Fixes/Resolves), le card #104 e gli ID requisiti;
2. superare Gate A locale (requisiti, comportamento, invarianti, I/O, failure mode, dipendenze, criteri) e Gate B locale (test pertinenti su codice reale);
3. includere RED→GREEN per i difetti;
4. aggiornare mapping, evidenze e verdict nel JSON;
5. dichiarare l'autenticità di fixture, dataset e mock (D5);
6. registrare ambiente, commit, comandi, risultati, artifact e limiti;
7. ottenere la review indipendente APPROVED (D2) sul commit finale;
8. lasciare visibili i P0 non pertinenti;
9. fare merge solo con le condizioni di MP-OWNER-AUTOMERGE-01, senza deploy né costi.

## Sequenza approvata come piano iniziale (D8)

Il dettaglio è in `requirements.json` → `pr_registry`; la traceability è in [`traceability.md`](traceability.md).

| PR | Scope | Card #104 |
|---|---|---|
| R-00 | questa PR #149 | — |
| R-01 | allineamento AGENTS/CLAUDE, guard contro la chiusura, schema evidenze Gate B, MP-MULTIAGENT-SYNC-CHECKPOINT-01 | — |
| R-02 | archivio #40 read-only, verifica indipendente di hash e portabilità | — |
| R-03 | API v1 | MCP-CORE-00 |
| R-04 | auth baseline | AUTH-CORE-01/02 |
| R-05 | shell web reale, E2E browser, security lane | — |
| R-06 | Dashboard, Daily Board, ricerca e filtri | QUERY-CORE-02 |
| R-07 | Match Center, analisi partita, grafici | QUERY-CORE-01 |
| R-08 | PIT, identità cross-provider, timezone/DST | RECON-CORE-01 |
| R-09 | query layer archivio e replay core | REPLAY-CORE-01 |
| R-10 | API replay | REPLAY-CORE-02 |
| R-11 | UI replay | — |
| R-12 | oracle e metriche | MATH-CORE-01/07/08 |
| R-13 | esiti di mercato e snapshot di configurazione | — |
| R-14 | backtest, walk-forward, out-of-sample | STRAT-CORE-03/04 |
| R-15 | normalizzazione TC residua offline | TC-CORE-05/06/06B |
| R-16 | audit 412 (read-only) e residui FPT | — |
| R-17 | adversarial, recovery, performance, security, ops | TC-CORE-07, RECON-CORE-02/04/05 |
| R-18 | Gate A/B integrati e IV&V offline | — |

## Comandi di validazione

```bash
npm run governance:validate
node --test test/requirements-inventory.test.mjs
npm run check
npm test
```

Un output verde valida struttura e coerenza dell'inventario. Non trasforma in PASS i requisiti funzionali mancanti.
