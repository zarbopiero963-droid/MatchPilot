#!/bin/bash
# mp-runner-guard.sh — fail-closed pre-job gate for MatchPilot VPS self-hosted runner.
# Installed at /usr/local/libexec/mp-runner-guard.sh (root:root 755).
# Triggered by ACTIONS_RUNNER_HOOK_JOB_STARTED before any job step runs.
# Relies on GitHub default env vars GITHUB_* which cannot be overwritten by workflow env:
# https://docs.github.com/en/actions/reference/workflows-and-actions/variables
set -euo pipefail

EXPECTED_REPO="zarbopiero963-droid/MatchPilot"
EXPECTED_EVENT="push"
EXPECTED_REF="refs/heads/main"
EXPECTED_WF_REF="zarbopiero963-droid/MatchPilot/.github/workflows/deploy-vps.yml@refs/heads/main"

fail() {
  echo "mp-runner-guard: REFUSED: $*" >&2
  exit 1
}

[ "${GITHUB_REPOSITORY:-}" = "$EXPECTED_REPO" ] || fail "repository='${GITHUB_REPOSITORY:-}'"
[ "${GITHUB_EVENT_NAME:-}" = "$EXPECTED_EVENT" ] || fail "event='${GITHUB_EVENT_NAME:-}'"
[ "${GITHUB_REF:-}" = "$EXPECTED_REF" ] || fail "ref='${GITHUB_REF:-}'"
[ "${GITHUB_WORKFLOW_REF:-}" = "$EXPECTED_WF_REF" ] || fail "workflow_ref='${GITHUB_WORKFLOW_REF:-}'"

# Cross-check webhook payload when the runner provides it (real jobs).
if [ -n "${GITHUB_EVENT_PATH:-}" ] && [ -f "${GITHUB_EVENT_PATH}" ] && [ -r "${GITHUB_EVENT_PATH}" ]; then
  python3 - "${GITHUB_EVENT_PATH}" <<'PY' || fail "event_payload_mismatch"
import json, sys
p = json.load(open(sys.argv[1], encoding="utf-8"))
repo = p.get("repository") or {}
full = repo.get("full_name") or ""
ref = p.get("ref") or ""
if full != "zarbopiero963-droid/MatchPilot":
    sys.exit(1)
# push payloads include ref; if present it must be main
if ref and ref != "refs/heads/main":
    sys.exit(1)
sys.exit(0)
PY
fi

echo "mp-runner-guard: ALLOW deploy-vps.yml push refs/heads/main"
exit 0
