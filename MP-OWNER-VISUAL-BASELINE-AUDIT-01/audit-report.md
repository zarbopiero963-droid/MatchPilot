# Rapporto di audit — MP-OWNER-VISUAL-BASELINE-AUDIT-01

Audit in sola lettura, senza modifiche al repository: lavoro su un'estrazione di `main` in una cartella temporanea. Nelle conclusioni distinguo tre tipi di fonte: **[O]** evidenza osservata nel browser, **[S]** analisi statica del codice, **[D]** mia deduzione.

**Stato verificato prima dell'audit**
- **`main`:** `3d8f5c9`. La CI sul push è verde, compreso il Browser QA (run 39260305526).
- **PR aperte:** nessuna.
- **QA-01 (#164):** fusa.
- **R-07a:** preservato nel branch locale `wip-r07a-local` e nella patch in `docs/governance/wip/`.
- **QA-02:** il lavoro locale non committato (`tools/qa/explore.mjs` e l'export in `tools/qa/browser-qa.mjs`) è fermo così com'era all'arrivo del mandato. Non l'ho toccato.

## 1. Mockup analizzato

| Versione | SHA-256 del file | Origine |
|---|---|---|
| Corrente su `main`, «Mock UX v2026.10.19» | `4dd546f3…6c8eaf76` | ultima modifica in #163 |
| Approvata nel riallineamento a #97 (#103, 06/10) | `eec17bf1…5d98c77d` | `5b39f33` |
| Snapshot storici | 10-05 `db031703…`, 10-06 `8c7d2203…` | `docs/reference/` |

**[S] Deriva del mockup da segnalare.** Dopo #103 il mockup è stato modificato due volte, entrambe da me agente, sotto la policy di auto-merge e **senza approvazione visiva specifica dell'owner**:
- #159 (R-04b): aggiunta della schermata di accesso owner, 14 righe;
- #163 (R-06b): aggiunta della nota sul sito reale nella pagina «Oggi», 1 riga.

Il resto del mockup coincide con #103. Le due aggiunte non hanno una fonte owner verificabile come scelta grafica (decisione D-5).

## 2. Sito analizzato

- **Commit:** `src/web/` su `main` `3d8f5c9`, branch `main`.
- **Server:** reale, su PostgreSQL usa e getta.
- **Dati:** archivio QA caricato dal percorso di ingestione reale (2 campionati, 86 partite).
- **Browser:** Chromium 141.0.7390.37, viewport 1280×800 e 390×844.
- **Font del mockup:** caricati da Google Fonts senza errori, quindi il rendering del mockup è fedele.

## 3. Screenshot comparativi [O]

Le 4 immagini affiancate inviate sopra (bozza a sinistra, sito reale a destra) mostrano Daily Board desktop e mobile, Stato dati/Dashboard desktop e Ricerca mobile. In tutto ho acquisito 56 screenshot (6 viste del mockup e 8 del sito, su 2 viewport, sia in vista schermo sia a pagina intera) in `/tmp/claude-0/-home-user-MatchPilot/9501c668-6355-52e9-bcad-bf70034a666f/scratchpad/audit/shots/`.

## 4. Matrice di conformità

| Elemento | Bozza | Sito reale | Differenza | Classificazione | Evidenza | Azione proposta |
|---|---|---|---|---|---|---|
| Identità visiva | Logo con icona; font Barlow Condensed, Manrope e JetBrains Mono; accento ambra `#FFB547` | Testo «MatchPilot»; font `system-ui`; accento azzurro `#8cc8ff` | Totale | VISUAL DIFFERENCE | [O] e [S] `:root` | B, dopo la decisione D-1 |
| Navigazione | Oggi, Live, Strategie, Tools, Backtest, Portafoglio, Money, Report, Dati | Dashboard, Daily Board, Ricerca, Fornitori dati, API, Copertura | Voci diverse | Voci mancanti: PLANNED; voci in più: INTENTIONAL | [O] | Nessuna. Le voci compaiono con le relative PR |
| Pagina iniziale | «Oggi» (Daily Board) | Dashboard | Diversa | INTENTIONAL, ma l'atterraggio non è deciso | [S] MP-WEB-013 (owner D3) crea la Dashboard, non stabilisce la pagina iniziale | D-2 |
| Header a destra | Ricerca globale, assistente, notifiche, saldo, avatar | Assenti | Assenti | PLANNED (#44, #99, #23) | [O] | C |
| Striscia PROTOTIPO/DEMO | Presente | Assente | — | INTENTIONAL: il sito mostra solo dati reali | [S] MP-WEB-013 | Nessuna |
| Navigazione mobile | Barra in basso con icone | Menu a capo su 2 righe in alto | Struttura diversa | VISUAL DIFFERENCE, con un impatto di usabilità | [O] 390×844 | B |
| Daily Board: densità | Elenco compatto per campionato, circa 8 partite per schermo | Schede, 6 per schermo su desktop e 1 su mobile | Densità molto inferiore | VISUAL DIFFERENCE (leggibilità e usabilità) | [O] | B |
| Daily Board: raggruppamento | Per campionato, con bandiera | Ordine per orario con campionato su ogni scheda | Diverso | INTENTIONAL: il raggruppamento era scorretto ed è stato corretto con #163 NB-3; un raggruppamento vero richiede l'ordine dall'API | [S] | D-4, poi B |
| Daily Board: selettore data | 6 giorni a pillola | Campo data, giorno prima e dopo, «Oggi» | Forma diversa | VISUAL DIFFERENCE | [O] | B |
| Daily Board: segmento di stato | Tutte, Live, In programma, Finite, Con segnale | Assente | — | PLANNED (live #29, segnali #28) | [O] | C |
| Daily Board: rail campionati con conteggi | Presente | Assente | — | PLANNED. I conteggi vanno calcolati dall'API, non dal browser (MP-WEB-011) | [S] | C, con l'API |
| Rail segnali e bankroll | Presente, DEMO | Assente | — | PLANNED (#28, #99) | [O] | C |
| Stemmi e bandiere | Presenti | Assenti | — | DATA MISSING: l'archivio non ha loghi; le bandiere richiedono una mappatura | [S] | D-6 |
| Volumi € sotto le quote | Presenti | Assenti | — | DATA MISSING: FPT non fornisce volumi; non vanno mai inventati | [S] MP-OWNER-PRODUCT-QUALITY-DATA-01 | Nessuna |
| Formato quote | `1.70`: 2 decimali, punto | `1,300`: testo API esatto, virgola | Formato | INTENTIONAL (MP-WEB-011: nessun arrotondamento) | [O] | D-3 |
| Etichette tecniche | Testo in italiano | `PROVIDER_TZ_UNDOCUMENTED`, `FINAL`, `HISTORICAL`, `HOME`, `SPAIN · LALIGA`, nome del dataset | Leggibilità | VISUAL DIFFERENCE (leggibilità) | [O] | B: etichette italiane solo in presentazione, valore originale nel tooltip |
| Orari di generazione | — | ISO UTC grezzo, es. `2026-10-19T13:42:31.610Z` | Leggibilità | VISUAL DIFFERENCE | [O] | B, dopo la decisione D-7 |
| Stato dati / Dashboard | Riquadri KPI con numeri grandi, pill di stato, schede (Panoramica, Campionati…), checklist di certificazione | Riquadri chiave/valore di altezza diseguale, «Gate fase N: no» in rosso | Stile e struttura | VISUAL DIFFERENCE. I contenuti sono di parte REAL | [O] | B (stile); schede e checklist sono C |
| Ricerca | Ricerca globale nell'header e «Filtri avanzati» nel Match Center | Pagina dedicata con modulo completo | Diversa | INTENTIONAL (MP-WEB-007) | [O] e [S] | Nessuna |
| Ricerca mobile, esito dopo l'invio | — | Il modulo occupa lo schermo: l'esito o l'errore resta sotto la piega, senza scroll né focus | Usabilità | FUNCTIONAL BUG, P3 | [O] `site-search-invalid-mobile` | A |
| Ricerca: «Filtri applicati dal server» | — | Nomi tecnici, es. `before`, `venue:home` | Leggibilità | VISUAL DIFFERENCE | [O] | B |
| Fornitori dati: valori annidati | — | Nei valori profondi il testo va a capo carattere per carattere | Leggibilità | FUNCTIONAL BUG, P3 (già tracciato come QA01-3) | [O] | A |
| Formato del campo data | — | Segue la lingua del browser (mm/dd/yyyy in Chromium inglese) | — | NOT VERIFIED: dipende dal browser, non dal sito | [O] | Nessuna |
| Match Center, Live, Strategie, Tools, Backtest, Portafoglio, Money, Report, Copilot | Presenti, DEMO | Assenti | — | PLANNED (R-07…R-14, #28, #34, #96, #99, #102) | [O] | C, secondo la roadmap |
| Stati vuoto, errore e N/D | Il mockup non li rappresenta per i dati reali | Espliciti e testati | — | INTENTIONAL (MP-WEB-005, MP-WEB-010) | [O] | Nessuna |

## 5. Bug effettivi (categoria A)

1. **A-1, Ricerca mobile, P3:** dopo «Cerca» l'esito, o l'errore di validazione, resta fuori schermo. Manca lo scroll o il focus sul risultato. [O]
2. **A-2, Fornitori dati, P3:** nei valori annidati profondi il testo va a capo carattere per carattere, illeggibile. [O]

Nessun bug P0, P1 o P2.

## 6. Funzionalità pianificate (categoria C)

Nell'ordine della roadmap:
- **Match Center** (R-07, la patch R-07a è pronta).
- **Live** (#29).
- **Segnali e Copilot** (#28, #102).
- **Strategie e Backtest** (#34, R-14).
- **Portafoglio e bankroll** (#99).
- **Money** (#96).
- **Report.**
- **Header:** ricerca globale e assistente (#44), notifiche, profilo.
- **Daily Board:** segmento di stato, rail campionati con conteggi forniti dall'API.

Nessuna di queste è un bug.

## 7. Differenze intenzionali

- **Contenuti:** nessun dato DEMO e quindi nessuna striscia PROTOTIPO; N/D al posto di valori inventati; nessun volume o stemma inventato.
- **Numeri:** cifre esatte dell'API, senza arrotondamenti.
- **Pagine nuove:** Dashboard (decisione owner D3), Ricerca come pagina dedicata (MP-WEB-007), Fornitori dati e registro API (R-05).
- **Daily Board:** ordine per orario con il campionato su ogni scheda, al posto di un raggruppamento che era scorretto.

## 8. Decisioni owner necessarie (categoria D)

- **D-1, identità visiva.** Adottare il design system del mockup (font, colori ambra, logo)? I font del mockup vengono da Google Fonts, ma la CSP del sito vieta risorse esterne (`docs/web.md`). L'opzione a costo zero è ospitare i font OFL nel repository.
- **D-2, pagina iniziale.** «Oggi»/Daily Board come nel mockup, oppure Dashboard come oggi?
- **D-3, formato delle quote.**
  - *Precisione:* oggi le quote mostrano il testo esatto (`1,300`). Togliere gli zeri finali (`1,30`) è esatto e non è un arrotondamento; 2 decimali fissi invece arrotonderebbero, quindi non sono consentiti senza una decisione.
  - *Separatore:* virgola italiana o punto, come nel mockup?
- **D-4, raggruppamento per campionato.** Serve un ordine fornito dall'API (campionato, poi orario), cioè un cambio del contratto API.
- **D-5, deriva del mockup.** Confermare o annullare le due aggiunte fatte da me agente (schermata di accesso, nota R-06b).
- **D-6, stemmi e bandiere.** Fonte, licenza e costo, oppure nessuna immagine.
- **D-7, orari.** Ora locale italiana in presentazione, con il valore UTC esatto nel tooltip?

## 9. Proposta di integrazione con il Browser QA (regressione visiva)

- **Baseline:** PNG versionati per ogni rotta e viewport in `tools/qa/baselines/`, con un manifest SHA-256. Vanno generate solo nell'ambiente CI (runner Ubuntu e Chrome), per evitare falsi positivi dovuti a font e rendering diversi in locale.
- **Determinismo:** archivio QA fisso, orologio bloccato nella pagina, mascheramento delle aree variabili («generato: …», durate). Font del sito ospitati nel repository, se D-1 viene approvata.
- **Confronto:** pixel-diff calcolato nel Chromium stesso (canvas), senza nuove dipendenze. La tolleranza è esplicita (es. ≤ 0,1 % di pixel con differenza oltre la soglia). Le differenze producono un'immagine diff tra le evidenze del report.
- **Anti-aggiramento:**
  - una modifica a una baseline fallisce la governance, salvo una voce in `baselines/CHANGELOG.json` con PR, motivo e decisione owner IN_FORCE;
  - la review indipendente deve vedere vecchia, nuova e diff;
  - la CI non aggiorna mai le baseline da sola.
- **Tempi:** da introdurre **dopo** le correzioni B approvate. Prima, ogni restyling invaliderebbe tutte le baseline.

## 10. Piano minimo di correzione (non eseguito)

1. **PR V-A (bug A-1 e A-2):** una sola PR, con test di regressione nei percorsi Browser QA. Non richiede decisioni.
2. **PR V-B (conformità grafica):** solo dopo D-1, D-2, D-3 e D-7. Comprende:
   - design token, font ospitati e header;
   - barra di navigazione mobile;
   - Daily Board compatta;
   - etichette italiane in presentazione e orari umanizzati.

   Nessun cambio di dati, API o arrotondamenti.
3. **PR QA-V (baseline visive):** dopo V-B.
4. **Categoria C:** resta nella roadmap. R-07a, poi R-07b e il resto, senza inseguire il mockup fuori sequenza.

Le quattro categorie restano in PR separate.

---

Mi fermo qui, come richiesto dal criterio di arresto. Non ho modificato il mockup, il sito, le baseline o la roadmap, e non ho aperto PR. Il lavoro di QA-02 resta sospeso nello stato in cui si trovava. Attendo la tua decisione sugli interventi e su D-1…D-7.