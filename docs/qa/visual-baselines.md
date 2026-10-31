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

## 2026-10-24 — MP-UI-PR-003: link «Backtest salvati» next to «Confronta più strategie sugli stessi dati» under the simulation form

- Approval: PR #242, owner mandates MP-UI-ROADMAP-01 and MP-UI-HARD-GATES-01
- Run: commit `361b6ecf5eab8bfc9771fe9e631e568c33c2da89`, chromium 141.0.7390.37
- Thresholds: block 8, pixel 32, ratio 0
- Baselines:
  - `simulazione-desktop.png` `aa3bcb65bfd0b94a1e3fa8c1583ceed22cfb5a9bdeb5596cf40c29b09babf232`
  - `simulazione-tablet.png` `6aba8bfd682c0ae38ab8647c18b4731f0bde63cf9222cadd2e2c36f65a3ca3fc`

## 2026-10-24 — MP-UI-PR-004: footer «analisi e simulazione, nessuna operazione di trading reale» instead of «consultazione in sola lettura» (no longer true with the owner saves)

- Approval: PR #243, owner mandates MP-UI-ROADMAP-01 and MP-UI-PROTOTYPE-INTEGRATION-01
- Run: commit `06e3d5f58f8ecc93cd24db68f60b8647f55a95fe`, chromium 141.0.7390.37
- Thresholds: block 8, pixel 32, ratio 0
- Baselines:
  - `confronto-tablet.png` `abaa5aa26265a29fbf855db029b488f4817bf1b0e513773515d2f94ebaf691db`
  - `dati-parziale-desktop.png` `224c772a8d684c8adb5f728721ecc6ab94d482919dd4310fdcab9b9ac4645226`
  - `dati-parziale-mobile.png` `45553f5c7732132b443b24623d996281d67c84d62302972f2bb05b36667f9459`
  - `dati-parziale-tablet.png` `8ae78a5cac91c83430b9c92333ddede630e52284106a5cda4b0c8ab7b32add54`
  - `non-trovata-desktop.png` `9e81f9b5ad88e51bd90cc3e9a26036b78ad3f3f062dae1d9ab42e9f93fffacdd`
  - `non-trovata-mobile.png` `fbc2fef5c53a315e96770d7cb6a77c4b575b169bfe00929db9c912cc6dff9263`
  - `non-trovata-tablet.png` `2ddea4e63e84db798b838bff909e6830e5326595326b0d7c56d019b7be99bb59`
  - `oggi-caricamento-desktop.png` `9057ce905319619f5d6fbc02995bf18ee6adb9d127614c9af85bed4303da7d18`
  - `oggi-caricamento-mobile.png` `c64a6bcfab5dd1f0ffd12547b26652d75adc1d3d243e39502540aee0ec528cdc`
  - `oggi-caricamento-tablet.png` `719a3df7010c87a6b8f7b01e6105b568acf046f21d0e4c3d457877c261b43af1`
  - `oggi-errore-desktop.png` `80af459f5bb6c9f3c825acdc6cfcf4d3161f7ea0b56136169bbcf6dc444d8366`
  - `oggi-errore-mobile.png` `c715891f4c3bba1b0882af20c5a31ab0ffe35dbfbf7bd25f0fe1222a558505c0`
  - `oggi-errore-tablet.png` `6558749fa0df87f4c76afed5a3de2222387fdeb94be5dec6e47429dd1beba293`
  - `oggi-oggi-desktop.png` `db22659e243f90fc8e462203705d996e97c4073ded34ff72e5f96a2e83818eed`
  - `oggi-oggi-mobile.png` `6c3b4f4a3a5347221d975a3d5915f1553d8a01eb7714a0ee10e107ec92b57310`
  - `oggi-oggi-tablet.png` `7eb70e0fb67f117165fadbea8fb1e70f6d0c0252e94d56f05edeab677dc5349f`
  - `oggi-vuoto-desktop.png` `48e9d740ceb28ffe3f46e0a85a7ab4c0520b310bdcffaa8a111f6cb535d1c893`
  - `oggi-vuoto-mobile.png` `f6c9cfb9a4d32889ffc2e8222a119a7b0999b01a4346f2183f12d4aa3d357d22`
  - `oggi-vuoto-tablet.png` `4d7b6f2bae4c98e97f9f69ba80f557f4904db90be57afc78c94211d726264493`
  - `partita-senza-storico-tablet.png` `e760a69b61491b75fc0d93e6f341d8b1a6dbe9cbf6238a4063da018f974a5da6`
  - `ricerca-desktop.png` `026db1a46ca09bbd1b1b2cdb7f42a7b9180b6679bf0caa2d1ac7d73ad57cda65`
  - `ricerca-filtro-rifiutato-desktop.png` `fe94f0ecced1c0a530784a9c9afb647e52ec7563a32b314f6ceb5a37cae8643a`
  - `ricerca-filtro-rifiutato-mobile.png` `805b0dda85478a705990469a28f88064115c66aca6c6967564b4f26a721bbc97`
  - `ricerca-filtro-rifiutato-tablet.png` `eba240fecf8815908e04f4e3e71bdf3796fa7ff86a6f85101aec0e792a2ec90a`
  - `ricerca-tablet.png` `868ca343a79c4c296d2826b27f339007ca5b3c4e73b1a6f8e502ee19d4942d7f`
  - `simulazione-desktop.png` `062d4cbbd0be9433c6bcb164d8bd8ae143f55f2055bd0af76c92a8c556eebfac`
  - `simulazione-tablet.png` `782973547e33eeb412a04e15829086005ffeb3faf36b4f8d480d25256f1164f3`

