#!/usr/bin/env node
// MP-UI-PR-005 (MP-UI-AUTONOMOUS-CONTINUATION-01 §8): targeted mutation testing of the Trading Tools. Each mutant
// alters one formula or rule of src/math/trading.mjs or src/api/tools.mjs the way a plausible defect would; the tests of
// the feature must fail on every one of them (killed). A surviving mutant is a gap in the tests. The file is restored
// after each run, also on failure. Local and on demand (it runs the tests once per mutant): node tools/qa/mutation-trading.mjs
import {spawnSync} from 'node:child_process';
import {readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const TESTS = ['test/math-trading.test.mjs', 'test/tools-api.test.mjs'];
const MATH = 'src/math/trading.mjs', API = 'src/api/tools.mjs';
export const MUTANTS = [
  [MATH, 'Kelly without the division by b', 'const full = b.mul(P).sub(q).div(b);', 'const full = b.mul(P).sub(q);'],
  [MATH, 'Kelly fraction ignored', 'B.mul(full).mul(alpha) : ZERO', 'B.mul(full) : ZERO'],
  [MATH, 'Kelly cap takes the largest limit', 'cap[1].lt(low[1]) ? cap : low', 'cap[1].gt(low[1]) ? cap : low'],
  [MATH, 'Kelly stake rounded up', 'stake.roundToStep(CENT, ROUNDING.DOWN)', 'stake.roundToStep(CENT, ROUNDING.CEIL)'],
  [MATH, 'EV without commission', 'const win = S.mul(O.sub(1)).mul(ONE.sub(c));', 'const win = S.mul(O.sub(1));'],
  [MATH, 'EV edge inverted', 'const edge = O.div(fair).sub(1);', 'const edge = fair.div(O).sub(1);'],
  [MATH, 'EV break-even without commission', 'ONE.div(O.sub(1).mul(ONE.sub(c)).add(1))', 'ONE.div(O)'],
  [MATH, 'Liability on the full odds', 'const liability = L.mul(O.sub(1));', 'const liability = L.mul(O);'],
  [MATH, 'Liability break-even without commission', 'ONE.sub(c).div(O.sub(c))', 'ONE.div(O)'],
  [MATH, 'Liability warning at equality', 'liability.gt(B)', 'liability.gte(B)'],
  [MATH, 'Hedge stake inverted', 'const theoretical = S.mul(O).div(X);', 'const theoretical = S.mul(X).div(O);'],
  [MATH, 'Commission charged on losses too', 'const net = (gross, c) => (gross.gt(0) ? gross.mul(ONE.sub(c)) : gross);', 'const net = (gross, c) => gross.mul(ONE.sub(c));'],
  [MATH, 'Hedge residual signed', 'residual_imbalance: after.win.sub(after.lose).abs()', 'residual_imbalance: after.win.sub(after.lose)'],
  [MATH, 'Hedge liability of a LAY hedge is its stake', "const hedgeLiability = side === 'BACK' ? H.mul(X.sub(1)) : H;", 'const hedgeLiability = H;'],
  [MATH, 'Dutching return multiplied by the book', 'const R = T.div(K);', 'const R = T.mul(K);'],
  [MATH, 'Dutching outcome against its own stake', 'net(s.mul(list[i]).sub(placed), c)', 'net(s.mul(list[i]).sub(s), c)'],
  [MATH, 'BTTS without the joint term', 'ONE.sub(ph[0]).sub(pa[0]).add(ph[0].mul(pa[0]))', 'ONE.sub(ph[0]).sub(pa[0])'],
  [MATH, 'Poisson draws counted as home wins', 'if (i > j) home = home.add(p);', 'if (i >= j) home = home.add(p);'],
  [MATH, 'Poisson pmf off by one', 'out.push(out[k - 1].mul(lambda).div(k));', 'out.push(out[k - 1].mul(lambda).div(k + 1));'],
  [MATH, 'Goal line one goal short', 'const under = sum(total.slice(0, n + 1));', 'const under = sum(total.slice(0, n));'],
  [API, 'Percent read as a fraction of ten', 'Decimal.from(decimalText(field, value)).div(HUNDRED).toString()', 'Decimal.from(decimalText(field, value)).div(10).toString()'],
  [API, 'Decimal comma dropped', "text.replace(',', '.')", "text.replace(',', '')"],
  [API, 'Money display rounded down', 'const money = text => Decimal.from(text).round(2, ROUNDING.HALF_EVEN).toString(2);', 'const money = text => Decimal.from(text).round(2, ROUNDING.DOWN).toString(2);'],
  [API, 'Hedge display shows the open position', 'after: {if_wins: money(r.after.if_wins), if_loses: money(r.after.if_loses)}', 'after: {if_wins: money(r.before.if_wins), if_loses: money(r.before.if_loses)}'],
  [API, 'Refusal of a tool turned into a server error', 'if (error instanceof ToolInputError || error instanceof MathInputError) throw new ApiError', 'if (false) throw new ApiError'],
];

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const results = [];
  for (const [file, name, from, to] of MUTANTS) {
    const path = join(root, file);
    const original = readFileSync(path, 'utf8');
    if (original.split(from).length !== 2) { results.push({name, result: 'INVALID (pattern not found once)'}); continue; }
    try {
      writeFileSync(path, original.replace(from, to));
      const run = spawnSync(process.execPath, ['--test', ...TESTS], {cwd: root, encoding: 'utf8', timeout: 300000});
      results.push({name, result: run.status === 0 ? 'SURVIVED' : 'KILLED'});
    } finally { writeFileSync(path, original); }
  }
  for (const r of results) console.log(`${r.result.padEnd(8)} ${r.name}`);
  const killed = results.filter(r => r.result === 'KILLED').length;
  console.log(`${killed}/${results.length} killed`);
  process.exit(killed === results.length ? 0 : 1);
}
