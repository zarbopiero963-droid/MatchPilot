import fs from 'node:fs';
import path from 'node:path';
import { createGunzip } from 'node:zlib';

const DEFAULT_DIR=process.env.PROVIDER_TRIAL_FINAL_EXPORT_DIR || '/tmp/provider-trial-final-export';
const SECRET_ENV_KEYS=['BETSAPI_TOKEN','TOTALCORNER_API_TOKEN','DATABASE_URL','PROVIDER_TRIAL_EXPORT_TOKEN'];

const genericRules=[
  ['credential_assignment',/\b(?:BETSAPI_TOKEN|TOTALCORNER_API_TOKEN|DATABASE_URL|PROVIDER_TRIAL_EXPORT_TOKEN)\b\s*[:=]\s*["']?[^\s"',;]{8,}/i],
  ['authorization_header',/\bauthorization\b\s*[:=]\s*["']?(?:bearer|basic)\s+[A-Za-z0-9+/_=.-]{8,}/i],
  ['bearer_token',/\bbearer\s+[A-Za-z0-9._~+\/-]{16,}/i],
  ['database_url_password',/\bpostgres(?:ql)?:\/\/[^:\s/]+:[^@\s]+@/i],
  ['cookie_value',/\b(?:cookie|set-cookie)\b\s*[:=]\s*["']?[^;\s=]+=[^;\s]{8,}/i],
  ['sensitive_query_string',/[?&](?:token|api[_-]?key|access[_-]?token|secret|password|passwd|pwd)=[^&\s"']{8,}/i]
];

function isTransientDuckdbFile(file){
  return /(?:\.duckdb\.wal|\.wal|\.tmp|\.lock)$/i.test(file);
}

function listFiles(root){
  const out=[];
  for(const entry of fs.readdirSync(root,{withFileTypes:true})){
    const full=path.join(root,entry.name);
    if(entry.isDirectory()) out.push(...listFiles(full));
    else if(entry.isFile() && !isTransientDuckdbFile(full)) out.push(full);
  }
  return out;
}

function activeSecrets(){
  return SECRET_ENV_KEYS
    .map(key=>[key,String(process.env[key]||'').trim()])
    .filter(([,value])=>value.length>=8);
}

async function scanStream(stream, rules, exactSecrets){
  const hits=new Set();
  let carry='';
  for await (const chunk of stream){
    const text=carry+Buffer.from(chunk).toString('utf8');
    for(const [name,re] of rules) if(re.test(text)) hits.add(name);
    for(const [key,value] of exactSecrets) if(text.includes(value)) hits.add('exact_env:'+key);
    carry=text.slice(-4096);
  }
  return [...hits];
}

async function scanFile(file,rules,exactSecrets){
  try {
    const source=fs.createReadStream(file);
    const stream=file.endsWith('.gz') ? source.pipe(createGunzip()) : source;
    return await scanStream(stream,rules,exactSecrets);
  } catch(error) {
    if(error?.code==='ENOENT' && isTransientDuckdbFile(file)) return [];
    throw error;
  }
}

export async function runFinalSecretScan({root=DEFAULT_DIR}={}){
  if(!fs.existsSync(root)) throw new Error('secret_scan_root_missing');
  const exactSecrets=activeSecrets();
  const files=listFiles(root);
  const findings=[];
  for(const file of files){
    const hits=await scanFile(file,genericRules,exactSecrets);
    if(hits.length) findings.push({file:path.relative(root,file),rules:hits.sort()});
  }
  const report={
    version:'provider-trial-secret-scan-v1',
    scanned_at:new Date().toISOString(),
    root,
    files_scanned:files.length,
    generic_rules:genericRules.map(([name])=>name),
    exact_env_keys_checked:exactSecrets.map(([key])=>key),
    findings,
    result:findings.length===0?'PASS':'FAIL'
  };
  const reportPath=path.join(root,'secret_scan_report.json');
  fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
  console.log('PROVIDER_TRIAL_SECRET_SCAN '+JSON.stringify({
    result:report.result,
    files_scanned:report.files_scanned,
    finding_count:findings.length,
    findings:findings.map(f=>({file:f.file,rules:f.rules}))
  }));
  if(findings.length) throw new Error('secret_scan_failed_'+findings.length);
  return report;
}
