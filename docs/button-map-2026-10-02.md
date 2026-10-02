> **Aggiornamento issue #2 — 2 ottobre2026 23:08 UTC /3 ottobre01:08 Europe/Rome:** 4/15 criteri conclusi (3 PASSED,1 NON DISPONIBILE);11 aperti. [Registro corrente dei test reali](issue-2-qa-progress-2026-10-02.md). L'issue resta aperta e non chiudibile. Le sezioni sottostanti conservano inventario e risultati storici; per i residui H2H/logout/manuale e i nuovi test fa fede il registro aggiornato. 315 controlli censiti non equivalgono a315 certificati. Il run completato non equivale a un criterio superato.

# Mappa pulsanti e certificazione per scenario — 2 ottobre 2026

## Ambito ed esito
Mappatura interna della sorgente autorizzata https://layscore.goatbettingexchange.com/. Il portale di accesso è https://goatbettingexchange.com/portale. Questi riferimenti non devono comparire nell'interfaccia finale MatchPilot.

Registro di 315 voci deduplicate da 96 inventari DOM: **inventariato non significa cliccato o certificato**. Il numero comprende controlli, campi, contenitori cliccabili rilevati e varianti contestuali; non è un conteggio dei pulsanti certificati. Le famiglie ripetute per partita sono provate su partite campione, non su ogni replica delle 23 partite. La matrice seguente distingue asserzioni superate, clic osservati e anomalie. I journal JSON conservano esiti ed errori originali; un run “complete” non implica che tutti i suoi test siano passati.

La mappa si integra con [catalogo completo](source-catalog-2026-10-02.md) e [certificazione precedente](control-certification-2026-10-02.md): 12 sezioni e 13 tab dettaglio già lette con scroll. Prove browser desktop; font, immagini e media bloccati dal harness. Non è una certificazione visiva mobile, audio, algoritmica o del prodotto MatchPilot.

## Matrice delle azioni effettivamente provate

| Percorso / prerequisito | Controlli / azione | Output osservato o asserzione | Esito e prova |
|---|---|---|---|
| Globale, login valido | Data visualizzata: clic e ricerca input date anche nascosti | Nessun selettore data o cambiamento osservato | **Non certificato**, v29/v34/v36; navigazione tra giornate da costruire in MatchPilot |
| Globale | #analyzeBtn → #closeImportBtn | Apre/chiude importazione | **Passed**, v31/v35 |
| Importazione | #runImportBtn, testo vuoto | Invocazione percorso senza input | **Observed**, v35; importazione valida non vuota da provare |
| Globale | #clearPalinsestoBtn → Annulla / Conferma | Dialogo HTML, annullamento; dopo conferma feed automatico ancora disponibile; reload ripristina stessi 23 team | Annulla **passed**; aspettativa zero righe **failed** v34/v35. Svuotamento manuale popolato **non certificato** |
| Globale | Link GOAT LATE SHARP / GOAT ODDS MOVERS | Nuova pagina Telegram, titolo letto, popup chiuso | **Observed**, v39; nessun ingresso o messaggio |
| Globale | #logoutBtn | Clic effettuato, login non visibile entro attesa 1200 ms | **Failed**, v39; indagare redirect/attesa/sessione prima di certificare |
| Palinsesto | Tab sorgente, Apri nel Lay Score | Carica 23 partite; v39 attende listener/tab prima di proseguire | **Observed**, v34/v35/v38/v39 |
| Dashboard | Analisi, ROI STR, BETFAIR ODD, DETTAGLIO, segnale, strategia, rischio basso/medio/alto | Pannelli aperti, contenuto e controlli acquisiti con scroll | **Observed**, v34/v35; non dimostra correttezza di tutti i valori |
| Dashboard | #pandoraAnalysisClose, #roiStrClose, #closeDetailBtn, ✕ quote | Chiusure prima dell'azione successiva | Clic effettivi v34/v35; quote: Escape inefficace, usare ✕ visibile senza ID |
| Dashboard | Stella data-watch, aggiungi/ripristina | Stato monitorata cambia e ritorna | **Passed**, v34 |
| Dashboard | Best of day / articolo partita | Apertura dettaglio | **Observed**, v35 |
| Dashboard | #sortOrder Score / Rischio | Ordine dell'intera lista, non soltanto valore select | **Passed**, v35; Orario/Campionato/Nome selezionati nelle prove precedenti |
| Dashboard | Toggle layout | Classi, geometria e disposizione cambiano/ripristinate | **Passed**, v36; sostituisce errata aspettativa sul titolo v35 |
| Dashboard → Strategie | 19 checkbox reali, attivazione/ripristino; 9 scelte lega; reset | 18 checkbox attivabili/ripristinabili; lega e reset verificati | v36: **49 passed / 1 failed**; H2H attivazione timeout |
| Dashboard → Strategie | H2H input e label | Anche clic etichetta va in timeout; ripristino stato iniziale passa | **Failed**, v39; non considerare H2H certificato |
| Live → toolbar | 12 toggle; Card/Tabella; Grid/Lista; due selezioni suono | Classi toggle e viste asserite; altre azioni osservate | v31: 40 azioni, incluse 16 asserzioni; audio reale non ascoltato |
| Live → Scores | Casa/Pareggio/Ospite + 16 punteggi; seleziona/azzera; Time reset | Menu/opzioni cliccati | **Observed**, v31; combinazioni esaustive e ordine tabella non asseriti |
| Live → campionati | Norway / UEFA, apertura/chiusura menu | Filtro invocato | **Observed**, v35 |
| Live → singola card | Timing, HT, radar, Gol+, risultato esatto, Dettaglio, Stats+ | Pannelli e controlli acquisiti con scroll | **Observed**, v34; iframe radar e algoritmi non certificati |
| Live → card/tabella | Preferito aggiungi/ripristina; monitorata finestra separata; nascondi | Stato, popup e azioni registrate | **Observed**, v34/v35; persistenza hide tra dispositivi non certificata |
| Live → quote | data-odds-tab 1x2/ou/btts/cs | Quattro mercati aperti | **Observed**, v34; nessuna operazione economica |
| Live → Stats+ | n=5/10/20; v=all/ha; s=all/lg/h2h/race | Tutte le 9 combinazioni di selettore cliccate | **Observed**, v34/v35; entrambi data-stp e data-val necessari |
| Live → Tabella | 16 data-live-sort; timing/HT; modali Gol+/CS | Clic e inventario pannelli | **Observed**, v34/v35; correttezza ordine tutti gli header ancora da asserire |
| Live → BETFAIR | Link esterno | Apertura pagina/titolo, chiusura | **Observed**, v34; niente scommesse |
| Asian Odds | Tutte/Live/Non iniziate; 5 linee principali e 5 extra; tutte linee | Controlli button con data-status/data-line, menu extra riaperto ad ogni scelta | **Observed**, v34: 14 azioni; ricerche/Legend nel catalogo precedente |
| Archivio → dettaglio | Vinto/Perso → rischio €10, quota lay 3 → Conferma; Saltato | Tre esiti QA distinti; due form e valori verificati | **Passed** su esiti/valori, v38; valori sintetici di test, non rendimento reale |
| Archivio popolato | Tutte/Vinte/Perse/Saltate | Ogni filtro mostra solo gli esiti attesi | **Passed**, v38 |
| Archivio popolato | Cancella tutto → Annulla / Conferma | Annulla conserva; Conferma elimina esclusivamente tre fixture QA autorizzate | **Passed** su cancellazione, v38; nessuno storico personale presente inizialmente |
| Archivio, nuovo contesto | Riapertura dopo cleanup | Nessuna operazione registrata | **Passed**, v39; tre guard QA cleaned=true, cleanupNeeded=false |
| Backtest / filtri Live salvati | 5+5 simultanei, sesto rifiutato, richiamo, reload, cancellazione fixture | Limiti e salvataggi già asseriti | v27/v28, certificazione precedente; reset quota giornaliero e tra dispositivi non certificati |

## Evidenze e riproduzione
Run canonicali: `source-mapping-2026-10-02-qa-v31`, v34, v35, v36, v37, v38, v39. Prefisso finale archivio `source-mapping-2026-10-02-qa-v38-attempt-1790965916625-2nhomilxomo`; finale H2H/sessione `source-mapping-2026-10-02-qa-v39-attempt-1790966265483-wx6h5exiv68`.

