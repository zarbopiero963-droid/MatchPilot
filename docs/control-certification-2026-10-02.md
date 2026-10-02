> **Aggiornamento issue #2 — 2 ottobre2026 23:08 UTC /3 ottobre01:08 Europe/Rome:** 4/15 criteri conclusi (3 PASSED,1 NON DISPONIBILE);11 aperti. [Registro corrente dei test reali](issue-2-qa-progress-2026-10-02.md). L'issue resta aperta e non chiudibile. Le sezioni sottostanti conservano inventario e risultati storici; per i residui H2H/logout/manuale e i nuovi test fa fede il registro aggiornato. 315 controlli censiti non equivalgono a315 certificati. Il run completato non equivale a un criterio superato.

## Aggiornamento QA — 2 ottobre 2026, run v39 concluso

[Mappa pulsanti e scenari](button-map-2026-10-02.md) · [Registro JSON](button-map-2026-10-02.json).

La mappatura comprende 315 voci deduplicate da 96 inventari, non 315 pulsanti certificati. Famiglie per partita provate su campioni; clic osservati distinti dalle asserzioni superate. v34/v35 coprono pannelli Dashboard, icone Card/Tabella Live, 9 opzioni Stats+, 4 mercati quote, 16 header tabella, 14 azioni Asian Odds. v36 verifica layout, 18/19 checkbox Dashboard e 9 leghe. v38 verifica tre esiti QA, form rischio/quota, quattro filtri Archivio e cancellazione delle sole fixture; v39 conferma archivio vuoto in nuovo contesto. Tre guard archivio cleaned=true e cleanupNeeded=false. 16 test parser/stato/finanza passati.

**Certificazione ancora parziale:** H2H Dashboard non cliccabile nel test; logout cliccato ma login non apparso entro attesa; cambio data senza picker osservato; svuotamento del feed automatico non produce zero righe, manuale popolato non certificato. Restano import non vuoto, ordinamento effettivo di tutti i 16 header Live, combinazioni filtri, persistenza tra dispositivi, reset giornaliero, audio/mobile/iframe e verifica algoritmica. Nessun ordine economico eseguito.


# Matrice dei controlli — 2 ottobre 2026

## Significato degli esiti
- **passed**: scenario e asserzione specifica superati; non certifica tutti gli altri input del controllo.
- **observed**: azione svolta e stato acquisito, senza asserzione completa sul risultato.
- **failed/blocked**: prova non superata o prerequisito assente; conserva il tentativo, anche se un test successivo lo corregge.
- Il censimento DOM comprende controlli dinamici e nuove funzioni. Non costituisce una certificazione universale.
- Gli snapshot indicati si trovano in Neon, tabella matchpilot_source_snapshots. Nessuna credenziale o cookie è riportato.

## Prove ripetibili del parser
16 test locali superati: espansioni del catalogo, dati mancanti/malformati, identità ripetute, selezione effettiva della tab, autenticazione/caricamento, ROI Strategie e riconciliazione finanziaria BACK/LAY. 26 output reali osservati riconciliati per conteggi/profitto/rischio/ROI; equity e drawdown cronologici non ricostruiti.

## Registro delle prove

## Certificazione dei salvataggi e dei limiti
Scenario finale v27: **22 asserzioni passate** (2 backtest persistenti + 20 live/limiti/cancellazioni). Il limite backtest della sesta voce è provato nel v24 con avviso esplicito; il quinto salvataggio aveva un'asserzione prematura, ma tutte cinque le voci sono state verificate dopo reload e in nuovo contesto nel v27. Non trasformare quel tentativo failed in passed: le prove successive certificano lo stato raggiunto.

