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

### Avvio TC e residuo reale

Il trial #40 non è l'implementazione production/core TotalCorner e il suo PASS9 non certifica #20. Nessuna nuova cattura core viene avviata da questa PR.

Appena attestata la finestra sicura #40 secondo contratto, **TC-CORE-01** (#104) è la prima card TC: discovery empirica endpoint/campo/fase/competizione/coverage/frequenza, raw lossless, budget/provenance; TC-CORE-02 mapping VERIFIED prima collector. I gate e campioni reali dettagliati sotto restano vincolanti.
Storico upstream e live captured sono distinti; ciò che non è retroattivo è GAP, non ricostruzione inventata. Scadenza membership: **11/10/2026 15:20:27 Europe/Rome**; nessun rinnovo o spesa autorizzati da questa PR.

Le vecchie FPT-TC-PR-01..13 / TC-PR-03B sotto sono **SUPERSEDED come sequenza PR**, mappate nelle TC-CORE di #104; scope/test/acceptance restano conservati. Campioni: discovery upcoming/live/ended/league/odds; mapping≥20, ≥5paesi, naming diverso/ambigui; prematch≥10match/≥3leghe; collector≥3partite; restart/day successivo; secondo ciclo/live multi-day; zero leakage/duplicati; Telegram.
Provider query/filters/field registry sono #20; DSL/Indicator Library è #34, intent #28; policy #96, accounting/settlement #99, rules #100. Nessuna logica duplicata.
Dopo TC messo in sicurezza, audit412 #12 prima dei downstream non urgenti. Chiusura solo dopo tutti gate TC e certificato attuale; issue resta OPEN.

---

## Contratto dettagliato conservato

Requisiti, test e acceptance criteria sotto restano validi dove non contraddetti dalle decisioni vigenti sopra. **SUPERSEDED** riguarda le indicazioni obsolete di stato, priorità, conteggio, sequenza e ownership, non elimina scope o hard gate. Le evidenze nei commenti sono storiche e non vanno riscritte.

# TotalCorner API — integrazione completa e certificazione reale

Questa issue governa la **chiusura definitiva del blocco TotalCorner** nel nuovo MatchPilot Sports Trading OS.

Riferimento master: #3.

La sorgente FutPythonTrader resta il motore storico/pre-match statistico.
TotalCorner deve diventare il motore:

- pre-match market data;
- live match state;
- live statistics;
- live odds/movement;
- Asian/Goal/Corner lines;
- eventi;
- archivio live ad alta frequenza;
- replay storico live per backtest/trading.

---

# Regola principale

TotalCorner può essere dichiarato **CLOSED / CERTIFIED** solo quando:

1. tutti gli endpoint necessari sono integrati;
2. tutti i campi realmente disponibili sono preservati;
3. il mapping campionati FutPythonTrader ↔ TotalCorner è verificato;
4. il cron live salva snapshot temporali completi;
5. il replay storico è riproducibile;
6. gli alert funzionano nella stessa chat Telegram di FutPythonTrader;
7. ogni fase ha test automatici + hard test reali;
8. esiste un certificato finale versionato.

Non basta:
- codice presente;
- CI verde;
- endpoint che risponde;
- un singolo match osservato;
- un test manuale non persistito.

---

# Vincolo operativo

## Una PR alla volta

- una sola PR aperta per questa issue;
- la PR successiva parte solo dopo merge della precedente;
- ogni PR deve avere:
  - scope;
  - test automatici;
  - hard test reali;
  - EVIDENZA REALE;
  - README sincronizzato;
  - review/thread chiusi;
- failure reale = restare nella stessa fase;
- nessuna checklist anticipata.

---

# Obiettivo finale

Dobbiamo poter produrre un certificato TotalCorner con almeno:

- endpoint integrati;
- campionati TotalCorner scoperti;
- campionati FutPythonTrader mappati;
- campionati comuni certificati;
- campionati non mappati;
- match pre-match acquisiti;
- match live acquisiti;
- snapshot live totali;
- eventi totali;
- odds snapshots;
- Asian snapshots;
- Goal Line snapshots;
- Corner Line snapshots;
- campi live unici;
- coverage live per campo;
- frequenza polling effettiva;
- gap temporali;
- duplicate snapshots;
- partite con storico completo;
- partite incomplete;
- errori reali;
- alert Telegram;
- cron health;
- replay deterministico;
- timestamp UTC;
- commit SHA;
- schema/migration version.

---

# Contratto campionati — intersezione FutPythonTrader × TotalCorner

## Regola

Il dataset operativo MatchPilot per TotalCorner deve essere costruito sui campionati:

**FPT_SUPPORTED ∩ TOTALCORNER_SUPPORTED**

Nessun campionato TotalCorner viene promosso automaticamente a supportato MatchPilot se non esiste mapping verificato con FutPythonTrader.

## Mapping obbligatorio

Creare tabella persistente:

`competition_mapping`

con almeno:
- internal_competition_id;
- country;
- canonical_league_name;
- futpython_country_slug;
- futpython_league_slug;
- futpython_season;
- totalcorner_league_id;
- totalcorner_league_name;
- totalcorner_country_name;
- mapping_status;
- mapping_confidence;
- mapping_method;
- verified_at;
- evidence;
- active.

Stati:
- VERIFIED
- CANDIDATE
- AMBIGUOUS
- UNMAPPED
- DEPRECATED

### Gate
Solo `VERIFIED` entra nel collector automatico live.

---

# FPT-TC-PR-01 — Discovery completa API e schema registry

## Scope

Integrare e certificare:

- `/match/today`
- `/match/schedule`
- `/match/view/{match_id}`
- `/match/odds/{match_id}`
- `/league/table/{league_id}?type=table`
- `/league/table/{league_id}?type=corner`
- `/league/table/{league_id}?type=card`
- `/league/schedule/{league_id}`

Preservare tutte le colonne dinamiche disponibili, incluse quando presenti:
- events;
- odds;
- asian;
- cornerLine;
- cornerLineHalf;
- goalLine;
- goalLineHalf;
- asianCorner;
- attacks;
- dangerousAttacks;
- shotOn;
- shotOff;
- possession;
- userRemarks;
- Asian/Goal/Corner/1X2 history;
- HT/FT variants.

## Hard test reali

- almeno 1 match upcoming;
- almeno 1 match live;
- almeno 1 match ended;
- almeno 1 league table;
- almeno 1 odds history;
- raw response persistita;
- schema registry confrontato con raw;
- nessun token nei log.

## Gate

Tutti gli endpoint richiesti:
- reachable oppure documentati come upstream unavailable;
- schema lossless;
- zero campo scartato.

---

