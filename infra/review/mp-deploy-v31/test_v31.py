#!/usr/bin/env python3
"""Offline adversarial + regression tests for mp-deploy v3.1-r2. FULL production code path (no stub): real git origin,
real fetch/worktree, real release dir copy, real symlink switch, health against a local server. Privileged commands
(runuser/systemd-run/install -o/chown/systemctl/sudo -l/id) are replaced by the test shim in a test COPY only.
Usage: python3 test_v31.py   (FAILFAST=1 stops at first failure; MUT_TARGET=<file> tests a mutant)"""
from harness import *
import re
OK="result=OK"
def rel(s): return os.path.exists(P("dep","releases",s))
def cur(): return os.readlink(P("dep","current")) if os.path.islink(P("dep","current")) else None
# ---------------- A. v3 regression ----------------
setup(); rc,o=run(tok(claims()))
check("A01 valid token -> verify, consume, approved, tip x3, real build, switch, health, OK", rc==0 and "consume=OK" in o and "approved=OK" in o and "main_tip_1=OK" in o and "main_tip_2=OK" in o and "main_tip_3=OK" in o and OK in o and len(ledger())==2 and cur()==P("dep","releases",SHA) and open(P("state","deployed")).read().strip()==SHA,o)
setup(); rc,o=run(tok(claims(iat=int(time.time())-1000,nbf=int(time.time())-1000,exp=int(time.time())-400))); check("A02 expired -> 77", rc==77 and "AUTHZ_EXPIRED" in o and not ledger(),o)
t=tok(claims()); h,p_,s=t.split("."); bad=f"{h}.{p_}.{b64(K2.sign(f'{h}.{p_}'.encode(),padding.PKCS1v15(),hashes.SHA256()))}"
rc,o=run(bad); check("A03a foreign key -> BAD_SIGNATURE", rc==77 and "AUTHZ_BAD_SIGNATURE" in o,o)
c=claims(); t=tok(c); h,p_,s=t.split("."); t2=f"{h}.{b64(json.dumps(dict(c,repository='evil/MatchPilot')).encode())}.{s}"
rc,o=run(t2); check("A03b tampered payload", rc==77 and "AUTHZ_BAD_SIGNATURE" in o,o)
rc,o=run(tok(claims(),alg="none")); check("A03c alg none", rc==77,o)
rc,o=run(tok(claims(),kid="unknown")); check("A03d unknown kid", rc==77 and "AUTHZ_UNKNOWN_KEY" in o,o)
rc,o=run(tok(claims(aud="sts.amazonaws.com"))); check("A04 wrong aud", rc==77 and "aud" in o,o)
rc,o=run(tok(claims(repository="zarbopiero963-droid/Other",repository_id="1"))); check("A05 wrong repo", rc==77 and "repository" in o,o)
rc,o=run(tok(claims(ref="refs/heads/feature"))); check("A06 wrong branch", rc==77 and "AUTHZ_CLAIM ref" in o,o)
wf="zarbopiero963-droid/MatchPilot/.github/workflows/ci.yml@refs/heads/main"
rc,o=run(tok(claims(workflow_ref=wf,job_workflow_ref=wf))); check("A07 wrong workflow", rc==77 and "workflow_ref" in o,o)
rc,o=run(tok(claims(environment=None,sub="repo:zarbopiero963-droid/MatchPilot:ref:refs/heads/main"))); check("A08 environment missing", rc==77 and "environment" in o,o)
rc,o=run(tok(claims(workflow_sha=NEWER,sha=NEWER))); check("A09 token SHA != deploy SHA", rc==77 and "AUTHZ_SHA" in o,o)
rc,o=run(tok(claims(event_name="workflow_dispatch"))); check("A09b event_name", rc==77 and "event_name" in o,o)
setup(); t=tok(claims()); rc1,_=run(t); rc,o=run(t); check("A10a replay same token", rc1==0 and rc==77 and "AUTHZ_REPLAY" in o,o)
rc,o=run(tok(claims())); check("A10b new token same run attempt", rc==77 and "AUTHZ_REPLAY" in o and "run:39999:1" in o,o)
rc,o=run(tok(claims(run_attempt="2"))); check("A10c new run_attempt -> AUTHZ_RERUN_APPROVAL_UNBOUND", rc==77 and "AUTHZ_RERUN_APPROVAL_UNBOUND" in o,o)
setup(deployed=OLD,current=OLD); ta,tb=tok(claims(run_id="501")),tok(claims(run_id="502"))
pa=popen(ta,MP_TEST_NPM_SLEEP="4"); time.sleep(2.5); rcb,ob=run(tb); oa=pa.stdout.read().decode(); rca=pa.wait()
check("A11a two concurrent deploys: 0 and 75, loser not consumed", rca==0 and rcb==75 and len(ledger())==2,oa+ob)
rc,o=run(tb); check("A11b loser retries after release -> ALREADY_DEPLOYED 0", rc==0 and "ALREADY_DEPLOYED" in o,o)
setup(deployed=OLD,current=OLD); t=tok(claims(run_id="777")); ps=[popen(t,MP_TEST_NPM_SLEEP="2") for _ in range(8)]; rcs=[p.wait() for p in ps]
check("A11c 8 racers same token: exactly one 0", rcs.count(0)==1 and all(r in (0,75,77) for r in rcs),str(rcs))
setup(); rc,o=run(""); check("A12 missing token", rc==77 and "AUTHZ_NO_TOKEN" in o,o)
rc,o=run("   \n"); check("A12b whitespace token", rc==77 and "AUTHZ_NO_TOKEN" in o,o)
rc,o=run("x"*20000); check("A12c oversized", rc==77,o)
STATE["down"]=True; rc,o=run(tok(claims())); STATE["down"]=False; check("A13a JWKS 503", rc==77 and "AUTHZ_JWKS_UNAVAILABLE" in o and not ledger(),o)
STATE["slow"]=15; t0=time.time(); rc,o=run(tok(claims())); STATE["slow"]=0; check(f"A13b JWKS timeout ({time.time()-t0:.0f}s)", rc==77 and "AUTHZ_JWKS_UNAVAILABLE" in o,o)
rc,o=run(tok(claims()),e=env(MP_OIDC_BASE="http://127.0.0.1:1")); check("A13c JWKS refused", rc==77,o)
setup(deployed=OLD,current=OLD); good=True; det=""
for i,d in enumerate([0.2,0.6,1.2,2.0,3.0]):
    t=tok(claims(run_id=str(9000+i))); p=popen(t,MP_TEST_NPM_SLEEP="3"); time.sleep(d); os.killpg(p.pid,signal.SIGKILL); p.wait(); time.sleep(2)
    consumed=hashlib.sha256(f"run:{9000+i}:1".encode()).hexdigest() in ledger(); rc,o=run(t)
    g=(consumed and rc==77 and "AUTHZ_REPLAY" in o) or ((not consumed) and rc==0); good&=g; det+=f"[kill@{d}s consumed={consumed} rc={rc}] "
    if rc==0: setup(deployed=OLD,current=OLD)
