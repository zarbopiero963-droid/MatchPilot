# QA-V2-STATES-MATRIX-R2: essential evidence

QA-V2 after the independent review D2 of PR #175 (CHANGES REQUESTED on 76b7435). First package: [QA-V2-STATES-MATRIX](../QA-V2-STATES-MATRIX/README.md).

- **B1:** the refused-filter scene now uses the real server's 400 for «Quota favorito da 2, a 1,5»; no answer is replaced.
- **B2:** `test/governance-certifiability.test.mjs` refuses every tampering the review found. The old test accepted `REAL DATA PASS (on fixtures)`.
- **N1:** the partial dashboard shows the unavailable tile.
- **RED** (`red-visual-3c75ac9/`): before `promote`, the comparison fails the 6 changed views (refused filter and partial dashboard on three viewports).
- **GREEN on 2c5103b:**
  - locally: visual 36/36 and Browser QA 10/10, verifier ok;
  - CI run 39394224581: visual 36/36 with Chrome 155.0.8059.39, largest block delta 26.1.

**Complete package:** [`evidence/audits` @ `1a3dad9`](https://github.com/zarbopiero963-droid/MatchPilot/tree/1a3dad9342efcf32b7141a55c92469b79cc5b45a/QA-V2-STATES-MATRIX-R2), ZIP SHA-256 `252bfe077568116a728d43ff79dbce2e1af8f43c92111fa05fdd4cf6b4612b4a`. Read back from a fresh clone: manifest and ZIP checksum OK.
