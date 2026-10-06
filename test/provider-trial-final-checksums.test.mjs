import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { runFinalChecksums } from '../scripts/provider-trial-final-checksums.mjs';

function sha(file){
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

test('final SHA-256 gate reconciles analytics manifest and writes stable checksum files', async () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'provider-trial-final-sha-'));
  try {
    fs.mkdirSync(path.join(root,'parquet','canonical'),{recursive:true});
    fs.writeFileSync(path.join(root,'matchpilot_trial.duckdb'),'duckdb-final');
    fs.writeFileSync(path.join(root,'parquet','canonical','events.parquet'),'events-final');
    fs.writeFileSync(path.join(root,'secret_scan_report.json'),'{"result":"PASS"}\n');

    const duck=path.join(root,'matchpilot_trial.duckdb');
    const events=path.join(root,'parquet','canonical','events.parquet');
    fs.writeFileSync(path.join(root,'analytics_manifest.json'),JSON.stringify({
      files:[
        {file:'matchpilot_trial.duckdb',bytes:fs.statSync(duck).size,sha256:sha(duck)},
        {file:'parquet/canonical/events.parquet',bytes:fs.statSync(events).size,sha256:sha(events)}
      ]
    },null,2)+'\n');

    const report=await runFinalChecksums({root});
    assert.equal(report.result,'PASS');
    assert.ok(report.files_hashed>=4);
    assert.ok(fs.existsSync(path.join(root,'final_checksums.json')));
    assert.ok(fs.existsSync(path.join(root,'SHA256SUMS.final.txt')));
    const sums=fs.readFileSync(path.join(root,'SHA256SUMS.final.txt'),'utf8');
    assert.match(sums,/matchpilot_trial\.duckdb/);
  } finally {
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('final SHA-256 gate fails if a DuckDB WAL is still present', async () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'provider-trial-final-sha-wal-'));
  try {
    fs.writeFileSync(path.join(root,'matchpilot_trial.duckdb'),'db');
    fs.writeFileSync(path.join(root,'matchpilot_trial.duckdb.wal'),'wal');
    await assert.rejects(()=>runFinalChecksums({root}),/final_checksum_transient_files_present/);
  } finally {
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('final SHA-256 gate fails on analytics manifest mismatch', async () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'provider-trial-final-sha-mismatch-'));
  try {
    fs.writeFileSync(path.join(root,'matchpilot_trial.duckdb'),'db');
    fs.writeFileSync(path.join(root,'analytics_manifest.json'),JSON.stringify({
      files:[{file:'matchpilot_trial.duckdb',bytes:2,sha256:'0'.repeat(64)}]
    })+'\n');
    await assert.rejects(()=>runFinalChecksums({root}),/analytics_manifest_sha_mismatch/);
  } finally {
    fs.rmSync(root,{recursive:true,force:true});
  }
});