# FPT-TC-PR-02 — Mapping campionati FutPythonTrader ↔ TotalCorner

## Scope

- leggere catalogo FutPythonTrader certificato;
- leggere leghe TotalCorner;
- normalizzare country/league names;
- candidate matching automatico;
- verifica manuale/automatica degli ambigui;
- persistere mapping e provenance.

## Hard test reali

- minimo 20 mapping reali verificati;
- almeno 5 paesi;
- almeno 3 casi con naming differente;
- almeno 2 casi ambigui;
- verifica match schedule coerente tra provider.

## Gate

- nessun mapping usato in produzione con stato diverso da VERIFIED;
- lista completa overlap;
- lista completa non-overlap;
- mapping duplicati = 0.

---

# FPT-TC-PR-03 — Pre-match market mirror

## Scope

Salvare prima del kickoff:

- opening 1X2;
- pre-match/closing 1X2;
- Asian Handicap;
- Goal Line;
- Corner Line;
- Asian Corner;
- HT lines quando disponibili;
- movimento quota con timestamp.

## Regola temporale

Nessun record successivo al kickoff può entrare nel dataset PREMATCH.

Ogni snapshot deve avere:
- match_id TotalCorner;
- provider timestamp;
- acquired_at UTC;
- scheduled kickoff;
- phase=PREMATCH;
- raw payload hash;
- normalized values.

## Hard test reali

- almeno 10 match reali;
- almeno 3 campionati VERIFIED;
- verifica cutoff temporale;
- verifica opening vs last-prematch;
- verifica che record live non contaminino PREMATCH.

## Gate

Temporal leakage = 0.

---

# FPT-TC-PR-04 — Live collector cron

## Obiettivo

Creare il collector live continuo che costruisce il nostro **storico live proprietario**.

## Frequenza

Default iniziale:

**ogni 15 secondi per match live VERIFIED**

Configurabile:
- `TOTALCORNER_LIVE_POLL_SECONDS`
- minimo operativo non inferiore ai limiti API;
- rate limiter globale;
- jitter controllato;
- backoff su 429/5xx.

Se i limiti reali dell'account richiedono una frequenza diversa, usare la massima frequenza sostenibile e documentarla.

## Dati da salvare ad ogni snapshot

Quando disponibili:
- minute/status;
- score FT current;
- HT score;
- attacks;
- dangerous attacks;
- shots on;
- shots off;
- possession;
- corners;
- yellow cards;
- red cards;
- 1X2 odds;
- Asian;
- Goal Line;
- Corner Line;
- Asian Corner;
- HT markets;
- event cursor / last event;
- provider timestamp;
- acquired_at UTC;
- raw hash.

## Persistenza

Creare almeno:

`tc_live_snapshots`

`tc_live_events`

`tc_market_snapshots`

`tc_collector_runs`

con deduplica deterministica.

## Hard test reali

Seguire almeno **3 partite reali complete**:
- una dall'inizio alla fine;
- una agganciata a partita già iniziata;
- una con almeno un cambiamento quota/evento significativo.

Verificare:
- frequenza effettiva;
- zero duplicati;
- restart/recovery;
- nessuna perdita dopo deploy;
- chiusura corretta FT;
- snapshot finale;
- eventi ordinati temporalmente.

## Gate

Per almeno una gara completa:
- coverage temporale dichiarata;
- gap massimi misurati;
- replay possibile;
- stato finale riconciliato.

---

# FPT-TC-PR-05 — Storico live e replay deterministico

## Scope

Costruire replay:

`match_id + timestamp → stato noto a quel momento`

Deve essere possibile ricostruire:
- score;
- pressione;
- shots;
- possession;
- corners;
- cards;
- odds;
- lines;
- events.

## Hard test reali

Su almeno 3 match:
- replay al 15';
- replay HT;
- replay 60';
- replay 75';
- replay 90'/FT;
- confronto con snapshot raw originali.

## Gate

Replay deterministico:
stesso input timestamp → stesso stato.

---

# FPT-TC-PR-06 — Coverage live per statistica

## Scope

Per ogni campo TotalCorner calcolare:
- rows/snapshots seen;
- nonempty seen;
- coverage globale;
- coverage per league;
- coverage per match;
- coverage per minuto/fascia temporale;
- first/last observed;
- sparse/always-empty.

## Hard test reali

- almeno 10 match;
- almeno 5 campionati VERIFIED;
- confronto raw ↔ registry;
- conteggi indipendenti su campione.

## Gate

Ogni campo live ha coverage calcolabile e provenance.

---

# FPT-TC-PR-07 — Odds movement storico completo

## Scope

Persistenza e normalizzazione di:

- oddsList;
- asianList;
- goalList;
- cornerList;
- oddsHalfList;
- asianHalfList;
- goalHalfList;
- cornerHalfList.

Distinguere:
- opening;
- pre-match;
- in-play;
- suspended/invalid se osservabile.

## Hard test reali

- almeno 5 match con movement history;
- verifica timestamp ordinati;
- verifica duplicate rows;
- cutoff kickoff;
- confronto con `p_*` e `po_*`.

## Gate

Opening/closing/live separati senza leakage.

---

# FPT-TC-PR-08 — Event stream e deduplica

## Scope

- eventi goal;
- cards;
- corners se presenti come events;
- status changes;
- HT/FT;
- altri eventi disponibili.

## Hard test reali

- almeno 3 match con eventi multipli;
- restart collector;
- stesso evento non duplicato;
- ordine temporale coerente;
- reconcile score ↔ goal events.

## Gate

Event duplication = 0 per chiave deterministica.

---

# FPT-TC-PR-09 — Alerting nella stessa chat Telegram

## Chat

Usare gli stessi:
- `MATCHPILOT_TELEGRAM_BOT_TOKEN`
- `MATCHPILOT_TELEGRAM_CHAT_ID`

già usati per FutPythonTrader.

## Alert da implementare

INFO:
- nuova colonna/campo TotalCorner;
- nuovo campionato TotalCorner candidato;
- nuovo mapping VERIFIED.

WARNING:
- singolo endpoint degradato;
- match live con snapshot stale;
- gap polling oltre soglia;
- rate limit frequente;
- mapping diventato ambiguo;
- row/field coverage anomala.

CRITICAL:
- collector fermo;
- nessun poll riuscito per N minuti;
- 5xx/401/403 persistenti;
- token invalid;
- molti match live non acquisiti;
- cron stale;
- perdita di persistenza DB.

## Anti-spam

- deduplica fingerprint;
- cooldown;
- massimo un riepilogo per categoria/run;
- nessun messaggio per ogni singolo errore ripetuto.

## Hard test reale Telegram

