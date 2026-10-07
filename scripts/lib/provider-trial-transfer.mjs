import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

export async function hashFile(file){
 const hash=crypto.createHash('sha256');
 for await(const chunk of fs.createReadStream(file)) hash.update(chunk);
 return hash.digest('hex');
}
export async function fileInventory(root){
 const files=[];
 async function walk(dir){
  for(const e of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
   const full=path.join(dir,e.name);
   if(e.isSymbolicLink()) throw new Error('archive_symlink_rejected');
   if(e.isDirectory()) await walk(full);
   else if(e.isFile()){
    const file=path.relative(root,full).split(path.sep).join('/');
    if(/(?:\.wal|\.tmp|\.lock)$/i.test(file)) throw new Error('archive_transient_rejected');
    files.push({file,bytes:fs.statSync(full).size,sha256:await hashFile(full)});
   } else throw new Error('archive_special_file_rejected');
  }
 }
 await walk(root);
 return files.sort((a,b)=>a.file<b.file?-1:a.file>b.file?1:0);
}
export async function verifyInventory(root,expected){
 if(!Array.isArray(expected)||!expected.length) throw new Error('inventory_empty');
 const seen=new Set();
 for(const e of expected){
  if(typeof e.file!=='string'||e.file.startsWith('/')||e.file.split('/').some(p=>!p||p==='.'||p==='..')||e.file.includes('\\')||seen.has(e.file)) throw new Error('inventory_invalid_path');
  if(!Number.isSafeInteger(e.bytes)||e.bytes<0||!/^[a-f0-9]{64}$/.test(e.sha256)) throw new Error('inventory_invalid_entry');
  seen.add(e.file);
 }
 const actual=await fileInventory(root);
 if(JSON.stringify(actual)!==JSON.stringify([...expected].sort((a,b)=>a.file<b.file?-1:a.file>b.file?1:0))) throw new Error('transfer_inventory_mismatch');
 return {file_count:actual.length,mismatch_count:0};
}
export function assertNewOutput(root){
 const normalized=path.resolve(root);
 if(!path.isAbsolute(root)||root!==normalized||root===path.parse(root).root||root==='/tmp'||root.startsWith('/tmp/')||fs.existsSync(root)) throw new Error('new_non_tmp_output_required');
 const parent=fs.realpathSync(path.dirname(root));
 if(parent==='/tmp'||parent.startsWith('/tmp/')) throw new Error('new_non_tmp_output_required');
}
export async function createTransferBundle(root){
 const inventory=await fileInventory(root);
 const bundle=root+'.tar.gz', inventoryFile=root+'.inventory.json';
 if(fs.existsSync(bundle)||fs.existsSync(inventoryFile)) throw new Error('transfer_output_exists');
 await new Promise((resolve,reject)=>{
  const proc=spawn('tar',['--sort=name','--mtime=@0','--owner=0','--group=0','--numeric-owner','-czf',bundle,'-C',root,'.'],{stdio:['ignore','ignore','pipe']});
  let error='';proc.stderr.on('data',c=>{error+=c;});proc.on('error',reject);
  proc.on('close',code=>code===0?resolve():reject(new Error('tar_failed_'+code+'_'+error.slice(0,200))));
 });
 await verifyInventory(root,inventory);
 const result={version:1,qualification:'REGENERATED CERTIFIED ARCHIVE FROM SAME FROZEN DATASET',files:inventory,bundle:{file:path.basename(bundle),bytes:fs.statSync(bundle).size,sha256:await hashFile(bundle)}};
 fs.writeFileSync(inventoryFile,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 return {bundlePath:bundle,inventoryFile,...result};
}

export async function extractVerifiedBundle(downloaded,inventory,readbackRoot){
 assertNewOutput(readbackRoot);
 if(fs.statSync(downloaded).size!==inventory.bundle.bytes||await hashFile(downloaded)!==inventory.bundle.sha256) throw new Error('downloaded_bundle_mismatch');
 // Digest must match our own tar of regular files (fileInventory rejects links/special files).
 // No untrusted archive is extracted merely because an upload succeeded.
 fs.mkdirSync(readbackRoot);
 await new Promise((resolve,reject)=>{
  const proc=spawn('tar',['-xzf',downloaded,'--no-same-owner','--no-same-permissions','-C',readbackRoot],{stdio:'ignore'});
  proc.on('error',reject);proc.on('close',code=>code===0?resolve():reject(new Error('readback_extract_failed_'+code)));
 });
 return verifyInventory(readbackRoot,inventory.files);
}
