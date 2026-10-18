# MP-GATE-A-REVIEW-ROADMAP-01 — Appendice B: governance permanente, checkpoint e handoff

Data: 2026-10-18.
Richiesta da: MP-OWNER-MASTER-GOVERNANCE-2026-10-18 §15 (Fase A) e §16.
Il rapporto originale `2026-10-18-MP-GATE-A-REVIEW-ROADMAP-01.md` resta invariato e verificabile con il suo `.sha256`. Questa appendice non riscrive le evidenze dell'audit: le integra con le decisioni owner arrivate dopo il rapporto e con lo stato dell'inventario v2.

Legenda: **FACT** = verificato · **INFERENCE** = deduzione motivata · **PROPOSAL** = proposta · **NOT VERIFIED** = non verificabile con i mezzi disponibili.

## B.1 Verdetto e finding (stato dopo R-00)

- **FACT:** il verdetto sull'head `21eee83` resta **PASS WITH REQUIRED CORRECTIONS**.
- **FACT:** le correzioni B-01…B-07 sono applicate sul branch della PR #149, come autorizzato da D1:

| Finding | Correzione |
|---|---|
| B-01 | `summarize()` calcola `pass_with_evidence`; body della PR corretto |
| B-02 | il validatore rifiuta PASS senza evidenza; i 7 PASS hanno ricevuto un'evidenza citata oppure sono scesi a NOT_VERIFIED, con `history` |
| B-03 | il test 12×8 è eliminato; un test verifica che i gruppi non abbiano dimensione uniforme imposta |
| B-04 | 41 requisiti aggiunti (API, ARC, PIT, XPR, MKT, MTH, OPS, WEB, TC, GOV, QAC); `census.status = PROVISIONAL`; lacune residue elencate in `known_gaps` |
| B-05 | `pr_registry` R-00…R-18; ogni `target_prs` deve appartenere al registro; ogni PR deve coprire almeno un requisito |
| B-06 | `docs/governance/owner-decisions.json` validato; MP-GOV-005 riscritto secondo AUTOMERGE-01 |
| B-07 | GOV-010 portato a NOT_VERIFIED; TC-007 diviso (market in TC-015); TC-008 PASS con scope #145; SEC-011 spostato nel future register; il validatore rifiuta PASS che dipende da requisiti non PASS |

- **NOT VERIFIED:** la readiness al merge. Dipende dalla CI sul nuovo head e dalla revisione indipendente (D2), da registrare su GitHub.

## B.2 Conteggi richiesti dal mandato master §3

| # | Voce | Valore | Natura |
|---|---|---|---|
| 1 | PR storiche completate | 58 mergiate su `main`, di cui 14 sulle card #104 (5 card TC componente) e circa 38 FPT-PR-01..09; più 52 sul branch del trial #40 | FACT |
| 2 | PR residue OFFLINE v1 | **18** (R-01…R-18) dopo la #149; intervallo **16–22** | PROPOSAL / NOT VERIFIED (census PROVISIONAL) |
| 3 | PR residue MatchPilot completo approvato | **≈90**, intervallo 75–105 | NOT VERIFIED: #45, #32 e UI finale non hanno piani a card |
| 4 | PR duplicate o superate | 0 verificate; assorbimenti di fatto: MP-PR-02→R-01, MP-PR-03→R-05, MP-PR-05→R-09; 11 card #104 assorbite in R-xx (vedi `pr_registry.cards`) | FACT (assorbimenti) / D8 classifica le card |
| 5 | Totale globale delle PR distinte residue | **≈108** (18 + ≈90), intervallo 91–127 | NOT VERIFIED |
| 6 | Requisiti atomici OFFLINE v1 | **136** nell'inventario v2: 102 P0, 34 P1 | FACT sul file; il denominatore resta PROVISIONAL (D3) |
| 7 | Requisiti completati con evidenza | **27 PASS**, tutti con evidenza e ciascuno limitato al proprio scope; **0 GLOBAL HARD CERTIFIED** | FACT |
| 8 | Requisiti ancora mancanti | **109** non PASS: 65 FAIL, 38 NOT_VERIFIED, 6 BLOCKED; di questi **82 P0** | FACT |

**Cosa manca per rendere definitivi i numeri 2, 3 e 5:**
- atomizzazione delle card web #3/#25/#30 e delle sezioni #20, prevista nel Gate A locale di R-06, R-07 e R-15;
- piani a card per #45, #32 e per la UI finale;
- classificazione D8 di tutte le 82 card in #97.

