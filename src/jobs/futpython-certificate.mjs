import { readFile, writeFile } from 'node:fs/promises';
import { renderCertificateMarkdown } from '../futpython-certificate-md.mjs';

function arg(name) {
  const hit = process.argv.find(value => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

function redact(value) {
  return String(value || '')
    .replace(/postgres(?:ql)?:\/\/\S+/gi, 'postgres://[REDACTED]')
    .replace(/api_key=[^&\s]+/gi, 'api_key=[REDACTED]');
}

// Reads the certificate from MatchPilot (never from FutPythonTrader) and writes the Markdown document.
async function fromUrl(url, {attempts = 40, waitMs = 15000} = {}) {
  for (let i = 0; i < attempts; i++) {
    const response = await fetch(url, {headers: {accept: 'application/json'}});
    const body = await response.json();
    if (response.status === 200 && body.state !== 'building' && body.report) return body.report;
    console.log('FUTPYTHON_CERTIFICATE_WAIT ' + JSON.stringify({status: response.status, state: body.state, last_error: body.last_error || null}));
    await new Promise(resolve => setTimeout(resolve, waitMs));
  }
  throw new Error('certificate not ready');
}

async function fromDb() {
  const { buildCertificateReport } = await import('../futpython-certificate.mjs');
  const { closePool } = await import('../db.mjs');
  try { return await buildCertificateReport(); }
  finally { await closePool(); }
}

async function main() {
  const url = arg('from-url');
  const fromJson = arg('from-json');
  const out = arg('out');
  const json = arg('json');
  const report = fromJson ? JSON.parse(await readFile(fromJson, 'utf8')) : url ? await fromUrl(url) : await fromDb();
  const verification = (arg('verify') || '').split(';;').map(s => s.trim()).filter(Boolean);
  const markdown = renderCertificateMarkdown(report, {deploy: arg('deploy'), verification});
  if (out) await writeFile(out, markdown);
  if (json) await writeFile(json, JSON.stringify(report, null, 2) + '\n');
  console.log('FUTPYTHON_CERTIFICATE ' + JSON.stringify({verdict: report.verdict, failed_gates: report.failed_gates, out}));
  if (report.verdict === 'NOT CERTIFIED') process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('FUTPYTHON_CERTIFICATE_FATAL', redact(error?.stack || error?.message || error));
    process.exitCode = 1;
  });
}
