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
