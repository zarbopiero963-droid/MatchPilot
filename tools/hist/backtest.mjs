#!/usr/bin/env node
// HIST-01a: run the offline backtest engine on an explicit input file and write its canonical report.
//   node tools/hist/backtest.mjs --input <mp-hist-input-1.json> --config <config.json> --out <report.json> [--code-version <sha>] [--repeat N]
// The input and configuration are always explicit arguments: nothing is read from the environment, the database or the
// network, so the deploy's test run never touches real data. --repeat runs the engine N times and fails unless every
// report is byte-identical. Exit codes: 0 report written (any status), 2 invalid input or configuration, 3 reports differ.
import {readFileSync, writeFileSync} from 'node:fs';
import {canonicalJson} from '../../src/hist/contract.mjs';
import {runBacktest} from '../../src/hist/engine.mjs';

function args(argv) {
  const out = {repeat: 1, codeVersion: null};
  for (let i = 0; i < argv.length; i += 2) {
    const [name, value] = [argv[i], argv[i + 1]];
    if (value === undefined) throw new Error(`missing value for ${name}`);
    if (name === '--input') out.input = value;
    else if (name === '--config') out.config = value;
    else if (name === '--out') out.out = value;
    else if (name === '--code-version') out.codeVersion = value;
    else if (name === '--repeat') out.repeat = Number(value);
    else throw new Error(`unknown argument ${name}`);
  }
  if (!out.input || !out.config || !out.out) throw new Error('--input, --config and --out are required');
  if (!Number.isSafeInteger(out.repeat) || out.repeat < 1 || out.repeat > 10) throw new Error('--repeat must be 1..10');
  return out;
}

try {
  const options = args(process.argv.slice(2));
  const input = JSON.parse(readFileSync(options.input, 'utf8'));
  const config = JSON.parse(readFileSync(options.config, 'utf8'));
  const texts = Array.from({length: options.repeat}, () => canonicalJson(runBacktest(input, config, {codeVersion: options.codeVersion})) + '\n');
  if (texts.some(text => text !== texts[0])) {
    console.error('HIST_REPORTS_DIFFER');
    process.exit(3);
  }
  writeFileSync(options.out, texts[0]);
  const report = JSON.parse(texts[0]);
  console.log(JSON.stringify({status: report.status, scope: report.scope, report_sha256: report.report_sha256, runs: options.repeat}));
} catch (error) {
  console.error(`HIST_BACKTEST_ERROR ${error.code ?? 'ERROR'} ${error.message}`);
  process.exit(2);
}
