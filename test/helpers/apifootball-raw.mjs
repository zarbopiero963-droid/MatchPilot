// MP-AF-RAW-01 test helper: with migration 033 every new odds snapshot names its raw answer (af_raw_responses). Tests
// that build snapshot rows by hand (not through the client) get here, for each fixture and acquisition instant, a ledger
// row and a raw answer received at that instant, and the rows carry their request_id and raw_id. The raw body is a
// synthetic envelope: the link, not the body, is what those tests exercise.
import { createHash } from 'node:crypto';
import { paramsHash } from '../../src/providers/apifootball/client.mjs';
import { createPgRequestLedger, saveRawResponse } from '../../src/providers/apifootball/store.mjs';

export async function linkedRows(db, rows) {
  const ledger = createPgRequestLedger(db);
  const links = new Map();
  const out = [];
  for (const row of rows) {
    const key = `${row.fixture_id}|${Date.parse(row.acquired_at)}`;
    if (!links.has(key)) {
      const at = Date.parse(row.acquired_at);
      const path = `/odds?fixture=${row.fixture_id}`;
      const request = {endpoint: '/odds', family: 'odds', path, params_hash: paramsHash(path), purpose: 'test-raw-link'};
      const requestId = await ledger.insert({...request, at_ms: at - 50, attempt: 1, outcome: 'ok', status: 200, latency_ms: 50, quota: null});
      const body = Buffer.from(JSON.stringify({get: 'odds', parameters: {fixture: String(row.fixture_id)}, errors: [], results: 0, paging: {current: 1, total: 1}, response: []}));
      const {raw_id: rawId} = await saveRawResponse(db, {...request, request_id: requestId, params: {fixture: String(row.fixture_id)},
        requested_at: new Date(at - 50).toISOString(), received_at: new Date(at).toISOString(), http_status: 200, outcome: 'ok',
        body, body_exact: true, body_bytes: body.length, body_sha256: createHash('sha256').update(body).digest('hex')});
      links.set(key, {request_id: requestId, raw_id: rawId});
    }
    out.push({...row, ...links.get(key)});
  }
  return out;
}
