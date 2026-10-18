import {readFile} from 'node:fs/promises';

const path = new URL('../docs/governance/mp-pr-00/requirements.json', import.meta.url);

export async function loadInventory() {
  return JSON.parse(await readFile(path, 'utf8'));
}

export function validateInventory(inventory) {
  const errors = [];
  const allowedPriorities = new Set(['P0', 'P1', 'P2']);
  const allowedStates = new Set(inventory.states || []);
  const ids = new Set();
  const requirements = inventory.requirements || [];
  const required = ['id','group','source','source_ref','priority','statement','behavior','design','code','tests','evidence','verdict','conflicts','dependencies','target_pr'];

  if (!/^[0-9a-f]{40}$/.test(inventory.baseline || '')) errors.push('baseline must be a full commit SHA');
  if (!requirements.length) errors.push('requirements must not be empty');
  for (const [index, req] of requirements.entries()) {
    for (const key of required) if (!(key in req)) errors.push(`requirements[${index}] missing ${key}`);
    if (!/^MP-[A-Z]{2,3}-\d{3}$/.test(req.id || '')) errors.push(`invalid id ${req.id}`);
    if (ids.has(req.id)) errors.push(`duplicate id ${req.id}`);
    ids.add(req.id);
    if (!inventory.groups?.[req.group]) errors.push(`${req.id} unknown group ${req.group}`);
    if (!allowedPriorities.has(req.priority)) errors.push(`${req.id} invalid priority ${req.priority}`);
    if (!allowedStates.has(req.verdict)) errors.push(`${req.id} invalid verdict ${req.verdict}`);
    for (const key of ['design','code','tests','evidence','conflicts','dependencies']) {
      if (!Array.isArray(req[key])) errors.push(`${req.id} ${key} must be an array`);
    }
  }
  for (const req of requirements) {
    for (const dependency of req.dependencies || []) {
      if (!ids.has(dependency) && !inventory.referenced_external_ids?.[dependency]) {
        errors.push(`${req.id} unknown dependency ${dependency}`);
      }
    }
  }
  const futureIds = new Set();
  for (const item of inventory.future_register || []) {
    if (futureIds.has(item.id)) errors.push(`duplicate future id ${item.id}`);
    futureIds.add(item.id);
    if (ids.has(item.id)) errors.push(`future id ${item.id} is in certified denominator`);
  }
  return errors;
}

export function summarize(inventory) {
  const summary = {denominator: inventory.requirements.length, by_group: {}, by_priority: {}, by_verdict: {}, mapped_code: 0, mapped_tests: 0, with_evidence: 0};
  for (const req of inventory.requirements) {
    summary.by_group[req.group] = (summary.by_group[req.group] || 0) + 1;
    summary.by_priority[req.priority] = (summary.by_priority[req.priority] || 0) + 1;
    summary.by_verdict[req.verdict] = (summary.by_verdict[req.verdict] || 0) + 1;
    if (req.code.length) summary.mapped_code++;
    if (req.tests.length) summary.mapped_tests++;
    if (req.evidence.length) summary.with_evidence++;
  }
  return summary;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const inventory = await loadInventory();
  const errors = validateInventory(inventory);
  if (errors.length) {
    console.error(JSON.stringify({result:'FAIL', errors}, null, 2));
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify({result:'PASS', ...summarize(inventory)}, null, 2));
  }
}
