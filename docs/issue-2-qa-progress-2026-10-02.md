# Issue #2 — registro aggiornato dei test reali

Stato: **4/15 criteri conclusi**, di cui 3 PASSED e 1 NON DISPONIBILE. **Non chiudibile**. L'owner chiuderà l'issue soltanto quando tutti i criteri saranno soddisfatti. I test sono stati eseguiti sequenzialmente sull'account autorizzato; nessun ordine reale.

Aggiornamento **03/10/2026 16:52 Europe/Rome**: prove Live v101–v106 concluse, vedere sezioni finali per asserzioni e snapshot. Restano 5 punti attivi non conclusi (QA01, QA06, QA07, QA09, QA14). QA05, QA10–12, QA13 e QA15 sono esclusi dalle prove attive per decisione owner, senza certificazione positiva.

Date: 2 ottobre 2026 UTC / 2–3 ottobre Europe/Rome (UTC+2). La data nei run-id è un'etichetta; fanno fede i timestamp Neon. `run.status=complete` significa esecuzione terminata, non certificazione superata. Le prove originali, inclusi errori del harness, sono conservate.

| Caso | Esito | Ultime versioni | Verificato e residui |
|---|---|---|---|
| QA-01 | PARTIAL | v41 | H2H cliccato e ripristinato: 22→16→22; membership rispetto ai conteggi H2H storici da riconciliare. |
| QA-02 | PASSED | v43 | Logout, accesso diretto negato e nuovo login verificati; verdict derivato conserva errore iniziale del harness. |
| QA-03 | NON DISPONIBILE | v47 | Nessun calendario/input data/dialog/iframe osservato dopo clic. Non certifica un cambio giornata. |
| QA-04 | PASSED | v49 | Manuale QA popolato: Annulla conserva; Conferma elimina; reload pulito e identità feed automatico preservate. |
| QA-05 | SOSPESO owner (storico: PARTIAL) | v51 | Squadre/quote, duplicato unico, malformato e cleanup verificati. Lega e ora non ancora riconciliate. |
| QA-06 | PARTIAL | v101/v106 | 16 header nei due versi, 15 criteri riconciliati; rating numerico stabile su 11 partite. Possesso: criterio discriminante non chiarito. |
| QA-07 | PARTIAL | v102/v103/v103b/v104 | Matrice popolata e cleanup verificati; residui precisione percentuali, scope reset, HT multiplo con due varianti popolate. |
| QA-08 | PASSED | v55 | Strategia Live A salva/reload/richiama; B indipendente non vede: storage locale. Cleanup entrambi. Non prova dispositivi fisici né Backtest. |
| QA-09 | BLOCKED | v57/v62 | Rifiuto reale del limite 5/giorno provato. Reset al confine effettivo e timezone non certificati. |
| QA-10 | SOSPESO owner (storico: PARTIAL) | v60/v73 | 24 viste touch emulato con asset, 12 pagine×2 orientamenti. Scroll verticale e dettagli landscape riprovati (v73), clipping laterale Live da risolvere. |
| QA-11 | SOSPESO owner (storico: PARTIAL) | v59 | On/off, due selezioni e 3 risorse audio HTTP200 provate. Playback udibile e mute effettivo non provati. |
| QA-12 | SOSPESO owner (storico: PARTIAL) | v66 | Due radar con iframe popolati letti e screenshot verificati. Rami vuoto/errore/scroll residui. |
| QA-13 | SOSPESO owner (storico: BLOCKED) | v62 | Nuovo backtest rifiutato per quota giornaliera; serie cronologica individuale/equity/drawdown non certificati. |
| QA-14 | PARTIAL / QE discordante | v94/v104/v105 | Gol+ 11/11, Gol++ 10/11 aggregati UI coerenti entro tolleranze; Vitesse Altro bloccante, storico grezzo/fallback e definizioni non completamente certificati. QE Guida ancora opposta alla UI. |
| QA-15 | SOSPESO owner (storico: FAILED) | v70 | Target dichiarato 10 netti, fee5% restituisce9.50; multi selezioni e arrotondamenti/commissioni discordanti. Reset input eseguito. |

## Blocchi storici — perimetro attivo aggiornato nelle sezioni finali

- Quota Backtest: tentativo protetto v62 respinto con limite 5/giorno; nessun risultato generato. Non ripetere né aggirare il limite. Reset effettivo e timezone ancora da osservare; sequenza storica cronologica ancora da acquisire.
- QE: probabilità mostrata 1,8%, QE55,56; quote QA50/55,5/55,6/60 producono VALORE/NEUTRO/NEUTRO/NON CONVIENE. La Guida prescrive il lato opposto della soglia Lay. Incongruenza da risolvere con il gestore della fonte; nessuna formula inventata nel parser.
- Ladder: quota5, target10, commissione5% dà stake10 e profitto9,50 non10 netti. Due selezioni5/6 producono valori discordanti nella commissione e arrotondamento. Input ripristinati; non certificare l'algoritmo.
- Mobile: controlli Live oltre il bordo destro nella vista393px; accessibilità orizzontale/modal portrait ancora da verificare.
- Audio: download risorse e selettori provati; non costituiscono ascolto/playback effettivo.

## Prove persistite

Journal privati in Neon: `matchpilot_test_runs` e `matchpilot_source_snapshots`. Nessuna credenziale, cookie o immagine privata viene pubblicata nel repository.

- `source-mapping-2026-10-02-issue2-qa01-v40-attempt-1790977189860-kv6ygbsquj-QA01` — 2026-10-02T21:40:46.988Z; stato del journal: non indicato.
- `source-mapping-2026-10-02-issue2-qa01-v40-attempt-1790977189860-kv6ygbsquj-QA01-final` — 2026-10-02T21:40:59.482Z; stato del journal: non indicato.
- `source-mapping-2026-10-02-issue2-qa01-v41-attempt-1790977318038-lqk2wuo5z8q-QA01` — 2026-10-02T21:43:13.426Z; stato del journal: non indicato.
- `source-mapping-2026-10-02-issue2-qa01-v41-attempt-1790977318038-lqk2wuo5z8q-QA01-final` — 2026-10-02T21:43:14.869Z; stato del journal: non indicato.
- `source-mapping-2026-10-02-issue2-qa02-v42-attempt-1790977462844-3yre12d8yn7-QA02` — 2026-10-02T21:44:55.721Z; stato del journal: failed.
- `source-mapping-2026-10-02-issue2-qa02-v43-attempt-1790977575447-88ajbopi45t-QA02` — 2026-10-02T21:47:12.886Z; stato del journal: failed.
- `source-mapping-2026-10-02-issue2-qa03-v47-attempt-1790977961275-kh7pz7tts9-QA03` — 2026-10-02T21:53:01.301Z; stato del journal: observed.
- `source-mapping-2026-10-02-issue2-qa04-v48-attempt-1790978042118-dm6dc25gt1a-QA04` — 2026-10-02T21:55:56.082Z; stato del journal: blocked.
- `source-mapping-2026-10-02-issue2-qa04-v49-attempt-1790978244360-utsx27eyqq-QA04` — 2026-10-02T21:57:50.269Z; stato del journal: passed.
- `source-mapping-2026-10-03-issue2-qa05-v50-attempt-1790978430245-hptdkoffzy5-QA05` — 2026-10-02T22:00:57.192Z; stato del journal: observed.
- `source-mapping-2026-10-03-issue2-qa05-v51-attempt-1790978562983-60bv5xfzif7-QA05` — 2026-10-02T22:03:34.492Z; stato del journal: observed.
- `source-mapping-2026-10-03-issue2-qa06-v52-attempt-1790978759915-h4sfsg06n8o-QA06` — 2026-10-02T22:06:17.471Z; stato del journal: blocked.
- `source-mapping-2026-10-03-issue2-qa06-v53-attempt-1790978853971-xvnugk32dzc-QA06` — 2026-10-02T22:08:19.440Z; stato del journal: blocked.
- `source-mapping-2026-10-03-issue2-qa07-v56-attempt-1790979272251-6s631k477ob-QA07` — 2026-10-02T22:15:26.249Z; stato del journal: partial.
- `source-mapping-2026-10-03-issue2-qa08-v55-attempt-1790979390507-hece8fel3la-QA08` — 2026-10-02T22:17:12.241Z; stato del journal: observed.
- `source-mapping-2026-10-03-issue2-qa09-v57-attempt-1790979562277-pk7eurkt1y-QA09` — 2026-10-02T22:19:43.579Z; stato del journal: blocked.
- `source-mapping-2026-10-03-issue2-qa10-v60-attempt-1790979942465-jtxyp3fqd88-QA10-Dashboard` — 2026-10-02T22:26:11.064Z; stato del journal: partial.
- `source-mapping-2026-10-03-issue2-qa10-v60-attempt-1790979942465-jtxyp3fqd88-QA10-Palinsesto` — 2026-10-02T22:26:32.162Z; stato del journal: partial.
- `source-mapping-2026-10-03-issue2-qa10-v60-attempt-1790979942465-jtxyp3fqd88-QA10-Live` — 2026-10-02T22:26:50.366Z; stato del journal: partial.
- `source-mapping-2026-10-03-issue2-qa10-v60-attempt-1790979942465-jtxyp3fqd88-QA10-Analisi` — 2026-10-02T22:27:05.366Z; stato del journal: partial.
- `source-mapping-2026-10-03-issue2-qa10-v60-attempt-1790979942465-jtxyp3fqd88-QA10-Lay Goleada Favorito` — 2026-10-02T22:27:21.760Z; stato del journal: partial.
- `source-mapping-2026-10-03-issue2-qa10-v60-attempt-1790979942465-jtxyp3fqd88-QA10-Backtest Storico` — 2026-10-02T22:27:36.316Z; stato del journal: partial.
- `source-mapping-2026-10-03-issue2-qa10-v60-attempt-1790979942465-jtxyp3fqd88-QA10-Asian Odds` — 2026-10-02T22:27:50.143Z; stato del journal: partial.
- `source-mapping-2026-10-03-issue2-qa10-v60-attempt-1790979942465-jtxyp3fqd88-QA10-Monitorate` — 2026-10-02T22:28:06.528Z; stato del journal: partial.
- `source-mapping-2026-10-03-issue2-qa10-v60-attempt-1790979942465-jtxyp3fqd88-QA10-Ladder Dutching` — 2026-10-02T22:28:20.541Z; stato del journal: partial.
- `source-mapping-2026-10-03-issue2-qa10-v60-attempt-1790979942465-jtxyp3fqd88-QA10-Statistiche Lega` — 2026-10-02T22:28:34.353Z; stato del journal: partial.
- `source-mapping-2026-10-03-issue2-qa10-v60-attempt-1790979942465-jtxyp3fqd88-QA10-Guida` — 2026-10-02T22:28:48.521Z; stato del journal: partial.
- `source-mapping-2026-10-03-issue2-qa10-v60-attempt-1790979942465-jtxyp3fqd88-QA10-Archivio` — 2026-10-02T22:29:02.599Z; stato del journal: partial.
- `source-mapping-2026-10-03-issue2-qa11-v59-attempt-1790980190244-o0ytbws09aq-QA11` — 2026-10-02T22:30:33.725Z; stato del journal: partial.
- `source-mapping-2026-10-03-issue2-qa12-v61-attempt-1790980304754-ep1dzblprph-QA12` — 2026-10-02T22:32:45.726Z; stato del journal: partial.
- `source-mapping-2026-10-03-issue2-qa12-v65-attempt-1790980443933-euotx29ut4g-QA12` — 2026-10-02T22:35:06.034Z; stato del journal: partial.
- `source-mapping-2026-10-03-issue2-qa12-v66-attempt-1790980577451-xx4fwizzf1-QA12` — 2026-10-02T22:37:20.154Z; stato del journal: partial.
- `source-mapping-2026-10-03-issue2-qa13-v62-attempt-1790980721635-i119jgjyoe-QA13` — 2026-10-02T22:39:33.487Z; stato del journal: blocked.
- `source-mapping-2026-10-03-issue2-qa14-v63-attempt-1790980868390-7nsymeicdup-QA14-Guida` — 2026-10-02T22:41:47.206Z; stato del journal: partial.
- `source-mapping-2026-10-03-issue2-qa14-v63-attempt-1790980868390-7nsymeicdup-QA14-Live` — 2026-10-02T22:41:51.103Z; stato del journal: partial.
- `source-mapping-2026-10-03-issue2-qa14-v63-attempt-1790980868390-7nsymeicdup-QA14-Dashboard` — 2026-10-02T22:42:03.003Z; stato del journal: partial.
- `source-mapping-2026-10-03-issue2-qa14-v68-attempt-1790981058704-92bya6tsatf-QA14QE` — 2026-10-02T22:44:46.957Z; stato del journal: partial.
- `source-mapping-2026-10-03-issue2-qa15-v70-attempt-1790981318871-nx6skuqha2j-QA15` — 2026-10-02T22:48:59.768Z; stato del journal: partial.
- `source-mapping-2026-10-03-issue2-qa06-v69-attempt-1790981466038-lc4wact7y7e-QA06` — 2026-10-02T22:52:05.330Z; stato del journal: observed.
- `source-mapping-2026-10-03-issue2-qa06-v72-attempt-1790981855425-h2is4i8t1ae-QA06` — 2026-10-02T22:58:32.561Z; stato del journal: observed.

