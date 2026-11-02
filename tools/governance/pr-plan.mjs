#!/usr/bin/env node
// MP-ROADMAP-PR-COUNT-FINAL-01: residual pull-request plan of the MASTER registry (docs/governance/master/pr-plan.json).
// Every original card keeps a disposition and a link to the planned PR that carries its residual work; every active
// requirement is covered by exactly one planned PR or by registered completion evidence; the counts are recomputed here.
//   node tools/governance/pr-plan.mjs validate          plan consistency, counts and pr-plan.md up to date
//   node tools/governance/pr-plan.mjs counts            the counts A..J, N, Nmin, Nmax
//   node tools/governance/pr-plan.mjs render [--write]  docs/governance/master/pr-plan.md from the plan
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { load, parsePathRef, PHASES } from './master.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = join(ROOT, 'docs/governance/master');
export const DISPOSITIONS = ['COMPLETED', 'IMPLEMENTED_NOT_CERTIFIED', 'PARTIAL', 'NOT_STARTED', 'OPEN_PR', 'DUPLICATE', 'SUPERSEDED', 'MERGE_CANDIDATE', 'BLOCKED'];
export const KINDS = ['IMPL', 'CERT', 'OPEN'];
const NO_PR = new Set(['COMPLETED', 'SUPERSEDED', 'DUPLICATE']);
const onMain = refs => (refs ?? []).filter(x => !parsePathRef(x)?.branch);

export function loadPlan(dir = DIR) { return JSON.parse(readFileSync(join(dir, 'pr-plan.json'), 'utf8')); }

// Counts of the owner mandate. Cards: A = B + C + D + carried. PRs: H = F + G = (carried - E) + S, where E is the number of
// carried cards absorbed into a PR that already carries another card, and S the PRs that carry no card as primary
// (work split out of an epic card). Nmin and Nmax come only from the uncertainty recorded on named planned PRs.
export function planCounts(reg, plan) {
  const disp = plan.card_dispositions;
  const by = d => disp.filter(c => c.disposition === d).length;
  const carriedCards = disp.filter(c => !NO_PR.has(c.disposition));
  const primary = new Map();
  for (const c of carriedCards) primary.set(c.planned_pr, (primary.get(c.planned_pr) ?? 0) + 1);
  const prs = plan.planned_prs;
  const E = [...primary.values()].reduce((s, n) => s + n - 1, 0);
  const S = prs.filter(p => !primary.has(p.id)).length;
  const F = prs.filter(p => p.kind === 'OPEN').length;
  const H = prs.length;
  // A PR removable by an owner decision is not subtracted a second time through a merge pair.
  const removableIds = new Set(prs.filter(p => p.may_be_removed_by_decision).map(p => p.id));
  const removable = removableIds.size;
  const pairs = new Set(prs.filter(p => p.merge_option && !removableIds.has(p.id) && !removableIds.has(p.merge_option)).map(p => [p.id, p.merge_option].sort().join('+')));
  const splits = prs.reduce((n, p) => n + (p.split_risk ? (p.split_extra ?? 1) : 0), 0);
  const active = reg.requirements.filter(r => r.lifecycle === 'ACTIVE');
  const covered = new Set([...prs.flatMap(p => p.requirements), ...plan.completed_requirements.map(c => c.id)]);
  return {
    A_cards: disp.length, B_completed: by('COMPLETED'), C_superseded: by('SUPERSEDED'), D_duplicate: by('DUPLICATE'),
    carried_cards: carriedCards.length, E_absorbed: E, S_split_out: S,
    F_open_prs: F, G_new_prs: H - F, H_total_prs: H,
    I_certification_only: prs.filter(p => p.kind === 'CERT').length,
    I2_certification_led_closing_gaps: prs.filter(p => String(p.note ?? '').startsWith('certification PR that also closes')).length,
    J_decision_dependent: prs.filter(p => p.decision_dependent).length,
    N: H, N_min: H - pairs.size - removable, N_max: H + splits,
    uncertainty: {merge_pairs: pairs.size, removable_by_decision: removable, split_risks: splits},
    by_disposition: Object.fromEntries(DISPOSITIONS.map(d => [d, by(d)])),
    by_kind: Object.fromEntries(KINDS.map(k => [k, prs.filter(p => p.kind === k).length])),
    by_phase: Object.fromEntries(Object.keys(PHASES).map(ph => [ph, prs.filter(p => p.phase === ph).length])),
    requirements: {active: active.length, covered_by_pr: active.filter(r => prs.some(p => p.requirements.includes(r.id))).length,
      completed_with_evidence: plan.completed_requirements.length, uncovered: active.filter(r => !covered.has(r.id)).map(r => r.id)}
  };
}

