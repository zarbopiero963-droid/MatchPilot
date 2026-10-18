# Handoff, checkpoint e recovery multi-agente

Issue: #150, MP-MULTIAGENT-SYNC-CHECKPOINT-01. Regole canoniche: [AGENTS.md](../../AGENTS.md) §0 e §6. Requisiti: MP-GOV-017, 018, 019, 022 e 023 e MP-QAC-010 in [`mp-pr-00/requirements.json`](mp-pr-00/requirements.json).

Il sistema è indipendente dal modello e dal fornitore. Usa soltanto file nel repository, git e GitHub, e lo strumento `node tools/governance/cli.mjs` (Node ≥ 22, nessuna dipendenza esterna).

## Elementi

| Elemento | Dove | Regola |
|---|---|---|
| Decisioni owner | `docs/governance/owner-decisions.json` | registro canonico, validato |
| Registro attività | `docs/governance/work-registry.json` | attività, assegnatario, lease, stato, ultimo checkpoint; `revision` cresce a ogni modifica |
| Checkpoint | `docs/governance/checkpoints/<id>.json` | schema `mp-checkpoint-v1`, append-only, catena `supersedes` per attività |
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

## Limiti noti

- Gli agenti operano con lo stesso account GitHub dell'owner, quindi GitHub non distingue tecnicamente chi chiude una issue. La protezione è procedurale (AGENTS §5) e preventiva: la CI rifiuta le parole chiave di auto-chiusura.
- **Lock orfano.** Se un processo termina mentre scrive il registro, resta `work-registry.json.lock` e ogni scrittura successiva viene rifiutata (fail-safe); `CONFLICT_LOCKED` riporta l'età del lock. Prima di rimuoverlo:
  1. verificare che nessun processo stia scrivendo nello stesso worktree;
  2. verificare che `work-registry.json` sia JSON valido;
  3. eseguire `npm run governance:check`.

  Solo dopo si rimuove il file `.lock` e lo si annota nel checkpoint successivo.
- **Input di `merge-gate`.** Il comando valuta un input JSON che l'agente compila con i fatti letti da GitHub (CI del head, review, branch protection). Non interroga GitHub da solo: il revisore indipendente riverifica quei fatti.
- **Verifiche prima del claim.** Le verifiche in sola lettura (resume, test locali, lettura di GitHub) possono precedere il claim. Ogni scrittura su branch, registro, checkpoint o commenti richiede il lease.
- **Append-only in CI.** Una PR che modifica o elimina un checkpoint esistente viene rifiutata in CI (`check-append-only`). Le correzioni si fanno con un nuovo checkpoint che sostituisce il precedente tramite `supersedes`.
- Il lock su file protegge i processi nello stesso worktree. Fra worktree o macchine diversi la protezione è la compare-and-swap su `revision` più il rifiuto git dei push non fast-forward: chi perde la corsa ricarica e rivaluta.
