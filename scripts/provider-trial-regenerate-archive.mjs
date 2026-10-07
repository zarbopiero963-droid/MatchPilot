import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {assertFrozenDataset,ARCHIVE_QUALIFICATION} from './lib/provider-trial-regeneration-guard.mjs';
import {assertNewOutput,createTransferBundle,verifyInventory,hashFile,extractVerifiedBundle} from './lib/provider-trial-transfer.mjs';
import {verifyPackageFiles,verifyPortableDuckDB} from './lib/provider-trial-package-verify.mjs';

export async function withReadOnlySnapshot(client,work){
 await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const pool={readOnlySnapshot:true,query:(...args)=>client.query(...args),connect:async()=>({query:(...args)=>client.query(...args),release(){}})};
 try{
  await client.query("SET LOCAL statement_timeout TO '120s'");
  const r=await client.query('SHOW transaction_read_only');
  if(r.rows[0].transaction_read_only!=='on') throw new Error('read_only_not_enforced');
  const result=await work(pool);
  await client.query('ROLLBACK');
  return result;
 }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}
}

export async function main(args=process.argv.slice(2)){
 const [mode,root,inventoryPath]=args;
 if(mode==='extract-readback'){
  if(args.length!==4||!args.slice(1).every(path.isAbsolute)) throw new Error('usage_extract_readback_downloaded_bundle_trusted_inventory_new_root');
  const trusted=JSON.parse(fs.readFileSync(inventoryPath,'utf8'));
  if(trusted.qualification!==ARCHIVE_QUALIFICATION) throw new Error('qualification_mismatch');
  await extractVerifiedBundle(root,trusted,args[3]);
  await main(['verify-readback',args[3],inventoryPath]);return;
 }
 if(mode==='verify-readback'){
  if(args.length!==3||!path.isAbsolute(root)||!path.isAbsolute(inventoryPath)) throw new Error('usage_verify_readback_root_inventory');
  const trusted=JSON.parse(fs.readFileSync(inventoryPath,'utf8'));
  if(trusted.qualification!==ARCHIVE_QUALIFICATION) throw new Error('qualification_mismatch');
  const inventory=await verifyInventory(root,trusted.files);
  await verifyPackageFiles(root);await verifyPortableDuckDB(root);
  // Readback is a separately downloaded Drive copy; never a local copy passed as proof.
  console.log('PROVIDER_TRIAL_READBACK_LOCAL_VERIFICATION '+JSON.stringify({...inventory,result:'PASS',qualification:ARCHIVE_QUALIFICATION,requires_independent_drive_download_evidence:true}));
  return;
 }
 if(mode!=='generate'||args.length!==2) throw new Error('usage_generate_new_absolute_non_tmp_directory');
 assertNewOutput(root);
 if(fs.existsSync(root+'.tar.gz')||fs.existsSync(root+'.inventory.json')) throw new Error('transfer_output_exists');
 if(!process.env.DATABASE_URL) throw new Error('database_configuration_missing');
 process.env.PROVIDER_TRIAL_FINAL_EXPORT_DIR=root;
 const {default:pg}=await import('pg');
 const client=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:30000});
 await client.connect();
 try{
  await withReadOnlySnapshot(client,async pool=>{
   const freeze=await assertFrozenDataset(pool); // before any output; never creates/changes freeze.
   fs.mkdirSync(root,{recursive:false});
   const {auditAndExportScoretrend}=await import('./provider-trial-scoretrend-segregation.mjs');
   const {runFinalFileExport}=await import('./provider-trial-final-file-export.mjs');
   const {buildAnalyticsPackage}=await import('./provider-trial-build-analytics-package.mjs');
   const {runFinalSecretScan}=await import('./provider-trial-secret-scan.mjs');
   const {runFinalChecksums}=await import('./provider-trial-final-checksums.mjs');
   const {runFinalReconciliation}=await import('./provider-trial-final-reconciliation.mjs');
   console.log('PROVIDER_TRIAL_REGENERATED_FREEZE '+JSON.stringify({qualification:ARCHIVE_QUALIFICATION,freeze}));
   await auditAndExportScoretrend(pool,{outDir:root});
   await runFinalFileExport(pool,{outDir:root});
   await buildAnalyticsPackage({portable:true});
   await runFinalSecretScan({root});await runFinalChecksums({root});
   await runFinalReconciliation(pool,{root});
  });
 }finally{await client.end();}
 await verifyPackageFiles(root);
 // Verify from a different path, with the source directory temporarily absent. Only the NEW archive is moved.
 const moved=root+'.portability-test';
 if(fs.existsSync(moved)) throw new Error('portability_test_path_exists');
 fs.renameSync(root,moved);
 try{await verifyPortableDuckDB(moved);}finally{fs.renameSync(moved,root);}
 const bundle=await createTransferBundle(root);
 console.log('PROVIDER_TRIAL_TRANSFER_READY '+JSON.stringify({qualification:ARCHIVE_QUALIFICATION,file_count:bundle.files.length,bundle:bundle.bundle,inventory_sha256:await hashFile(bundle.inventoryFile),drive_upload_readback:'PENDING',safe_window:'NOT ATTESTED'}));
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 main().catch(error=>{
  const reason=String(error.message||'');
  const safe=/^(?:OWNER_DECISION_REQUIRED_ambiguous_odds_summary_prices_\d+|frozen_[a-z_]+|post_freeze_[a-z_]+|new_non_tmp_output_required|transfer_output_exists|database_configuration_missing|read_only_not_enforced)$/.test(reason)?reason:'inspect_sanitized_diagnostics';
  console.error('PROVIDER_TRIAL_REGENERATION_FAILED '+safe+'; no certification or safe-window attestation');process.exitCode=1;
 });
}