- simulare failure;
- ricevere 1 alert;
- ripristinare;
- alert resolved;
- nessuna risposta inbound;
- outbound-only confermato;
- stessa chat FutPythonTrader.

---

# FPT-TC-PR-10 — Rate limiting, retry e resilienza

## Scope

- global rate limiter;
- per-endpoint budget;
- retry 429;
- retry 5xx;
- exponential backoff;
- circuit breaker;
- health counters;
- no thundering herd al restart.

## Hard test reali

- forzare frequenza controllata;
- osservare 429 se possibile senza abuso;
- verificare backoff;
- verificare recovery;
- verificare che il collector non perda tutti i match per errore singolo.

## Gate

Nessun loop aggressivo e nessun ban evitabile.

---

# FPT-TC-PR-11 — Data quality e reconciliation

## Scope

Confrontare per match:
- score snapshot vs final;
- HT score;
- corners;
- cards;
- odds;
- events;
- minute sequence.

Classificare:
- complete;
- partial;
- inconsistent;
- upstream_missing.

## Hard test reali

Campione minimo:
- 20 match;
- 5 campionati;
- almeno 3 con goals multipli;
- almeno 3 con cards;
- almeno 3 con movimento quota.

## Gate

Ogni inconsistenza ha provenienza e classificazione.

---

# FPT-TC-PR-12 — Secondo ciclo live reale + idempotenza

## Scope

Dopo il primo periodo di raccolta:
- riavvio collector;
- secondo ciclo live;
- confronto duplicati;
- verifica nuovi snapshot;
- verifica recovery da deploy;
- verifica giornata successiva.

## Hard test reali

- almeno due giornate reali;
- match del giorno 1 rileggibili al giorno 2;
- zero perdita archivio;
- zero duplicazioni indebite.

## Gate

Storico persistente e replay cross-day verificati.

---

# FPT-TC-PR-13 — Certificato finale TotalCorner

Creare:

`docs/totalcorner-certification-YYYY-MM-DD.md`

Contenuti minimi:

## API
- endpoint;
- account/rate limit osservato;
- timestamp;
- version/schema.

## Mapping
- FPT competitions;
- TC competitions;
- overlap VERIFIED;
- unmapped;
- ambiguous.

## Live archive
- match;
- snapshots;
- events;
- markets;
- date range;
- polling median/p95;
- max gaps;
- complete/partial matches.

## Schema
- campi;
- coverage;
- anomalie.

## Integrity
- duplicates;
- replay;
- temporal ordering;
- prematch/live leakage.

## Alerting
- watchdog;
- Telegram;
- recovery.

## Esito

Uno solo:
- ✅ CERTIFIED
- ⚠️ CERTIFIED WITH KNOWN LIMITATIONS
- ❌ NOT CERTIFIED

---

# Gate finale “TotalCorner è chiuso”

È permesso dichiarare **TotalCorner CLOSED / CERTIFIED** solo se:

- [ ] endpoint necessari certificati;
- [ ] schema completo;
- [ ] overlap FutPythonTrader ↔ TotalCorner certificato;
- [ ] collector live attivo;
- [ ] storico live persistente;
- [ ] replay deterministico;
- [ ] pre-match/live separati;
- [ ] odds movement certificato;
- [ ] events deduplicati;
- [ ] coverage completa;
- [ ] rate limiting certificato;
- [ ] retry/recovery certificati;
- [ ] alert Telegram nella stessa chat certificati;
- [ ] almeno due giornate live reali archiviate;
- [ ] nessun errore MatchPilot irrisolto;
- [ ] certificato finale prodotto;
- [ ] README / CLAUDE.md / AGENTS.md sincronizzati;
- [ ] CI verde;
- [ ] review/thread chiusi.

Solo allora aggiornare README e master #3 con:

**TotalCorner CLOSED / CERTIFIED**.


---

# Storico TotalCorner — contratto completo

TotalCorner deve essere integrato in due modalità storiche distinte e **mai confuse**.

## 1. HISTORICAL_UPSTREAM

Dati retroattivi che TotalCorner rende già disponibili per match passati tramite API.

Da tentare e certificare, quando disponibili:

- match schedule storico;
- match view storico;
- score FT;
- score HT;
- corner FT/HT;
- cards;
- events;
- opening 1X2;
- pre-match/closing 1X2;
- odds history;
- Asian Handicap history;
- Goal Line history;
- Corner Line history;
- Asian Corner history;
- HT market history;
- qualsiasi altro campo storico realmente restituito dall'API.

Per ogni endpoint/campo dobbiamo misurare:
- prima data realmente interrogabile;
- ultima data;
- stagioni coperte;
- campionati coperti;
- numero match;
- coverage;
- errori/no-data;
- eventuali limiti account/API;
- differenza tra endpoint documentato e dato realmente restituito.

## 2. HISTORICAL_CAPTURED

Storico live costruito direttamente da MatchPilot tramite polling TotalCorner.

Serve perché TotalCorner non deve essere assunto come sorgente retroattiva completa per:

- attacks;
- dangerous attacks;
- shots on;
- shots off;
- possession;
- stato live minuto per minuto;
- live odds minuto per minuto;
- Asian live;
- Goal Line live;
- Corner Line live;
- altri indicatori live dinamici.

Quando questi dati non sono disponibili retroattivamente, MatchPilot li costruisce da oggi con snapshot persistenti.

Ogni record deve indicare chiaramente:

- provenance = HISTORICAL_UPSTREAM oppure HISTORICAL_CAPTURED;
- match_id;
- provider timestamp;
- acquisition timestamp UTC;
- phase;
- raw hash;
- schema version.

È vietato presentare HISTORICAL_CAPTURED come dato upstream retroattivo o viceversa.

---

# TC-PR-03B — Historical Backfill TotalCorner

Questa PR va eseguita **prima del collector live completo**.

## Obiettivo

Scaricare il massimo storico realmente disponibile da TotalCorner per tutti i campionati con mapping VERIFIED FutPythonTrader ↔ TotalCorner.

## Scope

Per ogni campionato VERIFIED:

- enumerare schedule storico;
- enumerare match passati;
- scaricare match view;
- scaricare odds history;
- scaricare Asian history;
- scaricare Goal Line history;
- scaricare Corner Line history;
- scaricare HT markets;
- scaricare events;
- salvare score FT/HT;
- salvare corner FT/HT;
- salvare cards;
- preservare ogni campo sconosciuto;
- classificare no-data/404/errori reali;
- supportare resume/checkpoint;
- deduplicare raw e normalized data.

## Hard test reali

Minimo:

