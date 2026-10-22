#!/bin/bash
# render-hook.sh <template> <out> <node_sha256> <guard_sha256> <verifier_sha256> — substitute the hook pins; refuse leftovers.
set -euo pipefail
[ $# = 5 ] || { echo "usage: render-hook.sh in out node guard verifier" >&2; exit 2; }
for h in "$3" "$4" "$5"; do [[ "$h" =~ ^[0-9a-f]{64}$ ]] || { echo "bad sha256: $h" >&2; exit 2; }; done
sed -e "s/@NODE_SHA256@/$3/" -e "s/@GUARD_SHA256@/$4/" -e "s/@VERIFIER_SHA256@/$5/" "$1" > "$2.tmp"
if grep -q '@[A-Z_]*SHA256@' "$2.tmp"; then rm -f "$2.tmp"; echo "placeholder left" >&2; exit 1; fi
bash -n "$2.tmp"; mv -f "$2.tmp" "$2"
