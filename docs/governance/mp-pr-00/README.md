# MP-PR-00 — Gate A Atomic Requirements Inventory

Baseline: `353dfc6523d357aae52615fdfb102fdf1e2a6795`  
Perimetro: HARD CERTIFIED OFFLINE v1  
Stato Gate A: **NON PASS**  
Mock MatchPilot: **NO UPDATE — nessun comportamento o UX cambia**

## Risultato concreto

`requirements.json` è il denominatore Gate A v1 verificabile. Contiene 96 requisiti atomici in otto domini, ciascuno con:

- fonte autorevole e riferimento;
- priorità;
- comportamento atteso;
- condizioni, input, output, invarianti e failure mode ereditati dal dominio;
- design, codice, test ed evidenze;
- verdict controllato;
- conflitti, dipendenze e PR di destinazione.

Il validatore rifiuta ID duplicati, campi mancanti, gruppi/stati/priorità sconosciuti, dipendenze non risolte e contaminazione del denominatore con il registro futuro.

## Denominatore verificato

| Dimensione | Conteggio |
|---|---:|
| Totale | 96 |
| P0 | 70 |
| P1 | 25 |
| P2 | 1 |
| PASS circoscritto | 26 |
| FAIL | 33 |
| BLOCKED | 7 |
| NOT_VERIFIED | 29 |
| NOT_APPLICABLE | 1 |
| Con mapping a codice | 32 |
| Con mapping a test | 40 |
| Con evidenza iniziale | 25 |

Ogni dominio contiene 12 requisiti: GOV, FPT, TC, WEB, RPL, STA, QAC e SEC. Questa simmetria è soltanto una proprietà dell'inventario iniziale; non assegna uguale rischio ai domini e non nasconde i 70 P0.

## Censimento fonti

| Fonte | Classificazione Gate A v1 |
|---|---|
| Owner mandate 18/10/2026 | autorità primaria e scope |
| #3 | master prodotto, requisiti dati/web/intelligence/DoD |
| #12 | FPT incluso; residuali PIT e audit 412 aperti |
| #20 | TotalCorner incluso; live/restart/finale ancora parziali |
| #23 | security baseline necessaria; SaaS user foundation futura |
| #24 | replay incluso |
| #25 | finished Match Center incluso come consumer read-only |
| #27 | benchmark futuro, non gate predittivo v1 |
| #28 | trading intent futuro; non execution v1 |
| #29 | Live Board UI futura; produzione LIVE esclusa |
| #30 | Match Analysis Hub read-only incluso |
| #31 | data reconciliation inclusa |
| #32 | security baseline inclusa; hardening avanzato fase futura |
| #34 | strategy/backtest incluso |
| #40 | archivio immutabile; materializzazione rinviata a MP-PR-01 |
| #44 | assistente futuro, non necessario alla certificazione offline v1 |
| #45 | Exchange execution esclusa e conservata nel future register |
| #46 | billing/SaaS escluso e conservato nel future register |
| #87 | decisione infrastruttura produzione futura |
| #91 | proposta WeWeb non approvata |
| #94 | formule/oracle necessari alla validazione statistica; trading tools completi oltre v1 |
| #95 | settings futuri salvo configurazione congelata per replay/backtest |
| #96 | MM futuro; replay v1 può essere neutro |
| #97 | ordine/ownership vincolanti |
| #98 | certificazione integrata e API/tool evidence vincolanti |
| #99 | ledger/settlement futuri; non richiesti dal replay neutro v1 |
| #100 | market settlement futuro; outcome data per backtest deve avere un contratto separato |
| #102 | Copilot futuro |
| #104 | dipendenze utili; conteggio storico 82 non è il denominatore |
| #132 | idea non approvata / costo potenziale |
| #144 | GitHub-only zero-cost e isolamento CI inclusi |

Le issue chiuse #1/#2/#4/#6/#8/#10 sono storia/evidenza, non fonti superiori alle decisioni correnti.

## Blocker P0 principali

1. `MP-FPT-005`: reprocessing/parser/identity possono modificare una query storica allo stesso T senza pin completo.
2. `MP-FPT-008`: audit dei 412 `UNAVAILABLE_404` non concluso.
3. `MP-TC-008`: restart/FT idempotente non hard-certified sul runtime reale.
4. `MP-TC-012`: TotalCorner globale non certificabile con i gate live/replay aperti.
5. `MP-WEB-001`: il sito reale è ancora una homepage minima “In costruzione”.
6. `MP-RPL-001`/`012`: archivio non materializzato e replay autentico non implementato/certificato.
7. `MP-STA-002`–`006`: oracle matematici, data validity, out-of-sample e walk-forward assenti.
8. `MP-QAC-003`–`005`: contract/API, browser E2E e security suite incomplete.
9. `MP-SEC-001`: autenticazione/autorizzazione server-side del sito reale assente.
10. `MP-SEC-010`: archive SHA/manifest verification è owner-gated per MP-PR-01.