- almeno 5 campionati VERIFIED;
- almeno 3 paesi;
- almeno 3 stagioni differenti;
- almeno 20 match storici;
- almeno 5 match con odds history;
- almeno 3 match con Asian/Goal/Corner movement;
- almeno 3 match con events storici se disponibili;
- almeno 1 caso con no-data/404;
- restart reale del backfill;
- verifica resume;
- verifica deduplica;
- verifica token non presente nei log.

## Audit storico

Produrre per ogni campionato:

- earliest_upstream_date;
- latest_upstream_date;
- seasons_seen;
- matches_seen;
- odds_history_coverage;
- asian_history_coverage;
- goal_line_history_coverage;
- corner_line_history_coverage;
- events_coverage;
- score_ht_coverage;
- corners_ht_coverage;
- cards_coverage;
- live_stats_retroactive_coverage.

## Regola fondamentale

Non assumere che attacks/dangerous attacks/shots/possession abbiano storico minuto-per-minuto retroattivo.

Va testato empiricamente.

Se non disponibile:
- marcare retroactive_available=false;
- nessun errore MatchPilot;
- iniziare copertura tramite HISTORICAL_CAPTURED.

## Gate

La PR passa solo quando:

- tutto lo storico realmente accessibile è stato acquisito per il campione di test;
- range temporale reale è misurato;
- campi retroattivi vs non retroattivi sono distinti;
- resume/deduplica sono certificati;
- nessuna perdita dati MatchPilot è osservata.

---

# Archivio live proprietario da oggi

Dopo TC-PR-03B, il collector della TC-PR-04 deve costruire continuamente HISTORICAL_CAPTURED.

## Obiettivo strategico

Creare nel tempo uno storico più ricco del dataset upstream retroattivo, utile per backtest di trading su:

- pressione al minuto X;
- dangerous attacks;
- shots;
- possession;
- corners;
- score state;
- live odds;
- Asian/Goal/Corner movement;
- timing degli eventi;
- variazione delle metriche negli ultimi N minuti;
- vulnerabilità dello score;
- entry/exit rules.

## Retention

Nessuna cancellazione automatica dei dati storici senza autorizzazione owner.

Conservare:
- raw snapshot;
- normalized snapshot;
- market snapshot;
- events;
- collector run metadata;
- quality flags;
- replay index.

---

# Estensione certificato finale TotalCorner

Il documento:

`docs/totalcorner-certification-YYYY-MM-DD.md`

deve distinguere obbligatoriamente:

## HISTORICAL_UPSTREAM
- campionati;
- stagioni;
- earliest date;
- latest date;
- match;
- endpoint;
- coverage per campo;
- limiti retroattivi.

## HISTORICAL_CAPTURED
- data inizio raccolta MatchPilot;
- match;
- snapshot;
- frequenza polling;
- gap median/p95/max;
- coverage per campo;
- partite complete;
- partite partial;
- replay coverage.

## Gap analysis
Per ogni metrica:
- upstream retroactive? sì/no/parziale;
- captured live? sì/no;
- data iniziale disponibile;
- coverage;
- limitazioni note.

## Gate storico finale

TotalCorner non può essere dichiarato CLOSED/CERTIFIED finché:

- [ ] storico upstream massimo disponibile acquisito e auditato;
- [ ] range temporale reale documentato;
- [ ] coverage storica per campo documentata;
- [ ] campionati comuni FutPythonTrader ↔ TotalCorner mappati;
- [ ] collector HISTORICAL_CAPTURED attivo;
- [ ] almeno due giornate live reali archiviate;
- [ ] replay storico verificato;
- [ ] upstream vs captured chiaramente separati;
- [ ] nessun dato live retroattivo inventato.


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

# API Budget / Request Economy — regola obbligatoria

MatchPilot deve minimizzare il consumo di richieste verso **FutPythonTrader** e **TotalCorner**.

L'obiettivo non è solo rispettare il rate limit, ma evitare sprechi che possano:
- esaurire quota giornaliera/mensile;
- causare 429;
- provocare blocchi temporanei;
- aumentare costi;
- degradare il servizio;
- impedire il live collector nei momenti importanti.

## Principio

Prima di chiamare un provider chiedere sempre:

**“Questo dato è già disponibile e sufficientemente fresco nel nostro database/cache?”**

Se sì, NON chiamare l'API.

## Request deduplication

Obbligatorio:
- stessa richiesta contemporanea → una sola chiamata upstream;
- le richieste concorrenti devono condividere la stessa Promise/job;
- evitare N chiamate identiche da N utenti;
- frontend multipli non devono moltiplicare le chiamate provider.

Schema:
`100 utenti → 1 fetch provider → DB/cache → 100 response MatchPilot`

Mai:
`100 utenti → 100 fetch provider`.

## Cache-first

Usare:
1. database persistente;
2. cache server-side;
3. provider solo quando necessario.

TTL differenziato:
- storico concluso: molto lungo / immutable;
- pre-match: TTL medio;
- live: TTL corto;
- metadata/league: TTL lungo;
- schema/catalogo: refresh programmato, non per pagina.

## FutPythonTrader

Evitare:
- riscaricare storico immutato;
- riscaricare stagioni completate;
- chiamare catalog/schema ad ogni richiesta utente;
- chiamare jogos-do-dia più volte senza necessità;
- sincronizzazioni duplicate dovute a restart/deploy.

Usare:
- snapshot hash;
- checkpoint;
- resume;
- incremental sync;
- cached catalog;
- schedule intelligente;
- advisory lock.

## TotalCorner

Il live polling deve essere **centralizzato per match**, non per utente.

Una partita live deve avere un solo collector MatchPilot.

Gli utenti leggono dal nostro stream/database.

Polling adattivo:
- molto prima del kickoff → bassa frequenza;
- vicino al kickoff → media frequenza;
- LIVE → frequenza necessaria;
- HT → rallentare dove sensato;
- FT → interrompere il polling live dopo final reconciliation;
- match postponed/cancelled → stop;
- match senza utenti attivi può comunque essere raccolto se richiesto dallo storico, ma secondo budget globale.

## Adaptive polling

La frequenza deve poter cambiare in base a:
- status match;
- minuto;
- numero match live simultanei;
- quota API residua;
- 429 recenti;
- latency/error rate;
- priorità campionato/match;
- necessità di HISTORICAL_CAPTURED.

## Provider budgets

Creare budget separati:
- FutPythonTrader requests/minute;
- FutPythonTrader requests/day;
- TotalCorner requests/minute;
- TotalCorner requests/day se applicabile.

I valori devono essere configurabili e basati sul piano reale, non hardcoded senza verifica.

Env concettuali:
- `FUTPYTHON_REQUESTS_PER_MINUTE`
- `FUTPYTHON_REQUESTS_PER_DAY`
- `TOTALCORNER_REQUESTS_PER_MINUTE`
- `TOTALCORNER_REQUESTS_PER_DAY`
- `API_BUDGET_WARNING_PCT`
- `API_BUDGET_CRITICAL_PCT`