## Distinzione dalla mappatura precedente

I 315 controlli censiti non sono 315 controlli certificati. La mappa precedente mantiene inventario, selettori e tentativi storici; questo registro e l'overlay JSON `issue2Certification` riportano i verdict aggiornati senza riscrivere gli errori precedenti come PASSED.

## Implementazione successiva (#1)

Ancora da costruire, dopo la certificazione: pannello partite con data/archivio; dettaglio prematch e Live con timeline a scroll interno; dati normalizzati, bankroll/ledger e money management; analisi OpenRouter operativa; monitoraggio minuto continuo con retry e ripartenza; partita completa e verifica archivio giorno successivo. Betwatch FR resta fase2.

## Revisit mobile v73 concluso

Run `source-mapping-2026-10-03-issue2-qa10-v73` terminato2026-10-02T23:08:00Z (03/10 01:08 Rome), nessuna sezione in errore. 12 pagine/24 viste acquisite. Scroll verticale misurato; verifica fondo va effettuata sul singolo contenitore, non dedotta da `complete`. Dashboard/Live aprono e chiudono il dettaglio landscape via tap. Portrait Live screenshot ispezionato conferma contenuto555px/viewport393px tagliato; nessun passed globale mobile. Deploy v71 fallito per ReferenceError del harness, v73 corregge scope. Import locale non eseguibile senza dipendenze; avvio Render v73 verificato live.

- `source-mapping-2026-10-03-issue2-qa10-v73-attempt-1790982204353-a63lm3pb01r-QA10-Dashboard`: portrait scrollTop12008/12008, landscape9384/9384.
- `source-mapping-2026-10-03-issue2-qa10-v73-attempt-1790982204353-a63lm3pb01r-QA10-Palinsesto`: portrait scrollTop2183/2183, landscape1518/1518.
- `source-mapping-2026-10-03-issue2-qa10-v73-attempt-1790982204353-a63lm3pb01r-QA10-Live`: portrait scrollTop2239/2239, landscape2403/2403.
- `source-mapping-2026-10-03-issue2-qa10-v73-attempt-1790982204353-a63lm3pb01r-QA10-Analisi`: portrait scrollTop5564/5564, landscape3118/3118.
- `source-mapping-2026-10-03-issue2-qa10-v73-attempt-1790982204353-a63lm3pb01r-QA10-Lay Goleada Favorito`: portrait scrollTop0/0, landscape0/0.
- `source-mapping-2026-10-03-issue2-qa10-v73-attempt-1790982204353-a63lm3pb01r-QA10-Backtest Storico`: portrait scrollTop0/738, landscape995/995.
- `source-mapping-2026-10-03-issue2-qa10-v73-attempt-1790982204353-a63lm3pb01r-QA10-Asian Odds`: portrait scrollTop44134/44134, landscape29526/29526.
- `source-mapping-2026-10-03-issue2-qa10-v73-attempt-1790982204353-a63lm3pb01r-QA10-Monitorate`: portrait scrollTop0/0, landscape0/0.
- `source-mapping-2026-10-03-issue2-qa10-v73-attempt-1790982204353-a63lm3pb01r-QA10-Ladder Dutching`: portrait scrollTop1293/1293, landscape1384/1384.
- `source-mapping-2026-10-03-issue2-qa10-v73-attempt-1790982204353-a63lm3pb01r-QA10-Statistiche Lega`: portrait scrollTop1805/1805, landscape2053/2053.
- `source-mapping-2026-10-03-issue2-qa10-v73-attempt-1790982204353-a63lm3pb01r-QA10-Guida`: portrait scrollTop8614/8614, landscape4510/4510.
- `source-mapping-2026-10-03-issue2-qa10-v73-attempt-1790982204353-a63lm3pb01r-QA10-Archivio`: portrait scrollTop0/0, landscape74/74.

Eccezione scroll: nel Backtest portrait `main.scrollTop` è rimasto0 rispetto al fondo738; questa vista non ha raggiunto il fondo nel gesto eseguito. Landscape995/995 verificato. Non dichiarare copertura completa dello scroll mobile su tutte le pagine.


## QA-05 revisit v74 — 03 ottobre01:31 Rome

Singolo punto richiesto dall'owner. Journal `source-mapping-2026-10-03-issue2-qa05-v74-attempt-1790983719316-pliip90mft-QA05`: squadre/quote verificate, dettaglio realmente aperto/chiuso, duplicato unico, malformato conserva partita, cleanup/reload `cleaned:true`. Lega inserita non visibile in scheda/dettaglio; non prova cancellazione interna. Formato manuale ufficiale senza campo orario; ramo SNAI con lega/ora ancora da verificare. Esito PARTIAL, conteggio invariato4/15, nessun altro caso avviato.


## QA-06 revisit v75

QA-06 — unico punto eseguito su richiesta «prossima e ti fermi».

Run v75 concluso2026-10-02T23:40:23Z /03ottobre01:40 Europe/Rome, commit `6d4592c460121ee5fe62d342126ad32d0ee6d762`. Journal `source-mapping-2026-10-03-issue2-qa06-v75-attempt-1790984344449-wi2597a54jo-QA06`; riconciliazione indipendente `source-mapping-2026-10-03-issue2-qa06-v75-derived-verdict`.

Campione reale4partite: CA Independiente–Instituto, Sao Bernardo–CRB, Londrina–Criciuma, Juventude–Operario.16header×2clic ordinari,32clic riusciti, nessuna sezione in errore. Singole componenti DOM acquisite separatamente. Riconciliazione visuale: scalari mostrati, somma casa+ospite per statistiche/XG, livelli BASSA<MEDIA<HOT per RATING, gol totali per RIS, massimo possesso per POSS. Questa descrive l'oracolo del test; non dimostra il contratto interno del comparatore proprietario.

|Header|▼ valori osservati|▲ valori osservati|Riconciliazione|
|---|---|---|---|
|min|62, 48, 7, 0|0, 7, 48, 62|Coerente sui valori noti|
|ris|3, 0, 0, 0|0, 0, 0, 3|Coerente sui valori noti|
|rating|2, 1, 0, 0|0, 0, 1, 2|Coerente sui valori noti|
|xgl|1.41, 0.35, 0.17, ND|ND, 0.17, 0.35, 1.41|Coerente sui valori noti|
|xg|2.2, 0, 0, 0|0, 0, 0, 2.2|Coerente sui valori noti|
|gp1|90, 88, 74, 50|50, 74, 88, 90|Coerente sui valori noti|
|gp2|65, 60, 32, 23|23, 32, 60, 65|Coerente sui valori noti|
|pi1|70, 50, 20, ND|ND, 20, 50, 70|Coerente sui valori noti|
|pi2|15, 10, 3, ND|ND, 3, 10, 15|Coerente sui valori noti|
|pi3|9, 7, 3, ND|ND, 3, 7, 9|Coerente sui valori noti|
|cg10|5, 3, 3, ND|ND, 3, 3, 5|Coerente sui valori noti|
|sh|14, 13, 4, 0|0, 4, 13, 14|Coerente sui valori noti|
|ot|5, 3, 2, 0|0, 2, 3, 5|Coerente sui valori noti|
|da|51, 46, 1, 0|0, 1, 46, 51|Coerente sui valori noti|
|cor|9, 3, 0, ND|0, ND, 3, 9|Coerente sui valori noti|
|pos|55, 53, 85, ND|ND, 55, 53, 85|Non monotono rispetto al massimo possesso|

RATING ora contiene tre livelli e PI1 tre valori diversi: precedenti campioni inconcludenti superati per queste verifiche visuali. Presenti pareggi (risultato, RATING,CG10,XGpre) e mancanti reali(–): acquisita posizione nelle due direzioni, senza trasformare ND in zero. Stabilità interna a RATING non dimostrabile dal solo livello mostrato.

POSS non è monotono rispetto al massimo possesso: ▼55,53,85; ▲55,53,85 dopo ND. Le coppie45/55,47/53,15/85 hanno tutte somma100: un comparatore della somma spiegherebbe la mancata inversione, ma è soltanto un'ipotesi, non codice verificato. Serve chiarire criterio previsto/correggere fonte. QA-06 resta PARTIAL e checkbox aperta:15header coerenti sui valori noti non equivalgono a certificazione completa di tutti i16.

Mi fermo qui; nessun QA-07 o altro punto avviato.


## QA-07 revisit v76

QA-07 — unico punto eseguito su richiesta owner; mi fermo e attendo conferma prima del successivo.

Run v76, commit `27cfc00429e7289e5f284c5648435c76105abe95`, concluso2026-10-02T23:46:32Z /03ottobre01:46 Europe/Rome. Journal Neon `source-mapping-2026-10-03-issue2-qa07-v76-attempt-1790984698621-eidajxemlic-QA07`. Campione iniziale 4 partite reali. Tutti i gesti ordinari: input testuali e tastiera Home/End/ArrowRight per gli slider, clic HT e reset. Nessuna modifica degli stati via JavaScript.

**21 scenari eseguiti**:10 confronti indipendenti PASSED sugli insiemi di squadre,10 combinazioni min/max OBSERVED,1 selezione HT multipla OBSERVED.

|Scenario|Esito|Righe prima→dopo|
|---|---|---|
|Zero score means0-0|passed|4→2|
|Blank goals wildcard|passed|4→4|
|Impossible home15 empty|passed|4→0|
|Minute0-60 inclusive|passed|4→3|
|Prematch home2.4-2.5 inclusive|passed|4→1|
|Prematch home exact2.45 represented by slider2.4-2.5|passed|4→0|
|Shots total0-4 inclusive|passed|4→1|
|Shots min4 boundary inclusive|passed|4→3|
|Gol+ minimum80|passed|4→2|
|Gol++ minimum60|passed|4→1|
|Crossed bounds gol1|observed|4→0|
|Crossed bounds gol2|observed|4→0|
|Crossed bounds tiri|observed|4→0|
|Crossed bounds tirit|observed|4→0|
|Crossed bounds corner|observed|4→0|
|Crossed bounds poss|observed|4→0|
|Crossed bounds q1|observed|4→0|
|Crossed bounds qx|observed|4→0|
|Crossed bounds q2|observed|4→0|
|Crossed bounds minuto|observed|4→0|
|HT multiple0-0 and1-1|observed|4→2|

Zero casa+ospite seleziona0-0; vuoto è wildcard. Filtri minuto0–60,quota1 tra2.4–2.5 e combinazione con0-0 riconciliati rispetto alle celle catturate prima del gesto. Tiri totali=max4/min4 e Gol+min80/Gol++min60 verificati sul campione; le verifiche inclusività restano limitate ai valori effettivamente presenti, non a tutte le soglie teoriche. I missing non diventano statistiche reali pari a zero solo perché la UI le presenta come tali.

Incrocio dei10range: dopo min=End e max=Home, la UI riporta max allo stesso valore del min(100/100,20/20,40/40,15/15,120/120 secondo campo); non rimane un intervallo invertito. Tutti producono0 righe sul campione. HT0-0 e1-1 cliccati entrambi,2 righe osservate: membership rispetto al risultato HT sottostante ancora da verificare.

Reset conclusivo: `resetFieldsEqual:true`, tutti i valori/min/max/step degli input tornano identici allo stato iniziale. Nessuna strategia salvata o ordine reale.

**QA-07 resta PARTIAL**: residui matrice campionato+tempo+punteggio+statistiche, favorito/perdente, preferiti e membership HT multiplo, oltre alle soglie non rappresentate e semantica dei dati mancanti. Non spuntata la checkbox e nessun QA successivo avviato.


## QA-08 revisit v77/v78/v79

QA-08 — unico punto ripreso; nessun QA-09 avviato.

Ripetizioni v77/v78/v79, sempre sequenziali. v77: nome lungo troncato dalla UI (`QA ISSUE2 Live cross-context v77 2026100`); il test cercava il nome completo e andava in timeout. Questo è un errore del harness sul confronto del nome, non prova di mancato salvataggio.

