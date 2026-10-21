# Handoff, checkpoint e recovery multi-agente

Issue: #150, MP-MULTIAGENT-SYNC-CHECKPOINT-01. Regole canoniche: [AGENTS.md](../../AGENTS.md) §0 e §6. Requisiti: MP-GOV-017, 018, 019, 022 e 023 e MP-QAC-010 in [`mp-pr-00/requirements.json`](mp-pr-00/requirements.json).

Il sistema è indipendente dal modello, dal fornitore e dall'identità dell'agente (`MP-OWNER-AGENTS-INTERCHANGEABLE-01`). Usa soltanto file nel repository, git e GitHub, e lo strumento `node tools/governance/cli.mjs` (Node ≥ 22, nessuna dipendenza esterna).

**Agenti intercambiabili.** Qualunque agente (Claude, Grok o altri) può assumere qualunque attività del progetto, quando è autorizzato:
- codice e test, PR e review;
- roadmap e governance, GitHub;
- VPS e infrastruttura, migrazioni PostgreSQL, deploy e collaudi;
- FutPythonTrader, Telegram, sviluppo funzionale e frontend.

Nessun agente ha privilegi permanenti esclusivi. Ciò che consente di scrivere è sempre l'insieme di:
- mandato;
- attività;
- risorsa;
- lease;
- GO owner.

Il nome dell'agente non conta mai. Chi subentra deve avere gli accessi necessari e verificare lo stato corrente (HANDOFF IN). Un test verifica che il codice di `tools/governance` non nomini nessun agente.

## Elementi

| Elemento | Dove | Regola |
|---|---|---|
| Decisioni owner | `docs/governance/owner-decisions.json` | registro canonico, validato |
| Registro attività | `docs/governance/work-registry.json` | attività, assegnatario, lease, stato, ultimo checkpoint; `revision` cresce a ogni modifica |
| Checkpoint | `docs/governance/checkpoints/<id>.json` | schema `mp-checkpoint-v3` per i nuovi checkpoint (v2 resta valido; v1 accettato solo per i checkpoint storici precedenti al 18/10 21:00Z), append-only, catena `supersedes` per attività |
| Commento GitHub | issue o PR dell'attività | contiene `<!-- mp-checkpoint:<id> -->`: un solo commento per checkpoint |

- **Stati:** PLANNED, RUNNING, BLOCKED, REVIEW, HANDOFF READY, CERTIFIED, MERGED, COMPLETED.
- **Ruoli:** Development Agent, Test Agent, Independent Reviewer, Requirements Auditor, Roadmap Coordinator, Integration Agent.

### Campi del checkpoint

- `id` (`CP-<YYYYMMDDTHHMMSSZ>-<agente>`), `timestamp_utc`;
- `agent` (`id`, `role`, facoltativi `model` e `session`), `activity`, `task`;
- `repository`, `issue`, `pr`, `branch`, `commit_sha`, `tree_sha`;
- `requirements`, `changes`;
- `tests`: record di evidenza Gate B con `command`, `result`, `environment`, `commit`, `time`, `limits`;
- `ci`, `gate_a`, `gate_b`, `review`, `findings`, `owner_decisions`, `dependencies`;
- `state`, `next_action`, `resume_conditions`, `supersedes`.

### Vincoli verificati da `validate`

- nessun valore simile a un segreto;
- decisioni owner e requisiti citati devono esistere;
- `HANDOFF READY` richiede le condizioni di ripresa;
- CERTIFIED, MERGED e COMPLETED richiedono Gate A e Gate B PASS, review APPROVED e nessun finding bloccante aperto.

## Schema v3 (`mp-checkpoint-v3`)

Estende v2 senza togliere nulla: ogni regola v2 vale anche per v3, e i checkpoint v2 restano validi. Campi aggiunti, tutti obbligatori:

