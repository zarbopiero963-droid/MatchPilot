# V-A-AUDIT-A1-A2-FIX: essential evidence

Fix of the visual audit bugs A-1 and A-2 (MP-OWNER-QA-VISUAL-EXECUTION-01), with browser regression tests.

- **A-1, mobile search:** after a search submitted from the form, the outcome gets the focus and is scrolled into view. The outcome is the "Risultati" heading, or the empty, not-found, choice, invalid or error state. This also holds when the same search is submitted again.
- **A-2, deep provider values:** nested values stack under their label instead of halving the width at every level. Paths in tables no longer break every few characters: the same squeeze was found on the mobile API page.
- **Regression tests:**
  - the search journey asserts focus and visibility on desktop and mobile;
  - a new Browser QA invariant fails any page with squeezed text (12+ characters at fewer than 6 per line).
- **RED → GREEN:**
  - RED, `red-without-src-web-fix/`: 6 journeys fail without the `src/web` changes.
  - GREEN, `green-4426197/`: 10/10 on commit `4426197`, clean tree, verifier ok.
  - The RED run's tree was uncommitted, so it is a demonstration, not gate evidence.

Also here (QA-03 review round 2, NB-2): `qa03-r2-prompts/`, the verbatim prompts of the two blind reviewers of QA-03 run 2, extracted from the session transcript.

**Complete package** (every screenshot and trace of both runs): [`evidence/audits` @ `df133c4`](https://github.com/zarbopiero963-droid/MatchPilot/tree/df133c4fe67a6f6bd15087996d12f52a6f8ea7fc/V-A-AUDIT-A1-A2-FIX), ZIP SHA-256 `ca75ef19505953cb376d639afd60fdd9e3702304e0b0ec9802d49738d385fdbf`. Read back from a fresh clone: manifests and ZIP checksums OK.
