#!/usr/bin/env node
// MP-TC-BENCH-01: reproducible LIVE benchmark TotalCorner vs API-FOOTBALL on exported, already archived data.
// No provider call, no database write, no collector: it reads JSON files and prints the report.
//
//   node tools/benchmark/tc-af-live.mjs --candidate tc.json --reference af.json [--mapping map.json] [--thresholds t.json]
//
// tc.json / af.json: arrays of normalized series (see src/benchmark/live-benchmark.mjs). mapping.json: {tcField: afField}.
// thresholds.json: the owner-approved thresholds; without them the verdict is INSUFFICIENT EVIDENCE.
// The TotalCorner series come from the archive with exportTcSeries (src/benchmark/tc-export.mjs, READ ONLY transaction).
// The API-FOOTBALL series need archived LIVE snapshots, which do not exist yet (no LIVE collector, no authorized budget).
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { benchmarkReport } from '../../src/benchmark/live-benchmark.mjs';

export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    const name = argv[i];
    if (!['--candidate', '--reference', '--mapping', '--thresholds'].includes(name) || argv[i + 1] === undefined) throw new Error(`usage: --candidate F --reference F [--mapping F] [--thresholds F] (bad ${name})`);
    if (Object.hasOwn(out, name.slice(2))) throw new Error(`${name} given twice`);
    out[name.slice(2)] = argv[i + 1];
  }
  if (!out.candidate || !out.reference) throw new Error('--candidate and --reference are required');
  return out;
}

export function run(args, read = path => JSON.parse(readFileSync(path, 'utf8'))) {
  const candidate = read(args.candidate);
  const reference = read(args.reference);
  if (!Array.isArray(candidate) || !Array.isArray(reference)) throw new Error('candidate and reference must be arrays of series');
  const object = (value, name) => { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name} must be a JSON object`); return value; };
  return benchmarkReport({candidate, reference, mapping: args.mapping ? object(read(args.mapping), 'mapping') : {},
    thresholds: args.thresholds ? object(read(args.thresholds), 'thresholds') : null});
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(run(parseArgs(process.argv.slice(2))), null, 2)); }
  catch (error) { console.error(String(error?.message || error)); process.exitCode = 1; }
}
