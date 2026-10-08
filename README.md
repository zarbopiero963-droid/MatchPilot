# MatchPilot — Sports Trading OS

## Ingresso operativo corrente — 07/10/2026

Leggere README → CLAUDE.md → AGENTS.md, poi **#3 → #97 → #104** e la issue di dominio; partire dai blocchi “Stato corrente / Prossima attività”, non dalla cronologia dei commenti.
### Prossima attività unica / autorizzazione corrente

L'owner il **07/10/2026 alle 15:23 Europe/Rome** ha autorizzato **una sola PR documentale/governance**, dopo il PASS del punto 9 della #40, e ha vietato il merge automatico.
**Prossima azione: owner review e autorizzazione al merge della [PR #125](https://github.com/zarbopiero963-droid/MatchPilot/pull/125).**
Non iniziare operativamente #20, il punto 10 della #40 o altri domini durante questa PR.

Dopo il merge, il primo controllo operativo è **verificare e registrare la finestra sicura di #40 per riprendere lo sviluppo core**. Il PASS del punto 9 certifica la riconciliazione locale, non la durabilità dell'archivio né automaticamente tale finestra. Se la finestra è attestata secondo il contratto vigente, la priorità owner è **#20 / TC-CORE-01**, con i prerequisiti security/identity applicabili, senza riattivare il trial. Se non è attestata, fermare l'avvio core e riportare il blocker; nessun punto successivo #40 è autorizzato da questa PR. Definizioni o scelte nuove sui criteri di finestra sicura restano **OPEN / OWNER DECISION REQUIRED**.

### Gerarchia vigente

Decisioni esplicite owner (con fonte, data e scope) → **[#3](https://github.com/zarbopiero963-droid/MatchPilot/issues/3) master di prodotto/stato globale → [#97](https://github.com/zarbopiero963-droid/MatchPilot/issues/97) roadmap/fasi → [#104](https://github.com/zarbopiero963-droid/MatchPilot/issues/104) piano operativo delle PR** → contratti e gate delle issue di dominio → README / CLAUDE / AGENTS → documenti di integrazione → mock.
La gerarchia non permette a #104 di eliminare acceptance criteria di dominio o alle docs di inventare decisioni owner. I documenti di supporto e gli snapshot di questa PR non sono una quarta master. Il piano proposto nell'audit non è stato approvato come nuova roadmap.

### Stato corrente verificato — 07/10/2026

| Perimetro | Stato corrente | Residuo / gate |
|---|---|---|
| main | `5b39f3308d266752409ef4bdcb9e86b2d3d9423e` prima della PR governance; backend principalmente FPT | nessuna feature implementata da questa PR |
| #12 FPT | implementazione e certificazione storica del perimetro 05/10 disponibili; issue OPEN, **NON globalmente READY TO CLOSE / NON 0 lavoro residuo** | audit 412/412 dopo TC messo in sicurezza; rischio PIT/reprocessing aperto |
| #20 TC core | **URGENTE**, core persistente non avviato/certificato; trial #40 distinto dal core | finestra sicura #40 attestata, discovery reale, overlap VERIFIED; scadenza membership **11/10/2026 15:20:27 Europe/Rome** |
| #40 trial | freeze → FAIL storico #123 → fix #124 mergiata → **punto 9 PASS, mismatch_count=0** | portabilità DuckDB e punti 10–16 aperti; punto 17 owner-gated; nessuno shutdown autorizzato |
| #104 | catalogo card pre-MCP conservato | **82 è baseline storica, NON conteggio verificato del residuo attuale** |
| core downstream / #98 | contratti pianificati; certificazione integrata non ottenuta | componenti, consumer, paper bridge e integrazioni reali prima del gate E2E; UI finale deferita |

Dettagli verificabili: [integrazione e stato corrente](docs/integration-map.md#stato-operativo-corrente--07102026), [matrice requisiti/fonti/gate](docs/governance/reconciliation-matrix-2026-10-07.md). Questi sono supporti della gerarchia, non master concorrenti.

**Scope e owner:** solo calcio, FPT e TC feed core primari, FPT ∩ TC VERIFIED. #96=policy/risk/MM; #99=ledger/accounting/positions/settlement; #100=market rules; #28=trading intent; #34=Indicator Library/DSL. Shared ingestion/computation vincolante.
**Tre livelli distinti:** implementazione; certificazione componente scoped; certificazione integrata #98. Mock e CI da soli non sono hard evidence.
**SUPERSEDED:** #12 globalmente “0 lavoro residuo / READY TO CLOSE”, 82 PR come residuo verificato, accounting #96, vecchi ordini incompatibili con gli override TC/audit412. Il certificato FPT 05/10 resta evidenza storica del suo perimetro.
**PIT aperto:** parser/reprocessing e versioni identità possono cambiare il risultato allo stesso T; registrare prima/dopo, raw/acquisition, parser/schema/transform/data-contract e mapping/versioni. Nessun apply prod senza owner.
**OPEN / OWNER DECISION REQUIRED — STOP/ADVISORY_ONLY sulle posizioni già aperte:** #96 e #97 vietano exposure mutation/financial ledger writes in ADVISORY_ONLY, mentre README descrive la continuazione di chiusura/settlement delle posizioni esistenti. Il confine di ownership è chiaro (#99 scrive), ma l'eccezione operativa non è univoca. Prima della relativa integrazione, l'owner deve chiarire quali scritture #99 restano consentite per posizioni già aperte. Non scegliere automaticamente “blocca tutto” o “settle comunque”; nessun comportamento runtime cambiato qui.

**OPEN / OWNER DECISION REQUIRED:** punto10+/shutdown #40, nuovi criteri di finestra sicura, scelta PIT non registrata, WeWeb, sport/overlap aggiuntivi, BetsAPI core, execution reale. Il piano audit non è approvazione owner.
**Gate PR:** scope solo documenti, fonti linkate, nessun requisito perso, walkthrough10punti, CI/review; merge di questa PR solo dopo owner. Non chiudere issue.


![CodeRabbit Pull Request Reviews](https://img.shields.io/coderabbit/prs/github/zarbopiero963-droid/MatchPilot?utm_source=oss&utm_medium=github&utm_campaign=zarbopiero963-droid%2FMatchPilot&labelColor=171717&color=FF570A&link=https%3A%2F%2Fcoderabbit.ai&label=CodeRabbit+Reviews)

MatchPilot è una piattaforma web di **trading sportivo decisionale**, non un semplice sito di pronostici.

## Obiettivo

Per ogni partita il prodotto deve raccogliere, normalizzare e mostrare in card **tutte le informazioni realmente disponibili da FutPythonTrader**, combinarle con i mercati pre-match di TotalCorner e, dopo il calcio d'inizio, usare TotalCorner come feed live per validare opportunità di trading.

Il flusso prodotto è:

**PRE-MATCH → LIVE VALIDATION → ENTRY → MANAGEMENT → EXIT → POST-MORTEM**

## Roadmap canonica #97 — Backend / API-first, UI per ultima

L'ordine di lavoro non segue il numero delle issue: segue la issue **#97 — ROADMAP** (revisione owner del 06/10/2026). Riassunto, ownership e superfici tool: [`docs/integration-map.md`](docs/integration-map.md).

Gerarchia: decisioni owner → #3 prodotto/stato globale → #97 roadmap/fasi → #104 PR → issue di dominio → README / CLAUDE / AGENTS → docs → mock.

| Fase | Issue | Scope |
| --- | --- | --- |
| 0 | #23 | identità + security baseline |
| 1 | #95 | settings e commissione via API |
| 2 | #12 → #20 → #31 | dati certificati |
| 3 | #24 | replay backend / PIT minimo |
| 4 | #94 | Math Core + API/tool |
| 5 | #96 | MM Registry / Profiles / Policy + API/tool |
| 6 | #100 | Market Rules |
| 7 | #99 | Position / Settlement / Ledger + API/tool |
| 8 | #34 | Strategy Lab / Backtest + API/tool |
| 9 | #28 | Trading Engine + API/tool |
| 10 | #27 + query backend #25 / #30 | benchmark e contratti backend |
| 11 | #98 | certificazione integrata pre-UI |
| 12 | #44 | AI Assistant |
| 13 | #45 | Exchange Gateway, owner-gated |
| 14 | #32 | hardening avanzato |
| 15 | UI finale | #30, #29, #24, #25, #94, #95, #96, #34, #102, eventuale #91 |
| 16 | #46 | Billing / SaaS |

#102 Trading Copilot attraversa più fasi: tool contestuali dopo #28, spiegazione conversazionale dopo #44, certificazione in #98, card visuale in fase 15.

### API/tool-first e #98 incrementale

Ogni componente segue DATA CONTRACT → DOMAIN / MATH → DB → API → TEST MATEMATICI → HARD TEST REALI → TOOL / MCP → UI. Ogni dominio espone subito i propri tool (#12/#20/#31 dati e PIT, #95 settings, #94 math, #96 MM e operational mode, #100 regole di mercato, #99 posizioni e ledger, #34 strategie e backtest, #28 segnali, #102 contesto del Copilot). #98 non è una fase monolitica tardiva: certifica l'intero percorso end-to-end, senza sito, prima della UI finale.

### Ownership di dominio

- **#94 Math**: formule pure (Kelly, EV, liability, hedge, cashout, dutching, arbitraggio, Poisson, progressioni), Decimal/fixed precision, solver, oracle e test vector.
- **#95 Settings**: impostazioni account, commissione, default, versioni, snapshot, concorrenza.
- **#96 Money Management**: registry, profili, capability, staking policy, limiti, filtri, regole, sequence state solo dove serve, decisione ALLOW / REDUCE / BLOCK / SIMULATION_ONLY e `operational_mode`. Legge bankroll, riserve ed esposizione da #99, **non scrive** posizioni, ledger o saldo.
- **#100 Market Rules**: WIN/LOSS, VOID, PUSH, rinvii, partite abbandonate, dead heat, esiti asiatici a metà, supplementari e rigori, correzioni, versione della regola.
- **#99 Settlement / Ledger**: posizioni, fill e leg, fondi riservati, esposizione, contabilità, P/L realizzato e non realizzato, equity, settlement, commissione applicata, ledger append-only, reversal, correzioni, idempotenza.
- **#34 Strategy Lab**: strategie, DSL, versioni, backtest, assegnazione MM, matching.
- **#28 Trading Engine**: piano pre-partita, segnale live, BACK / LAY / DUTCH / NO TRADE, intent di entry, invalidation, exit e hedge.
- **#45 Execution**: unico percorso per ordini reali, fill, riconciliazione provider, kill switch.
- **#44 Assistente globale**: query generali, dati, coverage, storico, strategie, domande sul sistema.
- **#102 Trading Copilot**: contesto della partita aperta (strategia, MM, posizione, P/L, esposizione, prossima azione, settlement, post-mortem). Non possiede logica: consuma i tool certificati via #98.

### STOP OPERATIONS e ADVISORY_ONLY

Ogni profilo MM ha uno stato operativo persistente: `ACTIVE_OPERATIONAL`, `ADVISORY_ONLY`, `PAUSED`, `ARCHIVED`. STOP OPERATIONS (dal profilo o dal Trading Copilot) porta in `ADVISORY_ONLY`: dati, segnali, analisi, stake e liability teorici e consigli HOLD / HEDGE / EXIT continuano; nuove paper position, riserve, modifiche all'esposizione, scritture finanziarie nel ledger e avanzamento delle progressioni per trade non registrati si fermano. L'output è marcato "ADVISORY ONLY — operazione non registrata". La precedente indicazione “posizioni già aperte continuano fino al settlement” richiede chiarimento owner rispetto al divieto di financial ledger writes/exposure mutation in ADVISORY_ONLY (#96/#97): **OPEN / OWNER DECISION REQUIRED**, nessuna eccezione implicita autorizzata. RESUME OPERATIONS non ricostruisce trade retroattivi.

### Replay con Money Management

Il replay (#24) può girare neutro o con un profilo MM. I dati del replay non cambiano mai: il MM aggiunge solo un layer operativo in una sessione di simulazione separata (`replay_simulation_id`, snapshot, profilo e versione, strategia, impostazioni e commissione congelate, bankroll virtuale), che non scrive mai nel ledger #99. Il MM si cambia prima del Play, in pausa o con un reset. Al timestamp T si usano solo dati ≤ T.

### Ciclo di certificazione

DISCOVERED → SPECIFIED → CONTRACT_FROZEN → IMPLEMENTED → TESTED → MATH_VERIFIED (se applicabile) → HARD_VERIFIED_REAL → TOOL_VERIFIED → CERTIFIED → OWNER_ACCEPTED.

Stato storico al 06/10 prima degli override: certificato FPT del 05/10 e porzione FPT #31 verificati nel loro perimetro. Il claim globale READY TO CLOSE è SUPERSEDED dall'audit 412 e non rappresenta lo stato corrente; leggere il blocco di ingresso.

### Mock UX vivo

Il mock è [`docs/mockups/matchpilot-trading-os.html`](docs/mockups/matchpilot-trading-os.html) (**Mock UX v2026.10.06**, allineato a #97, include #94 #95 #96 #98 #99 #100 #102). Changelog, parti REAL e DEMO e gap noti: [`docs/mockups/README.md`](docs/mockups/README.md).

- **Il mock deve restare vivo.** Ogni nuova feature, comportamento, stato, dominio, tool, impostazione, issue di prodotto o cambio UX con impatto visibile o concettuale aggiorna il mock nella stessa PR o nella stessa sequenza di PR pianificata. Ordine: NUOVA FEATURE → issue/contratto → backend/dominio/API → docs → mock, se rilevante.
- Ogni PR con una feature visibile risponde a: **"Questa modifica richiede un aggiornamento del mock MatchPilot? SÌ / NO"**. Se SÌ, aggiorna mock e changelog; se NO, scrive il motivo in una riga.
- **Il mock non certifica il backend.** Una funzione presente solo nel mock non è IMPLEMENTED, TESTED, HARD_VERIFIED_REAL, TOOL_VERIFIED né CERTIFIED. Il mock distingue sempre DEMO/FUTURE da REAL: REAL solo per valori letti dalle route certificate.
- Nel prototipo la persistenza account è simulata in `localStorage`; nel prodotto la fonte di verità è il database account-level (#95).
- `test/mockup-alignment.test.mjs` (in CI) controlla roadmap, ownership #96/#99, dichiarazioni sulla persistenza, versione del mock e coerenza con il changelog.

## Fonti dati

### FutPythonTrader — motore statistico/pre-match
Usare ogni campo disponibile e con copertura reale. Le famiglie includono, quando presenti:

- risultati e forma;
- gol fatti/subiti;
- 1X2, Over/Under, BTTS, Double Chance, Correct Score;
- xG, xGA, xGOT, xA;
- tiri totali, in porta, fuori, bloccati;
- tiri dentro/fuori area e legni;
- big chances;
- possesso;
- pass accuracy, long-pass accuracy, final-third passing, through passes, crosses;
- touches in box;
- corner;
- falli, cartellini, fuorigioco, punizioni;
- tackle, duelli, clearances, interceptions;
- saves, errors leading to shot/goal, goals prevented;
- split HT e 2T;
- minuti dei gol;
- storico quote;
- ogni ulteriore campo futuro restituito dall'API.

**Regola:** un campo disponibile non deve essere nascosto dal modello dati. Se non è ancora visualizzato, resta comunque normalizzato e interrogabile.

### TotalCorner — mercato pre-match + live
Prima del kickoff:

- opening e pre-match 1X2;
- Asian Handicap;
- Goal Line;
- Corner Line;
- storico movimenti quota precedente al kickoff.

Dopo il kickoff:

- score e stato;
- events;
- attacks;
- dangerous attacks;
- shots on/off target;
- possession;
- corners e cards;
- 1X2 live;
- Asian / Goal / Corner lines;
- storico movimenti in-play.

## Separazione temporale obbligatoria

Il motore pre-match **non può leggere o derivare** alcuna informazione successiva al kickoff.

Ogni record deve avere:
- provider timestamp;
- acquisition timestamp UTC;
- match id provider;
- fase: PREMATCH o LIVE;
- provenance;
- versione parser/schema.

Un'analisi pre-match deve poter essere ricostruita usando esclusivamente snapshot anteriori al kickoff.

## Web app

> La web app definitiva è la **fase 15** di #97: consuma API già certificate e non contiene logica finanziaria autorevole. Fino ad allora il riferimento UX è il mock vivo in `docs/mockups/`, che non certifica nulla.

### Home / Daily Board
Card per tutte le partite disponibili con:
- squadre, campionato, orario;
- probabilità 1X2 modello;
- fair odds;
- O1.5 / O2.5 / BTTS;
- expected goals;
- market movement;
- trading profile;
- numero di strategie live candidate;
- qualità/copertura dati.

### Match Center
La pagina partita deve mostrare card separate e confrontabili Home/Away:

1. Overview
2. Forma 5/10/20
3. Casa vs trasferta
4. xG / xGA / xGOT / xA
5. Tiri e qualità occasioni
6. Creazione offensiva
7. Possesso e costruzione
8. Difesa
9. Disciplina
10. Corner
11. Primo tempo
12. Secondo tempo
13. Timing gol
14. Score distribution
15. H2H
16. Mercati storici
17. Similar Odds
18. Strengths / Weaknesses
19. Model Output
20. Trading Candidates
21. Data Coverage
22. Market Movement
23. Live State (solo dopo kickoff)
24. Trading Opportunities
25. Trade Journal / Post-mortem

Le card devono mostrare sempre anche **coverage N** e provenienza.

## Trading Opportunity Engine

MatchPilot non deve limitarsi a "pronostico sì/no". Ogni opportunità deve descrivere:

- mercato/strategia;
- direzione BACK/LAY;
- confidence;
- entry window;
- quota corrente;
- fair price;
- edge;
- contesto pre-match;
- conferme live;
- invalidation conditions;
- stake/risk suggestion;
- exit target;
- stop;
- evidenze usate.

Esempio didattico di **LAY senza edge statico positivo** (il precedente +17.8% è ERRATO / SUPERSEDED):

```text
LAY 1-0
Confidence: 78/100
Entry window: 68'-76'
Current odds: 8.40
Fair lay odds: 6.90
Static EV / lay stake: -21.7391% before commission
Decision from static EV: NO TRADE
Pressure: HIGH
Pre-match vulnerability: HIGH
Stop: 82' or momentum reversal
```

Con p=1/6.90 e lay stake 1, liability=8.40−1=7.40: EV=(1−p)−7.40p=1−8.40/6.90=−0.217391. La commissione riduce ulteriormente l'EV. Confidence/pressure e movimento quota non trasformano questo EV in positivo. Un modello di exit dinamico richiede un contratto e un oracle espliciti prima di attribuirgli un edge; qui non viene inventato.

## Strategie

Le strategie devono essere configurabili e backtestabili. Non esiste un limite artificiale di 5 strategie.

Esempi:
- Lay Score;
- Lay Draw;
- Lay Favourite;
- Back Over;
- Goal after pressure;
- Next Goal;
- score vulnerability;
- market/model divergence;
- strategie custom create dall'utente.

Ogni strategia deve avere versione, regole, parametri, campione, risultati, ROI, drawdown e intervallo di confidenza.

## Principi non negoziabili

1. Nessun dato live nel pre-match.
2. Nessuna probabilità inventata se manca il dato.
3. Coverage sempre visibile.
4. Modello e mercato sono segnali distinti.
5. Un movimento quota non è automaticamente un edge.
6. NO TRADE è un risultato valido.
7. Ogni trade deve essere riproducibile da snapshot immutabili.
8. Nessuna strategia viene dichiarata profittevole senza backtest out-of-sample.
9. Tutti i dati FutPythonTrader disponibili devono poter essere ispezionati.
10. GOAT non è una dipendenza del prodotto.

## Stato

Il progetto precedente è stato archiviato nel branch:

`archive/pre-trading-os-reset-2026-10-04`

La branch `main` rappresenta esclusivamente il nuovo MatchPilot Sports Trading OS.


## Stato FutPythonTrader — certificazione

La chiusura definitiva della sorgente FutPythonTrader è governata dalla issue **#12 — FPT-CERT**.

Evidenza storica della sorgente, limitata al perimetro del report del 05/10: certificato dati **CERTIFIED WITH KNOWN LIMITATIONS**, **20 gate su 20 veri** sul deploy live del commit `6f83e2e` (20 migrazioni, ultima `020-fpt-raw-retention-reprocessing.sql`), report generato il 2026-10-05 alle 22:39:32 UTC dopo il primo cron reale di refresh delle stagioni correnti (22:17 UTC) e dopo la correzione del checkpoint `post_run` (#92). Documento versionato: [`docs/futpython-certification-2026-10-05.md`](docs/futpython-certification-2026-10-05.md), rigenerato da `GET /api/futpython-certificate` con `--from-json`, con verifica incrociata solo via HTTP pubblico. I gap della checklist finale della #12 sono stati corretti dentro FPT-PR-09 (#81 query assistente, #82 registry filtri, #83 livelli di budget, #86 onboarding, #88 riconciliazione, #89 versionamento e raw append-only, #90 pagina `/coverage`, #92 certificato rigenerato e checkpoint `post_run`). Refresh stagioni correnti: al primo cron 50 delle 104 stagioni scadute sono state riscaricate (`RECOVERED`, contenuto identico, 0 righe duplicate); le altre 54 sono `QUEUED` per i cron successivi (massimo 50 per run). La valutazione di chiudibilità è pubblicata nella #12; la issue resta OPEN e la chiusura spetta all'owner.

Il gate dati della FASE 1 (backfill storico + verifier, PR #33) resta valido sull'evidenza reale sotto. Il kill live e il budget sono stati verificati dopo il merge di PR #35, con il limite esplicito che il SIGTERM di produzione è caduto fra due dataset e non a metà scrittura. I paragrafi di fase qui sotto restano lo storico delle singole PR. I numeri di quel perimetro storico sono nel certificato generato; lo stato corrente include anche audit 412 e rischio PIT nel blocco di ingresso.

La certificazione richiede, nell'ordine:

1. backfill storico completo e restartable;
2. classificazione di ogni dataset;
3. riconciliazione snapshot, versioni e match unici;
4. censimento completo delle colonne;
5. coverage per campo/dataset/lega/stagione;
6. audit delle stagioni mancanti;
7. due sync incrementali reali con verifica idempotenza;
8. certificazione Data Health/Watchdog/Telegram;
9. documento finale `docs/futpython-certification-YYYY-MM-DD.md` — prodotto: `docs/futpython-certification-2026-10-05.md`.

### FASE 1 — Backfill

La FASE 1 introduce:
- snapshot immutabile del catalogo usato dal run;
- backfill riprendibile senza riscaricare dataset terminali;
- conteggio `resumed_skips`;
- classificazione `available / unavailable_404 / error / deprecated`;
- riepilogo reale tramite `/api/futpython-certification`.

**Regola:** README viene aggiornato in ogni PR di certificazione. Una fase viene marcata completata solo dopo CI verde e test reali su Render/Neon.


### FASE 1 — evidenza reale e correzione resume

Il primo collaudo reale della FASE 1 ha rilevato che dataset già acquisiti prima dell'introduzione della colonna `availability` conservavano `availability=unknown` pur avendo uno snapshot valido.

Correzione prevista in questa PR:
- `unknown + last_snapshot_id` viene riconciliato a `available`;
- `error` resta ritentabile anche se esiste uno snapshot precedente;
- run lasciati `running` da un deploy/interruzione vengono chiusi come `partial/interrupted`;
- il backfill resta restartable e non duplica dataset terminali.

Al momento di quella correzione la FASE 1 restava **NON CERTIFICATA**, in attesa di un collaudo reale con `undefined_states=0`.


### FASE 1 — ottimizzazione persistenza reale

Il collaudo del backfill ha mostrato che la persistenza riga-per-riga verso Neon era corretta ma troppo lenta per una certificazione operativa ripetibile.

Questa PR sostituisce:
- upsert catalogo per singola riga;
- upsert schema per singolo campo;
- insert versione partita per singola riga;

con operazioni PostgreSQL batch tramite `jsonb_to_recordset`.

Il contratto dati non cambia:
- raw snapshot immutabile;
- payload completo JSONB;
- deduplica per hash;
- versioning partita;
- schema discovery dinamico.

Al momento di quella ottimizzazione la FASE 1 restava **NON CERTIFICATA**: mancavano ancora il backfill reale completo e la riconciliazione finale.


### FASE 1 — correzione contatori certificazione

Il backfill reale ha completato la classificazione del catalogo, ma ha evidenziato un difetto nel solo ledger del run: alcuni contatori numerici non erano inizializzati e quindi venivano serializzati come zero dopo operazioni su `undefined`.

La correzione:
- inizializza esplicitamente tutti i contatori;
- conserva separatamente 404 incontrati nel run e totale finale `unavailable_404`;
- permette di verificare l'equazione `datasets_attempted + resumed_skips = catalog_entries` nei backfill.

La classificazione già persistita dei dataset non viene modificata.


### FASE 1 — verifica reale finale

Prima della chiusura formale vengono eseguiti e persistiti in `fpt_certification_checks`:
- deduplica reale su almeno 3 dataset disponibili mediante nuovo download e confronto snapshot/versioni;
- conferma reale di un dataset `unavailable_404`;
- conferma di un dataset disponibile con righe;
- conferma di almeno una lega multi-stagione.

Il verificatore è eseguibile con `npm run verify:futpython:p1` o, in modo one-shot su Render, con `FUTPYTHON_PHASE1_VERIFY_ON_START=true`.

La FASE 1 viene marcata **CERTIFICATA** solo se tutti questi check risultano `pass`.


### FASE 1 — finding catalogo storico completo

Il verificatore reale ha bloccato la certificazione perché il catalogo iniziale conteneva 185 leghe ma una sola stagione per lega. La documentazione ufficiale FutPythonTrader espone invece, nella colonna **TEMPORADAS**, tutte le stagioni disponibili per ciascuna lega.

Esempi osservati realmente:
- Argentina Primera Nacional: 2026 → 2021;
- Australia A League: 2025-2026 → 2020-2021;
- Europe Euro: 2020, 2016, 2012, 2008, 2004, 2000;
- World Championship: 2026, 2022, 2018, 2014, 2010, 2006, 2002.

La discovery viene quindi corretta per espandere **ogni stagione documentata** in un dataset distinto. La precedente prova su 185 dataset resta valida solo come collaudo tecnico, non come backfill storico completo.

Al momento di quel finding la FASE 1 restava **NON CERTIFICATA**: il catalogo espanso non era ancora stato acquisito per intero e il verifier reale non era passato.

### FASE 1 — stato corrente, evidenza 2026-10-04

**Gate dati FASE 1 (PR #33): evidenza reale, non certificazione completa della fase.**

I numeri sotto restano l'evidenza del backfill e del verifier. Non includono un kill a metà `storeDataset`. Il codice osservato allora era il commit `0307e72e977767cf4ee1a694bcbab9c635d40e39` su `main`. Quella PR non aggiungeva migrazioni né modificava il sync.

Backfill `fpt-1791137791126-7a167652` (`kind=backfill`, `status=complete`):
- avvio 20:16:31 Europe/Rome, fine 20:42:01 Europe/Rome;
- deploy di boot `dep-db19fq8u01pc73depeh0` (stesso commit, finito 20:16:36 Europe/Rome, poi disattivato);
- catalogo 1027 (56 paesi, 185 leghe), snapshot catalogo `fpt-catalog-9dcea3d469a9598004098794`;
- `datasets_attempted` 840, `resumed_skips` 187, equazione 840+187=1027;
- `available` 615, `unavailable_404` 412, `error_real` 0, `deprecated` 0, `unknown` 0, `undefined_states` 0;
- equazione di stato 615+412+0+0=1027, confermata anche dal `GROUP BY availability` su Neon (nessuna riga `error` o `unknown`);
- `snapshots_inserted` di questo run 509; snapshot correnti nel mirror 615;
- `rows_seen` 147999, `rows_inserted` 147975, `datasets_changed` 509, `fields_seen` 261;
- `errors` vuoto (`[]`), `error_real_count` 0. Nessuna anomalia di errore su questo run.

Il resume dimostrato è reale rispetto al catalogo incompleto precedente: i 187 dataset già terminali sono stati saltati prima di `syncEntry` e non sono stati riscaricati. Le GET di dataset di questo run sono le 840 sugli stati non terminali, più il fetch del catalogo e il fetch di `jogos-do-dia` (today). Non è stato eseguito un kill a metà di questo run: il test di interruzione durante `storeDataset` **non** è stato fatto e non si dichiara superato.

Verifier one-shot sul deploy `dep-db19u88u01pc73dgmck0` (live 20:47:23 Europe/Rome, poi disattivato). Log `FUTPYTHON_PHASE1_VERIFY` alle 20:47:19 Europe/Rome: 6 check, 0 fail. In `fpt_certification_checks` (fase `FPT_PHASE1`), tutti `pass`:
- `DEDUP_australia/a-league/2020-2021` (20:47:16 Europe/Rome);
- `DEDUP_austria/bundesliga/2020-2021` (20:47:17);
- `DEDUP_belgium/jupiler-pro-league/2020-2021` (20:47:18);
- `UNAVAILABLE_404_SAMPLE` (20:47:18);
- `AVAILABLE_DATASET_SAMPLE` (20:47:19);
- `MULTI_SEASON_SAMPLE` (20:47:19).

I tre `DEDUP_*` hanno riscaricato e persistito di nuovo: snapshot e versioni invariati (`changed=false`). Un verifier precedente, alle 17:54 Europe/Rome, aveva `MULTI_SEASON_SAMPLE` in fail sul catalogo non espanso; non è lo stato corrente.

Dopo il verifier è andato live un terzo deploy dello stesso commit, `dep-db19vb5g1s2s7398372g` (finito 20:49:40 Europe/Rome, trigger API). Non ha rilanciato il verifier. Le variabili d'ambiente non sono state lette né modificate da questa PR.

Scansione log runtime Render del servizio `matchpilot-test` sulla finestra 20:10–21:15 Europe/Rome (boot backfill, verifier e deploy successivo): nessuna occorrenza di `api_key=`, `postgres://`, `postgresql://`, `DATABASE_URL` o `FUTPYTHON_API_KEY`. Nessun token Telegram (cifre:token) nelle righe esaminate. Esito scansione: **PASS**.

Quella evidenza non chiudeva il test di interruzione. La issue #12 restava aperta.



### FASE 1 — verifica post-merge (2026-10-04, 22:27 Europe/Rome)

PR #35 è mergiata in `222be65bf5775e1687de4bf6f2798cde92efbf68`. Deploy Render `dep-db1bbujtqb8s7396dg50` live alle 22:24:50 Europe/Rome. Commento di verifica: issue #12, FPT-PR-01 VERIFIED REAL.

Riletto dopo il deploy, non copiato dalla PR:

- `GET /healthz` HTTP 200, `status=ok`;
- `GET /api/data-health` `status=ok`, activeDatasets 1027, datasetsWithErrors 0, nessun run nuovo;
- `GET /api/futpython-certification`: catalogo 1027, available 615, unavailable_404 412, error_real 0, unknown 0, undefined_states 0, duplicate_catalog_keys 0, snapshots 615, historical_versions 161398;
- Neon: migrazione `007-fpt-request-ledger.sql` applicata, run `running` 0, righe di ledger dopo il deploy 0, nessun 429;
- boot senza backfill. `FUTPYTHON_BACKFILL_ON_START` e `FUTPYTHON_PHASE1_VERIFY_ON_START` false;
- secret scan dei log di boot: PASS.

Il SIGTERM live del drill è fra i dataset, nel delay di 5 secondi. Il rollback a metà `storeDataset` resta provato solo su Postgres locale.

### FASE 2 — classificazione terminale persistente

La classificazione non è un calcolo solo al momento della GET. La migrazione `008-fpt-dataset-classification.sql` aggiunge su `fpt_dataset_state` le colonne `classification`, `classification_reason`, `http_disposition`, `first_success_at`, `last_success_at`, `last_error_at`, `last_http_status` e `provider_path`, e le riempie dalle righe già presenti senza riscaricare i dataset. `first_seen_at` e `last_seen_at` restano su `fpt_catalog`. `last_synced_at` resta sulla riga di stato.

Stati persistiti: `AVAILABLE`, `UNAVAILABLE_404`, `ERROR_REAL`, `DEPRECATED`, `REMOVED`. `http_disposition` è `INITIAL_404` oppure `REGRESSION_404`. Un 404 iniziale resta `unavailable_404` e il backfill lo salta. Una regressione 404 resta `availability=error` (ritentabile) con `classification=ERROR_REAL` e `http_disposition=REGRESSION_404`: non viene sigillata come unavailable. Un dataset assente dal catalogo diventa `REMOVED` con `active=false`; `active=false` da solo non è la classificazione.

Il sync scrive gli stessi campi a ogni esito. Il gate letto dall'intero catalogo, non da un sottoinsieme, è `classified_total === catalog_total`, `unclassified = 0` e `duplicate_catalog_keys = 0`. Lo espongono `/api/futpython-certification` (`phase2`) e `node src/jobs/futpython-classify-phase2.mjs`. Non chiamano FutPythonTrader. Il budget richieste di PR #35 non cambia.

I numeri del gate su Neon production sono nel commento della PR, dopo la migrazione applicata dal job e prima del deploy del sito. Non sono inventati in questo paragrafo.

### FASE 3 — integrità raw → parser → DB e identità squadra

L'audit non riscarica FutPythonTrader. Rilegge il payload gzip già salvato e lo confronta con il parser e con `fpt_match_versions`. Controlla collisioni di `match_key`, collisioni di `provider_match_id` solo se la stessa id descrive partite diverse, payload duplicati, CSV malformato, header/riga di larghezza diversa, Home/Away/Date mancanti, `row_count` contro righe parser e contro righe DB, snapshot orfani, versioni orfane, date non interpretabili e payload vuoto. Uno snapshot già completo che ha meno versioni del proprio `row_count` riceve solo le righe mancanti: il gzip e l'hash non vengono riscritti.

`Match_ID` nel CSV non entra nella `match_key` storica, che resta `fpt:hash:` quando il codice non ha riconosciuto `Id`. Il valore viene copiato in `provider_match_id` se non crea una collisione di identità. La stessa partita presente in due dataset (per esempio Eredivisie ed Eerste Divisie) resta due `match_key`, con la stessa identità, e non è una collisione.

La migrazione `009-fpt-team-identity.sql` crea `fpt_teams` e `fpt_team_aliases`. `internal_team_id` è stabile su paese e nome normalizzato: case, punteggiatura e il suffisso paese `(XXX)` non creano una seconda squadra. La competizione resta contesto, non una seconda identità. Il CSV non ha un id squadra provider: `provider_team_id` resta nullo. Alias, abbreviazioni e nomi storici stanno sulla stessa entità. `first_seen` e `last_seen` vengono dalle date partita. La provenance registra la sorgente. Il gate SQL è esposto da `/api/futpython-certification` (`phase3`) e da `node src/jobs/futpython-audit-phase3.mjs`. I numeri del campione reale stanno nel commento della PR, non in questo paragrafo.

### FASE 4 — schema registry e lineage

`fpt_schema_fields` resta la registry. La migrazione `011-fpt-schema-registry.sql` aggiunge `type_history`, `type_collision`, `seasons_seen`, `alias_candidates`, `normalized_field`, `queryable`, `filterable`, `unique_rows_seen`, `source_provider` e `source_kinds`. `rows_seen` resta il contatore cumulativo degli ingest e può superare le righe distinte. `unique_rows_seen` è il numero di match già salvati negli snapshot il cui header contiene il campo: non cresce se lo stesso snapshot viene riletto.

Il gate conta i nomi header distinti in tutti gli snapshot raw, dataset e today, contro `field_name` della registry. Gli alias non vengono tolti dal conteggio. `AH_H_*` e `AH_Home_*` (e `AH_A_*` / `AH_Away_*`) restano due campi, con `alias_candidates` che li collega. Nessun campo raw viene scartato per far tornare l'uguaglianza.

`fpt_field_transforms` e le colonne `source_provider`, `parser_version`, `schema_version`, `transform_version` su `fpt_match_versions` legano ogni valore normalizzato già persistito (`home`, `match_date`, `provider_match_id`) allo snapshot. Il default non riscrive il gzip. Il gate è `phase4` su `/api/futpython-certification` e `node src/jobs/futpython-audit-phase4.mjs`. I numeri reali stanno nel commento della PR.




### FASE 5 — coverage multidimensionale

La coverage non è una tabella nel README. La migrazione `012-fpt-field-coverage.sql` crea `fpt_field_coverage` e `fpt_coverage_audit`. Il job `node src/jobs/futpython-audit-phase5.mjs` le riempie dai payload già salvati in `fpt_match_versions`. Non riscrive i gzip e non riscarica FutPythonTrader.

Una riga è nello scope di un campo solo se la chiave è presente nel payload. Il denominatore non è `rows_seen`, che resta il contatore cumulativo degli ingest. `nonempty` usa gli stessi token vuoti della discovery (`''`, `null`, `undefined`, `nan`, `na`, `n/a`, `-`). Lo zero numerico resta nonempty.

Dimensioni persistite sull'intero mirror: `global`, `dataset`, `league` (`country/league`, oppure `unscoped` se manca lo slug), `season` (stagione salvata, oppure `unscoped`), `period` (anno civile di `match_date`, oppure `undated`), `normalized` (somma dei campi sorgente quando nessuna versione contiene due chiavi della stessa normalized field). Non è un censimento team × campo. La dimensione `team` è solo un campione: le 3 squadre con più partite già salvate e i campi `Home`, `Date`, `Match_ID`. Le righe today senza `country_slug` non entrano nel campione. Il campione non va letto come coverage di tutte le squadre.

La classe di densità è una sola, sul globale e sul normalizzato: `always-empty` se nonempty è 0; `dense` se `nonempty * 10 >= rows * 9`; altrimenti `sparse`. I tag di scope sono aggiuntivi e solo se il predicato è vero: `league-specific` se le leghe con slug in cui il campo compare sono meno di tutte le leghe con slug che hanno partite; `season-specific` se il campo non ha alcuna lega con slug oppure manca da almeno una stagione salvata di una lega in cui compare; `newly-introduced` se, in ogni lega in cui compare, la prima stagione è successiva alla prima stagione salvata di quella lega ed è ancora presente nell'ultima; `deprecated-field` se manca dall'ultima stagione salvata di ogni lega in cui compare. Un campo che inizia tardi solo in una parte delle sue leghe non riceve `newly-introduced`. I numeri reali stanno nel commento della PR, non qui.

Il gate `phase5` confronta i conteggi interi di global, dataset, league, season e period scritti con `jsonb_each_text` con un secondo passaggio `jsonb_object_keys` sullo stesso payload. Tolleranza zero. Il normalizzato si riconcilia sulla somma di quel secondo passaggio. Il campione team si riconcilia a parte, sempre con tolleranza zero, e il gate rifiuta un censimento completo (`team_census` deve restare false e le righe team devono essere 9). I numeri reali stanno nel commento della PR, non qui.


### FASE 6 — registry competizione e stagione

La migrazione `013-fpt-season-registry.sql` crea `fpt_competition_season`, `fpt_season_gaps` e `fpt_season_audit`. Il job `node src/jobs/futpython-audit-phase6.mjs` le riempie dal catalogo, dagli snapshot e dalle versioni già salvate. Non riscrive i gzip e non riscarica FutPythonTrader.

Una riga di catalogo porta `internal_competition_id` (`fpt:competition:` più md5 di paese e lega), il nome canonico uguale a `league_slug` perché il catalogo non ha un nome display separato, la stagione, `provider_season` uguale all'etichetta di stagione e `provider_competition_id` nullo. `expected_match_count` resta nullo: il catalogo non contiene un totale partite, e non viene inventato. Per lo stesso motivo `historical_complete` è false e lo stato di una stagione scaricata è `AVAILABLE`, non `COMPLETE`. I 404 iniziali restano `UNAVAILABLE_404`. Gli stati persistibili sono `DISCOVERED`, `CANDIDATE`, `AVAILABLE`, `PARTIAL`, `COMPLETE`, `UNAVAILABLE_404`, `ERROR_REAL`, `DEPRECATED`, `REMOVED`.

`fields_available` e `fields_coverage` riassumono la coverage di dataset già scritta in FASE 5 (`nonempty_cells`, `scoped_cells`, `ratio`). Non è una seconda scoperta dei campi. `first_data_date` e `last_data_date` sono il minimo e il massimo di `match_date`. `prematch_available` è true solo se c'è almeno una versione storica.

`earliest_season` e `latest_season` sono la prima e l'ultima stagione osservata della lega, non un intervallo inventato. Il rilevatore di buchi registra una stagione assente solo se il passo modale fra le stagioni osservate è un anno e quel passo non è superato da un passo più largo. Un torneo ogni quattro anni non viene riempito. Un buco così trovato non è nel catalogo, quindi non è `missing_available` e non è `COMPLETE`. Una stagione futura si rappresenta con una riga `CANDIDATE` e un campionato futuro con `DISCOVERED`: entrambe hanno zero partite, `historical_complete` false e non entrano nel conteggio delle stagioni available mancanti. Il job non inserisce righe future fittizie nel catalogo reale.

`missing_available_seasons` è il numero di righe di catalogo attive con classificazione `AVAILABLE` e senza uno snapshot dataset `ingest_complete`. Il gate `phase6` richiede che quel numero sia 0, che nessun `UNAVAILABLE_404` sia `COMPLETE`, e che la funzione `fpt_known_matches(timestamp, contract, dataset)` allo stesso timestamp e allo stesso `schema_version` restituisca lo stesso conteggio. La funzione legge solo `acquired_at <= timestamp`. I numeri reali stanno nel commento della PR, non qui.


### FASE 7 — due sync incrementali

Il comando incrementale è `node src/jobs/futpython-sync.mjs`, senza `--backfill` e senza `--force`. Non rimette in coda il catalogo. Considera solo la stagione corrente (`incrementalTargets`): anno civile uguale all'anno UTC, oppure stagione `YYYY-YYYY` che contiene la data. Le stagioni storiche non vengono richieste.

Un dataset `available`, `unavailable_404` o `deprecated` con snapshot completo non produce una chiamata upstream: il ledger scrive `cache_hit`. `error` e uno snapshot `ingest_complete=false` restano richiedibili. Il catalogo e `jogos-do-dia` di oggi sono le uniche richieste di run quando ogni dataset corrente è terminale. Uno snapshot con lo stesso sha256 non viene reinserito. Una versione match con la stessa `(match_key, payload_sha256)` non viene reinserita. Non si inventa un payload cambiato. I run id, i conteggi e il ledger stanno nel commento della PR, non qui.


### FASE 8 — watchdog e Telegram

Il watchdog resta `src/jobs/data-watchdog.mjs`. Non esiste un secondo alerter. Controlla sync fermo da più di 8 ore, dataset con `last_error`, budget giornaliero/minuto (avviso a 0,7, critico a 0,9), 429 nell’ultima ora e circuit breaker sulle ultime risposte contate. Gli avvisi di nuove colonne, nuovi dataset, calo righe e regressione restano i riepiloghi già emessi dal sync, uno per categoria, non uno per riga.

`emitAlert` consegna al massimo una volta per fingerprint dentro `MATCHPILOT_ALERT_COOLDOWN_MINUTES` (default 180). La seconda occorrenza aggiorna il contatore e non rispedisce. Il resolve segna `resolved_at` e non manda un altro messaggio. Telegram, se il token e la chat sono già configurati, è outbound-only: `deleteWebhook` e nessun `getUpdates`. Un messaggio inbound non ha una route e non riceve risposta. I numeri del test, e se il messaggio unico è stato inviato, stanno nel commento della PR.

### FASE 9 — layer normalizzato, query e certificato finale (FPT-PR-09)

La migrazione `014-fpt-normalized-layer.sql` non riscrive gzip, snapshot o versioni. Aggiunge:

- **ledger richieste**: `provider`, `endpoint_family` (`dataset`, `today`, `catalog`, `other`), `latency_ms`, `deduped`, `budget_state` (`ok`/`warning`/`critical`), `budget_remaining_day`, `budget_remaining_minute`, `provider_quota_remaining`. Una chiamata identica già in volo scrive una riga `deduped` e non va upstream. `provider_quota_remaining` è valorizzato solo se FutPythonTrader manda `x-ratelimit-remaining` o `ratelimit-remaining`. Le righe precedenti alla migrazione hanno solo `endpoint_family` ricavato dal path: latenza, stato budget e quota restano nulli perché non erano misurati;
- **famiglie campo corrette**: `AH_*` ed `EH_*` sono prezzi (`market`), `Country` e `Div` sono `identity`, `Throw_Ins_*` è `set_pieces`. La famiglia ora segue sempre il codice a ogni ingest;
- **`fpt_match_facts`**: una riga per `match_key` dalla sua ultima versione, con `internal_match_id`, `internal_competition_id`, `season_id`, `home_team_id`, `away_team_id`, `provider_match_id`, `kickoff_local_time`, `home_score`, `away_score`, `result_status` (`FINAL`, `NO_RESULT`, `NOT_STARTED`) e la lineage (`version_id`, `snapshot_id`, parser/schema/transform). `kickoff_utc` resta nullo con `kickoff_tz_status=PROVIDER_TZ_UNDOCUMENTED`: FutPythonTrader non documenta il fuso di `Date`/`Time` e il fuso non viene indovinato. `provider_competition_id` resta nullo perché il catalogo non lo espone. `fpt_match_facts_at(timestamp)` ricalcola le stesse righe solo da versioni acquisite entro quel timestamp;
- **`fpt_filter_registry`**: una riga per campo della registry con tipo, operatori ammessi, copertura globale, `timing_class` e `prematch_safe`. `identity` è `PREMATCH_IDENTITY`; `market` è `PREMATCH_MARKET_UNTIMED` (prezzo pre-kickoff senza timestamp di cattura); tutte le altre famiglie sono `POSTMATCH_OUTCOME` e non sono mai sicure per un'analisi pre-match. Lo zero di un campo prezzo è `N/D` (`zero_is_missing`): il feed `jogos-do-dia` manda `0` per le quote non ancora quotate;
- **`fpt_team_links`**: le squadre delle competizioni internazionali scritte `Club (XXX)` vengono collegate alla squadra domestica solo se il nome normalizzato è identico e unico nel paese del codice. Il paese del codice è ricavato dai dati (il paese con strettamente più nomi in comune), non da una tabella scritta a mano. Gli altri casi restano separati con stato esplicito (`NO_DOMESTIC_MATCH`, `AMBIGUOUS`, `CODE_UNRESOLVED`).

La migrazione riempie le tre tabelle al boot. Il sync le riaggiorna, solo su DB, quando un run inserisce righe o campi nuovi.

Route di sola lettura, servite da Neon, che non chiamano FutPythonTrader (il modulo `src/providers/futpython/query.mjs` non importa il client):

| route | parametri |
| --- | --- |
| `GET /api/fpt/teams` | `q` |
| `GET /api/fpt/team-matches` | `team`, `before` (default oggi UTC), `limit` |
| `GET /api/fpt/team-summary` | `team`, `before`, `season` |
| `GET /api/fpt/h2h` | `team`, `opponent`, `before`, `limit` |
| `GET /api/fpt/competition-season` | `competition`, `season`, `limit` |
| `GET /api/fpt/matches` | `date`, `limit` |
| `GET /api/fpt/match` | `id` |
| `GET /api/fpt/competitions` | — |
| `GET /api/fpt/filters` | — |

Lo storico squadra e gli scontri diretti sono sempre strettamente prima di `before`: un'analisi pre-match di una partita del giorno D non vede D né i giorni successivi.

`GET /api/futpython-certificate` costruisce in background il report finale (17 sezioni: identità, catalogo, dati, integrità con rilettura completa di ogni gzip, schema, coverage, stagioni, point-in-time, entity resolution, lineage, ledger, sync incrementale, watchdog, layer normalizzato, registry filtri, query assistente, performance su Neon con `EXPLAIN (ANALYZE, BUFFERS)`). Risponde 202 finché il primo report non è pronto, poi 200 con il report in cache per 15 minuti. Il gate integrità conta `empty_payload` solo sugli snapshot di dataset storici: un feed `jogos-do-dia` senza partite è riportato a parte (`today_empty_snapshots`) perché è lo stato reale del provider. Il gate ledger richiede righe reali scritte dopo la migrazione 014, con almeno una richiesta upstream e nessun campo nuovo mancante: i test da soli non bastano. Il gate performance richiede, per ogni query, esecuzione ≤ 250 ms, righe lette ≤ 20000 e nessun Seq Scan su `fpt_match_facts`, `fpt_match_versions`, `fpt_raw_snapshots`.

Il documento `docs/futpython-certification-YYYY-MM-DD.md` si genera con `node src/jobs/futpython-certificate.mjs --from-url=<servizio>/api/futpython-certificate --out=docs/futpython-certification-YYYY-MM-DD.md`. L'esito ammesso è uno solo: `CERTIFIED`, `CERTIFIED WITH KNOWN LIMITATIONS` o `NOT CERTIFIED`. Un gate falso dà sempre `NOT CERTIFIED`. I numeri reali stanno nel documento generato e nel commento della PR, non qui.

### FASE 9 — esito reale

Il primo certificato (commit `11b1e84`, 08:54 UTC) era **NOT CERTIFIED** sul solo gate `integrity`: il feed `jogos-do-dia` del 2026-10-05 era vuoto e il gate lo contava come dataset perso. PR #49 ha corretto il gate e reso il gate ledger dipendente da righe reali dopo la migrazione 014. Il cron reale delle 10:17 UTC (run `fpt-1791195420927-282816e5`, 165 `cache_hit`, 2 upstream, 0 errori) ha scritto le prime righe con latenza e stato budget. Il report delle 10:41 UTC sul deploy `dep-db1ml36q1p3s73ffhpc0` ha 17 gate veri: **CERTIFIED WITH KNOWN LIMITATIONS**.

Limiti noti, tutti dichiarati nel certificato:

- `expected_match_count` non pubblicato dal provider: nessuna stagione è COMPLETE, solo AVAILABLE;
- fuso di Date/Time non documentato: `kickoff_utc` nullo;
- quote storiche senza timestamp di cattura (`PREMATCH_MARKET_UNTIMED`);
- quota reale del provider non nota: i tetti sono default di codice e il provider non manda header di rate limit;
- SIGTERM live del drill fra due dataset, non a metà scrittura;
- 134 squadre internazionali non collegate alla squadra domestica (133 di paesi senza campionato nel catalogo, 1 senza nome coincidente); 421 collegate;
- righe del ledger precedenti alla 014 senza latenza e stato budget;
- lo `0` delle quote del feed del giorno è N/D.

### FASE 9 — query layer per l'assistente (correzione 1 della checklist #12)

La migrazione `015-fpt-query-facts.sql` aggiunge a `fpt_match_facts` colonne tipizzate prese dal payload della stessa versione: `odd_home`, `odd_draw`, `odd_away` (da `Odd_1_FT`/`Odd_X_FT`/`Odd_2_FT`, o `Odd_H_FT`/`Odd_D_FT`/`Odd_A_FT` nel feed del giorno), `odd_over25`, `odd_under25`, `odd_btts_yes`, `favorite_side`, `favorite_odd`, `xg_home`, `xg_away`, `total_goals`. Una quota vale solo se è un decimale maggiore di 1: `0` e placeholder restano NULL (N/D). Lo xG assente resta NULL, mai 0. `facts_version` passa a `fpt-facts-2`.

Nuove route di sola lettura (nessuna chiamata a FutPythonTrader):

| route | domanda |
| --- | --- |
| `GET /api/fpt/away-matches?team=…` | ultime 20 trasferte |
| `GET /api/fpt/team-matches?team=…&venue=home\|away\|both` | ultime N partite per campo |
| `GET /api/fpt/odds-range?min=1.50&max=1.90&side=any` | favorito in un range di quota |
| `GET /api/fpt/search?…` | filtri combinati in AND: `competition`, `season`, `team`+`venue`, `from`, `before`, `fav_min`, `fav_max`, `fav_side`, `home_odd_min/max`, `over25_min/max`, `result`, `min_goals`, `max_goals`, `min_xg_total`, `phase` |
| `GET /api/fpt/xg-by-season?team=…` o `?competition=…` | xG per stagione, con `matches_with_xg` come coverage |
| `GET /api/fpt/team-matches-asof?team=…&as_of=…` | cosa sapeva MatchPilot al timestamp T (versione acquisita entro T) |
| `GET /api/fpt/league-field-coverage?field=…` | coverage di un campo per lega e stagione |
| `GET /api/fpt/leagues-with-coverage?field=…&min_ratio=…&min_seasons=…` | leghe con almeno N stagioni AVAILABLE con coverage sufficiente |
| `GET /api/fpt/catalog` | catalogo leggibile dalle macchine di tutte le query, per MatchPilot Copilot (#44) |

Ogni valore è un parametro SQL: nessun input entra nel testo della query. Lo storico è sempre strettamente prima di `before`. Le stagioni "complete" non esistono (il provider non pubblica il numero atteso di partite): `leagues-with-coverage` conta le stagioni AVAILABLE.

Il gate di performance del certificato misura su Neon, con `EXPLAIN (ANALYZE, BUFFERS)`, 15 query (le 7 di prima più trasferte, range quote, xG per squadra e per competizione, ricerca con 8 filtri, point-in-time, coverage per lega/stagione, leghe con coverage). Il gate richiede almeno 5 filtri combinati, esecuzione ≤ 250 ms, righe lette ≤ 20000 e nessun Seq Scan sulle tabelle grandi. La sezione assistente del certificato controlla le righe restituite: 20 trasferte tutte in trasferta, quote dentro il range, xG con coverage, ricerca coerente con ogni filtro, point-in-time ripetibile e vuoto prima del mirror, nessuna data oltre il cut-off, 0 chiamate upstream. I numeri reali stanno nel commento della PR.

### FASE 9 — registry dei filtri completa (correzione 2 della checklist #12)

La migrazione `016-fpt-filter-registry-complete.sql` completa `fpt_filter_registry` con: `source` (`fpt_match_facts.<colonna>` se il campo ha una colonna tipizzata, altrimenti `fpt_match_versions.payload`), `fact_column`, `indexed` e `index_names`, `first_seen` / `last_seen` (dalla schema registry), `phases` (`HISTORICAL` se il campo compare in uno snapshot di dataset, `PREMATCH` se compare nel feed del giorno, letto dagli header raw). `indexed` non è dichiarato: è vero solo se in `pg_index` esiste un indice su `fpt_match_facts` con quella colonna come chiave iniziale. Un campo letto solo dal payload resta `indexed=false`. `registry_version` passa a `fpt-filters-2`. Il gate filtri del certificato richiede date, sorgente e fasi per ogni campo e flag di indice coerenti.

### FASE 9 — livelli di budget e traffico non essenziale (correzione 3 della checklist #12)

La migrazione `017-fpt-budget-levels.sql` aggiunge al ledger `budget_level` e `retry_count` e l'outcome `throttled`. I livelli seguono la #31 e si calcolano sul budget **giornaliero** (la finestra al minuto resta un limite di cadenza gestito aspettando): `NORMAL` < 50%, `ELEVATED` < 70%, `CONSERVE` < 90%, `CRITICAL` < 100%, `EXHAUSTED`.

Ogni richiesta FutPythonTrader ha uno scopo, in ordine di priorità: `today` (pre-match imminente, `jogos-do-dia`), `current_season` (risultati recenti), `backfill` (storico), `discovery` (catalogo). FutPythonTrader non ha live.

| livello | scopi ammessi |
| --- | --- |
| NORMAL, ELEVATED | tutti |
| CONSERVE | today, current_season (discovery e backfill sospesi) |
| CRITICAL | solo today |
| EXHAUSTED | nessuno |

Una richiesta non ammessa scrive una riga `throttled` e non chiama il provider; non conta come uso del budget. Il sync usa il catalogo già salvato su DB quando la discovery è sospesa (`meta.catalogSource = db:budget_<livello>`). Un dataset rimandato resta nello stato precedente, non diventa `error`, e il run successivo lo riprende. `retry_count` è derivato da `attempt` anche per le righe storiche; `budget_level` resta NULL dove non era misurato. Il certificato conosce l'outcome `throttled` (non è un outcome sconosciuto) e mostra le righe per `budget_level`. Il circuit breaker, al riavvio, legge solo i tentativi reali verso il provider (`upstream`, `429`, `error`): una cache hit, un dedup o un rinvio non azzerano la serie di errori.

### FASE 9 — onboarding di nuove leghe e stagioni (correzione 4 della checklist #12)

La migrazione `018-fpt-onboarding.sql` crea `fpt_onboarding` (una riga per dataset) e `fpt_onboarding_events` (traccia append-only di ogni passaggio e di ogni promozione). Tutto ciò che era nel catalogo alla migrazione è **baseline** `ACTIVE`, coperto dal certificato del 2026-10-05.

Un dataset che il catalogo elenca per la prima volta segue, a ogni sync, i passi della #12:

| passo | controllo |
| --- | --- |
| `DISCOVERED` | nuova voce del catalogo |
| `CANDIDATE` | voce attiva, chiave e route valide |
| `METADATA_FETCHED` | `internal_competition_id`, forma della stagione, riga in `fpt_dataset_state` |
| `SEASONS_ENUMERATED` | stagioni della lega elencate, buchi di anni annotati |
| `BACKFILLED` | snapshot raw completo e `available` (un 404 resta fermo con motivo `unavailable_404`) |
| `SCHEMA_AUDITED` | ogni colonna registrata in `fpt_schema_fields` con una famiglia |
| `COVERAGE_AUDITED` | coverage per campo del dataset; `Date`, `Home`, `Away` al 100% |
| `HARD_VERIFIED` | righe raw = righe DB, nessuna data fuori stagione, squadre risolte, nessuna chiave duplicata |
| `ACTIVE` | in produzione |

**Solo i dataset `ACTIVE` entrano in `fpt_match_facts`**, cioè nel layer che leggono il sito e l'assistente. Raw e versioni vengono comunque salvati: il raw resta la fonte di verità ed è ciò che gli audit controllano.

Promozione:
- una **nuova stagione di una lega già attiva** diventa `ACTIVE` da sola quando è `HARD_VERIFIED`, ed entra nei facts nello stesso run;
- una **nuova lega** si ferma a `HARD_VERIFIED` e aspetta l'owner:

```bash
node src/jobs/futpython-onboarding.mjs --status
node src/jobs/futpython-onboarding.mjs --promote=<paese>/<lega> --by=<chi> --reason=<perché>
```

La promozione richiede attore e motivo e rifiuta una lega con stagioni non verificate; le stagioni 404 restano fuori. Il comando lavora solo sul DB, non chiama FutPythonTrader. L'agente non promuove leghe senza autorizzazione esplicita dell'owner.

Comportamento del sync:
- **Stagioni passate di una lega nuova:** vengono scaricate dal sync incrementale come traffico `backfill` (sospeso per primo dai livelli di budget), massimo `FUTPYTHON_ONBOARDING_PER_RUN` (default 10) per run.
- **Squadre:** l'identità della lega nuova è additiva. Uno spelling nuovo si aggancia alla squadra del paese con lo stesso nome normalizzato; un nome mai visto diventa una squadra nuova. Gli id esistenti non vengono riscritti.
- **Alert** sulla stessa chat Telegram:
  - `ONBOARDING_OWNER_PROMOTION` (info) per le leghe in attesa;
  - `ONBOARDING_BLOCKED` (warning) per i dataset fermi per un motivo reale. Il 404 non genera alert.
- **Route di sola lettura:** `GET /api/fpt/onboarding` risponde a "quali nuove leghe sono state scoperte ma non ancora verificate?".

Il certificato ha un gate in più (`onboarding`, sezione 18). Richiede:
- ogni voce del catalogo tracciata;
- nessun fact da dataset non `ACTIVE`;
- nessuna nuova lega `ACTIVE` senza promozione dell'owner;
- nessuna riga senza evento.

Il gate dei facts conta solo i dataset in produzione.

Limite noto: le righe del feed `jogos-do-dia` non portano lo slug di lega del catalogo (`internal_competition_id` nullo), quindi l'onboarding agisce sui dataset del catalogo, non sul feed del giorno.

### FASE 9 — riconciliazione compatibile con #31 (correzione 5 della checklist #12)

**Problema reale trovato prima di questa correzione.** Il sync incrementale non riscaricava mai un dataset della stagione corrente già `available`: ogni cron era una serie di `cache_hit`. Su Neon, il 2026-10-05, i 165 dataset correnti erano fermi al primo ingest del 2026-10-04 16:18 UTC, e la partita più recente nel mirror era del 2026-09-28.

La migrazione `019-fpt-reconciliation.sql` aggiunge strutture con i nomi della #31, indipendenti dalla sorgente (TotalCorner le potrà usare):
- **`data_checkpoints`**: un checkpoint per pipeline (`catalog`, `incremental`, `backfill`, `today`, `current_season`) con `last_attempt_at`, `last_success_at`, `last_acquired_at`, `last_entity_id`, `checkpoint`, `status`, `retry_count`. Il checkpoint scritto a fine sync (`post_run`) usa l'esito finale del run stesso (`complete`/`partial`/`failed`), non `running` (correzione dopo il cron reale delle 22:17 UTC del 2026-10-05, che mostrava `last_status: running` fino al ciclo orario successivo);
- **la vista `fpt_dataset_checkpoints`**: il checkpoint per dataset, che è già `fpt_dataset_state`;
- **`data_reconciliation_ledger`**: un gap per riga, dalla rilevazione al recupero o alla classificazione. Stati: DETECTED, QUEUED, RECOVERING, RECOVERED, PARTIAL, UNRECOVERABLE, FAILED. Al massimo una riga aperta per entità.

| gap FutPython (#31) | priorità | azione |
| --- | --- | --- |
| `incremental_sync_skipped` (nessun sync incrementale riuscito da `FUTPYTHON_INCREMENTAL_MAX_GAP_HOURS`, default 7) | P1 | run di recupero (`kind=recovery`) nello stesso processo, dietro lo stesso lock |
| `interrupted_run` (run interrotto non seguito da un run concluso) | P1 | ripreso dal run successivo |
| `current_season_stale` (stagione corrente non riscaricata da `FUTPYTHON_CURRENT_SEASON_TTL_HOURS`, default 24) | P1 | refresh forzato, massimo `FUTPYTHON_REFRESH_PER_RUN` (default 50) per run |
| `never_attempted`, `available_without_snapshot`, `failed_dataset`, `missing_season` | P2 | download forzato, massimo `FUTPYTHON_RECOVERY_PER_RUN` (default 10) per run |
| `regression_404`, `season_not_published` | P2/P3 | classificati `UNRECOVERABLE`: il provider non serve più o non ha mai pubblicato quei dati, nessun valore inventato |

Ciclo di riconciliazione:
- **Quando gira:** all'avvio (+30 s) e ogni ora, nello stesso ciclo del watchdog. Non c'è un timer da 5 minuti: FutPython cambia al massimo ogni 6 ore e un controllo ogni 5 minuti terrebbe sveglio Neon.
- **All'avvio:**
  - un run rimasto `running` viene marcato interrotto, solo se nessun processo tiene il lock del sync;
  - poi rileva i gap, aggiorna il ledger, chiude come RECOVERED ciò che è sparito (o UNRECOVERABLE se il provider risponde 404), scrive i checkpoint e manda gli alert aggregati `RECON_GAPS` / `RECON_FAILED` sulla stessa chat. Il refresh quotidiano delle stagioni correnti è manutenzione ordinaria: genera l'alert solo se un refresh resta in coda per più di 24 ore.
- **Recupero nel sync incrementale:** i gap in coda viaggiano nel normale sync incrementale e passano dai livelli di budget di #83 (in CRITICAL un refresh viene rinviato e non conta come tentativo). Il run che li ha tentati li giudica.
- **Gap fallito:** dopo `FUTPYTHON_RECOVERY_MAX_ATTEMPTS` (default 3) tentativi un gap diventa FAILED e viene ritentato una volta ogni `FUTPYTHON_RECOVERY_RETRY_HOURS` (default 24).
- **Idempotenza:** stesso payload = nessuno snapshot, versione o fact in più. Stesso gap = nessuna riga nuova nel ledger.

Il controllo raw = DB del certificato (sweep), il campione della fase 3 e il controllo `rowGaps` ora cercano ogni riga del raw (chiave + hash del payload) fra le versioni del dataset, da qualunque snapshot. Il vecchio confronto con le sole versioni scritte da quello snapshot passava solo perché nessun dataset era mai stato riscaricato: con il refresh il primo snapshot aggiornato avrebbe fatto fallire il gate `integrity`. Il test della riconciliazione lo prova con la versione vecchia (fallisce) e con quella nuova (passa).

Il lock del sync è ora per schema (`pg_try_advisory_lock(76420311, hashtext(current_schema()))`): in produzione resta un solo lock (`public`), mentre i test su schemi isolati non si bloccano più a vicenda.

Altri punti:
- **Route di sola lettura:** `GET /api/fpt/reconciliation` (gap per tipo, priorità e stato).
- **Certificato, gate 19 `reconciliation`:** richiede checkpoint delle 5 pipeline aggiornati da meno di 2 ore, nessun gap FAILED e nessun gap recuperabile aperto da più di 48 ore.
- **Traffico:** il refresh delle stagioni correnti aggiunge traffico verso FutPythonTrader, circa 165 richieste al giorno con i default, distribuite su 4 cron. Resta sotto i tetti di codice (`FUTPYTHON_REQUESTS_PER_DAY` 2000) e viene rinviato per primo sotto pressione di budget.

### FASE 9 — policy di versionamento parser/schema e rielaborazione (correzione 6 della checklist #12)

Policy (vincolante):
1. **Il raw è la fonte di verità ed è append-only.**
   - La migrazione `020-fpt-raw-retention-reprocessing.sql` installa un trigger su `fpt_raw_snapshots`: il contenuto di uno snapshot non cambia mai, si può solo impostare `ingest_complete`.
   - Una cancellazione è rifiutata, salvo autorizzazione esplicita dell'owner nella sessione (`matchpilot.raw_delete_authorization`). In quel caso resta una riga in `fpt_raw_retention_log`.
2. **Ogni versione porta la sua lineage in modo esplicito** (`source_provider`, `parser_version`, `schema_version`, `transform_version` da `LINEAGE_VERSIONS`), non più dai default delle colonne.
3. **Un cambio di parser o di trasformazione:**
   - si dichiara alzando la versione in `LINEAGE_VERSIONS`;
   - si misura con un dry run;
   - si applica con una rielaborazione registrata.
4. **La rielaborazione:**
   - non sovrascrive e non cancella mai: una riga con un output diverso diventa una **nuova versione**, con la nuova lineage e l'`acquired_at` dello snapshot originale (la linea temporale point-in-time resta quella reale);
   - la versione vecchia resta per l'audit;
   - i facts seguono l'output più recente.
5. **Ogni esecuzione** (dry run o apply) è una riga di `fpt_reprocessing_runs`: attore, motivo, versioni, righe invariate/nuove, versioni inserite, versioni prima e dopo. Il confronto vecchio/nuovo campo per campo sta in `fpt_reprocessing_diffs`.
6. **Idempotenza:** la stessa rielaborazione ripetuta non inserisce nulla.

```bash
node src/jobs/futpython-reprocess.mjs --by=<chi> --reason=<perché> [--dataset=<chiave>]          # dry run
node src/jobs/futpython-reprocess.mjs --apply --by=<chi> --reason=<perché> [--dataset=<chiave>]  # apply
```

Il comando lavora solo sul DB, non chiama FutPythonTrader. L'agente non lancia `--apply` in produzione senza autorizzazione dell'owner.

Certificato, gate 20 `reprocessing`:
- lo sweep del raw (che già decomprime ogni gzip) ri-parsa ogni riga con il parser corrente e richiede che esista come versione: una rielaborazione completa con il parser attuale sarebbe un no-op;
- richiede anche il trigger installato e nessun run fallito non seguito da un run riuscito.

Test `test/fpt-reprocessing.test.mjs`, con un cambio di parser simulato (v2 rimuove gli spazi):
- il dry run misura la differenza (`Home: "Ajax " → "Ajax"`) senza scrivere;
- l'apply aggiunge una versione `fpt-csv-2` e lascia intatta la vecchia;
- i facts seguono il nuovo output;
- ripetere l'apply inserisce 0 versioni;
- il raw resta identico byte per byte, e modifica o cancellazione senza autorizzazione vengono rifiutate.

### FASE 9 — pagina Data Coverage → Competizioni (gate del catalogo #12)

**`GET /coverage`** è una pagina HTML server-side, senza JavaScript, che non chiama FutPythonTrader. Mostra una riga per lega:
- paese, lega, provider;
- prima e ultima stagione con dati;
- stagioni con dati su stagioni elencate e stagioni in 404;
- partite;
- stato derivato dal catalogo: `AVAILABLE` se la lega ha partite in produzione, altrimenti `ONBOARDING`, `ERROR`, `UNAVAILABLE_404` (tutte le stagioni in 404) o `NO_DATA`;
- coverage delle quote 1X2 (partite con tutte e tre le quote) e degli xG (partite con xG di casa e di trasferta);
- buchi di stagione (`fpt_season_gaps`);
- stagioni ancora in onboarding;
- colonna overlap FPT/TC.

Filtri: paese, stagioni minime, partite minime, coverage quote minima.

**Drill-down** `GET /coverage?country=<paese>&league=<lega>`: per ogni stagione disponibilità, classificazione, stato di onboarding, partite, prima e ultima partita, coverage quote e xG, numero di campi, ultimo download, e le stagioni non pubblicate segnate come buco.

**Route JSON di sola lettura:** `GET /api/fpt/coverage-competitions` e `GET /api/fpt/coverage-seasons`. Gli slug sono validati e ogni filtro è un parametro SQL.

Limiti dichiarati nella pagina:
- `COMPLETE/PARTIAL` non sono calcolabili, perché il provider non pubblica il numero atteso di partite;
- **overlap FPT/TC** e **live** non sono disponibili finché TotalCorner (#20) non è integrato: i filtri sono presenti ma disattivati.

### FASE 1 — resume drill e budget richieste (testo della PR, prima del merge)

**Stato al momento della PR, prima del merge.** Il kill live e la verifica post-merge sono nella sezione precedente. Questo paragrafo non va letto come lo stato attuale.

Il kill live su Render **non è stato eseguito** in questa PR. Non è stato chiamato FutPythonTrader reale. Non sono state cambiate le variabili d'ambiente del servizio, non è stato fatto un deploy e non è stato avviato un backfill di produzione. `FUTPYTHON_BACKFILL_ON_START` e `FUTPYTHON_PHASE1_VERIFY_ON_START` non vanno toccati e restano disattivi.

Cosa cambia nel codice:

- uno snapshot non è visibile, e il dataset non diventa `available`, finché snapshot e righe match non sono committati nella stessa transazione. Uno snapshot `ingest_complete=false` non viene sigillato dallo short-circuit sull'hash: il resume finisce le righe mancanti. Gli snapshot già presenti vengono marcati completi dalla migrazione `007`, perché il backfill terminale li ha già chiusi;
- il backfill di default continua a saltare `available`, `unavailable_404`, `deprecated` e `unknown` con snapshot completo. `error` resta ritentabile. Non si cancellano snapshot né versioni e il drill non azzera `last_snapshot_id`;
- SIGTERM/SIGINT fra un dataset e il successivo chiude il run `running` come `partial` con `meta.interrupted=true` prima dell'uscita. Un SIGKILL non è intercettabile: il run successivo riconcilia ancora i `running` rimasti;
- il client è cache-first, deduplica le chiamate identiche in corso, rispetta un budget al minuto e al giorno, limita il backfill a un ritmo più basso, cede il passo a un hold `critical`, onora `Retry-After` sui 429, usa backoff con jitter e un tetto di tentativi, e apre un circuit breaker dopo errori ripetuti (5xx/rete/429, non i 404). Il ledger `fpt_request_ledger` non salva la API key né l'URL completa. Il browser non chiama FutPythonTrader e non esiste un proxy verso il provider.

Limiti, non presentati come piano del fornitore:

- default conservativi di codice, da sostituire quando l'owner conosce la quota reale: `FUTPYTHON_REQUESTS_PER_MINUTE` 20, `FUTPYTHON_REQUESTS_PER_DAY` 2000, `FUTPYTHON_BACKFILL_REQUESTS_PER_MINUTE` 8, `FUTPYTHON_MAX_ATTEMPTS` 4;
- un successo già persistito non viene riscaricato. Se la risposta è nel ledger ma lo snapshot non è committato, una nuova GET è ammessa: non si sigilla un buco;
- catalogo e `jogos-do-dia` restano richieste di run, non dataset terminali;
- il drill accetta al massimo 5 chiavi esplicite. Non è stato scelto un elenco di produzione oltre agli esempi già deduplicati in PR #33.

Comando one-off per il processo che l'owner lancerà su Render **dopo il merge di questa PR**, nello shell del servizio, senza modificare le env del servizio e senza `--force`:

```bash
node src/jobs/futpython-sync.mjs --resume-drill-requeue=australia/a-league/2020-2021,austria/bundesliga/2020-2021
FUTPYTHON_SYNC_DELAY_MS=5000 node src/jobs/futpython-sync.mjs --backfill
# SIGTERM a quel processo dopo la prima GET di dataset e prima che esca
node src/jobs/futpython-sync.mjs --backfill
```

Il delay di 5 secondi vale solo per quel processo, così il SIGTERM cade fra i due dataset. Poi il terzo comando riprende solo le chiavi non terminali. Le chiavi sono un esempio già verificato in dedup; l'owner può sostituirle con al massimo cinque chiavi di catalogo. Questo comando non è stato eseguito contro Neon/Render in questa PR.

### Contratto operativo agenti

`CLAUDE.md` e `AGENTS.md` sono sincronizzati con la issue **#12 FPT-CERT**.

Per il lavoro FutPythonTrader:
- una PR alla volta;
- README aggiornato in ogni PR;
- CI verde non basta;
- test reali Render/Neon obbligatori;
- evidenza reale prima del merge/chiusura fase;
- nessuna checklist anticipata;
- `CLOSED / CERTIFIED` solo dopo tutti i gate della #12.
- una review AI (CodeRabbit, Codex o altre) ferma per rate limit, quota o limite del piano non si aspetta: si annota il motivo nella PR e si procede con CI verde, test ed evidenza reale; i finding già pubblicati restano da risolvere.

Per ogni PR, non solo FutPythonTrader: leggere #97, indicare fase e owner di dominio, dichiarare la superficie tool/API e i test, e rispondere alla domanda sul mock (SÌ / NO). Le regole complete sono in CLAUDE.md e AGENTS.md.


## TotalCorner — certificazione #20

L'integrazione completa TotalCorner è governata dalla issue **#20 — TC-CERT**.

Obiettivi:
- mapping verificato solo sui campionati comuni FutPythonTrader ↔ TotalCorner;
- mirror pre-match dei mercati;
- collector live continuo;
- snapshot temporali di statistiche, eventi e quote;
- archivio storico live proprietario;
- replay deterministico;
- coverage per campo;
- rate limiting/retry/recovery;
- alert nella stessa chat Telegram già usata da FutPythonTrader;
- certificato finale.

Regola: **TotalCorner non può essere dichiarato CLOSED/CERTIFIED finché tutti i gate hard reali della #20 non sono passati.**

### TC-CORE-01 — contratto provider, discovery, raw lossless (#104)

Stato: **IMPLEMENTED, TESTED**. **HARD VERIFIED REAL: in corso** (evidenza del run reale nella #20). Nessun collector, nessuna promozione nel core.

- **Client** (`src/providers/totalcorner/client.mjs`):
  - un solo rate limiter: default 4 richieste ogni 10 s. Il limite osservato upstream è di 5 richieste in 10 secondi, ed è configurabile con `TOTALCORNER_MAX_REQUESTS_PER_WINDOW` e `TOTALCORNER_RATE_WINDOW_MS`;
  - retry limitati: massimo 2. Su 429 o `TOO_MANY_REQUEST` la pausa è globale, di almeno 10 s;
  - classificazione degli esiti: `ok`, `no_data`, `rate_limited`, `auth`, `not_found`, `bad_request`, `server_error`, `timeout`, `network`, `malformed`, `upstream_error`.
  - Il token `TOTALCORNER_API_TOKEN` viaggia solo nell'URL in uscita. Non viene mai scritto in DB o log, e la chiave della richiesta lo esclude.
- **Migrazione** `021-tc-core-discovery.sql`:
  - `tc_raw_responses`: body conservato byte per byte, comprese le risposte d'errore, con sha256. È deduplicato per richiesta + hash, con `seen_count` e `first/last_acquired_at`. Contiene inoltre fase, provenance, `schema_version` e `parser_version`;
  - `tc_request_ledger`: un record per ogni tentativo upstream, con esito, HTTP, latenza, backoff, header di rate limit e id del raw;
  - `tc_schema_registry`: famiglia endpoint × fase × percorso campo, con tipi, `rows_seen`, `nonnull_seen`, `first_seen`, `last_seen` e valore campione;
  - `tc_discovery_runs`.
- **Discovery** (`src/jobs/totalcorner-discovery.mjs`, versione `tc-core-01-v1`). Parte al boot del servizio core se il token è presente e la versione non è già completa. È protetta da advisory lock e gira una volta sola; `TOTALCORNER_DISCOVERY_ON_BOOT=false` la disattiva. Interroga:
  - `/match/today` (upcoming, inplay ed ended, con e senza `columns`);
  - `/match/schedule`: il formato data viene provato, poi interroga oggi, +1, −1, −7, −30 e −365 giorni;
  - per un campione di partite di leghe diverse e in tutte le fasi, compreso lo storico a −30 e −365 giorni: `/match/view/{id}`, `/match/odds/{id}` (con `bttsList`) e `/match/bookmaker_odds/{id}`;
  - il movimento per bookmaker su Pinnacle, Betfair, 1xBet, Bwin e SNAI (Pinnacle con 1X2, Asian, Goal e Corner);
  - `/league/table/{id}` (table, corner, card) e `/league/schedule/{id}`.
- **Nel riepilogo della discovery**:
  - esiti per famiglia;
  - prova empirica del fuso del campo `start`;
  - campi presenti solo nel dettaglio e non nelle liste;
  - campi `btts`;
  - bookmaker restituiti.
- **NULL e assenze.** Un NULL non significa assenza upstream: le liste vengono confrontate con il dettaglio, e nessun campo è dichiarato assente sulla base di un solo endpoint.
- **API di sola lettura:** `GET /api/tc/discovery` e `GET /api/tc/schema-registry?endpoint_family=&phase=`.

**Evidenza reale TC-CORE-01** (run 1, 08/10/2026, nella #20). Esito: **PASS WITH KNOWN LIMITATIONS**.
- 100 richieste, tutte `ok`, nessun 429; 100 risposte grezze, 1.346 righe di registry, nessun token.
- `bookmaker_odds` ha restituito tutti i 18 bookmaker dichiarati (open, close, inplay e movimento per bookmaker).
- I campi BTTS reali sono `p_btts`/`po_btts` nelle liste e `btts_list` in `/match/odds`.
- I timestamp TotalCorner sono in **UTC+2**, non UTC.
- Le liste sono paginate (30 righe per pagina).

### TC-CORE-02 — mapping competizioni FPT ↔ TotalCorner (#104)

Stato: **IMPLEMENTED, TESTED**. **HARD VERIFIED REAL: in corso** (evidenza nella #20).

- **Migrazione** `022-tc-competition-mapping.sql`:
  - `competition_mapping` con le colonne del contratto #20. Il vincolo `UNIQUE` su `(futpython_country_slug, futpython_league_slug)` e l'indice unico sulla lega TotalCorner per le righe VERIFIED attive impediscono i duplicati;
  - `tc_competitions`: tutte le leghe TotalCorner viste, mappate o no; è la lista di quelle fuori sovrapposizione;
  - `tc_mapping_runs`.
- **Metodo `fixture-overlap-v1`** (`src/providers/totalcorner/mapping.mjs`). Il mapping si basa sulle partite reali, non sui nomi di lega:
  - si prendono le date più ricche di partite FPT degli ultimi 30 giorni e si legge il calendario TotalCorner degli stessi giorni, tutte le pagine;
  - la data TotalCorner viene convertita in UTC con l'offset misurato, configurabile con `TOTALCORNER_TZ_OFFSET_MINUTES`, default 120;
  - una partita FPT e una TotalCorner si accoppiano se la data differisce di al massimo ±1 giorno e i nomi delle squadre sono simili: accenti, sigle di club e sinonimi normalizzati, similarità = max(Jaccard sulle parole, Dice sui trigrammi).
- **Stati del mapping:**
  - **VERIFIED**: almeno 3 partite accoppiate, almeno il 50% delle partite FPT coperte, la seconda lega TotalCorner candidata con al massimo il 25% delle partite della prima, e corrispondenza univoca anche nel verso TotalCorner → FPT;
  - **AMBIGUOUS**: la stessa lega TotalCorner copre più competizioni FPT, ad esempio i gironi, oppure ci sono due candidate vicine;
  - **CANDIDATE**: poche partite accoppiate;
  - **UNMAPPED**, con il motivo: nessuna partita FPT nella finestra, oppure nessuna corrispondenza TotalCorner.
  - Ogni stato salva l'evidenza: partite accoppiate (campione), coperture, seconda candidata e conflitti inversi.
- **Uso nel core.** Solo le righe **VERIFIED** potranno alimentare i collector, nessuna promozione automatica fuori dalla sovrapposizione. Dopo il mapping, la discovery dei campi viene ripetuta sulle sole leghe VERIFIED (famiglie `verified_*`).
- **Esecuzione.** Il job gira una sola volta per versione (`tc-core-02-v1`) dopo la discovery, sullo stesso rate limiter condiviso. Si disattiva con `TOTALCORNER_MAPPING_ON_BOOT=false`.
- **API di sola lettura:** `GET /api/tc/mapping?status=`.

**Evidenza reale run 1 (`tc-core-02-v1`, 08/10/2026, nella #20).** Esito: gate quantitativi PASS.
- 652 richieste, tutte `ok`.
- 2118 partite FPT confrontate con 18.298 partite TotalCorner in 708 leghe, per 2040 coppie.
- **92 VERIFIED** in 51 paesi, 39 con nomi diversi tra i provider; 4 AMBIGUOUS, 1 CANDIDATE, 88 UNMAPPED con motivo; 0 duplicati.
- Le 4 AMBIGUOUS sono leghe giovanili o riserve di TotalCorner con gli stessi nomi di squadra delle prime squadre: Liga MX contro Mexico U21, Super Lig contro Türkiye U19, Greek Super League contro U19, Primera paraguaiana contro Reserve.

**v2 (`tc-core-02-v2`, metodo `fixture-overlap-v2`):**
- una partita si accoppia solo con una lega TotalCorner della stessa categoria: senior, youth (U15–U23), reserve o women;
- le pagine di calendario dei giorni passati da almeno due giorni si rileggono **cache-first** dal raw salvato. Ogni lettura da cache è registrata nel ledger come `cache_hit`, senza nuove richieste upstream.

### TC-CORE-03 — mercati, linee e PIT pre-match (#104)

Stato: **IMPLEMENTED, TESTED**. **HARD VERIFIED REAL: in corso** (evidenza nella #20).

- **Migrazione** `023-tc-prematch.sql`:
  - `tc_matches`: le partite delle sole leghe con mapping **VERIFIED**. Per ognuna l'orario provider, l'offset usato, `kickoff_utc` e il collegamento alla competizione FPT;
  - `tc_prematch_snapshots`: una riga per ogni acquisizione fatta prima del kickoff. Il vincolo `CHECK (acquired_at < kickoff_utc)` rende impossibile salvare come PREMATCH uno snapshot preso al kickoff o dopo;
  - `tc_market_rows`: righe di mercato normalizzate, ognuna salvata una sola volta (`UNIQUE` su partita, sorgente, mercato, periodo, tipo e hash della riga). Le righe già note aggiornano solo `last_acquired_at` e `seen_count`;
  - `tc_prematch_runs`.
- **Fonti** (`src/providers/totalcorner/prematch.mjs`):
  - `/match/odds`: lo storico movimenti di TotalCorner, con fonte `consensus`. Mercati 1X2, Asian Handicap, Goal Line, Corner Line e BTTS, sia FT sia HT, con linea, quote, orario provider e punteggio della riga;
  - `/match/bookmaker_odds`: le quote open, close e inplay per bookmaker, con fonte `bookmaker:<slug>`.
- **Regola PIT.** Una riga è PREMATCH solo se non ha il minuto in-play e il suo orario provider, convertito in UTC, è **strettamente prima** del kickoff schedulato. Le altre righe non entrano mai nel PREMATCH:
  - INPLAY: righe con il minuto, e tutte le quote `inplay` dei bookmaker;
  - QUARANTINE con motivo: righe senza minuto ma con orario uguale o successivo al kickoff (dato reale: righe `minute=null` a 00:13 su un kickoff alle 00:00, e `close` dei bookmaker a kickoff+30 s), oppure righe con orario illeggibile.
- **Provenance:**
  - `PREMATCH_CAPTURED`: la riga è stata acquisita da MatchPilot prima del kickoff;
  - `HISTORICAL_UPSTREAM`: la riga è pre-kickoff ma è stata acquisita dopo, dallo storico del provider;
  - `LIVE_UPSTREAM`: la riga è in-play.
- **Collector** (`src/jobs/totalcorner-prematch.mjs`):
  - ogni `TOTALCORNER_PREMATCH_INTERVAL_MS` (default 5 min) legge la lista `upcoming` e tiene solo le leghe VERIFIED con kickoff entro `TOTALCORNER_PREMATCH_HORIZON_HOURS` (default 36);
  - scarica `/match/odds` con cadenza adattiva: ogni 180 min oltre 6 h dal kickoff, 60 min tra 1 e 6 h, 15 min nell'ultima ora, 5 min negli ultimi 15 minuti. Dopo il kickoff non scarica più;
  - scarica `/match/bookmaker_odds` ogni 360, 120 o 30 minuti con le stesse fasce;
  - usa lo stesso rate limiter condiviso e un advisory lock. Se il token risulta non valido o scaduto (`auth`), sospende i cicli per `TOTALCORNER_AUTH_PAUSE_MS` (default 30 min). Si disattiva con `TOTALCORNER_PREMATCH_ENABLED=false`.
- **Gate del fuso provider (`tc-tz-gate-v2`, migrazioni `024-tc-tz-observations.sql` e `025-tc-tz-inliers.sql`).** Gli orari TotalCorner sono locali del provider. UTC+2 è stato misurato l'08/10, ma non viene dato per scontato: il cambio d'ora o un cambio del provider non devono mai spostare in silenzio il cutoff PIT.
  - Quando non esiste una misura `MEASURED` più recente di `TOTALCORNER_TZ_CHECK_MINUTES` (default 30) il ciclo legge la lista `/match/today?type=inplay` (da 1 a 3 pagine, stesso rate limiter) e misura l'offset sulle partite al primo tempo: `start − (acquired_at − minuto)`. Le partite e-soccer o virtuali sono escluse perché il loro minuto non è tempo reale. Il valore è la mediana dei campioni concordi (entro ±10 minuti dalla mediana generale), arrotondata a 15 minuti. Servono almeno 2 campioni concordi, che siano almeno il 60% del totale: un kickoff in ritardo non blocca la misura, ma due gruppi distanti un'ora non sono una misura (`INCONSISTENT`). Versione `tc-tz-gate-v2`, migrazione `025-tc-tz-inliers.sql` (colonna `inliers`). Se la lista è troppo povera (`INSUFFICIENT`) la misura si ritenta al ciclo successivo, al massimo una volta ogni 5 minuti.
  - Ogni misura è salvata in `tc_tz_observations` (stato `MEASURED`, `INSUFFICIENT`, `INCONSISTENT` o `UNAVAILABLE`, campioni, mediana, min/max, offset, offset configurato, accordo, raw collegati).
  - Il ciclo normalizza solo se l'ultima misura `MEASURED` coincide con `TOTALCORNER_TZ_OFFSET_MINUTES` ed è più recente di `TOTALCORNER_TZ_MAX_AGE_MINUTES` (default 360). Altrimenti il ciclo è **fail-closed** (`TC_PREMATCH_TZ_HOLD`): nessuna lista, nessuna quota, nessuno snapshot e nessuna riga normalizzata con un offset non verificato. Per riprendere serve una misura che torni a coincidere, oppure l'aggiornamento esplicito dell'offset configurato.
  - `tc_prematch_runs.tz_observation_id` e `tc_matches.tz_observation_id` collegano ogni ciclo e ogni partita catturata alla misura che ne ha garantito l'offset. Il replay storico non ha una misura live (`tz_observation_id` NULL): l'offset delle date passate va verificato data per data nella card dello storico upstream (TC-CORE-03B), non assunto.
  - I cicli hanno versione `tc-core-03-v2`; il replay dal raw resta `tc-core-03-v1` e non viene ripetuto al deploy.
- **Replay dal raw.** Un replay una tantum per versione (`tc-core-03-v1`) normalizza le risposte `/match/odds` e `/match/bookmaker_odds` già salvate dalla discovery e dal mapping, solo per le leghe VERIFIED e senza richieste upstream.
- **API di sola lettura:**
  - `GET /api/tc/prematch`: run, conteggi per fase, fonte e mercato, quarantena, provenance e audit di leakage. Il leakage comprende righe PREMATCH al o dopo il kickoff, snapshot al o dopo il kickoff, duplicati e partite fuori dalle leghe VERIFIED; tutti questi contatori devono essere 0;
  - lo stesso report espone `cutoff`: match PREMATCH già oltre kickoff, ultimo snapshot e ultimo timestamp provider prima del kickoff, margini minimi e raw linkage mancanti. È una lettura Neon, non una certificazione;
  - `GET /api/tc/prematch/match?id=&as_of=&knowledge=provider|captured`: per ogni fonte, mercato e periodo, l'apertura e l'ultima quota nota a `as_of` e strettamente prima del kickoff. Con `knowledge=captured` conta solo ciò che MatchPilot aveva già acquisito a `as_of`.
- **Limiti noti:**
  - il kickoff è quello schedulato. Un ritardo d'inizio reale finisce in QUARANTINE, non in PREMATCH;
  - l'offset configurato resta un valore unico (UTC+2). Il gate non lo cambia da solo: se la misura cambia, ad esempio con il cambio d'ora, i cicli si fermano finché la misura non torna a coincidere o l'offset non viene aggiornato. È una scelta voluta: meglio non catturare che sbagliare il cutoff;
  - le righe già acquisite restano con l'offset di quando sono state acquisite. Tutte le date presenti oggi (07/10/2025 e 03/09–09/10/2026) cadono nello stesso regime di ora legale;
  - la membership TotalCorner scade l'11/10/2026 15:20:27 Europe/Rome.


## Chiusura delle issue

Le issue vengono dichiarate **CHIUDIBILI** dall'agente solo quando ogni punto del loro contenuto è implementato e verificato. L'agente deve pubblicare un commento finale con checklist ed evidenze, ma lasciare l'issue aperta.

La chiusura viene effettuata dall'owner, salvo autorizzazione esplicita data all'agente per quella specifica issue.


## Trading-first, non betting-first

MatchPilot è un **tool di trading sportivo**, non un tipster e non un motore di scommesse secche.

Il prodotto deve ragionare in termini di:
- stato del mercato;
- score vulnerabile;
- BACK/LAY;
- fair price;
- edge;
- timing di ingresso;
- conferma live;
- invalidation;
- stop;
- exit/hedge;
- rischio e stake;
- NO TRADE come risultato valido;
- post-mortem e replay.

Un pronostico 1/X/2 o Over/Under può essere un input analitico, ma non è il prodotto finale.

Benchmark GOAT del 04/10/2026: i 21 report mostrano un'impostazione orientata a trading operativo (risultato vulnerabile, frequenza lay, fair lay, rischio, conferma live, check 75', stop e stake). MatchPilot deve superare questo approccio usando dati FutPythonTrader + TotalCorner più completi e replay live persistente.