| Campo | Contenuto |
|---|---|
| `mandate` | `{id, source}`: il mandato owner, registrato in `owner-decisions.json` o citato con il link |
| `agent.session` | la sessione che ha scritto il checkpoint |
| `base_sha` | la base del lavoro (con `commit_sha` = head e `tree_sha`) |
| `worktree` | `{clean}`: nessun lavoro solo locale |
| `progress` | `{done, in_progress, not_started}` |
| `resources` | le risorse su cui l'attività scrive: `branch:<nome>`, `pr:<n>`, `vps:<host>`, `db:<nome>`, `file:<path>` |
| `authorizations` | `{id, source, scope, status}`. Lo `scope` ammette solo `mandate`, `task`, `resource` e `action`, mai l'agente. Lo `status` è VALID, CONSUMED (con `consumed_by`), REVOKED o NOT_GRANTED |
| `external_commands` | `{target, command, effect}`: solo i comandi con effetti fuori dal repository (GitHub, VPS, database) |
| `artifacts` | `{path, sha256}` |
| `stop_conditions` | quando chi riprende deve fermarsi (almeno una) |
| `costs` | `{incurred, authorized}` |
| `vps` | fatti sulla VPS (release, versioni, hash), oppure `null` |
| `handoff` | `{status, from, to, responsibilities}`. `status` è NONE, OUT, IN o PENDING_VERIFICATION; `to` è un agente oppure `ANY` |
| `merge_sha` | obbligatorio in stato MERGED. `commit_sha` resta l'head revisionato |

Regole v3:
- `HANDOFF READY` ⇔ `handoff.status` OUT, con le responsabilità trasferite;
- `IN` elenca in `handoff.verified` ciò che il ricevente ha verificato;
- `PENDING_VERIFICATION` registra dichiarazioni non verificate e non può stare in HANDOFF READY, CERTIFIED, MERGED o COMPLETED;
- i test SKIPPED non sono PASS.

**Nessun segreto nei checkpoint.** `validate` scandisce l'intero checkpoint, compresi `vps` e `external_commands`, e rifiuta qualunque valore simile a un segreto. Si trasferiscono attività, evidenze e responsabilità; credenziali e chiavi restano dove sono (VPS, account dell'owner).

**Ledger delle autorizzazioni.** `authz-check` ricostruisce lo stato di ogni GO da tutti i checkpoint:
- un GO CONSUMED o REVOKED non torna mai VALID, anche se un checkpoint successivo lo dichiara;
- un GO mai registrato, non concesso o fuori ambito viene rifiutato.

```
npm run governance:authz-check -- <GO> --task <attività> --resource <risorsa> --action "<azione>"
```

Il comando non ha un parametro per l'agente.

## HANDOFF OUT (chi lascia)

1. Ferma i processi in corso. Esegue il push di tutti i commit: nessun lavoro solo locale.
2. Scrive un checkpoint v3 in stato `HANDOFF READY`, con:
   - `handoff.status: "OUT"`, `to` (`ANY` o l'agente designato dall'owner) e le `responsibilities` trasferite;
   - `next_action` atomica, `resume_conditions` e `stop_conditions`;
   - le autorizzazioni con il loro stato (le consumate come CONSUMED).
3. Pubblica il commento con il marker.
4. Rilascia il lease (`release`).
5. Cancella o consegna i propri promemoria programmati.

## HANDOFF IN (chi subentra, qualunque agente)

1. Legge AGENTS.md e le decisioni `IN_FORCE`, poi esegue `git fetch origin`.
2. Esegue `npm run governance:handoff-in -- <task> --agent <id> --pr-state <stato letto da GitHub>`, che controlla:
   - catena dei checkpoint e registro (`STALE_REGISTRY` se il registro non punta alla testa della catena);
   - branch reale contro `commit_sha` e `tree_sha`;
   - stato della PR;
   - lease attivo di un altro agente sull'attività (`DUAL_WRITER`) o su una risorsa condivisa (`DUAL_WRITER_RESOURCE`);
   - handoff indirizzato ad altri;
   - dichiarazioni in attesa di verifica.

   Esce con 2 a ogni problema (STOP) e con 0 solo se può procedere.
3. Verifica in sola lettura le evidenze citate (test, CI, review, fatti sulla VPS). Con `PENDING_VERIFICATION` le elenca con `--verified "<voce>"`.
4. Fa il claim (`reconciled: true` se il lease precedente è scaduto).
5. Scrive un checkpoint v3 con `handoff.status: "IN"`, `from` e `verified`.
6. Solo dopo esegue `next_action`.

**L'handoff è completo solo quando chi subentra ha pubblicato il proprio checkpoint IN.**

## STALE, NO DUAL WRITER, FAIL-CLOSED

