#!/usr/bin/env python3
"""Offline tests of install-v31.sh install/rollback in a fake PREFIX (non-root), incl. a post-install smoke run of the
INSTALLED mp-deploy (test copy) against the installed tree: every integrity pin the installer wrote must pass."""
from harness import *
T=tempfile.mkdtemp(prefix="insttest-"); os.chmod(T,0o755); Q=lambda *a: os.path.join(T,*a)
INST=os.path.join(HERE,"install-v31.sh")
def ish(*a,**kw):
    p=subprocess.run(["bash",INST,*a],env=dict(ENV,PREFIX=T),capture_output=True,text=True,**kw); return p.returncode,p.stdout+p.stderr
def h(p): return sha256(p) if os.path.exists(p) else None
def mk():
    shutil.rmtree(T,ignore_errors=True); os.makedirs(T); os.chmod(T,0o755)
    for d in ("usr/local/sbin","usr/local/libexec","usr/bin","etc/mp-deploy","etc/sudoers.d","root","run/lock","pkg","opt/actions-runner","var/lib/mp-deploy/authz-ledger","var/log/mp-deploy","srv/mp-deploy/releases","srv/mp-build"):
        os.makedirs(Q(d),exist_ok=True)
    for d in ("usr","usr/local","usr/local/sbin","usr/local/libexec","usr/bin","etc","etc/mp-deploy","opt","opt/actions-runner","var","var/lib","var/lib/mp-deploy","srv","srv/mp-deploy","srv/mp-deploy/releases"): os.chmod(Q(d),0o755)
    os.chmod(Q("var/lib/mp-deploy/authz-ledger"),0o700); os.chmod(Q("srv/mp-build"),0o700); os.chmod(Q("etc/mp-deploy"),0o755)
    shutil.copy(os.path.join(HERE,"mp-deploy.v3"),Q("usr/local/sbin/mp-deploy")); os.chmod(Q("usr/local/sbin/mp-deploy"),0o755)
    shutil.copy(OLDVER,Q("usr/local/libexec/mp-deploy-authz.mjs")); os.chmod(Q("usr/local/libexec/mp-deploy-authz.mjs"),0o755)
    shutil.copy(os.path.join(HERE,"mp-runner-guard.sh.v1-live"),Q("usr/local/libexec/mp-runner-guard.sh")); os.chmod(Q("usr/local/libexec/mp-runner-guard.sh"),0o755)
    open(Q("etc/mp-deploy/authz.conf"),"w").write("MODE=report\nFREEZE=1\nVERIFIER_SHA256=a4123e44536f63ffd88aea50b1dbf626e00ffe8b226ce5ad008086444cf42462\n"); os.chmod(Q("etc/mp-deploy/authz.conf"),0o600)
    shutil.copy(NODE,Q("usr/bin/node")); os.chmod(Q("usr/bin/node"),0o755)
    open(Q("etc/sudoers"),"w").write(open(os.path.join(FIX,"sudoers")).read().replace("@includedir /etc/sudoers.d",f"@includedir {Q('etc/sudoers.d')}")); os.chmod(Q("etc/sudoers"),0o440)
    for n in os.listdir(os.path.join(FIX,"sudoers.d")): shutil.copy(os.path.join(FIX,"sudoers.d",n),Q("etc/sudoers.d",n)); os.chmod(Q("etc/sudoers.d",n),0o440)
    open(Q("opt/actions-runner/.env"),"w").write(f"LANG=C.UTF-8\nACTIONS_RUNNER_HOOK_JOB_STARTED={Q('usr/local/libexec/mp-runner-guard.sh')}\n"); os.chmod(Q("opt/actions-runner/.env"),0o640)
    for f in ("deploy-authz.mjs","runner-job-guard.mjs","deploy-gate.mjs","mp-deploy.v31","mp-runner-guard.sh.in","render-hook.sh"): shutil.copy(os.path.join(HERE,f),Q("pkg",f))
    subprocess.run("sha256sum deploy-authz.mjs runner-job-guard.mjs deploy-gate.mjs mp-deploy.v31 mp-runner-guard.sh.in render-hook.sh > MANIFEST.sha256",shell=True,cwd=Q("pkg"),check=True)
