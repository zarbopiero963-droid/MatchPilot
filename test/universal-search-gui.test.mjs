// MP-SEARCH-GUI-01 (#263): the pure model of the universal search page, without a browser.
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import * as US from '../src/web/universal-search.js';
import {normalizeExpression as parseExpression} from '../src/conditions/expression.mjs';

const caps = [
  {id: 'fpt:market:odd_home', provider: 'fpt', kind: 'market', value_type: 'number', operators: ['gt', 'lt', 'between', 'is_null', 'not_null'], status: 'AVAILABLE AND IMPLEMENTED', timing: 'PREMATCH_MARKET_UNTIMED'},
  {id: 'fpt:statistic:goals_home', provider: 'fpt', kind: 'statistic', value_type: 'integer', operators: ['eq', 'gte'], status: 'AVAILABLE AND IMPLEMENTED', timing: 'POSTMATCH_STATISTIC'},
  {id: 'fpt:identity:country', provider: 'fpt', kind: 'identity', value_type: 'text', operators: ['eq', 'in'], status: 'AVAILABLE AND IMPLEMENTED', timing: 'PREMATCH_IDENTITY'},
  {id: 'apifootball:market:1x2', provider: 'apifootball', kind: 'market', value_type: 'number', operators: ['gt'], status: 'AVAILABLE BUT NOT IMPLEMENTED', timing: 'PREMATCH_MARKET_UNTIMED'},
  {id: 'fpt:market:corners', provider: 'fpt', kind: 'market', value_type: 'number', operators: ['gt'], status: 'NOT VERIFIED', timing: 'PREMATCH_MARKET_UNTIMED'}];

test('catalog order kept, nothing promoted; non-implemented and non-searchable states are explicit', () => {
  const m = US.catalogModel(caps, 'PREMATCH');
  assert.deepEqual(m.groups.map(g => g.kind), ['market', 'statistic', 'identity']);
  assert.deepEqual(m.groups[0].fields.map(f => f.id), ['fpt:market:odd_home', 'apifootball:market:1x2', 'fpt:market:corners']);
  const by = Object.fromEntries(m.groups.flatMap(g => g.fields).map(f => [f.id, f]));
  assert.equal(by['fpt:market:odd_home'].usable, true);
  assert.equal(by['apifootball:market:1x2'].reason, 'Fornitore non ancora ricercabile');
  assert.equal(by['fpt:market:corners'].reason, 'Non verificato');
  assert.match(by['fpt:statistic:goals_home'].reason, /PIT/);
  assert.equal(US.catalogModel(caps, 'POSTMATCH').groups[1].fields[0].usable, true);
  assert.equal(m.not_implemented, 2);
});

test('AND/OR/NOT tree becomes the API grammar and parses against the catalog', () => {
  const t = US.newGroup('all');
  t.children.push({type: 'cond', field: 'fpt:market:odd_home', op: 'between', value: '1.5, 2.1', negate: false});
  const g = US.newGroup('any'); g.negate = true;
  g.children.push({type: 'cond', field: 'fpt:identity:country', op: 'in', value: 'Italy,Spain', negate: false});
  g.children.push({type: 'cond', field: 'fpt:market:odd_home', op: 'is_null', value: '', negate: true});
  t.children.push(g);
  const expr = US.toExpression(t);
  assert.deepEqual(expr, {all: [{field: 'fpt:market:odd_home', op: 'between', value: ['1.5', '2.1']},
    {not: {any: [{field: 'fpt:identity:country', op: 'in', value: ['Italy', 'Spain']}, {not: {field: 'fpt:market:odd_home', op: 'is_null'}}]}}]});
  assert.doesNotThrow(() => parseExpression(expr, caps));
});

test('empty groups and blank conditions are dropped; empty tree has no expression', () => {
  const t = US.newGroup(); t.children.push(US.newCondition(), US.newGroup());
  assert.equal(US.toExpression(t), null);
});

test('validation: unusable field, wrong operator, missing value, LIVE disabled, empty tree', () => {
  const m = US.catalogModel(caps, 'PREMATCH');
  const t = US.newGroup();
  assert.ok(US.validate(t, m, 'PREMATCH').some(e => /almeno una/.test(e.message)));
  t.children.push({type: 'cond', field: 'fpt:statistic:goals_home', op: 'eq', value: '1', negate: false});
  t.children.push({type: 'cond', field: 'fpt:market:odd_home', op: 'eq', value: '1', negate: false});
  t.children.push({type: 'cond', field: 'fpt:identity:country', op: 'eq', value: ' ', negate: false});
  const msgs = US.validate(t, m, 'LIVE').map(e => e.message).join('|');
  assert.match(msgs, /non utilizzabile/); assert.match(msgs, /operatore non offerto/); assert.match(msgs, /inserisci un valore/); assert.match(msgs, /Live/);
  assert.equal(US.DECISIONS.find(d => d.id === 'LIVE').enabled, false);
});

test('search URL uses GET /api/v1/search with only the chosen parameters', () => {
  const u = new URL(US.searchUrl({expr: {field: 'a', op: 'not_null'}, decision: 'PREMATCH', from: '2025-01-01', to: '2025-02-01', limit: 50}), 'http://x');
  assert.equal(u.pathname, '/api/v1/search');
  assert.deepEqual([...u.searchParams.keys()], ['expr', 'decision', 'from', 'to', 'limit']);
});

test('missing data: UNKNOWN counted apart, missing value shown as N/D never as 0', () => {
  const s = US.outcomeSummary({counts: {TRUE: 3, FALSE: 5, UNKNOWN: 2}, scanned: 10, truncated: false, pit: {label: 'PIT_NOT_VERIFIED'}});
  assert.deepEqual(s, {matches: 3, not_matching: 5, unknown: 2, scanned: 10, truncated: false, pit: 'PIT_NOT_VERIFIED'});
  assert.deepEqual(US.displayValue(null), {missing: true, text: 'N/D'});
  assert.deepEqual(US.displayValue(0), {missing: false, text: '0'});
});

test('tree state round-trips through the URL; malformed state falls back to an empty group, never a default filter', () => {
  const t = US.newGroup('any'); t.children.push({type: 'cond', field: 'x', op: 'eq', value: '1', negate: true});
  assert.deepEqual(US.decodeTree(US.encodeTree(t)), t);
  assert.deepEqual(US.decodeTree('{bad'), US.newGroup());
  assert.deepEqual(US.decodeTree(JSON.stringify({type: 'group', join: 'xor', children: []})), US.newGroup());
});

test('the page is wired: route, asset, check script; the module has no hard-coded market', () => {
  const app = readFileSync(new URL('../src/web/app.js', import.meta.url), 'utf8');
  assert.match(app, /usearch: \['la ricerca universale', usearchView/);
  assert.match(readFileSync(new URL('../src/web/static.mjs', import.meta.url), 'utf8'), /universal-search\.js/);
  const mod = readFileSync(new URL('../src/web/universal-search.js', import.meta.url), 'utf8');
  assert.doesNotMatch(mod, /over ?2\.?5|odd_home|1x2/i);
});
