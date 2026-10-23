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

## 2026-10-20 — Match Center scenes (R-07a); search results: teams open the Match Center and the xG column title keeps its case

- Approval: PR R-07a, Refs #3 #25 #30; MP-OWNER-FUNCTIONAL-DELIVERY-03
- Run: commit `9b3aeeabfb2e5806859db2243118d3a6bc753f4e`, chromium 141.0.7390.37
- Thresholds: block 8, pixel 32, ratio 0
- Baselines:
  - `partita-confronto-desktop.png` `a1ab6094184ec88c2d1e98bd29fb81de84b881dbd010837a15444b24718fec05`
  - `partita-confronto-mobile.png` `180a269234d43aea575114c0eaccc16fee7156018aa6e30f6da6f07743545cb3`
  - `partita-confronto-tablet.png` `b17eb29571f05240c1a82106e26faa230818d05355e6ce9de29af4caeb0e266c`
  - `partita-desktop.png` `248f8704351030fdd9bec9922a9648956e58369ae1f4613afa8b2759b0285e96`
  - `partita-mobile.png` `0adf7c31cfe4bdd7b88afa44571294fc44103a7799dd8790ef7292268dcd963e`
  - `partita-senza-storico-desktop.png` `1218141e1f5acb9366e9f9092c57a1e7ff7b175d15e8b0ab7686c752ed37d3d2`
  - `partita-senza-storico-mobile.png` `3b493e7919cb0f7c890d20a173138116b4edf940ace34a43699eb211180f1937`
  - `partita-senza-storico-tablet.png` `c3918d0c07db2e51f0af0d0c4af9441024a9c2a7e6d2b956b1853e3fca48f1e6`
  - `partita-tablet.png` `8a489e6343ce990de9e565f993c5c84875056f92af5ab1b9ac4a80b089a45388`
  - `ricerca-risultati-desktop.png` `6d520e32545629c3b56db6eee78056ca31a73b2f5c1cf0ef0065ab0ac556e9e0`
  - `ricerca-risultati-mobile.png` `a84cbfa3a97c185f32ed59b6ca8a58f8b08e57fab2e1dd1c06afda07c801b853`
  - `ricerca-risultati-tablet.png` `c8e17d712d37c14570ff91094502ca5311278697ce3a7ce7bf928612c87b7743`

## 2026-10-20 — Review D2 of PR #176 (NB-7): the head to head has no «Esito» column

- Approval: PR #176, review D2 NB-7; MP-OWNER-FUNCTIONAL-DELIVERY-03
- Run: commit `ce366c3c7c866ae1e5f836058a845ebcf61fc839`, chromium 141.0.7390.37
- Thresholds: block 8, pixel 32, ratio 0
- Baselines:
  - `partita-confronto-tablet.png` `def533b87f18256fbe903ebc30f5f356f884950679f7acafe4e1f60f13038a0a`

## 2026-10-22 — t131u fix 5: data health «Attenzione» when FPT content is stale

- Approval: PR #200, owner t131u (FPT monitoring fixes)
- Run: commit `d561c8f16708f7361dfb4cbb4b427a06b056dacd`, chromium 156.0.8078.47
- Thresholds: block 8, pixel 32, ratio 0
- Baselines (only the three scenes over threshold; the others are unchanged):
  - `dati-desktop.png` `be94b2614543eeba868d77bb9eb797d7718037ad2de1c76c069591cc7a8e6a3d`
  - `dati-tablet.png` `aa225c045255ddbd0cf30eefee1c3d88ab8d7d3e1561d508634f2fb02b8f0e7d`
  - `dati-mobile.png` `f5c8d4a4db04abdebabd20b9bffc7467691871507542ce627135ab1a25e1b79f`

## 2026-10-22 — t132u FIX-05: data health v2 «Critico» when no sync run exists

- Approval: PR #201, owner t132u/t136u (FPT hardening)
- Run: commit `897229af1359972b9f01cef34dbf50882ec1f597`, chromium 155.0.8059.39
- Thresholds: block 8, pixel 32, ratio 0
- Reason: the QA archive has no sync run, so the separated freshness view reports CRITICAL (sync NEVER) instead of «Attenzione»; never a healthy state on missing machinery
- Baselines (only the three scenes over threshold; the others are unchanged):
  - `dati-desktop.png` `79d5a266769dd0d86b578dd7e81324f946fce4300a65a852d2411820f10ddfdd`
  - `dati-tablet.png` `50697e4f66a301638ec115c0d2712ebcae50904408bddd77a3a9225dd8a57d28`
  - `dati-mobile.png` `2b5c9f303813b6663c9efc90467ef01eb94febd770ce91ef313f5f9dfffcd1c1`

## 2026-10-23 — HIST-WEB-01: menu entry «Simulazione» in the header of every view; new scenes simulazione and simulazione-ricerca

