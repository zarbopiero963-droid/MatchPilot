import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const OUT_DIR=process.env.PROVIDER_TRIAL_FINAL_EXPORT_DIR || '/tmp/provider-trial-final-export';
const FINAL_JSON='final_checksums.json';
const FINAL_TXT='SHA256SUMS.final.txt';

function sha256File(file){
  return new Promise((resolve,reject)=>{
    const h=crypto.createHash('sha256');
    const s=fs.createReadStream(file);
    s.on('data',chunk=>h.update(chunk));
    s.on('end',()=>resolve(h.digest('hex')));
    s.on('error',reject);
  });
}
function walk(root){
  const out=[];
  for(const e of fs.readdirSync(root,{withFileTypes:true})){
    const full=path.join(root,e.name);
    if(e.isDirectory()) out.push(...walk(full));
    else if(e.isFile()) out.push(full);
  }
  return out;
}
function isTransient(rel){ return /(?:\.duckdb\.wal|\.wal|\.tmp|\.lock)$/i.test(rel); }
function isOwnOutput(rel){ return rel===FINAL_JSON || rel===FINAL_TXT; }

export async function runFinalChecksums({root=OUT_DIR}={}){
  if(!fs.existsSync(root)) throw new Error('final_checksum_root_missing');
  const all=walk(root).map(f=>path.relative(root,f)).sort();
  const transient=all.filter(isTransient);
  if(transient.length) throw new Error('final_checksum_transient_files_present_'+transient.length);

  const targets=all.filter(rel=>!isOwnOutput(rel));
  const first=[];
  for(const rel of targets){
    const file=path.join(root,rel);
    first.push({file:rel,bytes:fs.statSync(file).size,sha256:await sha256File(file)});
  }

  const analyticsPath=path.join(root,'analytics_manifest.json');
  if(fs.existsSync(analyticsPath)){
    const analytics=JSON.parse(fs.readFileSync(analyticsPath,'utf8'));
    const byFile=new Map(first.map(x=>[x.file,x]));
    for(const item of analytics.files||[]){
      const actual=byFile.get(item.file);
      if(!actual) throw new Error('analytics_manifest_file_missing_'+item.file);
      if(actual.bytes!==item.bytes) throw new Error('analytics_manifest_size_mismatch_'+item.file);
      if(actual.sha256!==item.sha256) throw new Error('analytics_manifest_sha_mismatch_'+item.file);
    }
  }

  const txt=first.map(x=>x.sha256+'  '+x.file).join('\n')+'\n';
  fs.writeFileSync(path.join(root,FINAL_TXT),txt);
  const report={
    version:'provider-trial-final-sha256-v1',
    created_at:new Date().toISOString(),
    files_hashed:first.length,
    transient_files:[],
    files:first,
    result:'PASS'
  };
  fs.writeFileSync(path.join(root,FINAL_JSON),JSON.stringify(report,null,2)+'\n');

  for(const item of first){
    const file=path.join(root,item.file);
    const bytes=fs.statSync(file).size;
    const sha=await sha256File(file);
    if(bytes!==item.bytes || sha!==item.sha256) throw new Error('final_checksum_instability_'+item.file);
  }

  const finalJsonSha=await sha256File(path.join(root,FINAL_JSON));
  const finalTxtSha=await sha256File(path.join(root,FINAL_TXT));
  console.log('PROVIDER_TRIAL_FINAL_SHA256 '+JSON.stringify({
    result:'PASS',
    files_hashed:first.length,
    transient_files:0,
    analytics_manifest_reconciled:fs.existsSync(analyticsPath),
    final_checksums_json_sha256:finalJsonSha,
    sha256sums_final_sha256:finalTxtSha
  }));
  return {...report,final_checksums_json_sha256:finalJsonSha,sha256sums_final_sha256:finalTxtSha};
}