v78 commit `ad63240f80b32569481eb291e6670cc6c5590b89`, concluso2026-10-03T00:04:02Z /02:04 Europe/Rome. Journal `source-mapping-2026-10-03-issue2-qa08-v78-attempt-1790985767515-4h4o45fhn4l-QA08`: `savedA:true`, `reloadA:true`, `recallA:true`, `nameVisibleB:false`, `deletedA:true`, `cleanA:true`, `contextsIndependent:true`, `physicalDevices:false`. Conferma strategie Live locali al contesto, non condivise con la sessione B dello stesso account. Omissione harness: mancava riferimento pageB per verificarne il reload finale.

v79 commit `1ce0e39040b4caa49d1b16c0f6d4ae2b18729401` corregge tale riferimento. Journal `source-mapping-2026-10-03-issue2-qa08-v79-attempt-1790985898401-15w8z8spb8w-QA08`: save/reload/recall A veri; login modulo B non completa entro25secondi (`#loginEmail` resta visibile). Nessun bypass. Ultima lettura Neon rifiutata HTTP401 per autenticazione; fine run e cleanup finale v79 non verificabili in questa lettura. Non presentare v79 come PASSED.

Le prove positive precedenti restano conservate; questa ripetizione complessiva è PARTIAL/BLOCKED per il reload-cleanup B non completato. Nessuna credenziale pubblicata, nessun ordine reale. Mi fermo e attendo conferma owner per il successivo.


## QA-09 revisit v80 — disponibilità giornaliera ripristinata

QA-09 — unico punto eseguito su conferma owner; nessun QA-10 avviato.

Test reale v80, commit `ad084da6921097b2e9f2a16cd650d1252f40ed99`. Run concluso2026-10-03T06:52:04Z /08:52 Europe/Rome; journal `source-mapping-2026-10-03-issue2-qa09-v80-attempt-1791010277209-6ar9mhbedkx-QA09`. Un solo clic `#btRunBtn`, protetto dal ticket `source-backtest-test-2026-10-03-qa09-single` (`maximumExecutions:1`, nessun retry/saturazione).

Input come nel tentativo respinto v62: quote1[1.5,2], X[3,5],2[3,5], minuto60, risultato1-1, nessuna lega selezionata. Prima06:51:33Z; clic06:51:33.768Z; dopo06:52:03.824Z. **Risultato prodotto:true; rifiuto limite:false.** La pagina mostra **«4 backtest rimasti oggi»** e2324 partite trovate. Il risultato è stato usato soltanto per verificare disponibilità/quota, non per certificare equity o algoritmi finanziari.

Confronto temporale: v62 respinto il02ottobre22:39UTC per limite5/giorno; v80 accettato il03ottobre06:51UTC. Il ripristino della disponibilità è quindi osservato nell'intervallo tra i due tentativi, che attraversa mezzanotte UTC. Non identifica da solo il confine di reset, un eventuale rolling window o il fuso applicato dalla fonte. Il contatore prima del clic non era mostrato nel testo iniziale; non inventato un valore letto5/5.

**Esito PARTIAL**: accettazione dopo precedente limite e contatore residuo reale verificati; timezone dichiarata e reset al confine esatto non certificati. Checkbox QA-09 resta aperta e conteggio4/15 invariato. Rimangono4 tentativi osservati, nessun altro backtest consumato. Neon accessibile di nuovo in questo ciclo; nessuna credenziale pubblicata.

Annotato e mi fermo in attesa della conferma per il prossimo punto.


## QA-10 revisit v81

QA-10 — unico punto eseguito; nessun QA-11 avviato.

Run v81 concluso2026-10-03T07:00:11Z /09:00 Europe/Rome, commit `78e591e94dc35b97ca4124abcf2f5f3f8ca7bfbc`, nessuna sezione in errore.12pagine×2orientamenti=24viste. Browser con touch emulato393×852/852×393, font e immagini caricati; navigazione/modali via tap, scroll tramite mouse wheel nativa in verticale/orizzontale, nessuna alterazione JS degli stati. Non è prova su telefono fisico.

Journal privati prefisso `source-mapping-2026-10-03-issue2-qa10-v81-attempt-1791010500525-9zbwt28vv0v-QA10-` +nomepagina. Screenshot prima/fondo/destra e dettaglio persistiti.

|Pagina|Fondo portrait|Fondo landscape|Dettaglio|
|---|---|---|---|
|Palinsesto|3860/3860|2538/2538|Non testato|
|Dashboard|18788/18788|15534/15534|Aperto/chiuso in entrambe|
|Live|0/0|177/177|No populated detail button rendered|
|Analisi|8406/8406|4633/4633|Non testato|
|Lay Goleada Favorito|0/0|356/356|Non testato|
|Backtest Storico|738/738|995/995|Non testato|
|Asian Odds|0/0|24/24|Non testato|
|Monitorate|0/0|0/0|Non testato|
|Ladder Dutching|1293/1293|1384/1384|Non testato|
|Statistiche Lega|1805/1805|2053/2053|Non testato|
|Guida|8614/8614|4510/4510|Non testato|
|Archivio|0/0|74/74|Non testato|

Tutti i24contenitori principali raggiungono il fondo misurato, inclusi gli stati vuoti che non richiedono scroll. Backtest portrait738/738: il precedente0/738 era effetto del punto di applicazione della gesture del harness, non dimostra un bug della fonte. Dashboard dettaglio popolato aperto/chiuso via tap in entrambe le orientazioni. Screenshot portrait del dettaglio e del fondo ispezionati: contenuto finale/controlli esito raggiunti; non sono stati azionati i pulsanti esito.

**Problema persistente Live portrait:** main clientWidth393,scrollWidth555,overflowX:hidden; dopo wheel orizzontale scrollLeft0. Anche la toolbar dello stato vuoto resta più larga dello schermo; il gesture test sul contenitore principale non rende raggiungibile la parte destra. Non chiamare assenza di overflow globale una prova di accessibilità dei pulsanti.

Live oggi senza dettagli popolati: `detailUnavailable:No populated detail button rendered` in entrambe le viste. Non certifica il dettaglio Live portrait popolato. Layout screenshot Dashboard portrait presenta il risultato consigliato spezzato su più righe: osservazione di leggibilità, non giudizio di correttezza dei dati. Restano inoltre gesti/controlli interni non campionati, scorrimenti dei contenitori secondari (es.tabella larga), zoom e tutte le repliche.

**Esito PARTIAL**: scroll principale/menu/orientamenti e modale Dashboard verificati, limite orizzontale Live e rami residui ancora aperti. QA-10 non spuntata. Nessun backtest/salvataggio/esito/ordine eseguito. Annotato; mi fermo in attesa della conferma owner.


### QA-11 — Audio: test reale v82, esito PARZIALE
Eseguito solo questo punto, il 03/10/2026 dalle 09:09:42 alle 09:10:08 Europe/Rome (07:09:42–07:10:08 UTC). Run concluso senza errori del processo alle 07:10:18 UTC.

- Clic reale audio: classe iniziale `ltb-btn` → `ltb-btn on` → stato iniziale ripristinato.
- Selezionati realmente entrambi i suoni: `classic` (Classico) e `ohyes` (Oh Yesss!), poi ripristinato il valore iniziale.
- Tre risposte HTTP 200 audio/mpeg. Osservazione passiva degli eventi Media del browser: caricamenti di goal.mp3 e goal-ohyes.mp3, decoder MP3 e tracce stereo, eventi kPlay e pipeline kPlaying. Nessun playerErrorsRaised ricevuto.
- Sono presenti anche kPause e seek immediatamente dopo kPlay: il solo stato della pipeline non certifica durata di ascolto o suono udibile. Elementi audio/video nel DOM assenti; eventi WebAudio assenti.
- **Non certificati:** ascolto udibile su dispositivo reale, notifica conseguente a un gol reale e assenza di notifiche quando audio disattivato. Nessun gol simulato né chiamata diretta a play o funzioni interne.
- Valutazione del flusso osservato: 3/5, provati controlli e avvio del lettore, copertura incompleta dell'effetto audio.

Prova grezza Neon: `source-mapping-2026-10-03-issue2-qa11-v82-attempt-1791011349809-mooqshwc71e-QA11`.
Codice del test: commit `ae35801703c2a4b8627a0293ef0633efcad869e1`; node --check passato. “Run complete” indica conclusione del processo, non certificazione completa.

QA-11 resta senza spunta. La issue non è ancora chiudibile. Mi fermo qui: QA-12 non avviato.


### QA-12 — Radar / iframe: verifica v83, PARZIALE
Eseguito solo QA-12 il 03/10/2026 alle 09:53:45–09:53:47 Europe/Rome. Processo concluso alle 07:54:03 UTC, senza errori registrati; questo non equivale alla certificazione completa.

Accesso reale, palinsesto automatico caricato (38 partite), clic Live e Card. Stato osservato: **0 live**, messaggio “Nessuna partita del palinsesto in corso”, **0 controlli data-live-radar** e **0 iframe**. Screenshot e testo conservati. Il percorso senza dati è documentato; non sono stati creati eventi sintetici né aperti iframe mediante URL costruiti.

Restano valide le prove precedenti v66 di apertura reale del radar con popup e iframe popolati su due partite. Questa nuova verifica aggiunge il caso Live vuoto, ma **non certifica** errore di caricamento dell'iframe, iframe vuoto con partita presente, scroll interno e chiusura del popup nel percorso popolato. Nessun controllo radar era cliccabile in questa sessione. La strumentazione per lo scroll non è stata eseguita perché quel ramo non era disponibile.

Prova Neon: `source-mapping-2026-10-03-issue2-qa12-v83-attempt-1791013985944-dxnrr6f7ydm-QA12`.
Commit test: `69da498a80dceb4f29161252f270e7128f6cdc70`, controllo sintassi passato.
Valutazione della sola gestione del caso senza dati: 4/5 (messaggio esplicito, testo di aiuto generico sui filtri); copertura complessiva QA-12 parziale.

QA-12 resta senza spunta e la issue non è ancora chiudibile. QA-13 non avviato: attendo la conferma dell'owner.


### QA-13 — Equity cronologica: prova reale v84, PARZIALE con errore del test
Eseguito solo QA-13 il 03/10/2026 dalle 09:57:35 Europe/Rome; processo terminato alle 09:58:38. Un solo backtest protetto da ticket non ripetibile `source-backtest-test-2026-10-03-qa13-single`.

Input reali: tutti i campionati; quota 1 [1,5–2], X [3–5], 2 [3–5]; minuto 60, risultato 1-1. Risultato prodotto: **2324 partite**, su 17.929 candidate; **3 backtest rimasti oggi**. Frequenza Over 2,5 finale 65,4%, quota minima mostrata 1,53. Disponibili mercato/lato/quota/importo/commissione e pulsante Calcola.

**Errore del test, non difetto certificato del sito:** il selettore cercava l'etichetta “Over 2.5 finale”, mentre l'interfaccia espone “Over 2,5 finale”. La selezione è andata in timeout prima del clic Calcola. Pertanto i confronti promessi commissione 0%/5% **non sono stati eseguiti**, nessuna equity di questo run è certificata e non sono stati consumati altri backtest per mascherare il fallimento.

Restano da completare: selezione tramite valore dell'opzione realmente osservata; calcoli dei totali; esposizione/verifica delle date e dell'esito di ogni operazione; riconciliazione indipendente capitale cumulato, picchi e drawdown nell'ordine cronologico. Un grafico visibile o un totale corretto non bastano a certificare la sequenza. Le precedenti verifiche aggregate restano separate da questo requisito.

Prova grezza Neon: `source-mapping-2026-10-03-issue2-qa13-v84-attempt-1791014240308-0bzb0t9loz58-QA13`; run omonimo con stato partial e TimeoutError conservato.
Commit: `08d13e49c49780677ce084b63efcfbf106e29142`; controllo sintassi passato, test funzionale incompleto.
Valutazione del percorso backtest osservato: 4/5 (risultato e contatore disponibili); calcolo equity non valutabile in questo run.

QA-13 resta senza spunta; issue non chiudibile. QA-14 non avviato. Attendo conferma dell'owner.


### QA-14 — Gol++ / QE: ripetizione v86, PARZIALE
Solo QA-14, 03/10/2026. Palinsesto e Guida aperti realmente; testo Guida salvato alle 10:03:07 Europe/Rome. Confermata l'indicazione della sezione Quota Equa: quota Betfair SOPRA QE → VALORE; SOTTO → SALTA.

Il percorso Dashboard/dettaglio è andato in TimeoutError prima di produrre il journal dei nuovi input QE. **In questa sessione non sono stati completati i confronti sotto/uguale/sopra QE**, né osservati dati Live Gol++. Non si trasferisce un “pass” dalle prove precedenti. Rimane documentata la contraddizione precedente v68: il pannello segnalava valore sotto QE e non convenienza sopra QE, mentre la Guida indica il contrario. Per risolverla servono accesso al dettaglio e confronto ripetibile su dati attuali, chiarimento della convenzione e definizioni concordanti di Gol+/Gol++.

