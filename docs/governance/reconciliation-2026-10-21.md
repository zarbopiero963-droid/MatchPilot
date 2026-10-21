# Riconciliazione governance del 21/10/2026

Questa nota applica sul repository il rapporto R1–R7 ([`audits/2026-10-21-MP-GLOBAL-RECON-HANDOFF-01.md`](audits/2026-10-21-MP-GLOBAL-RECON-HANDOFF-01.md)).

| Voce | Riferimento |
|---|---|
| Mandato | `MP-GITHUB-RECON-IMPLEMENTATION-01` |
| Rettifica owner | `MP-OWNER-AGENTS-INTERCHANGEABLE-01` |
| Base | `main` = `170305418bd4fbbdbf4f3b7a4ed0ac5fcdc407c4` |

La PR che la contiene:
- non esegue merge né deploy;
- non interviene su VPS, database, servizi o permessi remoti;
- non tocca la PR #178.

**Roadmap.** La roadmap canonica resta **#97**; #104 è il catalogo storico, #182 la decisione VPS-only, #179 la migrazione. Questa nota non è una roadmap concorrente: la sequenza al §6 è una **proposta da approvare**.

## 1. Registro attività (`work-registry.json`, dalla rev 110)

| Attività | Prima | Dopo | Evidenza |
|---|---|---|---|
| DEPLOY-GATE-S1S2-01 (#181) | REVIEW, `pr_open: true`, lease attivo | **MERGED**, lease rilasciato dal suo titolare. Gate mergiato, **non certificato** fino a S4 | `commit_sha` `f5d6dfc` (head revisionato), `merge_sha` `1703054`, review 6325053841, CI 39657618950 |
| DEPLOY-APPROVAL-01 (#180) | MERGED con ultimo checkpoint BLOCKED | ultimo checkpoint **MERGED** | `commit_sha` `3b1604b`, `merge_sha` `e127c26`, review 6320417547, CI 39624510544; GO-2 consumato |
| VPS-DEPLOY-01 (#177) | ultimo checkpoint REVIEW | checkpoint MERGED `CP-20261020T121904Z` | copiato byte per byte dal branch di #178 |
| HIST-01a (#178) | assente su `main` | **BLOCKED**, `pr_open: true` | head `57aab63`, `dirty` rispetto a `main`; finding H-1 (riallineamento, CI e review da rifare); merge non autorizzato; branch non toccato |
| APP-01 | solo sul suo branch | BLOCKED, nessuna PR | candidata per il backend sulla VPS (#182 P4) |
| GOV-01 | solo sul suo branch | BLOCKED, nessuna PR | proposta AUTOMERGE-02/03 **non approvata** |
| VPS-MIGRATION-01 | assente | BLOCKED, tipo `operations`, `handoff: PENDING_VERIFICATION` | dichiarazioni dei rapporti su #179, da verificare (§5) |
| TC-OFF-01 | assente | PLANNED | §4 |
| HANDOFF-TEST-01 | assente | PLANNED | collaudo reale dell'handoff ([HANDOFF.md](HANDOFF.md)) |
| GOV-RECON-01 | assente | questa PR | `parallel_authorization: MP-GITHUB-RECON-IMPLEMENTATION-01` |

**Note sui checkpoint:**
- I tre checkpoint di #178 sono copiati **senza modifiche**, con le decisioni `MP-OWNER-HIST-01A-01/02`. Quando #178 verrà riallineata, i file saranno identici e non creeranno conflitti di contenuto.
- I branch `app-01-row-gaps` e `gov-01-merge-policy` contengono due file **diversi con lo stesso id** `CP-20261020T200407Z-agent-a-claude-code` (finding APP-F1). Nessuno dei due può arrivare su `main` così com'è. Le catene valide sono quelle nuove su `main`.

**Divergenza nota, non risolta qui:** R-02 mostra `SHA_MISMATCH` permanente in `governance:status`, perché il branch `ccr-e45875c0-5r0fnf` è riusato da molte PR.

## 2. Decisioni owner registrate

| Categoria | Decisioni |
|---|---|
| Confermate, in vigore | `MP-VPS-ONLY-OPERATIONS-2026-10-21` (#182); `MP-OWNER-AGENTS-INTERCHANGEABLE-01`; `MP-OWNER-VPS-DR-PORTABILITY-01`; `MP-OWNER-VPS-PRODUCTION-ENV-01` (comportamento a runtime NOT VERIFIED); `MP-OWNER-HIST-01B-OPTION-A`; `MP-GITHUB-RECON-IMPLEMENTATION-01` |
| Autorizzate e consumate | `MP-OWNER-PR181-CONTROLLED-MERGE`; `MP-OWNER-GO1-VPS-OIDC-PREFLIGHT-01`; `MP-OWNER-GO2-MERGE-PR180`; `MP-OWNER-GO-BACKUP-RERUN-20261021` |
| Parzialmente superate | `MP-GATE-S1S2-FIX` e `MP-GATE-PR181-HARDENING`: superata solo la clausola "without merge", dal merge controllato; i requisiti S3/S4 restano |
| Proposte non approvate | `MP-OWNER-AUTOMERGE-02-03-PROPOSAL`: AUTOMERGE-01 resta la regola |
| Formulazione da ratificare | `MP-OWNER-BACKUP-RETENTION-01`: intenzione dell'owner, nessuna cancellazione autorizzata |
| Storico HIST-01a | `MP-OWNER-HIST-01A-01`, `MP-OWNER-HIST-01A-02`, copiate dal branch di #178 |

**Conflitto aperto (decisione owner).**
- `OWN-2026-10-06-SCOPE` fa di TotalCorner un feed primario con perimetro FPT∩TC.
- #182 sospende la raccolta TC.
- Il perimetro dei nuovi dati FPT resta da decidere.

## 3. `pr_registry` (`requirements.json`)

Lo `status` di ogni voce R-xx descrive lo stato di consegna della fetta:

| Stato | Significato |
|---|---|
| PLANNED | non iniziata |
| PARTIAL | PR mergiate, requisiti ancora aperti |
| DELIVERED | tutti i requisiti PASS |
| BLOCKED | bloccata |
| CONTINUOUS | regola trasversale |

Lo stato si ricava dalle PR mergiate (`prs`) e dai verdetti dei requisiti (`requirement_verdicts`). **Nessun verdetto di requisito è cambiato:**
- FAIL, BLOCKED e NOT_VERIFIED restano come sono;
- Gate A resta **NOT PASS**;
- il campo `previous_status` conserva lo stato precedente.

PR mergiate fuori dalla sequenza R-xx: #146–#148, #167, #177, #180 e #181 (`pr_registry_reconciliation.outside_sequence`).

## 4. Configurazioni obsolete

| Elemento | Azione in questa PR | Resta da fare |
|---|---|---|
| `render.yaml` | `autoDeploy: false`, file conservato come storico con un commento verso #182 | nessuna interazione con Render; eventuali eliminazioni solo con GO owner |
| `.claude/settings.json` | rimossi dai permessi preautorizzati `mcp__Neon__run_sql` e `mcp__Neon__explain_sql_statement` (EXPLAIN ANALYZE esegue la query), ora negati; restano solo letture di metadati | nessuna query Neon eseguita |
| Workflow registrati su GitHub ma assenti da `main` | **solo documentati**. Sono `provider-trial-drive-readback-final.yml` (377922155), `provider-trial-regenerated-zero-cost.yml` (377676946), `provider-trial-transfer-resplit40.yml` (377913871) e `provider-trial-transfer-split.yml` (377898432), tutti `active` nell'elenco di GitHub | disattivazione da GitHub solo con GO owner. Nessuna modifica remota fatta |
| TotalCorner | **nessun cambiamento di comportamento** | in produzione i collector partono se c'è `TOTALCORNER_API_TOKEN` e manca `TOTALCORNER_{HISTORY,LIVE,PREMATCH}_ENABLED=false`. Discovery e mapping dipendono dal token. Attività **TC-OFF-01**: spegnimento esplicito da configurazione e test negativo che nessun collector TC parta, in una PR futura autorizzata |

## 5. Lavoro recuperato

### Lavoro di Claude

| Branch | Head | Stato |
|---|---|---|
| `ccr-e45875c0-5r0fnf` (#178) | `57aab63` | aperta, `dirty` |
| `app-01-row-gaps` | `768bae9` | nessuna PR |
| `gov-01-merge-policy` | `b841a06` | nessuna PR |

**Branch locali superati del container**, solo documentati e non autorevoli:
- `b5-local-backup` `15af348`;
- `deploy-approval-01-history-2af874f` `5874736`;
- `wip-r07a-local` `474f59d`;
- `pr149` `21eee83`;
- `main` locale `353dfc6`, obsoleto;
- `ccr-e45875c0-5r0fnf` locale `d47c25c`, indietro rispetto al remoto `57aab63`.

### Lavoro sulla VPS riportato su #179

È registrato come **dichiarazioni da verificare** nel checkpoint di VPS-MIGRATION-01 (`handoff: PENDING_VERIFICATION`, `to: ANY`). Non è HANDOFF READY né COMPLETED.

**Dichiarato eseguito:**
- staging PG18 con dati reali;
- backup cifrati;
- repository infra;
- `mp-deploy` v3 in FREEZE.

**Dichiarato aperto:**
- verifier obsoleto;
- S3 e S4 non avviati;
- DR cross-machine su PG18 non verificato;
- routine offsite incomplete;
- F1, F2, B13, B8, NB-E, NB-F.

**Istruzioni per l'agente che prende VPS-MIGRATION-01.** Vale per qualunque agente con accesso alla VPS: Grok, Claude o altri.
1. `git fetch origin`, poi `npm run governance:handoff-in -- VPS-MIGRATION-01 --agent <id>`. L'esito atteso è STOP con `HANDOFF_PENDING_VERIFICATION` ed `EVIDENCE_MISSING` per ogni dichiarazione `C1`…`C8` dell'ultimo checkpoint. Se `main` è avanzato dopo il checkpoint compare anche `UNRECONCILED_COMMITS`: si riconcilia leggendo il diff, come per STALE in [HANDOFF.md](HANDOFF.md).
2. Claim del lease su VPS-MIGRATION-01, risorsa `vps:matchpilot`. **Una sola sessione sulla VPS.**
3. Verifica **in sola lettura** di ogni dichiarazione elencata in `progress.done` e `vps` del checkpoint:
   - hash di `mp-deploy` e del verifier;
   - contenuto di `authz.conf` (solo i nomi delle chiavi e i valori non segreti);
   - porte e versioni PostgreSQL, conteggi delle righe dello staging;
   - ultimo backup e copia offsite;
   - commit del repository infra.
4. Scrive una verifica strutturata per ogni dichiarazione in un file JSON, con i campi `claim`, `resource`, `method`, `observed`, `observed_at`, `observer` e `result` (vedi [HANDOFF.md](HANDOFF.md)). Poi riesegue `handoff-in` con `--evidence <file>`:
   - deve dare PROCEED;
   - un MISMATCH dà STOP e va nei `findings`, con lo stato BLOCKED.

   Poi scrive il checkpoint v3 con `handoff.status: "IN"` e le stesse verifiche in `verified`.
5. Commento con marker su #179, poi **stop**.

**Vincoli:**
- nessun segreto nel checkpoint o nei commenti;
- nessuna modifica alla VPS;
- FREEZE invariato;
- S3 solo dopo **GO-S3**, S4 solo dopo **GO-S4**;
- i run 39635669968 e 39665149747 restano azioni owner.

## 6. Sequenza proposta, da approvare (non sostituisce #97)

1. Governance e checkpoint (questa PR).
2. S3.
3. S4.
4. DR PG18.
5. Cutover PostgreSQL.
6. Backend sulla VPS (APP-01).
7. TC OFF verificato (TC-OFF-01).
8. FPT.
9. Telegram.
10. Monitoraggio.
11. #178.
12. Sviluppo funzionale.

Ogni passo operativo richiede il proprio GO owner, e qualunque agente autorizzato può eseguirlo.

## 7. Handoff multi-agente

**Implementato.** Lo schema `mp-checkpoint-v3` e i comandi `handoff-in` e `authz-check` gestiscono:
- il ledger delle autorizzazioni (un GO consumato è rifiutato);
- lo scrittore unico per risorsa;
- l'eccezione per una seconda PR solo con decisione owner.

**Nessun privilegio legato al nome dell'agente.** La procedura è in [HANDOFF.md](HANDOFF.md).

**Collaudo reale Claude → Grok → Claude: HANDOFF NOT VERIFIED.** C'è solo la simulazione nei test. Il collaudo reale è l'attività HANDOFF-TEST-01.
