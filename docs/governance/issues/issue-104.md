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

**OPEN / OWNER DECISION REQUIRED — STOP/ADVISORY_ONLY sulle posizioni già aperte:** #96 e #97 vietano exposure mutation/financial ledger writes in ADVISORY_ONLY, mentre README descrive la continuazione di chiusura/settlement delle posizioni esistenti. Il confine di ownership è chiaro (#99 scrive), ma l'eccezione operativa non è univoca. Prima della relativa integrazione, l'owner deve chiarire quali scritture #99 restano consentite per posizioni già aperte. Non scegliere automaticamente “blocca tutto” o “settle comunque”; nessun comportamento runtime cambiato qui.

- Punto 10 e successivi della #40: non autorizzati da questa PR; portabilità DuckDB aperta prima dell'upload; shutdown punto 17 sempre autorizzazione specifica.
- Criteri aggiuntivi/non registrati di finestra sicura #40: da sottoporre all'owner, non assumere PASS9 = archivio persistente.
- Semantica/version pinning PIT/reprocessing non definita oltre il contratto vigente; apply prod/raw deletion/promozione nuova lega owner-gated.
- #91 WeWeb resta proposta, non migrazione approvata; altri sport/estensioni overlap, BetsAPI provider core o spesa ricorrente, execution reale #45 richiedono decisioni esplicite.
- Nuovi accorpamenti/riordini del piano audit o totale PR non verificato non diventano decisioni owner.
- Merge di questa PR: **vietato automaticamente**; attendere owner. Nessuna chiusura issue.

### Stato card e gate operativi

Il catalogo delle 82 card pre-MCP sotto è una **baseline di pianificazione storica**, non una certificazione del numero di PR ancora necessarie oggi. Nessun nuovo totale è assegnato. Conservare gli ID per tracciabilità; nuovi requisiti #12 audit412/PIT non sono coperti dal vecchio “0 PR”. Il loro numero/accorpamento richiede ricensimento, non un valore inventato.

| Blocco | Stato implementazione | Certificazione componente | Certificazione integrata | Dipendenze / gate |
|---|---|---|---|---|
| #12 FPT-PR-01..09 e fix #81..93 | implementato nel perimetro storico | evidenza 05/10 con limiti | non certificata per Trading OS / PIT dopo correction | audit412 dopo TC sicuro; rischio parser/identity PIT aperto |
| #20 TC-CORE-01..08 incluse03B/06B | da iniziare nel core | mancante | mancante | finestra40 attestata; calcio/overlap/discovery/budget; multi-day |
| #23/#95/MCP-CORE-00 | pianificato | mancante | mancante | baseline security obbligatoria sulle mutate; no gate fittizio |
| #31/#24/#94 | residuo TC/cross-provider; replay/math pianificati | mancante per quei perimetri | mancante | feed richiesti certificati; oracle math; replay neutro prima MM |
| #96 MM-CORE | pianificato | scoped solo quando realmente verificato | mancante | #94; stato reale #99 necessario per prove bankroll/exposure |
| #100 MARKET / #99 LEDGER | pianificato | mancante | mancante | rules congelate; commission/settings; reserve/idempotency/recovery |
| #34 STRAT / #28 TRADE | pianificato | non anticipare gate dipendenti da consumer reali | mancante | dati + MM + rules/ledger; bridge dopo intent |
| PAPER-CORE-01 | pianificato | mancante | mancante | #28 intent + #96 permission + #99 position |
| MM-INTEGRATION-01 / REPLAY-CORE-03 | pianificato | non parte del PASS anticipato MM core | mancante | #34/#28/#99 + versioni frozen; nessun operational ledger nel replay |
| QUERY/BENCH / TCOP | pianificato | mancante | mancante | domini reali e #28; #102 consuma senza duplicare |
| MCP-CORE-01..03 | pianificato | registry incrementale non è E2E | mancante | tutti domini/bridge/late integrations; E2E senza sito prima UI |

Le card terminali restano aperte per i gate applicabili bloccati da dipendenze. Non richiedere una certificazione integrata prima che i consumer esistano e non marcarla PASS grazie ai mock. Nessuna nuova priorità di fase viene dedotta da questo chiarimento.

### Preservazione card TotalCorner precedenti

