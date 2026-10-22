// MM-PR-01 (#96): Money Management Registry. Every model in the #96 census is listed with the registry fields; only the
// models whose formula is fully defined by #96/DEC-013 are IMPLEMENTED. The others stay DISCOVERED with formula=null:
// their formula/VOID/reset policy is an owner decision (#96 "censire → documentare formula → ... → implementare") and is
// never invented here. Pure data; simulated money only.
const caps = (o = {}) => Object.freeze({
  requires_bankroll: false, requires_available_bankroll: false, requires_previous_settlement: false, requires_sequence_state: false,
  requires_open_exposure: false, requires_liability: false, supports_back: true, supports_lay: true, supports_dutch: false,
  supports_live: true, supports_prematch: true, supports_void: true, supports_partial_settlement: false,
  can_run_without_settlement_history: true, ...o});

const implemented = (t) => Object.freeze({certification_status: 'IMPLEMENTED', settlement_dependency: 'NONE',
  supported_markets: Object.freeze(['ANY']), supported_sides: Object.freeze(['BACK', 'LAY']),
  void_policy: 'NO_STATE', reset_policy: 'NO_STATE', optional_inputs: Object.freeze([]), ...t});
const discovered = (type_id, name, category, description, o = {}) => Object.freeze({type_id, name, category, description,
  formula: null, formula_version: null, required_inputs: null, optional_inputs: null, capabilities: caps(o),
  settlement_dependency: null, supported_markets: null, supported_sides: null, risk_constraints: null, void_policy: null,
  reset_policy: null, test_vectors: null, certification_status: 'DISCOVERED',
  blocked_by: 'formula, VOID/reset policy and test vectors not yet specified by the owner (#96 registry steps 2-9)'});

export const REGISTRY = Object.freeze([
  implemented({type_id: 'FIXED_STAKE', name: 'Fixed Stake', category: 'A', description: 'Stake costante.',
    formula: 'stake = params.stake', formula_version: 1, required_inputs: Object.freeze(['params.stake', 'side', 'odds']),
    capabilities: caps(), risk_constraints: Object.freeze(['max_stake', 'max_liability', 'max_total_exposure', 'max_concurrent_trades', 'available_bankroll']),
    test_vectors: Object.freeze([{side: 'LAY', odds: '3', stake: '10', liability: '20'}])}),
  implemented({type_id: 'FIXED_LIABILITY', name: 'Fixed Liability', category: 'A', description: 'Responsabilità (perdita massima) costante.',
    formula: 'BACK: stake = L; LAY: stake = floor_step(L / (odds - 1)); L = params.liability', formula_version: 1,
    required_inputs: Object.freeze(['params.liability', 'side', 'odds']), capabilities: caps({requires_liability: true}),
    risk_constraints: Object.freeze(['max_stake', 'max_liability', 'max_total_exposure', 'max_concurrent_trades', 'available_bankroll']),
    test_vectors: Object.freeze([{side: 'LAY', odds: '3', liability: '20', stake: '10'}, {side: 'BACK', odds: '3', liability: '20', stake: '20'}])}),
  implemented({type_id: 'PERCENT_BANKROLL', name: 'Stake % bankroll', category: 'B', description: 'Stake = % del bankroll disponibile (DEC-013 SHARED_ACCOUNT_BANKROLL).',
    formula: 'stake = floor_step(available_bankroll * params.percent / 100)', formula_version: 1,
    required_inputs: Object.freeze(['params.percent', 'available_bankroll', 'side', 'odds']),
    capabilities: caps({requires_bankroll: true, requires_available_bankroll: true}),
    risk_constraints: Object.freeze(['max_stake', 'max_liability', 'max_total_exposure', 'max_concurrent_trades', 'available_bankroll']),
    test_vectors: Object.freeze([{available: '1000', percent: '2', stake: '20'}])}),
  implemented({type_id: 'LIABILITY_PERCENT_BANKROLL', name: 'Liability % bankroll', category: 'B', description: 'Responsabilità = % del bankroll disponibile.',
    formula: 'L = available_bankroll * params.percent / 100; BACK: stake = floor_step(L); LAY: stake = floor_step(L / (odds - 1))', formula_version: 1,
    required_inputs: Object.freeze(['params.percent', 'available_bankroll', 'side', 'odds']),
    capabilities: caps({requires_bankroll: true, requires_available_bankroll: true, requires_liability: true}),
    risk_constraints: Object.freeze(['max_stake', 'max_liability', 'max_total_exposure', 'max_concurrent_trades', 'available_bankroll']),
    test_vectors: Object.freeze([{available: '1000', percent: '2', side: 'LAY', odds: '5', stake: '5'}])}),
  discovered('KELLY', 'Kelly', 'B', 'Stake da probabilità stimata ed edge.', {requires_bankroll: true}),
  discovered('FRACTIONAL_KELLY', 'Fractional Kelly', 'B', 'Frazione dello stake Kelly.', {requires_bankroll: true}),
  discovered('TARGET_PROFIT', 'Target Profit', 'C', 'Stake per raggiungere un profitto obiettivo.'),
  discovered('RECOVERY_STAKE', 'Recovery Stake', 'C', 'Stake per recuperare perdite precedenti.', {requires_previous_settlement: true, requires_sequence_state: true, can_run_without_settlement_history: false}),
  discovered('RISK_BASED_STAKE', 'Risk-based Stake', 'B', 'Stake da rischio massimo per trade.', {requires_bankroll: true}),
  discovered('MARTINGALE', 'Martingale', 'D', 'Progressione dopo perdita.', {requires_previous_settlement: true, requires_sequence_state: true, can_run_without_settlement_history: false}),
  discovered('FIBONACCI', 'Fibonacci', 'D', 'Progressione Fibonacci.', {requires_previous_settlement: true, requires_sequence_state: true, can_run_without_settlement_history: false}),
  discovered('LABOUCHERE', 'Labouchere', 'D', 'Progressione a cancellazione.', {requires_previous_settlement: true, requires_sequence_state: true, can_run_without_settlement_history: false}),
  discovered('CS_PROGRESSIVO', 'CS Progressivo', 'D', 'Progressione su Correct Score.', {requires_previous_settlement: true, requires_sequence_state: true, can_run_without_settlement_history: false}),
  discovered('EXPOSURE_AWARE', 'Exposure-aware', 'E', 'Stake in funzione dell\'esposizione aperta.', {requires_open_exposure: true}),
  discovered('COMPOSITE', 'Composite/Custom', 'F', 'Composizione di modelli/regole.'),
  discovered('MANUAL_WITHIN_LIMITS', 'Manual stake entro limiti', 'A', 'Stake inserito dall\'operatore, entro i limiti.'),
]);

export const IMPLEMENTED_TYPES = Object.freeze(REGISTRY.filter(t => t.certification_status === 'IMPLEMENTED').map(t => t.type_id));
export const listMoneyManagementTypes = () => REGISTRY;
export function getMoneyManagementType(typeId) { return REGISTRY.find(t => t.type_id === typeId) ?? null; }
