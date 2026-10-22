#!/usr/bin/env python3
"""Weekly MatchPilot DR coverage check (READ-ONLY on the VPS). Prints a JSON report + a component table.
Drive-side presence is checked by the routine with the Drive connector (folder ids in mpvps.py); this script
prints which Drive ids/names are expected (from the ledgers)."""
import json, datetime
from mpvps import *
c=conn(); now=datetime.datetime.now().astimezone()
def sh(cmd): return run(c,cmd)[1].strip()
def age_h(iso):
    try: return round((now-datetime.datetime.fromisoformat(iso)).total_seconds()/3600,1)
    except Exception: return None
R=[]
def comp(name,status,detail): R.append(dict(component=name,status=status,detail=detail))
# 1 PG17 nightly local
last=sh("ls -1d /srv/matchpilot/backups/pg/2*T0330*/ | sort | tail -1 | xargs -r basename")  # newest NIGHTLY (03:30) backup
manual=sh("ls -1d /srv/matchpilot/backups/pg/2*/ | sort | xargs -r -n1 basename | grep -v T0330 | tail -3 | tr '\\n' ' '")
chk=sh(f"cd /srv/matchpilot/backups/pg/{last} && sha256sum -c --quiet SHA256SUMS >/dev/null 2>&1 && echo OK || echo BAD") if last else 'NONE'
lt=datetime.datetime.strptime(last,'%Y%m%dT%H%M%S').replace(tzinfo=now.tzinfo) if last else None
ah=round((now-lt).total_seconds()/3600,1) if lt else None
comp('PG17 main (matchpilot_offline, matchpilot_fpt) local nightly 03:30', 'OK' if chk=='OK' and ah is not None and ah<26 else 'STALE/FAIL', f'last_nightly={last} age_h={ah} sha={chk} log_tail={sh("tail -1 /srv/matchpilot/logs/backup.log")} recent_manual={manual}')
# 2 PG17 offsite
led=[json.loads(l) for l in sh("cat /srv/matchpilot/backups/offsite-ledger.jsonl").splitlines() if l.strip()]
ver=[e for e in led if e['state']=='VERIFIED']; lv=ver[-1] if ver else None
comp('PG17 offsite (age) -> Drive MatchPilot/Backups/VPS', 'OK' if lv and age_h(lv['at'])<30 and lv['ts']>=last else 'STALE/FAIL', f"last_verified={lv and lv['ts']} drive_id={lv and lv.get('drive_id')} age_h={lv and age_h(lv['at'])} newest_local={last} failed={[e['ts'] for e in led if e['state']=='FAILED']}")
comp('PG17 offsite prepare timer 04:00', 'OK' if 'Result=success' in sh('systemctl show matchpilot-offsite.service -p Result') and 'enabled' in sh('systemctl is-enabled matchpilot-offsite.timer') else 'FAIL', sh('systemctl show matchpilot-offsite.service -p Result,ExecMainStatus,ExecMainExitTimestamp | tr "\\n" " "'))
# 3 DuckDB trial archive + config + infra bundle (inside PG17 backup)
comp('DuckDB trial / config.tgz / infra.bundle (inside PG17 backup)', 'OK' if last and sh(f'cd /srv/matchpilot/backups/pg/{last} && ls duckdb/*.duckdb config.tgz infra.bundle globals.sql | wc -l')=='4' else 'MISSING', f'in {last}')
# 4 Archive #40 VPS copy (immutable) vs reference manifest
a=sh("cd / && awk '{print $2}' /root/rollback-t80u/arch-sha-after.txt | head -1 >/dev/null; sha256sum -c --quiet /root/rollback-t80u/arch-sha-after.txt >/dev/null 2>&1 && echo SAME || echo DIFF")
comp('Archive #40 (VPS copy, immutable; original on Drive, copy-only)', 'OK' if a=='SAME' else 'CHECK', f'sha vs /root/rollback-t80u/arch-sha-after.txt: {a}')
# 5 PG18 staging
st=sh(f'cat {STG_STATUS} 2>/dev/null'); st=json.loads(st) if st else {}
sl=[json.loads(l) for l in sh(f'cat {STG_LEDGER}').splitlines() if l.strip()]
sv=[e for e in sl if e['state']=='VERIFIED' and str(e.get('id','')).startswith('staging-2')]; slv=sv[-1] if sv else None
comp('PG18 staging data local 01:30', 'OK' if st.get('state')=='OK' and age_h(st.get('at',''))<26 else 'STALE/FAIL', f"last={st.get('id')} state={st.get('state')} at={st.get('at')} local={sh(f'ls {STG_AUTO} | tr \"\\n\" \" \"')}")
comp('PG18 staging offsite -> Drive .../VPS/staging/<ID>/', 'OK' if slv and age_h(slv['at'])<8*24 else 'STALE/MISSING', f"last_verified={slv and slv['id']} at={slv and slv['at']} skipped_unchanged={[e['id'] for e in sl if e['state']=='SKIPPED_UNCHANGED'][-3:]}")
comp('PG18 config/units/scripts (config-pg18.tgz in each staging backup)', 'OK' if st.get('state')=='OK' else 'CHECK', 'restore doc /srv/matchpilot/infra/staging-backup/RESTORE-PG18-STAGING.md')
comp('PG18 staging backup timer 01:30', 'OK' if 'enabled' in sh('systemctl is-enabled matchpilot-staging-backup.timer') else 'FAIL', sh('systemctl show matchpilot-staging-backup.service -p Result,ExecMainStatus,ExecMainExitTimestamp | tr "\\n" " "'))
# 6 App code
# t139: the real release source is /srv/mp-deploy/current (mp-deploy v3.3)
rel=sh('readlink -f /srv/mp-deploy/current'); gs=sh(f'cat /srv/matchpilot/backups/pg/{last}/git_sha.txt') if last else ''
comp('App code (rebuild from GitHub + mp-deploy)', 'OK' if gs and gs in rel else 'CHECK', f'current={rel} backup_git_sha={gs}')
# 7 scripts installed outside backups: compare with infra repo copies
for f,ref in (('/usr/local/sbin/matchpilot-backup','/srv/matchpilot/infra/scripts/backup.sh'),('/usr/local/sbin/mp-deploy','/srv/matchpilot/infra/deploy/mp-deploy')):
    a1=sh(f'sha256sum {f} | cut -c1-12'); a2=sh(f'sha256sum {ref} 2>/dev/null | cut -c1-12')
    comp(f'Installed script {f}', 'OK' if a1 and a1==a2 else 'GAP', f'installed={a1} infra_copy={a2 or "none"} (infra copy is what backups carry)')
