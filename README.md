# MatchPilot — Sports Trading OS

MatchPilot è una piattaforma web di **trading sportivo decisionale**, non un semplice sito di pronostici.

## Obiettivo

Per ogni partita il prodotto deve raccogliere, normalizzare e mostrare in card **tutte le informazioni realmente disponibili da FutPythonTrader**, combinarle con i mercati pre-match di TotalCorner e, dopo il calcio d'inizio, usare TotalCorner come feed live per validare opportunità di trading.

Il flusso prodotto è:

**PRE-MATCH → LIVE VALIDATION → ENTRY → MANAGEMENT → EXIT → POST-MORTEM**

## Fonti dati

### FutPythonTrader — motore statistico/pre-match
Usare ogni campo disponibile e con copertura reale. Le famiglie includono, quando presenti:

- risultati e forma;
- gol fatti/subiti;
- 1X2, Over/Under, BTTS, Double Chance, Correct Score;
- xG, xGA, xGOT, xA;
- tiri totali, in porta, fuori, bloccati;
- tiri dentro/fuori area e legni;
- big chances;
- possesso;
- pass accuracy, long-pass accuracy, final-third passing, through passes, crosses;
- touches in box;
- corner;
- falli, cartellini, fuorigioco, punizioni;
- tackle, duelli, clearances, interceptions;
- saves, errors leading to shot/goal, goals prevented;
- split HT e 2T;
- minuti dei gol;
- storico quote;
- ogni ulteriore campo futuro restituito dall'API.

**Regola:** un campo disponibile non deve essere nascosto dal modello dati. Se non è ancora visualizzato, resta comunque normalizzato e interrogabile.

### TotalCorner — mercato pre-match + live
Prima del kickoff:

- opening e pre-match 1X2;
- Asian Handicap;
- Goal Line;
- Corner Line;
- storico movimenti quota precedente al kickoff.

Dopo il kickoff:

- score e stato;
- events;
- attacks;
- dangerous attacks;
- shots on/off target;
- possession;
- corners e cards;
- 1X2 live;
- Asian / Goal / Corner lines;
- storico movimenti in-play.

## Separazione temporale obbligatoria

Il motore pre-match **non può leggere o derivare** alcuna informazione successiva al kickoff.

Ogni record deve avere:
- provider timestamp;
- acquisition timestamp UTC;
- match id provider;
- fase: PREMATCH o LIVE;
- provenance;
- versione parser/schema.

Un'analisi pre-match deve poter essere ricostruita usando esclusivamente snapshot anteriori al kickoff.

## Web app

### Home / Daily Board
Card per tutte le partite disponibili con:
- squadre, campionato, orario;
- probabilità 1X2 modello;
- fair odds;
- O1.5 / O2.5 / BTTS;
- expected goals;
- market movement;
- trading profile;
- numero di strategie live candidate;
- qualità/copertura dati.

### Match Center
La pagina partita deve mostrare card separate e confrontabili Home/Away:

1. Overview
2. Forma 5/10/20
3. Casa vs trasferta
4. xG / xGA / xGOT / xA
5. Tiri e qualità occasioni
6. Creazione offensiva
7. Possesso e costruzione
8. Difesa
9. Disciplina
10. Corner
11. Primo tempo
12. Secondo tempo
13. Timing gol
14. Score distribution
15. H2H
16. Mercati storici
17. Similar Odds
18. Strengths / Weaknesses
19. Model Output
20. Trading Candidates
21. Data Coverage
22. Market Movement
23. Live State (solo dopo kickoff)
24. Trading Opportunities
25. Trade Journal / Post-mortem

Le card devono mostrare sempre anche **coverage N** e provenienza.

## Trading Opportunity Engine

MatchPilot non deve limitarsi a "pronostico sì/no". Ogni opportunità deve descrivere:

- mercato/strategia;
- direzione BACK/LAY;
- confidence;
- entry window;
- quota corrente;
- fair price;
- edge;
- contesto pre-match;
- conferme live;
- invalidation conditions;
- stake/risk suggestion;
- exit target;
- stop;
- evidenze usate.

Esempio concettuale:

