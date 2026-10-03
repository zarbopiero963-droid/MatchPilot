# MatchPilot

Servizio Node.js privato di acquisizione e collaudo GOAT LayScore. Stato verificato il 3 ottobre 2026: il pannello operativo, la generazione delle analisi OpenRouter e il monitoraggio continuo delle partite non sono ancora implementati.

## Contratto autorizzato da Piero

Si lavora esclusivamente sui **49 campionati presenti in Statistiche Lega**, congelati in [data/approved-leagues.json](data/approved-leagues.json). Aggiunte, rimozioni e modifiche del contratto richiedono autorizzazione esplicita di Piero. [AGENTS.md](AGENTS.md) e [CLAUDE.md](CLAUDE.md) applicano questo vincolo agli agenti.

Le nazioni/regioni contengono campionati; i campionati contengono squadre e appartenenze osservate per stagione e gruppo. EUROPE è una regione, non una nazione. UEFA Nations League non è nella lista autorizzata, anche se compare nella Dashboard.

Le squadre si acquisiscono attraverso **Dashboard → Dettaglio → Classifica**, visitando tutti i gruppi esposti e leggendo tutte le righe, anche fuori dal viewport. Stats+ e H2H non costituiscono un elenco completo delle squadre. Nomi diversi tra Classifica, Dashboard e Asian Odds richiedono alias verificati: nessuna fusione automatica per somiglianza. Data e ora originali devono essere conservate; uno scarto di due ore non prova da solo un fuso.

## Codice e avvio

Node.js >=22, moduli ESM, PostgreSQL tramite pg, browser Playwright già previsto dal deployment. `npm start` avvia `server.mjs`; `npm run check` verifica la sintassi dei moduli esistenti e `npm test` esegue i test di parser, stato e finanza. Per il catalogo: `node --check source-catalog.mjs && node --test source-catalog.test.mjs`.

Il postinstall del repository prepara Chromium per Playwright. Il collaudo usa l'harness browser su Render; non installare browser aggiuntivi per aggirare l'ambiente.

- `server.mjs`: HTTP, autenticazione Basic della pagina privata, controllo configurazione, connessione PostgreSQL e verifica configurazione OpenRouter.
- `source-login.mjs`: login reale e acquisizioni/QA; con SOURCE_LOGIN_TEST=once viene eseguito all'avvio. È un harness operativo: leggere run ID e scenario prima di rilanciarlo.
- `source-parser.mjs`, `source-state.mjs`, `source-finance.mjs`: parsing e modelli già coperti dai rispettivi test.
- `source-catalog.mjs`: estrazione del catalogo e classifiche, controllo del contratto, persistenza transazionale e quarantena. Il comando `node catalog-sync.mjs <run-id>` importa gli snapshot di un run browser completato; i run del catalogo importano gli snapshot al termine e una sincronizzazione giornaliera prosegue la copertura. Questo ciclo non è il monitoraggio Live ogni minuto.
- `migrations/001-catalog.sql`: schema incrementale del catalogo; nessuna cancellazione di dati esistenti.

`GET /healthz` è pubblico; `GET /` è protetto e presenta lo stato di configurazione. Non esiste ancora un endpoint operativo per navigare partite/storico.

Configurare i segreti nell'ambiente: APP_USERNAME, APP_PASSWORD, DATABASE_URL e le variabili della sorgente/OpenRouter richieste dal codice. Non pubblicare valori, cookie o token. La presenza di una chiave OpenRouter e la verifica del modello non equivalgono alla generazione di un'analisi.

Render: matchpilot-test, servizio srv-davpi23ncjis73f9dkbg. Neon: damp-pond-29296680. render.yaml descrive un piano free; il servizio effettivo è stato aggiornato separatamente: non applicare il blueprint per retrocedere il piano.

## Database e sincronizzazione

`matchpilot_test_runs` conserva esiti; `matchpilot_source_snapshots` conserva prove grezze. Il nuovo schema usa mp_catalog_contract, mp_territories, mp_leagues, mp_league_aliases, mp_teams, mp_team_memberships, mp_roster_observations e mp_catalog_quarantine. La vista mp_catalog_coverage distingue campionati non acquisiti da osservazioni parziali.

Sequenza: inizializzare schema; confrontare i 49 campionati reali con il contratto; salvare solo classifiche associate senza ambiguità a un campionato autorizzato; conservare snapshot, partita, gruppo e stagione. Se la stagione non è esposta, usare unknown e non inventarla. Importazioni ripetute sono idempotenti. Cambiamenti della lista o nomi non risolti restano fuori dall'operatività e vengono segnalati.

Il run v112 ha letto realmente 49 campionati e 11 classifiche per 7 campionati, compresi i quattro gruppi Argentina e i due Colombia: 152 squadre distinte osservate per campionato. Questo **non certifica le rose di tutti i 49 campionati**: servono le successive classifiche disponibili, tutti i gruppi, la validazione degli alias e l'integrazione del ciclo automatico. Anche una classifica completa oggi non garantisce aggiornamenti futuri o trasferimenti.

## Verifica e lavori residui

I test del catalogo usano fixture estratte dai due snapshot reali del 3 ottobre, con casi negativi separati. Conservare fallimenti e prove; non dichiarare certificati percorsi vuoti. La issue #2 resta di competenza dell'owner per la chiusura. I test esclusi dall'owner (importazione valida, mobile/audio/radar popolati, equity e Ladder Dutching) restano sospesi.

Da costruire: pannello MatchPilot, storico giornate e timeline, bankroll/movimenti operativi, analisi OpenRouter, monitoraggio ogni minuto con recupero, collaudo di una partita completa e lettura dello storico il giorno dopo. La mappatura del catalogo precede questi sviluppi e non li sostituisce.
