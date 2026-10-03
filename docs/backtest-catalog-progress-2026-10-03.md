# Unione del catalogo Backtest Storico — 3 ottobre2026

Autorizzazione esplicita Piero19:00 Europe/Rome: acquisire tutti i campionati dal riquadro Backtest Storico e aggregarli a Statistiche Lega, con provenienza distinguibile.

v114, commit06782aef8630b414b25ccc46a4d20ae9b51e905a:19:02:27 run parziale, checkbox non ancora caricate. Errore conservato, nessuna lista vuota certificata.

v115, commit0d68035079122e673b837a1916d74f269d284ea5:19:04:18 run completo dopo caricamento storico attraverso Statistiche Lega;52 checkbox con data-league originale(territorio - nome), etichetta e conteggio. Scroll del contenitore btLeagueList fino al fondo. Snapshot source-backtest-catalogue-2026-10-03-v115-attempt-1791047020671-gt2sfteq1j5-backtest-leagues. Nessun backtest eseguito.

49 voci coincidono esattamente con la baseline Statistiche Lega; nessun conflitto nome/territorio. Unione52:49 entrambe +3 soloBacktest. Nuovi campionati:

|Nome sorgente|Territorio|Campione mostrato|Provenienza|
|---|---|---:|---|
|WORLD EUROCUP|EUROPE|1732|Backtest Storico|
|WORLD UEFA NATIONS LEAGUE|EUROPE|656|Backtest Storico|
|WORLD WORLD CUP|WORLD|3625|Backtest Storico|

Baseline v1 archiviata nel repository e mp_catalog_contract_revisions; nuova v2 approvata con digest0962f8cf7f4c7372200ed22c20a3ac0dab318135b3f56395c050b1905f8be612. Aggiornamento constraint52, aggiunta WORLD come regione.152 squadre già acquisite conservate. mp_league_source_observations contiene101 osservazioni per fonte(49+52), senza sommare o duplicare campioni sovrapposti. Preservare gli snapshot grezzi.

Parser e importatore confrontano separatamente le identità di ciascuna fonte; nuovi campionati non approvati, duplicati o dati campione invalidi falliscono e vengono messi in quarantena. Campioni variabili nel tempo non modificano il perimetro. Le classifiche/squadre restano da Dashboard>Dettaglio>Classifica.

Test fixture reale Backtest52, intersezione49/differenza3, Nations656/WORLDCUPterritorio, duplicati, membership sorgente incompleta, variazione campione valida e conteggio negativo rifiutato, oltre ai7 test precedenti. Sintassi prima del push. Importazione del nuovo codice su Render da verificare dopo deploy: aggiornare con esito concreto, non certificare il solo deploy.

45 campionati senza roster acquisito: non si dichiara completa la mappa delle squadre. Nessuna nuova automazione. Non chiudere issue#2.
