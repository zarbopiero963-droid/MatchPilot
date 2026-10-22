import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildMessage, OUTBOX_STATUS, OUTBOX_CHANNEL} from '../src/signals/outbox.mjs';

const row = {home_name: 'A', away_name: 'B', match_date: '2026-09-19', rule_version: 'mp-sim-over25-v1', avg_over25_rate: '0.6500',
  home_n: 10, away_n: 10, odd: '1.910', outcome: 'MISS', final_score: '0-0'};

test('the simulated message is labelled as not sent and carries the stored facts', () => {
  const text = buildMessage(row);
  assert.match(text, /^\[SIMULAZIONE — NON INVIATO\]/);
  assert.match(text, /A – B · 2026-09-19/);
  assert.match(text, /65\.0% \(N 10\/10\)/);
  assert.match(text, /Quota archiviata: 1\.910/);
  assert.match(text, /Esito storico: 0-0 · perso/);
  assert.match(text, /Nessuna scommessa, nessun invio reale\./);
});
test('pending signals show no outcome; missing values are N/D', () => {
  const text = buildMessage({...row, outcome: 'PENDING', final_score: null, odd: null, avg_over25_rate: null});
  assert.doesNotMatch(text, /Esito storico/);
  assert.match(text, /Quota archiviata: N\/D/);
  assert.match(text, /ultime 10: N\/D/);
});
test('the outbox has no delivery path: fixed status and channel, no network or Telegram code', () => {
  assert.equal(OUTBOX_STATUS, 'SIMULATED_NOT_SENT');
  assert.equal(OUTBOX_CHANNEL, 'telegram-simulated');
  for (const file of ['src/signals/outbox.mjs', 'src/signals/simulated.mjs', 'src/jobs/sim-signals.mjs']) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /fetch\(|node:https?|node:net|alerts\.mjs|api\.telegram|TELEGRAM_/, file);
  }
});
