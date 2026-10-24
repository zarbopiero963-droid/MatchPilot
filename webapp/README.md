# MatchPilot Web App — file unico (MP-UI-ROADMAP-01)

`dist/matchpilot-webapp.html` è l’intera web app MatchPilot in un solo file HTML, senza risorse esterne (font inclusi, SIL OFL 1.1).
Si apre con un doppio clic. SaaS, billing, abbonamenti, multi-tenancy e ordini con denaro reale sono esclusi per decisione owner.

## Dati: REAL e DEMO

- **DEMO** (file aperto in locale): dati generati nel browser in modo deterministico, sempre etichettati DEMO. Il feed live segue l’orologio reale; l’«Orologio DEMO» in Diagnostica mostra una giornata di partite in diretta a qualsiasi ora.
- **REAL** (pagina servita dal server MatchPilot): palinsesto, partite, Match Center con esito dei mercati, strumenti di calcolo, Money Management, strategie, backtest e conto letti dall’API v1. Le funzioni senza API (live, replay, copilot, impostazioni account) mostrano NON DISPONIBILE.

## Pagine (12 fasi UI-01 → UI-12)

Dashboard, Calendario, Partite, Competizioni · Match Center · Live Board, Trading Copilot · Analysis Hub, Replay · Strategy Lab · Simulazioni e backtest · Paper trading, Money Management · Strumenti di trading · Impostazioni, Sessione e permessi, Diagnostica · Roadmap e copertura.

## Controlli e certificazione

Ogni controllo interattivo ha un identificativo stabile (`data-control`, elenco in `src/specs.js`); Diagnostica e i test rifiutano controlli senza identificativo o non dichiarati.
«Roadmap e copertura › Autotest» esegue nell’app 30 scenari con clic, input e verifica dei risultati.
L’esito è CERTIFIED MOCK, cioè verificato su dati DEMO, mai CERTIFIED REAL. Da un file locale restano BLOCKED i 5 controlli che esistono solo con il server: REAL, conto del server, accedi ed esci.

## Sviluppo

- Sorgenti in `src/`; `node webapp/build.mjs` rigenera `dist/matchpilot-webapp.html`.
- Test: `node --test test/webapp-standalone.test.mjs` (Chromium reale; desktop, tablet e mobile; autotest completo).