- **STALE.** Non si riprende in automatico da un checkpoint obsoleto. Lo è quando:
  - il registro non punta alla testa della catena;
  - il branch è cambiato senza un nuovo checkpoint;
  - la PR ha cambiato stato;
  - lo stato attivo ha più di 24 h.

  Chi subentra registra prima la riconciliazione (checkpoint BLOCKED con le divergenze), poi un nuovo checkpoint che supera il precedente.
- **NO DUAL WRITER.** Una risorsa ha un solo scrittore alla volta, chiunque sia:
  - `validate` rifiuta due lease attivi di agenti diversi sulla stessa risorsa;
  - `claim` rifiuta con `CONFLICT_RESOURCE_LEASED`;
  - vale per branch, PR, registro e host VPS (una sola sessione operativa sulla VPS per volta).

  I branch sono per attività e non si riusano.
- **FAIL-CLOSED.** Si ferma, pubblica un checkpoint BLOCKED e chiede una decisione all'owner quando:
  - lo stato non è ricostruibile;
  - un'autorizzazione è ambigua, consumata o fuori ambito;
  - il registro non si legge.

  `handoff-in` restituisce STOP anche su un errore interno.
- **Seconda PR di implementazione.** Ammessa solo se l'attività cita in `parallel_authorization` una decisione owner `IN_FORCE` che la nomina in `parallel_tasks`, come `MP-GITHUB-RECON-IMPLEMENTATION-01` per GOV-RECON-01 mentre #178 attende. Senza il registro delle decisioni la regola resta stretta.
- **Attività `operations`.** È il lavoro fuori dal repository (VPS, database, servizi): non occupa lo slot delle PR, ma le sue risorse seguono la regola dello scrittore unico.

## Ciclo di lavoro di un agente

1. **Claim.** Aggiorna `work-registry.json` con `claim(...)` di `tools/governance/registry.mjs`:
   - assegnatario e lease (durata predefinita 120 minuti);
   - `revision + 1`.

   Il claim viene rifiutato quando:
   - un altro agente ha un lease attivo;
   - un'altra attività di implementazione è viva (una sola PR di implementazione alla volta);
   - il registro è cambiato nel frattempo (`expectedRevision`);
   - un altro processo sta scrivendo nello stesso worktree (file lock).
2. **Lavoro.** Commit sul branch dell'attività.
3. **Checkpoint.** Alla fine del ciclo, o prima di un'interruzione prevedibile:
   - scrive un nuovo file in `checkpoints/` con `commit_sha` e `tree_sha` del commit di lavoro, `supersedes` = checkpoint precedente;
   - aggiorna `latest_checkpoint` nel registro (`release(...)` o claim rinnovato);
   - fa commit e push di checkpoint e registro.

   Il checkpoint descrive il commit di lavoro che lo precede. I commit successivi che toccano **solo** file in `checkpoints/` o `work-registry.json` sono riconciliati automaticamente. Qualunque altro file cambiato dopo il checkpoint è `UNRECONCILED_COMMITS`.
4. **Commento.** Pubblica il commento con marker sulla issue o PR, solo se il marker non c'è già (`planComment`).
5. **Handoff.** Se smette prima di finire:
   - imposta `state: "HANDOFF READY"`;
   - indica `next_action` precisa e `resume_conditions`;
   - libera il lease (`release`).

## Subentro (Agente B)

1. Legge AGENTS.md, CLAUDE.md e le decisioni `IN_FORCE`.
2. `git fetch origin`, poi `node tools/governance/cli.mjs resume <task>`. Il comando:
   - risolve l'ultimo checkpoint valido (una sola testa della catena; le biforcazioni sono un conflitto);
   - confronta `commit_sha` e `tree_sha` con il branch reale tramite git;
   - segnala `SHA_MISMATCH`, `UNRECONCILED_COMMITS`, `TREE_MISMATCH`, `BRANCH_MISSING`, `PR_ALREADY_MERGED`, `MERGE_NOT_REAL` e `STALE` (stato attivo più vecchio di 24 h).
3. Su GitHub controlla PR, CI del head e thread di review. Non si fida dei PASS dichiarati: verifica le evidenze citate.
4. Gestisce le divergenze:
   - **nessuna divergenza**: procede;
   - **altre divergenze**: si ferma, registra un checkpoint `BLOCKED` con il conflitto e non sovrascrive il lavoro.
5. Fa il claim con `reconciled: true` solo dopo il passo 4, se il lease precedente è scaduto o liberato.
6. Esegue `next_action`, poi riparte dal ciclo descritto sopra.

