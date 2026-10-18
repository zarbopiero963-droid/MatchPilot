import {readFile} from 'node:fs/promises';
import {existsSync, readdirSync} from 'node:fs';

const root = new URL('../', import.meta.url);
const path = new URL('docs/governance/mp-pr-00/requirements.json', root);
const decisionsPath = new URL('docs/governance/owner-decisions.json', root);

export async function loadInventory() {
  return JSON.parse(await readFile(path, 'utf8'));
}

export async function loadDecisions() {
  return JSON.parse(await readFile(decisionsPath, 'utf8'));
}

// A wildcard path (only in the file name, e.g. test/*.test.mjs) must match at least one file.
const repoPathExists = file => {
  if (!file.includes('*')) return existsSync(new URL(file, root));
  const slash = file.lastIndexOf('/');
  const dir = new URL(file.slice(0, slash + 1), root);
  const name = new RegExp('^' + file.slice(slash + 1).split('*').map(part => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
  return existsSync(dir) && readdirSync(dir).some(entry => name.test(entry));
};
const realDate = value => {
  const time = Date.parse(`${value}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value;
};

function dependencyCycles(requirements) {
  const deps = new Map(requirements.map(req => [req.id, req.dependencies || []]));
  const state = new Map();
  const cycles = [];
  const visit = (id, trail) => {
    if (state.get(id) === 'done' || !deps.has(id)) return;
    if (state.get(id) === 'open') { cycles.push([...trail.slice(trail.indexOf(id)), id].join(' -> ')); return; }
    state.set(id, 'open');
    for (const next of deps.get(id)) visit(next, [...trail, id]);
    state.set(id, 'done');
  };
  for (const id of deps.keys()) visit(id, []);
  return cycles;
}

export function validateInventory(inventory, {pathExists = repoPathExists} = {}) {
  const errors = [];
  const allowedPriorities = new Set(['P0', 'P1', 'P2']);
  const allowedStates = new Set(inventory.states || []);
  const groupFields = ['title', 'conditions', 'inputs', 'outputs', 'invariants', 'failure_modes'];
  const ids = new Set();
  const requirements = inventory.requirements || [];
  const required = ['id','group','source','source_ref','priority','statement','behavior','design','code','tests','evidence','verdict','conflicts','dependencies','target_prs'];
  const prIds = new Set((inventory.pr_registry || []).map(pr => pr.id));
  const usedPrs = new Set();

  if (!/^[0-9a-f]{40}$/.test(inventory.baseline || '')) errors.push('baseline must be a full commit SHA');
  if (!requirements.length) errors.push('requirements must not be empty');
  if (!prIds.size) errors.push('pr_registry must not be empty');
  for (const [name, group] of Object.entries(inventory.groups || {})) {
    for (const key of groupFields) {
      const value = group[key];
      if (key === 'title' ? !value : !(Array.isArray(value) && value.length)) errors.push(`group ${name} missing ${key}`);
    }
  }
  for (const [index, req] of requirements.entries()) {
    for (const key of required) if (!(key in req)) errors.push(`requirements[${index}] missing ${key}`);
    if (!/^MP-[A-Z]{2,3}-\d{3}$/.test(req.id || '')) errors.push(`invalid id ${req.id}`);
    if (ids.has(req.id)) errors.push(`duplicate id ${req.id}`);
    ids.add(req.id);
    if (!inventory.groups?.[req.group]) errors.push(`${req.id} unknown group ${req.group}`);
    else if (!req.id?.startsWith(`MP-${req.group}-`)) errors.push(`${req.id} id prefix does not match group ${req.group}`);
    if (!allowedPriorities.has(req.priority)) errors.push(`${req.id} invalid priority ${req.priority}`);
    if (!allowedStates.has(req.verdict)) errors.push(`${req.id} invalid verdict ${req.verdict}`);
    if (!String(req.source_ref || '').trim()) errors.push(`${req.id} empty source_ref`);
    if (String(req.statement || '').length < 20) errors.push(`${req.id} statement is not explicit`);
    if (String(req.behavior || '').length < 20) errors.push(`${req.id} behavior is not explicit`);
    for (const key of ['design','code','tests','evidence','conflicts','dependencies','target_prs']) {
      if (!Array.isArray(req[key])) errors.push(`${req.id} ${key} must be an array`);
    }
    if (req.verdict === 'PASS' && !req.evidence?.length) errors.push(`${req.id} PASS without evidence`);
    for (const item of req.evidence || []) if (!String(item).trim()) errors.push(`${req.id} empty evidence entry`);
    if (!req.target_prs?.length) errors.push(`${req.id} has no target PR`);
    for (const pr of req.target_prs || []) {
      if (!prIds.has(pr)) errors.push(`${req.id} target PR ${pr} not in pr_registry`);
      usedPrs.add(pr);
    }
    for (const file of [...(req.code || []), ...(req.tests || [])]) {
      if (!pathExists(file)) errors.push(`${req.id} mapped path ${file} does not exist`);
    }
  }
  const byId = new Map(requirements.map(req => [req.id, req]));
  for (const req of requirements) {
    for (const dependency of req.dependencies || []) {
      if (!ids.has(dependency) && !inventory.referenced_external_ids?.[dependency]) {
        errors.push(`${req.id} unknown dependency ${dependency}`);
        continue;
      }
      const target = byId.get(dependency);
      if (req.verdict === 'PASS' && target && !['PASS', 'NOT_APPLICABLE'].includes(target.verdict)) {
        errors.push(`${req.id} is PASS but depends on ${dependency} (${target.verdict})`);
      }
    }
  }
  for (const cycle of dependencyCycles(requirements)) errors.push(`dependency cycle ${cycle}`);
  for (const pr of inventory.pr_registry || []) {
    if (!usedPrs.has(pr.id)) errors.push(`PR ${pr.id} has no requirement`);
  }
  const futureIds = new Set();
  for (const item of inventory.future_register || []) {
    for (const key of ['id', 'source', 'domain', 'status', 'reason']) if (!item[key]) errors.push(`future item ${item.id} missing ${key}`);
    if (futureIds.has(item.id)) errors.push(`duplicate future id ${item.id}`);
    futureIds.add(item.id);
    if (ids.has(item.id)) errors.push(`future id ${item.id} is in certified denominator`);
  }
  return errors;
}

export function validateDecisions(register) {
  const errors = [];
  const states = new Set(register.states || []);
  const ids = new Set();
  for (const item of register.decisions || []) {
    for (const key of ['id', 'date', 'decision', 'scope', 'precedence', 'references', 'status']) {
      if (!item[key] || (Array.isArray(item[key]) && !item[key].length)) errors.push(`decision ${item.id} missing ${key}`);
    }
    if (ids.has(item.id)) errors.push(`duplicate decision ${item.id}`);
    ids.add(item.id);
    if (!realDate(item.date)) errors.push(`decision ${item.id} invalid date`);
    if (!states.has(item.status)) errors.push(`decision ${item.id} invalid status ${item.status}`);
  }
  for (const item of register.decisions || []) {
    for (const ref of item.superseded_by || []) if (!ids.has(ref)) errors.push(`decision ${item.id} superseded_by unknown ${ref}`);
    if (['SUPERSEDED', 'PARTIALLY_SUPERSEDED'].includes(item.status) && !item.superseded_by?.length) errors.push(`decision ${item.id} ${item.status} without superseded_by`);
    for (const ref of item.supersedes || []) if (/^[A-Z][A-Z0-9-]*(?:\.D\d+)?$/.test(ref) && !ids.has(ref)) errors.push(`decision ${item.id} supersedes unknown ${ref}`);
  }
  if (!ids.size) errors.push('decision register must not be empty');
  return errors;
}

export function summarize(inventory) {
  const summary = {denominator: inventory.requirements.length, census: inventory.census?.status, by_group: {}, by_priority: {}, by_verdict: {}, p0_open: 0, mapped_code: 0, mapped_tests: 0, with_evidence: 0, pass_with_evidence: 0};
  for (const req of inventory.requirements) {
    summary.by_group[req.group] = (summary.by_group[req.group] || 0) + 1;
    summary.by_priority[req.priority] = (summary.by_priority[req.priority] || 0) + 1;
    summary.by_verdict[req.verdict] = (summary.by_verdict[req.verdict] || 0) + 1;
    if (req.priority === 'P0' && !['PASS', 'NOT_APPLICABLE'].includes(req.verdict)) summary.p0_open++;
    if (req.code.length) summary.mapped_code++;
    if (req.tests.length) summary.mapped_tests++;
    if (req.evidence.length) summary.with_evidence++;
    if (req.verdict === 'PASS' && req.evidence.length) summary.pass_with_evidence++;
  }
  summary.future_register = inventory.future_register.length;
  return summary;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const inventory = await loadInventory();
  const errors = [...validateInventory(inventory), ...validateDecisions(await loadDecisions())];
  if (errors.length) {
    console.error(JSON.stringify({result:'FAIL', errors}, null, 2));
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify({result:'PASS', ...summarize(inventory)}, null, 2));
  }
}
