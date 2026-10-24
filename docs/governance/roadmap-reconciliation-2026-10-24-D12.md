# Riconciliazione della roadmap dopo la ratifica D12 (24/10/2026)

## Fonti

- **Ratifica owner:** MP-UI-D12-DECISIONS-20261024, [#239 comment 6388524544](https://github.com/zarbopiero963-droid/MatchPilot/issues/239#issuecomment-6388524544). Contiene 19 decisioni.
- **Audit atomico:** [#239 comment 6386194763](https://github.com/zarbopiero963-droid/MatchPilot/issues/239#issuecomment-6386194763) e i 14 commenti successivi.
- **Mandato operativo:** MP-OWNER-D12-IMPLEMENTATION-20261024.

Queste fonti sono registrate in `docs/governance/owner-decisions.json`. La voce D12 elenca, per ciascuna delle 19 decisioni:
- il comportamento approvato;
- le issue e le PR di destinazione;
- i requisiti risolti e quelli toccati;
- i criteri di accettazione;
- le dipendenze;
- i dettagli ancora da specificare.

Questo documento è un **riepilogo**. In caso di divergenza prevalgono il registro e il commento owner.

## Matrice dei requisiti

`docs/governance/ui-requirements-matrix.json` è la copia canonica, versionata, della matrice pubblicata in #239.

- **Contenuto:** 1.090 requisiti approvati e 10 proposte non approvate, una riga ciascuno. Ogni riga riporta fonte, decisione owner, comportamento, criteri, dipendenze, fase, PR responsabile, stato, evidenza, blocker, priorità, dati e presenza nel mock e nel prototipo.
- **Tracciabilità:** sono conservate anche le 72 righe accorpate e poi scomposte (`superseded`, con le destinazioni risolte sugli id canonici; il campo `splits` delle righe figlie) e i 37 alias degli indicatori presenti sia in #28 (1200–1236) sia in #34 (0460–0496) (`aliases`).
- **Impatti delle decisioni:** `resolves` elenca i requisiti di cui la decisione chiude lo stato DECISION REQUIRED. `impacts_lexical_candidates` (nella matrice `d12_candidate_impacts`) elenca le corrispondenze per parola chiave: sono candidati da confermare nella PR di destinazione, non una mappatura verificata.
- **Testo delle decisioni:** il campo `decision` di ogni item è la copia letterale della ratifica, conservata in `docs/governance/owner-ratifications/MP-UI-D12-DECISIONS-20261024.md`; il test lo verifica. Titoli, PR, criteri, dipendenze e dettagli da specificare sono una mappatura dell'agente, non testo approvato dall'owner.
- **Verifica:** `test/ui-requirements-matrix.test.mjs` controlla che:
  - restino 1.090 requisiti approvati, ciascuno con una destinazione;
  - nessuna riga sia in DECISION REQUIRED;
  - ogni PR citata sia nel registro;
  - nessuna riga dichiari una certificazione che `docs/qa/feature-certification.json` non contiene;
  - ogni decisione D12 punti a requisiti esistenti e riporti alla lettera il testo della ratifica;
  - ogni destinazione sia una PR o una categoria ammessa, e ogni stato verificato citi un test.
- **Correzioni dalla review della PR #250:** 4 requisiti dichiarati TESTED o CERTIFIED CALCULATION senza alcun test che ne asserisca il comportamento tornano IMPLEMENTED, con il motivo nell'evidenza (0631, 0641, 1042, 1052). Ad altri 12 è stata aggiunta l'evidenza del test esistente.
- **Stati:** sono quelli verificati su main a `c110291`. Uno stato sale a TESTED o CERTIFIED solo con l'evidenza dei registri QA, mai per la ratifica.

**Effetto della ratifica sugli stati.** I 49 requisiti in DECISION REQUIRED (35 indicatori e 14 altri) sono stati risolti così.
- **37 indicatori → PENDING SPECIFICATION:** valutazione KEEP/MERGE/REJECT. Sono i 35 in DECISION REQUIRED più i n. 35 e 36, prima NOT STARTED.
- **2 casi di regole di mercato → PENDING SPECIFICATION:** partite annullate e supplementari di coppa.
- **3 requisiti → BLOCKED:**
  - certificazione REAL rinviata (D12-6);
  - AI spenta finché il costo non è autorizzato (D12-14), 2 requisiti.
- **8 requisiti → NOT STARTED:** DEMO Live e Replay (2), Rule Builder (2), menu, watchlist, STOP, viste protette.
- **1 requisito → IN PROGRESS:** è questo riallineamento.

## Regola di sviluppo (D12-19)

**Sviluppo incrementale della UI in parallelo ai backend necessari, una PR alla volta, con i gate obbligatori.**

**Superato, solo per la sequenza della UI:**
- #97 «BACKEND/API FIRST → UI LAST», cioè la voce «15. UI finale» dell'ordine canonico intesa come unico momento della UI;
- #104 regola di consolidamento 2, «Non riaprire PR UI prima della fase 15 #97».

**Resta in vigore:**
- l'ordine e l'ownership dei domini backend di #97 e #104;
- il backend e le API sono l'unica autorità: la UI non contiene logica finanziaria autorevole (MP-WEB-011) e mostra solo contratti del server;
- una PR alla volta, Gate A/B, Browser QA, review indipendente, chiusura delle issue riservata all'owner;
- i requisiti e la matrice dei 1.090 requisiti;
- la storia: i testi di #97 e #104 e le loro copie in `docs/governance/issues/` non vengono riscritti. Questo documento e il registro ne segnano il superamento parziale.

Una pagina che dipende da un backend non ancora certificato parte quando quel backend esiste. Fino ad allora mostra lo stato «non disponibile» oppure un DEMO etichettato (D12-1). Non viene mai simulata come reale.

## Modalità operativa in vigore

- **Nessun merge e nessun deploy.** L'auto-merge di MP-AUTOMERGE-RESTORED-20261024 è sospeso: ogni merge richiede un'autorizzazione owner esplicita.
- **Non autorizzati:**
  - migrazione dello schema e attivazione del login in produzione;
  - riavvio dei collector;
  - TotalCorner, Render e Neon;
  - spese e AI a pagamento;
  - trading reale.
- **Sequenza:**
  1. **A:** questa PR di governance.
  2. **B:** MP-UI-PR-006 Strategie, dopo il merge autorizzato di A.
  3. **C:** MP-UI-PR-007 Fondamenta, dopo il merge autorizzato della 006. Comprende tablet nei test, badge DEMO/PIT/NON_PIT/NON DISPONIBILE, matrice degli errori HTTP e regressione desktop/tablet/mobile.
  4. Poi le PR del registro, una alla volta.

## Effetti sul registro delle PR (#239, commento 2/15)

La numerazione e le schede restano invariate. Si aggiunge solo MP-UI-PR-079-WATCHLIST, in coda, senza rinumerazioni.

| PR | Decisione | Effetto |
|---|---|---|
| 009 NAV | D12-5 | si evolve il menu dell'app reale: NOT STARTED, non più in attesa di decisione |
| 012 DATAQ, 067 APIREG, 066 SESSION | D12-18 | viste tecniche e API sensibili protette; in produzione resta il vincolo del login |
| 018 HUBMARKETS, 021 HUBTRADE | D12-15 | prima la specifica testata di bande, forza dell'avversario, IC di C19 e criteri di C20 |
| 030 LIVE-DEMO, 034–036 Replay | D12-1, D12-9 | DEMO etichettato ammesso; Replay su #40 solo in lettura, dopo R-02 e cambi infrastrutturali autorizzati |
| 033 LIVEMATCH | D12-16 | criteri di near-match deterministici, documentati e configurabili; nessun ±10 % fisso |
| 039 RULEDSL, 040 RULEFIELDS, 041 RULETYPES | D12-4, D12-17 | albero AND/OR/NOT tipizzato e con profondità limitata; N minimo per statistica e avviso visibile finché manca |
| 043 INDLIB, 044 IND-EXPLAIN | D12-3 | KEEP/MERGE/REJECT dei 37 candidati; nessun indicatore senza formula ratificata |
| 048 MMREG, 051 MMPROF, 060 TT-PROGRESSIONS | D12-8 | tutti i modelli del catalogo approvato; prima specifica e formule ratificate, nessun cap di default |
| 049 MKTRULES | D12-13 | regole per mercato con fonte verificata; i casi ambigui restano irrisolti |
| 052 OPMODE | D12-12 | STOP a livello di account e di profilo; lo STOP di account prevale; server autorevole, stato durevole e auditabile |
| 055 TT-PREMATCH-SELECTOR, 023 MCF-STATE | D12-10 | le quote FPT senza ora di cattura si usano solo con l'avviso NON_PIT |
| 068 ASSIST, 076 COP-ASK | D12-14 | spenti finché il costo non è autorizzato; stato disabilitato onesto |
| 078 CERT12 | D12-6 | certificazione REAL rinviata a dataset verificati, deploy autorizzato e URL verificabile |
| **079 WATCHLIST** (nuova) | D12-7 | watchlist persistente sul server, per utente, protetta da login; nessun accesso pubblico |
| hard test #29/#28 | D12-2 | VPS isolata più replay degli snapshot esistenti; certificazione limitata al perimetro replay |
| Poisson (strumento esistente) | D12-11 | λ resta un input manuale |

## Money Management e progressioni (D12-8)

La ratifica approva lo scope: tutti i modelli del catalogo approvato. Non approva algoritmi ancora indefiniti.

Il lavoro procede in quest'ordine. Il passo 3 è una PR di specifica, senza codice di produzione, da sottoporre all'owner:
1. inventario completo dei modelli, riconciliato con `src/mm/registry.mjs`, #96 e #94;
2. riconciliazione delle formule già specificate (Recovery, Martingala e i modelli implementati) con quelle esistenti nel codice;
3. per ogni modello senza formula approvata, una proposta tecnica con alternative ed esempi numerici: regola di avanzamento di Fibonacci, variante di perdita di Labouchere, modelli DISCOVERED;
4. per ogni modello approvato:
   - specifica matematica e finanziaria;
   - casi limite;
   - arrotondamento;
   - liability BACK/LAY;
   - stato dopo WIN, LOSS, VOID e PUSH (DEC-013);
   - controllo della disponibilità dei fondi;
   - vettori di test deterministici;
5. implementazione incrementale, un modello o una famiglia per PR.

Vincoli:
- nessun cap monetario di default;
- nessuna esecuzione reale;
- i modelli che richiedono una scelta dell'owner restano bloccati uno per uno fino alla ratifica.

## Indicatori (D12-3)

I 37 indicatori (matrice 0460–0496) sono candidati. Per ciascuno l'agente prepara:
- definizione;
- formula proposta;
- input e finestra;
- N minimo (D12-17);
- pesi e soglie;
- regola PIT;
- disponibilità PREMATCH, LIVE o STORICO;
- vettori di test;
- esito proposto: KEEP, MERGE o REJECT con motivo.

L'owner ratifica le scelte sostanziali prima dell'implementazione. Le formule concettuali di #28 sono:
- n. 19, Fair Price Gap: segno BACK/LAY e modello ancora da definire;
- n. 35, `xG − gol`;
- n. 36, `gol − xG`.

Sono il punto di partenza, non una formula approvata.

## Autorizzazioni ancora pendenti

Restano riservate all'owner, non sono decisioni di prodotto:
- migrazione dello schema di persistenza in produzione;
- attivazione del login in produzione;
- qualsiasi deploy VPS;
- costi di AI o provider.

Refs #239 #97 #104
