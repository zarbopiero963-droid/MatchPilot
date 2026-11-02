# Evidenza F3 — doppia autorizzazione delle migrazioni (MP-MIG-GATE-01)

Mandato owner `MP-MIGRATIONS-030-031-AND-API-FOOTBALL-P1-FIX-01` (F3=A), su main da #295 (70ee74b). Issue #288, #263.
PR impilata su F2 (#298) e F1 (#296). Gate **MANUAL**. Regole e procedura: [`docs/migration-gate.md`](../../../migration-gate.md).

## Implementazione

- `src/migration-authz.mjs` (nuovo): manifest owner (`mp-migration-approvals-v1`), token tecnico
  (`mp-migration-technical-authz-v1`, root, 0644 max, fuori dalla release, legato allo SHA di release, nonce, ≤ 24 h),
  decisione per operazione.
- `src/migrate.mjs`: gate in tutte le modalità; `schema_migration_authorizations` con indici unici (approvazione e uso
  del token una volta sola); revocati tenuti e mai riapplicati senza `reapply`; ordine bloccato dietro un revocato;
  token chiuso e rimosso; adozione legacy soggetta allo stesso gate; stato ambiguo → fail-closed.
- `db/migration-approvals.json`: manifest vuoto (questa PR non autorizza alcuna operazione).
- Test: meccanismo esplicito di test (`MATCHPILOT_RUNTIME_MODE=test` + `MATCHPILOT_MIGRATION_TEST_AUTHORIZATION=throwaway-schema`)
  aggiunto a ogni chiamata del runner e a ogni server dei test; `owner-auth`, `migration-guard`, `migration-hardening`,
  `migration-checksums` adeguati alla nuova semantica (un avvio production con migrazione non autorizzata non parte).
- `mp-deploy` **non modificato** (nessuna interazione con #281); il suo `allow-migrations-<sha>` resta un gate di deploy
  separato.

## Test di sicurezza (`test/migration-gate.test.mjs`)

| Caso | Esito atteso | PG17 | PG18 |
|---|---|---|---|
| offline senza autorizzazione (anche con la variabile di test e la lista D13) | `MIGRATION_NOT_AUTHORIZED`, nulla applicato, evento | PASS | PASS |
| production senza autorizzazione | idem | PASS | PASS |
| solo owner / solo tecnica | `TECHNICAL_AUTHORIZATION_MISSING` / `OWNER_APPROVAL_MISSING` | PASS | PASS |
| entrambe (offline) | applicata, uso + chiusura registrati, file token rimosso | PASS | PASS |
| production con entrambe senza lista D13 / con lista | rifiuto `D13_PRODUCTION_LIST_MISSING` / applicata | PASS | PASS |
| approvazione scaduta; token scaduto; validità > 24 h | rifiuti | PASS | PASS |
| SHA di release diverso (token per altra release; release in esecuzione diversa) | `TOKEN_RELEASE_MISMATCH` / nessun token | PASS | PASS |
| byte diversi da quelli approvati | rifiuto | PASS | PASS |
| riuso del token (stesso nonce) / riuso dell'approvazione | `TECHNICAL_AUTHORIZATION_CONSUMED` / `OWNER_APPROVAL_CONSUMED` | PASS | PASS |
| crash durante (SIGKILL) | nulla consumato né applicato; il token resta; il retry applica | PASS | PASS |
| crash prima (manifest illeggibile; decisione non IN_FORCE) | `APPROVALS_INVALID`, nulla applicato | PASS | PASS |
| concorrenza (due processi, stesso token) | una sola applicazione, un uso, una chiusura | PASS | PASS |
| rollback + riavvii ripetuti (senza autorizzazione, con l'approvazione `apply` originale, con un nuovo token `apply`) | tenuta `REVOKED`, avvio prosegue, mai riapplicata | PASS | PASS |
| migrazione successiva a una revocata | `MIGRATION_ORDER_BLOCKED` | PASS | PASS |
| `reapply` per un'altra revoca / per questa revoca | rifiuto / riapplicata `APPLIED` | PASS | PASS |
| stato ambiguo (autorizzazione senza riga di registro) | `MIGRATION_STATE_AMBIGUOUS` | PASS | PASS |
| permessi: token 0666, cartella 0777, proprietario diverso, symlink, token dentro la release | `TOKEN_UNSAFE` | PASS | PASS |
| autorizzazione TEST su schema con autorizzazione reale | rifiutata, `MIGRATION_TEST_AUTHORIZATION_REFUSED` | PASS | PASS |
| adozione legacy offline senza / con doppia autorizzazione | `ADOPT_NOT_AUTHORIZED` / adottata | PASS | PASS |
| avvio offline del server con migrazione pendente non autorizzata | esce ≠ 0, `MIGRATION_NOT_AUTHORIZED`, niente `listening`, nessuna migrazione | PASS | PASS |
| unit: manifest del repository valido e vuoto; decisione per caso | PASS | — | — |
| approvazione scaduta seguita da una nuova; secondo ciclo rollback/riapplicazione con vecchie voci consumate/scadute nel manifest; nessuna idonea → tenuta; due idonee → `OWNER_APPROVAL_AMBIGUOUS` (review #300 P2) | selezione dell'unica voce idonea | PASS | PASS |

## Esecuzioni (2026-11-02, container usa-e-getta, Node v22.22.0, eseguite come root nel container: i test di
proprietà usano un uid diverso da quello del processo)

| Comando | PostgreSQL | Esito |
|---|---|---|
| `npm run check` | — | PASS |
| suite completa `node --test` (→ 127.0.0.1:5450), head con la correzione P2 (e133bbb) e il merge di main c6b3b2e | 17.11 | 841/841 PASS |
| `node --test test/migration-gate.test.mjs test/migration-checksums.test.mjs test/migration-030-promotion.test.mjs test/migration-guard.test.mjs test/migration-hardening.test.mjs test/owner-auth.test.mjs test/persistence-store.test.mjs test/persistence-api.test.mjs test/resume-drill.test.mjs test/web-persistence-contract.test.mjs` (→ 127.0.0.1:5451), stesso head | 18.6 | 67/67 PASS |

## Limiti

- Il token deve essere leggibile dall'utente dell'app (es. `0644 root:root`): la sicurezza viene dalla proprietà root e
  dalla non scrivibilità, non dalla segretezza. Chi è root sulla VPS o proprietario del DB può comunque aggirare
  qualunque controllo applicativo.
- La release è ricavata dal layout di mp-deploy o da git: in un'installazione senza nessuno dei due il gate rifiuta
  sempre (fail-closed).
- Nessuna prova sulla VPS reale (fuori mandato). Il down di 031 (#282) va integrato come descritto in
  `docs/migration-gate.md`.