| Funzione | Esito verificato | Prova |
|---|---|---|
| Salva backtest | Cinque voci presenti dopo reload | v24, v27 |
| Rifiuta sesta backtest | Avviso massimo cinque; nessuna voce sostituita | v24 |
| Richiama backtest | Minuto salvato 60 ripristinato dopo modifica a 11 | v24, v27 |
| Persistenza backtest | Cinque proprie voci presenti in nuovo contesto autenticato | v27 |
| Salva live | Cinque voci, ciascuna con asserzione di presenza | v27 |
| Rifiuta sesta live | Pulsante disabilitato a cinque; voci conservate | v27 |
| Richiama live | Gol casa 2 ripristinato dopo modifica a 0 | v27 |
| Persistenza live | Cinque voci dopo reload nella stessa sessione | v27 |
| Limiti incrociati | Cinque backtest + cinque live contemporaneamente | v27 |
| Elimina backtest/live | Dieci sole voci QA eliminate via controllo ✕ della rispettiva riga | v27 |
| Persistenza cancellazione | Nessuna voce QA ricompare dopo reload | v27 |

Backtest: la fonte richiede un'esecuzione prima di salvare una strategia. Tre esecuzioni effettive protette oggi; la quarta proposta non è stata eseguita. Non esaurito il limite quotidiano per provare un sesto calcolo. La fonte indica due richieste residue nel terzo risultato. Non è certificato il reset giornaliero o il rifiuto del sesto backtest eseguito.

Distinguere la persistenza backtest osservata tra contesti dalla persistenza Live osservata dopo reload: nessuna prova di sincronizzazione Live tra dispositivi.

## Limiti della certificazione
- Cancellazioni globali Archivio/Palinsesto e reset distruttivi del tracker non azionati: cancellerebbero dati non QA.
- Vinto/Perso/Saltato, importazione e analisi globale del palinsesto non certificate come operazioni reali completate.
- Moduli non abilitati all'account non letti né sbloccati.
- Identità dinamiche, ulteriori combinazioni di filtri, schede prive di dati e stati futuri non sono garantiti da questa sessione.
- Gol++ e direzione della quota equa hanno descrizioni discordanti; equità e drawdown cronologici non ricostruiti.
- Quote live della fonte osservate senza timestamp prezzo/liquidità indipendenti.
- I fallimenti v22–v26 includono prerequisito backtest non soddisfatto, attese premature e selettori con contatore dinamico. Non attribuirli automaticamente a un difetto del sito.
- Il pannello MatchPilot, AI OpenRouter e worker continuo restano da costruire.

Valutazione QA dei flussi di salvataggio testati: **4/5**. I flussi ordinari finali e i limiti hanno prove positive; restano stati limite quotidiani e semantiche non risolte. Questa valutazione riguarda i flussi osservati, non la redditività o il prodotto MatchPilot.

## Ultima navigazione v28
Cinque selezioni ordinamento e apertura inserimento manuale passate. Elenchi backtest/live puliti in nuovo contesto autenticato. Filtri archivio osservati su elenco vuoto: nessuna validazione su operazioni storiche. Cambio data BLOCCATO per assenza di un input data visibile univoco; clic del comando osservato, nessun cambio giornata certificato.

Le prove finali v27/v28 sono concluse. Tre backtest eseguiti oggi, due residui osservati; nessun quarto run source-backtest-test-2026-10-02-04 presente. Nessuna strategia QA residua nei due elenchi verificati.

### Live: test results

Evidenza Neon: `source-mapping-2026-10-02-qa-v15-Live-tests`.

| Scenario | Esito | Limite osservato |
|---|---|---|
| Vista tabella | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| Vista card | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| Tutti i campionati ▾ | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| 🎯 Scores ▾ | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| 🕐 Time ▾ | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| ⭐ Le mie strategie ▾ | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| Apri filtri | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Gol casa zero | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Gol casa qualsiasi | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Dettaglio Gol+ Gol++ | blocked | No visible control for current live state |
| Risultato Esatto Live | blocked | No visible control for current live state |
| 1X2 | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| O/U | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| BTTS | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| Risultato | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| STATS+ | observed | Asserzione specifica se passed; altrimenti sola osservazione |

### Dashboard: test results

Evidenza Neon: `source-mapping-2026-10-02-qa-v15-Dashboard-tests`.

| Scenario | Esito | Limite osservato |
|---|---|---|
| BANCA | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| GIOCABILE | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| OSSERVA | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| SCARTA | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| TUTTE | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| STRATEGIE | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| Reset filtri | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| Vista tabella | failed | page.waitForFunction: Timeout 60000ms exceeded. |

### Backtest Storico: test results

