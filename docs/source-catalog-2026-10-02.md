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


## Aggiornamento verificato alle 13:34 UTC
- Tutte le 12 sezioni del menu hanno almeno una lettura salvata; questo non implica collaudo di ogni interazione.
- Asian Odds: 152 partite nella lettura; LEGEND su prezzi apertura/correnti/chiusura, handicap e linee asiatiche. Non sono prezzi live Exchange.
- Monitorate: pagina acquisita. Ladder: 19 risultati esatti/altro, profitto obiettivo, commissione, campi quota e responsabilità combinata. Archivio: vinte/perse/saltate, strike rate/streak; cancellazione non azionata.
- Statistiche Lega: tabella acquisita (7283 caratteri). Filtri Live avanzati acquisiti: min/max Gol+/Gol++, tiri porta/totali, corner, possesso dominante, tre quote prematch, gol casa/ospite, griglia HT, salvataggio strategie 0/5 e selettore Time.
- Analisi LEGEND: 24 mesi, stesso profilo quote, almeno 15 partite combinate; Singolare zero occorrenze, Fiducia Alta zero/una. Le righe risultato erano ancora in caricamento.
- ROI Strategie: pannello reale e LEGEND acquisiti. Stessa lega, tutte tre le quote entro ±15%, Lay simulato +3% rispetto Punta, commissione 5%. Fonte dichiara rendimento partita per partita; metodo esatto di affidabilità non esposto. Esempio osservato Ranheim–Egersund, 52 partite; non è raccomandazione o rendimento MatchPilot.
- Dettaglio Helmond Sport–Heracles acquisito: consiglio, quote 1X2, rarità, score/rischio, QE=100/frequenza, input quota Exchange manuale, cinque domande assistente, 13 tab. Contenuti dei tab in batch successivo.
- I pannelli possono mostrare dati diversi dal giorno corrente/cache: data e disponibilità eventi non ancora riconciliate con uno svolgimento reale.

## Robustezza implementata e testata
Parser catalogo v2, normalizzazione, deduplicazione, contesto di riga, conservazione campi anonimi distinti, aggiunte/rimozioni e anomalie. Nessun valore input conservato. Controlli nuovi catalogati senza esecuzione automatica.
Parser ROI: sei righe essenziali, campione, percentuali, ROI, direzione/soglia quote e affidabilità. Nuove righe non interrompono quelle note; righe mancanti/invalide impediscono uso economico. Sei test di regressione passati e conversione riuscita sullo snapshot ROI reale salvato.
Run resilient-v7 COMPLETE alle 13:23:37 UTC; dopo riavvio ha recuperato checkpoint e timeout ladder. Lease/heartbeat isolano esecuzioni concorrenti; recupero osservato, non garanzia contro ogni indisponibilità. Errori per sezione non fermano le successive.

## Residui
Money Management, contenuto di tutti i tab/LEGEND dettaglio, creazione/richiamo strategie, backtest reale e limite 5/giorno, pannello di partita live e lettura minuto per minuto. Nessuna partita live disponibile durante il test. Nessun backtest eseguito o operazione registrata.
Gol++: Guida dice almeno due gol; testo filtro dice stessa logica Gol+ con soglia più alta. Conservare discrepanza: il calcolo reale non è ancora verificato.

