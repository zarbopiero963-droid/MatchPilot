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

The Browser QA gate fails a user view, or the page footer, that shows technical text (`technicalText` in `tools/qa/browser-qa.mjs`, after every journey step, desktop and mobile). It also fails a user view with lead text (`.lead`, the explanatory paragraph under a title). The patterns are a safety net, not a proof: plain-language sentences that are merely superfluous are caught only by the `.lead` rule and by review. Each row names the test that checks its text, or says «not automated» when no test reads the text.

**Done** means that the PR changed the text and that the test in the last column checks it.

## Shell and shared states

| ID | Current text (main 3521a07) | Where | Class | Action | PR | Verification |
|---|---|---|---|---|---|---|
| UI-01 | «Sito in sola lettura. I dati arrivano dall'API v1 di MatchPilot; nessun calcolo avviene nel browser.» | footer, every page | T | «MatchPilot · consultazione in sola lettura, nessuna operazione di trading.» | V-B1 | invariant on the footer, every step |
| UI-02 | «Caricamento la dashboard…», «Caricamento la Daily Board…» | loading state, every view | R | «Caricamento in corso…», what is loading in `data-what` | V-B1 | `web-e2e` loading state |
| UI-03 | «Impossibile caricare i dati (UNAVAILABLE). Dettaglio: data source unavailable.», and no title on the page | error state, every view | T | title «Dati non disponibili», message «I dati non sono disponibili in questo momento.» (network: «Connessione non disponibile…»), «Riprova»; code in `data-code`, code and message in the tooltip | V-B1 | journey `daily-board`, step «errore dell'API» (user view, invariants); `web-e2e` error state |
| UI-04 | «Impossibile caricare altri risultati (UNAVAILABLE — …). I risultati già mostrati restano validi.» | failed next page, Daily Board and Ricerca | T | «Non è stato possibile caricare altri risultati. Quelli già mostrati restano validi.», code in `data-code` | V-B1 | journey `search`, step «pagina successiva in errore» (invariant while the error is on screen) |
| UI-05 | «Fonte: futpythontrader · generato: 2026-10-19T… · versione codice: …» | provenance line under Daily Board and Ricerca | T | removed from user views; stays in the technical views, with the instant in Europe/Rome and UTC in the tooltip (D-7) | V-B1 | journey `daily-board`: no `p.meta` in `main`; invariant |
| UI-06 | menu «Dashboard · Daily Board · Ricerca · Fornitori dati · API · Copertura» | header | V | menu «Oggi · Ricerca · Dati» as in the mockup: Oggi is the home page (D-2), «Dati» holds Stato dei dati, Fornitori, API and Copertura as tabs; on a phone a bottom bar with icons | V-B2a | journey `general-navigation`: menu labels, titles, areas, the tabs of Dati, the old `#/board` address, the bar fixed at the bottom on a phone with room left for it; journey `search`: a focused field stays above the bar |
| UI-07 | «MatchPilot — Sports Trading OS» | page title | U | kept | — | — |
| UI-08 | «Questa pagina richiede JavaScript.» | `noscript` | U | kept | — | — |
| UI-09 | «Pagina non trovata» · «Questa sezione non esiste. Torna alla dashboard» | unknown route | U | «Torna a Oggi»; user area | V-B1 (area), V-B2a (link) | journey `general-navigation`, step «rotta sconosciuta»: link text «Torna a Oggi» |

## Daily Board (`#/board`, user view)

