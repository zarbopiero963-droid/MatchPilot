# V-B2a-HOME-NAV-DATI: essential evidence

V-B2a under MP-OWNER-AUTONOMOUS-UI-ROADMAP-01, D-2 and MP-WEB-015.

- **Home page:** «Oggi», the Daily Board. The former address `#/board` still opens it.
- **Menu:** «Oggi · Ricerca · Dati», as in the approved mockup. On a phone it is a bottom bar with icons.
- **Technical area «Dati»:** its tabs open:
  - Stato dei dati, the former Dashboard, cleaned per the inventory;
  - Fornitori;
  - API;
  - Copertura.
- **Areas:** every view declares one, and the technical-text invariant also covers the header.
- **Update time:** Oggi shows «Dati aggiornati: …» only from a completed sync run with a real time. The QA archive has none, so the four states are checked with the answer changed in the browser.
- **RED → GREEN:**
  - RED, `red-main-web/`: the new tests on `src/web` of `main`. 8 of 10 journeys fail: there is no home page Oggi and no area Dati with tabs. The tree was uncommitted, so this is a demonstration, not gate evidence.
  - GREEN, `green-58f5ebd/`: 10/10 on commit `58f5ebd`, clean tree, verifier ok.
- **Before/after,** `comparisons/`: the opening page and the data view, on desktop and mobile. «Before» is the Browser QA of the post-merge verification of PR #169 on `main` 1a0d1b3.

**Complete package** (every screenshot and trace of the three runs): [`evidence/audits` @ `4ee5907`](https://github.com/zarbopiero963-droid/MatchPilot/tree/4ee5907b445207ce746ae4acf567c586ab3a8b38/V-B2a-HOME-NAV-DATI), ZIP SHA-256 `97985f74cd185e321f79f0cd3e3a8e331945b408885201d89430a069cf026322`. Read back from a fresh clone: manifest and ZIP checksum OK.
