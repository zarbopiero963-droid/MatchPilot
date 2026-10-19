# V-B2b-PROVIDER-LABELS: essential evidence

V-B2b under MP-OWNER-AUTONOMOUS-UI-ROADMAP-01 and MP-WEB-015 (inventory UI-60).

- **Fornitori dati, a technical view:** every key of the provider tree reads in Italian, for example «Fase 2 · classificazione» and «Non pubblicati (404)».
  - The raw key stays in `data-key` and the tooltip.
  - A key without a label reads as words and is marked, which fails the providers journey.
- **Review notes of PR #170:**
  - a failed answer of the update route is not cached: the next day viewed asks again (R2-NB-1);
  - the last sync run takes the full width of its tile, so its date never breaks inside a number (R2-NB-3);
  - the link of the empty day and the last sync run row are now checked.
- **RED → GREEN:**
  - RED, `red-main-web/`: 4 of 10 journeys fail on `src/web` of `main`. Providers fails because `main` marks no key (no `data-key`, so the journey finds none to check). The daily board fails because a failed update answer is kept and the line never comes back. The tree was uncommitted, so this is a demonstration, not gate evidence.
  - GREEN, `green-28ad1ae/`: 10/10, clean tree, verifier ok.
- **Before/after,** `comparisons/`: Fornitori on desktop and mobile, plus the last sync run tile after the change. «Before» is the Browser QA of the post-merge verification of PR #170 on `main` cd83d02.

**Complete package** (every screenshot and trace of the three runs): [`evidence/audits` @ `fa6405d`](https://github.com/zarbopiero963-droid/MatchPilot/tree/fa6405d9e7486fc65d4811350039c68ba58324a6/V-B2b-PROVIDER-LABELS), ZIP SHA-256 `045905e9eb8f176315b2aadaf81526451b17ecfce416779110ff16e297b39def`. Read back from a fresh clone: manifest and ZIP checksum OK.
