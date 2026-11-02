// MP-ROADMAP-PR-COUNT-FINAL-01: the residual PR plan of the MASTER (docs/governance/master/pr-plan.json) is complete,
// traceable and arithmetically consistent, and the gates reject what the owner mandate forbids.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { load } from '../tools/governance/master.mjs';
import { loadPlan, planCounts, planValidate, renderPlan } from '../tools/governance/pr-plan.mjs';

const reg = load();
const plan = loadPlan();
const uiIds = new Set(JSON.parse(readFileSync('docs/governance/ui-requirements-matrix.json', 'utf8')).requirements.map(r => r.id));
const clone = () => structuredClone(plan);
const fails = (p, text, r = reg) => planValidate(r, p, {uiIds}).some(e => e.includes(text));

test('MP-PRCOUNT the plan is valid, its counts and pr-plan.md are up to date, MASTER summary agrees', () => {
  assert.deepEqual(planValidate(reg, plan, {uiIds}), []);
  assert.deepEqual(plan.counts, planCounts(reg, plan));
  assert.equal(readFileSync('docs/governance/master/pr-plan.md', 'utf8'), renderPlan(plan) + '\n');
  const k = plan.counts;
  assert.deepEqual(reg.master.pr_plan, {N: k.N, N_min: k.N_min, N_max: k.N_max, F_open_prs: k.F_open_prs, G_new_prs: k.G_new_prs, I_certification_only: k.I_certification_only});
  assert.equal(k.A_cards, reg.cards.length);
  assert.deepEqual(k.requirements.uncovered, []);
  assert.equal(k.requirements.covered_by_pr + k.requirements.completed_with_evidence, k.requirements.active);
});

test('MP-PRCOUNT totals reconcile: A = B + C + D + carried, H = carried - E + S = F + G, Nmin <= N <= Nmax', () => {
  const k = plan.counts;
  assert.equal(k.A_cards, k.B_completed + k.C_superseded + k.D_duplicate + k.carried_cards);
  assert.equal(k.H_total_prs, k.carried_cards - k.E_absorbed + k.S_split_out);
  assert.equal(k.H_total_prs, k.F_open_prs + k.G_new_prs);
  assert.ok(k.N_min <= k.N && k.N <= k.N_max);
  assert.equal(k.N, plan.planned_prs.length);
  const stale = clone(); stale.counts = {...stale.counts, N: stale.counts.N - 1};
  assert.ok(fails(stale, 'counts are stale'));
});

test('MP-PRCOUNT no active requirement without coverage, none covered twice', () => {
  const p1 = clone(); const pr = p1.planned_prs.find(p => p.requirements.length); pr.requirements = pr.requirements.slice(1);
  assert.ok(fails(p1, 'active requirement without coverage'));
  const p2 = clone(); const [a, b] = p2.planned_prs.filter(p => p.requirements.length); b.requirements.push(a.requirements[0]);
  assert.ok(fails(p2, 'covered twice'));
  const p3 = clone(); p3.completed_requirements.push({id: p3.planned_prs.find(p => p.requirements.length).requirements[0], basis: 'RULE_ENFORCED_BY_TEST', evidence: 'x'});
  assert.ok(fails(p3, 'covered twice'));
});

test('MP-PRCOUNT no card lost, none listed twice, merges traceable both ways', () => {
  const p1 = clone(); p1.card_dispositions.pop();
  assert.ok(fails(p1, 'card lost'));
  const p2 = clone(); p2.card_dispositions.push(structuredClone(p2.card_dispositions[0]));
  assert.ok(fails(p2, 'card listed twice'));
  const p3 = clone(); const c = p3.card_dispositions.find(x => x.planned_pr); const pr = p3.planned_prs.find(p => p.id === c.planned_pr); pr.cards = pr.cards.filter(x => x !== c.card);
  assert.ok(fails(p3, 'which does not list it'));
  const p4 = clone(); p4.card_dispositions.find(x => x.planned_pr).planned_pr = 'MP-PRP-999';
  assert.ok(fails(p4, 'does not exist'));
  const p5 = clone(); const d = p5.card_dispositions.find(x => x.disposition === 'DUPLICATE'); d.ref = null;
  assert.ok(fails(p5, 'DUPLICATE without a reference'));
  const p6 = clone(); p6.card_dispositions.find(x => x.disposition === 'SUPERSEDED').planned_pr = p6.planned_prs[0].id;
  assert.ok(fails(p6, 'cannot carry a planned PR'));
});

test('MP-PRCOUNT no duplicate PR, no duplicate id, no open PR counted twice, no untraceable PR', () => {
  const p1 = clone(); p1.planned_prs.push({...structuredClone(p1.planned_prs[0]), requirements: []});
  assert.ok(fails(p1, 'duplicate planned PR id'));
  const p2 = clone(); const o = p2.planned_prs.find(p => p.kind === 'OPEN'); p2.planned_prs.push({...structuredClone(o), id: 'MP-PRP-OPEN-X', requirements: [], cards: []});
  assert.ok(fails(p2, 'open PR is counted twice'));
  const p3 = clone(); const e = p3.planned_prs.find(p => p.kind === 'IMPL'); e.depends_on = ['MP-PRP-999'];
  assert.ok(fails(p3, 'unknown dependency'));
  const p4 = clone(); const z = p4.planned_prs.find(p => p.kind === 'IMPL'); p4.card_dispositions.forEach(c => { if (c.planned_pr === z.id) c.planned_pr = p4.planned_prs.find(p => p.id !== z.id && p.kind === 'IMPL').id; });
  z.requirements.forEach(r => p4.planned_prs.find(p => p.id !== z.id && p.kind === 'IMPL').requirements.push(r));
  z.requirements = []; z.serves = []; z.ui_requirements = []; z.cards = [];
  assert.ok(fails(p4, 'untraceable'));
  const p5 = clone(); const dd = p5.planned_prs.find(p => p.decision_dependent); dd.decision = null;
  assert.ok(fails(p5, 'decision-dependent without the decision'));
});

