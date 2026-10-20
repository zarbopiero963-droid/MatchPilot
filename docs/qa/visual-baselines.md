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

## 2026-10-20 — Explicit states added to the baselines (QA-V2, MP-OWNER-CONTINUOUS-EXECUTION-02 P1): loading, error, refused filter, partial dashboard

- Approval: PR QA-V2, Refs #3; MP-OWNER-CONTINUOUS-EXECUTION-02
- Run: commit `88eb59d9b1d78f1bdf933273a9d6375a3799d8ec`, chromium 141.0.7390.37
- Thresholds: block 8, pixel 32, ratio 0
- Baselines:
  - `dati-parziale-desktop.png` `1c2d7892c6ff03781193ec9c0120a076f8235822565817d2b0e9ad714e7543d5`
  - `dati-parziale-mobile.png` `ea1755f47b14f83091996b33e7f0c19ccbf10c46bf1ba26341dd567966ad1388`
  - `dati-parziale-tablet.png` `2bb34d16f6e140d679ab401fc583c8379feea5bbb464088279c49b9db3c6812b`
  - `oggi-caricamento-desktop.png` `d631df46a1fcd31c526dfd7523f0e7c2c731901f3f6c48fa03c0e343c70d8e9c`
  - `oggi-caricamento-mobile.png` `49f38211cec1af1ce1ced8d4ce7205d1cd3cdae65d91996f67dd56b8b64aa764`
  - `oggi-caricamento-tablet.png` `fccf1c02321857b7828a59e58f34b21ef627ee4efc4f9d4c2faca0fc2007588a`
  - `oggi-errore-desktop.png` `b21c51aea31cb53230ab58ef6b97d8332f909964e51726c3db9244cf002672ae`
  - `oggi-errore-mobile.png` `1e6ea054e71992fa9daaeade664f03c4e8df3d7745f767975e59c25bc79f5f6d`
  - `oggi-errore-tablet.png` `ccce655bbd10600940f80573fd20ee46f857bf463d9be3d2b4b03d17fa7052b8`
  - `ricerca-filtro-rifiutato-desktop.png` `1d9f5143f2f22f9b0361924956007fee6402761239f545210bcd640a36efcffa`
  - `ricerca-filtro-rifiutato-mobile.png` `7414bae4f550394e317d5d09321af8ca3847d10d29f09eac7f19d1405a5a0d7d`
  - `ricerca-filtro-rifiutato-tablet.png` `bc06d1177eade954e7010af8b85919d8da8a411c99db116b94ed55b33bd02ece`

## 2026-10-20 — Review D2 of PR #175: the refused filter is the real server's answer (B1); the partial dashboard shows the unavailable tile (N1)

- Approval: PR #175, review D2 B1 and N1; MP-OWNER-CONTINUOUS-EXECUTION-02
- Run: commit `3c75ac9cf0002f90a717e24e742ad2e97dfd202a`, chromium 141.0.7390.37
- Thresholds: block 8, pixel 32, ratio 0
- Baselines:
  - `dati-parziale-desktop.png` `94a669ecfd5dc7252eb1d2500808c24c4da3f3e869c617a64b62cf1ff4f4bf51`
  - `dati-parziale-mobile.png` `578c17cf5620d977d12a87a367aace62f499d82619c6112de92b78541057fadc`
  - `dati-parziale-tablet.png` `7c2d8b414b4cd3646fbcf9e710728d4958a270421a633ce54ab5323cc36555b5`
  - `ricerca-filtro-rifiutato-desktop.png` `7cb58945b9a448478b3e8b91ab066cf9755f8a8948961f55489c303eabc4e632`
  - `ricerca-filtro-rifiutato-mobile.png` `1faffe5f9c42431f07bc65d3fad40dd9e3bd3de59c8285505327b44cbdf40f22`
  - `ricerca-filtro-rifiutato-tablet.png` `70a813ed8e51a79a8a0dcf08d4704e190b5d55d9ccb4a29fb271449c87ded78c`
