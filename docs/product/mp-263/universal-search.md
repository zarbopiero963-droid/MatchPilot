# Ricerca universale (MP-SEARCH-01, MP-NEXT-20261102 punto A)

`GET /api/v1/search` applica le condizioni AND/OR/NOT di MP-CAP-03 a **qualunque campo** del catalogo delle capacità (`GET /api/v1/capabilities`), sull'archivio storico FutPythonTrader. Non c'è una lista fissa di filtri o di mercati, e nessun mercato ha priorità: Over 2.5 vale come qualunque altro campo.

**Stato:** IMPLEMENTATO e TESTATO, solo come API. La pagina dell'interfaccia è una PR separata, che richiede l'aggiornamento del mock.

## Parametri

| Parametro | Obbligatorio | Significato |
|---|---|---|
| `expr` | sì | JSON `{all:[…]}`, `{any:[…]}`, `{not:…}`, `{field, op, value}` con gli id del catalogo. Il limite reale è la query di 2 048 caratteri: dopo la codifica URL circa 600–700 caratteri di JSON. |
| `decision` | sì | `PREMATCH` (solo i campi noti prima del calcio d'inizio) oppure `POSTMATCH` (ricerca su partite concluse) |
| `from`, `to` | sì | date `YYYY-MM-DD`, al massimo 366 giorni |
| `competition`, `season` | no | id interni dell'archivio |
| `limit` | no | da 1 a 200, default 50 |

## Regole
- **Stati dei campi.** Si cerca solo su campi AVAILABLE AND IMPLEMENTED. Gli altri stati vengono rifiutati, con lo stato nel messaggio e in `details.fields`: AVAILABLE BUT NOT IMPLEMENTED, NOT AVAILABLE, NOT VERIFIED, id sconosciuto. I campi di API-FOOTBALL non sono ancora nell'archivio, quindi non sono ricercabili.
- **Un dato mancante non soddisfa mai una condizione.** Conta come mancante:
  - un campo assente;
  - un token mancante (`""`, `null`, `undefined`, `nan`, `na`, `n/a`, `-`, più quelli di `fpt_filter_registry.missing_tokens`), anche quando il registro non ha ancora la riga del campo;
  - uno zero dove il registro dice `zero_is_missing` (per default: mercati numerici, cioè una quota 0);
  - un valore illeggibile (per esempio `1,90`).

  Con la logica a tre valori queste partite restano UNKNOWN, anche sotto NOT, e vengono contate in `counts`, mai mostrate come risultati. Eccezione voluta: l'operatore `is_null` è il test esplicito di assenza ed è TRUE proprio sui valori mancanti.
- **PIT.**
  - `PREMATCH` rifiuta i campi di esito, prima di leggere qualsiasi partita.
  - Le quote d'archivio non hanno l'orario di cattura, quindi la risposta è sempre `PIT_NOT_VERIFIED`: nessuna ricerca sull'archivio è certificata PIT.
  - `POSTMATCH` è etichettata `NON_PIT`, come nel vocabolario di `src/pit/policy.mjs`.
- **Limiti.** Al massimo 5 000 partite lette per finestra, le più recenti. Se la finestra ne contiene di più, `truncated: true` e una nota chiedono di restringere le date.
- **Sola lettura.** Nessuna chiamata a provider. Escono dal database solo i campi usati dall'espressione.

## Invariati
`/api/v1/fpt/search` (i filtri esistenti), le strategie e la Simulazione non cambiano.

## Esempio
`expr={"any":[{"all":[{"field":"fpt:statistic:Corners_Home_FT","op":"gte","value":5},{"field":"fpt:market:Odd_1_FT","op":"lt","value":"2"}]},{"field":"fpt:market:Odd_X_FT","op":"gt","value":"3"}]}&decision=POSTMATCH&from=2025-01-01&to=2025-06-30`
