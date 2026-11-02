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
| `issues.json` | tutte le issue (aperte e chiuse) con dominio, ciclo di vita, requisiti e link alla MASTER (`master_link`: URL del commento di collegamento) |
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
| active | `YES`/`NO`/`UNKNOWN` |
| certified | `NONE`, `COMPONENT`, `INTEGRATION`, `UNKNOWN` |
| blocked | motivo, oppure `null` |

Ciclo di vita e relazione:
- `ACTIVE`, `SUPERSEDED`, `DUPLICATE`, `IDEA_NOT_APPROVED`, `ARCHIVE_NO_ACTION`;
- `COMPATIBLE`, `SUPERSEDED`, `DUPLICATE`, `CONFLICT_OWNER_DECISION_REQUIRED`, `UNRESOLVED`.

Un requisito SUPERSEDED o DUPLICATE deve citare la fonte (`relation_ref`). Nessun requisito viene cancellato: un requisito legato a un provider dismesso resta, con il gap del provider registrato.

Le schede hanno la matrice di certificazione dell'addendum: NOT STARTED, IMPLEMENTING, IMPLEMENTED, UNIT TESTED, INTEGRATION TESTED, BROWSER TESTED, HARD VERIFIED REAL, MERGED, DEPLOYED, OPERATIONALLY VERIFIED, CERTIFIED, BLOCKED.
- **CERTIFIED** richiede `evidence_records`.
- **HARD VERIFIED REAL** richiede un'evidenza di tipo `HARD_REAL`: mai su simulazioni.

## Regole del verificatore (`node tools/governance/master.mjs validate`)

Il verificatore gira anche nella suite dei test (`test/master-registry.test.mjs`), quindi in CI. Controlla che:
- gli ID siano validi e unici; le dipendenze, le schede e gli ID dei registri UI e MP-PR-00 citati esistano;
- ogni requisito ACTIVE abbia almeno una scheda;
- nessun requisito sia IMPLEMENTED senza percorsi di codice, né certificato senza test, né deployato senza evidenza;
- SUPERSEDED e DUPLICATE citino la fonte;
- ogni requisito appartenga a una issue indicizzata, e il link alla MASTER di ogni issue aperta sia un URL di commento;
- `coverage.json` e `roadmap.md` coincidano con il registro (nessun dato incoerente fra MASTER e registri).

Nella riconciliazione iniziale il verificatore ha declassato a `UNKNOWN`:
- 47 requisiti dichiarati IMPLEMENTED senza percorso di codice;
- 17 dichiarati certificati senza test.

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
- **Controllo delle PR** (`master.mjs pr-check`) e **controllo periodico delle issue** (`master.mjs issues-check`): implementati e testati. Il workflow che li esegue su GitHub (`.github/workflows/roadmap-traceability.yml`) è una modifica CI e quindi **MANUAL**: è nella PR di governance dedicata, in attesa del GO owner.
  - Il workflow è in sola segnalazione e non diventa un required check senza approvazione.

Limite tecnico dichiarato: GitHub non permette di bloccare la creazione di una issue. Le issue non collegate vengono segnalate a posteriori, da evento `issues` e da un controllo periodico, mai bloccate prima.