Evidenza Neon: `source-mapping-2026-10-02-qa-v15-Backtest Storico-tests`.

| Scenario | Esito | Limite osservato |
|---|---|---|
| Ricerca campionato | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Backtest una esecuzione | observed | Asserzione specifica se passed; altrimenti sola osservazione |

### Asian Odds: test results

Evidenza Neon: `source-mapping-2026-10-02-qa-v15-Asian Odds-tests`.

| Scenario | Esito | Limite osservato |
|---|---|---|
| Filtro Live | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| Filtro Non iniziate | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| Filtro Tutte | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| Ricerca aoSearchInput | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| Ricerca aoTeamSearchInput | observed | Asserzione specifica se passed; altrimenti sola osservazione |

### Statistiche Lega: test results

Evidenza Neon: `source-mapping-2026-10-02-qa-v15-Statistiche Lega-tests`.

| Scenario | Esito | Limite osservato |
|---|---|---|
| Ricerca NORWAY | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Ricerca inesistente | observed | Asserzione specifica se passed; altrimenti sola osservazione |

### Ladder Dutching: test results

Evidenza Neon: `source-mapping-2026-10-02-qa-v15-Ladder Dutching-tests`.

| Scenario | Esito | Limite osservato |
|---|---|---|
| Lay 0-0 quota 5 | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Azzera quote | observed | Asserzione specifica se passed; altrimenti sola osservazione |

### Analisi: test results

Evidenza Neon: `source-mapping-2026-10-02-qa-v15-Analisi-tests`.

| Scenario | Esito | Limite osservato |
|---|---|---|

### Money Management: test results

Evidenza Neon: `source-mapping-2026-10-02-qa-v15-Money Management-tests`.

| Scenario | Esito | Limite osservato |
|---|---|---|

### Dashboard: test results

Evidenza Neon: `source-mapping-2026-10-02-qa-v16-Dashboard-tests`.

| Scenario | Esito | Limite osservato |
|---|---|---|
| BANCA | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| GIOCABILE | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| OSSERVA | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| SCARTA | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| TUTTE | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| STRATEGIE | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| Reset filtri | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| Vista tabella | observed | Asserzione specifica se passed; altrimenti sola osservazione |

### Dettaglio: STATS +: test results

Evidenza Neon: `source-mapping-2026-10-02-qa-v16-Dettaglio: STATS +-tests`.

| Scenario | Esito | Limite osservato |
|---|---|---|
| Filtro 5 | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| Filtro 10 | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| Filtro 20 | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| Filtro Casa / Trasf. | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| Filtro Complessivo | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| Filtro Stessa lega | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| Filtro Tutte | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| Filtro H2H | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| Filtro Race | observed | Asserzione specifica se passed; altrimenti sola osservazione |

### Dettaglio: TIMING DEI GOL: test results

Evidenza Neon: `source-mapping-2026-10-02-qa-v16-Dettaglio: TIMING DEI GOL-tests`.

| Scenario | Esito | Limite osservato |
|---|---|---|
| Filtro 5 | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| Filtro 10 | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| Filtro 20 | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| Filtro Overall | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| Filtro Casa/Trasferta | observed | Asserzione specifica se passed; altrimenti sola osservazione |

### Dettaglio: GESTIONE 75': test results

Evidenza Neon: `source-mapping-2026-10-02-qa-v16-Dettaglio: GESTIONE 75'-tests`.

| Scenario | Esito | Limite osservato |
|---|---|---|
| Punteggio 0-0 12 casi 14.5%  | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| Punteggio 1-1 10 casi 12.0%  | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| Punteggio 2-1 10 casi 12.0%  | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| Punteggio 1-0 9 casi 10.8%  | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| Punteggio 0-1 7 casi 8.4%  | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| Punteggio 2-0 6 casi 7.2%  | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| Punteggio 3-0 6 casi 7.2%  | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| Punteggio 1-3 4 casi 4.8%  | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| Punteggio 3-1 4 casi 4.8%  | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| Punteggio 1-2 3 casi 3.6%  | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| Punteggio 2-2 3 casi 3.6%  | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| Punteggio 2-3 3 casi 3.6%  | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| Punteggio 0-3 1 casi 1.2%  | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| Punteggio 3-2 1 casi 1.2%  | observed | Asserzione specifica se passed; altrimenti sola osservazione |

