#!/bin/bash
# Usage: docs/product/mp-263/evidence/af-raw-backup-restore.sh <container> <host-port>  (throwaway local container only)
# Backup/restore of a schema with migrations 031+033: pg_dump/pg_restore of the container's own version.
set -euo pipefail
C=$1; PORT=$2; REPO=$(cd "$(dirname "$0")/../../../.." && pwd); SB=$(mktemp -d)
U=matchpilot; P=matchpilot_local_test
docker exec $C psql -qU $U -d matchpilot_fpt -c 'DROP DATABASE IF EXISTS mpbk' -c 'DROP DATABASE IF EXISTS mpbk_restore' -c 'CREATE DATABASE mpbk' -c 'CREATE DATABASE mpbk_restore'
URL=postgres://$U:$P@127.0.0.1:$PORT/mpbk
cd "$REPO"
# 1. migrate up to 031 (033 rolled back), pre-033 rows, then 033 via migrate(), then linked data.
env -i PATH=$PATH NODE_ENV=test MATCHPILOT_RUNTIME_MODE=test DATABASE_URL=$URL node src/migrate.mjs >/dev/null
docker exec -i $C psql -qU $U -d mpbk -v ON_ERROR_STOP=1 < db/rollback/033-apifootball-raw-responses.down.sql
docker exec $C psql -qU $U -d mpbk -v ON_ERROR_STOP=1 -c "INSERT INTO af_odds_snapshots (fixture_id,kickoff_at,acquired_at,phase,bookmaker_id,bookmaker_name,bet_id,bet_name,value_text,odd,odd_text,market_ref_status,market_ref_version,payload_sha256) SELECT 9000+g, timestamptz '2026-11-01 18:00Z', timestamptz '2026-11-01 12:00Z', 'PREMATCH', 8,'B',1,'M','Home',2,'2.00','UNCLASSIFIED','v1',repeat('c',64) FROM generate_series(1,50) g"
env -i PATH=$PATH NODE_ENV=test MATCHPILOT_RUNTIME_MODE=test DATABASE_URL=$URL node src/migrate.mjs >/dev/null
node "$REPO/docs/product/mp-263/evidence/af-raw-backup-seed.mjs" $URL
Q="SELECT (SELECT count(*) FROM af_raw_responses) raw, (SELECT count(*) FROM af_odds_snapshots WHERE raw_id IS NULL) old, (SELECT count(*) FROM af_odds_snapshots WHERE raw_id IS NOT NULL) linked, (SELECT count(*) FROM af_raw_responses WHERE body_sha256 = encode(sha256(body),'hex')) sha_ok, (SELECT md5(string_agg(raw_id||body_sha256||encode(body,'hex'),',' ORDER BY raw_id)) FROM af_raw_responses) body_md5, (SELECT string_agg(conname||':'||convalidated,',' ORDER BY conname) FROM pg_constraint WHERE conname LIKE 'af_odds_snapshots_raw%') cons, (SELECT count(*) FROM pg_trigger WHERE tgname LIKE 'af_raw%' OR tgname='af_odds_snapshots_matches_raw') trg"
docker exec $C psql -U $U -d mpbk -Atc "$Q" > $SB/src.$C.txt
docker exec $C sh -c "pg_dump --version; pg_dump -U $U -Fc -d mpbk -f /tmp/mpbk.dump && pg_restore -U $U -d mpbk_restore --exit-on-error /tmp/mpbk.dump && rm /tmp/mpbk.dump"
docker exec $C psql -U $U -d mpbk_restore -Atc "$Q" > $SB/dst.$C.txt
echo "source:   $(cat $SB/src.$C.txt)"; echo "restored: $(cat $SB/dst.$C.txt)"
cmp $SB/src.$C.txt $SB/dst.$C.txt && echo IDENTICAL
# After restore the constraints still bind new rows and the table is still append-only.
docker exec $C psql -U $U -d mpbk_restore -Atc "INSERT INTO af_odds_snapshots (fixture_id,kickoff_at,acquired_at,phase,bookmaker_id,bookmaker_name,bet_id,bet_name,value_text,odd,odd_text,market_ref_status,market_ref_version,payload_sha256) VALUES (1, now()+interval '1 day', now(), 'PREMATCH',8,'B',1,'M','X',2,'2','UNCLASSIFIED','v',repeat('d',64))" 2>&1 | grep -o 'violates check constraint "[a-z_]*"' || true
docker exec $C psql -U $U -d mpbk_restore -Atc "DELETE FROM af_raw_responses" 2>&1 | grep -o 'APPEND_ONLY[^"]*' || true
docker exec $C psql -qU $U -d matchpilot_fpt -c 'DROP DATABASE mpbk' -c 'DROP DATABASE mpbk_restore'
