// TEST-ONLY preload (node --import), used only by the offline harness's test copies (never installed, never in
// production files). Replaces global fetch for deploy-authz.mjs (main-tip, approved) and runner-job-guard.mjs.
// State file: MP_TEST_MOCK_FILE (JSON). tip_git=<repo path> makes both tip sources read refs/heads/main of a REAL git repo.
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const pkt = s => (s.length + 4).toString(16).padStart(4, '0') + s;
const adv = (sha, extra = []) => pkt('# service=git-upload-pack\n') + '0000'
  + pkt(`${sha} HEAD\0multi_ack side-band-64k\n`) + pkt(`${sha} refs/heads/main\n`) + extra.map(pkt).join('') + '0000';
globalThis.fetch = async (url, opts = {}) => {
  const st = JSON.parse(readFileSync(process.env.MP_TEST_MOCK_FILE, 'utf8'));
  const u = String(url);
  const kind = u.includes('/info/refs') ? 'refs' : u.endsWith('/branches/main') ? 'api' : u.includes('/approvals') ? 'approvals'
    : u.includes('/pending_deployments') ? 'pending' : /\/attempts\/\d+\/jobs/.test(u) ? 'jobs' : u.includes('/contents/') ? 'contents'
    : /\/actions\/runs\/\d+$/.test(u) ? 'run' : 'other';
  (st.log ?? false) && process.stderr.write(`mock ${kind} ${u}\n`);
  const delay = (st.delay_ms ?? {})[kind] ?? 0;
  if (delay) await new Promise((res, rej) => { const t = setTimeout(res, delay); opts.signal?.addEventListener('abort', () => { clearTimeout(t); rej(new Error('timeout')); }); });
  if ((st.down ?? []).includes(kind)) throw new Error('ECONNREFUSED (mock)');
  const status = (st.status ?? {})[kind] ?? 200;
  let tip_refs = st.tip_refs, tip_api = st.tip_api;
  if (st.tip_git) tip_refs = tip_api = execFileSync('git', ['-C', st.tip_git, 'rev-parse', 'refs/heads/main']).toString().trim();
  let body;
  if (kind === 'refs') body = st.refs_raw ?? adv(tip_refs, st.refs_extra ?? []);
  else if (kind === 'api') body = st.api_raw ?? JSON.stringify({name: 'main', commit: {sha: tip_api}});
  else if (kind === 'approvals') body = JSON.stringify((st.approvals ?? {})[u.split('/runs/')[1].split('/')[0]] ?? []);
  else if (kind in (st.bodies ?? {})) body = JSON.stringify(st.bodies[kind]);
  else body = '';
  return new Response(body, {status, headers: {'content-length': String(Buffer.byteLength(body, 'latin1'))}});
};