Neon: tabelle `matchpilot_test_runs` e `matchpilot_source_snapshots`. Query di lettura: filtrare run_id/prefisso snapshot, leggere `data.section`, `data.results`, controlli e copertura scroll. [Registro JSON](button-map-2026-10-02.json) conserva selettori, label, snapshot e journal recuperati. Le evidenze non includono password/token.

Eseguire con login autorizzato, una sola istanza browser e run-id nuovo; leggere ogni journal prima di dichiarare successo. Attendere tab visibili/listener e chiudere modali esplicitamente. Non ripetere backtest che consumano quota giornaliera. Non usare Cancella tutto con dati personali: le prove qui avevano lista inizialmente vuota e fixture QA riconosciute.

## Parser e integrazione futura
Gli ID Pandora contengono indici che cambiano al reload: non usarli come chiave canonica partita. Conciliare squadra/lega/kickoff/data e provider ID quando verificato. Selettori parametrizzati `{matchId}` descrivono una famiglia, non un ID riutilizzabile. Per Stats+ mantenere data-stp **e** data-val. Annulla/Conferma e ✕ senza ID devono essere cercati nel pannello visibile corretto.

Registrare pulsanti sconosciuti come capabilities nuove; non cliccarli automaticamente. Campi opzionali mancanti non devono interrompere la lettura; campi obbligatori assenti devono produrre stato incompleto, mai valori inventati. Parsing numerico per campo/locale (archivio decimali con punto, altri widget con virgola). Gol++ e QE hanno descrizioni da riconciliare; commissione/net target Ladder da verificare. 16 test locali parser/stato/finanza passati, controlli sintattici harness passati; non equivalgono a test del prodotto finale.

## Residui espliciti
- Risolvere/ritestare H2H Dashboard e logout; cambio data sorgente non disponibile nel percorso osservato.
- Import manuale non vuoto, cancellazione palinsesto manuale popolato, persistenza tra dispositivi, reset limiti giornalieri, combinazioni filtri e ordinamento dei 16 header Live.
- Validare algoritmo/serie equity cronologica, Gol++/QE, net target Ladder, iframe, audio e resa mobile.
- Costruire pannello operativo MatchPilot: elenco partite a sinistra, scelta giornata/storico, prematch e timeline Live completa con scroll.
- Costruire archivio dati normalizzati, bankroll/ledger virtuale e money management.
- Implementare analisi OpenRouter con output strutturato e verifica dati; variabili/API configurate non equivalgono ad analisi generata.
- Implementare monitoraggio continuo ogni minuto, scheduling, retry, idempotenza e collaudo di una partita intera e consultazione il giorno dopo.
- Betwatch FR, quote back/lay e liquidità rimangono fase 2.

## Inventario dei controlli rilevati
Ogni riga sotto è **inventariata**. La certificazione deriva dalla matrice e dai journal, non dalla presenza in questo elenco.

