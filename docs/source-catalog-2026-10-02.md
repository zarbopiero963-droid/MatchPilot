# Catalogo interno della fonte — 2 ottobre 2026
Documento tecnico di MatchPilot. Nomi, logo, URL, testi di guida e riferimenti della fonte non devono comparire nell'interfaccia del prodotto.

## Accesso e perimetro
Portale ufficiale: https://goatbettingexchange.com/portale. Lay Score si apre su https://layscore.goatbettingexchange.com/ e richiede un secondo login. Money Management è incluso e si apre da una finestra generata dal portale: mantenere aperto il padre fino al popolamento della finestra.
Lay Score e Money Management sono stati letti con credenziali autorizzate. Live+Bot, Poisson e Betting sono bloccati e non sono stati esplorati.
UI osservata v20.105. Nessuna fonte statistica terza utilizzata.

## Evidenze e significato degli stati
Snapshot immutabili e timestamp UTC in Neon: matchpilot_source_snapshots. Progresso, lease e guard dei test: matchpilot_test_runs. Giorni del prodotto da interpretare in Europe/Rome.
`passed` significa che l'asserzione specifica è riuscita; `observed` registra l'effetto del clic; `blocked` significa che lo stato corrente non permetteva la prova. La lettura di una pagina non certifica ogni combinazione di filtri, grafico o percorso di scrittura.
I batch v11/v12 non provano la selezione delle tab; v13 ha verificato la tab attiva. Un ritorno a Consiglio durante v16 è stato rilevato e conservato come diagnostica non pronta per l'analisi.
Batch v13: 13 tab di dettaglio e 12 sezioni di menu. Batch v15-v21: prove mirate e completamento delle coperture scroll. Il precedente limite di scorrimento di Asian Odds è stato superato. Scorrimento verticale dei contenitori e orizzontale dei pannelli osservati; nessuna pretesa di coprire elementi mai caricati o stati condizionali non incontrati.
Gli snapshot dei riavvii ora hanno namespace separati per tentativo; il proprietario della lease deve corrispondere per finalizzare il batch.

## Sezioni
| Sezione | Mappatura e prove eseguite | Limite residuo |
|---|---|---|
| Dashboard | segnali, filtri BANCA/GIOCABILE/OSSERVA/SCARTA/TUTTE/STRATEGIE, reset e vista tabella; menu e ordinamenti rilevati | tutte le combinazioni di ordinamento e preferiti non certificate |
| Palinsesto | elenco, modalità automatica/manuale, input e comandi rilevati, scorrimento | importazione manuale, cambio data e svuotamento non eseguiti |
| Live | card/tabella, menu campionato/punteggio/tempo/strategie, gol esatti zero/vuoto, nove slider min/max, 16 punteggi HT, mercati 1X2/O-U/BTTS/risultato, STATS+, Gol+/Gol++ e proiezione CS | disponibilità dei pannelli dipende dalle partite; nessun ciclo completo dall'inizio alla fine |
| Analisi | singolare/fiducia alta, contenuti acquisiti dopo fine caricamento | non certificati tutti i match e gli esiti |
| Lay Goleada Favorito | pagina e Legend, stato senza candidati | stato con candidati non incontrato |
| Backtest Storico | campionati, quote, minuto, gol, risultati, prossima rete, tempi, mercati, profitto e canvas equity | salvataggio/richiamo delle strategie backtest non testato |
| Asian Odds | intera pagina e colonne, filtri Live/Non iniziate/Tutte, ricerche lega/squadra, Legend | quote bookmaker, non prezzi exchange |
| Monitorate | pagina, istruzioni e stato vuoto | aggiunta/rimozione preferiti non testata |
| Ladder Dutching | quota 5, importo 10, commissione 5, azzeramento quote | discrepanza sul significato dell'obiettivo netto, sotto |
| Statistiche Lega | colonne e righe, ricerca NORWAY e ricerca inesistente | tutte le combinazioni di ordinamento non certificate |
| Guida | lettura completa con scroll; sezione 15 e differenze dei tre ROI | formule/descrizioni discordanti richiedono chiarimento |
| Archivio | filtri e contatori nello stato vuoto | nessun esito fittizio inserito; cancellazione non provata |
| Money Management | Tracker/Andamento strategie/Guida, scorrimento, capitale 2000, trade +10, ripristino del piano | persistenza della fonte indicata nel browser; archivio Neon del prodotto da costruire |

