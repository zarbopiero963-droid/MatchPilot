# Piano di dismissione FutPythonTrader (MP-NEXT-20261102 punto D) — da approvare, NON eseguito

**Stato: PIANO.** In questo mandato non è stato fermato nessun processo, non è cambiata nessuna configurazione di produzione e non è stato cancellato nessun dato. Ogni passo sulla VPS richiede il GO esplicito dell'owner. Il silenzio non è un'autorizzazione.

**Principio.** FPT smette di essere una sorgente, ma lo storico resta. Lo storico congelato continua a servire Ricerca, Oggi, Match Center e Simulazione.

## 1. Inventario (dal repository; lo stato reale della VPS NON è verificato)

| Elemento | Dove | Ruolo | Nota |
|---|---|---|---|
| `matchpilot-fpt-worker.service` | `infra/vps/systemd/` | `node src/worker.mjs`, che fa tre cose: cron FPT, data watchdog e alert Telegram | Dipende da `postgresql@18-staging.service`: forse PostgreSQL 18, non verificato. |
| `matchpilot-fpt-liveness.timer` / `.service` | `infra/vps/systemd/` | sonda ogni 30 minuti | In modalità dismessa resta silenziosa su FPT (#277). |
| `secrets/worker.env`, `secrets/fpt.env` | VPS | variabili FPT e Telegram | Telegram serve anche alle notifiche di `mp-deploy`: si rimuovono solo le credenziali FPT. |
| `mp-deploy` v3.3 | `infra/vps/sbin/` | riavvia il worker a ogni deploy | La v3.4 (#281, MANUAL) lo sostituisce con un riavvio protetto. |
| Tabelle `fpt_*` (27) | PostgreSQL | archivio, ledger, audit, facts | **Mai cancellate.** |
| Archivi e DuckDB | `$MP_ROOT/archives` | file immutabili con manifest SHA-256 | `matchpilot-backup` |

Le 27 tabelle:
- `fpt_catalog`, `fpt_catalog_snapshots`, `fpt_certification_checks`;
- `fpt_competition_season`, `fpt_coverage_audit`, `fpt_dataset_state`;
- `fpt_fact_columns`, `fpt_field_coverage`, `fpt_field_transforms`;
- `fpt_filter_registry`, `fpt_match_facts`, `fpt_match_versions`;
- `fpt_onboarding`, `fpt_onboarding_events`, `fpt_provider_hold`;
- `fpt_raw_retention_log`, `fpt_raw_snapshots`;
- `fpt_reprocessing_diffs`, `fpt_reprocessing_runs`;
- `fpt_request_ledger`, `fpt_schema_fields`, `fpt_season_audit`;
- `fpt_season_gaps`, `fpt_sync_runs`;
- `fpt_team_aliases`, `fpt_team_links`, `fpt_teams`.

## 2. Backup, checksum, ripristinabilità (prima di qualsiasi arresto)
1. `matchpilot-backup` produce:
   - `pg_dump -Fc` di ogni database;
   - globals;
   - configurazione;
   - `archives.sha256`, `pg_rowcounts.txt`, `git_sha.txt`.
2. `sha256sum` dei file di dump, da registrare nel checkpoint. Nessun segreto entra nel checkpoint.
3. **Prova di ripristino** su un database usa-e-getta (`docs/persistence-runbook.md`, drill):
   - `pg_restore --list`;
   - restore in `mp_restore_drill_<ts>`;
   - confronto dei conteggi delle tabelle `fpt_*` con `pg_rowcounts.txt`;
   - drop del database del drill.
4. Si procede solo se i conteggi coincidono.

## 3. Sequenza di arresto (dopo il GO, in quest'ordine)
0. Prerequisiti:
   - la #277 (codice della modalità dismessa) deve essere in produzione. **NON verificato:** è su main, ma ogni deploy di main da allora è stato rifiutato da `mp-runner-guard` (per esempio il deploy di main `7a959e7`, run 41426983861). Prima serve quindi un deploy autorizzato, e va verificato lo sha della release in esercizio (preflight, controllo 15);
   - #281, cioè `mp-fpt-worker-restart` e `mp-deploy` v3.4, è **installata a mano dall'owner**: prima l'helper, poi `mp-deploy`.

   Senza la #281 ogni deploy riavvierebbe il worker.
1. Lettura:
   - nessuna sync in corso (`fpt_sync_runs` senza run aperti);
   - unità attive (`systemctl list-units 'matchpilot-*'`).
2. `FUTPYTHON_RETIRED=true` nel file che vince per ultimo (`fpt.env`), con lo **stesso valore** in `worker.env` se la variabile è presente anche lì. Valori diversi danno `skipped_inconsistent`: nessun riavvio e un avviso.
3. Riavvio del worker in modalità dismessa. È la soluzione consigliata: il watchdog e gli alert non FPT restano vivi, gli alert FPT aperti si chiudono una sola volta.
4. Timer di liveness: in modalità dismessa è silenzioso, e la #281 avvisa se è ancora attivo. Per spegnerlo serve una decisione owner separata (`systemctl disable --now matchpilot-fpt-liveness.timer`).
5. Rimozione delle sole credenziali FPT da `fpt.env`, dopo almeno un ciclo pulito. È facoltativa.

## 4. Controlli dopo l'arresto
- `fpt_request_ledger`: **zero richieste nuove** dopo l'istante del passo 3, nell'arco di 24 ore.
- `mp-deploy` di prova: il log mostra `phase=deploy worker_restart=skipped_retired`.
- Watchdog vivo: gli alert non FPT continuano.
- Le notifiche Telegram di `mp-deploy` funzionano.
- Archivio intatto: conteggi `fpt_*` uguali al backup, `archives.sha256` invariato.

## 5. Rollback
1. Riportare `FUTPYTHON_RETIRED` a `false` (o rimuoverla) in **tutti** i file.
2. `systemctl restart matchpilot-fpt-worker.service`, più il timer se era stato fermato.
3. Rimettere le credenziali dal backup di configurazione.

Nessun dato è stato cancellato, quindi il rollback non richiede ripristini del database. Il ripristino dal dump del passo 2 serve solo in caso di danno, e anch'esso è una decisione owner.

## Rischi
- Lo stato reale della VPS non è verificato: unità, versione di PostgreSQL, contenuto dei file env, release in esercizio (e quindi la presenza della #277).
- Prima dell'installazione della #281, ogni deploy (con `mp-deploy` v3.3) riavvia il worker anche se è stato disabilitato, e annulla l'arresto. Con la #277 in esercizio il worker riparte in modalità dismessa; senza, riparte come sorgente attiva.
