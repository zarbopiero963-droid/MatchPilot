# Visual baselines: log of changes (QA-V)

Every change to `test/visual/baselines/`, to `test/visual/manifest.json` or to its thresholds has an entry here, written by
`node tools/qa/visual.mjs promote` and never by a check. Each entry names the reason, the approval (a PR or issue), the
run the captures come from, the thresholds and every changed baseline with its new SHA-256. CI refuses a change to the
baselines without such an entry (`node tools/qa/visual.mjs check-update`). Rules: [visual.md](visual.md).
