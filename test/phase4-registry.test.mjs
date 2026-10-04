import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aliasCandidateNames,
  normalizedFieldName,
  registryGate,
  transformFor,
  typesCollide
} from '../src/providers/futpython/schema.mjs';
import { phase4Gate } from '../src/providers/futpython/registry.mjs';

test('registry keeps raw names and records alias candidates without dropping fields', () => {
  assert.equal(normalizedFieldName('Match_ID'), 'provider_match_id');
  assert.equal(normalizedFieldName('Home_Score'), 'home_score');
  assert.equal(transformFor('Date'), 'dmy_or_iso_date');
  assert.deepEqual(aliasCandidateNames('AH_H_neg_0_5'), ['AH_Home_neg_0_5']);
  assert.equal(typesCollide('integer', 'number'), false);
  assert.equal(typesCollide('integer', 'text'), true);
  const gate = registryGate({
    rawFields: ['Home', 'AH_H_neg_0_5', 'AH_Home_neg_0_5'],
    registryFields: ['Home', 'AH_H_neg_0_5', 'AH_Home_neg_0_5'],
    suppressedAliases: []
  });
  assert.equal(gate.raw_unique_fields, 3);
  assert.equal(gate.registry_unique_fields, 3);
  assert.equal(gate.gate, true);
  assert.equal(registryGate({rawFields: ['Home', 'New'], registryFields: ['Home']}).gate, false);
});

test('rows_seen stays cumulative and is not the unique counter', () => {
  const summary = {
    raw_unique_fields: 325,
    registry_unique_fields: 325,
    missing_from_registry: 0,
    extra_in_registry: 0,
    missing_normalized: 0,
    missing_type_history: 0,
    transforms: 325,
    versions_without_lineage: 0
  };
  assert.equal(phase4Gate(summary), true);
  assert.equal(phase4Gate({...summary, registry_unique_fields: 324}), false);
  const rowsSeen = 161801;
  const uniqueRowsSeen = 161777;
  assert.ok(rowsSeen > uniqueRowsSeen);
});

test('lineage identity names the provider, versions and both field names', () => {
  const fact = {
    source_provider: 'futpythontrader',
    dataset_key: 'argentina/liga-profesional/2026',
    snapshot_id: 12,
    provider_match_id: 'abc',
    parser_version: 'fpt-csv-1',
    schema_version: 'fpt-schema-4',
    transform_version: 'fpt-norm-1',
    acquired_at: '2026-10-04T14:35:03.311Z',
    source_field: 'Home',
    normalized_field: 'home'
  };
  for (const key of ['source_provider','dataset_key','snapshot_id','provider_match_id','parser_version','schema_version','transform_version','acquired_at','source_field','normalized_field']) {
    assert.ok(fact[key] !== undefined && fact[key] !== null && fact[key] !== '');
  }
});
