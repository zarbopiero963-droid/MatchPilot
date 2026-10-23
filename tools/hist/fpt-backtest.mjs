#!/usr/bin/env node
// HIST-PG-01: run the backtest engine on FutPythonTrader data read from the local PostgreSQL (read only).
//   DATABASE_URL=... node tools/hist/fpt-backtest.mjs --from YYYY-MM-DD --to YYYY-MM-DD --config <config.json> --out <report.json>
//     [--competition fpt:competition:<md5>] [--max-events N] [--input-out <input.json>] [--code-version <sha>]
// The stored FPT prices were acquired after kickoff: a PIT configuration gives INSUFFICIENT_PIT_DATA, and only a
// configuration with "pit_mode": "NON_PIT_RESEARCH" simulates, labelled as exploratory in the report. The database must
// be local (same check as offline mode); nothing is written to it. Exit codes: 0 report written, 2 bad arguments,
// configuration or input, 4 database not local or unreachable.
import {readFileSync, writeFileSync} from 'node:fs';
import pg from 'pg';
import {canonicalJson} from '../../src/hist/contract.mjs';
import {runBacktest} from '../../src/hist/engine.mjs';
import {readFptHistInput} from '../../src/providers/futpython/hist-input.mjs';
import {isLocalDatabaseUrl} from '../../src/runtime-safety.mjs';

function args(argv) {
  const out = {competition: null, maxEvents: 5000, codeVersion: null, inputOut: null};
  for (let i = 0; i < argv.length; i += 2) {
    const [name, value] = [argv[i], argv[i + 1]];
    if (value === undefined) throw new Error(`missing value for ${name}`);
    if (name === '--from') out.from = value;
    else if (name === '--to') out.to = value;
    else if (name === '--config') out.config = value;
    else if (name === '--out') out.out = value;
    else if (name === '--competition') out.competition = value;
    else if (name === '--max-events') out.maxEvents = Number(value);
    else if (name === '--input-out') out.inputOut = value;
    else if (name === '--code-version') out.codeVersion = value;
    else throw new Error(`unknown argument ${name}`);
  }
  if (!out.from || !out.to || !out.config || !out.out) throw new Error('--from, --to, --config and --out are required');
  return out;
}

let options;
try { options = args(process.argv.slice(2)); }
catch (error) { console.error(`HIST_FPT_ERROR BAD_ARGS ${error.message}`); process.exit(2); }

const url = process.env.DATABASE_URL;
if (!isLocalDatabaseUrl(url)) { console.error('HIST_FPT_ERROR DB_NOT_LOCAL DATABASE_URL must point to a local PostgreSQL'); process.exit(4); }
const db = new pg.Client({connectionString: url, connectionTimeoutMillis: 5000});
try { await db.connect(); }
catch (error) { console.error(`HIST_FPT_ERROR DB_UNREACHABLE ${error.code ?? ''}`); process.exit(4); }
try {
  // Read only: the session refuses any write.
  await db.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY');
  const {input, stats} = await readFptHistInput(db, {dateFrom: options.from, dateTo: options.to, competitionId: options.competition, maxEvents: options.maxEvents});
  if (options.inputOut) writeFileSync(options.inputOut, canonicalJson(input) + '\n');
  const report = runBacktest(input, JSON.parse(readFileSync(options.config, 'utf8')), {codeVersion: options.codeVersion});
  writeFileSync(options.out, canonicalJson(report) + '\n');
  console.log(JSON.stringify({reader: stats, status: report.status, pit_mode: report.config.pit_mode, events: report.counts.events, bets: report.bets.length,
    pl_net: report.metrics?.pl_net ?? null, certification: report.certification, report_sha256: report.report_sha256}));
} catch (error) {
  console.error(`HIST_FPT_ERROR ${error.code ?? 'ERROR'} ${error.message}`);
  process.exitCode = 2;
} finally { await db.end(); }
