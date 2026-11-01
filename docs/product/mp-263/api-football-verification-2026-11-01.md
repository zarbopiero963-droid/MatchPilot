# API-FOOTBALL: verifica reale del 01/11/2026 (MP-AF-02b)

Sessione unica di verifica, 15:10–15:15 UTC, autorizzata dall'owner con un budget massimo di 25 chiamate.
- **Strumenti usati:** connettore MCP `Football_Consensus_Browser`, strumenti `apifootball_*`.
- **Nessuna modifica** a credenziali, rete o infrastruttura.
- **Nessun** upgrade, polling o tentativo ripetuto.
- Il rapporto originale è sulla issue #263.

Questo documento registra cosa è stato osservato. **Non certifica** una copertura completa: il campione è di 20 chiamate su 2 campionati.

## Chiamate e quota

**Chiamate effettive: 20 su 25.** Il conteggio è prudente: include la chiamata `live=all` respinta dal connettore e le due chiamate `status`.

**Strumenti locali.** `apifootball_health` e `apifootball_quota_report` dichiarano `network_calls_made: 0`. Riportano i limiti configurati nel connettore (80 al giorno, 8 al minuto, concorrenza 1), non la quota del provider.

**Piano del provider.** Pro, attivo fino al 25/11/2026. Limite di 7500 chiamate al giorno, circa 300 al minuto.

**Contatori non affidabili.** I contatori del provider sono condivisi con altri client:
- la quota giornaliera residua è scesa anche di 5 durante una sola chiamata ed è anche risalita;
- tra le due `status`, `requests.current` passa da 3 a 16 (+13) a fronte di 18 chiamate.

Il contatore quindi non basta per una contabilità precisa. Per questo serve un registro delle richieste locale, sul modello di `fpt_request_ledger`, e non è stato possibile stabilire se `status` consumi quota.

## Endpoint testati

| # | Endpoint | Parametri | Osservato |
|---|---|---|---|
| 1, 20 | `/status` | — | piano, scadenza, contatori |
| 2 | `/leagues` | id=39, current | Premier League 2026: tutte le coperture attive, quote comprese |
| 3 | `/fixtures` | league=39, date | partita NS con orario, timestamp, arbitro, stadio, giornata |
| 4 | `/fixtures` | league=39, last=2 | due partite FT; `periods.first/second` restano null anche a partita finita |
| 5 | `/fixtures/statistics` | partita FT | 17 tipi per squadra (vedi sotto); valori come testo (`"1.87"`, `"45%"`) o come numero intero |
| 6 | `/fixtures/events` | partita FT | 18 eventi (gol, rigore sbagliato, VAR, cartellini, cambi) con minuto ed eventuale recupero, senza orario assoluto; attribuzione dell'autogol ambigua |
| 7 | `/odds` | partita NS, bookmaker 8 | 104 mercati, 1777 selezioni per un solo bookmaker; linee e giocatori codificati nel testo della selezione |
| 8 | `/odds` | partita NS, bet 1 | 10 bookmaker sull'1X2; un solo `update` per partita |
| 9 | `/odds` | partita FT del giorno prima, bet 1 | quote ancora disponibili; `update` 2 h 38 min prima del calcio d'inizio, quindi non una quota di chiusura certa |
| 10 | `/fixtures` | live=all | respinta dal connettore: `PROVIDER_RESPONSE_TOO_LARGE` |
| 11 | `/fixtures` | league=135, date | partite live; `winner` valorizzato durante la partita (valore provvisorio) |
| 12 | `/fixtures/statistics` | partita LIVE al 54' | stessi 17 tipi in tempo reale, xG compresi; nessun timestamp del provider |
| 13 | `/odds/live` | partita LIVE | 47 mercati, 570 selezioni (156 sospese); campi strutturati `handicap`, `main`, `suspended`; stato `stopped` e `blocked`; minuto e secondi; `update`; nessun bookmaker indicato; id di mercato diversi dal prematch |
| 14 | `/fixtures/events` | partita LIVE | eventi in tempo reale con il minuto |
| 15 | `/fixtures/lineups` | partita NS a −76 minuti | risposta vuota: le formazioni escono più tardi |
| 16 | `/predictions` | partita NS | statistiche aggregate pre-partita: forma, ultime 5, gol per fascia di minuti, Over/Under, clean sheet, cartellini per minuto, moduli, confronto, Poisson, 10 precedenti |
| 17 | `/leagues` | id=39, tutte le stagioni | stagioni 2010–2026; statistiche di partita dal 2014, infortuni dal 2020; `odds: false` per tutte le stagioni passate |
| 18 | `/leagues` | country=Italy, current | 31 competizioni; statistiche di partita solo per Serie A, Serie B e Coppa Italia; Serie C e D con eventi, formazioni e quote |
| 19 | `/odds/bookmakers` | — | 33 bookmaker, uno senza nome |

