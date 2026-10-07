<!-- governance-reconciliation-2026-10-07: current summary; source contracts preserved -->
## Stato corrente e coordinamento — 07/10/2026

### Gerarchia vigente

Decisioni esplicite owner (con fonte, data e scope) → **[#3](https://github.com/zarbopiero963-droid/MatchPilot/issues/3) master di prodotto/stato globale → [#97](https://github.com/zarbopiero963-droid/MatchPilot/issues/97) roadmap/fasi → [#104](https://github.com/zarbopiero963-droid/MatchPilot/issues/104) piano operativo delle PR** → contratti e gate delle issue di dominio → README / CLAUDE / AGENTS → documenti di integrazione → mock.
La gerarchia non permette a #104 di eliminare acceptance criteria di dominio o alle docs di inventare decisioni owner. I documenti di supporto e gli snapshot di questa PR non sono una quarta master. Il piano proposto nell'audit non è stato approvato come nuova roadmap.

### Prossima attività unica / autorizzazione corrente

L'owner il **07/10/2026 alle 15:23 Europe/Rome** ha autorizzato **una sola PR documentale/governance**, dopo il PASS del punto 9 della #40, e ha vietato il merge automatico.
**Prossima azione: owner review e autorizzazione al merge della [PR #125](https://github.com/zarbopiero963-droid/MatchPilot/pull/125).**
Non iniziare operativamente #20, il punto 10 della #40 o altri domini durante questa PR.

Dopo il merge, il primo controllo operativo è **verificare e registrare la finestra sicura di #40 per riprendere lo sviluppo core**. Il PASS del punto 9 certifica la riconciliazione locale, non la durabilità dell'archivio né automaticamente tale finestra. Se la finestra è attestata secondo il contratto vigente, la priorità owner è **#20 / TC-CORE-01**, con i prerequisiti security/identity applicabili, senza riattivare il trial. Se non è attestata, fermare l'avvio core e riportare il blocker; nessun punto successivo #40 è autorizzato da questa PR. Definizioni o scelte nuove sui criteri di finestra sicura restano **OPEN / OWNER DECISION REQUIRED**.

### Stato corrente verificato — 07/10/2026

| Perimetro | Stato corrente | Residuo / gate |
|---|---|---|
| main | `5b39f3308d266752409ef4bdcb9e86b2d3d9423e` prima della PR governance; backend principalmente FPT | nessuna feature implementata da questa PR |
| #12 FPT | implementazione e certificazione storica del perimetro 05/10 disponibili; issue OPEN, **NON globalmente READY TO CLOSE / NON 0 lavoro residuo** | audit 412/412 dopo TC messo in sicurezza; rischio PIT/reprocessing aperto |
| #20 TC core | **URGENTE**, core persistente non avviato/certificato; trial #40 distinto dal core | finestra sicura #40 attestata, discovery reale, overlap VERIFIED; scadenza membership **11/10/2026 15:20:27 Europe/Rome** |
| #40 trial | freeze → FAIL storico #123 → fix #124 mergiata → **punto 9 PASS, mismatch_count=0** | portabilità DuckDB e punti 10–16 aperti; punto 17 owner-gated; nessuno shutdown autorizzato |
| #104 | catalogo card pre-MCP conservato | **82 è baseline storica, NON conteggio verificato del residuo attuale** |
| core downstream / #98 | contratti pianificati; certificazione integrata non ottenuta | componenti, consumer, paper bridge e integrazioni reali prima del gate E2E; UI finale deferita |

### Decisioni owner consolidate / SUPERSEDED

- [decisione TC urgente](https://github.com/zarbopiero963-droid/MatchPilot/issues/20#issuecomment-6025831223): FPT e TC entrambi feed core di prima classe; TC urgente appena #40 permette una finestra sicura. Questo override precede i downstream non urgenti, senza bypassare sicurezza o contratti.
- [audit 412 FPT](https://github.com/zarbopiero963-droid/MatchPilot/issues/12#issuecomment-6025923710): dopo TC messo in sicurezza, audit completo dei **412 UNAVAILABLE_404** FPT prima dei downstream non urgenti.
- [solo calcio](https://github.com/zarbopiero963-droid/MatchPilot/issues/20#issuecomment-6025858559) e [overlap VERIFIED](https://github.com/zarbopiero963-droid/MatchPilot/issues/20#issuecomment-6026039140): solo calcio; set operativo **FPT ∩ TC**, mapping VERIFIED; nessuna promozione automatica fuori overlap.
- [discovery empirica](https://github.com/zarbopiero963-droid/MatchPilot/issues/20#issuecomment-6026048598): lista vs dettaglio, fase, competizione e frequenza vanno misurati; NULL non equivale automaticamente ad assenza upstream.
- [shared ingestion/computation](https://github.com/zarbopiero963-droid/MatchPilot/issues/3#issuecomment-6026194935): provider → raccolta condivisa → DB → calcolo riusabile → N utenti; nessuna duplicazione per utente.
- #97 revisione 06/10 e #104: backend/API/tool-first; security baseline trasversale; UI fase 15 dopo certificazione integrata #98.
- Ownership esclusiva: **#96 policy/risk/MM; #99 ledger/accounting/positions/settlement; #100 market rules; #28 trading intent; #34 Indicator Library/DSL**. #94 formule pure. I dati #12/#20 e il trial #40 forniscono input, non reimplementano quei domini.
- **SUPERSEDED:** claim globale #12 “READY TO CLOSE / 0 PR”, “82 PR residue verificate”, ordine precedente incompatibile con gli override owner, accounting attribuito a #96, Indicator Library/DSL duplicata in altri domini, trial ancora da lasciare raccogliere dopo freeze, ScoreTrend canonical, OneDrive come destinazione finale. I requisiti non contraddetti e le evidenze storiche restano conservati.
- [certificato storico FPT 05/10](https://github.com/zarbopiero963-droid/MatchPilot/blob/main/docs/futpython-certification-2026-10-05.md) resta evidenza storica del proprio commit/report/perimetro e dei limiti dichiarati; non certifica l'audit 412, parser futuri, TC, Trading OS o integrazioni.
- L'esempio LAY 8,40 / fair 6,90 con edge positivo è **ERRATO / SUPERSEDED** per EV statico: per lay stake 1, p=1/6,90, liability=7,40, EV=(1−p)−7,40p=**−0,217391** prima commissione. Un modello dinamico richiede ipotesi, probabilità/path, commissione e oracle espliciti; non è stato autorizzato da questa correzione documentale.

### Implementazione ≠ certificazione componente ≠ certificazione integrata

1. **Implementazione:** codice/schema/API e test pertinenti presenti; non implica hard verification.
2. **Certificazione componente:** gate automatici, matematici se applicabili, negative/recovery/isolation e hard evidence reale del solo perimetro componente; consumer mancanti restano BLOCKED, non PASS tramite mock.
3. **Certificazione integrata:** domini e consumer reali, intent #28 → permission #96 → position/ledger #99 con rules #100, Strategy #34, replay e tool; late integrations e **#98 E2E agente senza sito** prima della UI.

#96 può implementare policy prima di #99, ma la prova reale su bankroll/exposure/settlement richiede #99; il gate componente non certifica quella integrazione. STRAT-CORE-07 e TRADE-CORE-08 non possono certificare consumer mancanti: conservare i gate aperti fino a paper bridge / MM-INTEGRATION-01 / REPLAY-CORE-03 secondo le dipendenze di #104. Una checklist “DONE” richiede evidenza attuale nel perimetro, non il solo merge.

### OPEN / OWNER DECISION REQUIRED

- Punto 10 e successivi della #40: non autorizzati da questa PR; portabilità DuckDB aperta prima dell'upload; shutdown punto 17 sempre autorizzazione specifica.
- Criteri aggiuntivi/non registrati di finestra sicura #40: da sottoporre all'owner, non assumere PASS9 = archivio persistente.
- Semantica/version pinning PIT/reprocessing non definita oltre il contratto vigente; apply prod/raw deletion/promozione nuova lega owner-gated.
- #91 WeWeb resta proposta, non migrazione approvata; altri sport/estensioni overlap, BetsAPI provider core o spesa ricorrente, execution reale #45 richiedono decisioni esplicite.
- Nuovi accorpamenti/riordini del piano audit o totale PR non verificato non diventano decisioni owner.
- Merge di questa PR: **vietato automaticamente**; attendere owner. Nessuna chiusura issue.

### Override operativo senza nuova roadmap

Le fasi 0–16 sotto rimangono la roadmap architetturale. L'ordine numerico **non annulla** l'urgenza successiva della Data Foundation: #40 finestra sicura → #20 urgente → audit412 #12 → downstream non urgenti. Non imporre l'attesa di tutte le card non urgenti #23/#95 prima di prendere in carico l'urgenza TC; preservare identity/security baseline e dipendenze applicabili, senza introdurre un nuovo accorpamento. Qualunque nuova sequenza/accorpamento non già deciso resta OWNER DECISION REQUIRED.

Il replay neutro fase3 resta separato da replay+MM tardivo. I requisiti che leggono bankroll/exposure reali aspettano #99; #96 core può precedere #99 solo nel proprio perimetro. Paper bridge aspetta #28 intent + #96 permission + #99 position; certificazione integrata dopo tutte le late integrations. Il vecchio ordine #27 prima di #28 e la numerazione fasi0–12 dei primi commenti sono SUPERSEDED dalla revisione fasi0–16. Non usarli per selezionare la prossima PR.

---

## Contratto dettagliato conservato

Requisiti, test e acceptance criteria sotto restano validi dove non contraddetti dalle decisioni vigenti sopra. **SUPERSEDED** riguarda le indicazioni obsolete di stato, priorità, conteggio, sequenza e ownership, non elimina scope o hard gate. Le evidenze nei commenti sono storiche e non vanno riscritte.

# MatchPilot — Roadmap operativa BACKEND/API FIRST → UI LAST

Decisione owner 06/10/2026.
Questa issue è la **fonte canonica dell'ordine operativo**. Se README, CLAUDE.md, AGENTS.md, docs o mock divergono, prevale questa issue e gli altri artefatti vanno riallineati.

## Principio vincolante

La UI/web app NON è la priorità attuale.

Prima bisogna arrivare a un sistema interrogabile, configurabile e testabile integralmente via backend/API/tooling, in modo che owner e agenti autorizzati possano lavorare direttamente sui dati e sui motori senza dipendere dal sito.

Ordine architetturale:

DATA CONTRACT
→ DOMAIN / MATH
→ DB
→ API
→ TEST MATEMATICI
→ HARD TEST REALI
→ TOOL / MCP
→ UI

La UI definitiva arriva solo dopo HARD_VERIFIED_REAL + TOOL_VERIFIED del core.

---

## FASE 0 — Identity + security baseline

### #23 Auth/Admin

Implementare prima:
- identity;
- authentication;
- authorization;
- account isolation;
- mutation authorization;
- audit;
- safe error handling;
- secret handling;
- input validation.

La security baseline NON aspetta #32.

### Gate
- due account non possono leggere/modificare dati altrui;
- mutate rifiutate senza autorizzazione;
- audit presente;
- nessun secret client-side/log.

---

## FASE 1 — Settings / Commission API

### #95 Settings

Solo backend/contratti:
- settings account-level;
- commissione;
- exchange defaults;
- settings version;
- snapshots;
- concurrency;
- persistence server-side.

La dashboard UI è deferita.

### Confine
#95 NON possiede:
- bankroll accounting;
- ledger;
- settlement;
- Money Management state.

### Gate
- cross-session;
- cross-browser;
- account isolation;
- snapshot/version;
- commissione riproducibile storicamente;
- nessun browser storage come source of truth.

---

## FASE 2 — Dati certificati

Ordine architetturale originario #12 → #20 → #31; override operativo vigente: #40 finestra sicura attestata → #20 urgente → audit412 #12 dopo TC messo in sicurezza → #31/downstream secondo dipendenze. #40 resta separata; il punto10 non parte da questa PR.

### Gate
- raw + normalized;
- provenance;
- coverage;
- timestamps;
- point-in-time;
- no future leakage;
- mapping/entity resolution;
- reconciliation;
- hard evidence reale.

Non aprire il live Strategy/Trading Engine su TotalCorner finché #20 non è certificata per i dati necessari.

---

## FASE 3 — Replay backend / PIT minimo

### #24 Match Replay — solo backend/domain

Implementare ora:
- match_id + timestamp → stato deterministico;
- snapshot provenance;
- gap/freshness;
- point-in-time;
- nessun dato futuro.

UI player/timeline definitiva deferita alla fase UI.

### Replay + Money Management

Il replay può essere:
- neutro;
- con MM selezionato.

Il replay dati resta identico; cambia solo il layer operativo.

Sessione separata:
- replay_simulation_id;
- match/version;
- MM profile/version;
- strategy/version;
- settings snapshot;
- commission snapshot;
- virtual bankroll.

Mai scrivere nel ledger operativo #99.

---

## FASE 4 — Math Core / Trading Tools

### #94

Possiede:
- Kelly;
- EV;
- liability math;
- hedge;
- cashout;
- dutching;
- arbitrage;
- Poisson;
- progression formulas;
- solver;
- Decimal/fixed precision;
- independent oracle;
- test vectors.

NON possiede:
- ledger;
- strategy lifecycle;
- execution;
- accounting.

Prima:
pure library → API/tool → test.

UI Trading Tools deferita.

### Gate
- deterministic vectors;
- oracle indipendente;
- Decimal/fixed precision;
- boundary/error tests;
- property tests dove utili;
- TOOL_VERIFIED.

---

## FASE 5 — Money Management Registry / Profiles / Policy

### #96

Possiede:
- Registry;
- Profiles;
- capability;
- create/get/list/update/clone/archive/safe-delete;
- default profile;
- immutable versions;
- staking policy;
- risk limits;
- filters/rules;
- sequence state solo se richiesto;
- operational mode;
- ALLOW / REDUCE / BLOCK / SIMULATION_ONLY.

Categorie:
- Stateless;
- Bankroll-dependent;
- Target/Recovery;
- Progressions;
- Exposure-aware;
- Composite/Custom.

Capability minime:
- requires_bankroll;
- requires_available_bankroll;
- requires_previous_settlement;
- requires_sequence_state;
- requires_open_exposure;
- requires_liability;
- supports_back;
- supports_lay;
- supports_dutch;
- supports_live;
- supports_prematch;
- supports_void;
- supports_partial_settlement.

### Operational mode
- ACTIVE_OPERATIONAL
- ADVISORY_ONLY
- PAUSED
- ARCHIVED

STOP OPERATIONS:
- continua analisi/segnali/consigli;
- blocca nuove position;
- blocca reserve/exposure mutation;
- blocca financial ledger writes;
- non avanza progressioni su trade non registrati.

RESUME:
- riabilita nuove operazioni;
- nessun trade retroattivo.

### Confine fondamentale
#96 NON possiede:
- positions;
- ledger;
- settlement;
- cash balance;
- equity;
- accounting mutation.

Legge questi stati da #99.

---

## FASE 6 — Market Rules

### #100

Possiede registry/versioning delle regole di risoluzione:
- WIN;
- LOSS;
- VOID;
- PUSH;
- postponed;
- abandoned;
- dead heat;
- Asian partial;
- extra time;
- penalties;
- correction policy.

#99 deve sempre usare una market_rule_version congelata.

### Gate
- deterministic resolver;
- versioned rules;
- edge-case vectors;
- corrected-result handling;
- no implicit/current-rule rewrite dello storico.

---

## FASE 7 — Position / Settlement / Ledger

### #99

È l'unico owner di:
- positions;
- legs/fills;
- reserve/release;
- open liability;
- exposure state;
- accounting;
- realized P/L;
- unrealized P/L;
- equity;
- commission applied;
- settlement;
- append-only ledger;
- reversal/correction;
- idempotency;
- atomic transactions.

Lifecycle:
order/paper intent
→ execution/fill
→ position
→ market resolution
→ settlement
→ commission
→ ledger
→ bankroll/equity update
→ audit

### Gate
- BACK;
- LAY;
- multiple positions;
- same-match multiple trades;
- WIN;
- LOSS;
- VOID;
- PUSH;
- partial where supported;
- hedge/cashout;
- double-settlement blocked;
- reversal;
- reload/recovery;
- reconciliation to cent/tick;
- TOOL_VERIFIED.

---

## FASE 8 — Strategy Lab / Backtest backend

### #34

Implementare:
- strategy definition;
- DSL;
- immutable versions;
- MM assignment;
- backtest;
- matching;
- activation state;
- API/tool surface.

Dipende da:
- #94;
- #96;
- #100;
- #99;
- dati certificati.

### Gate
- same snapshot → same result;
- no future leakage;
- P/L via accounting contract;
- version freeze;
- backtest reproducible.

UI definitiva deferita.

---

## FASE 9 — Trading Engine

### #28

Possiede:
- prematch plan;
- live evaluation;
- BACK/LAY/DUTCH/NO TRADE;
- WATCHING;
- NEAR_MATCH;
- ARMED;
- BLOCKED;
- INVALIDATED;
- EXPIRED;
- entry intent;
- exit intent;
- hedge intent;
- decision snapshot.

NON possiede:
- Money Management logic;
- ledger;
- settlement;
- exchange execution.

### Gate
- deterministic replay;
- snapshot/version references;
- MM gate;
- explainable decision;
- no future leakage.

---

## FASE 10 — Benchmark + backend query contracts

### #27 GOAT Benchmark
Va dopo #28, quando esistono decisioni/segnali confrontabili.

### #25 / #30
Implementare solo query/contracts backend necessari.

Rimandare:
- cards;
- charts;
- visual filters;
- final Match Center UI.

---

## FASE 11 — #98 Operator API/MCP certification

#98 NON è una implementazione monolitica tardiva.

### Regola incrementale

Ogni fase espone subito la propria superficie tool/API:

- #12/#20/#31 → data/query/PIT;
- #95 → settings;
- #94 → math;
- #96 → MM;
- #100 → market resolver;
- #99 → positions/settlement/ledger;
- #34 → strategies/backtest;
- #28 → signals/trading decisions;
- #24 → replay;
- #102 → trading context/copilot tools.

### #98 finale

Certifica end-to-end, senza UI:

1. search match;
2. prematch;
3. live;
4. replay;
5. coverage/provenance;
6. Trading Tools;
7. settings;
8. MM CRUD/versioning;
9. STOP/RESUME;
10. strategy CRUD/versioning;
11. backtest;
12. signal;
13. paper position;
14. exposure;
15. P/L outcome matrix;
16. hedge/cashout paper;
17. settlement WIN/LOSS/VOID;
18. reversal;
19. ledger;
20. bankroll/equity;
21. reload/new session;
22. audit/version reproduction.

---

## #102 Trading Copilot — cross-phase feature

#102 non è un dominio finanziario autonomo.

Consuma:
- #94 math;
- #96 MM;
- #100 Market Rules;
- #99 position/P&L/ledger;
- #34 strategies;
- #28 signals;
- #98 tools;
- #44 explainability.

### Pre-UI tools
Dopo i relativi domini devono esistere capability per:
- match trading context;
- prematch plan;
- live signal state;
- position state;
- position P/L;
- outcome matrix;
- management proposal;
- paper entry preparation;
- hedge/cashout preparation;
- settlement;
- post-mortem.

### UI finale
La card visuale Trading Copilot arriva solo nella fase UI.

---

## FASE 12 — AI Assistant

### #44

Assistente globale.

Usa gli stessi tool/API certificati.
Non introduce:
- secondo percorso dati;
- business logic;
- P/L proprio;
- ledger proprio.

Trading Copilot #102 resta contestuale alla partita.

---

## FASE 13 — Exchange Gateway reale

### #45

Solo dopo paper trading/settlement certificati.

Possiede:
- place;
- cancel;
- replace;
- fills;
- partial fills;
- provider reconciliation;
- kill switch.

NON possiede:
- policy;
- P/L accounting;
- settlement.

Execution reale resta owner-gated.

---

## FASE 14 — Security hardening avanzato

### #32

Qui restano:
- production hardening;
- anti-abuse;
- advanced rate limiting;
- attack-surface reduction;
- code/feed protection;
- final security regression.

La baseline security è già obbligatoria dalla FASE 0.

---

## FASE 15 — UI WEB FINALE

Solo dopo HARD_VERIFIED_REAL + TOOL_VERIFIED del core.

UI:
- #30 Match Analysis Hub;
- #29 Live Trading Board;
- #24 Match Replay;
- #25 Finished Match Center;
- #94 Trading Tools;
- #95 Settings;
- #96 Money Management;
- #34 Strategy Lab;
- #102 Trading Copilot;
- eventuale valutazione #91 WeWeb.

Regola:
la UI consuma API certificate e NON contiene business logic autorevole.

---

## FASE 16 — Billing / SaaS

### #46

Solo dopo core + UI sufficientemente stabili.

---

# Standard di certificazione

DISCOVERED
→ SPECIFIED
→ CONTRACT_FROZEN
→ IMPLEMENTED
→ TESTED
→ MATH_VERIFIED (se applicabile)
→ HARD_VERIFIED_REAL
→ TOOL_VERIFIED
→ CERTIFIED
→ OWNER_ACCEPTED

HARD_VERIFIED_REAL:
- non può basarsi solo su mock/fixture.

TOOL_VERIFIED:
- gate obbligatorio pre-UI.

OWNER_ACCEPTED:
- chiusura/accettazione finale resta dell'owner.

---

# Regola dati reali

Quando esistono dati veri:
- usarli per hard certification;
- expected vs actual;
- provenance;
- timestamp;
- raw/normalized reconciliation;
- point-in-time;
- no future leakage;
- run_id/evidence.

Mock/fixture:
- consentiti per unit/boundary/failure;
- mai unica prova di certificazione reale.

---

# Mock UX vivo

Il mock è un artefatto UX/documentale vivo, NON una fonte architetturale e NON una certificazione.

Ogni nuova feature/stato/tool/impostazione con impatto visibile o concettuale deve valutare:
"Questa modifica richiede aggiornamento del mock? SÌ / NO"

Se SÌ:
- aggiornare mock + changelog nella stessa PR o sequenza pianificata.

Gerarchia:
decisioni owner
→ #3
→ #97
→ #104
→ issue di dominio
→ README/CLAUDE/AGENTS
→ docs
→ mock.

---

# Gate prima della UI

Non iniziare la UI definitiva finché da API/tooling non sia possibile:
- interrogare dati reali;
- riprodurre PIT;
- usare math;
- gestire settings;
- gestire MM;
- applicare STOP/RESUME;
- risolvere market rules;
- gestire positions/ledger;
- creare/backtestare strategie;
- produrre signal state;
- aprire/gestire paper position;
- leggere P/L per outcome;
- hedge/cashout;
- settlement/reversal;
- audit/versioning;
- replay + MM;
- usare Trading Copilot via tool;
- rifare il flusso dopo reload/sessione nuova.

---

# Collegamenti canonici

Master/governance:
- #3
- #97

Data:
- #12
- #20
- #31
- #40

Identity/settings/security:
- #23
- #95
- #32

Core:
- #94
- #96
- #100
- #99
- #34
- #28
- #24
- #25
- #30
- #27

Tool/agent:
- #98
- #44
- #102

Execution:
- #45

UI:
- #29
- #91

SaaS:
- #46

---

# Regola finale

Prima di ogni PR:
1. leggere #97;
2. identificare fase;
3. verificare dipendenze;
4. identificare owner del dominio;
5. evitare UI anticipata;
6. esporre API/tool quando previsto;
7. definire test matematici se applicabili;
8. definire hard test reali;
9. verificare se il mock va aggiornato;
10. una PR alla volta salvo autorizzazione owner.

Qualunque documento o mock che contraddica questa roadmap deve essere corretto prima di proseguire.