- Approval: PR #229, owner mandate MP-AUTONOMOUS-AUTOMERGE-20261023 (roadmap priority 9: operational web interfaces)
- Run: commit `c3c604e33251cc3b0b77a7b17a0e7ab526d72320`, chromium 141.0.7390.37
- Thresholds: block 8, pixel 32, ratio 0
- Baselines:
  - `dati-desktop.png` `7a44d4bdc96bfd98a6b0f103736a527ff3534c34e07c6b8e9bafbe1880ab2b51`
  - `dati-mobile.png` `2609cc84ffc06fdf4874462751c39932b260a8c665a5d8b88893c4aa5dad5e8e`
  - `dati-parziale-mobile.png` `de46ff18809dd7386a4eaa29f8f9ec1bf7f6df203d77404195d62567b63dd207`
  - `dati-tablet.png` `064249cf3fa10f43b94e978ad6d2e919282d27a8a74db38c9dfdf916895c0f74`
  - `non-trovata-desktop.png` `166d3c1fa233c04a498c309c90d52e4e6b135d68ff5a62adea3dd3d7fbeb99aa`
  - `non-trovata-mobile.png` `97c018b6b46b89e107d67a5e2ef6e6470768e61535d2f1fee6e80cb95382e42d`
  - `non-trovata-tablet.png` `008f8afe3ba925d1935bf7d89b8792e16d7f6ca4615edf7f02e44db4b94dd1b1`
  - `oggi-caricamento-desktop.png` `a9c342ab8afd229d2a274b9e0669a8d152df3096ff256570c9a02e7d9a314c5d`
  - `oggi-caricamento-mobile.png` `dea8527a9c791feab00815c495877903b873f5e1368ae38073f249293ecad579`
  - `oggi-caricamento-tablet.png` `4cdcb4629ef8f3de28116264b79c68f4571cbc54e6caf70d2fdc257bfaed38d5`
  - `oggi-desktop.png` `7f1b76196cd6ea7f555e7bc553e1d99feff154250158b56d2f50396fe3c6cac1`
  - `oggi-errore-desktop.png` `cd7bf48434cf0c392e10df62c6d77d109ff9f7020aad7f6a1e8a2f1d5f249bb5`
  - `oggi-errore-mobile.png` `dad20affd3b2ff9184d963306fd32ef3a010844999fa55fb806d82325b4b4830`
  - `oggi-errore-tablet.png` `28d5e4e934f331cae03b97f56d42b4abb943ca030308920e662f5fc7cdcc356a`
  - `oggi-mobile.png` `81c702971bd15a8bd01addfc5d48fd9a72dfb4e43bffd04a2d4fb0946062eea2`
  - `oggi-oggi-desktop.png` `7fa9f907eaa44190f08370a75114eac2725e2c072e3dcbc5e8c3849ce4ec590a`
  - `oggi-oggi-mobile.png` `39044276f1b0ce984c5bbd398a93efc6274a8a61fe1d9268f21afe483320fba5`
  - `oggi-oggi-tablet.png` `6479398c0b344334a66bdf7819fc37c63634fc19c132cbbd6145c32ec0b0ac53`
  - `oggi-righe-mobile.png` `b2e569034d136aa1f54be4946d2dbd4fcab8461b9a20955b186534caae2eebb7`
  - `oggi-tablet.png` `bb024a355398eaf52814a52703341a14f85399807d6b0e3f56db937ff41a927a`
  - `oggi-vuoto-desktop.png` `d2c19c8a0819c78e9d0b5f79364dd0e621514549a1f53bb532f6d7c334867418`
  - `oggi-vuoto-mobile.png` `31731d0d3784bc4ae8c14d47fbe7cf718226fbec86916d9fd6bbac3b73786c34`
  - `oggi-vuoto-tablet.png` `99f368d4789fdaa86dca92770693aa326d63fb29c165a57eb4c179d2fcd875b1`
  - `partita-confronto-mobile.png` `de8f651d7bb5dad7c5768280fa1a2603be17a1dfaea5fe0efd761679b839290a`
  - `partita-desktop.png` `96f2bf3c7f5a512402d8cbe8d39f943e5f97d90508f2d27f5d1e7837160a37c9`
  - `partita-mobile.png` `ccf4d4a6190463206028d66f26a950d7d8bbaecc3383c0b58760e2f3af6da334`
  - `partita-senza-storico-mobile.png` `88f78aca7e6a6159d8e43a5d140951123d56b18a5c1f1b8cf9b12594197231ef`
  - `partita-tablet.png` `05a6e0d33eac2d3a7a78488cedec504ecf397928e441b9366c035e3f60f919b9`
  - `ricerca-desktop.png` `b6266010592fc0e6f7fdca2d079c1975865c75ad0739b8ff220f5e8a738a3ec8`
  - `ricerca-filtro-rifiutato-desktop.png` `09e3e41005bc0f407290068f8b0126769dc082e53813288bdbb0465eee9f8d9e`
  - `ricerca-filtro-rifiutato-mobile.png` `3d82c3a4f483538a51ed34de12f2a2ca35458c78a575863b05c00a0dadef2cd1`
  - `ricerca-filtro-rifiutato-tablet.png` `836eeddd42280b323fc4ecca5d45d9fb597ce5c564f5d7310944e9a25d5770ae`
  - `ricerca-mobile.png` `3167d201e838077c171f52201b555cd35cb23eb238d45ae302cc6c45abc15bcf`
  - `ricerca-risultati-mobile.png` `b9eea68c5f3cdc261c9811f6bbe9eee43f35c94fdf15f1a76e208b988f409893`
  - `ricerca-tablet.png` `48671e26a52015406abcfb3717977c622bebe8a56b40de406125d031a35f2fa9`
  - `simulazione-desktop.png` `f0f11ac88a9aac1c147bb051a1572d85bfe9992667e5a40613e1a404f65a5aa3`
  - `simulazione-mobile.png` `513a24cec6d56a3efb3a7f9e69b12349b56a360bae023c86a1e61d40a844c29f`
  - `simulazione-ricerca-desktop.png` `a60963f7351f8a228e726cdb1280fa01054765aced69c75980a893554ef250b7`
  - `simulazione-ricerca-mobile.png` `d139a09c6af9f3b8507680c643b589ccd400ea4e7ecbd5dcf8e7344fc093ce06`
  - `simulazione-ricerca-tablet.png` `f2d470d206a0980ddf07e09410d6e7e37974f732034e6535967a5577061cfeca`
  - `simulazione-tablet.png` `25b27106fe1189a9c36ef4b317dc13d0a5adfbccc8c4560d527e02e3028bee40`
