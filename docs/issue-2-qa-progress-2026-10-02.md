# Issue #2 — registro aggiornato dei test reali

Stato: **4/15 criteri conclusi**, di cui 3 PASSED e 1 NON DISPONIBILE. **Non chiudibile**. L'owner chiuderà l'issue soltanto quando tutti i criteri saranno soddisfatti. I test sono stati eseguiti sequenzialmente sull'account autorizzato; nessun ordine reale.

Date: 2 ottobre 2026 UTC / 2–3 ottobre Europe/Rome (UTC+2). La data nei run-id è un'etichetta; fanno fede i timestamp Neon. `run.status=complete` significa esecuzione terminata, non certificazione superata. Le prove originali, inclusi errori del harness, sono conservate.

| Caso | Esito | Ultime versioni | Verificato e residui |
|---|---|---|---|
| QA-01 | PARTIAL | v41 | H2H cliccato e ripristinato: 22→16→22; membership rispetto ai conteggi H2H storici da riconciliare. |
| QA-02 | PASSED | v43 | Logout, accesso diretto negato e nuovo login verificati; verdict derivato conserva errore iniziale del harness. |
| QA-03 | NON DISPONIBILE | v47 | Nessun calendario/input data/dialog/iframe osservato dopo clic. Non certifica un cambio giornata. |
| QA-04 | PASSED | v49 | Manuale QA popolato: Annulla conserva; Conferma elimina; reload pulito e identità feed automatico preservate. |
| QA-05 | PARTIAL | v51 | Squadre/quote, duplicato unico, malformato e cleanup verificati. Lega e ora non ancora riconciliate. |
| QA-06 | PARTIAL | v72 | 32 clic su 16 header con due partite. RATING pari; PI1 totali pari; POSS non inverte. Comparatori, pari e mancanti da completare. |
| QA-07 | PARTIAL | v56 | 15 scenari range/zero/vuoto/combinazione/reset; matrice campionato-tempo-HT-preferiti e inclusività da completare. |
| QA-08 | PASSED | v55 | Strategia Live A salva/reload/richiama; B indipendente non vede: storage locale. Cleanup entrambi. Non prova dispositivi fisici né Backtest. |
| QA-09 | BLOCKED | v57/v62 | Rifiuto reale del limite 5/giorno provato. Reset al confine effettivo e timezone non certificati. |
| QA-10 | PARTIAL | v60/v73 | 24 viste touch emulato con asset, 12 pagine×2 orientamenti. Scroll verticale e dettagli landscape riprovati (v73), clipping laterale Live da risolvere. |
| QA-11 | PARTIAL | v59 | On/off, due selezioni e 3 risorse audio HTTP200 provate. Playback udibile e mute effettivo non provati. |
| QA-12 | PARTIAL | v66 | Due radar con iframe popolati letti e screenshot verificati. Rami vuoto/errore/scroll residui. |
| QA-13 | BLOCKED | v62 | Nuovo backtest rifiutato per quota giornaliera; serie cronologica individuale/equity/drawdown non certificati. |
| QA-14 | FAILED | v63/v68 | Guida definisce Gol++≥2 gol. QE: UI 50 valore/60 non conviene con QE55.56; Guida consiglia lay sopra QE: contraddizione aperta. |
| QA-15 | FAILED | v70 | Target dichiarato 10 netti, fee5% restituisce9.50; multi selezioni e arrotondamenti/commissioni discordanti. Reset input eseguito. |

## Blocchi reali che impediscono la chiusura

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
