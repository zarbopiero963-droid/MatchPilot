# Registro MASTER di MatchPilot (MP-GLOBAL-RECONCILIATION-20261102)

MASTER: **#288** — `[MASTER ROADMAP FINALE] MatchPilot — Global Requirements, Implementation & Certification Tracker`.

Questa cartella è il registro versionato della MASTER. La issue #288 è il punto di ingresso navigabile e cita sempre il percorso e il commit di questi file.

Le fonti storiche restano tali, senza modifiche al loro contenuto:
- #3 (master prodotto);
- #97 (roadmap);
- #104 (piano PR);
- #239 (roadmap UI);
- i contratti di dominio.

## File

| File | Contenuto |
|---|---|
| `master.json` | numero della MASTER, base riconciliata (SHA di main), percorsi dei registri, PR aperte fuori da main |
| `requirements.jsonl` | requisiti atomici `MP-REQ-0001…`, uno per riga. Ciascuno porta: issue e commento d'origine, decisione owner, priorità, dominio (A–L, GOV), dipendenze, criteri di accettazione, evidenze richieste, stato per dimensione, ciclo di vita, relazione con altre decisioni, dipendenza dal provider e gap, codice, PR, test, ID nei registri esistenti, schede, prossima azione |
| `cards.jsonl` | schede PR (`MP-CARD-###`, `MP-CARD-OPEN-<PR>`, più le schede esistenti `MP-UI-PR-…`, `MP-PR-00:R-…`, `A-104:…`). Ciascuna porta: obiettivo, issue, requisiti, dipendenze, componenti, implementazione, API e database, GUI, test (unitari, integrazione, **HARD TEST REALI**, browser E2E, negativi e recovery), evidenze, accettazione, review, gate di merge, deploy e certificazione, matrice di certificazione, stato |
| `issues.json` | tutte le issue (aperte e chiuse, 49 voci compresa la MASTER #288, che porta `master_link: "SELF"`) con dominio, ciclo di vita, requisiti e link alla MASTER (`master_link`: URL del commento di collegamento) |
| `prs.json` | censimento di tutte le PR (aperte, mergiate, chiuse senza merge) |
| `coverage.json` | metriche di copertura **calcolate** dal registro (`node tools/governance/master.mjs coverage --write`) |
| `roadmap.md` | roadmap per fasi P0–P10 **generata** dal registro (`node tools/governance/master.mjs render --write`) |

I registri esistenti non vengono duplicati: i requisiti MASTER citano i loro ID in `existing_ids`.
- `docs/governance/ui-requirements-matrix.json`: 1 100 requisiti `MP-REQ-UI-xxxx` della #239.
- `docs/governance/mp-pr-00/requirements.json`: 139 requisiti MP-PR-00.
- `docs/governance/owner-decisions.json`: decisioni owner.

## Stati (dimensioni separate, mai una sola scala)

Ogni requisito porta dimensioni indipendenti: una funzione può essere MERGED ma non DEPLOYED.

| Dimensione | Valori |
|---|---|
| implementazione | `NOT_IMPLEMENTED`, `PARTIAL`, `IMPLEMENTED`, `UNKNOWN` |
| test | `NONE`, `UNIT`, `INTEGRATION`, `BROWSER`, `UNKNOWN` |
| merged | `true`/`false`; le PR aperte sono in `in_open_pr` |
| deployed | `UNKNOWN`, a meno che una evidenza di deploy verificato sia registrata (`deploy_evidence`) |
| active | `YES`/`NO`/`UNKNOWN`; `YES` solo con `active_evidence` (oggi due regole di governance in vigore) |
| certified | `NONE`, `COMPONENT`, `INTEGRATION`, `UNKNOWN`. `COMPONENT`: il componente è coperto da un certificato registrato nel repository (oggi solo `docs/qa/feature-certification.json#FEAT-TRADING-TOOLS`, livello CERTIFIED CALCULATION), citato in `certification_evidence`. `INTEGRATION`: certificato end-to-end registrato. Senza certificato il valore è `UNKNOWN` o `NONE` |
| blocked | motivo, oppure `null` |

Ciclo di vita e relazione:
- `ACTIVE`, `SUPERSEDED`, `DUPLICATE`, `IDEA_NOT_APPROVED`, `ARCHIVE_NO_ACTION`;
- `COMPATIBLE`, `SUPERSEDED`, `DUPLICATE`, `CONFLICT_OWNER_DECISION_REQUIRED`, `UNRESOLVED`.

Un requisito SUPERSEDED o DUPLICATE deve citare la fonte (`relation_ref`). Nessun requisito viene cancellato: un requisito legato a un provider dismesso resta, con il gap del provider registrato.

Le schede hanno la matrice di certificazione dell'addendum: NOT STARTED, IMPLEMENTING, IMPLEMENTED, UNIT TESTED, INTEGRATION TESTED, BROWSER TESTED, HARD VERIFIED REAL, MERGED, DEPLOYED, OPERATIONALLY VERIFIED, CERTIFIED, BLOCKED.
- **CERTIFIED** richiede `evidence_records`.
- **HARD VERIFIED REAL** richiede un'evidenza di tipo `HARD_REAL`: mai su simulazioni.

## Percorsi di codice e di test

`code_paths` e `tests` contengono file **su main** (eventualmente seguiti da riga, ancora o nota: `src/api/tools.mjs:12 nota`) oppure riferimenti **espliciti** a una PR aperta nella forma `origin/<ramo>:<percorso>`. Un riferimento a un ramo è ammesso solo se il requisito ha `in_open_pr`, e non conta mai come implementazione o test su main.

## Regole del verificatore (`node tools/governance/master.mjs validate`)

Il verificatore gira anche nella suite dei test (`test/master-registry.test.mjs`), quindi in CI. Controlla che:
- gli ID siano validi e unici; le dipendenze, le schede e gli ID dei registri UI e MP-PR-00 citati esistano;
- ogni requisito ACTIVE abbia almeno una scheda;
- ogni percorso di `code_paths`, `tests`, `certification_evidence` e `active_evidence` esista su disco, oppure sia un riferimento `origin/<ramo>:` di una PR aperta;
- IMPLEMENTED significa **mergiato su main** (`merged: true`) con almeno un percorso di codice su main;
  per i requisiti di governance il «codice» può essere la regola scritta su main (`AGENTS.md`, `owner-decisions.json`, template, documenti di procedura): IMPLEMENTED indica allora una regola in vigore, non una funzione del prodotto;
- i percorsi non escono dal repository (`..` rifiutato) e un test è un file, non una cartella;
- l'elenco `requirements` di ogni issue in `issues.json` coincide con i requisiti che citano quella issue;
- un requisito con test `UNIT`, `INTEGRATION` o `BROWSER` abbia almeno un file di test su main;
- un requisito certificato abbia test su main e un certificato (`certification_evidence`); `active: YES` abbia `active_evidence`; `deployed: YES` abbia `deploy_evidence`;
- ogni scheda oltre IMPLEMENTING abbia `evidence_records` del tipo richiesto dal suo stato (`PR_HEAD`/`MERGE_COMMIT` per IMPLEMENTED, `TEST_REPORT`/`CI_RUN` per i test, `BROWSER_REPORT`, `HARD_REAL`, `MERGE_COMMIT`, `DEPLOY`, `OPERATIONAL`, `CERTIFICATE`); i tipi ammessi sono solo questi;
- SUPERSEDED e DUPLICATE citino la fonte;
- ogni requisito appartenga a una issue indicizzata, e il link alla MASTER di ogni issue aperta sia un URL di commento;
- `coverage.json` e `roadmap.md` coincidano con il registro (nessun dato incoerente fra MASTER e registri). `coverage.json` non dipende dal numero di righe dei registri esterni, che `validate` riporta a parte.

Nella riconciliazione iniziale il verificatore ha declassato a `UNKNOWN`:
- 47 requisiti dichiarati IMPLEMENTED senza percorso di codice;
- 17 dichiarati certificati senza test.

Dopo la review indipendente della PR #289:
- 15 IMPLEMENTED sono diventati PARTIAL: 8 con codice solo in PR aperte e 7 la cui prossima azione ammette lacune;
- 58 certificazioni `COMPONENT` senza certificato sono tornate `UNKNOWN`; 10 restano `COMPONENT` con il certificato dei Trading Tools;
- 142 dichiarazioni di test senza file di test sono diventate `UNKNOWN`, e 6 con test solo in PR aperte sono diventate `NONE`;
- 2 `active: YES` senza verifica operativa sono diventati `UNKNOWN`.

Ogni declassamento è annotato in `status.evidence_note`.

## Procedura permanente (decisione owner del 02/11/2026)

**NEW REQUIREMENT → MASTER REGISTRY → ISSUE COLLEGATA → PR → TEST → REVIEW → MERGE → CERTIFICAZIONE → DEPLOY**

1. Ogni nuova richiesta, decisione, mercato, indicatore, statistica, filtro, strategia, integrazione, provider, API, strumento MCP, schermata, modifica funzionale o architetturale, bug che altera un requisito, o requisito eliminato o sostituito si registra prima in `requirements.jsonl`. Riceve un nuovo `MP-REQ-####` (mai riusato), la issue d'origine e una scheda in `cards.jsonl`.

   Non è considerata pianificata finché non è nel registro.
2. Ogni nuova issue contiene un link alla MASTER (#288) e gli ID dei requisiti, oppure la dicitura `NO-NEW-REQUIREMENT: <motivo>` per un'attività tecnica.
3. Ogni PR cita gli ID interessati (`MP-REQ-####`, `MP-REQ-UI-####`, `MP-CARD-…`) oppure `NO-NEW-REQUIREMENT: <motivo>`. Aggiorna lo stato reale dei requisiti e della scheda, e rigenera `coverage.json` e `roadmap.md`.
4. Ogni certificazione aggiunge `evidence_records` alla scheda: PR, SHA, ambiente, versioni, dataset, test, screenshot, report, finding, review, limiti, verdetto. Nessun segreto.
5. Una regressione riporta la scheda allo stato precedente al gate interessato.
6. MatchPilot non è «concluso» perché tutte le PR risultano mergiate: vale solo il gate finale della scheda `MP-CARD-900`.

## Controllo automatico `matchpilot-roadmap-traceability`

Stato:
- **Validazione del registro: attiva**, tramite la suite dei test in CI.
- **Controllo delle PR** (`master.mjs pr-check`) e **controllo periodico delle issue** (`master.mjs issues-check`): implementati e testati. Li esegue su GitHub il workflow `.github/workflows/roadmap-traceability.yml`. È una modifica CI, quindi **MANUAL**, ed è attivo solo dopo il merge autorizzato dall'owner:
  - `pr-check` gira a ogni apertura, modifica o push di una PR e legge il corpo della PR;
  - `issues-check` gira ogni giorno (05:17 UTC) o a mano (`workflow_dispatch`) sull'elenco delle issue aperte;
  - l'evento `issues` non è usato: la policy dei workflow (`scripts/workflow-policy.mjs`) non lo ammette, e questa PR non la modifica.
  - Il workflow è in sola segnalazione e non diventa un required check senza approvazione.
  - Prima del merge del workflow, `issues-check` si esegue a mano con l'elenco delle issue esportato da GitHub; fallisce se una issue aperta non ha il link alla MASTER.
  - `pr-check` verifica che gli ID citati esistano, compresi gli `MP-REQ-UI-####` della matrice UI.

Limite tecnico dichiarato: GitHub non permette di bloccare la creazione di una issue. Le issue non collegate vengono segnalate a posteriori dal controllo giornaliero, mai bloccate prima.

## Piano delle PR residue

Il piano risponde al mandato owner MP-ROADMAP-PR-COUNT-FINAL-01 del 02/11/2026. È formato da:
- `pr-plan.json`: registro;
- `pr-plan.md`: tabella generata;
- `tools/governance/pr-plan.mjs`: verificatore;
- `test/pr-plan.test.mjs`: gate.

Le 376 schede originali restano in `cards.jsonl` come storico. Il piano le collega alle PR residue (`MP-PRP-###`, oppure `MP-PRP-OPEN-<n>` per una PR già aperta).

**Metodo.**
- Le schede e i requisiti attivi sono divisi in 5 gruppi di dominio, e ogni requisito ha un solo gruppo proprietario.
- Ogni gruppo è stato verificato contro `main` (`1aebd02`): file, test, PR mergiate e PR aperte.
- I gruppi sono stati riuniti dal coordinatore. Il coordinatore ha:
  - accorpato le PR duplicate tra gruppi, registrandole in `absorbed`;
  - contato una sola volta ogni PR aperta;
  - riportato a IMPLEMENTED_NOT_CERTIFIED le schede dichiarate COMPLETED senza certificato;
  - riclassificato IMPL le PR di sola certificazione che contengono requisiti non completamente implementati su `main` (`cert_reclassified_to_impl`);
  - applicato al registro, con annotazione, le correzioni di stato verificate.

**Esiti di una scheda:** COMPLETED, IMPLEMENTED_NOT_CERTIFIED, PARTIAL, NOT_STARTED, OPEN_PR, DUPLICATE, SUPERSEDED, MERGE_CANDIDATE, BLOCKED.
- Ogni scheda, tranne COMPLETED, SUPERSEDED e DUPLICATE, indica la PR che porta il suo lavoro residuo.
- Una scheda DUPLICATE o SUPERSEDED cita il riferimento.
- Una scheda con codice presente ma gate di certificazione mancanti non è mai COMPLETED.

**Requisito completato.** Un requisito è completato solo se è implementato e mergiato, ha test su `main` e ha una di queste basi:
- un certificato registrato (`CERTIFICATE`);
- per una regola di processo, CI o governance, il test su `main` che la applica, citato nell'evidenza (`RULE_ENFORCED_BY_TEST`).

Ogni altro requisito attivo è coperto da esattamente una PR residua.

**Conteggi** (ricalcolati dal verificatore, mai scritti a mano):
- `A = B + C + D + schede portate`, dove:
  - B: completate;
  - C: superate;
  - D: duplicate.
- `H = schede portate − E + S = F + G`, dove:
  - E: schede assorbite in una PR che ne porta già un'altra;
  - S: PR scorporate dalle epiche R-xx, senza una scheda propria;
  - F: PR aperte;
  - G: PR nuove.
- `I`: PR di sola certificazione (codice già completo su `main`).
- `J`: PR che dipendono da una decisione owner o da un GO.
- `N = H`.
- `Nmin = N − coppie accorpabili − PR eliminabili da una decisione owner`. Le PR eliminabili non vengono sottratte una seconda volta come coppie.
- `Nmax = N + rischi di scissione`.

Ogni unità dell'intervallo è legata a una PR nominata nel campo `split_risk`, `merge_option` o `may_be_removed_by_decision`.
- Un'opzione di accorpamento fra una PR SAFE e una MANUAL è rifiutata.
- Una PR assorbita da un'altra non porta un rischio di scissione inventato: eredita solo quello dichiarato.

**Limiti dichiarati.**
- **Le identità sui conteggi sono contabili.** `H = schede portate − E + S` vale per costruzione. I controlli sostanziali sono altri:
  - ogni requisito attivo è coperto esattamente una volta;
  - ogni scheda è collegata alla sua PR nei due sensi;
  - nessuna PR è duplicata;
  - nessun completamento è senza base.
- **L'intervallo copre solo l'incertezza dichiarata** su PR nominate. Non comprende:
  - il lavoro di correzione dopo un hard test o una certificazione falliti;
  - le PR che una decisione owner potrebbe aggiungere: 84 PR dipendono da una decisione o da un GO;
  - la scissione o il rifiuto delle 8 PR aperte;
  - lo sblocco delle 60 schede BLOCKED.
- **La base `RULE_ENFORCED_BY_TEST` non dimostra il contenuto del test.** Il verificatore controlla che il test citato esista e appartenga al requisito; che il test asserisca davvero la regola si verifica in review.
- **Le righe di pianificazione duplicate sono registrate in `absorbed` delle PR riceventi**: 19 in tutto, 5 dalla riconciliazione e 14 dalla review del conteggio; 17 sono fra gruppi diversi, 2 interne a G5. Si tratta di lavoro pianificato due volte e unito prima del conteggio, non di riduzioni arbitrarie. Sono un oggetto diverso dalle schede assorbite (E) e non si sottraggono di nuovo (`pr-plan-reconciliation.json`, `prs.planning_rows_deduplicated`).

**Tracciabilità di una PR senza requisiti propri** (prerequisiti backend, record di certificazione, gate finali): `serves` elenca i requisiti serviti oppure `ui_requirements` le righe `MP-REQ-UI` della matrice UI. Una PR senza nessuno dei due è rifiutata.

`npm run governance:pr-plan` verifica il piano. I test controllano:
- requisiti attivi senza copertura o coperti due volte;
- schede perse o ripetute;
- accorpamenti non tracciabili nei due sensi;
- ID e PR aperte duplicati;
- coerenza dei totali e del riepilogo in `master.json`;
- certificazioni e completamenti inventati;
- motivi di incertezza vuoti.