## Request ledger

Persistire almeno:
- provider;
- endpoint family;
- timestamp;
- outcome;
- HTTP status;
- latency;
- cache_hit/cache_miss;
- deduped=true/false;
- retry count;
- estimated/known quota remaining quando disponibile.

Mai salvare token/secret.

## Budget states

- NORMAL
- ELEVATED
- CONSERVE
- CRITICAL
- EXHAUSTED

In CONSERVE:
- ridurre chiamate non essenziali;
- allungare TTL;
- sospendere discovery non urgente;
- preservare live core.

In CRITICAL:
priorità:
1. live match state;
2. live markets necessari al Trading Engine;
3. final reconciliation;
4. pre-match imminente;
5. storico/backfill;
6. discovery/schema non urgente.

## 429 / Retry-After

Su 429:
- rispettare Retry-After quando presente;
- exponential backoff;
- jitter;
- niente retry storm;
- circuit breaker;
- ridurre temporaneamente polling.

## 5xx/network errors

- retry limitato;
- backoff;
- nessun loop stretto;
- usare ultimo snapshot valido con STALE flag;
- reconciliation successiva.

## Startup protection

Un restart/deploy NON deve:
- rilanciare massivamente tutto lo storico;
- resettare i budget;
- duplicare collector live;
- creare thundering herd.

Checkpoint e lock devono impedire consumo duplicato.

## Backfill throttling

I backfill storici devono:
- avere rate limit separato;
- cedere priorità al live;
- essere pausable/resumable;
- fermarsi automaticamente se il budget entra in CONSERVE/CRITICAL.

## User traffic isolation

Il numero di utenti SaaS non deve determinare linearmente il numero di chiamate upstream.

Il provider viene interrogato da MatchPilot; gli utenti leggono il dato normalizzato interno.

## Alert Telegram

Stessa chat configurata.

Alert:
- WARNING a soglia configurabile (es. 70-80%);
- CRITICAL vicino all'esaurimento;
- 429 ripetuti;
- circuit breaker aperto;
- quota esaurita;
- consumo anomalo rispetto alla baseline.

Anti-spam con summary aggregato.

## Hard test reali

Certificare:
- 20 richieste frontend simultanee → una sola chiamata upstream equivalente;
- cache hit → zero upstream;
- restart → nessun burst massivo;
- 429 → backoff corretto;
- live ha priorità sul backfill;
- FT interrompe polling live;
- budget CONSERVE riduce traffico non essenziale;
- request ledger riconcilia il numero reale di chiamate;
- nessun token nei log.

## Gate

Nessuna pipeline FutPythonTrader/TotalCorner può essere dichiarata CERTIFIED senza:
- request deduplication;
- cache-first;
- provider budget;
- rate limiter;
- adaptive polling dove applicabile;
- 429/backoff;
- request ledger;
- alert consumo;
- hard test reali.


---

# Architettura dati — Provider → MatchPilot → Database → Client

## Principio

Le API esterne **non sono il data source diretto del browser**.

Architettura obbligatoria:

`FutPythonTrader / TotalCorner → MatchPilot Backend → Neon/Database → MatchPilot API → Browser`

Per il realtime:

`TotalCorner → MatchPilot Live Collector → Neon + Realtime Stream → Browser`

Il frontend deve interrogare le API MatchPilot, non i provider esterni.

---

# Pre-match

## FutPythonTrader

Lo storico e le statistiche pre-match devono essere:

1. acquisiti dal provider;
2. persistiti nel nostro database;
3. aggiornati tramite sync incrementale;
4. serviti al sito dal database.

Una pagina aperta da un utente **non deve generare una nuova chiamata FutPythonTrader** se il dato è già presente e fresco.

Lo storico già acquisito non va riscaricato inutilmente.

## TotalCorner pre-match

Le quote/linee pre-match possono cambiare, quindi vanno acquisite con snapshot programmati.

Esempio concettuale:
- molto prima del kickoff → frequenza bassa;
- avvicinandosi al kickoff → frequenza maggiore;
- snapshot opening;
- snapshot intermedi;
- ultimo snapshot pre-kickoff.

Ogni snapshot viene salvato nel DB.

Quando l'utente apre una partita, legge:
- opening;
- current/last prematch;
- movement;

dal nostro database, non direttamente da TotalCorner.

---

# Live

Il live è l'unica area che richiede polling frequente del provider.

Regola:

**un solo collector centralizzato per match**

Non un collector per utente.

Esempio:

`200 utenti guardano Juventus–Milan → 1 collector MatchPilot → 200 client ricevono lo stesso stream`

Mai:

`200 utenti → 200 polling TotalCorner`.

Il collector:
- acquisisce lo snapshot;
- lo salva in Neon;
- aggiorna il realtime stream;
- tutti i client ricevono il dato via WebSocket/SSE.

---

# Partita conclusa

A FT:

1. stop polling live;
2. final reconciliation;
3. salvataggio snapshot finale;
4. eventuale recupero dati mancanti;
5. archiviazione definitiva.

Dopo FT:
- Match Replay usa il nostro DB;
- Match Center usa il nostro DB;
- Analysis Hub usa il nostro DB;
- backtest usa il nostro DB;
- post-mortem usa il nostro DB.

La consultazione storica **non deve consumare nuove chiamate TotalCorner** salvo reconciliation esplicitamente necessaria.

---

# Ruolo dei componenti

## Provider esterni
Funzione:
**acquisizione dati**

## Neon / Database
Funzione:
**memoria persistente MatchPilot**

## MatchPilot Backend/API
Funzione:
**normalizzazione, autorizzazione e serving**

## WebSocket/SSE
Funzione:
**distribuzione realtime al browser**

## Browser
Funzione:
**visualizzazione e interazione**

Il browser non deve orchestrare ingestion upstream.

---

# Scalabilità SaaS

Il consumo upstream deve essere quasi indipendente dal numero di utenti.

Obiettivo:

`N utenti ≠ N chiamate provider`

ma:

`N utenti → stesso dato interno già acquisito`

Questo è obbligatorio per:
- controllo costi;
- rate limit;
- resilienza;
- performance;
- futuro SaaS multiutente.

---

# Cache strategy

Ordine preferenziale:

1. cache server-side;
2. database;
3. provider solo se dato mancante/scaduto.

Mai chiamare il provider prima di controllare se il dato esiste già internamente.

---

# Freshness policy

Ogni famiglia dati deve avere una policy di freshness:

## Storico concluso
- immutable / long TTL.

## Stagione corrente
- sync incrementale.

