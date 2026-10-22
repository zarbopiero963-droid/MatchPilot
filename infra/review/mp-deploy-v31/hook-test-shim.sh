# hook-test-shim.sh — TEST-ONLY, never installed. Sourced by a test copy of mp-runner-guard.sh in place of the marker.
if [ "$(id -u)" = 0 ] || [ -n "${SUDO_USER:-}${SUDO_UID:-}${SUDO_COMMAND:-}" ]; then echo "TEST-SHIM REFUSED: root or sudo" >&2; exit 99; fi
case "$(realpath -e "$0" 2>/dev/null)" in /usr/*|/sbin/*|/bin/*|/opt/*|/etc/*|/srv/*) echo "TEST-SHIM REFUSED: installed path" >&2; exit 99;; esac
[ "${MP_TEST_STUB:-0}" = 1 ] || { echo "TEST-SHIM REFUSED: not in harness" >&2; exit 99; }
OWNER_UID=$(id -u); NODE="$MP_NODE"; GATEDIR="$MP_GATEDIR"; GUARD_CONF="$MP_GUARD_CONF"; GUARD_TIMEOUT="${MP_GUARD_TIMEOUT:-90}"
NODE_PRE=(--import "$MP_TEST_FETCH_MOCK"); EXTRA_ENV=(MP_TEST_MOCK_FILE="$MP_TEST_MOCK_FILE")
logger(){ :; }
