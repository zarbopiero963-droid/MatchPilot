# V-B4-DAILY-BOARD-R2 — evidence package

| Field | Value |
|---|---|
| Audit | V-B4 after review D2 (PR #173, APPROVED on 112f1ae with non-blocking notes): NB-1 the mobile results check that each column title is drawn on the card and the value starts after it; NB-2 the dash between the teams stays in the heading's accessible name |
| Commits | GREEN: c02db2f9d659039bf06d61e1a001ebbe26cd2c57 (clean tree, verifier ok). RED (uncommitted trees on 112f1ae with the new journeys, demonstrations): `red-review-f` without `content:attr(data-label)`, `red-review-l` without the 104px indent of the result cells, `red-review-aria` without the heading's aria-label |
| Date (UTC) | 2026-10-20 |
| Environment | Claude Code cloud container (Linux), PostgreSQL 16 throwaway schema with the QA archive, Chromium 141.0.7390.37, desktop 1280×800 and mobile 390×844 |
| Outcome | RED: search/mobile fails («each title is drawn on the card», «each value starts after its title»), daily-board/desktop fails («the teams read as one pair»). GREEN: 10/10, verifier ok |
