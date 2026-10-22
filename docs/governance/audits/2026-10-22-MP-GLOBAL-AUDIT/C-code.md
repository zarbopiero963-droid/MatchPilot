# C — CODE REALITY REPORT, MatchPilot `main` @ `39fe08e`

- **Data:** 2026-10-22.
- **Modalità:** audit in sola lettura. Checkout `audit-main`, `node_modules` collegato al clone di lavoro.
- **Cosa non è stato fatto:** nessuna modifica a file tracciati, nessun commit, nessuna scrittura su GitHub, nessun accesso alla VPS, nessun segreto stampato.
- **Legenda delle evidenze:**
  - **VERIFICATO**: eseguito o letto in questa sessione;
  - **DICHIARATO**: riportato da un agente o dall'owner su GitHub e non riverificabile da qui.

---

## 1. Entry point e raggiungibilità dei moduli

### 1.1 Entry point

| Entry point | Cosa fa | Rif. |
|---|---|---|
| `npm start` → `src/server.mjs` | `assertRuntimeSafety()` → `migrate()` → `startBackgroundServices()` (non bloccante) → auth gate → server HTTP | `src/server.mjs:35-43`, `:188` |
| `src/background.mjs` | Servizi di background. Partono solo se `mode==='production'` **e** `MATCHPILOT_BACKGROUND_ENABLED==='true'` | `src/background.mjs:48-53`, `src/runtime-safety.mjs:45` |
| `npm run migrate` → `src/migrate.mjs` | Migrazioni sotto advisory lock, con guard D13 | `src/migrate.mjs:12-24`, `:63-135` |
| Script CLI in `package.json` | `sync:futpython`, `backfill:futpython`, `verify:futpython:p1`, `classify:futpython:p2`, `audit:futpython:p3/p4/p5/p6/p8`, `certificate:futpython`, `sim:signals`, `auth:hash-password`, `qa:*`, `governance:*` | `package.json:6-36` |
| CLI senza script npm | `src/jobs/futpython-onboarding.mjs` e `src/jobs/futpython-reprocess.mjs` ("One-off owner command") | intestazioni dei file |

**Valori predefiniti di `src/runtime-safety.mjs`:**
- `MATCHPILOT_RUNTIME_MODE` vale `offline` se non è impostato (`:8`).
- In `offline` e `test` un `DATABASE_URL` non locale viene rifiutato (`:42-44`).
- Il background è **spento sempre**, tranne con `production` + `MATCHPILOT_BACKGROUND_ENABLED=true` (`:45`).
- Conseguenza: in produzione il background è OFF per default, in offline/test è OFF senza eccezioni.

### 1.2 Raggiungibilità

Il grafo degli import è stato calcolato con lo script `scratchpad/reach.mjs` partendo da `src/server.mjs`.

**Raggiungibili dal server (52 file):**
- `alerts`, `analysis/match-analysis`, `api/v1`, `auth/*`, `background`, `coverage-page`, `db`;
- `futpython-certificate`, `futpython-certification`;
- `jobs/data-watchdog`, `futpython-certify-phase1`, `futpython-cron`, `futpython-sync`;
- `jobs/totalcorner-{discovery,historical,live,mapping,prematch}`;
- `lib/csv`, `math/{core,decimal}`, `migrate`, `pit/{policy,readers}`;
- tutto `providers/futpython/*` tranne `reprocess`;
- tutto `providers/totalcorner/*`;
- `runtime-safety`, `signals/simulated`, `web/static`.

`src/web/app.js` non è importato, ma è servito come asset statico (`src/web/static.mjs:139-146`), quindi è raggiungibile.

**Non raggiungibili dal server, solo CLI o test (12 file):**
- `src/jobs/futpython-audit-phase{3,4,5,6,8}.mjs`;
- `src/jobs/futpython-certificate.mjs` e `src/futpython-certificate-md.mjs`;
- `src/jobs/futpython-classify-phase2.mjs`, `futpython-onboarding.mjs`, `futpython-reprocess.mjs`;
- `src/providers/futpython/reprocess.mjs`;
- `src/jobs/sim-signals.mjs`.

Nessun file sorgente risulta orfano: ognuno ha un entry point CLI o un test.

