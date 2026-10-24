# Audit indipendente del prototipo (MP-UI-PROTOTYPE-AUDIT-01): correzioni ed evidenze

Il prototipo `webapp/dist/matchpilot-webapp.html` è stato corretto sui finding dell'audit. Questa cartella contiene gli script che verificano le correzioni in modo indipendente. Ogni valore atteso (oracolo) è calcolato dagli script, mai letto dall'app.

## Come riprodurre

```sh
node webapp/build.mjs
node --test test/webapp-standalone.test.mjs   # autotest dell'app a 3 risoluzioni (Chromium)
node webapp/audit/gate.mjs                    # DEMO: calcolatori, conto, limiti, backtest, accessibilità (JSON)
node webapp/audit/real.mjs                    # REAL: server locale + PostgreSQL 17 usa-e-getta, schema temporaneo
```

Variabili:
- `MATCHPILOT_E2E_CHROME`: percorso di Chromium.
- `FUTPYTHON_TEST_DATABASE_URL`: solo un'istanza locale usa-e-getta.

Gli script terminano con codice 0 solo se ogni verifica passa. Fanno eccezione i finding lasciati aperti di proposito, che compaiono come `OPEN`.

## Esiti dell'ultima esecuzione

| Prova | Esito |
|---|---|
| `test/webapp-standalone.test.mjs` | PASS: 30 scenari, 1366/820/390 px, nessun errore in console |
| `gate.mjs` (DEMO) | 54/54 PASS |
| `real.mjs` (REAL) | 9/9 PASS; ARCH-CSP `OPEN` |

## Finding risolti

| Finding | Correzione | Verifica |
|---|---|---|
| F-02 | L'evidenza distingue ACTUATED da ASSERTED. CTL-COV-RUN non si autocertifica. CERTIFIED MOCK/REAL restano a 0. | test standalone |
| F-04, F-05 | Con login obbligatorio, o con 401, si va a `/login?next=…`. Nessun ripiego silenzioso su DEMO. | REAL-03, REAL-06 |
| F-06 | Il filtro campionati è separato tra REAL e DEMO. | REAL-02, T-NAV-05 |
| F-07, F-08 | All'apertura valgono i tetti del profilo MM e i limiti delle Impostazioni: puntata min/max, responsabilità, posizioni aperte, perdita giornaliera. Il fuso orario è applicato; l'exchange è mostrato. | FIN-MM-ENFORCE, FIN-SET-ENFORCE, T-PAPER-02 |
| F-10 | Selettore PIT/NON_PIT (REAL) ed etichetta PIT/NON_PIT su ogni risultato di backtest. | REAL-08 |
| F-11 | La ricerca REAL segue `next_cursor` fino a 10 pagine; se tronca, lo dichiara. | REAL-07 |
| F-12, F-23 | L'azzeramento aggiunge una riga RESET (append-only). La quadratura confronta il registro con le posizioni regolate, calcolate in modo indipendente. | FIN-LEDGER-APPEND, FIN-RECON, T-PAPER-02 |
| F-13 | Commissione fissata all'apertura; arrotondamento HALF_EVEN come `src/math/money.mjs`. | FIN-COMM-SNAP, FIN-SETTLE-02 |
| F-14 | Fuori da ACTIVE_OPERATIONAL la copertura è ammessa solo se riduce l'esposizione (DEC-001). | FIN-STOP-01, T-PAPER-02 |
| F-15, F-16 | L'import senza condizioni resta senza condizioni. Uno slug già usato da un altro nome riceve una chiave propria. | B-STRAT-IMPORT, T-STRAT-02 |
| F-17 | Il cashout teorico compare solo con copertura totale. | T-TOOLS-01 |
| F-18 | Gli xG sintetici sono sempre etichettati «xG DEMO». | T-MATCHES-01 |
| F-20, F-21, F-22 | Link «Salta al contenuto», fuoco sul contenuto, separatore delle migliaia, messaggi di minimo esclusivo. | A11Y-02, A11Y-05, T-NAV-04 |
| F-25 | Money Management in REAL è etichettato «REAL + DEMO» (provenienza mista). | ispezione |

## Finding aperti (requisiti dell'integrazione nel sito ufficiale)

| Finding | Stato |
|---|---|
| **ARCH-CSP** | **NON RISOLTO.** Il file unico usa script e stili inline: con la CSP del sito (`script-src`/`style-src` `'self'`) non parte. L'integrazione in `src/web` deve servirlo come file separati, senza inline e senza allentare la CSP. |
| F-01 (P0) | Secondo frontend parallelo, con build e risorse inline. Va portato in `src/web` come moduli e file statici (#239 Q9). Coincide con ARCH-CSP. |
| F-03 (P1) | Il branch modifica `src/web/app.js`, `index.html` e `package.json`, già toccati dalla PR #240 su `main`. Serve riallineare il branch a `main` e aggiungere `data-control` e le voci in `docs/qa/control-inventory.json`. Non fatto: questo mandato vieta merge e modifiche a `main`. |
| F-09 (P1) | Le viste chiamano direttamente i motori DEMO (`demoDay`, `ledgerLoad`, `lib`, `mmEvaluate`…). Servono interfacce di dominio, provider DEMO e REAL e test di contratto condivisi. |
| F-19 (P2) | **Parziale.** `gate.mjs` e `real.mjs` sono test esterni con oracoli indipendenti, ma non sono collegati al gate ufficiale. Il test standalone riscrive ancora `dist` e usa l'autotest. Gli scenari vanno portati nei journey della Browser QA. |
| F-24 (P3) | **Parziale.** Il codice morto di `lib` è rimosso. Restano gli hook di test nel bundle, l'orologio DEMO persistente e la mancanza di una versione dello schema in localStorage. |
