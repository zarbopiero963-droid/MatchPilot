# MatchPilot — Audit delle decisioni owner (sola lettura)

- **Base:** checkout di `main` @ `39fe08e`; GitHub `zarbopiero963-droid/MatchPilot` letto il 22/10/2026: 189 numeri (39 issue + 150 PR) e 751 commenti scaricati in sola lettura.
- **Nessuna scrittura** su GitHub, VPS o DB.
- **Abbreviazioni:**
  - `OD:n` = `docs/governance/owner-decisions.json` riga n;
  - `#N c<id>` = commento GitHub;
  - `file:riga` = file del checkout.
- **Classi:**
  - **D1** decisione owner obbligatoria;
  - **D2** già risolta;
  - **D3** tecnica delegabile;
  - **D4** non più applicabile;
  - **D5** conflitto documentale.

## 0. Inventario delle fonti esaminate

- **Registro `owner-decisions.json`** (73 voci, `OD:7–79`):
  - 58 IN_FORCE, 3 PARTIALLY_SUPERSEDED, 2 SUPERSEDED, 6 COMPLETED;
  - 2 OPEN: `OWN-OPEN-STOP-ADVISORY` (OD:15) e `MP-OWNER-BACKUP-RETENTION-01` (OD:70);
  - 1 proposta OPEN: `MP-OWNER-AUTOMERGE-02-03-PROPOSAL` (OD:74).
