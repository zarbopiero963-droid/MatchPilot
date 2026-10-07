<!-- governance-reconciliation-2026-10-07: current summary; source contracts preserved -->
## Stato corrente #12 — 07/10/2026

**OPEN; NON globalmente READY TO CLOSE / NON 0 lavoro residuo.** Il certificato del 05/10 e le PR FPT-PR-01..09/fix #81..93 restano evidenze storiche dei loro commit/report/perimetri, non certificazione universale di requisiti nuovi.
**Gerarchia: decisioni owner → #3 prodotto/stato → #97 roadmap/fasi → #104 piano PR → issue di dominio.** Nessuna quarta master; il piano audit è proposta, non nuova decisione owner.

### Prossima attività unica
Owner 07/10 15:23 Europe/Rome: **una PR documentale/governance; prossima azione owner review/autorizzazione merge della [PR #125](https://github.com/zarbopiero963-droid/MatchPilot/pull/125)**, niente merge automatico. Nessuna feature/provider/collector/runtime, nessun #20 operativo, punto10 #40 o chiusura issue in questa PR.
Dopo merge: prima verificare/registrare finestra sicura #40 per sviluppo core; se attestata, priorità #20 TC-CORE-01 con prerequisiti applicabili. PASS9 non prova durabilità archivio né finestra sicura. Se non attestata, segnalare blocker; criteri nuovi **OPEN / OWNER DECISION REQUIRED**.

### Residuo owner: audit412 dopo TC messo in sicurezza
Fonte [audit 412 FPT](https://github.com/zarbopiero963-droid/MatchPilot/issues/12#issuecomment-6025923710). Per ogni country/league/season registrare requested slug/resource/HTTP, alternative slug/rename/season/legacy/catalog stale/mapping, classificazione, azione/evidenza.
Stati: RECOVERED, RENAMED, FUTURE_NOT_PUBLISHED, LEGITIMATELY_UNAVAILABLE, DEPRECATED, MAPPING_ERROR, NEEDS_MANUAL_REVIEW. Gate: **412/412**, zero non classificati, recuperi acquisiti/persistiti, catalogo aggiornato, niente retry inutile, hard verification reale, CI/review. NEEDS_MANUAL_REVIEW conserva il blocker, non prova il recupero.
[decisione TC urgente](https://github.com/zarbopiero963-droid/MatchPilot/issues/20#issuecomment-6025831223): TC feed core primario urgente appena #40 permette finestra sicura, scadenza11/10/2026 15:20:27 Rome; poi audit412 FPT prima dei downstream non urgenti.

### Rischio aperto PIT / parser / identità / reprocessing FPT — #12

Contratto vigente: **stesso timestamp T + stesso data contract version → stesso risultato riproducibile**, usando soltanto dati disponibili a T; nessuna riscrittura silenziosa.
Evidenza tecnica su main `5b39f33`:
- `src/providers/futpython/reprocess.mjs::reprocessRaw` inserisce nuovo output parser con l'`acquired_at` dello snapshot originale;
- `migrations/014-fpt-normalized-layer.sql::fpt_match_facts_at` seleziona `acquired_at <= T` e ordina anche per `version_id DESC`, senza argomento di versione parser/data-contract; `fpt_match_facts` segue l'output più recente;
- `test/fpt-reprocessing.test.mjs` prova dry-run/apply/idempotenza/raw intatto e facts aggiornati, ma non certifica invariabilità di una stessa query storica prima/dopo cambio parser/identity mapping.

Il dry-run no-op certificato il 05/10 non dimostra questo caso. Registrare in #12: data disponibile/osservata a T, snapshot ID/hash, versione parser/schema/transform/data-contract, identità e mapping/versioni, reprocessing run/time, output e test **prima e dopo la correzione**. Test richiesti: T anteriore/posteriore a ingest/correzione, parser v1/v2, rename/alias/cambio ID, aggregati senza futuro, riproduzione delle versioni storiche e raw immutato. **RISCHIO APERTO**, nessuna correzione runtime qui. La scelta non registrata tra replay “come conosciuto allora” e ricostruzione col parser nuovo è **OPEN / OWNER DECISION REQUIRED**; il requisito di riproducibilità resta vincolante. Apply produzione e cancellazione raw richiedono autorizzazione specifica owner.

### Ownership e certificazione
Solo calcio, FPT ∩ TC VERIFIED; discovery empirica TC e shared ingestion/computation vigenti (fonti consolidate nella #3/#97/#104).
#12 dati/query/schema/PIT FPT; #20 TC; #31 cross-provider; **#96 policy/risk/MM; #99 ledger/accounting/positions/settlement; #100 market rules; #28 trading intent; #34 Indicator Library/DSL**. Queryability/filter registry non crea un secondo owner DSL.
Separare implementazione, certificazione componente (hard evidence scoped) e certificazione integrata #98 dopo domini/consumer reali. Mock/CI/merge non provano integrazione.
**SUPERSEDED:** claim storico di zero residuo/chiudibilità globale #12, “82 PR residue verificate” #104, vecchie ownership accounting #96 e DSL duplicata. Le vecchie checklist sotto conservano specifiche/test; lo stato delle fasi già eseguite è nelle evidenze storiche, non negli checkbox originali.
**#40 corrente:** freeze invariato, #124 merge1d835a7, dep-db31j36gekts73acrqg0/istanza m7rgj; PASS9 alle11:06:28Z07/10, mismatch0. Portabilità DuckDB/punti10–16 aperti; nessuno shutdown autorizzato.

### Decisioni aperte / chiusura
**OPEN / OWNER DECISION REQUIRED:** punto10+/shutdown #40, criteri nuovi finestra sicura, semantica PIT non registrata, apply produzione/raw deletion/promozione nuova lega, WeWeb #91, altri sport/overlap, BetsAPI core e real execution #45.
Per chiudibilità #12 servono tutti requisiti vigenti e gate, compresi audit412 e PIT applicabili, hard evidence e limiti espliciti; commento finale e issue OPEN all'owner. Il certificato del05/10 non viene riscritto.

---

## Contratto dettagliato conservato
Requisiti/test/acceptance sotto restano validi dove non contraddetti dalle decisioni vigenti sopra; indicazioni obsolete di stato/sequenza/ownership sono SUPERSEDED, senza perdere scope o evidenze.

# FutPythonTrader — chiusura operativa e certificazione reale

Questa issue governa la **chiusura definitiva del blocco FutPythonTrader** nel nuovo MatchPilot Sports Trading OS.

Riferimento master: #3.

## Regola principale

FutPythonTrader può essere dichiarato **“CHIUSO / CERTIFICATO”** solo quando tutti i punti di questa issue sono completati con **evidenza reale**, test eseguiti su infrastruttura effettiva e risultati documentati.

Non basta che il codice esista.
Non basta che i test unitari passino.
Non basta che un endpoint risponda.

Ogni voce deve essere:
1. implementata;
2. testata;
3. verificata su Render/Neon reali;
4. documentata con numeri reali;
5. certificata solo dopo controllo finale.

---

# Vincolo operativo PR

## Una PR alla volta

- Deve esistere **una sola PR aperta alla volta** per questa issue.
- La PR successiva parte solo dopo:
  - CI verde;
  - test reali completati;
  - review/thread chiusi;
  - verifica dei criteri di accettazione;
  - merge della PR precedente.
- Nessuna PR può essere dichiarata pronta solo perché “sembra funzionare”.
- Ogni PR deve avere una sezione **EVIDENZA REALE** con output verificato.
- Se un test reale fallisce, la PR resta aperta fino alla correzione.
- Vietato marcare checklist completate in anticipo.

---

# Obiettivo finale

Dobbiamo poter produrre un certificato finale con almeno:

- numero paesi;
- numero leghe;
- numero stagioni/dataset;
- dataset available;
- dataset unavailable_404;
- dataset in errore reale;
- totale snapshot raw;
- totale partite/versioni importate;
- totale match unici;
- totale colonne/campi unici;
- coverage per ogni colonna;
- campi nuovi rilevati automaticamente;
- stagioni mancanti;
- duplicazioni rilevate;
- stato secondo sync incrementale;
- anomalie residue;
- timestamp UTC della certificazione;
- commit SHA del codice certificato;
- versione schema/migrazioni.

---

# FASE 1 — Backfill storico completo

## Obiettivo
Scaricare tutti i dataset FutPythonTrader realmente disponibili.

- [ ] enumerare catalogo ufficiale completo;
- [ ] congelare snapshot catalogo usato per la certificazione;
- [ ] avviare backfill storico completo;
- [ ] usare job restartable/checkpoint;
- [ ] non ripetere dataset già completati;
- [ ] classificare 404 iniziali come unavailable_404;
- [ ] distinguere 404 regressivi da 404 mai disponibili;
- [ ] registrare ogni errore reale;
- [ ] completare il backfill fino a esaurimento catalogo;
- [ ] verificare che nessun dataset resti in stato indefinito.

### Test reali obbligatori
- [ ] interrompere/riprendere il backfill e verificare resume reale;
- [ ] verificare deduplica snapshot su almeno 3 dataset;
- [ ] verificare un dataset multi-stagione;
- [ ] verificare almeno un dataset con 404;
- [ ] verificare almeno un dataset disponibile con dati completi;
- [ ] verificare che nessun secret compaia nei log.

### Evidenza da annotare
- catalog_entries=
- attempted=
- available=
- unavailable_404=
- real_errors=
- completed=
- skipped_resume=
- started_at=
- finished_at=

---

# FASE 2 — Classificazione completa dataset

## Obiettivo
Ogni dataset deve appartenere a uno stato finale esplicito.

Stati ammessi:
- AVAILABLE
- UNAVAILABLE_404
- ERROR_REAL
- DEPRECATED/REMOVED se FutPythonTrader lo rimuove dal catalogo

- [ ] query di audit su tutti i dataset;
- [ ] zero dataset senza classificazione;
- [ ] zero dataset duplicati per country/league/season;
- [ ] verificare first_seen / last_seen;
- [ ] verificare last_synced_at;
- [ ] verificare reason per unavailable/error.

### Acceptance
`available + unavailable_404 + error_real + deprecated = total_catalog_datasets`

Deve tornare esattamente.

---

# FASE 3 — Conteggio reale partite e snapshot

- [ ] contare snapshot raw;
- [ ] contare versioni partita;
- [ ] contare match_key unici;
- [ ] contare righe per dataset;
- [ ] contare righe per lega;
- [ ] contare righe per stagione;
- [ ] verificare collisioni match_key;
- [ ] verificare righe senza Home/Away/Date quando dovrebbero essere presenti;
- [ ] verificare payload vuoti o CSV malformati;
- [ ] verificare coerenza row_count snapshot vs parser.

### Test reali
Campione minimo:
- [ ] 10 dataset random;
- [ ] 3 paesi;
- [ ] 3 formati stagionali differenti;
- [ ] 1 dataset piccolo;
- [ ] 1 dataset grande.

---

# FASE 4 — Censimento finale colonne

## Obiettivo
Censire **tutte le colonne realmente restituite da FutPythonTrader**.

- [ ] numero totale colonne uniche;
- [ ] nome esatto;
- [ ] tipo inferito;
- [ ] famiglia;
- [ ] first_seen;
- [ ] last_seen;
- [ ] datasets_seen;
- [ ] rows_seen;
- [ ] nonempty_seen;
- [ ] sample values;
- [ ] rilevare eventuali collisioni di tipo;
- [ ] rilevare colonne quasi identiche / alias potenziali;
- [ ] nessuna colonna sconosciuta scartata.

### Test
Inserire fixture con una colonna nuova artificiale e verificare:
- [ ] discovery;
- [ ] persistenza;
- [ ] coverage;
- [ ] nessuna modifica codice necessaria.

---

# FASE 5 — Coverage reale per ogni colonna

Per ogni campo:

`coverage = nonempty_seen / rows_seen`

- [ ] coverage globale;
- [ ] coverage per dataset;
- [ ] coverage per lega;
- [ ] coverage per stagione;
- [ ] coverage per periodo;
- [ ] individuare colonne sparse;
- [ ] individuare colonne sempre vuote;
- [ ] individuare colonne presenti solo in alcune competizioni;
- [ ] report ordinabile per coverage.

### Acceptance
Ogni colonna deve avere coverage calcolabile e non ambiguo.

---

# FASE 6 — Audit stagioni mancanti

## Obiettivo
Dimostrare che non abbiamo saltato stagioni realmente disponibili.

- [ ] confrontare catalogo ufficiale vs fpt_catalog;
- [ ] confrontare fpt_catalog vs snapshot presenti;
- [ ] verificare gap per country/league;
- [ ] produrre lista stagioni mancanti;
- [ ] distinguere unavailable_404 da non tentato;
- [ ] zero stagioni available non acquisite.

### Acceptance
`missing_available_seasons = 0`

---

# FASE 7 — Secondo sync incrementale reale

Dopo il backfill:

- [ ] eseguire un primo sync incrementale;
- [ ] registrare conteggi;
- [ ] attendere/cambiare almeno un dataset reale oppure usare una finestra utile;
- [ ] eseguire un secondo sync incrementale reale;
- [ ] verificare idempotenza;
- [ ] verificare che snapshot identici non vengano duplicati;
- [ ] verificare che versioni identiche non vengano duplicate;
- [ ] verificare che righe aggiornate producano nuova versione solo se cambiate;
- [ ] verificare nuove colonne/dataset aggregate correttamente;
- [ ] verificare alert Telegram senza spam;
- [ ] verificare recovery degli errori.

### Acceptance
Se nessun dato upstream cambia:
- nuovi snapshot duplicati = 0
- nuove versioni duplicate = 0

Se cambia:
- solo dati realmente modificati generano nuova versione.

---

# FASE 8 — Data Health e Watchdog

- [ ] verificare /api/data-health;
- [ ] last successful sync corretto;
- [ ] dataset errors corretto;
- [ ] alert aperti corretti;
- [ ] stale detection;
- [ ] test di sync fallito simulato;
- [ ] test recovery;
- [ ] test nuova colonna;
- [ ] test nuovo dataset;
- [ ] test row-count drop;
- [ ] test aggregazione Telegram;
- [ ] nessun alert individuale massivo.

### Test reale Telegram
- [ ] massimo un riepilogo per categoria/run;
- [ ] outbound-only confermato;
- [ ] nessuna risposta a messaggi inbound;
- [ ] whitelist chat rispettata.

---

# FASE 9 — Certificato FutPythonTrader

Creare nel repository un documento versionato:

`docs/futpython-certification-YYYY-MM-DD.md`

Deve contenere:

## Identità certificazione
- commit SHA;
- data/ora UTC;
- ambiente Render;
- database Neon;
- versione migration/schema;
- versione Node;
- endpoint FutPythonTrader usati.

## Catalogo
- paesi;
- leghe;
- dataset/stagioni totali;
- available;
- unavailable_404;
- error_real;
- deprecated.

## Dati
- snapshot;
- righe importate;
- match unici;
- versioni match;
- range temporale minimo/massimo.

## Schema
- numero colonne;
- lista completa;
- tipo;
- famiglia;
- coverage;
- anomalie tipo.

## Integrità
- duplicati;
- collisioni;
- malformed rows;
- missing seasons;
- sync idempotency;
- retry/resume.

## Alerting
- watchdog;
- Telegram;
- stale detection;
- regressioni.

## Esito finale

Uno solo tra:

### ✅ CERTIFIED
Tutti i criteri passati.

### ⚠️ CERTIFIED WITH KNOWN LIMITATIONS
Solo limiti upstream/documentati, nessuna perdita dati nostra.

### ❌ NOT CERTIFIED
Qualsiasi errore nostro ancora aperto.

---

# Gate finale “FutPythonTrader è chiuso”

Possiamo scrivere **“FutPythonTrader è chiuso”** solo se:

- [ ] backfill completo;
- [ ] tutti i dataset classificati;
- [ ] conteggi reali riconciliati;
- [ ] colonne censite;
- [ ] coverage completo;
- [ ] missing available seasons = 0;
- [ ] secondo sync incrementale verificato;
- [ ] nessuna duplicazione indebita;
- [ ] watchdog certificato;
- [ ] alert Telegram certificati;
- [ ] certificato finale prodotto;
- [ ] CI verde;
- [ ] review/thread chiusi;
- [ ] nessun ERROR_REAL irrisolto imputabile a MatchPilot.

Solo allora aggiornare README/master #3 marcando FutPythonTrader come **CERTIFIED / CLOSED**.


---

# Piano PR obbligatorio — integrazione FutPythonTrader 100%

Questa sezione trasforma le fasi precedenti in una sequenza **PR-by-PR vincolante**.

## Stato FASE 1 già eseguito

La FASE 1 è stata implementata e corretta attraverso PR seriali, tutte una alla volta:

- #13 — backfill storico e stato certificabile;
- #14 — reconcile resume e run interrotti;
- #15 — batch persistence per backfill reale;
- #16 — contatori run certificabili;
- #17 — verifier reale + ledger di certificazione;
- #18 — catalogo storico completo multi-stagione;
- #19 — sincronizzazione README / CLAUDE.md / AGENTS.md con protocollo FPT-CERT.

Queste PR NON equivalgono automaticamente a “FASE 1 certificata”: la certificazione avviene solo dopo i test hard reali richiesti sotto.

---

## FPT-PR-01 — FASE 1: chiusura backfill storico reale

### Scope
- eseguire il backfill sul catalogo storico completo;
- portare ogni dataset a stato terminale;
- confermare resume/checkpoint;
- confermare deduplica;
- chiudere eventuali errori reali imputabili a MatchPilot.

### Hard test reali obbligatori
- Render reale;
- Neon reale;
- interruzione + resume reale;
- almeno 3 dataset con deduplica snapshot/versioni;
- almeno 1 dataset disponibile;
- almeno 1 unavailable_404;
- almeno 1 lega multi-stagione;
- verifica secret leakage nei log;
- `undefined_states = 0`.

### Gate merge/chiusura
- catalogo completo processato;
- `AVAILABLE + UNAVAILABLE_404 + ERROR_REAL + DEPRECATED = TOTAL`;
- nessun dataset ancora `unknown`;
- eventuale `ERROR_REAL` spiegato e non imputabile a bug MatchPilot oppure corretto prima di chiudere la fase.

---

## FPT-PR-02 — FASE 2: classificazione terminale di ogni dataset

### Scope
- audit completo stato dataset;
- first_seen / last_seen / last_synced_at;
- reason coerente per unavailable/error;
- zero duplicati country/league/season.

### Hard test reali
- query Neon sull'intero catalogo;
- riconciliazione matematica degli stati;
- verifica manuale campione AVAILABLE / UNAVAILABLE_404 / ERROR_REAL;
- verifica regressione 404 vs 404 iniziale.

### Gate
`classified_total === catalog_total`

e

`unclassified = 0`.

---

## FPT-PR-03 — FASE 3: integrità snapshot, righe e match

### Scope
- snapshot raw;
- versioni partita;
- match unici;
- righe per dataset/lega/stagione;
- collisioni match_key;
- righe malformate;
- coerenza snapshot row_count vs parser.

### Hard test reali
Minimo:
- 10 dataset reali;
- 3 paesi;
- 3 formati stagionali;
- 1 dataset piccolo;
- 1 dataset grande;
- confronto raw CSV ↔ rows parser ↔ rows DB;
- collision audit globale.

### Gate
- zero collisioni non spiegate;
- zero perdita righe imputabile a MatchPilot;
- row_count riconciliato.

---

## FPT-PR-04 — FASE 4: censimento schema/colonne 100%

### Scope
Per ogni campo:
- nome;
- tipo inferito;
- famiglia;
- first_seen;
- last_seen;
- datasets_seen;
- rows_seen;
- nonempty_seen;
- sample values;
- type collision;
- alias potenziali.

### Hard test reali
- confronto registry vs header raw reali;
- fixture con colonna artificiale nuova;
- ingest senza modifica codice;
- verifica persistenza e discovery;
- verifica che nessuna colonna upstream venga scartata.

### Gate
`raw_unique_fields === registry_unique_fields`

salvo alias documentati esplicitamente.

---

## FPT-PR-05 — FASE 5: coverage completa

### Scope
Coverage:
- globale;
- per dataset;
- per lega;
- per stagione;
- per periodo.

Classificare:
- dense;
- sparse;
- always-empty;
- league-specific;
- season-specific.

### Hard test reali
- calcolo Neon sull'intero mirror;
- ricalcolo indipendente su campione raw;
- confronto numerico con tolleranza zero sui conteggi N/nonempty.

### Gate
Ogni campo ha coverage deterministica e riconciliata.

---

## FPT-PR-06 — FASE 6: audit stagioni mancanti

### Scope
- catalogo ufficiale vs mirror;
- catalogo vs snapshot;
- gap per country/league;
- unavailable_404 vs mai tentato;
- deprecated/removed.

### Hard test reali
- nuovo fetch catalogo upstream;
- diff automatico;
- verifica manuale di un campione di gap;
- verifica multi-stagione reale.

### Gate
`missing_available_seasons = 0`.

---

## FPT-PR-07 — FASE 7: due sync incrementali reali + idempotenza

### Scope
- sync incrementale #1;
- sync incrementale #2;
- confronto snapshot/versioni;
- aggiornamenti reali;
- no duplicati;
- recovery errori.

### Hard test reali
Run A e Run B su Render/Neon reali.

Se upstream invariato:
- snapshot duplicati nuovi = 0;
- versioni duplicate nuove = 0.

Se upstream cambia:
- solo payload realmente modificati generano una nuova versione.

Verificare anche:
- nuove colonne aggregate;
- nuovi dataset aggregate;
- alert Telegram non spammanti.

### Gate
Idempotenza dimostrata con contatori prima/dopo.

---

## FPT-PR-08 — FASE 8: watchdog e Telegram hard certification

### Scope
- /api/data-health;
- stale detection;
- sync failure;
- recovery;
- new field;
- new dataset;
- row-count drop;
- alert aggregation;
- outbound-only;
- whitelist chat.

### Hard test reali
In ambiente reale controllato:
- simulare failure;
- verificare alert;
- ripristinare;
- verificare resolve;
- confermare massimo un riepilogo per categoria/run;
- inviare messaggio inbound al bot e confermare zero risposta/azione.

### Gate
Watchdog e Telegram risultano VERIFIED REAL.

---

## FPT-PR-09 — FASE 9: certificato finale + chiusura

### Scope
Generare:

`docs/futpython-certification-YYYY-MM-DD.md`

con tutti i conteggi e gli hash finali.

### Hard test finali
- ripetere tutte le query di riconciliazione;
- verificare commit SHA certificato;
- verificare migration/schema version;
- verificare endpoint di health/certification;
- verificare zero gate aperti nella #12;
- verificare README / CLAUDE.md / AGENTS.md coerenti.

### Gate finale
Uno solo:

- ✅ CERTIFIED
- ⚠️ CERTIFIED WITH KNOWN LIMITATIONS
- ❌ NOT CERTIFIED

Solo con esito ✅ o, se autorizzato dall'owner e solo per limiti upstream documentati, ⚠️, è permesso aggiornare README e master #3 con:

**FutPythonTrader CLOSED / CERTIFIED**

---

# Regola per eventuali fix PR

Se una PR di fase fallisce un hard test reale:

- non si passa alla PR successiva;
- la correzione resta nella stessa fase;
- può essere necessaria una PR fix separata, ma solo dopo la chiusura della PR corrente;
- il numero logico della fase non cambia;
- README deve annotare finding e correzione;
- la checklist della fase resta aperta finché il test reale non passa.

# Regola evidenza hard

Per “test hard reale” si intende almeno una evidenza proveniente da infrastruttura reale:
- Render deploy/log;
- Neon query/ledger;
- endpoint MatchPilot live;
- risposta FutPythonTrader reale;
- Telegram reale;
- snapshot/hash persistito.

Mock/unit test sono obbligatori dove pertinenti, ma **non sostituiscono** i test hard reali.


---

## Regola di chiudibilità / owner gate

Questa issue **non deve essere chiusa automaticamente dall'agente**.

Quando ogni punto del contenuto risulta realmente implementato, testato, verificato e documentato, l'agente deve pubblicare un **commento finale di chiudibilità** con:
- stato `READY TO CLOSE / CHIUDIBILE`;
- checklist completa dei punti e relativo esito;
- PR/commit;
- CI/review status;
- evidenze reali richieste;
- eventuali limiti noti;
- conferma che non restano punti aperti.

Dopo quel commento, l'issue resta **OPEN** e viene chiusa dall'owner.

Solo se l'owner autorizza esplicitamente l'agente a chiudere **questa specifica issue**, l'agente può chiuderla dopo il commento finale e una nuova verifica dei gate.


---

# API Budget / Request Economy — regola obbligatoria

MatchPilot deve minimizzare il consumo di richieste verso **FutPythonTrader** e **TotalCorner**.

L'obiettivo non è solo rispettare il rate limit, ma evitare sprechi che possano:
- esaurire quota giornaliera/mensile;
- causare 429;
- provocare blocchi temporanei;
- aumentare costi;
- degradare il servizio;
- impedire il live collector nei momenti importanti.

## Principio

Prima di chiamare un provider chiedere sempre:

**“Questo dato è già disponibile e sufficientemente fresco nel nostro database/cache?”**

Se sì, NON chiamare l'API.

## Request deduplication

Obbligatorio:
- stessa richiesta contemporanea → una sola chiamata upstream;
- le richieste concorrenti devono condividere la stessa Promise/job;
- evitare N chiamate identiche da N utenti;
- frontend multipli non devono moltiplicare le chiamate provider.

Schema:
`100 utenti → 1 fetch provider → DB/cache → 100 response MatchPilot`

Mai:
`100 utenti → 100 fetch provider`.

## Cache-first

Usare:
1. database persistente;
2. cache server-side;
3. provider solo quando necessario.

TTL differenziato:
- storico concluso: molto lungo / immutable;
- pre-match: TTL medio;
- live: TTL corto;
- metadata/league: TTL lungo;
- schema/catalogo: refresh programmato, non per pagina.

## FutPythonTrader

Evitare:
- riscaricare storico immutato;
- riscaricare stagioni completate;
- chiamare catalog/schema ad ogni richiesta utente;
- chiamare jogos-do-dia più volte senza necessità;
- sincronizzazioni duplicate dovute a restart/deploy.

Usare:
- snapshot hash;
- checkpoint;
- resume;
- incremental sync;
- cached catalog;
- schedule intelligente;
- advisory lock.

## TotalCorner

Il live polling deve essere **centralizzato per match**, non per utente.

Una partita live deve avere un solo collector MatchPilot.

Gli utenti leggono dal nostro stream/database.

Polling adattivo:
- molto prima del kickoff → bassa frequenza;
- vicino al kickoff → media frequenza;
- LIVE → frequenza necessaria;
- HT → rallentare dove sensato;
- FT → interrompere il polling live dopo final reconciliation;
- match postponed/cancelled → stop;
- match senza utenti attivi può comunque essere raccolto se richiesto dallo storico, ma secondo budget globale.

## Adaptive polling

La frequenza deve poter cambiare in base a:
- status match;
- minuto;
- numero match live simultanei;
- quota API residua;
- 429 recenti;
- latency/error rate;
- priorità campionato/match;
- necessità di HISTORICAL_CAPTURED.

## Provider budgets

Creare budget separati:
- FutPythonTrader requests/minute;
- FutPythonTrader requests/day;
- TotalCorner requests/minute;
- TotalCorner requests/day se applicabile.

I valori devono essere configurabili e basati sul piano reale, non hardcoded senza verifica.

Env concettuali:
- `FUTPYTHON_REQUESTS_PER_MINUTE`
- `FUTPYTHON_REQUESTS_PER_DAY`
- `TOTALCORNER_REQUESTS_PER_MINUTE`
- `TOTALCORNER_REQUESTS_PER_DAY`
- `API_BUDGET_WARNING_PCT`
- `API_BUDGET_CRITICAL_PCT`

## Request ledger

Persistire almeno:
- provider;
- endpoint family;
- timestamp;
- outcome;
- HTTP status;
- latency;
- cache_hit/cache_miss;
- deduped=true/false;
- retry count;
- estimated/known quota remaining quando disponibile.

Mai salvare token/secret.

## Budget states

- NORMAL
- ELEVATED
- CONSERVE
- CRITICAL
- EXHAUSTED

In CONSERVE:
- ridurre chiamate non essenziali;
- allungare TTL;
- sospendere discovery non urgente;
- preservare live core.

In CRITICAL:
priorità:
1. live match state;
2. live markets necessari al Trading Engine;
3. final reconciliation;
4. pre-match imminente;
5. storico/backfill;
6. discovery/schema non urgente.

## 429 / Retry-After

Su 429:
- rispettare Retry-After quando presente;
- exponential backoff;
- jitter;
- niente retry storm;
- circuit breaker;
- ridurre temporaneamente polling.

## 5xx/network errors

- retry limitato;
- backoff;
- nessun loop stretto;
- usare ultimo snapshot valido con STALE flag;
- reconciliation successiva.

## Startup protection

Un restart/deploy NON deve:
- rilanciare massivamente tutto lo storico;
- resettare i budget;
- duplicare collector live;
- creare thundering herd.

Checkpoint e lock devono impedire consumo duplicato.

## Backfill throttling

I backfill storici devono:
- avere rate limit separato;
- cedere priorità al live;
- essere pausable/resumable;
- fermarsi automaticamente se il budget entra in CONSERVE/CRITICAL.

## User traffic isolation

Il numero di utenti SaaS non deve determinare linearmente il numero di chiamate upstream.

Il provider viene interrogato da MatchPilot; gli utenti leggono il dato normalizzato interno.

## Alert Telegram

Stessa chat configurata.

Alert:
- WARNING a soglia configurabile (es. 70-80%);
- CRITICAL vicino all'esaurimento;
- 429 ripetuti;
- circuit breaker aperto;
- quota esaurita;
- consumo anomalo rispetto alla baseline.

Anti-spam con summary aggregato.

## Hard test reali

Certificare:
- 20 richieste frontend simultanee → una sola chiamata upstream equivalente;
- cache hit → zero upstream;
- restart → nessun burst massivo;
- 429 → backoff corretto;
- live ha priorità sul backfill;
- FT interrompe polling live;
- budget CONSERVE riduce traffico non essenziale;
- request ledger riconcilia il numero reale di chiamate;
- nessun token nei log.

## Gate

Nessuna pipeline FutPythonTrader/TotalCorner può essere dichiarata CERTIFIED senza:
- request deduplication;
- cache-first;
- provider budget;
- rate limiter;
- adaptive polling dove applicabile;
- 429/backoff;
- request ledger;
- alert consumo;
- hard test reali.


---

# Architettura dati — Provider → MatchPilot → Database → Client

## Principio

Le API esterne **non sono il data source diretto del browser**.

Architettura obbligatoria:

`FutPythonTrader / TotalCorner → MatchPilot Backend → Neon/Database → MatchPilot API → Browser`

Per il realtime:

`TotalCorner → MatchPilot Live Collector → Neon + Realtime Stream → Browser`

Il frontend deve interrogare le API MatchPilot, non i provider esterni.

---

# Pre-match

## FutPythonTrader

Lo storico e le statistiche pre-match devono essere:

1. acquisiti dal provider;
2. persistiti nel nostro database;
3. aggiornati tramite sync incrementale;
4. serviti al sito dal database.

Una pagina aperta da un utente **non deve generare una nuova chiamata FutPythonTrader** se il dato è già presente e fresco.

Lo storico già acquisito non va riscaricato inutilmente.

## TotalCorner pre-match

Le quote/linee pre-match possono cambiare, quindi vanno acquisite con snapshot programmati.

Esempio concettuale:
- molto prima del kickoff → frequenza bassa;
- avvicinandosi al kickoff → frequenza maggiore;
- snapshot opening;
- snapshot intermedi;
- ultimo snapshot pre-kickoff.

Ogni snapshot viene salvato nel DB.

Quando l'utente apre una partita, legge:
- opening;
- current/last prematch;
- movement;

dal nostro database, non direttamente da TotalCorner.

---

# Live

Il live è l'unica area che richiede polling frequente del provider.

Regola:

**un solo collector centralizzato per match**

Non un collector per utente.

Esempio:

`200 utenti guardano Juventus–Milan → 1 collector MatchPilot → 200 client ricevono lo stesso stream`

Mai:

`200 utenti → 200 polling TotalCorner`.

Il collector:
- acquisisce lo snapshot;
- lo salva in Neon;
- aggiorna il realtime stream;
- tutti i client ricevono il dato via WebSocket/SSE.

---

# Partita conclusa

A FT:

1. stop polling live;
2. final reconciliation;
3. salvataggio snapshot finale;
4. eventuale recupero dati mancanti;
5. archiviazione definitiva.

Dopo FT:
- Match Replay usa il nostro DB;
- Match Center usa il nostro DB;
- Analysis Hub usa il nostro DB;
- backtest usa il nostro DB;
- post-mortem usa il nostro DB.

La consultazione storica **non deve consumare nuove chiamate TotalCorner** salvo reconciliation esplicitamente necessaria.

---

# Ruolo dei componenti

## Provider esterni
Funzione:
**acquisizione dati**

## Neon / Database
Funzione:
**memoria persistente MatchPilot**

## MatchPilot Backend/API
Funzione:
**normalizzazione, autorizzazione e serving**

## WebSocket/SSE
Funzione:
**distribuzione realtime al browser**

## Browser
Funzione:
**visualizzazione e interazione**

Il browser non deve orchestrare ingestion upstream.

---

# Scalabilità SaaS

Il consumo upstream deve essere quasi indipendente dal numero di utenti.

Obiettivo:

`N utenti ≠ N chiamate provider`

ma:

`N utenti → stesso dato interno già acquisito`

Questo è obbligatorio per:
- controllo costi;
- rate limit;
- resilienza;
- performance;
- futuro SaaS multiutente.

---

# Cache strategy

Ordine preferenziale:

1. cache server-side;
2. database;
3. provider solo se dato mancante/scaduto.

Mai chiamare il provider prima di controllare se il dato esiste già internamente.

---

# Freshness policy

Ogni famiglia dati deve avere una policy di freshness:

## Storico concluso
- immutable / long TTL.

## Stagione corrente
- sync incrementale.

## Pre-match
- snapshot schedule adattivo.

## Live
- short polling adattivo.

## FT
- final reconciliation e stop collector.

---

# Acceptance

Questa architettura è considerata implementata solo se:

- [ ] frontend non chiama FutPythonTrader;
- [ ] frontend non chiama TotalCorner;
- [ ] storico FutPython viene servito da DB;
- [ ] pre-match TotalCorner viene servito da DB;
- [ ] live usa collector centralizzato;
- [ ] utenti multipli non moltiplicano polling;
- [ ] FT interrompe polling;
- [ ] Replay legge solo storico interno;
- [ ] backtest legge solo storico interno;
- [ ] cache/database vengono controllati prima del provider;
- [ ] hard test dimostra 20 client → una sola richiesta upstream equivalente.


---

# Queryability / Filterability — contratto dati obbligatorio

I dati FutPythonTrader e TotalCorner non devono essere soltanto archiviati: devono essere **interrogabili in modo efficiente, coerente e combinabile**.

Obiettivo:

`raw provider → normalized facts → indexed query layer → filters/UI/agent analysis`

## Doppio livello obbligatorio

### 1. Raw immutable
Conservare:
- payload originale;
- provider timestamp;
- acquired_at;
- hash;
- provenance;
- schema version.

Serve per audit/replay/reprocessing.

### 2. Normalized query layer
Estrarre in tabelle/viste interrogabili i campi utili per:
- filtri sito;
- confronti Home/Away/Both;
- analytics;
- Trading Engine;
- richieste dirette dell'assistente/agente;
- backtest;
- replay;
- reporting.

Mai costringere il prodotto a rileggere ogni volta JSON raw completo per query comuni.

---

# Chiavi canoniche

Ogni dato deve poter essere collegato tramite identificatori canonici:

- internal_match_id
- internal_competition_id
- internal_team_id
- season_id
- provider_match_id
- provider_competition_id
- provider_team_id
- kickoff_utc
- home_team_id
- away_team_id

Il mapping provider deve essere persistente e auditabile.

---

# Dimensioni filtro minime

## Match
- date/date range
- kickoff time
- status
- minute
- score
- HT score
- FT score

## Competition
- country
- league
- season
- round
- competition type

## Team
- home
- away
- both
- venue
- team-specific history

## Sample
- last 5
- last 10
- last 20
- last 30
- season
- custom N
- custom date range

## Strength/context
- favorite/underdog
- current odds band
- opening odds band
- similar odds
- stronger/similar/weaker opponent
- rank/rating band

## Goals
- scored
- conceded
- BTTS
- clean sheet
- failed to score
- Over/Under thresholds
- exact score
- score state
- first scorer
- comeback/lost lead

## Time
- HT
- 2H
- 0-15
- 16-30
- 31-45
- 46-60
- 61-75
- 76-90
- custom minute range

## Advanced stats
Quando disponibili:
- xG/xGA/xGOT/xA
- shots
- SOT
- possession
- attacks
- dangerous attacks
- corners
- cards
- passing
- defensive actions
- chance creation

## Markets
- 1X2
- Asian
- Goal Line
- Corner Line
- HT markets
- opening/current/closing/live
- market movement
- fair price
- edge

---

# Live queryability

Per TotalCorner live, ogni snapshot deve poter essere filtrato per:

- match_id
- timestamp
- minute
- score state
- stat ranges
- market ranges
- event presence
- rolling-window features

Esempi futuri:
- tutti i match dove al 70' score=1-0;
- dangerous attacks away > threshold;
- SOT delta ultimi 10 minuti > X;
- lay 1-0 price tra 6 e 10;
- home favorite prematch;
- league specific.

---

# Derived facts

Creare layer derivato versionato per query frequenti:

- rolling stats 5/10/15 min;
- score state duration;
- first goal state;
- lead/trail duration;
- market movement delta;
- pressure features;
- comparable scenario tags;
- home/away splits;
- opponent strength bands;
- odds buckets;
- historical sample membership.

Ogni derivazione deve avere:
- formula/version;
- source snapshot ids;
- computed_at;
- no future leakage.

---

# Indici

Creare indici DB coerenti con i filtri principali, almeno su:

- match_id
- competition_id
- team_id
- season
- kickoff_utc
- status
- provider_timestamp
- minute
- score
- market_type
- snapshot timestamp

Valutare indici compositi per query reali.

---

# Assistant / agent query layer

L'assistente deve poter interrogare MatchPilot senza accedere direttamente ai provider.

Prevedere API/query interne per richieste tipo:

- "ultime 20 trasferte del team X";
- "solo quando era favorito tra 1.50 e 1.90";
- "partite finite 1-0 con pressione alta dopo il 70'";
- "campionati dove Lay 0-0 ha frequenza finale < 8%";
- "mostrami match con score 1-0 e dangerous attacks away in crescita";
- "confronta home vs away su xG, SOT e corners".

Queste query devono usare il database normalizzato, non chiamare FutPythonTrader/TotalCorner in tempo reale salvo dati mancanti/stale e regole di sync.

---

# Filter metadata registry

Creare registro dei filtri disponibili:

- field
- provider/source
- normalized field
- type
- allowed operators
- min/max
- enum values
- coverage
- indexed yes/no
- live/prematch/historical
- first_seen
- last_seen

Così UI e agent possono sapere automaticamente quali filtri sono disponibili.

---

# Operatori filtro

Supportare dove sensato:
- =
- !=
- >
- >=
- <
- <=
- between
- in
- not in
- contains
- exists
- missing

---

# Query safety/performance

- pagination;
- limit;
- timeout;
- query cost guard;
- no full table scan per filtri comuni;
- explain/analyze per query critiche;
- caching risultati frequenti;
- materialized views solo se utili e mantenibili.

---

# Acceptance

I provider sono considerati integrati correttamente solo se:

- [ ] raw completo preservato;
- [ ] normalized layer disponibile;
- [ ] mapping canonico provider→internal;
- [ ] campi chiave indicizzati;
- [ ] filter metadata registry;
- [ ] filtri Home/Away/Both;
- [ ] filtri 5/10/20/season/custom;
- [ ] filtri quote/market;
- [ ] filtri score/time state;
- [ ] filtri advanced stats;
- [ ] live snapshot queryable;
- [ ] derived facts versionati;
- [ ] assistant/agent può interrogare il DB interno;
- [ ] nessuna chiamata provider necessaria per query storiche già acquisite;
- [ ] hard test performance e correttezza.


---

# Composable Rule Engine — tutti i dati + combinazioni di filtri

## Obiettivo

MatchPilot deve supportare non solo filtri singoli, ma **regole composte arbitrariamente** usando tutti i dati realmente disponibili da FutPythonTrader, TotalCorner e dai layer derivati MatchPilot.

Esempio:

```
Venue = AWAY
AND Last N = 20
AND PrematchAwayOdds BETWEEN 2.00 AND 3.50
AND LiveMinute BETWEEN 65 AND 75
AND Score = 1-0
AND AwayDangerousAttacksRolling10m >= X
AND AwayShotsOnTarget >= 3
AND GoalLineLive >= 2.5
AND DataFreshness = FRESH
```

Questa combinazione deve poter essere usata come:

- filtro esplorativo nel sito;
- query analitica dell'assistente/agente;
- condizione di strategia;
- trigger live;
- criterio di backtest;
- criterio di alert;
- segmento storico.

---

# Regole AND / OR / NOT

Supportare gruppi annidati:

```
(A AND B AND C)
OR
(D AND E)
AND NOT F
```

Il Rule Builder deve permettere:
- AND;
- OR;
- NOT;
- nested groups;
- enable/disable singola condizione;
- reorder;
- duplicate group.

---

# Universo dei campi

Qualunque campo normalizzato e con coverage reale deve poter diventare una condizione, quando semanticamente valido.

Categorie:

## Identità
- country
- league
- season
- team
- opponent
- home/away
- round
- date/time

## Storico
- Last N
- W/D/L
- goals
- HT
- BTTS
- O/U
- exact score
- clean sheet
- first scorer
- score timing

## Advanced
- xG
- xGA
- xGOT
- xA
- shots
- SOT
- big chances
- possession
- passing
- defensive stats
- corners
- cards

## Pre-match markets
- opening 1X2
- latest prematch 1X2
- Asian
- Goal Line
- Corner Line
- market movement
- implied probability

## Live state
- minute
- score
- score duration
- attacks
- dangerous attacks
- shots
- SOT
- possession
- corners
- cards
- events

## Live markets
- 1X2
- Asian
- Goal Line
- Corner Line
- market movement
- price delta
- line delta

## Derived MatchPilot
- rolling 5/10/15m
- pressure
- momentum
- vulnerable score
- fair price
- edge
- confidence components
- data quality
- freshness
- opponent-strength band
- similar-odds bucket
- historical scenario frequency.

---

# Operatori

Supportare per tipo:

## Numeric
- =
- !=
- >
- >=
- <
- <=
- between
- outside range

## Enum/string
- is
- is not
- in
- not in

## Boolean
- true
- false

## Presence
- exists
- missing

## Temporal
- before
- after
- between minutes
- last N minutes
- since event
- within N minutes after event

## Change/delta
- increased by
- decreased by
- % change
- crossed threshold
- line changed
- odds shortened/drifted

---

# Rolling-window conditions

Live rules devono supportare condizioni temporali come:

- SOT negli ultimi 5 minuti;
- dangerous attacks ultimi 10 minuti;
- corners ultimi 15 minuti;
- variazione quota ultimi 3/5/10 minuti;
- pressione crescente per N snapshot consecutivi;
- nessun tiro negli ultimi N minuti.

Le rolling windows devono essere calcolate esclusivamente da snapshot precedenti o uguali al timestamp corrente.

---

# Historical aggregate conditions

Consentire:
- frequency >= X%;
- N >= soglia;
- ROI storico >= X;
- outcome rate;
- score persistence;
- next-goal rate;
- average minute;
- percentile/rank.

Ogni condizione aggregata deve mostrare sempre:
- N;
- finestra;
- coverage;
- metodologia/versione.

---

# Rule types

Una regola salvata può essere:

- FILTER_ONLY
- WATCHLIST
- PREMATCH_CANDIDATE
- LIVE_TRIGGER
- INVALIDATION
- EXIT
- HEDGE
- ALERT
- BACKTEST_SEGMENT

---

# Rule Builder UI

La UI deve consentire:

`Campo | Operatore | Valore`

Esempio:

`Away SOT rolling 10m | >= | 3`

Pulsanti:
- + AND
- + OR group
- NOT
- duplicate
- remove
- save preset
- test on history
- show matching matches

---

# Anteprima immediata

Mentre l'utente costruisce una regola mostrare:

- match che corrispondono;
- N storico;
- coverage;
- distribuzione outcome;
- eventuale ROI;
- warning sample basso;
- campi mancanti.

Mai dare significatività forte a N piccolo senza warning.

---

# Regole versionate

Ogni regola deve avere:

- rule_id;
- version;
- name;
- owner;
- definition JSON;
- created_at;
- updated_at;
- active;
- scope;
- data contract version.

Una modifica crea nuova versione per preservare backtest e audit.

---

# DSL / JSON contract

Prevedere un formato macchina stabile, per esempio:

```json
{
  "all": [
    {"field":"venue","op":"eq","value":"away"},
    {"field":"prematch.away_odds","op":"between","value":[2.0,3.5]},
    {"field":"live.minute","op":"between","value":[65,75]},
    {"field":"live.score","op":"eq","value":"1-0"},
    {"field":"live.away.dangerous_attacks_rolling_10m","op":"gte","value":12}
  ]
}
```

Questo permette di usare la stessa regola:
- nella UI;
- nell'API;
- nell'assistente;
- nel Trading Engine;
- nel backtest.

---

# Explainability

Ogni match deve poter spiegare:

- quali condizioni hanno passato;
- quali hanno fallito;
- quale valore reale è stato usato;
- timestamp;
- source;
- coverage.

Per i segnali live:
`4/5 conditions passed → WATCHING`
oppure
`5/5 → ARMED`.

---

# No future leakage

Nel backtest e nel live:
- ogni condizione può vedere solo dati disponibili al timestamp valutato;
- nessun aggregate può includere il match corrente dopo il timestamp;
- snapshot futuri vietati.

---

# Query optimization

Il motore deve tradurre le regole in query efficienti:
- SQL indexed;
- materialized/derived facts dove utile;
- no scansioni raw JSON per ogni richiesta;
- query planner guard;
- pagination/limits.

---

# Assistant direct use

L'assistente deve poter ricevere richieste naturali e trasformarle nella stessa DSL.

Esempio owner:

"Trova tutte le partite in cui la squadra ospite era sfavorita tra 3 e 5, al 70' perdeva 1-0 ma aveva almeno 3 SOT e forte pressione negli ultimi 10 minuti."

Il sistema:
1. traduce in rule JSON;
2. mostra la regola interpretata;
3. interroga il DB;
4. restituisce match e statistiche;
5. non chiama i provider se i dati sono già persistiti.

---

# Hard test

Certificare almeno:

- regola con 10 condizioni AND;
- regola con gruppi AND/OR/NOT;
- storico + prematch + live nella stessa regola;
- rolling window;
- score state;
- odds range;
- missing-data condition;
- stessa rule via UI e API produce stessi match;
- stesso rule JSON nel backtest produce risultato deterministico;
- nessun future leakage.

---

# Gate

Il sistema filtri non è completo finché:
- [ ] ogni campo normalizzato eleggibile può essere usato;
- [ ] AND/OR/NOT annidabili;
- [ ] rolling windows;
- [ ] historical aggregates;
- [ ] rule versioning;
- [ ] shared DSL UI/API/agent/backtest;
- [ ] explainability;
- [ ] performance hard test;
- [ ] no leakage.


---

# Competition & Season Coverage Registry — censimento storico obbligatorio

## Obiettivo

MatchPilot deve conoscere, per **ogni campionato**, esattamente:

- da quale stagione iniziano i dati;
- fino a quale stagione arrivano;
- quali stagioni sono complete;
- quali sono parziali;
- quali sono unavailable;
- quali campi/statistiche sono disponibili per ciascun periodo;
- quale provider copre cosa.

Esempio concettuale:

- Italy Serie A → FutPythonTrader dal 2019/20
- France Ligue 1 → FutPythonTrader dal 2020/21
- TotalCorner → range eventualmente diverso

I valori reali devono essere scoperti e certificati, non assunti.

---

# Registro canonico

Creare un registry persistente per competizione/stagione.

Campi minimi:

- internal_competition_id
- country
- canonical_league_name
- season
- season_start_date
- season_end_date
- provider
- provider_competition_id
- provider_season_id/slug
- first_data_date
- last_data_date
- coverage_status
- match_count
- expected_match_count se determinabile
- fields_available
- fields_coverage
- historical_complete
- prematch_available
- live_available
- odds_available
- events_available
- discovered_at
- verified_at
- last_audited_at
- evidence
- notes

---

# Stati coverage stagione

Ogni stagione deve avere uno stato tra:

- DISCOVERED
- CANDIDATE
- AVAILABLE
- PARTIAL
- COMPLETE
- UNAVAILABLE_404
- ERROR_REAL
- DEPRECATED
- REMOVED

Mai usare semplicemente “campionato supportato” senza indicare il periodo.

---

# First / Last available season

Per ogni campionato mostrare almeno:

- earliest FutPython season
- latest FutPython season
- earliest TotalCorner season/date
- latest TotalCorner season/date
- overlap period
- current season status

---

# Coverage per provider

## FutPythonTrader
Per ogni lega/stagione:
- match;
- colonne;
- coverage;
- earliest/latest;
- complete/partial;
- missing seasons.

## TotalCorner
Per ogni lega/stagione:
- schedule;
- match detail;
- odds;
- events;
- live retroactive;
- HISTORICAL_UPSTREAM;
- HISTORICAL_CAPTURED.

---

# Overlap FutPythonTrader × TotalCorner

Per ogni competizione:

`overlap_start = max(FPT_start, TC_start)`

`overlap_end = min(FPT_end, TC_end)`

Questo periodo deve essere usabile per:
- backtest combinati;
- trading model validation;
- GOAT benchmark;
- replay storico quando disponibile.

---

# UI

Creare pagina/sezione:

**Data Coverage → Competitions**

Per ogni campionato mostrare:
- paese;
- lega;
- provider;
- prima stagione;
- ultima stagione;
- numero stagioni;
- match;
- COMPLETE / PARTIAL;
- fields coverage;
- overlap FPT/TC.

Drill-down:
- tutte le stagioni;
- campi disponibili;
- match count;
- gap;
- anomalie.

---

# Filtri

Permettere:
- country;
- league;
- provider;
- season;
- complete only;
- partial;
- overlap available;
- live available;
- odds available;
- minimum seasons;
- minimum match count.

---

# Nuovi campionati futuri

Ogni nuova lega scoperta deve seguire automaticamente lo stesso contratto.

Pipeline:

1. DISCOVERED
2. candidate mapping
3. provider metadata fetch
4. historical range discovery
5. season enumeration
6. backfill
7. schema/coverage audit
8. mapping FPT↔TC
9. hard verification
10. VERIFIED/ACTIVE

Nessuna nuova lega entra direttamente in produzione.

---

# Nuova stagione futura

Quando inizia una nuova stagione:

1. rilevarla automaticamente;
2. creare season record;
3. classificare CANDIDATE;
4. verificare endpoint;
5. iniziare sync;
6. confermare dati reali;
7. promuovere AVAILABLE/COMPLETE progressivamente.

---

# Missing season detection

Esempio:

2019/20 COMPLETE
2020/21 COMPLETE
2021/22 missing
2022/23 COMPLETE

→ creare gap automatico e reconciliation.

Non assumere continuità solo perché prima e dopo esistono dati.

---

# Field evolution

Una lega può avere campi diversi tra stagioni.

Esempio:
- 2019: solo score/odds
- 2021: aggiunto xG
- 2024: aggiunto xA/shots advanced

Il registry deve registrare la coverage **per stagione e campo**.

---

# Backtest safety

Ogni backtest deve sapere:
- da quando la metrica esiste;
- in quali campionati;
- coverage minima;
- stagioni incluse.

Mai usare un campo come se fosse disponibile nel 2019 se appare solo dal 2022.

---

# Assistant queryability

L'assistente deve poter rispondere dal DB a domande tipo:

- “Da quale stagione abbiamo la Serie A?”
- “Quali leghe hanno almeno 5 stagioni complete?”
- “Dove abbiamo xG dal 2021?”
- “Quali campionati hanno overlap FutPython + TotalCorner di almeno 3 anni?”
- “Quali nuove leghe sono state scoperte ma non ancora verificate?”

---

# Alerting

Stessa chat Telegram.

Alert aggregati per:
- nuova lega;
- nuova stagione;
- stagione sparita;
- gap storico;
- coverage regressiva;
- nuova colonna in una stagione;
- provider mapping cambiato.

---

# Hard test

Certificare:
- almeno 10 campionati;
- almeno 3 paesi;
- leghe con start year differenti;
- una lega multi-stagione completa;
- una con gap;
- una con coverage fields cambiata nel tempo;
- nuovo campionato simulato;
- nuova stagione simulata;
- reconciliation automatica.

---

# Gate

Il catalogo dati non è completo finché:
- [ ] ogni lega ha earliest/latest;
- [ ] ogni stagione ha stato;
- [ ] match count per stagione;
- [ ] field coverage per stagione;
- [ ] overlap FPT/TC;
- [ ] gap detection;
- [ ] future league onboarding;
- [ ] future season onboarding;
- [ ] assistant query layer;
- [ ] UI coverage page.


---

# Audit integrato post-PR #35 — stato reale e gap residui

Questa sezione è vincolante e aggiorna la #12 allo stato reale del codice su `main` dopo la PR #35 / commit `222be65`.

## Stato FPT-PR-01

FPT-PR-01 è da considerare **VERIFIED REAL** solo per i gate effettivamente provati e documentati.

Evidenza corrente di riferimento:
- catalogo: 1027;
- available: 615;
- unavailable_404: 412;
- error_real: 0;
- unknown: 0;
- undefined_states: 0;
- snapshot dataset: 615;
- historical_versions: 161398;
- unique_matches: 161398;
- nessun run running fantasma;
- deduplica campione reale verificata;
- migration 007 applicata;
- request budget/ledger presenti;
- deploy Render verificato.

La issue #12 resta OPEN e FutPythonTrader NON è ancora CLOSED/CERTIFIED.

---

# Gap obbligatori da chiudere per fase

## FPT-PR-02 — Classificazione terminale persistente e auditabile

Implementare e certificare:

- stato persistente esplicito per:
  - AVAILABLE
  - UNAVAILABLE_404
  - ERROR_REAL
  - DEPRECATED
  - REMOVED
- distinguere in modo persistente:
  - INITIAL_404
  - REGRESSION_404
- non limitarsi a `active=false`;
- reason/evidence persistenti;
- first_seen;
- last_seen;
- last_synced_at;
- first_success_at;
- last_success_at;
- last_error_at;
- last_http_status;
- provider-path evidence;
- zero duplicati country/league/season;
- zero unclassified.

### Gate matematico
`classified_total === catalog_total`

`unclassified = 0`

`duplicate_catalog_keys = 0`

### Hard test Neon
Query completa sull'intero catalogo, non solo endpoint aggregato.

---

## FPT-PR-03 — Integrità end-to-end raw → parser → DB

Implementare audit globale per:

- collisioni match_key;
- duplicati payload;
- righe senza Home/Away/Date quando richiesti;
- CSV malformed;
- header/row width mismatch;
- row_count snapshot vs parser;
- parser rows vs persisted rows;
- snapshot raw hash vs payload persistito;
- orphan snapshot;
- orphan match version;
- provider_match_id collision;
- date parsing failures;
- empty payload inattesi.

### Campione minimo reale
- 10 dataset;
- 3 paesi;
- 3 formati stagione;
- 1 dataset piccolo;
- 1 dataset grande.

### Gate
Zero perdita dati imputabile a MatchPilot.

---

## FPT-PR-04 — Schema registry completo e collisioni

Estendere `fpt_schema_fields` o registry equivalente con:

- field_name;
- inferred_type;
- type_history;
- type_collision flag;
- family;
- first_seen;
- last_seen;
- datasets_seen;
- seasons_seen;
- rows_seen;
- unique_rows_seen se necessario;
- nonempty_seen;
- sample_values;
- alias_candidates;
- provider/source;
- normalized_field mapping;
- queryable yes/no;
- filterable yes/no.

### Nota importante
`rows_seen` non deve essere interpretato come righe uniche se cresce a ogni nuovo snapshot.

Deve essere chiarito/documentato oppure affiancato da contatori univoci.

### Gate
`raw_unique_fields === registry_unique_fields`

salvo alias esplicitamente documentati.

---

## FPT-PR-05 — Coverage completa multidimensionale

Implementare coverage:

- globale;
- per dataset;
- per lega;
- per stagione;
- per periodo;
- per team quando utile;
- per campo normalizzato.

Classificare:
- dense;
- sparse;
- always-empty;
- league-specific;
- season-specific;
- newly-introduced;
- deprecated-field.

### Gate
Ogni campo ha coverage deterministica e auditabile.

---

## FPT-PR-06 — Competition & Season Coverage Registry + missing seasons

Implementare registry persistente per ogni lega/stagione con:

- internal_competition_id;
- country;
- canonical_league_name;
- season;
- provider identifiers;
- first_data_date;
- last_data_date;
- match_count;
- expected_match_count se determinabile;
- coverage_status;
- fields_available;
- fields_coverage;
- historical_complete;
- prematch_available;
- discovered_at;
- verified_at;
- last_audited_at;
- evidence.

Stati:
- DISCOVERED
- CANDIDATE
- AVAILABLE
- PARTIAL
- COMPLETE
- UNAVAILABLE_404
- ERROR_REAL
- DEPRECATED
- REMOVED

### Obbligatorio
- earliest season per lega;
- latest season per lega;
- gap detector;
- nuova stagione futura auto-discovery;
- nuovo campionato futuro onboarding.

### Gate
`missing_available_seasons = 0`

Non assumere continuità storica senza verifica.

---

## FPT-PR-07 — Due sync incrementali reali

Eseguire Run A e Run B reali su Render/Neon.

Verificare:
- no duplicate snapshots;
- no duplicate versions;
- solo dati modificati generano nuova versione;
- catalog/schema changes aggregate;
- request ledger coerente;
- no burst;
- no unnecessary upstream calls.

### Gate
Idempotenza dimostrata con contatori prima/dopo.

---

## FPT-PR-08 — Watchdog / Telegram hard certification

Estendere/verificare:

- stale detection su tutti i run rilevanti;
- failure simulated;
- recovery;
- new field;
- new dataset;
- row-count drop;
- dataset regression;
- request budget warning;
- request budget critical;
- 429 burst;
- circuit breaker;
- resolved alert.

### Telegram
- stessa chat configurata;
- outbound-only;
- inbound ignorato;
- anti-spam;
- massimo un riepilogo per categoria/run;
- resolve notification dove previsto.

### Nota
La whitelist attuale è single-chat; eventuale multi-chat futuro non è richiesto per chiudere FutPythonTrader, salvo nuova specifica owner.

---

## FPT-PR-09 — Certificato finale FutPythonTrader

Creare obbligatoriamente:

`docs/futpython-certification-YYYY-MM-DD.md`

Contenuti minimi:

### Identity
- commit SHA;
- UTC timestamp;
- Render service/deploy;
- Neon environment;
- Node version;
- migrations/schema version.

### Catalog
- countries;
- leagues;
- seasons/datasets;
- available;
- unavailable_404;
- error_real;
- deprecated;
- removed.

### Data
- raw snapshots;
- historical rows;
- unique matches;
- match versions;
- min/max dates.

### Schema
- unique fields;
- type collisions;
- aliases;
- coverage.

### Integrity
- duplicates;
- collisions;
- malformed;
- orphan rows;
- missing seasons;
- resume;
- idempotency.

### API Budget
- request ledger;
- cache hits;
- upstream calls;
- 429;
- retries;
- backoff;
- circuit breaker;
- budget state.

### Alerting
- watchdog;
- Telegram;
- stale detection;
- recovery.

### Queryability
- normalized layer;
- indexes;
- filter registry;
- assistant query layer.

### Final result
Uno solo:
- CERTIFIED
- CERTIFIED WITH KNOWN LIMITATIONS
- NOT CERTIFIED

---

# Request Ledger — estensione obbligatoria

Il ledger FutPython deve arrivare almeno a:

- provider;
- endpoint_family;
- dataset_key;
- url_path sanitizzato;
- timestamp;
- outcome;
- HTTP status;
- latency_ms;
- cache_hit;
- deduped;
- retry_count;
- backoff_ms;
- run_id;
- priority;
- budget_state;
- estimated/known remaining quota quando disponibile.

Mai salvare token/API key.

---

# Queryability / normalized layer — obbligatorio prima del CLOSED

Oltre al raw immutable, implementare un layer normalizzato interrogabile.

Obiettivo:

`raw → normalized facts → indexed query layer → UI / assistant / rules / backtest`

## Chiavi canoniche
- internal_match_id
- internal_competition_id
- internal_team_id
- season_id
- provider ids
- kickoff_utc
- home/away ids

## Filter Metadata Registry
Per ogni campo:
- field;
- source;
- normalized field;
- type;
- operators;
- coverage;
- indexed;
- prematch/historical;
- first_seen;
- last_seen.

## Assistant Query Layer
Deve poter rispondere dal DB a query tipo:
- ultime 20 trasferte;
- favorito tra 1.50 e 1.90;
- xG per stagione;
- leghe con almeno N stagioni complete;
- campionati con coverage sufficiente.

Nessuna chiamata upstream per dati storici già acquisiti.

---

# Compatibility con Composable Rule Engine

Tutti i campi normalizzati eleggibili devono poter essere usati in futuro dal Rule Engine con:

- AND
- OR
- NOT
- nested groups
- numeric operators
- range
- enum
- exists/missing
- temporal conditions
- historical aggregates.

FutPythonTrader deve fornire il contratto dati stabile, anche se UI/Strategy Lab vengono implementati in issue dedicate.

---

# API Budget / Request Economy — criteri finali FutPython

Prima della certificazione finale devono essere verificati:

- cache-first;
- in-flight dedup;
- provider budget;
- requests/min;
- requests/day;
- backfill-specific budget;
- priority traffic;
- Retry-After;
- exponential backoff;
- jitter;
- circuit breaker;
- no retry storm;
- no restart burst;
- historical backfill throttling;
- request ledger completo;
- alert budget.

Hard test:
- cache hit = zero upstream;
- due richieste concorrenti identiche = una upstream;
- restart = no burst;
- 429 = backoff corretto;
- budget conserve/critical = traffico non essenziale ridotto.

---

# Reconciliation compatibility

FutPythonTrader deve essere compatibile con #31:

- checkpoint;
- watermark;
- interrupted run recovery;
- missing dataset detection;
- missing season detection;
- incremental gap recovery;
- idempotent replay;
- unrecoverable state classification se applicabile.

---

# Nuovi campionati e nuove stagioni

Ogni nuova lega/stagione deve seguire automaticamente:

1. DISCOVERED
2. CANDIDATE
3. metadata fetch
4. season enumeration
5. backfill
6. schema audit
7. coverage audit
8. hard verification
9. VERIFIED/ACTIVE

Nessuna nuova lega/stagione entra direttamente in produzione senza questo flusso.

---

# Checklist finale aggiornata — FutPythonTrader CLOSED

FutPythonTrader può essere dichiarato CHIUDIBILE solo se:

- [ ] FPT-PR-01 VERIFIED REAL
- [ ] FPT-PR-02 classificazione persistente completa
- [ ] FPT-PR-03 integrity audit completo
- [ ] FPT-PR-04 schema registry completo
- [ ] FPT-PR-05 coverage multidimensionale
- [ ] FPT-PR-06 season registry + missing_available_seasons=0
- [ ] FPT-PR-07 due sync incrementali reali
- [ ] FPT-PR-08 watchdog/Telegram hard certified
- [ ] FPT-PR-09 certificato finale prodotto
- [ ] request ledger completo
- [ ] API budget certificato
- [ ] normalized/query layer disponibile
- [ ] filter metadata registry
- [ ] assistant query layer
- [ ] future league onboarding
- [ ] future season onboarding
- [ ] reconciliation compatibility
- [ ] zero ERROR_REAL imputabile a MatchPilot
- [ ] zero unknown/unclassified
- [ ] CI verde
- [ ] review/thread chiusi
- [ ] README/CLAUDE/AGENTS coerenti

Quando tutti questi punti sono passati:
- pubblicare commento **READY TO CLOSE / CHIUDIBILE**;
- lasciare issue OPEN;
- chiusura solo owner salvo autorizzazione esplicita.


---

# Hardening finale del contratto dati FutPythonTrader

Questi requisiti NON creano nuove fasi logiche: devono essere assorbiti nelle FPT-PR-03 / 04 / 06 / 09.

## 1. Entity Resolution squadre

Serve un'identità interna stabile per le squadre.

Implementare almeno:
- internal_team_id stabile;
- provider_team_id;
- canonical_name;
- aliases;
- abbreviations;
- historical names;
- country;
- competition context quando necessario;
- first_seen;
- last_seen;
- evidence/provenance.

### Obiettivo

Evitare che la stessa squadra venga trattata come entità diverse per:
- cambio nome;
- abbreviazione;
- spelling;
- lingua;
- provider naming.

### Gate
- nessuna duplicazione sistematica team;
- alias risolvibili;
- match storici riconciliabili allo stesso internal_team_id.

---

## 2. Data Lineage completa

Ogni fact normalizzata deve poter essere ricondotta esattamente alla sorgente.

Campi minimi:
- source_provider;
- dataset_key;
- snapshot_id;
- provider_match_id;
- parser_version;
- schema_version;
- transform_version;
- acquired_at;
- source_field;
- normalized_field.

### Gate
Dato un valore normalizzato, deve essere possibile risalire al raw snapshot e alla trasformazione che l'ha prodotto.

---

## 3. Point-in-Time Reproducibility

Deve essere possibile ricostruire:

**“Cosa sapeva MatchPilot a timestamp T?”**

Questo vale per:
- pre-match;
- backtest;
- audit;
- strategie;
- certificazione.

### Regola
Una query point-in-time non può usare:
- snapshot acquisiti dopo T;
- parser output generato da dati non disponibili a T;
- aggregati che includono futuro.

### Gate
Stesso timestamp storico + stesso data contract version → stesso risultato riproducibile.

---

## 4. Parser / Schema Version Migration Policy

Il raw FutPythonTrader deve restare la fonte di verità.

Se il parser cambia:
- non sovrascrivere silenziosamente il passato;
- versionare parser/transform;
- poter rielaborare i raw;
- poter confrontare output vecchio vs nuovo;
- registrare migration/reprocessing run;
- preservare audit trail.

### Gate
Un reprocessing completo deve essere idempotente e non distruttivo.

---

## 5. Query Layer Performance Gate

Il normalized/query layer deve essere realmente utilizzabile dal sito e dall'assistente.

Hard test minimo su Neon:
- query “ultime 20 trasferte”;
- query con odds range;
- query con 5+ filtri combinati;
- query per league/season/field coverage;
- query point-in-time;
- query assistant-style complessa.

Misurare:
- latency;
- rows scanned se disponibile;
- index usage;
- timeout/failure.

### Gate
Nessuna query comune deve dipendere da full scan raw JSON quando esiste un percorso normalizzato/indexato.

---

# Raw retention policy

I raw snapshot FutPythonTrader sono **append-only / non cancellabili automaticamente**.

Possono essere rimossi solo con:
- autorizzazione owner;
- procedura esplicita;
- audit log;
- verifica che non comprometta reprocessing/certificazione.

Il raw resta la fonte primaria per:
- audit;
- replay;
- parser migration;
- reprocessing;
- dispute/debug.


---

## Autorizzazione permanente PR / merge per gli agenti

L'owner autorizza **qualsiasi agente che lavori su questa issue** a:

- creare branch operativi;
- aprire una Pull Request senza chiedere autorizzazione preventiva;
- aggiornare la PR;
- risolvere review/thread;
- eseguire i test previsti;
- effettuare il merge autonomamente quando tutti i requisiti della PR risultano soddisfatti.

**Non è necessaria una nuova autorizzazione dell'owner per aprire o mergiare una PR.**

### Gate obbligatori prima del merge

L'agente può fare merge autonomamente solo quando, dove applicabile:

- esiste una sola PR operativa aperta secondo il contratto del repository;
- scope della PR coerente con la fase corrente;
- CI verde;
- test automatici pertinenti passati;
- hard test reali richiesti dalla issue passati;
- evidenze reali annotate nella PR;
- review/commenti inline/thread risolti;
- nessun finding bloccante HIGH/CRITICAL;
- README sincronizzato;
- CLAUDE.md / AGENTS.md aggiornati se cambia il contratto;
- nessun secret esposto;
- nessuna regressione nota lasciata irrisolta;
- criteri di accettazione della PR soddisfatti.

Se uno di questi gate fallisce, l'agente **non deve fare merge** e deve correggere nella stessa fase.

### Distinzione importante: merge PR vs chiusura issue

Questa autorizzazione vale per **apertura e merge delle PR**.

La chiusura della issue resta soggetta all'owner gate già definito:

1. l'agente completa tutti i punti;
2. pubblica il commento **READY TO CLOSE / CHIUDIBILE** con checklist ed evidenze;
3. lascia la issue OPEN;
4. la issue viene chiusa dall'owner, salvo autorizzazione esplicita a chiudere quella specifica issue.

Questa autorizzazione PR/merge è permanente per il lavoro su MatchPilot finché l'owner non la revoca esplicitamente.
