# Fonts of the site (V-B3, D-1)

The typefaces of the approved mockup, hosted with the site: no request leaves the origin (no Google Fonts at runtime).

| File | Family | Source (google/fonts, branch main) | SHA-256 of the source | License |
|---|---|---|---|---|
| `manrope-latin-wght.woff2` | Manrope, variable weight | `ofl/manrope/Manrope[wght].ttf` | `3ae11c49db0455a3cc33e37d380f20fdb8c7f8b41dc07625c177e3d87a9d6ae6` | SIL OFL 1.1, `OFL-Manrope.txt` |
| `barlow-condensed-latin-700.woff2` | Barlow Condensed Bold | `ofl/barlowcondensed/BarlowCondensed-Bold.ttf` | `e476562ec9c1e16cf16475895b511f08c804f438cc9a9f80a44ea50a0eeb5b65` | SIL OFL 1.1, `OFL-BarlowCondensed.txt` |
| `barlow-condensed-latin-800.woff2` | Barlow Condensed ExtraBold | `ofl/barlowcondensed/BarlowCondensed-ExtraBold.ttf` | `724c9c25952d5f4a2d87185d9767aa006144c5f0d944dc05bf7d5d603551c260` | SIL OFL 1.1, `OFL-BarlowCondensed.txt` |
| `jetbrains-mono-latin-wght.woff2` | JetBrains Mono, variable weight | `ofl/jetbrainsmono/JetBrainsMono[wght].ttf` | `48715a42ec242c21e9f02692891e147d022299a52e48d5e413e1a942193ffeda` | SIL OFL 1.1, `OFL-JetBrainsMono.txt` |

**License.** The three licenses declare no Reserved Font Name, so a subset keeps the family name. The OFL allows bundling and modifying the fonts with software, at no cost, provided the license travels with them. The fonts are never sold on their own.

**How the files were made.** With fontTools 4.67.0:

```
pyftsubset <source>.ttf --flavor=woff2 --layout-features='kern,liga,calt,tnum,lnum' \
  --unicodes='U+0020-007E,U+00A0-00FF,U+0131,U+0152-0153,U+2013-2014,U+2018-201E,U+2022,U+2026,U+2039-203A,U+20AC,U+2190-2193,U+2212'
```

The subset keeps Latin, Latin-1 (Italian accents, «», ·), dashes, quotes, the euro, arrows and the minus sign. A character outside it falls back to the next font of the stack.