## Recovery

| Evento | Comportamento |
|---|---|
| crash, timeout, limite d'uso, budget esaurito, disconnessione | il lavoro non salvato nel checkpoint si considera perso; si riprende dall'ultimo checkpoint e dal branch reale |
| riavvio del container o cambio di ambiente | nessuno stato locale necessario: clone fresco, `npm ci`, `resume` |
| cambio di modello o agente | nessuna dipendenza dalla conversazione: bastano checkpoint, registro e issue |
| lease scaduto | non autorizza la sovrascrittura: prima riconciliazione, poi `claim(..., {reconciled: true})` |

## Idempotenza

- **Checkpoint:** stesso id e stesso contenuto non scrivono nulla (`unchanged`); stesso id con contenuto diverso viene rifiutato.
- **Commenti:** marker per checkpoint, cercato prima di pubblicare.
- **Commit:** prima di rifare un lavoro si confronta il branch reale con il checkpoint (`resume`).
- **PR:** una PR per attività (campo `pr` del registro); prima di crearne una si cerca quella esistente sul branch.
- **Merge:** `merge-gate` restituisce `noop` se la PR è già mergiata; il merge usa lo SHA atteso.
- **Assegnazioni:** un nuovo claim dello stesso agente rinnova il lease senza duplicarlo.

## Certificazione del sistema

**Test automatici** (`test/governance-*.test.mjs`):
- schema;
- lettura e scrittura;
- ultimo checkpoint valido;
- SHA mismatch su repository git reale;
- checkpoint obsoleto e biforcazioni;
- concorrenza fra processi reali sul file lock;
- lease e attività parallele;
- handoff e recovery;
- idempotenza;
- segreti;
- coerenza con le decisioni owner;
- gate di auto-merge;
- divieto delle parole chiave di auto-chiusura;
- coerenza di AGENTS e CLAUDE.

**Collaudo reale obbligatorio:**
- Agente A → checkpoint su GitHub → interruzione → Agente B, senza la conversazione di A → recupero → verifica → prosecuzione;
- le evidenze vanno pubblicate su #150;
- solo dopo si può dichiarare `MULTI-AGENT HANDOFF CERTIFIED`.

## Collaudo reale A → B (18/10/2026)

