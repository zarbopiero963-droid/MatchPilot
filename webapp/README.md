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
Per ogni controllo registra l’evidenza NONE → SEEN → ACTUATED → ASSERTED (azione seguita da una verifica riuscita). Il file non dichiara mai CERTIFIED MOCK né CERTIFIED REAL: la certificazione spetta alla Browser QA indipendente dell’app servita dal sito. Da un file locale restano BLOCKED i 6 controlli che esistono solo con il server: REAL, conto del server (2), accedi, esci, selettore PIT/NON_PIT.
Gli xG generati nel browser sono sempre etichettati «xG DEMO».

## Sviluppo

- Sorgenti in `src/`; `node webapp/build.mjs` rigenera `dist/matchpilot-webapp.html`.
- Test: `node --test test/webapp-standalone.test.mjs` (Chromium reale; desktop, tablet e mobile; autotest completo).
- Audit indipendente riproducibile: `node webapp/audit/gate.mjs` (DEMO) e `node webapp/audit/real.mjs` (REAL, PostgreSQL locale). Esiti e finding in [`audit/README.md`](audit/README.md).

## Prototipo, non integrazione

Questo file è un prototipo conservato su branch, non il sito ufficiale. L’integrazione in `src/web` spetta alla sessione UI ufficiale (roadmap, PR, Gate A/B). Requisito aperto: **ARCH-CSP non risolto**. Il file usa script e stili inline e non gira con la CSP del sito (`script-src`/`style-src` `'self'`). L’integrazione deve servirlo come file separati.