check("A14 SIGKILL mid-run: never double use "+det, good, det)
setup(); rc,o=run(tok(claims(workflow_sha=OLD,sha=OLD,run_id="100",run_attempt="3")),sha=SHA); check("A15b older run token for current SHA", rc==77 and "AUTHZ_SHA" in o,o)
rc,o=run(tok(claims(iat=int(time.time())-400,nbf=int(time.time())-400,exp=int(time.time())+200))); check("A15c token > 5 min", rc==77 and "AUTHZ_TOO_OLD" in o,o)
setup(freeze="1",deployed=OLD); rc,o=run(tok(claims())); check("A16b FREEZE enforce: 78 before verify, ledger untouched", rc==78 and "FROZEN" in o and "verify=" not in o and not ledger(),o)
setup(deployed=OLD); os.remove(P("etc","authz.conf")); rc,o=run(tok(claims())); check("A16c config missing -> 78", rc==78,o)
setup(deployed=OLD); open(P("etc","authz.conf"),"a").write("MODE=lol\n"); rc,o=run(tok(claims())); check("A16d config invalid -> 78", rc==78,o)
setup(deployed=OLD); os.chmod(P("etc","authz.conf"),0o644); rc,o=run(tok(claims())); check("A16d3 config 0644 (unsafe) -> ignored, enforce+freeze 78", rc==78 and "conf_missing_or_unsafe" in o,o)
setup(deployed=OLD); open(P("etc","authz.conf"),"a").write("EXTRA=1\n"); rc,o=run(tok(claims())); check("A16d2 config unknown key -> 78", rc==78,o)
setup(); os.chmod(P("gate","deploy-authz.mjs"),0o644); open(P("gate","deploy-authz.mjs"),"a").write("\n// tamper\n"); rc,o=run(tok(claims())); check("A16e verifier tampered -> 80", rc==80 and "hash:" in o,o)
setup(); os.chmod(P("state","authz-ledger"),0o755); rc,o=run(tok(claims())); check("A16f ledger perms -> 77", rc==77 and "LEDGER_UNSAFE" in o,o)
setup(); shutil.rmtree(P("state","authz-ledger")); rc,o=run(tok(claims())); check("A16g ledger missing -> 77", rc==77,o)
setup(mode="report",freeze="0"); rc,o=run(""); check("A17 report+FREEZE=0 invalid -> enforce+freeze", rc==77 and "report_requires_freeze" in o,o)
setup(); rc,o=run(tok(claims()),sha="ZZ"); check("A18 bad SHA arg -> 2", rc==2,o)
# ---------------- T. test mode unreachable in production (review P2-1, mandate 8) ----------------
src=open(V31).read()
check("T01 production file reads no MP_* variable, no TESTMODE/stub/--import", "MP_" not in src.replace("# @MP-TEST-SHIM@","") and "TESTMODE" not in src and "STUB" not in src and "--import" not in src)
check("T02 the only test hook is one inert comment line", src.count("@MP-TEST-SHIM@")==1 and "\n# @MP-TEST-SHIM@\n" in src)
setup(); pf=P("sbin","mp-deploy.prod"); shutil.copy(V31,pf); os.chmod(pf,0o755); before=snapshot()
rc,o=run(tok(claims()),script=pf); check("T03 production file with every MP_* override set: ignored (real /etc paths -> enforce+freeze 78), fake root untouched", rc==78 and "FROZEN" in o and snapshot()==before and not ledger(),o)
setup(); rc,o=run(tok(claims()),e=env(SUDO_USER="ghrunner",SUDO_UID="995")); check("T04 test copy with SUDO_* env -> shim refuses (99)", rc==99 and "REFUSED" in o,o)
rc,o=run(tok(claims()),e=env(MP_TEST_STUB="0")); check("T05 test copy without MP_TEST_STUB=1 -> refused 99", rc==99,o)
shs=open(SHIM).read(); check("T06 shim source refuses euid 0 / sudo / installed path", 'id -u)" = 0' in shs and "SUDO_USER" in shs and "/usr/*" in shs)
# ---------------- B. approved ----------------
setup(); mock(default_approve=False); rc,o=run(tok(claims())); check("B01 no approval -> 77, token consumed", rc==77 and "AUTHZ_NO_OWNER_APPROVAL" in o and len(ledger())==2,o)
setup(); mock(default_approve=False,approvals={"39999":[{"state":"approved","user":{"login":"someone-else"},"environments":[{"name":"vps-production"}]}]}); rc,o=run(tok(claims())); check("B02 approval by other user", rc==77 and "AUTHZ_NO_OWNER_APPROVAL" in o,o)
setup(); mock(default_approve=False,approvals={"39999":[{"state":"rejected","user":{"login":"zarbopiero963-droid"},"environments":[{"name":"vps-production"}]}]}); rc,o=run(tok(claims())); check("B03 rejection", rc==77,o)
setup(); mock(default_approve=False,approvals={"39999":[{"state":"approved","user":{"login":"zarbopiero963-droid"},"environments":[{"name":"staging"}]}]}); rc,o=run(tok(claims())); check("B04 other environment", rc==77,o)
setup(); mock(default_approve=False,approvals={"4242":OWNER_APPROVAL}); rc,o=run(tok(claims())); check("B05 approval of a different run only", rc==77 and "run=39999" in o,o)
setup(); mock(status={"approvals":500}); rc,o=run(tok(claims())); check("B06 approvals 500", rc==77 and "AUTHZ_APPROVALS_UNREADABLE" in o,o)
setup(); mock(delay_ms={"approvals":15000}); rc,o=run(tok(claims())); check("B07 approvals timeout", rc==77 and "UNREADABLE" in o,o)
setup(); mock(down=["approvals"]); rc,o=run(tok(claims())); check("B08 approvals network error", rc==77 and "UNREADABLE" in o,o)
setup(); open(P("mock.json"),"w").write(json.dumps({"tip_refs":SHA,"tip_api":SHA,"approvals":{"39999":{"not":"a list"}}})); rc,o=run(tok(claims())); check("B09 inconsistent approvals body", rc==77,o)
js=re.search(r"rid=\$\(printf '%s' \"\$AZ_OUT\" \| timeout 5 \"\$NODE\" -e '([^']+)'",src)
def parse(obj): return subprocess.run([NODE,"-e",js.group(1)],input=json.dumps(obj).encode(),capture_output=True).returncode
cases={"ok":({"run":{"run_id":"123","run_attempt":"1"}},0),"array":({"run":{"run_id":["123"],"run_attempt":"1"}},1),"number":({"run":{"run_id":123,"run_attempt":"1"}},1),
       "att_array":({"run":{"run_id":"123","run_attempt":["1"]}},1),"zero":({"run":{"run_id":"0","run_attempt":"1"}},1),"newline":({"run":{"run_id":"1\n2","run_attempt":"1"}},1),"missing":({},1)}
