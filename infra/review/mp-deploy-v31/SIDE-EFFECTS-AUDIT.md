# Audit ordine main-tip vs effetti persistenti (review P1-1, mandato punto 4)

Flusso reale di `mp-deploy.v31` (r2), modalità `MODE=enforce FREEZE=0` (l'unica che costruisce). Ogni riga è un passo del
codice nell'ordine in cui gira; colonna "effetto" = cosa resta su disco/DB se il processo si ferma subito dopo.

| # | Passo | Effetto persistente | Controllo punta prima? |
|---|---|---|---|
| 1 | FREEZE/config/latch | nessuno (solo `deploy.log`) | — |
| 2 | integrità (hash, owner, mode, ACL, sudo, .env) | nessuno (log) | — |
| 3 | `verify` del token (sola lettura del ledger) | nessuno | — |
| 4 | `require_root_dir` (dir già esistenti; `install -d` solo al primo avvio), lock in `/run/mp-deploy` | nessuno su un sistema già installato | — |
| 5 | `consume` | **ledger** (voluto: anti-replay; il token è bruciato anche se poi si rifiuta) | no, per progetto (R6) |
| 6 | `approved` | nessuno | — |
| 7 | **main_tip_1** | — | **sì** |
| 8 | fetch nella cache `/srv/mp-build/repo.git` (utente mpbuild) | cache git (non è stato del deploy, non è servita) | sì (7) |
| 9 | controllo monotonia; marker `allow-rollback-<sha>` | r1: marker **cancellato qui**. r2: solo letto; cancellato dopo main_tip_3 | sì (7) |
| 10 | worktree `/srv/mp-build/<sha>`, guardie migrazioni (`$STATE/failed` su BLOCKED_*) | worktree (rimossa a ogni uscita di errore) | sì (7) |
| 11 | `npm ci` nel sandbox | dentro la worktree | sì (7) |
| 12 | **main_tip_2 (nuovo in r2)** | — | **sì**; su rifiuto: worktree rimossa |
| 13 | test (`npm run check && node --test`) nel sandbox, DB **di test** (`FUTPYTHON_TEST_DATABASE_URL`, solo localhost) | righe nel DB di test; `test-<sha>.tap` nel log | sì (12) |
| 14 | copia in `releases/<sha>` (root) | directory release | sì (12) |
| 15 | **main_tip_3** subito prima dello switch | — | **sì**; su rifiuto: `releases/<sha>` e worktree rimosse, marker intatto |
| 16 | consumo marker rollback; switch atomico `current` | symlink | sì (15) |
| 17 | `systemctl restart` → `src/server.mjs` esegue `await migrate()` sul **DB di produzione** | **migrazioni DB produzione** | sì (15) |
| 18 | health OK → `deployed`, ledger migrazioni, prune | stato | sì (15) |
| 18b | health KO → rollback a `PREV`, `$STATE/failed`, **`freeze-latch` (nuovo r2)** | latch: FREEZE forzato finché root non lo rimuove | — |

Esito: **mp-deploy non esegue migrazioni**; il DB di produzione viene toccato solo dall'app al riavvio (passo 17), dopo
main_tip_3. Uno SHA che diventa obsoleto in qualunque punto prima dello switch produce rifiuto 79 con **diff vuoto**
dello stato persistente (eccetto ledger e log, voluti), provato con snapshot del filesystem nei test M01–M04 e D02 su
percorso reale (repo git reale, `main` spostato davvero con `git update-ref`). Unico residuo dichiarato: se `main` si
muove **durante** i test (tra 12 e 15) il DB di test ha già ricevuto le scritture dei test (M03 lo registra come unica
differenza): non è dato di produzione.

Residuo di progetto (non nuovo, invariato rispetto a v2): se il rollback automatico per health KO avviene **dopo** che
l'app nuova ha già applicato migrazioni al riavvio, il DB resta migrato. Mitigazioni esistenti: guardia
`BLOCKED_MIGRATION` (nuove migrazioni richiedono il marker root `allow-migrations-<sha>`), guardia sul contenuto delle
migrazioni già applicate; r2 aggiunge il `freeze-latch` così nessun altro deploy parte finché l'owner non decide.

Bug trovato in r1 durante l'audit: `if W=$(tip_check)` sovrascriveva `W` (percorso worktree) con l'output del
controllo; la pulizia finale `rm -rf "$W"` diventava `rm -rf ""` e la worktree restava. r2 usa `TW`.