## Verifica aggiornata alle 17:00 Europe/Rome (15:00 UTC)
La precedente tabella è una fotografia iniziale, superata dalle evidenze seguenti.
- Batch `source-mapping-2026-10-02-full-scroll-v13`: selezione verificata delle 13 tab di dettaglio, 12 sezioni di menu. Non usare v11/v12 come prova della selezione delle tab.
- Batch `source-mapping-2026-10-02-qa-v15`: terminato, otto sezioni lette. Copertura verticale e orizzontale completa sui contenitori osservati, compresa Asian Odds. Non equivale alla verifica di ogni stato condizionale o grafico.
- 35 prove di interazione: 6 con asserzione passata, 26 con effetto osservato, 2 bloccate per controllo non visibile, 1 timeout. I 26 casi osservati non sono certificazioni numeriche.
- Live: menu campionati/punteggio/tempo/strategie, apertura filtri, gol casa zero e vuoto, mercati 1X2/O-U/BTTS/Risultato e STATS+. Dettagli Gol+/Gol++ e Risultato Esatto Live non disponibili con quei selettori nello stato corrente.
- Dashboard: filtri BANCA/GIOCABILE/OSSERVA/SCARTA/TUTTE/STRATEGIE letti dopo clic. Vista tabella: timeout; probabile pulsante icona con titolo, da ritestare tramite attributo osservato.
- Backtest: una sola esecuzione, minuto 60, 1-1, quote 1 [1.5,2], X [3,5], 2 [3,5], nessun campionato selezionato. 2324 partite su 17929, risultato invariato 34.6%, almeno un altro gol 65.4%, Over 3.5 28.7%; quattro esecuzioni residue visualizzate. Campione reale della fonte, non previsione certa. Quote CS prematch indicate come riferimento, non quote aggiornate al minuto.
- Guard globale Neon `source-backtest-test-2026-10-02-01`: massimo un tentativo del test, prima del clic; deploy e riavvii non devono consumare nuovamente il limite.
- Asian Odds: filtri Live/Non iniziate/Tutte e ricerche campionato/squadra producono cambiamenti osservati. Statistiche Lega: ricerca NORWAY con asserzione e ricerca senza risultati.
- Analisi: caricamento terminato prima della seconda acquisizione; nessun test di scrittura degli esiti.
- Money Management: apertura riuscita mantenendo vivo il portale padre fino al popolamento del popup. Piano visualizzato con capitale/cassa 1000 EUR, profitto 0, ROI 0, trenta righe di progressione prevista, stake/target/stop, otto trade per giorno. La progressione prevista non è profitto realizzato. Tab Tracker/Andamento strategie/Guida e impostazioni da testare separatamente; AZZERA PIANO non premuto.
- Ladder: quota 5 su 0-0, input obiettivo 10 e commissione 5%: stake visualizzato 10, netto vincita 9.50, perdita 40. Il testo promette obiettivo netto: discrepanza registrata. Nel nostro motore un obiettivo netto 10 richiede stake 10/0.95 = 10.52631579, responsabilità 42.10526316 prima di arrotondamenti.
- Prezzi live back/lay sono letti dal pannello della fonte: timestamp e liquidità non verificati. Integrazione Betwatch resta fase successiva.

### Dettaglio partita effettivamente letto (v13)
| Tab | Contenuti |
|---|---|
| CONSIGLIO | lay consigliato, quota equa, quota manuale, rischio, gestione al 75, domande assistente |
| STATS | statistiche recenti FT/HT/secondo tempo, gol, BTTS, casa/trasferta, ultimi risultati, pressione |
| STATS + | campioni 5/10/20, complessivo/casa-trasferta, stessa lega, H2H, Race |
| TIMING DEI GOL | finestre 15 minuti, gol segnati/subiti, campioni e modalità |
| FORMAZIONI | moduli, titolari, riserve, assenti, statistiche giocatori |
| OCCORRENZE | risultati esatti, campioni, frequenze, soglie quota |
| GESTIONE 75' | punteggi al 75, casi storici, cambiamento risultato, indicazione protezione |
| DISTRIBUZIONI | risultati al 75 e finali con frequenze |
| STORICO | profili quota e partite storiche, HT/FT, tempi gol |
| PROFIT CS | lay risultati esatti, rendimento storico per squadra, responsabilità unitaria |
| ROI Asset Performance | 13 mercati BACK, lega/etichetta quota/squadra; tre popolazioni distinte |
| INDEX | indice gol e CV; indice non disponibile non va interpretato come zero valido |
| CLASSIFICA | squadre, casa/trasferta, risultati, gol, punti, forma |

### Regole parser e limite della certificazione
Nuovi controlli restano `discovered`, senza esecuzione automatica. Cambiamenti e controlli mancanti sono versionati; raccolte opzionali malformate non fanno fallire i dati noti. Validazione semantica ROI blocca righe essenziali mancanti, percentuali/quote invalide e direzione punta/lay errata.
Validazione vista separata: autenticazione visibile, pagina vuota, caricamento e selezione tab sbagliata impediscono `readyForAnalysis`; questa condizione è necessaria ma non sufficiente per validare tutti i campi finanziari.
Nove test locali passati. Resta da verificare: salvataggio/richiamo strategie e relativa persistenza; risposte assistente; varianti ROI/legende, intervallo/slider; esiti personali in ambiente di test; ciclo live completo e archivio giornaliero. Non cancellare dati della fonte per testare.
