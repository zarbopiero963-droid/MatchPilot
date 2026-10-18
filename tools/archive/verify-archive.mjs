#!/usr/bin/env node
// R-02 (#40, owner decision D7): read-only verification of the frozen provider-trial archive.
// It never writes, regenerates or uploads anything: files are opened read-only and only a JSON report is printed.
//
// Usage: node tools/archive/verify-archive.mjs --metadata <dir> [--parts <dir>] [--drive-listing <file.json>]
//   <metadata dir>  transfer40-manifest.json, parts40.sha256, trusted-inventory.json
//   <parts dir>     bundle40.partNNN files, or the Drive zip wrappers regenerated-r01-40-partNNN.zip
//   <listing>       [{"title", "fileSize"}] as returned by the Drive file listing
//   --pins <file>   independent pins (bundle_sha256, trusted_inventory_sha256, part_count); without them the result is at best PARTIAL
import {createHash} from 'node:crypto';
import {existsSync, readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {crc32} from 'node:zlib';

const sha256 = buffer => createHash('sha256').update(buffer).digest('hex');

// Minimal reader for ZIP archives whose entries are stored (method 0), as produced for the Drive transfer.
export function readStoredZip(buffer) {
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('ZIP end of central directory not found');
  const count = buffer.readUInt16LE(eocd + 10);
  let p = buffer.readUInt32LE(eocd + 16);
  const entries = [];
  for (let n = 0; n < count; n++) {
    if (buffer.readUInt32LE(p) !== 0x02014b50) throw new Error('bad ZIP central directory header');
    const method = buffer.readUInt16LE(p + 10);
    const crc = buffer.readUInt32LE(p + 16);
    const size = buffer.readUInt32LE(p + 20);
    const nameLength = buffer.readUInt16LE(p + 28);
    const extraLength = buffer.readUInt16LE(p + 30);
    const commentLength = buffer.readUInt16LE(p + 32);
    const local = buffer.readUInt32LE(p + 42);
    const name = buffer.toString('utf8', p + 46, p + 46 + nameLength);
    if (method !== 0) throw new Error(`${name}: compression method ${method} is not supported (stored only)`);
    if (buffer.readUInt32LE(local) !== 0x04034b50) throw new Error(`${name}: bad local header`);
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const data = buffer.subarray(start, start + size);
    if (crc32(data) >>> 0 !== crc) throw new Error(`${name}: CRC32 mismatch`);
    entries.push({name, data});
    p += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

// Size of a single-entry stored ZIP with a data descriptor: local header, central directory, end record.
export const storedZipSize = (name, bytes) => bytes + 30 + 46 + 22 + 16 + 2 * Buffer.byteLength(name);

export function loadMetadata(dir) {
  const manifest = JSON.parse(readFileSync(join(dir, 'transfer40-manifest.json'), 'utf8'));
  const partsList = readFileSync(join(dir, 'parts40.sha256'), 'utf8').trim().split('\n').map(line => {
    const [hash, file] = line.trim().split(/\s+/);
    return {hash, file: file.replace(/^.*\//, '')};
  });
  const inventoryRaw = readFileSync(join(dir, 'trusted-inventory.json'));
  return {manifest, partsList, inventoryRaw, inventory: JSON.parse(inventoryRaw)};
}

export function verifyMetadata({manifest, partsList, inventoryRaw, inventory}, pins) {
  const checks = [];
  const check = (name, ok, detail) => checks.push({name, result: ok ? 'PASS' : 'FAIL', detail});
  check('trusted inventory SHA-256 equals manifest pin', sha256(inventoryRaw) === manifest.trusted_inventory_sha256, sha256(inventoryRaw));
  check('parts40.sha256 equals manifest parts', partsList.length === manifest.parts.length && manifest.parts.every((part, i) => partsList[i].file === part.file && partsList[i].hash === part.sha256), `${manifest.parts.length} parts`);
  const total = manifest.parts.reduce((sum, part) => sum + part.bytes, 0);
  check('part sizes add up to the bundle size', total === manifest.source_bundle.bytes, `${total} bytes`);
  check('bundle pin agrees between manifest and trusted inventory', manifest.source_bundle.sha256 === inventory.bundle?.sha256 && manifest.source_bundle.bytes === inventory.bundle?.bytes, manifest.source_bundle.sha256);
  // Self-consistency alone would accept a forged archive: anchor it to pins recorded independently (#152 review N-1).
  if (!pins) checks.push({name: 'metadata matches independent external pins', result: 'NOT_VERIFIED', detail: 'no external pins supplied'});
  else check('metadata matches independent external pins', pins.bundle_sha256 === manifest.source_bundle.sha256 && pins.trusted_inventory_sha256 === sha256(inventoryRaw) && pins.part_count === manifest.parts.length, pins.source);
  return checks;
}

// Read a part either directly or from its Drive zip wrapper; returns null when absent.
function readPart(dir, partFile) {
  const raw = join(dir, partFile);
  if (existsSync(raw)) return {bytes: readFileSync(raw, {flag: 'r'}), source: partFile};
  const wrapper = readdirSync(dir).find(name => name.endsWith(`-${partFile.split('.').pop()}.zip`));
  if (!wrapper) return null;
  const entries = readStoredZip(readFileSync(join(dir, wrapper), {flag: 'r'}));
  const entry = entries.find(item => item.name.replace(/^.*\//, '') === partFile);
  if (!entry) throw new Error(`${wrapper} does not contain ${partFile}`);
  return {bytes: entry.data, source: wrapper};
}

export function verifyParts(manifest, dir) {
  const bundle = createHash('sha256');
  let complete = true;
  const parts = manifest.parts.map(part => {
    const found = dir ? readPart(dir, part.file) : null;
    if (!found) { complete = false; return {file: part.file, result: 'NOT_VERIFIED', detail: 'part not available locally'}; }
    const hash = sha256(found.bytes);
    const ok = hash === part.sha256 && found.bytes.length === part.bytes;
    if (complete) bundle.update(found.bytes);
    return {file: part.file, source: found.source, result: ok ? 'PASS' : 'FAIL', detail: ok ? hash : `sha256 ${hash}, ${found.bytes.length} bytes`};
  });
  const bundleHash = complete ? bundle.digest('hex') : null;
  return {parts, bundle: complete ? {result: bundleHash === manifest.source_bundle.sha256 ? 'PASS' : 'FAIL', detail: bundleHash} : {result: 'NOT_VERIFIED', detail: 'not all parts available'}};
}

export function verifyDriveListing(manifest, listing) {
  const expectedNames = new Set([...manifest.parts.map(part => `regenerated-r01-40-${part.file.split('.').pop()}.zip`), 'regenerated-r01-40-metadata.zip']);
  const counts = new Map();
  for (const entry of listing) counts.set(entry.title, (counts.get(entry.title) || 0) + 1);
  // Unexpected or duplicated files in the folder are reported, not ignored (#152 review N-7).
  const extra = [...counts].filter(([title, n]) => !expectedNames.has(title) || n > 1)
    .map(([title, n]) => ({file: title, result: 'FAIL', detail: n > 1 ? `${n} files with this name` : 'not part of the manifest'}));
  return [...extra, ...manifest.parts.map(part => {
    const name = `regenerated-r01-40-${part.file.split('.').pop()}.zip`;
    const item = listing.find(entry => entry.title === name);
    const expected = storedZipSize(part.file, part.bytes);
    if (!item) return {file: name, result: 'FAIL', detail: 'missing from Drive listing'};
    return {file: name, result: Number(item.fileSize) === expected ? 'PASS' : 'FAIL', detail: `${item.fileSize} bytes, expected ${expected}`};
  })];
}

export function verifyArchive({metadataDir, partsDir = null, driveListing = null, pins = null}) {
  const metadata = loadMetadata(metadataDir);
  const metadataChecks = verifyMetadata(metadata, pins);
  const {parts, bundle} = verifyParts(metadata.manifest, partsDir);
  const listing = driveListing ? verifyDriveListing(metadata.manifest, driveListing) : [];
  const all = [...metadataChecks, ...parts, bundle, ...listing];
  const result = all.some(item => item.result === 'FAIL') ? 'FAIL' : all.some(item => item.result === 'NOT_VERIFIED') ? 'PARTIAL' : 'PASS';
  return {result, metadata: metadataChecks, parts, bundle, drive_listing: listing};
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = name => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
  const metadataDir = arg('--metadata');
  if (!metadataDir) { console.error('usage: verify-archive.mjs --metadata <dir> [--parts <dir>] [--drive-listing <file.json>] [--pins <file.json>]'); process.exit(1); }
  const listingFile = arg('--drive-listing');
  const pinsFile = arg('--pins');
  const report = verifyArchive({metadataDir, partsDir: arg('--parts'), driveListing: listingFile ? JSON.parse(readFileSync(listingFile, 'utf8')) : null, pins: pinsFile ? JSON.parse(readFileSync(pinsFile, 'utf8')) : null});
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.result === 'FAIL' ? 1 : 0;
}

