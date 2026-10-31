# MP-PRODUCT-100 — Capacità universale, zero default arbitrari, architettura estensibile

Rapporto di audit, gap analysis e roadmap (31/10/2026, base `main` 7f0896e).
- Decisione owner: `MP-PRODUCT-100` in `docs/governance/owner-decisions.json`.
- Audit in sola lettura, senza chiamate ai provider né consumo di API.
- Allegati di dettaglio con riga di codice e prova per ogni punto:
  - [A — Frontend](A-frontend.md): 48 punti, FE-01…FE-48.
  - [B — Backend](B-backend.md): 40 punti, BE-01…BE-40, più i componenti riusabili.
  - [C — Provider](C-providers.md): inventario capacità per provider; versione machine-readable in [C-providers.json](C-providers.json), 102 righe.

> Questo documento descrive lo stato e propone l'architettura e la roadmap. Non certifica nulla e non cambia nessun contratto. Le PR che ne derivano seguono le regole SAFE/MANUAL di AGENTS §4.

## A. Audit globale — limitazioni arbitrarie

| Area | Punti | Arbitrari | Tecnici necessari | Decisioni owner | Demo | HIGH |
|---|---:|---:|---:|---:|---:|---:|
| Frontend (A) | 48 | 21 | 18 | 6 | 3 | 8 |
| Backend (B) | 40 | ~20 | ~12 | ~9 | ~3 | 7–8 |

Nel backend alcune voci hanno una categoria mista, quindi i conteggi per categoria sono approssimati e la loro somma supera 40. La colonna HIGH conta 6 voci HIGH, 1 «HIGH (prodotto)» e 1 «LOW ora, HIGH alla riattivazione»: per questo è 7–8.

**Le limitazioni più gravi, alla radice del problema segnalato dall'owner**

1. **Mercati cablati nel layer normalizzato** (BE-01, BE-10). `fpt_match_facts` tipizza solo 6 prezzi: 1X2, Over/Under 2,5 e BTTS sì. Gli altri mercati restano solo nel payload: altre linee O/U, AH/EH, doppia chance, risultato esatto, primo tempo, BTTS no. Da qui derivano tutti i campi fissi delle pagine.
2. **Filtri di ricerca cablati** (BE-02, FE-05/06/07). `SEARCH_FILTERS` ha 16 chiavi fisse (più `team` e `before`, gestiti a parte). Il registro `fpt_filter_registry` dichiara già campi filtrabili e operatori per centinaia di colonne, ma la ricerca non lo legge. I campi «Quota Over 2,5», «Quota casa», «Quota favorito» e «xG totali» della pagina Ricerca vengono da qui.
3. **Le pagine mostrano solo 1X2, Over 2,5 e BTTS sì** (FE-01/02/03, BE-12). Pagina Oggi, Match Center e Ricerca non mostrano mai il payload della partita: calci d'angolo, tiri, possesso, AH/EH, xG di dettaglio. Eppure `matchDetail` lo restituisce già.
4. **Simulazione e strategie legate a MATCH_ODDS** (FE-09, BE-19, BE-20).
   - La simulazione accetta solo MATCH_ODDS, cinque selezioni, un bookmaker fisso e due strategie di riferimento.
   - Il messaggio «l'archivio contiene solo prezzi 1X2» è falso: i fatti contengono anche O/U 2,5 e BTTS.
   - Per contro, `src/markets/rules.mjs` conosce già 8 tipi di mercato.
5. **Finestre e soglie fisse** (FE-36/38, BE-22/26/27):
   - campioni del Match Center fissi a 5, 10 e 20 partite più la stagione;
   - confronto diretto fisso sulle ultime 10, senza etichetta;
   - anticipo d'ingresso del backtest fisso a 10 minuti, invisibile. La decisione MP-OWNER-HIST-01B-OPTION-A chiede che sia configurabile.
6. **Filtri del backend mai offerti dall'interfaccia** (FE-20/21/23). `phase` non è offerto, quindi le partite PREMATCH non sono cercabili; mancano anche la copertura per campo, l'*as-of* e i filtri di qualità. `season` è in arrivo con la PR #260.
7. **Fonte dei prezzi invisibile** (FE-15). Nessuna pagina dice da quale bookmaker o fonte arriva una quota.

