# MatchPilot — mock UX vivo

## File corrente

- File: [`matchpilot-trading-os.html`](matchpilot-trading-os.html), percorso stabile. Le versioni non cambiano nome: la storia è in git e in questo changelog.
- Versione: **Mock UX v2026.10.06**
- Ultimo aggiornamento: 2026-10-06
- SHA-256: `eec17bf1e67eb29f6c1f4efe72db2769d75d726659a661af89832c2d25508d98`
- Allineato a: roadmap #97 (revisione owner 06/10/2026)
- Issue rappresentate: #12, #20, #23, #24, #25, #27, #28, #29, #30, #31, #32, #34, #40, #44, #45, #46, #87, #91, #94, #95, #96, #97, #98, #99, #100, #102

`test/mockup-alignment.test.mjs` fallisce se lo SHA-256 qui sopra non corrisponde al file. Ogni modifica al mock deve quindi aggiornare questo changelog.

## Contratto

Il mock è un riferimento UX/prodotto **vivo**. Non è l'architettura e non certifica nulla.

- Una funzione presente nel mock non è IMPLEMENTED, TESTED, HARD_VERIFIED_REAL, TOOL_VERIFIED né CERTIFIED.
- Se il mock contraddice una issue, si corregge il mock. Gerarchia: decisioni owner → #97 → issue di dominio → README / CLAUDE / AGENTS → `docs/` → mock.
- Ogni nuova feature, comportamento, stato, dominio, tool, impostazione, issue di prodotto o cambio UX con impatto visibile o concettuale aggiorna il mock nella stessa PR o nella stessa sequenza di PR pianificata. Ordine: issue/contratto → backend/dominio/API → docs → mock.
- Ogni pagina mostra una striscia PROTOTIPO o REAL + DEMO. REAL solo per valori letti dalle route certificate.

## Parti DEMO e parti REAL

| Area | Natura | Fonte |
| --- | --- | --- |
| Stato dati › FutPythonTrader, Campionati e stagioni, Riparazioni automatiche, Consumo delle richieste, Richieste per esito | **REAL** | route pubbliche MatchPilot `/api/fpt/*` e `/api/futpython-certificate`, lette il 2026-10-06 alle 08:01 UTC |
| Stato dati › conteggio 325 campi | **REAL** | stesso certificato; la ripartizione per famiglia è DEMO |
| Partite, quote, live, segnali, strategie, backtest, posizioni, ledger, P/L | DEMO | `rng()`, array fissi, quote generate |
| Replay | DEMO REPLAY | dati generati, non raccolti live (TotalCorner live non ancora certificato, #20) |
| Trading Tools | DEMO | il backend certificato userà Decimal/fixed precision; il mock usa `Number` solo per visualizzazione |
| Impostazioni, profili MM, stato operativo | DEMO, persistenza simulata in `localStorage` | nel prodotto la fonte di verità è il database account-level (#95 / #96) |
| Regole di mercato | bozza DEMO | da verificare sulle regole ufficiali del venue (#100) |

## Funzioni future rappresentate

- **Trading Copilot #102** nella pagina partita: pre-partita, live senza posizione (WATCHING, NEAR_MATCH, ARMED, BLOCKED, INVALIDATED, EXPIRED, NO_TRADE), entry candidate, posizione aperta (P/L live, matrice P/L per esito, movimento prezzo), intent HOLD / PARTIAL_HEDGE / FULL_HEDGE / CASHOUT / EXIT / STOP / NO_ACTION con `LIQUIDITY_UNAVAILABLE`, settlement e post-mortem, provenance.
- **STOP OPERATIONS / RESUME OPERATIONS** su profilo MM e Copilot: `ACTIVE_OPERATIONAL`, `ADVISORY_ONLY`, `PAUSED`, `ARCHIVED`, con audit.
- **Profili MM con versioni immutabili**: `profile_id` stabile, storico versioni, `active_version`, rinomina senza nuova versione, duplica, default, archivia, eliminazione solo se mai referenziato.
- **Replay + Money Management**: selettore "Nessuno — solo replay", sessione di simulazione separata, marker ENTRY / BLOCK / HEDGE / SETTLEMENT, Reset simulazione, cambio MM solo in pausa, Copilot nel replay, nessun dato futuro, opzione "Nascondi il finale".
- **#99** separato da #96: conto, posizioni, netting, ledger append-only e ciclo di vita della posizione.
- **#100** Market Rules: registro concettuale delle regole di settlement.
- **Assistente globale #44** distinto dal Trading Copilot #102.
- **Mappa integrazioni** con fasi 0–16 di #97, tool/API incrementali, ownership e ciclo di certificazione.

## Gap noti

- Il bankroll separato per profilo è disattivato: "Previsto — accounting #99 non ancora implementato".
- I Trading Tools multi-leg calcolano gli intent per singola leg; l'aggregazione per mercato verrà da #99.
- La liquidità non è certificata: ogni ordine teorico è `LIQUIDITY_UNAVAILABLE`.
- Le regole di mercato sono una bozza, non regole del venue verificate.
- Nessun tool #98 esiste: le "fonti" mostrate dal Copilot sono nomi di tool previsti.
- Il layout usa font Google; senza rete il menu desktop può tagliare l'ultima voce.

## Changelog

### v2026.10.06 — riallineamento a #97

- Nuovo percorso stabile `docs/mockups/matchpilot-trading-os.html`. I file in `docs/reference/` restano come snapshot storici.
- Roadmap riscritta sulle fasi 0–16 di #97; tolto l'ordine della master #3 del 5 ottobre.
- Contabilità, posizioni, netting, ledger e settlement attribuiti a #99; regole di mercato a #100.
- Profili MM con versioni immutabili al posto della modifica in place; registry sul ciclo #97 (niente più MAPPED).
- Trading Copilot #102, STOP/RESUME, Replay + MM, assistente globale #44.
- Tolta la frase "salvate sul tuo account, non nel browser": il prototipo dichiara la persistenza simulata.
- Etichette REAL / DEMO su ogni pagina; banner DEMO sul backtest; DEMO REPLAY nel replay; nota Decimal nei Trading Tools.
- Corretto un errore preesistente dell'editor strategie, riaperto con la scheda JSON attiva.

### 2026-10-06 (v2) e 2026-10-05

Snapshot storici in [`../reference/`](../reference/README.md).
