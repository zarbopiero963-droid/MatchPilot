# MatchPilot — mock UX vivo

## File corrente

- File: [`matchpilot-trading-os.html`](matchpilot-trading-os.html), percorso stabile. Le versioni non cambiano nome: la storia è in git e in questo changelog.
- Versione: **Mock UX v2026.10.31c**
- Ultimo aggiornamento: 2026-10-31
- SHA-256: `5beb076c6167330d0b9ab47a1e865beb09dd7cf9280ce26c77cf5d317fbb9fa8`
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

### v2026.10.31c — Filtri della Ricerca (MP-UI-PR-011-SRCHX)

- La nota del sito reale nella home elenca i filtri della Ricerca aggiunti: lato del favorito, quota casa, quota Over 2,5 e xG totali minimi, già supportati da `/api/v1/fpt/search`; il filtro per stagione arriva quando un'API elenca le stagioni.

### v2026.10.31b — Cerca nell'intestazione (MP-UI-PR-009-NAV)

- Il campo di ricerca dell'intestazione dice cosa fa nel sito reale: è su ogni pagina e apre i risultati con le squadre dell'archivio (nome esatto, dall'API), le loro partite in Ricerca e le pagine dell'app con quel nome. Nel mock filtra solo la home DEMO.

### v2026.10.31a — Copertura nell'app (MP-UI-PR-008-COV)

- Nella pagina Stato dati una nota descrive la copertura del sito reale dentro l'app (`#/coverage`): campionati, filtro per paese dal server, stagioni di ogni campionato; la pagina /coverage del server resta tecnica.

### v2026.10.24e — Fondamenta (MP-UI-PR-007)

- Nella pagina Backtest una nota descrive le fondamenta del sito reale: badge PIT / NON PIT sui risultati e nel Match Center, componente unico per DEMO, NON DISPONIBILE e N/D, stesse parole per ogni errore del server su ogni pagina con codice e «Riprova», campo rifiutato indicato dal campo strutturato del server, collaudo su desktop, tablet e telefono.
- I testi brevi dei badge proposti in Q6 (MP-REQ-UI-1044) non sono approvati: il badge dice il suo tipo.
- Il backtest del mock resta DEMO.

### v2026.10.24d — Strategie (MP-UI-PR-006, #34)

- Nella pagina «Le tue strategie» una nota descrive la pagina «Strategie» del sito reale: elenco, dettaglio con regole in parole e versioni, apertura in Simulazione, modifica salvata come versione successiva, clonazione di una versione precedente come nuova versione corrente, strategie private senza l'accesso del proprietario.
- La costante interna `MOCK_VERSION` torna allineata al changelog (era ferma a v2026.10.19).
- Rule Builder, Money Management della strategia, archiviazione, duplicazione e matching live del mock restano DEMO.

### v2026.10.24c — Strumenti di trading (MP-UI-PR-005, #94)

- Nella pagina Trading Tools una nota descrive la pagina «Strumenti» del sito reale: sette calcolatori di #94 calcolati dal server in Decimal, con inserimento manuale dichiarato e liquidità non disponibile.
- Selettore partita, cash-out, Dutching in banca, arbitraggio, Each Way, Draw No Bet, progressioni, esposizione e ottimizzatore del mock restano DEMO.

### v2026.10.24b — Shell: sessione del proprietario e piè di pagina (MP-UI-PR-004, #23)

- La nota sul sito reale descrive «Proprietario» ed «Esci» nell'intestazione con il login attivo, e il piè di pagina «analisi e simulazione, nessuna operazione di trading reale».

### v2026.10.24a — Salvataggi della simulazione (MP-UI-PR-003, #34, #99)

- La nota sul sito reale nella pagina Backtest descrive «Salva risultato», «Salva strategia» (versioni, codice breve) e «Backtest salvati», con lo stato «Salvataggio non disponibile» quando manca l'accesso del proprietario o l'archivio dei salvataggi non è attivo.
- I backtest salvati DEMO del mock restano DEMO: il sito reale li legge dall'API di persistenza.

### v2026.10.23c — Confronto di strategie (STRAT-CMP-01, #34)

- La nota sul sito reale nella pagina Backtest descrive il «Confronto di strategie»: 2–3 configurazioni sulla stessa lettura dei dati, affiancate senza classifiche.
- Il confronto DEMO dentro/fuori campione del mock resta DEMO.

### v2026.10.23b — Strategia personalizzata (STRAT-CFG-01, #34)

- La nota sul sito reale nella pagina Backtest descrive la strategia «Personalizzata» della Simulazione: regole validate dal server (selezione, Punta/Banca, intervalli di quota, squadra e sede), definizione registrata nel risultato, motivi delle mancate operazioni.
- Il Rule Builder e i backtest salvati del mock restano DEMO: le strategie del sito reale non sono ancora salvabili.

### v2026.10.23 — Simulazione reale (HIST-WEB-01, #34)

- Nella pagina Backtest una nota indica cosa fa la pagina «Simulazione» del sito reale (`#/sim`): backtest su `/api/v1/hist/backtest` con le partite archiviate, modalità rigorosa di default, «Ricerca esplorativa» sempre etichettata, risultato «Non certificato», valori dell'API senza calcoli nel browser.
- Le parti DEMO del backtest (curve, P/L per mese, backtest salvati, in/out-of-sample) non cambiano.

### v2026.10.19 — Daily Board, Dashboard e Ricerca reali (R-06b, #3, #30)

- Nella pagina Oggi una nota indica cosa mostra la Daily Board del sito reale (`#/board`): partite salvate del giorno da `/api/v1/fpt/matches`, in ordine di orario con il campionato su ogni scheda, quote, xG e stato dei dati, N/D per i valori assenti, paginazione con cursore.
- La stessa nota descrive la Ricerca reale (`#/search`) con i filtri di qualità dei dati (quote 1X2 complete, xG).
- La Dashboard reale (`#/`) legge salute dei dati, certificazione, copertura per campionato e report TotalCorner dalle route v1.
- Le parti DEMO del mock (segnali, live, bankroll, strategie) non cambiano.

### v2026.10.19 — accesso owner (R-04b, #23)

- "Esci" nel menu account apre la schermata di accesso owner (PROTOTIPO): utente e password, nessuna registrazione pubblica, credenziali gestite dall'ambiente del server. Rispecchia la pagina `/login` reale di R-04b (`docs/auth.md`), attiva solo con `MATCHPILOT_AUTH=enforce`.
- La schermata del mock non verifica credenziali: "Accedi" la chiude. La verifica, le sessioni, il limite ai tentativi e l'audit esistono solo sul server.

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
