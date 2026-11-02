# Schede decisionali owner — MP-ROADMAP-BASELINE-282-PREFLIGHT-01

Le cinque PR pianificate classificate **OWNER DECISION REQUIRED** dall'audit del 02/11/2026 ([rapporto](https://github.com/zarbopiero963-droid/MatchPilot/issues/288#issuecomment-6583390410)).

Restano tutte nel piano finché l'owner non decide. Nessuna è stata eliminata.

L'effetto sul conteggio si misura rispetto alla baseline ufficiale **270**. Ogni rimozione o riduzione resta tracciata: i requisiti restano nel registro, e un rinvio non è mai un completamento.

---

## DC-002 — MP-PRP-002: registrazione delle decisioni owner aperte

**Contesto.** È una PR di governance, MANUAL perché tocca il registro normativo, ed è senza effetti a runtime. Registra in `owner-decisions.json` le risposte dell'owner su 8 requisiti in conflitto o non risolti: MP-REQ-0307, 0377, 0843, 0899, 0893, 0675, 1139, 1220. Issue d'origine: #20, #23, #40, #97, #150, #225.

**Punti aperti e decisioni già in vigore:**

| Punto | Domanda | Stato |
|---|---|---|
| a | La UI incrementale supera il gate «UI per ultima» di #97? | Chiuso nella sostanza da MP-UI-D12-DECISIONS-20261024 (voce 19), MP-UI-ROADMAP-01 e MP-UI-INCREMENTAL-13 |
| b | scrypt è accettato come «hash robusto» invece di Argon2id? | **Aperto**: MP-OWNER-D12-OWNER-LOGIN-20261019 dice «robust hash» senza nominare l'algoritmo |
| c | Perimetro con API-FOOTBALL principale e TotalCorner solo LIVE | Chiuso da MP-OWNER-GO-2026-11-01 |
| d | DEC-001 chiude il punto aperto di 0675? | Chiuso nella sostanza da DEC-001 |
| e | Conferma testuale N-5 delle decisioni trascritte da agenti | **Aperto** |
| f | L'audit forense FPT resta attivo dopo la dismissione? | **Aperto** |

**Opzioni.**
- **A. Mantenere la PR, consigliata.** Una sola PR registra a, c e d come chiusi, citando le decisioni, e raccoglie le risposte su b, e, f. Conseguenze:
  - gli 8 requisiti escono dallo stato di conflitto;
  - nessun effetto sul prodotto;
  - conteggio invariato.
- **B. Rispondere ora a b, e, f in un mandato owner.** La registrazione confluisce in MP-PRP-001, che registra già le decisioni.
  - Conteggio: **−1**.
  - È l'accorpamento 001+002 escluso dal calcolo perché la 002 è eliminabile, quindi non c'è doppio conteggio.
- **C. Non decidere.** Gli 8 requisiti restano in conflitto e bloccano la certificazione integrata (MP-CARD-900). Sconsigliata.

**Raccomandazione:** opzione **B** se l'owner può rispondere subito a b, e, f; altrimenti **A**. Sicurezza: il punto b riguarda l'algoritmo di hash delle password e va deciso esplicitamente in ogni caso.

---

## DC-021 — MP-PRP-021: periodo di sovrapposizione tra provider

**Contesto.** PR SAFE. Calcola, per ogni competizione e provider, la prima e l'ultima stagione disponibili e il periodo di sovrapposizione tra coppie di provider. Requisiti MP-REQ-0278 (in conflitto), 0360 (non risolto) e 0634; issue #12, #20, #34.

Decisioni coinvolte:
- DEC-003 (perimetro FPT/TC; i dati solo FPT non vanno mai mostrati come certificati congiunti);
- OWN-2026-10-06-SCOPE (in parte superata);
- MP-OWNER-GO-2026-11-01 (API-FOOTBALL principale, FPT dismesso, TotalCorner solo candidato LIVE).

**Opzioni.**
- **A. Mantenere la PR ridotta alla sovrapposizione API-FOOTBALL × archivio FPT congelato, consigliata.** Conseguenze:
  - serve a dire per quali stagioni le partite API-FOOTBALL e le quote FPT archiviate coesistono, cioè l'idoneità al backtest e l'etichetta «congiunto o singolo provider» richiesta da DEC-003;
  - la coppia API-FOOTBALL × TotalCorner cade finché TotalCorner è sospeso;
  - conteggio invariato.
- **B. Rinunciare alla sovrapposizione come obiettivo.** Conteggio **−1**.
  - I 3 requisiti restano registrati, rinviati con una decisione esplicita.
  - Il backtest perde la prova di copertura del suo perimetro.
- **C. Mantenere anche la coppia API-FOOTBALL × TotalCorner.** Conteggio invariato, ma è lavoro inutile finché TotalCorner è sospeso.

**Raccomandazione:** opzione **A**, con una riformulazione esplicita del perimetro che chiuda il conflitto di MP-REQ-0278.

---

## DC-029 — MP-PRP-029: certificazione del core TotalCorner e test negativi OFF

