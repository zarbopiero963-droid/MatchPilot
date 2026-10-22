# Findings — v3.1-r2 (risposta alla review indipendente #179/6336278907)

## Risolti in r2 (con test)
| ID review | Esito r2 | Prova |
|---|---|---|
| P0-1 pacchetto non verificabile | tutti i file pubblicati su branch dedicato, `MANIFEST.sha256` completo | questo branch |
| P0-2 hook B4 non sorgente | sorgente `mp-runner-guard.sh.in` (v2) + v1 live letto dalla VPS in sola lettura (`6e32cfff…`) + diff + 39 test avversari (B4: workflow modificato, job aggiunto, environment rimosso, rerun, runner diverso, punta vecchia, env injection, integrità) | `test_hook.py`, `diff-hook-v1-v2.patch` |
| P1-1 migrazioni prima di main_tip_2 | audit completo dei passi (`SIDE-EFFECTS-AUDIT.md`): mp-deploy non migra, il DB prod è toccato solo al riavvio dopo lo switch; aggiunto main_tip_2 prima dei test (DB di test) e main_tip_3 subito prima dello switch con pulizia; marker rollback consumato solo dopo main_tip_3 | M01–M08, D02 (snapshot diff vuoto) |
| P1-2 sudoers falsi negativi | tre livelli: `sudo -n -l -U ghrunner` (output effettivo, confronto esatto con Defaults + unica regola), gruppi di ghrunner, parsing di `/etc/sudoers` + include dir (nome, `%gruppo`, `#uid`, `%#gid`, alias, continuazioni, `ALL`, include extra) + pin `SUDOERS_SHA256` dell'insieme; non parsabile => 80 | S00–S30 (31 casi; S00 = layout VPS reale, nessun falso positivo) |
| P1-3 main_tip_2 reale non esercitato | **eliminato lo stub**: ogni test esegue il corpo reale (fetch da repo git reale, worktree, copia release, switch symlink, health); main spostato davvero con `git update-ref` | M01–M07, A01 |
| P1-4 rollback | `install-v31.sh rollback` testato (anche hook v1, backup corrotto, backup senza FREEZE=1); rollback automatico su health KO ora scrive `freeze-latch` (nessun nuovo deploy finché root non decide) | I01–I16, H01–H02 |
| P2-1 test mode in produzione | file di produzione senza `MP_*`, senza TESTMODE/stub/`--import`; unico aggancio = una riga commento sostituita solo nella copia di test; lo shim rifiuta euid 0, `SUDO_*`, percorsi installati, assenza di `MP_TEST_STUB=1`; l'installer rifiuta un file che non sia di produzione | T01–T06, I01c, H50–H53 |
| P2-2 integrità in report+FREEZE esce 78 | documentato; la prova S4 legge `deploy.log` (riga `INTEGRITY`) | D09 |
| P2-3 runner `.env` | gruppo, antenati, ACL, whitelist chiavi (`LANG`, hook) | E05–E06e |
| P2-4 parser run_id | `typeof === 'string'` per run_id e run_attempt; snippet estratto dal file ed eseguito | B10 |
| P2-5 node da PATH | `/usr/bin/node` assoluto + `NODE_SHA256` (mp-deploy e hook); `PATH` fisso; SELF_SHA256 dichiarato tautologico (solo deriva accidentale) | E19, E20, F06, H32 |
| P2-6 ramo verifier legacy non coperto | ora sempre attivo, percorso costante sovrascrivibile solo dallo shim | E18 |
| nuovo (audit r2) | bug r1: `W=$(tip_check)` sovrascriveva il percorso della worktree (pulizia mancata) | `SIDE-EFFECTS-AUDIT.md`; corretto (`TW`) |

## Residui (aperti)
| ID | Stato | Nota |
|---|---|---|
| **P1/A7** agente può approvare | **APERTO, blocca S4/S5** | proposta della review §4 invariata (approvatore umano dedicato, credenziali agenti non reviewer) |
| F1 regola sudo di `mpdeploy` | aperto | stessa regola di ghrunner; non usata dal flusso Actions; da rimuovere o limitare in S3/S4 (decisione owner) |
| R-DB rollback dopo migrazione | aperto (di progetto, ereditato da v2) | il rollback automatico non annulla migrazioni già applicate dall'app; mitigato da BLOCKED_MIGRATION + freeze-latch |
| R-RATE letture non autenticate | NOT VERIFIED | circa 12 letture API per deploy (guard 5, gate, approved 1, main-tip 3×1 + refs) < 60/h per IP |
| R-UID lock con uid diversi | NOT VERIFIED offline (uid singolo) | da provare in S4 |
| R-ACL `getfacl` assente sul box | NOT VERIFIED | in produzione `getfacl` è usato se presente; fallback `+` di `ls -ld` |
| R-OIDC token reale, variabili GitHub reali nell'hook | NOT VERIFIED fino a S4 | |
| R-TESTDB main che si muove durante i test | accettato | scritture solo sul DB di test (M03) |
| R-SUDO-L output dipende dalla versione di sudo | mitigato | confronto esatto: qualsiasi differenza => 80 (fail-closed, mai fail-open); rilettura in S3 prima di installare |
