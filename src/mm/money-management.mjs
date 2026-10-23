// MM-CORE (#96): Money Management profiles, operational mode (DEC-001 STOP / ADVISORY_ONLY), decision output and
// sequence state, with the DEC-013 defaults. #96 never writes ledger entries: it reads the account state from #99
// (src/ledger/paper-ledger.mjs accountState) and returns a decision. Pure and deterministic; simulated money only.
import {Decimal, dec, ROUNDING} from '../math/decimal.mjs';
import {MODES} from '../ledger/paper-ledger.mjs';
import {REGISTRY, IMPLEMENTED_TYPES} from './registry.mjs';

export const MM_ENGINE_VERSION = 'mp-mm-3';
export const BANKROLL_MODES = Object.freeze(['SHARED_ACCOUNT_BANKROLL', 'SEGREGATED']);
// Implemented models with their capability flags, from the registry (MM-PR-01). DISCOVERED models are not usable.
export const MODELS = Object.freeze(Object.fromEntries(REGISTRY.filter(t => IMPLEMENTED_TYPES.includes(t.type_id))
  .map(t => [t.type_id, Object.freeze({category: t.category, ...t.capabilities})])));
export const ADVISORY_LABEL = 'ADVISORY ONLY — operazione non registrata';

export class MMError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const fail = (code, msg) => { throw new MMError(code, msg); };
const optDec = (field, v) => {
  if (v === undefined || v === null) return null;
  let d; try { d = dec(v); } catch (e) { fail('BAD_INPUT', `${field}: ${e.message}`); }
  if (!d.gt(0)) fail('BAD_INPUT', `${field} must be > 0`);
  return d;
};

