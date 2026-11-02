// MP-CAP-03: universal AND/OR/NOT conditions on the capability catalog. Capabilities are the real catalog entries
// (FPT archive columns via fptFieldCapability, observed API-FOOTBALL entries); records are synthetic test values.
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, expressionFields, ExpressionError, filterRecords, LIMITS, normalizeExpression, pitViolations } from '../src/conditions/expression.mjs';
import { buildCatalog, fptFieldCapability } from '../src/capabilities/catalog.mjs';
import { apiFootballCapabilities } from '../src/capabilities/apifootball.mjs';

const catalog = buildCatalog([
  fptFieldCapability({field_name: 'Odd_H_FT', inferred_type: 'number', nonempty_seen: 9, filterable: true}),
  fptFieldCapability({field_name: 'Odd_Over25_FT', inferred_type: 'number', nonempty_seen: 9, filterable: true}),
  fptFieldCapability({field_name: 'League', inferred_type: 'text', nonempty_seen: 9, filterable: true}),
  fptFieldCapability({field_name: 'Date', inferred_type: 'date_or_datetime', nonempty_seen: 9, filterable: true}),
  fptFieldCapability({field_name: 'Goals_H_FT', inferred_type: 'integer', nonempty_seen: 9, filterable: true}),
  ...apiFootballCapabilities()
]);
const H = 'fpt:market:Odd_H_FT', O = 'fpt:market:Odd_Over25_FT', L = 'fpt:identity:League', D = 'fpt:identity:Date', G = 'fpt:statistic:Goals_H_FT';
const norm = expr => normalizeExpression(expr, catalog);
const ev = (expr, record) => evaluate(norm(expr), record, catalog);

test('MP-CAP-03 the catalog decides fields, operators and value types; nothing is a fixed market list', () => {
  assert.equal(catalog.errors.length, 0);
  assert.equal(catalog.capabilities.find(c => c.id === L).kind, 'identity', 'League is an identity column');
  const n = norm({all: [{field: H, op: 'between', value: ['1.50', '2.10']}, {any: [{field: L, op: 'in', value: ['Serie A', 'Premier League', 'Serie A']}, {not: {field: O, op: 'is_null'}}]}]});
  assert.deepEqual(n, {version: 'mp-expr-1', expression: {all: [
    {field: H, op: 'between', value: ['1.5', '2.1']},
    {any: [{field: L, op: 'in', value: ['Serie A', 'Premier League']}, {not: {field: O, op: 'is_null'}}]}
  ]}});
  assert.deepEqual(expressionFields(n), [H, L, O]);
  assert.deepEqual(norm({field: 'apifootball:statistic:Corner Kicks', op: 'gte', value: 5}).expression, {field: 'apifootball:statistic:Corner Kicks', op: 'gte', value: '5'});
  assert.deepEqual(norm({field: D, op: 'gte', value: '2026-08-01T00:00:00+02:00'}).expression.value, '2026-07-31T22:00:00.000Z');
});

test('MP-CAP-03 malformed expressions are refused with the path of the problem', () => {
  for (const [expr, path, message] of [
    [{field: 'fpt:market:Nope', op: 'gt', value: '2'}, '$.field', /capability in the catalog/],
    [{field: H, op: 'contains', value: '2'}, '$.op', /operators of fpt:market:Odd_H_FT/],
    [{field: L, op: 'gt', value: 'A'}, '$.op', /operators/],
    [{field: H, op: 'gt', value: 2.5}, '$.value', /decimal as text/],
    [{field: H, op: 'gt', value: '1e3'}, '$.value', /decimal as text/],
    [{field: H, op: 'gt'}, '$.value', /is required/],
    [{field: H, op: 'is_null', value: '2'}, '$.value', /takes no value/],
    [{field: H, op: 'between', value: ['3', '2']}, '$.value', /low must not exceed high/],
    [{field: H, op: 'between', value: ['2']}, '$.value', /\[low, high\]/],
    [{field: G, op: 'eq', value: '1.5'}, '$.value', /integer/],
    [{field: D, op: 'gt', value: '2026-08-01'}, '$.value', /time zone/],
    [{field: L, op: 'eq', value: 'Serie\u0000A'}, '$.value', /printable/],
    [{field: L, op: 'in', value: []}, '$.value', /list of 1 to/],
    [{field: H, op: 'gt', value: '2', extra: 1}, '$', /unknown key extra/],
    [{all: []}, '$.all', /list of 1 to/],
    [{all: [{field: H, op: 'gt', value: '2'}], any: []}, '$', /only key/],
    [{not: {field: H, op: 'gt', value: '2'}, all: []}, '$', /only key/],
    [{all: [null]}, '$.all[0]', /must be an object/],
    [{or: []}, '$', /must be \{all\}/],
    [[], '$', /must be an object/],
    [JSON.parse('{"__proto__": {"field": "x"}}'), '$', /must be \{all\}/]
  ]) {
    assert.throws(() => norm(expr), err => err instanceof ExpressionError && err.code === 'BAD_EXPRESSION' && err.path === path && message.test(err.message), JSON.stringify(expr));
  }
  let deep = {field: H, op: 'gt', value: '2'};
  for (let i = 0; i < LIMITS.depth; i++) deep = {not: deep};
  assert.throws(() => norm(deep), /deeper than/);
  assert.throws(() => norm({any: Array.from({length: 4}, () => ({all: Array.from({length: 50}, () => ({field: H, op: 'gt', value: '2'}))}))}), /more than 200 nodes/);
  assert.throws(() => normalizeExpression({field: H, op: 'gt', value: '2'}, null), /capability catalog is required/);
});

