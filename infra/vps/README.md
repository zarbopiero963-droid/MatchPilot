# infra/vps — copie versionate dei file installati solo sulla VPS

Copia byte-per-byte (verificata con `SHA256SUMS`) dei file che fino a t129u esistevano solo sulla VPS GameHosting
45.14.186.174. Il deploy **non** installa questi file: restano installati a mano da root; il repository ne
conserva la versione canonica per review, diff e disaster recovery.

| File repo | Percorso VPS | Versione |
|---|---|---|
| `sbin/mp-deploy` | `/usr/local/sbin/mp-deploy` (root:root 0755) | v3.3 — umask/permessi go+rX, restart worker dopo deploy e rollback, tip_recheck |
| `sbin/mp-runner-guard.sh` | `/usr/local/libexec/mp-runner-guard.sh` | v2 (v1 + runner-job-guard, enforce con `/etc/mp-deploy/runner-guard.enforce`) |
| `sbin/mp-runner-guard-v1.sh` | `/usr/local/libexec/mp-runner-guard-v1.sh` | v1 |
| `systemd/matchpilot-fpt-worker.service` | `/etc/systemd/system/matchpilot-fpt-worker.service` | `node src/worker.mjs`, TotalCorner off |
| `systemd/matchpilot-fpt-liveness.{service,timer}` | `/etc/systemd/system/` | t131u: probe esterno al worker ogni 30 min (salta 03:15–04:45), alert se l'ultimo `fpt_sync_runs` > 7h |
| (repo) `scripts/runner-job-guard.mjs` | `/usr/local/libexec/mp-gate/runner-job-guard.mjs` | copia del file repo (t130u: ri-lettura limitata se il run è ancora `queued`) |

Nessun segreto è contenuto qui: i token sono letti a runtime da `EnvironmentFile` / file root-only.
Ogni modifica sulla VPS va riportata qui (e `SHA256SUMS` aggiornato); `test/infra-vps.test.mjs` verifica
checksum, sintassi e invarianti di sicurezza.

Reinstallazione (DR): `install -o root -g root -m 0755 sbin/mp-deploy /usr/local/sbin/mp-deploy`,
`install -m 0644 systemd/matchpilot-fpt-worker.service /etc/systemd/system/ && systemctl daemon-reload`.