## Conflitti e ambiguità registrati

| ID | Conflitto | Risoluzione MP-PR-00 |
|---|---|---|
| C-01 | #3 contiene un'autorizzazione storica al merge autonomo; mandato 18/10 impone STOP prima del merge | prevale il mandato owner più recente: nessun merge |
| C-02 | “82 PR” di #104 può essere letto come residuo verificato | trattato come baseline storica; denominatore v1 = 96 requisiti |
| C-03 | certificato FPT storico 20/20 vs audit 412 e rischio PIT | certificato resta scoped; FPT globale NOT_VERIFIED/FAIL sui requisiti aperti |
| C-04 | componenti TC certificati vs #20 globale | nessuna promozione: TC globale BLOCKED |
| C-05 | #40 commenti COMPLETED/READY TO CLOSE vs issue ancora OPEN | nessuna chiusura; stato amministrativo da riconciliare separatamente |
| C-06 | Web UI fase 15 in #97 vs owner v1 che richiede sito reale | mantenere backend/API-first; UI implementata solo dopo contratti/replay/statistica sufficienti |
| C-07 | Auth #23 include SaaS future, ma v1 esclude SaaS | includere owner/admin security baseline; escludere registrazione/billing/multi-tenant commerciale |
| C-08 | Live Board e TC live data vs produzione LIVE esclusa | usare dati storici autentici offline; nessuna acquisizione/attivazione LIVE |
| C-09 | #34 backtest può dipendere da MM/ledger/market rules | v1 certifica replay/backtest neutro e statistica; simulazione finanziaria avanzata resta dipendenza futura esplicita |

## Duplicazioni consolidate

- “no future leakage” appare in #3, #20, #24 e #34: requisiti canonici `MP-TC-003`, `MP-RPL-003`, `MP-STA-005` con dipendenze esplicite.
- coverage/provenance appare in #3, #12, #20, #25 e #30: `MP-FPT-004`, `MP-TC-010`, `MP-WEB-006`.
- deterministic replay appare in #24/#34/#97: `MP-RPL-002` e consumer `MP-STA-005`.
- CI/review/README appare in quasi tutte le issue: consolidato in GOV/QAC; non replicato come falso requisito funzionale per ogni card.
- N/D ≠ 0 appare in dati/UI/replay: proprietà dati nei gruppi e requisito UI `MP-WEB-005`.

## Criteri obbligatori delle PR successive

Ogni PR successiva deve:

1. indicare gli ID requisiti coperti;
2. non modificare requisiti owner senza decisione esplicita;
3. includere RED→GREEN per difetti;
4. aggiornare mapping design/codice/test/evidenza e verdict;
5. dichiarare autenticità di fixture/dataset/mock;
6. eseguire regressione pertinente e gate stabile;
7. registrare ambiente, commit, comandi, risultati, artifact e limiti;
8. ottenere review indipendente sul commit finale;
9. lasciare P0 non pertinenti visibili, non cancellarli;
10. fermarsi prima del merge quando richiesto dall'owner.

## Sequenza proposta validata dalle dipendenze

| PR | Exit criterion essenziale |
|---|---|
| MP-PR-01 | archivio read-only materializzato, SHA/manifest/DuckDB verificati; autorizzazione separata |
| MP-PR-02 | report Gate B machine-readable; skip/BLOCKED fail-closed |
| MP-PR-03 | Playwright/security lanes e artifact senza produzione/segreti |
| MP-PR-04 | API v1, input/error/schema contracts |
| MP-PR-05 | query layer archivio immutabile e isolato |
| MP-PR-06 | replay core deterministico e adversarial |
| MP-PR-07 | replay API/read sessions |
| MP-PR-08 | frontend shell reale, auth baseline, loading/error/responsive |
| MP-PR-09 | Daily Board/search/filter |
| MP-PR-10 | Match Center/data quality/charts |
| MP-PR-11 | replay UI sincronizzata |
| MP-PR-12 | oracle/formule/metriche statistiche |
| MP-PR-13 | backtest cronologico, walk-forward e out-of-sample |
| MP-PR-14 | adversarial, recovery, performance e security |
| MP-PR-15 | Gate A/B integrati e IV&V offline |

## Comandi di validazione

```bash
npm run governance:validate
node --test test/requirements-inventory.test.mjs
npm run check
npm test
```

Un output verde valida struttura e coerenza dell'inventario; non trasforma i requisiti funzionali mancanti in PASS.
