# R-07a-MATCH-CENTER: essential evidence

R-07a under MP-OWNER-FUNCTIONAL-DELIVERY-03 §4: the Match Center, first batch of the pre-match analysis of #30.

- **What works:**
  - `/api/v1/fpt/match-analysis?id=` gives per team, venue and sample the record from finished matches strictly before the match day, in exact Decimal: N, percentages, form, xG and odds coverage, source rows and head to head;
  - the page `#/match?id=` shows the hero, filters, comparison, source matches and head to head;
  - the page opens from Oggi, from the search and from source rows.
- **Data:** the QA archive only, 86 seeded matches loaded through the real ingestion path. No real match: archive #40 is not materialized (R-02).
- **RED:**
  - `red-match-center-main/`: the journey `match-center` on the web code of `main` a1ab9fb fails on desktop and mobile, because no match can be opened;
  - `red-visual-9b3aeea-before-promote/`: 9 new scenes have no baseline, and the search baselines differ (the teams are now links, «xG» keeps its case).
- **GREEN:**
  - `green-browser-qa-46b5bc1/`: Browser QA 12/12, verifier ok;
  - `green-visual-287a578/`: visual 45/45;
  - `ci-visual-46b5bc1-run39397844183/`: CI, visual 45/45 with Chrome 155, largest block delta 26.2.
- **Not done:** the other analytical cards of #30, charts (MP-WEB-008), the finished-match page (MP-WEB-004) and the real archive.

**Complete package:** [`evidence/audits` @ `17f78c8`](https://github.com/zarbopiero963-droid/MatchPilot/tree/17f78c8a8937e259ba6d112ead24940a6f588140/R-07a-MATCH-CENTER), ZIP SHA-256 `59f6c47ce1c3e05670a55ab7e39b72833cd0a7a1cac3a3af54821606b6e02ad8`. Read back from a fresh clone: manifest and ZIP checksum OK.