Correzioni della preparazione: due revisioni v85 avevano errori sintattici e sono state pubblicate erroneamente prima di un controllo positivo; non sono prove UI valide. Corretto lo scope nella revisione v86, node --check passato. I fallimenti non sono stati convertiti in successi.

Run `source-mapping-2026-10-03-issue2-qa14-v86`, concluso alle 08:03:46 UTC con stato partial e TimeoutError.
Prova Guida: `source-mapping-2026-10-03-issue2-qa14-v86-attempt-1791014543919-qyzx59jv74-QA14Guide`.
Commit valido del test: `3d1099aecf2179baa38b58284dd495a7dafd62f5`.
Valutazione coerenza QE sulla base delle prove conservate: 2/5, contraddizione irrisolta. QA-14 resta senza spunta; issue non chiudibile. QA-15 non avviato. Attendo conferma dell'owner.


### QA-15 — Ladder Dutching: ripetizione reale v87, NON CERTIFICATO per incongruenze riprodotte
Solo QA-15 il 03/10/2026, 10:07:18–10:07:35 Europe/Rome. Quattro casi completati senza errori del processo, con input virtuali e nessun ordine.

| Caso, obiettivo 10 € | Risultato osservato | Verifica |
|---|---|---|
| Quota 5, commissione 0% | Puntata 10; vincita +10; perdita −40 | Coerente: 10 × (5−1)=40 |
| Quota 5, commissione 5% | Puntata 10; vincita +9,50; perdita −40 | Contraddice il testo che promette 10 € netti; 10 × 0,95=9,50. Per 10 netti occorre prima degli arrotondamenti 10/0,95=10,526315… |
| Quote 5 e 6, commissione 5% | Puntate 5,45 e 4,55; fuori dai due esiti +9,50; netto mostrato sugli esiti −17,50 e −17,55 | Dai valori visualizzati il saldo lordo è 4,55−5,45×4=−17,25 e 5,45−4,55×5=−17,30. Il netto mostrato è compatibile con una commissione sulla singola puntata vincente: chiarire convenzione e arrotondamenti; non certificato |
| Input quota 1, commissione 5% | Normalizzata a 1,01; perdita −0,10; vincita +9,50 | Limite normalizzato osservato; responsabilità 10×0,01 corretta |

**Reset reale verificato:** AZZERA QUOTE premuto; tutti i 19 checkbox deselezionati, quote a 1,01. Obiettivo 10 e commissione 5 restano impostati: il reset delle quote non azzera questi parametri. Non è un ripristino globale.

Restano da risolvere il dimensionamento rispetto al profitto netto promesso e la convenzione della commissione/arrotondamento con più selezioni. Difetti riprodotti nella fonte; nessuna modifica al software proprietario eseguita. Valutazione calcoli e chiarezza: 2/5.

Prova Neon: `source-mapping-2026-10-03-issue2-qa15-v87-attempt-1791014820716-445jq3zvj4q-QA15`.
Commit `4018cdee06705243fd9bb9158d9c31c554da51d4`; node --check passato; run concluso 08:07:35 UTC con failed=[] (non significa che i calcoli siano certificati).

QA-15 resta senza spunta. La issue #2 non è ancora chiudibile: aver affrontato tutti i punti non significa averli completati. Mi fermo qui, nessun altro QA avviato.


### QA-01 H2H — tre tentativi reali e audit dell'intera Dashboard (37 righe)
Solo H2H, 03/10/2026. Nessun altro punto avviato. Ladder e gli altri gruppi restano sospesi; ordinamenti Live attendono la segnalazione owner.

**v88:** clic label H2H in timeout durante la fase performing click; fallimento conservato, nessun pass.
**v89:** attesa ordinaria aumentata, senza force/cambio JS dello stato. Filtro 37→29→37; quattro dettagli letti. Strømmen–Sandnes Ulf e Hødd–Odd escluse, ma Stats+ mostrava 3 H2H ciascuna. Non dedotta una soglia minima.
**v90:** audit di tutte le 37 righe corrente, dal 10:35 circa al **10:42:28 Europe/Rome**. Filtro 37→31→37, checked false→true→false; lista ripristinata nello stesso ordine: **true**. 37 dettagli aperti, 36 conteggi ottenuti con tab H2H attiva; uno non verificato perché la tab non è rimasta attiva. Nessun errore del processo. I conteggi diversi fra v89 e v90 sono reali: non certificata la stabilità fra sessioni.

| Partita | Filtro Dashboard | H2H in Stats+ | Tab H2H confermata |
|---|---|---:|---|
| Belarus-SanMarino | Inclusa | 2 | Sì |
| Spain-CzechRepublic | Inclusa | 5 | Sì |
| Croatia-England | Inclusa | 8 | Sì |
| Switzerland-Slovenia | Inclusa | 6 | Sì |
| Cuiabá-PontePreta | Inclusa | 6 | Sì |
| BocaJuniors-UniónSantaFe | Esclusa | 0 | Sì |
| Strømmen-SandnesUlf | Inclusa | Non verificato | No |
| FCDenBosch-FCDordrecht | Inclusa | 10 | Sì |
| DeportesTolima-BoyacáChicó | Inclusa | 10 | Sì |
| Hødd-Odd | Inclusa | 3 | Sì |
| Iceland-Bulgaria | Inclusa | 4 | Sì |
| AtléticoGO-AméricaMineiro | Inclusa | 10 | Sì |
| Fortaleza-Náutico | Inclusa | 3 | Sì |
| Vitesse-NACBreda | Esclusa | 0 | Sì |
| Haugesund-Stabæk | Inclusa | 1 | Sì |
| FCEindhoven-DeGraafschap | Inclusa | 14 | Sì |
| AlmereCity-FCVolendam | Inclusa | 4 | Sì |
| RKCWaalwijk-FCEmmen | Inclusa | 4 | Sì |
| TOPOss-MVVMaastricht | Esclusa | 0 | Sì |
| DeportivoCali-AlianzaPetrolera | Esclusa | 0 | Sì |
| BurtonAlbion-HuddersfieldTown | Inclusa | 6 | Sì |
| RionegroÁguilas-JaguaresdeCórdoba | Inclusa | 10 | Sì |
| NorthMacedonia-Scotland | Esclusa | 4 | Sì |
| Almería-Burgos | Inclusa | 6 | Sì |
| Reading-BradfordCity | Inclusa | 6 | Sì |
| Albacete-SDEibar | Inclusa | 10 | Sì |
| LeytonOrient-PlymouthArgyle | Inclusa | 10 | Sì |
| Sabadell-FCAndorra | Esclusa | 1 | Sì |
| Cádiz-Leganés | Inclusa | 2 | Sì |
| DefensayJusticia-SanLorenzo | Inclusa | 10 | Sì |
| Newell'sOldBoys-Lanús | Inclusa | 10 | Sì |
| AtléticoTucumán-BarracasCentral | Inclusa | 4 | Sì |
| BotafogoSP-VilaNova | Inclusa | 7 | Sì |
| IndependienteRivadavia-GimnasiaLaPlata | Inclusa | 5 | Sì |
| Finland-Albania | Inclusa | 2 | Sì |
| Avaí-Ceará | Inclusa | 10 | Sì |
| Estonia-Luxembourg | Inclusa | 2 | Sì |

**Discrepanze residue circoscritte:** North Macedonia–Scotland esclusa con 4 H2H e Sabadell–FC Andorra esclusa con 1 H2H. Entrambi mostrano date **NaN/NaN, NaN** nel dettaglio. Potrebbero essere record incompleti esclusi dal criterio della Dashboard, ma questa è un'ipotesi: il controllo è etichettato soltanto “H2H presente”, senza soglia o tooltip esplicativo. Non è corretto dichiarare che il filtro è sbagliato né certificare che applica una regola di validità non documentata. Strømmen–Sandnes Ulf: conteggio non verificato in v90; precedente v89 ne mostrava 3.

**Esito:** certificata l'interazione reale e il ripristino della lista nel run v90. Non certificati il contratto esatto di inclusione, la stabilità fra sessioni e il trattamento dei record senza data. Altri tentativi di clic non risolvono una regola non esposta: serve chiarimento sulla fonte H2H usata dal filtro o una spiegazione visibile della validità dei record. Non modifichiamo il software proprietario. Valutazione chiarezza/coerenza osservata: 3/5. QA-01 resta aperto senza spunta.

Prove Neon:
- `source-mapping-2026-10-03-issue2-qa01-v88`: partial/TimeoutError.
- `source-mapping-2026-10-03-issue2-qa01-v89-attempt-1791016326762-54g827915fp-QA01`.
- `source-mapping-2026-10-03-issue2-qa01-v90-attempt-1791016506834-nfmdl7pbls-QA01`; run v90 concluso 08:42:29 UTC, failed=[].
Commit v90 `c349f1280df19cc60dd080aae25283e083aa0ad0`, node --check passato.
La issue non è chiudibile. Mi fermo prima di un altro punto.


### QA-07 — Filtri Live: ripetizione v91, PARZIALE / attesa dati Live
Solo questo punto, 03/10/2026 11:11:34–11:12:29 Europe/Rome. Run concluso 09:12:40 UTC con failed=[].

21 scenari eseguiti con controlli ordinari: gol 0-0, gol vuoti, gol casa 15, minuto 0–60, quota casa 2,4–2,5, quota+minuto+punteggio, tiri totali max/min 4, Gol+ minimo 80%, Gol++ minimo 60%, dieci coppie min/max incrociate, HT 0-0 e 1-1 insieme. Reset finale: campi identici agli iniziali (**resetFieldsEqual=true**).

Soglie incrociate: min portato al massimo e max tentato al minimo → UI riporta entrambi al valore min corrente. Gol+/Gol++/possesso 100/100, tiri in porta 20/20, tiri totali 40/40, corner 20/20, quote 15/15, minuto 120/120. Nessun errore registrato.

**Limite reale:** lista iniziale vuota, 0 partite Live. Tutti gli scenari sono marcati `observed_without_membership_proof`, non passed: zero→zero non verifica la correttezza della selezione. Certificata l'interazione coi controlli e il ripristino dei campi; non la membership o i limiti inclusivi su dati popolati. Test precedente v76 con partite presenti resta prova distinta.

Rimangono incroci completi campionato/minuto/statistiche/score/HT, favoriti/favorita perde, valori mancanti e sincronizzazione tendina Time con slider. Per verificarne l'effetto servono partite Live reali. Ripetere login o matrice ora con lista vuota non colma questo requisito. Non introdotti dati sintetici per far passare il test. Valutazione controlli osservati: 4/5; selezione partite non valutabile in questa sessione.

Prova Neon: `source-mapping-2026-10-03-issue2-qa07-v91-attempt-1791018650370-k08xtthe64-QA07`.
Commit `88613cccd325dd6399e05445305c399728de2fca`, sintassi verificata prima del push.
QA-07 senza spunta; non dichiarato sospeso dall'owner, ma bloccato nella verifica con dati presenti. Issue non chiudibile. Mi fermo prima di persistenza/reset/QE; ordinamenti Live ancora in attesa della segnalazione owner.


### QA-08 — Persistenza: secondo contesto riuscito, comportamento osservato v92
Solo QA-08, 03/10/2026 11:17:05–11:18:44 Europe/Rome; run concluso 09:18:46 UTC, failed=[].

Fixture propria: “QA08 v92”, filtro gol casa=1; elenco iniziale A vuoto verificato.
1. Salvataggio in A: riuscito.
2. Ricaricamento A: strategia ancora visibile.
3. Modifica gol casa a 2 e clic sulla strategia: ripristina 1.
4. Secondo contesto browser **indipendente**, accesso reale completo con lo stesso account: strategia **non visibile**.
5. Eliminazione della sola strategia QA in A: riuscita.
6. Ricaricamento di entrambi: strategia assente in A e B, cleanA=true e cleanB=true.

**Conclusione certificabile nel perimetro provato:** persistenza nel contesto A attraverso reload e richiamo; assenza di condivisione osservata nel contesto B nello stesso intervallo, poi pulizia verificata in entrambi. Non è una certificazione della sincronizzazione tra dispositivi, né prova definitiva del meccanismo interno (localStorage/server). Non provati dispositivi fisici o l'elenco strategie Backtest. Il precedente blocco di accesso B v79 è superato per questa nuova sessione; i vecchi errori restano registrati.
Valutazione: 4/5 per salvataggio locale osservato; nessuna sincronizzazione account dimostrata. Questo risolve l'incertezza sull'esito del secondo contesto nel perimetro della prova, senza promuovere il requisito a sincronizzazione universale.