Le vecchie FPT-TC-PR-01..13 e TC-PR-03B sono **SUPERSEDED come suddivisione/sequenza**, non come requisiti/test:
- 01 → TC-CORE-01; 02 → TC-CORE-02;
- 03 → TC-CORE-03; TC-PR-03B → TC-CORE-03B;
- 04 → TC-CORE-04; 05 → TC-CORE-06;
- 06 → TC-CORE-06B; 07 → TC-CORE-03/05/06B;
- 08 → TC-CORE-05; 09/10 → TC-CORE-07;
- 11 → TC-CORE-06B e #31 RECON-CORE; 12/13 → TC-CORE-08.
I campioni minimi, negative/recovery tests, coverage/provenance e gate finali restano quelli della #20. Queryability dati #12/#20 non possiede DSL/Indicator Library #34. MM integration non trasferisce accounting da #99 a #96.

---

## Contratto dettagliato conservato

Requisiti, test e acceptance criteria sotto restano validi dove non contraddetti dalle decisioni vigenti sopra. **SUPERSEDED** riguarda le indicazioni obsolete di stato, priorità, conteggio, sequenza e ownership, non elimina scope o hard gate. Le evidenze nei commenti sono storiche e non vanno riscritte.

# MatchPilot — Piano PR canonico fino al MCP pre-UI

Riferimenti:
- #97 Roadmap canonica
- #98 Operator API/MCP
- #103 mock/docs alignment già mergiata

## Scopo

Normalizzare le vecchie schede PR nate prima della revisione #97 senza perdere requisiti, hard gate o falsificabilità.

## Baseline storica di pianificazione — SUPERSEDED come conteggio residuo

Per arrivare al **MatchPilot completo utilizzabile via API/MCP da ChatGPT/agenti, senza UI produttiva**, la baseline pubblicata prima degli override owner era:

# **82 card pianificate nella baseline storica — NON residuo verificato corrente**

**SUPERSEDED:** il vecchio claim #12 = 0 PR / READY TO CLOSE globale. Certificato 05/10 storico; audit412 e rischio PIT restano aperti e non sono conteggiati da quella baseline.

Fuori dal totale:
- UI finale;
- #44 conversational polish completo;
- #45 real execution;
- #32 hardening avanzato;
- #46 Billing/SaaS.

## Perché 82 e non 76

Il piano precedente da 76 perdeva o sequenziava male 6 gate:

1. +2 #20 TotalCorner:
   - storico upstream separato;
   - coverage/certificazione temporale separata.
2. +1 #99:
   - API/tool separata da concurrency/crash recovery.
3. +1 #98:
   - MCP registry/schema/error/authz minimo anticipato.
4. +1 cross-domain:
   - apertura paper position da intent #28 verso position #99.
5. +1 #96:
   - integrazione MM con #34/#28/#24 separata e spostata dopo che tali domini esistono.

76 + 6 = 82.

## Breakdown della baseline storica — non conteggio residuo

