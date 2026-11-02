# Preflight VPS in sola lettura (MP-NEXT-20261102) — 02/11/2026

## Esito: NON ESEGUITO sulla VPS, per assenza di accesso
Questa sessione non ha un accesso in sola lettura alla VPS:
- non ha SSH;
- non ha un connettore;
- l'unico percorso esistente è il runner self-hosted `matchpilot-vps`, che `mp-runner-guard` (enforce) riserva al deploy approvato.

Usare il runner per un'ispezione vorrebbe dire modificare workflow o runner, cosa vietata. **Nessun controllo è stato inventato.** Quanto segue è:
- (A) ciò che si ricava dal repository, marcato come tale;
- (B) la checklist che l'owner, o un accesso in sola lettura autorizzato, deve eseguire prima del GO.

Nessuno dei comandi elencati scrive o riavvia, e nessuno stampa segreti: i controlli 8 e 12 aprono file che contengono segreti, ma stampano solo una riga non segreta o un conteggio.

## A. Cosa dice il repository (non è lo stato reale della VPS)

| Punto | Indizio nel repository | Grado |
|---|---|---|
| Versione PostgreSQL | Le unità FPT dipendono da `postgresql@18-staging.service`; `matchpilot-backup` usa `$MP_PG_MAJOR` | indizio, NON verificato. La migrazione 031 richiede PostgreSQL 14 o superiore ed è testata su 16 e 17, non su 18. |
| Processi e timer FPT | `matchpilot-fpt-worker.service`, `matchpilot-fpt-liveness.timer`/`.service` | file pinnati in `infra/vps/SHA256SUMS` |
| Deploy | `mp-deploy` v3.3 installato a mano (v3.4 proposta in #281) | pinnato |
| Runner guard | `mp-runner-guard.sh` in enforce. Il deploy di main dopo la #279 (run 41426983861) è stato rifiutato a "Set up runner". | osservato in CI |
| Backup | `matchpilot-backup`: dump, globals, configurazione, manifest SHA-256 | script pinnato, frequenza ignota |
| Collector API-FOOTBALL | non esiste in produzione: #283 aperta, spenta, senza scheduler | certo dal codice |
| Migrazioni | `migrate()` applica in produzione solo i file approvati; `mp-deploy` blocca le migrazioni nuove senza allow file | certo dal codice |

## B. Checklist da eseguire (sola lettura)

| # | Controllo | Comando | Atteso prima del GO |
|---|---|---|---|
| 1 | Servizi | `systemctl list-units 'matchpilot-*' --all --no-pager` | elenco e stato registrati |
| 2 | Unità FPT abilitate | `systemctl is-enabled matchpilot-fpt-worker.service matchpilot-fpt-liveness.timer` | stato registrato |
| 3 | Versione PostgreSQL | `sudo -u postgres psql -p "$PORT" -tAc 'show server_version'` | ≥ 14. Se è 18, prima del GO va provata la migrazione 031 su 18. |
| 4 | Cluster | `pg_lsclusters` | quale cluster serve la produzione e quale è lo «staging» |
| 5 | Disco | `df -h /srv /var/lib/postgresql` | spazio per almeno 30 giorni a circa 700 MB al giorno nel caso peggiore, più i backup |
| 6 | Backup | `ls -lt $MP_ROOT/backups/pg \| head` e `sha256sum` dell'ultimo dump | backup di meno di 24 ore e prova di ripristino (`docs/persistence-runbook.md`) |
| 7 | Sync FPT aperte | `select count(*) from fpt_sync_runs where finished_at is null` | 0 |
| 8 | Variabili (solo i nomi) | `grep -h -o '^FUTPYTHON_RETIRED=[a-z]*' /srv/matchpilot/secrets/*.env` | **solo questa riga**: nessun altro valore va letto o pubblicato |
| 9 | Deploy | `sha256sum /usr/local/sbin/mp-deploy` confrontato con `infra/vps/SHA256SUMS` | coincide con v3.3 (o v3.4 dopo l'installazione) |
| 10 | Runner guard | `sha256sum` dello script guard, più il log dell'ultimo rifiuto | enforce attivo |
| 11 | Migrazioni applicate | `select filename from schema_migrations order by 1 desc limit 5` | 029 come ultima, 031 assente |
| 12 | Approvazioni | `grep -c '^MATCHPILOT_APPROVED_MIGRATIONS=' /etc/matchpilot/matchpilot.env` (file env dell'app; stampa solo il conteggio) | presenza registrata, senza valori |
| 13 | Collector | `systemctl list-timers --all \| grep -i apifootball` | nessun risultato |
| 14 | Dipendenze | `node --version`, `psql --version` | Node 22 come in CI |
| 15 | Release in esercizio | `readlink -f /srv/mp-deploy/current` e `git_sha.txt` dell'ultimo backup | lo sha della release; dice se la #277 (modalità dismessa) e le PR successive sono in esercizio |

## Rollback
Tutti i controlli sono in sola lettura, quindi non c'è nulla da ripristinare.
