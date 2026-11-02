# TotalCorner LIVE: criteri del benchmark (MP-NEXT-20261102 punto F) — PROPOSTA per l'owner

**Stato: PROPOSTA.** Le soglie e la mappatura qui sotto **non sono decisioni owner**: vanno approvate prima di eseguire il benchmark.
- TotalCorner resta sospeso.
- Non è stata usata quota API.
- Il verdetto attuale è **INSUFFICIENT EVIDENCE**: mancano snapshot LIVE di API-FOOTBALL archiviati sulle stesse partite.

Gli strumenti sono quelli della #278: `src/benchmark/live-benchmark.mjs` e `tools/benchmark/tc-af-live.mjs`.

## 1. Mappatura esplicita dei campi (proposta)
Il benchmark confronta solo i campi elencati qui: la mappatura non viene mai dedotta dai nomi.

Fonte dei nomi:
- **TotalCorner:** le chiavi che il codice di MatchPilot già riconosce (`src/providers/totalcorner/historical.mjs`, `live.mjs`). La loro forma nei payload LIVE archiviati (numero singolo o coppia casa/trasferta) **non è verificata** e va controllata sull'export prima dell'esecuzione.
- **API-FOOTBALL:** i tipi di statistica osservati il 01/11/2026.

| Grandezza | TotalCorner (chiavi) | API-FOOTBALL (`/fixtures/statistics` type) | Stato |
|---|---|---|---|
| Gol | `hg`, `ag` | `goals.home`, `goals.away` di `/fixtures` | confrontabile |
| Calci d'angolo | `hc`, `ac` (`hf_hc`, `hf_ac` al primo tempo) | `Corner Kicks` | confrontabile |
| Tiri in porta | `shot_on` / `shotOn` | `Shots on Goal` | da verificare (forma) |
| Tiri fuori | `shot_off` / `shotOff` | `Shots off Goal` | da verificare (forma) |
| Possesso | `possession` / `possess` | `Ball Possession` (testo con %) | da verificare (unità) |
| Ammonizioni | `hyc`, `ayc` | `Yellow Cards` | confrontabile |
| Espulsioni | `hrc`, `arc` | `Red Cards` | confrontabile |
| Attacchi | `attacks` / `att` | — | **solo TotalCorner** (dato unico) |
| Attacchi pericolosi | `dangerous_attacks` / `dang_attacks` | — | **solo TotalCorner** (dato unico) |
| Expected goals | — | `expected_goals` | **solo API-FOOTBALL** |
| Minuto, stato | `minute` / `time`, `status` | `fixture.status.elapsed`, `status.short` | confrontabile, solo per l'allineamento |

Gli attacchi e gli attacchi pericolosi sono **l'informazione incrementale** che giustificherebbe TotalCorner. Il loro valore va misurato come presenza e freschezza, non come accordo con un'altra fonte, perché API-FOOTBALL non li ha.

## 2. Abbinamento verificabile
- Si conservano solo le coppie VERIFIED, cioè uniche da entrambi i lati, con queste condizioni:
  - squadre normalizzate (in qualunque alfabeto, senza togliere token di club);
  - calcio d'inizio entro 15 minuti.
- Le coppie ambigue, le partite con casa e trasferta invertite e quelle non abbinate vengono riportate e contate, mai forzate.
- Per la riproducibilità, il rapporto pubblica gli id di entrambi i provider di ogni coppia.

## 3. Criteri di inclusione e di esclusione
**Inclusione:**
- partita abbinata VERIFIED;
- dati LIVE di entrambi i provider dentro la stessa finestra;
- almeno un tempo regolamentare osservato.

**Esclusione:** sono escluse, e contate per motivo:
- le partite sospese, rinviate o annullate;
- le partite senza calcio d'inizio noto;
- le partite che hanno solo lo snapshot terminale;
- i minuti `45+N` e `90+N` per il ritardo di avvistamento (già esclusi dagli strumenti);
- gli intervalli a cavallo della pausa.

