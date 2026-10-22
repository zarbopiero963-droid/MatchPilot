#!/bin/bash
# install-v31.sh — S3 installer for mp-deploy v3.1-r2 + mp-runner-guard v2 (NOT RUN ON THE VPS; requires the owner's GO-S3).
#   install-v31.sh install  <pkgdir>    : verify package -> backup -> mp-gate/ -> runner-guard.json -> render hook ->
#                                         authz.conf (MODE=report FREEZE=1, all pins) + hook + mp-deploy swapped under the v3 lock
#   install-v31.sh rollback <backupdir> : restore v3 + legacy verifier + v1 hook + old conf (FREEZE=1 required). NEVER v2.
# PREFIX (offline test only) relocates every path; with PREFIX set, chown is skipped. Nothing here reads a secret.
set -euo pipefail
P="${PREFIX:-}"; OWN=(-o root -g root); [ -n "$P" ] && OWN=()
SB="$P/usr/local/sbin/mp-deploy"; GD="$P/usr/local/libexec/mp-gate"; LEG="$P/usr/local/libexec/mp-deploy-authz.mjs"
HOOK="$P/usr/local/libexec/mp-runner-guard.sh"; NODE="$P/usr/bin/node"
CONF="$P/etc/mp-deploy/authz.conf"; GCONF="$P/etc/mp-deploy/runner-guard.json"; OLDLOCK="$P/run/lock/mp-deploy.lock"
SUDOERS_MAIN="$P/etc/sudoers"; SUDOERS_DIR="$P/etc/sudoers.d"
EXP_VER=69d88f58dd8c88ac8322cc737e03062b12379b1ca007a50c881176953e098a75     # scripts/deploy-authz.mjs @ main 1703054
EXP_GUARD=22566f20231808d5e107c7e30de34988f3cb49d0d85a8b16aa34fab9d1e35865   # scripts/runner-job-guard.mjs @ 1703054
EXP_GATE=1ce2dbf0667da76ef586e409809ff841e5c7a621ffa4be09e95641431eb75771    # scripts/deploy-gate.mjs @ 1703054
PIN=560959900fe94ab3ce045bec466a4aa3361615b2                                 # git blob of deploy-vps.yml @ 1703054
sha(){ sha256sum "$1" | cut -d' ' -f1; }
# same algorithm as mp-deploy's sudoers_digest (paths are the real ones in production)
sudoers_digest(){ local f; { sha "$SUDOERS_MAIN"; for f in "$SUDOERS_DIR"/*; do [ -e "$f" ] || continue; printf '%s %s\n' "$(basename "$f")" "$(sha "$f")"; done; } | sha256sum | cut -d' ' -f1; }
cmd="${1:-}"; arg="${2:-}"
case "$cmd" in
install)
  K="$arg"
  for f in deploy-authz.mjs runner-job-guard.mjs deploy-gate.mjs mp-deploy.v31 mp-runner-guard.sh.in render-hook.sh MANIFEST.sha256; do [ -f "$K/$f" ] || { echo "missing $f"; exit 1; }; done
  ( cd "$K" && grep -E ' (deploy-authz.mjs|runner-job-guard.mjs|deploy-gate.mjs|mp-deploy.v31|mp-runner-guard.sh.in|render-hook.sh)$' MANIFEST.sha256 | sha256sum -c --quiet - ) \
    && [ "$(cd "$K" && grep -cE ' (deploy-authz.mjs|runner-job-guard.mjs|deploy-gate.mjs|mp-deploy.v31|mp-runner-guard.sh.in|render-hook.sh)$' MANIFEST.sha256)" = 6 ] \
    && [ "$(sha "$K/deploy-authz.mjs")" = $EXP_VER ] && [ "$(sha "$K/runner-job-guard.mjs")" = $EXP_GUARD ] && [ "$(sha "$K/deploy-gate.mjs")" = $EXP_GATE ] \
    || { echo "PKG_HASH_MISMATCH"; exit 1; }
  grep -q '@MP-TEST-SHIM@' "$K/mp-deploy.v31" && ! grep -q 'MP_' <(grep -v '@MP-TEST-SHIM@' "$K/mp-deploy.v31") || { echo "PKG_NOT_PRODUCTION"; exit 1; }
  grep -qx 'FREEZE=1' "$CONF" || { echo "PRECONDITION: current conf must have FREEZE=1"; exit 1; }
  [ -x "$NODE" ] || { echo "PRECONDITION: $NODE missing"; exit 1; }
  B="$P/root/mp-deploy-rollback-v31-$(date +%Y%m%dT%H%M%S)-$$"; [ ! -e "$B" ] || exit 1; install -d "${OWN[@]}" -m 700 "$B"
  cp -p "$SB" "$B/mp-deploy.v3"; cp -p "$CONF" "$B/authz.conf"; cp -p "$HOOK" "$B/mp-runner-guard.sh"
  [ -f "$LEG" ] && cp -p "$LEG" "$B/mp-deploy-authz.mjs"
  [ -f "$GCONF" ] && cp -p "$GCONF" "$B/runner-guard.json"
  chmod 600 "$B"/*
  (cd "$B" && F=$(ls -A) && sha256sum $F > "$B.sums" && mv "$B.sums" SHA256SUMS && sha256sum -c --quiet SHA256SUMS)
  install -d "${OWN[@]}" -m 755 "$GD"
  for f in deploy-authz.mjs runner-job-guard.mjs deploy-gate.mjs; do install "${OWN[@]}" -m 644 "$K/$f" "$GD/.$f.new"; mv -T "$GD/.$f.new" "$GD/$f"; done
  printf '{"workflow_blob_sha":"%s"}' $PIN > "$GCONF.new"; chmod 644 "$GCONF.new"; mv -T "$GCONF.new" "$GCONF"
  NODESUM=$(sha "$NODE")
  bash "$K/render-hook.sh" "$K/mp-runner-guard.sh.in" "$B/hook.rendered" "$NODESUM" $EXP_GUARD $EXP_VER
  install "${OWN[@]}" -m 755 "$B/hook.rendered" "$HOOK.new"; rm -f "$B/hook.rendered"
  install "${OWN[@]}" -m 755 "$K/mp-deploy.v31" "$SB.new"
  ( umask 077; printf 'MODE=report\nFREEZE=1\nVERIFIER_SHA256=%s\nGUARD_SHA256=%s\nGATE_SHA256=%s\nHOOK_SHA256=%s\nSELF_SHA256=%s\nNODE_SHA256=%s\nSUDOERS_SHA256=%s\nWORKFLOW_BLOB_SHA=%s\n' \
      $EXP_VER $EXP_GUARD $EXP_GATE "$(sha "$HOOK.new")" "$(sha "$SB.new")" "$NODESUM" "$(sudoers_digest)" $PIN > "$CONF.new" ); chmod 600 "$CONF.new"
  # swap under the v3 lock (no deploy in flight). conf first: FREEZE=1 at every instant (v3 reads the new conf as invalid
  # -> enforce+freeze; v3.1 reads it as report+freeze). Then the hook, then the binary.
  mkdir -p "$(dirname "$OLDLOCK")"
  flock -n "$OLDLOCK" sh -c "mv -T '$CONF.new' '$CONF' && mv -T '$HOOK.new' '$HOOK' && mv -T '$SB.new' '$SB'" || { rm -f "$CONF.new" "$HOOK.new" "$SB.new"; echo "LOCK_BUSY"; exit 75; }
  [ -f "$LEG" ] && rm -f "$LEG"     # NB-E: single verifier (copy kept in $B)
  echo "INSTALLED backup=$B"; ;;
rollback)
  B="$arg"; (cd "$B" && sha256sum -c --quiet SHA256SUMS) || { echo "BACKUP_CORRUPT"; exit 1; }
  for f in mp-deploy.v3 authz.conf mp-runner-guard.sh; do [ -f "$B/$f" ] || { echo "BACKUP_INCOMPLETE $f"; exit 1; }; done
  grep -qx 'FREEZE=1' "$B/authz.conf" || { echo "REFUSE: backup conf without FREEZE=1"; exit 1; }
  install "${OWN[@]}" -m 600 "$B/authz.conf" "$CONF.new"
  install "${OWN[@]}" -m 755 "$B/mp-runner-guard.sh" "$HOOK.new"
  install "${OWN[@]}" -m 755 "$B/mp-deploy.v3" "$SB.new"
  [ -f "$B/mp-deploy-authz.mjs" ] && { install "${OWN[@]}" -m 755 "$B/mp-deploy-authz.mjs" "$LEG.new"; mv -T "$LEG.new" "$LEG"; }
  mkdir -p "$(dirname "$OLDLOCK")"
  flock -n "$OLDLOCK" sh -c "mv -T '$CONF.new' '$CONF' && mv -T '$HOOK.new' '$HOOK' && mv -T '$SB.new' '$SB'" || { rm -f "$CONF.new" "$HOOK.new" "$SB.new"; echo "LOCK_BUSY"; exit 75; }
  echo "ROLLED_BACK_TO_V3 (FREEZE=1). mp-gate/ and runner-guard.json left in place (inert without v3.1)."; ;;
*) echo "usage: $0 install <pkgdir> | rollback <backupdir>"; exit 2;;
esac