| Blocco | PR |
|---|---:|
| #23 Identity/Security baseline | 4 |
| MCP baseline anticipata (#98) | 1 |
| #95 Settings/Commission API | 4 |
| #20 TotalCorner | 10 |
| #31 Reconciliation residua | 5 |
| #24 Replay neutro/PIT | 2 |
| #94 Math Core | 8 |
| #96 MM core | 8 |
| #100 Market Rules | 5 |
| #99 Settlement/Ledger | 7 |
| Paper position bridge | 1 |
| #34 Strategy Lab/Backtest | 7 |
| #28 Trading Engine | 8 |
| #96 integration late | 1 |
| #24 Replay + MM late | 1 |
| #25/#30/#27 backend/query/benchmark | 3 |
| #102 Trading Copilot pre-UI | 4 |
| #98 final integration/certification | 3 |
| **TOTALE** | **82** |

---

## FASE 0 — #23 Identity/Security baseline — 4 PR

### AUTH-CORE-01 — Authentication/session/security baseline
- owner login/env;
- server-side session;
- logout/revoke;
- cookie/CSRF/rate-limit basics;
- secret redaction;
- negative auth tests.

### AUTH-CORE-02 — Users/RBAC/account isolation
- users/roles/permissions;
- OWNER immutable;
- permission middleware;
- account boundaries.

### AUTH-CORE-03 — Secondary admin + audit
- second admin;
- permission assignment;
- privilege escalation prevention;
- audit events;
- API only.

### AUTH-CORE-04 — Hard certification
- real DB/deploy;
- session fixation;
- authz;
- isolation;
- secret leakage;
- restart/revocation;
- no HIGH/CRITICAL.

Deferred: final Users & Permissions UI and SaaS UX.

---

## MCP BASELINE anticipata — 1 PR

### MCP-CORE-00 — Tool registry/schema/error/authz baseline

Da fare subito dopo #23.

Scope:
- tool discovery/registry;
- common schema/version conventions;
- authz binding to authenticated account;
- deterministic error envelope;
- provenance/version references;
- mutation/idempotency convention;
- transport/tool invocation skeleton.

Scopo: rendere possibile il primo MCP realmente interrogabile mentre i domini successivi aggiungono i propri tool.

Non implementa business logic di dominio.

---

## FASE 1 — #95 Settings — 4 PR

### SETTINGS-CORE-01 — Schema/versioning
### SETTINGS-CORE-02 — API/validation/propagation
### SETTINGS-CORE-03 — Concurrency/cache/audit
### SETTINGS-CORE-04 — Hard certification

UI Settings deferita.

---

## FASE 2 — #20 TotalCorner — 10 PR

### TC-CORE-01 — Provider contract/discovery/raw retention
### TC-CORE-02 — Competition/team/event mapping
### TC-CORE-03 — Prematch markets/lines/PIT

### TC-CORE-03B — Historical upstream backfill
Obbligatorio:
- storico fornito direttamente upstream;
- provenance HISTORICAL_UPSTREAM;
- distinto da live catturato e poi storicizzato.

### TC-CORE-04 — Live collector

### TC-CORE-05 — Live normalization/events
Include:
- score;
- stats;
- events;
- quote movements;
- Asian/Goal/Corner lines;
- deduplica.

### TC-CORE-06 — Captured live history/replay readiness
- provenance HISTORICAL_CAPTURED;
- gaps;
- replay query;
- no future leakage.

### TC-CORE-06B — Coverage temporale/campo
- coverage per campo;
- coverage per minuto/fascia temporale;
- movement coverage;
- kickoff cutoff;
- missingness esplicita.

### TC-CORE-07 — Resilience/budgets/alerts
- retries;
- rate limits;
- circuit breaker;
- restart;
- Telegram alert path.

### TC-CORE-08 — Multi-day hard certification
- almeno due giornate/cicli live reali;
- prematch/live;
- mapping;
- coverage;
- event dedup;
- historical provenance;
- final certificate/evidence.

---

## #31 Reconciliation residua — 5 PR

La parte FPT già certificata non va rifatta.

### RECON-CORE-01 — Cross-provider identity/gap model
### RECON-CORE-02 — TC prematch reconciliation
### RECON-CORE-03 — Live gap detection/recovery
### RECON-CORE-04 — Scheduler/idempotency/alerts
### RECON-CORE-05 — Failure drills + certification

UI data-health deferita.

---

## FASE 3 — #24 Replay neutro/PIT — 2 PR ora

### REPLAY-CORE-01 — PIT domain/query
- match_id + timestamp → deterministic state;
- provenance;
- gaps;
- no future leakage.

### REPLAY-CORE-02 — Neutral replay simulation contract
- replay session;
- frozen dataset/version;
- state at timestamp;
- freshness/gaps;
- API/tool.

NON integra ancora MM.

REPLAY-CORE-03 viene spostata più avanti, dopo #96 e #99.

---

## FASE 4 — #94 Math Core — 8 PR

### MATH-CORE-01 — Decimal/common contracts
### MATH-CORE-02 — Kelly/EV/Liability
### MATH-CORE-03 — BACK↔LAY Hedge/Cashout
### MATH-CORE-04 — Dutching/Arbitrage/DNB/Each-Way
### MATH-CORE-05 — Progression formulas
### MATH-CORE-06 — Risk/exposure/commission math
### MATH-CORE-07 — Poisson/advanced math adapters
### MATH-CORE-08 — API/tool + mathematical hard certification

Ogni formula:
- oracle;
- deterministic vectors;
- boundaries;
- Decimal/fixed precision;
- tick/rounding;
- commission.

UI deferita.

---

## FASE 5 — #96 MM core — 8 PR

### MM-CORE-01 — Registry/capabilities
### MM-CORE-02 — Profiles CRUD/immutable versions/dependencies
### MM-CORE-03 — Rules/filters/risk policy
### MM-CORE-04 — Operational mode STOP/RESUME
### MM-CORE-05 — Stateless + bankroll-dependent models
### MM-CORE-06 — Recovery/progression models
### MM-CORE-07 — Exposure-aware/composite policy
Questa PR NON integra ancora #34/#28/#24.

### MM-CORE-08 — API/tool + core hard certification

Perimetro componente; prove reali bankroll/exposure/settlement BLOCKED finché #99 non esiste. La certificazione integrata resta MM-INTEGRATION-01 e #98.

#96 non possiede accounting/ledger/settlement.

L'integrazione cross-domain viene fatta successivamente con MM-INTEGRATION-01.

---

## FASE 6 — #100 Market Rules — 5 PR

### MARKET-CORE-01 — Registry/version schema
### MARKET-CORE-02 — Core football resolvers
### MARKET-CORE-03 — Asian/partial/dead-heat
### MARKET-CORE-04 — postponed/abandoned/corrections
### MARKET-CORE-05 — API/tool + hard certification

---

## FASE 7 — #99 Settlement/Ledger — 7 PR

### LEDGER-CORE-01 — Position/leg/fill + append-only schema
### LEDGER-CORE-02 — Reserve/exposure + BACK/LAY accounting
### LEDGER-CORE-03 — Settlement/commission/market-rules integration
### LEDGER-CORE-04 — Hedge/cashout/multi-leg/reversal
### LEDGER-CORE-05 — Concurrency/idempotency/crash recovery
### LEDGER-CORE-06 — API/tool surface
### LEDGER-CORE-07 — Hard certification/reconciliation

---

## Cross-domain Paper Trading bridge — 1 PR

### PAPER-CORE-01 — Intent → Paper Position

Da eseguire dopo che esistono almeno:
- #99 position contract;
- #96 execution permission contract;
- #28 entry intent contract.

Responsabilità:
- prendere un entry intent validato;
- applicare #96 execution permission;
- creare una paper position in #99;
- reserve capital;
- idempotency;
- audit;
- nessun real execution;
- nessun bypass del MM.

---

## FASE 8 — #34 Strategy Lab/Backtest — 7 PR

### STRAT-CORE-01 — Persistence/DSL/versioning
### STRAT-CORE-02 — MM assignment/overrides/dependencies
### STRAT-CORE-03 — Backtest PIT/no-leakage
### STRAT-CORE-04 — Backtest config/saved/reproducibility
### STRAT-CORE-05 — Live matcher + near-match
### STRAT-CORE-06 — Indicator Library contracts/validation
### STRAT-CORE-07 — API/tool + hard certification

Certificare solo gate del componente realmente eseguibili; gate integrati con #28/bridge/late integrations rimangono BLOCKED fino alle dipendenze reali.

UI deferita.

---

## FASE 9 — #28 Trading Engine — 8 PR

### TRADE-CORE-01 — Signal lifecycle/decision contract
### TRADE-CORE-02 — Prematch planner
### TRADE-CORE-03 — Live state engine
### TRADE-CORE-04 — BACK/LAY/DUTCH engines
### TRADE-CORE-05 — Entry validation/MM gate
### TRADE-CORE-06 — Position-management intents
### TRADE-CORE-07 — Historical/replay validation
### TRADE-CORE-08 — API/tool + live hard certification

Il componente non certifica anticipatamente PAPER-CORE-01 o MM-INTEGRATION-01; gate integrati completati solo dopo quei consumer/integrazioni.

#28 non possiede ledger o execution.

---

## Late integration — 2 PR

### MM-INTEGRATION-01 — MM integration con Strategy/Trading/Replay
Da fare solo dopo che #34 e #28 esistono.

Copre:
- #34 assignment/evaluation;
- #28 entry/risk gate;
- #24 replay MM hooks;
- sequence events da #99;
- STOP/ADVISORY behavior cross-domain.

### REPLAY-CORE-03 — Replay + MM/tool certification
Ora può usare davvero:
- #96 profile/version;
- #99 virtual/accounting contracts;
- strategy/version;
- frozen settings/commission;
- replay virtual bankroll;
- no operational ledger mutation;
- deterministic results.

---

## FASE 10 — Backend/query/benchmark — 3 PR

### QUERY-CORE-01 — #25 finished-match backend contract
### QUERY-CORE-02 — #30 analysis/query backend contract
### BENCH-CORE-01 — #27 GOAT benchmark su dati/motore certificati

UI deferita.

---

## #102 Trading Copilot pre-UI — 4 PR

Deve completarsi PRIMA di MCP-CORE-02/03.

### TCOP-CORE-01 — Trading context + prematch/live tools
### TCOP-CORE-02 — Position/P&L/outcome-matrix tools
### TCOP-CORE-03 — Management intents + STOP/advisory + settlement/postmortem
### TCOP-CORE-04 — Agent-driven hard certification

Include replay Copilot tool-level.

Deferred:
- conversational polish #44;
- visual panel fase UI.

---

## #98 Final MCP integration/certification — 3 PR

### MCP-CORE-01 — Cross-domain tool registry integration
Consolida i tool già esposti dai domini senza reimplementare business logic.

### MCP-CORE-02 — Agent workflow integration
Workflow completo:
data → settings → math → MM → rules → paper position → ledger → strategy → trading → replay → Copilot.

### MCP-CORE-03 — Final pre-UI certification
Agent-driven E2E senza sito:
- account isolation;
- cross-session;
- idempotency;
- concurrency;
- audit;
- replay deterministico;
- paper lifecycle;
- settlement/reversal;
- reconciliation.

---

# Primo MCP utilizzabile

Il precedente claim "21 PR" era scorretto perché mancava il registry/tool transport comune.

## Primo MCP FPT-only

Dopo:
- 4 PR #23;
- 1 PR MCP-CORE-00;
- 4 PR #95;

quindi nella baseline **9 card erano pianificate**: questa è una dipendenza di capability, non un countdown verificato corrente. Dopo i relativi gate il sistema deve poter esporre via MCP/tooling i dati FutPythonTrader già certificati, usando i read/query contracts già presenti o adattati alla registry.

Capability iniziali:
- authenticated tool session;
- tool discovery;
- query FPT certificate/coverage;
- search/query FPT dove già disponibile;
- provenance/PIT FPT;
- settings read/update.

NON ancora:
- TotalCorner;
- live;
- replay completo;
- MM;
- paper trade;
- settlement;
- strategies;
- Trading Copilot.

## Primo MCP dati FPT + TotalCorner

Arriva dopo:
- #20 certificata;
- #31 reconciliation necessaria;
- relativi tool registrati.

---

# Regole di consolidamento

1. Le vecchie PR card restano storico ma sono SUPERSEDED da #104 per il percorso pre-MCP.
2. Non riaprire PR UI prima della fase 15 #97.
3. Non dividere le card senza motivo tecnico reale; non trattare 82 come conteggio residuo verificato.
4. Non accorpare se si perde un gate separato per:
   - schema/migrazione;
   - matematica;
   - authz;
   - provider evidence;
   - accounting;
   - recovery;
   - hard certification.
5. Una PR alla volta.
6. Ogni PR deve dichiarare:
   - fase #97;
   - owner;
   - dipendenze;
   - test;
   - hard evidence;
   - tool/API surface;
   - mock update SÌ/NO.
7. Qualunque ricensimento/variazione aggiorna #104 e, se cambia ordine/dipendenze, #97 sulla base di decisioni vigenti; non inventare un nuovo totale.

# Requirement preservation

Il consolidamento NON elimina i requisiti delle vecchie card.

In particolare #20 conserva come gate:
- upstream history;
- captured history;
- provenance distinta;
- quote/line movement;
- kickoff cutoff;
- event dedup;
- field/minute coverage;
- Telegram alerts;
- multi-day live evidence.

#99 conserva come gate separati:
- idempotency;
- crash recovery;
- API/tool;
- hard reconciliation.

# Traguardo funzionale della baseline — indipendente dal numero di PR

Le capability previste sono:
- FPT + TotalCorner certificati;
- reconciliation;
- replay PIT;
- Math Core;
- MM;
- Market Rules;
- Position/Settlement/Ledger;
- Paper Trading;
- Strategy/Backtest;
- Trading Engine;
- Replay + MM;
- Trading Copilot tool-level;
- MCP completo;
- uso end-to-end da ChatGPT/agente senza sito.

NON includono:
- UI finale;
- real execution #45;
- AI globale completo #44;
- hardening avanzato #32;
- Billing #46.
