"""Shared offline harness for mp-deploy v3.1-r2 tests. TEST-ONLY. No GitHub, no VPS, no deploy, no root.
Builds a temp fake root with a REAL git origin, real release dirs, real symlink switch, a TEST COPY of mp-deploy where
the marker line '# @MP-TEST-SHIM@' is replaced by 'source test-shim.sh' (the production file is never modified)."""
import base64,json,os,subprocess,sys,time,tempfile,threading,hashlib,signal,shutil,http.server,socketserver
from cryptography.hazmat.primitives.asymmetric import rsa,padding
from cryptography.hazmat.primitives import hashes
HERE=os.path.dirname(os.path.abspath(__file__))
V31=os.environ.get("MUT_TARGET") or os.path.join(HERE,'mp-deploy.v31')
SHIM=os.path.join(HERE,'test-shim.sh'); MOCK=os.path.join(HERE,'fetch-mock.mjs')
VER=os.path.join(HERE,'deploy-authz.mjs'); OLDVER=os.path.join(HERE,'deploy-authz.a4123e44.mjs')
GUARD=os.path.join(HERE,'runner-job-guard.mjs'); GATE=os.path.join(HERE,'deploy-gate.mjs')
FIX=os.path.join(HERE,'fixtures')
NODE=shutil.which("node")
b64=lambda b: base64.urlsafe_b64encode(b).rstrip(b'=').decode()
sha256=lambda p: hashlib.sha256(open(p,'rb').read()).hexdigest()
K=rsa.generate_private_key(public_exponent=65537,key_size=2048); K2=rsa.generate_private_key(public_exponent=65537,key_size=2048)
def jwk(k,kid):
    n=k.public_key().public_numbers(); i2b=lambda x:x.to_bytes((x.bit_length()+7)//8,'big')
    return {"kty":"RSA","alg":"RS256","use":"sig","kid":kid,"n":b64(i2b(n.n)),"e":b64(i2b(n.e))}
JWKS={"keys":[jwk(K,"kid-test-1")]}
R=tempfile.mkdtemp(prefix="v31r2-"); os.chmod(R,0o700)
P=lambda *a: os.path.join(R,*a)
def sh(*a,cwd=None): return subprocess.run(a,cwd=cwd,check=True,capture_output=True,text=True).stdout.strip()
# ---- real git origin: OLD -> SHA (main) -> NEWER (branch next) ----
GW=P("gitwork"); os.makedirs(GW); sh("git","init","-q","-b","main",GW)
for k,v in (("user.email","t@t"),("user.name","t")): sh("git","-C",GW,"config",k,v)
os.makedirs(os.path.join(GW,"test")); os.makedirs(os.path.join(GW,"migrations"))
open(os.path.join(GW,"package.json"),"w").write('{"name":"fixture","scripts":{"check":"true"}}\n')
open(os.path.join(GW,"test","a.test.mjs"),"w").write("import test from 'node:test';\ntest('ok',()=>{});\n")
open(os.path.join(GW,"migrations","001.sql"),"w").write("-- m1\n")
def commit(msg):
    open(os.path.join(GW,"VERSION"),"w").write(msg+"\n"); sh("git","-C",GW,"add","-A"); sh("git","-C",GW,"commit","-q","-m",msg)
    return sh("git","-C",GW,"rev-parse","HEAD")
OLD=commit("old"); SHA=commit("sha"); sh("git","-C",GW,"checkout","-q","-b","next"); NEWER=commit("newer"); sh("git","-C",GW,"checkout","-q","main")
ORIGIN=P("origin.git"); sh("git","clone","-q","--bare",GW,ORIGIN)
def move_main(to): sh("git","-C",ORIGIN,"update-ref","refs/heads/main",to)
PIN="5"*40
def claims(**o):
    now=int(time.time())
    c={"iss":"https://token.actions.githubusercontent.com","aud":"matchpilot-vps-deploy","repository":"zarbopiero963-droid/MatchPilot",
       "repository_id":"1401571874","repository_owner_id":"249075720","ref":"refs/heads/main","event_name":"push","environment":"vps-production",
       "sub":"repo:zarbopiero963-droid/MatchPilot:environment:vps-production",
       "workflow_ref":"zarbopiero963-droid/MatchPilot/.github/workflows/deploy-vps.yml@refs/heads/main",
       "job_workflow_ref":"zarbopiero963-droid/MatchPilot/.github/workflows/deploy-vps.yml@refs/heads/main",
       "runner_environment":"self-hosted","workflow_sha":SHA,"sha":SHA,"run_id":"39999","run_attempt":"1",
       "jti":os.urandom(8).hex(),"iat":now-5,"nbf":now-5,"exp":now+300}
    for k,v in o.items():
        if v is None: c.pop(k,None)
        else: c[k]=v
    return c
def tok(c,key=K,kid="kid-test-1",alg="RS256"):
    h=b64(json.dumps({"alg":alg,"typ":"JWT","kid":kid}).encode()); p=b64(json.dumps(c).encode())
    s=key.sign(f"{h}.{p}".encode(),padding.PKCS1v15(),hashes.SHA256()); return f"{h}.{p}.{b64(s)}"
OWNER_APPROVAL=[{"state":"approved","user":{"login":"zarbopiero963-droid"},"environments":[{"name":"vps-production"}]}]
STATE={"down":False,"slow":0,"health":200}
class H(http.server.BaseHTTPRequestHandler):
    def log_message(self,*a): pass
    def do_GET(self):
        try:
            if self.path=="/health": self.send_response(STATE["health"]); self.end_headers(); return
            if STATE["slow"]: time.sleep(STATE["slow"])
            if STATE["down"]: self.send_response(503); self.end_headers(); return
            if self.path=="/.well-known/openid-configuration": b=json.dumps({"issuer":"https://token.actions.githubusercontent.com","jwks_uri":BASE+"/.well-known/jwks"}).encode()
            elif self.path=="/.well-known/jwks": b=json.dumps(JWKS).encode()
            else: self.send_response(404); self.end_headers(); return
            self.send_response(200); self.end_headers(); self.wfile.write(b)
        except (BrokenPipeError,ConnectionResetError): pass
srv=socketserver.ThreadingTCPServer(("127.0.0.1",0),H); srv.daemon_threads=True
BASE=f"http://127.0.0.1:{srv.server_address[1]}"; threading.Thread(target=srv.serve_forever,daemon=True).start()
def mock(**o):
    st={"tip_refs":SHA,"tip_api":SHA,"approvals":{},"default_approve":True}; st.update(o)
    if st.pop("default_approve"):
        for rid in ["39999","501","502","777","100","4242"]+[str(9000+i) for i in range(5)]: st["approvals"].setdefault(rid,OWNER_APPROVAL)
    tmp=P("mock.json.tmp"); open(tmp,"w").write(json.dumps(st)); os.replace(tmp,P("mock.json"))
def sudoers_digest():
    h=[sha256(P("sudoers_main"))]+[f"{n} {sha256(P('sudoers',n))}" for n in sorted(os.listdir(P("sudoers")))]
    return hashlib.sha256(("\n".join(h)+"\n").encode()).hexdigest()
def conf(mode="enforce",freeze="0",**o):
    c={"MODE":mode,"FREEZE":freeze,"VERIFIER_SHA256":sha256(P("gate","deploy-authz.mjs")),"GUARD_SHA256":sha256(P("gate","runner-job-guard.mjs")),
       "GATE_SHA256":sha256(P("gate","deploy-gate.mjs")),"HOOK_SHA256":sha256(P("hook.sh")),"SELF_SHA256":sha256(P("sbin","mp-deploy")),
       "NODE_SHA256":sha256(P("bin","node")),"SUDOERS_SHA256":sudoers_digest(),"WORKFLOW_BLOB_SHA":PIN}
    c.update(o); txt="".join(f"{k}={v}\n" for k,v in c.items() if v is not None)
    os.chmod(P("etc"),0o700); f=P("etc","authz.conf")
    if os.path.exists(f): os.chmod(f,0o600)
    open(f,"w").write(txt); os.chmod(f,0o600)
def wsudo(path,txt,mode=0o440):
    if os.path.exists(path): os.chmod(path,0o640)
    open(path,"w").write(txt); os.chmod(path,mode)
def test_copy(src,dst):
    s=open(src).read(); assert s.count("\n# @MP-TEST-SHIM@\n")==1, "marker"
    open(dst,"w").write(s.replace("\n# @MP-TEST-SHIM@\n",f"\nsource {SHIM}\n")); os.chmod(dst,0o755)
NPM='''#!/bin/bash
case "$1" in
 ci) sleep "${MP_TEST_NPM_SLEEP:-0}"; [ -n "${MP_TEST_MOVE_AT_CI:-}" ] && git -C "$MP_TEST_ORIGIN" update-ref refs/heads/main "$MP_TEST_MOVE_AT_CI"; exit "${MP_TEST_NPM_RC:-0}";;
 run) echo "$(date -Is) test-db-touched $PWD" >> "$MP_TEST_ROOT/testdb.log"
      [ -n "${MP_TEST_MOVE_AT_TEST:-}" ] && git -C "$MP_TEST_ORIGIN" update-ref refs/heads/main "$MP_TEST_MOVE_AT_TEST"; sleep "${MP_TEST_TEST_SLEEP:-0}"; exit "${MP_TEST_CHECK_RC:-0}";;
esac
exit 1
'''
def setup(mode="enforce",freeze="0",deployed=SHA,current=None):
    for d in ("dep","state","log","build","etc","gate","sbin","sudoers","lock","bin","legacy"): shutil.rmtree(P(d),ignore_errors=True)
    for f in ("testdb.log","systemctl.log","sudoers_main"):
        if os.path.exists(P(f)): os.chmod(P(f),0o600); os.remove(P(f))
    move_main(SHA)
    for d in ("dep/releases","state","log","build","etc","gate","sbin","sudoers","bin","legacy"): os.makedirs(P(d))
    for d in ("dep","dep/releases","state","log","etc","gate","sbin","sudoers","bin","legacy"): os.chmod(P(d),0o755)
    os.chmod(P("build"),0o700); os.chmod(P("etc"),0o700)
    os.makedirs(P("state","authz-ledger"),mode=0o700); os.chmod(P("state","authz-ledger"),0o700)
    if deployed: open(P("state","deployed"),"w").write(deployed+"\n")
    if current:
        d=P("dep","releases",current); os.makedirs(d); shutil.copytree(os.path.join(GW,"migrations"),os.path.join(d,"migrations"))
        os.symlink(d,P("dep","current"))
    for src,dst in ((VER,"deploy-authz.mjs"),(GUARD,"runner-job-guard.mjs"),(GATE,"deploy-gate.mjs")):
        shutil.copy(src,P("gate",dst)); os.chmod(P("gate",dst),0o644)
    test_copy(V31,P("sbin","mp-deploy"))
    shutil.copy(NODE,P("bin","node")); os.chmod(P("bin","node"),0o755)
    open(P("bin","npm"),"w").write(NPM); os.chmod(P("bin","npm"),0o755)
    for f in ("hook.sh","hook.real","runner.env","sudo-l.txt","groups.txt"):
        if os.path.lexists(P(f)): os.remove(P(f))
    open(P("hook.sh"),"w").write("#!/bin/bash\nexit 0\n"); os.chmod(P("hook.sh"),0o755)
    open(P("runner.env"),"w").write(f"LANG=C.UTF-8\nACTIONS_RUNNER_HOOK_JOB_STARTED={P('hook.sh')}\n"); os.chmod(P("runner.env"),0o640)
    # sudoers: the REAL VPS layout read 2026-10-22 (no secrets: rules only), paths rewritten to the fake root
    wsudo(P("sudoers_main"),open(os.path.join(FIX,"sudoers")).read().replace("@includedir /etc/sudoers.d",f"@includedir {P('sudoers')}"))
    for n in ("90-mpadmin","ghrunner","mpdeploy","README"): wsudo(P("sudoers",n),open(os.path.join(FIX,"sudoers.d",n)).read())
    shutil.copy(os.path.join(FIX,"sudo-l-ghrunner.txt"),P("sudo-l.txt")); open(P("groups.txt"),"w").write("ghrunner\n")
    open(P("etc","runner-guard.json"),"w").write(json.dumps({"workflow_blob_sha":PIN})); os.chmod(P("etc","runner-guard.json"),0o644)
    open(P("etc","test.env"),"w").write("FUTPYTHON_TEST_DATABASE_URL=postgres://fixture@127.0.0.1/none\n"); os.chmod(P("etc","test.env"),0o600)
    STATE["health"]=200
    conf(mode,freeze); mock()
ENV=dict(os.environ); [ENV.pop(k,None) for k in list(ENV) if k.startswith(("SUDO_","GH_","GITHUB_","MP_"))]
def env(**o):
    e=dict(ENV,MP_TEST_STUB="1",MP_TEST_ROOT=R,MP_TEST_BIN=P("bin"),MP_REPO="file://"+ORIGIN,MP_TEST_ORIGIN=ORIGIN,MP_DEPLOY_ROOT=P("dep"),
           MP_BUILD_ROOT=P("build"),MP_STATE=P("state"),MP_LOGDIR=P("log"),MP_LOCKDIR=P("lock"),MP_TESTENV=P("etc","test.env"),
           MP_AUTHZ_CONF=P("etc","authz.conf"),MP_GATEDIR=P("gate"),MP_LEGACY_VERIFIER=P("legacy","mp-deploy-authz.mjs"),
           MP_GUARD_CONF=P("etc","runner-guard.json"),MP_HOOK=P("hook.sh"),MP_RUNNER_ENV=P("runner.env"),MP_SUDOERS_MAIN=P("sudoers_main"),
           MP_SUDOERS_DIR=P("sudoers"),MP_TEST_SUDO_L=P("sudo-l.txt"),MP_TEST_GROUPS=P("groups.txt"),MP_NODE=P("bin","node"),
           MP_OIDC_BASE=BASE,MP_HEALTH_URL=BASE+"/health",MP_TEST_FETCH_MOCK=MOCK,MP_TEST_MOCK_FILE=P("mock.json")); e.update(o); return e
def run(token,sha=None,e=None,timeout=120,script=None):
    p=subprocess.run(["bash",script or P("sbin","mp-deploy"),sha or SHA],input=(token or "").encode(),env=e or env(),capture_output=True,timeout=timeout)
    return p.returncode,(p.stdout+p.stderr).decode()
def popen(token,sha=None,**o):
    p=subprocess.Popen(["bash",P("sbin","mp-deploy"),sha or SHA],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,env=env(**o),start_new_session=True)
    p.stdin.write(token.encode()); p.stdin.close(); return p
RES=[]; FAILFAST=os.environ.get("FAILFAST")=="1"
def check(name,cond,detail=""):
    RES.append((name,bool(cond))); print(("PASS " if cond else "FAIL ")+name+("" if cond else "  :: "+str(detail)[-900:]),flush=True)
    if FAILFAST and not cond: done()
def ledger(): return sorted(os.listdir(P("state","authz-ledger")))
def snapshot():
    """Persistent state (everything but the authz ledger and deploy.log): deploy root, state, release dirs, symlink,
    build worktrees (cache repo.git excluded: fetch cache), test DB marker."""
    out={}
    for top in ("dep","state","build"):
        for dp,dn,fn in os.walk(P(top)):
            rel=os.path.relpath(dp,R)
            if "authz-ledger" in rel or rel.startswith("build/repo.git"): dn[:]=[]; continue
            for n in dn+fn:
                q=os.path.join(dp,n); r=os.path.relpath(q,R)
                if r.startswith("build/repo.git") or r=="state/authz-ledger": continue
                st=os.lstat(q)
                out[r]=("L:"+os.readlink(q)) if os.path.islink(q) else ("D" if os.path.isdir(q) else hashlib.sha256(open(q,'rb').read()).hexdigest())+oct(st.st_mode&0o7777)
    out["testdb"]=os.path.exists(P("testdb.log")); out["systemctl"]=os.path.exists(P("systemctl.log"))
    return out
def diff(a,b): return {k:(a.get(k),b.get(k)) for k in set(a)|set(b) if a.get(k)!=b.get(k)}
def done():
    n=sum(1 for _,c in RES if c); print(f"\nSUMMARY {n}/{len(RES)} PASS",flush=True); shutil.rmtree(R,ignore_errors=True); os._exit(0 if n==len(RES) else 1)
