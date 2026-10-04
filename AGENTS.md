# AGENTS.md — Regole operative

## Prima di lavorare
1. Leggere README.md.
2. Leggere CLAUDE.md.
3. Leggere la issue master corrente.
4. Verificare branch, CI e stato delle dipendenze.

## Data integrity
- Conservare raw payload e normalized payload separatamente.
- Salvare provider timestamp e acquisition timestamp.
- Non contaminare PREMATCH con LIVE.
- Ogni trasformazione deve essere deterministica e testabile.
- Ogni campo sconosciuto va preservato nel raw payload e segnalato come schema discovery.

## UI
- Web responsive desktop/mobile.
- Daily Board a card.
- Match Center a card.
- Ogni card deve mostrare N/coverage.
- Le metriche non disponibili devono risultare "N/D", non 0.
- PREMATCH e LIVE devono essere visualmente distinti.

## Trading
- Nessun segnale senza evidenze associate.
- Nessun edge senza fair probability/fair price esplicita.
- NO TRADE deve essere supportato.
- Le strategie devono essere versionate e riproducibili.
- Backtest cronologico, senza leakage.

## Repository
- Una PR aperta alla volta.
- Niente codice esplorativo one-shot su main.
- Probe e forensic script devono stare in tools/ o essere rimossi dopo uso.
- Nessun secret in codice/log/test fixture.
- Test prima del merge.
