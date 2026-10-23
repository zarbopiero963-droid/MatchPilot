# MP-GROK-GLOBAL-TAKEOVER-01 — Prima consegna (22/10/2026, ora di Roma)

Agente: agent-g-grok. Base: `main` = `c4b82ba8ca3e11975ff6da5885ffee06ab750780`. Ricognizione in sola lettura (git, API GitHub, comandi di governance di `main`); nessuna modifica a main, #178, #184 o ai branch esistenti; nessun branch cancellato; nessun checkpoint sovrascritto.

## 1. Inventario
- **Branch remoti:** 118 (incluso main). Matrice completa ahead/behind + conflitti (`git merge-tree --write-tree` contro c4b82ba): allegato `branch-matrix.txt`.
- **PR:** 145 totali, 141 MERGED, 2 CLOSED (#73, #80, storiche trial), 2 OPEN: **#178** HIST-01a, **#184** FUNC-RECOVERY-01.
- **Branch senza PR mergiata con la stessa testa:** 16 (sotto). Gli altri 101 branch hanno la testa identica a una PR mergiata (lavoro integrato, branch residui).
- **Issue aperte:** 35 (tra cui #3, #12, #20 sospesa, #40, #97, #104, #150, #179, #182).
- **Lease:** nessun lease attivo su `main` (nessun lease Claude da rispettare). Unico lease: `FUNC-RECOVERY-01` di agent-g-grok sul branch funzionale (scade 14:53 Roma, non rinnovato per non muovere l'HEAD di #184).

## 2. Lavoro non integrato
| Branch | Head | Ahead/behind vs main | merge-tree | PR | Stato |
|---|---|---|---|---|---|
| `ccr-e45875c0-5r0fnf` (HIST-01a) | 57aab63 | +9 / −3 | CONFLITTO | #178 OPEN | implementato non mergiato, bloccato |
| `app-01-row-gaps` (APP-01) | 768bae9 | +2 / −3 | CONFLITTO | nessuna | implementato non mergiato, bloccato |
| `gov-01-merge-policy` (GOV-01) | b841a06 | +4 / −3 | CONFLITTO | nessuna | proposta non approvata, bloccato |
| `functional/mp-vps-recovery-20261022` | 8ed6a4b | +5 / 0 | pulito | #184 OPEN | in review |
| `review/mp-deploy-v31-r2-20261022` | a8967e4 | +1 / 0 | pulito | nessuna | pacchetto review v3.1-r2, attesa review Claude + GO-S3 |
| `deploy-approval-01-history-2af874f` | 5874736 | +6 / −3 | CONFLITTO | nessuna | obsoleto (storia di #180/#181, superata) |
| `evidence/audits` | 17f78c8 | storia separata | — | nessuna | archivio evidenze (by design, non da mergiare) |
| `archive/pre-trading-os-reset-2026-10-04` | 415b106 | 0 ahead | — | nessuna | archivio |
| `trial-point9`, `temp/betsapi-trial-collector`, `temp/provider-trial-regenerated-zero-cost`, `temp/reconciliation-sql-placeholder-fix`, `fix/trial-boundary-auto`, `fix/provider-trial-regenerated-portable-archive` | — | −95 | CONFLITTO | nessuna | obsoleti: trial #40 chiuso (docs/provider-trial-final-closure), NON VERIFICATO riga per riga |
| `temp/rate-audit-split`, `temp/reconciliation-certificate-date-fix` | — | −95 | — | #80/#73 CLOSED | obsoleti |
**APP-02:** nessun branch, commit o checkpoint esiste. Unico riferimento: `docs/deploy-approval.md:320` ("GOV-01, APP-01, APP-02, one PR at a time"). → **non iniziato**.

## 3. Stato esatto
- **#178 HIST-01a** — head 57aab63; CI verde sulla testa (run 39498732424: Fast, PG, Browser QA, Exploratory, CI gate PASS); test offline `test/hist-backtest.test.mjs` 16/16 PASS (rieseguito ora); conflitti con main (registry/checkpoint/requirements); review: nessuna approvazione formale. `handoff-in` = PROCEED, ma stop_condition: "no write on the branch without a new owner mandate for #178". Prossima azione: mandato owner → merge di main nel branch (no rebase/force-push), rigenerazione file generati, CI, review separata.
- **APP-01** — head 768bae9; `test/fpt-row-gaps.test.mjs` 2 skipped offline (richiede PostgreSQL, NON VERIFICATO); conflitto; **finding APP-F1**: lo stesso id `CP-20261020T200407Z-agent-a-claude-code` esiste con contenuti diversi su app-01 e gov-01 (sha 0352b0c0… vs 31154213…); le catene valide sono su main (CP-20261021T203602Z). Prossima azione: decisione owner fase backend VPS (#182 P4), poi riallineo a main SENZA quel checkpoint duplicato e una PR.
- **GOV-01** — head b841a06; test governance merge-class/merge-facts/policy 20/20 PASS offline; conflitto; stesso duplicato APP-F1; proposta MP-OWNER-AUTOMERGE-02/03 **non approvata**. Prossima azione: owner approva/modifica/archivia.
- **APP-02** — non iniziato (vedi sopra).
- **Mergiate:** #180 (e127c26), #181 (1703054), #183 (c4b82ba) — su main. **Finding GR-T1:** il registro su main dice ancora GOV-RECON-01 `REVIEW`, `pr_open: true`; `handoff-in` dà STOP `PR_OPEN_MISMATCH`/`PR_ALREADY_MERGED`. Serve un checkpoint MERGED con `merge_sha` (non scritto da me: attività di Claude, nessun lease; proposto come primo passo governance).
- **HANDOFF-TEST-01** — PLANNED, nessun checkpoint; **non certificato** (HANDOFF NOT VERIFIED).

## 4. Riconciliazione #97 / #104 / #3
- Gerarchia confermata (doc `reconciliation-2026-10-21.md` su main): decisioni owner → #3 master → **#97 roadmap canonica** → #104 catalogo storico (82 PR = baseline storica, non residuo verificato). #182 decisione VPS-only, #179 migrazione.
- Il corpo di #97 è fermo al 07/10 (prossima azione "PR #125"): **superato** dai fatti (main ha 141 PR mergiate dopo). Non modifico il corpo; la sequenza aggiornata è proposta al §7 e richiede approvazione owner.
- #104 e #3: nessuna contraddizione nuova; restano la mappa di dominio. Le fasi #97 0–11 hanno lavoro reale su: #23 auth baseline (R-04 mergiata), #98 API v1 (R-03), #31/#12 PIT (R-08), #30/#25 Match Center (R-07a), #34 backtest (HIST-01a non mergiato), FUNC-RECOVERY-01 (segnali simulati, #184).

### Matrice ISSUE → REQUISITO → BRANCH → COMMIT → PR → TEST → REVIEW → STATO → PROSSIMA AZIONE
| Issue | Requisito/attività | Branch | Commit | PR | Test | Review | Stato | Prossima azione |
|---|---|---|---|---|---|---|---|---|
| #97 | GOV-RECON-01 | claude/gov-recon-01 | af7478b→c4b82ba | #183 | CI | review D2 | completato e mergiato | checkpoint MERGED (GR-T1) |
| #97 | DEPLOY-APPROVAL-01 | deploy-approval-01 | 3b1604b | #180 | CI | sì | completato e mergiato | — |
| #179 | DEPLOY-GATE-S1S2-01 | deploy-gate-final-01 | f5d6dfc | #181 | CI | D2 | completato e mergiato | S3/S4 con GO |
| #34 | HIST-01a | ccr-e45875c0-5r0fnf | 57aab63 | #178 | CI verde, 16/16 | nessuna formale | implementato non mergiato (conflitto) | mandato owner #178 |
| #179 | APP-01 | app-01-row-gaps | 768bae9 | — | 2 skipped offline | — | implementato non mergiato | GO #182 P4, riallineo |
| #97 | GOV-01 | gov-01-merge-policy | b841a06 | — | 20/20 | — | bloccato (proposta non approvata) | decisione owner |
| — | APP-02 | — | — | — | — | — | non iniziato | definire |
| #179/#182 | FUNC-RECOVERY-01 | functional/mp-vps-recovery-20261022 | 8ed6a4b | #184 | locale 390/0/61; CI Fast+PG PASS, Browser/Exploratory QA in attesa | richiesta a Claude (6340499752) | parziale (in review) | review + CI, poi GO merge |
| #179 | v3.1-r2 gate | review/mp-deploy-v31-r2-20261022 | a8967e4 | — | test offline (t98u) | attesa Claude | implementato non mergiato | review + GO-S3 |
| #179 | VPS-MIGRATION-01 | main | — | — | — | — | bloccato (C1–C8 da verificare) | handoff-in con evidenze |
| #20 | TC-OFF-01 | — | — | — | — | — | non iniziato | PR dopo #184 |
| #150 | HANDOFF-TEST-01 | — | — | — | — | — | non iniziato | collaudo reale |
| #40 | trial provider | 30+ branch temp/fix | — | #73/#80 CLOSED | — | — | obsoleto-duplicato | nessuna (archivio) |

## 5. VPS + branch funzionale
VPS 45.14.186.174: produzione invariata (release 3dd833f, `matchpilot-app` attivo con DB vuoto), FREEZE=1 MODE=report, runner attivo. Ambiente di prova isolato attivo: app 127.0.0.1:3100 (unit transitoria), cluster PG18 `functest` 127.0.0.1:5440 con copia di staging (161.801 partite). PR #184 aperta su 8ed6a4b, mergeable, `BLOCKED` in attesa di review/QA. Nota: #184 e il branch di governance toccano entrambi `work-registry.json` → il secondo che arriva su main dovrà riconciliare la `revision`.

## 6. v3.1
`review/mp-deploy-v31-r2-20261022` a8967e4 (pacchetto offline, non installato). In attesa della review indipendente di Claude e del GO-S3. Decisioni owner aperte: P1/A7 (token bot separato o reviewer distinto), F1 (regola sudo `mpdeploy`), run 39635669968 stale (azione owner).

## 7. Roadmap ordinata (proposta, da approvare; non sostituisce #97)
1. Chiudere #184 (review Claude, QA CI, GO merge) — prodotto visibile.
2. Checkpoint MERGED per GOV-RECON-01 (GR-T1) — sblocca handoff-in.
3. VPS-MIGRATION-01 handoff IN con verifiche C1–C8 (sola lettura).
4. Review v3.1-r2 → GO-S3 → S4 (dopo P1/A7).
5. Dati reali per la produzione (copia storica nel DB di prod o cutover PG) — GO owner.
6. TC-OFF-01 (una PR).
7. Acquisizione FPT riattivata + Telegram stub → reale (GO).
8. #178 HIST-01a: mandato owner, merge di main nel branch, review.
9. APP-01 riallineato (senza checkpoint duplicato) dopo #182 P4.
10. GOV-01: decisione owner.
11. HANDOFF-TEST-01 reale.

## 8. Prima PR proposta
Dopo il merge di #184: **una PR di governance** dal branch `governance/grok-takeover-20261022` (questa consegna) + checkpoint MERGED di GOV-RECON-01 (GR-T1). Nessuna PR aperta ora (regola una PR di implementazione attiva: #184).

## 9. Checkpoint
Mandato registrato in `owner-decisions.json` come `MP-GROK-GLOBAL-TAKEOVER-01`; attività `TAKEOVER-01` (kind audit) con lease agent-g-grok; checkpoint v3 sul branch `governance/grok-takeover-20261022` (id nel commento). `governance:check` PASS.

## Comandi eseguiti (principali)
`git ls-remote origin`, `git merge-tree --write-tree c4b82ba <branch>`, `gh pr list --state all`, `gh pr checks 178/184`, `node tools/governance/cli.mjs validate|status|handoff-in <task> --agent agent-g-grok` (GOV-RECON-01 STOP, HIST-01a/APP-01/GOV-01 PROCEED con stop_conditions, VPS-MIGRATION-01 STOP EVIDENCE_MISSING C1–C8, HANDOFF-TEST-01 NO_CHECKPOINT), `node --test` sui branch HIST-01a/APP-01/GOV-01.