```text
LAY 1-0
Confidence: 78/100
Entry window: 68'-76'
Current odds: 8.40
Fair lay odds: 6.90
Edge: +17.8%
Pressure: HIGH
Pre-match vulnerability: HIGH
Stop: 82' or momentum reversal
```

## Strategie

Le strategie devono essere configurabili e backtestabili. Non esiste un limite artificiale di 5 strategie.

Esempi:
- Lay Score;
- Lay Draw;
- Lay Favourite;
- Back Over;
- Goal after pressure;
- Next Goal;
- score vulnerability;
- market/model divergence;
- strategie custom create dall'utente.

Ogni strategia deve avere versione, regole, parametri, campione, risultati, ROI, drawdown e intervallo di confidenza.

## Principi non negoziabili

1. Nessun dato live nel pre-match.
2. Nessuna probabilità inventata se manca il dato.
3. Coverage sempre visibile.
4. Modello e mercato sono segnali distinti.
5. Un movimento quota non è automaticamente un edge.
6. NO TRADE è un risultato valido.
7. Ogni trade deve essere riproducibile da snapshot immutabili.
8. Nessuna strategia viene dichiarata profittevole senza backtest out-of-sample.
9. Tutti i dati FutPythonTrader disponibili devono poter essere ispezionati.
10. GOAT non è una dipendenza del prodotto.

## Stato

Il progetto precedente è stato archiviato nel branch:

`archive/pre-trading-os-reset-2026-10-04`

La branch `main` rappresenta esclusivamente il nuovo MatchPilot Sports Trading OS.


## Stato FutPythonTrader — certificazione

La chiusura definitiva della sorgente FutPythonTrader è governata dalla issue **#12 — FPT-CERT**.

Stato corrente: **IN CERTIFICAZIONE — non ancora CLOSED**.

La certificazione richiede, nell'ordine:

1. backfill storico completo e restartable;
2. classificazione di ogni dataset;
3. riconciliazione snapshot, versioni e match unici;
4. censimento completo delle colonne;
5. coverage per campo/dataset/lega/stagione;
6. audit delle stagioni mancanti;
7. due sync incrementali reali con verifica idempotenza;
8. certificazione Data Health/Watchdog/Telegram;
9. documento finale `docs/futpython-certification-YYYY-MM-DD.md`.

### FASE 1 — Backfill

La FASE 1 introduce:
- snapshot immutabile del catalogo usato dal run;
- backfill riprendibile senza riscaricare dataset terminali;
- conteggio `resumed_skips`;
- classificazione `available / unavailable_404 / error / deprecated`;
- riepilogo reale tramite `/api/futpython-certification`.

**Regola:** README viene aggiornato in ogni PR di certificazione. Una fase viene marcata completata solo dopo CI verde e test reali su Render/Neon.


### FASE 1 — evidenza reale e correzione resume

Il primo collaudo reale della FASE 1 ha rilevato che dataset già acquisiti prima dell'introduzione della colonna `availability` conservavano `availability=unknown` pur avendo uno snapshot valido.

Correzione prevista in questa PR:
- `unknown + last_snapshot_id` viene riconciliato a `available`;
- `error` resta ritentabile anche se esiste uno snapshot precedente;
- run lasciati `running` da un deploy/interruzione vengono chiusi come `partial/interrupted`;
- il backfill resta restartable e non duplica dataset terminali.

La FASE 1 resta **NON CERTIFICATA** fino al nuovo collaudo reale con `undefined_states=0`.


### FASE 1 — ottimizzazione persistenza reale

Il collaudo del backfill ha mostrato che la persistenza riga-per-riga verso Neon era corretta ma troppo lenta per una certificazione operativa ripetibile.

Questa PR sostituisce:
- upsert catalogo per singola riga;
- upsert schema per singolo campo;
- insert versione partita per singola riga;

con operazioni PostgreSQL batch tramite `jsonb_to_recordset`.

Il contratto dati non cambia:
- raw snapshot immutabile;
- payload completo JSONB;
- deduplica per hash;
- versioning partita;
- schema discovery dinamico.

La FASE 1 resta **NON CERTIFICATA** fino al completamento del backfill reale e alla riconciliazione finale.