res={k:(js is not None and parse(v[0])==v[1]) for k,v in cases.items()}; check("B10 run_id/run_attempt parser (extracted+executed): strings only (P2-4)", all(res.values()),res)
# ---------------- C. main-tip ----------------
setup(); mock(tip_refs=NEWER,tip_api=NEWER); rc,o=run(tok(claims())); check("C01 stale -> 79 TIP_STALE", rc==79 and "TIP_STALE" in o,o)
setup(); mock(tip_refs=SHA,tip_api=NEWER); rc,o=run(tok(claims())); check("C02 sources disagree -> 79", rc==79 and "disagree" in o,o)
setup(); mock(down=["refs"]); rc,o=run(tok(claims())); check("C03 refs down -> 79", rc==79 and "TIP_UNVERIFIABLE" in o,o)
setup(); mock(delay_ms={"api":15000}); rc,o=run(tok(claims())); check("C04 api timeout -> 79", rc==79,o)
setup(); mock(refs_extra=[f"{NEWER} refs/heads/main\n"]); rc,o=run(tok(claims())); check("C05 two main lines -> 79 MALFORMED", rc==79 and "MALFORMED" in o,o)
setup(); mock(status={"api":404}); rc,o=run(tok(claims())); check("C06 api 404 -> 79", rc==79,o)
setup(); mock(api_raw="{not json"); rc,o=run(tok(claims())); check("C07 api malformed -> 79", rc==79,o)
setup(); mock(refs_raw="garbage"); rc,o=run(tok(claims())); check("C08 refs malformed -> 79", rc==79,o)
setup(deployed=OLD); mock(tip_refs=NEWER,tip_api=NEWER); rc,o=run(tok(claims())); check("C10 consecutive merges: approved older run -> 79", rc==79 and "TIP_STALE" in o,o)
# ---------------- M. ordering vs persistent side effects: REAL code path, REAL git main moved (mandate 4/5) ----------------
setup(deployed=OLD,current=OLD); mock(tip_git=ORIGIN); move_main(NEWER); before=snapshot(); rc,o=run(tok(claims())); d=diff(before,snapshot())
check("M01 main already moved (real git): 79 at main_tip_1, before fetch; snapshot diff EMPTY", rc==79 and "main_tip_1: rc=" in o and "fetched" not in o and d=={},f"{d} {o}")
setup(deployed=OLD,current=OLD); open(P("state","allow-rollback-"+SHA),"w").write("x"); mock(tip_git=ORIGIN); before=snapshot(); rc,o=run(tok(claims()),e=env(MP_TEST_MOVE_AT_CI=NEWER)); d=diff(before,snapshot())
check("M02 main moved during npm ci (real git): 79 at main_tip_2 BEFORE tests; test DB untouched; worktree removed; marker kept; snapshot diff EMPTY", rc==79 and "main_tip_2: rc=" in o and "TIP_STALE" in o and d=={} and not os.path.exists(P("testdb.log")) and not rel(SHA) and cur()==P("dep","releases",OLD) and len(ledger())==2,f"{d} {o}")
setup(deployed=OLD,current=OLD); open(P("state","allow-rollback-"+SHA),"w").write("x"); mock(tip_git=ORIGIN); before=snapshot(); rc,o=run(tok(claims()),e=env(MP_TEST_MOVE_AT_TEST=NEWER)); d=diff(before,snapshot()); tdb=d.pop("testdb",None)
check("M03 main moved during tests (real git): 79 at main_tip_3 right before switch; release dir + worktree removed; marker kept; current/deployed unchanged; diff EMPTY except the test-DB step", rc==79 and "main_tip_3: rc=" in o and "main_tip_2=OK" in o and d=={} and tdb is not None and not rel(SHA) and cur()==P("dep","releases",OLD) and open(P("state","deployed")).read().strip()==OLD,f"{d} {o}")
setup(deployed=OLD,current=OLD); mock(tip_git=ORIGIN); rc,o=run(tok(claims()))
check("M05 control: main NOT moved (real git) -> real switch to new release, deployed=SHA, restart issued", rc==0 and OK in o and cur()==P("dep","releases",SHA) and open(P("state","deployed")).read().strip()==SHA and os.path.exists(P("systemctl.log")),o)
lines=[l for l in open(P("log","deploy.log")).read().splitlines() if any(k in l for k in ("main_tip_","fetched","npm_ci","tests rc","result="))]
try: order=[next(i for i,l in enumerate(lines) if k in l) for k in ("main_tip_1","fetched","npm_ci","main_tip_2","tests rc","main_tip_3","result=OK")]
except StopIteration: order=[1,0]
check("M06 runtime order: tip1 < fetch < npm ci < tip2 < tests < tip3 < switch/OK", order==sorted(order),lines)
setup(deployed=NEWER,current=NEWER); open(P("state","allow-rollback-"+SHA),"w").write("x"); mock(tip_git=ORIGIN); rc,o=run(tok(claims()),e=env(MP_TEST_MOVE_AT_TEST=NEWER))
check("M04 non-monotonic deploy with root rollback marker, main moves during tests -> 79 at main_tip_3, marker NOT consumed", rc==79 and "rollback_marker_present" in o and "main_tip_3: rc=" in o and os.path.exists(P("state","allow-rollback-"+SHA)),o)
setup(deployed=NEWER,current=NEWER); open(P("state","allow-rollback-"+SHA),"w").write("x"); mock(tip_git=ORIGIN); rc,o=run(tok(claims()))
check("M07 marker consumed only on the successful switch", rc==0 and "rollback_marker_consumed" in o and not os.path.exists(P("state","allow-rollback-"+SHA)),o)
setup(deployed=NEWER,current=NEWER); mock(tip_git=ORIGIN); rc,o=run(tok(claims()))
check("M08 non-monotonic without marker -> FAIL_NOT_MONOTONIC", rc==1 and "FAIL_NOT_MONOTONIC" in o,o)
# ---------------- H. health rollback latch (review P1-4) ----------------
setup(deployed=OLD,current=OLD); STATE["health"]=500; rc,o=run(tok(claims()),timeout=200); STATE["health"]=200
check("H01 health fail -> rollback to previous release, freeze-latch written", rc==1 and "FAIL_HEALTH_ROLLED_BACK" in o and cur()==P("dep","releases",OLD) and os.path.exists(P("state","freeze-latch")),o[-600:])
rc,o=run(tok(claims(run_id="501"))); check("H02 latch present + FREEZE=0 conf -> 78 before verify", rc==78 and "freeze_latch" in o and "verify=" not in o,o)
# ---------------- D. FREEZE + report ----------------
setup(freeze="1",deployed=OLD); mock(down=["refs","api","approvals"]); STATE["down"]=True; rc,o=run(tok(claims())); STATE["down"]=False
check("D01 FREEZE enforce: 78, no verify, no lock dir, no ledger", rc==78 and "verify=" not in o and not os.path.exists(P("lock")) and not ledger(),o)
setup(mode="report",freeze="1",deployed=OLD,current=OLD); t=tok(claims()); before=snapshot(); rc,o=run(t); d=diff(before,snapshot())
check("D02 report+FREEZE new SHA: full eval logged, 78, nothing built/switched (snapshot diff EMPTY)", rc==78 and "verify=ACCEPT" in o and "consume=OK" in o and "approved=OK" in o and "main_tip_1=OK" in o and "fetched" not in o and d=={} and len(ledger())==2,f"{d} {o}")
rc,o=run(t); check("D03 R6 replay in report+FREEZE", rc==78 and "AUTHZ_REPLAY" in o,o)
rc,o=run(tok(claims())); check("D04 R6 second token same attempt", rc==78 and "AUTHZ_REPLAY" in o and "run:39999:1" in o,o)
rc,o=run(""); check("D05 report+FREEZE no token", rc==78 and "AUTHZ_NO_TOKEN" in o,o)
mock(tip_refs=NEWER,tip_api=NEWER); rc,o=run(tok(claims(run_id="4242"))); check("D06 report+FREEZE stale run: TIP_STALE logged, 78", rc==78 and "TIP_STALE" in o,o)
setup(mode="report",freeze="1",current=SHA); rc,o=run(""); check("D07 report+FREEZE same SHA: ALREADY_DEPLOYED, no build", rc==0 and "ALREADY_DEPLOYED" in o and "fetched" not in o,o)
setup(freeze="1",current=SHA); rc,o=run(""); check("D08 enforce+FREEZE same SHA no token -> 77", rc==77,o)
setup(mode="report",freeze="1",deployed=OLD); os.chmod(P("gate","deploy-gate.mjs"),0o664); rc,o=run(tok(claims())); check("D09 report+FREEZE integrity failure -> INTEGRITY in deploy.log, 78, nothing consumed (P2-2)", rc==78 and "INTEGRITY" in o and not ledger() and "INTEGRITY" in open(P("log","deploy.log")).read(),o)
setup(freeze="1",current=SHA); STATE["health"]=500; rc,o=run(tok(claims()),timeout=200); STATE["health"]=200; check("D10 FREEZE same SHA unhealthy -> 78, no rebuild", rc==78 and "fetched" not in o,o[-400:])
# ---------------- E. integrity ----------------
def integ(name,mut,want=None):
    setup(); mut(); rc,o=run(tok(claims())); check(name, rc==80 and not ledger() and (want is None or want in o),o)
