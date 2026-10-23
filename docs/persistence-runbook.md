# Persistence migration — backup, restore drill, recovery and dry-run runbook (priority 4)

**Prepared, not executed.** Every step below runs on the VPS as root only after the owner authorizes it, in this order,
and only once the [GO/NO-GO report](persistence-go-no-go.md) allows it. Nothing here writes to the operational database:
- step 1 reads it;
- steps 2–5 work on a separate drill database;
- step 6 (FPT facts recovery on the operational database) writes the derived table `fpt_match_facts` only and needs its
  own authorization.

No step creates `allow-migrations-<sha>`, switches to `production` or applies a migration to the operational database.

## 0. Parameters, from the preflight JSON

```sh
PORT=<databases.*.server[0].port>        # declared 5434
DB=<databases.*.server[0].database>      # declared matchpilot_staging
APPUSER=<units[app].database.user>       # the app role
REL=/srv/mp-deploy/current
TS=$(date -u +%Y%m%dT%H%M%SZ)
D=/srv/matchpilot/backups/persistence-$TS
DRILL=mp_restore_drill_$TS
```

## 1. Dump of the operational database (read only on the database; uses disk)

```sh
df -h /srv/matchpilot                    # free space larger than twice the database size of the preflight
install -d -m 700 "$D"
sudo -u postgres pg_dump -p "$PORT" -Fc "$DB" > "$D/$DB.dump"
sudo -u postgres pg_dump -p "$PORT" -s "$DB" > "$D/$DB.schema.sql"
sudo -u postgres pg_restore --list < "$D/$DB.dump" > "$D/$DB.list"
sha256sum "$D/$DB.dump" "$D/$DB.schema.sql" "$D/$DB.list" > "$D/SHA256SUMS"
cat "$D/SHA256SUMS"                      # recorded in the checkpoint of the migration
```

`pg_dump` reads one consistent snapshot; the worker keeps writing, so the counts of step 3 compare the drill with the
history **up to the dump**, not with live totals.

## 2. Restore drill into an isolated database (creates the drill database only)

```sh
sudo -u postgres createdb -p "$PORT" "$DRILL"
sudo -u postgres pg_restore -p "$PORT" -d "$DRILL" --no-owner --exit-on-error < "$D/$DB.dump"
echo "restore rc=$?"
```

## 3. Integrity checks (read only on both databases)

History prefix: the drill's FPT versions and raw snapshots must equal the operational ones with the same ids.

```sh
V="SELECT max(version_id), count(*), md5(string_agg(version_id||':'||payload_sha256||':'||dataset_key, ',' ORDER BY version_id)) FROM fpt_match_versions"
R="SELECT max(snapshot_id), count(*), md5(string_agg(snapshot_id||':'||sha256||':'||dataset_key, ',' ORDER BY snapshot_id)) FROM fpt_raw_snapshots"
sudo -u postgres psql -p "$PORT" -d "$DRILL" -XAt -c "$V" -c "$R"
MAXV=$(sudo -u postgres psql -p "$PORT" -d "$DRILL" -XAt -c 'SELECT max(version_id) FROM fpt_match_versions')
MAXR=$(sudo -u postgres psql -p "$PORT" -d "$DRILL" -XAt -c 'SELECT max(snapshot_id) FROM fpt_raw_snapshots')
sudo -u postgres psql -p "$PORT" -d "$DB" -XAt -c "BEGIN READ ONLY" \
  -c "$V WHERE version_id <= $MAXV" -c "$R WHERE snapshot_id <= $MAXR" -c "ROLLBACK"
```

PASS when each pair of lines is identical (id, count, digest). Then the row count of every table of the drill:

```sh
sudo -u postgres psql -p "$PORT" -d "$DRILL" -XAt -c "SELECT n.nspname||'.'||c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND n.nspname NOT LIKE 'pg\_%' AND n.nspname<>'information_schema' ORDER BY 1" \
  | while read t; do echo "$t $(sudo -u postgres psql -p "$PORT" -d "$DRILL" -XAt -c "SELECT count(*) FROM $t")"; done > "$D/drill-rowcounts.txt"
sha256sum "$D/drill-rowcounts.txt" >> "$D/SHA256SUMS"
```

