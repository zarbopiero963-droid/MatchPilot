// QA-V: the visual gate's own rules, without a browser. The PNG codec, the comparison thresholds, the manifest that
// refuses changed, missing or extra baselines, `promote` as the only way to change them, and the CI check that refuses a
// baseline change not declared in the log.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {comparePng, decodePng, encodePng} from '../tools/qa/png.mjs';
import {BASELINES, LOG, MANIFEST, checkUpdate, normalizeMeta, promote, readManifest, verifyBaselines} from '../tools/qa/visual.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const image = (width, height, paint) => {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set([...paint(x, y), 255], (y * width + x) * 4);
  return {width, height, data};
};
const flat = (width, height, colour) => image(width, height, () => colour);
const git = (dir, ...args) => execFileSync('git', args, {cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();

test('PNG codec: what it encodes decodes to the same pixels; a committed baseline decodes to its viewport size', () => {
  const picture = image(7, 5, (x, y) => [x * 30, y * 50, (x + y) * 10]);
  const back = decodePng(encodePng(picture));
  assert.equal(back.width, 7);
  assert.equal(back.height, 5);
  assert.deepEqual(back.data, picture.data);
  const baseline = decodePng(readFileSync(join(root, BASELINES, 'oggi-mobile.png')));
  assert.deepEqual([baseline.width, baseline.height], [390, 844]);
  assert.throws(() => decodePng(Buffer.from('not a png')), /not a PNG/);
});

test('comparison: identical passes, a change over the threshold fails with its share, a size change fails', () => {
  const thresholds = {pixel: 24, ratio: 0.001};
  const base = flat(100, 100, [10, 15, 23]);
  assert.equal(comparePng(base, flat(100, 100, [10, 15, 23]), thresholds).match, true);
  // A colour drift under the pixel threshold (antialiasing) is not a difference.
  assert.equal(comparePng(base, flat(100, 100, [30, 35, 43]), thresholds).differing, 0);
  // 10 changed pixels out of 10 000 = 0.1 %: at the threshold, still a match; 11 are over it.
  const changed = n => image(100, 100, (x, y) => (y * 100 + x < n ? [255, 181, 71] : [10, 15, 23]));
  assert.equal(comparePng(base, changed(10), thresholds).match, true);
  const over = comparePng(base, changed(11), thresholds);
  assert.equal(over.match, false);
  assert.equal(over.differing, 11);
  assert.match(over.reason, /11 differing pixels/);
  assert.deepEqual([...over.diff.data.subarray(0, 4)], [255, 0, 0, 255], 'a differing pixel is red in the diff');
  const resized = comparePng(base, flat(100, 99, [10, 15, 23]), thresholds);
  assert.equal(resized.match, false);
  assert.match(resized.reason, /size 100×99 instead of 100×100/);
});

test('API metadata: only the time of the answer and the code version are fixed, the data are untouched', () => {
  const body = {data: {rows: [{odd_home: '1.450'}]}, meta: {generated_at: '2026-10-20T06:31:12.000Z', code_version: 'abc1234', source: 'futpython'}};
  normalizeMeta(body);
  assert.deepEqual(body, {data: {rows: [{odd_home: '1.450'}]}, meta: {generated_at: '2026-10-20T08:00:00.000Z', code_version: '0000000', source: 'futpython'}});
  assert.deepEqual(normalizeMeta({data: 1}), {data: 1});
});

test('manifest: the committed baselines match it; a changed, missing or extra file and a loose threshold are refused', t => {
  assert.deepEqual(verifyBaselines().errors, []);
  const dir = mkdtempSync(join(tmpdir(), 'mp-visual-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  cpSync(join(root, 'test/visual'), join(dir, 'test/visual'), {recursive: true});
  const file = join(dir, BASELINES, 'oggi-desktop.png');
  const original = readFileSync(file);
  writeFileSync(file, encodePng(flat(4, 4, [0, 0, 0])));
  assert.match(verifyBaselines(dir).errors.join('\n'), /oggi-desktop\.png: SHA-256 differs/);
  rmSync(file);
  assert.match(verifyBaselines(dir).errors.join('\n'), /oggi-desktop\.png: listed but missing/);
  writeFileSync(file, original);
  writeFileSync(join(dir, BASELINES, 'extra.png'), original);
  assert.match(verifyBaselines(dir).errors.join('\n'), /extra\.png: not in the manifest/);
  rmSync(join(dir, BASELINES, 'extra.png'));
  const manifest = readManifest(dir);
  writeFileSync(join(dir, MANIFEST), JSON.stringify({...manifest, thresholds: {pixel: 24, ratio: 0.5}}));
  assert.match(verifyBaselines(dir).errors.join('\n'), /thresholds\.ratio/);
  const {[`oggi-desktop.png`]: _, ...rest} = manifest.files;
  writeFileSync(join(dir, MANIFEST), JSON.stringify({...manifest, files: rest}));
  assert.match(verifyBaselines(dir).errors.join('\n'), /oggi-desktop\.png: not in the manifest[\s\S]*oggi-desktop\.png: no baseline/);
});

// A small repository with the layout of this one: baselines, manifest and log.
function repository(t) {
  const dir = mkdtempSync(join(tmpdir(), 'mp-visual-repo-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'qa@example.invalid');
  git(dir, 'config', 'user.name', 'QA');
  mkdirSync(join(dir, BASELINES), {recursive: true});
  mkdirSync(join(dir, 'docs/qa'), {recursive: true});
  writeFileSync(join(dir, LOG), '# log\n');
  const run = join(dir, '.run');
  mkdirSync(join(run, 'captures'), {recursive: true});
  return {dir, run};
}
function visualRun(run, pictures, clean = true) {
  const results = Object.entries(pictures).map(([name, picture]) => {
    const buffer = encodePng(picture);
    writeFileSync(join(run, 'captures', `${name}.png`), buffer);
    const [scene, viewport] = [name.slice(0, name.lastIndexOf('-')), name.slice(name.lastIndexOf('-') + 1)];
    return {scene, viewport, capture: `captures/${name}.png`,
      capture_sha256: execFileSync('sha256sum', [join(run, 'captures', `${name}.png`)], {encoding: 'utf8'}).split(' ')[0]};
  });
  writeFileSync(join(run, 'report.json'), JSON.stringify({schema: 'mp-visual-v1', working_tree_clean: clean, tested_commit: 'f'.repeat(40),
    browser: 'chromium test', generated_at: '2026-10-20T10:00:00.000Z', fixed_time: 'x', results}));
}

test('promote: needs a reason and an approval, refuses a run on a modified tree, writes manifest and log', t => {
  const {dir, run} = repository(t);
  visualRun(run, {'oggi-desktop': flat(3, 3, [1, 2, 3])});
  assert.throws(() => promote({run, reason: '', approval: 'PR #1', thresholds: {pixel: 24, ratio: 0.001}, dir}), /needs --reason and --approval/);
  assert.throws(() => promote({run, reason: 'x', approval: ' ', thresholds: {pixel: 24, ratio: 0.001}, dir}), /needs --reason and --approval/);
  const dirty = join(dir, '.dirty');
  mkdirSync(join(dirty, 'captures'), {recursive: true});
  visualRun(dirty, {'oggi-desktop': flat(3, 3, [1, 2, 3])}, false);
  assert.throws(() => promote({run: dirty, reason: 'x', approval: 'PR #1', dir}), /modified tree/);
  const {changed} = promote({run, reason: 'first', approval: 'PR #1', thresholds: {pixel: 24, ratio: 0.001}, dir});
  assert.deepEqual(changed, ['oggi-desktop.png']);
  const manifest = readManifest(dir);
  assert.deepEqual(manifest.thresholds, {pixel: 24, ratio: 0.001});
  assert.equal(manifest.generated.approval, 'PR #1');
  const log = readFileSync(join(dir, LOG), 'utf8');
  assert.match(log, /- Approval: PR #1/);
  assert.ok(log.includes(`\`oggi-desktop.png\` \`${manifest.files['oggi-desktop.png']}\``));
});

test('check-update: a baseline change without its log entry, its SHA-256 or an approval is refused; a declared one passes', t => {
  const {dir, run} = repository(t);
  visualRun(run, {'oggi-desktop': flat(3, 3, [1, 2, 3])});
  promote({run, reason: 'first', approval: 'PR #1', thresholds: {pixel: 24, ratio: 0.001}, dir});
  git(dir, 'add', BASELINES, MANIFEST, LOG);
  git(dir, 'commit', '-q', '-m', 'base');
  const base = git(dir, 'rev-parse', 'HEAD');
  assert.deepEqual(checkUpdate({base, head: base, dir}), {ok: true, touched: [], errors: []}, 'no baseline change, nothing to declare');

  // Silent update: a new picture and a manifest that matches it, with no log entry.
  git(dir, 'checkout', '-q', '-b', 'silent');
  const picture = encodePng(flat(3, 3, [200, 2, 3]));
  writeFileSync(join(dir, BASELINES, 'oggi-desktop.png'), picture);
  const manifest = readManifest(dir);
  const hash = execFileSync('sha256sum', [join(dir, BASELINES, 'oggi-desktop.png')], {encoding: 'utf8'}).split(' ')[0];
  writeFileSync(join(dir, MANIFEST), JSON.stringify({...manifest, files: {'oggi-desktop.png': hash}}, null, 2));
  git(dir, 'commit', '-q', '-am', 'silent update');
  const silent = checkUpdate({base, head: git(dir, 'rev-parse', 'HEAD'), dir});
  assert.equal(silent.ok, false);
  assert.match(silent.errors.join('\n'), /without an entry/);

  // A log line without the new SHA-256 or without an approval is not enough.
  writeFileSync(join(dir, LOG), readFileSync(join(dir, LOG), 'utf8') + '\n## change\n\n- Baselines: oggi-desktop.png\n');
  git(dir, 'commit', '-q', '-am', 'vague entry');
  const vague = checkUpdate({base, head: git(dir, 'rev-parse', 'HEAD'), dir});
  assert.match(vague.errors.join('\n'), /no approval reference/);
  assert.match(vague.errors.join('\n'), /oggi-desktop\.png: its new SHA-256 is not in the new entry/);

  // A looser threshold must be declared too.
  git(dir, 'checkout', '-q', '-b', 'declared', base);
  const next = join(dir, '.next');
  mkdirSync(join(next, 'captures'), {recursive: true});
  visualRun(next, {'oggi-desktop': flat(3, 3, [200, 2, 3])});
  promote({run: next, reason: 'new layout', approval: 'PR #2', thresholds: {pixel: 30, ratio: 0.002}, dir});
  git(dir, 'add', BASELINES, MANIFEST, LOG);
  git(dir, 'commit', '-q', '-m', 'declared update');
  assert.deepEqual(checkUpdate({base, head: git(dir, 'rev-parse', 'HEAD'), dir}).errors, []);
  assert.equal(checkUpdate({base: '', head: 'HEAD', dir}).ok, false, 'missing SHAs are refused, never skipped');
});