## B.3 Auto-merge (MP-OWNER-AUTOMERGE-01, D2)

- **Condizioni (FACT dal registro):**
  1. scope autorizzato;
  2. Gate A locale PASS;
  3. Gate B locale PASS;
  4. test obbligatori PASS;
  5. GitHub Actions PASS;
  6. branch protection soddisfatta;
  7. review indipendente APPROVED secondo D2;
  8. zero finding bloccanti;
  9. nessun conflitto owner;
  10. nessuna operazione esterna non autorizzata.
- **Review indipendente secondo D2:** un agente AI diverso dall'implementatore, che verifica diff, SHA, requisiti, codice, test, evidenze e rischi. Il rapporto viene pubblicato sulla PR con un verdetto esplicito: APPROVED, CHANGES REQUESTED, BLOCKED o NOT VERIFIED.
- **NOT VERIFIED:** le regole del ruleset 24790739. Se richiede un'approvazione formale GitHub, l'account autore della PR non può darla e il merge si ferma come blocker reale, senza bypass.
- **Tracciabilità del merge:** commit di merge, timestamp, link alla review ed evidenze vengono registrati nel checkpoint successivo.

## B.4 Chiusura issue solo owner (MP-OWNER-CERT-ISSUE-CLOSURE-01, D9)

- **FACT:**
  - `.github/workflows/` contiene solo `ci.yml`, che non chiude issue;
  - CodeRabbit "Autofix" è presente ma non attivato;
  - il template PR non contiene parole chiave di auto-chiusura.
- **Conflitti da rimuovere in R-01:**
  - l'eccezione di AGENTS.md / CLAUDE.md che consente all'agente di chiudere una issue specifica;
  - l'intestazione "READY TO CLOSE / CHIUDIBILE", da sostituire con "READY TO CLOSE — OWNER APPROVAL REQUIRED".
- **PROPOSAL R-01:** un test di repository che rifiuta `Closes|Fixes|Resolves #N` (e varianti) nei documenti canonici e nel template. Il body della PR va verificato anche dal reviewer, perché non è un file del repository.
- **D9:** #40 e #20 restano OPEN.

## B.5 GitHub single source of truth (D10)

| Informazione | Fonte canonica | Collegamenti |
|---|---|---|
| Decisioni owner | `docs/governance/owner-decisions.json` | AGENTS.md, #3, #97 |
| Regole operative | `AGENTS.md` (allineamento in R-01) | CLAUDE.md rimanda |
| Prodotto | #3 | README |
| Roadmap operativa | #97 (D8), riconciliata con `pr_registry` | #104 catalogo storico |
| Requisiti Gate A | `docs/governance/mp-pr-00/requirements.json` | traceability.md |
| Checkpoint e handoff | `docs/governance/checkpoints/` (R-01, PROPOSAL) | issue e PR attive |
| Evidenze di audit | `docs/governance/audits/` con `.sha256` | PR |

**Stato oggi:** AGENTS.md e CLAUDE.md contengono ancora il blocco operativo del 07/10 e regole superate. Il registro dichiara quali decisioni prevalgono; l'allineamento dei testi è in R-01.

## B.6 Architettura checkpoint e handoff (PROPOSAL per R-01, MP-MULTIAGENT-SYNC-CHECKPOINT-01)

- **Formato:** `docs/governance/checkpoints/CP-<YYYYMMDDTHHMMSSZ>-<agent>.json`, append-only, uno per ciclo di lavoro.
- **Campi** (requisito MP-GOV-017):
  - `id`, `timestamp_utc`, `agent`, `role` (Development / Test / Independent Reviewer / Requirements Auditor / Roadmap Coordinator / Integration);
  - `repository`, `branch`, `commit_sha`, `tree_sha`, `issue`, `pr`, `requirements[]`, `changes[]`, `tests[]`, `ci`, `gate_a`, `gate_b`, `review`, `findings[]`, `owner_decisions[]`, `dependencies[]`;
  - `state`: PLANNED / RUNNING / BLOCKED / REVIEW / HANDOFF READY / CERTIFIED / MERGED / COMPLETED;
  - `next_action`, `resume_conditions`, `supersedes`, `lease` (`holder`, `expires_at`).
