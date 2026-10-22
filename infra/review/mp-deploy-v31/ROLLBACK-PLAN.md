# Piano di rollback v3.1-r2

1. **Fermare i deploy (immediato, senza GO)**: `FREEZE=1` (o rimuovere `authz.conf` → enforce+freeze). Dopo un rollback automatico per health KO la v3.1-r2 scrive `/var/lib/mp-deploy/freeze-latch`: FREEZE forzato finché root non lo rimuove dopo decisione owner.
2. **Tornare alla v3 (GO owner)**: `install-v31.sh rollback /root/mp-deploy-rollback-v31-<ts>-<pid>`: verifica `SHA256SUMS`, richiede backup completo (v3, conf, hook v1) e conf con `FREEZE=1`, ripristina sotto il lock v3 conf → hook v1 → v3, e il verifier legacy `a4123e44`. `mp-gate/` e `runner-guard.json` restano (inerti con v3).
3. **Mai la v2** come rollback ordinario.
4. **Ledger e freeze-latch** si conservano.

Test offline: `test_install.py` I12–I14 (rollback riuscito anche da stato FREEZE=0, backup corrotto, backup senza FREEZE=1) e mutanti I05–I07.
