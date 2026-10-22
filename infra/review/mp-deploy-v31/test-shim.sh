# test-shim.sh — TEST-ONLY. Never installed. The offline harness creates a test copy of mp-deploy in a temp dir by
# replacing the line "# @MP-TEST-SHIM@" with "source <this file>". The production file contains only that comment.
# Refuses: euid 0, any SUDO_* variable, running from an installed path, missing MP_TEST_STUB=1.
if [ "$(id -u)" = 0 ] || [ -n "${SUDO_USER:-}${SUDO_UID:-}${SUDO_GID:-}${SUDO_COMMAND:-}" ]; then echo "TEST-SHIM REFUSED: root or sudo" >&2; exit 99; fi
case "$(realpath -e "$0" 2>/dev/null)" in /usr/*|/sbin/*|/bin/*|/opt/*|/etc/*|/srv/*) echo "TEST-SHIM REFUSED: installed path" >&2; exit 99;; esac
[ "${MP_TEST_STUB:-0}" = 1 ] && [ -n "${MP_TEST_ROOT:-}" ] || { echo "TEST-SHIM REFUSED: not in harness" >&2; exit 99; }
PATH="$MP_TEST_BIN:$PATH"
OWNER_UID=$(command id -u); ROOT_STOP="$MP_TEST_ROOT"; CURLPROTO="=https,http"
REPO="$MP_REPO"; DEP="$MP_DEPLOY_ROOT"; BUILD_ROOT="$MP_BUILD_ROOT"; STATE="$MP_STATE"; LOGD="$MP_LOGDIR"; LOCKDIR="$MP_LOCKDIR"
BUILD_USER=$(command id -un); TESTENV="$MP_TESTENV"; GATEDIR="$MP_GATEDIR"; LEGACY_VERIFIER="$MP_LEGACY_VERIFIER"
AUTHZ_CONF="$MP_AUTHZ_CONF"; GUARD_CONF="$MP_GUARD_CONF"; HOOK="$MP_HOOK"; RUNNER_ENV="$MP_RUNNER_ENV"; RUNNER_GROUP=$(command id -gn)
SUDOERS_MAIN="$MP_SUDOERS_MAIN"; SUDOERS_DIR="$MP_SUDOERS_DIR"; NODE="$MP_NODE"; OIDC_BASE="$MP_OIDC_BASE"; HEALTH_URL="$MP_HEALTH_URL"
[ -n "${MP_TEST_FETCH_MOCK:-}" ] && NODE_PRE=(--import "$MP_TEST_FETCH_MOCK")
# command shims (privileged operations become unprivileged equivalents; behaviour otherwise unchanged)
sudo(){ [ "$*" = "-n -l -U $RUNNER_USER" ] && [ -f "$MP_TEST_SUDO_L" ] && cat "$MP_TEST_SUDO_L"; }
id(){ if [ "${2:-}" = "$RUNNER_USER" ]; then case "$1" in -nG) cat "$MP_TEST_GROUPS";; -u) echo 995;; -g) echo 986;; esac; else command id "$@"; fi; }
runuser(){ [ "$1" = -u ] && shift 2; [ "$1" = -- ] && shift; "$@"; }
systemd-run(){ local wd=. a=(); while [ $# -gt 0 ] && [ "$1" != -- ]; do case "$1" in --working-directory=*) wd="${1#*=}";; esac; shift; done; shift
  [ "$1" = /usr/bin/npm ] && { shift; set -- "$MP_TEST_BIN/npm" "$@"; }; ( cd "$wd" && "$@" ); }
systemctl(){ echo "$(date -Is) systemctl $*" >> "$MP_TEST_ROOT/systemctl.log"; }
install(){ local a=(); while [ $# -gt 0 ]; do case "$1" in -o|-g) shift 2; continue;; esac; a+=("$1"); shift; done; command install "${a[@]}"; }
chown(){ :; }
