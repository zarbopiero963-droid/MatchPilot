#!/usr/bin/env node
// MP-ROADMAP-PR-COUNT-FINAL-01: residual pull-request plan of the MASTER registry (docs/governance/master/pr-plan.json).
// Every original card keeps a disposition and a link to the planned PR that carries its residual work; every active
// requirement is covered by exactly one planned PR or by registered completion evidence; the counts are recomputed here.
//   node tools/governance/pr-plan.mjs validate          plan consistency, counts and pr-plan.md up to date
//   node tools/governance/pr-plan.mjs counts            the counts A..J, N, Nmin, Nmax
//   node tools/governance/pr-plan.mjs render [--write]  docs/governance/master/pr-plan.md from the plan
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
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

export function dependencyCycles(plan) {
  const deps = new Map(plan.planned_prs.map(p => [p.id, p.depends_on ?? []]));
  const state = new Map(); const cycles = []; const stack = [];
  const visit = id => {
    state.set(id, 1); stack.push(id);
    for (const d of deps.get(id) ?? []) {
      if (!deps.has(d)) continue;
      if (state.get(d) === 1) cycles.push([...stack.slice(stack.indexOf(d)), d]);
      else if (!state.has(d)) visit(d);
    }
    stack.pop(); state.set(id, 2);
  };
  for (const id of deps.keys()) if (!state.has(id)) visit(id);
  return cycles;
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
  // The dependency graph must be acyclic, or no execution order exists (MP-ROADMAP-BASELINE-282-PREFLIGHT-01).
  for (const cycle of dependencyCycles(plan)) errors.push(`dependency cycle: ${cycle.join(' -> ')}`);
  // A removable PR carries the audit classification of its removal clause.
  for (const p of plan.planned_prs) if (p.may_be_removed_by_decision && p.audit_classification && !String(p.may_be_removed_by_decision).startsWith(String(p.audit_classification).split(' ')[0])) errors.push(`${p.id}: removal reason does not state its audit classification`);
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
  // Owner decisions applied to the plan (MP-OWNER-DECISIONS-ROADMAP-RELEASE-20261102-FINAL): a withdrawn or merged PR
  // names a registered owner decision, loses no requirement, and never shows up again in the working plan.
  // Only an approved decision in force authorizes it: an OPEN proposal or a superseded entry does not (PR #294 review).
  const decisions = new Map(JSON.parse(readFileSync(join(ROOT, 'docs/governance/owner-decisions.json'), 'utf8')).decisions.map(d => [d.id, d]));
  for (const w of plan.withdrawn_by_owner ?? []) {
    if (!decisions.has(w.decision)) errors.push(`${w.id}: withdrawn by an unregistered owner decision ${w.decision}`);
    else if (decisions.get(w.decision).status !== 'IN_FORCE') errors.push(`${w.id}: decision ${w.decision} is ${decisions.get(w.decision).status}, not an owner authorization in force`);
    if (prIds.has(w.id)) errors.push(`${w.id}: withdrawn by the owner but still in the working plan`);
    const target = w.merged_into && plan.planned_prs.find(x => x.id === w.merged_into);
    if (w.merged_into && !target) errors.push(`${w.id}: merged into unknown ${w.merged_into}`);
    for (const id of w.requirements ?? []) {
      if (target) { if (!target.requirements.includes(id)) errors.push(`${w.id}: requirement ${id} lost in the merge into ${w.merged_into}`); continue; }
      const r = req.get(id);
      if (!r) errors.push(`${w.id}: unknown requirement ${id}`);
      else if (r.lifecycle === 'ACTIVE' || r.owner_decision !== w.decision) errors.push(`${w.id}: requirement ${id} must stay in history as non-active with owner decision ${w.decision}`);
    }
  }
  const bs = plan.baseline_status;
  if (bs && bs.working_plan && bs.official && bs.official.N + bs.working_plan.delta_vs_official !== planCounts(reg, plan).N) errors.push('baseline_status: official N + delta differs from the working plan count');
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

// ID-level reconciliation of the counts (MP-ROADMAP-270-INDEPENDENT-FINAL-AUDIT-01): every number of planCounts is
// expanded into the ids that make it, so an auditor can rebuild it without trusting the totals.
export function reconcile(reg, plan) {
  const req = new Map(reg.requirements.map(r => [r.id, r]));
  const disp = plan.card_dispositions;
  const ids = d => disp.filter(c => c.disposition === d).map(c => c.card);
  const carried = disp.filter(c => !NO_PR.has(c.disposition));
  const byPr = new Map();
  for (const c of carried) byPr.set(c.planned_pr, [...(byPr.get(c.planned_pr) ?? []), c.card]);
  const absorbedCards = [...byPr.entries()].flatMap(([pr, cards]) => cards.slice(1).map(card => ({card, planned_pr: pr, lead_card: cards[0]})));
  const origin = p => {
    if (p.kind === 'OPEN') return 'OPEN_PR_WITHOUT_PRIMARY_CARD';
    const cards = new Set([...p.cards, ...p.requirements.flatMap(r => req.get(r)?.cards ?? [])]);
    if ([...cards].some(c => c.startsWith('MP-PR-00:'))) return 'EPIC_DECOMPOSITION';
    if (cards.size) return 'SECONDARY_PR_OF_A_CARD';
    return 'PREREQUISITE_OR_CERT_RECORD';
  };
  const splitOut = plan.planned_prs.filter(p => !byPr.has(p.id)).map(p => ({pr: p.id, origin: origin(p), cards: p.cards, requirements: p.requirements}));
  const removable = new Set(plan.planned_prs.filter(p => p.may_be_removed_by_decision).map(p => p.id));
  const pairs = [...new Set(plan.planned_prs.filter(p => p.merge_option && !removable.has(p.id) && !removable.has(p.merge_option)).map(p => [p.id, p.merge_option].sort().join('+')))].sort();
  const count = (list, f) => list.reduce((acc, x) => { acc[f(x)] = (acc[f(x)] ?? 0) + 1; return acc; }, {});
  return {
    cards: {total: disp.length, completed: ids('COMPLETED'), superseded: ids('SUPERSEDED'), duplicate: ids('DUPLICATE'), carried: carried.length,
      carried_by_pr: Object.fromEntries([...byPr.entries()].sort(([a], [b]) => (a < b ? -1 : 1)))},
    prs: {
      total: plan.planned_prs.length,
      with_primary_card: byPr.size, absorbed_cards: absorbedCards,
      split_out: splitOut, split_out_by_origin: count(splitOut, x => x.origin),
      open: plan.planned_prs.filter(p => p.kind === 'OPEN').map(p => ({pr: p.id, github: p.open_pr})),
      new: plan.planned_prs.filter(p => p.kind !== 'OPEN').map(p => p.id),
      // Planning rows deduplicated before the count (the same work planned twice by the group verifiers): they never
      // became PRs of the inventory, so they are neither PRs nor card absorptions and must not be subtracted again.
      planning_rows_deduplicated: plan.planned_prs.flatMap(p => (p.absorbed ?? []).map(a => {
        const from = String(a).split(':')[0], into = String((p.source_ids ?? [])[0] ?? '').split(':')[0];
        return {into: p.id, into_source: (p.source_ids ?? [])[0] ?? null, deduplicated_row: a, cross_group: Boolean(from && into && from !== into)};
      })),
      certification_only: plan.planned_prs.filter(p => p.kind === 'CERT').map(p => p.id),
      decision_dependent: plan.planned_prs.filter(p => p.decision_dependent).map(p => p.id)
    },
    uncertainty: {
      removable_by_decision: plan.planned_prs.filter(p => p.may_be_removed_by_decision).map(p => ({pr: p.id, reason: p.may_be_removed_by_decision})),
      merge_pairs: pairs,
      split_risks: plan.planned_prs.filter(p => p.split_risk).map(p => ({pr: p.id, extra: p.split_extra ?? 1, reason: p.split_risk}))
    },
    requirements: {active: reg.requirements.filter(r => r.lifecycle === 'ACTIVE').length,
      completed: plan.completed_requirements.map(c => ({id: c.id, basis: c.basis})),
      by_pr: Object.fromEntries(plan.planned_prs.filter(p => p.requirements.length).map(p => [p.id, p.requirements]))},
    identities: {
      cards: `${disp.length} = ${ids('COMPLETED').length} + ${ids('SUPERSEDED').length} + ${ids('DUPLICATE').length} + ${carried.length}`,
      prs: `${plan.planned_prs.length} = ${byPr.size} PRs with a primary card (${carried.length} carried cards - ${absorbedCards.length} absorbed) + ${splitOut.length} PRs without a primary card`
    }
  };
}

// Independent-audit package (MP-ROADMAP-BASELINE-282-PREFLIGHT-01): the inputs an auditor needs, with SHA-256
// checksums, so the numbers can be rebuilt from exactly these bytes.
export const AUDIT_INPUTS = ['docs/governance/master/requirements.jsonl', 'docs/governance/master/cards.jsonl', 'docs/governance/master/issues.json',
  'docs/governance/master/prs.json', 'docs/governance/master/pr-plan.json', 'docs/governance/master/pr-plan.md', 'docs/governance/master/pr-plan-reconciliation.json',
  'docs/governance/master/audit/baseline-270.json', 'docs/governance/master/audit/producer-analysis.json', 'docs/governance/master/audit/decision-cards.md',
  'docs/governance/master/audit/MP-ROADMAP-270-AUDIT.md', 'docs/governance/master/audit/INDEPENDENT-AUDIT-PACKAGE.md', 'docs/governance/owner-decisions.json',
  'docs/governance/ui-requirements-matrix.json', 'docs/governance/mp-pr-00/requirements.json', 'tools/governance/master.mjs', 'tools/governance/pr-plan.mjs'];
export function auditManifest(root = ROOT) {
  return {schema: 'mp-audit-package-v1', files: Object.fromEntries(AUDIT_INPUTS.map(f => [f, createHash('sha256').update(readFileSync(join(root, f))).digest('hex')]))};
}

const cell = s => String(s ?? '').replace(/\|/g, '/').replace(/\n/g, ' ');
const joinIds = a => (a ?? []).join(', ');
export function renderPlan(plan) {
  const k = plan.counts;
  const lines = ['# MatchPilot — PR residue (generato da `tools/governance/pr-plan.mjs render`, non modificare a mano)', '',
    `Verifica: ${plan.verified_at} su \`${plan.verified_at_sha.slice(0, 7)}\` · mandato ${plan.mandate}`, '',
    ...(plan.baseline_status ? [`**Baseline ufficiale: ${plan.baseline_status.official.N}** (${plan.baseline_status.official.N_min}–${plan.baseline_status.official.N_max}) · candidata ${plan.baseline_status.candidate.N} (${plan.baseline_status.candidate.N_min}–${plan.baseline_status.candidate.N_max}) non approvata · piano di lavoro qui sotto: proiezione con le decisioni owner applicate (${plan.baseline_status.working_plan.decision}), NON una baseline approvata`, ''] : []),
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
    if (readFileSync(join(DIR, 'pr-plan-reconciliation.json'), 'utf8') !== JSON.stringify(reconcile(reg, plan), null, 1) + '\n') errors.push('pr-plan-reconciliation.json is stale: run pr-plan.mjs reconcile --write');
    console.log(JSON.stringify({result: errors.length ? 'FAIL' : 'PASS', error_count: errors.length, errors: errors.slice(0, 60)}, null, 2));
    process.exitCode = errors.length ? 1 : 0;
  } else if (cmd === 'counts') {
    const k = planCounts(reg, plan);
    if (arg === '--write') { plan.counts = k; writeFileSync(join(DIR, 'pr-plan.json'), JSON.stringify(plan, null, 1) + '\n'); }
    else console.log(JSON.stringify(k, null, 2));
  } else if (cmd === 'render') {
    if (arg === '--write') writeFileSync(join(DIR, 'pr-plan.md'), renderPlan(plan) + '\n'); else console.log(renderPlan(plan));
  } else if (cmd === 'manifest') {
    const out = JSON.stringify(auditManifest(), null, 1) + '\n';
    if (arg === '--write') writeFileSync(join(DIR, 'audit/package-manifest.json'), out); else process.stdout.write(out);
  } else if (cmd === 'reconcile') {
    const out = JSON.stringify(reconcile(reg, plan), null, 1) + '\n';
    if (arg === '--write') writeFileSync(join(DIR, 'pr-plan-reconciliation.json'), out); else process.stdout.write(out);
  } else { console.error('usage: pr-plan.mjs validate | counts [--write] | render [--write] | reconcile [--write]'); process.exitCode = 2; }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