integ("E01 guard hash mismatch", lambda: open(P("gate","runner-job-guard.mjs"),"a").write("//x\n"),"hash:")
integ("E02 gate dir 0775", lambda: os.chmod(P("gate"),0o775),"unsafe:")
integ("E03 verifier 0664", lambda: os.chmod(P("gate","deploy-authz.mjs"),0o664),"unsafe:")
def e04(): os.rename(P("hook.sh"),P("hook.real")); os.symlink(P("hook.real"),P("hook.sh"))
integ("E04 hook symlink", e04,"unsafe:")
integ("E05 runner .env second hook line", lambda: open(P("runner.env"),"a").write("ACTIONS_RUNNER_HOOK_JOB_STARTED=/tmp/evil.sh\n"),"runner_env")
integ("E06 runner .env 0644", lambda: os.chmod(P("runner.env"),0o644),"runner_env")
integ("E06b runner .env extra NODE_OPTIONS (P2-3)", lambda: open(P("runner.env"),"a").write("NODE_OPTIONS=--require=/tmp/x.js\n"),"runner_env")
integ("E06c runner .env LD_PRELOAD (P2-3)", lambda: open(P("runner.env"),"a").write("LD_PRELOAD=/tmp/x.so\n"),"runner_env")
if "orbitd" in sh("id","-Gn"): integ("E06d runner .env wrong group (P2-3)", lambda: subprocess.run(["chgrp","orbitd",P("runner.env")],check=True),"runner_env")
integ("E06e runner .env ancestor group-writable (P2-3)", lambda: os.chmod(R,0o770),"runner_env"); os.chmod(R,0o700)
integ("E09 workflow pin mismatch", lambda: (os.chmod(P("etc","runner-guard.json"),0o644), open(P("etc","runner-guard.json"),"w").write(json.dumps({"workflow_blob_sha":"6"*40}))),"workflow_pin")
integ("E10 guard config extra key", lambda: open(P("etc","runner-guard.json"),"w").write(json.dumps({"workflow_blob_sha":PIN,"x":1})),"workflow_pin")
integ("E11 ancestor dir group-writable", lambda: os.chmod(P("sbin"),0o775),"ancestors:")
integ("E12 self hash mismatch", lambda: conf(SELF_SHA256="0"*64),"hash:")
def e13(): shutil.copy(OLDVER,P("gate","deploy-authz.mjs")); os.chmod(P("gate","deploy-authz.mjs"),0o644)
integ("E13 stale verifier, conf pins main", e13,"hash:")
setup(); e13(); conf(VERIFIER_SHA256=sha256(OLDVER)); rc,o=run(tok(claims())); check("E14 stale verifier PINNED -> 77/79, no switch", rc in (77,79) and OK not in o,o)
setup(); os.makedirs(P("lock"),mode=0o755); os.chmod(P("lock"),0o755); rc,o=run(tok(claims())); check("E15 lock dir 0755 -> 80", rc==80 and "LOCK_UNSAFE" in o,o)
setup(); rc,o=run(tok(claims())); st=os.stat(P("lock")); check("E16 lock dir created 0700", rc==0 and (st.st_mode&0o777)==0o700,oct(st.st_mode))
integ("E17 conf missing GUARD_SHA256", lambda: conf(GUARD_SHA256=None),"hash:")
integ("E18 legacy verifier present (P2-6 branch now covered)", lambda: open(P("legacy","mp-deploy-authz.mjs"),"w").write("x"),"legacy_verifier_present")
integ("E19 node binary hash mismatch (P2-5)", lambda: conf(NODE_SHA256="0"*64),"hash:")
integ("E20 conf missing NODE_SHA256", lambda: conf(NODE_SHA256=None),"hash:")
# ---------------- S. sudo (review P1-2, mandate 3): every case must be 80 ----------------
EXTRA=lambda body: lambda: (wsudo(P("sudoers","zz-extra"),body), conf())   # added AND re-pinned: only the parsers can catch it
SL=open(os.path.join(FIX,"sudo-l-ghrunner.txt")).read()
def sudo_l(txt): return lambda: open(P("sudo-l.txt"),"w").write(txt)
cases=[
 ("S01 %ghrunner group rule (file)", EXTRA("%ghrunner ALL=(ALL) NOPASSWD: ALL\n"),"sudo_files_runner"),
 ("S02 User_Alias containing ghrunner (file)", EXTRA("User_Alias RUN = ghrunner\nRUN ALL=(ALL) NOPASSWD: ALL\n"),"sudo_files_runner"),
 ("S03 User_Alias multi-member (file)", EXTRA("User_Alias RUN = alice, ghrunner , bob\nRUN ALL=(ALL) NOPASSWD: ALL\n"),"sudo_files_runner"),
 ("S04 Cmnd_Alias to extra command (file)", EXTRA("Cmnd_Alias SH = /bin/bash\nghrunner ALL=(root) NOPASSWD: SH\n"),"sudo_files_runner"),
 ("S05 Runas_Alias (file)", EXTRA("Runas_Alias R = root\nghrunner ALL=(R) NOPASSWD: /usr/bin/env\n"),"sudo_files_runner"),
 ("S06 #uid user spec (file)", EXTRA("#995 ALL=(ALL) NOPASSWD: ALL\n"),"sudo_files_runner"),
 ("S07 %#gid group spec (file)", EXTRA("%#986 ALL=(ALL) NOPASSWD: ALL\n"),"sudo_files_runner"),
 ("S08 ALL users spec (file)", EXTRA("ALL ALL=(ALL) NOPASSWD: ALL\n"),"sudo_files_all_users"),
 ("S09 wildcard on the same command (file)", EXTRA("ghrunner ALL=(root) NOPASSWD: /usr/local/sbin/mp-deploy *\n"),"sudo_files_runner"),
 ("S10 line continuation hiding a 2nd command", lambda: (wsudo(P("sudoers","ghrunner"),"ghrunner ALL=(root) NOPASSWD: /usr/local/sbin/mp-deploy, \\\n    /bin/bash\n"),conf()),"sudo_files_runner"),
 ("S11 extra @includedir", EXTRA("@includedir /tmp/evil.d\n"),"sudo_includes"),
 ("S12 legacy #includedir", EXTRA("#includedir /tmp/evil.d\n"),"sudo_includes"),
 ("S13 @include file", EXTRA("@include /tmp/evil\n"),"sudo_includes"),
 ("S14 rule in /etc/sudoers itself", lambda: (wsudo(P("sudoers_main"),open(P("sudoers_main")).read()+"ghrunner ALL=(ALL) NOPASSWD: ALL\n"),conf()),"sudo_files_runner"),
 ("S15 Defaults:ghrunner env_keep", EXTRA("Defaults:ghrunner env_keep += \"NODE_OPTIONS\"\n"),"sudo_files_runner"),
 ("S16 sudo -l shows an extra effective rule (group/alias resolved by sudo)", sudo_l(SL+"    (ALL) NOPASSWD: ALL\n"),"sudo_effective"),
 ("S17 sudo -l (ALL) runas instead of (root)", sudo_l(SL.replace("(root) NOPASSWD","(ALL) NOPASSWD")),"sudo_effective"),
 ("S18 sudo -l wildcard command", sudo_l(SL.replace("mp-deploy\n","mp-deploy *\n")),"sudo_effective"),
 ("S19 sudo -l Defaults env_keep added", sudo_l(SL.replace("use_pty","use_pty, env_keep+=NODE_OPTIONS")),"sudo_effective"),
 ("S20 sudo -l !env_reset", sudo_l(SL.replace("env_reset","!env_reset")),"sudo_effective"),
 ("S21 sudo -l unparseable", sudo_l("garbage\n"),"sudo_effective"),
 ("S22 sudo -l fails (no output)", lambda: os.remove(P("sudo-l.txt")),"sudo_effective"),
 ("S23 sudo -l two commands on one line", sudo_l(SL.replace("mp-deploy\n","mp-deploy, /bin/sh\n")),"sudo_effective"),
 ("S24 ghrunner in group sudo", lambda: open(P("groups.txt"),"w").write("ghrunner sudo\n"),"sudo_groups"),
 ("S25 new harmless file not re-pinned", lambda: wsudo(P("sudoers","zz-new"),"# comment only\n"),"sudoers_pin"),
 ("S26 sudoers.d file 0644", lambda: os.chmod(P("sudoers","mpdeploy"),0o644),"unsafe_sudoers"),
 ("S27 /etc/sudoers 0640", lambda: os.chmod(P("sudoers_main"),0o640),"unsafe_sudoers"),
 ("S28 sudoers.d is a symlink", lambda: (os.rename(P("sudoers"),P("sudoers.real")),os.symlink(P("sudoers.real"),P("sudoers"))),"unsafe_sudoers_dir"),
 ("S29 conf missing SUDOERS_SHA256", lambda: conf(SUDOERS_SHA256=None),None),
 ("S30 symlinked file in sudoers.d", lambda: (os.symlink(P("sudoers","mpdeploy"),P("sudoers","zz-link")),conf()),"unsafe_sudoers"),
]
def clean_sd():
    if os.path.islink(P("sudoers")): os.remove(P("sudoers"))
    shutil.rmtree(P("sudoers.real"),ignore_errors=True)