ORIG=lambda: {k:h(Q(k)) for k in ("usr/local/sbin/mp-deploy","etc/mp-deploy/authz.conf","usr/local/libexec/mp-runner-guard.sh","usr/local/libexec/mp-deploy-authz.mjs")}
mk(); o0=ORIG(); open(Q("pkg","deploy-gate.mjs"),"a").write("//x\n"); rc,o=ish("install",Q("pkg"))
check("I01 tampered package (hash != pinned #181) refused, nothing changed", rc!=0 and "PKG_HASH_MISMATCH" in o and ORIG()==o0 and not os.path.exists(Q("usr/local/libexec/mp-gate")),o)
mk(); open(Q("pkg","deploy-gate.mjs"),"a").write("//x\n"); subprocess.run("sha256sum deploy-authz.mjs runner-job-guard.mjs deploy-gate.mjs mp-deploy.v31 mp-runner-guard.sh.in render-hook.sh > MANIFEST.sha256",shell=True,cwd=Q("pkg"),check=True)
rc,o=ish("install",Q("pkg")); check("I01a tampered #181 component with a consistent forged MANIFEST refused (fixed pins)", rc!=0 and "PKG_HASH_MISMATCH" in o and ORIG()==o0,o)
mk(); open(Q("pkg","mp-deploy.v31"),"a").write("#x\n"); rc,o=ish("install",Q("pkg")); check("I01b mp-deploy not matching package MANIFEST refused", rc!=0 and "PKG_HASH_MISMATCH" in o and ORIG()==o0,o)
mk(); s=open(Q("pkg","mp-deploy.v31")).read().replace("# @MP-TEST-SHIM@","source /tmp/x # MP_"); open(Q("pkg","mp-deploy.v31"),"w").write(s)
subprocess.run("sha256sum deploy-authz.mjs runner-job-guard.mjs deploy-gate.mjs mp-deploy.v31 mp-runner-guard.sh.in render-hook.sh > MANIFEST.sha256",shell=True,cwd=Q("pkg"),check=True)
rc,o=ish("install",Q("pkg")); check("I01c test copy (shim sourced) refused as PKG_NOT_PRODUCTION", rc!=0 and "PKG_NOT_PRODUCTION" in o and ORIG()==o0,o)
mk(); c=Q("etc/mp-deploy/authz.conf"); open(c,"w").write("MODE=enforce\nFREEZE=0\n"); o1=ORIG(); rc,o=ish("install",Q("pkg")); check("I02 refused when current conf is not FREEZE=1", rc!=0 and "PRECONDITION" in o and ORIG()==o1,o)
mk(); lk=open(Q("run/lock/mp-deploy.lock"),"w"); import fcntl; fcntl.flock(lk,fcntl.LOCK_EX); rc,o=ish("install",Q("pkg")); fcntl.flock(lk,fcntl.LOCK_UN); lk.close()
check("I03 v3 lock held -> 75, binary/conf/hook unchanged, no .new left", rc==75 and ORIG()==o0 and not any(n.endswith(".new") for n in os.listdir(Q("usr/local/sbin"))+os.listdir(Q("etc/mp-deploy"))),o)
mk(); rc,o=ish("install",Q("pkg")); B=o.split("backup=")[-1].strip() if "backup=" in o else ""
check("I04 install OK", rc==0 and "INSTALLED" in o,o)
cf=dict(l.split("=",1) for l in open(Q("etc/mp-deploy/authz.conf")).read().split())
check("I05 conf: MODE=report FREEZE=1 and exactly the 10 keys", cf.get("MODE")=="report" and cf.get("FREEZE")=="1" and set(cf)=={"MODE","FREEZE","VERIFIER_SHA256","GUARD_SHA256","GATE_SHA256","HOOK_SHA256","SELF_SHA256","NODE_SHA256","SUDOERS_SHA256","WORKFLOW_BLOB_SHA"},cf)
check("I06 pins match the installed files", cf["SELF_SHA256"]==h(Q("usr/local/sbin/mp-deploy"))==sha256(V31) and cf["HOOK_SHA256"]==h(Q("usr/local/libexec/mp-runner-guard.sh")) and cf["NODE_SHA256"]==h(Q("usr/bin/node")) and cf["VERIFIER_SHA256"]==h(Q("usr/local/libexec/mp-gate/deploy-authz.mjs")) and cf["WORKFLOW_BLOB_SHA"]=="560959900fe94ab3ce045bec466a4aa3361615b2",cf)
hook=open(Q("usr/local/libexec/mp-runner-guard.sh")).read()
check("I07 installed hook: rendered, no placeholder, pins = node/guard/verifier", "@NODE_SHA256@" not in hook and f'NODE_SHA256="{h(Q("usr/bin/node"))}"' in hook and f'GUARD_SHA256="{h(GUARD)}"' in hook and f'AUTHZ_SHA256="{h(VER)}"' in hook)
check("I08 legacy verifier removed; modes gate 755 / files 644 / conf 600 / backup 700", not os.path.exists(Q("usr/local/libexec/mp-deploy-authz.mjs")) and oct(os.stat(Q("usr/local/libexec/mp-gate")).st_mode&0o777)=="0o755" and oct(os.stat(Q("usr/local/libexec/mp-gate/deploy-authz.mjs")).st_mode&0o777)=="0o644" and oct(os.stat(Q("etc/mp-deploy/authz.conf")).st_mode&0o777)=="0o600" and oct(os.stat(B).st_mode&0o777)=="0o700",B)
check("I09 backup complete + SHA256SUMS verifies (v3, conf, v1 hook, legacy verifier)", sorted(os.listdir(B))==["SHA256SUMS","authz.conf","mp-deploy-authz.mjs","mp-deploy.v3","mp-runner-guard.sh"] and subprocess.run(["sha256sum","-c","--quiet","SHA256SUMS"],cwd=B).returncode==0,os.listdir(B))
# post-install smoke: test copy of the INSTALLED binary against the INSTALLED tree; only SELF_SHA256 re-pinned to the copy
SHA_=SHA; d=Q("srv/mp-deploy/releases",SHA_); os.makedirs(d); os.symlink(d,Q("srv/mp-deploy/current")); open(Q("var/lib/mp-deploy/deployed"),"w").write(SHA_+"\n")
tc=Q("smoke-mp-deploy"); test_copy(Q("usr/local/sbin/mp-deploy"),tc); c=Q("etc/mp-deploy/authz.conf")
txt=open(c).read().replace(cf["SELF_SHA256"],sha256(tc)); open(c,"w").write(txt)
open(P("sudo-l.txt"),"w").write(open(os.path.join(FIX,"sudo-l-ghrunner.txt")).read()); open(P("groups.txt"),"w").write("ghrunner\n")
e=env(MP_TEST_ROOT=T,MP_DEPLOY_ROOT=Q("srv/mp-deploy"),MP_BUILD_ROOT=Q("srv/mp-build"),MP_STATE=Q("var/lib/mp-deploy"),MP_LOGDIR=Q("var/log/mp-deploy"),
      MP_LOCKDIR=Q("run/mp-deploy"),MP_AUTHZ_CONF=c,MP_GATEDIR=Q("usr/local/libexec/mp-gate"),MP_LEGACY_VERIFIER=Q("usr/local/libexec/mp-deploy-authz.mjs"),
      MP_GUARD_CONF=Q("etc/mp-deploy/runner-guard.json"),MP_HOOK=Q("usr/local/libexec/mp-runner-guard.sh"),MP_RUNNER_ENV=Q("opt/actions-runner/.env"),
      MP_SUDOERS_MAIN=Q("etc/sudoers"),MP_SUDOERS_DIR=Q("etc/sudoers.d"),MP_NODE=Q("usr/bin/node"))
