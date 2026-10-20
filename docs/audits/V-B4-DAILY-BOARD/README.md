# V-B4-DAILY-BOARD: essential evidence

V-B4 under MP-OWNER-AUTONOMOUS-UI-ROADMAP-01: the Daily Board and the results of the search in the layout of the approved mockup.

- **Compact rows** (UI-14): one row per match with kickoff, teams one above the other with the competition, score, then the markets (1 X 2, Over 2,5, Gol) with favourite and xG. On a desktop the markets sit on the row; on a phone they go under the teams, never hidden as in the mockup, so no value is lost.
- **Day strip** (UI-22): the chosen day and the three before and after it, «Oggi» only for today; calendar navigation only.
- **No grouping by competition** (D-4): the API returns kickoff order across competitions and has no grouping, so each row names its competition.
- **Search on a phone** (UI-44): each result reads as a small card, every value after its column title.
- **No browser calculation:** every value is the API's, formatted as before.
- **Review note of PR #172 (R2-NB-1):** the identity check now requires each font weight to be served by its own face.
- **RED → GREEN:**
  - RED (uncommitted trees, demonstrations, not gate evidence):
    - `red-main-web/`: the new journeys with the web code of `main`. Daily-board and search fail on desktop and mobile.
    - `red-main-css/`: the new app.js with the CSS of `main`. Daily-board desktop fails (teams and markets not on one line); search mobile fails (titles not beside the values).
    - `red-font-700/`: the change without the Barlow Condensed 700 rule. General-navigation fails on desktop and mobile.
  - GREEN, `green-fe8eba2/`: 10/10, clean tree, verifier ok.
- **Before/after,** `comparisons/`: Oggi on desktop and mobile, Oggi on a phone with the non-final states, search results on desktop and mobile. «Before» is the Browser QA of the post-merge verification of PR #172 on `main` f36cc46.

**Complete package** (every screenshot and trace of the five runs): [`evidence/audits` @ `a9feb5f`](https://github.com/zarbopiero963-droid/MatchPilot/tree/a9feb5f2a5b70adb759b61714056ec2c3c31e661/V-B4-DAILY-BOARD), ZIP SHA-256 `7204d1753e5d7de2049e14d68739c4e36933d9323ca19ccf982843095664351a`. Read back from a fresh clone: manifest and ZIP checksum OK.