## 2026-10-24 — MP-UI-PR-005: menu entry Strumenti on every scene; new scenes strumenti and strumenti-copertura (Trading Tools, #94)

- Approval: MP-UI-PR-005 (#239), owner mandate MP-UI-AUTONOMOUS-CONTINUATION-01
- Run: commit `71236c919c0bbbf4c31ac6de4e2b74690c2620ed`, chromium 141.0.7390.37
- Thresholds: block 8, pixel 32, ratio 0
- Baselines:
  - `confronto-mobile.png` `ad95a40a6d013734ee24f6a1b67b8eeb8d31a105565f9af1f2d26a6e0e863ef0`
  - `dati-desktop.png` `cca1f9bcc69f14f0dc4417d24128616b052e024303722906bd45d09ca6524c9b`
  - `dati-mobile.png` `7f7260b1951c3bd647d564fa1989352e194ee6e9b2e841fa400aea7eec9d2ef6`
  - `dati-parziale-mobile.png` `74ef22f64bdffa0edee81d0f572345f2197df33d839cdcd1f71706ab0113238c`
  - `dati-tablet.png` `5eaa91a562727560fcc7e8f19ae6fa065851d2e855aeea93d2fc5a09dee12a7a`
  - `non-trovata-desktop.png` `acdda607f98e2a168aaa0c61692b3af972d17f6b7b06f01626bc23b480a55d17`
  - `non-trovata-mobile.png` `7eb7d1850301cb4a1df2c5c9bd90d53e125341e2f408fe42cee435ecc6201302`
  - `non-trovata-tablet.png` `c3cda0e9c2a87c94ddbe82f6491640ee72c71cb5bf22b95faefa1ec0dd91b78c`
  - `oggi-caricamento-desktop.png` `a6995e493f09e83983434ef25aa331081d307ee62f3537285a8bdd4b915d6203`
  - `oggi-caricamento-mobile.png` `de4190663a387eb7a751ee042c4a7967ce8d935c3ec3310fe4b73922cbb85bbb`
  - `oggi-caricamento-tablet.png` `f1495f1f9771a95f1db904898d50add94b3d97ec872c02a544c4e8255b832169`
  - `oggi-desktop.png` `c1c5daabd99694dfb82a1cc4260d46094f971ff3e709e5d3ebef1c77dfad5f04`
  - `oggi-errore-desktop.png` `9136934a9913031832b4d228c36c9ca58c6f2f8b1e9ea1639f4c30202bae8071`
  - `oggi-errore-mobile.png` `92cecc32942e16f4b1a1cd40e7ece832e00322dcf68abef706fa6af6eebf406e`
  - `oggi-errore-tablet.png` `2fbf85f1f81f0e1e797a485ac644c52039601925774ecc11880369e8aa6374ec`
  - `oggi-mobile.png` `a99be3eb7ebd1baf455b1230f36e8f1944f8e3efcc80830dbcbafd8b0df2e04f`
  - `oggi-oggi-desktop.png` `95079816205bea99868d854f5c94e1251f390fc4e2f993b189c18f98874f9ddc`
  - `oggi-oggi-mobile.png` `e66440c6dba3b849956e2098839377235a183a664bea0f2197a71e4fa54b4904`
  - `oggi-oggi-tablet.png` `27bfc27eabc308e6d231294824dfb4ce2bdb218325660504a97fa71b167482c7`
  - `oggi-righe-mobile.png` `6cd27222c43e839a0d85c6893086f13df42fa9e40a461a25b7164badda6d8f8e`
  - `oggi-tablet.png` `f13e8596aad0d09a3ff41e78b34a67ad229ae4e437e5646f227b97f6d1f6199f`
  - `oggi-vuoto-desktop.png` `781ed6ae64e4195b81f1a975f592b757deac3f6ae8d48222a7d84f576a62883a`
  - `oggi-vuoto-mobile.png` `b9b3319b54392ac3a9d47b02092af4fa0189e00f32fe16d1a422529b688e223d`
  - `oggi-vuoto-tablet.png` `bf4c3bcd9fa2acc151b2434111801cb03bdb4c23541791de56d8da00f6648a52`
  - `partita-confronto-mobile.png` `220d7dba438fbfc76566977022d226f612370c1fc4624e1e94f6d8f6d3582e28`
  - `partita-desktop.png` `734bdb3651aaea9c7070f12fef76569249c74aa2c1f4ecff08adbf63192eb2cf`
  - `partita-mobile.png` `110ea6691106fd380165830c3414661ec5d3457c7f4b37c8a650ae52f36af264`
  - `partita-senza-storico-mobile.png` `2c2fd27426cbee08fc692377f32011072dcc1a6ab9af3b7ce055a72bd6539732`
  - `partita-tablet.png` `e9300feb2ad5bb73db1109cb2b57fba7fe14ef9475165b0f73af99de844b4d2e`
  - `ricerca-desktop.png` `2c2476c6da71f3810d464abd0b460466d35e8a486122b38d39651550836d2062`
  - `ricerca-filtro-rifiutato-desktop.png` `0aebd7b31f0fa1689c0aced872338b8cd957bfa45a6680062292f569029bf368`
  - `ricerca-filtro-rifiutato-mobile.png` `9ac244409381a2193a1d1b98de6c9c84358eb9bd5446ce5105cfa26b9545b864`
  - `ricerca-filtro-rifiutato-tablet.png` `0084c7e0550452ed1806c123b5591214406fec0eeb89254f39745455ea5afdec`
  - `ricerca-mobile.png` `a36ebac53ebc76ae090b145c256f8fbb1c156af20ac218d4283c7a5eb2d452fc`
  - `ricerca-risultati-mobile.png` `032beb1bff8839811e0e6949cb2a2353eddf1afe0137a1b222907a9c42febc98`
  - `ricerca-tablet.png` `9750425a0881f152e7a384244c44985cfabec378f52c97ddb117a804bfc88b73`
  - `simulazione-desktop.png` `ca5227501c8139a3868c0b011e1e7f54f4cf991e992b5041ae85ae8110cc4a4e`
  - `simulazione-mobile.png` `2bfe87cfaa8fc3321cb4dc2dac7d377b2f71626e9f81ac41d6346a9804105fd7`
  - `simulazione-ricerca-mobile.png` `426db5e48038167af34f174a5acae7372ec3aae88e3c4e57916ab9374b1f31aa`
  - `simulazione-tablet.png` `7befdc4ba62d943120c9fb8776e66b806df4c3f6603a011cd5b974b461a468a3`
  - `strumenti-copertura-desktop.png` `23a945766c24a7a6839ffc570b43516067f90f435b9e93e3b2754d920f8a412e`
  - `strumenti-copertura-mobile.png` `60691fe5bf7a25fc5895afe1b3aa1b93bef04d838451d1b12201f7e614163e87`
  - `strumenti-copertura-tablet.png` `b43ccc59651a25eb81778867b7ce74a58b98455b7effee00a16ac0557a15b6da`
  - `strumenti-desktop.png` `0bdb169aa206602cf65d7468bd199f05421c53b05ccdb84ae1c5d761b80010fa`
  - `strumenti-mobile.png` `c58de44344fda5233b0510f5092ba546c4576f0b873504cd7b7e261738ce6315`
  - `strumenti-tablet.png` `0d3021bc1d8b956ca20af9afdc4ac66de8af1c22a83f9cb46cdf59adb265ac6a`

## 2026-10-24 — MP-UI-PR-006: new scene strategie-private (the saved strategies are private without the owner login); the Simulazione gains the link «Strategie salvate»

- Approval: owner authorization MP-OWNER-PR250-MERGE-UI006-01 (PR-006 scope)
- Run: commit `fd3a99b1c502977164bcc147e1101cd98b8f8670`, chromium 141.0.7390.37
- Thresholds: block 8, pixel 32, ratio 0
- Baselines:
  - `simulazione-desktop.png` `443185b46acb221e14896de8f8f940f6a9ea13e36ab591ce01133f92ddc00b5f`
  - `simulazione-ricerca-mobile.png` `2dc81ab0fe6c29f528262d0c2a0795ac9263badd98c18c22eee093a8d611ec6f`
  - `simulazione-tablet.png` `6fc4415093635185da779f65ef8ae641ee87be21c57a4744b3d9bb9fa6695a25`
  - `strategie-private-desktop.png` `e5b8650518d2f20ce26f7c174d4a4086c877d24278e70b8b4e4d085a2e50b99b`
  - `strategie-private-mobile.png` `451c6c362acb243aad9bcbaaffc8f441b6648a7ebfd2707c149da09daa010891`
  - `strategie-private-tablet.png` `86a0737374540b77f868c37484b49fb75af892de61aee2fd7ba54824d74c3aac`

## 2026-10-24 — PR #251 final hardening: the Simulazione links the saved strategies only when they can be read (MP-REQ-UI-0290); in the visual scene the archive is not readable, so the link is absent

- Approval: MP-OWNER-UI006-FINAL-UI007-01
- Run: commit `f2cc06fc21c01b62dda0f6666e0c2b350719c8df`, chromium 141.0.7390.37
- Thresholds: block 8, pixel 32, ratio 0
- Baselines:
  - `simulazione-desktop.png` `ca5227501c8139a3868c0b011e1e7f54f4cf991e992b5041ae85ae8110cc4a4e`
  - `simulazione-ricerca-mobile.png` `426db5e48038167af34f174a5acae7372ec3aae88e3c4e57916ab9374b1f31aa`
  - `simulazione-tablet.png` `7befdc4ba62d943120c9fb8776e66b806df4c3f6603a011cd5b974b461a468a3`

## 2026-10-24 — MP-UI-PR-007 foundations: shared PIT / NON PIT badges on results and the Match Center cutoff, NON DISPONIBILE badge and per-status words in the shared error state, saved links only when their archive is active

- Approval: MP-OWNER-UI006-FINAL-UI007-01
- Run: commit `c60c1cab650065dbfda07f2f69942bd91e9427b2`, chromium 141.0.7390.37
- Thresholds: block 8, pixel 32, ratio 0
- Baselines:
  - `confronto-desktop.png` `b3aee8610c30c97f4541674021b803d730d99a38a855d86fb5399d7f7faae6ba`
  - `confronto-mobile.png` `8c3ba094ef1c237273486042525bdf4ae62d5e1e11451434b5d13f90444e25f5`
  - `confronto-tablet.png` `5ca679a4c5f84f1b1d2e3f6171ba9ec3f1ebe03648361def695929c0f4716338`
  - `oggi-errore-desktop.png` `40bfc61f7c077a382474186ba649aa14de968a8dbb62528a3ecc14a147883045`
  - `oggi-errore-mobile.png` `a11a12a1631dfaad669373692a202e8c940f2572cb3b6d7e7b045d5a08550849`
  - `oggi-errore-tablet.png` `5e44adfb2c1023ceeeaa19455abe78ad692df6f04f854fc19a7a2d1a6718b4f6`
  - `partita-confronto-desktop.png` `7c1cadca28aa578b565db451d38a7707710935e076d87a2a941f6223c1603c53`
  - `partita-confronto-mobile.png` `ae2a858fcdf280685f76f73b4a5b9d8e9e99f8fe4ed3b693394e721966f5f630`
  - `partita-confronto-tablet.png` `2b2d7f62199b4ad63d05ceb01da44f431dd856ba9cc59fefaea9adbdbaa4c0b5`
  - `partita-desktop.png` `b905cc4920005d84caf435a33a22173c413aada70ebd052df65b9fd7bb86b832`
  - `partita-mobile.png` `b872637371f08a6e3d6f53aabad3f982901fbbd30f6e3ffd5e0949c450b38abc`
  - `partita-senza-storico-desktop.png` `292398786402f1cc64626c4aa5197258f4411cbe7a6bd54d3533c5a182ff11b2`
  - `partita-senza-storico-mobile.png` `3af94c6b46a18a6d08c4e85e71a1a36ed4243a6070078bb3aa75203eb3cd6c14`
  - `partita-senza-storico-tablet.png` `74473d503d7a7081cf59ca4536dd301fde0cabe952be0e10b974c6c3edd4c872`
  - `partita-tablet.png` `2181d35ce1ad8857a4cec6d926560a58b9b0389253d933bb119666014ec6152b`
  - `simulazione-ricerca-desktop.png` `0c5ad3f6113d8325a66a78cfcf4abd1b7ceaab4f99fdae64e8147b1323ac7a7b`
  - `simulazione-ricerca-mobile.png` `6d3fceb7689094e310f31c611e968b1ae59801d7a33419d427c72a944948fde0`
  - `simulazione-ricerca-tablet.png` `363c1de2e9fdbaab9d4c288bce933926827a9f003c28d07e34282d89eb96788d`

## 2026-10-31 — MP-UI-PR-009-NAV: search field «Cerca» in the header of every scene (own row on tablet and phone)

- Approval: MP-UI-PR-009-NAV, MP-OWNER-AUTONOMOUS-SAFE-AUTOMERGE-20261031 (#239)
- Run: commit `8c6508fc1a7ec6f35e1070d5d325404d127ab79f`, chromium 141.0.7390.37
- Thresholds: block 8, pixel 32, ratio 0
- Baselines:
  - `confronto-mobile.png` `0755aa1cca122b43d7e6444f9d56ac6d363b25a8ca7321dbe1d77c24d2721be2`
  - `confronto-tablet.png` `a1a31a476f8f6b3fb975dc90fd1747552ed7c5e265f6108b5d4e2de8ecc4ea27`
  - `dati-desktop.png` `42bcbd26dde4c775d4778ac49456ae7dca1eb136b44d63f982f6edab36963396`
  - `dati-mobile.png` `b00341d3b41bdd105c78fcb90eb77edae9808069ecf36ff572124e2bfce94d59`
  - `dati-parziale-mobile.png` `d2b40e8b4891fcdb20ed2a321d70993cfb78590919e6b78c94854def42208d47`
  - `dati-parziale-tablet.png` `b257e386c46d441f6902191e84f6f2e9adbcb0cce260a18076bd1cdaaf570668`
  - `dati-tablet.png` `7362301ad40e6a79bf14113fa3062b7d52ae2b32ff2c4fa1a8e3159ce11e9298`
  - `non-trovata-desktop.png` `76d7ea79ba2848e132e376e02091fafe317bf6c9fd08ded15bfa69bb954db838`
  - `non-trovata-mobile.png` `8da334dd23405e4e87a6d1c3811690bdb79c1c09233558a8b3cba8bfcbbe6858`
  - `non-trovata-tablet.png` `85ec255a27b673ed7cd2be187ef687ff2de2dc5558bfe7195bf837dcf99b9754`
  - `oggi-caricamento-desktop.png` `7bf1291523be37f9e232af6b8515c87530a601af0a49c502aa6afbcefd8f1c1b`
  - `oggi-caricamento-mobile.png` `cd78f3efcc859e0490bcf11b89bd1858a47b156be4cca37ffa2a9b54d41e8aee`
  - `oggi-caricamento-tablet.png` `acd4271e21c354e641f762ba0138e3ee5f1b6cf8c7da2d4a0e66932bb1428ccf`
  - `oggi-desktop.png` `ab1ee6897e0af2b240ce1a0f169e2ba6d0f24bcda8ce815f9ed6b69d73bf2828`
  - `oggi-errore-desktop.png` `d7062e9b58a0a23112c7a5c2a201296a3b79e9f144ff30cf97380573f5668d19`
  - `oggi-errore-mobile.png` `f470d728aec2beceb475717e9e322e725c6f8d142dd1b1f4144db2a0c6636928`
  - `oggi-errore-tablet.png` `9c1f37ca1ee7f5fb6b41e53c9c5e2746116354817b297e46746e21d4471ab8ac`
  - `oggi-mobile.png` `17eea685bb11bfa856bc4290e12192eca9b69263b10aff1e6848fbdb0c3399ca`
  - `oggi-oggi-desktop.png` `91c37bc5370b4f03d6cc3357c17c1b6457556034ac63aa34962b2912feab1fa5`
  - `oggi-oggi-mobile.png` `34bca3a7a2c637a53be5783d98eb2512c68ac5e800fdb20f8814fd619996be8d`
  - `oggi-oggi-tablet.png` `af5811355b3e05fbe3cc7e8f8f39649ce8742ac336d8249f5d4bca069b95ce0a`
  - `oggi-righe-mobile.png` `362cced55839edffe292d53ddade041ffe4a41850a25725ac7a332cadf20a375`
  - `oggi-righe-tablet.png` `f3e600e14f93ee30e9dba61b74caf633da8159075c9826c0dfd6c625c4ae0933`
  - `oggi-tablet.png` `8e953100b5c1cbf3aacc9e0fa120636b0f9223b420b2541f938204d720a6019d`
  - `oggi-vuoto-desktop.png` `41274cc0c1a6388bc4b9ad102206803cc3c1633d3c6c0f322d323b8b1791f2f8`
  - `oggi-vuoto-mobile.png` `4170e89f334f44ac8702899b5cb2b9cb651d3adabb74a58458013ef2aa08863e`
  - `oggi-vuoto-tablet.png` `af1a8906237f70c0fe92bb8cb47f97b05cb6fd79f8b44117a46452be9c58fd78`
  - `partita-confronto-mobile.png` `3d62b01304885dd3fd8150299760692360f48198e2c89b4f22e9bf61a5783763`
  - `partita-confronto-tablet.png` `a6c37b6c38982d4ab6068d9b966a1d1fb880f043c5fd3630edb69a4c3dd4f94a`
  - `partita-desktop.png` `5010865c3cccdc131b1b1759bcbf0138a748c8717ecbb2fdf5436668a1976d38`
  - `partita-mobile.png` `cdafa984fddbc0ef1a46b8f86884c640236cc6fc9807156a93bd4a22a14e43ba`
  - `partita-senza-storico-mobile.png` `232481a0eb43c3aae95ea66c5cd000aa5057d5ab8a8451816c61af015f0d7690`
  - `partita-senza-storico-tablet.png` `650d3a17efc9b7392afaa4cb59a8e399ca4380a9a7b1160778c28e41d393a25b`
  - `partita-tablet.png` `9ef07c92f7b1097df1a66f932624891814682d11faf803c239f8db4b4e34710c`
  - `ricerca-desktop.png` `ad6b808509dff517f68b4c032852e0b25bf6633fe4c3a366417e1eb19707f1f7`
  - `ricerca-filtro-rifiutato-desktop.png` `575c7d39eafdc3f9835b40e860d683170379043b0bfa341b4b8a3c3b8ff6eb60`
  - `ricerca-filtro-rifiutato-mobile.png` `d885e8d6b2cbe280873352e5b2e11a965df59935c145c904b0cf602dd34a0dd9`
  - `ricerca-filtro-rifiutato-tablet.png` `1dc3ac0bf905465dc884383525f1e9976ce9889919d6fed33c1964cbd029b33c`
  - `ricerca-mobile.png` `d4598855fb666289a6fdee1b2e423e5878dc48acc306be48f5b78c569bf3fafe`
  - `ricerca-risultati-mobile.png` `6d1c99c205ebb9b9cccd2c5a23a0ab8bf74ebc983db64abf8da1c74297643a50`
  - `ricerca-risultati-tablet.png` `6dff3df278d9bdb7533e0b4fc05b7c3d30ca486c54e4b579d25b41991026aac5`
  - `ricerca-tablet.png` `1af8140561d82fb59651586dfd16946a368d0bc50fb518e84e01c50438c9e68c`
  - `simulazione-desktop.png` `3afba7afc8ae7d279c7fb104183341ed30b7e5bf13595c194d2d948a632c0372`
  - `simulazione-mobile.png` `613f479836f00383f476291eea157873879d9ca8930bbc2960465829dbaa54a6`
  - `simulazione-ricerca-mobile.png` `399e9c66cf6576fcf8ce1068defa4b54e015dbae21fd306bcd644c9d576353ea`
  - `simulazione-ricerca-tablet.png` `d643072975aed93116dac0ce0e611553a22e173292a56d32ea5ccef273661d77`
  - `simulazione-tablet.png` `45757229da9aa43f53c09bfa7bd6f3f8eec66a9c9108a45d06f4310924043e3d`
  - `strategie-private-desktop.png` `42d9b57cc56b6bc940c1493428d0f789aaab27f84baa80a39b3b0a3f70dc80fe`
  - `strategie-private-mobile.png` `4b3320a80cf88e180762ac3e0ab07fae03733f0a234b2b18457bf88d7aa611c5`
  - `strategie-private-tablet.png` `c2e125956afddb393946d3fae6068b635cd85b4b13a547ed2a94fc6d0062db61`
  - `strumenti-copertura-mobile.png` `7612f7230498a0d49a6ec580989895020df763ff48b1cb4cc69b574a4c99b42b`
  - `strumenti-copertura-tablet.png` `be09de7897538b754574896ed07546259d1f5829839649921bc822955b4bda5d`
  - `strumenti-desktop.png` `2a9d8276d22463a3cfc3218f860b7a052620d68e13103ec7bcc650c19aac5ba7`
  - `strumenti-mobile.png` `03d528ffbad038a76e9ce0768acdce82265395e4fb1e36a2a7332c81357d28b6`
  - `strumenti-tablet.png` `3270ff9e8733d304fdd52369e71b4b1e7c01f0aa7b5728311664e6ae1079b0ee`