test('MP-PRCOUNT no invented certification or completion', () => {
  // A certification-only PR for code that is not implemented on main is refused.
  const p1 = clone(); const cert = p1.planned_prs.find(p => p.kind === 'CERT');
  const notImpl = reg.requirements.find(r => r.lifecycle === 'ACTIVE' && r.status.implementation === 'NOT_IMPLEMENTED');
  p1.planned_prs.forEach(p => { p.requirements = p.requirements.filter(x => x !== notImpl.id); });
  cert.requirements.push(notImpl.id);
  assert.ok(fails(p1, 'which is not implemented on main'));
  // A completion without merged code and tests, or without a certificate, is refused.
  const p2 = clone(); p2.planned_prs.forEach(p => { p.requirements = p.requirements.filter(x => x !== notImpl.id); });
  p2.completed_requirements.push({id: notImpl.id, basis: 'CERTIFICATE', evidence: 'claimed'});
  assert.ok(fails(p2, 'no invented completion'));
  const uncert = reg.requirements.find(r => r.lifecycle === 'ACTIVE' && r.status.implementation === 'IMPLEMENTED' && r.status.merged === true && r.tests.length && !(r.certification_evidence ?? []).length && plan.planned_prs.some(p => p.requirements.includes(r.id)));
  const p3 = clone(); p3.planned_prs.forEach(p => { p.requirements = p.requirements.filter(x => x !== uncert.id); });
  p3.completed_requirements.push({id: uncert.id, basis: 'CERTIFICATE', evidence: 'claimed'});
  assert.ok(fails(p3, 'certificate that is not registered'));
  const p4 = clone(); p4.planned_prs.forEach(p => { p.requirements = p.requirements.filter(x => x !== uncert.id); });
  p4.completed_requirements.push({id: uncert.id, basis: 'RULE_ENFORCED_BY_TEST', evidence: 'enforced by test/does-not-exist.test.mjs'});
  assert.ok(fails(p4, 'must name an enforcing test'));
  // A COMPLETED card needs every active requirement completed.
  const p5 = clone(); const card = reg.cards.find(c => c.requirements.some(id => reg.requirements.find(r => r.id === id)?.lifecycle === 'ACTIVE' && plan.planned_prs.some(p => p.requirements.includes(id))));
  const cd = p5.card_dispositions.find(c => c.card === card.id); cd.disposition = 'COMPLETED'; cd.planned_pr = null;
  assert.ok(fails(p5, 'COMPLETED but'));
});

test('MP-PRCOUNT the range is explained by named PRs only', () => {
  const k = plan.counts;
  const named = plan.planned_prs.filter(p => p.split_risk || p.merge_option || p.may_be_removed_by_decision);
  assert.ok(named.every(p => [p.split_risk, p.merge_option, p.may_be_removed_by_decision].some(v => typeof v === 'string' && v.length > 3)));
  assert.equal(k.N_max - k.N, k.uncertainty.split_risks);
  assert.equal(k.N - k.N_min, k.uncertainty.merge_pairs + k.uncertainty.removable_by_decision);
  const p1 = clone(); p1.planned_prs.find(p => !p.merge_option).merge_option = 'MP-PRP-999';
  assert.ok(fails(p1, 'merge option MP-PRP-999 unknown'));
});

test('MP-PRCOUNT the ID-level reconciliation is up to date and rebuilds every count from ids', async () => {
  const { reconcile } = await import('../tools/governance/pr-plan.mjs');
  const r = reconcile(reg, plan);
  assert.equal(readFileSync('docs/governance/master/pr-plan-reconciliation.json', 'utf8'), JSON.stringify(r, null, 1) + '\n');
  const k = plan.counts;
  assert.equal(r.cards.completed.length + r.cards.superseded.length + r.cards.duplicate.length + r.cards.carried, k.A_cards);
  assert.equal(Object.values(r.cards.carried_by_pr).flat().length, k.carried_cards);
  assert.equal(r.prs.absorbed_cards.length, k.E_absorbed);
  assert.equal(r.prs.with_primary_card + r.prs.split_out.length, k.H_total_prs);
  assert.equal(r.prs.split_out.length, k.S_split_out);
  assert.equal(r.prs.open.length + r.prs.new.length, k.H_total_prs);
  assert.equal(new Set(r.prs.open.map(o => o.github)).size, k.F_open_prs);
  assert.equal(r.uncertainty.merge_pairs.length, k.uncertainty.merge_pairs);
  assert.equal(r.uncertainty.removable_by_decision.length, k.uncertainty.removable_by_decision);
  assert.equal(r.uncertainty.split_risks.reduce((s, x) => s + x.extra, 0), k.uncertainty.split_risks);
  // every card appears exactly once across the four buckets
  const all = [...r.cards.completed, ...r.cards.superseded, ...r.cards.duplicate, ...Object.values(r.cards.carried_by_pr).flat()];
  assert.equal(new Set(all).size, reg.cards.length);
  assert.equal(all.length, reg.cards.length);
});