for name,mut,want in cases:
    clean_sd(); integ(name,mut,want)
clean_sd()
setup(); rc,o=run(tok(claims())); check("S00 control: REAL VPS sudo layout + real `sudo -l -U ghrunner` output -> passes (no false positive)", rc==0 and "INTEGRITY" not in o,o)
# ---------------- F. static ordering checks ----------------
ix=src.index
check("F01 main_tip_2 precedes the tests unit; main_tip_3 precedes the atomic switch", ix('main_tip_2: $TW" 79')<ix('--working-directory="$W"   -- /bin/bash -c')<ix('main_tip_3: $TW" 79')<ix('# Atomic switch'))
check("F02 main_tip_1 precedes report+FREEZE exit and the fetch", ix('main_tip_1: $TW" 79')<ix('after_eval eval_fail')<ix('CACHE="$BUILD_ROOT/repo.git"'))
check("F03 FREEZE deny precedes integrity, verify, lock", ix('deny FROZEN "current=')<ix('chk "$VERIFIER"')<ix('authz_verify verify\n')<ix('flock -n 9'))
check("F04 legacy path referenced once (constant)", src.count('mp-deploy-authz.mjs')==1)
check("F05 rollback marker removed only after main_tip_3", ix('rm -f "$CONSUME_MARKER"')>ix('main_tip_3: $TW" 79') and src.count('rm -f "$M"')==0)
check("F06 every gate node invocation uses the pinned absolute $NODE (the app's own test runner inside the sandbox excluded)", not re.search(r'(^|[ ($])node ',src.replace('"$NODE"','').replace('node --test --test-reporter=tap','')))
done()