// Immutable profile version. DEC-013: SHARED_ACCOUNT_BANKROLL by default, VOID/PUSH do not advance the progression by
// default, and no arbitrary fixed monetary limit is added (caps exist only when the owner configures them).
export function createProfile({profileId, version = 1, model, params = {}, caps = {}, bankrollMode = 'SHARED_ACCOUNT_BANKROLL',
  voidPushAdvancesProgression = false, stakeStep = '0.01'}) {
  if (typeof profileId !== 'string' || !profileId) fail('BAD_INPUT', 'profile_id is required');
  if (!MODELS[model]) fail(REGISTRY.some(t => t.type_id === model) ? 'MODEL_NOT_IMPLEMENTED' : 'UNKNOWN_MODEL',
    `model ${model} is not implemented (registry status must be IMPLEMENTED)`);
  if (!BANKROLL_MODES.includes(bankrollMode)) fail('BAD_INPUT', `bankroll_mode ${bankrollMode}`);
  if (bankrollMode === 'SEGREGATED') fail('NOT_IMPLEMENTED', 'SEGREGATED bankroll is an option not implemented yet (DEC-013)');
  if (typeof voidPushAdvancesProgression !== 'boolean') fail('BAD_INPUT', 'void_push_advances_progression must be boolean');
  const p = {};
  if (model === 'FIXED_STAKE') p.stake = optDec('params.stake', params.stake) ?? fail('BAD_INPUT', 'FIXED_STAKE needs params.stake');
  if (model === 'PERCENT_BANKROLL') {
    p.percent = optDec('params.percent', params.percent) ?? fail('BAD_INPUT', 'PERCENT_BANKROLL needs params.percent');
    if (p.percent.gt(100)) fail('BAD_INPUT', 'params.percent must be <= 100');
  }
  if (model === 'FIXED_LIABILITY') p.liability = optDec('params.liability', params.liability) ?? fail('BAD_INPUT', 'FIXED_LIABILITY needs params.liability');
  if (model === 'LIABILITY_PERCENT_BANKROLL') {
    p.percent = optDec('params.percent', params.percent) ?? fail('BAD_INPUT', 'LIABILITY_PERCENT_BANKROLL needs params.percent');
    if (p.percent.gt(100)) fail('BAD_INPUT', 'params.percent must be <= 100');
  }
  const intCap = (field, v) => {
    if (v === undefined || v === null) return null;
    if (!Number.isInteger(v) || v < 1) fail('BAD_INPUT', `${field} must be an integer >= 1`);
    return v;
  };
  const c = {max_stake: optDec('caps.max_stake', caps.max_stake), max_liability: optDec('caps.max_liability', caps.max_liability),
    max_total_exposure: optDec('caps.max_total_exposure', caps.max_total_exposure),
    max_exposure_per_match: optDec('caps.max_exposure_per_match', caps.max_exposure_per_match),
    max_exposure_per_market: optDec('caps.max_exposure_per_market', caps.max_exposure_per_market),
    max_exposure_per_league: optDec('caps.max_exposure_per_league', caps.max_exposure_per_league),
    max_exposure_per_strategy: optDec('caps.max_exposure_per_strategy', caps.max_exposure_per_strategy),
    min_odds: optDec('caps.min_odds', caps.min_odds), max_odds: optDec('caps.max_odds', caps.max_odds)};
  const KNOWN = ['max_stake', 'max_liability', 'max_total_exposure', 'max_concurrent_trades', 'max_exposure_per_match',
    'max_exposure_per_market', 'max_exposure_per_league', 'max_exposure_per_strategy', 'min_odds', 'max_odds', 'filter_fail_action'];
  const unknown = Object.keys(caps).filter(k => !KNOWN.includes(k));
  if (unknown.length) fail('BAD_INPUT', `unsupported caps: ${unknown.join(', ')}`);
  const str = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === null ? null : v.toString()]));
  const maxConcurrent = intCap('caps.max_concurrent_trades', caps.max_concurrent_trades);
  if (c.min_odds && !c.min_odds.gt(1)) fail('BAD_INPUT', 'caps.min_odds must be > 1');
  if (c.min_odds && c.max_odds && c.min_odds.gt(c.max_odds)) fail('BAD_INPUT', 'caps.min_odds > caps.max_odds');
  // #96 "ELSE: reduce stake / block / simulation only": the outcome of a failed filter is a profile choice, never a default.
  const hasFilter = c.min_odds || c.max_odds;
  const ffa = caps.filter_fail_action ?? null;
  if (hasFilter && !['BLOCK', 'SIMULATION_ONLY'].includes(ffa)) fail('BAD_INPUT', 'odds filters need caps.filter_fail_action BLOCK or SIMULATION_ONLY');
  if (!hasFilter && ffa !== null) fail('BAD_INPUT', 'caps.filter_fail_action without filters');
  return Object.freeze({profile_id: profileId, version, model, capabilities: MODELS[model], params: Object.freeze(str(p)),
    caps: Object.freeze({...str(c), max_concurrent_trades: maxConcurrent, filter_fail_action: ffa}), bankroll_mode: bankrollMode, void_push_advances_progression: voidPushAdvancesProgression,
    stake_step: dec(stakeStep).toString(), engine_version: MM_ENGINE_VERSION});
}

// Account-level operational state with audit trail (who/when/reason). STOP -> ADVISORY_ONLY, RESUME -> ACTIVE.
export function initialOperationalState() { return Object.freeze({mode: 'ACTIVE_OPERATIONAL', audit: Object.freeze([])}); }
function transition(state, mode, {who, at, reason}) {
  if (!who || !at || !reason) fail('BAD_INPUT', 'who, at and reason are required for an operational mode change');
  if (state.mode === 'ARCHIVED') fail('ARCHIVED', 'an archived profile cannot change mode');
  return Object.freeze({mode, audit: Object.freeze([...state.audit, Object.freeze({from: state.mode, to: mode, who, at, reason})])});
}
export const stopOperations = (s, a) => transition(s, 'ADVISORY_ONLY', a);
export const resumeOperations = (s, a) => transition(s, 'ACTIVE_OPERATIONAL', a);
export const pauseOperations = (s, a) => transition(s, 'PAUSED', a);
export const archiveProfile = (s, a) => transition(s, 'ARCHIVED', a);

const liabilityOf = (side, odds, stake) => (side === 'LAY' ? stake.mul(odds.sub(1)) : stake);

