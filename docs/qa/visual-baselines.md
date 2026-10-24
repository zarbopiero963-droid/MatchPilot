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

## 2026-10-23 — HIST-WEB-01 review fixes: management value label with its scale, rounding note naming the rounded figures

- Approval: PR #229, review DEC-004-R1 B-1 and NB-2; owner mandate MP-AUTONOMOUS-AUTOMERGE-20261023
- Run: commit `59ba137b16e9d180ae96217035e1ae968e67c345`, chromium 141.0.7390.37
- Thresholds: block 8, pixel 32, ratio 0
- Baselines:
  - `simulazione-desktop.png` `1d4ebd3bfc29644223dafd70e6c00a2b2270d751f995f371c86ddcbfde45067e`
  - `simulazione-mobile.png` `58ef2812a48992504a90b3c594e192e5547b34950ad1fe095c115719d5fe078f`
  - `simulazione-ricerca-tablet.png` `d473a8ad398712d32cbb51b01142dc0f469288d1aa29448e79022ea4ed2c722a`
  - `simulazione-tablet.png` `3ebcde7117e9ce3c0a3bc36d2272caaeae35443e22517aacbd51fc97ea995548`

## 2026-10-23 — STRAT-CFG-01: «Personalizzata» strategy with its rules, the strategy line and the no-trade reasons in the result; fieldset fields use the full width

- Approval: PR #230, owner mandate MP-PRIORITY7-STRATEGIES-20261023
- Run: commit `adfe84774f726d5f3b9d52f86ce2d4f48e4db657`, chromium 141.0.7390.37
- Thresholds: block 8, pixel 32, ratio 0
- Baselines:
  - `simulazione-desktop.png` `24e6447b55181c9caa62aeb6a3e61631232d649395207a055885c5be6f504c54`
  - `simulazione-ricerca-desktop.png` `8dee377518460e07d07bbc4fcf36e4ad7a688d903f479abaa1c8e7d507ec00de`
  - `simulazione-ricerca-mobile.png` `623c7f665811e27e78d7b8483526aff620be7336915c229413631d2762d9e34f`
  - `simulazione-ricerca-tablet.png` `1a0e1a6d6f7f7722544bc40efa550b2a7b10525a2aab5f2d13cad23a1567608c`
  - `simulazione-tablet.png` `25cca5bc34742e55eeb49f34b0e7fd74b7ec6942ca5ef37a000ee95182a716a4`

## 2026-10-23 — STRAT-CMP-01: link «Confronta più strategie sugli stessi dati» under the simulation form; new scene confronto

- Approval: PR #231, owner mandate MP-PRIORITY7-STRATEGIES-20261023
- Run: commit `41a06b43648f6172bdaabaf9660b4d312dcfaa3e`, chromium 141.0.7390.37
- Thresholds: block 8, pixel 32, ratio 0
- Baselines:
  - `confronto-desktop.png` `24a362cd045ca8fc75a4c4ad2c724d50cd61a7f0f01ff0544d06569ae7e2c17c`
  - `confronto-mobile.png` `cde43ae906fba7f07ed90d846fd04e696e57bd2667c76cb888876f216c05f798`
  - `confronto-tablet.png` `caf18b292ac44289d8d3aa33e78da5081778ddc82b505b14f0cf2b8bc2181a81`
  - `simulazione-desktop.png` `4f3ca0c82a6f2dfadc4ed4b78d13b74c9c8a68d4589f5d46f070fe7a97728cf5`
  - `simulazione-ricerca-desktop.png` `cb7612a0f350bbe52b949feb122a23c1b21ca155b42ae32684beaabd1c5e9273`
  - `simulazione-ricerca-mobile.png` `92086b1914ccecdf77216fc432931bfea570f3580218c0c8e7652fc18132fa03`
  - `simulazione-ricerca-tablet.png` `9a54cc972e39ac9d33327ebab68a1856a87850ab595dc98b53a5d47d0d043976`
  - `simulazione-tablet.png` `ce81802e7dd69d9b0599b7e922704c365de9f8b9cff1b1d424403203a6bbc0cd`

## 2026-10-24 — WEB-APP-01: nine-section menu with the account icon in every view (two lines on a tablet, scrollable bar on a phone); Simulazione tabs and the save form; Match Center settled markets and tool links; new footer

