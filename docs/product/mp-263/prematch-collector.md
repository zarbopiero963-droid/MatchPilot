# Collector PREMATCH API-FOOTBALL (MP-AF-COLLECT-01, MP-NEXT-20261102 punto E)

`src/providers/apifootball/prematch-collector.mjs` raccoglie le quote PREMATCH con il client API-FOOTBALL (MP-AF-01), il ledger PostgreSQL delle richieste e lo store degli snapshot (schema 031: oggi in `db/staged/`, la PR #282 lo porta in `migrations/`).

**Stato: IMPLEMENTATO e TESTATO con fake. Non ATTIVO.**
- È spento per default.
- Non ha uno scheduler: nessuna route, nessun job e nessun timer di MatchPilot lo importa, e un test lo verifica.
- Non ha mai fatto una chiamata reale.

Per accenderlo servono tre cose, tutte decise dall'owner:
1. il GO delle migrazioni 031 (PR #282) e 033 (risposte grezze, MP-AF-RAW-01);
2. le variabili d'ambiente qui sotto;
3. uno scheduler che oggi non esiste.

## Un ciclo (`runOnce()`)
1. **Scoperta delle partite.** Una richiesta `/fixtures` per ogni coppia lega:stagione configurata, con `status=NS` e la finestra di giorni UTC da adesso ad adesso più il lead.
   - Restano solo le partite non iniziate (NS) con calcio d'inizio noto, che cade tra adesso + margine e adesso + lead.
   - Le altre si scartano con un motivo esplicito: TBD, PST o in corso, calcio d'inizio ignoto, fuori finestra.
2. **Quote.** Una richiesta `/odds?fixture=ID` per ogni partita, a partire da quella col calcio d'inizio più vicino, con al massimo `maxPages` pagine. Prima di ogni richiesta il collector:
   - ricontrolla che manchi più del margine al calcio d'inizio;
   - legge dal ledger se la stessa richiesta è già stata fatta nell'intervallo minimo. Il dato sta sul ledger, quindi un riavvio non lo azzera.
3. **Snapshot.** Usa `oddsSnapshotsFromResult`. Il tempo di acquisizione è il `fetched_at` del client e una risposta dalla cache viene rifiutata. Il salvataggio usa `saveOddsSnapshots` su una connessione dedicata.

Qualsiasi riga acquisita al calcio d'inizio o dopo viene rifiutata due volte: dal codice e dal database.

## Arresti sicuri (il ciclo si ferma e riporta il motivo)

| Motivo | Quando |
|---|---|
| `COLLECTOR_BUDGET_DAY` / `COLLECTOR_BUDGET_MINUTE` | budget proprio del collector esaurito. È contato sul ledger con `purpose = prematch-collector`: le altre finalità non lo consumano. |
| `MAX_CALLS_PER_RUN` | tetto di chiamate per ciclo |
| `BUDGET_DAY` / `BUDGET_MINUTE` | budget del client esaurito: vale per tutte le finalità |
| `PROVIDER_QUOTA` / `RATE_LIMITED` | contatore del provider a zero oppure HTTP 429 |
| `LEDGER_UNAVAILABLE` / `SNAPSHOTS_UNAVAILABLE` / `STORE_FAILED` | ledger o schema non disponibili, in scrittura dal client o in lettura dal collector (budget, intervallo), oppure scrittura degli snapshot fallita |
| `CONSECUTIVE_FAILURES` | troppi errori di fila (errori del provider, HTTP, rete) |
| `DISABLED` | collector acceso ma client spento: nessuna chiamata |
| `ALREADY_RUNNING` | un ciclo è già in corso nel processo: il secondo viene rifiutato, non accodato |

## Configurazione (tutto esplicito, nessun valore di default che consumi quota)

| Variabile | Significato | Valore proposto, da approvare |
|---|---|---|
| `APIFOOTBALL_PREMATCH_COLLECTOR_ENABLED` | solo il testo esatto `true` lo accende | non impostata (spento) |
| `APIFOOTBALL_PREMATCH_LEAGUES` | coppie `lega:stagione`, da 1 a 50 | da scegliere |
| `APIFOOTBALL_PREMATCH_CALLS_PER_DAY` | budget giornaliero del collector | 900 |
| `APIFOOTBALL_PREMATCH_CALLS_PER_MINUTE` | budget al minuto del collector | da scegliere entro il limite del piano |
| `APIFOOTBALL_PREMATCH_MAX_CALLS_PER_RUN` | tetto per ciclo | da scegliere |
| `APIFOOTBALL_PREMATCH_LEAD_HOURS` | finestra in avanti | da scegliere |
| `APIFOOTBALL_PREMATCH_MIN_INTERVAL_MINUTES` | intervallo minimo tra due richieste della stessa partita (minimo 5) | da scegliere |
| `APIFOOTBALL_PREMATCH_KICKOFF_MARGIN_MINUTES` | nessuna richiesta a meno di N minuti dal calcio d'inizio (default 5) | 5 |
| `APIFOOTBALL_PREMATCH_MAX_PAGES` | pagine `/odds` per partita (default 1). Una troncatura viene riportata. | 1 |
| `APIFOOTBALL_PREMATCH_MAX_FAILURES` | errori di fila prima dell'arresto (default 3) | 3 |

Il client ha budget propri: `APIFOOTBALL_REQUESTS_PER_DAY` e `APIFOOTBALL_REQUESTS_PER_MINUTE`. Il collector resta dentro entrambi i livelli.

La proposta di budget del mandato (1 500 al giorno: 900 PREMATCH, 400 LIVE e benchmark, 200 controlli e margine) **non è attivata**. La scadenza del piano Pro (25/11/2026) **non è verificata**: serve una chiamata `/status`, non autorizzata.

## Limiti noti
- **Risposta grezza (review Codex P1, MP-AF-RAW-01, migrazione MANUAL 033).**
  - **Salvataggio prima della normalizzazione.** Ogni risposta `/odds` passa a `saveRawResponse` (`store.mjs`) e si salva in `af_raw_responses`, che è append-only. Il salvataggio contiene:
    - il corpo HTTP identico al byte, con `get`, `parameters`, `errors`, `paging`, `response` e i campi sconosciuti;
    - il suo SHA-256, ricontrollato dal database;
    - `request_id` del ledger, path, parametri e purpose;
    - `requested_at` e `received_at` di MatchPilot e l'header `Date` del provider verbatim;
    - lo status HTTP e la quota.
  - **Obbligatorio.** Senza `saveRawResponse`, o se il salvataggio non restituisce un `raw_id`, il ciclo si ferma con `RAW_STORE_FAILED` e non normalizza nulla.
  - **Collegamento.** Ogni nuovo snapshot porta `raw_id`, e il database rifiuta uno snapshot nuovo senza risposta grezza coerente.
  - **Errori del provider.** Anche le risposte con `errors` si salvano, come `provider_error`, e non vengono mai normalizzate.
  - **Recovery dopo un crash.** Si fa con `recoverRawOdds`.
  - **Dettagli:** dipendenza dalla 031, lock, crescita del disco, rollback e test PG17/PG18 sono in [`evidence/af-raw-responses.md`](evidence/af-raw-responses.md).
  - **Prima dell'accensione:** serve il GO owner sulle migrazioni 031 e 033.
- **Pagine.** Il margine del calcio d'inizio viene ricontrollato prima di ogni pagina; altrimenti l'esito è `pages_stopped_kickoff_too_close`.
- **Retry del client.** Dopo un 5xx, un errore di rete, un timeout o un 429 con Retry-After, il client ripete la richiesta una volta con la stessa finalità. Il secondo tentativo è controllato solo dal budget del client, non da quello del collector. Il budget giornaliero o al minuto del collector può quindi essere superato di **al massimo una chiamata**; la chiamata successiva vede la riga in più e ferma il ciclo. `MAX_CALLS_PER_RUN` conta le richieste logiche, quindi in un ciclo le richieste HTTP reali possono arrivare al doppio nel caso peggiore. Nel dimensionare i budget va tenuto questo margine.
- Client e collector devono usare **lo stesso ledger**: è un requisito di cablaggio per lo scheduler futuro.
- `request_id` degli snapshot: con il ledger PostgreSQL il client restituisce l'id della riga del ledger (`result.request_id`) e gli snapshot lo portano. Il ledger in memoria non lo restituisce, quindi lo store grezzo PostgreSQL rifiuta quella risposta: client, collector e store devono usare lo stesso ledger PostgreSQL.
- La scoperta usa una richiesta `/fixtures` per lega a ogni ciclo, con cache del client di 60 s, ed entra nel budget del collector.
- Il blocco `ALREADY_RUNNING` vale nel singolo processo. Con più processi servirebbe un lock nel database; lo scheduler, ancora da decidere, deve garantire un solo esecutore.
- Ritenzione: le tabelle sono append-only. Vedi `migration-031-preflight.md`: decisione owner prima dell'accensione.
