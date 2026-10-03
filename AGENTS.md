# Istruzioni vincolanti MatchPilot

## Contratto owner
Piero ha autorizzato il 3 ottobre 2026 il lavoro esclusivamente sui **49 campionati di GOAT LayScore → Statistiche Lega**. La baseline è `data/approved-leagues.json`, con prova sorgente e versione. Non aggiungere, togliere o sostituire campionati, fonti, regole strategiche o ampliare questo contratto senza **autorizzazione esplicita di Piero**. Un cambiamento del sito è una proposta da registrare, non un'approvazione. Le normali correzioni tecniche dentro il contratto non richiedono nuova conferma.

Nazioni/aree, campionati e squadre devono avere riferimenti normalizzati e prove. EUROPE è area geografica, non una nazione inventata. Conservare etichette originali, gruppi, stagione se esposta, timestamp e snapshot. Squadre da Dashboard → Dettaglio → Classifica: esplorare menu orizzontale e tutti i gruppi/leghe della competizione autorizzata. Stats+ è distinto da Classifica: nessun H2H deve essere scambiato per roster completo. Non unire squadre omonime né accettare alias fuzzy senza prova; alias incerti in quarantena. Nuovi pulsanti non devono rompere il parser o ampliare la scope.

## Metodo
Leggere README, questo file, CLAUDE.md e issue pertinenti prima di modificare codice. Un lavoro alla volta; attendere fine dei run reali prima di deploy successivi o commit di documentazione. Preservare fallimenti, prove grezze e cleanup. Non certificare liste vuote, dati sintetici o il solo completamento del processo. Test su browser reale autorizzato con clic ordinari; non forzare stato DOM, chiamare funzioni interne o aggirare login. Non installare altri browser.

Aggiornare README insieme alle modifiche che cambiano comportamento, schema, comandi o stato operativo. Eseguire sintassi e test pertinenti prima del push. Non esporre credenziali, token, cookie o URL con parametri sensibili. Non eliminare dati dell'owner. Le sessioni QA non autorizzano ordini reali.

## Stato e continuità
Issue #2: prove sorgente e residui; chiusura soltanto owner. I punti esclusi import completo, mobile/audio/radar popolati, equity, Ladder rimangono esclusi finché Piero non dispone diversamente. Pannello, OpenRouter operativo e monitoraggio minuto sono lavori successivi, non funzionalità esistenti. Consultare `docs/issue-2-qa-progress-2026-10-02.md`.
Nessun limite o difetto va mascherato da PASS. Se i 49 campionati non hanno oggi un dettaglio disponibile, registrarli pending e continuare nelle giornate successive senza inventare squadre o usare altre fonti.
