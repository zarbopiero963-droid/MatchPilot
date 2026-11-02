# Pacchetto per l'audit indipendente Codex — conteggio delle PR residue

Mandati: MP-ROADMAP-270-INDEPENDENT-FINAL-AUDIT-01 e MP-ROADMAP-BASELINE-282-PREFLIGHT-01. MASTER #288.

**Baseline ufficiale in vigore:** 270 PR (209–328). **Candidata:** 282 (249–302), registrata e non applicata.

## Stato dell'ambiente Codex

| Voce | Stato |
|---|---|
| Code review di Codex sulle PR | **disponibile**: usata sulla #292 (4 cicli, 6 finding corretti, ultimo ciclo senza problemi rilevanti) |
| Task Codex per l'audit analitico completo | **non disponibile**: alla richiesta del 02/11/2026 Codex ha risposto «To use Codex here, create an environment for this repo» (PR #292) |

**Cosa manca, esattamente:** un ambiente Codex cloud per il repository `zarbopiero963-droid/MatchPilot`. Lo crea l'owner, con l'account ChatGPT collegato a GitHub, alla pagina https://chatgpt.com/codex/cloud/settings/environments. Un agente non può crearlo.

Configurazione sufficiente per questo audit:
- repository `zarbopiero963-droid/MatchPilot`, ramo `main`;
- immagine con Node.js 22, setup `npm ci`;
- **nessun segreto** e **nessun accesso a rete esterna**: l'audit legge solo file del repository;
- PostgreSQL non necessario: i comandi di verifica qui sotto non usano il database.

Finché l'ambiente non esiste, lo stato dell'audit completo è **INDEPENDENT REVIEW NOT AVAILABLE** e il gate resta aperto.

## Contenuto del pacchetto

I checksum SHA-256 sono in [`package-manifest.json`](package-manifest.json), rigenerabile con `node tools/governance/pr-plan.mjs manifest`. Un test ne verifica la coerenza.

| Voce richiesta dall'owner | File |
|---|---|
| Registro atomico dei requisiti | `docs/governance/master/requirements.jsonl` (1 358 requisiti, di cui 1 173 attivi) |
| Mappa delle 376 schede | `docs/governance/master/cards.jsonl` e `pr-plan.json → card_dispositions` (esito e PR per ogni scheda) |
| Piano delle 270 PR | `docs/governance/master/pr-plan.json` e `pr-plan.md` |
| Riconciliazione per ID | `docs/governance/master/pr-plan-reconciliation.json` |
| Proposta 282 | `docs/governance/master/audit/producer-analysis.json → proposed_count` |
| Analisi delle 27 PR eliminabili | `producer-analysis.json → removable`; classificazione anche in `pr-plan.json → audit_classification` |
| Analisi delle 58 scissioni | `producer-analysis.json → splits` |
| Analisi delle 34 coppie | `producer-analysis.json → merges` e `merge_summary` |
| Schede decisionali owner | `docs/governance/master/audit/decision-cards.md` |
| Evidenze sul codice | `requirements.jsonl → code_paths`, `tests`, `status`, `status.evidence_note`; il codice di `main` |
| SHA e checksum | `audit/baseline-270.json` (baseline) e `audit/package-manifest.json` (pacchetto corrente) |
| Protocollo | `audit/MP-ROADMAP-270-AUDIT.md` |
| Decisioni owner | `docs/governance/owner-decisions.json` |

## Ricostruire i numeri da zero (sola lettura)

```
npm ci
node tools/governance/master.mjs validate        # registro MASTER coerente
node tools/governance/pr-plan.mjs validate       # piano coerente, nessun ciclo di dipendenze
node tools/governance/pr-plan.mjs counts         # A..J, N, Nmin, Nmax
node tools/governance/pr-plan.mjs reconcile      # ogni conteggio espanso per ID
node tools/governance/pr-plan.mjs manifest       # checksum da confrontare con package-manifest.json
node --test test/pr-plan.test.mjs test/master-registry.test.mjs
```

I comandi servono a confrontare, non a sostituire la verifica. L'audit deve ricostruire le cifre **leggendo direttamente** `cards.jsonl`, `requirements.jsonl` e `pr-plan.json`.

## Categorie da verificare individualmente

L'audit **non è concluso** finché ognuna di queste categorie non è verificata voce per voce, con l'esito per ID.

1. **Formula delle schede:** `376 = 1 + 12 + 23 + 340`.
2. **Formula delle PR:** `270 = (340 − 139) + 69 = 8 + 262`. Per ID:
   - le 139 schede assorbite;
   - le 69 PR senza scheda primaria, con la loro origine;
   - le 19 righe di pianificazione deduplicate, che non sono schede assorbite;
   - le 8 PR aperte, comprese #286 e #287;
   - le 262 nuove.
3. **Copertura:** i 1 173 requisiti attivi, coperti una sola volta. Per i 33 completamenti, la base dichiarata (4 CERTIFICATE, 29 RULE_ENFORCED_BY_TEST), indicando quali sono impropri.
4. **Le 27 eliminabili:** una classificazione per PR (MANDATORY, OPTIONAL, DEFERABLE, SUPERSEDED, OWNER DECISION REQUIRED), confrontata con `audit_classification`.
5. **Le 58 scissioni:** una classificazione per PR (KEEP SINGLE, SPLIT REQUIRED, SPLIT RECOMMENDED, UNCERTAIN), con l'impatto numerico.
6. **Le 34 coppie:** un esito per coppia (confermata, respinta, incerta), senza unire SAFE e MANUAL.
7. **Dipendenze:** nessun ciclo, e un ordine eseguibile.
8. **Proposta 282:** aritmetica e doppi conteggi tra rimozioni, accorpamenti e scissioni.

## Testo del task da dare a Codex, quando l'ambiente esiste

> Audit indipendente in sola lettura del conteggio delle PR residue di MatchPilot.
> - Non fare commit, push, PR, merge o deploy; non modificare dati; non chiamare provider esterni.
> - Leggi `docs/governance/master/audit/CODEX-AUDIT-PACKAGE.md` e `MP-ROADMAP-270-AUDIT.md`.
> - Ricostruisci da zero le categorie 1–8, voce per voce, partendo da `cards.jsonl`, `requirements.jsonl`, `pr-plan.json` e dal codice di `main`.
> - Rispondi con il formato A–G del protocollo: A, PASS / PASS WITH RESERVATIONS / FAIL; F, con `PR RESIDUE VERIFICATE`, `INTERVALLO`, `PR GIÀ APERTE`, `PR NUOVE`, `DECISIONI OWNER PENDENTI`; G, i finding con gravità P0–P3 ed evidenza file e riga.
> - Dichiara esplicitamente le categorie che non hai potuto verificare.