### Dettaglio: CLASSIFICA: test results

Evidenza Neon: `source-mapping-2026-10-02-qa-v16-Dettaglio: CLASSIFICA-tests`.

| Scenario | Esito | Limite osservato |
|---|---|---|
| Filtro Casa | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| Filtro Trasferta | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| Filtro Generale | observed | Asserzione specifica se passed; altrimenti sola osservazione |

### Dettaglio: 📊 ROI: test results

Evidenza Neon: `source-mapping-2026-10-02-qa-v16-Dettaglio: 📊 ROI-tests`.

| Scenario | Esito | Limite osservato |
|---|---|---|

### Dettaglio: CONSIGLIO: test results

Evidenza Neon: `source-mapping-2026-10-02-qa-v16-Dettaglio: CONSIGLIO-tests`.

| Scenario | Esito | Limite osservato |
|---|---|---|
| Quota manuale 5 | passed | Asserzione specifica se passed; altrimenti sola osservazione |

### Money Management: test results

Evidenza Neon: `source-mapping-2026-10-02-qa-v16-Money Management-tests`.

| Scenario | Esito | Limite osservato |
|---|---|---|
| Tab ANDAMENTO STRATEGIE | blocked | No visible exact control |
| Tab GUIDA | blocked | No visible exact control |
| Tab TRACKER | blocked | No visible exact control |

### Dettaglio: CLASSIFICA: test results

Evidenza Neon: `source-mapping-2026-10-02-qa-v17-attempt-1790954144910-nnktv17o7do-Dettaglio: CLASSIFICA-tests`.

| Scenario | Esito | Limite osservato |
|---|---|---|
| Filtro Casa | blocked | No visible exact control |
| Filtro Trasferta | blocked | No visible exact control |
| Filtro Generale | blocked | No visible exact control |

### Dettaglio: 📊 ROI: test results

Evidenza Neon: `source-mapping-2026-10-02-qa-v17-attempt-1790954144910-nnktv17o7do-Dettaglio: 📊 ROI-tests`.

| Scenario | Esito | Limite osservato |
|---|---|---|

### Dettaglio: CONSIGLIO: test results

Evidenza Neon: `source-mapping-2026-10-02-qa-v17-attempt-1790954144910-nnktv17o7do-Dettaglio: CONSIGLIO-tests`.

| Scenario | Esito | Limite osservato |
|---|---|---|
| Assistente: Entro in lay adesso? | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| Assistente: Quale risultato lavoro? | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| Assistente: Quanto rischio? | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| Assistente: Cosa faccio al 75'? | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| Assistente: È già successo prima? | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| Quota manuale 5 | passed | Asserzione specifica se passed; altrimenti sola osservazione |

### Money Management: test results

Evidenza Neon: `source-mapping-2026-10-02-qa-v17-attempt-1790954144910-nnktv17o7do-Money Management-tests`.

| Scenario | Esito | Limite osservato |
|---|---|---|
| Tab ANDAMENTO STRATEGIE | blocked | No visible exact control |
| Tab GUIDA | blocked | No visible exact control |
| Tab TRACKER | blocked | No visible exact control |

### Money Management: test results

Evidenza Neon: `source-mapping-2026-10-02-qa-v18-attempt-1790954419082-ov76pnxtec-Money Management-tests`.

