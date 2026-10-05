import test from 'node:test';
import assert from 'node:assert/strict';
import { assessPersistenceHealth } from '../scripts/lib/provider-trial-health.mjs';

const NOW=Date.parse('2026-10-05T15:30:00Z');

test('persistence health recovers after historical failure when current writes are healthy', () => {
  const result=assessPersistenceHealth({
    dbReady:true,
    lastPersistError:null,
    lastPersistAt:'2026-10-05T15:29:30Z',
    queueLength:0,
    nowMs:NOW
  });
  assert.equal(result.healthy,true);
  assert.equal(result.recent_success,true);
  assert.equal(result.current_error,null);
});

test('persistence health fails on a current database error', () => {
  const result=assessPersistenceHealth({
    dbReady:true,
    lastPersistError:'timeout exceeded when trying to connect',
    lastPersistAt:'2026-10-05T15:29:30Z',
    queueLength:0,
    nowMs:NOW
  });
  assert.equal(result.healthy,false);
});

test('persistence health fails when no successful persistence is recent', () => {
  const result=assessPersistenceHealth({
    dbReady:true,
    lastPersistError:null,
    lastPersistAt:'2026-10-05T15:20:00Z',
    queueLength:0,
    nowMs:NOW
  });
  assert.equal(result.healthy,false);
  assert.equal(result.recent_success,false);
});

test('persistence health fails on pathological queue growth', () => {
  const result=assessPersistenceHealth({
    dbReady:true,
    lastPersistError:null,
    lastPersistAt:'2026-10-05T15:29:30Z',
    queueLength:1000,
    nowMs:NOW
  });
  assert.equal(result.healthy,false);
  assert.equal(result.queue_healthy,false);
});

test('persistence health fails when database is not ready', () => {
  const result=assessPersistenceHealth({
    dbReady:false,
    lastPersistError:null,
    lastPersistAt:'2026-10-05T15:29:30Z',
    queueLength:0,
    nowMs:NOW
  });
  assert.equal(result.healthy,false);
});
