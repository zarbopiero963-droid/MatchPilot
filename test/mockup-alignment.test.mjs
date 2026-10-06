// Gate statico del mock UX vivo (#97): roadmap, ownership #96/#99, persistenza dichiarata, REAL/DEMO, versione e changelog.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
const MOCK = 'docs/mockups/matchpilot-trading-os.html';
const html = read(MOCK);
const changelog = read('docs/mockups/README.md');
const script = (() => { const i = html.indexOf('<script>\n(() => {'), j = html.lastIndexOf('</script>'); assert.ok(i > 0 && j > i, 'script principale non trovato'); return html.slice(i + '<script>'.length, j); })();

test('mock: lo script principale è JavaScript valido', () => {
  assert.doesNotThrow(() => new vm.Script(script, { filename: MOCK }));
});

test('mock: lo SHA-256 nel changelog corrisponde al file', () => {
  const sha = createHash('sha256').update(readFileSync(new URL(MOCK, root))).digest('hex');
  assert.match(changelog, new RegExp('SHA-256: `' + sha + '`'), `aggiorna docs/mockups/README.md con lo SHA-256 ${sha}`);
});

test('mock: versione e allineamento a #97 dichiarati', () => {
  assert.match(html, /Mock UX v\d{4}\.\d{2}\.\d{2}/);
  assert.match(html, /Aligned with roadmap #97/);
  assert.match(html, /Includes #94 #95 #96 #98 #99 #100 #102/);
});

test('mock: la roadmap contiene #97, #98, #99, #100, #102 e le fasi 0–16', () => {
  const i = script.indexOf('const RM_ISS = {'), j = script.indexOf('const RM_PHASES');
  assert.ok(i > 0 && j > i, 'RM_ISS non trovato');
  const iss = script.slice(i, j);
  for (const n of [97, 98, 99, 100, 102, 12, 20, 23, 24, 25, 27, 28, 29, 30, 31, 32, 34, 44, 45, 46, 94, 95, 96]) assert.match(iss, new RegExp(`\\b${n}: \\[`), `manca la issue #${n}`);
  const k = script.indexOf('VIEWS.roadmap');
  const phases = script.slice(j, k);
  for (let n = 0; n <= 16; n++) assert.match(phases, new RegExp(`\\[${n}, '`), `manca la fase ${n}`);
  assert.match(phases, /\[6, 'Market Rules', \[100\]\]/);
  assert.match(phases, /\[7, 'Position \/ Settlement \/ Ledger', \[99\]\]/);
  assert.match(phases, /\[11, 'Certificazione integrata pre-UI', \[98\]\]/);
});

test('mock: la vecchia roadmap è stata rimossa', () => {
  assert.doesNotMatch(html, /dalla master #3/);
  assert.doesNotMatch(html, /'#12 FutPythonTrader ✓', '#20 TotalCorner'/);
  assert.doesNotMatch(html, /const ISS = \[/);
  assert.doesNotMatch(html, /'MAPPED'/, 'il registry MM usa il ciclo #97, non MAPPED');
});

test('mock: ledger, settlement, posizioni, esposizione e bankroll appartengono a #99', () => {
  const tags = [...html.matchAll(/data-issue="([^"]*)"/g)].map(m => m[1]);
  assert.ok(tags.length > 50);
  const wrong = tags.filter(t => !/#99/.test(t) && /ledger|settlement|posizion|contabil|accounting|netting|lifecycle|bankroll|esposizion/i.test(t) && !/\$\{/.test(t) && !/^#31 /.test(t)); // i ledger #31 sono ledger dei dati, non contabili
  assert.deepEqual(wrong, [], 'tag da spostare su #99: ' + wrong.join(' | '));
  assert.doesNotMatch(html, /Profili, bankroll, settlement, registro/);
});

test('mock: nessuna promessa di persistenza account-level nel prototipo', () => {
  assert.doesNotMatch(html, /non nel browser/);
  assert.doesNotMatch(html, /Salvat[oe] sul tuo account/);
  assert.match(html, /PROTOTIPO — persistenza account simulata localmente/);
});

test('mock: REAL e DEMO dichiarati', () => {
  assert.match(html, /DEMO \/ MOCK — risultati non certificati/);
  assert.match(html, /DEMO REPLAY/);
  assert.doesNotMatch(html, /TotalCorner · raccolto live/);
  assert.match(html, /Il backend certificato userà Decimal\/fixed precision\. Il mock usa Number esclusivamente per visualizzazione\./);
  assert.match(html, /function demoStrip\(/);
});

test('mock: #99, #100, #102, STOP/RESUME e Replay + MM presenti', () => {
  for (const s of ['STOP OPERATIONS', 'RESUME OPERATIONS', 'ADVISORY ONLY — operazione non registrata', 'ACTIVE_OPERATIONAL', 'PAUSED', 'ARCHIVED',
    'Trading Copilot', 'LIQUIDITY_UNAVAILABLE', 'Nessuno — solo replay', 'Reset simulazione', 'replay_simulation_id', 'Regole di mercato · #100', 'Conto e posizioni · #99',
    'Previsto — accounting #99 non ancora implementato', 'Assistente globale · #44']) assert.ok(html.includes(s), 'manca: ' + s);
  for (const s of ['HOLD', 'PARTIAL_HEDGE', 'FULL_HEDGE', 'CASHOUT', 'EXIT', 'STOP', 'NO_ACTION', 'WATCHING', 'NEAR_MATCH', 'ARMED', 'BLOCKED', 'INVALIDATED', 'EXPIRED', 'NO_TRADE']) assert.ok(script.includes(`'${s}'`), 'manca lo stato ' + s);
});

test('docs: README, CLAUDE e AGENTS citano #97, il mock vivo e la regola SÌ / NO', () => {
  for (const f of ['README.md', 'CLAUDE.md', 'AGENTS.md']) {
    const t = read(f);
    assert.match(t, /#97/, f);
    assert.match(t, /docs\/mockups\//, f);
    assert.match(t, /aggiornamento del mock MatchPilot\? SÌ \/ NO/, f);
  }
  const map = read('docs/integration-map.md');
  for (const n of [12, 20, 23, 24, 25, 27, 28, 29, 30, 31, 32, 34, 44, 45, 46, 94, 95, 96, 97, 98, 99, 100, 102]) assert.match(map, new RegExp(`#${n}\\b`), `integration map senza #${n}`);
});
