# MP-GATE-A-REVIEW-ROADMAP-01 — Audit indipendente PR #149 e riconciliazione globale

Data: 2026-10-18 · Repository `zarbopiero963-droid/MatchPilot` · Modalità: sola lettura (nessun commit, merge, PR, deploy, scrittura Neon/Render/archivio, commento GitHub).
Legenda: **FACT** = verificato su repository/GitHub in questa sessione · **INFERENCE** = deduzione motivata · **PROPOSAL** = proposta, non decisione · **NOT VERIFIED** = non verificabile con i mezzi disponibili.

---

## 1. Verdetto indipendente PR #149

### **PASS WITH REQUIRED CORRECTIONS** — merge NON consentito sullo stato attuale

**Perché non FAIL.** L'artefatto è integro, è solo governance, CI è verde, il validatore e i test sono deterministici. Come baseline versionata ha valore.

**Perché non PASS.**
- Contiene una statistica falsa.
- Viola il proprio invariante "no evidence means no PASS".
- Blocca nel test una distribuzione artificiale di 8 gruppi da 12 requisiti.
- Dichiara "denominatore verificato" un inventario che omette requisiti in perimetro, a partire dalle API.
- Manca la revisione indipendente APPROVED che il criterio di auto-merge (MP-OWNER-AUTOMERGE-01) richiede.

**Effetto di MP-OWNER-AUTOMERGE-01 sulla #149 (FACT).** La #149 non soddisfa due condizioni del merge:
- finding bloccanti aperti (B-01…B-07, sotto);
- nessuna revisione APPROVED.

Il mandato di audit vieta di modificare la #149, quindi **non ho corretto nulla e non ho fatto merge**.

### 1.1 Verifiche di integrità (FACT)

| Controllo | Risultato |
|---|---|
| Head PR | `21eee83538a8c97b7466957b528e5fa3580f6c6a` = dichiarato |
| Tree | `b5fefd254873ad48ce9143172123912a1b7c9e0b` |
| Merge-base | `353dfc6523d357aae52615fdfb102fdf1e2a6795` = baseline main dichiarata; 1 commit, `mergeable_state: clean` |
| Diff | 7 file, +539/−0: README.md, `docs/governance/mp-pr-00/{README.md,requirements.json,traceability.md}`, `package.json` (solo lo script `governance:validate`), `test/requirements-inventory.test.mjs`, `tools/validate-requirements.mjs` |
| Runtime/schema/API/UI | nessuna modifica: nessun file in `src/`, `migrations/`, `.github/` |
| `npm run governance:validate` | PASS |
| `node --test test/requirements-inventory.test.mjs` | 5/5 PASS |
| `npm run check` | PASS |
| `npm test` (dopo `npm ci --ignore-scripts`) | 166 test: 147 PASS, 0 FAIL, 19 SKIP (PostgreSQL usa-e-getta non disponibile in locale → NOT VERIFIED localmente) |
| CI sull'head (run 39140793621) | CI gate ✅, Fast checks ✅, PostgreSQL integration suite ✅ (copre i 19 skip locali), Classify ✅, UI checks skipped |
| Review | 0 thread. CodeRabbit non avviato ("fewer than 10 stars", commento 6251706185). Nessuna review umana o indipendente |
| Branch protection / ruleset 24790739 | NOT VERIFIED: non ho accesso alle impostazioni. `docs/ci-zero-cost.md` richiede soltanto il check `CI gate`; se il ruleset imponga review approvate è sconosciuto |

### 1.2 Ricalcolo del denominatore dai file machine-readable (FACT)

| Voce | Dichiarato (PR/mandato) | Ricalcolato da `requirements.json` | Esito |
|---|---:|---:|---|
| Requisiti | 96 | 96 | ✔ |
| P0 / P1 / P2 | 70 / 25 / 1 | 70 / 25 / 1 | ✔ |
| PASS / FAIL / BLOCKED / NOT_VERIFIED / N/A | 26 / 33 / 7 / 29 / 1 | 26 / 33 / 7 / 29 / 1 | ✔ |
| Con mapping codice | 32 | 32 | ✔ |
| Con mapping test | 40 | 40 | ✔ |
| **"PASS con evidenza"** | **25** | **19** | ✘ **FALSO** |
| Requisiti con evidenza (qualsiasi verdict) | — | 25 | il README della PR dice correttamente "Con evidenza iniziale 25"; il **body della PR** lo trasforma in "Evidence-backed PASS: 25" |

Anomalie di verdict:
- **7 PASS senza alcuna evidenza:** MP-GOV-008, GOV-011, GOV-012, FPT-004, FPT-007, FPT-010, TC-009.
- **6 requisiti con evidenza ma non PASS:** FPT-005, FPT-008, TC-007, WEB-001, QAC-005, SEC-009.
- **4 PASS senza test:** GOV-004, GOV-009, GOV-010, SEC-004. Per GOV-009 e SEC-004 l'evidenza è la configurazione del workflow, che ho verificato su `.github/workflows/ci.yml`: `runs-on: ubuntu-latest`, `permissions`, actions pinnate per SHA. Sono quindi accettabili come PASS di configurazione.

### 1.3 Il gruppo 8×12 è un limite artificiale (FACT + INFERENCE)

- **FACT:** il test `test/requirements-inventory.test.mjs` fa `assert.deepEqual(summary.by_group, {GOV:12,FPT:12,…,SEC:12})`. Aggiungere un solo requisito mancante fa fallire la CI.
- **INFERENCE:** la simmetria non deriva dalle fonti. Le issue di dominio hanno pesi molto diversi:
  - #20 ha 10 card e più di 20 sezioni di contratto;
  - #24 ha 1 servizio;
  - #95, #100, #94 e #98 non hanno alcun requisito proprio.
  
  La frase del README della PR ("la simmetria è soltanto una proprietà dell'inventario iniziale") è contraddetta dal test, che la rende vincolante.

### 1.4 Finding bloccanti (da correggere prima del merge)

