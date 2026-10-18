import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {crc32} from 'node:zlib';
import {readStoredZip, storedZipSize, verifyArchive} from '../tools/archive/verify-archive.mjs';

const archiveDir = new URL('../docs/governance/archive/40/', import.meta.url);
const sha256 = buffer => createHash('sha256').update(buffer).digest('hex');

// Stored ZIP with a data descriptor, the layout used by the Drive transfer wrappers.
function storedZip(name, data) {
  const nameBuf = Buffer.from(name);
  const crc = crc32(data) >>> 0;
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 6); local.writeUInt16LE(nameBuf.length, 26);
  const descriptor = Buffer.alloc(16); descriptor.writeUInt32LE(0x08074b50, 0); descriptor.writeUInt32LE(crc, 4); descriptor.writeUInt32LE(data.length, 8); descriptor.writeUInt32LE(data.length, 12);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(8, 8);
  central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nameBuf.length, 28);
  const cdOffset = 30 + nameBuf.length + data.length + 16;
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(46 + nameBuf.length, 12); end.writeUInt32LE(cdOffset, 16);
  return Buffer.concat([local, nameBuf, data, descriptor, central, nameBuf, end]);
}

function syntheticArchive(t) {
  const root = mkdtempSync(join(tmpdir(), 'mp-archive-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const meta = join(root, 'meta');
  const parts = join(root, 'parts');
  execFileSync('mkdir', ['-p', meta, parts]);
  const bundle = Buffer.from('frozen provider-trial bundle bytes '.repeat(300));
  const chunks = [bundle.subarray(0, 4000), bundle.subarray(4000, 8000), bundle.subarray(8000)];
  const manifestParts = chunks.map((chunk, i) => ({file: `bundle40.part00${i}`, bytes: chunk.length, sha256: sha256(chunk)}));
  const inventory = Buffer.from(JSON.stringify({version: 1, files: [], bundle: {file: 'b.tar.gz', bytes: bundle.length, sha256: sha256(bundle)}}));
  writeFileSync(join(meta, 'trusted-inventory.json'), inventory);
  writeFileSync(join(meta, 'transfer40-manifest.json'), JSON.stringify({source_bundle: {bytes: bundle.length, sha256: sha256(bundle)}, trusted_inventory_sha256: sha256(inventory), parts: manifestParts}));
  writeFileSync(join(meta, 'parts40.sha256'), manifestParts.map(p => `${p.sha256}  out/${p.file}`).join('\n') + '\n');
  chunks.forEach((chunk, i) => writeFileSync(join(parts, `regenerated-r01-40-part00${i}.zip`), storedZip(`bundle40.part00${i}`, chunk)));
  const listing = manifestParts.map(p => ({title: `regenerated-r01-40-${p.file.split('.').pop()}.zip`, fileSize: String(storedZipSize(p.file, p.bytes))}));
  return {meta, parts, listing};
}

test('the real Drive metadata zip is read by the stored-ZIP reader and matches the pinned files', () => {
  const entries = readStoredZip(readFileSync(new URL('regenerated-r01-40-metadata.zip', archiveDir)));
  assert.deepEqual(entries.map(e => e.name), ['transfer40-manifest.json', 'parts40.sha256', 'trusted-inventory.json']);
  for (const entry of entries) assert.deepEqual(entry.data, readFileSync(new URL(entry.name, archiveDir)), entry.name);
});

test('pinned archive files match SHA256SUMS', () => {
  for (const line of readFileSync(new URL('SHA256SUMS', archiveDir), 'utf8').trim().split('\n')) {
    const [hash, file] = line.split(/\s+/);
    assert.equal(sha256(readFileSync(new URL(file, archiveDir))), hash, file);
  }
});

test('real #40 metadata is internally consistent and Drive sizes agree; parts stay NOT_VERIFIED without access', () => {
  const metadataDir = archiveDir.pathname;
  const listing = JSON.parse(readFileSync(new URL('drive-listing-2026-10-18.json', archiveDir), 'utf8'));
  const report = verifyArchive({metadataDir, driveListing: listing});
  assert.ok(report.metadata.every(c => c.result === 'PASS'), JSON.stringify(report.metadata));
  assert.equal(report.metadata[0].detail, '377a85327d0dd3fc61356ef48b1606b1522b87561a4e057133e415a02b004041');
  assert.equal(report.drive_listing.length, 13);
  assert.ok(report.drive_listing.every(c => c.result === 'PASS'));
  assert.ok(report.parts.every(p => p.result === 'NOT_VERIFIED'));
  assert.equal(report.result, 'PARTIAL', 'never PASS without the parts');
});

test('a complete archive verifies part by part and as a whole bundle', t => {
  const {meta, parts, listing} = syntheticArchive(t);
  const report = verifyArchive({metadataDir: meta, partsDir: parts, driveListing: listing});
  assert.equal(report.result, 'PASS', JSON.stringify(report, null, 1));
  assert.equal(report.bundle.result, 'PASS');
});

test('a tampered part, a corrupt wrapper or a wrong Drive size fail', t => {
  const {meta, parts, listing} = syntheticArchive(t);
  const wrapper = join(parts, 'regenerated-r01-40-part001.zip');
  const original = readFileSync(wrapper);
  const forged = storedZip('bundle40.part001', Buffer.from('x'.repeat(4000)));
  writeFileSync(wrapper, forged);
  let report = verifyArchive({metadataDir: meta, partsDir: parts});
  assert.equal(report.result, 'FAIL');
  assert.equal(report.parts[1].result, 'FAIL');
  const corrupt = Buffer.from(original); corrupt[60] ^= 0xff;
  writeFileSync(wrapper, corrupt);
  assert.throws(() => verifyArchive({metadataDir: meta, partsDir: parts}), /CRC32 mismatch/);
  writeFileSync(wrapper, original);
  report = verifyArchive({metadataDir: meta, partsDir: parts, driveListing: listing.map((item, i) => i === 2 ? {...item, fileSize: '1'} : item)});
  assert.equal(report.drive_listing[2].result, 'FAIL');
  assert.equal(report.result, 'FAIL');
});

test('the verifier is read-only: archive bytes are unchanged after a run', t => {
  const {meta, parts} = syntheticArchive(t);
  const before = execFileSync('sha256sum', ['-b', ...['000', '001', '002'].map(n => join(parts, `regenerated-r01-40-part${n}.zip`))], {encoding: 'utf8'});
  verifyArchive({metadataDir: meta, partsDir: parts});
  assert.equal(execFileSync('sha256sum', ['-b', ...['000', '001', '002'].map(n => join(parts, `regenerated-r01-40-part${n}.zip`))], {encoding: 'utf8'}), before);
});