- Approval: owner decision MP-FRONTEND-CLAUDE-DIRECT-E2E-01 (#3, 2026-10-24) and owner request of 2026-10-24 to build the whole web app
- Run: commit `e87b3164b8ffe2da4c84f5b9b80175f5dabdafeb`, chromium 153.0.8010.12
- Thresholds: block 8, pixel 32, ratio 0
- Baselines:
  - `confronto-desktop.png` `7fbdb0ffec1489dd6757b311a398d9c33cc2be333645d4d0596bcc97ac083cff`
  - `confronto-mobile.png` `aa19dccb7a19f1f3d45f86ddbfcfceb15b302a4c08c1c907198c5cef3c2c8209`
  - `confronto-tablet.png` `0cf64931f983acec883db4760662d117a32a8e52608c467181f5089509f08da5`
  - `dati-desktop.png` `481bbc4175b8a829ad994ca5547d39cc437ce51fa7f5a6f7b15bb87323befe7d`
  - `dati-mobile.png` `a8fc7c40aa5bce305e6b627917708b30043e5a7814bed87593f205d4923140c3`
  - `dati-parziale-desktop.png` `c3aa30be7f46d9b022c117997ef7e65a9ba8f73fd48fabca440114d2fe9757d0`
  - `dati-parziale-mobile.png` `e1755019e68b78292c3941b582448fe41a1b5a2ec12679a3ed3f199bec5025c1`
  - `dati-parziale-tablet.png` `7b8b64e801b4ba56dcdeff3c953d2f57c87a41a13f6dbc54e2535d3546450cd6`
  - `dati-tablet.png` `192fe76d55f9067482030118c9010ea4ee72ab92c288e60930a6da9f3773506c`
  - `non-trovata-desktop.png` `fcc32f37be5b2a99a91b2e227c6c1120dc4a2828297255714038eef69dfa1f52`
  - `non-trovata-mobile.png` `3e07351a61dc27d6930b5ed8c960ae787c1751cfe282462b6297b417bf58f195`
  - `non-trovata-tablet.png` `a045aac065a5f04bf0ac941526a28c004b3ce1bc6c2a292d1ae6619fca4ab39f`
  - `oggi-caricamento-desktop.png` `76fedc34a7a80090462645378cd93ede0eb6f62e2ba709b51ef8895f9be1a234`
  - `oggi-caricamento-mobile.png` `9a70948508ab7679ec5561a9c09e5fb3d071b41e9b0849712eda070d3cda7bbf`
  - `oggi-caricamento-tablet.png` `72bc0c9ae3c5fdc10a197173626ef5b519b8bd7d6f202873a52de2cf6375d91b`
  - `oggi-desktop.png` `ac53e8805f0327eb74fdadb228190ecbd5725d53ecd3e344906bbc482681bc23`
  - `oggi-errore-desktop.png` `4b6c0e7479960ba52d9cc00c53ad8cc886add35f9ae683cfde36ded3e02fc584`
  - `oggi-errore-mobile.png` `e913c7a5eaed79a1229d983058e5ee2d277d5251a2bde4c239ce2113b2216920`
  - `oggi-errore-tablet.png` `0b018e94db23df4cf18b4658ac7e2ad7bdcd82dca1b4183953ae8f6995c11f9a`
  - `oggi-mobile.png` `074b646d02d78918a6250421bad09d650e10e5a0375ada3bcbc714b565d9eb66`
  - `oggi-oggi-desktop.png` `51e3b80053811a53c4c2eda6c60237524fb2121430b3f16fa07851716f789b42`
  - `oggi-oggi-mobile.png` `16903df3b1b89ea9cfc449b922e9a43b5b08e6ee0a3f21cf9a40dd6b4799a250`
  - `oggi-oggi-tablet.png` `80ecddd8d8f8bd7836c03a8b0ebdd863c7a42c05e73d64fa39406ee7d8d21654`
  - `oggi-righe-desktop.png` `bd101d30b425049f870b480d5c1b553c8136d14f100417f2aad41ff7c861911f`
  - `oggi-righe-mobile.png` `351dbcca4b80310afa2f8b937b6b36d6ab598e55ca580a400e8ac2c79c44fec6`
  - `oggi-righe-tablet.png` `783f8a17bbc39cfafdc51994db0f4fc66904022f785f362e7ea420f82a796196`
  - `oggi-tablet.png` `f789afe2d5d8cdfc36a4a42600ead0d5e039f316180e7692a91c0ec80e60cc97`
  - `oggi-vuoto-desktop.png` `ab8d51acaa22434a208c1be68cfa84abef94bc5fcddfdc741febbfa2d91d7ccf`
  - `oggi-vuoto-mobile.png` `03fca4f20583a7212a8d850d8da6305fb32040a1fbfae4ad3989e915b2e8bcd6`
  - `oggi-vuoto-tablet.png` `e4465c473ad7395b86377008d755e208eae3a66341fe5b11540bc0d913909df4`
  - `partita-confronto-desktop.png` `8f5a49f86b19494b3a84892f611f3b3d8c0bffb412accf6d1964afbe0df06e48`
  - `partita-confronto-mobile.png` `975036c81833148658c1dd1be963b081a81fff202b6902036b5c034228e84c2f`
  - `partita-confronto-tablet.png` `6ef5d97f00530933fd93030b4dbb61300a39784b190dbbdf26e6f95eca77f256`
  - `partita-desktop.png` `543764d969bb60a770d0137815e743e33f7037d9c577f827c64969164ea81c40`
  - `partita-mobile.png` `9298acaddd609d1d7397a52afd120fb601911b0818ae70fae50b9489392812b0`
  - `partita-senza-storico-desktop.png` `5595ec01e79e5f98fa428806a6c315de4856ef85384fa65110d1f955a257628d`
  - `partita-senza-storico-mobile.png` `901e6f8df293dd02ac93f670133831bc5ba02de40b05989fe8fb9bafb685d174`
  - `partita-senza-storico-tablet.png` `f75a6521e8b34e8f1d6818f673f8d80c80bce5ed654e5ccf8cd7139ec9076c01`
  - `partita-tablet.png` `1509d8d7cd53ed94db26c20d88368c61911e255b16ad442548067163d23fb376`
  - `ricerca-desktop.png` `8d8e2826de30506b11e39a4cdfb12fc9363fbf209f15f4d61db2f3640dc6b321`
  - `ricerca-filtro-rifiutato-desktop.png` `12423f05f48abc115a87e1ed35c3f4902e6257d58069ea0bc0a071543961c3f6`
  - `ricerca-filtro-rifiutato-mobile.png` `abfffeedf36db048d5fccfcd3d6788b1f7fdd9fd125cdc656c1971b8891580fe`
  - `ricerca-filtro-rifiutato-tablet.png` `6346da499cfe0552bbb662becc17b790f6f97e6ff48e400d0b1843d5e7e23566`
  - `ricerca-mobile.png` `99b42adeb97ff5b4f06089d8a1d1f56feaf0ed30078de1772b0628db93040a62`
  - `ricerca-risultati-desktop.png` `926675c0031e796216b70f2a0e5fced5943a5fe0d292d70b51eb05422da7f68a`
  - `ricerca-risultati-mobile.png` `ab89bfa95324b2e3cd4cd16cebf9e7c4411756ce89ad9be1fc8b19d2b99b0edf`
  - `ricerca-risultati-tablet.png` `c6beb5a2f243cc227911dd426e431557909f6e1ea80dd939394720a19a85f706`
  - `ricerca-tablet.png` `3f5d555c0f1dc96f4f6a04446099d02991a0fc4d65e0a0df30528f66990728de`
  - `simulazione-desktop.png` `9f7e1252fac58bd1e0ae9803d5003b3ef99017f096a662dfeef00c3cda56bf5d`
  - `simulazione-mobile.png` `7d017541fb17911da1ea6e860eac6c0512aeb4aca7b55e09a8eaeac20c44dfc1`
  - `simulazione-ricerca-desktop.png` `161f3bc50ecb6d8d0a7de34df471dc45e0ef47467e7b4438b3ccefabf8c94483`
  - `simulazione-ricerca-mobile.png` `f5a60faf3260b29751c25e453e4fc2582c8a21ab483436d0f39ba7fc31727535`
  - `simulazione-ricerca-tablet.png` `27d365e642baff9e440d261ff7fc42af8913de0ab1185045ea88728496acb028`
  - `simulazione-tablet.png` `3b697d88d127038667939168dccad078726c35f290a0a0bf4e5a11b0b94b2a5a`
