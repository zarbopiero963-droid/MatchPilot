# Piano S3 (v3.1-r2) — NON ESEGUITO. Richiede GO-S3 esplicito dell'owner.

Condizioni per tutta S3: `FREEZE=1`, `MODE=report`, nessuna approvazione di run, una sola sessione root, backup prima, rollback solo verso v3 (mai v2).

1. **Preflight sola lettura**: hash v3 installato = `07dbed21…`; hook = `6e32cfff…`; `authz.conf` con `FREEZE=1`; `sudo -n -l -U ghrunner` identico a `fixtures/sudo-l-ghrunner.txt`; `id -nG ghrunner` = `ghrunner`; `/etc/sudoers.d` = {90-mpadmin, ghrunner, mpdeploy, README}; nessun deploy in corso; nessun run in waiting.
2. **Pacchetto**: copiare sulla VPS i 6 file del pacchetto + `MANIFEST.sha256` dal commit del branch; `sha256sum -c`.
3. **Installazione**: `install-v31.sh install <pkgdir>` — verifica pacchetto (hash #181 fissi + manifest, rifiuta file non di produzione), backup in `/root/mp-deploy-rollback-v31-<ts>-<pid>` (v3, conf, hook v1, verifier legacy, SHA256SUMS), installa `mp-gate/`, `runner-guard.json` (pin `560959900f…`), genera l'hook v2 con i pin (node, guard, verifier), scrive `authz.conf` (MODE=report FREEZE=1 + 8 pin, incluso `NODE_SHA256` e `SUDOERS_SHA256`), poi sotto il lock v3: conf → hook → binario. Rimuove il verifier legacy (copia nel backup).
4. **Smoke test post-installazione (sola lettura di fatto)**: `mp-deploy $(cat /var/lib/mp-deploy/deployed) </dev/null` deve dare **0 ALREADY_DEPLOYED** senza righe `INTEGRITY` in `deploy.log` (prova che ogni pin è coerente; I10 offline). Un SHA diverso deve dare **78** (I11). Qualsiasi 80 → rollback (passo 6).
5. **Hook**: verificare `ACTIONS_RUNNER_HOOK_JOB_STARTED=/usr/local/libexec/mp-runner-guard.sh` invariato in `.env`; il runner rilegge l'hook a ogni job (nessun riavvio necessario). Nessun run viene avviato in S3.
6. **Rollback** (se un passo fallisce): `install-v31.sh rollback <backup>` → v3 + hook v1 + verifier legacy + conf FREEZE=1.
7. **Evidenze**: hash installati, output smoke test, estratto `deploy.log`, nessun segreto.

S4 (prova con run reale) resta **bloccata da P1/A7**.