| ID | Finding | Prova | Correzione minima richiesta |
|---|---|---|---|
| **B-01** | Statistica falsa "Evidence-backed PASS 25" (reale 19) | §1.2 | correggere il body della PR; aggiungere `pass_with_evidence` a `summarize()` |
| **B-02** | 7 PASS senza evidenza violano l'invariante GOV "no evidence means no PASS" | §1.2 | aggiungere l'evidenza (SHA/run/test) oppure portarli a NOT_VERIFIED; il validatore deve rifiutare PASS con `evidence: []` |
| **B-03** | Test che congela 12×8 | §1.3 | sostituire `deepEqual` con invarianti (ogni gruppo ≥1, totale = lunghezza, nessun ID duplicato) |
| **B-04** | Denominatore incompleto ma dichiarato "verificato": backend/API in scope senza requisiti (MP-API-001/004 solo come `referenced_external_ids`); #40 archivio, #95 config congelata, #100 esiti, #94 oracle (MP-MATH-001 esterno), identità cross-provider, timezone/DST assenti | §2 | aggiungere i requisiti di §2.2, oppure dichiarare esplicitamente "denominatore iniziale incompleto — Gate A NON PASS" ed elencare le omissioni nel JSON (`known_gaps`) |
| **B-05** | Sequenza MP-PR-00…15 incoerente con i `target_pr` del JSON: 6 destinazioni fuori sequenza (`FPT residual certification`, `FPT-PIT-VERSIONING`, `FPT-412-AUDIT`, `TC residual certification`, `TC-LIVE-CERT`, `AUTH baseline`); MP-PR-05 senza alcun requisito | script su JSON | inserire queste PR nella sequenza o cambiare `target_pr`; il validatore deve verificare che `target_pr` appartenga a un registro PR dichiarato e che ogni PR abbia almeno un requisito |
| **B-06** | Decisioni owner del 18/10 non registrate: MP-GOV-005 ("STOP before merge") è superato da MP-OWNER-AUTOMERGE-01; mancano MP-OWNER-CERT-ISSUE-CLOSURE-01 e MP-GITHUB-SINGLE-SOURCE-OF-TRUTH-01; il mandato fonte `MP-ENTERPRISE-GATE-AB-WEB-SIM-01` non compare in nessuna issue (grep dell'agente censimento) | §12 | aggiornare GOV-005, aggiungere GOV-013…016 (§2.2) e registrare i mandati su GitHub (#3/#97) |
| **B-07** | Verdict incoerenti fra loro: GOV-010 PASS ("archivio immutabile") mentre SEC-010 (verifica SHA/manifest prima della lettura) è BLOCKED; TC-007 NOT_VERIFIED e TC-008 BLOCKED, ma #20 commento 6081058030 certifica PASS frequenza, restart e FT per lo scope #145; MP-SEC-011 (P2, "solo in fase futura") conta come N/A nel denominatore invece che nel future register | JSON + #20 | riallineare i verdict con scope esplicito; spostare SEC-011 in `future_register` |

### 1.5 Finding non bloccanti (correzione consigliata, anche successiva)

- **Validatore senza controlli importanti.** Non verifica:
  - l'esistenza dei path di codice e test (oggi esistono tutti, ma non è garantito);
  - che `source_ref` non sia vuoto;
  - la coerenza dipendenze → verdict (un PASS che dipende da un BLOCKED);
  - i campi obbligatori del `future_register`.
- **Requisiti doppi o sovrapposti:**
  - WEB-003 e WEB-007 (search/filter);
  - QAC-005 e SEC-009 (dependency audit);
  - GOV-007, FPT-012, TC-012 e SEC-012 sono quattro meta-gate "non dichiarare certificato" che replicano GOV-008. Accettabili come gate, ma da marcare `kind: gate`.
- **Mapping inverso parziale.** 24 file di produzione su 52 sono mappati; la PR stessa lo dichiara (`traceability.md`). Le route `/api/fpt/*` (21 route in `src/providers/futpython/query.mjs`) e `/api/tc/*` sono esposte **senza autenticazione** e senza requisito di versione o compatibilità.
- **README stale.** Il nuovo blocco Gate A viene aggiunto sopra un "Ingresso operativo corrente — 07/10/2026" che indica ancora la PR #125 come prossima azione. Lo stesso blocco stale è in CLAUDE.md e AGENTS.md (vedi §12).

---

## 2. Denominatore atomico verificato e lacune

### 2.1 Stato (FACT/INFERENCE)

- **FACT:** i 96 requisiti esistono, sono unici e strutturalmente validi.
- **INFERENCE:** **non** sono l'inventario completo del perimetro OFFLINE v1. Il denominatore minimo stimato è **≈121** (96 + 25 requisiti mancanti in §2.2), con un intervallo di **115–130**: il valore dipende da come si atomizzano #20 e #3.
- **NOT VERIFIED:** un numero definitivo. Mancano due cose:
  1. la ratifica owner del perimetro OFFLINE v1 su GitHub;
  2. il censimento atomico completo delle sezioni di #3 (≈25 card web) e di #20 (≈20 sezioni), oggi aggregate.

### 2.2 Requisiti mancanti (PROPOSAL — ID stabili proposti)

| ID proposto | P | Fonte | Descrizione atomica | Dipende da | Perché è stato omesso |
|---|---|---|---|---|---|
| MP-API-001 | P0 | #98 contratto tool-first; scope "backend/API" | API read-only versionata (`/api/v1`) con schema I/O per endpoint | SEC-001 | usato come dipendenza "esterna" invece che come requisito |
| MP-API-002 | P0 | #98 | envelope d'errore deterministico e codici stabili | API-001 | assente |
| MP-API-003 | P0 | #3 provenance, #98 | ogni risposta porta provenance, coverage, `as_of` e versioni dati/codice | API-001, FPT-004, TC-010 | considerato coperto dal web (WEB-006), ma è un contratto backend |
| MP-API-004 | P0 | #30, owner web scope | ricerca/filtri/paginazione limitati e validati | API-001, SEC-006 | esterno come API-001 |
| MP-API-005 | P1 | #98, #104 MCP-CORE-00 | registro tool/endpoint usabile senza UI (baseline MCP-CORE-00) | API-001..003 | #98 escluso dal censimento requisiti |
| MP-API-006 | P0 | codice esistente (`query.mjs`, `server.mjs`) | inventario, autorizzazione e piano di compatibilità o deprecazione delle route non versionate `/api/fpt/*` e `/api/tc/*` | SEC-001 | route esistenti non mappate |
| MP-ARC-001 | P0 | #40 punti 10/16, #144 fase 2 | manifest e data dictionary dell'archivio leggibili e versionati con hash pinnato nel repo | GOV-010 | #40 ridotto a 2 requisiti |
| MP-ARC-002 | P0 | #40 (DuckDB portability) | portabilità DuckDB (nessun path assoluto `/tmp`) verificata in modo indipendente | ARC-001 | dichiarata PASS in closure §11 ma non riverificata dall'audit indipendente 6055386180 |
| MP-ARC-003 | P0 | #40 riserve audit | le riserve dell'archivio emergono come limiti nei risultati: 64.446 gruppi closing PIT UNAVAILABLE, liquidità UNAVAILABLE, TC non canonico | ARC-001 | assente |
| MP-ARC-004 | P1 | #144 fase 0 | verifica licenza/pubblicabilità dei dataset reali committati (repo PUBLIC), es. `test/fixtures/independent-historical-sample.json` | — | assente |
| MP-CFG-001 | P0 | #95 accettazione 6–8, #24 sessione replay, #34 | ogni run di replay/backtest congela `settings_snapshot_id` e `commission_rate_used` (Decimal) | — | #95 classificato "futuro" nonostante la nota "salvo configurazione congelata" |
| MP-MKT-001 | P0 | #100, #99 "market_rule_version congelata" | risoluzione esiti versionata per i mercati del backtest (1X2, O/U, AH mezze linee, BTTS, corner) con VOID/PUSH; stesso input + stessa versione ⇒ stesso esito | — | C-09 lo nomina ("contratto separato") ma non crea il requisito |
| MP-MKT-002 | P0 | #40 riserve (outcome labels non materializzati) | materializzazione delle label di esito per il backtest o dichiarazione N/D | MKT-001, ARC-001 | assente |
| MP-MATH-001 | P0 | #94, decisione owner 07/10 | oracle matematico indipendente, Decimal/precisione fissa, test vector | — | esterno |
| MP-MATH-002 | P1 | #94 baseline owner 07/10, #3 Intelligence | baseline Poisson, fair odds e calibrazione con modelli deterministici economici; ML pesante fuori scope | MATH-001 | assente |
| MP-MATH-003 | P1 | #94, #34 | applicazione della commissione e definizione del P/L in Decimal | CFG-001, MATH-001 | assente |
| MP-IDN-001 | P0 | #31 RECON-CORE-01; limite TC-CORE-02 | identità match/squadra FPT↔TC VERIFIED e versionata (oggi solo a livello competizione) | TC-002 | assente: blocca i join FPT×TC del replay e del backtest |
| MP-TZ-001 | P0 | #12 limite `PROVIDER_TZ_UNDOCUMENTED`; TC-CORE-01/03B | timezone e DST per data storica (FPT `kickoff_utc` null; TC +120 misurato solo in estate) | IDN-001 | assente: è un rischio PIT diretto |
| MP-TC-013 | P1 | #20 TC-CORE-05/06/06B | normalizzazione dei dati live catturati (stats, eventi, linee di mercato) e coverage per minuto/campo | TC-007 | aggregato in TC-010 |
| MP-TC-014 | P1 | #20 decisione 10-08 (vendor notice) | `bookmaker_odds` su 18 bookmaker, movimento per bookmaker e BTTS testati hard | TC-005 | assente |
| MP-STA-013 | P0 | #34 (slippage, liquidità minima), #94 LIQUIDITY_UNAVAILABLE, #40 | semantica del P/L di backtest quando liquidità e fill non sono disponibili | MKT-001 | assente |
| MP-GOV-013 | P0 | MP-OWNER-CERT-ISSUE-CLOSURE-01 | chiusura issue solo dall'owner; commento "READY TO CLOSE — OWNER APPROVAL REQUIRED"; solo "Refs #" | — | decisione successiva |
| MP-GOV-014 | P0 | MP-OWNER-AUTOMERGE-01 | auto-merge solo con Gate A/B, test, CI, review indipendente APPROVED, zero finding bloccanti (sostituisce GOV-005) | GOV-013 | decisione successiva |
| MP-GOV-015 | P0 | MP-GITHUB-SINGLE-SOURCE-OF-TRUTH-01 | registro decisioni owner e checkpoint persistenti su GitHub; documenti canonici non divergenti | — | decisione successiva |
| MP-OPS-001 | P1 | #144 Gate B e fase 4, #3 osservabilità | drill di backup/restore del DB di sviluppo e verifica dell'archivio; compatibilità PG17 CI ↔ PG18 produzione | — | assente |

**Non inseriti perché senza fonte (NOT VERIFIED → decisione owner, non requisito inventato).**
- Accessibilità WCAG: nessuna issue la richiede; solo "keyboard accessibility" in #94.
- i18n.
- Disclaimer legale trading/gambling.
- Policy di retention con limiti di dimensione.

---

## 3. Audit delle 30 issue aperte

Fonti: corpo e commenti di tutte le issue letti via API (FACT: 30 issue aperte, nessuna label, nessuna aggiornata dopo il 2026-10-09) e codice su `main` `353dfc6`.

| # | Titolo | Classificazione | Perimetro | Evidenza chiave / note |
|---|---|---|---|---|
| 3 | MASTER prodotto | GOVERNANCE | entrambi | blocco stato 07/10 **stale** (TC "da iniziare"); decisioni owner 06/10: solo calcio, FPT+TC primari, FPT∩TC VERIFIED, shared computation |
| 12 | FPT-CERT | PARTIALLY IMPLEMENTED | v1 | certificato 05/10 20/20 (1027 dataset, 615 available, 412 `unavailable_404`, 161.801 fact). **Audit 412: nessun codice** (grep: `FUTURE_NOT_PUBLISHED` assente da `src/`). PIT/reprocessing aperto: `reprocessRaw` riusa `acquired_at`, `fpt_match_facts_at` senza versione parser |
| 20 | TC-CERT | PARTIALLY IMPLEMENTED | v1 (+ live futuro) | TC-CORE-01/02/03/03B/04 certificati per componente (#130–#145). 05/06/06B/07/08 assenti. **Conflitto:** commenti 10-09 "READY TO CLOSE" contro il contratto della #20 e le card #104 → NON chiudibile |
| 23 | AUTH-ADMIN | NOT IMPLEMENTED | baseline v1 / SaaS futuro | nessuna tabella o codice auth/sessione |
| 24 | MATCH-REPLAY | NOT IMPLEMENTED | v1 backend | solo input (`tc_live_*`, migrazione 027). Live catturato ≈17 h, 2 FT confermati: il gate "≥3 partite finite" potrebbe essere irraggiungibile senza nuova cattura (INFERENCE) |
| 25 | MATCH-CENTER-FT | NOT IMPLEMENTED | v1 (QUERY-CORE-01) | esistono solo `/api/fpt/match` e `/api/tc/prematch/match` come mattoni |
| 27 | GOAT-BENCHMARK | DEFERRED | futuro (dipende da #28) | 0/21; le partite del 04/10 precedono la cattura TC core |
| 28 | TRADING-ENGINE | NOT IMPLEMENTED | futuro (validazione storica forse v1) | solo `fpt_filter_registry` come input |
| 29 | LIVE-TRADING-BOARD | DEFERRED | futuro | UI finale fase 15; richiede LIVE |
| 30 | MATCH-ANALYSIS-HUB | NOT IMPLEMENTED | v1 (QUERY-CORE-02) | mattoni FPT `/api/fpt/{team-matches,h2h,odds-range,…}` |
| 31 | DATA-RECONCILIATION | PARTIALLY IMPLEMENTED | v1 | parte FPT fatta (migrazione 019, PR #88); RECON-CORE-01..05 assenti |
| 32 | SEC-HARDENING | DEFERRED | baseline v1 / avanzato futuro | solo `nosniff` e `no-store`; nessun CSP/HSTS/rate-limit |
| 34 | STRATEGY-LAB | NOT IMPLEMENTED | v1 (backtest) / futuro (DSL, live matcher) | nessun codice; `strategy_field_catalog` solo nell'archivio #40 |
| 40 | PROVIDER-TRIAL | **COMPLETED & VERIFIED con riserve** | v1 (archivio) | punto 9 PASS (#124); finestra sicura ATTESTED 07/10; punti 10–16 PASS (15/16 "with reserves", doc `provider-trial-final-closure-2026-10-08.md`, PR #129); punto 17 eseguito su autorizzazione owner; audit indipendente 6055386180 READY_TO_CLOSE_WITH_RESERVATIONS. **Riserve:** portabilità DuckDB e ri-hash dei 13 chunk non riverificati dall'audit indipendente (NOT VERIFIED). Il secondo blocco stato del body (07/10) è stale. Resta OPEN: chiusura solo owner |
| 44 | AI-ASSISTANT | DEFERRED | futuro | fase 12 |
| 45 | EXECUTION | DEFERRED / FUTURE | futuro | owner-gated |
| 46 | BILLING-SAAS | DEFERRED / FUTURE | futuro | fase 16 |
| 87 | INFRA-COST | DEFERRED | futuro | "parcheggiata" |
| 91 | WEWEB | DEFERRED / FUTURE (proposta non approvata) | — | owner 05/10: NON approvata |
| 94 | MATH CORE | NOT IMPLEMENTED | v1 parziale (oracle/Poisson/metriche) / resto futuro | baseline owner 07/10: modelli deterministici economici, ML pesante fuori scope |
| 95 | SETTINGS | NOT IMPLEMENTED | v1 solo snapshot di config / resto futuro | nessuno schema |
| 96 | MONEY-MANAGEMENT | NOT IMPLEMENTED | futuro (replay v1 neutro) | eccezione STOP/ADVISORY sulle posizioni aperte: OPEN / OWNER DECISION |
| 97 | ROADMAP | GOVERNANCE | entrambi | fasi 0–16; override 07/10; blocco stato stale |
| 98 | OPERATOR-API-MCP | NOT IMPLEMENTED | v1 per il contratto API / futuro per MCP completo | route REST presenti ma non versionate; nessun registro |
| 99 | SETTLEMENT-LEDGER | NOT IMPLEMENTED | futuro | — |
| 100 | MARKET-RULES | NOT IMPLEMENTED | v1 solo esiti per backtest / resto futuro | — |
| 102 | TRADING-COPILOT | NOT IMPLEMENTED | futuro | — |
| 104 | PIANO 82 PR | GOVERNANCE | entrambi | 0 commenti; "82 = baseline storica"; tabella stato 07/10 stale (TC "da iniziare") |
| 132 | ML Lab | TRACKING ONLY | futuro (idea non approvata) | — |
| 144 | Zero-cost CI | PARTIALLY IMPLEMENTED | infra dev | fasi 0–2 fatte (#146/#147/#148, Render e Neon RW sospesi il 09/10); fasi 3–4 aperte; snapshot Neon scaduto il 10/10 (stato attuale NOT VERIFIED); PG17 CI vs PG18 produzione |

Totali per classificazione (FACT sulla base sopra):

| Classificazione | Issue | Elenco |
|---|---:|---|
| COMPLETED & VERIFIED | 1 | #40 |
| PARTIALLY IMPLEMENTED | 4 | #12, #20, #31, #144 |
| NOT IMPLEMENTED | 13 | #23, #24, #25, #28, #30, #34, #94, #95, #96, #98, #99, #100, #102 |
| DEFERRED / FUTURE | 8 | #27, #29, #32, #44, #45, #46, #87, #91 |
| GOVERNANCE / TRACKING | 4 | #3, #97, #104, #132 |

Issue chiuse recenti: #1, #2 (not_planned), #4, #6, #8, #10 (completed), tutte il 04/10.

---

## 4. Riconciliazione delle 82 PR storiche (#104)

- **FACT:** #104 ha 0 commenti. Il body è stato modificato il 07/10 dalla PR #125 ("82 è baseline storica, NON conteggio verificato del residuo"). Il riconteggio degli ID card nel body dà 82 (76 originarie + 6).
- **FACT:** FPT-PR-01..09 della #12 **non** fanno parte delle 82. Restano fuori anche: UI finale, #44, #45, #32 e #46.
- **FACT:** risultano 110 PR mergiate nel repository:
  - 58 su `main`;
  - 52 su `temp/betsapi-trial-collector`, cioè il trial #40, non su main.
  
  #73 e #80 sono chiuse senza merge; #149 è aperta.

| Classificazione | Card | Dettaglio |
|---|---:|---|
| COMPLETED & CERTIFIED (scope componente) | **5** (intervallo 3–5) | TC-CORE-01 (#130), 02 (#131/#133), 03 (#134–#136), 03B (#137–#142, solo campione: 60 match / 15 leghe, 0 checkpoint di lega completi), 04 (#143/#145). 01 e 02 sono "PASS WITH KNOWN LIMITATIONS" e il README le dà ancora "in corso" → intervallo 3–5 |
| PARTIALLY IMPLEMENTED | **6** (INFERENCE da schema e grep) | TC-CORE-05, 06, 06B, 07 (manca il percorso alert Telegram TC: grep nullo), RECON-CORE-01, REPLAY-CORE-01 |
| NOT STARTED | **71** | tutte le altre |
| SUPERSEDED / DUPLICATE | **0 verificate** | la sequenza MP-PR non è ratificata dall'owner, quindi non sostituisce formalmente alcuna card. Sovrapposizioni di fatto con le R-xx proposte: QUERY-CORE-01/02 → R-07/R-06; REPLAY-CORE-01/02 → R-09/R-10; AUTH-CORE-01/02 → R-04; MCP-CORE-00 → R-03; STRAT-CORE-03/04 → R-14; MATH-CORE-01/07/08 → R-12; RECON-CORE-01 → R-08; TC-CORE-05/06/06B → R-15; TC-CORE-07 e RECON-04/05 → R-17 |
| DEFERRED (oltre v1) | 53 (51–60) | Settings 4 (salvo lo snapshot assorbito in R-13), Math 02–06, MM 8, Market 5 (salvo il sottoinsieme esiti in R-13), Ledger 7, Paper 1, Strategy 01/02/05/06/07, Trade 8, MM-INTEGRATION, REPLAY-03, BENCH, TCOP 4, MCP-01..03 |

**Il numero 82 non è più la roadmap canonica applicabile (FACT + INFERENCE):**
- è stato declassato a baseline storica dalla #125;
- esclude FPT, UI, AI, execution e billing;
- 5 card sono già chiuse per componente.

Va mantenuto come catalogo di identificativi per la tracciabilità, non come conteggio.

---

## 5. Matrice globale Issue → Requisito → Codice → Test → PR storica → PR futura → Evidenza → Stato

La matrice riga per riga dei 96 requisiti è nell'**Appendice A**, generata dal JSON, con il mapping alle PR storiche e alle PR future R-xx. Qui sotto la vista per issue, inclusi i requisiti mancanti di §2.2.

| Issue | Requisiti #149 | Requisiti mancanti (§2.2) | Codice principale | Test | PR storiche | PR future (R-xx) | Stato |
|---|---|---|---|---|---|---|---|
| owner 18/10 | GOV-001/002/005/008, WEB-001/007/010, RPL-003/004/009/010, STA-002..004/006/007/009/010/012, QAC-001..012, SEC-005/006/008/010 | GOV-013..015 | tools/, scripts/ci-classify | requirements-inventory, ci-classify | #146–#148 | R-00, R-01, tutte | parziale |
| #3 | GOV-003/007, FPT-003/004/009, WEB-002/005/006/008/009, STA-005/008/011 | API-003, MATH-002 | coverage-page, providers/futpython/* | phase5, fpt-coverage-page | #5–#93, #125 | R-03, R-05..R-07, R-12, R-14, R-18 | parziale |
| #12 | FPT-001/002/005/007/008/010/011/012 | TZ-001 | providers/futpython/* (18 moduli), migrazioni 001–020 | phase1–9, fpt-* | FPT-PR-01..09 | R-08, R-16 | parziale |
| #20 | TC-001..012 | TC-013, TC-014, IDN-001 | providers/totalcorner/*, migrazioni 021–028 | tc-core-* | #130–#145 | R-08, R-15, R-17, R-18 | parziale |
| #23 | SEC-001/002/007/012 | — | — | — | — | R-04, R-17 | non implementato |
| #24 | RPL-001/002/005..008/011/012, WEB-012 | — | (input migrazione 027) | — | — | R-09, R-10, R-11 | non implementato |
| #25 | WEB-004 | — | — | — | — | R-07, R-11 | non implementato |
| #30 | WEB-003 | API-004 | query.mjs (parziale) | fpt-assistant-queries | #81 | R-06, R-07 | non implementato |
| #31 | FPT-006 | IDN-001 | reconciliation.mjs | fpt-reconciliation* | #88 | R-08, R-17 | parziale |
| #32 | SEC-011 (→ future) | — | server.mjs header | — | — | futuro | differito |
| #34 | STA-001 | STA-013 | — | — | — | R-14 | non implementato |
| #40 | GOV-010, SEC-010 | ARC-001..004, MKT-002 | (branch trial) | — | #47–#129 (trial) | R-02 | completato con riserve |
| #94 | — | MATH-001..003 | — | — | — | R-12 | non implementato |
| #95 | — | CFG-001 | — | — | — | R-13 | non implementato |
| #97 | GOV-006, WEB-011 | — | — | mockup-alignment | #125 | R-01 | governance |
| #98 | — | API-001..006 | server.mjs, query.mjs | — | — | R-03 | non implementato |
| #100 | — | MKT-001 | — | — | — | R-13 | non implementato |
| #104 | GOV-011 | — | — | — | #125 | R-01 | governance |
| #144 | GOV-009, QAC-009, SEC-003/004/009 | ARC-004, OPS-001 | ci.yml, ci-classify, background.mjs | ci-classify, runtime-isolation, postgres-independence | #146–#148 | R-01, R-17 | parziale |
| #27, #28, #29, #44, #45, #46, #87, #91, #96, #99, #102, #132 | nessuno (corretto: fuori v1) | — | — | — | — | futuro (§8) | differito/futuro |

**Tracciabilità inversa (FACT):**
- **Requisiti senza PR assegnata:** nessuno ha `target_pr` vuoto, ma 6 puntano a PR fuori sequenza (B-05) e 25 mancanti non hanno ancora PR.
- **PR senza requisiti:** MP-PR-05. MP-PR-03 ha solo requisiti condivisi con MP-PR-08 e MP-PR-14: un lane Playwright senza UI reale non ha un oggetto da testare (INFERENCE), per questo viene assorbita in R-05.
- **Lavoro già realizzato ma ripianificato:**
  - "TC-LIVE-CERT" ripropone restart/FT già certificati per #145 (B-07);
  - QAC-002, SEC-003 e SEC-005 sono già soddisfatti da #147/#148 e correttamente PASS.
- **Funzionalità parziali:** FPT-003, FPT-006, FPT-011, TC-005, TC-010 e WEB-005/006 hanno codice e test ma non evidenza integrata.
- **Test mancanti:** WEB-*, RPL-*, STA-* e SEC-001/007 hanno zero test, coerente con l'assenza del codice.
- **Decisioni owner incompatibili:**
  - GOV-005 contro AUTOMERGE-01;
  - la regola AGENTS che consente la chiusura issue su autorizzazione contro CLOSURE-01 ("SOLO l'owner");
  - AGENTS "Dopo il merge: verificare deploy Render / migrazioni Neon" contro Render e Neon sospesi e il divieto di deploy.
- **Attività non autorizzate:**
  - la cattura LIVE necessaria a TC-CORE-08, a "≥3 partite finite" della #24 e a RECON-03 richiede il rinnovo TotalCorner e la riattivazione dei collector: costi e produzione esclusi;
  - l'audit 412 richiede chiamate al provider FPT, con budget e segreti da autorizzare.

---

## 6–9. Conteggio delle PR

| | Numero verificato | Stima | Intervallo | Fonte | Assunzioni / lacune |
|---|---|---|---|---|---|
| **A — PR storiche completate** | **58 PR mergiate su main** (FACT), di cui **14 coprono 5 card #104** e circa 38 coprono FPT-PR-01..09 (#12, fuori dalle 82). Altre **52 PR** sono mergiate sul branch trial #40 (non main) e pertinenti solo all'archivio | — | card #104 completate: 3–5 | API PR + `git log` (clone shallow: #5–#22 verificate solo via API) | "completata" significa mergiata e certificata per componente, **non** feature certificata globalmente |
| **B — PR residue OFFLINE v1** | NOT VERIFIED (il denominatore è incompleto) | **19** = #149 corretta + R-01…R-18 | **17–23** | §8 | il valore basso fonde R-01 nella #149 ed esclude R-16 se l'owner rinvia l'audit 412; il valore alto divide R-09 (query layer) e R-17 (security vs perf/recovery) e aggiunge una PR per la normalizzazione TC dell'archivio #40 |
| **C — PR residue oltre v1 (approvate)** | NOT VERIFIED | **≈90** | **75–105** | card #104 oltre v1 (≈50 dopo l'assorbimento in R-12/R-13/R-14) + AI-PR-01..07 (#44, 7) + BILLING-PR-01..07 (#46, 7) + #45 (5–8, nessun piano a card: NOT VERIFIED) + #32 (2–4) + UI finale fase 15 (8–15) + #144 fasi 3–4 (2–3) + live (TC-CORE-08, RECON-03, AUTH-03/04, 3–5) | **Esclusi come non approvati:** #91 WeWeb, #132 ML Lab, #87 (decisione di fine progetto, non sviluppo). #45 e #46 sono approvati come fasi della roadmap #97, non come implementazione |
| **D — Totale globale residuo senza duplicazioni** | NOT VERIFIED | **≈109** (19 + 90) | **92–128** | B + C | se si contano anche le PR già completate: 58 su main + residuo |

**Cosa serve per rendere certificabili B, C e D:**
1. il denominatore v1 completo e ratificato (§2);
2. una decisione owner su come la sequenza R-xx sostituisce le card #104;
3. i piani a card di #45, #32 e della UI finale, che oggi non esistono;
4. lo stato della membership TotalCorner dopo l'11/10 (NOT VERIFIED).

---

## 10. Roadmap ottimizzata per dipendenze (PROPOSAL)

Una PR di implementazione alla volta. L'auto-merge è ammesso solo ai gate di MP-OWNER-AUTOMERGE-01. L'ordine dà priorità a dati autentici → API → sito reale, come richiesto, senza aspettare replay e statistica per mostrare il sito.

| ID | Scope | Issue | Requisiti | Dipende da | Compl. | Test chiave / criterio di accettazione | Rischio | Stima |
|---|---|---|---|---|---|---|---|---|
| R-00 | correzione #149 (B-01…B-07) | #3 #97 #104 | GOV-*, + §2.2 | — | S | validatore: PASS⇒evidenza, `target_pr`∈registro, nessun 12×8; review indipendente APPROVED | basso | 0,5 g |
| R-01 | governance SSOT: AGENTS/CLAUDE/README/template PR, registro decisioni owner, blocchi stale, schema Gate B evidence (QAC-010) | #3 #97 #104 #144 | GOV-013..015, QAC-010, QAC-012 | R-00 | S | test di coerenza documentale (nessun "Closes #", ingresso operativo unico), schema evidence validato | basso | 0,5–1 g |
| R-02 | archivio #40 materializzato read-only: SHA/manifest prima della lettura, DuckDB portabile, riserve esposte | #40 #144 | GOV-010, SEC-010, ARC-001..004 | R-01 + **autorizzazione owner** (accesso Drive) | M | SHA dei 13 chunk ricalcolato, relocation DuckDB in CI, byte originali immutati | medio (accesso, dimensione 499 MB) | 1–2 g |
| R-03 | API v1: contratto, envelope errori, provenance, validazione input, inventario route legacy | #98 #3 | API-001..006, QAC-003, SEC-006, FPT-004 | R-01 | M | contract test su schemi, input fuzz, nessuna query illimitata | medio | 2 g |
| R-04 | auth baseline owner/admin (sessione, CSRF, rate limit, RBAC deny-default), anche sulle route API | #23 #32 | SEC-001, SEC-007 | R-03 | M | escalation, fixation, CSRF, brute force; nessun secret nei log | alto (sicurezza) | 2 g |
| R-05 | shell web reale + lane Playwright/security (ex MP-PR-03/08) | #3 #97 | WEB-001/009/010/011, QAC-004, QAC-005 | R-03, R-04 | M | E2E desktop/mobile, stati loading/empty/error, nessuna formula nel client | medio | 2 g |
| R-06 | Daily Board, ricerca e filtri (+ backend QUERY-CORE-02 minimo) | #3 #30 | WEB-002/007, API-004, FPT-009 parziale | R-05 | M | E2E su dati reali offline; N/D≠0 | medio | 2 g |
| R-07 | Match Center + qualità dati + grafici odds/statistiche (+ QUERY-CORE-01) | #3 #25 #30 | WEB-003/005/006/008, TC-005, FPT-009 | R-06 | M | coverage/provenance per modulo; nessuna continuità inventata | medio | 2–3 g |
| R-08 | pinning PIT: versioni parser/schema/identità, identità FPT↔TC, timezone/DST | #12 #31 #20 | FPT-005, IDN-001, TZ-001 | R-02 + **decisione owner PIT** | M | stesso T ⇒ stesso risultato prima e dopo il reprocessing; DST 25/10 | alto (semantica) | 2–3 g |
| R-09 | query layer archivio + replay core deterministico (ex MP-PR-05/06) | #24 | RPL-001..003, RPL-005..010 | R-02, R-08 | L | stesso input + seed ⇒ stesso stato; casi adversarial; nessuna interpolazione | alto | 3–4 g |
| R-10 | API replay | #24 #98 | RPL-011 | R-09, R-03 | S | contract e validazione match/tempo | basso | 1 g |
| R-11 | UI replay | #24 #25 | WEB-004, WEB-012, RPL-004 | R-10, R-07 | M | E2E controlli e salti 0/HT/60/75/90/FT | medio | 2 g |
| R-12 | oracle matematico, metriche (Brier, log loss, ROI, drawdown, IC) | #94 #3 | MATH-001..002, STA-002/007/008/009 | R-01 | M | test vector e oracle indipendente; Decimal | medio | 2 g |
| R-13 | contratto esiti di mercato (sottoinsieme #100) + snapshot config/commissione (sottoinsieme #95) | #100 #95 #99 | MKT-001/002, CFG-001, MATH-003 | R-12 | M | stesso input + versione regola ⇒ stesso esito; AH mezze linee; VOID/PUSH | medio | 2 g |
| R-14 | backtest cronologico, walk-forward, OOS, NO TRADE, baseline | #34 #3 | STA-001/003..006/010..013 | R-09, R-12, R-13 | L | leakage test; finestre congelate; nessun claim su campioni piccoli | alto | 3–4 g |
| R-15 | normalizzazione dei dati TC già catturati (TC-CORE-05/06/06B, offline) | #20 | TC-007, TC-010, TC-013, TC-014 | R-02, R-08 | M | dedup e coverage per minuto su dati reali; nessuna nuova acquisizione | medio | 2 g |
| R-16 | audit 412 FPT + chiusura dei residui FPT | #12 | FPT-003/006/008/011/012 | R-08 + **autorizzazione owner** (chiamate provider/budget) | M | 412/412 classificati nelle 7 classi owner | medio (accesso) | 1–2 g |
| R-17 | adversarial, recovery, performance, security, alert TC, backup/restore, PG17↔PG18 | #23 #31 #144 #20 | QAC-006/007, SEC-002/008/009/012, TC-011, OPS-001 | R-05…R-16 | L | crash/restart, budget di performance, zero HIGH/CRITICAL | medio | 3 g |
| R-18 | Gate A/B integrati + IV&V OFFLINE v1 | tutte v1 | GOV-007, FPT-012, TC-012, RPL-012, STA-012, QAC-011 | tutte | M | matrice completa: tutti i P0 PASS o N/A motivati | — | 1–2 g |

**Note di ottimizzazione:**
- R-12 non dipende dal replay: può partire subito dopo R-01 se R-02 resta bloccato in attesa dell'owner.
- R-03…R-07 permettono di avere un sito reale prima del replay.
- MP-PR-03 è assorbita in R-05.
- MP-PR-05 è assorbita in R-09.
- MP-PR-02 è assorbita in R-01, perché lo schema di evidenza è governance.

---

## 11. Principali blocker

1. **#149 non mergiabile** (B-01…B-07) e senza revisione indipendente APPROVED.
2. **Accesso all'archivio #40 (Drive)** per R-02: richiede un'autorizzazione (SEC-010 è owner-gated).
3. **Semantica PIT FPT:** OPEN / OWNER DECISION ("known-then" o ricostruzione). Blocca R-08 e, a cascata, replay e backtest.
4. **TotalCorner:**
   - membership scaduta l'11/10 o non rinnovata (NOT VERIFIED);
   - collector spenti dal 09/10;
   - il live catturato è ≈17 h, con 2 FT confermati.
   
   I gate multi-day e "≥3 partite finite" della #24 e della #20 non sono raggiungibili offline senza nuova cattura (costo/produzione).
5. **Infrastruttura sospesa** (Render e Neon RW dal 09/10): le prove "hard real Render/Neon" richieste da AGENTS e dalle issue non sono eseguibili. Serve definire cosa vale come HARD VERIFIED offline.
6. **Documenti canonici divergenti.** Blocchi "Ingresso operativo 07/10" (PR #125) in README, CLAUDE.md e AGENTS.md; stati stale in #3, #12, #20, #97 e #104; commento "READY TO CLOSE" della #20 incoerente con il contratto.

---

## 12. Decisioni owner realmente necessarie

**Governance SSOT: verifica dei passi 1–3 di MP-GITHUB-SINGLE-SOURCE-OF-TRUTH-01 (FACT)**

- **Automazioni.** `.github/workflows/` contiene solo `ci.yml`. Nessuna automazione chiude issue. CodeRabbit "Autofix" è presente ma non attivato. Il template PR non ha campi per "Refs #", ID requisiti o Gate A/B.
- **Conflitti con le decisioni del 18/10:**
  - AGENTS.md riga 266 e la sezione "Regola chiusura" di CLAUDE.md consentono all'agente di chiudere una issue con autorizzazione specifica: in conflitto con CLOSURE-01.
  - L'intestazione del commento è "READY TO CLOSE / CHIUDIBILE" invece di "READY TO CLOSE — OWNER APPROVAL REQUIRED".
  - Il "merge solo dopo owner" del blocco 07/10 è in conflitto con AUTOMERGE-01.
  - "Dopo il merge: verificare deploy Render / migrazioni Neon" (AGENTS) è in conflitto con il divieto di deploy e con l'infrastruttura sospesa.
  - CLAUDE.md e AGENTS.md duplicano quasi integralmente gli stessi blocchi.
- **Modifica minima proposta (PROPOSAL, R-01):**
  1. un file `docs/governance/owner-decisions.md` come registro unico delle decisioni, con data, ambito, precedenza e superseded-by;
  2. AGENTS.md come istruzioni operative canoniche;
  3. CLAUDE.md ridotto a rimando ad AGENTS.md più le specificità Claude Code;
  4. sostituzione del blocco 07/10 con un "checkpoint corrente" unico;
  5. template PR con le sezioni Refs, requisiti, Gate A/B e merge-readiness;
  6. un test che rifiuti "Closes|Fixes|Resolves #" nei documenti e nel template.

**Decisioni necessarie, in ordine di urgenza**

| # | Decisione | Perché serve |
|---|---|---|
| D1 | **Chi corregge la #149 e dove.** (a) Autorizzare la correzione nella #149, eventualmente includendo anche R-01 (governance SSOT) per risparmiare un ciclo; oppure (b) #149 corretta e mergiata, poi R-01 come PR separata | il mandato di audit vietava di modificare la #149 e di aprire PR; MP-GITHUB-SSOT richiede una PR tracciata; una PR alla volta. Raccomandazione: **(a)** |
| D2 | **Cosa vale come "review indipendente APPROVED"** per l'auto-merge. Un account non può approvare la propria PR. Opzioni: review umana; review di un agente diverso pubblicata come review GitHub da un account distinto; oppure commento di verdetto più check | senza questa definizione nessuna PR soddisfa AUTOMERGE-01 |
| D3 | **Ratificare il perimetro OFFLINE v1** (mandato MP-ENTERPRISE-GATE-AB-WEB-SIM-01) su GitHub (#3/#97) | oggi esiste solo nella #149; non è tracciabile alle issue |
| D4 | **Semantica PIT FPT** ("known-then" oppure ricostruzione con parser nuovo) | blocca R-08, R-09 e R-14 |
| D5 | **Definizione di HARD VERIFIED offline** con Render e Neon sospesi (PostgreSQL CI + archivio con hash?) | le regole AGENTS/CLAUDE richiedono prove Render/Neon reali |
| D6 | **TotalCorner:** rinnovo sì o no (costo) | decide se TC-CORE-08, i gate live della #24 e il backfill storico completo stanno in v1 o nel futuro |
| D7 | **Autorizzazione R-02** (lettura dell'archivio #40 da Drive) e **R-16** (chiamate FPT per l'audit 412: budget e segreti in CI?) | operazioni con accesso esterno |
| D8 | **Rapporto R-xx ↔ card #104:** sostituzione con mapping, oppure #104 resta catalogo | serve per i conteggi definitivi B/C/D |
| D9 | **#40:** chiusura a discrezione dell'owner (READY_TO_CLOSE_WITH_RESERVATIONS); **#20:** confermare che il "READY TO CLOSE" del 09/10 vale solo per lo scope #145 | stato amministrativo |

Restano aperte, ma **non** necessarie per v1: STOP/ADVISORY sulle posizioni aperte (#96/#99), WeWeb, ML Lab, accessibilità, i18n e disclaimer legale. Non ho inventato decisioni.

---

## 13. Prossima PR consigliata

**R-00: la #149 corretta**, con B-01…B-07 e i requisiti di §2.2, possibilmente unita a R-01 (governance SSOT) se l'owner sceglie D1(a).

Seguono R-03 (API v1) e R-12 (oracle), che non richiedono accessi esterni. R-02 (archivio) parte appena arriva l'autorizzazione D7.

---

## 14. Evidenze e limiti della verifica

**Eseguito (FACT):**
- `git fetch` di `main` e `pull/149/head`;
- worktree locale temporaneo (rimosso);
- validatore, test dedicato, `npm run check` e `npm test` sull'head della PR;
- ricalcolo statistico con script Node sul JSON;
- verifica dell'esistenza di tutti i path mappati (0 mancanti);
- lettura via API di PR #149 (body, check run, review, commenti), di tutte le 30 issue aperte con i commenti, di #104 e dell'elenco completo delle PR (#5–#149);
- grep del codice su `main`.

**Non eseguito / NOT VERIFIED:**
- impostazioni del ruleset 24790739 e della branch protection;
- stato della membership TotalCorner e dello snapshot Neon dopo il 10/10;
- archivio su Drive: nessun accesso, nessun ri-hash;
- contenuto del branch `temp/betsapi-trial-collector`;
- PR #5–#22 verificate solo via API (clone shallow);
- stato "partial" di TC-CORE-05/06/06B/07, RECON-01 e REPLAY-01, dedotto da schema e grep e non da code review completa.

**Nessuna azione con effetti collaterali:** nessun commit, push, merge, PR, commento, deploy, nessuna scrittura su Neon/Render/Drive, nessun workflow avviato.

---

## Appendice A — Matrice per requisito (96 righe, generata da `requirements.json`)

Colonne:
- **PR storiche:** PR mergiate pertinenti (FACT).
- **PR futura:** sequenza R-xx proposta in §10 (PROPOSAL).
- **Nota audit:** finding di questa review.

| ID | Issue | P | Verdict #149 | Code | Test | PR storiche | PR futura (proposta) | Evidenza | Nota audit |
|---|---|---|---|---|---|---|---|---|---|
| MP-GOV-001 | owner 18/10 | P0 | PASS | — | requirements-inventory.test.mjs | — | R-00 | owner authorization 2026-10-18 |  |
| MP-GOV-002 | owner 18/10 | P0 | PASS | — | requirements-inventory.test.mjs | — | R-00 | git diff classification | PASS su divieto futuro: evidenza solo del diff |
| MP-GOV-003 | #3 | P0 | PASS | — | requirements-inventory.test.mjs | #125 | R-00 | source field on every requirement |  |
| MP-GOV-004 | AGENTS.md | P0 | PASS | — | — | — | continuo | pre-flight open PR count 0 |  |
| MP-GOV-005 | owner 18/10 | P0 | NOT_VERIFIED | — | — | — | R-00 | — | superato da MP-OWNER-AUTOMERGE-01 |
| MP-GOV-006 | #97 | P0 | NOT_VERIFIED | — | — | — | tutte | — |  |
| MP-GOV-007 | #3 | P0 | NOT_VERIFIED | — | — | — | R-18 | — |  |
| MP-GOV-008 | owner 18/10 | P0 | PASS | tools/validate-requirements.mjs | requirements-inventory.test.mjs | — | R-00 | — | PASS senza evidenza → NOT_VERIFIED |
| MP-GOV-009 | #144 | P1 | PASS | — | — | #146 | continuo | current runs-on ubuntu-latest |  |
| MP-GOV-010 | #40 | P0 | PASS | — | — | #124,#126,#129 (trial) | R-02 | safe-window evidence | PASS incoerente con SEC-010 BLOCKED |
| MP-GOV-011 | #104 | P1 | PASS | — | requirements-inventory.test.mjs | #125 | R-00 | — | PASS senza evidenza → NOT_VERIFIED |
| MP-GOV-012 | AGENTS.md | P1 | PASS | — | mockup-alignment.test.mjs | #101,#103 | continuo | — | PASS senza evidenza → NOT_VERIFIED |
| MP-FPT-001 | #12 | P0 | PASS | providers/futpython/schema.mjs | schema.test.mjs<br>phase4-registry.test.mjs | FPT-PR-01..09 (#13–#93) | R-16 | historical FPT certificate |  |
| MP-FPT-002 | #12 | P0 | PASS | providers/futpython/store.mjs | fpt-reprocessing.test.mjs | FPT-PR-01..09 (#13–#93) | R-16 | historical certificate scope |  |
| MP-FPT-003 | #3 | P0 | NOT_VERIFIED | providers/futpython/query.mjs | fpt-assistant-queries.test.mjs | FPT-PR-01..09 (#13–#93) | R-16 | — |  |
| MP-FPT-004 | #3 | P0 | PASS | providers/futpython/coverage.mjs | phase5-coverage.test.mjs | FPT-PR-01..09 (#13–#93) | R-03 | — | PASS senza evidenza → NOT_VERIFIED |
| MP-FPT-005 | #12 | P0 | FAIL | providers/futpython/reprocess.mjs<br>migrations/014-fpt-normalized-layer.sql | fpt-reprocessing.test.mjs | FPT-PR-01..09 (#13–#93) | R-08 | documented open PIT risk |  |
| MP-FPT-006 | #31 | P0 | NOT_VERIFIED | providers/futpython/reconciliation.mjs | fpt-reconciliation.test.mjs<br>fpt-reconciliation-sync.test.mjs | FPT-PR-01..09 (#13–#93) | R-17 | — |  |
| MP-FPT-007 | #12 | P1 | PASS | providers/futpython/classification.mjs | phase2-classification.test.mjs | FPT-PR-01..09 (#13–#93) | R-16 | — | PASS senza evidenza → NOT_VERIFIED |
| MP-FPT-008 | #12 | P0 | BLOCKED | — | — | FPT-PR-01..09 (#13–#93) | R-16 | owner audit requirement |  |
| MP-FPT-009 | #3 | P1 | NOT_VERIFIED | — | — | FPT-PR-01..09 (#13–#93) | R-03/R-06/R-07 | — |  |
| MP-FPT-010 | #12 | P1 | PASS | providers/futpython/onboarding.mjs | fpt-onboarding.test.mjs | FPT-PR-01..09 (#13–#93) | continuo | — | PASS senza evidenza → NOT_VERIFIED |
| MP-FPT-011 | #12 | P1 | NOT_VERIFIED | jobs/data-watchdog.mjs<br>alerts.mjs | alerts.test.mjs<br>alert-aggregation.test.mjs | FPT-PR-01..09 (#13–#93) | R-17 | — |  |
| MP-FPT-012 | #12 | P0 | NOT_VERIFIED | futpython-certification.mjs | phase9-certificate.test.mjs | FPT-PR-01..09 (#13–#93) | R-18 | — |  |
| MP-TC-001 | #20 | P0 | PASS | providers/totalcorner/client.mjs | tc-core-discovery.test.mjs | #130 | R-15 | TC-CORE-01 scoped evidence |  |
| MP-TC-002 | #20 | P0 | PASS | providers/totalcorner/mapping.mjs | tc-core-mapping.test.mjs | #131,#133 | continuo | 96 VERIFIED scoped evidence |  |
| MP-TC-003 | #20 | P0 | PASS | providers/totalcorner/prematch.mjs | tc-core-prematch.test.mjs | #134–#136,#141 | continuo | TC-CORE-03 14/14 pre-kickoff |  |
| MP-TC-004 | #20 | P0 | PASS | jobs/totalcorner-prematch.mjs | tc-core-prematch.test.mjs | #134–#136 | continuo | tc-tz-gate-v2 evidence |  |
| MP-TC-005 | #20 | P1 | NOT_VERIFIED | jobs/totalcorner-prematch.mjs | tc-core-prematch.test.mjs | #134–#136 | R-03/R-07 | — |  |
| MP-TC-006 | #20 | P1 | PASS | providers/totalcorner/historical.mjs | tc-core-historical.test.mjs | #137–#142 | continuo | TC-CORE-03B limitations |  |
| MP-TC-007 | #20 | P0 | NOT_VERIFIED | providers/totalcorner/live.mjs<br>jobs/totalcorner-live.mjs | tc-core-live.test.mjs | #143,#145 | R-15 (+futuro TC-CORE-08) | historical 800 snapshot audit | #20 c.6081058030 CERTIFIED per #145 → riclassificare con scope |
| MP-TC-008 | #20 | P0 | BLOCKED | jobs/totalcorner-live.mjs | tc-core-live.test.mjs | #145 | R-15 (+futuro TC-CORE-08) | — | idem: restart/FT certificati per #145 |
| MP-TC-009 | #20 | P1 | PASS | providers/totalcorner/client.mjs | tc-core-discovery.test.mjs | #130 | continuo | — | PASS senza evidenza → NOT_VERIFIED |
| MP-TC-010 | #20 | P0 | NOT_VERIFIED | jobs/totalcorner-prematch.mjs<br>jobs/totalcorner-live.mjs | tc-core-prematch.test.mjs<br>tc-core-live.test.mjs | #136,#145 | R-03 | — |  |
| MP-TC-011 | #20 | P1 | NOT_VERIFIED | alerts.mjs | telegram.test.mjs | — | R-17 | — |  |
| MP-TC-012 | #20 | P0 | BLOCKED | — | — | — | R-18 | — |  |
| MP-WEB-001 | owner 18/10 | P0 | FAIL | server.mjs | — | — | R-05 | current homepage says In costruzione |  |
| MP-WEB-002 | #3 | P0 | FAIL | — | mockup-alignment.test.mjs | — | R-06 | — |  |
| MP-WEB-003 | #30 | P0 | FAIL | — | — | — | R-07 | — |  |
| MP-WEB-004 | #25 | P1 | FAIL | — | — | — | R-07/R-11 | — |  |
| MP-WEB-005 | #3 | P0 | NOT_VERIFIED | coverage-page.mjs | fpt-coverage-page.test.mjs | — | R-05/R-07 | — |  |
| MP-WEB-006 | #3 | P0 | NOT_VERIFIED | coverage-page.mjs | fpt-coverage-page.test.mjs | — | R-07 | — |  |
| MP-WEB-007 | owner 18/10 | P0 | FAIL | — | — | — | R-06 | — |  |
| MP-WEB-008 | #3 | P1 | FAIL | — | — | — | R-07/R-11 | — |  |
| MP-WEB-009 | #3 | P1 | NOT_VERIFIED | — | — | — | R-05/R-17 | — |  |
| MP-WEB-010 | owner 18/10 | P0 | FAIL | — | — | — | R-05 | — |  |
| MP-WEB-011 | #97 | P0 | NOT_VERIFIED | — | — | — | R-05+ | — |  |
| MP-WEB-012 | #24 | P1 | FAIL | — | — | — | R-11 | — |  |
| MP-RPL-001 | #24 | P0 | BLOCKED | — | — | — | R-09 | — |  |
| MP-RPL-002 | #24 | P0 | FAIL | — | — | — | R-09 | — |  |
| MP-RPL-003 | owner 18/10 | P0 | NOT_VERIFIED | providers/totalcorner/prematch.mjs | tc-core-prematch.test.mjs | — | R-09 | — |  |
| MP-RPL-004 | owner 18/10 | P1 | FAIL | — | — | — | R-09/R-11 | — |  |
| MP-RPL-005 | #24 | P1 | FAIL | — | — | — | R-09/R-11 | — |  |
| MP-RPL-006 | #24 | P0 | FAIL | — | — | — | R-09/R-10 | — |  |
| MP-RPL-007 | #24 | P0 | NOT_VERIFIED | — | — | — | R-09 | — |  |
| MP-RPL-008 | #24 | P0 | FAIL | — | — | — | R-09 | — |  |
| MP-RPL-009 | owner 18/10 | P0 | FAIL | — | — | — | R-09 | — |  |
| MP-RPL-010 | owner 18/10 | P0 | FAIL | — | — | — | R-09/R-17 | — |  |
| MP-RPL-011 | #24 | P1 | FAIL | — | — | — | R-10 | — |  |
| MP-RPL-012 | #24 | P0 | BLOCKED | — | — | — | R-18 | — |  |
| MP-STA-001 | #34 | P0 | FAIL | — | — | — | R-14 | — |  |
| MP-STA-002 | owner 18/10 | P0 | FAIL | — | — | — | R-12 | — |  |
| MP-STA-003 | owner 18/10 | P0 | BLOCKED | — | — | — | R-14 | — |  |
| MP-STA-004 | owner 18/10 | P0 | FAIL | — | — | — | R-14 | — |  |
| MP-STA-005 | #3 | P0 | FAIL | — | — | — | R-14 | — |  |
| MP-STA-006 | owner 18/10 | P0 | FAIL | — | — | — | R-14 | — |  |
| MP-STA-007 | owner 18/10 | P1 | FAIL | — | — | — | R-12 | — |  |
| MP-STA-008 | #3 | P1 | FAIL | — | — | — | R-12/R-14 | — |  |
| MP-STA-009 | owner 18/10 | P1 | FAIL | — | — | — | R-14 | — |  |
| MP-STA-010 | owner 18/10 | P1 | FAIL | — | — | — | R-14 | — |  |
| MP-STA-011 | #3 | P0 | FAIL | — | — | — | R-14 | — |  |
| MP-STA-012 | owner 18/10 | P0 | NOT_VERIFIED | — | — | — | R-18 | — |  |
| MP-QAC-001 | owner 18/10 | P0 | PASS | — | *.test.mjs | — | continuo | 161-test baseline |  |
| MP-QAC-002 | owner 18/10 | P0 | PASS | — | postgres-independence.test.mjs | #148 | continuo | run 37952583495 |  |
| MP-QAC-003 | owner 18/10 | P0 | FAIL | — | — | — | R-03 | — |  |
| MP-QAC-004 | owner 18/10 | P0 | FAIL | — | — | — | R-05 | — |  |
| MP-QAC-005 | owner 18/10 | P0 | NOT_VERIFIED | — | — | — | R-05/R-17 | npm audit high exists |  |
| MP-QAC-006 | owner 18/10 | P0 | NOT_VERIFIED | — | resume-drill.test.mjs<br>tc-core-live.test.mjs | — | R-17 | — |  |
| MP-QAC-007 | owner 18/10 | P1 | FAIL | — | — | — | R-17 | — |  |
| MP-QAC-008 | owner 18/10 | P0 | NOT_VERIFIED | — | — | — | continuo | — |  |
| MP-QAC-009 | #144 | P0 | PASS | scripts/ci-classify.mjs | ci-classify.test.mjs | #146 | continuo | ruleset 24790739 |  |
| MP-QAC-010 | owner 18/10 | P0 | FAIL | — | — | — | R-01 | — |  |
| MP-QAC-011 | owner 18/10 | P0 | NOT_VERIFIED | — | — | — | continuo | — |  |
| MP-QAC-012 | owner 18/10 | P0 | NOT_VERIFIED | tools/validate-requirements.mjs<br>scripts/ci-classify.mjs | requirements-inventory.test.mjs<br>ci-classify.test.mjs | — | R-01/R-05 | — |  |
| MP-SEC-001 | #23 | P0 | FAIL | — | — | — | R-04 | — |  |
| MP-SEC-002 | #23 | P0 | NOT_VERIFIED | providers/totalcorner/client.mjs<br>db.mjs | tc-core-discovery.test.mjs | — | R-05/R-17 | — |  |
| MP-SEC-003 | #144 | P0 | PASS | background.mjs | postgres-independence.test.mjs | #146,#148 | continuo | run 37952583495 |  |
| MP-SEC-004 | #144 | P0 | PASS | — | — | #146 | continuo | permissions contents:read; actions SHA-pinned |  |
| MP-SEC-005 | owner 18/10 | P0 | PASS | background.mjs | runtime-isolation.test.mjs | #147 | continuo | CI isolated backend |  |
| MP-SEC-006 | owner 18/10 | P0 | NOT_VERIFIED | providers/futpython/query.mjs | fpt-assistant-queries.test.mjs | — | R-03/R-17 | — |  |
| MP-SEC-007 | #23 | P1 | FAIL | — | — | — | R-04 | — |  |
| MP-SEC-008 | owner 18/10 | P0 | NOT_VERIFIED | — | — | — | R-17 | — |  |
| MP-SEC-009 | #144 | P1 | NOT_VERIFIED | — | — | — | R-05 | npm audit --audit-level=high |  |
| MP-SEC-010 | owner 18/10 | P0 | BLOCKED | — | — | — | R-02 | — |  |
| MP-SEC-011 | #32 | P2 | NOT_APPLICABLE | — | — | — | FUTURO #32 | — | P2 futuro: spostare nel future register |
| MP-SEC-012 | #23 | P0 | NOT_VERIFIED | — | — | — | R-18 | — |  |
