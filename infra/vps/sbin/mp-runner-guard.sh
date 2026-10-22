#!/bin/bash
# mp-runner-guard.sh v2 (S3, MP-GATE-S1S2-FIX §8.2, installed t120u 2026-10-22).
# Part 1: original v1 checks, unchanged and enforced (any failure refuses the job).
# Part 2: node /usr/local/libexec/mp-gate/runner-job-guard.mjs /etc/mp-deploy/runner-guard.json, JSON line to the journal
#         (logger -t mp-runner-guard). §8.7 S3 check: LOG-ONLY for the first real run (names of required env vars logged,
#         never values); it is enforced only when the root-owned file /etc/mp-deploy/runner-guard.enforce exists.
set -uo pipefail
V1=/usr/local/libexec/mp-runner-guard-v1.sh
"$V1" || exit 1
names=""; for v in GITHUB_REPOSITORY GITHUB_EVENT_NAME GITHUB_REF GITHUB_WORKFLOW_REF GITHUB_JOB GITHUB_RUN_ID GITHUB_RUN_ATTEMPT GITHUB_SHA RUNNER_NAME; do
  if [ -n "${!v:-}" ]; then names="$names $v=present"; else names="$names $v=MISSING"; fi; done
logger -t mp-runner-guard "env:$names" 2>/dev/null || true
out=$(node /usr/local/libexec/mp-gate/runner-job-guard.mjs /etc/mp-deploy/runner-guard.json 2>&1) && rc=0 || rc=$?
line=$(printf '%s' "$out" | tr '\n' ' ' | cut -c1-3500)
E=/etc/mp-deploy/runner-guard.enforce
if [ -f "$E" ] && [ ! -L "$E" ] && [ "$(stat -c %u "$E")" = 0 ]; then mode=enforce; else mode=log-only; fi
logger -t mp-runner-guard "guard rc=$rc mode=$mode $line" 2>/dev/null || true
echo "mp-runner-guard v2: guard rc=$rc mode=$mode"
if [ "$mode" = enforce ] && [ "$rc" -ne 0 ]; then echo "mp-runner-guard: REFUSED by runner-job-guard" >&2; exit 1; fi
exit 0