**Tipi di statistica osservati**, gli stessi post-partita e LIVE:
- `expected_goals`;
- `Shots on Goal`, `Shots off Goal`, `Total Shots`, `Blocked Shots`, `Shots insidebox`, `Shots outsidebox`;
- `Fouls`, `Corner Kicks`, `Offsides`, `Ball Possession`;
- `Yellow Cards`, `Red Cards`;
- `Goalkeeper Saves`;
- `Total passes`, `Passes accurate`.

La percentuale dei passaggi riusciti non c'è.

## Verificato e solo documentato

**Verificato su questo campione:**
- piano e limiti;
- partite pre-partita e LIVE;
- statistiche post-partita e LIVE;
- eventi;
- quote pre-partita, con molti mercati e 10 bookmaker;
- quote LIVE;
- storico recente delle quote;
- flag di copertura per stagione e competizione;
- pronostici e statistiche aggregate.

**Non verificato**, quindi solo documentato o dichiarato dai flag:
- formazioni, infortuni, statistiche dei giocatori;
- classifiche, trasferimenti;
- quote di altri campionati;
- profondità reale dello storico delle partite;
- frequenza di aggiornamento delle quote.

## Impatto su MatchPilot

1. **Tempi (PIT).** Statistiche ed eventi non hanno un timestamp del provider, e le quote hanno un solo `update` per partita. La disponibilità di un dato è quindi l'ora di acquisizione di MatchPilot, registrata con snapshot e deduplica secondo la policy `mp-pit-v1`. Vanno trattati come dati temporizzati anche:
   - `winner` durante la partita;
   - le formazioni, che escono tardi.
2. **Storico delle quote.** Il provider dichiara di non avere quote per le stagioni passate. Di conseguenza:
   - l'archivio FPT congelato resta la sola fonte storica delle quote per i backtest;
   - da qui in avanti MatchPilot deve salvare da sé gli snapshot delle quote.

   È il gap principale.
3. **Mercati.** Il prematch ha id di mercato e di bookmaker stabili, ma linea e selezione sono scritte nel testo. Serve quindi un parser `market_ref` con una tabella esplicita: ciò che non viene riconosciuto resta UNCLASSIFIED. Il LIVE ha un campo `handicap` strutturato ma id diversi dal prematch, e richiede una mappatura esplicita.
4. **Copertura disomogenea.** I flag `coverage` per stagione e competizione sono la base naturale del catalogo delle capacità (MP-CAP-01).
5. **Quota condivisa.** 7500 chiamate al giorno bastano per un collector mirato. Però la chiave è condivisa con altri client, quindi servono un budget dedicato e un registro delle richieste.
6. **Formati.** Numeri e percentuali arrivano come testo: il catalogo deve dichiararne normalizzazione e unità.

## Raccomandazione

1. **MP-AF-01 (MANUAL):** client in sola lettura con registro delle richieste e budget dedicato, spento di default.
2. **MP-CAP-01b e MP-CAP-02 (MANUAL):** catalogo costruito dai flag `coverage`, parser dei mercati pre-partita e mappa tra mercati LIVE e pre-partita.
3. **Collector pre-partita (MANUAL, poi GO operativo):** snapshot delle quote con ora di acquisizione, per costruire lo storico; partite, statistiche e pronostici. Il LIVE viene dopo, con frequenza dichiarata.
4. **Archivio FPT:** si conserva come fonte storica delle quote; la dismissione operativa resta.
5. **Benchmark TotalCorner:** API-FOOTBALL fornisce davvero quote e statistiche LIVE. Il confronto quantitativo resta da fare su partite parallele; il verdetto attuale è INSUFFICIENT EVIDENCE.
