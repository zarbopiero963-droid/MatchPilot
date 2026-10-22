#!/usr/bin/env python3
"""Adversarial B4 tests for mp-runner-guard.sh v2 (+ runner-job-guard.mjs, deploy-authz.mjs) — offline, mocked GitHub.
The hook is rendered from mp-runner-guard.sh.in exactly as the installer does, then a TEST COPY replaces the marker line
with `source hook-test-shim.sh` (paths + fetch mock). Usage: python3 test_hook.py  (MUT_HOOK=<template> for mutants)"""
import json,os,subprocess,shutil,tempfile,hashlib,time
HERE=os.path.dirname(os.path.abspath(__file__))
TPL=os.environ.get("MUT_HOOK") or os.path.join(HERE,"mp-runner-guard.sh.in")
R=tempfile.mkdtemp(prefix="hooktest-"); P=lambda *a: os.path.join(R,*a)
sha256=lambda p: hashlib.sha256(open(p,'rb').read()).hexdigest()
NODE=shutil.which("node"); SHA="1"*40; NEWER="2"*40; PIN="5"*40; WF=".github/workflows/deploy-vps.yml"
RES=[]
def check(n,c,d=""): RES.append(c); print(("PASS " if c else "FAIL ")+n+("" if c else "  :: "+str(d)[-700:]),flush=True)
def setup():
    for d in ("gate","bin","etc"): shutil.rmtree(P(d),ignore_errors=True); os.makedirs(P(d)); os.chmod(P(d),0o755)
    for f in ("deploy-authz.mjs","runner-job-guard.mjs"): shutil.copy(os.path.join(HERE,f),P("gate",f)); os.chmod(P("gate",f),0o644)
    shutil.copy(NODE,P("bin","node")); os.chmod(P("bin","node"),0o755)
    open(P("etc","runner-guard.json"),"w").write(json.dumps({"workflow_blob_sha":PIN})); os.chmod(P("etc","runner-guard.json"),0o644)
    render()
    mock()
def render(tpl=None):
    subprocess.run([os.path.join(HERE,"render-hook.sh"),tpl or TPL,P("hook.prod"),sha256(P("bin","node")),sha256(P("gate","runner-job-guard.mjs")),sha256(P("gate","deploy-authz.mjs"))],check=True)
    s=open(P("hook.prod")).read(); assert s.count("\n# @MP-TEST-SHIM@\n")==1
    open(P("hook.sh"),"w").write(s.replace("\n# @MP-TEST-SHIM@\n",f"\nsource {os.path.join(HERE,'hook-test-shim.sh')}\n")); os.chmod(P("hook.sh"),0o755)
OWNER=[{"state":"approved","user":{"login":"zarbopiero963-droid"},"environments":[{"name":"vps-production"}]}]
def mock(**o):
    b={"run":{"id":39999,"run_attempt":1,"status":"in_progress","conclusion":None,"event":"push","head_branch":"main","head_sha":SHA,"path":WF,
              "repository":{"full_name":"zarbopiero963-droid/MatchPilot"}},
       "jobs":{"jobs":[{"name":"deploy","runner_name":"matchpilot-vps","run_attempt":1,"status":"in_progress","conclusion":None}]},
       "contents":{"type":"file","path":WF,"sha":PIN},"pending":[]}
    for k,v in o.pop("bodies",{}).items(): b[k]=v
    st={"tip_refs":SHA,"tip_api":SHA,"approvals":{"39999":OWNER},"bodies":b}; st.update(o)
    open(P("mock.json"),"w").write(json.dumps(st))
ENV0={k:v for k,v in os.environ.items() if not k.startswith(("GITHUB_","SUDO_","MP_","RUNNER_"))}
def env(**o):
    e=dict(ENV0,GITHUB_REPOSITORY="zarbopiero963-droid/MatchPilot",GITHUB_EVENT_NAME="push",GITHUB_REF="refs/heads/main",
           GITHUB_WORKFLOW_REF="zarbopiero963-droid/MatchPilot/.github/workflows/deploy-vps.yml@refs/heads/main",GITHUB_JOB="deploy",
           GITHUB_RUN_ID="39999",GITHUB_RUN_ATTEMPT="1",GITHUB_SHA=SHA,RUNNER_NAME="matchpilot-vps",
           MP_TEST_STUB="1",MP_NODE=P("bin","node"),MP_GATEDIR=P("gate"),MP_GUARD_CONF=P("etc","runner-guard.json"),
           MP_TEST_FETCH_MOCK=os.path.join(HERE,"fetch-mock.mjs"),MP_TEST_MOCK_FILE=P("mock.json"))
    for k,v in o.items():
        if v is None: e.pop(k,None)
        else: e[k]=v
    return e
