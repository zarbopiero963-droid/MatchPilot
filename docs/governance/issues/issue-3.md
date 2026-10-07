<!-- governance-reconciliation-2026-10-07: current summary; source contracts preserved -->
## Stato corrente e coordinamento — 07/10/2026

### Gerarchia vigente

Decisioni esplicite owner (con fonte, data e scope) → **[#3](https://github.com/zarbopiero963-droid/MatchPilot/issues/3) master di prodotto/stato globale → [#97](https://github.com/zarbopiero963-droid/MatchPilot/issues/97) roadmap/fasi → [#104](https://github.com/zarbopiero963-droid/MatchPilot/issues/104) piano operativo delle PR** → contratti e gate delle issue di dominio → README / CLAUDE / AGENTS → documenti di integrazione → mock.
La gerarchia non permette a #104 di eliminare acceptance criteria di dominio o alle docs di inventare decisioni owner. I documenti di supporto e gli snapshot di questa PR non sono una quarta master. Il piano proposto nell'audit non è stato approvato come nuova roadmap.

### Prossima attività unica / autorizzazione corrente

L'owner il **07/10/2026 alle 15:23 Europe/Rome** ha autorizzato **una sola PR documentale/governance**, dopo il PASS del punto 9 della #40, e ha vietato il merge automatico.
**Prossima azione: owner review e autorizzazione al merge della PR governance.**
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

### Rischio aperto PIT / parser / identità / reprocessing FPT — #12

Contratto vigente: **stesso timestamp T + stesso data contract version → stesso risultato riproducibile**, usando soltanto dati disponibili a T; nessuna riscrittura silenziosa.
Evidenza tecnica su main `5b39f33`:
- `src/providers/futpython/reprocess.mjs::reprocessRaw` inserisce nuovo output parser con l'`acquired_at` dello snapshot originale;
- `migrations/014-fpt-normalized-layer.sql::fpt_match_facts_at` seleziona `acquired_at <= T` e ordina anche per `version_id DESC`, senza argomento di versione parser/data-contract; `fpt_match_facts` segue l'output più recente;
- `test/fpt-reprocessing.test.mjs` prova dry-run/apply/idempotenza/raw intatto e facts aggiornati, ma non certifica invariabilità di una stessa query storica prima/dopo cambio parser/identity mapping.

Il dry-run no-op certificato il 05/10 non dimostra questo caso. Registrare in #12: data disponibile/osservata a T, snapshot ID/hash, versione parser/schema/transform/data-contract, identità e mapping/versioni, reprocessing run/time, output e test **prima e dopo la correzione**. Test richiesti: T anteriore/posteriore a ingest/correzione, parser v1/v2, rename/alias/cambio ID, aggregati senza futuro, riproduzione delle versioni storiche e raw immutato. **RISCHIO APERTO**, nessuna correzione runtime qui. La scelta non registrata tra replay “come conosciuto allora” e ricostruzione col parser nuovo è **OPEN / OWNER DECISION REQUIRED**; il requisito di riproducibilità resta vincolante. Apply produzione e cancellazione raw richiedono autorizzazione specifica owner.

---

## Contratto dettagliato conservato

Requisiti, test e acceptance criteria sotto restano validi dove non contraddetti dalle decisioni vigenti sopra. **SUPERSEDED** riguarda le indicazioni obsolete di stato, priorità, conteggio, sequenza e ownership, non elimina scope o hard gate. Le evidenze nei commenti sono storiche e non vanno riscritte.

# Nuova master — MatchPilot Sports Trading OS

Il vecchio progetto è stato archiviato in `archive/pre-trading-os-reset-2026-10-04`.
Questa issue è l'unica master valida per il nuovo prodotto.

## Visione
Costruire una web app completa di trading sportivo:
**PRE-MATCH → LIVE VALIDATION → ENTRY → MANAGEMENT → EXIT → POST-MORTEM**

## Stato sorgenti

- FutPythonTrader: implementato e certificato nel perimetro storico 05/10; residuo corrente audit412 e rischio PIT, non globalmente chiudibile.
- TotalCorner: core persistente da iniziare, urgente secondo decisione owner; non confondere con trial.
- Trial #40: freeze e PASS9 del run post#124; archivio finale/Drive/portabilità non certificati.
- Card prodotto e domini downstream sotto sono backlog: mock non è implementazione/certificazione.
- I checkbox originali vanno letti nel perimetro delle evidenze citate, non come certificazione universale corrente.

## Contratto dati
### FutPythonTrader
- [x] discovery automatica schema/campi — certificato FPT §5: 325 campi raw = 325 in registry
- [x] raw snapshot immutabile — certificato FPT §4: 617 gzip riletti, 0 hash diversi, perdita zero
- [ ] normalizzazione di ogni campo disponibile
- [x] coverage N per metrica — certificato FPT §6: `fpt_field_coverage` (global/dataset/league/season/period/normalized)
- [ ] forma 5/10/20
- [ ] home/away split
- [ ] xG/xGA/xGOT/xA
- [ ] shooting completo
- [ ] creation/passing/touches box
- [ ] possession
- [ ] defense
- [ ] discipline
- [ ] corners
- [ ] HT
- [ ] 2T
- [ ] timing goals
- [ ] H2H
- [ ] odds/history
- [ ] O/U, BTTS, DC, correct score
- [ ] similar-odds cohorts
- [x] ulteriori campi futuri senza perdita — discovery dinamica e gate registry raw = registry (certificato FPT §5)

### TotalCorner pre-match
- [ ] opening 1X2
- [ ] closing/pre-match 1X2
- [ ] Asian
- [ ] Goal Line
- [ ] Corner Line
- [ ] market movement pre-kickoff
- [ ] hard temporal cutoff al kickoff

### TotalCorner live
- [ ] score/minute/status
- [ ] events
- [ ] attacks/dangerous attacks
- [ ] shots on/off
- [ ] possession
- [ ] corners/cards
- [ ] 1X2 live
- [ ] Asian/Goal/Corner live
- [ ] snapshot/replay cronologico

## Web
- [ ] Daily Board responsive
- [ ] Match Center
- [ ] card Overview
- [ ] card Forma
- [ ] card Casa/Trasferta
- [ ] card xG
- [ ] card Shooting
- [ ] card Creation
- [ ] card Possession
- [ ] card Defense
- [ ] card Discipline
- [ ] card Corners
- [ ] card HT
- [ ] card 2T
- [ ] card Timing
- [ ] card Score Distribution
- [ ] card H2H
- [ ] card Historical Markets
- [ ] card Similar Odds
- [ ] card Strengths/Weaknesses
- [ ] card Model Output
- [ ] card Data Coverage
- [ ] card Market Movement
- [ ] Live State
- [ ] Trading Opportunities
- [ ] Trade Journal

## Intelligence
- [ ] Poisson baseline
- [ ] calibration/fair odds
- [ ] market/model divergence
- [ ] uncertainty/coverage penalty
- [ ] NO TRADE gate
- [ ] strategy versioning
- [ ] Lay Score vulnerability
- [ ] Lay Draw
- [ ] Lay Favourite
- [ ] Back Over
- [ ] Next Goal / pressure
- [ ] custom strategy builder
- [ ] entry rules
- [ ] invalidation rules
- [ ] exit/stop/hedge rules

## Backtest e risk
- [ ] replay senza leakage
- [ ] train/test temporale
- [ ] ROI
- [ ] strike rate
- [ ] drawdown
- [ ] confidence intervals
- [ ] bankroll virtuale
- [ ] exposure limits
- [ ] journal immutabile
- [ ] post-mortem automatico

## Definition of Done
Il prodotto non è completo finché:
1. tutti i campi FutPythonTrader disponibili sono normalizzati/ispezionabili;
2. PREMATCH e LIVE sono temporalmente separati e testati;
3. ogni card mostra coverage/provenance;
4. strategie e trade sono riproducibili;
5. backtest non contiene leakage;
6. desktop e mobile sono collaudati;
7. nessun secret compare in log o UI.

## Regole operative
Seguire README.md, CLAUDE.md e AGENTS.md.
Una PR alla volta salvo autorizzazione owner.


---

## Regola di chiudibilità / owner gate

Questa issue **non deve essere chiusa automaticamente dall'agente**.

Quando ogni punto del contenuto risulta realmente implementato, testato, verificato e documentato, l'agente deve pubblicare un **commento finale di chiudibilità** con:
- stato `READY TO CLOSE / CHIUDIBILE`;
- checklist completa dei punti e relativo esito;
- PR/commit;
- CI/review status;
- evidenze reali richieste;
- eventuali limiti noti;
- conferma che non restano punti aperti.

Dopo quel commento, l'issue resta **OPEN** e viene chiusa dall'owner.

Solo se l'owner autorizza esplicitamente l'agente a chiudere **questa specifica issue**, l'agente può chiuderla dopo il commento finale e una nuova verifica dei gate.


---

## Autorizzazione permanente PR / merge per gli agenti

L'owner autorizza **qualsiasi agente che lavori su questa issue** a:

- creare branch operativi;
- aprire una Pull Request senza chiedere autorizzazione preventiva;
- aggiornare la PR;
- risolvere review/thread;
- eseguire i test previsti;
- effettuare il merge autonomamente quando tutti i requisiti della PR risultano soddisfatti.

**Non è necessaria una nuova autorizzazione dell'owner per aprire o mergiare una PR.**

### Gate obbligatori prima del merge

L'agente può fare merge autonomamente solo quando, dove applicabile:

- esiste una sola PR operativa aperta secondo il contratto del repository;
- scope della PR coerente con la fase corrente;
- CI verde;
- test automatici pertinenti passati;
- hard test reali richiesti dalla issue passati;
- evidenze reali annotate nella PR;
- review/commenti inline/thread risolti;
- nessun finding bloccante HIGH/CRITICAL;
- README sincronizzato;
- CLAUDE.md / AGENTS.md aggiornati se cambia il contratto;
- nessun secret esposto;
- nessuna regressione nota lasciata irrisolta;
- criteri di accettazione della PR soddisfatti.

Se uno di questi gate fallisce, l'agente **non deve fare merge** e deve correggere nella stessa fase.

### Distinzione importante: merge PR vs chiusura issue

Questa autorizzazione vale per **apertura e merge delle PR**.

La chiusura della issue resta soggetta all'owner gate già definito:

1. l'agente completa tutti i punti;
2. pubblica il commento **READY TO CLOSE / CHIUDIBILE** con checklist ed evidenze;
3. lascia la issue OPEN;
4. la issue viene chiusa dall'owner, salvo autorizzazione esplicita a chiudere quella specifica issue.

Questa autorizzazione PR/merge è permanente per il lavoro su MatchPilot finché l'owner non la revoca esplicitamente.
