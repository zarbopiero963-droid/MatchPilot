# QA-V-VISUAL-BASELINES: essential evidence

QA-V under MP-OWNER-QA-VISUAL-EXECUTION-01 and MP-OWNER-AUTONOMOUS-UI-ROADMAP-01: versioned visual baselines of the approved views. Procedure: [docs/qa/visual.md](../../qa/visual.md).

- **Baselines:**
  - 8 views on desktop, tablet and mobile, 24 images in `test/visual/baselines/`, with the SHA-256 manifest `test/visual/manifest.json` and the log `docs/qa/visual-baselines.md`;
  - made with Chromium 141 on 3bf69f4.
- **Reproducible captures:**
  - same data (QA archive), fixed clock, Europe/Rome, fonts of the site, no motion;
  - of each API answer only `meta.generated_at` and `meta.code_version` are fixed;
  - two runs give byte-identical images.
- **Measurement in CI** (`ci-pixel-measure-9cde8d2-run39380642895/`): pixel by pixel, Chrome 155 in CI differs from Chromium 141 on every glyph edge, 0.6–6.2% of the pixels in every scene. `diffs/oggi-desktop.png` shows it: every glyph is red, while the layout is unchanged.
- **Thresholds:** the comparison is by 8×8 blocks. The largest block delta in CI is 26, and the thresholds are block 8, pixel 32, ratio 0. CI then passes 24/24 (`ci-visual-8c761ba-run39381265101/`, Chrome 155.0.8059.84).
- **Sensitivity** (`sensitivity/`, same browser, final thresholds; uncommitted trees, demonstrations):
  - fail: rows 1 px taller (`pad2px`, diff in `diffs/`), bold team names (`weight`), xG removed (`noxg`, diff in `diffs/`), title 2 px smaller (`h1`);
  - pass: odds colour (`oddcolor`, block delta 20), accent shift (`accent`, 13), corner radius (`radius`, 17).
- **Protection:**
  - `verify`: manifest integrity;
  - `check-update` in Fast checks: a baseline change needs a log entry with an approval and the new SHA-256;
  - `promote` is the only writer;
  - unit tests in `test/visual-gate.test.mjs`.
- **GREEN** on 9dac79d: visual 24/24 and Browser QA 10/10, verifier ok.

**Complete package** (every capture, diff, screenshot and trace): [`evidence/audits` @ `a363809`](https://github.com/zarbopiero963-droid/MatchPilot/tree/a3638092f4178d6d253e5992e9fcd0ebc6c10765/QA-V-VISUAL-BASELINES), ZIP SHA-256 `773656c46e02bce033037664f4996063c88ea2272079efc9593b215e1232f5a1`. Read back from a fresh clone: manifest and ZIP checksum OK.