rc,o=run("",sha=SHA_,e=e,script=tc)
check("I10 post-install smoke (S3 step): installed tree passes ALL integrity checks -> report+FREEZE same SHA -> ALREADY_DEPLOYED 0", rc==0 and "ALREADY_DEPLOYED" in o and "INTEGRITY" not in o,o)
rc,o=run("",sha=NEWER,e=e,script=tc); check("I11 post-install: new SHA -> 78 FROZEN (report+FREEZE)", rc==78 and "FROZEN" in o,o)
open(c,"w").write(txt.replace("FREEZE=1","FREEZE=0")); os.chmod(c,0o600)
rc,o=ish("rollback",B); check("I12 rollback (from a FREEZE=0 state) restores v3, v1 hook, legacy verifier, old FREEZE=1 conf", rc==0 and "ROLLED_BACK_TO_V3" in o and ORIG()==o0,o)
mk(); rc,o=ish("install",Q("pkg")); B=o.split("backup=")[-1].strip(); os.chmod(os.path.join(B,"authz.conf"),0o600); open(os.path.join(B,"authz.conf"),"a").write("x\n")
rc,o=ish("rollback",B); check("I13 corrupted backup refused, installed v3.1 untouched", rc!=0 and "BACKUP_CORRUPT" in o and h(Q("usr/local/sbin/mp-deploy"))==sha256(V31),o)
mk(); rc,o=ish("install",Q("pkg")); B=o.split("backup=")[-1].strip()
for f in ("authz.conf","SHA256SUMS"): os.chmod(os.path.join(B,f),0o600)
open(os.path.join(B,"authz.conf"),"w").write("MODE=enforce\nFREEZE=0\n"); subprocess.run("F=$(ls -A | grep -v SHA256SUMS); sha256sum $F > SHA256SUMS",shell=True,cwd=B)
rc,o=ish("rollback",B); check("I14 backup whose conf is not FREEZE=1 refused", rc!=0 and "FREEZE=1" in o,o)
src=open(INST).read(); check("I15 installer never references v2 (caf9233f / mp-deploy.v2)", "caf9233f" not in src and "mp-deploy.v2" not in src)
check("I16 swap order: conf before hook before binary (FREEZE=1 at every instant)", src.index("mv -T '$CONF.new' '$CONF' && mv -T '$HOOK.new' '$HOOK' && mv -T '$SB.new' '$SB'")>0)
shutil.rmtree(T,ignore_errors=True); done()
