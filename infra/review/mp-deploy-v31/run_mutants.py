#!/usr/bin/env python3
"""Runs every mutant of mutants.py against the suite that covers its target; a mutant is KILLED when the suite fails."""
import os,subprocess,sys,tempfile,shutil,concurrent.futures as cf,time
HERE=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0,HERE); from mutants import M
SUITE={"mp-deploy.v31":("test_v31.py","MUT_TARGET"),"mp-runner-guard.sh.in":("test_hook.py","MUT_HOOK"),"install-v31.sh":("test_install.py",None)}
def one(m):
    mid,tgt,old,new=m; src=open(os.path.join(HERE,tgt)).read(); n=src.count(old)
    if n!=1: return (mid,tgt,"INVALID(%d matches)"%n,0,"")
    d=tempfile.mkdtemp(prefix=f"mut-{mid}-"); t0=time.time()
    if tgt=="install-v31.sh":   # the installer is tested from a copy of the whole dir
        w=os.path.join(d,"w"); shutil.copytree(HERE,w,ignore=shutil.ignore_patterns("mut-*","__pycache__")); open(os.path.join(w,tgt),"w").write(src.replace(old,new))
        cmd=[sys.executable,os.path.join(w,"test_install.py")]; env=dict(os.environ,FAILFAST="1")
    else:
        f=os.path.join(d,tgt); open(f,"w").write(src.replace(old,new)); os.chmod(f,0o755)
        suite,var=SUITE[tgt]; cmd=[sys.executable,os.path.join(HERE,suite)]; env=dict(os.environ,FAILFAST="1",**{var:f})
    try: p=subprocess.run(cmd,env=env,capture_output=True,text=True,timeout=1500); out=p.stdout; rc=p.returncode
    except subprocess.TimeoutExpired: out="TIMEOUT"; rc=-1
    shutil.rmtree(d,ignore_errors=True)
    killer=next((l for l in out.splitlines() if l.startswith("FAIL ")),"")[:140]
    return (mid,tgt,"KILLED" if rc!=0 else "SURVIVED",round(time.time()-t0),killer)
with cf.ThreadPoolExecutor(int(os.environ.get("J","6"))) as ex:
    res=list(ex.map(one,M))
ctl=[r for r in res if r[0].startswith("C")]; res2=[r for r in res if not r[0].startswith("C")]
k=sum(r[2]=="KILLED" for r in res2); v=sum(r[2] in("KILLED","SURVIVED") for r in res2)
for r in res: print(f"{r[0]:4} {r[1]:22} {r[2]:9} {r[3]:>4}s  {r[4]}")
print(f"\nMUTATION SUMMARY killed {k}/{v} valid mutants ({100*k/max(v,1):.1f}%), invalid {len(res2)-v}; controls: "+", ".join(f"{c[0]}={c[2]}" for c in ctl))
