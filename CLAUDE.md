# CLAUDE.md — MatchPilot Trading OS

Leggere README.md prima di qualsiasi modifica.

## Contratto

MatchPilot è una piattaforma web di trading sportivo.

Fonti:
- FutPythonTrader: storico/statistiche/pre-match.
- TotalCorner: mercato pre-match e feed live.

### Regole obbligatorie

- Mostrare e normalizzare tutti i campi FutPythonTrader realmente disponibili.
- Separare PREMATCH e LIVE in modo verificabile.
- Vietato usare dati successivi al kickoff per generare analisi pre-match.
- Ogni metrica deve avere provenance e coverage.
- Nessun valore inventato o fallback numerico silenzioso.
- Nessuna dipendenza funzionale da GOAT.
- Nessuna modifica a questo contratto senza autorizzazione esplicita dell'owner.
- Una PR alla volta salvo autorizzazione esplicita.
- Ogni PR deve includere test pertinenti e criteri di accettazione.
- Non effettuare trade reali, puntate o modifiche a conti esterni durante test di sviluppo.

## Priorità

1. Data contracts e ingestion.
2. Normalizzazione completa FutPythonTrader.
3. Normalizzazione TotalCorner pre-match/live.
4. Persistenza temporale immutabile.
5. Daily Board.
6. Match Center con tutte le card.
7. Models/fair odds.
8. Trading Opportunity Engine.
9. Backtest/replay.
10. Journal, risk e execution.