Prova Neon: `source-mapping-2026-10-03-issue2-qa08-v92-attempt-1791018987818-cxws3e0ko5-QA08`.
Commit `42961c60030a0c676759f9ca41ff511d90427fd4`, node --check passato prima del push.
Nessuna checkbox modificata; QA08 già aveva prove nel suo perimetro precedente. Issue resta aperta.

Programmata una ripresa una tantum del **solo QA06 ordinamenti Live** oggi alle **14:05 Europe/Rome**, come richiesto. Il task deve registrare l'esito reale o l'impossibilità di eseguire, non presumere che le partite o gli strumenti siano disponibili. Filtri restano per un turno separato. Mi fermo: reset giornaliero e QE non avviati.


### QA-09 — Reset giornaliero: audit reale v93 senza altre esecuzioni
Solo QA09, 03/10/2026 alle 11:21:59 e 11:22:10 Europe/Rome. Aperte realmente Backtest Storico e Guida; nessun clic Esegui backtest, nessuna quota consumata. Run concluso 09:22:10 UTC con failed=[].

Nelle due viste lette non è esposta un'ora del reset o un fuso. Il pannello iniziale non espone il contatore residuo prima dell'esecuzione; quindi non è stato possibile leggere un nuovo saldo senza consumare quota.

Riconciliate le prove già conservate:
- Rifiuto per limite 5: 02/10 22:39:33 UTC = **03/10 00:39:33 Europe/Rome** (timestamp di registrazione finale, non istante del reset).
- Backtest accettato v80: 03/10 circa 06:51–06:52 UTC = **08:51–08:52 Europe/Rome**, risultato e “4 backtest rimasti oggi”.
- Successivo v84: risultato prodotto e “3 backtest rimasti oggi”, circa 09:58 Europe/Rome; il successivo errore del selettore equity non annulla il backtest riuscito.

**Conclusione:** limite e nuova disponibilità sono provati; ora esatta, fuso e giorno calendario vs finestra mobile **non certificati**. Non dedurre “reset a mezzanotte Roma” o “reset a mezzanotte UTC” dalla sola differenza fra le prove. Più tentativi adesso, lontano dal confine e con disponibilità, consumerebbero quota senza risolvere il requisito.

Per chiudere questo residuo occorre dichiarazione del supporto sulla regola applicata, oppure osservazioni attorno al confine corretto con contatore disponibile. Non programmata saturazione del limite né consumo automatico notturno. Domanda suggerita al supporto: “Il limite di 5 backtest si azzera a quale ora e in quale fuso? Segue il giorno di calendario o le ultime 24 ore?”

Prove v93:
`source-mapping-2026-10-03-issue2-qa09-v93-attempt-1791019299453-3u8w1xirhzb-QA09-Backtest Storico`
`source-mapping-2026-10-03-issue2-qa09-v93-attempt-1791019299453-3u8w1xirhzb-QA09-Guida`.
Commit `ac1c12ed2a8871de32fa97f2be57310b4d286d20`, controllo sintassi passato.
Valutazione chiarezza della regola reset: 2/5 (limite comunicato solo al rifiuto, orario/fuso non osservati). QA09 resta senza spunta; issue non chiudibile. Mi fermo prima del punto QE/Gol++.


### QA-14 — Nuova prova reale v94: QE verificato, contraddizione Guida confermata
Solo QA14, 03/10/2026 11:32:44–11:33:20 Europe/Rome. Run concluso 09:33:22 UTC, failed=[]; questo certifica l'esecuzione, non la risoluzione del requisito.

Dettaglio reale Strømmen–Sandnes Ulf, Lay 0-0: frequenza mostrata 2,9%, QE 34,48. Coerente con 100/2,9 = 34,482758… (verifica sul valore visualizzato, non sulla precisione interna del campione).

| Quota virtuale inserita | Risposta reale |
|---|---|
| 31,03, sotto QE | VALORE — mercato sovrastima la probabilità |
| 34,48, uguale al QE visualizzato | NEUTRO — quota vicina al QE |
| 37,93, sopra QE | NON CONVIENE — liability troppo alta |

Campo iniziale ripristinato: true; dettaglio chiuso realmente. Nessun ordine, salvataggio o backtest eseguito. Certificati questi tre input e il ripristino, non la fascia precisa di tolleranza NEUTRO o un calcolo netto commissioni.

Guida letta nuovamente: “Quota Betfair SOPRA la QE → VALORE: lay con margine.” / “Quota Betfair SOTTO la QE → SALTA”. È l'opposto del pannello; contraddizione riprodotta su dati attuali. Nel modello matematico senza commissione con probabilità p e puntata lay unitaria, valore atteso = 1 − p×quota: il segno positivo è sotto 1/p. Non trasformare questa verifica della formula in consiglio operativo.

Gol++: la Guida definisce Gol+ come almeno un ulteriore gol e Gol++ come almeno due, con campione comparabile e possibile allargamento globale. Live aperto realmente: 0 live, nessuna partita in corso, nessun controllo radar. Nessun valore/campione Gol++ popolato verificabile; numeratore, denominatore, fallback e coerenza dettaglio restano da provare con Live reali.

Valutazione coerenza QE/Guida: 2/5. QA14 resta aperto senza spunta, issue non chiudibile. Serve chiarimento/correzione della Guida da parte della fonte e successiva prova Gol++ popolata. Gli altri punti sospesi restano fermi; nessun altro QA avviato.

Commit test: 10ced316f295df6b103d523567b8e7a9f6bf6094; node --check passato prima della pubblicazione.
Run: source-mapping-2026-10-03-issue2-qa14-v94.
Prove Neon: prefisso source-mapping-2026-10-03-issue2-qa14-v94-attempt-1791019928189-tw1auvazbji, suffissi -QA14QE, -QA14Guide, -QA14Live.

### Perimetro definitivo aggiornato dall'owner — 03/10/2026 12:17 Europe/Rome
L'owner dichiara che non interessano e rimuove dai requisiti di chiusura:
- QA05: importazione valida con campionato e orario.
- QA10/QA11/QA12: mobile, audio e radar con partite Live presenti.
- QA13: equity cronologica.
- QA15: Ladder Dutching.
Questi residui sono **ESCLUSI DAL PERIMETRO**, non più soltanto sospesi. Non devono bloccare la chiusura della issue nel perimetro concordato e non devono essere ripresi senza nuova richiesta. Le prove, anomalie e limitazioni storiche restano conservate: escluso non significa certificato o corretto.
Restano attivi QA06 ordinamenti Live, QA07 filtri combinati, QA14 Gol+/Gol++ e contraddizione QE; rimangono i chiarimenti H2H e reset giornaliero. Collaudo Live programmato alle 16:15 Europe/Rome. La dichiarazione finale “chiudibile” dovrà riferirsi esplicitamente a questo perimetro e alle evidenze effettive; la chiusura resta all'owner.


### Asian Odds — difetto layout riprodotto su sito reale, 03/10/2026 12:27 Europe/Rome
Verifica specifica richiesta dall'owner, distinta dai QA mobile/Live esclusi. Accesso reale e clic Asian Odds, due viewport 1440×900 e 393×852; lettura DOM/CSS e screenshot conservati, nessuna modifica alla fonte. v95 prima osservazione; v96 misure sui div effettivi e gesti scroll nativi (non sono tabelle HTML).
Caso Stockholm Inter–Assyriska (231 partite Asian Odds disponibili).
- Desktop: riquadro 1X2 clientWidth335, scrollWidth394; riga clientWidth307, scrollWidth380. La cella Trasferta termina x730,70 oltre bordo riquadro x672,66 e invade l'area orizzontale del pannello Handicap adiacente. Visivamente testo/quote destra parzialmente coperti o fuori riquadro; non provata sovrapposizione di due testi nella stessa cella.
- Telefono emulato 393px: riquadro 1X2 clientWidth283, scrollWidth394; cella Trasferta x355,47–448,70, oltre viewport393. MAIN width393, scrollWidth466, overflow-x:hidden. Colonne destra tagliate. Anche Handicap ha contenuto eccedente.
- Gesto reale wheel orizzontale 1500 sopra il primo riquadro: scrollLeft resta0 nei riquadri e MAIN, screenshot invariato. I div mercati hanno overflow-x:visible; non osservato recupero delle quote mediante questo gesto. Nessuna prova swipe fisico o pinch-zoom.
- Scroll verticale reale sul mobile porta le righe in vista; intestazione occupa215px e footer62px, restringendo area utile.
Esito: difetto di impaginazione/ridimensionamento e clipping riprodotto anche a larghezza desktop, non solo testo piccolo nello screenshot. Dati presenti nel DOM, ma questo non certifica correttezza numerica delle quote. Valutazione leggibilità2/5. Icone/immagini bloccate dal harness non considerate difetti della fonte.
Commit v96 1e6d9f044310095982684a77823977e3725c9830, node --check positivo. Run source-mapping-2026-10-03-asian-layout-v96 concluso10:27:51UTC failed=[]; snapshot source-mapping-2026-10-03-asian-layout-v96-attempt-1791023227528-zzmj7s8q2cd-AsianLayout.
Da segnalare al supporto: riquadri con colonne Apertura/Attuale troppo larghe rispetto allo spazio, Trasferta fuori bordo/copribile dal pannello vicino e quote destra tagliate su telefono; richiesta adattamento colonne o scroll orizzontale accessibile. Non riattivati tutti i punti mobile esclusi.


### Risposta supporto riportata dall'owner — 03/10/2026 12:30 Europe/Rome
Messaggio ricevuto dall'owner e riportato in chat (non acquisito direttamente dal canale supporto):
> OK CAPITO , NO ALLORA PROB CI SARA UN BUG CHE SISTEMERO QUANDO NELLA DASH CLICCHI IL FILTRO , X QUANTO RIGUARDA LE PERCENTUALI QUELLE LE CONTA LO STESSO SE NON VEDI LA DATA NAN E XK IL SISTEMA NON RICONOSCE LA DATA MA I CALCOLI SONO APPOSTO TRANQUILLO GRAZIE X AVERMI FATTO NOTATO IL FILTRO NELLA DASH , SI 3 DI NOTTE ORE ITALIANA

**QA09 reset:** regola chiarita dal supporto: i backtest si riattivano alle **03:00 ora italiana del giorno dopo**, timezone Europe/Rome. Il residuo documentale ora/fuso è risolto; limite e successiva disponibilità erano già provati. Classificazione: regola dichiarata dalla fonte, NON test empirico eseguito al confine delle03:00. Non programmata saturazione quota.

**QA01 H2H:** supporto riconosce un probabile bug quando si attiva il filtro Dashboard e dichiara che lo sistemerà. Casi riprodotti v90: North Macedonia–Scotland (4H2H) e Sabadell–FC Andorra (1H2H) escluse dal filtro pur presenti in Stats+. Il difetto resta aperto in attesa della correzione e di un nuovo test reale: non dichiarato risolto/certificato.

**Date NaN / percentuali:** secondo il supporto il sistema non riconosce la data, ma gli incontri sono comunque conteggiati nelle percentuali. Registrata la dichiarazione; non scartare automaticamente un record dal parser soltanto per data NaN. Preservare data non valida come null e anomalia esplicita, mantenendo risultati e campione disponibili. Questa è indicazione di trattamento, non attestazione che tutte le formule siano state riconciliate indipendentemente; cronologia non ricostruibile da NaN senza altra fonte.

QE/Guida e prove Live restano aperti, nessuna modifica del software proprietario effettuata. La issue non è ancora chiudibile.


### Asian Odds — tentativo zoom reale v97, NON VERIFICABILE nel browser remoto
03/10/2026 12:36 Europe/Rome. Accesso reale, Asian Odds, viewport1440×900. Inviati tre comandi nativi Control+- e ripristino Control+0. Ogni passo conserva screenshot e misure.
**Lo zoom non è cambiato effettivamente:** innerWidth/outerWidth/visualWidth1440, devicePixelRatio1, visualViewport.scale1 in tutti i passi; riquadro1X2 clientWidth335/scrollWidth394 invariato. Il browser headless non ha applicato le scorciatoie. Nessuna modifica CSS zoom/transform, nessuna sostituzione deviceScaleFactor spacciata per zoom browser.
Conclusione: tentativo eseguito ma workaround del supporto NON certificato; non affermare né che ridurre lo zoom risolva né che non risolva. Resta valida la prova v96 dell'overflow a scala normale. Serve browser con controllo zoom effettivo o verifica owner tramite menu zoom100/90/80% con screenshot. Questo limite del test non è un nuovo difetto del sito.
Run source-mapping-2026-10-03-asian-zoom-v97 concluso10:36:47UTC failed=[]; snapshot source-mapping-2026-10-03-asian-zoom-v97-attempt-1791023778906-7esglyelr3k-AsianZoom.
Commit300826917efd26de015be1327ee08201bcf02ad1, node --check positivo.