## Le 13 tab del dettaglio
| Tab | Contenuti acquisiti |
|---|---|
| CONSIGLIO | lay, quota equa/manuale, stake, check 75, condizioni di stop; cinque risposte assistente e quota manuale testate |
| STATS | statistiche recenti FT/HT/secondo tempo, gol, BTTS, casa/trasferta, forma, tiri e pressione |
| STATS + | campioni 5/10/20, complessivo/casa-trasferta, stessa lega, H2H, Race; varianti cliccate |
| TIMING DEI GOL | finestre di 15 minuti, gol segnati/subiti; campioni e modalità cliccati |
| FORMAZIONI | moduli, titolari, riserve, assenti e statistiche giocatori |
| OCCORRENZE | risultati esatti, campioni, frequenze e soglie |
| GESTIONE 75' | tutti i 14 punteggi disponibili aperti, casi e variazione del risultato |
| DISTRIBUZIONI | risultati al 75 e finali con frequenze |
| STORICO | profili quota e partite storiche, HT/FT, tempi gol |
| PROFIT CS | lay su CS, rendimento per squadra e responsabilità unitaria |
| ROI Asset Performance | 13 mercati BACK su lega, etichetta quota e squadra; tre Legend aperte |
| INDEX | indice gol, CV e Legend; indice non disponibile non è uno zero valido |
| CLASSIFICA | risultati, gol, punti, forma; varianti Generale/Casa/Trasferta cliccate |

## Backtest e verifica economica
Due esecuzioni esplicite con guard distinti, massimo un tentativo ciascuno. Stesso scenario: 60', 1-1; quota 1 [1.5,2], X [3,5], 2 [3,5], tutti i campionati. Campione restituito: 2324 casi su 17929 candidati. Il secondo risultato mostra **3 backtest rimasti oggi**.
I 13 mercati disponibili sono stati calcolati sia Punta sia Banca: 26 casi, quota 3, importo 10, commissione 5%. Tutti i 26 output sono stati riconciliati indipendentemente su conteggi, profitto netto, rischio totale e ROI arrotondato.
Esempio risultato invariato: BACK 804 vinte/1520 perse, profitto +76 EUR, rischio cumulato 23240 EUR; LAY 1520 vinte/804 perse, profitto -1640 EUR, rischio cumulato 46480 EUR.
Il campo importo è lo stake di bancata; la responsabilità è stake × (quota − 1). Il rischio cumulato storico non equivale all'esposizione contemporanea.
La simulazione usa **la stessa quota su tutte le partite storiche**: non sono esecuzioni reali a quote live storiche. La sequenza del drawdown non è stata ricostruita indipendentemente. Canvas equity osservato 1400×280; la presenza del canvas non certifica la correttezza di ogni punto.
Le 26 validazioni derivate in Neon referenziano gli snapshot originali. Non usare la data della validazione come timestamp della quota.

## Strategie salvate, limiti e persistenza
Certificazione finale v27/v28: cinque strategie backtest e cinque Live coesistono nello stesso contesto; i limiti di salvataggio sono indipendenti. La sesta backtest è rifiutata con avviso esplicito; il salvataggio Live è disabilitato a cinque voci. Nessuna sostituzione silenziosa osservata.
Richiamo: minuto backtest 60 ripristinato dopo modifica a 11; gol casa live 2 dopo modifica a 0. Backtest: cinque voci persistono dopo reload e in nuovo contesto autenticato. Live: cinque voci persistono dopo reload; non certificata interoperabilità tra dispositivi.
Dieci sole voci QA eliminate via ✕ della propria riga. Reload e nuovo contesto autenticato confermano assenza di voci QA nei due elenchi. Nessuna cancellazione globale o strategia personale azionata.
La fonte richiede un backtest eseguito prima del salvataggio. Terzo backtest con guard source-backtest-test-2026-10-02-03; fonte mostra due rimasti oggi. Quarto proposto ma non eseguito; non esaurito il budget per provare il limite del sesto backtest giornaliero/reset.
Matrice scenari/esiti/evidenze: [certificazione controlli](control-certification-2026-10-02.md). 22 asserzioni finali v27 passate; v28 verifica anche cinque selettori ordinamento, apertura inserimento manuale e contesto pulito. Un selettore attivato non certifica la correttezza dell'intero ordinamento su tutti i dati.
Le strategie MatchPilot devono avere persistenza propria in Neon.

