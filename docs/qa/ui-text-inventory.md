# UI text inventory (MP-OWNER-UI-NO-RAW-TEXT-01)

Owner decision MP-OWNER-UI-NO-RAW-TEXT-01, requirement MP-WEB-015. This is the global audit of every text of the site: every page, component and state, on desktop and mobile. Sources: `src/web/index.html`, `src/web/app.js`, `src/coverage-page.mjs`, `src/auth/http.mjs`, read on `main` 3521a07, and the Browser QA screenshots of that commit.

**Classes:**
- **U:** useful to the user.
- **R:** redundant or superfluous.
- **T:** technical internal.
- **V:** necessary information that must be redesigned visually.

**Areas.** Every view declares its area on `main`:
- `data-area="user"`: the ordinary interface, where no T or R text may appear;
- `data-area="technical"`: the dedicated technical views, where provenance and diagnostics belong.

The Browser QA gate fails a user view, or the page footer, that shows technical text (`technicalText` in `tools/qa/browser-qa.mjs`, after every journey step, desktop and mobile).

**Done** means that the PR changed the text and that the test in the last column checks it.

## Shell and shared states

| ID | Current text (main 3521a07) | Where | Class | Action | PR | Verification |
|---|---|---|---|---|---|---|
| UI-01 | «Sito in sola lettura. I dati arrivano dall'API v1 di MatchPilot; nessun calcolo avviene nel browser.» | footer, every page | T | «MatchPilot · consultazione in sola lettura, nessuna operazione di trading.» | V-B1 | invariant on the footer, every step |
| UI-02 | «Caricamento la dashboard…», «Caricamento la Daily Board…» | loading state, every view | R | «Caricamento in corso…», what is loading in `data-what` | V-B1 | `web-e2e` loading state |
| UI-03 | «Impossibile caricare i dati (UNAVAILABLE). Dettaglio: data source unavailable.» | error state, every view | T | «I dati non sono disponibili in questo momento.» (network: «Connessione non disponibile…»); code in `data-code`, code and message in the tooltip | V-B1 | `web-e2e` error state (`data-code`, plain text) |
| UI-04 | «Impossibile caricare altri risultati (UNAVAILABLE — …). I risultati già mostrati restano validi.» | failed next page, Daily Board and Ricerca | T | «Non è stato possibile caricare altri risultati. Quelli già mostrati restano validi.», code in `data-code` | V-B1 | journey `search`, step «pagina successiva in errore» (invariant while the error is on screen) |
| UI-05 | «Fonte: futpythontrader · generato: 2026-10-19T… · versione codice: …» | provenance line under Daily Board and Ricerca | T | removed from user views; stays in the technical views, with the instant in Europe/Rome and UTC in the tooltip (D-7) | V-B1 | journey `daily-board`: no `p.meta` in `main`; invariant |
| UI-06 | menu «Dashboard · Daily Board · Ricerca · Fornitori dati · API · Copertura» | header | V | home «Oggi» = Daily Board (D-2); Fornitori dati, API, Copertura and the data-health Dashboard grouped in one technical area «Dati»; mobile navigation | V-B2 | journey `general-navigation` (menu labels), invariant extended to the header |
| UI-07 | «MatchPilot — Sports Trading OS» | page title | U | kept | — | — |
| UI-08 | «Questa pagina richiede JavaScript.» | `noscript` | U | kept | — | — |
| UI-09 | «Pagina non trovata» · «Questa sezione non esiste. Torna alla dashboard» | unknown route | U | kept; user area; the link follows the home page of V-B2 | V-B1 (area), V-B2 (link) | journey `general-navigation` |

## Daily Board (`#/board`, user view)

