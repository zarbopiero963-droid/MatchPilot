# Visual baselines: log of changes (QA-V)

Every change to `test/visual/baselines/`, to `test/visual/manifest.json` or to its thresholds has an entry here, written by
`node tools/qa/visual.mjs promote` and never by a check. Each entry names the reason, the approval (a PR or issue), the
run the captures come from, the thresholds and every changed baseline with its new SHA-256. CI refuses a change to the
baselines without such an entry (`node tools/qa/visual.mjs check-update`). Rules: [visual.md](visual.md).

## 2026-10-20 — First baselines of the approved views (QA-V), native date field in Italian; thresholds measured against the CI browser (runs 39380642895 and 39381265101: Chrome 155 vs Chromium 141, largest 8x8 block delta 26.1)

- Approval: PR #174, Refs #3; MP-OWNER-AUTONOMOUS-UI-ROADMAP-01
- Run: commit `5ca90e29077093aeb7c18ab67d118072c508a3ed`, chromium 141.0.7390.37
- Thresholds: block 8, pixel 32, ratio 0
- Baselines:
  - `dati-desktop.png` `1b97350f6222e268b1f5e49a7e6ee985337aa41232c12e8b20e18d93f77b80fa`
  - `dati-mobile.png` `dfb4e452dbb4a84c7a5d42ebbafcb1833e87a7b7c3746cf553046807bc38220a`
  - `dati-tablet.png` `ec4f11d52a5c4d90285e2f32319e0a107433fefc6ccaa04791633000006e4566`
  - `non-trovata-desktop.png` `aeb7997c1b8cbf1c40c4576300f1b063fc56dac5008942d25bc381cc6b41ecba`
  - `non-trovata-mobile.png` `406f8d73f3403c0f83e31ebeafce2b93a146fa95886037c823fa853cfe1bf4e4`
  - `non-trovata-tablet.png` `1a3809580ce8294d66bf2f08eb6d8f6d02dfe85de8c6cde0b3c73c2b0cffb3ac`
  - `oggi-desktop.png` `c90c2da06eae0cdac680636aea2cfa447de1ac147f4e9988c8f3e98837c35d19`
  - `oggi-mobile.png` `efd8a7da326b0c3fd7a599c3535567d3bad8b2277f010cdda827355a9d9d466d`
  - `oggi-oggi-desktop.png` `5b8ed698bf675cad98c7c6f1ef5db0662fe90e9fdbf6d91d8df1e64540bba79f`
  - `oggi-oggi-mobile.png` `17ef312434cd7b35fb3884063b75b89ccb1c2e00402d8dd0690a708976a265c7`
  - `oggi-oggi-tablet.png` `8b8388a5bed8af7c6f8614225542fdad0a654312463210da26e525f376496fbf`
  - `oggi-righe-desktop.png` `758fc384cc82dfc516fff8089f573e72aa6dc313d9ae382372f11d7084a9b697`
  - `oggi-righe-mobile.png` `a7e0e63c0d6644f960862fd33168115a5b04083b973230e42c9655229204689d`
  - `oggi-righe-tablet.png` `b6fb5f660d76c6a8e90d7ff46972b165b7b33ba29d4d9b9026a22597c0dece6c`
  - `oggi-tablet.png` `245314aadd473b0c923949ff61578b2eb3f08d417f8f845fe3d3ee5fa3250466`
  - `oggi-vuoto-desktop.png` `11a3f7a2d56a1cb83d19384a65436767c48686b6b212d68be6b42ad73aaa2c64`
  - `oggi-vuoto-mobile.png` `0272470b748642f00476748fa5e3a5665ea1f956188085a738bb07a608e5743b`
  - `oggi-vuoto-tablet.png` `197ca5228f42da8908279f73f12fbce7fddcee0e35b8cb2f4ec6735b0ffd6732`
  - `ricerca-desktop.png` `16b2b0184091b29387f7eee5096eae7823a3659978b2a8ddb4acd6c10b209989`
  - `ricerca-mobile.png` `2c940c91005dbe3092874106002f35be7b836709e3165a4d2abdbc7e7bc94e6d`
  - `ricerca-risultati-desktop.png` `dc57b1dc68f6df11b905570635cea2eeb7cd7260d69731fa01e353cf6b5e74ff`
  - `ricerca-risultati-mobile.png` `b04f893524e1243e79b9b307c4cbb95696454e4bc745059f5643be6a53d317ae`
  - `ricerca-risultati-tablet.png` `80d4ed9062f8fdb2b0d086a638d7f71ce222613e208bbe9e79f2b76e3e9bd610`
  - `ricerca-tablet.png` `afa15db63d1f412710c6fdbe3cf026913c9d94668927480bf303f297f971ef0d`
