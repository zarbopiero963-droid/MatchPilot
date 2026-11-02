# Collector PREMATCH API-FOOTBALL (MP-AF-COLLECT-01, MP-NEXT-20261102 punto E)

`src/providers/apifootball/prematch-collector.mjs` raccoglie le quote PREMATCH con il client API-FOOTBALL (MP-AF-01), il ledger PostgreSQL delle richieste e lo store degli snapshot (migrazione 031, PR #282).

**Stato: IMPLEMENTATO e TESTATO con fake. Non ATTIVO.**
- È spento per default.
- Non ha uno scheduler: nessuna route, nessun job e nessun timer di MatchPilot lo importa, e un test lo verifica.
- Non ha mai fatto una chiamata reale.

Per accenderlo servono tre cose, tutte decise dall'owner:
1. il GO della migrazione 031;
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
| `LEDGER_UNAVAILABLE` / `SNAPSHOTS_UNAVAILABLE` / `STORE_FAILED` | ledger o schema non disponibili, oppure scrittura fallita |
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
- `request_id` degli snapshot resta nullo: il client non restituisce l'id della riga del ledger. Il legame si ricostruisce con `acquired_at` e il percorso. La colonna ammette il nullo (migrazione 031).
- La scoperta usa una richiesta `/fixtures` per lega a ogni ciclo, con cache del client di 60 s, ed entra nel budget del collector.
- Il blocco `ALREADY_RUNNING` vale nel singolo processo. Con più processi servirebbe un lock nel database; lo scheduler, ancora da decidere, deve garantire un solo esecutore.
- Ritenzione: le tabelle sono append-only. Vedi `migration-031-preflight.md`: decisione owner prima dell'accensione.