// Decision for a proposal. `account` is accountState() from #99 (strings). Output: ALLOW / REDUCE / BLOCK /
// SIMULATION_ONLY with execution_permission. In ADVISORY_ONLY the theoretical stake is still computed.
export function evaluate({profile, operational, account, proposal, commissionRate, settingsVersion, at}) {
  if (!MODES.includes(operational?.mode)) fail('BAD_INPUT', 'operational.mode');
  const {side, odds: o} = proposal || {};
  if (side !== 'BACK' && side !== 'LAY') fail('BAD_INPUT', 'proposal.side');
  const odds = dec(o); if (!odds.gt(1)) fail('BAD_INPUT', 'proposal.odds must be > 1');
  const reasons = [], caps = [];
  const available = dec(account.available_bankroll);
  const cap = MODELS[profile.model];
  if (!cap) fail('MODEL_NOT_IMPLEMENTED', profile.model);
  if ((side === 'BACK' && !cap.supports_back) || (side === 'LAY' && !cap.supports_lay)) fail('SIDE_NOT_SUPPORTED', `${profile.model} ${side}`);
  const fromLiability = L => (side === 'LAY' ? L.div(odds.sub(1)) : L).roundToStep(profile.stake_step, ROUNDING.DOWN);
  let stake;
  if (profile.model === 'FIXED_STAKE') stake = dec(profile.params.stake);
  else if (profile.model === 'PERCENT_BANKROLL') stake = available.mul(dec(profile.params.percent)).div(100).roundToStep(profile.stake_step, ROUNDING.DOWN);
  else if (profile.model === 'FIXED_LIABILITY') stake = fromLiability(dec(profile.params.liability));
  else stake = fromLiability(available.mul(dec(profile.params.percent)).div(100));
  const original = {stake, liability: liabilityOf(side, odds, stake)};
  if (profile.caps.max_stake && stake.gt(profile.caps.max_stake)) { stake = dec(profile.caps.max_stake); caps.push('max_stake'); }
  if (profile.caps.max_liability && liabilityOf(side, odds, stake).gt(profile.caps.max_liability)) {
    stake = side === 'LAY' ? dec(profile.caps.max_liability).div(odds.sub(1)).roundToStep(profile.stake_step, ROUNDING.DOWN) : dec(profile.caps.max_liability);
    caps.push('max_liability');
  }
  // Optional total exposure cap (#96 "max exposure totale"): open liability from #99 + this liability must fit.
  if (profile.caps.max_total_exposure) {
    const room = dec(profile.caps.max_total_exposure).sub(dec(account.open_liability));
    if (liabilityOf(side, odds, stake).gt(room)) {
      stake = room.gt(0) ? fromLiability(room) : Decimal.zero();
      caps.push('max_total_exposure');
    }
  }
  // Optional per-scope caps (#96 "max exposure per partita/mercato/campionato/strategia"). Fail closed: a set cap with no
  // scope id on the proposal cannot be checked, so the proposal is BLOCKed (never silently skipped).
  const missingScope = [];
  for (const k of ['match', 'market', 'league', 'strategy']) {
    const lim = profile.caps[`max_exposure_per_${k}`];
    if (!lim) continue;
    const id = proposal.scope?.[k];
    if (!id) { missingScope.push(k); continue; }
    const room = dec(lim).sub(dec(account.open_exposure_by_scope?.[k]?.[id] ?? '0'));
    if (liabilityOf(side, odds, stake).gt(room)) {
      stake = room.gt(0) ? fromLiability(room) : Decimal.zero();
      caps.push(`max_exposure_per_${k}`);
    }
  }
  // Hard account safety: the worst case must fit the available shared bankroll (exposure of every profile included).
  if (liabilityOf(side, odds, stake).gt(available)) {
    stake = side === 'LAY' ? available.div(odds.sub(1)).roundToStep(profile.stake_step, ROUNDING.DOWN) : available.roundToStep(profile.stake_step, ROUNDING.DOWN);
    caps.push('available_bankroll');
  }
  let decision = caps.length ? 'REDUCE' : 'ALLOW';
  if (!stake.gt(0)) { decision = 'BLOCK'; reasons.push('STAKE_ZERO_AFTER_CAPS'); }
  // Optional concurrency cap (#96 "max concurrent trades"): open positions from #99.
  if (profile.caps.max_concurrent_trades && account.open_position_count >= profile.caps.max_concurrent_trades) {
    decision = 'BLOCK'; caps.push('max_concurrent_trades'); reasons.push('MAX_CONCURRENT_TRADES');
  }
  if (missingScope.length) { decision = 'BLOCK'; reasons.push(...missingScope.map(k => `SCOPE_ID_MISSING:${k}`)); }
  // Odds filters (#96 "min/max odds"): outcome chosen by the profile (filter_fail_action).
  const failed = [];
  if (profile.caps.min_odds && odds.lt(profile.caps.min_odds)) failed.push('min_odds');
  if (profile.caps.max_odds && odds.gt(profile.caps.max_odds)) failed.push('max_odds');
  let execution = decision !== 'BLOCK';
  if (failed.length && decision !== 'BLOCK') {
    decision = profile.caps.filter_fail_action; execution = false; reasons.push('FILTER_FAILED');
  }
  if (operational.mode === 'ADVISORY_ONLY') { decision = 'SIMULATION_ONLY'; execution = false; reasons.push('ADVISORY_ONLY'); }
  if (operational.mode === 'PAUSED' || operational.mode === 'ARCHIVED') { decision = 'BLOCK'; execution = false; reasons.push(operational.mode); }
  return Object.freeze({decision, execution_permission: execution,
    label: operational.mode === 'ADVISORY_ONLY' ? ADVISORY_LABEL : null,
    original_stake: original.stake.toString(), adjusted_stake: (stake.gt(0) ? stake : Decimal.zero()).toString(),
    original_liability: original.liability.toString(), adjusted_liability: liabilityOf(side, odds, stake.gt(0) ? stake : Decimal.zero()).toString(),
    hard_caps_triggered: caps, structured_reasons: reasons, operational_mode: operational.mode,
    money_management_profile_id: profile.profile_id, money_management_version: profile.version, engine_version: MM_ENGINE_VERSION,
    bankroll_mode: profile.bankroll_mode, commission_rate_used: commissionRate === undefined ? null : dec(commissionRate).toString(),
    settings_version: settingsVersion ?? null, bankroll_snapshot_ref: `${account.account_id}@${account.entries}`,
    exposure_snapshot_ref: `${account.account_id}@${account.entries}:open_liability=${account.open_liability}`,
    matched_rules: Object.freeze([]), failed_filters: Object.freeze(failed), timestamp: at ?? null});
}