## Pre-match
- snapshot schedule adattivo.

## Live
- short polling adattivo.

## FT
- final reconciliation e stop collector.

---

# Acceptance

Questa architettura è considerata implementata solo se:

- [ ] frontend non chiama FutPythonTrader;
- [ ] frontend non chiama TotalCorner;
- [ ] storico FutPython viene servito da DB;
- [ ] pre-match TotalCorner viene servito da DB;
- [ ] live usa collector centralizzato;
- [ ] utenti multipli non moltiplicano polling;
- [ ] FT interrompe polling;
- [ ] Replay legge solo storico interno;
- [ ] backtest legge solo storico interno;
- [ ] cache/database vengono controllati prima del provider;
- [ ] hard test dimostra 20 client → una sola richiesta upstream equivalente.


---

# Queryability / Filterability — contratto dati obbligatorio

I dati FutPythonTrader e TotalCorner non devono essere soltanto archiviati: devono essere **interrogabili in modo efficiente, coerente e combinabile**.

Obiettivo:

`raw provider → normalized facts → indexed query layer → filters/UI/agent analysis`

## Doppio livello obbligatorio

### 1. Raw immutable
Conservare:
- payload originale;
- provider timestamp;
- acquired_at;
- hash;
- provenance;
- schema version.

Serve per audit/replay/reprocessing.

### 2. Normalized query layer
Estrarre in tabelle/viste interrogabili i campi utili per:
- filtri sito;
- confronti Home/Away/Both;
- analytics;
- Trading Engine;
- richieste dirette dell'assistente/agente;
- backtest;
- replay;
- reporting.

Mai costringere il prodotto a rileggere ogni volta JSON raw completo per query comuni.

---

# Chiavi canoniche

Ogni dato deve poter essere collegato tramite identificatori canonici:

- internal_match_id
- internal_competition_id
- internal_team_id
- season_id
- provider_match_id
- provider_competition_id
- provider_team_id
- kickoff_utc
- home_team_id
- away_team_id

Il mapping provider deve essere persistente e auditabile.

---

# Dimensioni filtro minime

## Match
- date/date range
- kickoff time
- status
- minute
- score
- HT score
- FT score

## Competition
- country
- league
- season
- round
- competition type

## Team
- home
- away
- both
- venue
- team-specific history

## Sample
- last 5
- last 10
- last 20
- last 30
- season
- custom N
- custom date range

## Strength/context
- favorite/underdog
- current odds band
- opening odds band
- similar odds
- stronger/similar/weaker opponent
- rank/rating band

## Goals
- scored
- conceded
- BTTS
- clean sheet
- failed to score
- Over/Under thresholds
- exact score
- score state
- first scorer
- comeback/lost lead

## Time
- HT
- 2H
- 0-15
- 16-30
- 31-45
- 46-60
- 61-75
- 76-90
- custom minute range

## Advanced stats
Quando disponibili:
- xG/xGA/xGOT/xA
- shots
- SOT
- possession
- attacks
- dangerous attacks
- corners
- cards
- passing
- defensive actions
- chance creation

## Markets
- 1X2
- Asian
- Goal Line
- Corner Line
- HT markets
- opening/current/closing/live
- market movement
- fair price
- edge

---

# Live queryability

Per TotalCorner live, ogni snapshot deve poter essere filtrato per:

- match_id
- timestamp
- minute
- score state
- stat ranges
- market ranges
- event presence
- rolling-window features

Esempi futuri:
- tutti i match dove al 70' score=1-0;
- dangerous attacks away > threshold;
- SOT delta ultimi 10 minuti > X;
- lay 1-0 price tra 6 e 10;
- home favorite prematch;
- league specific.

---

# Derived facts

Creare layer derivato versionato per query frequenti:

- rolling stats 5/10/15 min;
- score state duration;
- first goal state;
- lead/trail duration;
- market movement delta;
- pressure features;
- comparable scenario tags;
- home/away splits;
- opponent strength bands;
- odds buckets;
- historical sample membership.

Ogni derivazione deve avere:
- formula/version;
- source snapshot ids;
- computed_at;
- no future leakage.

---

# Indici

Creare indici DB coerenti con i filtri principali, almeno su:

- match_id
- competition_id
- team_id
- season
- kickoff_utc
- status
- provider_timestamp
- minute
- score
- market_type
- snapshot timestamp

Valutare indici compositi per query reali.

---

# Assistant / agent query layer

L'assistente deve poter interrogare MatchPilot senza accedere direttamente ai provider.

Prevedere API/query interne per richieste tipo:

- "ultime 20 trasferte del team X";
- "solo quando era favorito tra 1.50 e 1.90";
- "partite finite 1-0 con pressione alta dopo il 70'";
- "campionati dove Lay 0-0 ha frequenza finale < 8%";
- "mostrami match con score 1-0 e dangerous attacks away in crescita";
- "confronta home vs away su xG, SOT e corners".

Queste query devono usare il database normalizzato, non chiamare FutPythonTrader/TotalCorner in tempo reale salvo dati mancanti/stale e regole di sync.

---

# Filter metadata registry

Creare registro dei filtri disponibili:

- field
- provider/source
- normalized field
- type
- allowed operators
- min/max
- enum values
- coverage
- indexed yes/no
- live/prematch/historical
- first_seen
- last_seen

Così UI e agent possono sapere automaticamente quali filtri sono disponibili.

---

# Operatori filtro

Supportare dove sensato:
- =
- !=
- >
- >=
- <
- <=
- between
- in
- not in
- contains
- exists
- missing

---

# Query safety/performance

- pagination;
- limit;
- timeout;
- query cost guard;
- no full table scan per filtri comuni;
- explain/analyze per query critiche;
- caching risultati frequenti;
- materialized views solo se utili e mantenibili.

---

# Acceptance

I provider sono considerati integrati correttamente solo se:

- [ ] raw completo preservato;
- [ ] normalized layer disponibile;
- [ ] mapping canonico provider→internal;
- [ ] campi chiave indicizzati;
- [ ] filter metadata registry;
- [ ] filtri Home/Away/Both;
- [ ] filtri 5/10/20/season/custom;
- [ ] filtri quote/market;
- [ ] filtri score/time state;
- [ ] filtri advanced stats;
- [ ] live snapshot queryable;
- [ ] derived facts versionati;
- [ ] assistant/agent può interrogare il DB interno;
- [ ] nessuna chiamata provider necessaria per query storiche già acquisite;
- [ ] hard test performance e correttezza.


---

# Composable Rule Engine — tutti i dati + combinazioni di filtri

## Obiettivo