**Rischio di integrità temporale da correggere per primo** (BE-08, HIGH, verificato riproducendolo):
- **Il difetto.** `fieldFamily` (`src/providers/futpython/schema.mjs:22-46`) classifica per espressione regolare. Statistiche post-partita non elencate cadono così nella famiglia `identity` e quindi in `PREMATCH_IDENTITY`, marcate come sicure per il pre-partita. Esempi: `Dribbles_Home_FT`, `Aerials_Won_Away_FT`, `Blocks_Home_FT`.
- **Lo stato attuale.** Oggi nessuna analisi pre-partita le usa, quindi il rischio è latente.
- **Perché va corretto prima.** Un costruttore di filtri guidato dal registro le userebbe come dati pre-partita. Per questo la correzione precede il catalogo dinamico.

**Cosa è già corretto**
- Campionati, paesi e stagioni non sono mai cablati nel browser: arrivano dall'API.
- Il browser non calcola quote, probabilità, P/L o statistiche.
- Desktop, tablet e telefono offrono le stesse funzioni.
- Nessuna funzione è dichiarata REAL senza prova. FEAT-TRADING-TOOLS è CERTIFIED CALCULATION con evidenze; le altre feature con dati REAL sono TESTED e non certificate.

## B. Copertura dei provider

| Provider | Stato | Copertura verificabile |
|---|---|---|
| FutPythonTrader | attivo | Vedi sotto |
| TotalCorner | codice presente, **sospeso** (DEC-003) | 4 endpoint implementati (`/match/today`, `/match/view`, `/match/odds`, `/match/bookmaker_odds`, 18 bookmaker nella prova dell'08/10). Mapping VERIFIED 92 campionati su 708. Nessuna percentuale per campo: i nomi sono solo nel database. |
| API-FOOTBALL | **nessuna integrazione e nessuna autorizzazione nel repository** | NOT VERIFIED. Serve una decisione owner (vedi G). |
| BetsAPI | solo benchmark (closure 08/10, AGENTS) | Fuori dal prodotto. |

**FutPythonTrader.** Fonte: certificato del 05/10/2026, `docs/futpython-certification-2026-10-05.md:907,1208` e `migrations/016`.
- 325 campi osservati nei dati reali.
- **25 tipizzati nel layer normalizzato: 7,7%.**
- **18 filtrabili via API: circa 5,5%.** È un conteggio approssimato, derivato a mano da `SEARCH_FILTERS` ([C-providers.md](C-providers.md), sezione della copertura), non dal certificato. Per esempio, le quote X e 2 sono filtrabili solo tramite `favorite_odd`, i gol solo come somma, e Under 2,5 e BTTS non hanno un filtro.
- 325 su 325 leggibili, ma solo partita per partita (`/api/v1/fpt/match`).

| Famiglia | Tipizzati / osservati |
|---|---|
| Mercati (quote) | 12 / 188 |
| xG | 2 / 26 |
| Identità | 9 / 11 |
| Gol | 2 / 4 |
| Corner, tiri, disciplina, difesa, possesso, palle inattive | 0 / 96 |

Altri fatti verificati nell'inventario:
- **Dataset del catalogo:** 1.027, di cui 615 disponibili e 412 in 404. I «412 dataset» citati altrove sono quelli in 404, non dataset in più.
- **Capacità che il provider non offre (PROVIDER NOT SUPPORTED):** ora di acquisizione delle quote, fuso orario del calcio d'inizio, partite attese per stagione, paginazione lato provider.
- **Capacità non verificate (NOT VERIFIED):**
  - altri endpoint, live, giocatori e formazioni;
  - quota e piano reali del fornitore: i limiti 20 al minuto e 2.000 al giorno sono tetti interni, non la quota del fornitore;
  - nome del bookmaker dietro `Bookie_1X2_FT`;
  - **i 325 nomi di colonna**: nel repository ci sono solo i conteggi per famiglia. Circa 58 nomi compaiono nel codice; i nomi completi stanno nella tabella `fpt_schema_fields` della VPS.
- **Licenze e redistribuzione:** per nessun provider sono registrati termini di licenza o di redistribuzione. L'uso per altri utenti è **NOT VERIFIED**.

## C. Gap analysis — disponibile ma non utilizzabile

1. **176 campi di mercato su 188.** Linee AH/EH, risultato esatto, doppia chance, O/U del primo tempo, BTTS no. Restano solo nel payload e nessuna pagina può usarli.
2. **Tutte le 96 statistiche non di mercato** e 24 xG su 26. Si possono leggere solo nel payload di una singola partita, e nessuna pagina le mostra.
3. **Il registro dei filtri dichiara 278 campi filtrabili.** In realtà 5 sono indicizzati e 18 implementati, quindi il registro sopravvaluta le capacità reali.
4. **Ricerca PREMATCH, copertura per campo e *as-of*:** esistono nel backend, non nell'interfaccia.
5. **Mercati della simulazione.** `src/markets/rules.mjs` ha 8 tipi di mercato, ma backtest e strategie regolano solo MATCH_ODDS.
6. **TotalCorner.** I bookmaker delle quote di apertura, chiusura e in-play sono normalizzati solo per 4 famiglie. È sospeso, quindi la priorità è bassa.

## D. Architettura proposta — capability-driven

**Principio.** Il frontend non conosce in anticipo mercati e statistiche. Il backend pubblica un **catalogo delle capacità** derivato dai provider. Le pagine costruiscono filtri, colonne e condizioni da quel catalogo.

1. **Tempi dei campi espliciti e versionati.** È la correzione di BE-08 e il prerequisito di tutto.
   - Una tabella di classificazione dei campi sostituisce l'espressione regolare: famiglia, momento (pre-partita, mercato non datato, post-partita) e versione.
   - Un campo che non compare nella tabella resta **UNCLASSIFIED**: non si usa in pre-partita finché non viene classificato.
2. **Catalogo delle capacità** (`/api/v1/capabilities`, sola lettura). Si costruisce sui registri esistenti:
   - `fpt_schema_fields`, `fpt_filter_registry`, `fpt_fact_columns`, `fpt_field_coverage`;
   - la versione del registro dei campi;
   - `src/markets/rules.mjs`.

   Ogni capacità porta:
   - un id interno stabile, il provider e il nome originale;
   - il tipo e l'unità;
   - il riferimento di mercato (`market_ref`: famiglia, selezione, linea o handicap, periodo, lato);
   - gli operatori ammessi;
   - la disponibilità storica, pre-partita e live;
   - copertura per campionato e stagione, momento, provenienza, stato e limiti.

   Un nome che il parser dei mercati non riconosce con certezza resta **UNCLASSIFIED**, mai indovinato. Così mercati diversi con nomi simili non si confondono.
3. **Prezzi per mercato in forma generica.**
   - Una tabella `fpt_match_prices` (partita, `market_ref`, selezione, linea, prezzo, colonna sorgente, bookmaker o fonte) affianca i 6 prezzi attuali; non li sostituisce subito.
   - Il prezzo viene salvato senza arrotondamento: oggi la tabella dei fatti lo arrotonda a 3 decimali (BE-05).
   - Il payload grezzo resta la fonte di verità e la lineage resta intatta.
4. **Motore di condizioni generico.**
   - La ricerca, e poi le strategie e il backtest, accettano `conditions`, cioè gruppi AND/OR di {capacità, operatore, valore}.
   - Le condizioni vengono validate sul catalogo: operatori, intervalli e momento.
   - Integrità temporale: il motore rifiuta, per un'analisi pre-partita, una capacità post-partita.
   - I filtri attuali restano come scorciatoie compatibili e non vengono rimossi di colpo.
5. **Interfaccia.**
   - Un costruttore di condizioni nella Ricerca: scelta della capacità, del mercato, della selezione e della linea, operatore, valore, gruppi AND/OR.
   - Ricerche salvabili.
   - «Azzera» porta a una ricerca neutra.
   - Ogni dato mancante viene mostrato come N/D.
   - Il Match Center mostra tutte le famiglie di campi dal catalogo.
   - Le finestre (ultime N partite, intervallo di date) diventano parametri.
6. **Pronta per più utenti, solo nel progetto.** Senza implementare licenze o pagamenti, l'architettura già prevede:
   - preferenze e ricerche per utente sopra la persistenza esistente, ruoli e isolamento (#23);
   - capacità filtrabili per piano o provider, tramite il campo «limiti» del catalogo;
   - fuso orario e lingua come preferenze.

## E. Roadmap — PR atomiche in ordine di dipendenza

| # | PR | Cosa | Classe | Dipende da |
|---|---|---|---|---|
| 0 | **questa** | decisione MP-PRODUCT-100 registrata; rapporto e audit | SAFE | — |
| 1 | MP-PIT-TIMING-01 | classificazione esplicita e versionata dei tempi dei campi (BE-08), UNCLASSIFIED escluso dal pre-partita, test | MANUAL (PIT) | — |
| 2 | MP-CAP-01 | catalogo delle capacità e `/api/v1/capabilities` (sola lettura), parser `market_ref` con tabella esplicita | MANUAL (contratto API) | 1 |
| 3 | MP-CAP-02 | `fpt_match_prices` generico con migrazione e refresh, prezzi non arrotondati | MANUAL (database) | 2 |
| 4 | MP-CAP-03 | `conditions` AND/OR nella ricerca, compilatore guidato dal registro, controllo dei tempi | MANUAL (contratto API) | 2, 3 |
| 5 | MP-UI-CAP-01 | costruttore di condizioni nella Ricerca; i campi fissi della #258 diventano scorciatoie | SAFE (interfaccia su API mergiata) | 4 |
| 6 | MP-UI-CAP-02 | Match Center con tutte le famiglie di campi dal catalogo, separando pre-partita e post-partita | SAFE (interfaccia su API mergiata) | 1, 2 |
| 7 | MP-CAP-04 | finestre dell'analisi parametriche (N, intervallo di date, profondità del confronto diretto) | MANUAL (contratto API) | — |
| 8 | MP-HIST-MKT-01 | backtest e strategie su più mercati (`market_ref`), anticipo d'ingresso configurabile, bookmaker visibile | MANUAL (logica finanziaria) | 3, 4 |
| 9 | MP-API-META-01 | metadati tipizzati in `/api/v1/endpoints` (enum, min, max, default), così i moduli si generano | MANUAL (contratto API) | — |
| 10 | MP-UI-SAFE-xx | correzioni SAFE subito possibili: filtro `phase` (PREMATCH) nella Ricerca, avvisi sconosciuti mostrati, etichetta del confronto diretto | SAFE | — |

PR già aperte e coerenti con il principio, perché filtrano per dimensioni e non per mercati scelti:
- #260: stagione;
- #261: campionato nella pagina Oggi;
- ricerca squadre per parte del nome.

I campi di quota fissi della #258 restano come transizione fino alla PR 5.

## F. Test e metriche

Metriche iniziali, misurate su `main` 7f0896e, con gli obiettivi:

| Metrica | Oggi | Obiettivo della roadmap |
|---|---|---|
| Campi FPT tipizzati sul totale osservato | 25 / 325 (7,7%) | 100% dei campi classificati (tipizzati o UNCLASSIFIED dichiarati) |
| Campi FPT filtrabili via API | circa 18 / 325 (circa 5,5%) | ogni campo con prova reale e momento noto |
| Mercati usabili nella simulazione | 1 (MATCH_ODDS) | ogni `market_ref` con regola di regolamento |
| Default arbitrari (A+B) | ~41 | 0, oppure documentati come tecnici o decisi dall'owner |
| Campi post-partita marcati come pre-partita | almeno 5 (BE-08) | 0 |

Ogni PR della roadmap porta i test richiesti dal mandato:
- cataloghi dinamici;
- mercati e linee diversi da Over 2,5;
- dati mancanti;
- paginazione, validazione, errori e filtri combinati;
- integrità temporale;
- Browser QA su desktop, tablet e telefono;
- regressioni.

Nessuna API a pagamento viene consumata.

## G. Decisioni owner necessarie

1. **API-FOOTBALL.** Non esiste alcuna integrazione né autorizzazione. Serve dire se entra nel perimetro, con quale piano e budget e con quali condizioni d'uso. Fino ad allora resta NOT VERIFIED.
2. **Licenze e redistribuzione.** Servono i termini d'uso di FutPythonTrader e TotalCorner, con o senza consulenza, prima di qualsiasi uso per altri utenti. Il diritto di interrogare un'API non equivale al diritto di ridistribuirne i dati.
3. **Censimento dei 325 nomi di colonna.** È una query in sola lettura su `fpt_schema_fields` sul database della VPS: serve per completare il catalogo con prova reale. Richiede l'accesso in sola lettura che oggi l'agente non ha.

Non servono altre decisioni per partire: le PR SAFE procedono, le PR MANUAL vengono preparate e lasciate aperte per l'owner.