## Dati live e qualità
Osservati aggiornamenti di minuto, risultato, statistiche e prezzi nel pannello della fonte, inclusa una lettura successiva a 60 secondi. Non è un worker continuativo.
Gol+/Gol++ e proiezione CS mostrano campione e criterio di comparabilità; un caso usava tutta la competizione perché le quote non erano abbastanza simili. Registrare tale fallback e non presentarlo come un profilo di quote identico.
Il testo dei filtri descrive Gol++ ambiguamente, mentre la guida lo lega ad almeno due reti ulteriori: semantica ancora da chiarire.
I prezzi back/lay sono letti dalla fonte. Timestamp della quota, liquidità e verifica indipendente exchange non disponibili. Betwatch resta una fase successiva.
Tenere separate statistiche recenti, storico dashboard, ROI Asset Performance, Profit CS e ROI Strategie. Quest'ultimo ha sei combinazioni 1/X/2 × BACK/LAY su stessa lega e tutte le tre quote vicine; le soglie hanno direzione diversa per punta e banca.
Altre incongruenze: descrizione QE lay rispetto alla soglia; giocatori indicati sia titolari sia assenti. Non risolverle inventando dati.

## Money e Ladder
Money: capitale/cassa iniziali 1000 EUR; un trade virtuale +10 porta cassa 1010, profitto 10, ROI 1%; ripristino verificato a cassa 1000 e profitto zero. I totali previsti delle righe del piano non sono profitto realizzato.
Ladder: obiettivo 10, quota 5, commissione 5% produce stake 10, vincita netta 9.50 e perdita 40, pur descrivendo un obiettivo netto. Discrepanza reale da non copiare nel motore del prodotto. Un obiettivo netto 10 richiederebbe stake 10/0.95 e responsabilità quattro volte lo stake.

## Parser e test
- Nuovi controlli: discovered, nessuna attivazione automatica. Rilevati anche controlli CSS cliccabili, summary e attributi di accessibilità. Evitare i controlli nascosti.
- Nessun valore generico di input, password, chiave o campo arbitrario viene conservato nel catalogo; redazione dei dati sensibili.
- Collezioni opzionali malformate non fanno cadere i dati noti. Campi essenziali mancanti impediscono l'uso; la diagnostica invalida viene conservata.
- Validazione vista separata: autenticazione/caricamento osservati, pagina non vuota, tab richiesta selezionata e visibile. Vecchi snapshot senza questi flag non certificano readiness.
- ROI Strategie: sei righe essenziali, conteggi/percentuali/quote/direzione validi.
- source-finance.mjs: contesto finanziario esplicito, conteggi coerenti, profitto/commissione/responsabilità/ROI riconciliati; formato monetario italiano rigoroso.
- **16 test locali passati; 26 casi reali di output finanziario riconciliati.** Readiness della vista è necessaria, ma non basta a certificare un dataset operativo completo.

## Resta da costruire o certificare
Normalizzazione completa per partita, schema operativo di giornata, ledger virtuale e money management del prodotto, UI neutra desktop/mobile, analisi OpenRouter, scheduling ogni minuto, recupero delle interruzioni, prova dall'inizio alla fine di una partita e rilettura il giorno successivo.
Restano non certificati percorsi distruttivi, scritture di esito, importazione effettiva, cambio data (nessun input visibile univoco) e limite/reset dei backtest giornalieri. Salvataggi, limiti incrociati e cancellazione delle sole voci QA sono verificati. Il sito attuale è un pannello privato di test dell'infrastruttura, non il prodotto finale.
