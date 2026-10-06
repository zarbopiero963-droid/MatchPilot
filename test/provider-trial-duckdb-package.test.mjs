import test from 'node:test';
import assert from 'node:assert/strict';
import { DuckDBInstance } from '@duckdb/node-api';

test('DuckDB Node API loads and executes a real in-memory query', async () => {
  const instance=await DuckDBInstance.create(':memory:');
  const conn=await instance.connect();
  const reader=await conn.runAndReadAll('SELECT 42::INTEGER AS answer');
  const rows=reader.getRowObjectsJson();
  assert.equal(rows[0].answer,42);
  conn.closeSync();
});
