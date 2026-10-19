# V-B3-IDENTITY: essential evidence

V-B3 under MP-OWNER-AUTONOMOUS-UI-ROADMAP-01 and D-1: the identity of the approved mockup.

- **Tokens:** charcoal surfaces and the amber accent `#FFB547`.
- **Logo:** the mockup's logo in the header.
- **Typefaces hosted with the site:** Manrope for text, Barlow Condensed for titles, JetBrains Mono for numbers. They are Latin WOFF2 subsets under the SIL OFL 1.1; sources, checksums and licenses are in `src/web/fonts/`.
- **Security:** the CSP gains `font-src 'self'` and nothing is loaded from another origin.
- **States:** hover and focus.
- **Other pages:** the login page and `/coverage` use the same palette with system fonts.
- **RED → GREEN:**
  - RED, `red-main-web/`: with the shell files of `main`, general-navigation fails on desktop and mobile. The CSP has no `font-src` and no local font is served. The tree was uncommitted, so this is a demonstration, not gate evidence.
  - GREEN, `green-34c0cfe/`: 10/10, clean tree, verifier ok.
- **Before/after,** `comparisons/`: the first screen of Oggi on desktop and mobile, of the search results, of Stato dei dati, and of the home page on a phone. «Before» is the Browser QA of the post-merge verification of PR #171 on `main` 2ebe1a0.

**Complete package** (every screenshot and trace of the three runs): [`evidence/audits` @ `73e4a9c`](https://github.com/zarbopiero963-droid/MatchPilot/tree/73e4a9cc067c26ee0a493757f2f0e5e5de8e1577/V-B3-IDENTITY), ZIP SHA-256 `cfd73d21da2f7c36859bd5e5c311fd205b66b306106cb79b58eae7acb5007f57`. Read back from a fresh clone: manifest and ZIP checksum OK.
