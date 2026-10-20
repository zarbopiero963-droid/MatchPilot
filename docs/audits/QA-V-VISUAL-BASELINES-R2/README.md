# QA-V-VISUAL-BASELINES-R2: essential evidence

QA-V after the independent review D2 of PR #174, which requested changes on 99cec9a. First package: [QA-V-VISUAL-BASELINES](../QA-V-VISUAL-BASELINES/README.md).

- **Review fixes (5ca90e2):**
  - F1: the manifest must list exactly the scenes × viewports of the code;
  - N1: the Thresholds line must state the manifest's values;
  - N2: the log only grows;
  - N7, N8: tests, and a refusal instead of a crash;
  - N4, N5: documented limits corrected.
- **Baselines regenerated (dce4e30), from a run on 5ca90e2:** the browser now runs with an Italian environment, so the native date field reads 01/08/2024 (N6). This replaces the baselines of the first package, made on 3bf69f4 with the field in US order. The log `docs/qa/visual-baselines.md` has a single entry, because it never reached `main` before this PR.
- **RED:** `test/visual-gate.test.mjs` of dce4e30 against the code of 99cec9a fails 2 of 7 tests (manifest, check-update).
- **GREEN:**
  - local on dce4e30 (`green-visual-dce4e30/`, `green-browser-qa-dce4e30/`): visual 24/24, Browser QA 10/10, verifier ok;
  - CI (`ci-visual-dce4e30-run39384100762/`): visual 24/24 with Chrome 155.0.8059.39, largest block delta 26.1, and the Italian date field honoured by the CI browser.

**Complete package:** [`evidence/audits` @ `c4c8e1b`](https://github.com/zarbopiero963-droid/MatchPilot/tree/c4c8e1bdac0755cbeebb3692e1a394fe1fe7fe58/QA-V-VISUAL-BASELINES-R2), ZIP SHA-256 `824d6e31d41619010751e4a67b6342a2e81e33a751f762b1ca9af582d2b35ab0`. Read back from a fresh clone: manifest and ZIP checksum OK.
