# MP-ROADMAP-270 — Protocollo dell'audit indipendente del conteggio delle PR residue

Mandato owner: **MP-ROADMAP-270-INDEPENDENT-FINAL-AUDIT-01** (02/11/2026).

Baseline congelata: [`baseline-270.json`](baseline-270.json). Valori: `main` `7008cc3`, **270 PR** (209–328).

## Indipendenza

L'audit deve essere svolto da un modello di **famiglia diversa** da quella che ha prodotto il conteggio, che è Claude. Preferenze:
1. Codex / OpenAI;
2. Grok;
3. un altro revisore tecnicamente indipendente.

Più agenti dello stesso modello non sono un audit indipendente: le review già fatte sono **self-review**. Se nessun revisore indipendente risponde, lo stato resta `INDEPENDENT REVIEW NOT AVAILABLE` e il gate resta aperto.

## Vincoli del revisore

- Sola lettura: nessun commit, push, merge o deploy.
- Nessuna modifica alla VPS, ai dati o ai provider.
- Nessuna chiamata reale ai provider.
- Il conteggio va **ricostruito** da requisiti, schede, PR e codice, non soltanto confermato.

## Ingressi

| File | Contenuto |
|---|---|
| `docs/governance/master/requirements.jsonl` | 1 358 requisiti, di cui 1 173 attivi, con stato, codice e test |
| `docs/governance/master/cards.jsonl` | le 376 schede originali |
| `docs/governance/master/pr-plan.json` | 270 PR pianificate, esiti delle schede, requisiti completati |
| `docs/governance/master/pr-plan-reconciliation.json` | ogni conteggio espanso per ID (rigenerabile con `node tools/governance/pr-plan.mjs reconcile`) |
| `docs/governance/master/pr-plan.md` | tabella leggibile |
| `docs/governance/master/audit/baseline-270.json` | baseline congelata con SHA e hash |
| `docs/governance/owner-decisions.json` | decisioni owner vigenti |
| il codice di `main` | per verificare stati e residui |

## Verifiche richieste

1. **Formula.**
   - Schede: `376 = 1 + 12 + 23 + 340`.
   - PR: `270 = (340 − 139) + 69 = 8 + 262`.

   Verificare per ID:
   - le 19 righe di pianificazione deduplicate (`prs.planning_rows_deduplicated`): lavoro pianificato due volte dai verificatori di gruppo, unito alla riga gemella **prima** del conteggio. 17 sono fra gruppi diversi, 2 interne a G5 (assorbite in 151 e 234). Non sono PR dell'inventario e non sono schede assorbite: sono un oggetto diverso dalle 139 schede assorbite (`absorbed_cards`). Sono già riflesse nelle 270 PR finali e non vanno sottratte di nuovo. Correzione dopo il finding P2 di Codex sulla PR #292;
   - le 69 PR senza scheda primaria (`prs.split_out`, con l'origine): 42 da epiche R-xx, 23 seconde PR di una scheda, 2 PR aperte, 2 prerequisiti o record di certificazione;
   - nessuna scheda scomparsa e nessuna PR contata due volte;
   - le 8 PR aperte, comprese #286 e #287;
   - le 262 PR nuove.
2. **Le 27 PR eliminabili** (`uncertainty.removable_by_decision`). Classificare ognuna come MANDATORY, OPTIONAL, DEFERABLE, SUPERSEDED o OWNER DECISION REQUIRED. Riportare tre scenari:
   - tutte mantenute;
   - solo le obbligatorie;
   - il perimetro consigliato.
3. **Le 58 PR a rischio di scissione** (`uncertainty.split_risks`). Classificare ognuna come KEEP SINGLE, SPLIT REQUIRED, SPLIT RECOMMENDED o UNCERTAIN, con le PR risultanti e l'impatto numerico.
4. **Le 34 coppie accorpabili** (`uncertainty.merge_pairs`). Esito per coppia: confermata, respinta o incerta. Nessun accorpamento SAFE con MANUAL, e nessun doppio conteggio con le eliminabili.
5. **Copertura.** I 1 173 requisiti attivi devono essere coperti da una PR o completati con evidenza. Verificare i 33 completati: 4 con certificato, 29 con regola applicata da un test (`IMPLEMENTED ≠ TESTED ≠ HARD VERIFIED REAL ≠ CERTIFIED ≠ DEPLOYED`).
6. **Nuovo intervallo.** Numero centrale, minimo e massimo giustificati, ogni variazione rispetto a 270 legata a ID.

## Rapporto atteso

- **A.** Validità del conteggio: PASS, PASS WITH RESERVATIONS o FAIL.
- **B.** Classificazione delle 27 PR eliminabili e decisioni owner richieste.
- **C.** Le 58 scissioni: obbligatorie, consigliate, da tenere intere.
- **D.** Accorpamenti confermati e respinti, e doppi conteggi trovati.
- **E.** Copertura verificata, requisiti scoperti, requisiti dichiarati completati impropriamente.
- **F.** `PR RESIDUE VERIFICATE: N`, `INTERVALLO: Nmin–Nmax`, `PR GIÀ APERTE: X`, `PR NUOVE: Y`, `DECISIONI OWNER PENDENTI: Z`.
- **G.** Finding con gravità P0–P3, evidenza (file e righe), impatto, correzione proposta ed effetto sul conteggio.

## Comandi riproducibili (sola lettura)

```
node tools/governance/pr-plan.mjs validate
node tools/governance/pr-plan.mjs counts
node tools/governance/pr-plan.mjs reconcile
node --test test/pr-plan.test.mjs test/master-registry.test.mjs
node tools/governance/master.mjs validate
```

## Analisi del produttore (non indipendente)

`producer-analysis.json` raccoglie l'analisi delle 27 PR eliminabili, delle 34 coppie e delle 58 scissioni, svolta da agenti della stessa famiglia del produttore. È un punto di partenza da verificare, non un esito d'audit.
