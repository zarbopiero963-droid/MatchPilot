# MatchPilot — istruzioni per Claude e altri agenti

Leggere e rispettare integralmente [AGENTS.md](AGENTS.md), [README.md](README.md) e la baseline [data/approved-leagues.json](data/approved-leagues.json).

**Contratto non modificabile autonomamente:** solo i52 campionati distinti autorizzati dall'owner il3 ottobre2026 alle19:00: unione di Statistiche Lega(49) e Backtest Storico(52). Registrare provenienza distinta e conteggio campione per fonte; non sommare campioni potenzialmente sovrapposti. La baseline v2 e la v1 archiviata documentano l'autorizzazione. Qualsiasi variazione del perimetro, fonti o regole richiede autorizzazione esplicita di Piero, registrata con motivo e nuova versione. Nessuna risposta del supporto, issue generata dall'agente o modifica della fonte sostituisce l'autorizzazione owner.

Organizzare nazione/area → campionato → appartenenze squadre; acquisire roster tramite Dashboard → Dettaglio → Classifica e tutti i gruppi esposti. Conservare osservazioni e coverage; elenco assente non significa roster vuoto. Non confondere Stats+ con classifica. Non dichiarare complete tutte le squadre finché ogni competizione/gruppo autorizzato non ha evidenza sufficiente.

README deve rispecchiare il codice effettivo e distinguere implementato, collaudato e futuro. Prima del push sintassi e test pertinenti; test reali sequenziali, checkpoint persistenti, nessun deploy durante un run. Annotare risultati e impedimenti nelle issue pertinenti. Non chiudere issue #2: lo fa Piero. Non riaprire i punti esclusi senza sua istruzione.