# 8 secrets: presence only, never content
pres=sh("for f in /root/age/recovery-identity.txt /etc/matchpilot/age-recipient.txt /srv/matchpilot/app.env /srv/matchpilot/.dbenv /srv/matchpilot/.pgpass /etc/matchpilot/duckdns.env; do [ -e $f ] && echo \"$f present $(stat -c %a:%U $f)\" || echo \"$f ABSENT\"; done")
comp('Secrets (excluded from backups by design; owner-held copies)', 'INFO', pres.replace('\n','; '))
# 9 Neon raw export
comp('Neon raw export /root/neon-export/x-*', 'INFO', sh('ls -d /root/neon-export/x-* 2>/dev/null; du -sh /root/neon-export/x-* 2>/dev/null | cut -f1') or 'absent (shredded)')
# 10 capacity
comp('Disk capacity', 'OK' if int(sh("df --output=avail -k / | tail -1"))>10_000_000 else 'LOW', sh("df -h / | tail -1")+' | backups: '+sh("du -sh /srv/matchpilot/backups/* | tr '\\n' ' '"))
print(json.dumps(dict(at=now.isoformat(),components=R,drive_expected=dict(pg17_folder=DRIVE_VPS_FOLDER,pg17_last=lv,staging_folder=DRIVE_STAGING_FOLDER,staging_last=slv)),indent=1))
print('\n| Component | Status | Detail |\n|---|---|---|')
for r in R: print(f"| {r['component']} | {r['status']} | {r['detail'][:220]} |")