- **Ultimo checkpoint valido:** il più recente non superato, con SHA esistente su GitHub e lease coerente. Divergenza fra SHA dichiarato e reale = stop e conflitto registrato.
- **Lease:**
  - una sola implementazione attiva per PR o worktree;
  - un lease scaduto consente di prendere in carico il lavoro solo dopo la riconciliazione dello stato reale;
  - non autorizza mai la sovrascrittura.
- **Idempotenza:** prima di creare commit, PR, commenti, review o merge, l'agente cerca un artefatto con lo stesso identificativo (marker nel testo o nome del file) e lo riusa.
- **Visibilità:** ogni checkpoint viene committato sul branch della PR attiva e riportato in un commento "CHECKPOINT <id>" sulla PR o issue, con marker per la deduplicazione.
- **Sicurezza:** nessun segreto. Il validatore rifiuta pattern di token e chiavi.
- **Recovery:** interruzione, timeout, limiti d'uso, cambio di modello, agente o ambiente si risolvono rileggendo il registro e l'ultimo checkpoint, poi verificando SHA, CI e PR prima di proseguire.

## B.7 Test necessari per certificare il sistema multi-agente (MP-GOV-017…019)

Test automatici (R-01):
1. schema dei checkpoint;
2. lettura e scrittura;
3. selezione dell'ultimo checkpoint valido;
4. SHA mismatch;
5. checkpoint obsoleto o superato;
6. concorrenza e lease;
7. handoff;
8. recovery dopo interruzione simulata, etichettata come tale;
9. idempotenza (nessun duplicato);
10. assenza di segreti;
11. coerenza con il registro delle decisioni owner;
12. gate dell'auto-merge;
13. guard contro l'auto-chiusura delle issue.

Collaudo reale obbligatorio:
- **Sequenza:** Agente A → checkpoint su GitHub → interruzione → Agente B (sessione separata, senza la conversazione di A) → recupero → verifica → completamento di un'attività.
- **Evidenze pubblicate:** ID dei checkpoint, SHA, link alle sessioni o agli autori.
- **Dichiarazione:** solo dopo il collaudo si può dichiarare "MULTI-AGENT HANDOFF CERTIFIED".

## B.8 Decisioni owner

- **Registrate in questa PR (FACT):** tutte le voci di `owner-decisions.json`, incluse D1–D11, AUTOMERGE-01, CLOSURE-01, SSOT-01 e MASTER-GOVERNANCE.
- **Ancora da decidere:**
  - eccezione STOP/ADVISORY sulle posizioni aperte (#96/#99), non necessaria per v1;
  - livello di accessibilità, i18n, disclaimer legale, policy di retention per dimensione;
  - **issue di riferimento per R-01:** non esiste una issue dedicata al sistema multi-agente. Il mandato master §15 Fase C richiede l'autorizzazione dell'owner per crearla; in alternativa R-01 può dichiarare `Refs #97 #3`.
- **Da registrare anche nelle issue:** un commento checkpoint in #97 e #3 che rimanda al registro, dopo il merge della #149.

## B.9 Prossima PR eseguibile

- **R-01:** governance alignment + MP-MULTIAGENT-SYNC-CHECKPOINT-01 + schema delle evidenze Gate B. Parte dopo il merge della #149 e dopo la scelta dell'issue di riferimento (B.8).
- **Senza attendere l'issue:** R-03 (API v1) e R-12 (oracle) non richiedono accessi esterni e possono seguire nell'ordine delle dipendenze.

## B.10 Stato di permessi e autorizzazioni (FACT salvo diversa indicazione)

| Risorsa | Stato |
|---|---|
| GitHub (repo, PR, issue, commenti) | lettura e scrittura via MCP in questa sessione; push sul branch della #149 autorizzato da D1 |
| Ruleset / branch protection | NOT VERIFIED: impostazioni non leggibili |
| Approvazione formale GitHub indipendente | non disponibile dall'account autore |
| Google Drive (archivio #40) | strumenti MCP presenti; accesso al percorso dell'archivio NOT VERIFIED; solo lettura (D7) |
| Neon | MCP non autenticato in questa sessione; nessuna scrittura autorizzata |
| Render | strumenti presenti; nessun deploy o riavvio autorizzato |
| TotalCorner / FutPythonTrader API | nessuna credenziale nell'ambiente (verifica sui soli nomi); stato abbonamento TC NOT VERIFIED; nessuna spesa autorizzata (D6) |
| Costi | nessuna spesa autorizzata |
