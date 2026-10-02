# Catalogo della fonte — prima lettura reale, 2 ottobre 2026
Documento interno: nomi della fonte non devono comparire nell'interfaccia MatchPilot.

## Evidenze e accesso
Render matchpilot-test; Chrome/Playwright 1.63.0. Snapshot con identificatori e timestamp in Neon, tabella matchpilot_source_snapshots.
Portale autenticato verificato. Lay Score richiede un secondo accesso tramite il pulsante Apri del portale.
Versione UI osservata: v20.105, indicata come palinsesto automatico.
Money Management incluso e apribile dal portale, contenuti non ancora letti; prima apertura ha restituito una finestra vuota.
Live+Bot, Poisson, Betting risultano bloccati nel portale: non mappati.

## Stati delle sezioni
| Sezione | Evidenza raccolta | Limite |
|---|---|---|
| Dashboard | segnali BANCA/GIOCABILE/OSSERVA/SCARTA, ordinamento, filtri strategie | palinsesto osservato vuoto |
| Palinsesto | textarea SNAI e comando analizza | Guida descrive tab automatico e manuale; tab automatico non osservato |
| Live | viste Card/Tabella, HOT, pressione, statistiche, campionati, punteggio, tempo, filtri avanzati, strategie salvate | nessuna partita visibile durante la prima lettura |
| Analisi | Singolare e Fiducia Alta, due LEGEND | caricamento dati non concluso nella prima fotografia |
| Lay Goleada Favorito | pagina e LEGEND, due candidati durante la lettura della LEGEND | algoritmo filtro riservato |
| Backtest Storico | campionati, intervalli quote 1/X/2, minuto, gol casa/ospite, nome strategia, salva/esegui | nessun backtest eseguito |
| Asian Odds, Monitorate, Ladder Dutching, Statistiche Lega, Archivio | menu verificato | lettura dettagliata in raccolta successiva |
| Guida | testo integrale, sezioni 1–15, salvato | regole documentate, non equivalgono a test degli output |

## Definizioni lette nella Guida
- Gol+: almeno un altro gol fino al termine; Gol++: almeno due. Ricerca storica stessa lega, quote simili, risultato e minuto comparabili; fallback globale dichiarato. Sotto cinque partite, indicatore vuoto.
- Dettaglio Gol+/Gol++: gol casa/ospite, esito finale, fasce gol; calcolo dichiarato una volta per apertura.
- Risultato Esatto Live: prime otto combinazioni finali più Altro; trasformazione dei gol successivi al minuto corrente nel campione storico.
- Gestione 75': Mantieni/Proteggi/Esci, in funzione del punteggio selezionato. Nessun incremento esposizione per Proteggi/Esci.
- Dashboard e Stat Recenti usano basi diverse: storico interno vs forma aggiornata. MatchPilot usa gli output forniti dalla fonte; non interroga direttamente provider esterni.
- Occorrenze: campione mirato stessa competizione, preferenza ultime due stagioni delle squadre; allargamento storico della competizione. Rarità non equivale al verdetto operativo.
- Etichette rarità: <=3%, <=5%, <=8%, >8%. Score sintetico /100 e rischio basso/medio/alto: formula completa non pubblicata.
- CV: <=0,50 regolare; 0,51–0,70 medio; >0,70 instabile. Indice attesa gol: scala 1–5.
- ROI per label (Guida 12): BACK/LAY 1X2 per lega/casa/trasferta, quote individuali; LAY simulato con maggiorazione del 3% rispetto alla quota bookmaker. Tenere distinto da prezzi exchange osservati.
- Asset Performance (Guida 15): tredici mercati, solo BACK, storico favorita e tre viste. Non confondere col ROI per label descritto nella sezione 12.
- Profit CS: LAY di risultati esatti, responsabilità fissa, separazione storico casa/trasferta, quote storiche CS.
- ROI Strategie: sei combinazioni 1X2 × BACK/LAY, stessa lega e tutte tre le quote simili, affidabilità e soglia quota. Tolleranza ±15% osservata nelle immagini owner, non ancora verificata nel pannello reale.
- Statistiche Lega: 1X2, media gol HT/secondo tempo/FT, O/U HT/FT, BTTS, fasce 15 minuti; aggiornamento statico dichiarato.
- Filtri Special: leghe, squadre e condizioni proprietarie non esposte. Acquisire esiti, non inventare o ricostruire una formula.

## Backtest: input effettivamente osservati
btLeagueSearch; btO1min/max, btOXmin/max, btO2min/max (step 0,05); btMinute; btGolH; btGolA; btStratName.
Nessun campionato selezionato significa tutti i campionati visibili.
Minuto zero e 0-0 corrispondono a prematch. Limite UI: cinque strategie salvate.
Limite cinque esecuzioni al giorno ancora da confrontare con una risposta reale; non consumato durante la mappatura.

## LEGEND Goleada
Descrive LAY vittoria del favorito di casa con scarto >=3, filtro quote riservato. Score distingue Ultra Solido >=80 e Operabile sotto80.
Riporta percentuali storiche 6,76% goleada, 93,24% non goleada; rischio 3,49% con meno di due gol del favorito all'intervallo e 30,33% con due o più.
Queste percentuali sono dichiarazioni della fonte: campione/periodo/formula non verificati; non sono performance MatchPilot.

## Discrepanze da risolvere
1. Palinsesto automatico descritto nella Guida ma pagina osservata manuale/vuota: verificare caricamento, versione e stato cache.
2. Sezione QE della Guida suggerisce una direzione delle quote LAY da confrontare con LEGEND/pannello e formule effettive; non trasformarla automaticamente in una regola di ingresso.
3. Sezioni 12 e 15 chiamano ROI strumenti differenti: mantenere ID distinti.
4. Snapshot scattati durante Caricamento restano parziali; assenza di righe non dimostra assenza del dato.
5. Nessun pannello partita o ROI Strategie reale ancora verificato.
