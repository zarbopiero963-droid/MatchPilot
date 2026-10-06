import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { runFinalSecretScan } from '../scripts/provider-trial-secret-scan.mjs';

test('secret scan passes clean files and catches exact env secret inside gzip', async () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'provider-trial-secret-scan-'));
  fs.writeFileSync(path.join(root,'clean.json'),'{"ok":true}\n');
  const previous=process.env.BETSAPI_TOKEN;
  process.env.BETSAPI_TOKEN='test-secret-value-123456789';
  try {
    const clean=await runFinalSecretScan({root});
    assert.equal(clean.result,'PASS');

    fs.writeFileSync(
      path.join(root,'leak.ndjson.gz'),
      gzipSync('{"token":"test-secret-value-123456789"}\n')
    );
    await assert.rejects(()=>runFinalSecretScan({root}),/secret_scan_failed/);
    const report=JSON.parse(fs.readFileSync(path.join(root,'secret_scan_report.json'),'utf8'));
    assert.equal(report.result,'FAIL');
    assert.ok(report.findings.some(f=>f.rules.includes('exact_env:BETSAPI_TOKEN')));
  } finally {
    if(previous===undefined) delete process.env.BETSAPI_TOKEN;
    else process.env.BETSAPI_TOKEN=previous;
    fs.rmSync(root,{recursive:true,force:true});
  }
});


test('secret scan ignores transient DuckDB WAL files but not final files', async () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'provider-trial-secret-scan-wal-'));
  try {
    fs.writeFileSync(path.join(root,'matchpilot_trial.duckdb'),'final-bytes');
    fs.writeFileSync(path.join(root,'matchpilot_trial.duckdb.wal'),'temporary-wal');
    const report=await runFinalSecretScan({root});
    assert.equal(report.result,'PASS');
    assert.equal(report.findings.length,0);
    assert.equal(report.files_scanned,1);
  } finally {
    fs.rmSync(root,{recursive:true,force:true});
  }
});
