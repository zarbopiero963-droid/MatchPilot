# Catalogo campionati e squadre — 3 ottobre 2026

Contratto Piero autorizzato alle 18:31 Europe/Rome: lavorare soltanto sui 49 campionati di Statistiche Lega; nessuna variazione senza nuova autorizzazione esplicita.

## Prove e risultati

- v109: snapshot reale dei49 campionati, source-catalogue-2026-10-03-discovery-v109-attempt-1791045195907-w2n2aayomm-league-catalog. Run parziale per clic Classifica inizialmente non trovato; conservato.
- v109b: completato18:36:39, commit997c3c6a7327a76001a3a77e18b747d970ed40cc; Classifica Brazil Serie B20 squadre.
- v110: completato18:43:42, commit806a67516ba5d8c150318da7c383a1e90ecd4f80; altre letture ancora in caricamento o non raggiungibili. Tre snapshot negativi conservati in quarantena: non sono elenchi vuoti validi.
- v111: completato18:46:26, commit06a65664a129248532f128a0b5937a6e6edf2454; sette classifiche popolate,137 squadre distinte per campionato. Gruppi Argentina/Colombia ancora da acquisire separatamente, prima osservazione marcata source_group_unresolved.
- v112: completato18:49:36, commitfc99a4d6e497b7e840d9e2c11fdd4c999eba1a75. Undici classifiche reali: cinque overall, quattro gruppi Argentina, due Colombia. Gruppi cliccati e primi classificati distinti verificati. Importazione reale tramite catalog-sync verificata18:51:46 Europe/Rome al deployment899c9437743b48934b63c2e5e26df62e7170dba3 (Renderlive): result.catalogue.status=persisted,49 campionati,7 osservati,152 squadre e11 osservazioni importate. Il codice ha reimportato i dati già presenti senza duplicarli; i nuovi15 nomi dell'altro gruppo Argentina portano137→152. Nessuna membership associata a un campionato diverso; NationsLeague assente. Rimangono42 campionati non osservati. Tutte le coperture sono mantenute prudenzialmente partial_observed: non si certificano stagioni/trasferimenti o gruppi futuri non esposti. Snapshot prefix source-catalogue-2026-10-03-rosters-v112-attempt-1791046035632-6wk8gee85v9.

|Sorgente|Squadre distinte osservate|
|---|---:|
|BRAZIL SERIE B|20|
|NORWAY 1. DIVISION|16|
|NETHERLANDS EERSTE DIVISIE|20|
|ENGLAND LEAGUE ONE|24|
|SPAIN LA LIGA 2|22|
|ARGENTINA LIGA PROFESIONAL DE FÚTBOL|30|
|COLOMBIA LIGA BETPLAY|20|

## Database

Neon damp-pond-29296680: 49 campionati,33 nazioni/regioni. Contratto con digestSHA2566df7a033803faf4cf91fcf0289a7e90d7f5b770d5263e81aac43bdcd61e23f91. Squadre con identificatore deterministico circoscritto al campionato; non si presume identità globale tra competizioni. Stagioneunknown se non esposta. Le membership impongono anche la corrispondenza squadra/campionato mediante FK composta. CHECK del database limita gli ID ai49 autorizzati.

Schema001 crea il catalogo;002/003 applicate al database preesistente per FK composta e allowlist. Nessun dato precedente cancellato. Viewmp_catalog_coverage mantiene pending_unavailable quando non c'è alcuna osservazione: significa non acquisito, non prova che la sorgente non lo renderà disponibile.

## Test

Sette test Node del catalogo superati: fixture dei49 campionati reali, fixture delle20 squadre reali, lista campionati vuota, classifica vuota, normalizzazione conservativa, modifica nazione rilevata dal digest, duplicato squadra rifiutato. Sintassi source-login/source-catalog/catalog-sync verificata prima del push.

Verifica reale d'idempotenza PostgreSQL: reinserimento delle77 squadre del checkpointv110, conteggio77 e77 ID distinti. Constraints allowlist e membership composte convalidated=true. Il tentativo separato di test negativo via DO è stato respinto dal connettore con401: non certificato come test applicativo di rifiuto; solo schema verificato e nessuna membership di prova residua.

## Residui e sincronizzazione

42 campionati non ancora osservati nella Dashboard odierna; non inventare le rose. Necessari nuovi palinsesti/classifiche disponibili. Validare tutti i gruppi reali, identità e alias delle squadre, alias AsianOdds e data/orario senza assumere un fuso dal solo scarto. Nuovi pulsanti/gruppi sconosciuti richiedono osservazione e integrazione; nessun completamento implicito.

Programmazione giornaliera disattivata il3 ottobre2026 alle18:55 Europe/Rome su indicazione di Piero: non era stata richiesta. Le ulteriori acquisizioni vanno eseguite nell'ambito del lavoro autorizzato, senza introdurre nuove programmazioni autonomamente.

La issue#2 non è chiusa né dichiarata chiudibile. Restano separati il pannello operativo, OpenRouter operativo e monitoraggio continuo.
