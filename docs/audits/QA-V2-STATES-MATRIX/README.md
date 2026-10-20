# QA-V2-STATES-MATRIX: essential evidence

QA-V2 under MP-OWNER-CONTINUOUS-EXECUTION-02 (P1 and §4).

- **New baselines:** 4 state scenes on desktop, tablet and mobile, 12 images:
  - loading: the matches route held;
  - error: matches answering 503;
  - refused filter: 400 from the server;
  - partial dashboard: live TotalCorner answering 503.

  Every other route stays real. The 24 earlier baselines are unchanged (same SHA-256), so the captures are deterministic. The captures of the four states are in the complete package (`green-visual-6680fe9/captures/`).
- **Certifiability matrix:** `docs/governance/certifiability-matrix.md`, with two verdicts per feature, deterministic and on real data. No feature has a real-data pass: archive #40 is not materialized (R-02). `test/governance-certifiability.test.mjs` guards the matrix; 4 tampered matrices fail it.
- **GREEN:**
  - local on 6680fe9: visual 36/36, Browser QA 10/10, verifier ok;
  - CI: run 39388983169, visual 36/36 with Chrome 155.0.8059.84, largest block delta 26.1.

**Complete package:** [`evidence/audits` @ `a014d6d`](https://github.com/zarbopiero963-droid/MatchPilot/tree/a014d6d9c82099d04c451172b6e252078e17328e/QA-V2-STATES-MATRIX), ZIP SHA-256 `e47be5a216bbb4ba716eb20b5d67523c5853d7839207eff3f2fb23a5e7181465`. Read back from a fresh clone: manifest and ZIP checksum OK.