def run(e=None,script=None,timeout=150):
    p=subprocess.run(["bash",script or P("hook.sh")],env=e or env(),capture_output=True,timeout=timeout); return p.returncode,(p.stdout+p.stderr).decode()
def case(name,want,mut=None,**eo):
    setup()
    if mut: mut()
    rc,o=run(env(**eo)); check(name, rc==1 and "REFUSED" in o and (want is None or want in o), f"rc={rc} {o}")
setup(); rc,o=run(); check("H00 legit deploy job of deploy-vps.yml on main, approved, pinned, tip -> ALLOW", rc==0 and "ALLOW" in o,o)
# stage 1 (v1 behaviour kept)
case("H01 other repository (fork)","repository",GITHUB_REPOSITORY="evil/MatchPilot")
case("H02 pull_request event","event",GITHUB_EVENT_NAME="pull_request")
case("H03 workflow_dispatch event","event",GITHUB_EVENT_NAME="workflow_dispatch")
case("H04 branch ref","ref=",GITHUB_REF="refs/heads/feature")
case("H05 other workflow (ci.yml) on main","workflow_ref",GITHUB_WORKFLOW_REF="zarbopiero963-droid/MatchPilot/.github/workflows/ci.yml@refs/heads/main")
case("H06 env vars missing","repository",GITHUB_REPOSITORY=None)
ev=P("event.json")
def evbad(): open(ev,"w").write(json.dumps({"repository":{"full_name":"evil/x"},"ref":"refs/heads/main"}))
case("H07 event payload repository mismatch","event_payload_mismatch",evbad,GITHUB_EVENT_PATH=ev)
# stage 3: B4 — a merged PR changes deploy-vps.yml (drops environment / adds a job / changes steps)
case("H10 B4: deploy-vps.yml modified on main (blob != pin)","GUARD_WORKFLOW_NOT_PINNED",lambda: mock(bodies={"contents":{"type":"file","path":WF,"sha":"6"*40}}))
case("H11 B4: extra job added to deploy-vps.yml (GITHUB_JOB != deploy)","GUARD_JOB",GITHUB_JOB="pwn")
case("H12 B4: 'environment' dropped -> no approval exists","GUARD_NO_OWNER_APPROVAL",lambda: mock(approvals={}))
case("H13 approval by another user","GUARD_NO_OWNER_APPROVAL",lambda: mock(approvals={"39999":[{"state":"approved","user":{"login":"x"},"environments":[{"name":"vps-production"}]}]}))
case("H14 deployment still pending","GUARD_DEPLOYMENT_STILL_WAITING",lambda: mock(bodies={"pending":[{"environment":{"name":"vps-production"}}]}))
case("H15 re-run (attempt 2)","GUARD_RERUN_APPROVAL_UNBOUND",GITHUB_RUN_ATTEMPT="2")
case("H16 run is another workflow per API (path spoof)","GUARD_RUN_MISMATCH",lambda: mock(bodies={"run":{"id":39999,"run_attempt":1,"status":"in_progress","conclusion":None,"event":"push","head_branch":"main","head_sha":SHA,"path":".github/workflows/ci.yml","repository":{"full_name":"zarbopiero963-droid/MatchPilot"}}}))
case("H17 run head_sha differs from GITHUB_SHA","GUARD_RUN_MISMATCH",GITHUB_SHA=NEWER)
case("H18 job assigned to another runner","GUARD_JOB_NOT_ASSIGNED_HERE",RUNNER_NAME="other-runner")
case("H19 job already completed","GUARD_JOB_NOT_ACTIVE",lambda: mock(bodies={"jobs":{"jobs":[{"name":"deploy","runner_name":"matchpilot-vps","run_attempt":1,"status":"completed","conclusion":"success"}]}}))
case("H20 two jobs named deploy","GUARD_JOB_NOT_ASSIGNED_HERE",lambda: mock(bodies={"jobs":{"jobs":[{"name":"deploy","runner_name":"matchpilot-vps","run_attempt":1,"status":"in_progress","conclusion":None}]*2}}))
case("H21 stale SHA (main moved)","TIP_STALE",lambda: mock(tip_refs=NEWER,tip_api=NEWER))
case("H22 GitHub API down","GUARD_API_ERROR",lambda: mock(down=["run","jobs","contents","approvals","pending","refs","api"]))
case("H23 run API 500","GUARD_API_ERROR",lambda: mock(status={"run":500}))
case("H24 guard config extra key","GUARD_CONFIG",lambda: open(P("etc","runner-guard.json"),"w").write(json.dumps({"workflow_blob_sha":PIN,"x":1})))
case("H25 guard config unreadable","GUARD_CONFIG",lambda: open(P("etc","runner-guard.json"),"w").write("{"))
case("H26 RUNNER_NAME missing","GUARD_RUNNER_NAME",RUNNER_NAME=None)
case("H27 run id not numeric","GUARD_RUN_ID",GITHUB_RUN_ID="1;id")
# stage 2: integrity
case("H30 guard file tampered","integrity runner-job-guard.mjs",lambda: open(P("gate","runner-job-guard.mjs"),"a").write("//x\n"))
case("H31 verifier (guard's import) tampered","integrity deploy-authz.mjs",lambda: open(P("gate","deploy-authz.mjs"),"a").write("//x\n"))
case("H32 node binary replaced","integrity node",lambda: open(P("bin","node"),"ab").write(b"\0"))
case("H33 guard file group-writable","integrity runner-job-guard.mjs",lambda: os.chmod(P("gate","runner-job-guard.mjs"),0o664))
def h34(): os.rename(P("gate","runner-job-guard.mjs"),P("gate","g.real")); os.symlink(P("gate","g.real"),P("gate","runner-job-guard.mjs"))
case("H34 guard file is a symlink","integrity runner-job-guard.mjs",h34)
case("H35 gate dir group-writable","integrity gate dir",lambda: os.chmod(P("gate"),0o775))
case("H36 guard config group-writable","integrity guard config",lambda: os.chmod(P("etc","runner-guard.json"),0o664))
# env injection: the job environment cannot reach the guard
evil=P("evil.cjs"); flag=P("pwned")
open(evil,"w").write(f"require('fs').writeFileSync({json.dumps(flag)},'x')\n")
setup(); rc,o=run(env(NODE_OPTIONS=f"--require={evil}",LD_PRELOAD="/nonexistent.so",GITHUB_API_URL="http://127.0.0.1:1"))
check("H40 NODE_OPTIONS/LD_PRELOAD in hook env are dropped (env -i): ALLOW and the injected code never runs", rc==0 and not os.path.exists(flag),o)
setup(); mock(delay_ms={"run":200000}); t0=time.time(); rc,o=run(env(MP_GUARD_TIMEOUT="5")); check(f"H41 guard hang -> timeout -> REFUSED ({time.time()-t0:.0f}s)", rc==1 and "REFUSED" in o,o)
# render/installer safety + no test mode in production
tpl=open(TPL).read()
check("H50 production template: no MP_* variable, one inert marker", "MP_" not in tpl.replace("# @MP-TEST-SHIM@","") and tpl.count("@MP-TEST-SHIM@")==1)
bad=P("bad.in"); open(bad,"w").write(tpl.replace("@NODE_SHA256@","@NODE_SHA256@ @EXTRA_SHA256@"))
r=subprocess.run([os.path.join(HERE,"render-hook.sh"),bad,P("x.sh"),"a"*64,"b"*64,"c"*64],capture_output=True); check("H51 render refuses a leftover placeholder", r.returncode!=0 and not os.path.exists(P("x.sh")))
setup(); rc,o=run(script=P("hook.prod")); check("H52 rendered PRODUCTION hook ignores MP_* (real paths absent on box -> REFUSED integrity)", rc==1 and "integrity" in o,o)
rc,o=run(env(SUDO_USER="x")); check("H53 test copy refuses under sudo env", rc==99,o)
n=sum(RES); print(f"\nSUMMARY {n}/{len(RES)} PASS"); shutil.rmtree(R,ignore_errors=True); raise SystemExit(0 if n==len(RES) else 1)
