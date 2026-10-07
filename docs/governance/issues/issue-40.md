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

### #40 punto 9 — evidenza reale corrente

Non confondere main e branch trial: il codice del run è su `temp/betsapi-trial-collector`, non una feature nuova su main.

| Identificatore | Valore |
|---|---|
| Fix | [#124](https://github.com/zarbopiero963-droid/MatchPilot/pull/124), mergiata 07/10/2026 10:05:54Z |
| Commit | `1d835a70b68c70a449d627e32d27884b64269a43` |
| Deploy LIVE | `dep-db31j36gekts73acrqg0` |
| Istanza/run | `srv-db1cnrrncjis73c6fb50-m7rgj`; catena 07/10 10:06:30Z–11:06:28Z |
| Freeze invariato | `2026-10-06T11:18:19.484Z`; raw ID 1–82862; 82862 righe |
| Verdetto finale | `PROVIDER_TRIAL_FINAL_RECONCILIATION result=PASS mismatch_count=0`, 11:06:28.561942573Z (13:06:28 Europe/Rome) |
| Report generato | `/tmp/provider-trial-final-export/final_reconciliation_report.json` |
| Report SHA-256 | `a29a3a48a697cbfe835fbe8c3fba7c2ac18135cc5a1beb5f9b2de1000282be30` |
| Fonte verifica | [Render servizio](https://dashboard.render.com/web/srv-db1cnrrncjis73c6fb50), log della stessa istanza + codice gate al commit sopra; riletti 07/10 dopo autorizzazione workspace |

| Gate / marker UTC | Risultato |
|---|---|
| 10:06:30 FINAL_FREEZE | boundary invariato |
| 10:10:36 SCORETREND_SEGREGATION | 1657 raw segregati; sports28/competitions23400/coverage1336/events401349 |
| 10:49:37 EXPORT_COMPLETE | raw_expected=raw_exported=82862; 8 dataset |
| 10:50:15 ANALYTICS_PACKAGE_COMPLETE | 6 conteggi canonical coerenti; ScoreTrend contamination0; 13 viste smoke; v_coverage=1336 |
| 10:56:06 SECRET_SCAN | PASS; 25 file; finding_count0 |
| 10:56:22 FINAL_SHA256 | PASS; 26 file; transient0; analytics_manifest_reconciled=true |
| 11:06:28 FINAL_RECONCILIATION | PASS; mismatch0; DB record post-freeze0; 9 analytics file e 26 checksum entry verificati |

| Export grezzo | DB = righe = chiavi distinte | Duplicati / mancanti / extra |
|---|---:|---|
| records | 82862 | 0 / 0 / 0 |
| odds_observations | 821877 | 0 / 0 / 0 |
| sports | 29 | 0 / 0 / 0 |
| competitions | 23478 | 0 / 0 / 0 |
| coverage | 1414 | 0 / 0 / 0 |
| events | 401495 | 0 / 0 / 0 |
| odds_summary | 64446 | 0 / 0 / 0 |
| reconciliation_state | 1403 | 0 / 0 / 0 |

Canonical senza ScoreTrend: sports28, competitions23400, coverage1336, events401349, odds_observations821877, odds_summary64446: DB=righe=chiavi distinte; dup/missing/extra tutti0. ScoreTrend segregato1657: dup/missing/extra/row_check_failures0.
DuckDB536576 byte, SHA `28c877cc19d96b167ae8a5fd1b064d884243490e403b141b8b7e832d20306492`.
`final_checksums.json` SHA `1bfa1f18d5fe1c7bac4624e1a38898ea42913fb2be0243420eacd6d7f45a5134`; `SHA256SUMS.final.txt` SHA `c43d2e8bfc5797117bb7e8b254263b990b4fa2c34ec5022a43b232f5e6516811`.

Limite: il report in /tmp non è stato scaricato direttamente; la verifica è basata sui log reali e sul gate che rilegge DB/file/hash indipendentemente dal pager. Il report viene scritto dopo i checksum e ne è escluso (`OWN_OUTPUTS`), con hash proprio; non fingere che sia una delle 26 entry. Nessuna certificazione di portabilità, Drive, liquidità/fill, Strategy Lab, backtest o Market Rules. [FAIL storico punto 9](https://github.com/zarbopiero963-droid/MatchPilot/issues/40#issuecomment-6035422688) resta storico valido per quel run; i file coverage di quel run non vanno riusati.

### Residuo #40 — NON AVVIATO da questa PR

Fonte [punti residui archivio](https://github.com/zarbopiero963-droid/MatchPilot/issues/40#issuecomment-6024272329). I punti1–8 conservano le evidenze storiche nel proprio scope; il run post#124 rigenera la catena e completa il punto9. **9/17 punti con evidenza nel loro perimetro**, non “archivio finale certificato”:
- 10: manifest finale + data dictionary + catalogo Strategy Lab; **NON AVVIATO / OWNER DECISION REQUIRED per il prossimo lavoro**.
- Portabilità DuckDB: **APERTA**; viste con path assoluti /tmp; va risolta prima dell'upload definitivo, senza farla passare con il solo smoke locale.
- 11: struttura Google Drive; 12: upload; 13: readback; 14: size/SHA dopo readback; 15: readiness con limiti; 16: audit indipendente complessivo. **DA FARE**, non eseguiti qui.
- 17: keepalive/shutdown eventuale: **nessuno shutdown autorizzato**, gate completi + owner esplicito.

Il pacchetto su /tmp è effimero; il PASS9 non attesta upload esterno/durabilità. Destinazione vigente Google Drive cold archive, non runtime/ledger. Niente nuove fetch trial, niente cambi freeze, niente collector restart/redeploy. La finestra sicura per #20 non viene inferita dal solo PASS9.
Requisiti indicatore/DSL/backtest nel contratto archivio descrivono input/research readiness, non promuovono formule né duplicano #34/#28/#96/#99/#100.
I riferimenti precedenti a “collector attivo” come raccolta in corso, /export unico deliverable, OneDrive, ScoreTrend nel confronto e vecchio FAIL come stato corrente sono SUPERSEDED; le prove storiche restano.
Chiusura #40 solo dopo archivio/coverage/confronto/report/decisioni/gate owner del contratto; issue OPEN.

---

## Contratto dettagliato conservato

Requisiti, test e acceptance criteria sotto restano validi dove non contraddetti dalle decisioni vigenti sopra. **SUPERSEDED** riguarda le indicazioni obsolete di stato, priorità, conteggio, sequenza e ownership, non elimina scope o hard gate. Le evidenze nei commenti sono storiche e non vanno riscritte.

# CANONICAL FREEZE / ARCHIVE CONTRACT — 2026-10-06

Questo blocco prevale sui riferimenti precedenti a OneDrive, /export come unico deliverable e su qualunque uso non qualificato di strategy-ready/backtest-ready.

## Stato trial
La finestra Everything Trial è terminata circa il 2026-10-06 10:32 UTC. Da questo momento: niente nuove modifiche funzionali al collector; procedere a freeze/export/integrity; NON spegnere finché tutti i gate di shutdown non sono veri.

## Destinazione
Destinazione primaria finale: Google Drive, percorso logico MatchPilot/Archives/BetsAPI-Trial-2026-10-05_06/.
Google Drive è cold/research archive e recovery reference, NON database runtime, ledger operativo o sostituto di Neon.

## Freeze boundary
Registrare almeno: freeze_at_utc, max_raw_record_id o boundary equivalente, commit SHA collector, deploy ID, schema_version, adapter/parser version, archive_version, row counts per provider/family, min/max provider_time, min/max acquisition_time, ingestion_sequence boundary.
L'export congelato non deve includere record successivi al boundary.

## Modello temporale
Per ogni record/snapshot normalizzato quando applicabile: provider_time, acquisition_time, observed_at, effective_at, valid_from, valid_to, ingestion_sequence, revision, is_correction, corrects_record_id.
Regola PIT: match_id + as_of_time usa solo informazioni osservate/acquisite entro as_of_time. Una correzione ricevuta dopo T non retroagisce nel replay/backtest a T.

## Closing rule
closing_odds = ultima osservazione valida con provider/acquisition time <= kickoff_cutoff.
Salvare kickoff_cutoff, closing_rule_version, closing_source_record_id. Nessuna quota post-kickoff può essere PREMATCH/CLOSING.

## FEATURES vs LABELS
Separazione fisica/logica obbligatoria.
FEATURES: solo dati disponibili a as_of_time.
LABELS/OUTCOMES: FT/HT result, next goal, goal next 5m/10m, score change, draw broken, market outcome, settlement outcome, future market move.
Ogni label: label_name, label_value, label_available_at, source_record_ids. Vietato usare label_available_at > as_of_time come feature.

## Canonical identity
Ogni mapping cross-provider deve avere mapping_status = VERIFIED/CANDIDATE/AMBIGUOUS/UNMAPPED/REJECTED, mapping_confidence, mapping_method, source_record_ids ed eventuale canonical_match_id.
Supportare alias, reschedule, postponed, duplicate fixture, neutral venue, corrected kickoff. Solo VERIFIED è join autorevole.

## ScoreTrend exclusion
ScoreTrend è fuori scope. I raw già raccolti restano preservati ma segregati; non entrano in canonical tables, comparison views, feature/indicator/backtest layers. Manifest: scoretrend_excluded=true.

## Liquidity / execution assumptions
Il trial non certifica liquidità, exchange depth o matched fills. Salvare liquidity_status=UNAVAILABLE salvo prova reale certificata.
Hedge/cashout/dutching restano calcoli teorici; ROI paper deve dichiarare fill assumption.

## Readiness vocabulary
Non chiamare il trial archive Strategy Lab certified, backtest certified, Trading Engine certified o Market Rules certified.
Stati ammessi: QUERY_READY, REPLAY_RESEARCH_READY, STRATEGY_RESEARCH_READY, INDICATOR_INPUT_READY, MATH_INPUT_READY, BACKTEST_RESEARCH_READY, PROVIDER_COMPARISON_READY, con limiti espliciti.

## Formati canonici
Materializzare fisicamente: 00_manifest, 01_raw (JSONL compresso), 02_canonical (Parquet), 08_quality (Parquet/CSV), 13_comparison (Parquet/CSV), 15_checksums, più matchpilot_trial.duckdb.
Prematch/live/replay/features/strategy/backtest sono preferibilmente viste DuckDB o layer on-demand, non copie fisiche duplicate.

## DuckDB views minime
v_prematch, v_live, v_replay_asof, v_events, v_odds_timeline, v_market_movement, v_coverage, v_provider_comparison, v_strategy_fields, v_indicator_inputs, v_math_inputs, v_backtest_observations, v_outcomes.

## Strategy DSL metadata
strategy_field_catalog deve dichiarare datatype, unit, valid phases, allowed operators, null semantics, temporal semantics, coverage, provider availability, history availability, source paths, data contract version.
Operatori quando semanticamente validi: eq/ne, gt/gte/lt/lte, between, in/not_in, is_null/is_not_null, changed_by, increased_by, decreased_by, rolling_avg/sum/delta/min/max, consecutive_true, since_event, within_n_minutes_after_event.
Rolling standard ad alto uso possono essere precompute; custom windows on-demand per evitare esplosione combinatoria.

## Coverage semantics
Distinguere OBSERVED, MISSING, UNKNOWN_UPSTREAM, NOT_APPLICABLE, PROVIDER_UNAVAILABLE, COLLECTION_GAP, STALE. Esplicitare numeratore/denominatore quando conoscibili.

## Reconciliation semantics
Distinguere upstream missing, collector missed, provider error, network error, DB error, delayed record, correction, irrecoverable gap.

## Lineage/versioning
Ogni derived row multi-input deve supportare source_record_ids[], source_snapshot_ids[], transformation_id/version, normalization_version, feature/formula version, computed_at.
Versioni minime: archive_version, raw_schema_version, canonical_schema_version, normalization_version, provider_adapter_version, parser_version, feature_version, formula_version, data_contract_version, closing_rule_version.

## Export consistency
Neon raw count al freeze boundary = export raw count = manifest raw count. Fare lo stesso per ogni tabella canonical/derived materializzata.
Produrre reconciliation report con row/file counts, duplicate counts, ScoreTrend excluded counts, checksum inventory, known gaps e mismatch=0 oppure spiegati/accettati.

## Security scrub
L'archivio NON deve contenere BETSAPI_TOKEN, TotalCorner token, DATABASE_URL, Authorization headers, cookies, Render secrets o query string con secrets. Secret scan obbligatorio.

## Google Drive upload gate
Creare struttura deterministica, caricare, fare readback, confrontare size, mantenere SHA-256 nel manifest, evitare duplicati con naming/versione deterministici, creare README/index principale.

## Shutdown gate — TUTTI TRUE
- fetch fermate e freeze boundary registrato
- persistence queue = 0
- no current persistence error
- raw export completo
- canonical export completo per ciò che è supportato
- ScoreTrend segregato
- manifest completo
- checksum completi
- secret scan PASS
- export reconciliation PASS
- DuckDB open/query smoke PASS
- Google Drive upload completato
- Google Drive readback verificato
- report limiti del trial scritto
- keepalive disattivato o oltre cutoff
- #40 resta OPEN fino a comparison/report/owner decision

## Boundary del trial
Questo archivio è evidence/research archive del trial. Non sostituisce il full FPT production mirror, il full TotalCorner production archive, il futuro dataset MatchPilot, #99 accounting, #100 certification, #34/#28 certification. Missing data resta missing; nessuna coverage futura va inferita.

---
# Obiettivo

Non dimenticare il test temporaneo attualmente in corso sul servizio Render separato:

**`betsapi-trial-collector`**

Scopo: sfruttare il trial BetsAPI/Bet365 API da 1 giorno per raccogliere il massimo possibile di dati reali e confrontarli con le altre due fonti dati di MatchPilot:

- BetsAPI / Bet365 API
- TotalCorner API
- FutPythonTrader

Il servizio temporaneo `betsapi-trial-collector` raccoglie direttamente **BetsAPI + TotalCorner**. FutPythonTrader NON va duplicato dentro questo collector: il confronto usa il mirror/database FutPythonTrader già acquisito e certificato nella pipeline MatchPilot (#12), così da evitare richieste upstream inutili.

senza modificare `matchpilot-test` e senza interferire con la pipeline principale di MatchPilot.

---

# Stato storico di avvio — SUPERSEDED come stato corrente

Servizio Render separato:

- name: `betsapi-trial-collector`
- branch temporaneo: `temp/betsapi-trial-collector`
- servizio dedicato, separato da `matchpilot-test`
- `BETSAPI_TOKEN` presente
- `TOTALCORNER_API_TOKEN` presente
- collector attivo all'epoca dell'avvio; raccolta ora congelata

Ultimo stato verificato:
- BetsAPI token present = true
- TotalCorner token present = true

---

# Frequenze storiche raccolta — nessuna nuova fetch autorizzata

## BetsAPI

- InPlay Filter: ogni 30s
- dettaglio evento con `stats=1`: ogni 60s
- Upcoming calcio: ogni 5 min

## TotalCorner

- `/match/today?type=inplay`: ogni 30s
- `match/view/{id}`: ogni 60s sul campione
- `match/odds/{id}`: ogni 60s sul campione
- upcoming: ogni 5 min
- ended: ogni 5 min

---

# Dati da preservare

## BetsAPI
- event id
- our_event_id
- Bet365 FI/id
- sport_id
- time_status
- score
- timer
- scores
- league/team ids
- stats
- xG se disponibile
- quote/markets dove ottenibili
- latency
- timestamp acquisizione

## TotalCorner
- match id
- minute/status
- score
- HT score
- events
- odds
- asian
- goalLine
- cornerLine
- asianCorner
- attacks
- dangerousAttacks
- shotOn
- shotOff
- possession
- userRemarks
- odds/history lists:
  - asianList
  - goalList
  - cornerList
  - oddsList
  - asianHalfList
  - goalHalfList
  - cornerHalfList
  - oddsHalfList
- latency
- timestamp acquisizione

---

# Prova già dimostrata

Match:

**Delfines Del Este vs Cibao FC**

Corrispondenza osservata:

- BetsAPI `our_event_id = 13239277`
---

# Confronto da eseguire

Per match/competizioni/periodi comparabili, confrontare **BetsAPI, TotalCorner e FutPythonTrader**. Dove il confronto è live usare BetsAPI ↔ TotalCorner; dove è storico/prematch usare anche il mirror FutPythonTrader:

- copertura match
- latenza
- frequenza aggiornamenti
- score/minuto
- eventi
- attacks
- dangerous attacks
- SOT
- shots off
- possession
- corners
- cards
- xG
- quote
- Asian
- Goal Line
- Corner Line
- eventuali differenze e gap

Classificare per ogni campo:
- SAME
- EQUIVALENT
- SOURCE-SPECIFIC
- MISSING_IN_BETSAPI
- MISSING_IN_TOTALCORNER
- MISSING_IN_FUTPYTHONTRADER
- UNKNOWN

---

---

# Persistenza storica iniziale — SUPERSEDED da Neon + export congelato

All'avvio il collector salvava su file locale (non è l'attuale fonte autorevole del freeze):

`/tmp/provider-trial.jsonl`

Export disponibile tramite:

`/export`

## Rischio importante

Lo storage `/tmp` è effimero.

Prima possibile:
- esportare periodicamente
oppure
- aggiungere una destinazione persistente separata

senza contaminare la pipeline principale.

Non lasciare il trial finire senza aver salvato il dataset.

---

# Deliverable finale

Produrre un report con:

- intervallo temporale raccolto
- numero snapshot per provider
- numero match unici
- match comuni
- coverage per campo
- latency median/p95/max
- gap temporali
- errori / 429 / 5xx
- quota/request usage osservabile
- confronto live
- confronto prematch
- confronto odds
- confronto storico disponibile
- confronto con FutPythonTrader su storico, prematch, coverage campionati/stagioni e campi disponibili
- overlap BetsAPI ↔ TotalCorner ↔ FutPythonTrader dove realmente comparabile
- conclusione provider per use case
- cosa conviene usare in MatchPilot
- eventuale fallback architecture

Verdetto finale per area:
- BEST = BetsAPI
- BEST = TotalCorner
- BEST = FutPythonTrader
- COMPLEMENTARY
- NO MATERIAL DIFFERENCE

---

# Chiusura del servizio temporaneo

Dopo:
1. export completo dei dati;
2. verifica che il file esportato sia integro;
3. report finale salvato;
4. eventuale import persistente se utile;

spegnere/eliminare il servizio temporaneo `betsapi-trial-collector`.

Non lasciare il servizio attivo inutilmente dopo il trial.

---

# Regola owner

Questa issue serve da promemoria operativo.

Può essere marcata READY TO CLOSE solo quando:
- dataset esportato
- confronto completato
- report prodotto
- servizio temporaneo spento/eliminato
- nessun dato utile perso

La chiusura finale resta all'owner, salvo autorizzazione esplicita.


---

# Decisione owner — BetsAPI non sostenibile economicamente adesso

Vincolo economico attuale:

- BetsAPI/Bet365 API è stato valutato tecnicamente come molto interessante;
- costo indicativo attuale: circa **100 EUR/mese**;
- l'owner NON vuole assumere questo costo adesso;
- il trial va sfruttato al massimo per raccolta, confronto e reverse engineering funzionale;
- alla fine del trial il servizio temporaneo va spento/eliminato;
- BetsAPI NON diventa provider obbligatorio di MatchPilot in questa fase.

## Conseguenza architetturale

MatchPilot deve continuare a funzionare senza dipendenza da BetsAPI.

Priorità:
1. FutPythonTrader per storico/pre-match statistico;
2. TotalCorner come provider live/market principale;
3. BetsAPI classificato come FUTURE_OPTION / OPTIONAL_FALLBACK;
4. nessuna feature core può richiedere un abbonamento BetsAPI attivo.

## Obiettivo del trial

Usare il trial per imparare e salvare:
- struttura eventi;
- stats disponibili;
- timing;
- quote/mercati;
- mapping IDs;
- differenze vs TotalCorner;
- indicatori derivati osservabili.

Il valore del trial è creare conoscenza e dataset di confronto, non vincolare il prodotto a un costo ricorrente.

---

# Indicatori proprietari MatchPilot da progettare

MatchPilot deve poter costruire indicatori propri, espliciti, versionati e backtestabili usando principalmente dati TotalCorner + storico FutPythonTrader, ed eventualmente confrontati con BetsAPI durante il trial.

Indicatori candidati:

## Pressure Index
Combinazione normalizzata di:
- dangerous attacks;
- attacks;
- SOT;
- shots;
- corners;
- possession;
- variazione ultimi 5/10/15 minuti.

## Goal Pressure
Pressione orientata alla probabilità di goal imminente, usando quando disponibili:
- SOT recenti;
- xG recente;
- big chances / chances;
- ritmo attacchi;
- corners;
- Goal Line live;
- variazione quote.

## Momentum
Misura del cambio di inerzia:
- delta tra finestre consecutive;
- accelerazione/decelerazione pressione;
- variazione SOT/shots/corners;
- variazione possesso;
- market movement.

## Draw Risk
Fragilità/stabilità del pareggio corrente:
- score;
- minuto;
- pressione relativa;
- xG/SOT;
- quota draw;
- live odds;
- storico di scenari analoghi;
- rolling windows.

## Vulnerable Score
Fragilità dello score corrente, per esempio 1-0, 0-0, 1-1:
- minuto;
- pressione del team che perde;
- pressione del team in vantaggio;
- xG/SOT;
- dangerous attacks;
- live Goal Line;
- quote correct score / 1X2 quando disponibili;
- pattern storico simile.

## Contratto obbligatorio per ogni indicatore
Ogni valore deve avere:
- indicator_name;
- formula_version;
- input_fields;
- weights/parameters;
- rolling_window;
- source_snapshot_ids;
- computed_at;
- match_timestamp;
- coverage;
- freshness;
- confidence/data_quality.

Niente black box non auditabile.

## Backtest obbligatorio
Ogni indicatore deve poter essere testato su domande tipo:
- Vulnerable Score > 75 al 70' con score 1-0 → frequenza goal successivo;
- Goal Pressure > 80 + Over live > soglia → hit rate / ROI;
- Draw Risk alto → probabilità di rottura del pareggio;
- Pressure Index crescente per 3 snapshot → next-goal rate.

Nessun indicatore deve essere promosso nel Trading Engine solo perché "sembra buono": serve evidenza storica, N minimo, incertezza e no future leakage.


---

# Decisione owner — ScoreTrend escluso dal trial

Dal 2026-10-05 ScoreTrend.net è **fuori scope**.

ScoreTrend è escluso. Il trial e il report finale devono confrontare **BetsAPI / Bet365 API vs TotalCorner API vs FutPythonTrader**.

- nessuna nuova raccolta ScoreTrend;
- nessun confronto BetsAPI vs ScoreTrend;
- nessuna analisi degli indicatori proprietari ScoreTrend;
- eventuali record ScoreTrend già raccolti restano solo come dati storici e non fanno parte dei criteri del trial;
- deliverable, metriche e verdetto finale devono riguardare BetsAPI, TotalCorner e FutPythonTrader;
- FutPythonTrader entra nel confronto tramite i dati già persistiti/normalizzati della pipeline #12, non tramite nuovo polling nel collector temporaneo.