test('MP-CAP-03 exact decimals and three-valued logic: missing data is UNKNOWN, never a match', () => {
  assert.equal(ev({field: H, op: 'gt', value: '2.1'}, {[H]: '2.10'}), 'FALSE', 'decimal, not float');
  assert.equal(ev({field: H, op: 'gte', value: '2.1'}, {[H]: '2.10'}), 'TRUE');
  assert.equal(ev({field: H, op: 'eq', value: '0.3'}, {[H]: '0.30'}), 'TRUE');
  assert.equal(ev({field: H, op: 'gt', value: '2'}, {}), 'UNKNOWN');
  assert.equal(ev({field: H, op: 'gt', value: '2'}, {[H]: 'n/a'}), 'UNKNOWN', 'unreadable is not guessed');
  assert.equal(ev({field: H, op: 'gt', value: '2'}, {[H]: 2.5}), 'UNKNOWN', 'a binary float is not read as a price');
  assert.equal(ev({not: {field: H, op: 'gt', value: '2'}}, {}), 'UNKNOWN', 'NOT of missing stays UNKNOWN');
  assert.equal(ev({all: [{field: H, op: 'gt', value: '2'}, {field: L, op: 'eq', value: 'Serie A'}]}, {[L]: 'Premier League'}), 'FALSE', 'one FALSE decides AND');
  assert.equal(ev({all: [{field: H, op: 'gt', value: '2'}, {field: L, op: 'eq', value: 'Serie A'}]}, {[L]: 'Serie A'}), 'UNKNOWN');
  assert.equal(ev({any: [{field: H, op: 'gt', value: '2'}, {field: L, op: 'eq', value: 'Serie A'}]}, {[L]: 'Serie A'}), 'TRUE', 'one TRUE decides OR');
  assert.equal(ev({field: H, op: 'is_null'}, {[H]: null}), 'TRUE');
  assert.equal(ev({field: H, op: 'not_null'}, {[H]: '1.9'}), 'TRUE');
  assert.equal(ev({field: L, op: 'contains', value: 'Serie'}, {[L]: 'Serie B'}), 'TRUE');
  assert.equal(ev({field: D, op: 'lt', value: '2026-11-01T00:00:00Z'}, {[D]: '2026-10-31T23:59:59+00:00'}), 'TRUE');
  assert.equal(ev({field: D, op: 'lt', value: '2026-11-01T00:00:00Z'}, {[D]: '2026-10-31'}), 'UNKNOWN', 'a date without time zone is not read');
  const rows = [{[H]: '1.8', [L]: 'Serie A'}, {[H]: '2.5', [L]: 'Serie A'}, {[L]: 'Serie A'}, {[H]: '1.9', [L]: 'Liga'}];
  const {selected, counts} = filterRecords(norm({all: [{field: H, op: 'lte', value: '2'}, {field: L, op: 'eq', value: 'Serie A'}]}), rows, catalog);
  assert.deepEqual(selected, [rows[0]]);
  assert.deepEqual(counts, {TRUE: 1, FALSE: 2, UNKNOWN: 1}, 'records left out for missing data are counted, not hidden');
  assert.throws(() => evaluate({expression: {}}, {}, catalog), /normalized expression is required/);
});

test('MP-CAP-03 PIT: a decision before kickoff cannot use post-match statistics', () => {
  const n = norm({all: [{field: H, op: 'lte', value: '2'}, {field: L, op: 'eq', value: 'Serie A'}, {any: [{field: G, op: 'gte', value: 2}, {field: 'apifootball:statistic:Corner Kicks', op: 'gte', value: 9}]}]});
  assert.deepEqual(pitViolations(n, catalog, {decision: 'PREMATCH'}).map(v => [v.field, v.timing]), [[G, 'POSTMATCH_OUTCOME'], ['apifootball:statistic:Corner Kicks', 'POSTMATCH_OUTCOME']]);
  assert.deepEqual(pitViolations(n, catalog, {decision: 'POSTMATCH'}), [], 'research on finished matches may use them');
  assert.deepEqual(pitViolations(norm({field: 'apifootball:market:odds/bet:5', op: 'gt', value: '1.9'}), catalog, {decision: 'PREMATCH'}), []);
  assert.throws(() => pitViolations(n, catalog, {decision: 'LIVE'}), /PREMATCH or POSTMATCH/);
});
