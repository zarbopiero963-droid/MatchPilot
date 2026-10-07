# MatchPilot — mappa integrazioni e ownership di dominio

## Stato operativo corrente — 07/10/2026

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

### Rischio aperto PIT / parser / identità / reprocessing FPT — #12

Contratto vigente: **stesso timestamp T + stesso data contract version → stesso risultato riproducibile**, usando soltanto dati disponibili a T; nessuna riscrittura silenziosa.
Evidenza tecnica su main `5b39f33`:
- `src/providers/futpython/reprocess.mjs::reprocessRaw` inserisce nuovo output parser con l'`acquired_at` dello snapshot originale;
- `migrations/014-fpt-normalized-layer.sql::fpt_match_facts_at` seleziona `acquired_at <= T` e ordina anche per `version_id DESC`, senza argomento di versione parser/data-contract; `fpt_match_facts` segue l'output più recente;
- `test/fpt-reprocessing.test.mjs` prova dry-run/apply/idempotenza/raw intatto e facts aggiornati, ma non certifica invariabilità di una stessa query storica prima/dopo cambio parser/identity mapping.

Il dry-run no-op certificato il 05/10 non dimostra questo caso. Registrare in #12: data disponibile/osservata a T, snapshot ID/hash, versione parser/schema/transform/data-contract, identità e mapping/versioni, reprocessing run/time, output e test **prima e dopo la correzione**. Test richiesti: T anteriore/posteriore a ingest/correzione, parser v1/v2, rename/alias/cambio ID, aggregati senza futuro, riproduzione delle versioni storiche e raw immutato. **RISCHIO APERTO**, nessuna correzione runtime qui. La scelta non registrata tra replay “come conosciuto allora” e ricostruzione col parser nuovo è **OPEN / OWNER DECISION REQUIRED**; il requisito di riproducibilità resta vincolante. Apply produzione e cancellazione raw richiedono autorizzazione specifica owner.

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

## Matrice di supporto

[Matrice completa requisiti → fonti → owner → dipendenze → card → test → evidenze → stato → gate](governance/reconciliation-matrix-2026-10-07.md). Non è una roadmap aggiuntiva; #104 conserva le card granulari e le issue di dominio i loro acceptance criteria.


Fonte canonica dell'ordine di lavoro: issue **#97 — ROADMAP**, revisione owner del 06/10/2026.
Questo file riassume la gerarchia #3 → #97 → #104 con gli override owner successivi; non è una master e non autorizza attività.

Gerarchia delle fonti di verità:

1. decisioni dell'owner con fonte/data/scope;
2. #3 master prodotto/stato globale;
3. #97 roadmap/fasi;
4. #104 piano operativo PR;
5. issue di dominio e acceptance criteria;
6. README.md, CLAUDE.md, AGENTS.md;
7. `docs/`;
8. mock UX (`docs/mockups/matchpilot-trading-os.html`).

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

#102 Trading Copilot attraversa più fasi. Le vecchie TCOP-PR-01…09 sono SUPERSEDED come sequenza pre-MCP da TCOP-CORE-01..04 in #104; conservano i requisiti non contraddetti. I tool contestuali arrivano dopo i domini necessari e #28; il polish conversazionale #44 è successivo. La certificazione agent-driven passa da #98. La card visuale è fase 15 (TCOP-PR-09). Dipende da #94, #96, #100, #99, #34, #28, #98 e #44.

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
| #34 Strategy Lab | definizione, Indicator Library, DSL, versioni, backtest, assegnazione MM, matching | ledger |
| #28 Trading Engine | piano pre-partita, segnale live, BACK / LAY / DUTCH / NO TRADE, entry intent, invalidation, exit intent, hedge intent | ledger, esecuzione |
| #45 Execution | ordini reali, place / cancel / replace, fill, riconciliazione provider, kill switch | policy, settlement |
| #44 Assistente globale | assistente generale, query, explainability | logica finanziaria |
| #102 Trading Copilot | orchestrazione del contesto e spiegazione dentro la partita | qualunque calcolo o stato: consuma #94, #96, #100, #99, #34, #28 via #98 |

Regola: #96 legge da #99 bankroll, fondi riservati, liability aperta, esposizione e P/L, ma non li scrive. Le progressioni avanzano solo sugli eventi di settlement finale pubblicati da #99.

## Stati operativi del Money Management

| Stato | Comportamento |
| --- | --- |
| `ACTIVE_OPERATIONAL` | decide ALLOW / REDUCE / BLOCK / SIMULATION_ONLY, può autorizzare paper trade; #99 registra posizioni/ledger, aggiorna la sequenza dopo il settlement |
| `ADVISORY_ONLY` | continua dati, segnali, analisi, stake e liability teorici, consigli HOLD / HEDGE / EXIT; blocca nuove paper position, riserve, modifiche all'esposizione, scritture finanziarie nel ledger e avanzamento delle progressioni per trade non registrati. Output marcato "ADVISORY ONLY — operazione non registrata" |
| `PAUSED` | nessuna valutazione operativa automatica; dati e storico leggibili |
| `ARCHIVED` | non utilizzabile per nuove strategie o trade; storico immutabile |

STOP OPERATIONS porta in `ADVISORY_ONLY`, RESUME OPERATIONS riporta `ACTIVE_OPERATIONAL`. L'indicazione precedente di continuazione chiusura/settlement delle posizioni già aperte non risolve il divieto ADVISORY_ONLY sulle scritture #99: **OPEN / OWNER DECISION REQUIRED** come sopra. Le letture/consigli non autorizzano scritture contabili. Nessun trade viene ricostruito retroattivamente per il periodo advisory.

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

## Stato storico al 06/10/2026 — SUPERSEDED per lo stato globale corrente

| Issue | Stato |
| --- | --- |
| #12 | evidenza storica CERTIFIED WITH KNOWN LIMITATIONS 20/20; READY TO CLOSE globale SUPERSEDED dall'audit 412 |
| #31 | parte FutPythonTrader implementata e verificata dentro il certificato #12; parte TotalCorner dopo #20 |
| #40 | vecchia classificazione discovery; stato corrente freeze/PASS9 descritto sopra |
| tutte le altre issue di dominio | SPECIFIED: nessuna implementazione backend |

Il mock rappresenta come DEMO molte funzioni di issue ancora SPECIFIED. Questo non le rende IMPLEMENTED.