// Sequence state advances only from a final #99 settlement, once per position (also during STOP, DEC-001), never for an
// advisory proposal. VOID/PUSH do not advance unless the profile says so (DEC-013). A later correction of an already
// counted position does not advance it again (it is recorded as a correction).
export function initialSequence() { return Object.freeze({wins: 0, losses: 0, losing_streak: 0, steps: 0, counted: Object.freeze([]), corrections: Object.freeze([])}); }
export function applySettlement(seq, profile, {positionId, outcome, settlementVersion = 1}) {
  if (!positionId) fail('BAD_INPUT', 'position_id');
  if (seq.counted.includes(positionId)) {
    if (settlementVersion > 1) return Object.freeze({...seq, corrections: Object.freeze([...seq.corrections, {positionId, outcome, settlementVersion}])});
    return seq; // replayed/duplicated event: idempotent
  }
  const neutral = outcome === 'VOID' || outcome === 'PUSH';
  if (neutral && !profile.void_push_advances_progression) return seq;
  const s = {...seq, counted: Object.freeze([...seq.counted, positionId]), steps: seq.steps + 1};
  if (outcome === 'WIN') { s.wins++; s.losing_streak = 0; } else if (outcome === 'LOSE') { s.losses++; s.losing_streak++; }
  return Object.freeze(s);
}