- **Testo non ratificato:**
  - 39 voci riportano "owner confirmation of wording pending" (#152 review N-5);
  - altre 15 sono "transcribed and translated by the agent" senza conferma su GitHub.
  - In totale 54 voci su 73 hanno un testo non ratificato dall'owner su GitHub.
- **Documenti di governo:**
  - AGENTS.md (§2, §4, §8, §9, §12), README.md (§STOP 180–182);
  - `docs/pit-policy.md`;
  - `docs/governance/reconciliation-2026-10-21.md` e `docs/governance/audits/2026-10-22-MP-GROK-GLOBAL-TAKEOVER-01.md`;
  - 134 checkpoint: i finding non risolti sono stati filtrati per "owner/proposal/decision".
- **Issue e PR:**
  - corpi e commenti integrali di #96, #99, #97 (45 commenti), #12, #24, #31, #40, #102, #98, #34, #3, #20, #23, #179 (41 commenti) e #182;
  - PR #149–#189 scansionate per decisioni; letti integralmente #178, #184 e #186–#189.

---

## 1. Schede D1 — decisione owner obbligatoria

### DEC-001 — STOP / ADVISORY_ONLY: cosa resta consentito sulle posizioni virtuali già aperte

**Fonti**
- OD:15 `OWN-OPEN-STOP-ADVISORY` (OPEN, "Not needed for OFFLINE v1").
- #97 corpo, righe 52–54.
- AGENTS.md:235 e AGENTS.md:240–241.
- README.md:182.
- `docs/governance/reconciliation-matrix-2026-10-07.md` R29.
- PR #125 (origine dell'OPEN: "R29 per rendere esplicita un'ambiguità owner").

**Testo in conflitto**
- #96, corpo §ADVISORY_ONLY: "nessuna exposure mutation; nessuna financial ledger write". §STOP: "non modifica posizioni già aperte". Hard test: "posizione preesistente continua".
- #99 c6012586884: "#99 NON deve creare position; NON deve RESERVE/RELEASE per nuove proposte; NON deve appendere settlement/financial entries **per operazioni mai aperte**. Le posizioni già esistenti prima dello STOP restano **pienamente gestibili e settleabili**."
- #102 c6012585864: le posizioni già aperte "possono essere gestite/hedgiate/chiuse; continuano fino al settlement; STOP blocca solo nuove aperture/registrazioni". Hard test: "posizione preesistente continua e può essere chiusa/settled".
- #97 corpo, riga 298 (contratto #96): "STOP OPERATIONS: … blocca reserve/exposure mutation; blocca financial ledger writes".
- AGENTS.md:235: "nessuna nuova posizione, riserva o scrittura nel ledger".

**Lettura**
- I testi originali dell'owner del 06/10 (#99, #102) sono coerenti tra loro: lo STOP blocca le nuove operazioni, non quelle esistenti.
- L'ambiguità nasce dalla forma assoluta di "nessuna financial ledger write" nel corpo di #96 e #97 e in AGENTS §8.
- È un conflitto documentato reale, perché la regola assoluta, letta alla lettera, impedisce il settlement.

**Decisioni precedenti e rettifiche successive:** nessuna dopo il 07/10. D3 colloca il paper trading nel perimetro, ma #96 e #99 non sono implementati.

**Comportamento attuale del codice:** assente. Non esistono `operational_mode`, posizioni, ledger o settlement #99 (grep su `src/` e `migrations/` senza risultati, tranne il lock advisory di PostgreSQL). Le uniche scritture "di settlement" sono quelle di `src/signals/simulated.mjs:48–55` (vedi DEC-008), che non passano da #99.

**Perché non è ancora risolta:** non era necessaria per OFFLINE v1 (nota in OD:15). Nessuna PR #96 o #99 è iniziata.

**Matrice per voce** (cosa è deciso e cosa è aperto per le posizioni aperte prima dello STOP)

| Voce | Stato documentale |
|---|---|
| Nuove entrate | **Deciso:** vietate (tutte le fonti) |
| Modifiche di posizione (hedge, cashout, uscita parziale = nuove leg) | **Aperto:** #102 le consente ("gestite/hedgiate/chiuse"); la regola assoluta "nessuna reserve/exposure mutation" le vieterebbe, perché un hedge LAY riserva liability |
| Chiusura | **Probabilmente consentita** (#99, #102); da ratificare |
| Settlement | Consentito da #99 c6012586884 e #102; vietato dalla lettura letterale di #96/#97/AGENTS:235 |
| Commissioni | Seguono il settlement: stesso conflitto |
| Aggiornamento ledger (SETTLEMENT_GROSS/COMMISSION/NET, RELEASE della riserva esistente) | Stesso conflitto; RELEASE "per nuove proposte" è vietato, RELEASE di riserve esistenti non è nominato |
| Riconciliazione | Non nominata; implicitamente necessaria se si fa il settlement |
| Crash recovery | Non nominato: va specificato se il recovery può completare settlement interrotti prima o durante lo STOP |
| Calcolo e visualizzazione P/L | **Deciso:** il P/L live delle posizioni aperte continua (#102: "continuano ad avere P/L live"). Il P/L teorico advisory è marcato "ADVISORY ONLY — operazione non registrata" |
| Sequence/progressioni MM | **Deciso:** nessun avanzamento per trade non registrati. **Aperto:** se il settlement di una posizione pre-STOP fa avanzare la sequenza durante lo STOP |

**Alternative**
- **A — "Gestione completa del pregresso".** Le posizioni pre-STOP restano pienamente gestibili: chiusura, hedge e cashout come leg della stessa posizione, settlement, commissione, ledger, riconciliazione e recovery. Vietato tutto ciò che crea una nuova posizione. È la lettura letterale di #99 e #102.
- **B — "Solo run-off".** Nessuna nuova leg (né hedge né cashout). Restano consentiti solo settlement naturale, commissione, RELEASE, riconciliazione e recovery.
- **C — "Congelamento".** Nessuna scrittura #99 durante lo STOP. I settlement restano SETTLEMENT_PENDING fino al RESUME. Contraddice #99 e #102, ed è menzionato solo per completezza.

**Conseguenze**
- Con C il capitale resta riservato e l'equity è falsata finché dura lo STOP.
- Con B il rischio non è riducibile (niente hedge) durante lo STOP.
- Con A lo STOP perde la funzione di freno totale, ma resta coerente con il fine dichiarato ("interrompere nuove registrazioni").

**Raccomandazione tecnica:** A, con due vincoli:
- hedge e cashout ammessi solo come leg che **riducono** l'esposizione netta della stessa posizione;
- l'avanzamento della sequenza MM sui settlement pre-STOP va reso esplicito, con default "avanza".

Va corretto AGENTS.md:235 ("…nessuna scrittura nel ledger **per nuove operazioni**").

**Domanda all'owner:** "Durante STOP/ADVISORY_ONLY, per le posizioni aperte prima dello STOP confermi A, cioè chiusura, hedge e cashout riduttivi, settlement, commissione, ledger, riconciliazione e recovery consentiti? Oppure scegli B o C? Il settlement di quelle posizioni fa avanzare le progressioni MM?"

**Blocca:** MM-CORE-04 / MM-PR-04 (STOP/RESUME), LEDGER-CORE-01..07, MM-INTEGRATION-01, TCOP-CORE-03, PAPER-CORE-01 e i requisiti R-xx collegati.

---

### DEC-002 — PIT e rielaborazione: storico "come noto a T" (A) contro ricostruzione aggiornata (B); correzioni degli esiti

**Fonti**
- #12 corpo, righe 19–27, e checklist §3–§4 (righe 2756–2791).
- #40 corpo, righe 160–215.
- #24 corpo, riga 165.
- #97 corpo, riga 58 e riga 832.
- #97 c6254329652 (la tabella dice che D4 sostituisce l'item OPEN "Semantica/version pinning PIT").
- OD:24 (D4, con "supersedes": "#12 OPEN PIT owner decision").
- AGENTS.md:259–270.
- `docs/pit-policy.md:68–106`.
- `src/pit/policy.mjs`, `src/pit/readers.mjs`.
- `src/providers/futpython/reprocess.mjs`, migrazione `020-fpt-raw-retention-reprocessing.sql`.

**Testo in conflitto**
- #12, riga 27: "La scelta non registrata tra replay 'come conosciuto allora' e ricostruzione col parser nuovo è **OPEN / OWNER DECISION REQUIRED**". Il testo resta nel corpo di #12.
- #40: "Una correzione ricevuta dopo T non retroagisce nel replay/backtest a T".
- #97, riga 832: "nessuna retrodatazione indebita di reprocessing".
- #12 §3: "Stesso timestamp storico + stesso data contract version → stesso risultato riproducibile".
- #12 §4: "poter confrontare output vecchio vs nuovo".

**Cosa è deciso (D2)**
- Per **replay, statistiche e backtest certificati** vale **A**: solo i dati disponibili a T (D4, #40, #24).
- B non è richiesto come modalità di backtest. La roadmap chiede solo il **confronto** vecchio/nuovo come audit del reprocessing (#12 §4).
- Mappa per voce:

| Elemento che cambia | Regola documentata |
|---|---|
| Versione del parser | Nuova versione con lineage, mai sovrascritta (#12 §4); disponibile solo dalla fine del run (pit-policy:70–81) |
| Identità squadra/competizione | Va versionata (#12 riga 27; #40 "canonical identity") |
| Mapping degli eventi | Solo VERIFIED come join (#40) |
| Correzioni del provider | Non retroagiscono a T (#40) |
| Schema e data contract | "Stesso data contract version → stesso risultato" (#12 §3) |
| Timestamp di osservazione | Mai inventati (D4) |
| Dati ricostruiti | Non PIT, quindi esclusi o etichettati (D4) |

**Comportamento attuale del codice: A parziale**
- `teamMatchesAsOf` restituisce la versione disponibile a T secondo la lineage (pit-policy:77–78).
- Però seleziona, filtra e ordina sui fatti correnti e marca NON_PIT se qualcosa è cambiato dopo T (pit-policy:66, 102–106).
- Identità squadra (alias) e attivazione dei dataset **non sono versionate** (pit-policy:85, 106; finding R08B-LIMITS).
- `matchAnalysis` usa i fatti correnti con un cutoff solo di data, `PIT_NOT_VERIFIED` (`src/analysis/match-analysis.mjs:5–6, 135, 153–154`).
- MP-FPT-005 e MP-PIT-001/002/005 restano NOT_VERIFIED (#97 c6256304043).

**Cosa resta aperto (D1 residuo)**
- **(i) Correzioni degli esiti (label) nel backtest.**
  - Per il ledger operativo #96 c6011905866 prescrive REVERSAL + nuovo settlement, cioè una logica di tipo B.
  - HIST-01A-01 (OD:61) ammette esiti acquisiti dopo la partita "se final e correttamente collegati".
  - HIST-01B option A (OD:73) esclude gli esiti "prematuri, contraddittori o non verificabili".
  - Nessuna fonte dice quale versione dell'esito usare in un backtest quando il provider corregge un FINAL dopo la prima acquisizione: la prima FINAL valida, l'ultima corretta, o "non certificabile".
- **(ii) Se l'owner vuole anche una vista B** ("ricostruzione con parser e identità correnti") come analisi di ricerca etichettata NON_PIT.

**Alternative per (i)**
- **A1:** esito = ultima versione FINAL validata disponibile alla data di esecuzione del backtest, con la versione registrata nel report.
- **A2:** esito = prima FINAL validata; le correzioni successive producono un report "superseded".
- **A3:** in caso di correzione, l'esito diventa NOT VERIFIED e la scommessa resta esclusa dalle metriche certificate.

**Alternative per (ii)**
- **B-sì:** vista separata, mai certificata.
- **B-no.**

**Raccomandazione tecnica**
- (i): A1, con il pin della versione dell'esito nel report (riproducibilità: stesso T, stesse versioni, stesso risultato) e il segnale "corretto dopo".
- (ii): B-no per ora; il confronto vecchio/nuovo resta strumento di audit.
- Va aggiornato il corpo di #12, che dice ancora OPEN (vedi D5-07).

**Domanda all'owner:** "Le features restano 'come noto a T' (già deciso). Per gli esiti (label) corretti dal provider dopo la prima FINAL, il backtest usa l'ultima FINAL validata (A1), la prima (A2) o la esclude come NOT VERIFIED (A3)? Vuoi anche una vista 'ricostruzione aggiornata' non certificata (B)?"

**Blocca:** HIST-01b, R-09 (replay), R-14 (backtest), REPLAY-CORE e LEDGER-CORE-04 (reversal).

---

### DEC-003 — Perimetro dati: FPT∩TC con TotalCorner sospeso; raccolta FPT attiva su tutto il catalogo

**Fonti**
- OD:8 `OWN-2026-10-06-SCOPE`: "perimeter is the VERIFIED FPT∩TC intersection".
- #20 c6026039140: "MATCHPILOT_SUPPORTED = FUTPYTHONTRADER_SUPPORTED ∩ TOTALCORNER_SUPPORTED".
- AGENTS.md:35 e AGENTS.md:333.
- OD:63 `MP-VPS-ONLY-OPERATIONS-2026-10-21`: "the data perimeter for new FPT data is not yet resolved by the owner".
- `reconciliation-2026-10-21.md:50–53` ("Conflitto aperto (decisione owner)").
- #182 c6326164559 ("conflitto da decidere").
- #179 c6344141373: "FPT collection ACTIVE … 51 datasets refreshed", decisioni t108u/t114u.

**Testo in conflitto:** il perimetro operativo è definito come intersezione con un provider la cui raccolta è sospesa (#20 c6325348096, OD:63). L'intersezione dei **nuovi** dati è quindi indefinita o vuota.

**Comportamento attuale del codice**
- `src/jobs/futpython-sync.mjs` e `src/providers/futpython/{catalog,seasons}.mjs` non applicano alcun filtro FPT∩TC (grep su intersection/overlap/mapping_status senza risultati).
- TC è spento per default (`src/background.mjs:33, 69–71`, PR #186).
- Sulla VPS la raccolta FPT è attiva su 51 dataset (#179 c6344141373), di fatto sull'intero catalogo FPT disponibile.

**Perché non è risolta:** #182 ha sospeso TC senza ridefinire il perimetro. Le attivazioni t108u/t114u non risultano nel registro.

**Alternative**
- **A:** perimetro = tutto il catalogo FPT, finché TC è sospeso. FPT∩TC torna vincolante alla riattivazione di TC.
- **B:** perimetro = l'ultima intersezione VERIFIED nota (mapping TC storico, `migrations/022-tc-competition-mapping.sql`); la raccolta FPT si estende solo a quei campionati.
- **C:** raccolta FPT completa (dati), ma con funzioni operative (segnali, strategie, backtest certificati) limitate a FPT∩TC VERIFIED.

**Conseguenze**
- A amplia l'analisi, ma i dati live e di mercato TC mancano: l'architettura trading-first (AGENTS §14) si riduce al pre-match FPT.
- B riduce la copertura.
- C costa più storage, ma preserva il contratto.

**Raccomandazione tecnica:** C. È coerente con la shared ingestion (#3 c6026194935) e con il contratto, non spreca le richieste FPT già fatte e non richiede modifiche al codice di raccolta.

**Domanda all'owner:** "Con TotalCorner sospeso, il perimetro di MatchPilot è tutto il catalogo FPT (A), l'intersezione VERIFIED storica (B), oppure raccolta FPT completa con funzioni operative limitate a FPT∩TC (C)?"

**Blocca:** #182 P5/P6, R-15, il perimetro di Strategy Lab e backtest, la chiusura del conflitto in reconciliation §2.

---

### DEC-004 — Identità di review e approvazione (P1/A7): self-review di Grok contro la review indipendente D2

**Fonti**
- OD:22 (D2): "Independent review APPROVED may come from an AI reviewer that **did not produce the change**".
- AGENTS.md:109–116 ("il revisore non ha prodotto la modifica"; "vietato simulare o aggirare").
- OD:79 `MP-GROK-AUTONOMOUS-EXECUTION-01` (t103u): "no distinct reviewer identity exists, so Grok performs a rigorous separate review pass … never a formal approval by the same account".
- #97 c6300169769 (owner, 20/10): "No additional GitHub accounts, **no Grok code-review role**".
- OD:59 `MP-GATE-S1S2-FIX`: "zarbopiero963-droid stays the only deploy approver; **no second account**".
- #179 c6326954704 (P1/A7, gravità P0): opzione (a) token bot separato; opzione (b) reviewer distinto con `prevent_self_review`.
- #179 c6337618137: "P1/A7 … blocca S4/S5".
- #184 c6340936419, #186 c6341437770, #189 c6342296199: "autore e revisore coincidono (P1/A7)".

**Testo in conflitto**
- Dal 22/10 le PR #184–#189 sono mergiate con review dello stesso agente e dello stesso account (#97 c6341332738: "Limite dichiarato: review dello stesso account").
- Questo viola la lettera di D2 e di AGENTS §4, che non sono stati modificati.
- Contraddice anche "no Grok code-review role" del 20/10.
- Per il deploy, l'approvatore unico è l'account usato anche dagli agenti: un agente può approvare il proprio deploy (#179 c6326954704).
- L'opzione (b) contraddice "no second account" (OD:59, #97 c6300169769).

**Comportamento attuale**
- `deploy-vps.yml:50–51`: `environment: vps-production`, con l'owner come unico reviewer (OD:72).
- FREEZE=1 sulla VPS è l'unica barriera effettiva (#97 c6325365620).

**Perché non è risolta:** l'owner ha autorizzato t103u come deroga operativa, ma non ha emendato D2 o AGENTS §4 né scelto tra (a) e (b).

**Alternative**
- **A — token bot per gli agenti** (GitHub App o token fine-grained: Contents/PR/Issues in scrittura, Actions in lettura, senza Deployments né Administration). L'owner resta l'unico approvatore dei deploy. Compatibile con "no second account" se un bot o App non è considerato un "account".
- **B — secondo account umano** come reviewer e approvatore, con `prevent_self_review`. Richiede di revocare "no second account".
- **C — accettare permanentemente la self-review con lo stesso account:** si emendano D2 e AGENTS §4 e si dichiara il gate di deploy non certificabile (S4 resta BLOCKED).

**Conseguenze**
- Con C nessun merge è "certificato" nel senso di AUTOMERGE-01 e il gate S4 non si chiude.
- A e B hanno costo nullo (A) o organizzativo (B).

**Raccomandazione tecnica:** A, con revoca del token owner dagli ambienti agente. È l'unica opzione che chiude P1/A7 senza contraddire le decisioni del 20 e del 21/10. Nel frattempo va registrata in AGENTS §4 la deroga t103u, con scopo e scadenza.

**Domanda all'owner:** "Per separare chi esegue da chi approva scegli A (identità bot per gli agenti), B (secondo account umano, revocando 'no second account') o C (self-review permanente, con S4 non certificabile)? E la deroga t103u vale fino a quella scelta?"

**Blocca:** certificazione S4 e S5 (#179); validità delle certificazioni di merge #184–#189 rispetto ad AUTOMERGE-01; GOV-01.

---

### DEC-005 — GOV-01 / MP-OWNER-AUTOMERGE-02-03: riprendere, modificare o archiviare

**Fonti**
- OD:74: "Not-approved proposal … Resuming (realigning) or archiving GOV-01 needs an owner decision".
- #97 c6300169769 (titolo "OWNER DECISION — … — 2026-10-20", "Status: OWNER DECISION RECORDED; IMPLEMENTATION NOT YET VERIFIED").
- #179 c6300172789 ("OWNER GOVERNANCE DECISION … formally recorded").
- #97 c6300321258 ("La policy non è attiva … richiede la tua approvazione").
- Branch `gov-01-merge-policy` b841a06, in conflitto con `main` (#97 c6340604077 §2).
- Checkpoint `GOV-F1` OPEN (CP-20261021T203603Z).

**Testo in conflitto:** il commento dell'owner del 20/10 è presentato come decisione registrata; il registro canonico lo declassa a proposta non approvata. In più, il suo contenuto ("Grok fuori dalla code review", GO owner per collector, Telegram, PIT, backtest e settlement) è stato superato nei fatti da t102u/t103u: Grok ha mergiato #184 (segnali simulati con P/L) e #186 (collector TC) senza un GO per singola PR.

**Comportamento attuale:** vale `merge-gate` con AUTOMERGE-01 (AGENTS.md:88). Il classificatore `merge-class.mjs` non è su `main`.

**Alternative**
- **A:** archiviare GOV-01; AUTOMERGE-01 più la deroga t103u restano la regola.
- **B:** riprendere GOV-01 (riallineamento, PR, review) come policy per classe di impatto, aggiornata a t103u.
- **C:** riprendere solo `merge-facts.mjs` (gate alimentato dai fatti di GitHub), senza la classificazione per file.

**Raccomandazione tecnica:** C subito, perché elimina le dichiarazioni manuali nel merge-gate, il problema emerso con le self-review. La classificazione B si decide dopo DEC-004.

**Domanda all'owner:** "GOV-01 va archiviato (A), ripreso integralmente (B) o solo nella parte merge-facts (C)? Il commento del 20/10 (#97 c6300169769) è una decisione in vigore o una proposta?"

**Blocca:** GOV-01, la policy di merge per classi, la coerenza del registro (D5-04).

---

### DEC-006 — Destino di PR #178 (HIST-01a, motore di backtest offline)

**Fonti**
- OD:61–62: merge "not authorized yet", serve il controllo dei privilegi di mp-deploy da parte di Grok.
- OD:63: "PR #178 untouched unless a new mandate".
- OD:79: Grok, "no changes to #178".
- Checkpoint H-1/H-3 (CP-20261021T203601Z): `dirty` rispetto a `main`.
- #97 c6340604077 §3: "mandato owner → merge di main nel branch".
- #178 c6301636035: CI verde su 57aab63, review di sessione separata APPROVED.

**Conflitto e situazione**
- È l'unica implementazione dell'ammissione PIT, del settlement 1X2 con regola versionata e del report che separa lo stato tecnico dalla certificazione (OD:62).
- Nel frattempo #184 ha introdotto su `main` un secondo percorso di simulazione e settlement più debole (DEC-008), senza riusarla.
- Il deploy path, prerequisito dell'owner, ora è il gate con approvazione manuale e FREEZE (DEC-012).

**Alternative**
- **A:** mandato di riallineamento (merge di `main` nel branch, rigenerazione dei file di registro, CI, review indipendente secondo DEC-004), poi GO di merge.
- **B:** archiviare #178 e riscrivere HIST-01a sopra `main`.
- **C:** congelare #178 finché DEC-007 non fornisce una fonte PIT reale.

**Raccomandazione tecnica:** A. Il codice è revisionato e testato (16/16, mutazioni rilevate) e il merge ora non provoca deploy, grazie a FREEZE e all'environment.

**Domanda all'owner:** "Autorizzi il riallineamento di #178 (A), con un GO di merge separato, oppure la archiviamo (B) o la congeliamo (C)?"

**Blocca:** R-14 (primo spezzone), HIST-01b, la sostituzione del settlement di #184.

---

### DEC-007 — Fonte dei dati PIT per backtest su dati reali (HIST-01b)

**Fonti**
- OD:61 ("option A first: read-only check of whether PostgreSQL and the archives already on the VPS hold pre-match snapshots really acquired before kickoff").
- OD:62 ("wait for Grok SQL and SHA evidence").
- #97 c6298350148: "Non esiste ancora una fonte pre-match PIT ammissibile: le osservazioni pre-match dell'archivio #40 risultano acquisite dopo il kickoff".
- #178, riga 72 ("profilo #40 … tra 80 min e 4 h dopo il kickoff → INSUFFICIENT_PIT_DATA").
- #179 c6344141373: staging FPT `acquired_at` dal 04/10 16:35 al 04/10 20:41 per 161.801 partite tra il 2020-09-11 e il 2026-10-04.

**Situazione**
- L'esito dell'opzione A non è pubblicato come evidenza SQL/SHA.
- I dati FPT storici sono stati acquisiti in blocco il 04/10, quindi quasi nessuna quota pre-match risulta acquisita prima del kickoff.
- TC (prematch con timestamp) è sospeso (OD:63).

**Alternative**
- **A:** solo osservazioni future, cioè snapshot pre-match FPT raccolti dal 22/10 dal worker VPS, con una frequenza adeguata (oggi ogni 6 h, #179 c6344141373). Backtest certificabili solo tra settimane o mesi.
- **B:** riattivare la raccolta prematch TC. Richiede di revocare la sospensione di #182 e una valutazione dei costi (D6).
- **C:** consentire backtest di ricerca NON_PIT etichettati sullo storico, mai "certificati" (D4 lo ammette se "clearly labelled").
- **D:** A e C insieme.

**Raccomandazione tecnica:** D, più la pubblicazione dell'esito dell'opzione A di OD:61. Senza C nessuna funzione di backtest è verificabile su dati reali per mesi.

**Domanda all'owner:** "Per HIST-01b accetti backtest NON_PIT etichettati sullo storico (C) insieme alla raccolta futura di snapshot pre-match (A), oppure solo A, oppure vuoi rivalutare TC prematch (B)? La frequenza FPT di 6 ore è sufficiente per la regola di freschezza delle quote?"

**Blocca:** HIST-01b, la certificazione su dati reali di #34 e R-14, la prova end-to-end di MP-OWNER-FUNCTIONAL-DELIVERY-03.

---

### DEC-008 — Segnali simulati di #184 (`mp-sim-over25-v1`) con P/L su quote non PIT

**Fonti**
- PR #184 (merge `0c084d5`, mandato OD:77).
- `src/signals/simulated.mjs:8–9` (regola), `:48–55` (settlement e P/L stake 1, `odd − 1`).
- `src/jobs/sim-signals.mjs`.
- `src/web/app.js:806, 816, 820` (banner, "P/L simulato", "Fonte: /api/v1/sim/signals …").
- `src/api/v1.mjs:93–100`.
- `src/analysis/match-analysis.mjs:153–154` (`PIT_NOT_VERIFIED`).

**Testo in conflitto**
- OD:61 (HIST-01A-01): "without admissible PIT observations it produces no simulated bets, P/L, ROI or drawdown"; strategia di riferimento solo come oracolo di test.
- OD:79: vieta "invented strategies".
- PR #184: "Regola dimostrativa, non una strategia dell'owner … quote pre-partita archiviate senza verifica del momento di acquisizione … PIT_NOT_VERIFIED".
- AGENTS.md:224–225: strategie e DSL appartengono a #34; settlement e P/L a #99, con le regole di #100.
- D4 (OD:24): i dati non PIT sono "excluded … or clearly labelled". La UI mostra "P/L simulato" senza un'etichetta NON_PIT (`app.js:816`).
- UI-NO-RAW-TEXT (OD:49): `app.js:820` mostra un percorso API in una vista utente.
- t109u ("ROADMAP-STRICT-02") ha fatto rimuovere #187 perché "no approved issue requires" quella funzione. #184 non è stato sottoposto allo stesso controllo (checkpoint CP-20261022T134339Z, RV-G3).

**Comportamento attuale**
- Il job è manuale e rifiuta la modalità production (`sim-signals.mjs:12`).
- Crea lo schema `sim` senza migrazione (`SIM_DDL`, `simulated.mjs:11–29`).
- Settlement Over 2.5 sul punteggio finale salvato quando `result_status = 'FINAL'` (`simulated.mjs:50`): solo flag del provider, contro HIST-01B option A (OD:73), che però si applica formalmente solo a HIST-01b.

**Alternative**
- **A — mantenere** come demo tecnica: etichetta NON_PIT obbligatoria; nascondere o togliere il P/L finché non c'è PIT; rimuovere il testo tecnico; dichiarare la regola "fixture/demo".
- **B — rimuovere** con lo stesso criterio di #187 (t109u) e rifare la funzione sopra HIST-01a (#178) e #34.
- **C — mantenere invariato.** Sconsigliato: viola OD:61 nello spirito e D4 nell'etichettatura.

**Raccomandazione tecnica:** A nel breve (una PR piccola: etichetta e rimozione del P/L), B quando #178 entra in `main`.

**Domanda all'owner:** "La regola `mp-sim-over25-v1` e il suo P/L su quote non PIT restano (A, con etichetta NON_PIT e senza P/L) o vanno rimossi come #187 (B)?"

**Blocca:** la coerenza tra #34 e #99/#100; la certificabilità della pagina `#/segnali`; DEC-006.

---

### DEC-009 — Telegram: solo alert operativi FPT, oppure anche alert di strategia (#34)?

**Fonti**
- PR #189: "decisione t107u/t108u: Telegram in MatchPilot = solo notifiche operative FPT, DATA-02/03/04".
- Checkpoint CP-20261022T134339Z, RV-G3.
- #34 corpo, righe 315–324 ("può generare alert Telegram configurabile") e righe 393–396 (STRAT-PR-09 "Telegram").
- #182 punto 3 (Telegram con test anti-duplicazione).
- OD:79 ("real Telegram" vietato).
- #179 c6344141373: Telegram operativo attivo (DATA-02/03/04).

**Testo in conflitto:** se t108u è una regola di prodotto permanente, annulla STRAT-PR-09 di #34. Se è solo per la fase corrente, il registro non lo dice. Inoltre t107u, t108u, t109u e t114u **non sono nel registro** (D5-01).

**Comportamento attuale:** dopo #189 non esiste codice di messaggi per segnale. Gli alert operativi FPT sono attivi sulla VPS.

**Alternative**
- **A:** regola permanente; si emenda #34 STRAT-PR-09.
- **B:** regola di fase; gli alert di strategia restano in roadmap (#34), dopo Strategy Lab certificato, con GO.
- **C:** alert di strategia solo in-app, mai su Telegram.

**Raccomandazione tecnica:** B, registrando t107u e t108u con il loro ambito.

**Domanda all'owner:** "La regola 'Telegram = solo notifiche operative FPT' (t108u) è permanente (A), vale per questa fase (B), oppure gli alert di strategia vanno solo in-app (C)?"

**Blocca:** #34 STRAT-PR-09, #28 e #29 (alert), DATA-03.

---

### DEC-010 — Retention dei backup VPS

**Fonti**
- OD:70 (OPEN: "Wording and activation to be ratified by the owner").
- #179 c6311242687 (intento dell'owner, "Interpretazione operativa proposta: 14 punti giornalieri").
- #179 c6311390093, riga 618 ("RETENTION POLICY: **APPROVED** · … AUTOMATIC DELETION: DISABLED — OWNER GO REQUIRED").
- #179 c6311668051 (`retention-protect.json` fino al 2026-11-20, "owner approved t92u").
- OD:69 (DR).

**Testo in conflitto**
- Il registro dice "proposta da ratificare"; il commento di Grok dice "POLICY: APPROVED".
- La finestra di 14 giorni è un'interpretazione dell'agente.
- La cartella Drive `staging/` (PG18) ha una retention locale propria, KEEP=7 (#179, riga 610), diversa da 14.
- PG18 è ora il DB definitivo (DEC-011).

**Alternative**
- **A:** 14 giornalieri, copie speciali con scadenza, cestino Drive di 30 giorni.
- **B:** 14 giornalieri più 1 mensile per 3 mesi (protezione da corruzioni scoperte tardi).
- **C:** come A, ma unificando PG18 (oggi KEEP=7) sulla stessa finestra.

**Raccomandazione tecnica:** C, oppure B se il volume (circa 36 MB al giorno) lo consente. Una sola policy per tutti i DB che contengono dati operativi.

**Domanda all'owner:** "Ratifichi 14 restore point giornalieri verificati (A), aggiungi copie mensili (B), e la stessa finestra vale anche per PG18, ora DB definitivo (C)? Autorizzi l'attivazione delle cancellazioni dopo il dry-run?"

**Blocca:** il criterio 4 di MP-OWNER-VPS-DR-PORTABILITY-01 ("retention verificata"), DR PASS.

---

### DEC-011 — DB definitivo (PG18 staging), DR e sequenza di cutover

**Fonti**
- #179 c6344141373 ("Chosen definitive DB: PG18 `matchpilot_staging` … `GRANT SELECT,INSERT,UPDATE,DELETE` … `app.env` `DATABASE_URL` points to staging"; F-3: "Its automatic off-site copy is NOT VERIFIED").
- #179 c6300324718 ("Raccomandazione provvisoria: PG17 come operativo … PG18 resta come staging").
- OD:77 (FUNC-RECOVERY: "no writes to PG17 or PG18 staging").
- OD:69 (DR: "DR is not PASS while a critical component is excluded or NOT VERIFIED").
- OD:63 (#182 P3: "backup/export e restore verificato … prima").
- `reconciliation-2026-10-21.md:144–157` (sequenza proposta: S3 → S4 → DR PG18 → cutover → … → FPT).

**Testo in conflitto**
- Sotto t108u/t114u (non registrate) PG18 staging è diventato il DB di produzione, scritto dal worker FPT e letto dall'app di produzione.
- Questo è avvenuto prima di S3/S4 e del DR di PG18, contro la sequenza proposta e contro la raccomandazione del 20/10 (PG17).
- La copia offsite automatica di PG18 non è verificata.

**Alternative**
- **A:** ratificare PG18 come DB definitivo e prescrivere subito un backup offsite cifrato e una prova di restore cross-machine (criteri 4–6 di OD:69) come priorità P0.
- **B:** tornare a PG17 come operativo (raccomandazione del 20/10), migrando i dati.
- **C:** sospendere la raccolta FPT finché il DR di PG18 non è PASS.

**Raccomandazione tecnica:** A. B comporta una migrazione e un rischio maggiori; C ferma un servizio che funziona.

**Domanda all'owner:** "Confermi PG18 `matchpilot_staging` come DB di produzione (A), con DR PG18 obbligatorio come prossimo passo prima di qualunque altro lavoro operativo, oppure preferisci PG17 (B) o la sospensione della raccolta (C)? Puoi registrare il testo di t108u e t114u?"

**Blocca:** DR PASS, #182 P3 e P4, il cutover, i finding F-3 e F-4.

---

### DEC-012 — Sblocco del percorso di deploy VPS (S3/S4, FREEZE, run in sospeso)

**Fonti**
- OD:54–58 (gate di approvazione).
- OD:72 (environment).
- #97 c6325365620 ("Gate NON certificato … la sola barriera tecnica è il FREEZE"; run 39635669968 obsoleto, azione owner).
- #97 c6341332738, c6341681530, c6342030067, c6342716999: run `deploy-vps` per `0c084d5`, `7b4baf7`, `34da37b`, `39fe08e` "in attesa (FREEZE=1, azione owner)".
- #179 c6337618137 (v3.1-r2: "NON READY FOR GO-S3"; serve una review indipendente).
- #179 c6344141373, F-4 (worker FPT su `3dd833f`).

**Situazione**
- In produzione gira la release `3dd833f`, mentre `main` è a `39fe08e`.
- Ogni merge accoda un run che resta in attesa.
- La certificazione del gate dipende da DEC-004.

**Alternative**
- **A:** sequenza review v3.1-r2 → GO-S3 → GO-S4 (dopo DEC-004) → sblocco del FREEZE → approvazione del deploy di `main`.
- **B:** deploy manuale e supervisionato di un singolo SHA con FREEZE rilasciato temporaneamente, prima di S3/S4.
- **C:** restare su `3dd833f` finché S4 non è PASS.

**Raccomandazione tecnica:** A. B riapre la superficie che il gate deve chiudere. C accumula divergenza: oggi è innocua, perché le differenze tra `3dd833f` e `39fe08e` non toccano il codice FPT (#179 c6344141373, punto 2).

**Domanda all'owner:** "Confermi la sequenza A (review v3.1-r2, GO-S3, GO-S4 dopo la scelta su P1/A7)? E chi rifiuta il run obsoleto 39635669968 e i run accodati?"

**Blocca:** il rilascio di qualunque PR in produzione, #182 P2 e P4, F-4.

---

### DEC-013 — Default del Money Management non fissati dall'owner

**Fonti**
- #96 c6011905866 ("Configurazione richiesta: SHARED_ACCOUNT_BANKROLL oppure SEGREGATED_PROFILE_BANKROLL … Non mischiare implicitamente"; "VOID: policy configurabile/documentata per step progression; **default esplicito**"; "Usare settings snapshot #95 valido al momento definito dalla policy").
- #96 corpo, "Priorità deterministica".

**Situazione:** le issue richiedono default espliciti, ma nessuno è stato scelto:
- modalità del bankroll;
- VOID e PUSH nelle progressioni;
- istante dello snapshot della commissione: intent, match o settlement.

Nessun codice esiste ancora.

**Alternative**
- **Bankroll:** SHARED (default) oppure SEGREGATED.
- **VOID:** "step invariato" (default) oppure "reset".
- **Commissione:** snapshot al momento del match/fill oppure al settlement.

**Raccomandazione tecnica:**
- bankroll SHARED come default, con SEGREGATED selezionabile;
- VOID = step invariato;
- commissione = snapshot al matched (riproducibile e coerente con il backtest congelato).

**Domanda all'owner:** "Confermi questi tre default: bankroll SHARED, VOID che lascia invariata la progressione, commissione presa al momento del match?"

**Blocca:** MM-CORE-01..08 e LEDGER-CORE-02 (non urgente: domini non avviati).

---

### DEC-014 — Dismissione di Render e Neon ed export grezzo Neon

**Fonti**
- OD:63 ("their accounts and data are not deleted until backup, export, readback and restore are verified and the owner authorizes it").
- #179 c6300324718, punto 6 ("Decisione owner sull'export grezzo `/root/neon-export/x-*`").
- #87 (confronto dei costi Render/Railway, superato).

**Situazione:** il costo ricorrente e la conservazione dei dati restano aperti. Non è chiaro se l'export Neon grezzo sulla VPS vada tenuto (dati e spazio) o eliminato.

**Alternative**
- **A:** conservare l'export cifrato offsite ed eliminare la copia grezza in chiaro.
- **B:** conservarlo invariato.
- **C:** dismettere Render e Neon dopo un restore verificato.

**Raccomandazione tecnica:** A, poi C dopo la verifica del DR (DEC-011).

**Domanda all'owner:** "L'export grezzo Neon sulla VPS va cifrato e spostato offsite, con eliminazione della copia in chiaro (A), o conservato (B)? Quando autorizzi la dismissione di Render e Neon (C)?"

**Blocca:** la chiusura di #179, i costi residui di Render e Neon.

---

## 2. D2 — Già risolte (con fonte)

| ID | Tema | Risolta da |
|---|---|---|
| D2-01 | WeWeb: non approvato | OD:7; AGENTS:242 la elenca ancora come OPEN (D5-03) |
| D2-02 | Solo calcio; altri sport solo su richiesta | OD:8; #20 c6025858559 |
| D2-03 | BetsAPI non core, nessun acquisto | `docs/provider-trial-final-closure-2026-10-08.md:365` |
| D2-04 | Execution reale ed Exchange #45 esclusi | OD:41 (`MP-OWNER-EXCLUDE-REAL-EXECUTION-01`) |
| D2-05 | ML pesante (#132) fuori scope | OD:11 (MATH) |
| D2-06 | PIT per replay e backtest certificati = "come noto a T" | OD:24 (D4); #40; #97 c6254329652 |
| D2-07 | HIST-01b: freschezza delle quote configurabile; FINAL dopo validazione | OD:73; #97 c6301851779, c6301856737 |
| D2-08 | Render e Neon esclusi; `render.yaml` `autoDeploy:false` | OD:63; AGENTS:353 |
| D2-09 | TotalCorner sospeso e spento per configurazione | OD:63; PR #186 (`src/background.mjs:33`) |
| D2-10 | Solo l'owner chiude le issue; `Refs #` | OD:14, OD:18 |
| D2-11 | CI gate required check verificato | OD:44 |
| D2-12 | Login owner (D12); migrazioni guardate (D13) | OD:35, OD:36; README:111 |
| D2-13 | HARD OFFLINE senza Render/Neon | OD:25 (D5) |
| D2-14 | Archivio #40 in sola lettura; #40 e #20 restano OPEN | OD:27, OD:29 |
| D2-15 | Identità visiva D-1..D-7; nessun testo tecnico nella UI | OD:45, OD:49 |
| D2-16 | Agenti intercambiabili; scrittore unico per risorsa | OD:64; AGENTS:158–168 |
| D2-17 | Approvazione manuale del deploy (environment `vps-production`) | OD:54, OD:72; `deploy-vps.yml:51` |
| D2-18 | Requisito DR e portabilità (standing) | OD:69 |
| D2-19 | AUTOMERGE-01 resta la regola base | OD:19, OD:74 |
| D2-20 | Rimozione di SIM-OUTBOX (#187) e chiusura di #188 | t108u, eseguita con #189 (`39fe08e`); da registrare (D5-01) |
| D2-21 | Math baseline deterministica | OD:11 |

## 3. D3 — Tecniche delegabili (non serve una decisione di prodotto)

| ID | Tema | Fonte | Nota |
|---|---|---|---|
| D3-01 | Parametri PIT scelti dall'agente: tolleranza 5 min, validità dell'offset 30 giorni, range UTC−12..+14 | `docs/pit-policy.md:87–95` ("PROPOSAL") | default non approvato ma versionato `mp-pit-v1`; conviene una presa d'atto dell'owner |
| D3-02 | Tetto quote 1.000.000 | checkpoint NB-ODDS-CAP (CP-20261019T074500Z, "awaiting owner confirmation") | parametro di validazione |
| D3-03 | Storico per versione dello stato dei match TC (migrazione) | `pit-policy.md:109`; NB-TC-HISTORY | oggi coperto da D13; utile solo alla riattivazione di TC |
| D3-04 | Indice su `fpt_match_facts(acquired_at)` | `pit-policy.md:104`; NB-CHANGED-SCAN | prestazioni |
| D3-05 | Versioning di identità squadra e attivazione dataset (MP-FPT-005) | `pit-policy.md:85, 106` | implementa D2-06 |
| D3-06 | Triage esplorativo come gate | QA03-3 (CP-20261019T165601Z) | FUNCTIONAL-DELIVERY-03: niente nuovi gate senza un bisogno dimostrato |
| D3-07 | Bind host e esposizione | `src/server.mjs:188`; #179 riga 524 (porta 3000 solo su tailscale0) | mitigato |
| D3-08 | Regola sudo `mpdeploy` (F1) | #179 c6337618137 | richiede un GO VPS, ma tecnico |
| D3-09 | Riavvio del worker dopo il deploy (F-4) | #179 c6344141373 | `mp-deploy` riavvia solo l'app |
| D3-10 | Schema checkpoint senza stato REVERTED/CLOSED | CP-20261022T134339Z RV-G1 | estensione dello schema |
| D3-11 | Test reale dell'handoff Claude→Grok→Claude (HANDOFF-TEST-01) | OD:31 (D11), OD:64; #97 c6336455419 | esecuzione, non decisione |
| D3-12 | Approvazione dei workflow da fork (repository pubblico) | checkpoint VPS-1 | impostazione GitHub da applicare |
| D3-13 | Duplicati di `provider_match_id` (A-1) | #179 c6344141373 | qualità dati |

## 4. D4 — Non più applicabili

| ID | Tema | Motivo |
|---|---|---|
| D4-01 | R-04 Q1, nomi delle variabili Render (#23 c6255484605) | Render escluso (OD:63) |
| D4-02 | R-04 Q2 e opzioni a/b/c migrazioni-autoDeploy (#97 c6256304043) | risolte da D13 (OD:36) e da `autoDeploy:false` |
| D4-03 | #87 confronto Render vs Railway | VPS-only |
| D4-04 | Urgenza TC e scadenza della membership 11/10 (#97 corpo, righe 18 e 26) | TC sospeso |
| D4-05 | Finestra sicura #40 e punti 10–17 del trial | trial chiuso (`docs/provider-trial-final-closure-2026-10-08.md`); #40 resta per la verifica (D9) |
| D4-06 | OWN-2026-10-07-GOV125 (merge vietato) | SUPERSEDED (OD:12) |
| D4-07 | MP-ENTERPRISE-GATE-AB-WEB-SIM-01 | SUPERSEDED da D3 (OD:16) |
| D4-08 | MP-GATE-S1S2-FIX e PR181-HARDENING, clausola "without merge" | superate da OD:66 |

## 5. D5 — Conflitti documentali

| ID | Conflitto | Fonti | Azione proposta |
|---|---|---|---|
| D5-01 | Decisioni owner **non registrate** e usate come autorizzazione: t100u, t107u, t108u, t109u (`MP-GROK-AUTONOMOUS-ROADMAP-STRICT-02`), t114u (attivazione FPT e Telegram, DB definitivo) | PR #184, #189; CP-20261022T134339Z; #179 c6344141373 | registrarle in `owner-decisions.json` con il testo dell'owner |
| D5-02 | 54 decisioni su 73 hanno un testo "transcribed by the agent" o "wording pending" (#152 N-5) mai ratificato | registro | ratifica in blocco su #150 |
| D5-03 | AGENTS §8, lista "OPEN": include WeWeb, BetsAPI e execution, già decisi | AGENTS:240–245 contro OD:7, OD:41 | riallineare |
| D5-04 | #97 c6300169769 "OWNER DECISION RECORDED" contro il registro "not-approved proposal" | OD:74 | vedi DEC-005 |
| D5-05 | AGENTS §12: "Ogni merge su `main` avvia questo deploy" contro il gate di approvazione e il FREEZE | AGENTS:360; OD:54; #97 c6341332738 | aggiornare AGENTS §12 |
| D5-06 | AGENTS §2: FPT e TC "feed core", perimetro FPT∩TC, contro la sospensione di TC | AGENTS:35; OD:63 | dipende da DEC-003 |
| D5-07 | Corpo di #12 (riga 27) e corpo di #97 (riga 58): PIT "OPEN", contro D4 registrata come superseding | OD:24 | nota nel corpo (lo modifica l'owner) |
| D5-08 | Corpi di #97 e #3 fermi al 07/10 ("prossima azione PR #125") | #97 c6326159427, c6340604077 | aggiornamento a cura dell'owner |
| D5-09 | AGENTS §4 (indipendenza del revisore) non riflette la deroga t103u | AGENTS:109–116; OD:79 | vedi DEC-004 |
| D5-10 | FUNC-RECOVERY "no writes to PG18 staging" (OD:77) contro le scritture del worker su PG18 | #179 c6344141373 | superata da t114u non registrata (D5-01) |
| D5-11 | Retention "POLICY: APPROVED" (#179) contro OPEN (OD:70) | — | vedi DEC-010 |
| D5-12 | `parallel_tasks` di OD:79 elenca SIM-OUTBOX-01 (revertita) | OD:79; PR #189 | annotazione storica |
| D5-13 | README:182 e AGENTS:235 sullo STOP, contro #99 c6012586884 e #102 c6012585864 | — | vedi DEC-001 |

## 6. Conteggi

- **D1:** 14 (DEC-001…DEC-014).
- **D2:** 21.
- **D3:** 13.
- **D4:** 8.
- **D5:** 13.