**Moduli non coperti da `npm run check` (8):**
- `jobs/futpython-onboarding`, `jobs/futpython-audit-phase4`, `jobs/futpython-reprocess`;
- `providers/futpython/{reconciliation,onboarding,lock,reprocess}`;
- `analysis/match-analysis`.

Tutti, tranne i tre job CLI, sono raggiungibili a runtime.

### 1.3 Moduli per area

| Area | Raggiungibile a runtime? | Flag che lo governano (solo nomi) | Produzione / offline |
|---|---|---|---|
| **Web app** (`src/web`) | Sì, `GET /`, `/assets/*` (`static.mjs:139-160`) | nessuno | Sempre servita. Viste `''/board`, `search`, `match`, `segnali` (nascosta, fuori dal menu), `data`, `providers`, `endpoints` (`app.js:823-827`) |
| **API v1** (`src/api/v1.mjs`) | Sì, tutto `/api/v1/*` (`server.mjs:69-79`) | `MATCHPILOT_CODE_VERSION` | 32 endpoint, tutti GET, sola lettura (`v1.mjs:77-119`, `:200`) |
| **Auth** (`src/auth`) | Sì. `createAuthGate` restituisce `null` se `MATCHPILOT_AUTH=off` (`http.mjs:65`) | `MATCHPILOT_AUTH`, `MATCHPILOT_OWNER_USERNAME`, `MATCHPILOT_OWNER_PASSWORD_HASH`, `MATCHPILOT_OWNER_PASSWORD` (rifiutato), `MATCHPILOT_SESSION_TTL_MINUTES`, `MATCHPILOT_SESSION_IDLE_MINUTES`, `MATCHPILOT_COOKIE_SECURE`, `MATCHPILOT_TRUST_PROXY`, `MATCHPILOT_AUTH_FAILURE_SPIKE`, `MATCHPILOT_AUTH_AUDIT_KEY` | **OFF per default in ogni modalità** (`owner-auth.mjs:70`). Con `enforce` tutte le route tranne `/healthz`, `/login`, `/auth/*` richiedono la sessione owner (`owner-auth.mjs:144`). Serve la migrazione 029 |
| **FutPythonTrader**: client, budget, ledger, store, sync, cron | Sì: cron e watchdog nel background, query nelle route | `FUTPYTHON_API_KEY`, `FUTPYTHON_BASE_URL`, `FUTPYTHON_CRON_ENABLED`, `FUTPYTHON_CRON` (predefinito `17 */6 * * *`), `FUTPYTHON_CRON_TZ` (Europe/Rome), `FUTPYTHON_REQUESTS_PER_*`, `FUTPYTHON_BACKOFF_*`, `FUTPYTHON_CIRCUIT_*`, `FUTPYTHON_MAX_ATTEMPTS`, `FUTPYTHON_ONBOARDING_PER_RUN`, `FUTPYTHON_SYNC_DELAY_MS`, `FUTPYTHON_RECON_CATCHUP`, `FUTPYTHON_DB_BATCH_SIZE`, `FUTPYTHON_BACKFILL_ON_START`, `FUTPYTHON_PHASE1_VERIFY_ON_START`, `FUTPYTHON_RESUME_DRILL_*` | Produzione + background: il cron parte se c'è la chiave e `FUTPYTHON_CRON_ENABLED!=='false'` (`futpython-cron.mjs:7-10`). Offline: mai |
| **TotalCorner**: 6 provider e 5 job | Codice raggiungibile. Job avviati solo se `tcEnabled` (`background.mjs:33`, `:70-72`). I reader (report sul DB) restano esposti come route | `MATCHPILOT_TOTALCORNER` (deve valere esattamente `on`), `TOTALCORNER_API_TOKEN`, `TOTALCORNER_{DISCOVERY,MAPPING}_ON_BOOT`, `TOTALCORNER_{PREMATCH,HISTORY,LIVE}_ENABLED`, più intervalli e limiti | **OFF dopo #186** (`7b4baf7`): nessun job TC parte senza `MATCHPILOT_TOTALCORNER=on`; ogni altro valore è OFF. Offline: mai. Le route `/api/tc/*` e `/api/v1/tc/*` leggono solo il DB e non fanno chiamate upstream (`v1.mjs:69`) |
| **Segnali** (`src/signals/simulated.mjs`) | Lettura raggiungibile da `GET /api/v1/sim/signals` (`v1.mjs:94-101`) e dalla vista `#/segnali`. La scrittura (`runForDate`) è solo CLI (`jobs/sim-signals.mjs`) | nessun flag. La CLI rifiuta `mode=production` (`sim-signals.mjs:12`) | Vedi §3.2 |
| **Analisi** (`src/analysis/match-analysis.mjs`) | Sì, `/api/v1/fpt/match-analysis` (`v1.mjs:88-92`) e i segnali | nessuno | Sempre etichettata `PIT_NOT_VERIFIED` (`match-analysis.mjs:5-6`); cutoff = giorno della partita |
| **Math** (`src/math`) | Sì, tramite analisi e segnali | nessuno | Solo Decimal e contratti; nessuna logica di trading |
| **PIT** (`src/pit`) | Sì: `readers.mjs` è usato da `query.mjs:5` e `totalcorner-prematch.mjs:6`; `policy.mjs` da `readers` | nessuno | Classificazione delle versioni ed etichette PIT |
| **hist** | **Non esiste** su `main` (HIST-01a è la PR #178, non mergiata) | — | — |
| **Alert e Telegram** (`src/alerts.mjs`) | Sì, tramite background e watchdog | `MATCHPILOT_TELEGRAM_BOT_TOKEN`, `MATCHPILOT_TELEGRAM_CHAT_ID`, `MATCHPILOT_ALERT_WEBHOOK_URL`, `MATCHPILOT_ALERT_COOLDOWN_MINUTES` | Solo alert operativi sui dati; nessun segnale va mai su Telegram (il codice outbox di #187 è stato rimosso da #189) |
| **Watchdog** | Sì | `DATA_WATCHDOG_ENABLED`, `DATA_WATCHDOG_INTERVAL_MS` (3.600.000), `FUTPYTHON_STALE_HOURS` | Produzione + background |
| **Server** | — | `PORT`, `MATCHPILOT_BIND_HOST` (introdotto in #184; predefinito `0.0.0.0`), `DB_POOL_MAX` | — |

### 1.4 Migrazioni

- **Quante:** 29 file, da `001-futpython-mirror.sql` a `029-owner-auth.sql`. 001–020 riguardano FPT, 021–028 TotalCorner, 029 l'auth owner.
- **Guard D13** (`src/migrate.mjs:12-24`):
  - in `production` si applica solo il prefisso delle pendenti elencate in `MATCHPILOT_APPROVED_MIGRATIONS`, e ci si ferma alla prima non approvata (`held`);
  - in `offline` e `test` si applica tutto.
- **Nessun elenco di approvazioni nel repository:** la decisione è solo nella variabile d'ambiente. `runtime-safety.mjs` non contiene liste di migrazioni.
- **Nessuna migrazione tra `3dd833f` e `39fe08e`** (VERIFICATO con `git diff --stat`).
- **Stato sulla VPS (DICHIARATO, #179 commento 6344141373, Grok, 22/10):** "All three DBs have the same 29 migrations, 001 → 029". Nessuna è quindi `held` sui database dichiarati.
- **Osservazione di rischio (DICHIARATO + codice):**
  - Grok dichiara che l'app VPS gira con mode `offline` e `DATABASE_URL` sul DB definitivo PG18 `matchpilot_staging`.
  - In `offline` il guard D13 **non** si applica (`migrate.mjs:21`): al riavvio, una futura migrazione verrebbe applicata al DB definitivo senza approvazione.
  - Il worker invece gira in `production` (DICHIARATO).
- **Schema fuori dalle migrazioni:** `sim.signals` è creato a runtime dalla CLI (`SIM_DDL`, `simulated.mjs:11-29`, `:58`):
  - schema fisso `sim`, che ignora `search_path`;
  - nessun file di migrazione, nessun guard D13;
  - la CLI accetta qualunque DB locale in `offline`, quindi anche il DB definitivo della VPS se configurato così.

---

## 2. Inventario delle route HTTP e dei job

### 2.1 Route HTTP

**Totale: 7 route di servizio, 32 endpoint v1, 32 route legacy (33 voci di inventario meno `/healthz`), 8 asset statici, 4 route auth.**

Sono tutte **in sola lettura**, tranne `/auth/login` e `/auth/logout` (che scrivono sessioni e audit) e `migrate()` all'avvio.

**Auth:**
- con `MATCHPILOT_AUTH=off` (predefinito) è tutto aperto;
- con `enforce` serve la sessione owner ovunque, tranne `/healthz` e le route di login.

| Metodo | Path | Handler | R/W | Auth (`enforce`) |
|---|---|---|---|---|
| GET/HEAD | `/`, `/assets/app.js`, `/assets/app.css`, 4 × `/assets/fonts/*.woff2` (7 asset) | `serveWeb` (`static.mjs:149`); 405 sugli altri metodi | R | owner |
| GET | `/login` | `http.mjs:96` | R | pubblica (solo se `enforce`; con `off` → 404) |
| GET | `/auth/session` | `http.mjs:101` | R | pubblica |
| POST | `/auth/login` (form o JSON, same-origin) | `http.mjs:108-139` | **W** (sessione, rate limit, audit) | pubblica |
| POST | `/auth/logout` | `http.mjs:115` | **W** | pubblica |
| GET | `/api/v1/*`: 32 endpoint, elenco sotto | `handleV1` (`v1.mjs:195`); 405 se non GET | R | owner |
| GET | 21 × `/api/fpt/*` legacy (`query.mjs:734-756`) | `runQuery` (`server.mjs:139-154`); 405 se non GET | R | owner |
| qualsiasi | 7 × `/api/tc/*` legacy | `server.mjs:95-118`, **nessun controllo del metodo** | R | owner |
| qualsiasi | `/api/futpython-certificate` | `certificateReport()` (`server.mjs:85-92`), cache di 15 minuti. La prima richiesta avvia la **costruzione completa del certificato** (`futpython-certificate.mjs:887-898`) | R (lettura pesante) | owner |
| GET (match esatto su `req.url`) | `/api/futpython-certification`, `/api/data-health` | `server.mjs:156-176`. Il match su `req.url` fa sì che una query string dia 404 | R | owner |
| GET | `/coverage` (HTML) | `server.mjs:120-137` | R | owner |
| qualsiasi | `/healthz` | `server.mjs:178-181` | R | **sempre pubblica** |

**Endpoint v1 (32, VERIFICATO enumerando `createEndpoints`):**
- **Servizio:** `health`, `endpoints`, `providers`.
- **FPT, 20, dal `QUERY_CATALOG`:** `teams`, `team-matches`, `away-matches`, `odds-range`, `search`, `xg-by-season`, `team-matches-asof`, `league-field-coverage`, `leagues-with-coverage`, `team-summary`, `h2h`, `competition-season`, `matches`, `match`, `competitions`, `filters`, `onboarding`, `coverage-competitions`, `coverage-seasons`, `reconciliation`.
- **Analisi e segnali:** `fpt/match-analysis`, `sim/signals`.
- **TotalCorner, 7:** `tc/discovery`, `schema-registry`, `mapping`, `prematch`, `prematch/match`, `historical`, `live`.

**Route legacy (`legacyInventory`, `v1.mjs:123-130`):**
- 30 DEPRECATED, con header `Deprecation` e `Link` successor (`server.mjs:80-83`);
- 3 KEPT: `/api/futpython-certificate`, `/healthz`, `/coverage`.

### 2.2 Job

**Background** (solo `production` + `MATCHPILOT_BACKGROUND_ENABLED=true`; `background.mjs:48-81`):

| # | Job | Trigger | Gating |
|---|---|---|---|
| 1 | FPT sync incrementale | Croner `17 */6 * * *` Europe/Rome, `protect:true` (`futpython-cron.mjs:13`) | chiave e `DATABASE_URL`; `FUTPYTHON_CRON_ENABLED` |
| 2 | Data watchdog: staleness, alert, riconciliazione dei gap, catch-up sync | `setTimeout` 30 s, poi `setInterval` di 1 h (`data-watchdog.mjs:174-186`) | `DATA_WATCHDOG_ENABLED` |
| 3 | Setup Telegram outbound-only (`deleteWebhook`) e test di connettività una tantum | all'avvio (`background.mjs:57-60`, `alerts.mjs:172-199`) | token e chat id |
| 4 | Verifica di fase 1 | all'avvio | `FUTPYTHON_PHASE1_VERIFY_ON_START=true` |
| 5 | Backfill FPT | all'avvio | `FUTPYTHON_BACKFILL_ON_START=true` |
| 6–10 | TotalCorner: discovery e mapping (una volta al boot), prematch (`setInterval` ≥ 60 s, predefinito 300 s), historical (≥ 120 s, predefinito 600 s), live (poll ≥ 15 s, predefinito 60 s) | — | `MATCHPILOT_TOTALCORNER=on`, token, flag per job. **OFF per default** |

**CLI (13):**
- `futpython-sync` (incremental o `--backfill`);
- `certify-phase1`, `classify-phase2`, `audit-phase3/4/5/6/8`, `futpython-certificate`;
- `futpython-onboarding`, `futpython-reprocess`;
- `sim-signals`, `migrate`.

---

## 3. Duplicazioni, percorsi simulati, marcatori

### 3.1 Implementazioni duplicate

1. **Due superfici API parallele**: 30 route legacy deprecate e gli endpoint v1, sugli stessi reader.
   - La mappa dei reader TC è scritta due volte: `TC_READERS` (`server.mjs:25-30`) e la catena di ternari (`server.mjs:95-109`).
   - Si comportano in modo diverso:
     - la legacy `schema-registry` non ha il limite predefinito di 2000;
     - le legacy TC non controllano il metodo;
     - `/api/futpython-certification` e `/api/data-health` fanno match su `req.url` invece che su `pathname`.
2. **Copertura in due posti**: la pagina HTML `/coverage` (`coverage-page.mjs`) e la vista `#/data` della web app (via `/api/v1/fpt/coverage-*`).
3. **Certificato e certificazione FPT** in due moduli distinti: `futpython-certificate.mjs` (904 righe, report completo) e `futpython-certification.mjs` (stato).
4. **Redazione dei segreti** copiata in almeno 6 punti con regex diverse (`api_key=`, `bot…`, `postgres://`).
5. **`/api/v1/providers`** passa `client` a `getDataHealth()`, che lo ignora e apre una propria connessione (`v1.mjs:84`, `alerts.mjs:145-146`).

### 3.2 Codice simulato raggiungibile in produzione

**`GET /api/v1/sim/signals` e vista `#/segnali` (#184, `0c084d5`):**
- sono raggiungibili da qualunque istanza del server, produzione compresa;
- in sola lettura restituiscono `mode: SIMULATION`; se lo schema `sim` manca, la risposta è vuota (`simulated.mjs:81-84`);
- la vista **non è nel menu** (rimossa per non rompere le baseline di Browser QA, checkpoint `CP-20261022T123735Z`); si raggiunge solo con `#/segnali`.

**Regola `mp-sim-over25-v1` (`simulated.mjs:8-9`):**
- media dei tassi Over 2.5 delle ultime 10 partite, casa e trasferta, almeno 0,60, con N ≥ 10;
- la decisione usa Decimal (`:43-45`);
- **il settlement e il P/L usano aritmetica float**: `Number(odd)`, `(odd-1).toFixed(2)` e la somma in `Number` (`:52-54`, `:98`), in contrasto con la regola Math Core dichiarata nel commento.
- La quota usata è `odd_over25` del fatto memorizzato: non c'è prova che fosse nota prima della partita, e l'analisi è `PIT_NOT_VERIFIED`.

**#187 e #189:**
- #187 (`34da37b`) aveva aggiunto `src/signals/outbox.mjs`, con messaggi Telegram simulati mai inviati;
- #189 (`39fe08e`) lo ha **rimosso per intero** (`outbox.mjs` −53, test −31, `app.js` −3);
- su `main` non resta traccia dell'outbox (VERIFICATO).

**Copertura dei test dei segnali** (`test/sim-signals.test.mjs`): 3 test unitari puri su `decide` e `settle`. Non coprono:
- `runForDate`, `listSignals`, `/api/v1/sim/signals`;
- la vista `#/segnali`;
- il DDL `sim`.

**Smoke test eseguito in questa sessione** (`scratchpad/simsmoke.mjs`):
- **Cosa:** schema PG16 usa e getta, migrazioni 001–029, archivio QA, `runForDate` sull'ultima data e `handleV1`.
- **Esito:** 3 partite, **0 SIGNAL**, 3 `INSUFFICIENT_DATA`; API 200, `mode SIMULATION`.
- **Cosa dimostra:**
  - sui fixture la pipeline funziona, ma **non può produrre un segnale**;
  - il ramo SIGNAL e HIT/MISS è provato solo dagli unit test puri;
  - con dati reali c'è solo la dichiarazione di Grok: "VPS functest 2026-09-19: 331 partite, 134 SIGNAL, 81 HIT, 53 MISS" (checkpoint `CP-20261022T123735Z`, DICHIARATO).
- **Pulizia:** schema e `sim` rimossi.

**Altri stub o mock in produzione:** nessuno trovato in `src/`. Le occorrenze di "placeholder" riguardano la gestione delle quote 0 del provider come N/D (`query.mjs:715`, `schema.mjs:50`).

### 3.3 Marcatori TODO, FIXME, NOT IMPLEMENTED

- **`src/`:** 0 reali. L'unico match è "XXX" dentro un testo esplicativo (`futpython-certificate.mjs:781`).
- **`tools/` e `test/`:** 0.
- **Le lacune funzionali non sono marcate nel codice:** sono dichiarate in `docs/governance/certifiability-matrix.md` come FAIL o BLOCKED (vedi §7).

---

## 4. Test

Il PostgreSQL 16 locale era fermo ed è stato avviato con il comando indicato. `FUTPYTHON_TEST_DATABASE_URL` puntava all'istanza locale usa e getta.

### 4a. `node --test`, suite completa (TAP in `scratchpad/audit/test-tap.txt`)

```
# tests 440   # pass 438   # fail 1   # skipped 1   # cancelled 0   # todo 0   (223 s, exit 1)
```

**FAIL: `test/governance-workflows.test.mjs`**
- **Causa:** `ERR_MODULE_NOT_FOUND: Cannot find package 'yaml'`.
- `yaml@2.9.1` è una devDependency aggiunta nel range #180–#181 e manca nel `node_modules` collegato. È un problema dell'ambiente, non del codice.
- **Riprova:** in una copia isolata (`scratchpad/wfcopy`) con `yaml@2.9.1` installato fuori dal repository: **13/13 PASS**.
- **Totale effettivo:** 452 test, 451 pass, 1 skip. La riga TAP però resta **FAIL** in questo ambiente.

**SKIP: `test/postgres-independence.test.mjs`**
- Test: "PostgreSQL 17 independent migration, verified sample replay and API are deterministic".
- Motivo: `PostgreSQL 17 is required, found server_version_num 160015` (sull'host è disponibile solo PG16).
- **NON è PASS**: in CI fallirebbe invece di saltare.

**Nota sul run:**
- durante l'esecuzione un altro processo (sessione sorella, stesso checkout) lanciava `node --test --test-concurrency=1` su un sottoinsieme della suite **sullo stesso DB `matchpilot_fpt`**;
- non ha causato fallimenti, ma il run non è stato isolato.

**Copertura dei dati:** tutti i test DB usano fixture o seed (`test/helpers/fpt-seed.mjs`). Nessun test usa dati reali.

### 4b. Controlli

| Comando | Esito |
|---|---|
| `npm run check` | exit 0 (non copre gli 8 moduli elencati in §1.2) |
| `npm run governance:check` | `{"result":"PASS"}`, exit 0 |
| `node tools/governance/render-inventory.mjs --check` | exit 0, nessun output |

---

## 5. Deployato vs `main`

### 5.1 Release in servizio sulla VPS (tutto DICHIARATO)

**`3dd833f38bf8a7de3b51dfbebd3118e1602185ac`**, commit del 2026-10-20 13:07 +02:00 (VPS-DEPLOY-01, #177).

| Fonte (#179) | Autore e data | Contenuto |
|---|---|---|
| 6296587566 | owner, trascrive Grok, 20/10 | `/srv/mp-deploy/current` = 3dd833f |
| 6311424998 | Grok (t91u), 21/10 | `current → releases/3dd833f…`, `/healthz` 200 |
| 6320706638, 6321218240 | Grok (t94u, t95u), 21/10 | release 3dd833f, `mp-deploy` v3 `07dbed21`, `FREEZE=1` |
| 6325365254 | Claude Code, 21/10 | "release `3dd833f` invariata; FREEZE attivo" |
| 6337618137 | Grok (t98u), 22/10 09:37Z | VPS invariata, FREEZE=1, app 200 |
| **6344141373** | Grok, **22/10 15:10Z**, l'evidenza più recente | Il worker `matchpilot-fpt-worker` gira su `/srv/mp-deploy/current` (`3dd833f`; "FPT code identical to `39fe08e`"). L'app punta al DB definitivo PG18 `matchpilot_staging` (161.801 partite). Modalità app `offline`, worker in `production`. Cron FPT, watchdog e alert Telegram attivi. TC OFF ("all five jobs log `SKIPPED disabled`, and no TC token") |

**Stato delle prove:** tutto è **DICHIARATO**. Nessuna prova indipendente da qui (nessun accesso alla VPS). I run `deploy-vps` 39635669968, 39665149747 e 39747985926 sono dichiarati `waiting` o `pending` e non approvati (6336457809).

### 5.2 `git log --oneline 3dd833f..HEAD`: 8 commit

```
39fe08e SIM-OUTBOX-01: rimozione del codice di #187 (#189)
34da37b SIM-OUTBOX-01: messaggi Telegram simulati (#187)
7b4baf7 TC-OFF-01: TotalCorner spento per configurazione esplicita (#186)
da92728 TAKEOVER-01 … (#185)
0c084d5 FUNC-RECOVERY-01: segnali FutPythonTrader simulati end-to-end (#184)
c4b82ba GOV-RECON-01 … (#183)
1703054 MP-GATE-S1S2-FIX … (#181)
e127c26 MP-DEPLOY-APPROVAL … (#180)
```

### 5.3 Riepilogo del diff

83 file, +11.666 / −157. Di questi: `docs` 52 file (+8.100), `test` 9 file (+2.012).

**Runtime (`src/`, 6 file):**
- `src/signals/simulated.mjs` (+100) e `src/jobs/sim-signals.mjs` (+24): nuovi;
- `src/api/v1.mjs` (+10): `/api/v1/sim/signals`;
- `src/web/app.js` (+28): vista `#/segnali`;
- `src/server.mjs`: `MATCHPILOT_BIND_HOST`;
- `src/background.mjs` (31 righe modificate): `tcEnabled`, cioè TC spento senza `MATCHPILOT_TOTALCORNER=on`.

**Deploy e CI:** `.github/workflows/deploy-vps.yml` (+86), `scripts/deploy-authz.mjs`, `deploy-gate.mjs`, `runner-job-guard.mjs`, `workflow-policy.mjs` (nuovi, circa 840 righe), `render.yaml` (`autoDeploy:false`), `package.json` (script e devDependency `yaml`).

**Migrazioni:** nessuna.

**Conseguenze pratiche (DICHIARATO + codice):**
- La VPS **non ha** i segnali simulati né `MATCHPILOT_BIND_HOST`.
- La VPS **non ha** il kill switch `MATCHPILOT_TOTALCORNER`. Lì TC è spento solo per i flag dei singoli job e per l'assenza del token, non per il meccanismo di #186.

---

## 6. Rapporti di certificazione nel repository

| Documento | Cosa certifica davvero | Componente o integrato | Dati |
|---|---|---|---|
| `docs/futpython-certification-2026-10-05.md` | Certificato FPT "CERTIFIED WITH KNOWN LIMITATIONS", 20 gate su 20, dal deploy Render `6f83e2e` | Componente: ingestion e dati FPT | **Reali** (Neon via Render, 05/10). Storico: Render è sospeso, il commit è vecchio di 20 migrazioni |
| `docs/provider-trial-final-closure-2026-10-08.md` | Chiusura del trial #40: identità dell'archivio congelato (82.862 record raw, bundle SHA-256) | Archivio, non software | Reali, ma **l'archivio non è materializzato** nel repository (matrice: R-02 BLOCKED) |
| `docs/qa/certification.md` (QA-03) | Il **gate** Browser QA (rilevamento difetti, CI gate, blocco del merge) HARD CERTIFIED; revisione AI CERTIFIED solo sulle 4 classi seminate | Strumentazione QA, non il prodotto | Archivio QA (fixture) |
| `docs/audits/*` (14 pacchetti: MP-OWNER-VISUAL-BASELINE-AUDIT-01, QA-03 e R2, QA-V e R2, QA-V2 e R2, R-07a-MATCH-CENTER, V-A, V-B1, V-B2a, V-B2b, V-B3, V-B4) | Prove RED/GREEN di Browser QA e baseline visive, per singola modifica web | Componente UI | **Tutti su "QA archive"** (fixture PG16 o PG17). R-07a lo scrive in chiaro: "real data not verified (R-02)" |
| `docs/governance/certifiability-matrix.md` | Verdetti per funzionalità | — | Ogni riga "Real data" è **NOT VERIFIED o BLOCKED**; nessuna REAL DATA PASS |
| README §Stato (righe 55-59) | "Gate A NON PASS; nessuna componente è GLOBAL HARD CERTIFIED"; TC certificato per componente; #20 OPEN | — | — |

**Segnali simulati (#184):**
- nessuna riga nella matrice né un pacchetto in `docs/audits`;
- l'unica evidenza è il checkpoint `CP-20261022T123735Z` (DICHIARATO; `gate_a`/`gate_b` NOT_VERIFIED, review "NOT REQUESTED").

**Nessuna certificazione integrata end-to-end** del prodotto è presente.

---

## 7. Funzionalità davvero usabili end-to-end oggi (lettura severa)

### A. Su `main`, verificate da test in questa sessione, solo con dati seminati o fixture

1. **Avvio del server, `/healthz`, migrazioni e guard** su PostgreSQL locale.
2. **Web shell in sola lettura**, con dati dell'archivio QA (86 partite sintetiche ingerite dal percorso FPT reale):
   - Daily Board "Oggi" (giorno, paginazione);
   - Ricerca (filtri combinati, keyset);
   - Match Center pre-partita (R-07a, `PIT_NOT_VERIFIED`);
   - area Dati (panoramica, fornitori, elenco API);
   - pagina `/coverage`.
3. **API v1** (32 GET) e le route legacy, sugli stessi dati.
4. **Login owner** (`MATCHPILOT_AUTH=enforce`): funziona nei test; per default è OFF.
5. **Ingestion FPT** (store, versioni, riconciliazione, onboarding, reprocess): test su CSV seminati con HTTP mockato.
6. **Segnali simulati**: tecnicamente eseguibili da CLI più API e vista nascosta, ma **sui dati disponibili qui producono solo `INSUFFICIENT_DATA`**. Il ramo SIGNAL non è mai stato eseguito su DB in un test.

### B. Con dati reali: solo DICHIARATO, sulla VPS a `3dd833f`, non su `main`

1. Raccolta FPT attiva (cron, watchdog, alert Telegram operativi) sul DB definitivo con 161.801 partite.
   - Grok stesso indica: nessuna riga nuova (F-1, provider fermo al 20–21/09), "Operational with fresh data" NOT VERIFIED.
2. Web shell e API sul DB reale: `healthz` 200 e `/api/data-health` dichiarati. Le viste utente sui dati reali non risultano verificate.
   - Con dati fermi al 04/10 e oggi 22/10, la Daily Board "Oggi" non ha partite del giorno.
3. Segnali simulati su dati reali: solo nell'ambiente isolato functest (DICHIARATO). Non sono in servizio, perché non deployati.

### C. Non usabili o inesistenti

- TotalCorner: spento; live e prematch non raccolgono.
- Replay (#24), Live Trading Board (#29), Match Center a partita conclusa (#25).
- Strategy Lab, Indicator Library, Decision Engine, Money Management.
- Backtest, Paper Trading, Settlement e ledger, Trading Copilot, MCP.

Tutti questi sono FAIL o BLOCKED in `certifiability-matrix.md` e non hanno codice in `src/`. Non esistono segnali reali, invii Telegram di segnali, scommesse o exchange.

**Conclusione severa:**
- su `main` **nessuna** funzionalità utente è verificata end-to-end su dati reali;
- l'unico sistema con dati reali è la VPS a `3dd833f`, e lì le prove sono solo dichiarate;
- il prodotto oggi è un **archivio FPT consultabile in sola lettura**, con un collettore FPT dichiarato attivo e un prototipo di segnali simulati non deployato.