| ID | Current text (main 3521a07) | Where | Class | Action | PR | Verification |
|---|---|---|---|---|---|---|
| UI-10 | «Le partite di un giorno nei dati salvati, in ordine di orario, con campionato, quote, xG e stato dei dati. Orari come forniti dal fornitore.» | under the title | R, T | removed | V-B1 | invariant («dati salvati», «fornitore») |
| UI-11 | «PROVIDER_TZ_UNDOCUMENTED» (the V-B1 draft: «ora del fornitore») | pill next to the kickoff | T | removed; the time stays as the provider wrote it (D-7), with the tooltip «Orario indicato dalla fonte dei dati: il fuso orario non è specificato.»; the status in `data-tz` | V-B1 | journey `daily-board`: `data-tz` equals the API, tooltip present; invariant |
| UI-12 | «spain · laliga · 2024-2025» | competition on the card | T, V | slugs read as words, season as «2024/25» («Spain · Laliga · 2024/25»). Official names in Italian need display names from the API (competition registry #30): an API change, proposed separately, only if strictly necessary | V-B1 (words); follow-up | journey `daily-board` and `web-e2e`: competition text |
| UI-13 | «Risultato 2–1» · «Stato risultato FINAL» | card | R, T | score alone when final; «Non iniziata» or «Senza risultato» in place of the score otherwise; a missing score is N/D; the state in `data-result` | V-B1 | journey `daily-board`, step «partite senza risultato finale» |
| UI-14 | «Quote 1 · X · 2: 1,300 · 3,400 · 4,900» | card | V | three labelled boxes 1, X, 2 at exact precision (D-3) | V-B1 (V-B4: compact row of the mockup) | journey `daily-board`: every box equals the API |
| UI-15 | «Over 2,5 1,900» · «Entrambe segnano 1,800» | card | V | boxes «Over 2,5» and «Gol», tooltips «Più di 2,5 gol», «Entrambe le squadre segnano» | V-B1 | journey `daily-board` |
| UI-16 | «Favorito HOME 1,300» | card | T | «Favorito Casa 1,300»; side code in `data-code` | V-B1 | journey `daily-board`; invariant |
| UI-17 | «xG casa · ospite 1,900 · 1,600» | card | V | «xG 1,900 – 1,600» | V-B1 | journey `daily-board` |
| UI-18 | «Fase: HISTORICAL · dataset: spain/laliga/2024-2025» | card | T | removed; `data-phase` and `data-dataset` on the card | V-B1 | journey `daily-board`: attributes equal the API; invariant |
| UI-19 | «Partite del 2024-08-01» | day heading | T | «giovedì 1 agosto 2024», the ISO day in `datetime` | V-B1 | journey `daily-board` (`time[datetime]`) |
| UI-20 | «Nessuna partita il 2024-07-31 nei dati salvati. La Dashboard indica per ogni campionato l'ultimo giorno con dati. Apri la Dashboard» | empty day | T | «Nessuna partita mercoledì 31 luglio 2024. La copertura di ogni campionato è nella Dashboard.» | V-B1 | journey `daily-board`, step «giorno prima»; invariant |
| UI-21 | «Data non valida: "2024-02-30". Usa il formato AAAA-MM-GG.» | invalid date | T | «Data non valida: scegli un giorno dal calendario.» (found by the new invariant) | V-B1 | journey `daily-board`, step «data non valida» |
| UI-22 | «← Giorno prima · Giorno · Mostra · Giorno dopo → · Oggi» | controls | U, V | kept; day strip of the mockup | V-B4 | journey `daily-board` |
| UI-23 | «Carica altre partite» · «Fine dei risultati.» | list footer | U | kept | — | journey `daily-board` |

## Ricerca (`#/search`, user view)

| ID | Current text (main 3521a07) | Where | Class | Action | PR | Verification |
|---|---|---|---|---|---|---|
| UI-30 | «Filtri combinati sulle partite storiche salvate. Risultati in ordine di data, dal più recente, con paginazione stabile.» | under the title | R | removed | V-B1 | invariant |
| UI-31 | «Elenco dei campionati non disponibile: il filtro per campionato è disattivato.» | partial state | U | kept | — | — |
| UI-32 | field labels, «Qualità dei dati», «solo con quote 1X2 complete», «solo con xG», «es. Ajax», «Cerca», «Azzera» | form | U | kept | — | journey `search` |
| UI-33 | «spain · laliga» | competition options | T | «Spain · Laliga» (see UI-12) | V-B1 | invariant (option text) |
| UI-34 | «Imposta i filtri e premi Cerca.» | before a search | U | kept | — | — |
| UI-35 | «Nessuna squadra chiamata "Nessuno" nei dati salvati.» | team not found | T | «Nessuna squadra trovata con il nome «Nessuno».» | V-B1 | journey `search`; invariant |
| UI-36 | «Ajax (netherlands)» | choice between teams with the same name | T | «Ajax (Netherlands)» | V-B1 | invariant |
| UI-37 | «Filtri non validi: fav_min must be … . Correggi i campi e riprova.» | server validation | T | «Valore non valido in: Quota favorito da. Correggi il campo e riprova.»; parameter in `data-fields`, server message in the tooltip | V-B1 | journey `search` and `web-e2e`: field label and `data-fields` |
| UI-38 | «Filtri applicati dal server: team, venue, with_odds» | above the results | T | removed; `data-filters` on the «Risultati» heading | V-B1 | journey `search` and `web-e2e`: `data-filters` |
| UI-39 | «Data · Ora · Partita · Campionato · Risultato · 1 · X · 2 · Over 2,5 · xG» | table headers | U | kept | — | — |
| UI-40 | «2024-08-01» | date cell | T | «01/08/2024», the ISO day in `datetime` | V-B1 | journey `search`: `time[datetime]` equals the API |
| UI-41 | «laliga 2024-2025» | competition cell | T | «Laliga 2024/25» (see UI-12) | V-B1 | journey `search` |
| UI-42 | «2–1» | result cell | U | as UI-13 | V-B1 | journey `search` |
| UI-43 | «La sede vale solo con una squadra: è stata ignorata.» | venue without a team | U | kept | — | journey `search` |
| UI-44 | wide results table on a phone, no cue that it scrolls | mobile | V | readable mobile layout of the results | V-B4 | Browser QA mobile, QA-V baseline |
| UI-45 | «Altri risultati» · «Risultati» | list | U | kept | — | journey `search` |

## Dashboard (`#/`, home page until V-B2; area not declared yet)

The Dashboard is today the home page and is almost entirely data health and certification: technical by nature. V-B2 makes «Oggi» (the Daily Board) the home page (D-2) and moves this view into the technical area «Dati». Any summary that stays in the user area is rewritten in plain words.

| ID | Current text (main 3521a07) | Where | Class | Action | PR | Verification |
|---|---|---|---|---|---|---|
| UI-50 | «Salute dei dati, copertura, freschezza e certificazione, letti dalle route dell'API v1. Nessun valore dimostrativo.» | under the title | R, T | removed | V-B2 | invariant once the area is declared |
| UI-51 | «Fonte: /api/v1/health · generato: …» | every tile | T | technical area only | V-B2 | invariant |
| UI-52 | «Versione API», «Versione codice» | tile Servizio | T | technical area only | V-B2 | invariant |
| UI-53 | «Dataset attivi», «Dataset con errori», «Avvisi», «Ultimo controllo» | tile Salute dei dati | T, V | technical area; the contradiction between the status and the alerts reported by the AI review is checked against the API, not hidden | V-B2 | journey `dashboard` |
| UI-54 | «Gate fase 2…8», «Snapshot», «Ultimo backfill», «Versioni storiche» | tile Certificazione FutPythonTrader | T | technical area only | V-B2 | invariant |
| UI-55 | «TotalCorner storico / prematch / live raccolto», «Con snapshot», «Ultimo polling» | TotalCorner tiles | T | technical area only | V-B2 | invariant |
| UI-56 | «Dato non disponibile. Motivo: UNAVAILABLE — data source unavailable» | a failed tile | T | plain message, code in `data-code` (as UI-03) | V-B2 | journey `dashboard` |
| UI-57 | «spain · laliga», «0.97», «HARD_VERIFIED», «Copertura: rapporto 0–1 calcolato dal server sui fatti salvati.» | coverage table | T, V | competition names as UI-12; codes in Italian (done in V-B1); ratios shown as the API sends them, a visual bar is evaluated only if it derives no value in the browser (MP-WEB-011) | V-B2 | journey `dashboard` |
| UI-58 | «Risposta parziale: 1 riquadro su 6 non è disponibile e mostra N/D con il motivo.» | partial dashboard | T | technical area | V-B2 | journey `dashboard` |

## Technical views (`data-area="technical"`)

Provenance, identifiers and diagnostics belong here (decision §3.7). They are listed so that nothing is forgotten; their own tidying belongs to V-B2.

| ID | Current text | Where | Class | Action | PR | Verification |
|---|---|---|---|---|---|---|
| UI-60 | «Salute dei dati e certificazione FutPythonTrader, letti da /api/v1/providers.»; provider keys without an Italian label shown as raw words | Fornitori dati | T (allowed) | stays technical; reached only from the «Dati» area; keys without a label get an Italian label | V-B2 | journey `providers-endpoints` |
| UI-61 | endpoint paths, English API descriptions, «Route storiche» | API | T (allowed) | stays technical; reached only from the «Dati» area | V-B2 | journey `providers-endpoints` |
| UI-62 | «Data Coverage → Competizioni», «Coverage quote minima (0–1)», «Provider», «404», «Overlap FPT/TC», placeholder «italy» | `/coverage` (server page) | T (allowed) | stays technical; reached only from the «Dati» area; style of the site | V-B2, V-B3 | `test/fpt-coverage-page.test.mjs` |
| UI-63 | «MatchPilot · Accesso riservato all'owner. · Utente · Password · Accedi» | `/login` | U | kept (D-5) | — | `test/owner-auth*.test.mjs` |

## Plan inside V-B

| PR | Content |
|---|---|
| **V-B1** | Rule (owner decision, MP-WEB-015, `docs/web.md`), this inventory, the technical-text invariant in the Browser QA gate, Daily Board, Ricerca, shared states, footer, Italian codes and dates (D-7). |
| **V-B2** | Home page «Oggi» = Daily Board (D-2); navigation with the technical area «Dati» (Dashboard, Fornitori dati, API, Copertura); mobile navigation; UI-50…UI-62. Every view must declare its area: the gate fails a view without one. The invariant also covers the header. |
| **V-B3** | Identity of the mockup (D-1): tokens, amber accent, logo, local fonts with verified license. |
| **V-B4** | Compact Daily Board rows and day strip of the mockup; mobile results (UI-44); grouping by competition only with API support (D-4). |
| follow-up | Display names of competitions and countries (UI-12): an API change, proposed separately only if strictly necessary. |

**Acceptance at the end of V-B:** every view declares an area, and every user view passes the invariant on desktop and mobile. No user screen looks like a debug page, a technical report or a raw prototype. The visual baselines of QA-V then freeze that state.