## 4. Metriche
- **Copertura:**
  - partite e leghe abbinate rispetto a quelle di ciascun provider;
  - per campo, la quota di snapshot con il campo presente (`missing_ratio`).
- **Freschezza:** mediana e p90 dell'intervallo tra righe salvate durante il gioco.

  **Attenzione:** l'archivio TotalCorner è deduplicato, quindi misura la cadenza dei cambiamenti. Il confronto è valido solo se anche l'archivio API-FOOTBALL è deduplicato allo stesso modo; altrimenti gli strumenti rispondono INSUFFICIENT EVIDENCE.
- **Affidabilità:**
  - buchi superiori a 5 minuti rispetto agli intervalli osservati (`gap ratio`);
  - errori e risposte vuote, se presenti nei dati.
- **Informazione incrementale:**
  - campi presenti in uno solo dei due provider;
  - per attacchi e attacchi pericolosi, presenza e cadenza.
- **Ritardo di avvistamento** degli eventi del primo tempo: **non è la latenza del provider**. Lo gonfiano un calcio d'inizio in ritardo e l'arrotondamento del minuto.

## 5. Quattro soglie proposte, con motivazione (da approvare)

| Soglia | Valore proposto | Motivazione |
|---|---|---|
| `min_matched_matches` | **200** partite, in almeno 5 leghe | Con 200 partite una proporzione (per esempio la copertura di un campo) ha un margine al 95% di circa ±7 punti nel caso peggiore (p = 0,5). Il margine vale per proporzioni a livello di partita: per la copertura per campo calcolata sugli snapshot, che sono raggruppati per partita, il margine è più largo. Con 5 leghe si evita che il verdetto rifletta un solo campionato. Sotto questa soglia il verdetto è INSUFFICIENT EVIDENCE. |
| `max_median_interval_ms` | **90 000** (90 s) | Su un archivio deduplicato è la cadenza mediana dei cambiamenti. Con dati vivi che cambiano a ogni attacco, una mediana oltre 90 s indica che il feed non segue il gioco abbastanza da vicino per i filtri LIVE al minuto. |
| `max_gap_ratio` | **0,05** | Al massimo il 5% degli intervalli durante il gioco con un buco oltre 5 minuti. Un buco di 5 minuti fa perdere una finestra decisionale intera, e oltre il 5% la serie non è affidabile per il backtest LIVE. |
| `max_median_sighting_delay_ms` | **120 000** (2 min) | Il ritardo di avvistamento include circa 0–60 s di arrotondamento del minuto e il ritardo del calcio d'inizio. Oltre 2 minuti di mediana un evento (gol, cartellino) arriva troppo tardi per un'operazione LIVE. |

Le soglie si applicano al candidato, cioè a TotalCorner. Le metriche di API-FOOTBALL vengono riportate accanto, come riferimento.

## 6. INSUFFICIENT EVIDENCE
Il verdetto è INSUFFICIENT EVIDENCE, con i motivi elencati, quando si verifica uno di questi casi:
- manca una soglia approvata;
- le partite abbinate con dati su entrambi i lati sono meno del minimo;
- mancano i dati di riferimento;
- mancano i campioni di intervallo o di ritardo;
- gli archivi non sono confrontabili per la deduplica.

In nessuno di questi casi si conclude KEEP o DROP. Il verdetto è una raccomandazione: la decisione operativa resta all'owner.

## 7. Per eseguire servono decisioni owner
1. Approvare la mappatura, le soglie, i criteri e le metriche.
2. Scegliere la sorgente dei dati di riferimento:
   - un budget LIVE di API-FOOTBALL sulle partite già archiviate da TotalCorner, dentro i 400 al giorno proposti;
   - oppure una finestra parallela con TotalCorner riattivato.
3. Un collector LIVE di API-FOOTBALL deduplicato, ancora da scrivere, dopo PIT LIVE (#280).