| ID | Current text (main 3521a07) | Where | Class | Action | PR | Verification |
|---|---|---|---|---|---|---|
| UI-10 | «Le partite di un giorno nei dati salvati, in ordine di orario, con campionato, quote, xG e stato dei dati. Orari come forniti dal fornitore.» | under the title | R, T | removed | V-B1 | invariant («dati salvati», «fornitore») |
| UI-11 | «PROVIDER_TZ_UNDOCUMENTED» (the V-B1 draft: «ora del fornitore») | pill next to the kickoff | T | removed; the time stays as the provider wrote it (D-7), with the tooltip «Orario indicato dalla fonte dei dati: il fuso orario non è specificato.»; the status in `data-tz` | V-B1 | journey `daily-board`: `data-tz` equals the API, tooltip present; invariant |
| UI-12 | «spain · laliga · 2024-2025» | competition on the card | T, V | slugs read as words, season as «2024/25» («Spain · Laliga · 2024/25»). Official names in Italian need display names from the API (competition registry #30): an API change, proposed separately, only if strictly necessary | V-B1 (words); follow-up | journey `daily-board` and `web-e2e`: competition text |
| UI-13 | «Risultato 2–1» · «Stato risultato FINAL» | card | R, T | score alone when final; «Non iniziata» or «Senza risultato» in place of the score otherwise; a missing score is N/D; the state in `data-result` | V-B1 | journey `daily-board`, step «partite senza risultato finale» |
| UI-14 | «Quote 1 · X · 2: 1,300 · 3,400 · 4,900» | card | V | three labelled boxes 1, X, 2 at exact precision (D-3) | V-B1 (V-B4: compact row of the mockup) | journey `daily-board`: label and value of every box equal the API |
| UI-15 | «Over 2,5 1,900» · «Entrambe segnano 1,800» | card | V | boxes «Over 2,5» and «Gol», tooltips «Più di 2,5 gol», «Entrambe le squadre segnano» | V-B1 | journey `daily-board`: labels and values |
| UI-16 | «Favorito HOME 1,300» | card | T | «Favorito Casa 1,300», «Favorito N/D» without a favourite; side code in `data-code` | V-B1 | journey `daily-board` and `web-e2e`: text, odd and `data-code` equal the API; invariant |
| UI-17 | «xG casa · ospite 1,900 · 1,600» | card | V | «xG 1,900 – 1,600» | V-B1 | journey `daily-board` |
| UI-18 | «Fase: HISTORICAL · dataset: spain/laliga/2024-2025» | card | T | removed; `data-phase` and `data-dataset` on the card | V-B1 | journey `daily-board`: attributes equal the API; invariant |
| UI-19 | «Partite del 2024-08-01» | day heading | T | «giovedì 1 agosto 2024», the ISO day in `datetime` | V-B1 | journey `daily-board` (`time[datetime]`) |
| UI-20 | «Nessuna partita il 2024-07-31 nei dati salvati. La Dashboard indica per ogni campionato l'ultimo giorno con dati. Apri la Dashboard» | empty day | T | «Nessuna partita mercoledì 31 luglio 2024. La copertura di ogni campionato è nella Dashboard.» | V-B1 | journey `daily-board`, step «giorno prima»; invariant |
| UI-21 | «Data non valida: "2024-02-30". Usa il formato AAAA-MM-GG.» | invalid date | T | «Data non valida: scegli un giorno dal calendario.» (found by the new invariant) | V-B1 | journey `daily-board`, step «data non valida» |
| UI-22 | «← Giorno prima · Giorno · Mostra · Giorno dopo → · Oggi» | controls | U, V | kept; day strip of the mockup | V-B4 | journey `daily-board` |
| UI-23 | «Carica altre partite» · «Fine dei risultati.» | list footer | U | kept | — | journey `daily-board` |
| UI-24 | a result state the site does not know (a future API value) | card, results | V | today: the score or N/D, the state kept in `data-result`; a new state gets an Italian label in the PR that adds it to the API | follow-up | review of the API change |
| UI-25 | no non-technical sign of when the data were updated (the provenance line is gone) | Oggi | V | «Dati aggiornati: 19/10/2026, 20:15 GMT+2» («in parte» for a partial run) from the end of the last FutPythonTrader sync run, only when that run completed and has a real time; nothing otherwise | V-B2a | journey `daily-board`, steps «aggiornamento dei dati» (complete, partial, failed, running, missing or malformed time, empty day) and «la pagina non aspetta la route diagnostica» (the route held until the matches are on screen); the sync run answer changed in the browser (the QA archive has none); absent on the QA archive |

## Ricerca (`#/search`, user view)

| ID | Current text (main 3521a07) | Where | Class | Action | PR | Verification |
|---|---|---|---|---|---|---|
| UI-30 | «Filtri combinati sulle partite storiche salvate. Risultati in ordine di data, dal più recente, con paginazione stabile.» | under the title | R | removed | V-B1 | invariant: no `.lead` in a user view |
| UI-31 | «Elenco dei campionati non disponibile: il filtro per campionato è disattivato.» | partial state | U | kept | — | — |
| UI-32 | field labels, «Qualità dei dati», «solo con quote 1X2 complete», «solo con xG», «es. Ajax», «Cerca», «Azzera» | form | U | kept | — | journey `search` |
| UI-33 | «spain · laliga» | competition options | T | «Spain · Laliga» (see UI-12) | V-B1 | journey `search`, step «campionato e intervallo di date»: every option equals the API names as words |
| UI-34 | «Imposta i filtri e premi Cerca.» | before a search | U | kept | — | — |
| UI-35 | «Nessuna squadra chiamata "Nessuno" nei dati salvati.» | team not found | T | «Nessuna squadra trovata con il nome «Nessuno».» | V-B1 | journey `search`; invariant |
| UI-36 | «Ajax (netherlands)» | choice between teams with the same name | T | «Ajax (Netherlands)» | V-B1 | journey `search`, step «più squadre con lo stesso nome» (teams answer changed in the browser: the QA archive has no homonyms) |
| UI-37 | «Filtri non validi: fav_min must be … . Correggi i campi e riprova.» | server validation | T | «Valore non valido in: Quota favorito da. Correggi il campo e riprova.»; parameter in `data-fields`, server message in the tooltip | V-B1 | journey `search` and `web-e2e`: field label and `data-fields` |
| UI-38 | «Filtri applicati dal server: team, venue, with_odds» | above the results | T | removed; `data-filters` on the «Risultati» heading | V-B1 | journey `search` and `web-e2e`: `data-filters` |
| UI-39 | «Data · Ora · Partita · Campionato · Risultato · 1 · X · 2 · Over 2,5 · xG» | table headers | U | kept | — | — |
| UI-40 | «2024-08-01» | date cell | T | «01/08/2024», the ISO day in `datetime` | V-B1 | journey `search`: `time[datetime]` equals the API |
| UI-41 | «laliga 2024-2025» | competition cell | T | «Laliga 2024/25» (see UI-12) | V-B1 | journey `search` |
| UI-42 | «2–1» | result cell | U | as UI-13 | V-B1 | journey `search` |
| UI-43 | «La sede vale solo con una squadra: è stata ignorata.» | venue without a team | U | kept | — | journey `search` |
| UI-44 | wide results table on a phone, no cue that it scrolls | mobile | V | readable mobile layout of the results | V-B4 | Browser QA mobile, QA-V baseline |
| UI-45 | «Altri risultati» · «Risultati» | list | U | kept | — | journey `search` |

## Stato dei dati (`#/data`, the former Dashboard; technical view since V-B2a)

Until V-B2 the Dashboard was the home page, though it is almost entirely data health and certification: technical by nature. V-B2a made «Oggi» (the Daily Board) the home page (D-2) and moved this view into the technical area «Dati» as «Stato dei dati».

| ID | Current text (main 3521a07) | Where | Class | Action | PR | Verification |
|---|---|---|---|---|---|---|
| UI-50 | «Salute dei dati, copertura, freschezza e certificazione, letti dalle route dell'API v1. Nessun valore dimostrativo.» | under the title | R, T | removed; the view is «Stato dei dati» in «Dati» | V-B2a | invariant: no `.lead` in any view (journey `dashboard` runs it on `#/data`) |
| UI-51 | «Fonte: /api/v1/health · generato: …» | every tile | T (allowed) | kept in the technical area | V-B2a | journey `dashboard` (technical area) |
| UI-52 | «Versione API», «Versione codice» | tile Servizio | T (allowed) | kept in the technical area | V-B2a | `web-e2e` |
| UI-53 | «Dataset attivi», «Dataset con errori», «Avvisi», «Ultimo controllo» (an object: it would read «[object Object]» on a real database) | tile Salute dei dati | T, V | technical area; state in Italian («Regolare», «Attenzione», «Critico»); «Ultima sincronizzazione» shows the state and end of the last sync run | V-B2a | journey `dashboard`: «Regolare» and `data-code` equal the API; `web-e2e` (N/D on an empty database, Fornitori view); not automated with a run object |
| UI-54 | «Gate fase 2…8», «Snapshot», «Ultimo backfill», «Versioni storiche» | tile Certificazione FutPythonTrader | T (allowed) | kept in the technical area | V-B2a | journey `dashboard` |
| UI-55 | «TotalCorner storico / prematch / live raccolto», «Con snapshot», «Ultimo polling» | TotalCorner tiles | T (allowed) | kept in the technical area | V-B2a | journey `dashboard` |
| UI-56 | «Dato non disponibile. Motivo: UNAVAILABLE — data source unavailable» | a failed tile | T | «Dato non disponibile in questo momento.», code in `data-code`, reason in the tooltip | V-B2a | journey `dashboard` and `web-e2e`: text and `data-code` |
| UI-57 | «spain · laliga», «0.97», «HARD_VERIFIED», «Copertura: rapporto 0–1 calcolato dal server sui fatti salvati.» | coverage table | T, V | competition names as words (UI-12); states in Italian; ratios as the API sends them, with the note, in the technical area | V-B2a | journey `dashboard`: every competition cell equals the API names as words |
| UI-58 | «Risposta parziale: 1 riquadro su 6 non è disponibile e mostra N/D con il motivo.» | partial view | T | «1 riquadro su 6 non è disponibile: il motivo è nel riquadro.» | V-B2a | journey `dashboard`: exact text |

## Technical views (`data-area="technical"`)

Provenance, identifiers and diagnostics belong here (decision §3.7). They are listed so that nothing is forgotten; their own tidying belongs to V-B2.

| ID | Current text | Where | Class | Action | PR | Verification |
|---|---|---|---|---|---|---|
| UI-60 | «Salute dei dati e certificazione FutPythonTrader, letti da /api/v1/providers.»; provider keys without an Italian label shown as raw words | Fornitori dati | T (allowed) | lead removed and tabs of «Dati» (V-B2a); Italian labels for the keys of the provider tree (V-B2b) | V-B2a, V-B2b | journey `providers-endpoints`; labels: V-B2b |
| UI-61 | endpoint paths, English API descriptions, «Route storiche» | API | T (allowed) | stays technical; lead removed; reached from the tabs of «Dati» | V-B2a | journey `general-navigation` (tabs), `providers-endpoints` |
| UI-62 | «Data Coverage → Competizioni», «Coverage quote minima (0–1)», «Provider», «404», «Overlap FPT/TC», placeholder «italy» | `/coverage` (server page) | T (allowed) | stays technical; reached from the tabs of «Dati» (V-B2a); style of the site (V-B3) | V-B2a, V-B3 | `test/fpt-coverage-page.test.mjs` |
| UI-63 | «MatchPilot · Accesso riservato all'owner. · Utente · Password · Accedi» | `/login` | U | kept (D-5) | — | not automated (`test/owner-auth*.test.mjs` checks the statuses, not the text) |
| UI-64 | «Credenziali non valide.», «Troppi tentativi…» and the other login messages | `/login` | U | kept (D-5); reviewed with the site style in V-B3 | V-B3 | not automated (statuses only) |
| UI-65 | «Accesso negato», «Accesso temporaneamente non disponibile» | plain-text refusals of the server | U | kept; styled page in V-B3 | V-B3 | not automated (statuses only) |

## Controls, options and tooltips

| ID | Current text | Where | Class | Action | PR | Verification |
|---|---|---|---|---|---|---|
| UI-70 | «Riprova» | every error state | U | kept | — | journey `daily-board`, step «errore dell'API»; `web-e2e` |
| UI-71 | «Casa o trasferta», «Casa», «Trasferta», «Tutte», «Qualsiasi», «Finale», «Senza risultato», «Non iniziata» | Ricerca options | U | kept | — | not automated (the journeys select by value); the competition options are checked in UI-33 |
| UI-72 | tooltips: «Valore non disponibile», «Apri la Daily Board di quel giorno», the kickoff note, odds names, «Ora italiana · UTC …», codes and server messages of errors | every view | U (T in error tooltips) | kept: a tooltip is where a reason stays accessible without being shown (decision §3.6–3.7); error tooltips carry the code for support | — | journeys (`title` of the kickoff) |

## Plan inside V-B

| PR | Content |
|---|---|
| **V-B1** | Rule (owner decision, MP-WEB-015, `docs/web.md`), this inventory, the technical-text invariant in the Browser QA gate, Daily Board, Ricerca, shared states, footer, Italian codes and dates (D-7). |
| **V-B2a** | Home page «Oggi» = Daily Board (D-2); menu «Oggi · Ricerca · Dati» with the technical area «Dati» (Stato dei dati, Fornitori, API, Copertura as tabs); phone bottom bar; UI-06, UI-09, UI-25, UI-50…UI-58, UI-61, UI-62 (access). Every view declares its area; the invariant also covers the header. |
| **V-B2b** | Italian labels for the keys of the provider tree (UI-60), technical view. |
| **V-B3** | Identity of the mockup (D-1): tokens, amber accent, logo, local fonts with verified license; login and refusal pages in the site style (UI-64, UI-65). |
| **V-B4** | Compact Daily Board rows and day strip of the mockup; mobile results (UI-44); grouping by competition only with API support (D-4). |
| follow-up | Display names of competitions and countries (UI-12): an API change, proposed separately only if strictly necessary. |

**Acceptance at the end of V-B:** every view declares an area, and every user view passes the invariant on desktop and mobile. No user screen looks like a debug page, a technical report or a raw prototype. The visual baselines of QA-V then freeze that state.
