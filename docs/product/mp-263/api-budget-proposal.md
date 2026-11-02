# Proposta di budget API-FOOTBALL (MP-NEXT-20261102) — solo pianificazione, NON attivata

**Stato: PROPOSTA.** Non è una decisione owner e non è configurata da nessuna parte. Nessuna variabile d'ambiente di produzione è stata modificata. Il collector PREMATCH (#283) resta spento finché l'owner non dà il GO di produzione.

## Ripartizione proposta: massimo 1 500 chiamate al giorno

| Quota | Chiamate/giorno | Uso | Dove si applica |
|---|---|---|---|
| PREMATCH | 900 | scoperta `/fixtures` e `/odds` per partita | `APIFOOTBALL_PREMATCH_CALLS_PER_DAY=900` (collector, #283) |
| LIVE e benchmark | 400 | snapshot LIVE e benchmark TotalCorner | nessun collector LIVE esiste ancora: serve una PR dedicata, dopo PIT LIVE (#280) |
| Controlli e margine | 200 | `/status`, verifiche manuali, retry | parte del limite del client |
| **Totale client** | **1 500** | | `APIFOOTBALL_REQUESTS_PER_DAY=1500` |

Il budget del client si applica a tutte le finalità. Ciascun consumatore ha poi il proprio budget, contato sul ledger per `purpose`.

Il retry del client (uno per richiesta) può superare di **una** chiamata il budget del collector: è documentato nella #283. Il margine di 200 lo copre.

## Fatti e limiti
- **Piano.** Dalla verifica reale del 01/11/2026 risultano piano Pro e 7 500 chiamate al giorno. La proposta ne usa al massimo il 20%.
- **Chiave condivisa.** La chiave è condivisa con altri client, quindi i contatori del provider non sono una contabilità affidabile. MatchPilot conta sul proprio ledger. Un contatore del provider a zero ferma comunque le chiamate.
- **Scadenza del piano Pro (25/11/2026): NON VERIFICATA.** Per verificarla serve una chiamata `/status`, che non è autorizzata in questo mandato. Il connettore MCP API-FOOTBALL in questa sessione non era raggiungibile. Prima del GO va verificata, così come il rinnovo: **una spesa di rinnovo è una decisione owner separata.**
- **Per minuto.** Va scelto entro il limite del piano, che non è verificato in questo mandato. Proposta prudente: collector a 10 al minuto, client a 30 al minuto.

## Stima di quanto coprono 900 chiamate PREMATCH
Con L leghe, una scoperta per lega e per ciclo, N partite nella finestra e un intervallo di I minuti per partita, si spendono circa `cicli × L + N × (24·60 / I)` chiamate al giorno. Per esempio, 10 leghe, 12 cicli al giorno, 60 partite e I = 180 minuti danno circa 120 + 480 = 600. Con l'intervallo minimo di 5 minuti il budget si esaurirebbe in poche ore: il collector si fermerebbe da solo, ma la configurazione va dimensionata.

## Decisioni owner richieste
1. Approvare o modificare la ripartizione.
2. Scegliere leghe, finestra e intervallo per partita.
3. Verificare scadenza e rinnovo del piano, con l'eventuale spesa.