1. **Agente A** (`agent-a-claude-code`):
   - ha implementato R-01 nel commit `26fa7f8`;
   - ha pubblicato `CP-20261018T201559Z-agent-a-claude-code` in stato HANDOFF READY (#150, commento 6254638793);
   - ha liberato il lease e ha smesso di lavorare su R-01.
2. **Agente B** (`agent-b-claude-subagent`):
   - sessione separata, senza la conversazione di A, in un clone fresco;
   - ha eseguito `resume R-01` e ottenuto zero divergenze;
   - ha verificato lo SHA, il tree, la PR #151 aperta e i test dichiarati;
   - ha fatto il claim del lease (`9989e45`);
   - ha completato la `next_action` (N-06, `477c434`) e pubblicato `CP-20261018T202029Z-agent-b-claude-subagent` in stato REVIEW (#150, commento 6254688637).
3. **Agente A, alla ripresa:**
   - ha rieseguito `resume` sul nuovo head e ottenuto zero divergenze;
   - ha riverificato in modo indipendente il lavoro di B su PostgreSQL 16: skip in 0,2 s, fallimento immediato con `CI=1`, 198/198 test;
   - ha ripreso il lease.

**Limite:** B era una sessione separata dello stesso strumento nello stesso container, non un fornitore diverso. Il protocollo non dipende dal modello.

## Collaudo reale Claude → Grok → Claude: HANDOFF NOT VERIFIED

Il collaudo richiesto da `MP-OWNER-AGENTS-INTERCHANGEABLE-01` (due sessioni distinte, un'attività non distruttiva) **non è stato eseguito**: la sessione che ha scritto questo schema non può avviare né pilotare una sessione Grok.

Esiste solo la simulazione Claude → Grok → Claude su un repository git reale, in `test/governance-handoff-v3.test.mjs`. È ripetuta con i nomi scambiati e con nomi arbitrari, con esiti identici. **Una simulazione non è un handoff reale.**

Il collaudo reale usa l'attività `HANDOFF-TEST-01`, non distruttiva:
1. **Agente A.** Claim, poi un checkpoint v3 HANDOFF READY con `to: ANY`, marker su #150, release.
2. **Agente B, in un'altra sessione.** `handoff-in` con esito PROCEED, verifiche, claim, checkpoint IN, una `next_action` documentale, HANDOFF READY, release.
3. **Agente A.** `handoff-in`, checkpoint IN.

Le evidenze (id dei checkpoint, commit, commenti) vanno pubblicate su #150. Solo dopo si può scrivere HANDOFF VERIFIED.

## Limiti noti

- Gli agenti operano con lo stesso account GitHub dell'owner, quindi GitHub non distingue tecnicamente chi chiude una issue. La protezione è procedurale (AGENTS §5) e preventiva: la CI rifiuta le parole chiave di auto-chiusura.
- **Lock orfano.** Se un processo termina mentre scrive il registro, resta `work-registry.json.lock` e ogni scrittura successiva viene rifiutata (fail-safe); `CONFLICT_LOCKED` riporta l'età del lock. Prima di rimuoverlo:
  1. verificare che nessun processo stia scrivendo nello stesso worktree;
  2. verificare che `work-registry.json` sia JSON valido;
  3. eseguire `npm run governance:check`.

  Solo dopo si rimuove il file `.lock` e lo si annota nel checkpoint successivo.
- **Input di `merge-gate`.** Il comando valuta un input JSON che l'agente compila con i fatti letti da GitHub (CI del head, review, branch protection). Non interroga GitHub da solo: il revisore indipendente riverifica quei fatti.
- **Verifiche prima del claim.** Le verifiche in sola lettura (resume, test locali, lettura di GitHub) possono precedere il claim. Ogni scrittura su branch, registro, checkpoint o commenti richiede il lease.
- **Schema v2.** Una review APPROVED richiede `review.reviewed_sha` e un run CI richiede `ci.head_sha`: un'evidenza vale solo per il commit che ha coperto. Un checkpoint MERGED o CERTIFIED deve avere la review sul proprio `commit_sha`.
- **Merge commit.** L'analisi append-only include anche ciò che i merge commit cambiano rispetto al primo genitore, oltre al diff cumulativo dalla base.
- **Append-only in CI.** Una PR che modifica o elimina un checkpoint esistente viene rifiutata in CI (`check-append-only`). Le correzioni si fanno con un nuovo checkpoint che sostituisce il precedente tramite `supersedes`.
- **Orari reali.** `timestamp_utc` e gli orari dei test si prendono dall'orologio (`date -u`), mai stimati. `governance:check` rifiuta:
  - un checkpoint con data più di 10 minuti nel futuro;
  - un test con orario successivo al suo checkpoint.
- **Errata.** I checkpoint registrati con orari non reali restano invariati. Ognuno è elencato in [`checkpoint-errata.json`](checkpoint-errata.json) (finding NB-9 della PR #162), con:
  - `not_after_utc`: il limite superiore reale, cioè l'orario autore del primo commit che contiene il file;
  - `basis_commit`: quel commit.

  Il loro orario reale resta ignoto. Per ordinare la catena e per lo stato `STALE` vale il limite.
- **Verifica su git** (`governance:check`):
  - un erratum non può fissare un limite successivo al primo commit raggiungibile che contiene il checkpoint;
  - un checkpoint senza erratum non può essere datato più di 10 minuti dopo quel commit (orario di commit, non d'autore).

  Il controllo esatto di `basis_commit` (aggiunge il file a quell'orario d'autore) gira solo dove il commit è presente: i commit dei branch PR dopo uno squash non sono nel clone della CI, che applica comunque il limite.
- **Slot di implementazione.** RUNNING e REVIEW occupano sempre l'unico slot. Ogni altro stato non finale (diverso da MERGED e COMPLETED) lo occupa finché la sua PR può essere aperta: solo `pr_open: false` esplicito lo libera, e `validate` rifiuta un'attività con `pr` ma senza `pr_open`. Il valore di `pr_open` è dichiarato dall'agente e non viene confrontato con GitHub in automatico: chi subentra lo verifica sulla PR.
- Il lock su file protegge i processi nello stesso worktree. Fra worktree o macchine diversi la protezione è la compare-and-swap su `revision` più il rifiuto git dei push non fast-forward: chi perde la corsa ricarica e rivaluta.
