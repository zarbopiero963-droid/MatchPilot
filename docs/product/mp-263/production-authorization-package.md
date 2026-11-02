# Pacchetto unico di autorizzazione per la produzione (MP-NEXT-20261102) — BOZZA per l'owner

**Nessuno di questi passi è autorizzato.** L'ordine dell'owner del 02/11/2026 resta in vigore:

> NON AUTORIZZO ANCORA DEPLOY, MIGRAZIONI PRODUTTIVE, ATTIVAZIONE COLLECTOR, SPEGNIMENTO SERVIZI O NUOVE SPESE.

Il GO deve essere esplicito e punto per punto. Il silenzio non è un'autorizzazione.

## Prerequisito comune
Preflight VPS in sola lettura ([`vps-preflight-2026-11-02.md`](vps-preflight-2026-11-02.md)). Non è stato eseguito per mancanza di accesso, ed è **bloccante** per i punti 1, 4 e 5.

## Le sette decisioni

| # | Decisione | PR o documento | Cosa si chiede esattamente | Rollback |
|---|---|---|---|---|
| 1 | Migrazione degli snapshot (031) | #282 (MANUAL), [`migration-031-preflight.md`](migration-031-preflight.md) | 1. merge della #282; 2. `allow-migrations-<sha>` per quel deploy; 3. `MATCHPILOT_APPROVED_MIGRATIONS` con `031-apifootball-odds-snapshots.sql`. Prima: PostgreSQL ≥ 14 verificato (prova su 18 se la VPS è su 18), backup e piano di ritenzione. | `db/rollback/031…down.sql`: solo a tabelle vuote. |
| 2 | Attivazione del collector PREMATCH | #283 (MANUAL), [`prematch-collector.md`](prematch-collector.md) | merge, variabili `APIFOOTBALL_*` e `APIFOOTBALL_PREMATCH_*`, scelta delle leghe, uno scheduler con un solo esecutore (da scrivere), **dopo** il punto 1 | `APIFOOTBALL_PREMATCH_COLLECTOR_ENABLED` non impostata, poi scheduler fermo. Gli snapshot restano. |
| 3 | Budget API | [`api-budget-proposal.md`](api-budget-proposal.md) | 1 500 chiamate al giorno (900 PREMATCH, 400 LIVE e benchmark, 200 controlli e margine), più i limiti al minuto. Verifica della scadenza del piano Pro (25/11/2026, **non verificata**) e decisione sull'eventuale rinnovo, che è una spesa. | abbassare o azzerare le variabili |
| 4 | Dismissione FPT | [`fpt-decommission-plan.md`](fpt-decommission-plan.md) | backup e prova di ripristino, `FUTPYTHON_RETIRED=true` coerente in tutti i file env, riavvio del worker in modalità dismessa. Il timer di liveness è una decisione a parte. **Dopo** il punto 5. | `FUTPYTHON_RETIRED=false` e riavvio. Nessun dato cancellato. |
| 5 | Modifiche a `mp-deploy` | #281 (MANUAL) | merge, poi installazione manuale sulla VPS: prima `mp-fpt-worker-restart` (0755), poi `mp-deploy` v3.4, con le checksum di `infra/vps/SHA256SUMS` | reinstallare la v3.3 (checksum nel repository) |
| 6 | Verifica di backup e rollback | `matchpilot-backup`, `docs/persistence-runbook.md` | backup di meno di 24 ore, `sha256sum` registrato, prova di ripristino con conteggi uguali, prima dei punti 1 e 4 | — |
| 7 | Monitoraggio dopo il deploy | sotto | 72 ore di controlli, con soglie d'arresto | i rollback dei singoli punti |

**Ordine proposto:** 6 → 5 → 4 → 1 → 3 → 2. PIT LIVE (#280) è indipendente dalla produzione: è codice e catalogo, senza attivazione LIVE.

## Monitoraggio dopo il deploy (punto 7)
- **Ledger API-FOOTBALL:**
  - chiamate per giorno e per finalità non oltre il budget;
  - nessuna riga `rate_limited` ripetuta;
  - il collector registra `stop_reason` per ogni ciclo.
- **Snapshot:**
  - zero righe con `acquired_at >= kickoff_at`, comunque impossibili per i CHECK;
  - crescita giornaliera in MB rispetto alla stima di circa 700 MB;
  - spazio disco residuo.
- **FPT:**
  - zero richieste nuove nel `fpt_request_ledger`;
  - nei log di `mp-deploy`, `worker_restart=skipped_retired`;
  - nessun alert FPT.
- **App:** `/api/v1/capabilities` risponde, la Ricerca sullo storico funziona, `migrate()` non segnala `MIGRATIONS_PENDING_NOT_APPROVED` inattesi.
- **Arresto immediato** (collector spento) se:
  - lo spazio disco scende sotto il 20%;
  - si supera il budget giornaliero;
  - si ripetono errori del provider.

## Stato delle PR del mandato
Vedi il rapporto finale sulla #263.
- **MERGIATO:** solo le PR SAFE.
- **IN ATTESA DELL'OWNER:** le PR MANUAL #280, #281, #282 e #283.
- **DEPLOYATO:** niente.
- **ATTIVO:** niente.
- **CERTIFICATO:** niente.
