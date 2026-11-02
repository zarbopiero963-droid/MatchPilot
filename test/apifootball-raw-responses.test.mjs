// MP-AF-RAW-01 (#263, P1 of PR #283): the API-FOOTBALL raw answers. RED reproduction first.
import test from 'node:test';
import assert from 'node:assert/strict';
import { apiFootballConfig, createApiFootballClient, createMemoryLedger } from '../src/providers/apifootball/client.mjs';
import { createPrematchCollector, prematchCollectorConfig } from '../src/providers/apifootball/prematch-collector.mjs';

const T0 = Date.UTC(2026, 10, 2, 9, 0, 0);
const H = 3600000;
const clientEnv = {APIFOOTBALL_ENABLED: 'true', APIFOOTBALL_KEY: 'test-key-not-real-0123456789', APIFOOTBALL_REQUESTS_PER_DAY: '100', APIFOOTBALL_REQUESTS_PER_MINUTE: '30'};
const collectorEnv = {APIFOOTBALL_PREMATCH_COLLECTOR_ENABLED: 'true', APIFOOTBALL_PREMATCH_LEAGUES: '135:2026', APIFOOTBALL_PREMATCH_CALLS_PER_DAY: '20',
  APIFOOTBALL_PREMATCH_CALLS_PER_MINUTE: '10', APIFOOTBALL_PREMATCH_MAX_CALLS_PER_RUN: '10', APIFOOTBALL_PREMATCH_LEAD_HOURS: '24', APIFOOTBALL_PREMATCH_MIN_INTERVAL_MINUTES: '60'};
const KO = T0 + 3 * H;
const fixturesText = JSON.stringify({get: 'fixtures', parameters: {league: '135', season: '2026'}, errors: [], results: 1, paging: {current: 1, total: 1},
  response: [{fixture: {id: 1, timestamp: KO / 1000, date: new Date(KO).toISOString(), status: {short: 'NS'}}, league: {id: 135}}]});
const oddsText = '{"get":"odds","parameters":{"fixture":"1"},"errors":[],"results":1,"paging":{"current":1,"total":1},"future_field":{"x":1},"response":[{"fixture":{"id":1,"timestamp":'
  + KO / 1000 + '},"update":"2026-11-02T08:50:00+00:00","bookmakers":[{"id":8,"name":"Bet365","bets":[{"id":1,"name":"Match Winner","values":[{"value":"Home","odd":"2.10"},{"value":"Draw","odd":"3.40"},{"value":"Away","odd":"3.50"}]}]}]}]}';

test('MP-AF-RAW-01 RED: the raw store receives the whole provider envelope and snapshots reference it', async () => {
  let clock = T0;
  const ledger = createMemoryLedger();
  const fetchImpl = async url => {
    const text = new URL(url).pathname === '/odds' ? oddsText : fixturesText;
    clock += 50;
    return {status: 200, headers: new Headers({'content-type': 'application/json', date: 'Mon, 02 Nov 2026 09:00:00 GMT'}),
      text: async () => text, json: async () => JSON.parse(text), arrayBuffer: async () => new TextEncoder().encode(text).buffer};
  };
  const client = createApiFootballClient({config: apiFootballConfig(clientEnv), ledger, fetchImpl, now: () => clock, sleep: async () => {}});
  const raws = [];
  const saved = [];
  const collector = createPrematchCollector({config: prematchCollectorConfig(collectorEnv), client, ledger, now: () => clock,
    saveRawResponse: async result => { raws.push(result); return {raw_id: 77}; },
    openConnection: async () => ({release() {}}), saveSnapshots: async (_c, rows) => { saved.push(...rows); return {inserted: rows.length, skipped: 0}; }});
  await collector.runOnce();
  assert.equal(raws.length, 1);
  const raw = raws[0].raw;
  assert.ok(raw, 'the client result carries the raw answer');
  assert.equal(Buffer.from(raw.body).toString('utf8'), oddsText, 'the exact provider bytes: get, parameters, errors and unknown fields included');
  assert.ok(saved.length > 0 && saved.every(r => r.raw_id === 77), 'every snapshot references its raw answer');
});