**Contesto.** PR SAFE. Il codice è già su `main` (PR #130–#145); manca la certificazione. Requisiti: MP-REQ-1011…1014, 0304, 0305, 0309, 0311, 1158, 1176, 0333, 0306. Issue #20, #104, #179, #182.

Decisioni coinvolte:
- DEC-003 e DEC-007 (TotalCorner resta spento);
- MP-OWNER-DECISIONS-D1-D9-20261018.D6 e .D9 (la #20 resta aperta finché non è certificata per intero);
- MP-VPS-ONLY-OPERATIONS-2026-10-21;
- MP-OWNER-GO-2026-11-01.

Verdetto attuale del benchmark: INSUFFICIENT EVIDENCE.

**Opzioni.**
- **A. Mantenere la PR ridotta, consigliata.** Restano:
  - i test negativi «collector spenti per default» e «la sospensione non cancella nulla» (MP-REQ-1158, 1176);
  - le verifiche di conservazione dei dati grezzi (0333) e di assenza di token nel ledger (0305).

  La certificazione del core TotalCorner sui dati catturati è rinviata dietro il verdetto del benchmark. Conteggio invariato.
- **B. Abbandonare TotalCorner.** La certificazione del core cade, ma i test negativi OFF e i controlli di non-cancellazione restano obbligatori come controlli di costo e sicurezza. Per non perderli si spostano in MP-PRP-042 o restano in una 029 ridotta.
  - Conteggio: **0** se restano in una 029 ridotta, **−1** se confluiscono in un'altra PR.
- **C. Tenere TotalCorner.** Certificazione completa del core; conteggio invariato, e restano anche 026, 027 e 028 (rinviabili).

**Raccomandazione:** opzione **A**. Sicurezza: i test negativi OFF **non** sono eliminabili in nessuno scenario.

---

## DC-082 — MP-PRP-082: benchmark GOAT (#27)

**Contesto.** PR MANUAL. Produce la tabella di verdetto ex ante sulla qualità delle decisioni di trading: GOOD TRADE, BAD TRADE, NO TRADE, UNVERIFIED. Requisiti MP-REQ-0415, 0416, 0417 (in conflitto) e 1076; issue #27, #104. Dipende dalle PR di replay e backtest certificati (071, 079) e dal trading engine (#28).

Decisioni coinvolte:
- MP-OWNER-GO-2026-11-01: il benchmark era definito su FPT+TC;
- MP-PRODUCT-100: nessuna affermazione di qualità senza benchmark verificabili;
- MP-OWNER-DECISIONS-D1-D9-20261018.D3: fuori dal denominatore v1, ma la roadmap è approvata (MP-FUT-021).

La decisione «MP-PROVIDERS-2026-10-31», citata nelle issue, **non** è registrata in `owner-decisions.json`.

**Opzioni.**
- **A. Mantenere la PR, ribasata su API-FOOTBALL e archivio congelato, consigliata.** Conseguenze:
  - l'unica via per una dichiarazione di qualità verificabile;
  - parte dopo #28;
  - conteggio invariato.
- **B. Rinviare dopo il trading engine (#28) come fase successiva.** Conteggio invariato nel piano completo; esce dal perimetro v1 solo con una decisione esplicita.
- **C. Abbandonare il benchmark.** Conteggio **−1**. MatchPilot non potrà dichiarare la qualità delle decisioni, cosa che MP-PRODUCT-100 vieta comunque senza benchmark.

**Raccomandazione:** opzione **A**, insieme alla registrazione formale della decisione sui provider (MP-PROVIDERS-2026-10-31 o equivalente) in `owner-decisions.json`.

---

## DC-233 — MP-PRP-233: build di produzione del frontend

**Contesto.** PR MANUAL. Prevede minificazione, tree-shaking, mangle, nessuna source map pubblica e rimozione del debug. Oggi il frontend è fatto di file statici serviti senza build. Requisito MP-REQ-0570; issue #32.

Decisioni coinvolte:
- commento 6012401944 sulla #32 (fase di hardening pre-rilascio);
- MP-FUT-008 (hardening avanzato);
- MP-UI-INCREMENTAL-13 e MP-FRONTEND-CLAUDE-DIRECT-E2E-01 (frontend proprietario senza bundler).

**Opzioni.**
- **A. Nessun build step.** I due controlli di sicurezza, «nessuna source map servita» e «nessun output di debug», diventano test negativi in MP-PRP-240 o MP-PRP-042.
  - Conteggio **−1**.
  - Il codice client resta leggibile: l'offuscamento protegge poco, perché il codice client è pubblico per natura.
- **B. Rinviare alla fase di hardening pre-rilascio insieme a 240, consigliata.** Conteggio invariato. Sposto subito i due test negativi in 240 o 042, così la parte di sicurezza non dipende dalla decisione.
- **C. Introdurre ora un build step.** Conteggio invariato, ma cambia l'architettura del frontend: tocca il gate di Browser QA e le baseline visive.

**Raccomandazione:** opzione **B**. In ogni caso i test «nessuna source map / nessun debug» vanno pianificati, perché sono controlli di esposizione delle informazioni.

---

## Effetto massimo sul conteggio

Se l'owner sceglie tutte le opzioni che riducono il conteggio (DC-002 B, DC-021 B, DC-029 B con i test spostati, DC-082 C, DC-233 A), il totale scende al massimo di **−5**, da 270 a 265, oppure da 282 a 277 sulla candidata.

Con le raccomandazioni (DC-002 B se possibile, altrimenti A; tutte le altre come raccomandato) l'effetto è **0 o −1**.
