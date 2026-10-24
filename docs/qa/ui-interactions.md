# UI interaction inventory (MP-FRONTEND-CLAUDE-DIRECT-E2E-01)

Owner decision of 2026-10-24 (#3, #91): every route, page, control and interactive state of the web app is listed here with the browser test that exercises its **outcome** (route, request, state or persisted result), not only its presence. A row without a test is a gap and says so. Mock E2E (a route answer replaced in the browser) is marked **(routed)**; everything else runs on the real server with a throwaway PostgreSQL schema and the QA archive through the real FutPythonTrader ingestion path. None of these tests is a certification on the real archive or in production.

Test files:
- **WE** `test/web-e2e.test.mjs` — Oggi, Ricerca, Dati, login (R-05, R-06b).
- **WT** `test/web-trading-e2e.test.mjs` — the sections added by WEB-APP-01 (this inventory). Viewports: desktop 1280×800, tablet 820×1180, mobile 390×844 (menu and account); desktop for the calculators; desktop and mobile for the owner session.
- **BQ** Browser QA gate journeys `tools/qa/journeys.mjs` (CI job `Browser QA`, desktop and mobile).
- **API** `test/web-tools-api.test.mjs` — the calculators behind the pages, with hand-computed vectors.

## Shell

| Control or state | Outcome checked | Test |
|---|---|---|
| Menu: Oggi, Live, Ricerca, Strategie, Simulazione, Strumenti, Money, Portafoglio, Dati | click → view title, `aria-current="page"`, `data-area` (Dati technical, the others user), invariants and no horizontal scroll; at three viewports | WT test 1; BQ `general-navigation` |
| Mobile menu with nine sections | bar fixed at the bottom, scrolls inside itself, the page does not scroll | WT test 1 (mobile) |
| Account icon (header) | opens Account, marked current | WT test 1 |
| Back / forward | the view follows the address | WT test 1 |
| Unknown route | «Pagina non trovata» | BQ `general-navigation` |
| Loading, error with «Riprova» | explicit states; «Riprova» reloads | WE; WT (routed 500 on a calculator, then Riprova) |
| Dati › Regole tab | technical view, 8 market rules from the registry | WT test 1; BQ `general-navigation` (tabs of Dati) |

## Live (#29)

| Control or state | Outcome checked | Test |
|---|---|---|
| Live collection stopped | explicit empty state «Nessuna partita in diretta raccolta» | WT test 1 |
| No match left today | explicit empty state with link to Oggi | WT test 1 |
| Live route unavailable | partial state in its card only, code in `data-code` | WT test 1 (routed 503) |
| Matches still to play today (rows, open a match) | same rows as Oggi | not automated here: the QA archive has no match on the real current day; the row component is checked by WE and BQ `daily-board` |

## Strategie (#34)

| Control or state | Outcome checked | Test |
|---|---|---|
| Builder fields (name, selection, side, eight price bounds, team, venue) | sent as a definition; the server validates and normalizes it | WT test 2 |
| «Salva strategia» | 201 SAVED «Salvata, versione 1»; same rules again UNCHANGED; new rules version 2; list refreshed | WT test 2 (desktop and mobile) |
| Double click on «Salva strategia» | one request | WT test 2 |
| Save with the owner login off | refusal WRITES_REQUIRE_AUTH shown in words | WT test 1 |
| Save without a session, other origin, archive off, conflict, too large | refusal texts of `writeRefusal` (codes UNAUTHENTICATED, ORIGIN_NOT_ALLOWED, UNAVAILABLE, CONFLICT, PAYLOAD_TOO_LARGE) | server side in `test/persistence-api.test.mjs`; in the browser only WRITES_REQUIRE_AUTH (gap: the other refusal texts are not rendered by a browser test) |
| «Prova nella simulazione» | opens Simulazione with «Personalizzata» and the rules filled in | WT test 1 |
| Saved strategies list | rows with name, version, rules, «Simula» | WT test 2 |
| Archive not active | explicit state, builder still usable | WT test 1 |
| Strategy page: rules, versions, «Simula» | two versions listed; Simula opens Simulazione with the rules | WT test 2 |
| Unknown strategy | «Strategia non trovata» | WT test 2 |

## Simulazione (#34)

| Control or state | Outcome checked | Test |
|---|---|---|
| Tabs Simula · Confronta · Salvate | open the views; Simulazione stays current in the menu | WT tests 1–2 |
| Form, strategies, modes, refusals | as before | BQ simulation journeys |
| «Salva questa simulazione» | SAVED, then ALREADY_SAVED for the same run | WT test 2 |
| «Salva questo confronto» | SAVED | WT test 2 (desktop) |
| Empty name | refused by the page, no request | WT test 1 |
| Salvate: list, open one | the reopened report has the same seal (`report_sha256`) as the run | WT test 2 |
| Salvate: unknown number, archive off | explicit states | WT tests 1–2 |

## Strumenti (#94)

| Control or state | Outcome checked | Test |
|---|---|---|
| Seven tabs | each opens its form, marked current | WT test 1 |
| Margine, Valore atteso, Kelly, Posizione, Copertura, Dutching, Poisson | submit (button or Enter) → server values on screen, exact value in the tooltip, focus on the outcome | WT test 1; API vectors |
| Value out of range | blocked by the browser, no request | WT test 1 |
| Value refused by the server (deep link) | «Valore non valido in: Quota», field in `data-fields` | WT test 1 |
| «Azzera» | empty form, no result | WT test 1 |
| Server failure | error state, «Riprova» recovers | WT test 1 (routed 500) |

## Money (#96)

| Control or state | Outcome checked | Test |
|---|---|---|
| Registry of 16 models, 4 usable | rows and states | WT test 1 |
| Model select | only the usable models | WT test 1 |
| «Calcola» | decision ALLOW, then REDUCE with the liability cap named | WT test 1 |
| Refused value | «Valore non valido in: Quota» | WT test 1 |

## Portafoglio (#99)

| Control or state | Outcome checked | Test |
|---|---|---|
| Account form | address `#/portfolio?account=…` | WT test 1 |
| Archive not active | explicit state | WT test 1 |
| Unknown account | «Nessun conto simulato…» | WT test 2 |
| Account figures | gap: no account can be created from the web (opening positions needs the server-side operating mode, DEC-001); the rendering is not exercised in a browser |

## Match Center additions (#25, #94)

| Control or state | Outcome checked | Test |
|---|---|---|
| «Esito dei mercati» of a finished match | winner and rule id `MATCH_ODDS@v2` | WT test 1; API `postMatch` |
| Tool links (margin, Poisson, expected value) | open Strumenti with the match's values and a result | WT test 1 |

## Account (#23, #95)

| Control or state | Outcome checked | Test |
|---|---|---|
| Login off | «L’accesso owner non è attivo…», archive state | WT test 1 |
| Signed in | user, archive active, saves allowed | WT test 2 |
| «Esci» | session closed (next API call 401), login page | WT test 2 |

## Not covered (declared gaps)

- Real-time behaviour: no live data is collected (TotalCorner suspended); nothing in the Live view is real-time.
- Concurrent edits of the same strategy from two pages: the store serializes them (`pg_advisory_xact_lock`, `test/persistence-store.test.mjs`); no browser test.
- 409/429 answers rendered in the browser for the saves.
- Account figures of the paper ledger (see Portafoglio).
- Other browsers than Chromium.