| # | Contesto | Selettore / identificatore | Label / titolo | Snapshot esempio |
|---|---|---|---|---|
| 1 | Global | A: GOAT LATE SHARP | GOAT LATE SHARP | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Dashboard-map-initial |
| 2 | Global | A: GOAT ODDS MOVERS | GOAT ODDS MOVERS | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Dashboard-map-initial |
| 3 | Global | button: data visualizzata | 02 OTT 2026 | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Dashboard-map-initial |
| 4 | Global | #analyzeBtn | ANALIZZA PALINSESTO | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Dashboard-map-initial |
| 5 | Global | #clearPalinsestoBtn | SVUOTA PALINSESTO | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Dashboard-map-initial |
| 6 | Global | [data-view="dashboard"] | Dashboard | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Dashboard-map-initial |
| 7 | Global | [data-view="palinsesto"] | Palinsesto | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Dashboard-map-initial |
| 8 | Global | [data-view="live"] | Live | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Dashboard-map-initial |
| 9 | Global | [data-view="analisi"] | Analisi | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Dashboard-map-initial |
| 10 | Global | [data-view="laygoleada"] | Lay Goleada Favorito | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Dashboard-map-initial |
| 11 | Global | [data-view="backtest"] | Backtest Storico | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Dashboard-map-initial |
| 12 | Global | [data-view="asianodds"] | Asian Odds | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Dashboard-map-initial |
| 13 | Global | [data-view="monitorate"] | Monitorate | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Dashboard-map-initial |
| 14 | Global | [data-view="dutching"] | Ladder Dutching | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Dashboard-map-initial |
| 15 | Global | [data-view="legastats"] | Statistiche Lega | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Dashboard-map-initial |
| 16 | Global | [data-view="guida"] | Guida | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Dashboard-map-initial |
| 17 | Global | [data-view="archivio"] | Archivio | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Dashboard-map-initial |
| 18 | Global | #logoutBtn | Esci | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Dashboard-map-initial |
| 19 | Dashboard | [data-filter="all"] | TUTTE | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Dashboard-map-initial |
| 20 | Dashboard | [data-filter="banca"] | BANCA | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Dashboard-map-initial |
| 21 | Dashboard | [data-filter="controlla"] | GIOCABILE | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Dashboard-map-initial |
| 22 | Dashboard | [data-filter="osserva"] | OSSERVA | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Dashboard-map-initial |
| 23 | Dashboard | [data-filter="scarta"] | SCARTA | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Dashboard-map-initial |
| 24 | Dashboard | #strategyToggleBtn | STRATEGIE | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Dashboard-map-initial |
| 25 | Dashboard | BUTTON: Vista tabella | Vista tabella | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Dashboard-map-initial |
| 26 | Dashboard | #resetStrategyFiltersBtn | Reset filtri | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Dashboard-map-initial |
| 27 | Live | [data-live-view="card"] | ▦ Card | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Live-map-initial |
| 28 | Live | [data-live-view="table"] | ▤ Tabella | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Live-map-initial |
| 29 | Live | [data-live-toggle="hot"] | HOT | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Live-map-initial |
| 30 | Live | [data-live-toggle="presMedia"] | 📶 Media | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Live-map-initial |
| 31 | Live | [data-live-toggle="presBassa"] | 📶 Bassa | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Live-map-initial |
| 32 | Live | [data-live-toggle="fav"] | Preferiti | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Live-map-initial |
| 33 | Live | [data-live-toggle="ht1"] | 1️⃣ 1° Tempo | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Live-map-initial |
| 34 | Live | [data-live-toggle="ht2"] | 2️⃣ 2° Tempo | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Live-map-initial |
| 35 | Live | [data-live-toggle="favLosing"] | ⚠️ Favorita Perde | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Live-map-initial |
| 36 | Live | [data-live-toggle="odds"] | Quote | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Live-map-initial |
| 37 | Live | [data-live-toggle="pressure"] | 📶 Pressione | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Live-map-initial |
| 38 | Live | [data-live-toggle="stats"] | 📊 Statistiche | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Live-map-initial |
| 39 | Live | [data-live-statview="list"] | ☰ Lista | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Live-map-initial |
| 40 | Live | [data-live-statview="grid"] | ▦ Griglia | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Live-map-initial |
| 41 | Live | [data-live-toggle="sound"] | Suoni | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Live-map-initial |
| 42 | Live | [data-live-soundpick=""] | Classico Oh Yesss! | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Live-map-initial |
| 43 | Live | [data-live-toggle="insights"] | Insight | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Live-map-initial |
| 44 | Live | [data-live-lgtoggle=""] | Tutti i campionati ▾ | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Live-map-initial |
| 45 | Live | [data-live-sctoggle=""] | 🎯 Scores ▾ | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Live-map-initial |
| 46 | Live | [data-live-tmtoggle=""] | 🕐 Time ▾ | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Live-map-initial |
| 47 | Live | [data-live-advtoggle=""] | ⚙️ Filtri avanzati | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Live-map-initial |
| 48 | Live | [data-live-lavstrattoggle=""] | ⭐ Le mie strategie ▾ | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Live-map-initial |
| 49 | Live | [data-live-scclose=""] | ✕ | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Live-map-scores |
| 50 | Live | [data-live-scselall=""] | Select All | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Live-map-scores |
| 51 | Live | [data-live-scclear=""] | Clear | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Live-map-scores |
| 52 | Live | [data-live-scoreopt="home"] | 🏠 Home winning | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Live-map-scores |
| 53 | Live | [data-live-scoreopt="away"] | ✈️ Away winning | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Live-map-scores |
| 54 | Live | [data-live-scoreopt="draw"] | 🤝 Draws | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Live-map-scores |
| 55 | Live | [data-live-scoreopt="0-0"] | 0-0 | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Live-map-scores |
| 56 | Live | [data-live-scoreopt="1-0"] | 1-0 | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Live-map-scores |
| 57 | Live | [data-live-scoreopt="0-1"] | 0-1 | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Live-map-scores |
| 58 | Live | [data-live-scoreopt="1-1"] | 1-1 | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Live-map-scores |
| 59 | Live | [data-live-scoreopt="2-0"] | 2-0 | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Live-map-scores |
| 60 | Live | [data-live-scoreopt="0-2"] | 0-2 | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Live-map-scores |
| 61 | Live | [data-live-scoreopt="2-1"] | 2-1 | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Live-map-scores |
| 62 | Live | [data-live-scoreopt="1-2"] | 1-2 | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Live-map-scores |
| 63 | Live | [data-live-scoreopt="2-2"] | 2-2 | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Live-map-scores |
| 64 | Live | [data-live-scoreopt="3-0"] | 3-0 | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Live-map-scores |
| 65 | Live | [data-live-scoreopt="0-3"] | 0-3 | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Live-map-scores |
| 66 | Live | [data-live-scoreopt="3-1"] | 3-1 | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Live-map-scores |
| 67 | Live | [data-live-scoreopt="1-3"] | 1-3 | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Live-map-scores |
| 68 | Live | [data-live-scoreopt="3-2"] | 3-2 | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Live-map-scores |
| 69 | Live | [data-live-scoreopt="2-3"] | 2-3 | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Live-map-scores |
| 70 | Live | [data-live-scoreopt="3-3"] | 3-3 | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Live-map-scores |
| 71 | Live | [data-live-tmclose=""] | ✕ | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Live-map-time |
| 72 | Live | [data-live-tmreset=""] | Reimposta (0'–120') | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Live-map-time |
| 73 | Live | [data-live-lgall=""] | ✓ Tutti i campionati | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Live-map-league |
| 74 | Asian Odds | [data-legend="asianodds"] | ? Legend | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Asian Odds-map-initial |
| 75 | Asian Odds | [data-status="all"] | Tutte | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Asian Odds-map-initial |
| 76 | Asian Odds | [data-status="live"] | Live | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Asian Odds-map-initial |
| 77 | Asian Odds | [data-status="scheduled"] | Non iniziate | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Asian Odds-map-initial |
| 78 | Asian Odds | [data-line=""] | Tutte 95 | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Asian Odds-map-initial |
| 79 | Asian Odds | [data-line="2.25"] | 2.25 22 | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Asian Odds-map-initial |
| 80 | Asian Odds | [data-line="2.5"] | 2.5 19 | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Asian Odds-map-initial |
| 81 | Asian Odds | [data-line="2.75"] | 2.75 14 | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Asian Odds-map-initial |
| 82 | Asian Odds | [data-line="3"] | 3 22 | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Asian Odds-map-initial |
| 83 | Asian Odds | [data-line="3.25"] | 3.25 15 | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Asian Odds-map-initial |
| 84 | Asian Odds | BUTTON: altre 5 ▾ | altre 5 ▾ | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Asian Odds-map-initial |
| 85 | Asian Odds | [data-line="1.75"] | 1.75 3 | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Asian Odds-map-other-lines |
| 86 | Asian Odds | [data-line="2"] | 2 8 | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Asian Odds-map-other-lines |
| 87 | Asian Odds | [data-line="3.5"] | 3.5 5 | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Asian Odds-map-other-lines |
| 88 | Asian Odds | [data-line="3.75"] | 3.75 3 | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Asian Odds-map-other-lines |
| 89 | Asian Odds | [data-line="4.25"] | 4.25 3 | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Asian Odds-map-other-lines |
| 90 | Palinsesto | #palTabPandora | ● GOAT | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Palinsesto-map-initial |
| 91 | Palinsesto | #palTabManuale | MANUALE | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Palinsesto-map-initial |
| 92 | Palinsesto | BUTTON: ▶ Apri nel Lay Score → | ▶ Apri nel Lay Score → | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Palinsesto-map-initial |
| 93 | Archivio | [data-arch-filter="all"] | TUTTE | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Archivio-map-initial |
| 94 | Archivio | [data-arch-filter="win"] | ✅ VINTE | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Archivio-map-initial |
| 95 | Archivio | [data-arch-filter="loss"] | ❌ PERSE | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Archivio-map-initial |
| 96 | Archivio | [data-arch-filter="skip"] | ⏭ SALTATE | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Archivio-map-initial |
| 97 | Archivio | #archiveClearBtn | 🗑 CANCELLA TUTTO | source-mapping-2026-10-02-qa-v29-attempt-1790961206164-z3yoyb940c-Archivio-map-initial |
| 98 | Dashboard | #bestOfDay | 🏆 BEST OF THE DAY ★ NORWAY 1. DIVISION 19:00 3-0 23' RA 9° Ranheim V P P S S VS Egersund 8° EG | source-mapping-2026-10-02-qa-v31-attempt-1790961827069-gp37eqbqyol-Palinsesto-map-initial |
| 99 | Dashboard | [data-watch="{matchId}"] | ★ | source-mapping-2026-10-02-qa-v31-attempt-1790961827069-gp37eqbqyol-Palinsesto-map-initial |
| 100 | Dashboard | [data-betfair-btn="{matchId}"] | BETFAIR ODD | source-mapping-2026-10-02-qa-v31-attempt-1790961827069-gp37eqbqyol-Palinsesto-map-initial |
| 101 | Dashboard | [data-pandora-analysis="{matchId}"] | 🧠 Analisi ▾ | source-mapping-2026-10-02-qa-v31-attempt-1790961827069-gp37eqbqyol-Palinsesto-map-initial |
| 102 | Dashboard | [data-roi-str="{matchId}"] | 📊 ROI STR | source-mapping-2026-10-02-qa-v31-attempt-1790961827069-gp37eqbqyol-Palinsesto-map-initial |
| 103 | Palinsesto | [data-filter="all"] | TUTTE | source-mapping-2026-10-02-qa-v31-attempt-1790961827069-gp37eqbqyol-Palinsesto-map-initial |
| 104 | Palinsesto | [data-filter="banca"] | BANCA | source-mapping-2026-10-02-qa-v31-attempt-1790961827069-gp37eqbqyol-Palinsesto-map-initial |
| 105 | Palinsesto | [data-filter="controlla"] | GIOCABILE | source-mapping-2026-10-02-qa-v31-attempt-1790961827069-gp37eqbqyol-Palinsesto-map-initial |
| 106 | Palinsesto | [data-filter="osserva"] | OSSERVA | source-mapping-2026-10-02-qa-v31-attempt-1790961827069-gp37eqbqyol-Palinsesto-map-initial |
| 107 | Palinsesto | [data-filter="scarta"] | SCARTA | source-mapping-2026-10-02-qa-v31-attempt-1790961827069-gp37eqbqyol-Palinsesto-map-initial |
| 108 | Palinsesto | #strategyToggleBtn | STRATEGIE | source-mapping-2026-10-02-qa-v31-attempt-1790961827069-gp37eqbqyol-Palinsesto-map-initial |
| 109 | Palinsesto | BUTTON: Vista tabella | Vista tabella | source-mapping-2026-10-02-qa-v31-attempt-1790961827069-gp37eqbqyol-Palinsesto-map-initial |
| 110 | Palinsesto | #resetStrategyFiltersBtn | Reset filtri | source-mapping-2026-10-02-qa-v31-attempt-1790961827069-gp37eqbqyol-Palinsesto-map-initial |
| 111 | Dashboard | [data-detail="{matchId}"] | BANCA LAY 0-0 Top Lay: 0‑0 · 1‑0 NETHERLANDS EERSTE DIVISIE 21:00 HE 14° Helmond Sport S S V V  | source-mapping-2026-10-02-qa-v31-attempt-1790961827069-gp37eqbqyol-Palinsesto-map-initial |
| 112 | Dashboard | [data-action="{matchId}"] | BANCA LAY 0-0 Top Lay: 0‑0 · 1‑0 | source-mapping-2026-10-02-qa-v31-attempt-1790961827069-gp37eqbqyol-Palinsesto-map-initial |
| 113 | Dashboard | [data-strategy="{matchId}"] | LAY 0-0 1.8% O1.5 81% BTTS 65% BETFAIR ODD | source-mapping-2026-10-02-qa-v31-attempt-1790961827069-gp37eqbqyol-Palinsesto-map-initial |
| 114 | Palinsesto | [data-risk="basso"] | RISCHIO BASSO | source-mapping-2026-10-02-qa-v31-attempt-1790961827069-gp37eqbqyol-Palinsesto-map-initial |
| 115 | Dashboard | [data-open-detail="{matchId}"] | DETTAGLIO | source-mapping-2026-10-02-qa-v31-attempt-1790961827069-gp37eqbqyol-Palinsesto-map-initial |
| 116 | Palinsesto | [data-risk="medio"] | RISCHIO MEDIO | source-mapping-2026-10-02-qa-v31-attempt-1790961827069-gp37eqbqyol-Palinsesto-map-initial |
| 117 | Palinsesto | [data-risk="alto"] | RISCHIO ALTO | source-mapping-2026-10-02-qa-v31-attempt-1790961827069-gp37eqbqyol-Palinsesto-map-initial |
| 118 | Dashboard | [data-risk="basso"] | RISCHIO BASSO | source-mapping-2026-10-02-qa-v31-attempt-1790961827069-gp37eqbqyol-Dashboard-map-initial |
| 119 | Dashboard | [data-risk="medio"] | RISCHIO MEDIO | source-mapping-2026-10-02-qa-v31-attempt-1790961827069-gp37eqbqyol-Dashboard-map-initial |
| 120 | Dashboard | [data-risk="alto"] | RISCHIO ALTO | source-mapping-2026-10-02-qa-v31-attempt-1790961827069-gp37eqbqyol-Dashboard-map-initial |
| 121 | Dashboard | #pandoraAnalysisClose | ✕ | source-mapping-2026-10-02-qa-v31-attempt-1790961827069-gp37eqbqyol-Dashboard-map-analysis-dropdown |
| 122 | Live | [data-live-timing="{matchId}"] | Timing Gol: fasce orarie in cui le squadre segnano/subiscono di più | source-mapping-2026-10-02-qa-v31-attempt-1790961827069-gp37eqbqyol-Live-map-initial |
| 123 | Live | [data-live-ht="{matchId}"] | Come sono andate le squadre con questo risultato al 45' | source-mapping-2026-10-02-qa-v31-attempt-1790961827069-gp37eqbqyol-Live-map-initial |
| 124 | Live | [data-live-radar="{matchId}"] | Radar live | source-mapping-2026-10-02-qa-v31-attempt-1790961827069-gp37eqbqyol-Live-map-initial |
| 125 | Live | [data-live-fav="{matchId}"] | Preferito | source-mapping-2026-10-02-qa-v31-attempt-1790961827069-gp37eqbqyol-Live-map-initial |
| 126 | Live | [data-live-mon="{matchId}"] | Apri in finestra separata (spostabile su altro schermo) | source-mapping-2026-10-02-qa-v31-attempt-1790961827069-gp37eqbqyol-Live-map-initial |
| 127 | Live | [data-live-hide="{matchId}"] | Nascondi questa partita | source-mapping-2026-10-02-qa-v31-attempt-1790961827069-gp37eqbqyol-Live-map-initial |
| 128 | Live | [data-live-goaldetail="{matchId}"] | Dettaglio Gol+ Gol++ | source-mapping-2026-10-02-qa-v31-attempt-1790961827069-gp37eqbqyol-Live-map-initial |
| 129 | Live | [data-live-csdetail="{matchId}"] | Risultato Esatto Live | source-mapping-2026-10-02-qa-v31-attempt-1790961827069-gp37eqbqyol-Live-map-initial |
| 130 | Live | [data-odds-tab="1x2"] | 1X2 | source-mapping-2026-10-02-qa-v31-attempt-1790961827069-gp37eqbqyol-Live-map-initial |
| 131 | Live | [data-odds-tab="ou"] | O/U | source-mapping-2026-10-02-qa-v31-attempt-1790961827069-gp37eqbqyol-Live-map-initial |
| 132 | Live | [data-odds-tab="btts"] | BTTS | source-mapping-2026-10-02-qa-v31-attempt-1790961827069-gp37eqbqyol-Live-map-initial |
| 133 | Live | [data-odds-tab="cs"] | Risultato | source-mapping-2026-10-02-qa-v31-attempt-1790961827069-gp37eqbqyol-Live-map-initial |
| 134 | Live | [data-live-detail="{matchId}"] | DETTAGLIO | source-mapping-2026-10-02-qa-v31-attempt-1790961827069-gp37eqbqyol-Live-map-initial |
| 135 | Live | [data-live-stats="{matchId}"] | STATS+ | source-mapping-2026-10-02-qa-v31-attempt-1790961827069-gp37eqbqyol-Live-map-initial |
| 136 | Live | A: BETFAIR | BETFAIR | source-mapping-2026-10-02-qa-v31-attempt-1790961827069-gp37eqbqyol-Live-map-initial |
| 137 | Live | [data-live-sort="min"] | MIN | source-mapping-2026-10-02-qa-v31-attempt-1790961827069-gp37eqbqyol-Live-map-table |
| 138 | Live | [data-live-sort="ris"] | RIS | source-mapping-2026-10-02-qa-v31-attempt-1790961827069-gp37eqbqyol-Live-map-table |
| 139 | Live | [data-live-sort="rating"] | RATING▼ | source-mapping-2026-10-02-qa-v31-attempt-1790961827069-gp37eqbqyol-Live-map-table |
| 140 | Live | [data-live-sort="xgl"] | XG | source-mapping-2026-10-02-qa-v31-attempt-1790961827069-gp37eqbqyol-Live-map-table |
| 141 | Live | [data-live-sort="xg"] | XG (PRE) | source-mapping-2026-10-02-qa-v31-attempt-1790961827069-gp37eqbqyol-Live-map-table |
| 142 | Live | [data-live-sort="gp1"] | +1 | source-mapping-2026-10-02-qa-v31-attempt-1790961827069-gp37eqbqyol-Live-map-table |
| 143 | Live | [data-live-sort="gp2"] | +2 | source-mapping-2026-10-02-qa-v31-attempt-1790961827069-gp37eqbqyol-Live-map-table |
| 144 | Live | [data-live-sort="pi1"] | PI1 | source-mapping-2026-10-02-qa-v31-attempt-1790961827069-gp37eqbqyol-Live-map-table |
| 145 | Live | [data-live-sort="pi2"] | PI2 | source-mapping-2026-10-02-qa-v31-attempt-1790961827069-gp37eqbqyol-Live-map-table |
| 146 | Live | [data-live-sort="pi3"] | PI3 | source-mapping-2026-10-02-qa-v31-attempt-1790961827069-gp37eqbqyol-Live-map-table |
| 147 | Live | [data-live-sort="cg10"] | CG10 | source-mapping-2026-10-02-qa-v31-attempt-1790961827069-gp37eqbqyol-Live-map-table |
| 148 | Live | [data-live-sort="sh"] | TIRI | source-mapping-2026-10-02-qa-v31-attempt-1790961827069-gp37eqbqyol-Live-map-table |
| 149 | Live | [data-live-sort="ot"] | IN P. | source-mapping-2026-10-02-qa-v31-attempt-1790961827069-gp37eqbqyol-Live-map-table |
| 150 | Live | [data-live-sort="da"] | A/PER | source-mapping-2026-10-02-qa-v31-attempt-1790961827069-gp37eqbqyol-Live-map-table |
| 151 | Live | [data-live-sort="cor"] | CORN | source-mapping-2026-10-02-qa-v31-attempt-1790961827069-gp37eqbqyol-Live-map-table |
| 152 | Live | [data-live-sort="pos"] | POSS | source-mapping-2026-10-02-qa-v31-attempt-1790961827069-gp37eqbqyol-Live-map-table |
| 153 | Live | [data-live-goaldetail-modal="{matchId}"] | Dettaglio Gol+ Gol++ | source-mapping-2026-10-02-qa-v31-attempt-1790961827069-gp37eqbqyol-Live-map-table |
| 154 | Live | [data-live-csdetail-modal="{matchId}"] | Risultato Esatto Live | source-mapping-2026-10-02-qa-v31-attempt-1790961827069-gp37eqbqyol-Live-map-table |
| 155 | Live | [data-live-lg="Norway Division 1"] | Norway Division 1 | source-mapping-2026-10-02-qa-v31-attempt-1790961827069-gp37eqbqyol-Live-map-league |
| 156 | Live | [data-live-lg="UEFA Nations League C"] | UEFA Nations League C | source-mapping-2026-10-02-qa-v31-attempt-1790961827069-gp37eqbqyol-Live-map-league |
| 157 | Dashboard | #roiStrClose | ✕ | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Dashboard: data-roi-str-map-initial |
| 158 | Dashboard | [data-legend="strategiestoriche"] | ? Legend | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Dashboard: data-roi-str-map-initial |
| 159 | Dashboard: data-betfair-btn | BUTTON: ✕ | ✕ | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Dashboard: data-betfair-btn-map-initial |
| 160 | Dashboard | #closeDetailBtn | ✕ Chiudi | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Dashboard: data-open-detail-map-initial |
| 161 | Dashboard | DIV: 💡 INSIGHTS ▾ | 💡 INSIGHTS ▾ | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Dashboard: data-open-detail-map-initial |
| 162 | Dashboard | BUTTON: ▾ | ▾ | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Dashboard: data-open-detail-map-initial |
| 163 | Dashboard | [data-detail-tab="ai"] | CONSIGLIO | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Dashboard: data-open-detail-map-initial |
| 164 | Dashboard | [data-detail-tab="statrecenti"] | STATS | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Dashboard: data-open-detail-map-initial |
| 165 | Dashboard | [data-detail-tab="statsplus"] | STATS + | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Dashboard: data-open-detail-map-initial |
| 166 | Dashboard | [data-detail-tab="timinggol"] | TIMING DEI GOL | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Dashboard: data-open-detail-map-initial |
| 167 | Dashboard | [data-detail-tab="formazioni"] | FORMAZIONI | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Dashboard: data-open-detail-map-initial |
| 168 | Dashboard | [data-detail-tab="placares"] | OCCORRENZE | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Dashboard: data-open-detail-map-initial |
| 169 | Dashboard | [data-detail-tab="uscita75"] | GESTIONE 75' | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Dashboard: data-open-detail-map-initial |
| 170 | Dashboard | [data-detail-tab="distribuzioni"] | DISTRIBUZIONI | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Dashboard: data-open-detail-map-initial |
| 171 | Dashboard | [data-detail-tab="campione"] | STORICO | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Dashboard: data-open-detail-map-initial |
| 172 | Dashboard | [data-detail-tab="profit"] | PROFIT CS | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Dashboard: data-open-detail-map-initial |
| 173 | Dashboard | [data-detail-tab="label"] | 📊 ROI | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Dashboard: data-open-detail-map-initial |
| 174 | Dashboard | [data-detail-tab="indicatori"] | INDEX | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Dashboard: data-open-detail-map-initial |
| 175 | Dashboard | [data-detail-tab="classifica"] | CLASSIFICA | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Dashboard: data-open-detail-map-initial |
| 176 | Dashboard | [data-legend="ai"] | ? Legend | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Dashboard: data-open-detail-map-initial |
| 177 | Dashboard | [data-answer="✅ Sì, le condizioni sono favorevoli. Controlla prima la quota su Betfair: deve essere SOTTO il QE di 55.56 per avere valore. Se è sopra, aspetta o salta. — Segnale molto interessante."] | Entro in lay adesso? | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Dashboard: data-open-detail-map-initial |
| 178 | Dashboard | [data-answer="Lavora il Lay 0-0. È il risultato con la maggiore frequenza storica di non-uscita nel campione analizzato. Non cambiare risultato a mano."] | Quale risultato lavoro? | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Dashboard: data-open-detail-map-initial |
| 179 | Dashboard | [data-answer="Stake consigliato: 1.5% - 2% banca. Il profilo rischio è basso: puoi applicare lo stake standard."] | Quanto rischio? | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Dashboard: data-open-detail-map-initial |
| 180 | Dashboard | [data-answer="Controllo al 75&#39;: mantieni solo se score, ritmo e mercato restano coerenti. Usa il tab <b>75'</b> qui sopra per leggere la regola specifica sul risultato live."] | Cosa faccio al 75'? | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Dashboard: data-open-detail-map-initial |
| 181 | Dashboard | [data-answer="Heracles Almelo (favorita, in trasferta) ha chiuso 0-0 2 volte nelle ultime 50 partite in trasferta (4.0%)."] | È già successo prima? | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Dashboard: data-open-detail-map-initial |
| 182 | Dashboard | [data-hist-outcome="win"] | ✅ Vinto | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Dashboard: data-open-detail-map-initial |
| 183 | Dashboard | [data-hist-outcome="loss"] | ❌ Perso | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Dashboard: data-open-detail-map-initial |
| 184 | Dashboard | [data-hist-outcome="skip"] | ⏭ Saltato | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Dashboard: data-open-detail-map-initial |
| 185 | Live: data-live-ht | BUTTON: ✕ | ✕ | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Live: data-live-ht-map-initial |
| 186 | Live: data-live-timing | BUTTON: ✕ | ✕ | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Live: data-live-timing-map-initial |
| 187 | Live | [data-gt-n="5"] | 5 | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Live: data-live-timing-map-initial |
| 188 | Live | [data-gt-n="10"] | 10 | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Live: data-live-timing-map-initial |
| 189 | Live | [data-gt-n="20"] | 20 | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Live: data-live-timing-map-initial |
| 190 | Live | [data-gt-scope="venue"] | Casa/Trasferta | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Live: data-live-timing-map-initial |
| 191 | Live | [data-gt-scope="overall"] | Overall | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Live: data-live-timing-map-initial |
| 192 | Live | #closeDetailBtn | ✕ Chiudi | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Live: data-live-detail-map-initial |
| 193 | Live | [data-detail-tab="ai"] | CONSIGLIO | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Live: data-live-detail-map-initial |
| 194 | Live | [data-detail-tab="statrecenti"] | STATS | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Live: data-live-detail-map-initial |
| 195 | Live | [data-detail-tab="statsplus"] | STATS + | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Live: data-live-detail-map-initial |
| 196 | Live | [data-detail-tab="timinggol"] | TIMING DEI GOL | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Live: data-live-detail-map-initial |
| 197 | Live | [data-detail-tab="formazioni"] | FORMAZIONI | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Live: data-live-detail-map-initial |
| 198 | Live | [data-detail-tab="placares"] | OCCORRENZE | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Live: data-live-detail-map-initial |
| 199 | Live | [data-detail-tab="uscita75"] | GESTIONE 75' | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Live: data-live-detail-map-initial |
| 200 | Live | [data-detail-tab="distribuzioni"] | DISTRIBUZIONI | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Live: data-live-detail-map-initial |
| 201 | Live | [data-detail-tab="campione"] | STORICO | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Live: data-live-detail-map-initial |
| 202 | Live | [data-detail-tab="profit"] | PROFIT CS | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Live: data-live-detail-map-initial |
| 203 | Live | [data-detail-tab="label"] | 📊 ROI | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Live: data-live-detail-map-initial |
| 204 | Live | [data-detail-tab="indicatori"] | INDEX | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Live: data-live-detail-map-initial |
| 205 | Live | [data-detail-tab="classifica"] | CLASSIFICA | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Live: data-live-detail-map-initial |
| 206 | Live | [data-legend="ai"] | ? Legend | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Live: data-live-detail-map-initial |
| 207 | Live | [data-pandora-analysis="{matchId}"] | 🧠 Analisi ▾ | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Live: data-live-detail-map-initial |
| 208 | Live | [data-roi-str="{matchId}"] | 📊 ROI STR | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Live: data-live-detail-map-initial |
| 209 | Live | [data-answer="🔴 Meglio no: il segnale non è abbastanza solido. Osserva senza posizione. Inoltre, verifica il QE (14.93): entra solo se Betfair è sotto quel valore. — Segnale da monitorare con prudenza."] | Entro in lay adesso? | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Live: data-live-detail-map-initial |
| 210 | Live | [data-answer="Lavora il Lay 0-0. È il risultato con la maggiore frequenza storica di non-uscita nel campione analizzato. Non cambiare risultato a mano."] | Quale risultato lavoro? | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Live: data-live-detail-map-initial |
| 211 | Live | [data-answer="Stake consigliato: 0.5% banca o solo monitor. Rischio alto: stake minimo o solo osservazione. Non aumentare esposizione."] | Quanto rischio? | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Live: data-live-detail-map-initial |
| 212 | Live | [data-answer="Non aumentare esposizione live: se il risultato resta vulnerabile al 75&#39;, copertura forte. Usa il tab <b>75'</b> qui sopra per leggere la regola specifica sul risultato live."] | Cosa faccio al 75'? | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Live: data-live-detail-map-initial |
| 213 | Live | [data-answer="Cyprus (favorita, in casa) ha chiuso 0-0 3 volte nelle ultime 50 partite in casa (6.0%)."] | È già successo prima? | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Live: data-live-detail-map-initial |
| 214 | Live | [data-hist-outcome="win"] | ✅ Vinto | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Live: data-live-detail-map-initial |
| 215 | Live | [data-hist-outcome="loss"] | ❌ Perso | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Live: data-live-detail-map-initial |
| 216 | Live | [data-hist-outcome="skip"] | ⏭ Saltato | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Live: data-live-detail-map-initial |
| 217 | Live | [data-stp="n"][data-val="5"] | 5 | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Live: data-live-stats-map-initial |
| 218 | Live | [data-stp="n"][data-val="10"] | 10 | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Live: data-live-stats-map-initial |
| 219 | Live | [data-stp="n"][data-val="20"] | 20 | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Live: data-live-stats-map-initial |
| 220 | Live | [data-stp="v"][data-val="all"] | Complessivo | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Live: data-live-stats-map-initial |
| 221 | Live | [data-stp="v"][data-val="ha"] | Casa / Trasf. | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Live: data-live-stats-map-initial |
| 222 | Live | [data-stp="s"][data-val="all"] | Tutte | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Live: data-live-stats-map-initial |
| 223 | Live | [data-stp="s"][data-val="lg"] | Stessa lega | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Live: data-live-stats-map-initial |
| 224 | Live | [data-stp="s"][data-val="h2h"] | H2H | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Live: data-live-stats-map-initial |
| 225 | Live | [data-stp="s"][data-val="race"] | Race | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Live: data-live-stats-map-initial |
| 226 | Live | [data-stprace="home"] | Generale | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Live: Stats+ controls-map-initial |
| 227 | Live | [data-stprace="away"] | Generale | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Live: Stats+ controls-map-initial |
| 228 | Live: data-live-goaldetail-modal | BUTTON: ✕ | ✕ | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Live: data-live-goaldetail-modal-map-initial |
| 229 | Live: data-live-csdetail-modal | BUTTON: ✕ | ✕ | source-mapping-2026-10-02-qa-v34-attempt-1790962826591-kxxufbswav8-Live: data-live-csdetail-modal-map-initial |
| 230 | Dashboard | [data-answer="⚠️ Con cautela: attendere conferma live prima di entrare. Controlla prima la quota su Betfair: deve essere SOTTO il QE di 25.00 per avere valore. Se è sopra, aspetta o salta. — Segnale molto interessante."] | Entro in lay adesso? | source-mapping-2026-10-02-qa-v35-attempt-1790963509471-81e67rtgy4u-Dashboard: rischio medio-map-initial |
| 231 | Dashboard | [data-answer="Stake consigliato: 1% banca. Rischio medio: usa la metà dello stake abituale e non aumentare live."] | Quanto rischio? | source-mapping-2026-10-02-qa-v35-attempt-1790963509471-81e67rtgy4u-Dashboard: rischio medio-map-initial |
| 232 | Dashboard | [data-answer="Controllo al 75&#39;: se il risultato vulnerabile e ancora vivo, riduci o copri parte della posizione. Usa il tab <b>75'</b> qui sopra per leggere la regola specifica sul risultato live."] | Cosa faccio al 75'? | source-mapping-2026-10-02-qa-v35-attempt-1790963509471-81e67rtgy4u-Dashboard: rischio medio-map-initial |
| 233 | Dashboard | [data-answer="Bray Wanderers (favorita, in casa) non ha mai chiuso 0-0 nelle ultime 50 partite in casa (0.0%)."] | È già successo prima? | source-mapping-2026-10-02-qa-v35-attempt-1790963509471-81e67rtgy4u-Dashboard: rischio medio-map-initial |
| 234 | Dashboard | [data-answer="🔴 Meglio no: il segnale non è abbastanza solido. Osserva senza posizione. Inoltre, verifica il QE (16.39): entra solo se Betfair è sotto quel valore. — Segnale da monitorare con prudenza."] | Entro in lay adesso? | source-mapping-2026-10-02-qa-v35-attempt-1790963509471-81e67rtgy4u-Dashboard: rischio alto-map-initial |
| 235 | Dashboard | [data-answer="Lavora il Lay 0-1. È il risultato con la maggiore frequenza storica di non-uscita nel campione analizzato. Non cambiare risultato a mano."] | Quale risultato lavoro? | source-mapping-2026-10-02-qa-v35-attempt-1790963509471-81e67rtgy4u-Dashboard: rischio alto-map-initial |
| 236 | Dashboard | [data-answer="Stake consigliato: 0.5% banca o solo monitor. Rischio alto: stake minimo o solo osservazione. Non aumentare esposizione."] | Quanto rischio? | source-mapping-2026-10-02-qa-v35-attempt-1790963509471-81e67rtgy4u-Dashboard: rischio alto-map-initial |
| 237 | Dashboard | [data-answer="Non aumentare esposizione live: se il risultato resta vulnerabile al 75&#39;, copertura forte. Usa il tab <b>75'</b> qui sopra per leggere la regola specifica sul risultato live."] | Cosa faccio al 75'? | source-mapping-2026-10-02-qa-v35-attempt-1790963509471-81e67rtgy4u-Dashboard: rischio alto-map-initial |
| 238 | Dashboard | [data-answer="Kazakhstan (favorita, in casa) ha chiuso 0-1 6 volte nelle ultime 50 partite in casa (12.0%)."] | È già successo prima? | source-mapping-2026-10-02-qa-v35-attempt-1790963509471-81e67rtgy4u-Dashboard: rischio alto-map-initial |
| 239 | Live: tabella data-live-ht | BUTTON: ✕ | ✕ | source-mapping-2026-10-02-qa-v35-attempt-1790963509471-81e67rtgy4u-Live: tabella data-live-ht-map-initial |
| 240 | Live: tabella data-live-timing | BUTTON: ✕ | ✕ | source-mapping-2026-10-02-qa-v35-attempt-1790963509471-81e67rtgy4u-Live: tabella data-live-timing-map-initial |
| 241 | Live: tabella data-live-goaldetail-modal | BUTTON: ✕ | ✕ | source-mapping-2026-10-02-qa-v35-attempt-1790963509471-81e67rtgy4u-Live: tabella data-live-goaldetail-modal-map-initial |
| 242 | Live: tabella data-live-csdetail-modal | BUTTON: ✕ | ✕ | source-mapping-2026-10-02-qa-v35-attempt-1790963509471-81e67rtgy4u-Live: tabella data-live-csdetail-modal-map-initial |
| 243 | Live | [data-live-unhide="1"] | 1 nascoste · ripristina | source-mapping-2026-10-02-qa-v35-attempt-1790963509471-81e67rtgy4u-Live-map-initial |
| 244 | Archivio | #_pConfirmNo | Annulla | source-mapping-2026-10-02-qa-v35-attempt-1790963509471-81e67rtgy4u-Archivio-map-initial |
| 245 | Archivio | #_pConfirmYes | Conferma | source-mapping-2026-10-02-qa-v35-attempt-1790963509471-81e67rtgy4u-Archivio-map-initial |
| 246 | Archivio | #bestOfDay | 🏆 BEST OF THE DAY ★ NORWAY 1. DIVISION 19:00 3-0 55' RA 9° Ranheim V P P S S VS Egersund 8° EG | source-mapping-2026-10-02-qa-v37-attempt-1790964803282-zcs68yemn6k-Archivio: form win-map-initial |
| 247 | Archivio | [data-watch="{matchId}"] | ★ | source-mapping-2026-10-02-qa-v37-attempt-1790964803282-zcs68yemn6k-Archivio: form win-map-initial |
| 248 | Archivio | [data-betfair-btn="{matchId}"] | BETFAIR ODD | source-mapping-2026-10-02-qa-v37-attempt-1790964803282-zcs68yemn6k-Archivio: form win-map-initial |
| 249 | Archivio | [data-pandora-analysis="{matchId}"] | 🧠 Analisi ▾ | source-mapping-2026-10-02-qa-v37-attempt-1790964803282-zcs68yemn6k-Archivio: form win-map-initial |
| 250 | Archivio | [data-roi-str="{matchId}"] | 📊 ROI STR | source-mapping-2026-10-02-qa-v37-attempt-1790964803282-zcs68yemn6k-Archivio: form win-map-initial |
| 251 | Archivio | [data-filter="all"] | TUTTE | source-mapping-2026-10-02-qa-v37-attempt-1790964803282-zcs68yemn6k-Archivio: form win-map-initial |
| 252 | Archivio | [data-filter="banca"] | BANCA | source-mapping-2026-10-02-qa-v37-attempt-1790964803282-zcs68yemn6k-Archivio: form win-map-initial |
| 253 | Archivio | [data-filter="controlla"] | GIOCABILE | source-mapping-2026-10-02-qa-v37-attempt-1790964803282-zcs68yemn6k-Archivio: form win-map-initial |
| 254 | Archivio | [data-filter="osserva"] | OSSERVA | source-mapping-2026-10-02-qa-v37-attempt-1790964803282-zcs68yemn6k-Archivio: form win-map-initial |
| 255 | Archivio | [data-filter="scarta"] | SCARTA | source-mapping-2026-10-02-qa-v37-attempt-1790964803282-zcs68yemn6k-Archivio: form win-map-initial |
| 256 | Archivio | #strategyToggleBtn | STRATEGIE | source-mapping-2026-10-02-qa-v37-attempt-1790964803282-zcs68yemn6k-Archivio: form win-map-initial |
| 257 | Archivio | BUTTON: Vista tabella | Vista tabella | source-mapping-2026-10-02-qa-v37-attempt-1790964803282-zcs68yemn6k-Archivio: form win-map-initial |
| 258 | Archivio | #resetStrategyFiltersBtn | Reset filtri | source-mapping-2026-10-02-qa-v37-attempt-1790964803282-zcs68yemn6k-Archivio: form win-map-initial |
| 259 | Archivio | [data-detail="{matchId}"] | BANCA LAY 0-0 Top Lay: 0‑0 · 1‑0 NETHERLANDS EERSTE DIVISIE 21:00 HE 14° Helmond Sport S S V V  | source-mapping-2026-10-02-qa-v37-attempt-1790964803282-zcs68yemn6k-Archivio: form win-map-initial |
| 260 | Archivio | [data-action="{matchId}"] | BANCA LAY 0-0 Top Lay: 0‑0 · 1‑0 | source-mapping-2026-10-02-qa-v37-attempt-1790964803282-zcs68yemn6k-Archivio: form win-map-initial |
| 261 | Archivio | [data-strategy="{matchId}"] | LAY 0-0 1.8% O1.5 81% BTTS 65% BETFAIR ODD | source-mapping-2026-10-02-qa-v37-attempt-1790964803282-zcs68yemn6k-Archivio: form win-map-initial |
| 262 | Archivio | [data-risk="basso"] | RISCHIO BASSO | source-mapping-2026-10-02-qa-v37-attempt-1790964803282-zcs68yemn6k-Archivio: form win-map-initial |
| 263 | Archivio | [data-open-detail="{matchId}"] | DETTAGLIO | source-mapping-2026-10-02-qa-v37-attempt-1790964803282-zcs68yemn6k-Archivio: form win-map-initial |
| 264 | Archivio | [data-risk="medio"] | RISCHIO MEDIO | source-mapping-2026-10-02-qa-v37-attempt-1790964803282-zcs68yemn6k-Archivio: form win-map-initial |
| 265 | Archivio | [data-risk="alto"] | RISCHIO ALTO | source-mapping-2026-10-02-qa-v37-attempt-1790964803282-zcs68yemn6k-Archivio: form win-map-initial |
| 266 | Archivio | #closeDetailBtn | ✕ Chiudi | source-mapping-2026-10-02-qa-v37-attempt-1790964803282-zcs68yemn6k-Archivio: form win-map-initial |
| 267 | Archivio | DIV: 💡 INSIGHTS ▾ | 💡 INSIGHTS ▾ | source-mapping-2026-10-02-qa-v37-attempt-1790964803282-zcs68yemn6k-Archivio: form win-map-initial |
| 268 | Archivio | BUTTON: ▾ | ▾ | source-mapping-2026-10-02-qa-v37-attempt-1790964803282-zcs68yemn6k-Archivio: form win-map-initial |
| 269 | Archivio | [data-detail-tab="ai"] | CONSIGLIO | source-mapping-2026-10-02-qa-v37-attempt-1790964803282-zcs68yemn6k-Archivio: form win-map-initial |
| 270 | Archivio | [data-detail-tab="statrecenti"] | STATS | source-mapping-2026-10-02-qa-v37-attempt-1790964803282-zcs68yemn6k-Archivio: form win-map-initial |
| 271 | Archivio | [data-detail-tab="statsplus"] | STATS + | source-mapping-2026-10-02-qa-v37-attempt-1790964803282-zcs68yemn6k-Archivio: form win-map-initial |
| 272 | Archivio | [data-detail-tab="timinggol"] | TIMING DEI GOL | source-mapping-2026-10-02-qa-v37-attempt-1790964803282-zcs68yemn6k-Archivio: form win-map-initial |
| 273 | Archivio | [data-detail-tab="formazioni"] | FORMAZIONI | source-mapping-2026-10-02-qa-v37-attempt-1790964803282-zcs68yemn6k-Archivio: form win-map-initial |
| 274 | Archivio | [data-detail-tab="placares"] | OCCORRENZE | source-mapping-2026-10-02-qa-v37-attempt-1790964803282-zcs68yemn6k-Archivio: form win-map-initial |
| 275 | Archivio | [data-detail-tab="uscita75"] | GESTIONE 75' | source-mapping-2026-10-02-qa-v37-attempt-1790964803282-zcs68yemn6k-Archivio: form win-map-initial |
| 276 | Archivio | [data-detail-tab="distribuzioni"] | DISTRIBUZIONI | source-mapping-2026-10-02-qa-v37-attempt-1790964803282-zcs68yemn6k-Archivio: form win-map-initial |
| 277 | Archivio | [data-detail-tab="campione"] | STORICO | source-mapping-2026-10-02-qa-v37-attempt-1790964803282-zcs68yemn6k-Archivio: form win-map-initial |
| 278 | Archivio | [data-detail-tab="profit"] | PROFIT CS | source-mapping-2026-10-02-qa-v37-attempt-1790964803282-zcs68yemn6k-Archivio: form win-map-initial |
| 279 | Archivio | [data-detail-tab="label"] | 📊 ROI | source-mapping-2026-10-02-qa-v37-attempt-1790964803282-zcs68yemn6k-Archivio: form win-map-initial |
| 280 | Archivio | [data-detail-tab="indicatori"] | INDEX | source-mapping-2026-10-02-qa-v37-attempt-1790964803282-zcs68yemn6k-Archivio: form win-map-initial |
| 281 | Archivio | [data-detail-tab="classifica"] | CLASSIFICA | source-mapping-2026-10-02-qa-v37-attempt-1790964803282-zcs68yemn6k-Archivio: form win-map-initial |
| 282 | Archivio | [data-legend="ai"] | ? Legend | source-mapping-2026-10-02-qa-v37-attempt-1790964803282-zcs68yemn6k-Archivio: form win-map-initial |
| 283 | Archivio | [data-answer="✅ Sì, le condizioni sono favorevoli. Controlla prima la quota su Betfair: deve essere SOTTO il QE di 55.56 per avere valore. Se è sopra, aspetta o salta. — Segnale molto interessante."] | Entro in lay adesso? | source-mapping-2026-10-02-qa-v37-attempt-1790964803282-zcs68yemn6k-Archivio: form win-map-initial |
| 284 | Archivio | [data-answer="Lavora il Lay 0-0. È il risultato con la maggiore frequenza storica di non-uscita nel campione analizzato. Non cambiare risultato a mano."] | Quale risultato lavoro? | source-mapping-2026-10-02-qa-v37-attempt-1790964803282-zcs68yemn6k-Archivio: form win-map-initial |
| 285 | Archivio | [data-answer="Stake consigliato: 1.5% - 2% banca. Il profilo rischio è basso: puoi applicare lo stake standard."] | Quanto rischio? | source-mapping-2026-10-02-qa-v37-attempt-1790964803282-zcs68yemn6k-Archivio: form win-map-initial |
| 286 | Archivio | [data-answer="Controllo al 75&#39;: mantieni solo se score, ritmo e mercato restano coerenti. Usa il tab <b>75'</b> qui sopra per leggere la regola specifica sul risultato live."] | Cosa faccio al 75'? | source-mapping-2026-10-02-qa-v37-attempt-1790964803282-zcs68yemn6k-Archivio: form win-map-initial |
| 287 | Archivio | [data-answer="Heracles Almelo (favorita, in trasferta) ha chiuso 0-0 2 volte nelle ultime 50 partite in trasferta (4.0%)."] | È già successo prima? | source-mapping-2026-10-02-qa-v37-attempt-1790964803282-zcs68yemn6k-Archivio: form win-map-initial |
| 288 | Archivio | [data-hist-outcome="win"] | ✅ Vinto | source-mapping-2026-10-02-qa-v37-attempt-1790964803282-zcs68yemn6k-Archivio: form win-map-initial |
| 289 | Archivio | [data-hist-outcome="loss"] | ❌ Perso | source-mapping-2026-10-02-qa-v37-attempt-1790964803282-zcs68yemn6k-Archivio: form win-map-initial |
| 290 | Archivio | [data-hist-outcome="skip"] | ⏭ Saltato | source-mapping-2026-10-02-qa-v37-attempt-1790964803282-zcs68yemn6k-Archivio: form win-map-initial |
| 291 | Archivio | [data-hist-confirm="pandora-83-HelmondSport-HeraclesAlmelo"] | Conferma | source-mapping-2026-10-02-qa-v37-attempt-1790964803282-zcs68yemn6k-Archivio: form win-map-initial |
| 292 | Archivio | [data-answer="⚠️ Con cautela: attendere conferma live prima di entrare. Controlla prima la quota su Betfair: deve essere SOTTO il QE di 25.00 per avere valore. Se è sopra, aspetta o salta. — Segnale molto interessante."] | Entro in lay adesso? | source-mapping-2026-10-02-qa-v37-attempt-1790964803282-zcs68yemn6k-Archivio: form loss-map-initial |
| 293 | Archivio | [data-answer="Stake consigliato: 1% banca. Rischio medio: usa la metà dello stake abituale e non aumentare live."] | Quanto rischio? | source-mapping-2026-10-02-qa-v37-attempt-1790964803282-zcs68yemn6k-Archivio: form loss-map-initial |
| 294 | Archivio | [data-answer="Controllo al 75&#39;: se il risultato vulnerabile e ancora vivo, riduci o copri parte della posizione. Usa il tab <b>75'</b> qui sopra per leggere la regola specifica sul risultato live."] | Cosa faccio al 75'? | source-mapping-2026-10-02-qa-v37-attempt-1790964803282-zcs68yemn6k-Archivio: form loss-map-initial |
| 295 | Archivio | [data-answer="Bray Wanderers (favorita, in casa) non ha mai chiuso 0-0 nelle ultime 50 partite in casa (0.0%)."] | È già successo prima? | source-mapping-2026-10-02-qa-v37-attempt-1790964803282-zcs68yemn6k-Archivio: form loss-map-initial |
| 296 | Archivio | [data-hist-confirm="pandora-75-BrayWanderers-CobhRamblers"] | Conferma | source-mapping-2026-10-02-qa-v37-attempt-1790964803282-zcs68yemn6k-Archivio: form loss-map-initial |
| 297 | Dashboard | input[data-strategy-filter="goatIndex35"] | Partite da gol Indice 3-5 · alta attesa gol | source-mapping-2026-10-02-qa-v36-attempt-1790964140050-675pbth9pia-strategy-checkbox-map |
| 298 | Dashboard | input[data-strategy-filter="lay00"] | Lay 0-0 | source-mapping-2026-10-02-qa-v36-attempt-1790964140050-675pbth9pia-strategy-checkbox-map |
| 299 | Dashboard | input[data-strategy-filter="lay01"] | Lay 0-1 | source-mapping-2026-10-02-qa-v36-attempt-1790964140050-675pbth9pia-strategy-checkbox-map |
| 300 | Dashboard | input[data-strategy-filter="lay02"] | Lay 0-2 | source-mapping-2026-10-02-qa-v36-attempt-1790964140050-675pbth9pia-strategy-checkbox-map |
| 301 | Dashboard | input[data-strategy-filter="over15"] | Over 1.5 70%+ | source-mapping-2026-10-02-qa-v36-attempt-1790964140050-675pbth9pia-strategy-checkbox-map |
| 302 | Dashboard | input[data-strategy-filter="btts"] | BTTS 55%+ | source-mapping-2026-10-02-qa-v36-attempt-1790964140050-675pbth9pia-strategy-checkbox-map |
| 303 | Dashboard | input[data-strategy-filter="specialLay0001"] | Special Lay 0-0/0-1 | source-mapping-2026-10-02-qa-v36-attempt-1790964140050-675pbth9pia-strategy-checkbox-map |
| 304 | Dashboard | input[data-strategy-filter="specialLay01v3"] | Special Lay 0-1 | source-mapping-2026-10-02-qa-v36-attempt-1790964140050-675pbth9pia-strategy-checkbox-map |
| 305 | Dashboard | input[data-strategy-filter="specialLay002"] | Special Lay 0-0/0-1/0-2 | source-mapping-2026-10-02-qa-v36-attempt-1790964140050-675pbth9pia-strategy-checkbox-map |
| 306 | Dashboard | input[data-strategy-filter="specialLay0010"] | Special Lay 0-0/1-0 | source-mapping-2026-10-02-qa-v36-attempt-1790964140050-675pbth9pia-strategy-checkbox-map |
| 307 | Dashboard | input[data-strategy-filter="score70"] | Score 70+ | source-mapping-2026-10-02-qa-v36-attempt-1790964140050-675pbth9pia-strategy-checkbox-map |
| 308 | Dashboard | input[data-strategy-filter="score80"] | Score 80+ | source-mapping-2026-10-02-qa-v36-attempt-1790964140050-675pbth9pia-strategy-checkbox-map |
| 309 | Dashboard | input[data-strategy-filter="riskLow"] | Rischio basso | source-mapping-2026-10-02-qa-v36-attempt-1790964140050-675pbth9pia-strategy-checkbox-map |
| 310 | Dashboard | input[data-strategy-filter="riskMid"] | Anche medio | source-mapping-2026-10-02-qa-v36-attempt-1790964140050-675pbth9pia-strategy-checkbox-map |
| 311 | Dashboard | input[data-strategy-filter="sampleStrong"] | Campione forte | source-mapping-2026-10-02-qa-v36-attempt-1790964140050-675pbth9pia-strategy-checkbox-map |
| 312 | Dashboard | input[data-strategy-filter="layFreq8"] | Lay freq sotto 8% | source-mapping-2026-10-02-qa-v36-attempt-1790964140050-675pbth9pia-strategy-checkbox-map |
| 313 | Dashboard | input[data-strategy-filter="h2h"] | H2H presente | source-mapping-2026-10-02-qa-v36-attempt-1790964140050-675pbth9pia-strategy-checkbox-map |
| 314 | Dashboard | input[data-strategy-filter="favGol"] | Gol del favorito | source-mapping-2026-10-02-qa-v36-attempt-1790964140050-675pbth9pia-strategy-checkbox-map |
| 315 | Dashboard | input[data-strategy-filter="favWin"] | Vittoria del favorito | source-mapping-2026-10-02-qa-v36-attempt-1790964140050-675pbth9pia-strategy-checkbox-map |