export function planValidate(reg, plan, {uiIds = null} = {}) {
  const errors = [];
  const cardIds = new Set(reg.cards.map(c => c.id));
  const req = new Map(reg.requirements.map(r => [r.id, r]));
  const prIds = new Set();
  for (const p of plan.planned_prs) { if (prIds.has(p.id)) errors.push(`${p.id}: duplicate planned PR id`); prIds.add(p.id); }
  // Cards: none lost, none twice, each linked to the PR that carries it.
  const seen = new Set();
  for (const c of plan.card_dispositions) {
    if (seen.has(c.card)) errors.push(`${c.card}: card listed twice`);
    seen.add(c.card);
    if (!cardIds.has(c.card)) errors.push(`${c.card}: not a card of cards.jsonl`);
    if (!DISPOSITIONS.includes(c.disposition)) errors.push(`${c.card}: disposition ${c.disposition}`);
    if (NO_PR.has(c.disposition)) { if (c.planned_pr) errors.push(`${c.card}: ${c.disposition} card cannot carry a planned PR`); }
    else if (!prIds.has(c.planned_pr)) errors.push(`${c.card}: planned PR ${c.planned_pr} does not exist`);
    if (['DUPLICATE', 'SUPERSEDED'].includes(c.disposition) && !c.ref) errors.push(`${c.card}: ${c.disposition} without a reference`);
    if (c.disposition === 'DUPLICATE' && c.ref && !cardIds.has(c.ref) && !prIds.has(c.ref)) errors.push(`${c.card}: DUPLICATE of unknown ${c.ref}`);
    if (!c.evidence) errors.push(`${c.card}: disposition without evidence`);
  }
  for (const id of cardIds) if (!seen.has(id)) errors.push(`${id}: card lost (no disposition)`);
  // Requirements: every active requirement covered exactly once, by a planned PR or by completion evidence.
  const primary = new Map();
  const note = (id, where) => { if (primary.has(id)) errors.push(`${id}: covered twice (${primary.get(id)}, ${where})`); else primary.set(id, where); };
  const completed = new Set();
  for (const c of plan.completed_requirements) {
    const r = req.get(c.id);
    note(c.id, 'COMPLETED');
    completed.add(c.id);
    if (!r) { errors.push(`${c.id}: completed requirement unknown`); continue; }
    if (r.status.implementation !== 'IMPLEMENTED' || r.status.merged !== true || !onMain(r.tests).length || !c.evidence)
      errors.push(`${c.id}: COMPLETED without merged implementation, tests on main and evidence (no invented completion)`);
    // Completion needs the certification the requirement asks for: a registered certificate, or, for a rule (process,
    // CI, governance), the test on main that enforces it on every PR, named in the evidence.
    else if (c.basis === 'CERTIFICATE') { if (!(r.certification_evidence ?? []).length) errors.push(`${c.id}: COMPLETED on a certificate that is not registered`); }
    else if (c.basis === 'RULE_ENFORCED_BY_TEST') {
      const named = [...String(c.evidence).matchAll(/\btest\/[\w.-]+\.test\.mjs\b/g)].map(m => m[0]);
      if (!named.length || !named.some(t => onMain(r.tests).some(x => x.startsWith(t)))) errors.push(`${c.id}: rule completion must name an enforcing test of the requirement`);
    } else errors.push(`${c.id}: completion basis ${c.basis} (CERTIFICATE or RULE_ENFORCED_BY_TEST)`);
  }
  for (const p of plan.planned_prs) {
    for (const k of ['title', 'domain', 'phase', 'kind', 'gate', 'done_when', 'status_now']) if (!p[k]) errors.push(`${p.id}: missing ${k}`);
    if (!KINDS.includes(p.kind)) errors.push(`${p.id}: kind ${p.kind}`);
    if (!['SAFE', 'MANUAL'].includes(p.gate)) errors.push(`${p.id}: gate ${p.gate}`);
    if (!PHASES[p.phase]) errors.push(`${p.id}: phase ${p.phase}`);
    if (p.kind === 'OPEN' && !Number.isInteger(p.open_pr)) errors.push(`${p.id}: OPEN without a PR number`);
    if (p.decision_dependent && !p.decision) errors.push(`${p.id}: decision-dependent without the decision`);
    for (const k of ['split_risk', 'may_be_removed_by_decision', 'decision']) if (typeof p[k] === 'string' && /^\s*(none|n\/a|null)\b/i.test(p[k])) errors.push(`${p.id}: ${k} is not a reason: ${p[k]}`);
    for (const d of p.depends_on ?? []) if (!prIds.has(d)) errors.push(`${p.id}: unknown dependency ${d}`);
    if (p.merge_option && !prIds.has(p.merge_option)) errors.push(`${p.id}: merge option ${p.merge_option} unknown`);
    const other = plan.planned_prs.find(x => x.id === p.merge_option);
    if (other && other.gate !== p.gate) errors.push(`${p.id}: merge option ${p.merge_option} mixes SAFE and MANUAL`);
    if (p.split_extra !== undefined && (!p.split_risk || !Number.isInteger(p.split_extra) || p.split_extra < 1)) errors.push(`${p.id}: split_extra without a split risk`);
    for (const c of p.cards) if (!cardIds.has(c)) errors.push(`${p.id}: unknown card ${c}`);
    // A PR with no requirement of its own (a backend prerequisite or a certification record) names what it serves.
    if (!p.requirements.length && !(p.serves ?? []).length && !(p.ui_requirements ?? []).length) errors.push(`${p.id}: no requirement and nothing it serves: untraceable`);
    if (uiIds) for (const id of p.ui_requirements ?? []) if (!uiIds.has(id)) errors.push(`${p.id}: unknown UI requirement ${id}`);
    for (const id of p.serves ?? []) if (req.get(id)?.lifecycle !== 'ACTIVE') errors.push(`${p.id}: serves ${id}, which is not an active requirement`);
    for (const id of p.requirements) {
      const r = req.get(id);
      if (!r) { errors.push(`${p.id}: unknown requirement ${id}`); continue; }
      if (r.lifecycle !== 'ACTIVE') errors.push(`${p.id}: ${id} is not an active requirement`);
      note(id, p.id);
      // A certification-only PR is planned only for code that is already implemented on main.
      if (p.kind === 'CERT' && (r.status.implementation !== 'IMPLEMENTED' || !onMain(r.code_paths).length)) errors.push(`${p.id}: CERT PR for ${id}, which is not implemented on main`);
    }
  }
  const openNums = plan.planned_prs.filter(p => p.kind === 'OPEN').map(p => p.open_pr);
  if (new Set(openNums).size !== openNums.length) errors.push('an open PR is counted twice');
  for (const r of reg.requirements) if (r.lifecycle === 'ACTIVE' && !primary.has(r.id)) errors.push(`${r.id}: active requirement without coverage`);
  // Merges are traceable both ways: a card names its PR, and the PR lists the card.
  for (const c of plan.card_dispositions) if (!NO_PR.has(c.disposition)) {
    const p = plan.planned_prs.find(x => x.id === c.planned_pr);
    if (p && !p.cards.includes(c.card)) errors.push(`${c.card}: carried by ${p.id}, which does not list it`);
  }
  for (const c of plan.card_dispositions) if (c.disposition === 'COMPLETED') {
    const card = reg.cards.find(x => x.id === c.card);
    const activeReqs = (card?.requirements ?? []).filter(id => req.get(id)?.lifecycle === 'ACTIVE');
    if (!activeReqs.length && !/^docs\/qa\/feature-certification\.json#FEAT-/.test(c.ref ?? '')) errors.push(`${c.card}: COMPLETED with no requirement needs a registered certificate as its reference`);
    for (const id of card?.requirements ?? []) if (req.get(id)?.lifecycle === 'ACTIVE' && !completed.has(id)) errors.push(`${c.card}: COMPLETED but ${id} is not completed`);
  }
  // Totals reconcile and match the stored counts.
  const k = planCounts(reg, plan);
  if (k.A_cards !== k.B_completed + k.C_superseded + k.D_duplicate + k.carried_cards) errors.push('cards do not reconcile: A != B + C + D + carried');
  if (k.H_total_prs !== k.carried_cards - k.E_absorbed + k.S_split_out) errors.push('PRs do not reconcile: H != carried - E + S');
  if (k.H_total_prs !== k.F_open_prs + k.G_new_prs) errors.push('PRs do not reconcile: H != F + G');
  if (JSON.stringify(plan.counts) !== JSON.stringify(k)) errors.push('pr-plan.json counts are stale: run pr-plan.mjs counts --write');
  if (plan.counts && reg.master.pr_plan && JSON.stringify(reg.master.pr_plan) !== JSON.stringify({N: k.N, N_min: k.N_min, N_max: k.N_max, F_open_prs: k.F_open_prs, G_new_prs: k.G_new_prs, I_certification_only: k.I_certification_only}))
    errors.push('master.json pr_plan differs from the plan counts');
  return errors;
}

const cell = s => String(s ?? '').replace(/\|/g, '/').replace(/\n/g, ' ');
const joinIds = a => (a ?? []).join(', ');
export function renderPlan(plan) {
  const k = plan.counts;
  const lines = ['# MatchPilot — PR residue (generato da `tools/governance/pr-plan.mjs render`, non modificare a mano)', '',
    `Verifica: ${plan.verified_at} su \`${plan.verified_at_sha.slice(0, 7)}\` · mandato ${plan.mandate}`, '',
    `**PR residue: ${k.N}** (intervallo giustificato ${k.N_min}–${k.N_max}) · aperte ${k.F_open_prs} · nuove ${k.G_new_prs} · solo certificazione ${k.I_certification_only} · dipendenti da decisioni owner ${k.J_decision_dependent}`, '',
    `Schede: ${k.A_cards} = completate ${k.B_completed} + superate ${k.C_superseded} + duplicate ${k.D_duplicate} + portate da PR ${k.carried_cards}; PR = ${k.carried_cards} − ${k.E_absorbed} assorbite + ${k.S_split_out} scorporate = ${k.H_total_prs}.`, '',
    `Requisiti attivi coperti: ${k.requirements.covered_by_pr + k.requirements.completed_with_evidence}/${k.requirements.active} (senza copertura: ${k.requirements.uncovered.length}).`, ''];
  let n = 0;
  for (const [ph, name] of Object.entries(PHASES)) {
    const list = plan.planned_prs.filter(p => p.phase === ph);
    lines.push(`## ${ph} — ${name} (${list.length} PR)`, '');
    if (!list.length) { lines.push('_Nessuna PR._', ''); continue; }
    lines.push('| # | ID | Titolo | Dominio | Schede originali | Requisiti coperti | Stato | Nuova/aperta | Dipendenze | Priorità | Gate | Test | HARD REAL | Browser QA | Certificazione | Completata quando | Decisione | Incertezza |',
      '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    list.forEach(p => lines.push(`| ${++n} | ${p.id} | ${cell(p.title)} | ${p.domain} | ${cell(joinIds(p.cards))} | ${cell(joinIds(p.requirements) || (p.serves ? 'serve: ' + joinIds(p.serves) : '') || (p.ui_requirements ? 'UI: ' + joinIds(p.ui_requirements) : ''))} | ${p.status_now} | ${p.kind === 'OPEN' ? `aperta #${p.open_pr}` : `nuova (${p.kind})`} | ${cell(joinIds(p.depends_on))} | ${p.priority ?? ''} | ${p.gate} | ${cell(p.tests)} | ${cell(p.hard_real)} | ${cell(p.browser_qa)} | ${cell(p.certification)} | ${cell(p.done_when)} | ${cell(p.decision_dependent ? p.decision : '')} | ${cell([p.split_risk && `+${p.split_extra ?? 1}: ${p.split_risk}`, p.merge_option && `−1 con ${p.merge_option}`, p.may_be_removed_by_decision && `−1: ${p.may_be_removed_by_decision}`].filter(Boolean).join('; '))} |`));
    lines.push('');
  }
  lines.push('## Accorpamenti (PR che portano più schede originali)', '', '| PR | Schede |', '|---|---|');
  for (const p of plan.planned_prs) { const own = plan.card_dispositions.filter(c => c.planned_pr === p.id).map(c => c.card); if (own.length > 1) lines.push(`| ${p.id} | ${cell(joinIds(own))} |`); }
  lines.push('', '## Schede escluse dal lavoro futuro', '', '| Scheda | Esito | Riferimento | Motivo |', '|---|---|---|---|');
  for (const c of plan.card_dispositions.filter(c => ['COMPLETED', 'SUPERSEDED', 'DUPLICATE'].includes(c.disposition))) lines.push(`| ${cell(c.card)} | ${c.disposition} | ${cell(c.ref)} | ${cell(c.evidence)} |`);
  lines.push('', '## Mappa completa scheda → PR (376 schede originali)', '', '| Scheda | Esito | PR | Riferimento |', '|---|---|---|---|');
  for (const c of plan.card_dispositions) lines.push(`| ${cell(c.card)} | ${c.disposition} | ${c.planned_pr ?? '—'} | ${cell(c.ref)} |`);
  lines.push('', `Requisiti completati con evidenza (${plan.completed_requirements.length}): ${joinIds(plan.completed_requirements.map(c => `${c.id} (${c.basis})`))}.`);
  return lines.join('\n');
}

function main() {
  const [cmd, arg] = process.argv.slice(2);
  const reg = load(); const plan = loadPlan();
  if (cmd === 'validate') {
    const uiIds = new Set(JSON.parse(readFileSync(join(ROOT, 'docs/governance/ui-requirements-matrix.json'), 'utf8')).requirements.map(r => r.id));
    const errors = planValidate(reg, plan, {uiIds});
    if (readFileSync(join(DIR, 'pr-plan.md'), 'utf8') !== renderPlan(plan) + '\n') errors.push('pr-plan.md is stale: run pr-plan.mjs render --write');
    console.log(JSON.stringify({result: errors.length ? 'FAIL' : 'PASS', error_count: errors.length, errors: errors.slice(0, 60)}, null, 2));
    process.exitCode = errors.length ? 1 : 0;
  } else if (cmd === 'counts') {
    const k = planCounts(reg, plan);
    if (arg === '--write') { plan.counts = k; writeFileSync(join(DIR, 'pr-plan.json'), JSON.stringify(plan, null, 1) + '\n'); }
    else console.log(JSON.stringify(k, null, 2));
  } else if (cmd === 'render') {
    if (arg === '--write') writeFileSync(join(DIR, 'pr-plan.md'), renderPlan(plan) + '\n'); else console.log(renderPlan(plan));
  } else { console.error('usage: pr-plan.mjs validate | counts [--write] | render [--write]'); process.exitCode = 2; }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