MatchPilot deve supportare non solo filtri singoli, ma **regole composte arbitrariamente** usando tutti i dati realmente disponibili da FutPythonTrader, TotalCorner e dai layer derivati MatchPilot.

Esempio:

```
Venue = AWAY
AND Last N = 20
AND PrematchAwayOdds BETWEEN 2.00 AND 3.50
AND LiveMinute BETWEEN 65 AND 75
AND Score = 1-0
AND AwayDangerousAttacksRolling10m >= X
AND AwayShotsOnTarget >= 3
AND GoalLineLive >= 2.5
AND DataFreshness = FRESH
```

Questa combinazione deve poter essere usata come:

- filtro esplorativo nel sito;
- query analitica dell'assistente/agente;
- condizione di strategia;
- trigger live;
- criterio di backtest;
- criterio di alert;
- segmento storico.

---

# Regole AND / OR / NOT

Supportare gruppi annidati:

```
(A AND B AND C)
OR
(D AND E)
AND NOT F
```

Il Rule Builder deve permettere:
- AND;
- OR;
- NOT;
- nested groups;
- enable/disable singola condizione;
- reorder;
- duplicate group.

---

# Universo dei campi

Qualunque campo normalizzato e con coverage reale deve poter diventare una condizione, quando semanticamente valido.

Categorie:

## Identità
- country
- league
- season
- team
- opponent
- home/away
- round
- date/time

## Storico
- Last N
- W/D/L
- goals
- HT
- BTTS
- O/U
- exact score
- clean sheet
- first scorer
- score timing

## Advanced
- xG
- xGA
- xGOT
- xA
- shots
- SOT
- big chances
- possession
- passing
- defensive stats
- corners
- cards

## Pre-match markets
- opening 1X2
- latest prematch 1X2
- Asian
- Goal Line
- Corner Line
- market movement
- implied probability

## Live state
- minute
- score
- score duration
- attacks
- dangerous attacks
- shots
- SOT
- possession
- corners
- cards
- events

## Live markets
- 1X2
- Asian
- Goal Line
- Corner Line
- market movement
- price delta
- line delta

## Derived MatchPilot
- rolling 5/10/15m
- pressure
- momentum
- vulnerable score
- fair price
- edge
- confidence components
- data quality
- freshness
- opponent-strength band
- similar-odds bucket
- historical scenario frequency.

---

# Operatori

Supportare per tipo:

## Numeric
- =
- !=
- >
- >=
- <
- <=
- between
- outside range

## Enum/string
- is
- is not
- in
- not in

## Boolean
- true
- false

## Presence
- exists
- missing

## Temporal
- before
- after
- between minutes
- last N minutes
- since event
- within N minutes after event

## Change/delta
- increased by
- decreased by
- % change
- crossed threshold
- line changed
- odds shortened/drifted

---

# Rolling-window conditions

Live rules devono supportare condizioni temporali come:

- SOT negli ultimi 5 minuti;
- dangerous attacks ultimi 10 minuti;
- corners ultimi 15 minuti;
- variazione quota ultimi 3/5/10 minuti;
- pressione crescente per N snapshot consecutivi;
- nessun tiro negli ultimi N minuti.

Le rolling windows devono essere calcolate esclusivamente da snapshot precedenti o uguali al timestamp corrente.

---

# Historical aggregate conditions

Consentire:
- frequency >= X%;
- N >= soglia;
- ROI storico >= X;
- outcome rate;
- score persistence;
- next-goal rate;
- average minute;
- percentile/rank.

Ogni condizione aggregata deve mostrare sempre:
- N;
- finestra;
- coverage;
- metodologia/versione.

---

# Rule types

Una regola salvata può essere:

- FILTER_ONLY
- WATCHLIST
- PREMATCH_CANDIDATE
- LIVE_TRIGGER
- INVALIDATION
- EXIT
- HEDGE
- ALERT
- BACKTEST_SEGMENT

---

# Rule Builder UI

La UI deve consentire:

`Campo | Operatore | Valore`

Esempio:

`Away SOT rolling 10m | >= | 3`

Pulsanti:
- + AND
- + OR group
- NOT
- duplicate
- remove
- save preset
- test on history
- show matching matches

---

# Anteprima immediata

Mentre l'utente costruisce una regola mostrare:

- match che corrispondono;
- N storico;
- coverage;
- distribuzione outcome;
- eventuale ROI;
- warning sample basso;
- campi mancanti.

Mai dare significatività forte a N piccolo senza warning.

---

# Regole versionate

Ogni regola deve avere:

- rule_id;
- version;
- name;
- owner;
- definition JSON;
- created_at;
- updated_at;
- active;
- scope;
- data contract version.

Una modifica crea nuova versione per preservare backtest e audit.

---

# DSL / JSON contract

Prevedere un formato macchina stabile, per esempio:

```json
{
  "all": [
    {"field":"venue","op":"eq","value":"away"},
    {"field":"prematch.away_odds","op":"between","value":[2.0,3.5]},
    {"field":"live.minute","op":"between","value":[65,75]},
    {"field":"live.score","op":"eq","value":"1-0"},
    {"field":"live.away.dangerous_attacks_rolling_10m","op":"gte","value":12}
  ]
}
```

Questo permette di usare la stessa regola:
- nella UI;
- nell'API;
- nell'assistente;
- nel Trading Engine;
- nel backtest.

---

# Explainability

Ogni match deve poter spiegare:

- quali condizioni hanno passato;
- quali hanno fallito;
- quale valore reale è stato usato;
- timestamp;
- source;
- coverage.

Per i segnali live:
`4/5 conditions passed → WATCHING`
oppure
`5/5 → ARMED`.

---

# No future leakage

Nel backtest e nel live:
- ogni condizione può vedere solo dati disponibili al timestamp valutato;
- nessun aggregate può includere il match corrente dopo il timestamp;
- snapshot futuri vietati.

---

# Query optimization

Il motore deve tradurre le regole in query efficienti:
- SQL indexed;
- materialized/derived facts dove utile;
- no scansioni raw JSON per ogni richiesta;
- query planner guard;
- pagination/limits.

---

# Assistant direct use

L'assistente deve poter ricevere richieste naturali e trasformarle nella stessa DSL.

Esempio owner:

"Trova tutte le partite in cui la squadra ospite era sfavorita tra 3 e 5, al 70' perdeva 1-0 ma aveva almeno 3 SOT e forte pressione negli ultimi 10 minuti."

Il sistema:
1. traduce in rule JSON;
2. mostra la regola interpretata;
3. interroga il DB;
4. restituisce match e statistiche;
5. non chiama i provider se i dati sono già persistiti.

---

# Hard test

Certificare almeno:

- regola con 10 condizioni AND;
- regola con gruppi AND/OR/NOT;
- storico + prematch + live nella stessa regola;
- rolling window;
- score state;
- odds range;
- missing-data condition;
- stessa rule via UI e API produce stessi match;
- stesso rule JSON nel backtest produce risultato deterministico;
- nessun future leakage.

---

# Gate

Il sistema filtri non è completo finché:
- [ ] ogni campo normalizzato eleggibile può essere usato;
- [ ] AND/OR/NOT annidabili;
- [ ] rolling windows;
- [ ] historical aggregates;
- [ ] rule versioning;
- [ ] shared DSL UI/API/agent/backtest;
- [ ] explainability;
- [ ] performance hard test;
- [ ] no leakage.


---

# Competition & Season Coverage Registry — censimento storico obbligatorio

## Obiettivo

MatchPilot deve conoscere, per **ogni campionato**, esattamente:

- da quale stagione iniziano i dati;
- fino a quale stagione arrivano;
- quali stagioni sono complete;
- quali sono parziali;
- quali sono unavailable;
- quali campi/statistiche sono disponibili per ciascun periodo;
- quale provider copre cosa.

Esempio concettuale:

- Italy Serie A → FutPythonTrader dal 2019/20
- France Ligue 1 → FutPythonTrader dal 2020/21
- TotalCorner → range eventualmente diverso

I valori reali devono essere scoperti e certificati, non assunti.

---

# Registro canonico

Creare un registry persistente per competizione/stagione.

Campi minimi:

- internal_competition_id
- country
- canonical_league_name
- season
- season_start_date
- season_end_date
- provider
- provider_competition_id
- provider_season_id/slug
- first_data_date
- last_data_date
- coverage_status
- match_count
- expected_match_count se determinabile
- fields_available
- fields_coverage
- historical_complete
- prematch_available
- live_available
- odds_available
- events_available
- discovered_at
- verified_at
- last_audited_at
- evidence
- notes

---

# Stati coverage stagione

Ogni stagione deve avere uno stato tra:

- DISCOVERED
- CANDIDATE
- AVAILABLE
- PARTIAL
- COMPLETE
- UNAVAILABLE_404
- ERROR_REAL
- DEPRECATED
- REMOVED

Mai usare semplicemente “campionato supportato” senza indicare il periodo.

---

# First / Last available season

Per ogni campionato mostrare almeno:

- earliest FutPython season
- latest FutPython season
- earliest TotalCorner season/date
- latest TotalCorner season/date
- overlap period
- current season status

---

# Coverage per provider

## FutPythonTrader
Per ogni lega/stagione:
- match;
- colonne;
- coverage;
- earliest/latest;
- complete/partial;
- missing seasons.

## TotalCorner
Per ogni lega/stagione:
- schedule;
- match detail;
- odds;
- events;
- live retroactive;
- HISTORICAL_UPSTREAM;
- HISTORICAL_CAPTURED.

---

# Overlap FutPythonTrader × TotalCorner

Per ogni competizione:

`overlap_start = max(FPT_start, TC_start)`

`overlap_end = min(FPT_end, TC_end)`

Questo periodo deve essere usabile per:
- backtest combinati;
- trading model validation;
- GOAT benchmark;
- replay storico quando disponibile.

---

# UI

Creare pagina/sezione:

**Data Coverage → Competitions**

Per ogni campionato mostrare:
- paese;
- lega;
- provider;
- prima stagione;
- ultima stagione;
- numero stagioni;
- match;
- COMPLETE / PARTIAL;
- fields coverage;
- overlap FPT/TC.

Drill-down:
- tutte le stagioni;
- campi disponibili;
- match count;
- gap;
- anomalie.

---

# Filtri

Permettere:
- country;
- league;
- provider;
- season;
- complete only;
- partial;
- overlap available;
- live available;
- odds available;
- minimum seasons;
- minimum match count.

---

# Nuovi campionati futuri

Ogni nuova lega scoperta deve seguire automaticamente lo stesso contratto.

Pipeline:

1. DISCOVERED
2. candidate mapping
3. provider metadata fetch
4. historical range discovery
5. season enumeration
6. backfill
7. schema/coverage audit
8. mapping FPT↔TC
9. hard verification
10. VERIFIED/ACTIVE

Nessuna nuova lega entra direttamente in produzione.

---

# Nuova stagione futura

Quando inizia una nuova stagione:

1. rilevarla automaticamente;
2. creare season record;
3. classificare CANDIDATE;
4. verificare endpoint;
5. iniziare sync;
6. confermare dati reali;
7. promuovere AVAILABLE/COMPLETE progressivamente.

---

# Missing season detection

Esempio:

2019/20 COMPLETE
2020/21 COMPLETE
2021/22 missing
2022/23 COMPLETE

→ creare gap automatico e reconciliation.

Non assumere continuità solo perché prima e dopo esistono dati.

---

# Field evolution

Una lega può avere campi diversi tra stagioni.

Esempio:
- 2019: solo score/odds
- 2021: aggiunto xG
- 2024: aggiunto xA/shots advanced

Il registry deve registrare la coverage **per stagione e campo**.

---

# Backtest safety

Ogni backtest deve sapere:
- da quando la metrica esiste;
- in quali campionati;
- coverage minima;
- stagioni incluse.

Mai usare un campo come se fosse disponibile nel 2019 se appare solo dal 2022.

---

# Assistant queryability

L'assistente deve poter rispondere dal DB a domande tipo:

- “Da quale stagione abbiamo la Serie A?”
- “Quali leghe hanno almeno 5 stagioni complete?”
- “Dove abbiamo xG dal 2021?”
- “Quali campionati hanno overlap FutPython + TotalCorner di almeno 3 anni?”
- “Quali nuove leghe sono state scoperte ma non ancora verificate?”

---

# Alerting

Stessa chat Telegram.

Alert aggregati per:
- nuova lega;
- nuova stagione;
- stagione sparita;
- gap storico;
- coverage regressiva;
- nuova colonna in una stagione;
- provider mapping cambiato.

---

# Hard test

Certificare:
- almeno 10 campionati;
- almeno 3 paesi;
- leghe con start year differenti;
- una lega multi-stagione completa;
- una con gap;
- una con coverage fields cambiata nel tempo;
- nuovo campionato simulato;
- nuova stagione simulata;
- reconciliation automatica.

---

# Gate

Il catalogo dati non è completo finché:
- [ ] ogni lega ha earliest/latest;
- [ ] ogni stagione ha stato;
- [ ] match count per stagione;
- [ ] field coverage per stagione;
- [ ] overlap FPT/TC;
- [ ] gap detection;
- [ ] future league onboarding;
- [ ] future season onboarding;
- [ ] assistant query layer;
- [ ] UI coverage page.


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