### Asian Odds — estrazione completa della lista reale v99, 03/10/2026 12:43 Europe/Rome
Richiesta owner: verificare estrazione dell'intera pagina nonostante clipping grafico.
Run reale concluso10:43:51UTC failed=[]; commit999c72322859e782e43033d82b34e48ff73407b3, sintassi passata. Filtro Tutte, lista mostrata231; estratte231/231 partite prima e dopo scroll. Prima Italy U20–France U20, ultima Forge FC–HFX Wanderers.
Scroll nativo fino al fondo: scrollTop70480 + clientHeight838 = scrollHeight71318; bottomReached=true. Tutte le231 righe, HTML/testo/celle, sono identiche prima/dopo; nessun caricamento incrementale osservato. Testo completo lista225391 caratteri conservato senza troncamento.
Conteggi:678 riquadri mercato (217 1X2,230Handicap,231Totali),2232 righe bookmaker,5184 coppie Apertura→Attuale/Chiusura,10368 valori quota.237 coppie Chiusura,4947Attuale.
**Riconciliazione di TUTTE le5184 coppie:** estrazione dal testo della cella confrontata con HTML .op e .cu/.cl; valori coincidenti,0errori.0anomalie di forma (bookmaker,4celle/riga,3flow1X2 o2flowHandicap/Totali). Associazione per riquadro + intestazioni DOM, non coordinate visive: Casa/Pareggio/Trasferta, lineaHandicap+Casa/Trasferta, lineaTotale+Over/Under.
Esempio hkjc Italy U20–France U20:1X2 Casa3,70→3,70,X3,60→3,60,Trasferta1,71→1,71;Handicap+0,75 Casa1,74→1,74/Trasferta2,05→2,05;Totale2,75Over1,76→1,76/Under1,94→1,94.
**Errore iniziale del selettore conservato:** v99 flows.current cercava soltanto.cl e mancava4947 valoriAttuale (.cu). RawHTML/testo/celle li contenevano tutti. La verifica derivata li recupera e confronta indipendentemente; non usare il campo iniziale incompleto come parser operativo. v98 aveva catturato231righe ma non aveva raggiunto fondo; v99 completa il requisito.
**Copertura100% della lista Asian Odds resa in questa sessione**. Non è100%dei dati upstream non mostrati, di tutti gli stati filtro/date o garanzia di correttezza delle quote fornite.14partite prive di riquadro1X2 e1privaHandicap nella fonte: assenza preservata, non inventati mercati.
La sovrapposizione/clipping non impedisce la lettura DOM completa delle quote di questa lista. Il layout resta difettoso; l'adapter operativo deve gestire entrambi i campi .cu/.cl e conservare etichette e valori originali. Valutazione estrazione della lista5/5, layout2/5.
Prova grezza:source-mapping-2026-10-03-asian-extract-v99-attempt-1791024178130-wqcehfp3m1e-AsianExtract.
Verdict riconciliato:source-mapping-2026-10-03-asian-extract-v99-derived-verdict.
Nessuna chiusura issue eseguita; collaudoLive16:15resta separato.


### Dashboard ↔ Asian Odds: confronto reale completo v100
03/10/2026 circa13:03Europe/Rome, stessa sessione autenticata, palinsesto automatico caricato. Dashboard37partite; Asian Odds229partite (diverso snapshot dal precedente231: non dedurre perdita parser).
Confrontate entrambe le squadre casa/ospite in ordine:13coppie identiche dopo normalizzazione minima(case,spazi,punteggiatura,accenti),20coppie con alias candidati,4assenti dalla lista. Nessuna identificazione automatica basata su una sola sottostringa. Esempio “Odd” trova anche “Notodden”: falso candidato escluso dal confronto, illustra il rischio.
| Dashboard | Asian Odds | Ora Dashboard / Asian | Esito |
|---|---|---|---|
| Belarus – San Marino | Belarus vs San Marino | 18:00 / 03/10, 16:00 | Coppia normalizzata identica |
| Spain – Czech Republic | Spain vs Czech | 20:45 / 03/10, 18:45 | Alias candidato, da validare |
| Croatia – England | Croatia vs England | 18:00 / 03/10, 16:00 | Coppia normalizzata identica |
| Switzerland – Slovenia | Switzerland vs Slovenia | 20:45 / 03/10, 18:45 | Coppia normalizzata identica |
| Cuiabá – Ponte Preta | Cuiaba vs Ponte Preta | 22:00 / 03/10, 20:00 | Coppia normalizzata identica |
| Boca Juniors – Unión Santa Fe | Non presente | 02:30 / — | Assente nella lista |
| Strømmen – Sandnes Ulf | Strommen vs Sandnes Ulf | 14:30 / 03/10, 12:30 | Alias candidato, da validare |
| FC Den Bosch – FC Dordrecht | Den Bosch vs Dordrecht | 20:00 / 03/10, 18:00 | Alias candidato, da validare |
| Deportes Tolima – Boyacá Chicó | Deportes Tolima vs Chico | 23:05 / 03/10, 21:05 | Alias candidato, da validare |
| Hødd – Odd | Hodd vs Odd BK | 16:00 / 03/10, 14:00 | Alias candidato, da validare |
| Iceland – Bulgaria | Iceland vs Bulgaria | 18:00 / 03/10, 16:00 | Coppia normalizzata identica |
| Atlético GO – América Mineiro | Atletico Goianiense vs America MG | 21:00 / 03/10, 19:00 | Alias candidato, da validare |
| Fortaleza – Náutico | Non presente | 02:35 / — | Assente nella lista |
| Vitesse – NAC Breda | Vitesse vs NAC Breda | 16:30 / 03/10, 14:30 | Coppia normalizzata identica |
| Haugesund – Stabæk | Haugesund vs Stabaek | 16:00 / 03/10, 14:00 | Alias candidato, da validare |
| FC Eindhoven – De Graafschap | Eindhoven FC vs De Graafschap | 20:00 / 03/10, 18:00 | Alias candidato, da validare |
| Almere City – FC Volendam | Almere City vs Volendam | 20:00 / 03/10, 18:00 | Alias candidato, da validare |
| RKC Waalwijk – FC Emmen | RKC Waalwijk vs Emmen | 20:00 / 03/10, 18:00 | Alias candidato, da validare |
| TOP Oss – MVV Maastricht | Top Oss vs Maastricht | 16:30 / 03/10, 14:30 | Alias candidato, da validare |
| Deportivo Cali – Alianza Petrolera | Non presente | 02:45 / — | Assente nella lista |
| Burton Albion – Huddersfield Town | Burton Albion vs Huddersfield | 16:00 / 03/10, 14:00 | Alias candidato, da validare |
| Rionegro Águilas – Jaguares de Córdoba | Aguilas Doradas vs Jaguares de Cordoba | 21:00 / 03/10, 19:00 | Alias candidato, da validare |
| North Macedonia – Scotland | North Macedonia vs Scotland | 20:45 / 03/10, 18:45 | Coppia normalizzata identica |
| Almería – Burgos | Almeria vs Burgos CF | 16:15 / 03/10, 14:15 | Alias candidato, da validare |
| Reading – Bradford City | Reading vs Bradford City | 16:00 / 03/10, 14:00 | Coppia normalizzata identica |
| Albacete – SD Eibar | Albacete vs Eibar | 14:00 / 03/10, 12:00 | Alias candidato, da validare |
| Leyton Orient – Plymouth Argyle | Orient vs Plymouth | 16:00 / 03/10, 14:00 | Alias candidato, da validare |
| Sabadell – FC Andorra | Sabadell vs FC Andorra | 18:30 / 03/10, 16:30 | Coppia normalizzata identica |
| Cádiz – Leganés | Cadiz vs Leganes | 18:30 / 03/10, 16:30 | Coppia normalizzata identica |
| Defensa y Justicia – San Lorenzo | Defensa Y vs San Lorenzo | 19:45 / 03/10, 17:45 | Alias candidato, da validare |
| Newell's Old Boys – Lanús | Newells Old Boys vs Lanus | 22:00 / 03/10, 20:00 | Coppia normalizzata identica |
| Atlético Tucumán – Barracas Central | Atletico Tucuman vs Barracas | 22:00 / 03/10, 20:00 | Alias candidato, da validare |
| Botafogo SP – Vila Nova | Botafogo SP vs Vila Nova GO | 23:30 / 03/10, 21:30 | Alias candidato, da validare |
| Independiente Rivadavia – Gimnasia La Plata | Non presente | 02:30 / — | Assente nella lista |
| Finland – Albania | Finland vs Albania | 15:00 / 03/10, 13:00 | Coppia normalizzata identica |
| Avaí – Ceará | Avai SC vs Ceara | 16:00 / 03/10, 14:00 | Alias candidato, da validare |
| Estonia – Luxembourg | Estonia vs Luxembourg | 18:00 / 03/10, 16:00 | Coppia normalizzata identica |

Per tutte33corrispondenze/candidate selezionate, l'ora Asian è due ore prima dell'oraDashboard nello stesso giorno mostrato. Compatibile con UTC vsEurope/Rome il03/10, ma timezone della fonte non esplicitata: ipotesi, non contratto certificato. Le4assenti sono incontri02:30–02:45Dashboard; possibile confine giornata/feed, non causa dimostrata.
Conclusione: le liste NON coincidono interamente e i nomi NON sono sempre identici.13matchnominali certi nel perimetro normalizzazione;20alias plausibili da confermare prima di associare quote automaticamente;4nessuna coperturaAsian corrente. Non usare nearest/fuzzy da solo per trading. Conservare stato unmatched/alias_candidate e verificare entrambe squadre,competizione,giornata/fuso. Il test non certifica identità tramite eventID comune, perché non esposto.
Prove grezze:prefisso source-mapping-2026-10-03-teams-dashboard-asian-v100-attempt-1791025369886-fkvvoftrc6, suffissi -Teams-Dashboard e -Teams-Asian Odds.
Commit8eb873f9c7fadd5d1f7af53956ed3fa4a6a60ba4; node --check positivo; runconcluso11:03:58UTC,failed=[].
Annotato tutto il confronto, nessun adapter operativo di alias o conversione fuso implementato da questa prova.


### Requisito owner: mappatura contestuale Palinsesto ↔ Asian Odds — 03/10/2026 15:58 Europe/Rome
L'owner richiede che la mappatura comprenda per entrambe le fonti **nazione, campionato, squadra casa, squadra ospite, data e ora**, poiché Asian Odds mostra anche competizione e timestamp.
Il solo confronto nominale v100 non basta:13coppie normalizzate,20alias candidati e4assenti restano il risultato di quel test, non un contratto completo di identità.
Per l'adapter operativo:
- Conservare campi originali per fonte e campi normalizzati distinti; identificatori della fonte quando disponibili.
- Asian: leggere titolo effettivo del gruppo competizione, non soltanto icona. In v100 league ottenuto dal primo innerText era “🌐”: **estrazione del campionato NON completata da quel selettore**, da correggere e verificare.
- Nazione può essere esplicita o ricavabile soltanto tramite mappa di competizioni validata. Non trattare sigle Asian sconosciute come nazioni certe; separare rawCompetition, competitionId/canonicalName e country, con unknown/null quando necessario.
- Collegare coppia casa/ospite nello stesso ordine + competizione validata + data/orario normalizzati. Alias espliciti e verificati, niente sola sottostringa/fuzzy; casi incerti restano alias_candidate/unmatched.
- Preservare timestamp grezzo e fuso dichiarato/unknown. Lo scarto Asian −2h osservato v100 è compatibile con UTC ma **non ancora confermato**; non applicare automaticamente +2h fisso, soprattutto al cambio data/ora legale.
- Test reale richiesto sull'intero palinsesto corrente: coppie,competizioni,orari,ambiguità,duplicati e incontri attraversanti mezzanotte. Mercati/quote collegati solo dopo riconciliazione.
Questo aggiornamento registra il requisito; non dichiara implementata o certificata la mappatura completa. CollaudoLive programmato16:15 rimane distinto.


