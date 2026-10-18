## Cosa cambia

<!-- Descrizione breve della modifica. -->

## Tracciabilità

- Issue: Refs #<!-- numero; mai parole chiave di auto-chiusura: solo l'owner chiude le issue -->
- PR roadmap (R-xx in `docs/governance/mp-pr-00/requirements.json → pr_registry`):
- Card #104 collegate:
- Requisiti (ID):
- Decisioni owner applicabili (`docs/governance/owner-decisions.json`):

## Roadmap #97

- Fase #97 implementata:
- Owner di dominio (#94 / #95 / #96 / #100 / #99 / #34 / #28 / #45 / #44 / #102 / dati):
- Superficie tool/API resa disponibile o modificata:

## Gate A — requisiti e tracciabilità

- Comportamento, invarianti, I/O, failure mode, dipendenze, criteri di accettazione:
- Conflitti owner irrisolti: nessuno / elenco

## Gate B — test eseguiti (comando, risultato, ambiente, commit, limiti)

- Test automatici:
- Test matematici / oracle (solo dove c'è matematica):
- Hard test (offline D5 o reali), con evidenza:
- Controlli non eseguiti → NOT VERIFIED / BLOCKED con motivo:

## Mock UX

Questa modifica richiede un aggiornamento del mock MatchPilot? **SÌ / NO**

- Se SÌ: aggiornati `docs/mockups/matchpilot-trading-os.html` e `docs/mockups/README.md` (changelog e SHA-256).
- Se NO: motivo in una riga.

Il mock non certifica nulla: nessuna funzione presente solo nel mock è dichiarata IMPLEMENTED, TESTED o CERTIFIED.

## Review, checkpoint e merge (AGENTS.md §4–§6)

- Review indipendente (D2): link al rapporto con verdetto esplicito sul head
- Checkpoint: `docs/governance/checkpoints/<id>.json`
- Auto-merge solo se `node tools/governance/cli.mjs merge-gate` è soddisfatto; nessun deploy, costo, produzione o LIVE

## Checklist

- [ ] README / CLAUDE / AGENTS sincronizzati se cambiano stato, architettura, contratto, endpoint, roadmap o limiti
- [ ] nessun secret in codice, fixture, log, checkpoint o output di test
- [ ] nessun trade reale, puntata o modifica a conti esterni
- [ ] CI verde
