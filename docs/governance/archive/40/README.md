# Archivio #40 — verifica indipendente in sola lettura (R-02)

- **Issue:** #40.
- **Autorizzazione:** decisione owner `MP-OWNER-DECISIONS-D1-D9-20261018.D7`, accesso in sola lettura.
- **Roadmap:** R-02.
- **Data:** 2026-10-18.
- **Esecutore:** `agent-a-claude-code`.
- **Strumento:** `tools/archive/verify-archive.mjs`. Apre i file solo in lettura e non scrive, rigenera né pubblica dati.

## Esito: **PARTIAL — verifica delle parti BLOCKED**

| Controllo | Esito | Evidenza |
|---|---|---|
| Accessibilità archivio su Drive (`MatchPilot/Archives/BetsAPI-Trial-2026-10-05_06/regenerated/readback40/`) | PASS | elenco Drive: 13 parti zip + `regenerated-r01-40-metadata.zip` (`drive-listing-2026-10-18.json`) |
| Download metadata (9.058 byte) | PASS | `regenerated-r01-40-metadata.zip` SHA-256 `b574874e…42a6`, CRC32 delle 3 voci verificati |
| SHA-256 `trusted-inventory.json` = pin del manifest e del rapporto di chiusura | PASS | `377a85327d0dd3fc61356ef48b1606b1522b87561a4e057133e415a02b004041` (vedi anche `docs/provider-trial-final-closure-2026-10-08.md`) |
| `parts40.sha256` = elenco parti del manifest | PASS | 13 parti, stessi hash e nomi |
| Somma delle parti = dimensione del bundle | PASS | 498.614.829 byte; pin del bundle `fb07443646a7…ac456` coerente fra manifest e inventario |
| Dimensioni su Drive = parte + involucro ZIP stored (146 byte) | PASS | 13/13 |
| SHA-256 di ciascuna parte e del bundle ricomposto | **BLOCKED** | vedi blocker |
| Readback, portabilità DuckDB, schema e conteggi, coerenza PIT | **BLOCKED** | richiedono il bundle completo |

## Blocker (FACT)

- Lo strumento Drive disponibile agli agenti rifiuta i download sopra 10 MB: `File too large for download, over limit of 10 MB`. Così è stato rifiutato `regenerated-r01-40-part012.zip`, la parte più piccola (18.614.975 byte).
- I metadati Drive esposti non includono checksum.
- Nella sessione non ci sono credenziali per l'API Drive standard.

Nessun costo o operazione in produzione può sbloccarlo. Bastano credenziali di sola lettura oppure un'esecuzione da parte dell'owner.

**Per completare R-02 senza modificare i dati**, due opzioni:
1. L'owner scarica le 13 parti in una cartella ed esegue:
   ```bash
   node tools/archive/verify-archive.mjs --metadata docs/governance/archive/40 --parts <cartella> --drive-listing docs/governance/archive/40/drive-listing-2026-10-18.json
   ```
   Con tutte le parti il bundle viene ricomposto in memoria e confrontato con il pin.
2. Un agente con credenziali Drive in sola lettura esegue lo stesso comando.

Restano poi da verificare DuckDB, schema, conteggi e PIT sul bundle estratto.

## File fissati nel repository

`SHA256SUMS` contiene gli hash di:
- `transfer40-manifest.json`, `parts40.sha256` e `trusted-inventory.json`, estratti dal metadata zip originale;
- il metadata zip stesso;
- l'elenco Drive.

Contengono solo nomi, dimensioni e hash, nessun dato dell'archivio. I test `test/archive-verify.test.mjs` verificano:
- il lettore ZIP sul file reale;
- i pin;
- la coerenza dei metadati reali;
- un archivio sintetico completo, con casi manomessi o corrotti;
- l'assenza di scritture.

## Stato

- **#40:** resta OPEN (D9). READY TO CLOSE sarà possibile solo dopo la verifica indipendente delle parti, della portabilità e dell'integrità.
- **Requisiti:** MP-ARC-002 e MP-SEC-010 restano BLOCKED; MP-GOV-010 resta NOT_VERIFIED.