### QA06 — collaudo Live reale v101, 03/10/2026 16:20–16:21 Europe/Rome
Run source-mapping-2026-10-03-live-sorts-v101 concluso14:20:47UTC, failed=[]; commit fd7d83b571cd785e213812b9958fa2f02196da3a; node --check PASS prima del push.
10partite Live: Strømmen–Sandnes Ulf, Leyton Orient–Plymouth, Burton–Huddersfield, Strømsgodset–Åsane, Avaí–Ceará, Finland–Albania, Haugesund–Stabæk, Reading–Bradford, Hødd–Odd, Almería–Burgos.
Tutti16header cliccati due volte:32direzioni con frecce▼/▲, sequenze complete10righe/celle/HTML persistite. Oracle esterno al sito: minuto, somma gol, ordine BASSA<MEDIA<HOT del rating visualizzato, somme coppie XG/pressione/statistiche, GPpercentuali. Non usate funzioni interne né dati simulati.
**15header PASSED sulle celle visibili in entrambe direzioni**:min/ris/rating/xgl/xg/gp1/gp2/pi1/pi2/pi3/cg10/sh/ot/da/cor. Pari merito presenti, stessa membership10/10; non imposto un tie-breaker non documentato. Mancanti XGlive4,GP1/2una,PI1/2/3/CG10una: rimangono “–”, vanno al lato basso e condividono il gruppo dei valori0 (CG10), senza spacciarli per osservazioni0.
**Possesso OBSERVED / semantica non certificata**: sequenza casa▼e▲ identica [51,59,50,66,50,52,40,60,65,59], non monotona né casa né max(casa,ospite); somma di ogni coppia100, quindi somma costante non discrimina l'ordine. Nessuna definizione pubblica osservata del criterio. Possibile ordinamento sul totale costante: ipotesi, non bug corretto o PASS. QA06 complessivo resta PARZIALE finché criterio possesso chiarito e verificato.
Raw: source-mapping-2026-10-03-live-sorts-v101-attempt-1791037136818-7ardwjdhsvk-QA06; verdict:source-mapping-2026-10-03-live-sorts-v101-derived-verdict. Fine processo non equivale a certificazione completa. Nessuna issue chiusa.


### QA07 — matrice Live popolata v102/v103/v103b, 03/10/2026 16:23–16:37 Europe/Rome
Run tutti conclusi prima di scrivere/deploy successivi: v10214:26:25UTC, v10314:33:55UTC, v103b14:37:27UTC; processo failed=[] non equivale a casi tuttiPASS. node --check PASS prima di ciascun push.
Commit:v10276d78ed4a0f6caa09d0374390c6907c791d2601f;v103d006d1ebea36f7a176cbb513ecaa275355d771bd;v103b77aff2d0b8871d9de9efd1372fa43ed5b9fea088. v103/v103bviewport1920×1080; browser reale Render e dati sorgente senza simulazione.
v102:48casi,46PASS,1FAILED(oracle su percentuale visualizzata),1HT OBSERVED. Verificati0controvuoto,scoreimpossibile,minute,quote+score+minute,tiri,soglieGol,20min/maxinclusivi,10incroci,pressioni/tempi/favorita perdente/Preferiti. Statistiche aggregano somma casa+ospite; possesso filtro =max(casa,ospite), come spiegazione UI. **Incroci**: tentativo minEnd poi maxHome porta min=max al massimo(100%/20/40/15/120 a seconda campo); non lascia min>max. Membership0coerente su lista iniziale10. Confini concreti presenti perstatistiche/possesso; non tutti i possibili valori legali reali presenti. Preferito QA36120085 ripristinato nonselezionato, tutti campi avanzati identici, stessa membership10al reset(v102ordine mutato dal feed).
v103:34casi;25PASS. Tutte19opzioni Scores(home/away/draw+16risultati),multiOR,Select All/Clear,Time0–30/30–120 e sincronizzazioneadvancedminuto30→Time30 verificati. Mancanza di risultato peralcuniscore è asserita contro lista popolata9, non certificazione su lista sorgente vuota.
**Errore harness conservato**:8casi bloccati per selettorecampionato maiuscolo, mentre data-live-lg conserva il case originale; non difetto del sito. **v103b corregge soltanto selettore tramite opzioni osservate**:6campionati singoli,unionedueleghe,combinazioneEngland+Time0–45+score0-0+tiritotali≥4(1rigaLeyton), menuScores/Time eHT passano(15/16casi). Lista cambia10→9→10 fra run per incontri terminati/nuovi; oracle ricalcolato prima di ogni caso, non confronto con lista congelata precedente.
**HT**: card non espone un badge HT affidabile. Il piccolo0-0 è .lc-xg-mark (proiezione xG), non HT; mai usato come oracle. Ricostruzione indipendente da tooltip dei gol/minuti reali della timeline: Finland–Albania gol4′ospite e26′casa⇒HT1-1; coperturaeventi=golattualiverificata. v103HTmulti0-0+1-1 restituisce solo36135230 fra9righe (unica nel2°tempo): oracle derivato PASS per questo caso, anche se journal iniziale restaOBSERVED. v103bHT1-1 con2°temporestituisce stessaFinland⇒PASS. **Campione limitato**: nelretry una sola partita giànel2°tempo, nessuna unione di due diversi HT entrambi presenti; mantenutohtBlocker, non certificata questa variante.
**Reset: perimetro osservato**. v103bAzzera filtri dentroavanzati dopo campionato+Time+Scores+corner non torna alle10righe:ne resta1. Fallisce assunzione di reset globale inun solo pulsante; occorre distinguere resetavanzati da menu campionato/Scores/Time e toggles. Reset completo tramite i controlli dei rispettivimenu eseguito alla fine, non ottenuto chiamando funzioni interne. Non dichiarareAzzera resetuniversale.
**Gol++ confine aperto**: v102Leyton mostra60% ma min60loesclude; hypothesisprecisione/arrotondamento non ancora provata. Verifica dettaglio prosegueQA14; fallimento grezzo conservato.
Raw:source-mapping-2026-10-03-live-filters-v102-attempt-1791037397156-zjifio6vl5r-QA07;source-mapping-2026-10-03-live-filter-combinations-v103-attempt-1791037720463-9b4zn45ja95-QA07-extension;source-mapping-2026-10-03-live-filter-retry-v103b-attempt-1791038073142-4y9a352jm1q-QA07-extension.
QA07 complessivo **PARZIALE**: molto piùcoperto, restano precisione al confine, perimetro reset da mantenere esplicito e varianteHT con due risultati popolati. Nessuna chiusura issue.


### QA14 — Gol+/Gol++, dettagli e oracle indipendente, 03/10/2026 16:39–16:46 Europe/Rome

**Verdict complessivo: PARZIALE; QE non risolta.** Browser reale Render, viewport 1920×1080, autenticazione tramite ambiente esistente. Solo gesti UI ordinari e lettura DOM; nessuna simulazione, funzione interna del sito o installazione browser. Sintassi `node --check source-login.mjs` verificata prima di ciascun push. Ogni run concluso prima del successivo deploy.

| Versione | Commit harness | Run | Fine Europe/Rome |
|---|---|---|---|
| v104 | eb24e2a6af0b58f62ba34391d9fc4a449db55ed4 | source-mapping-2026-10-03-live-goal-detail-v104 | 16:41:33 |
| v105 | d6bce7e163cd592821f07c03ee51f9446b462c7b | source-mapping-2026-10-03-live-exact-score-v105 | 16:46:36 |

**Dettaglio Gol+/Gol++ — PASSED nel perimetro osservato:** apertura e chiusura reali su 10 partite; campione N del tooltip coincide con N del dettaglio 10/10; percentuali entro [0,100] e Gol++ ≤ Gol+ 10/10. N varia da 8 a 463. Campioni e percentuali cambiano con minuto/score: non sono confrontati tra momenti differenti come se fossero congelati.

**Risultato Esatto Live — controllo indipendente degli aggregati UI:** 11 aperture e chiusure, con N tooltip/modal coincidente 11/11. Dal dettaglio reale si ricava Gol+ = 100 − P(score attuale); Gol++ = 100 − P(score attuale) − P(un solo altro gol casa) − P(un solo altro gol ospite). Un esito non mostrato vale zero nell'oracle soltanto se l'elenco è completo, senza “Altro”; con “Altro” positivo occorrono entrambe le categorie di un solo gol esplicite. Nessun uso della percentuale da verificare per ricostruire una categoria nascosta.

| Partita | Minuto / score | N | Gol+ UI / oracle | Gol++ UI / oracle | Esito aggregati |
|---|---|---:|---|---|---|
| Finland–Albania | 81′ / 2-1 | 11 | 9 / 9 | 0 / 0 | PASS / PASS |
| Strømsgodset–Åsane | 41′ / 0-0 | 421 | 86 / 85 | 59 / 58 | PASS / PASS |
| Avaí–Ceará | 41′ / 0-0 | 118 | 80 / 80 | 34 / 34 | PASS / PASS |
| Haugesund–Stabæk | 44′ / 0-0 | 30 | 83 / 83 | 50 / 49 | PASS / PASS |
| Leyton Orient–Plymouth | 44′ / 0-0 | 68 | 78 / 78 | 43 / 43 | PASS / PASS |
| Reading–Bradford | 44′ / 0-1 | 131 | 79 / 79 | 50 / 51 | PASS / PASS |
| Almería–Burgos | 29′ / 0-0 | 100 | 88 / 88 | 58 / 58 | PASS / PASS |
| Burton Albion–Huddersfield | 44′ / 1-2 | 11 | 73 / 73 | 46 / 46 | PASS / PASS |
| Hødd–Odd | 44′ / 1-2 | 12 | 92 / 92 | 50 / 50 | PASS / PASS |
| TOP Oss–Maastricht | 12′ / 0-0 | 297 | 93 / 93 | 72 / 72 | PASS / PASS |
| Vitesse–NAC | 5′ / 0-0 | 100 | 93 / 93 | 82 / non determinabile | PASS / BLOCKED |

Tolleranza predefinita del confronto tra percentuali intere stampate: ±1 punto percentuale Gol+, ±2 Gol++. Somme degli istogrammi 99–101%. **Sono prove di coerenza tra aggregati UI, non certificazione dei numeratori, della selezione di ogni incontro storico o della formula sui dati grezzi.** Vitesse: 0-0=7%, 0-1=9%, 1-0 non esposto e “Altro”=37%; Gol++ indipendente non determinabile senza la categoria nascosta.

**Fallback — OBSERVED:** Strømsgodset espone “tutta la competizione (quote non abbastanza simili nel campione)” sia nel tooltip sia nel dettaglio; documentato ampliamento nella stessa competizione. La Guida menziona anche fallback globale quando la competizione è insufficiente: non osservato in questi campioni, quindi non certificato. In v101 Hødd mostrava “–” e “Campione insufficiente”; il numero esplicito <5 non era esposto, quindi non certificata quantitativamente la soglia.

**Inclusività percentuali — discordanza visuale conservata:** v104 Finland Gol+ 25%, N8, min25 inclusa; Almería Gol+ 90%, N115, min90 esclusa; Almería Gol++ 60%, N115, min60 inclusa. Conferma che l'uguaglianza della percentuale stampata non garantisce membership. La possibile precisione interna spiega i casi, ma resta inferenza: sotto ipotesi di frequenza semplice arrotondata, 103/115=89,565% potrebbe stampare90 e restare sotto90; il numeratore103 non è mostrato. Anche 68/114=59,649% per il precedente Leyton v102 è un candidato, non conteggio certificato.

**Nuova ambiguità nella Guida:** “Segna ancora Casa/Ospite” è spiegato come chi segna il prossimo gol. Hødd v104 espone Casa50%, Ospite88% (somma138%): non possono rappresentare due alternative mutuamente esclusive del prossimo gol. Potrebbero essere eventi sovrapposti di almeno un gol per ciascuna squadra; questa interpretazione non è una formula certificata. Serve chiarimento della fonte.

**QE:** la Guida acquisita nuovamente v104 conserva l'indicazione Lay sopra QE→VALORE / sotto QE→SALTA, opposta alla prova UI v94 già registrata. Nessuna nuova evidenza di correzione: contraddizione ancora aperta; non implementare una formula inventata.

Prove grezze Neon:
- `source-mapping-2026-10-03-live-goal-detail-v104-attempt-1791038357228-droq3ecu6i6-QA14`
- `source-mapping-2026-10-03-live-exact-score-v105-attempt-1791038635640-s209zuaorl-QA14-CS`
- Verdict derivato: `source-mapping-2026-10-03-live-goals-v104-v105-derived-verdict`

### QA06 — approfondimento rating numerico e possesso v106, 03/10/2026 16:50–16:51 Europe/Rome

Commit `b289772696c768a2b30caf93d4a3fb036986e36b`; run `source-mapping-2026-10-03-live-numeric-sorts-v106`, concluso 16:51:08 Europe/Rome (14:51:08 UTC). Sintassi verificata prima del push. Browser reale 1920×1080; nessun dato simulato.

**Rating numerico PASSED:** associati Card e Tabella tramite ID partita reale; valori Card stabili prima/dopo il clic in entrambe le direzioni su 11 partite.
- ▲: [20,20,20,30,30,40,40,50,50,60,60].
- ▼: [60,60,50,50,40,40,30,30,20,20,20].

