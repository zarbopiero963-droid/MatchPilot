# E — Riconciliazione roadmap e PR (audit in sola lettura)

**Repository:** `zarbopiero963-droid/MatchPilot`. **Base:** `main` = `39fe08e` (checkout in sola lettura). **Data:** 22/10/2026.
**Metodo:** API GitHub in lettura (PR, issue, commenti), file del repository su `main`, ispezione del codice in `src/`, `migrations/`, `test/`. Nessuna scrittura su GitHub, nessun commit, nessun accesso alla VPS. Nessun segreto riportato.
**Nota sul metodo:** il campo `merged` restituito dall'elenco PR via MCP vale `false` anche per le PR mergiate. Ho usato `merged_at` (verificato con `gh api`): una PR è mergiata se e solo se `merged_at` è valorizzato.

---

## 1. Fonti lette

| Fonte | Stato / ultimo aggiornamento | Note principali |
|---|---|---|
| #3 MASTER | open, body aggiornato 21/10 ma con blocco di stato del **07/10** | ultimi commenti: 6254330895 (18/10, registro decisioni + OFFLINE v1), 6325344914 (21/10, VPS-only → #182), 6326169335 (riconciliazione #183, "body di #3 da aggiornare (owner)") |
| #97 ROADMAP | open, 45 commenti, ultimo 22/10 14:04 | body con stato 07/10 + fasi 0–16 + quattro decisioni owner del 19/10 accodate; P0–P6 di #182 solo nel commento 6325345673; ultime consegne Grok 6340604077, 6341332738, 6341681530, 6342030067, 6342716999 |
| #104 catalogo | open, titolo ancora "Piano canonico 82 PR" | 82 card (elenco in §3); commenti 6325346427 (VPS: aggiungere task atomiche) e 6326175628 ("nessuna card dichiarata COMPLETED") |
| #182 decisione VPS-only | open, 21/10 | fasi P0–P6; nessuna fase operativa autorizzata dalla issue; GO separato per ogni fase |
| #179 migrazione | open, 41 commenti, ultimo 22/10 15:10 | 6344141373: Grok attiva la raccolta FPT sulla VPS su PG18 `matchpilot_staging` (161.801 partite), cita decisioni owner "t108u/t114u" |
| `docs/integration-map.md` | fermo al **07/10** | vedi incoerenze §4 |
| `docs/governance/mp-pr-00/requirements.json` | 139 requisiti; `pr_registry` R-00…R-18 + continuous | verdetti: 36 PASS, 35 FAIL, 7 BLOCKED, 61 NOT_VERIFIED; Gate A **NOT PASS** |
| `docs/governance/work-registry.json` | rev 137, 39 attività | SIM-OUTBOX-01 ancora REVIEW con `pr: 189`, `pr_open: true` (errato, §4) |
| `docs/governance/reconciliation-2026-10-21.md` | 21/10 | sequenza §6 "proposta da approvare" |
| `docs/governance/owner-decisions.json` | 73 voci | decisioni chiave: D3 (perimetro OFFLINE v1), D8 (#97 canonica, #104 catalogo storico), EXCLUDE-REAL-EXECUTION-01, ARCHIVE-FIRST-01, VPS-ONLY-2026-10-21, OWN-OPEN-STOP-ADVISORY (OPEN) |

---

## 2. Pull request: totali e mappatura

**Totali (verificati con `merged_at`):**
- **150 PR** in totale (numeri da #5 a #189; gli altri numeri sono issue).
- **146 mergiate.** Comprendono #187 (SIM-OUTBOX-01) e il suo revert #189: l'effetto netto sul codice è nullo.
- **1 aperta:** **#178** HIST-01a, head `57aab63`, base `3dd833f`. Stato:
  - BLOCKED nel registro, in conflitto con `main`;
  - CI verde solo sul vecchio head;
  - merge non autorizzato (`MP-OWNER-HIST-01A-02`);
  - "intoccabile salvo nuovo mandato" (#182 punto 6).
- **3 chiuse senza merge:** #73, #80 (trial storici) e #188 (SIM-SCHEDULE-01, chiusa il 22/10 dopo la decisione t108u).

**Distribuzione delle mergiate per blocco:**

| Blocco | PR mergiate | Nel catalogo #104? |
|---|---|---|
| DATA-01..04 e FPT-CERT #12 (04–05/10) | #5, #7, #9, #11, #13–#18, #33, #35–#39, #41–#43, #48, #49, #57, #81–#83, #86, #88–#90, #92, #93 (31) | no: il FPT certificato al 05/10 è fuori dalle 82 |
| PROVIDER-TRIAL #40 / BetsAPI (temp) | #47, #50–#56, #58–#72, #74–#79, #84, #85, #105–#124, #126–#129 (55) | no |
| Docs, mock, contratti | #19, #21, #22, #26, #101, #103, #125 (7) | no |
| TotalCorner core #20 | #130, #131, #133–#143, #145 (14) | sì: TC-CORE-01, 02, 03, 03B, 04 |
| CI zero-cost / isolamento runtime (#144) | #146–#148 (3) | no |
| Sequenza R-xx (OFFLINE v1) | #149, #151–#166, #168–#176 (26) | in parte (§3) |
| VPS, deploy e governance | #167, #177, #180, #181, #183, #185 (6) | no |
| Funzionale VPS (#182) | #184, #186, #187, #189 (4) | no |

La tabella completa PR per PR (titolo, stato, data di merge, branch, issue, card, R-xx) è nell'**Appendice A**.

**Mappatura delle PR mergiate su R-xx** (`pr_registry`, verificata sul codice):

| R-xx | PR | Stato di consegna nel registro | Codice su `main` |
|---|---|---|---|
| R-00 | #149 | PARTIAL | inventario Gate A |
| R-01 | #151 (+ #167, #183) | PARTIAL | `tools/governance`, checkpoint v3 |
| R-02 | #152 | BLOCKED | solo verifica metadati; SHA per parte e portabilità DuckDB non verificati |
| R-03 | #153 | PARTIAL | `src/api/v1.mjs`, registry `/api/v1/endpoints` |
| R-04 | #157, #158, #159, #160 | PARTIAL | `src/auth/owner-auth.mjs`; ruolo solo `owner`; login spento per default |
| R-05 | #161, #164–#166, #168–#175 | PARTIAL | web shell, Browser QA, baseline visive |
| R-06 | #162, #163 | PARTIAL | Daily Board, ricerca, paginazione keyset; **solo dati seminati** |
| R-07 | #176 | PARTIAL | `src/analysis/match-analysis.mjs` (primo lotto di #30) |
| R-08 | #154, #155 | PARTIAL | `src/pit/policy.mjs`, `src/pit/readers.mjs`; identità cross-provider assente |
| R-12 | #156 | PARTIAL | `src/math/decimal.mjs`, `src/math/core.mjs`: probabilità implicita, overround, fair odds, arrotondamento; niente Poisson, Kelly o hedge |
| R-13, R-14 | nessuna (solo #178 aperta) | PLANNED / BLOCKED | assente su `main` |
| R-09, R-10, R-11, R-15, R-16, R-17, R-18 | nessuna | PLANNED | assente |

---

## 3. Catalogo #104: stato delle 82 card

**Criteri.**
- **COMPLETED:** codice mergiato ed evidenza reale nel perimetro della card. Non implica una certificazione integrata né globale; `MP-TC-012` resta BLOCKED.
- **PARTIAL:** c'è codice mergiato, ma il perimetro della card non è coperto o i verdetti sono NOT_VERIFIED.
- **PLANNED:** nel perimetro approvato, nessun codice su `main`. I WIP non mergiati non contano.
- **DEFERRED:** rinviata da una decisione owner in vigore (TC sospeso #182, LIVE owner-gated MP-FUT-007).
- **SUPERSEDED / NOT VERIFIED:** nessuna card ricade in queste classi.

**Conteggio:**

| Stato | Card |
|---|---|
| COMPLETED | **6** |
| PARTIAL | **5** |
| PLANNED | **69** |
| DEFERRED | **2** |
| SUPERSEDED | 0 |
| NOT VERIFIED | 0 |
| **Totale** | **82** |

| Card | Issue | Stato | Evidenza |
|---|---|---|---|
| AUTH-CORE-01 Auth/session/security baseline | #23 | PARTIAL | #157–#160: sessioni, rotazione, logout e revoca, rate limit, audit, controllo di origine. MP-SEC-001 e MP-SEC-007 NOT_VERIFIED; nessuna prova sul deploy reale |
| AUTH-CORE-02 Users/RBAC/account isolation | #23 | PARTIAL | `ROLE_PERMISSIONS = {owner: ['*']}` e middleware di autorizzazione; nessun utente oltre l'owner, nessun isolamento tra account |
| AUTH-CORE-03 Secondary admin + audit | #23 | PLANNED | MP-FUT-018 |
| AUTH-CORE-04 Hard certification | #23 | PLANNED | — |
| MCP-CORE-00 Tool registry/schema/error/authz | #98 | PARTIAL | #153: registry degli endpoint ed envelope di errore. Mancano trasporto MCP, binding authz dei tool e convenzione per mutazioni e idempotenza |
| SETTINGS-CORE-01..04 | #95 | PLANNED (4) | nessun codice; MP-FUT-019 |
| TC-CORE-01 Contract/discovery/raw | #20 | COMPLETED | #130; MP-TC-001 PASS (#20 6057763877) |
| TC-CORE-02 Mapping | #20 | COMPLETED | #131, #133; MP-TC-002 PASS (96 competizioni VERIFIED) |
| TC-CORE-03 Prematch/PIT | #20 | COMPLETED | #134–#136; MP-TC-003 e MP-TC-004 PASS |
| TC-CORE-03B Storico upstream | #20 | COMPLETED | #137–#142; MP-TC-006 PASS (campione di 60 partite) |
| TC-CORE-04 Live collector | #20 | COMPLETED | #143, #145; MP-TC-007 e MP-TC-008 PASS (#20 6081058030); oggi spento da TC-OFF-01 (#186) |
| TC-CORE-05 Live normalization/events | #20 | PLANNED | R-15; MP-TC-013 FAIL |
| TC-CORE-06 Captured history/replay readiness | #20 | PLANNED | R-15 |
| TC-CORE-06B Coverage temporale/campo | #20 | PLANNED | R-15; MP-TC-014 FAIL |
| TC-CORE-07 Resilience/budgets/alerts | #20 | PARTIAL | limiter, retry e backoff presenti (MP-TC-009 PASS); alert TC (MP-TC-011) NOT_VERIFIED, oggi sospeso |
| TC-CORE-08 Multi-day live hard cert | #20 | DEFERRED | MP-FUT-007 owner-gated; TC sospeso (#182) |
| RECON-CORE-01 Cross-provider identity/gap model | #31 | PLANNED | MP-XPR-001 FAIL; #154 e #155 sono solo prerequisiti PIT |
| RECON-CORE-02 TC prematch reconciliation | #31 | PLANNED | MP-XPR-002 FAIL |
| RECON-CORE-03 Live gap detection/recovery | #31 | DEFERRED | richiede TC live, sospeso |
| RECON-CORE-04 Scheduler/idempotency/alerts | #31 | PLANNED | parte FPT già nel perimetro FPT 05/10; R-17 |
| RECON-CORE-05 Failure drills + cert | #31 | PLANNED | R-17 |
| REPLAY-CORE-01 PIT domain/query | #24 | PLANNED | R-09; MP-RPL-* da FAIL a BLOCKED |
| REPLAY-CORE-02 Neutral replay contract | #24 | PLANNED | R-10 |
| MATH-CORE-01 Decimal/common | #94 | COMPLETED | #156: Decimal BigInt, oracolo a frazioni esatte. MP-MTH-001 resta NOT_VERIFIED perché copre tutte le formule |
| MATH-CORE-02..06 | #94 | PLANNED (5) | nessuna formula Kelly, EV, hedge o dutching su `main`. `settleMarket` esiste solo in #178 |
| MATH-CORE-07 Poisson/adapters | #94 | PLANNED | R-12; MP-MTH-002 FAIL |
| MATH-CORE-08 API/tool + cert | #94 | PLANNED | — |
| MM-CORE-01..08 | #96 | PLANNED (8) | nessun codice; MP-FUT-012 |
| MARKET-CORE-01..05 | #100 | PLANNED (5) | regola `mp-outcome-1x2-1` solo in #178, non mergiata; MP-MKT-001..003 FAIL |
| LEDGER-CORE-01..07 | #99 | PLANNED (7) | nessun codice |
| PAPER-CORE-01 | cross | PLANNED | — |
| STRAT-CORE-01..07 | #34 | PLANNED (7) | STRAT-03 e 04 sono WIP in #178 (BLOCKED); MP-STA-* FAIL |
| TRADE-CORE-01..08 | #28 | PLANNED (8) | `src/signals/simulated.mjs` (#184, regola `mp-sim-over25-v1`) è un segnale simulato fuori catalogo, non TRADE-CORE |
| MM-INTEGRATION-01 | #96 | PLANNED | — |
| REPLAY-CORE-03 | #24 | PLANNED | — |
| QUERY-CORE-01 #25 finished-match | #25 | PLANNED | MP-WEB-004 FAIL |
| QUERY-CORE-02 #30 analysis/query | #30 | PARTIAL | #162, #163, #176; solo dati seminati, certificazione su dati reali NOT_VERIFIED |
| BENCH-CORE-01 | #27 | PLANNED | dipende da #28 |
| TCOP-CORE-01..04 | #102 | PLANNED (4) | — |
| MCP-CORE-01..03 | #98 | PLANNED (3) | — |

**Lavoro mergiato fuori catalogo** (non chiude nessuna card): sito reale R-05/R-06/R-07, Browser QA e baseline visive, policy PIT, gate di deploy VPS, governance, segnali simulati (#184), TC-OFF (#186).

---

## 4. Incoerenze tra #3, #97, #104, issue di dominio, PR e `main`

1. **#3, blocco di stato fermo al 07/10.**
   - Indica ancora come prossima azione "owner review PR #125" (mergiata il 07/10) e "#20 URGENTE".
   - Non cita: la decisione VPS-only #182, la sospensione di TC, il perimetro OFFLINE v1 (D3), le 146 PR mergiate.
   - Le checklist Web (Daily Board, Match Center) risultano tutte non spuntate, ma parti sono implementate (#163, #176). Solo parti, quindi non spuntarle è corretto: manca però l'indicazione dello stato parziale.
   - L'aggiornamento spetta all'owner (#3 6326169335).
2. **#97, body non allineato.**
   - Stessa "prossima azione PR #125".
   - Riferimenti a Render/Neon e alla scadenza della membership TC dell'11/10.
   - Le fasi P0–P6 di #182 non sono nel body: stanno solo nel commento 6325345673.
   - La fase 13 (#45) è ancora nell'elenco: l'esclusione è solo accodata in fondo.
   - Le sequenze dopo il 18/10 (R-00…R-18, V-A/V-B/QA-V, APP-01/02, sequenza #183 §6, roadmap Grok §7 in 6340604077) sono **proposte nei commenti**, non nel body. La sequenza §6 di `reconciliation-2026-10-21.md` è dichiarata "da approvare" e non risulta approvata.
3. **#104.**
   - Il titolo dice ancora "Piano canonico 82 PR", in contrasto con D8 (catalogo storico).
   - La tabella "Stato card" dice "#20 TC-CORE-01..08 da iniziare nel core", ma TC-CORE-01..04 sono mergiate e certificate tra l'08 e il 09/10 (#130–#145).
   - Le task VPS richieste dall'owner (6325346427) non sono state aggiunte.
   - Nessuno stato per card (richiesto da D8): questo report è il primo censimento card per card.
4. **`docs/integration-map.md` fermo al 07/10.** Afferma tre cose false su `main`:
   - "tutte le altre issue di dominio: SPECIFIED, nessuna implementazione backend": esistono API v1, auth, PIT, Math Core, web;
   - "#20 URGENTE";
   - "Prossima azione PR #125".
5. **`work-registry.json`.**
   - SIM-OUTBOX-01 risulta `REVIEW`, `pr: 189`, `pr_open: true`. In realtà #187 è stata mergiata (`34da37b`) e revertita da **#189**, a sua volta mergiata (`39fe08e`). Il PR e lo stato sono entrambi errati.
   - R-04 punta solo a #157, ma la fetta comprende #157–#160 (questo però è coerente con le attività R-04b/c separate).
6. **Mappatura card nel `pr_registry`.**
   - R-07 è collegata a QUERY-CORE-01 (#25, partita conclusa), ma #176 implementa l'analisi pre-partita di #30 (dominio QUERY-CORE-02).
   - R-08 è collegata a RECON-CORE-01, ma #154 e #155 implementano la policy PIT, non l'identità cross-provider.
   - Il body di #178 dichiara "Card #104 collegate: nessuna", mentre il registro collega R-14 a STRAT-CORE-03/04.
7. **#45 nel `future_register`.** MP-FUT-001 è `APPROVED_ROADMAP_OWNER_GATED`, mentre `MP-OWNER-EXCLUDE-REAL-EXECUTION-01` dice "OUT OF SCOPE / NOT OWNER AUTHORIZED". L'etichetta va allineata a "fuori perimetro".
8. **Conflitto aperto sul perimetro dati.** `OWN-2026-10-06-SCOPE` (operatività solo FPT∩TC con mapping VERIFIED) contro #182 (TC sospeso). Blocca RECON-CORE-01/02 e definisce il perimetro dei nuovi dati FPT (reconciliation §2).
9. **Attivazione FPT sulla VPS (#179 6344141373, 22/10 17:07 Roma).**
   - Grok cita le decisioni owner "t108u/t114u", che **non sono in `owner-decisions.json`**.
   - `MP-GROK-AUTONOMOUS-EXECUTION-01` (registrata) vieta "collectors, real Telegram, production deploy".
   - #182 punto 6 richiede un GO per ogni fase; S3 e S4 non sono certificati (GO-S3/S4 "non concessi", #179 6336457809).
   - Il worker gira la release `3dd833f` mentre `main` è `39fe08e` (finding F-4) e ha cambiato `DATABASE_URL` dell'app verso PG18 staging.
   - La conformità alla governance è **NOT VERIFIED** dal repository: serve la registrazione delle decisioni.
10. **"FPT operativo con dati freschi" NOT VERIFIED.** Il provider non pubblica partite dopo il 20–21/09 (F-1); la copia offsite del DB definitivo PG18 non è verificata (F-3).
11. **Conteggi storici superati.**
    - "82 PR operative rimanenti" (#97 6013691620) e "76" (6013569585) sono SUPERSEDED da D8.
    - Il takeover Grok (6340604077) contava 145 PR e 141 mergiate: era corretto a quel momento; oggi sono 150 e 146.
12. **Checkpoint duplicato APP-F1.** L'id `CP-20261020T200407Z-agent-a-claude-code` ha due contenuti diversi sui branch `app-01-row-gaps` e `gov-01-merge-policy`.
13. **Deploy in attesa.** Diversi run `deploy-vps` sono `waiting`/`pending` (39635669968, 39747985926, 39790368069). La VPS di produzione è ferma a `3dd833f`, quindi `main` (TC-OFF, segnali simulati) non è deployato.

**Duplicati:**
- #3, #97, #104 e `integration-map.md` ripetono lo stesso blocco del 07/10, quattro copie da riallineare;
- la decisione VPS-only è ripetuta in 6 commenti (#3, #97, #104, #12, #20, #40);
- le card TC FPT-TC-PR-01..13 sono già mappate su TC-CORE in #104 e non vanno ricontate.

---

## 5. Lavoro residuo per lotti, in ordine di dipendenza

**Vincoli applicati:**
- #45 escluso;
- operatività TC sospesa: nessuna nuova acquisizione TC; i dati TC già catturati sono usabili archive-first;
- Render e Neon esclusi, solo VPS (#182);
- archive-first;
- #40 in sola lettura;
- requisiti LIVE: NOT VERIFIED, non bloccanti;
- una PR di implementazione alla volta.

Le fasi operative #182 (S3, S4, DR PG18, cutover, backup offsite) **non sono PR**: richiedono GO owner e lavoro sulla VPS. Sono indicate come dipendenze.

**Parte A — OFFLINE v1 (R-02…R-18, D3), con il completamento VPS lato codice**

| # | Lotto | Copre | Funzionalità e codice mancante | Dipendenze | Test e certificazione | PR | Motivo della stima | Criterio di completamento | Decisione owner bloccante |
|---|---|---|---|---|---|---|---|---|---|
| A0 | Riallineamento governance | #97 #104 #182; MP-GOV-020 | registry (SIM-OUTBOX-01 a MERGED/reverted, #188), card per card in `pr_registry`, correzione mappature R-07/R-08, MP-FUT-001, `integration-map.md`, decisioni t108u/t114u | nessuna | `governance:check`, test docs | 1 | un solo cambio documentale coerente | `governance:status` senza divergenze | registrazione t108u/t114u (owner); body #3/#97/#104 (owner) |
| A1 | Codice VPS: APP-01, APP-02, gate e worker | #179 F1, F2, F3; #182 P2–P4; F-4 | APP-01: `rowGaps` aggregata (branch `768bae9`). APP-02: host di bind configurabile, modalità `verify` delle migrazioni. `mp-deploy` v3.1-r2 / riavvio del worker FPT al deploy | GO-S3/S4 per l'installazione; review v3.1-r2 | oracolo e piano (APP-01), test negativi, mutazioni sul gate | 3 | tre aree con classi di rischio diverse (query FPT, runtime/migrazioni, deploy) da non mescolare (#104 regola 4) | APP-01/02 mergiate; S4 PASS documentato | GO-S3, GO-S4, P1/A7 (identità del reviewer), run obsoleto da rifiutare |
| A2 | R-02 archivio #40 | MP-ARC-001..003, MP-SEC-010, MP-GOV-010 | materializzazione in sola lettura, SHA per parte, portabilità DuckDB, riserve d'archivio esposte nelle query | archivio accessibile su VPS o Drive (azione ops) | readback, hash, DuckDB | 1 | un solo strumento di verifica + evidenze | MP-ARC-002 e MP-SEC-010 PASS | accesso all'archivio (D7, sola lettura) |
| A3 | R-16 FPT residuo | MP-FPT-003, 008, 012; #12 audit 412 | audit dei 412 UNAVAILABLE_404 (le chiamate FPT sono ora attive); normalizzazione di ogni campo disponibile; PIT/reprocessing su query storica prima e dopo | FPT attivo sulla VPS (fatto, NOT VERIFIED) | test PIT v1/v2, audit con classificazione | 2 | l'audit del provider e la normalizzazione dello schema sono gate separati | 412 classificati; MP-FPT-003 PASS | scelta "come conosciuto allora" o "parser nuovo" (#3 rischio PIT) |
| A4 | R-03 residuo API | MP-API-003, 006; MP-TC-005, 010; MP-FPT-004 | provenance, `as_of` e versioni in ogni risposta; inventario e autorizzazione delle rotte legacy `/api/fpt/*`, `/api/tc/*`; contatori TC | A2 consigliato | contract + PostgreSQL | 1 | stessa superficie API | verdetti R-03 PASS | — |
| A5 | R-08 / RECON identità cross-provider | MP-XPR-001, 002; RECON-CORE-01, 02 | identità FPT↔TC versionata (migrazione), rilevazione di gap e incoerenze prematch su dati catturati | A3, A4 | PIT, conflitti di identità | 2 | migrazione + identità, poi riconciliazione (gate distinti in #104) | MP-XPR-001/002 PASS | **conflitto OWN-2026-10-06-SCOPE contro #182** |
| A6 | R-15 TC su dati catturati | TC-CORE-05, 06, 06B; MP-TC-013..015 | normalizzazione live/eventi/linee e coverage per minuto e campo **solo sull'archivio catturato** | A5 | dedup, coverage, nessun leakage | 2 | normalizzazione e coverage; TC-06 si unisce allo strato di query di A8 | MP-TC-013..015 PASS su archivio | stesso conflitto di A5 |
| A7 | R-12 matematica e statistica | MATH-CORE-07; MP-MTH-002, 003; MP-STA-007, 008 | Poisson, fair odds e calibrazione; Brier, log loss; definizioni di ROI e drawdown; commissione e P/L Decimal | MATH-CORE-01 (fatto) | oracolo indipendente, vettori | 2 | modelli e metriche hanno oracoli diversi | verdetti R-12 PASS | — |
| A8 | R-09 / R-10 / R-11 replay | REPLAY-CORE-01, 02; MP-RPL-001..012; MP-WEB-012 | query di archivio e motore deterministico (gap, ordine, duplicati, restart); API di replay; UI di replay | A2, A6 | stato invariato al restart, nessun futuro, Browser QA | 4 | core (2: query/stato e robustezza), API (1), UI (1) | RPL P0 PASS su partite autentiche | — |
| A9 | R-13 / R-14 backtest | #178 HIST-01a; HIST-01b; MP-MKT-001..003; MP-STA-001..013; STRAT-CORE-03, 04; MARKET-CORE-01..03 (sottoinsieme) | riallineamento e merge di #178; regole di mercato versionate (VOID/PUSH/Asian); HIST-01b su dati reali con option A; walk-forward, out-of-sample, intervalli, baseline | A7, A8, A3 | anti-lookahead, determinismo, oracolo, nessuna dichiarazione di profitto | 4 | #178 (1) + regole (1) + HIST-01b (1) + walk-forward (1) | STA P0 PASS o NOT VERIFIED motivato | **mandato per #178** (`MP-OWNER-HIST-01A-02`); FINAL e freschezza già decise (option A) |
| A10 | R-05 / R-06 / R-07 web su dati reali | MP-WEB-001..015; QUERY-CORE-01, 02; #25, #30 | certificazione delle viste sul DB reale VPS; card analitiche restanti di #30 (atomizzazione Gate A); pagina partita conclusa #25; grafici | A4, A8 (per #25), A7 | Browser QA, baseline visive, N/D | 5 | cert dati reali (1), card #30 (2), partita conclusa (1), grafici (1) | WEB P0 PASS su dati reali | accessibilità, i18n, legale (census OPEN) solo se diventano requisiti |
| A11 | R-17 robustezza e operazioni | MP-QAC-006, 007; MP-SEC-002, 008; MP-FPT-006, 011; MP-OPS-001; RECON-CORE-04, 05 (FPT) | budget di prestazioni; drill di crash e restart; fail-safe; esercitazioni di backup e restore; monitoraggio FPT senza spam | A1, A8 | drill reali sulla VPS | 3 | prestazioni / resilienza / sicurezza-operazioni | verdetti R-17 PASS | backup retention (OPEN) |
| A12 | R-18 IV&V integrata | MP-GOV-007; MP-SEC-012; MP-STA-012 | Gate A/B integrato, rapporto di certificazione | tutti | IV&V indipendente | 1 | report | Gate A PASS sul perimetro v1 | accettazione owner |

**Totale parte A: 31 PR** (1 + 3 + 1 + 2 + 1 + 2 + 2 + 2 + 4 + 4 + 5 + 3 + 1).

**Parte B — Trading OS pre-MCP: residuo di #104 dopo la parte A** (`APPROVED_ROADMAP`, fuori dal denominatore v1)

| # | Lotto | Card | Dipendenze | PR | Motivo della stima | Decisione bloccante |
|---|---|---|---|---|---|---|
| B1 | Auth oltre l'owner | AUTH-02 (completamento), AUTH-03, AUTH-04 | A12 | 3 | gate separati authz / audit / cert | — |
| B2 | MCP baseline | MCP-CORE-00 (completamento: trasporto, authz, idempotenza) | A4, B1 | 1 | — | — |
| B3 | Settings / commissione | SETTINGS-CORE-01..04 | B1 | 4 | schema e migrazione, API, concorrenza, cert: gate separati | — |
| B4 | Math Core | MATH-CORE-02..06, 08 | A7 | 6 | una per famiglia di formule, ciascuna con oracolo | — |
| B5 | Money Management | MM-CORE-01..08 | B4, B3 | 8 | invariata rispetto a #104 | OWN-OPEN-STOP-ADVISORY (per MM-04) |
| B6 | Market Rules residuo | MARKET-CORE-01 (registry completo), 04, 05 | A9 | 3 | MARKET-02/03 coperte da A9 | — |
| B7 | Ledger | LEDGER-CORE-01..07 | B6, B3 | 7 | invariata (idempotenza, recovery e cert sono gate distinti) | OWN-OPEN-STOP-ADVISORY |
| B8 | Strategy Lab residuo | STRAT-CORE-01, 02, 05, 06, 07 | A9, B5 | 5 | STRAT-03/04 in A9; STRAT-05 su replay; la parte live resta NOT VERIFIED | — |
| B9 | Trading Engine | TRADE-CORE-01..08 | B8, B5 | 8 | la parte live di TRADE-08 resta NOT VERIFIED | — |
| B10 | Paper bridge e integrazioni tardive | PAPER-CORE-01, MM-INTEGRATION-01, REPLAY-CORE-03 | B7, B9, A8 | 3 | — | OWN-OPEN-STOP-ADVISORY |
| B11 | Benchmark | BENCH-CORE-01 | B9 | 1 | — | — |
| B12 | Trading Copilot | TCOP-CORE-01..04 | B10 | 4 | — | — |
| B13 | MCP finale | MCP-CORE-01..03 | tutti | 3 | — | accettazione owner |

**Totale parte B: 56 PR** (3 + 1 + 4 + 6 + 8 + 3 + 7 + 5 + 8 + 3 + 1 + 4 + 3).

**Parte C — roadmap globale non stimata.** Mancano card e censimento, quindi non invento numeri:
- UI finale fase 15 (#29, #24, #25, #94, #95, #96, #34, #102);
- #44 AI Assistant;
- #32 hardening avanzato;
- #46 Billing/SaaS;
- #87 confronto dei costi.

**Esclusi:**
- #45 (MP-OWNER-EXCLUDE-REAL-EXECUTION-01);
- TC-CORE-08 e RECON-CORE-03 (DEFERRED);
- alert TC, parte residua di TC-CORE-07 (sospesa);
- Render e Neon;
- #91 WeWeb (proposta);
- #132 ML Lab (idea non approvata);
- PR #188 SIM-SCHEDULE e SIM-OUTBOX (ritirate dall'owner, t108u).

---

## 6. PR realmente necessarie

| Perimetro | PR |
|---|---|
| A. OFFLINE v1 (D3), con codice VPS e governance | **31** |
| B. Trading OS pre-MCP (residuo #104, `APPROVED_ROADMAP`) | **56** |
| **Totale roadmap approvata stimabile (A+B)** | **87** |
| C. Fasi 12, 14, 15, 16 | non stimabili, nessun catalogo |

Note sul conteggio:
- Le 87 PR **non** coincidono con le 82 card. Su 82 card: 6 COMPLETED, 5 PARTIAL, 2 DEFERRED, 69 PLANNED.
- La parte A comprende molto lavoro **fuori catalogo**: web su dati reali, replay UI, R-02, R-16, R-17, R-18, VPS, governance.
- Ho compresso solo dove un gate resta separato in un'altra PR, per un totale di −3 rispetto alle card:
  - TC-06 si unisce allo strato di query di A8;
  - MARKET-02/03 e STRAT-03/04 sono assorbite in A9.
- Il minimo realistico per **OFFLINE v1 completo è 31 PR**; per arrivare al gate MCP pre-UI servono **87 PR** in tutto.
- Restano **8 decisioni owner bloccanti**:
  1. conflitto di perimetro FPT∩TC contro #182;
  2. mandato per #178;
  3. GO-S3/S4 e P1/A7;
  4. accesso all'archivio #40;
  5. OWN-OPEN-STOP-ADVISORY;
  6. registrazione t108u/t114u;
  7. GOV-01 (AUTOMERGE-02/03);
  8. backup retention.

---

## Appendice A — Tutte le PR (150)


| PR | Titolo | Stato | Merge | Branch | Issue | Card #104 | R-xx / attività |
|---|---|---|---|---|---|---|---|
| #5 | DATA-01: mirror completo FutPythonTrader e cron di sincronizzazione | MERGED | 2026-10-04 | `data/futpython-full-sync` | DATA-01..04 (#4,#6,#8,#10 → base #12) | pre-#104 | - |
| #7 | DATA-02: watchdog e notifiche anomalie FutPythonTrader | MERGED | 2026-10-04 | `data/watchdog-alerts` | DATA-01..04 (#4,#6,#8,#10 → base #12) | pre-#104 | - |
| #9 | DATA-03: Telegram outbound-only con whitelist chat e test one-shot | MERGED | 2026-10-04 | `data/telegram-outbound-only` | DATA-01..04 (#4,#6,#8,#10 → base #12) | pre-#104 | - |
| #11 | DATA-04: aggrega gli alert FutPython e sopprime i 404 iniziali | MERGED | 2026-10-04 | `data/alert-aggregation` | DATA-01..04 (#4,#6,#8,#10 → base #12) | pre-#104 | - |
| #13 | FPT-CERT P1: backfill storico completo e stato certificabile | MERGED | 2026-10-04 | `cert/fpt-phase1-backfill` | FPT-CERT #12 (FPT-PR-01..09 e fix) | pre-#104 (FPT certificato 05/10, non contato nelle 82) | R-16 (evidenza storica MP-FPT-001/002/007/010) |
| #14 | FPT-CERT P1 fix: riconcilia resume e run interrotti | MERGED | 2026-10-04 | `cert/fpt-phase1-reconcile` | FPT-CERT #12 (FPT-PR-01..09 e fix) | pre-#104 (FPT certificato 05/10, non contato nelle 82) | R-16 (evidenza storica MP-FPT-001/002/007/010) |
| #15 | FPT-CERT P1 perf: batch persistence per backfill reale | MERGED | 2026-10-04 | `cert/fpt-phase1-batching` | FPT-CERT #12 (FPT-PR-01..09 e fix) | pre-#104 (FPT certificato 05/10, non contato nelle 82) | R-16 (evidenza storica MP-FPT-001/002/007/010) |
| #16 | FPT-CERT P1 fix: contatori run certificabili | MERGED | 2026-10-04 | `cert/fpt-phase1-counters` | FPT-CERT #12 (FPT-PR-01..09 e fix) | pre-#104 (FPT certificato 05/10, non contato nelle 82) | R-16 (evidenza storica MP-FPT-001/002/007/010) |
| #17 | FPT-CERT P1 final: verifier reale e ledger di certificazione | MERGED | 2026-10-04 | `cert/fpt-phase1-close` | FPT-CERT #12 (FPT-PR-01..09 e fix) | pre-#104 (FPT certificato 05/10, non contato nelle 82) | R-16 (evidenza storica MP-FPT-001/002/007/010) |
| #18 | FPT-CERT P1 fix: catalogo storico completo per tutte le stagioni | MERGED | 2026-10-04 | `cert/fpt-phase1-full-catalog` | FPT-CERT #12 (FPT-PR-01..09 e fix) | pre-#104 (FPT certificato 05/10, non contato nelle 82) | R-16 (evidenza storica MP-FPT-001/002/007/010) |
| #19 | DOCS: sincronizza CLAUDE.md e AGENTS.md con FPT-CERT #12 | MERGED | 2026-10-04 | `docs/sync-agent-contracts-fpt-cert` | docs/mock/contratti | - | - |
| #21 | DOCS: sincronizza contratti con TC-CERT #20 | MERGED | 2026-10-04 | `docs/sync-totalcorner-cert-contract` | docs/mock/contratti | - | - |
| #22 | DOCS: owner gate per chiusura issue | MERGED | 2026-10-04 | `docs/issue-closure-owner-rule` | docs/mock/contratti | - | - |
| #26 | DOCS: trading-first contract, non betting-first | MERGED | 2026-10-04 | `docs/trading-first-contract` | docs/mock/contratti | - | - |
| #33 | DOCS: evidenza reale FASE 1 / FPT-PR-01 | MERGED | 2026-10-04 | `cert/fpt-phase1-evidence` | FPT-CERT #12 (FPT-PR-01..09 e fix) | pre-#104 (FPT certificato 05/10, non contato nelle 82) | R-16 (evidenza storica MP-FPT-001/002/007/010) |
| #35 | FIX: resume atomico e budget richieste FutPython | MERGED | 2026-10-04 | `cert/fpt-phase1-resume-budget` | FPT-CERT #12 (FPT-PR-01..09 e fix) | pre-#104 (FPT certificato 05/10, non contato nelle 82) | R-16 (evidenza storica MP-FPT-001/002/007/010) |
| #36 | FEAT: classificazione terminale del catalogo FutPython | MERGED | 2026-10-04 | `cert/fpt-phase2-classification` | FPT-CERT #12 (FPT-PR-01..09 e fix) | pre-#104 (FPT certificato 05/10, non contato nelle 82) | R-16 (evidenza storica MP-FPT-001/002/007/010) |
| #37 | FEAT: integrità snapshot e identità squadra FutPython | MERGED | 2026-10-04 | `cert/fpt-phase3-integrity` | FPT-CERT #12 (FPT-PR-01..09 e fix) | pre-#104 (FPT certificato 05/10, non contato nelle 82) | R-16 (evidenza storica MP-FPT-001/002/007/010) |
| #38 | FEAT: registry schema e lineage FutPython | MERGED | 2026-10-04 | `cert/fpt-phase4-schema` | FPT-CERT #12 (FPT-PR-01..09 e fix) | pre-#104 (FPT certificato 05/10, non contato nelle 82) | R-16 (evidenza storica MP-FPT-001/002/007/010) |
| #39 | FEAT: coverage multidimensionale FutPython | MERGED | 2026-10-04 | `cert/fpt-phase5-coverage` | FPT-CERT #12 (FPT-PR-01..09 e fix) | pre-#104 (FPT certificato 05/10, non contato nelle 82) | R-16 (evidenza storica MP-FPT-001/002/007/010) |
| #41 | FEAT: registry stagione e point-in-time FutPython | MERGED | 2026-10-04 | `cert/fpt-phase6-seasons` | FPT-CERT #12 (FPT-PR-01..09 e fix) | pre-#104 (FPT certificato 05/10, non contato nelle 82) | R-16 (evidenza storica MP-FPT-001/002/007/010) |
| #42 | FEAT: due sync incrementali FutPython | MERGED | 2026-10-04 | `cert/fpt-phase7-incremental` | FPT-CERT #12 (FPT-PR-01..09 e fix) | pre-#104 (FPT certificato 05/10, non contato nelle 82) | R-16 (evidenza storica MP-FPT-001/002/007/010) |
| #43 | FEAT: watchdog e Telegram FutPython | MERGED | 2026-10-04 | `cert/fpt-phase8-watchdog` | FPT-CERT #12 (FPT-PR-01..09 e fix) | pre-#104 (FPT certificato 05/10, non contato nelle 82) | R-16 (evidenza storica MP-FPT-001/002/007/010) |
| #47 | TEMP: persist provider trial snapshots to dedicated Neon schema | MERGED | 2026-10-05 | `temp/provider-trial-neon-persistence` | PROVIDER-TRIAL #40 / BetsAPI (temp) | fuori catalogo | R-02 (archivio #40) |
| #48 | FPT-PR-09: certificato finale e hard certification FutPythonTrader | MERGED | 2026-10-05 | `ccr-c1d65522-hubntx` | FPT-CERT #12 (FPT-PR-01..09 e fix) | pre-#104 (FPT certificato 05/10, non contato nelle 82) | R-16 (evidenza storica MP-FPT-001/002/007/010) |
| #49 | FIX: gate del certificato FutPython (feed today vuoto, prova reale del ledger) | MERGED | 2026-10-05 | `ccr-c1d65522-hubntx` | FPT-CERT #12 (FPT-PR-01..09 e fix) | pre-#104 (FPT certificato 05/10, non contato nelle 82) | R-16 (evidenza storica MP-FPT-001/002/007/010) |
| #50 | TEMP: cumulative provider metrics and trial keep-alive support | MERGED | 2026-10-05 | `temp/provider-trial-anti-sleep-metrics` | PROVIDER-TRIAL #40 / BetsAPI (temp) | fuori catalogo | R-02 (archivio #40) |
| #51 | TEMP: zero-cost self keepalive for provider trial | MERGED | 2026-10-05 | `temp/provider-trial-self-keepalive` | PROVIDER-TRIAL #40 / BetsAPI (temp) | fuori catalogo | R-02 (archivio #40) |
| #52 | TEMP: external keepalive for provider trial | MERGED | 2026-10-05 | `temp/provider-trial-external-keepalive` | PROVIDER-TRIAL #40 / BetsAPI (temp) | fuori catalogo | R-02 (archivio #40) |
| #53 | TEMP: prepare dormant BetsAPI Everything collector | MERGED | 2026-10-05 | `temp/betsapi-everything-ready` | PROVIDER-TRIAL #40 / BetsAPI (temp) | fuori catalogo | R-02 (archivio #40) |
| #54 | TEMP: register all 51 documented BetsAPI calls | MERGED | 2026-10-05 | `temp/betsapi-all-documented-endpoints` | PROVIDER-TRIAL #40 / BetsAPI (temp) | fuori catalogo | R-02 (archivio #40) |
| #55 | TEMP: probe all documented BetsAPI calls with real IDs | MERGED | 2026-10-05 | `temp/betsapi-full-catalog-cycle` | PROVIDER-TRIAL #40 / BetsAPI (temp) | fuori catalogo | R-02 (archivio #40) |
| #56 | FIX: serialize BetsAPI full-catalog probes | MERGED | 2026-10-05 | `temp/betsapi-full-catalog-lock` | PROVIDER-TRIAL #40 / BetsAPI (temp) | fuori catalogo | R-02 (archivio #40) |
| #57 | DOCS: certificato finale FutPythonTrader 2026-10-05 (FPT-PR-09) | MERGED | 2026-10-05 | `ccr-c1d65522-hubntx` | FPT-CERT #12 (FPT-PR-01..09 e fix) | pre-#104 (FPT certificato 05/10, non contato nelle 82) | R-16 (evidenza storica MP-FPT-001/002/007/010) |
| #58 | FIX: complete BetsAPI player endpoint discovery | MERGED | 2026-10-05 | `temp/betsapi-player-id-harvest` | PROVIDER-TRIAL #40 / BetsAPI (temp) | fuori catalogo | R-02 (archivio #40) |
| #59 | TEMP: expose per-endpoint BetsAPI probe diagnostics | MERGED | 2026-10-05 | `temp/betsapi-full-probe-diagnostics` | PROVIDER-TRIAL #40 / BetsAPI (temp) | fuori catalogo | R-02 (archivio #40) |
| #60 | FIX: harvest BetsAPI player IDs from team squad | MERGED | 2026-10-05 | `temp/betsapi-player-squad-fix` | PROVIDER-TRIAL #40 / BetsAPI (temp) | fuori catalogo | R-02 (archivio #40) |
| #61 | FIX: retry transient BetsAPI probe failures once | MERGED | 2026-10-05 | `temp/betsapi-probe-transient-retry` | PROVIDER-TRIAL #40 / BetsAPI (temp) | fuori catalogo | R-02 (archivio #40) |
| #62 | TEMP: reconcile sports leagues history and odds timelines | MERGED | 2026-10-05 | `temp/provider-trial-reconciliation` | PROVIDER-TRIAL #40 / BetsAPI (temp) | fuori catalogo | R-02 (archivio #40) |
| #63 | FIX: normalize league census without fake events | MERGED | 2026-10-05 | `temp/reconciliation-league-shape-fix` | PROVIDER-TRIAL #40 / BetsAPI (temp) | fuori catalogo | R-02 (archivio #40) |
| #64 | FIX: harden reconciliation odds and round-robin census | MERGED | 2026-10-05 | `temp/reconciliation-hardening` | PROVIDER-TRIAL #40 / BetsAPI (temp) | fuori catalogo | R-02 (archivio #40) |
| #65 | FIX: reset derived odds v2 and verify opening closing view | MERGED | 2026-10-05 | `temp/reconciliation-odds-v2` | PROVIDER-TRIAL #40 / BetsAPI (temp) | fuori catalogo | R-02 (archivio #40) |
| #66 | FIX: repair reconciliation filters and odds timeline routing | MERGED | 2026-10-05 | `temp/reconciliation-filter-fix` | PROVIDER-TRIAL #40 / BetsAPI (temp) | fuori catalogo | R-02 (archivio #40) |
| #67 | FIX: protect reconciliation from BetsAPI rate limits | MERGED | 2026-10-05 | `temp/reconciliation-rate-limit-and-filters` | PROVIDER-TRIAL #40 / BetsAPI (temp) | fuori catalogo | R-02 (archivio #40) |
| #68 | FIX: stabilize reconciliation SQL filters | MERGED | 2026-10-05 | `temp/reconciliation-filter-fix-v2` | PROVIDER-TRIAL #40 / BetsAPI (temp) | fuori catalogo | R-02 (archivio #40) |
| #69 | FIX: parse BetsAPI odds timelines by market key | MERGED | 2026-10-05 | `temp/reconciliation-odds-v3-filters` | PROVIDER-TRIAL #40 / BetsAPI (temp) | fuori catalogo | R-02 (archivio #40) |
| #70 | CERT: replay raw odds v3 and certify reconciliation | MERGED | 2026-10-05 | `temp/reconciliation-v3-certification` | PROVIDER-TRIAL #40 / BetsAPI (temp) | fuori catalogo | R-02 (archivio #40) |
| #71 | FIX: make reconciliation raw replay non-blocking | MERGED | 2026-10-05 | `temp/reconciliation-replay-nonblocking` | PROVIDER-TRIAL #40 / BetsAPI (temp) | fuori catalogo | R-02 (archivio #40) |
| #72 | CERT: finalize reconciliation classification gates | MERGED | 2026-10-05 | `temp/reconciliation-final-cert-fix` | PROVIDER-TRIAL #40 / BetsAPI (temp) | fuori catalogo | R-02 (archivio #40) |
| #73 | FIX: normalize reconciliation certificate history-floor date | CLOSED (non mergiata) | - | `temp/reconciliation-certificate-date-fix` | PROVIDER-TRIAL #40 / BetsAPI (temp) | fuori catalogo | R-02 (archivio #40) |
| #74 | DOCS: certify provider trial for passive collection | MERGED | 2026-10-05 | `temp/provider-trial-certified-passive` | PROVIDER-TRIAL #40 / BetsAPI (temp) | fuori catalogo | R-02 (archivio #40) |
| #75 | DOCS: sync final provider trial reconciliation certificate | MERGED | 2026-10-05 | `temp/provider-trial-certification-doc` | PROVIDER-TRIAL #40 / BetsAPI (temp) | fuori catalogo | R-02 (archivio #40) |
| #76 | FIX: persist BetsAPI rate budget and 429 hold across restarts | MERGED | 2026-10-05 | `temp/betsapi-persistent-rate-budget` | PROVIDER-TRIAL #40 / BetsAPI (temp) | fuori catalogo | R-02 (archivio #40) |
| #77 | FIX: replace certificate hardcoded gates with measurable controls | MERGED | 2026-10-05 | `temp/certificate-real-gates` | PROVIDER-TRIAL #40 / BetsAPI (temp) | fuori catalogo | R-02 (archivio #40) |
| #78 | FIX: persist BetsAPI census progress across restarts | MERGED | 2026-10-05 | `temp/persist-census-progress` | PROVIDER-TRIAL #40 / BetsAPI (temp) | fuori catalogo | R-02 (archivio #40) |
| #79 | FIX: classify missing dimensions as unverified, not upstream | MERGED | 2026-10-05 | `temp/unknown-status-semantics` | PROVIDER-TRIAL #40 / BetsAPI (temp) | fuori catalogo | R-02 (archivio #40) |
| #80 | AUDIT: split BetsAPI 429 and 5xx before/after persistent-rate fix | CLOSED (non mergiata) | - | `temp/rate-audit-split` | PROVIDER-TRIAL #40 / BetsAPI (temp) | fuori catalogo | R-02 (archivio #40) |
| #81 | FPT-PR-09: query layer per l'assistente e gate di performance esteso (gap #12 n.1) | MERGED | 2026-10-05 | `ccr-c1d65522-hubntx` | FPT-CERT #12 (FPT-PR-01..09 e fix) | pre-#104 (FPT certificato 05/10, non contato nelle 82) | R-16 (evidenza storica MP-FPT-001/002/007/010) |
| #82 | FPT-PR-09: registry dei filtri completa — indexed, first_seen, last_seen (gap #12 n.2) | MERGED | 2026-10-05 | `ccr-c1d65522-hubntx` | FPT-CERT #12 (FPT-PR-01..09 e fix) | pre-#104 (FPT certificato 05/10, non contato nelle 82) | R-16 (evidenza storica MP-FPT-001/002/007/010) |
| #83 | FPT-PR-09: livelli di budget e rinvio del traffico non essenziale (gap #12 n.3) | MERGED | 2026-10-05 | `ccr-c1d65522-hubntx` | FPT-CERT #12 (FPT-PR-01..09 e fix) | pre-#104 (FPT certificato 05/10, non contato nelle 82) | R-16 (evidenza storica MP-FPT-001/002/007/010) |
| #84 | FIX: extend provider-trial keepalive through full 24h window | MERGED | 2026-10-05 | `fix/provider-trial-keepalive-window` | PROVIDER-TRIAL #40 / BetsAPI (temp) | fuori catalogo | R-02 (archivio #40) |
| #85 | FIX: certify current provider-trial persistence health | MERGED | 2026-10-05 | `temp/trial-health-keepalive-cert-fix` | PROVIDER-TRIAL #40 / BetsAPI (temp) | fuori catalogo | R-02 (archivio #40) |
| #86 | FPT-PR-09: onboarding controllato di nuove leghe e stagioni (gap #12 n.4) | MERGED | 2026-10-05 | `ccr-c1d65522-hubntx` | FPT-CERT #12 (FPT-PR-01..09 e fix) | pre-#104 (FPT certificato 05/10, non contato nelle 82) | R-16 (evidenza storica MP-FPT-001/002/007/010) |
| #88 | FPT-PR-09: riconciliazione compatibile con #31 — checkpoint, ledger dei gap, recupero (gap | MERGED | 2026-10-05 | `ccr-c1d65522-hubntx` | FPT-CERT #12 (FPT-PR-01..09 e fix) | pre-#104 (FPT certificato 05/10, non contato nelle 82) | R-16 (evidenza storica MP-FPT-001/002/007/010) |
| #89 | FPT-PR-09: policy di versionamento parser/schema, raw append-only e rielaborazione registr | MERGED | 2026-10-05 | `ccr-c1d65522-hubntx` | FPT-CERT #12 (FPT-PR-01..09 e fix) | pre-#104 (FPT certificato 05/10, non contato nelle 82) | R-16 (evidenza storica MP-FPT-001/002/007/010) |
| #90 | FPT-PR-09: pagina Data Coverage → Competizioni (gate catalogo #12) | MERGED | 2026-10-05 | `ccr-c1d65522-hubntx` | FPT-CERT #12 (FPT-PR-01..09 e fix) | pre-#104 (FPT certificato 05/10, non contato nelle 82) | R-16 (evidenza storica MP-FPT-001/002/007/010) |
| #92 | FPT-PR-09: certificato finale rigenerato (20/20) e checkpoint post_run con l'esito reale | MERGED | 2026-10-05 | `ccr-c1d65522-hubntx` | FPT-CERT #12 (FPT-PR-01..09 e fix) | pre-#104 (FPT certificato 05/10, non contato nelle 82) | R-16 (evidenza storica MP-FPT-001/002/007/010) |
| #93 | DOCS: certificato FutPython rigenerato dal deploy di 6f83e2e (20/20) | MERGED | 2026-10-05 | `ccr-c1d65522-hubntx` | FPT-CERT #12 (FPT-PR-01..09 e fix) | pre-#104 (FPT certificato 05/10, non contato nelle 82) | R-16 (evidenza storica MP-FPT-001/002/007/010) |
| #101 | DOCS: prototipo MatchPilot Trading OS aggiornato al 2026-10-06 (#94, #95, #96) | MERGED | 2026-10-06 | `ccr-c1d65522-hubntx` | docs/mock/contratti | - | - |
| #103 | docs/mock: fully align MatchPilot UX with roadmap #97 and live trading architecture | MERGED | 2026-10-06 | `ccr-c1d65522-hubntx` | docs/mock/contratti | - | - |
| #105 | [PROVIDER-TRIAL] Final freeze/export endpoint for certified archive | MERGED | 2026-10-06 | `fix/provider-trial-final-export` | PROVIDER-TRIAL #40 / BetsAPI (temp) | fuori catalogo | R-02 (archivio #40) |
| #106 | [PROVIDER-TRIAL] Add Basic Auth transport for final export | MERGED | 2026-10-06 | `fix/provider-trial-export-basic-auth` | PROVIDER-TRIAL #40 / BetsAPI (temp) | fuori catalogo | R-02 (archivio #40) |
| #107 | [PROVIDER-TRIAL] Create immutable final freeze boundary on startup | MERGED | 2026-10-06 | `fix/provider-trial-freeze-on-start` | PROVIDER-TRIAL #40 / BetsAPI (temp) | fuori catalogo | R-02 (archivio #40) |
| #108 | [PROVIDER-TRIAL] Wire final freeze hook into collector startup | MERGED | 2026-10-06 | `fix/provider-trial-freeze-hook-wire` | PROVIDER-TRIAL #40 / BetsAPI (temp) | fuori catalogo | R-02 (archivio #40) |
| #109 | [PROVIDER-TRIAL] Force immutable final freeze on temporary branch | MERGED | 2026-10-06 | `fix/trial-final-freeze-force` | PROVIDER-TRIAL #40 / BetsAPI (temp) | fuori catalogo | R-02 (archivio #40) |
| #110 | [PROVIDER-TRIAL] Audit frozen dataset counts | MERGED | 2026-10-06 | `fix/trial-freeze-counts-audit` | PROVIDER-TRIAL #40 / BetsAPI (temp) | fuori catalogo | R-02 (archivio #40) |
| #111 | [PROVIDER-TRIAL] Deduplicate frozen dataset inventory | MERGED | 2026-10-06 | `fix/trial-dataset-inventory-dedup` | PROVIDER-TRIAL #40 / BetsAPI (temp) | fuori catalogo | R-02 (archivio #40) |
| #112 | [PROVIDER-TRIAL] Export frozen trial datasets to files | MERGED | 2026-10-06 | `fix/trial-final-export-files` | PROVIDER-TRIAL #40 / BetsAPI (temp) | fuori catalogo | R-02 (archivio #40) |
| #113 | [PROVIDER-TRIAL] Use dedicated DB pool for final export | MERGED | 2026-10-06 | `fix/trial-export-dedicated-db-pool` | PROVIDER-TRIAL #40 / BetsAPI (temp) | fuori catalogo | R-02 (archivio #40) |
| #114 | [PROVIDER-TRIAL] Segregate ScoreTrend from final archive | MERGED | 2026-10-06 | `fix/trial-scoretrend-segregation` | PROVIDER-TRIAL #40 / BetsAPI (temp) | fuori catalogo | R-02 (archivio #40) |
| #115 | [PROVIDER-TRIAL] Fix ScoreTrend segregation output directory | MERGED | 2026-10-06 | `fix/scoretrend-segregation-mkdir` | PROVIDER-TRIAL #40 / BetsAPI (temp) | fuori catalogo | R-02 (archivio #40) |
| #116 | [PROVIDER-TRIAL] Export clean canonical layer without ScoreTrend | MERGED | 2026-10-06 | `fix/scoretrend-clean-canonical-export` | PROVIDER-TRIAL #40 / BetsAPI (temp) | fuori catalogo | R-02 (archivio #40) |
| #117 | [PROVIDER-TRIAL] Build canonical Parquet and DuckDB analytics package | MERGED | 2026-10-06 | `feat/trial-duckdb-parquet-package` | PROVIDER-TRIAL #40 / BetsAPI (temp) | fuori catalogo | R-02 (archivio #40) |
| #118 | [PROVIDER-TRIAL] Fix DuckDB coverage event_count cast | MERGED | 2026-10-06 | `fix/trial-duckdb-event-count-cast` | PROVIDER-TRIAL #40 / BetsAPI (temp) | fuori catalogo | R-02 (archivio #40) |
| #119 | [PROVIDER-TRIAL] Lower DuckDB memory on Render | MERGED | 2026-10-06 | `fix/trial-duckdb-low-memory` | PROVIDER-TRIAL #40 / BetsAPI (temp) | fuori catalogo | R-02 (archivio #40) |
| #120 | [PROVIDER-TRIAL] Add final archive secret scan | MERGED | 2026-10-06 | `fix/trial-final-secret-scan` | PROVIDER-TRIAL #40 / BetsAPI (temp) | fuori catalogo | R-02 (archivio #40) |
| #121 | [PROVIDER-TRIAL] Stabilize final secret scan snapshot | MERGED | 2026-10-06 | `fix/trial-secret-scan-transient-files` | PROVIDER-TRIAL #40 / BetsAPI (temp) | fuori catalogo | R-02 (archivio #40) |
| #122 | [PROVIDER-TRIAL] Finalize stable SHA-256 archive gate | MERGED | 2026-10-06 | `fix/trial-final-sha256` | PROVIDER-TRIAL #40 / BetsAPI (temp) | fuori catalogo | R-02 (archivio #40) |
| #123 | [PROVIDER-TRIAL] Add final DB/export/manifest reconciliation gate | MERGED | 2026-10-06 | `fix/trial-final-reconciliation` | PROVIDER-TRIAL #40 / BetsAPI (temp) | fuori catalogo | R-02 (archivio #40) |
| #124 | [PROVIDER-TRIAL] Deterministic keyset paging for every export dataset (#40 point 9) | MERGED | 2026-10-07 | `fix/trial-deterministic-paging` | PROVIDER-TRIAL #40 / BetsAPI (temp) | fuori catalogo | R-02 (archivio #40) |
| #125 | docs/governance: align owner decisions and current state across #3 #97 #104 | MERGED | 2026-10-07 | `docs/governance-alignment-2026-10-07` | PROVIDER-TRIAL #40 / BetsAPI (temp) | fuori catalogo | R-02 (archivio #40) |
| #126 | [PROVIDER-TRIAL] Read-only regenerated archive, PIT closing and portable verified readback | MERGED | 2026-10-07 | `fix/provider-trial-regenerated-archive` | PROVIDER-TRIAL #40 / BetsAPI (temp) | fuori catalogo | R-02 (archivio #40) |
| #127 | [PROVIDER-TRIAL] Bound regenerated statement timeout for real frozen export | MERGED | 2026-10-07 | `fix/provider-trial-regenerated-timeout` | PROVIDER-TRIAL #40 / BetsAPI (temp) | fuori catalogo | R-02 (archivio #40) |
| #128 | [PROVIDER-TRIAL] Optimize regenerated PIT PostgreSQL plan | MERGED | 2026-10-07 | `fix/provider-trial-pit-postgres-plan` | PROVIDER-TRIAL #40 / BetsAPI (temp) | fuori catalogo | R-02 (archivio #40) |
| #129 | [PROVIDER-TRIAL] Final closure report and retire keepalive | MERGED | 2026-10-08 | `docs/provider-trial-final-closure` | PROVIDER-TRIAL #40 / BetsAPI (temp) | fuori catalogo | R-02 (archivio #40) |
| #130 | [TC-CORE-01] TotalCorner provider contract, discovery and lossless raw retention (#20) | MERGED | 2026-10-08 | `tc-core-01-discovery` | #20 | TC-CORE-01 | R-15 |
| #131 | [TC-CORE-02] FPT ↔ TotalCorner competition mapping on real fixture overlap (#20) | MERGED | 2026-10-08 | `tc-core-02-mapping` | #20 | TC-CORE-02 | R-15/continuous |
| #133 | [TC-CORE-02] v2: same-category pairing and cache-first schedule pages (#20) | MERGED | 2026-10-08 | `tc-core-02-categories` | #20 | TC-CORE-02 | R-15/continuous |
| #134 | [TC-CORE-03] Prematch markets, lines and point-in-time cutoff (#20) | MERGED | 2026-10-08 | `tc-core-03-prematch` | #20 | TC-CORE-03 | continuous |
| #135 | [TC-CORE-03] Gate fuso provider: offset misurato, persistito e fail-closed (#20) | MERGED | 2026-10-08 | `tc-core-03-tz-gate` | #20 | TC-CORE-03 | continuous |
| #136 | [TC-CORE-03] Gate fuso v2: stima dell'offset robusta agli outlier (#20) | MERGED | 2026-10-08 | `tc-core-03-tz-robust` | #20 | TC-CORE-03 | continuous |
| #137 | [TC-CORE-03B] Resumable historical upstream backfill (#20) | MERGED | 2026-10-08 | `tc-core-03b-historical-backfill` | #20 | TC-CORE-03B | continuous |
| #138 | [TC-CORE-03B] Fix real league schedule envelope and rerun sample (#20) | MERGED | 2026-10-08 | `tc-core-03b-schedule-shape-fix` | #20 | TC-CORE-03B | continuous |
| #139 | [TC-CORE-03B] Stratify historical sample across seasons and real field aliases (#20) | MERGED | 2026-10-08 | `tc-core-03b-stratified-history-fix` | #20 | TC-CORE-03B | continuous |
| #140 | [TC-CORE-03B] Repair nested bookmaker movement audit from raw (#20) | MERGED | 2026-10-08 | `tc-core-03b-movement-audit-fix` | #20 | TC-CORE-03B | continuous |
| #141 | [TC-CORE-03B] Resume odds movement before membership expiry (#20) | MERGED | 2026-10-08 | `tc-core-03b-movement-priority` | #20 | TC-CORE-03B | continuous |
| #142 | [TC-CORE-03B] Expose historical certification gates (#20) | MERGED | 2026-10-08 | `tc-core-03b-cert-gates` | #20 | TC-CORE-03B | continuous |
| #143 | [TC-CORE-04] Live collector for verified in-play matches (#20) | MERGED | 2026-10-08 | `tc-core-04-live` | #20 | TC-CORE-04 | R-15 |
| #145 | [TC-CORE-04] Lossless live + terminal recovery — live certification blocked | MERGED | 2026-10-09 | `tc-core-04-lossless-hash` | #20 | TC-CORE-04 | R-15 |
| #146 | CI: selective zero-cost gate for GitHub Actions | MERGED | 2026-10-09 | `ci-selective-zero-cost` | #144 CI zero-cost / runtime isolation | - | outside_sequence |
| #147 | Runtime: isolate backend from collectors | MERGED | 2026-10-09 | `backend-collector-isolation` | #144 CI zero-cost / runtime isolation | - | outside_sequence |
| #148 | CI: certify independent PostgreSQL development | MERGED | 2026-10-09 | `postgres-independent-ci` | #144 CI zero-cost / runtime isolation | - | outside_sequence |
| #149 | MP-PR-00: establish Gate A atomic requirements inventory | MERGED | 2026-10-18 | `governance/mp-pr-00-atomic-requirements` | #3 #97 #104 | - | R-00 |
| #151 | R-01: permanent governance, multi-agent checkpoints, handoff and closure guards | MERGED | 2026-10-18 | `ccr-e45875c0-5r0fnf` | #150 #3 #97 | - | R-01 |
| #152 | R-02: read-only verification of the #40 archive metadata, R-01 review fixes | MERGED | 2026-10-18 | `ccr-e45875c0-5r0fnf` | #40 | - | R-02 |
| #153 | R-03: read-only API v1 (endpoint registry, envelope, errors) + #152 review fixes | MERGED | 2026-10-18 | `ccr-e45875c0-5r0fnf` | #98 #30 | MCP-CORE-00 (parziale) | R-03 |
| #154 | R-08 (part 1): point-in-time policy mp-pit-v1 — five timestamps, time zone/DST rules, PIT  | MERGED | 2026-10-18 | `ccr-e45875c0-5r0fnf` | #12 #20 #31 | (prerequisito PIT; non RECON-CORE-01) | R-08 |
| #155 | R-08b: version availability for re-parsed FPT versions (MP-FPT-005) | MERGED | 2026-10-18 | `ccr-e45875c0-5r0fnf` | #12 | (MP-FPT-005) | R-08b |
| #156 | R-12 (MATH-CORE-01): fixed-precision Decimal and common Math Core contracts | MERGED | 2026-10-19 | `ccr-e45875c0-5r0fnf` | #94 | MATH-CORE-01 | R-12 |
| #157 | R-04a: hold unapproved migrations in production mode (D13) | MERGED | 2026-10-19 | `ccr-e45875c0-5r0fnf` | #23 | AUTH-CORE-01 (parziale) | R-04a |
| #158 | MIG-GAP-01/02: migration hardening (real host check, cross-process migration lock) | MERGED | 2026-10-19 | `ccr-e45875c0-5r0fnf` | #23 | AUTH-CORE-01 (prerequisito migrazioni) | R-04 MIG-GAP |
| #159 | R-04b: owner login (D12) — sessions, rate limit, audit; off by default, fail closed | MERGED | 2026-10-19 | `ccr-e45875c0-5r0fnf` | #23 | AUTH-CORE-01/02 (parziale) | R-04b |
| #160 | R-04c: owner-login activation hardening (IPv6 /64 buckets, explicit proxy trust, spike ale | MERGED | 2026-10-19 | `ccr-e45875c0-5r0fnf` | #23 | AUTH-CORE-01 (parziale) | R-04c |
| #161 | R-05: real read-only web shell, browser E2E lane, security headers | MERGED | 2026-10-19 | `ccr-e45875c0-5r0fnf` | #3 #97 | - | R-05 |
| #162 | R-06a: deterministic keyset pagination for match search and matches of a day | MERGED | 2026-10-19 | `ccr-e45875c0-5r0fnf` | #30 | QUERY-CORE-02 (parziale) | R-06a |
| #163 | R-06b: Dashboard, Daily Board e Ricerca sull'API v1 | MERGED | 2026-10-19 | `ccr-e45875c0-5r0fnf` | #30 #3 | QUERY-CORE-02 (parziale) | R-06b |
| #164 | QA-01: Browser QA Gate deterministico — prove browser reali, verificate e obbligatorie per | MERGED | 2026-10-19 | `ccr-e45875c0-5r0fnf` | #3 | - | R-05 QA-01 |
| #165 | QA-02: Browser QA esplorativo (livello B) — crawler deterministico e procedura di review A | MERGED | 2026-10-19 | `ccr-e45875c0-5r0fnf` | #3 | - | R-05 QA-02 |
| #166 | QA-03: certificazione end-to-end del Browser QA e valutazione dell'agente AI esplorativo | MERGED | 2026-10-19 | `ccr-e45875c0-5r0fnf` | #3 | - | R-05 QA-03 |
| #167 | EVIDENCE-01: evidenze permanenti degli audit (MP-OWNER-PERMANENT-EVIDENCE-01) | MERGED | 2026-10-19 | `claude/permanent-evidence-01` | #150 | - | outside_sequence EVIDENCE-01 |
| #168 | V-A: correzione dei bug A-1 e A-2 dell'audit visuale, con test di regressione browser | MERGED | 2026-10-19 | `ccr-e45875c0-5r0fnf` | #3 | - | R-05 V-A |
| #169 | V-B1: nessun testo tecnico nelle viste utente (MP-OWNER-UI-NO-RAW-TEXT-01) — Daily Board,  | MERGED | 2026-10-19 | `ccr-e45875c0-5r0fnf` | #3 | - | R-05/R-06 V-B1 |
| #170 | V-B2a: home «Oggi», menu Oggi · Ricerca · Dati, area tecnica con schede, barra mobile | MERGED | 2026-10-19 | `ccr-e45875c0-5r0fnf` | #3 | - | R-05 V-B2a |
| #171 | V-B2b: etichette italiane dell'albero Fornitori e note della review di #170 | MERGED | 2026-10-19 | `ccr-e45875c0-5r0fnf` | #3 | - | R-05 V-B2b |
| #172 | V-B3: identità del mockup approvato — token, ambra #FFB547, logo, font locali con licenza | MERGED | 2026-10-19 | `ccr-e45875c0-5r0fnf` | #3 | - | R-05 V-B3 |
| #173 | V-B4: Daily Board compatta e striscia dei giorni del mockup, risultati della ricerca come  | MERGED | 2026-10-20 | `ccr-e45875c0-5r0fnf` | #3 | - | R-05 V-B4 |
| #174 | QA-V: baseline visive versionate delle viste approvate, manifest SHA-256, soglie esplicite | MERGED | 2026-10-20 | `ccr-e45875c0-5r0fnf` | #3 | - | R-05 QA-V |
| #175 | QA-V2: stati espliciti nelle baseline visive, matrice di certificabilità, riconciliazione  | MERGED | 2026-10-20 | `ccr-e45875c0-5r0fnf` | #3 | - | R-05 QA-V2 |
| #176 | R-07a: Match Center, analisi pre-partita (primo lotto di #30) | MERGED | 2026-10-20 | `ccr-e45875c0-5r0fnf` | #30 #25 | QUERY-CORE-02 (parziale; pr_registry dice QUERY-CORE-01) | R-07a |
| #177 | VPS-DEPLOY-01: deploy di main sulla VPS privata; nessun workflow di PR può usarne il runne | MERGED | 2026-10-20 | `ccr-e45875c0-5r0fnf` | #179 | - | outside_sequence VPS-DEPLOY-01 |
| #178 | HIST-01a: motore di backtest offline deterministico su fixture sintetiche (ammissione PIT, | OPEN | - | `ccr-e45875c0-5r0fnf` | #34 #99 #94 | STRAT-CORE-03/04, MARKET-CORE-01/02 (WIP, non mergiata) | R-13/R-14 HIST-01a |
| #180 | MP-DEPLOY-APPROVAL — Mandatory Owner Approval Gate for VPS Deployments | MERGED | 2026-10-21 | `deploy-approval-01` | #97 #179 | - | outside_sequence DEPLOY-APPROVAL-01 |
| #181 | MP-GATE-S1S2-FIX — nessun codice sulla VPS senza approvazione owner; deploy solo della pun | MERGED | 2026-10-21 | `deploy-gate-final-01` | #179 | - | outside_sequence DEPLOY-GATE-S1S2-01 |
| #183 | GOV-RECON-01: riconciliazione governance R1–R7, checkpoint v3 e handoff indipendente dall' | MERGED | 2026-10-22 | `claude/gov-recon-01` | #97 #3 #104 #179 #182 | - | GOV-RECON-01 |
| #184 | FUNC-RECOVERY-01: segnali FutPythonTrader simulati end-to-end (MP-VPS-FUNCTIONAL-RECOVERY- | MERGED | 2026-10-22 | `functional/mp-vps-recovery-20261022` | #182 #179 | - (segnali simulati, fuori catalogo) | FUNC-RECOVERY-01 |
| #185 | TAKEOVER-01: registrazione takeover Grok, checkpoint MERGED #183/#184, riconciliazione reg | MERGED | 2026-10-22 | `governance/grok-takeover-20261022` | #97 | - | TAKEOVER-01 |
| #186 | TC-OFF-01: TotalCorner spento per configurazione esplicita (#20, #182) | MERGED | 2026-10-22 | `tc-off-01` | #20 #182 | - (TC-OFF, fuori catalogo) | TC-OFF-01 |
| #187 | SIM-OUTBOX-01: messaggi Telegram simulati (mai inviati) per i segnali simulati | MERGED | 2026-10-22 | `sim-outbox-01` | #182 | - (revertita da #189) | SIM-OUTBOX-01 |
| #188 | SIM-SCHEDULE-01: segnali simulati schedulabili (--date today/yesterday, Europe/Rome) (#182 | CLOSED (non mergiata) | - | `sim-schedule-01` | #182 | - | SIM-SCHEDULE-01 (chiusa) |
| #189 | SIM-OUTBOX-01: rimozione del codice di #187 (decisione owner t108u) | MERGED | 2026-10-22 | `revert-sim-outbox-01` | #182 | - (revert di #187) | SIM-OUTBOX-01 revert |

Le PR chiuse senza merge sono #73, #80 e #188; la sola PR aperta è #178.
