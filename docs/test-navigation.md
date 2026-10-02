# Test di navigazione e lettura — stato del 2 ottobre 2026

Servizio: https://matchpilot-test.onrender.com. Repository: https://github.com/zarbopiero963-droid/MatchPilot. Master: https://github.com/zarbopiero963-droid/MatchPilot/issues/1.
Il pannello è protetto da APP_USERNAME/APP_PASSWORD. La pagina non mostra il marchio della fonte. L'infrastruttura di test non implementa ancora il dashboard operativo, l'assistente AI o la raccolta continuativa.

## Configurazione verificata
Render: servizio srv-davpi23ncjis73f9dkbg, piano 1c-2g, una istanza. Neon: progetto damp-pond-29296680.
Variabili presenti: DATABASE_URL, GOAT_USERNAME, GOAT_PASSWORD, APP_USERNAME, APP_PASSWORD, OPENROUTER_API_KEY, OPENROUTER_MODEL, NODE_ENV.
SELECT 1 riuscito; chiave OpenRouter accettata; modello configurato openai/gpt-6.1-sol. Generazione AI non ancora testata.
Credenziali esclusivamente nel server: non copiarle nei file, nella issue o nell'interfaccia.
Le precedenti OOM a 512 MB sono documentate. Nei test su 2 GiB il consumo osservato è rimasto sotto il limite; nell'ultimo intervallo circa 748 MiB prima di tornare al livello di inattività. Non è una prova di carico di produzione.

## Prove concluse
- Login del portale e secondo login Lay Score; apertura Money mantenendo vivo il portale padre.
- Catalogo delle sezioni accessibili e 13 tab di dettaglio; scorrimento dei contenitori osservati e delle colonne.
- Filtri live, nove slider a minimo/massimo, 16 risultati HT, mercati, statistiche e lettura dopo 60 secondi.
- Varianti STATS+, Timing, Gestione75, Classifica; legende ROI e cinque risposte dell'assistente della fonte.
- Tre backtest con guard distinti; terzo risultato mostra due richieste residue. Quarto non eseguito; nessun test che esaurisca il budget giornaliero.
- 26 output Punta/Banca riconciliati su profitto, commissione, responsabilità e ROI.
- Money: capitale di prova, trade +10 e ripristino; Tracker, Andamento e Guida.
- Cinque strategie backtest + cinque live nello stesso contesto, sesta rifiutata, richiamo/reload; dieci cancellazioni UI delle sole voci QA e nuovo contesto pulito verificati (v27/v28).

## Regressioni
Eseguire `npm test`: 16 test.
`npm run check` verifica la sintassi dei moduli prima dell'avvio, tramite prestart.
L'esecuzione browser di startup usa SOURCE_LOGIN_TEST=once e un run_id persistito. Un batch già terminato non riparte al deploy.
Non cancellare i guard o riutilizzare identificatori per forzare test. Nuove prove devono avere un perimetro esplicito e rispettare i cinque backtest giornalieri.
Snapshot per tentativo, lease con proprietario e guard rendono i riavvii verificabili. Esaminare anche i risultati delle singole prove: lo stato complete del batch non significa che ogni prova sia passed.

## Evidenze
Neon: matchpilot_test_runs e matchpilot_source_snapshots.
Batch principali: full-scroll-v13; qa-v15, v16, v17, v18, v19, v20, v21, v24, v27, v28, con prefisso source-mapping-2026-10-02-.
Validazioni finanziarie: source-finance-validation-2026-10-02-01…26, collegate agli snapshot originali.
Il catalogo dettagliato e i limiti sono in docs/source-catalog-2026-10-02.md. La matrice completa dei tentativi, incluse prove failed poi corrette, è in docs/control-certification-2026-10-02.md.

## Non certificato
Percorsi distruttivi e inserimento di esiti fittizi, limite/reset quotidiano dei backtest, cambio data/importazione effettiva, correttezza di tutta la sequenza della curva equity, liquidità e timestamp exchange, raccolta continuativa di una gara completa, recupero delle interruzioni e archivio del giorno successivo.
Betwatch non è integrato.