Questo integra il precedente controllo v101 delle sole fasce BASSA/MEDIA/HOT. **Possesso OBSERVED, non certificato:** anche nel secondo run né quota casa né max(casa,ospite) risultano monotoni; le somme sono tutte100. Nessuna definizione dell'ordinamento discriminante osservata. Un cambio di rating durante il primo giro del possesso è conservato come drift e non usato per certificare il rating. Non presentare l'ordinamento sul totale costante come funzione utile verificata.

Snapshot: `source-mapping-2026-10-03-live-numeric-sorts-v106-attempt-1791038960286-4uf296crgiw-QA06-numeric`.
Verdict: `source-mapping-2026-10-03-live-numeric-sorts-v106-derived-verdict`.

### Stato finale del collaudo Live — 03/10/2026 16:52 Europe/Rome

**Issue NON ANCORA CHIUDIBILE.** Tutte le esecuzioni v101–v106 sono terminate. I casi superati hanno asserzioni su liste popolate e prove grezze; errori harness, assunzioni fallite e impedimenti restano nel registro. Nessun ordine reale o nuovo backtest consumato; preferito QA e filtri ripristinati tramite UI. Le modifiche al codice riguardano il harness QA, non una correzione della fonte.

| Punto attivo | Stato finale | Residuo concreto |
|---|---|---|
| QA01 H2H Dashboard | In attesa supporto | Bug filtro riconosciuto dal gestore; ritestare dopo correzione. Le date NaN sono mantenute nei calcoli secondo dichiarazione del supporto, non come nuova certificazione autonoma. |
| QA06 ordinamenti Live | PARZIALE | Tutti 16 header cliccati nei due versi; 15 criteri riconciliati con celle reali, rating numerico incluso. Chiarire e verificare criterio possesso. |
| QA07 filtri Live | PARZIALE | Matrice campionato/Time/Scores/statistiche/preferiti, incroci e cleanup provati. Restano contratto della soglia sulle percentuali arrotondate, ambito del pulsante reset e unione di due HT differenti entrambi popolati. |
| QA09 reset giornaliero | In attesa prova al confine | Supporto dichiara 03:00 Europe/Rome; manca osservazione reale prima/dopo quel confine. |
| QA14 Gol+/Gol++ / QE | PARZIALE, QE discordante | Aggregati Gol+ 11/11 e Gol++ 10/11 coerenti entro tolleranze; Vitesse bloccata da “Altro”. Mancano numeratori/storico individuale, fallback globale/soglia N esplicita e chiarimenti “prossimo gol”/QE. |

**Fuori dalle prove attive per decisione owner:** importazione valida con campionato/orario (QA05), mobile/audio/radar con Live popolati (QA10–12), equity cronologica (QA13) e Ladder Dutching (QA15). I difetti storici restano conservati, ma questi punti non sono ripresi né dichiarati superati.

Pannello operativo MatchPilot, timeline/archivio giornate, normalizzazione e bankroll virtuale, analisi operativa OpenRouter e monitoraggio continuo restano lavori successivi nella master #1. Non sono stati costruiti da questi test. La issue resta aperta; nessuna chiusura automatica.



## Piano in assenza di risposta del supporto — 03/10/2026 17:27 Europe/Rome

Su richiesta owner «Ok annota tutto», si registra il piano discusso. **È documentazione di soluzioni proposte, non implementazione eseguita né nuova certificazione.** Nessun criterio di accettazione viene sostituito automaticamente; issue #2 ancora non chiudibile.

| Ambito | Gestione proposta per MatchPilot | Stato della fonte / verifica residua |
|---|---|---|
| Gol+/Gol++ | Conservare percentuale originale, N dichiarato, minuto/score, contesto e snapshot; raccogliere altri esempi reali e confrontare gli aggregati disponibili. | Non inventare numeratori o formula quando lo storico sottostante è nascosto. Fallback globale e soglia N esplicita non ancora certificati. |
| Segna ancora Casa/Ospite | Conservare nome originale e significato incerto; non usarlo come probabilità del prossimo gol. | Hødd–Odd 39′, 1-2: Casa50% / Ospite88%; serve chiarimento fra prossimo gol ed eventi sovrapposti entro fine partita. |
| QE | Conservare quota equa e messaggio della fonte; sospendere decisioni automatiche basate su VALORE/NON CONVIENE. | Guida e UI danno direzioni opposte. Nessuna correzione attestata; richiedere interpretazione e ritestare se cambia. |
| H2H | Leggere gli incontri disponibili in Stats+ e registrare separatamente l'effetto filtro Dashboard. Non scartare automaticamente una partita per il solo filtro difettoso. | Bug riconosciuto dal supporto; North Macedonia–Scotland4 / Sabadell–FC Andorra1. Ritestare dopo fix o su nuovi esempi reali, senza equiparare storici differenti per assunzione. |
| Possesso | Nel futuro pannello offrire ordinamenti espliciti per quota casa e max(casa,ospite), derivati dalle coppie effettivamente lette. | È comportamento del nostro pannello da implementare, non certificazione o correzione dell'header POSS della fonte. |
| Soglie percentuali | Esplicitare se i nostri filtri usano percentuali visualizzate; non fingere accesso alla precisione nascosta. | Uguaglianza visiva non garantisce inclusione nel filtro sorgente; spiegazione mediante arrotondamento resta ipotesi. |
| Reset filtri | Prevedere reset completo e verificabile del futuro pannello MatchPilot. | Nel sito il reset avanzati non ha azzerato tutti i menu; cleanup completo separato è stato verificato. |

### Domande inviate/proposte e test necessari

Il testo preparato per Piero copre: definizione Casa/Ospite; definizioni Gol+/Gol++ e selezione del campione; ampiezza fallback e campione insufficiente; precisione soglie; espansione “Altro” (Vitesse–NAC); direzione QE e commissione; criterio POSS; ambito Azzera filtri; H2H e requisiti dello storico; reset quota alle03 e distinto rinnovo del feed. **Non attestiamo invio o risposta del supporto tramite questa annotazione.**

- QA09 programmato: preparazione **04/10/2026 02:40 Europe/Rome**, baseline prima03 e verifiche dopo03. Conservare contatore/blocco/giornata/identità feed prima del cambio; se necessario al massimo un Backtest utile autorizzato. Senza baseline sufficiente non dichiarare certificato il reset.
- La fonte non offre consultazione dei giorni passati secondo owner: il04/10 le partite del03/10 potrebbero non essere più disponibili. Le prove già salvate rimangono valide come osservazioni datate; nuovi test devono usare incontri disponibili, non ricostruzioni spacciate per accesso reale.
- H2H: ripetere dopo correzione comunicata oppure osservare nuovi esempi senza dichiarare risolto il bug storico.
- QE/Gol/POSS/soglie/reset: dopo eventuale chiarimento confrontare definizione e comportamento reale; senza risposta conservare ambiguità e applicare soltanto mitigazioni esplicite nel futuro prodotto.
- HT multiplo: serve lista con almeno due partite nel secondo tempo e HT diversi, per selezione singola/unione/rimozione.
- Fallback globale e campione insufficiente: certificare soltanto quando compaiono campioni reali adeguati e dati sufficienti.
- **Nessun altro orario automatico programmato** per questi test: dipendono da risposta o condizioni Live non ancora determinate.

Il percorso può rendere il futuro MatchPilot utilizzabile con limiti dichiarati, ma non corregge la fonte né soddisfa automaticamente i criteri originali. Per chiudere con un perimetro diverso servirebbe una decisione esplicita owner sui criteri aggiornati, mantenendo difetti/ambiguità tracciati. L'owner chiude la issue; nessuna chiusura automatica.

Restano esclusi dalle prove attive importazione valida campionato/orario, mobile/audio/radar popolati, equity cronologica e Ladder Dutching. Pannello, normalizzazione, bankroll, OpenRouter operativo e monitoraggio continuo rimangono lavori successivi della master #1.


## Risposta supporto riferita dall'owner — 03/10/2026 17:39 Europe/Rome

Fonte: testo del supporto incollato da Piero in conversazione. **Chiarimenti dichiarativi, non nuovo collaudo del sito.** Le prove precedenti e i fallimenti restano conservati; questa sezione aggiorna le interpretazioni e supera le ipotesi del piano precedente dove indicato.

| Punto | Risposta del supporto | Stato aggiornato / prova residua |
|---|---|---|
| Segna ancora Casa/Ospite | Probabilità che ciascuna squadra segni almeno un altro gol, calcolata separatamente. Possono avverarsi entrambe; Guida da correggere. | Significato chiarito, coerente con Hødd50%/88%. Non usare come prossimo gol. Correzione Guida promessa, non verificata. |
| Gol+/Gol++ | Almeno1 / almeno2 gol residui totali. Campione al minuto esatto, non finestra. | Definizioni confermate dal supporto; coerenza aggregati già provata nel perimetro documentato. Selezione storica individuale non verificata. |
| Fallback | Ampliamento nella stessa competizione; globale su tutte le leghe soltanto quando la competizione non ha nessun precedente utile. Trattino sotto soglia minima indipendentemente dal percorso. | Regola dichiarata, esempio Strømsgodset coerente. Non specificata numericamente la soglia nella risposta; non assumere una conferma del valore5. Fallback globale/soglia quantitativa non certificati empiricamente. |
| Filtri Gol | Confrontano valore interno più preciso rispetto all'intero mostrato. Possibile miglioramento futuro della corrispondenza visiva. | Spiegazione del confine chiarita e compatibile con i casi reali. Il precedente fallimento contro percentuale stampata resta valido come discordanza UI, non errore di calcolo attestato. Numeratori ipotizzati non diventano conteggi verificati. |
| Altro | Contiene combinazioni non mostrate; non espandibile oggi. Miglioramento segnalato. | Limite UI confermato. Gol++ Vitesse non riconciliabile indipendentemente dal pannello esposto; non chiamarlo PASS né bug matematico. |
| QE | Per il Lay quota Betfair sotto QE conviene; indicatore corretto, Guida errata in due punti. Correzione promessa. | Interpretazione chiarita e coerente col test v94. Revocata l'incertezza sulla direzione dichiarata; la contraddizione testuale resta finché Guida corretta non osservata. Risposta non chiarisce eventuale commissione/aggiustamenti. |
| POSS | Bug confermato, correzione prevista. | FAILED rispetto a ordinamento discriminante atteso; non solo ambiguità. Criterio specifico futuro non dichiarato; verificare dopo fix su coppie diverse, entrambe direzioni. |
| Azzera filtri | Reset solo Avanzati, incluso Minuto; campionato/Scores/altri controlli superiori indipendenti. | Scope chiarito. Il test di reset globale in un solo clic era un'aspettativa errata: non bug sorgente. Cleanup separato reale già provato. Resta HT multiplo con due varianti popolate. |
| H2H | Fix dichiarato già attivo; identico elenco Stats+ H2H senza condizioni aggiuntive. | Ritestare realmente North Macedonia–Scotland e Sabadell–FC Andorra se ancora presenti; altrimenti nuovi casi con N H2H positivo e confronto completo. NON dichiarare fix certificato dalla sola risposta. |
| Reset Backtest | Automatico al cambio giornata, senza nuovo accesso; reload o nuovo Backtest sufficiente. Feed separato, nessun archivio delle partite sparite. | Distinzione quota/feed confermata. Questa risposta non precisa l'ora: precedente supporto diceva03:00 italiana. Mantenere test programmato04/10 con baseline e osservazioni dopo03, ma registrare l'ambiguità “cambio giornata”; non assumere mezzanotte né03 come confine empiricamente provato. |

### Prossime verifiche attive
1. H2H: controllo post-fix su incontri reali disponibili, con filtro on/off, conteggi Stats+ e membership Dashboard, conservando prove prima della scomparsa della giornata.
2. Guida: verificare successiva correzione Casa/Ospite e due indicazioni QE; mantenere snapshot prima/dopo.
3. POSS: dopo aggiornamento verificare criterio dichiarato/visibile, sequenze complete nei due versi, pari e mancanti. Nessun fix ancora certificato.
4. HT multiplo: attendere almeno due HT differenti reali e popolati; verificare singoli, unione, rimozione/reset.
5. QA09: prova già programmata04/10 preparazione02:40, baseline pre03 e dopo03, distinguendo disponibilità, reset quota e cambio feed. Se contatore già azzerato prima03 oppure confine non osservato, documentare limite senza certificare reset a03.
6. Fallback globale e soglia campione: restano verifiche condizionate alla disponibilità di dati osservabili. “Altro” resta un limite documentato dell'interfaccia, non da aggirare con formule inventate.

Le mitigazioni precedenti erano proposte, non codice implementato. Per QE la sospensione proposta per mancata interpretazione può essere riesaminata sulla base di questa risposta e del test v94, ma non equivale a implementazione automatica o certificazione della Guida aggiornata. **Issue ancora non chiudibile; owner mantiene la chiusura.** Nessuno dei punti esclusi è ripreso.
