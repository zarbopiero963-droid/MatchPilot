# MP-OWNER-VISUAL-BASELINE-AUDIT-01: essential evidence

**What it was:** a read-only visual audit of the approved mockup against the real site, on 19/10/2026. Its outcome is [`audit-report.md`](audit-report.md): the original text of the report, recovered from the session transcript. The owner decisions D-1…D-7 that followed are recorded as MP-OWNER-VISUAL-BASELINE-D1-D7-01.

**What is here:**
- the report;
- the 6 side-by-side comparisons (mockup left, real site right), the originals.

  The four sent in the conversation at the time were `daily-board-desktop`, `daily-board-mobile`, `dati-dashboard-desktop` and `ricerca-mobile`. The other two come from the same run.
- `evidence.json`: audit, commit analysed, date, environment, outcome and archive;
- `MANIFEST.sha256`.

**Complete package:** the 56 original screenshots, the comparisons, the report, the capture script, `INDEX.md` (bytes and dimensions of every image) and the ZIP live in the branch [`evidence/audits`](https://github.com/zarbopiero963-droid/MatchPilot/tree/0c9e5d3e1920d29f2857fbc7e72eee83452d4476/MP-OWNER-VISUAL-BASELINE-AUDIT-01) at commit `0c9e5d3`. ZIP SHA-256: `9478d8547719025c35b299bb6227b3ebeab4dcee3182fbe019f8ecfa9a9f48d6`.

**Read-back verification (19/10/2026):** fresh clone of `evidence/audits` → `sha256sum -c MANIFEST.sha256` OK (65 files), ZIP checksum OK, screenshots byte-identical to the session originals. The GitHub API shows the ZIP at 11959575 bytes.