| Scenario | Esito | Limite osservato |
|---|---|---|
| Tab ANDAMENTO STRATEGIE | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| Tab GUIDA | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| Tab TRACKER | failed | locator.click: Timeout 15000ms exceeded. Call log: [2m - waiting for locator('#btnTracker')[22m [2m - locator resolved to <button class="btn" id="btnTracker" onclick="showView('tracker')">Tracker</button>[22m [2m - attempting click action[22m [2m 2 × waiting for element to be visible, |

### Live: test results

Evidenza Neon: `source-mapping-2026-10-02-qa-v18-attempt-1790954419082-ov76pnxtec-Live-tests`.

| Scenario | Esito | Limite osservato |
|---|---|---|
| Vista tabella | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| Vista card | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| Tutti i campionati ▾ | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| 🎯 Scores ▾ | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| 🕐 Time ▾ | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| ⭐ Le mie strategie ▾ | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| Apri filtri | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Gol casa zero | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Gol casa qualsiasi | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Dettaglio Gol+ Gol++ | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| Risultato Esatto Live | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| 1X2 | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| O/U | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| BTTS | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| Risultato | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| STATS+ | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| Range gol1 massimo | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Range gol1 minimo | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Range gol2 massimo | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Range gol2 minimo | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Range tiri massimo | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Range tiri minimo | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Range tirit massimo | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Range tirit minimo | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Range corner massimo | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Range corner minimo | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Range poss massimo | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Range poss minimo | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Range q1 massimo | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Range q1 minimo | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Range qx massimo | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Range qx minimo | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Range q2 massimo | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Range q2 minimo | passed | Asserzione specifica se passed; altrimenti sola osservazione |

### Money Management: test results

Evidenza Neon: `source-mapping-2026-10-02-qa-v19-attempt-1790954802480-vlbubcog2i-Money Management-tests`.

| Scenario | Esito | Limite osservato |
|---|---|---|
| Tab ANDAMENTO STRATEGIE | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| Tab GUIDA | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| Tab TRACKER | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| Capitale virtuale 2000 | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Trade virtuale +10 | passed | Asserzione specifica se passed; altrimenti sola osservazione |

### Live: test results

Evidenza Neon: `source-mapping-2026-10-02-qa-v19-attempt-1790954802480-vlbubcog2i-Live-tests`.

| Scenario | Esito | Limite osservato |
|---|---|---|
| Vista tabella | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| Vista card | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| Tutti i campionati ▾ | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| 🎯 Scores ▾ | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| 🕐 Time ▾ | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| ⭐ Le mie strategie ▾ | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| Apri filtri | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Gol casa zero | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Gol casa qualsiasi | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Dettaglio Gol+ Gol++ | blocked | No visible control for current live state |
| Risultato Esatto Live | blocked | No visible control for current live state |
| 1X2 | blocked | No visible control for current live state |
| O/U | blocked | No visible control for current live state |
| BTTS | blocked | No visible control for current live state |
| Risultato | blocked | No visible control for current live state |
| STATS+ | blocked | No visible control for current live state |
| HT 0-0 | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| HT 0-1 | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| HT 0-2 | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| HT 0-3 | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| HT 1-0 | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| HT 1-1 | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| HT 1-2 | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| HT 1-3 | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| HT 2-0 | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| HT 2-1 | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| HT 2-2 | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| HT 2-3 | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| HT 3-0 | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| HT 3-1 | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| HT 3-2 | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| HT 3-3 | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| Salva strategia QA | failed | Expected result missing |

### Live: test results

Evidenza Neon: `source-mapping-2026-10-02-qa-v20-attempt-1790955110274-j2rg1n2dg6-Live-tests`.

| Scenario | Esito | Limite osservato |
|---|---|---|
| Salva strategia QA | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Richiama strategia QA | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Persistenza strategia dopo reload | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Rimuovi solo strategia QA | failed | locator.click: Timeout 15000ms exceeded. Call log: [2m - waiting for locator('[data-matchpilot-cleanup="qa-strategy"]')[22m [2m - locator resolved to <button type="button" title="Chiudi" data-live-scclose="" data-matchpilot-cleanup="qa-strategy">✕</button>[22m [2m - attempting click action |

### Live: test results

Evidenza Neon: `source-mapping-2026-10-02-qa-v21-attempt-1790955927764-t0afz6i8oyn-Live-tests`.

| Scenario | Esito | Limite osservato |
|---|---|---|
| Nuovo contesto senza strategia QA | passed | Asserzione specifica se passed; altrimenti sola osservazione |

### Backtest Storico: test results

Evidenza Neon: `source-mapping-2026-10-02-qa-v21-attempt-1790955927764-t0afz6i8oyn-Backtest Storico-tests`.

| Scenario | Esito | Limite osservato |
|---|---|---|
| Ricerca campionato | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Backtest una esecuzione | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| Finisce con lo stesso risultato Punta | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Finisce con lo stesso risultato Banca | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Almeno un altro gol Punta | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Almeno un altro gol Banca | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Over 2,5 finale Punta | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Over 2,5 finale Banca | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Over 3,5 finale Punta | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Over 3,5 finale Banca | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| 1 (vince la casa) Punta | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| 1 (vince la casa) Banca | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| X (pareggio) Punta | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| X (pareggio) Banca | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| 2 (vince l'ospite) Punta | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| 2 (vince l'ospite) Banca | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Risultato esatto 1-1 Punta | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Risultato esatto 1-1 Banca | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Risultato esatto 2-1 Punta | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Risultato esatto 2-1 Banca | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Risultato esatto 1-2 Punta | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Risultato esatto 1-2 Banca | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Risultato esatto 2-2 Punta | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Risultato esatto 2-2 Banca | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Risultato esatto 3-1 Punta | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Risultato esatto 3-1 Banca | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Risultato esatto 3-2 Punta | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Risultato esatto 3-2 Banca | passed | Asserzione specifica se passed; altrimenti sola osservazione |

### Backtest Storico: saved strategy test results

Evidenza Neon: `source-mapping-2026-10-02-qa-v22-attempt-1790957354349-sagp93yz0x-Backtest Storico-tests`.

| Scenario | Esito | Limite osservato |
|---|---|---|
| Salva 1 di 5 | failed | Saved name absent |
| Salva 2 di 5 | failed | Saved name absent |
| Salva 3 di 5 | failed | Saved name absent |
| Salva 4 di 5 | failed | Saved name absent |
| Salva 5 di 5 | failed | Saved name absent |
| Sesta strategia rifiutata | failed | Five entries not established |
| Richiamo parametri salvati | failed | locator.click: Timeout 15000ms exceeded. Call log: [2m - waiting for getByText('QA MP v22 Backtest Storico 1', { exact: true }).visible()[22m  |
| Persistenza cinque dopo reload | failed | Reload lost entries |

### Backtest Storico: saved strategy test results

Evidenza Neon: `source-mapping-2026-10-02-qa-v23-attempt-1790957541128-ubsd21x240i-Backtest Storico-tests`.

| Scenario | Esito | Limite osservato |
|---|---|---|
| Salva 1 di 5 | failed | Saved name absent |
| Salva 2 di 5 | failed | Saved name absent |
| Salva 3 di 5 | failed | Saved name absent |
| Salva 4 di 5 | failed | Saved name absent |
| Salva 5 di 5 | failed | Saved name absent |
| Sesta strategia rifiutata | failed | Five entries not established |
| Richiamo parametri salvati | failed | locator.click: Timeout 15000ms exceeded. Call log: [2m - waiting for getByText('QA MP v23 Backtest Storico 1', { exact: true }).visible()[22m  |
| Persistenza cinque dopo reload | failed | Reload lost entries |

### Live: saved strategy test results

Evidenza Neon: `source-mapping-2026-10-02-qa-v23-attempt-1790957541128-ubsd21x240i-Live-tests`.

| Scenario | Esito | Limite osservato |
|---|---|---|
| Salva 1 di 5 | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Salva 2 di 5 | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Salva 3 di 5 | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Salva 4 di 5 | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Salva 5 di 5 | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Sesta strategia rifiutata | failed | locator.click: Timeout 15000ms exceeded. Call log: [2m - waiting for locator('[data-matchpilot-target="true"]')[22m [2m - locator resolved to <button disabled class="lav-save-btn" data-live-advsavetoggle="" data-matchpilot-target="tr |
| Richiamo parametri salvati | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Persistenza cinque dopo reload | failed | locator.click: Timeout 15000ms exceeded. Call log: [2m - waiting for getByRole('button', { name: '⚙️ Filtri avanzati', exact: true })[22m  |
| Limiti indipendenti: cinque backtest e cinque live | failed | Five live entries absent |

### Backtest Storico: saved strategy test results

Evidenza Neon: `source-mapping-2026-10-02-qa-v24-attempt-1790957756780-6zqz4ww74kl-Backtest Storico-tests`.

| Scenario | Esito | Limite osservato |
|---|---|---|
| Salva 1 di 5 | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Salva 2 di 5 | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Salva 3 di 5 | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Salva 4 di 5 | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Salva 5 di 5 | failed | Saved name absent |
| Sesta strategia rifiutata | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Richiamo parametri salvati | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Persistenza cinque dopo reload | passed | Asserzione specifica se passed; altrimenti sola osservazione |

### Live: saved strategy test results

Evidenza Neon: `source-mapping-2026-10-02-qa-v24-attempt-1790957756780-6zqz4ww74kl-Live-tests`.

| Scenario | Esito | Limite osservato |
|---|---|---|
| Salva 1 di 5 | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Salva 2 di 5 | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Salva 3 di 5 | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Salva 4 di 5 | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Salva 5 di 5 | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Sesta strategia rifiutata | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Richiamo parametri salvati | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Persistenza cinque dopo reload | failed | locator.click: Timeout 15000ms exceeded. Call log: [2m - waiting for getByRole('button', { name: '⚙️ Filtri avanzati', exact: true })[22m  |
| Limiti indipendenti: cinque backtest e cinque live | failed | Five live entries absent |

### Backtest Storico: saved strategy test results

Evidenza Neon: `source-mapping-2026-10-02-qa-v25-attempt-1790958179314-0oyuld1fubod-Backtest Storico-tests`.

| Scenario | Esito | Limite osservato |
|---|---|---|
| Preservare strategie esistenti | blocked | Initial list not empty |

### Live: saved strategy test results

Evidenza Neon: `source-mapping-2026-10-02-qa-v25-attempt-1790958179314-0oyuld1fubod-Live-tests`.

| Scenario | Esito | Limite osservato |
|---|---|---|
| Salva 1 di 5 | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Salva 2 di 5 | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Salva 3 di 5 | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Salva 4 di 5 | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Salva 5 di 5 | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Sesta strategia rifiutata | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Richiamo parametri salvati | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Persistenza cinque dopo reload | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Limiti indipendenti: cinque backtest e cinque live | failed | Backtest entries lost when live populated |
| Elimina solo QA Backtest Storico 1 | failed | Own QA row not unique |
| Elimina solo QA Backtest Storico 2 | failed | Own QA row not unique |
| Elimina solo QA Backtest Storico 3 | failed | Own QA row not unique |
| Elimina solo QA Backtest Storico 4 | failed | Own QA row not unique |
| Elimina solo QA Backtest Storico 5 | failed | Own QA row not unique |
| Elimina solo QA Live 1 | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Elimina solo QA Live 2 | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Elimina solo QA Live 3 | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Elimina solo QA Live 4 | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Elimina solo QA Live 5 | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Pulizia persistente dopo reload | passed | Asserzione specifica se passed; altrimenti sola osservazione |

### Backtest Storico: saved strategy test results

Evidenza Neon: `source-mapping-2026-10-02-qa-v26-attempt-1790958377622-xcypnrl4fyc-Backtest Storico-tests`.

| Scenario | Esito | Limite osservato |
|---|---|---|
| Preservare strategie esistenti | blocked | Initial list not empty |

### Live: saved strategy test results

Evidenza Neon: `source-mapping-2026-10-02-qa-v26-attempt-1790958377622-xcypnrl4fyc-Live-tests`.

| Scenario | Esito | Limite osservato |
|---|---|---|
| Salva 1 di 5 | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Salva 2 di 5 | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Salva 3 di 5 | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Salva 4 di 5 | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Salva 5 di 5 | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Sesta strategia rifiutata | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Richiamo parametri salvati | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Persistenza cinque dopo reload | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Limiti indipendenti: cinque backtest e cinque live | failed | locator.waitFor: Timeout 15000ms exceeded. Call log: [2m - waiting for getByText('QA MP v26 Backtest Storico 1', { exact: true }).visible().first() to be visible[22m  |
| Elimina solo QA Backtest Storico 1 | failed | Own QA row not unique |
| Elimina solo QA Backtest Storico 2 | failed | Own QA row not unique |
| Elimina solo QA Backtest Storico 3 | failed | Own QA row not unique |
| Elimina solo QA Backtest Storico 4 | failed | Own QA row not unique |
| Elimina solo QA Backtest Storico 5 | failed | Own QA row not unique |
| Elimina solo QA Live 1 | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Elimina solo QA Live 2 | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Elimina solo QA Live 3 | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Elimina solo QA Live 4 | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Elimina solo QA Live 5 | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Pulizia persistente dopo reload | passed | Asserzione specifica se passed; altrimenti sola osservazione |

### Backtest Storico: saved strategy test results

Evidenza Neon: `source-mapping-2026-10-02-qa-v27-attempt-1790958518728-ohi22saoqoo-Backtest Storico-tests`.

| Scenario | Esito | Limite osservato |
|---|---|---|
| Cinque backtest persistenti da contesto precedente | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Richiamo backtest persistente | passed | Asserzione specifica se passed; altrimenti sola osservazione |

### Live: saved strategy test results

Evidenza Neon: `source-mapping-2026-10-02-qa-v27-attempt-1790958518728-ohi22saoqoo-Live-tests`.

| Scenario | Esito | Limite osservato |
|---|---|---|
| Salva 1 di 5 | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Salva 2 di 5 | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Salva 3 di 5 | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Salva 4 di 5 | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Salva 5 di 5 | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Sesta strategia rifiutata | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Richiamo parametri salvati | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Persistenza cinque dopo reload | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Limiti indipendenti: cinque backtest e cinque live | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Elimina solo QA Backtest Storico 1 | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Elimina solo QA Backtest Storico 2 | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Elimina solo QA Backtest Storico 3 | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Elimina solo QA Backtest Storico 4 | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Elimina solo QA Backtest Storico 5 | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Elimina solo QA Live 1 | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Elimina solo QA Live 2 | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Elimina solo QA Live 3 | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Elimina solo QA Live 4 | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Elimina solo QA Live 5 | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Pulizia persistente dopo reload | passed | Asserzione specifica se passed; altrimenti sola osservazione |

### Dashboard: final navigation results

Evidenza Neon: `source-mapping-2026-10-02-qa-v28-attempt-1790958711001-wc2vecl1lr-Dashboard-tests`.

| Scenario | Esito | Limite osservato |
|---|---|---|
| Selezione ordinamento Score | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Selezione ordinamento Rischio | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Selezione ordinamento Orario | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Selezione ordinamento Campionato | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Selezione ordinamento Nome | passed | Asserzione specifica se passed; altrimenti sola osservazione |
| Apri scelta giornata | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| Cambio data | blocked | No unique visible date input; native picker not certified |

### Palinsesto: final navigation results

Evidenza Neon: `source-mapping-2026-10-02-qa-v28-attempt-1790958711001-wc2vecl1lr-Palinsesto-tests`.

| Scenario | Esito | Limite osservato |
|---|---|---|
| Apri inserimento manuale | passed | Asserzione specifica se passed; altrimenti sola osservazione |

### Archivio: final navigation results

Evidenza Neon: `source-mapping-2026-10-02-qa-v28-attempt-1790958711001-wc2vecl1lr-Archivio-tests`.

| Scenario | Esito | Limite osservato |
|---|---|---|
| Filtro archivio VINTE | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| Filtro archivio PERSE | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| Filtro archivio SALTATE | observed | Asserzione specifica se passed; altrimenti sola osservazione |
| Filtro archivio TUTTE | observed | Asserzione specifica se passed; altrimenti sola osservazione |

### Live: final navigation results

Evidenza Neon: `source-mapping-2026-10-02-qa-v28-attempt-1790958711001-wc2vecl1lr-Live-tests`.

| Scenario | Esito | Limite osservato |
|---|---|---|
| Nuovo contesto live pulito | passed | Asserzione specifica se passed; altrimenti sola osservazione |

### Backtest Storico: final navigation results

Evidenza Neon: `source-mapping-2026-10-02-qa-v28-attempt-1790958711001-wc2vecl1lr-Backtest Storico-tests`.

| Scenario | Esito | Limite osservato |
|---|---|---|
| Nuovo contesto backtest pulito | passed | Asserzione specifica se passed; altrimenti sola osservazione |
