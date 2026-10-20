# CLAUDE.md — MatchPilot per Claude Code

**Le regole operative canoniche sono in [AGENTS.md](AGENTS.md).** Questo file non le duplica: in caso di dubbio prevalgono AGENTS.md e il registro delle decisioni owner [`docs/governance/owner-decisions.json`](docs/governance/owner-decisions.json).

## Ingresso rapido

1. Leggere [AGENTS.md](AGENTS.md) §0 e le decisioni owner `IN_FORCE`.
2. `npm run governance:status`: attività, lease, ultimo checkpoint, prossima azione, divergenze.
3. Per riprendere un'attività: `npm run governance:resume -- <task>` e la procedura [`docs/governance/HANDOFF.md`](docs/governance/HANDOFF.md).
4. Roadmap canonica **#97**; requisiti e sequenza R-xx in `docs/governance/mp-pr-00/`.

## Promemoria vincolanti, dettagliati in AGENTS.md

- **Merge autonomo per classe** (AGENTS §4). Si classifica la PR con `tools/governance/merge-class.mjs` **preso dal commit base**.
  - AUTO-MERGE ELIGIBLE (UI, test, documentazione non normativa): merge autonomo con Gate A/B, CI verde, revisione di un agente in sessione separata (mai presentata come approvazione GitHub indipendente) e zero finding critici.
  - OWNER-GO REQUIRED: database, sicurezza, workflow, deploy, infrastruttura, collector, certificazione/PIT/backtest/settlement, costi, `AGENTS.md`, `CLAUDE.md`, policy. Serve il GO owner.

  Nel dubbio vale OWNER-GO. Un deploy VPS fallito o non verificato ferma i merge.
- **Issue** (AGENTS §5): **solo l'owner le chiude**. Si usa `Refs #N`; si pubblica `READY TO CLOSE — OWNER APPROVAL REQUIRED` solo a issue interamente certificata.
- **Checkpoint e handoff** (AGENTS §6): ogni ciclo lascia un checkpoint in `docs/governance/checkpoints/`; quando si interrompe il lavoro si pubblica `HANDOFF READY`.
- **Una PR di implementazione alla volta.** Ogni PR risponde: "Questa modifica richiede un aggiornamento del mock MatchPilot? SÌ / NO". Se SÌ si aggiornano `docs/mockups/matchpilot-trading-os.html` e `docs/mockups/README.md`.

## Specifico di Claude Code

- Nelle sessioni cloud il repository è un clone fresco. Per i test PostgreSQL locali: `FUTPYTHON_TEST_DATABASE_URL` punta solo a un'istanza locale usa-e-getta, e `test/postgres-independence.test.mjs` richiede PostgreSQL 17.
- Interazioni GitHub tramite gli strumenti MCP GitHub. Ogni commento o review termina con il footer di attribuzione di Claude Code.
- Nessun identificativo di modello nei file del repository, nei titoli o nei testi delle PR. Unica eccezione: le righe di attribuzione dei commit (`Co-Authored-By`) richieste dall'ambiente Claude Code. Questa regola deriva dall'ambiente, non da una decisione owner.
- **Prima di un merge:** usare `merge_pull_request` con `expectedHeadSha`. Non serve aspettare CodeRabbit se è bloccato da limiti di piano; in quel caso vale la review indipendente D2.