PASS when no table of the drill has more rows than the operational one (the operational one only grows).

## 4. Derived facts on the drill (writes the drill only)

The FPT-FACTS-GATE measure, then the recovery, on the copy:

```sh
DRILL_URL="postgresql:///$DRILL?host=/var/run/postgresql&port=$PORT"
sudo -u postgres env DATABASE_URL="$DRILL_URL" node "$REL/src/jobs/futpython-facts-refresh.mjs"
sudo -u postgres env DATABASE_URL="$DRILL_URL" node "$REL/src/jobs/futpython-facts-refresh.mjs" --apply --by=owner --reason="drill $TS"
```

PASS when the second line prints `"status":"COMMITTED"` with `after.hidden = 0`, `after.stale = 0`,
`after.duplicate_ids = 0` and `after.history_digest` equal to `before.history_digest`. A `ROLLED_BACK` line names the
problem and writes nothing.

## 5. Migration dry run on the drill (writes the drill only)

Applied as the app role, as `migrate()` would at the app restart, then the schema diff:

```sh
sudo -u postgres pg_dump -p "$PORT" -s "$DRILL" > "$D/drill-schema-before.sql"
sudo -u postgres psql -p "$PORT" -d "$DRILL" -X -1 -v ON_ERROR_STOP=1 -c "SET ROLE $APPUSER" -f "$REL/<staged persistence file>"
echo "dry-run rc=$?"
sudo -u postgres pg_dump -p "$PORT" -s "$DRILL" > "$D/drill-schema-after.sql"
diff "$D/drill-schema-before.sql" "$D/drill-schema-after.sql" > "$D/drill-schema.diff"; sha256sum "$D/drill-schema.diff" >> "$D/SHA256SUMS"
grep -E '^< ' "$D/drill-schema.diff" | head          # PASS when empty: nothing removed or changed
```

The staged file is the one of the persistence PR (outside `migrations/`, so no deploy is blocked); its path goes in the
command once that PR is merged. PASS when the dry run exits 0, the diff has only `>` lines (new tables, functions,
triggers, indexes) and step 3 rerun on the drill still gives the same history digests.

## 6. FPT facts recovery on the operational database (separate authorization; writes `fpt_match_facts` only)

Only if the preflight `factsGap` shows `hidden > 0` or `stale > 0`, and only after step 4 passed:

```sh
cd "$REL" && bash -c 'set -a; . /srv/matchpilot/secrets/worker.env; set +a; exec node src/jobs/futpython-facts-refresh.mjs'
cd "$REL" && bash -c 'set -a; . /srv/matchpilot/secrets/worker.env; set +a; exec node src/jobs/futpython-facts-refresh.mjs --apply --by=owner --reason="FPT-FACTS-GATE recovery"'
```

The env file is the worker's (the unit's `EnvironmentFile`, as the preflight lists it); the URL is read from it inside
the shell and never appears on the terminal or on a command line. Same PASS rule as step 4. It runs in one transaction and rolls back on any history change, duplicate or
leftover; a concurrent sync on the same rows makes it fail, and it is rerun later.

## Cleanup and rollback

- **Drill database:** `sudo -u postgres dropdb -p "$PORT" "$DRILL"` drops the copy only, after the owner has read the
  results. The dump directory `$D` is kept.
- **Facts recovery (step 6):** facts are derived. The rollback is a restore of the dump of step 1 for that table only,
  owner decision: `sudo -u postgres pg_restore -p "$PORT" -d "$DB" --data-only -t fpt_match_facts --clean ...` is
  **not** prepared here because it deletes rows; it would need its own plan.
- **Persistence migration:** roll-forward as in [persistence-plan.md](persistence-plan.md#rollback); the operational
  application of the migration is not authorized in this phase.
