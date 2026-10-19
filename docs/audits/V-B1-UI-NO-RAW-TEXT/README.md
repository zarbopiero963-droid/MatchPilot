# V-B1-UI-NO-RAW-TEXT: essential evidence

V-B1 under the owner decision MP-OWNER-UI-NO-RAW-TEXT-01 (requirement MP-WEB-015): the user views show no technical text.

- **Rule and inventory.** The rule is in [docs/web.md](../../web.md). The global inventory of every text of the site, its class and the PR that handles it, is [docs/qa/ui-text-inventory.md](../../qa/ui-text-inventory.md).
- **Test.** After every journey step, desktop and mobile, the Browser QA gate fails a user view (`main[data-area="user"]`) or the footer that shows technical text: API codes and parameter names, dataset keys, API routes, raw ISO dates and instants, implementation words.
- **Changed in this PR:** Daily Board, Ricerca, the loading and error states, the footer.
  - **Removed:** the owner's examples, every lead text, the provenance lines and the raw dates.
  - **Kept off screen:** what is no longer printed stays on the page in `data-*` attributes and tooltips (`data-result`, `data-phase`, `data-dataset`, `data-tz`, `data-filters`, `data-code`). The journeys check that each one equals the API.
  - **Match card:** odds in labelled boxes; the state of a match without a final result replaces the score.
- **RED → GREEN:**
  - **RED,** `red-main-web-areas/`: the new tests on `src/web` of `main`, with only the view areas and the new footer (`red-main-web-areas.patch`). Daily Board and Ricerca fail on desktop and mobile on the owner's examples. Without the patch all 10 journeys fail on the old footer (archive only).
  - **GREEN,** `green-629be0d/`: 10/10 on commit `629be0d`, clean tree, verifier ok.
  - The RED trees were uncommitted, so they are demonstrations, not gate evidence.
- **Before/after,** `comparisons/`: crops of the top of the full-page screenshots, for the Daily Board cards, the search results and the validation error, on desktop and mobile. «Before» is the Browser QA run of the post-merge verification of PR #168 on `main` 3521a07.

**Complete package** (every screenshot and trace of the four runs): [`evidence/audits` @ `1129bab`](https://github.com/zarbopiero963-droid/MatchPilot/tree/1129bab6e2ca0fc743922282ba7bb11362d362c4/V-B1-UI-NO-RAW-TEXT), ZIP SHA-256 `96b1ba21b9dd9ac7efd048e0296906cc5cfe23a02c4e0e763b4e3a327e4000b0`. Read back from a fresh clone: manifest and ZIP checksum OK.
