# FutPythonTrader — certificato finale 2026-10-05

**Esito: CERTIFIED WITH KNOWN LIMITATIONS**

Generato da `/api/futpython-certificate` sul servizio Render alle 2026-10-05T10:41:40.041Z (UTC). Ogni numero delle sezioni 1–17 viene dal report; nessun valore è stato scritto a mano. La sezione "Verifica incrociata" riporta controlli indipendenti fatti fuori dal report (query dirette su Neon e log Render). Issue #12 (FPT-CERT).

## Gate
| gate | esito |
| --- | --- |
| phase1_backfill | PASS |
| catalog | PASS |
| classification_phase2 | PASS |
| integrity | PASS |
| schema | PASS |
| coverage | PASS |
| seasons | PASS |
| point_in_time | PASS |
| entity_resolution | PASS |
| lineage | PASS |
| request_ledger | PASS |
| incremental_sync | PASS |
| watchdog | PASS |
| normalized_layer | PASS |
| filter_registry | PASS |
| assistant_query_layer | PASS |
| query_performance | PASS |

## 1. Identità
| campo | valore |
| --- | --- |
| certificate_version | fpt-cert-1 |
| generated_at | 2026-10-05T10:41:40.041Z |
| commit_sha | 9f09e1d1ea525c1ec364828994f38e931a906534 |
| git_branch | main |
| render_service_id | srv-davpi23ncjis73f9dkbg |
| render_service_name | matchpilot-test |
| render_external_url | https://matchpilot-test.onrender.com |
| node_version | v26.10.0 |
| neon_server_version | 18.6 (4e955f5) |
| database | neondb |
| db_now | 2026-10-05T10:41:39Z |
| last_migration | 014-fpt-normalized-layer.sql |
| last_migration_applied_at | 2026-10-05T08:52:23Z |
| migrations_applied | 14 |
| parser_version | fpt-csv-1 |
| schema_version | fpt-schema-4 |
| transform_version | fpt-norm-1 |
| data_contract | fpt-schema-4 |
| facts_version | fpt-facts-1 |
| filters_version | fpt-filters-1 |
| source_provider | futpythontrader |
| render_deploy_id | dep-db1ml36q1p3s73ffhpc0 |

## 2. Catalogo
| campo | valore |
| --- | --- |
| catalog_total | 1,027 |
| countries | 56 |
| leagues | 185 |
| classified_total | 1,027 |
| unclassified | 0 |
| duplicate_catalog_keys | 0 |
| inactive_rows | 0 |
| AVAILABLE | 615 |
| UNAVAILABLE_404 | 412 |
| ERROR_REAL | 0 |
| DEPRECATED | 0 |
| REMOVED | 0 |
| unknown | 0 |
| classification_sum | 1,027 |
| classified_total === catalog_total | true |

http_disposition: {"-":615,"INITIAL_404":412}

Gate: **PASS**

## 3. Dati
| campo | valore |
| --- | --- |
| snapshots | 617 |
| dataset_snapshots | 615 |
| today_snapshots | 2 |
| incomplete_snapshots | 0 |
| dataset_rows | 161777 |
| versions | 161801 |
| historical_versions | 161777 |
| prematch_versions | 24 |
| unique_matches | 161801 |
| min_date | 2020-09-11 |
| max_date | 2026-09-28 |

<details><summary>Per stagione (13)</summary>

| season | leghe | match |
| --- | --- | --- |
| 2020-2021 | 3 | 575 |
| 2021 | 39 | 10269 |
| 2021-2022 | 60 | 17709 |
| 2022 | 40 | 11238 |
| 2022-2023 | 62 | 18701 |
| 2023 | 40 | 11166 |
| 2023-2024 | 62 | 18686 |
| 2024 | 40 | 11237 |
| 2024-2025 | 62 | 18671 |
| 2025 | 40 | 11272 |
| 2025-2026 | 63 | 19023 |
| 2026 | 40 | 9092 |
| 2026-2027 | 64 | 4138 |

</details>

<details><summary>Per lega (106)</summary>

| lega | stagioni | versioni | match | prima | ultima |
| --- | --- | --- | --- | --- | --- |
| argentina/liga-profesional | 1 | 405 | 405 | 2026 | 2026 |
| argentina/primera-nacional | 6 | 3858 | 3858 | 2021 | 2026 |
| argentina/torneo-betano | 4 | 1644 | 1644 | 2022 | 2025 |
| australia/a-league | 6 | 995 | 995 | 2020-2021 | 2025-2026 |
| austria/2-liga | 6 | 1239 | 1239 | 2021-2022 | 2026-2027 |
| austria/bundesliga | 7 | 1214 | 1214 | 2020-2021 | 2026-2027 |
| belgium/challenger-pro-league | 6 | 1082 | 1082 | 2021-2022 | 2026-2027 |
| belgium/jupiler-pro-league | 7 | 1905 | 1905 | 2020-2021 | 2026-2027 |
| bolivia/division-profesional | 6 | 1574 | 1574 | 2021 | 2026 |
| bosnia-and-herzegovina/wwin-liga-bih | 6 | 1012 | 1012 | 2021-2022 | 2026-2027 |
| brazil/serie-a-betano | 6 | 2177 | 2177 | 2021 | 2026 |
| brazil/serie-b | 6 | 2189 | 2189 | 2021 | 2026 |
| brazil/serie-c | 6 | 1272 | 1272 | 2021 | 2026 |
| brazil/serie-d | 6 | 3168 | 3168 | 2021 | 2026 |
| bulgaria/efbet-league | 6 | 1449 | 1449 | 2021-2022 | 2026-2027 |
| chile/liga-de-ascenso | 6 | 1467 | 1467 | 2021 | 2026 |
| chile/liga-de-primera | 6 | 1429 | 1429 | 2021 | 2026 |
| china/super-league | 6 | 1414 | 1414 | 2021 | 2026 |
| colombia/primera-a | 6 | 2496 | 2496 | 2021 | 2026 |
| colombia/primera-b | 6 | 1708 | 1708 | 2021 | 2026 |
| croatia/hnl | 6 | 939 | 939 | 2021-2022 | 2026-2027 |
| cyprus/cyprus-league | 6 | 1236 | 1236 | 2021-2022 | 2026-2027 |
| czech-republic/chance-liga | 6 | 1472 | 1472 | 2021-2022 | 2026-2027 |
| czech-republic/chnl | 6 | 1272 | 1272 | 2021-2022 | 2026-2027 |
| denmark/1st-division | 6 | 1014 | 1014 | 2021-2022 | 2026-2027 |
| denmark/superliga | 6 | 1019 | 1019 | 2021-2022 | 2026-2027 |
| ecuador/liga-pro | 6 | 1526 | 1526 | 2021 | 2026 |
| ecuador/serie-b | 6 | 1068 | 1068 | 2021 | 2026 |
| egypt/premier-league | 6 | 1515 | 1515 | 2021-2022 | 2026-2027 |
| england/championship | 6 | 2880 | 2880 | 2021-2022 | 2026-2027 |
| england/league-one | 6 | 2872 | 2872 | 2021-2022 | 2026-2027 |
| england/league-two | 6 | 2879 | 2879 | 2021-2022 | 2026-2027 |
| england/premier-league | 6 | 1950 | 1950 | 2021-2022 | 2026-2027 |
| estonia/meistriliiga | 6 | 1031 | 1031 | 2021 | 2026 |
| europe/champions-league | 6 | 1289 | 1289 | 2021-2022 | 2026-2027 |
| europe/conference-league | 1 | 258 | 258 | 2026-2027 | 2026-2027 |
| europe/europa-conference-league | 4 | 1650 | 1650 | 2022-2023 | 2025-2026 |
| europe/europa-league | 6 | 1147 | 1147 | 2021-2022 | 2026-2027 |
| finland/veikkausliiga | 6 | 1004 | 1004 | 2021 | 2026 |
| finland/ykkosliiga | 6 | 880 | 880 | 2021 | 2026 |
| france/ligue-1 | 6 | 1739 | 1739 | 2021-2022 | 2026-2027 |
| france/ligue-2 | 6 | 1821 | 1821 | 2021-2022 | 2026-2027 |
| france/ligue-3 | 2 | 342 | 342 | 2025-2026 | 2026-2027 |
| germany/2-bundesliga | 6 | 1594 | 1594 | 2021-2022 | 2026-2027 |
| germany/3-liga | 6 | 1963 | 1963 | 2021-2022 | 2026-2027 |
| germany/bundesliga | 6 | 1576 | 1576 | 2021-2022 | 2026-2027 |
| greece/super-league | 6 | 1229 | 1229 | 2021-2022 | 2026-2027 |
| iceland/besta-deild-karla | 6 | 924 | 924 | 2021 | 2026 |
| iceland/division-1 | 6 | 812 | 812 | 2021 | 2026 |
| ireland/division-1 | 6 | 998 | 998 | 2021 | 2026 |
| ireland/premier-division | 6 | 1068 | 1068 | 2021 | 2026 |
| israel/ligat-ha-al | 6 | 1235 | 1235 | 2021-2022 | 2026-2027 |
| italy/serie-a | 6 | 1951 | 1951 | 2021-2022 | 2026-2027 |
| italy/serie-b | 6 | 2000 | 2000 | 2021-2022 | 2026-2027 |
| italy/serie-c-group-a | 6 | 1970 | 1970 | 2021-2022 | 2026-2027 |
| italy/serie-c-group-b | 6 | 1946 | 1946 | 2021-2022 | 2026-2027 |
| italy/serie-c-group-c | 6 | 1947 | 1947 | 2021-2022 | 2026-2027 |
| japan/j1-league | 7 | 2036 | 2036 | 2021 | 2026-2027 |
| japan/j2-j3-league | 1 | 400 | 400 | 2026 | 2026 |
| japan/j2-league | 6 | 2235 | 2235 | 2021 | 2026-2027 |
| mexico/liga-de-expansion-mx | 6 | 1459 | 1459 | 2021-2022 | 2026-2027 |
| mexico/liga-mx | 5 | 1447 | 1447 | 2022-2023 | 2026-2027 |
| netherlands/eerste-divisie | 6 | 2030 | 2030 | 2021-2022 | 2026-2027 |
| netherlands/eredivisie | 6 | 1666 | 1666 | 2021-2022 | 2026-2027 |
| northern-ireland/nifl-premiership | 6 | 1216 | 1216 | 2021-2022 | 2026-2027 |
| norway/eliteserien | 6 | 1377 | 1377 | 2021 | 2026 |
| norway/obos-ligaen | 6 | 1419 | 1419 | 2021 | 2026 |
| paraguay/copa-de-primera | 6 | 1436 | 1436 | 2021 | 2026 |
| paraguay/division-intermedia | 6 | 1466 | 1466 | 2021 | 2026 |
| peru/liga-1 | 6 | 1812 | 1812 | 2021 | 2026 |
| peru/liga-2 | 6 | 1007 | 1007 | 2021 | 2026 |
| poland/division-1 | 6 | 1625 | 1625 | 2021-2022 | 2026-2027 |
| poland/ekstraklasa | 6 | 1608 | 1608 | 2021-2022 | 2026-2027 |
| portugal/liga-portugal | 6 | 1602 | 1602 | 2021-2022 | 2026-2027 |
| portugal/liga-portugal-2 | 6 | 1597 | 1597 | 2021-2022 | 2026-2027 |
| romania/liga-2 | 6 | 1486 | 1486 | 2021-2022 | 2026-2027 |
| romania/superliga | 6 | 1681 | 1681 | 2021-2022 | 2026-2027 |
| saudi-arabia/division-1 | 6 | 1663 | 1663 | 2021-2022 | 2026-2027 |
| saudi-arabia/saudi-professional-league | 6 | 1461 | 1461 | 2021-2022 | 2026-2027 |
| scotland/championship | 6 | 969 | 969 | 2021-2022 | 2026-2027 |
| scotland/premiership | 6 | 1212 | 1212 | 2021-2022 | 2026-2027 |
| serbia/mozzart-bet-super-liga | 6 | 1564 | 1564 | 2021-2022 | 2026-2027 |
| slovakia/nike-liga | 6 | 1027 | 1027 | 2021-2022 | 2026-2027 |
| slovenia/prva-liga | 6 | 939 | 939 | 2021-2022 | 2026-2027 |
| south-africa/betway-premiership | 6 | 1262 | 1262 | 2021-2022 | 2026-2027 |
| south-america/copa-libertadores | 6 | 925 | 925 | 2021 | 2026 |
| south-america/copa-sudamericana | 6 | 937 | 937 | 2021 | 2026 |
| south-korea/k-league-1 | 6 | 1339 | 1339 | 2021 | 2026 |
| south-korea/k-league-2 | 6 | 1365 | 1365 | 2021 | 2026 |
| spain/laliga | 6 | 1969 | 1969 | 2021-2022 | 2026-2027 |
| spain/laliga2 | 6 | 2417 | 2417 | 2021-2022 | 2026-2027 |
| spain/primera-rfef-group-1 | 6 | 1950 | 1950 | 2021-2022 | 2026-2027 |
| spain/primera-rfef-group-2 | 6 | 1949 | 1949 | 2021-2022 | 2026-2027 |
| sweden/allsvenskan | 6 | 1386 | 1386 | 2021 | 2026 |
| sweden/superettan | 6 | 1420 | 1420 | 2021 | 2026 |
| switzerland/challenge-league | 6 | 947 | 947 | 2021-2022 | 2026-2027 |
| switzerland/super-league | 6 | 1108 | 1108 | 2021-2022 | 2026-2027 |
| turkey/1-lig | 6 | 1855 | 1855 | 2021-2022 | 2026-2027 |
| turkey/super-lig | 6 | 1804 | 1804 | 2021-2022 | 2026-2027 |
| ukraine/premier-league | 6 | 1174 | 1174 | 2021-2022 | 2026-2027 |
| uruguay/liga-auf-uruguaya | 6 | 1668 | 1668 | 2021 | 2026 |
| uruguay/segunda-division | 6 | 1183 | 1183 | 2021 | 2026 |
| usa/mls | 6 | 2936 | 2936 | 2021 | 2026 |
| usa/usl-championship | 6 | 2512 | 2512 | 2021 | 2026 |
| venezuela/liga-futve | 6 | 1463 | 1463 | 2021 | 2026 |
| wales/cymru-premier | 6 | 1055 | 1055 | 2021-2022 | 2026-2027 |

</details>

<details><summary>Per dataset (615)</summary>

| dataset | versioni | match | min | max |
| --- | --- | --- | --- | --- |
| argentina/liga-profesional/2026 | 405 | 405 | 2026-01-22 | 2026-09-21 |
| argentina/primera-nacional/2021 | 590 | 590 | 2021-03-12 | 2021-12-21 |
| argentina/primera-nacional/2022 | 680 | 680 | 2022-02-11 | 2022-11-19 |
| argentina/primera-nacional/2023 | 669 | 669 | 2023-02-03 | 2023-12-02 |
| argentina/primera-nacional/2024 | 745 | 745 | 2024-02-02 | 2024-12-08 |
| argentina/primera-nacional/2025 | 634 | 634 | 2025-02-06 | 2025-11-30 |
| argentina/primera-nacional/2026 | 540 | 540 | 2026-02-13 | 2026-09-21 |
| argentina/torneo-betano/2022 | 378 | 378 | 2022-06-03 | 2022-10-25 |
| argentina/torneo-betano/2023 | 378 | 378 | 2023-01-27 | 2023-07-30 |
| argentina/torneo-betano/2024 | 378 | 378 | 2024-05-10 | 2024-12-16 |
| argentina/torneo-betano/2025 | 510 | 510 | 2025-01-23 | 2025-12-13 |
| australia/a-league/2020-2021 | 161 | 161 | 2020-12-28 | 2021-06-27 |
| australia/a-league/2021-2022 | 163 | 163 | 2021-11-19 | 2022-05-28 |
| australia/a-league/2022-2023 | 163 | 163 | 2022-10-07 | 2023-06-03 |
| australia/a-league/2023-2024 | 169 | 169 | 2023-10-20 | 2024-05-25 |
| australia/a-league/2024-2025 | 176 | 176 | 2024-10-18 | 2025-05-31 |
| australia/a-league/2025-2026 | 163 | 163 | 2025-10-17 | 2026-05-23 |
| austria/2-liga/2021-2022 | 240 | 240 | 2021-07-23 | 2022-05-22 |
| austria/2-liga/2022-2023 | 240 | 240 | 2022-07-22 | 2023-06-04 |
| austria/2-liga/2023-2024 | 240 | 240 | 2023-07-28 | 2024-05-25 |
| austria/2-liga/2024-2025 | 240 | 240 | 2024-08-02 | 2025-05-25 |
| austria/2-liga/2025-2026 | 223 | 223 | 2025-08-01 | 2026-05-14 |
| austria/2-liga/2026-2027 | 56 | 56 | 2026-07-31 | 2026-09-20 |
| austria/bundesliga/2020-2021 | 197 | 197 | 2020-09-11 | 2021-05-30 |
| austria/bundesliga/2021-2022 | 195 | 195 | 2021-07-23 | 2022-05-29 |
| austria/bundesliga/2022-2023 | 195 | 195 | 2022-07-22 | 2023-06-11 |
| austria/bundesliga/2023-2024 | 195 | 195 | 2023-07-28 | 2024-05-28 |
| austria/bundesliga/2024-2025 | 195 | 195 | 2024-08-02 | 2025-06-01 |
| austria/bundesliga/2025-2026 | 195 | 195 | 2025-08-01 | 2026-05-25 |
| austria/bundesliga/2026-2027 | 42 | 42 | 2026-07-31 | 2026-09-20 |
| belgium/challenger-pro-league/2021-2022 | 112 | 112 | 2021-08-13 | 2022-04-17 |
| belgium/challenger-pro-league/2022-2023 | 192 | 192 | 2022-08-12 | 2023-05-13 |
| belgium/challenger-pro-league/2023-2024 | 240 | 240 | 2023-08-11 | 2024-04-20 |
| belgium/challenger-pro-league/2024-2025 | 224 | 224 | 2024-08-16 | 2025-04-18 |
| belgium/challenger-pro-league/2025-2026 | 272 | 272 | 2025-08-08 | 2026-04-17 |
| belgium/challenger-pro-league/2026-2027 | 42 | 42 | 2026-08-14 | 2026-09-20 |
| belgium/jupiler-pro-league/2020-2021 | 217 | 217 | 2020-11-28 | 2021-05-23 |
| belgium/jupiler-pro-league/2021-2022 | 332 | 332 | 2021-07-23 | 2022-05-22 |
| belgium/jupiler-pro-league/2022-2023 | 330 | 330 | 2022-07-22 | 2023-06-04 |
| belgium/jupiler-pro-league/2023-2024 | 321 | 321 | 2023-07-28 | 2024-06-02 |
| belgium/jupiler-pro-league/2024-2025 | 321 | 321 | 2024-07-26 | 2025-05-29 |
| belgium/jupiler-pro-league/2025-2026 | 321 | 321 | 2025-07-25 | 2026-05-31 |
| belgium/jupiler-pro-league/2026-2027 | 63 | 63 | 2026-08-07 | 2026-09-20 |
| bolivia/division-profesional/2021 | 242 | 242 | 2021-03-09 | 2021-12-19 |
| bolivia/division-profesional/2022 | 335 | 335 | 2022-02-04 | 2022-11-30 |
| bolivia/division-profesional/2023 | 274 | 274 | 2023-02-04 | 2023-12-16 |
| bolivia/division-profesional/2024 | 321 | 321 | 2024-02-16 | 2024-12-23 |
| bolivia/division-profesional/2025 | 242 | 242 | 2025-03-28 | 2025-12-23 |
| bolivia/division-profesional/2026 | 160 | 160 | 2026-04-03 | 2026-09-18 |
| bosnia-and-herzegovina/wwin-liga-bih/2021-2022 | 198 | 198 | 2021-07-16 | 2022-05-29 |
| bosnia-and-herzegovina/wwin-liga-bih/2022-2023 | 198 | 198 | 2022-07-15 | 2023-05-28 |
| bosnia-and-herzegovina/wwin-liga-bih/2023-2024 | 198 | 198 | 2023-07-29 | 2024-05-26 |
| bosnia-and-herzegovina/wwin-liga-bih/2024-2025 | 198 | 198 | 2024-08-03 | 2025-05-31 |
| bosnia-and-herzegovina/wwin-liga-bih/2025-2026 | 180 | 180 | 2025-07-26 | 2026-05-26 |
| bosnia-and-herzegovina/wwin-liga-bih/2026-2027 | 40 | 40 | 2026-08-07 | 2026-09-20 |
| brazil/serie-a-betano/2021 | 380 | 380 | 2021-05-29 | 2021-12-09 |
| brazil/serie-a-betano/2022 | 380 | 380 | 2022-04-09 | 2022-11-13 |
| brazil/serie-a-betano/2023 | 380 | 380 | 2023-04-15 | 2023-12-06 |
| brazil/serie-a-betano/2024 | 380 | 380 | 2024-04-13 | 2024-12-08 |
| brazil/serie-a-betano/2025 | 380 | 380 | 2025-03-29 | 2025-12-07 |
| brazil/serie-a-betano/2026 | 277 | 277 | 2026-01-28 | 2026-09-20 |
| brazil/serie-b/2021 | 380 | 380 | 2021-05-28 | 2021-11-28 |
| brazil/serie-b/2022 | 380 | 380 | 2022-04-08 | 2022-11-06 |
| brazil/serie-b/2023 | 380 | 380 | 2023-04-14 | 2023-11-25 |
| brazil/serie-b/2024 | 380 | 380 | 2024-04-19 | 2024-11-24 |
| brazil/serie-b/2025 | 380 | 380 | 2025-04-04 | 2025-11-23 |
| brazil/serie-b/2026 | 289 | 289 | 2026-03-21 | 2026-09-21 |
| brazil/serie-c/2021 | 206 | 206 | 2021-05-29 | 2021-11-20 |
| brazil/serie-c/2022 | 216 | 216 | 2022-04-09 | 2022-10-08 |
| brazil/serie-c/2023 | 216 | 216 | 2023-05-02 | 2023-10-22 |
| brazil/serie-c/2024 | 216 | 216 | 2024-04-20 | 2024-10-19 |
| brazil/serie-c/2025 | 216 | 216 | 2025-04-12 | 2025-10-25 |
| brazil/serie-c/2026 | 202 | 202 | 2026-04-04 | 2026-09-20 |
| brazil/serie-d/2021 | 518 | 518 | 2021-05-26 | 2021-11-13 |
| brazil/serie-d/2022 | 510 | 510 | 2022-04-17 | 2022-09-25 |
| brazil/serie-d/2023 | 510 | 510 | 2023-05-06 | 2023-09-16 |
| brazil/serie-d/2024 | 510 | 510 | 2024-04-27 | 2024-09-29 |
| brazil/serie-d/2025 | 510 | 510 | 2025-04-19 | 2025-10-04 |
| brazil/serie-d/2026 | 610 | 610 | 2026-04-04 | 2026-09-13 |
| bulgaria/efbet-league/2021-2022 | 223 | 223 | 2021-07-23 | 2022-05-28 |
| bulgaria/efbet-league/2022-2023 | 284 | 284 | 2022-07-08 | 2023-06-11 |
| bulgaria/efbet-league/2023-2024 | 284 | 284 | 2023-07-14 | 2024-05-31 |
| bulgaria/efbet-league/2024-2025 | 295 | 295 | 2024-07-19 | 2025-05-31 |
| bulgaria/efbet-league/2025-2026 | 294 | 294 | 2025-07-18 | 2026-05-29 |
| bulgaria/efbet-league/2026-2027 | 69 | 69 | 2026-07-17 | 2026-09-20 |
| chile/liga-de-ascenso/2021 | 246 | 246 | 2021-04-03 | 2021-12-10 |
| chile/liga-de-ascenso/2022 | 280 | 280 | 2022-02-15 | 2022-11-27 |
| chile/liga-de-ascenso/2023 | 252 | 252 | 2023-02-10 | 2023-12-10 |
| chile/liga-de-ascenso/2024 | 252 | 252 | 2024-02-23 | 2024-12-07 |
| chile/liga-de-ascenso/2025 | 240 | 240 | 2025-02-21 | 2025-11-02 |
| chile/liga-de-ascenso/2026 | 197 | 197 | 2026-02-20 | 2026-09-15 |
| chile/liga-de-primera/2021 | 274 | 274 | 2021-03-27 | 2022-01-26 |
| chile/liga-de-primera/2022 | 240 | 240 | 2022-02-04 | 2022-11-06 |
| chile/liga-de-primera/2023 | 240 | 240 | 2023-01-20 | 2023-12-09 |
| chile/liga-de-primera/2024 | 240 | 240 | 2024-02-16 | 2024-11-10 |
| chile/liga-de-primera/2025 | 252 | 252 | 2025-02-14 | 2025-12-07 |
| chile/liga-de-primera/2026 | 183 | 183 | 2026-01-30 | 2026-09-16 |
| china/super-league/2021 | 180 | 180 | 2021-04-20 | 2022-01-12 |
| china/super-league/2022 | 306 | 306 | 2022-06-03 | 2022-12-31 |
| china/super-league/2023 | 240 | 240 | 2023-04-15 | 2023-11-04 |
| china/super-league/2024 | 240 | 240 | 2024-03-01 | 2024-11-02 |
| china/super-league/2025 | 240 | 240 | 2025-02-22 | 2025-11-22 |
| china/super-league/2026 | 208 | 208 | 2026-03-06 | 2026-09-18 |
| colombia/primera-a/2021 | 411 | 411 | 2021-01-16 | 2021-12-22 |
| colombia/primera-a/2022 | 452 | 452 | 2022-01-20 | 2022-12-07 |
| colombia/primera-a/2023 | 452 | 452 | 2023-01-24 | 2023-12-13 |
| colombia/primera-a/2024 | 432 | 432 | 2024-01-19 | 2024-12-22 |
| colombia/primera-a/2025 | 452 | 452 | 2025-01-24 | 2025-12-16 |
| colombia/primera-a/2026 | 297 | 297 | 2026-01-16 | 2026-09-20 |
| colombia/primera-b/2021 | 278 | 278 | 2021-01-15 | 2022-03-10 |
| colombia/primera-b/2022 | 289 | 289 | 2022-01-22 | 2022-11-29 |
| colombia/primera-b/2023 | 310 | 310 | 2023-02-02 | 2023-11-28 |
| colombia/primera-b/2024 | 310 | 310 | 2024-02-02 | 2024-12-14 |
| colombia/primera-b/2025 | 308 | 308 | 2025-01-30 | 2025-12-02 |
| colombia/primera-b/2026 | 213 | 213 | 2026-01-23 | 2026-09-21 |
| croatia/hnl/2021-2022 | 180 | 180 | 2021-07-16 | 2022-05-21 |
| croatia/hnl/2022-2023 | 180 | 180 | 2022-07-15 | 2023-05-28 |
| croatia/hnl/2023-2024 | 180 | 180 | 2023-07-21 | 2024-05-26 |
| croatia/hnl/2024-2025 | 180 | 180 | 2024-08-02 | 2025-05-25 |
| croatia/hnl/2025-2026 | 180 | 180 | 2025-08-01 | 2026-05-23 |
| croatia/hnl/2026-2027 | 39 | 39 | 2026-07-31 | 2026-09-20 |
| cyprus/cyprus-league/2021-2022 | 192 | 192 | 2021-08-20 | 2022-05-22 |
| cyprus/cyprus-league/2022-2023 | 268 | 268 | 2022-08-26 | 2023-05-29 |
| cyprus/cyprus-league/2023-2024 | 268 | 268 | 2023-08-18 | 2024-05-12 |
| cyprus/cyprus-league/2024-2025 | 240 | 240 | 2024-08-23 | 2025-05-18 |
| cyprus/cyprus-league/2025-2026 | 240 | 240 | 2025-08-22 | 2026-05-22 |
| cyprus/cyprus-league/2026-2027 | 28 | 28 | 2026-08-28 | 2026-09-20 |
| czech-republic/chance-liga/2021-2022 | 280 | 280 | 2021-07-24 | 2022-05-22 |
| czech-republic/chance-liga/2022-2023 | 280 | 280 | 2022-07-30 | 2023-06-04 |
| czech-republic/chance-liga/2023-2024 | 281 | 281 | 2023-07-22 | 2024-06-02 |
| czech-republic/chance-liga/2024-2025 | 280 | 280 | 2024-07-19 | 2025-06-01 |
| czech-republic/chance-liga/2025-2026 | 280 | 280 | 2025-07-18 | 2026-05-31 |
| czech-republic/chance-liga/2026-2027 | 71 | 71 | 2026-07-25 | 2026-09-20 |
| czech-republic/chnl/2021-2022 | 240 | 240 | 2021-07-23 | 2022-05-14 |
| czech-republic/chnl/2022-2023 | 240 | 240 | 2022-07-29 | 2023-05-28 |
| czech-republic/chnl/2023-2024 | 240 | 240 | 2023-07-21 | 2024-05-25 |
| czech-republic/chnl/2024-2025 | 240 | 240 | 2024-07-19 | 2025-05-25 |
| czech-republic/chnl/2025-2026 | 240 | 240 | 2025-07-18 | 2026-05-23 |
| czech-republic/chnl/2026-2027 | 72 | 72 | 2026-07-24 | 2026-09-20 |
| denmark/1st-division/2021-2022 | 192 | 192 | 2021-07-23 | 2022-05-29 |
| denmark/1st-division/2022-2023 | 192 | 192 | 2022-07-22 | 2023-06-04 |
| denmark/1st-division/2023-2024 | 192 | 192 | 2023-07-21 | 2024-06-02 |
| denmark/1st-division/2024-2025 | 192 | 192 | 2024-07-19 | 2025-05-23 |
| denmark/1st-division/2025-2026 | 192 | 192 | 2025-07-18 | 2026-05-31 |
| denmark/1st-division/2026-2027 | 54 | 54 | 2026-07-24 | 2026-09-21 |
| denmark/superliga/2021-2022 | 193 | 193 | 2021-07-16 | 2022-05-29 |
| denmark/superliga/2022-2023 | 193 | 193 | 2022-07-15 | 2023-06-09 |
| denmark/superliga/2023-2024 | 193 | 193 | 2023-07-21 | 2024-05-31 |
| denmark/superliga/2024-2025 | 193 | 193 | 2024-07-19 | 2025-06-01 |
| denmark/superliga/2025-2026 | 193 | 193 | 2025-07-18 | 2026-05-21 |
| denmark/superliga/2026-2027 | 54 | 54 | 2026-07-24 | 2026-09-20 |
| ecuador/liga-pro/2021 | 242 | 242 | 2021-02-19 | 2021-12-12 |
| ecuador/liga-pro/2022 | 242 | 242 | 2022-02-18 | 2022-11-13 |
| ecuador/liga-pro/2023 | 242 | 242 | 2023-02-24 | 2023-12-17 |
| ecuador/liga-pro/2024 | 242 | 242 | 2024-03-01 | 2024-12-14 |
| ecuador/liga-pro/2025 | 311 | 311 | 2025-02-14 | 2025-12-21 |
| ecuador/liga-pro/2026 | 247 | 247 | 2026-02-20 | 2026-09-21 |
| ecuador/serie-b/2021 | 180 | 180 | 2021-03-16 | 2021-10-13 |
| ecuador/serie-b/2022 | 180 | 180 | 2022-03-15 | 2022-10-30 |
| ecuador/serie-b/2023 | 180 | 180 | 2023-03-21 | 2023-10-26 |
| ecuador/serie-b/2024 | 180 | 180 | 2024-03-12 | 2024-10-30 |
| ecuador/serie-b/2025 | 192 | 192 | 2025-03-18 | 2025-10-30 |
| ecuador/serie-b/2026 | 156 | 156 | 2026-03-18 | 2026-09-19 |
| egypt/premier-league/2021-2022 | 306 | 306 | 2021-10-25 | 2022-08-30 |
| egypt/premier-league/2022-2023 | 306 | 306 | 2022-10-18 | 2023-07-26 |
| egypt/premier-league/2023-2024 | 306 | 306 | 2023-09-18 | 2024-08-18 |
| egypt/premier-league/2024-2025 | 225 | 225 | 2024-10-30 | 2025-05-31 |
| egypt/premier-league/2025-2026 | 322 | 322 | 2025-08-08 | 2026-05-29 |
| egypt/premier-league/2026-2027 | 50 | 50 | 2026-08-21 | 2026-09-17 |
| england/championship/2021-2022 | 557 | 557 | 2021-08-06 | 2022-05-29 |
| england/championship/2022-2023 | 557 | 557 | 2022-07-29 | 2023-05-27 |
| england/championship/2023-2024 | 557 | 557 | 2023-08-04 | 2024-05-26 |
| england/championship/2024-2025 | 557 | 557 | 2024-08-09 | 2025-05-24 |
| england/championship/2025-2026 | 557 | 557 | 2025-08-08 | 2026-05-23 |
| england/championship/2026-2027 | 95 | 95 | 2026-08-14 | 2026-09-20 |
| england/league-one/2021-2022 | 557 | 557 | 2021-08-07 | 2022-05-21 |
| england/league-one/2022-2023 | 557 | 557 | 2022-07-30 | 2023-05-29 |
| england/league-one/2023-2024 | 557 | 557 | 2023-08-05 | 2024-05-18 |
| england/league-one/2024-2025 | 557 | 557 | 2024-08-09 | 2025-05-25 |
| england/league-one/2025-2026 | 557 | 557 | 2025-08-01 | 2026-05-24 |
| england/league-one/2026-2027 | 87 | 87 | 2026-08-15 | 2026-09-26 |
| england/league-two/2021-2022 | 557 | 557 | 2021-08-07 | 2022-05-28 |
| england/league-two/2022-2023 | 557 | 557 | 2022-07-30 | 2023-05-28 |
| england/league-two/2023-2024 | 557 | 557 | 2023-08-05 | 2024-05-19 |
| england/league-two/2024-2025 | 557 | 557 | 2024-08-09 | 2025-05-26 |
| england/league-two/2025-2026 | 557 | 557 | 2025-08-02 | 2026-05-25 |
| england/league-two/2026-2027 | 94 | 94 | 2026-08-15 | 2026-09-26 |
| england/premier-league/2021-2022 | 380 | 380 | 2021-08-13 | 2022-05-22 |
| england/premier-league/2022-2023 | 380 | 380 | 2022-08-05 | 2023-05-28 |
| england/premier-league/2023-2024 | 380 | 380 | 2023-08-11 | 2024-05-19 |
| england/premier-league/2024-2025 | 380 | 380 | 2024-08-16 | 2025-05-25 |
| england/premier-league/2025-2026 | 380 | 380 | 2025-08-15 | 2026-05-24 |
| england/premier-league/2026-2027 | 50 | 50 | 2026-08-21 | 2026-09-20 |
| estonia/meistriliiga/2021 | 158 | 158 | 2021-03-13 | 2021-12-05 |
| estonia/meistriliiga/2022 | 182 | 182 | 2022-03-01 | 2022-11-27 |
| estonia/meistriliiga/2023 | 182 | 182 | 2023-03-03 | 2023-12-03 |
| estonia/meistriliiga/2024 | 182 | 182 | 2024-03-01 | 2024-11-30 |
| estonia/meistriliiga/2025 | 182 | 182 | 2025-02-28 | 2025-11-29 |
| estonia/meistriliiga/2026 | 145 | 145 | 2026-03-07 | 2026-09-20 |
| europe/champions-league/2021-2022 | 218 | 218 | 2021-06-22 | 2022-05-28 |
| europe/champions-league/2022-2023 | 214 | 214 | 2022-06-21 | 2023-06-10 |
| europe/champions-league/2023-2024 | 214 | 214 | 2023-06-27 | 2024-06-01 |
| europe/champions-league/2024-2025 | 279 | 279 | 2024-07-09 | 2025-05-31 |
| europe/champions-league/2025-2026 | 281 | 281 | 2025-07-08 | 2026-05-30 |
| europe/champions-league/2026-2027 | 83 | 83 | 2026-07-07 | 2026-08-19 |
| europe/conference-league/2026-2027 | 258 | 258 | 2026-07-07 | 2026-08-27 |
| europe/europa-conference-league/2022-2023 | 415 | 415 | 2022-07-05 | 2023-06-07 |
| europe/europa-conference-league/2023-2024 | 417 | 417 | 2023-07-12 | 2024-05-29 |
| europe/europa-conference-league/2024-2025 | 409 | 409 | 2024-07-10 | 2025-05-28 |
| europe/europa-conference-league/2025-2026 | 409 | 409 | 2025-07-08 | 2026-05-27 |
| europe/europa-league/2021-2022 | 177 | 177 | 2021-08-03 | 2022-05-18 |
| europe/europa-league/2022-2023 | 175 | 175 | 2022-08-04 | 2023-05-31 |
| europe/europa-league/2023-2024 | 175 | 175 | 2023-08-08 | 2024-05-22 |
| europe/europa-league/2024-2025 | 269 | 269 | 2024-07-11 | 2025-05-21 |
| europe/europa-league/2025-2026 | 271 | 271 | 2025-07-10 | 2026-05-20 |
| europe/europa-league/2026-2027 | 80 | 80 | 2026-07-09 | 2026-08-27 |
| finland/veikkausliiga/2021 | 164 | 164 | 2021-04-24 | 2021-11-07 |
| finland/veikkausliiga/2022 | 171 | 171 | 2022-04-02 | 2022-10-30 |
| finland/veikkausliiga/2023 | 171 | 171 | 2023-04-05 | 2023-11-05 |
| finland/veikkausliiga/2024 | 169 | 169 | 2024-04-06 | 2024-11-02 |
| finland/veikkausliiga/2025 | 179 | 179 | 2025-04-05 | 2025-11-09 |
| finland/veikkausliiga/2026 | 150 | 150 | 2026-04-04 | 2026-09-19 |
| finland/ykkosliiga/2021 | 162 | 162 | 2021-05-05 | 2021-10-23 |
| finland/ykkosliiga/2022 | 162 | 162 | 2022-04-18 | 2022-10-08 |
| finland/ykkosliiga/2023 | 162 | 162 | 2023-04-14 | 2023-10-07 |
| finland/ykkosliiga/2024 | 137 | 137 | 2024-04-13 | 2024-10-26 |
| finland/ykkosliiga/2025 | 137 | 137 | 2025-04-21 | 2025-10-26 |
| finland/ykkosliiga/2026 | 120 | 120 | 2026-04-03 | 2026-09-19 |
| france/ligue-1/2021-2022 | 384 | 384 | 2021-08-06 | 2022-05-29 |
| france/ligue-1/2022-2023 | 380 | 380 | 2022-08-05 | 2023-06-03 |
| france/ligue-1/2023-2024 | 310 | 310 | 2023-08-11 | 2024-06-02 |
| france/ligue-1/2024-2025 | 310 | 310 | 2024-08-16 | 2025-05-29 |
| france/ligue-1/2025-2026 | 310 | 310 | 2025-08-15 | 2026-05-29 |
| france/ligue-1/2026-2027 | 45 | 45 | 2026-08-21 | 2026-09-20 |
| france/ligue-2/2021-2022 | 382 | 382 | 2021-07-24 | 2022-05-29 |
| france/ligue-2/2022-2023 | 380 | 380 | 2022-07-30 | 2023-06-02 |
| france/ligue-2/2023-2024 | 380 | 380 | 2023-08-05 | 2024-05-17 |
| france/ligue-2/2024-2025 | 308 | 308 | 2024-08-16 | 2025-05-25 |
| france/ligue-2/2025-2026 | 308 | 308 | 2025-08-09 | 2026-05-24 |
| france/ligue-2/2026-2027 | 63 | 63 | 2026-08-08 | 2026-09-19 |
| france/ligue-3/2025-2026 | 272 | 272 | 2025-08-08 | 2026-05-15 |
| france/ligue-3/2026-2027 | 70 | 70 | 2026-08-07 | 2026-09-26 |
| germany/2-bundesliga/2021-2022 | 308 | 308 | 2021-07-23 | 2022-05-24 |
| germany/2-bundesliga/2022-2023 | 308 | 308 | 2022-07-15 | 2023-06-06 |
| germany/2-bundesliga/2023-2024 | 308 | 308 | 2023-07-28 | 2024-05-28 |
| germany/2-bundesliga/2024-2025 | 308 | 308 | 2024-08-02 | 2025-05-27 |
| germany/2-bundesliga/2025-2026 | 308 | 308 | 2025-08-01 | 2026-05-26 |
| germany/2-bundesliga/2026-2027 | 54 | 54 | 2026-08-07 | 2026-09-20 |
| germany/3-liga/2021-2022 | 373 | 373 | 2021-07-24 | 2022-05-14 |
| germany/3-liga/2022-2023 | 380 | 380 | 2022-07-22 | 2023-05-27 |
| germany/3-liga/2023-2024 | 380 | 380 | 2023-08-04 | 2024-05-18 |
| germany/3-liga/2024-2025 | 380 | 380 | 2024-08-02 | 2025-05-17 |
| germany/3-liga/2025-2026 | 380 | 380 | 2025-08-01 | 2026-05-16 |
| germany/3-liga/2026-2027 | 70 | 70 | 2026-08-07 | 2026-09-25 |
| germany/bundesliga/2021-2022 | 308 | 308 | 2021-08-13 | 2022-05-23 |
| germany/bundesliga/2022-2023 | 308 | 308 | 2022-08-05 | 2023-06-05 |
| germany/bundesliga/2023-2024 | 308 | 308 | 2023-08-18 | 2024-05-27 |
| germany/bundesliga/2024-2025 | 308 | 308 | 2024-08-23 | 2025-05-26 |
| germany/bundesliga/2025-2026 | 308 | 308 | 2025-08-22 | 2026-05-25 |
| germany/bundesliga/2026-2027 | 36 | 36 | 2026-08-28 | 2026-09-20 |
| greece/super-league/2021-2022 | 242 | 242 | 2021-09-11 | 2022-06-18 |
| greece/super-league/2022-2023 | 240 | 240 | 2022-08-19 | 2023-05-14 |
| greece/super-league/2023-2024 | 240 | 240 | 2023-08-18 | 2024-05-19 |
| greece/super-league/2024-2025 | 236 | 236 | 2024-08-17 | 2025-05-22 |
| greece/super-league/2025-2026 | 236 | 236 | 2025-08-23 | 2026-05-21 |
| greece/super-league/2026-2027 | 35 | 35 | 2026-08-22 | 2026-09-20 |
| iceland/besta-deild-karla/2021 | 132 | 132 | 2021-04-30 | 2021-09-25 |
| iceland/besta-deild-karla/2022 | 162 | 162 | 2022-04-18 | 2022-10-29 |
| iceland/besta-deild-karla/2023 | 162 | 162 | 2023-04-10 | 2023-10-08 |
| iceland/besta-deild-karla/2024 | 162 | 162 | 2024-04-06 | 2024-10-27 |
| iceland/besta-deild-karla/2025 | 162 | 162 | 2025-04-05 | 2025-10-26 |
| iceland/besta-deild-karla/2026 | 144 | 144 | 2026-04-10 | 2026-09-20 |
| iceland/division-1/2021 | 132 | 132 | 2021-05-06 | 2021-09-24 |
| iceland/division-1/2022 | 132 | 132 | 2022-05-05 | 2022-09-17 |
| iceland/division-1/2023 | 137 | 137 | 2023-05-05 | 2023-09-30 |
| iceland/division-1/2024 | 137 | 137 | 2024-05-01 | 2024-09-28 |
| iceland/division-1/2025 | 137 | 137 | 2025-05-02 | 2025-09-27 |
| iceland/division-1/2026 | 137 | 137 | 2026-04-24 | 2026-09-19 |
| ireland/division-1/2021 | 135 | 135 | 2021-03-26 | 2021-10-29 |
| ireland/division-1/2022 | 149 | 149 | 2022-02-18 | 2022-11-04 |
| ireland/division-1/2023 | 185 | 185 | 2023-02-17 | 2023-11-04 |
| ireland/division-1/2024 | 185 | 185 | 2024-02-16 | 2024-11-02 |
| ireland/division-1/2025 | 184 | 184 | 2025-02-14 | 2025-11-02 |
| ireland/division-1/2026 | 160 | 160 | 2026-02-13 | 2026-09-18 |
| ireland/premier-division/2021 | 186 | 186 | 2021-03-19 | 2021-11-26 |
| ireland/premier-division/2022 | 181 | 181 | 2022-02-18 | 2022-11-11 |
| ireland/premier-division/2023 | 181 | 181 | 2023-02-17 | 2023-11-10 |
| ireland/premier-division/2024 | 181 | 181 | 2024-02-16 | 2024-11-16 |
| ireland/premier-division/2025 | 181 | 181 | 2025-02-14 | 2025-11-07 |
| ireland/premier-division/2026 | 158 | 158 | 2026-02-06 | 2026-09-19 |
| israel/ligat-ha-al/2021-2022 | 240 | 240 | 2021-08-28 | 2022-05-21 |
| israel/ligat-ha-al/2022-2023 | 240 | 240 | 2022-08-20 | 2023-05-20 |
| israel/ligat-ha-al/2023-2024 | 240 | 240 | 2023-08-26 | 2024-05-25 |
| israel/ligat-ha-al/2024-2025 | 240 | 240 | 2024-08-24 | 2025-05-24 |
| israel/ligat-ha-al/2025-2026 | 240 | 240 | 2025-08-23 | 2026-05-23 |
| israel/ligat-ha-al/2026-2027 | 35 | 35 | 2026-08-22 | 2026-09-19 |
| italy/serie-a/2021-2022 | 380 | 380 | 2021-08-21 | 2022-05-22 |
| italy/serie-a/2022-2023 | 381 | 381 | 2022-08-13 | 2023-06-11 |
| italy/serie-a/2023-2024 | 380 | 380 | 2023-08-19 | 2024-06-02 |
| italy/serie-a/2024-2025 | 380 | 380 | 2024-08-17 | 2025-05-25 |
| italy/serie-a/2025-2026 | 380 | 380 | 2025-08-23 | 2026-05-24 |
| italy/serie-a/2026-2027 | 50 | 50 | 2026-08-22 | 2026-09-20 |
| italy/serie-b/2021-2022 | 390 | 390 | 2021-08-20 | 2022-05-29 |
| italy/serie-b/2022-2023 | 390 | 390 | 2022-08-12 | 2023-06-11 |
| italy/serie-b/2023-2024 | 390 | 390 | 2023-08-18 | 2024-06-02 |
| italy/serie-b/2024-2025 | 390 | 390 | 2024-08-16 | 2025-06-22 |
| italy/serie-b/2025-2026 | 390 | 390 | 2025-08-22 | 2026-05-29 |
| italy/serie-b/2026-2027 | 50 | 50 | 2026-08-21 | 2026-09-20 |
| italy/serie-c-group-a/2021-2022 | 380 | 380 | 2021-08-28 | 2022-04-24 |
| italy/serie-c-group-a/2022-2023 | 380 | 380 | 2022-09-03 | 2023-04-22 |
| italy/serie-c-group-a/2023-2024 | 380 | 380 | 2023-09-03 | 2024-04-28 |
| italy/serie-c-group-a/2024-2025 | 380 | 380 | 2024-08-23 | 2025-04-25 |
| italy/serie-c-group-a/2025-2026 | 380 | 380 | 2025-08-23 | 2026-04-25 |
| italy/serie-c-group-a/2026-2027 | 70 | 70 | 2026-08-21 | 2026-09-27 |
| italy/serie-c-group-b/2021-2022 | 380 | 380 | 2021-08-28 | 2022-04-23 |
| italy/serie-c-group-b/2022-2023 | 380 | 380 | 2022-09-04 | 2023-04-23 |
| italy/serie-c-group-b/2023-2024 | 380 | 380 | 2023-09-01 | 2024-04-28 |
| italy/serie-c-group-b/2024-2025 | 380 | 380 | 2024-08-23 | 2025-04-27 |
| italy/serie-c-group-b/2025-2026 | 357 | 357 | 2025-08-22 | 2026-04-26 |
| italy/serie-c-group-b/2026-2027 | 69 | 69 | 2026-08-21 | 2026-09-27 |
| italy/serie-c-group-c/2021-2022 | 376 | 376 | 2021-08-28 | 2022-04-24 |
| italy/serie-c-group-c/2022-2023 | 380 | 380 | 2022-09-04 | 2023-04-23 |
| italy/serie-c-group-c/2023-2024 | 380 | 380 | 2023-09-01 | 2024-04-27 |
| italy/serie-c-group-c/2024-2025 | 362 | 362 | 2024-08-23 | 2025-04-27 |
| italy/serie-c-group-c/2025-2026 | 380 | 380 | 2025-08-24 | 2026-04-26 |
| italy/serie-c-group-c/2026-2027 | 69 | 69 | 2026-08-21 | 2026-09-27 |
| japan/j1-league/2021 | 380 | 380 | 2021-02-26 | 2021-12-04 |
| japan/j1-league/2022 | 310 | 310 | 2022-02-18 | 2022-11-13 |
| japan/j1-league/2023 | 306 | 306 | 2023-02-17 | 2023-12-03 |
| japan/j1-league/2024 | 380 | 380 | 2024-02-23 | 2024-12-08 |
| japan/j1-league/2025 | 380 | 380 | 2025-02-14 | 2025-12-06 |
| japan/j1-league/2026 | 200 | 200 | 2026-02-06 | 2026-06-06 |
| japan/j1-league/2026-2027 | 80 | 80 | 2026-08-07 | 2026-09-20 |
| japan/j2-j3-league/2026 | 400 | 400 | 2026-02-07 | 2026-06-07 |
| japan/j2-league/2021 | 462 | 462 | 2021-02-27 | 2021-12-05 |
| japan/j2-league/2022 | 462 | 462 | 2022-02-19 | 2022-10-23 |
| japan/j2-league/2023 | 465 | 465 | 2023-02-18 | 2023-12-02 |
| japan/j2-league/2024 | 383 | 383 | 2024-02-24 | 2024-12-07 |
| japan/j2-league/2025 | 383 | 383 | 2025-02-15 | 2025-12-13 |
| japan/j2-league/2026-2027 | 80 | 80 | 2026-08-08 | 2026-09-26 |
| mexico/liga-de-expansion-mx/2021-2022 | 310 | 310 | 2021-07-27 | 2022-05-22 |
| mexico/liga-de-expansion-mx/2022-2023 | 344 | 344 | 2022-06-24 | 2023-06-03 |
| mexico/liga-de-expansion-mx/2023-2024 | 246 | 246 | 2023-07-21 | 2024-05-18 |
| mexico/liga-de-expansion-mx/2024-2025 | 240 | 240 | 2024-07-26 | 2025-06-07 |
| mexico/liga-de-expansion-mx/2025-2026 | 240 | 240 | 2025-08-01 | 2026-05-30 |
| mexico/liga-de-expansion-mx/2026-2027 | 79 | 79 | 2026-07-24 | 2026-09-26 |
| mexico/liga-mx/2022-2023 | 342 | 342 | 2022-07-01 | 2023-05-28 |
| mexico/liga-mx/2023-2024 | 340 | 340 | 2023-06-30 | 2024-05-26 |
| mexico/liga-mx/2024-2025 | 340 | 340 | 2024-07-05 | 2025-05-25 |
| mexico/liga-mx/2025-2026 | 337 | 337 | 2025-07-11 | 2026-05-24 |
| mexico/liga-mx/2026-2027 | 88 | 88 | 2026-07-16 | 2026-09-28 |
| netherlands/eerste-divisie/2021-2022 | 392 | 392 | 2021-08-06 | 2022-05-29 |
| netherlands/eerste-divisie/2022-2023 | 392 | 392 | 2022-08-05 | 2023-06-11 |
| netherlands/eerste-divisie/2023-2024 | 392 | 392 | 2023-08-11 | 2024-06-02 |
| netherlands/eerste-divisie/2024-2025 | 380 | 380 | 2024-08-09 | 2025-05-09 |
| netherlands/eerste-divisie/2025-2026 | 392 | 392 | 2025-08-08 | 2026-05-23 |
| netherlands/eerste-divisie/2026-2027 | 82 | 82 | 2026-08-07 | 2026-09-27 |
| netherlands/eredivisie/2021-2022 | 324 | 324 | 2021-08-13 | 2022-05-29 |
| netherlands/eredivisie/2022-2023 | 324 | 324 | 2022-08-05 | 2023-06-11 |
| netherlands/eredivisie/2023-2024 | 321 | 321 | 2023-08-11 | 2024-06-02 |
| netherlands/eredivisie/2024-2025 | 321 | 321 | 2024-08-09 | 2025-06-01 |
| netherlands/eredivisie/2025-2026 | 313 | 313 | 2025-08-08 | 2026-05-24 |
| netherlands/eredivisie/2026-2027 | 63 | 63 | 2026-08-07 | 2026-09-20 |
| northern-ireland/nifl-premiership/2021-2022 | 233 | 233 | 2021-08-27 | 2022-05-13 |
| northern-ireland/nifl-premiership/2022-2023 | 233 | 233 | 2022-08-12 | 2023-06-01 |
| northern-ireland/nifl-premiership/2023-2024 | 233 | 233 | 2023-08-04 | 2024-05-06 |
| northern-ireland/nifl-premiership/2024-2025 | 233 | 233 | 2024-08-09 | 2025-05-11 |
| northern-ireland/nifl-premiership/2025-2026 | 233 | 233 | 2025-08-09 | 2026-05-12 |
| northern-ireland/nifl-premiership/2026-2027 | 51 | 51 | 2026-08-07 | 2026-09-26 |
| norway/eliteserien/2021 | 241 | 241 | 2021-05-09 | 2021-12-15 |
| norway/eliteserien/2022 | 242 | 242 | 2022-04-02 | 2022-11-19 |
| norway/eliteserien/2023 | 242 | 242 | 2023-04-10 | 2023-12-10 |
| norway/eliteserien/2024 | 242 | 242 | 2024-03-31 | 2024-12-08 |
| norway/eliteserien/2025 | 242 | 242 | 2025-03-29 | 2025-12-11 |
| norway/eliteserien/2026 | 168 | 168 | 2026-03-14 | 2026-09-20 |
| norway/obos-ligaen/2021 | 247 | 247 | 2021-05-15 | 2021-12-12 |
| norway/obos-ligaen/2022 | 247 | 247 | 2022-04-02 | 2022-11-13 |
| norway/obos-ligaen/2023 | 247 | 247 | 2023-04-10 | 2023-12-03 |
| norway/obos-ligaen/2024 | 247 | 247 | 2024-04-01 | 2024-12-01 |
| norway/obos-ligaen/2025 | 247 | 247 | 2025-03-31 | 2025-11-30 |
| norway/obos-ligaen/2026 | 184 | 184 | 2026-04-05 | 2026-09-20 |
| paraguay/copa-de-primera/2021 | 182 | 182 | 2021-02-05 | 2021-12-11 |
| paraguay/copa-de-primera/2022 | 264 | 264 | 2022-02-04 | 2022-11-13 |
| paraguay/copa-de-primera/2023 | 264 | 264 | 2023-01-27 | 2023-12-01 |
| paraguay/copa-de-primera/2024 | 264 | 264 | 2024-01-19 | 2024-11-29 |
| paraguay/copa-de-primera/2025 | 264 | 264 | 2025-01-24 | 2025-11-30 |
| paraguay/copa-de-primera/2026 | 198 | 198 | 2026-01-23 | 2026-09-20 |
| paraguay/division-intermedia/2021 | 306 | 306 | 2021-04-09 | 2021-10-26 |
| paraguay/division-intermedia/2022 | 240 | 240 | 2022-04-01 | 2022-10-11 |
| paraguay/division-intermedia/2023 | 240 | 240 | 2023-03-31 | 2023-10-09 |
| paraguay/division-intermedia/2024 | 240 | 240 | 2024-04-05 | 2024-10-14 |
| paraguay/division-intermedia/2025 | 240 | 240 | 2025-03-28 | 2025-10-05 |
| paraguay/division-intermedia/2026 | 200 | 200 | 2026-04-04 | 2026-09-21 |
| peru/liga-1/2021 | 240 | 240 | 2021-03-12 | 2021-11-28 |
| peru/liga-1/2022 | 348 | 348 | 2022-02-04 | 2022-11-13 |
| peru/liga-1/2023 | 344 | 344 | 2023-02-03 | 2023-11-08 |
| peru/liga-1/2024 | 306 | 306 | 2024-01-26 | 2024-11-03 |
| peru/liga-1/2025 | 333 | 333 | 2025-02-07 | 2025-12-14 |
| peru/liga-1/2026 | 241 | 241 | 2026-01-30 | 2026-09-20 |
| peru/liga-2/2021 | 137 | 137 | 2021-05-19 | 2021-10-15 |
| peru/liga-2/2022 | 156 | 156 | 2022-04-02 | 2022-09-25 |
| peru/liga-2/2023 | 191 | 191 | 2023-04-15 | 2023-10-27 |
| peru/liga-2/2024 | 220 | 220 | 2024-04-06 | 2024-10-20 |
| peru/liga-2/2025 | 170 | 170 | 2025-04-04 | 2025-11-16 |
| peru/liga-2/2026 | 133 | 133 | 2026-03-27 | 2026-09-13 |
| poland/division-1/2021-2022 | 309 | 309 | 2021-07-30 | 2022-05-29 |
| poland/division-1/2022-2023 | 309 | 309 | 2022-07-15 | 2023-06-11 |
| poland/division-1/2023-2024 | 309 | 309 | 2023-07-21 | 2024-06-02 |
| poland/division-1/2024-2025 | 309 | 309 | 2024-07-19 | 2025-06-01 |
| poland/division-1/2025-2026 | 309 | 309 | 2025-07-18 | 2026-05-31 |
| poland/division-1/2026-2027 | 80 | 80 | 2026-07-24 | 2026-09-20 |
| poland/ekstraklasa/2021-2022 | 306 | 306 | 2021-07-23 | 2022-05-21 |
| poland/ekstraklasa/2022-2023 | 306 | 306 | 2022-07-15 | 2023-05-27 |
| poland/ekstraklasa/2023-2024 | 306 | 306 | 2023-07-21 | 2024-05-25 |
| poland/ekstraklasa/2024-2025 | 306 | 306 | 2024-07-19 | 2025-05-24 |
| poland/ekstraklasa/2025-2026 | 306 | 306 | 2025-07-18 | 2026-05-23 |
| poland/ekstraklasa/2026-2027 | 78 | 78 | 2026-07-24 | 2026-09-20 |
| portugal/liga-portugal-2/2021-2022 | 310 | 310 | 2021-08-07 | 2022-05-29 |
| portugal/liga-portugal-2/2022-2023 | 310 | 310 | 2022-08-06 | 2023-06-11 |
| portugal/liga-portugal-2/2023-2024 | 308 | 308 | 2023-08-12 | 2024-06-02 |
| portugal/liga-portugal-2/2024-2025 | 308 | 308 | 2024-08-10 | 2025-06-01 |
| portugal/liga-portugal-2/2025-2026 | 308 | 308 | 2025-08-09 | 2026-05-30 |
| portugal/liga-portugal-2/2026-2027 | 53 | 53 | 2026-08-08 | 2026-09-14 |
| portugal/liga-portugal/2021-2022 | 308 | 308 | 2021-08-06 | 2022-05-29 |
| portugal/liga-portugal/2022-2023 | 308 | 308 | 2022-08-05 | 2023-06-11 |
| portugal/liga-portugal/2023-2024 | 308 | 308 | 2023-08-11 | 2024-06-02 |
| portugal/liga-portugal/2024-2025 | 308 | 308 | 2024-08-09 | 2025-06-01 |
| portugal/liga-portugal/2025-2026 | 308 | 308 | 2025-08-08 | 2026-05-28 |
| portugal/liga-portugal/2026-2027 | 62 | 62 | 2026-08-07 | 2026-09-20 |
| romania/liga-2/2021-2022 | 264 | 264 | 2021-07-31 | 2022-05-21 |
| romania/liga-2/2022-2023 | 264 | 264 | 2022-08-04 | 2023-05-21 |
| romania/liga-2/2023-2024 | 262 | 262 | 2023-08-05 | 2024-05-11 |
| romania/liga-2/2024-2025 | 289 | 289 | 2024-08-03 | 2025-05-24 |
| romania/liga-2/2025-2026 | 319 | 319 | 2025-08-02 | 2026-05-23 |
| romania/liga-2/2026-2027 | 88 | 88 | 2026-08-01 | 2026-09-22 |
| romania/superliga/2021-2022 | 320 | 320 | 2021-07-15 | 2022-05-29 |
| romania/superliga/2022-2023 | 321 | 321 | 2022-07-15 | 2023-06-04 |
| romania/superliga/2023-2024 | 321 | 321 | 2023-07-14 | 2024-05-27 |
| romania/superliga/2024-2025 | 319 | 319 | 2024-07-12 | 2025-06-02 |
| romania/superliga/2025-2026 | 321 | 321 | 2025-07-11 | 2026-06-01 |
| romania/superliga/2026-2027 | 79 | 79 | 2026-07-17 | 2026-09-21 |
| saudi-arabia/division-1/2021-2022 | 380 | 380 | 2021-09-06 | 2022-05-28 |
| saudi-arabia/division-1/2022-2023 | 306 | 306 | 2022-08-22 | 2023-05-29 |
| saudi-arabia/division-1/2023-2024 | 306 | 306 | 2023-08-14 | 2024-05-28 |
| saudi-arabia/division-1/2024-2025 | 309 | 309 | 2024-08-19 | 2025-05-29 |
| saudi-arabia/division-1/2025-2026 | 309 | 309 | 2025-09-11 | 2026-05-23 |
| saudi-arabia/division-1/2026-2027 | 53 | 53 | 2026-08-21 | 2026-09-20 |
| saudi-arabia/saudi-professional-league/2021-2022 | 240 | 240 | 2021-08-11 | 2022-06-27 |
| saudi-arabia/saudi-professional-league/2022-2023 | 240 | 240 | 2022-08-25 | 2023-05-31 |
| saudi-arabia/saudi-professional-league/2023-2024 | 306 | 306 | 2023-08-11 | 2024-05-27 |
| saudi-arabia/saudi-professional-league/2024-2025 | 306 | 306 | 2024-08-22 | 2025-05-26 |
| saudi-arabia/saudi-professional-league/2025-2026 | 306 | 306 | 2025-08-28 | 2026-05-21 |
| saudi-arabia/saudi-professional-league/2026-2027 | 63 | 63 | 2026-08-13 | 2026-09-13 |
| scotland/championship/2021-2022 | 186 | 186 | 2021-07-31 | 2022-05-15 |
| scotland/championship/2022-2023 | 186 | 186 | 2022-07-30 | 2023-05-20 |
| scotland/championship/2023-2024 | 186 | 186 | 2023-08-04 | 2024-05-18 |
| scotland/championship/2024-2025 | 186 | 186 | 2024-08-02 | 2025-05-17 |
| scotland/championship/2025-2026 | 186 | 186 | 2025-08-01 | 2026-05-16 |
| scotland/championship/2026-2027 | 39 | 39 | 2026-08-01 | 2026-09-25 |
| scotland/premiership/2021-2022 | 234 | 234 | 2021-07-31 | 2022-05-23 |
| scotland/premiership/2022-2023 | 234 | 234 | 2022-07-30 | 2023-06-04 |
| scotland/premiership/2023-2024 | 234 | 234 | 2023-08-05 | 2024-05-26 |
| scotland/premiership/2024-2025 | 234 | 234 | 2024-08-03 | 2025-05-26 |
| scotland/premiership/2025-2026 | 234 | 234 | 2025-08-02 | 2026-05-25 |
| scotland/premiership/2026-2027 | 42 | 42 | 2026-07-31 | 2026-09-20 |
| serbia/mozzart-bet-super-liga/2021-2022 | 300 | 300 | 2021-07-16 | 2022-05-29 |
| serbia/mozzart-bet-super-liga/2022-2023 | 300 | 300 | 2022-07-08 | 2023-06-04 |
| serbia/mozzart-bet-super-liga/2023-2024 | 300 | 300 | 2023-07-29 | 2024-06-03 |
| serbia/mozzart-bet-super-liga/2024-2025 | 300 | 300 | 2024-07-19 | 2025-06-01 |
| serbia/mozzart-bet-super-liga/2025-2026 | 296 | 296 | 2025-07-19 | 2026-05-24 |
| serbia/mozzart-bet-super-liga/2026-2027 | 68 | 68 | 2026-07-17 | 2026-09-20 |
| slovakia/nike-liga/2021-2022 | 195 | 195 | 2021-07-23 | 2022-05-27 |
| slovakia/nike-liga/2022-2023 | 197 | 197 | 2022-07-15 | 2023-05-26 |
| slovakia/nike-liga/2023-2024 | 194 | 194 | 2023-07-28 | 2024-05-25 |
| slovakia/nike-liga/2024-2025 | 197 | 197 | 2024-07-27 | 2025-05-24 |
| slovakia/nike-liga/2025-2026 | 192 | 192 | 2025-07-26 | 2026-05-16 |
| slovakia/nike-liga/2026-2027 | 52 | 52 | 2026-07-25 | 2026-09-20 |
| slovenia/prva-liga/2021-2022 | 182 | 182 | 2021-07-16 | 2022-05-29 |
| slovenia/prva-liga/2022-2023 | 182 | 182 | 2022-07-15 | 2023-05-28 |
| slovenia/prva-liga/2023-2024 | 180 | 180 | 2023-07-22 | 2024-05-19 |
| slovenia/prva-liga/2024-2025 | 182 | 182 | 2024-07-19 | 2025-06-01 |
| slovenia/prva-liga/2025-2026 | 164 | 164 | 2025-07-18 | 2026-05-31 |
| slovenia/prva-liga/2026-2027 | 49 | 49 | 2026-07-17 | 2026-09-20 |
| south-africa/betway-premiership/2021-2022 | 246 | 246 | 2021-08-20 | 2022-06-15 |
| south-africa/betway-premiership/2022-2023 | 240 | 240 | 2022-08-05 | 2023-05-20 |
| south-africa/betway-premiership/2023-2024 | 246 | 246 | 2023-08-04 | 2024-06-19 |
| south-africa/betway-premiership/2024-2025 | 227 | 227 | 2024-09-14 | 2025-06-30 |
| south-africa/betway-premiership/2025-2026 | 246 | 246 | 2025-08-09 | 2026-06-13 |
| south-africa/betway-premiership/2026-2027 | 57 | 57 | 2026-08-01 | 2026-09-20 |
| south-america/copa-libertadores/2021 | 155 | 155 | 2021-02-23 | 2021-11-27 |
| south-america/copa-libertadores/2022 | 155 | 155 | 2022-02-08 | 2022-10-29 |
| south-america/copa-libertadores/2023 | 155 | 155 | 2023-02-07 | 2023-11-04 |
| south-america/copa-libertadores/2024 | 155 | 155 | 2024-02-06 | 2024-11-30 |
| south-america/copa-libertadores/2025 | 155 | 155 | 2025-02-04 | 2025-11-29 |
| south-america/copa-libertadores/2026 | 150 | 150 | 2026-02-03 | 2026-09-17 |
| south-america/copa-sudamericana/2021 | 157 | 157 | 2021-03-16 | 2021-11-20 |
| south-america/copa-sudamericana/2022 | 157 | 157 | 2022-03-08 | 2022-10-01 |
| south-america/copa-sudamericana/2023 | 157 | 157 | 2023-03-07 | 2023-10-28 |
| south-america/copa-sudamericana/2024 | 157 | 157 | 2024-03-05 | 2024-11-23 |
| south-america/copa-sudamericana/2025 | 157 | 157 | 2025-03-04 | 2025-11-22 |
| south-america/copa-sudamericana/2026 | 152 | 152 | 2026-03-03 | 2026-09-17 |
| south-korea/k-league-1/2021 | 232 | 232 | 2021-02-27 | 2021-12-12 |
| south-korea/k-league-1/2022 | 232 | 232 | 2022-02-19 | 2022-10-29 |
| south-korea/k-league-1/2023 | 232 | 232 | 2023-02-25 | 2023-12-09 |
| south-korea/k-league-1/2024 | 232 | 232 | 2024-03-01 | 2024-12-08 |
| south-korea/k-league-1/2025 | 232 | 232 | 2025-02-15 | 2025-12-08 |
| south-korea/k-league-1/2026 | 179 | 179 | 2026-02-28 | 2026-09-20 |
| south-korea/k-league-2/2021 | 180 | 180 | 2021-02-27 | 2021-10-31 |
| south-korea/k-league-2/2022 | 222 | 222 | 2022-02-19 | 2022-10-23 |
| south-korea/k-league-2/2023 | 236 | 236 | 2023-03-01 | 2023-12-02 |
| south-korea/k-league-2/2024 | 236 | 236 | 2024-03-01 | 2024-11-24 |
| south-korea/k-league-2/2025 | 275 | 275 | 2025-02-22 | 2025-11-30 |
| south-korea/k-league-2/2026 | 216 | 216 | 2026-02-28 | 2026-09-20 |
| spain/laliga/2021-2022 | 380 | 380 | 2021-08-13 | 2022-05-22 |
| spain/laliga/2022-2023 | 380 | 380 | 2022-08-12 | 2023-06-04 |
| spain/laliga/2023-2024 | 380 | 380 | 2023-08-11 | 2024-05-26 |
| spain/laliga/2024-2025 | 380 | 380 | 2024-08-15 | 2025-05-25 |
| spain/laliga/2025-2026 | 380 | 380 | 2025-08-15 | 2026-05-24 |
| spain/laliga/2026-2027 | 69 | 69 | 2026-08-15 | 2026-09-20 |
| spain/laliga2/2021-2022 | 468 | 468 | 2021-08-13 | 2022-06-19 |
| spain/laliga2/2022-2023 | 468 | 468 | 2022-08-12 | 2023-06-17 |
| spain/laliga2/2023-2024 | 468 | 468 | 2023-08-11 | 2024-06-23 |
| spain/laliga2/2024-2025 | 468 | 468 | 2024-08-15 | 2025-06-21 |
| spain/laliga2/2025-2026 | 468 | 468 | 2025-08-15 | 2026-06-20 |
| spain/laliga2/2026-2027 | 77 | 77 | 2026-08-14 | 2026-09-28 |
| spain/primera-rfef-group-1/2021-2022 | 380 | 380 | 2021-08-27 | 2022-05-29 |
| spain/primera-rfef-group-1/2022-2023 | 380 | 380 | 2022-08-27 | 2023-05-27 |
| spain/primera-rfef-group-1/2023-2024 | 380 | 380 | 2023-08-26 | 2024-05-25 |
| spain/primera-rfef-group-1/2024-2025 | 380 | 380 | 2024-08-24 | 2025-05-24 |
| spain/primera-rfef-group-1/2025-2026 | 380 | 380 | 2025-08-29 | 2026-05-23 |
| spain/primera-rfef-group-1/2026-2027 | 50 | 50 | 2026-08-28 | 2026-09-27 |
| spain/primera-rfef-group-2/2021-2022 | 380 | 380 | 2021-08-27 | 2022-05-28 |
| spain/primera-rfef-group-2/2022-2023 | 380 | 380 | 2022-08-27 | 2023-05-27 |
| spain/primera-rfef-group-2/2023-2024 | 380 | 380 | 2023-08-26 | 2024-05-25 |
| spain/primera-rfef-group-2/2024-2025 | 380 | 380 | 2024-08-24 | 2025-05-24 |
| spain/primera-rfef-group-2/2025-2026 | 380 | 380 | 2025-08-29 | 2026-05-24 |
| spain/primera-rfef-group-2/2026-2027 | 49 | 49 | 2026-08-29 | 2026-09-27 |
| sweden/allsvenskan/2021 | 242 | 242 | 2021-04-10 | 2021-12-14 |
| sweden/allsvenskan/2022 | 242 | 242 | 2022-04-02 | 2022-11-13 |
| sweden/allsvenskan/2023 | 242 | 242 | 2023-04-01 | 2023-11-27 |
| sweden/allsvenskan/2024 | 242 | 242 | 2024-03-30 | 2024-11-24 |
| sweden/allsvenskan/2025 | 242 | 242 | 2025-03-29 | 2025-11-29 |
| sweden/allsvenskan/2026 | 176 | 176 | 2026-04-04 | 2026-09-20 |
| sweden/superettan/2021 | 244 | 244 | 2021-04-10 | 2021-12-05 |
| sweden/superettan/2022 | 244 | 244 | 2022-04-02 | 2022-11-13 |
| sweden/superettan/2023 | 244 | 244 | 2023-04-01 | 2023-11-26 |
| sweden/superettan/2024 | 244 | 244 | 2024-03-30 | 2024-11-24 |
| sweden/superettan/2025 | 244 | 244 | 2025-03-29 | 2025-11-23 |
| sweden/superettan/2026 | 200 | 200 | 2026-04-03 | 2026-09-20 |
| switzerland/challenge-league/2021-2022 | 180 | 180 | 2021-07-23 | 2022-05-21 |
| switzerland/challenge-league/2022-2023 | 182 | 182 | 2022-07-15 | 2023-06-03 |
| switzerland/challenge-league/2023-2024 | 180 | 180 | 2023-07-21 | 2024-05-20 |
| switzerland/challenge-league/2024-2025 | 180 | 180 | 2024-07-19 | 2025-05-23 |
| switzerland/challenge-league/2025-2026 | 180 | 180 | 2025-07-25 | 2026-05-15 |
| switzerland/challenge-league/2026-2027 | 45 | 45 | 2026-07-24 | 2026-09-20 |
| switzerland/super-league/2021-2022 | 182 | 182 | 2021-07-24 | 2022-05-29 |
| switzerland/super-league/2022-2023 | 182 | 182 | 2022-07-16 | 2023-06-06 |
| switzerland/super-league/2023-2024 | 230 | 230 | 2023-07-22 | 2024-05-31 |
| switzerland/super-league/2024-2025 | 230 | 230 | 2024-07-20 | 2025-05-30 |
| switzerland/super-league/2025-2026 | 230 | 230 | 2025-07-25 | 2026-05-21 |
| switzerland/super-league/2026-2027 | 54 | 54 | 2026-07-25 | 2026-09-20 |
| turkey/1-lig/2021-2022 | 347 | 347 | 2021-08-13 | 2022-06-02 |
| turkey/1-lig/2022-2023 | 347 | 347 | 2022-08-12 | 2023-06-08 |
| turkey/1-lig/2023-2024 | 311 | 311 | 2023-08-11 | 2024-05-30 |
| turkey/1-lig/2024-2025 | 385 | 385 | 2024-08-09 | 2025-05-29 |
| turkey/1-lig/2025-2026 | 385 | 385 | 2025-08-08 | 2026-05-24 |
| turkey/1-lig/2026-2027 | 80 | 80 | 2026-08-07 | 2026-09-20 |
| turkey/super-lig/2021-2022 | 380 | 380 | 2021-08-13 | 2022-05-22 |
| turkey/super-lig/2022-2023 | 342 | 342 | 2022-08-05 | 2023-06-07 |
| turkey/super-lig/2023-2024 | 380 | 380 | 2023-08-11 | 2024-05-26 |
| turkey/super-lig/2024-2025 | 342 | 342 | 2024-08-09 | 2025-06-01 |
| turkey/super-lig/2025-2026 | 306 | 306 | 2025-08-08 | 2026-05-17 |
| turkey/super-lig/2026-2027 | 54 | 54 | 2026-08-14 | 2026-09-20 |
| ukraine/premier-league/2021-2022 | 143 | 143 | 2021-07-23 | 2021-12-12 |
| ukraine/premier-league/2022-2023 | 244 | 244 | 2022-08-23 | 2023-06-14 |
| ukraine/premier-league/2023-2024 | 244 | 244 | 2023-07-28 | 2024-06-02 |
| ukraine/premier-league/2024-2025 | 247 | 247 | 2024-07-26 | 2025-06-01 |
| ukraine/premier-league/2025-2026 | 244 | 244 | 2025-08-01 | 2026-06-09 |
| ukraine/premier-league/2026-2027 | 52 | 52 | 2026-07-31 | 2026-09-20 |
| uruguay/liga-auf-uruguaya/2021 | 241 | 241 | 2021-05-15 | 2021-12-07 |
| uruguay/liga-auf-uruguaya/2022 | 298 | 298 | 2022-02-05 | 2022-10-30 |
| uruguay/liga-auf-uruguaya/2023 | 300 | 300 | 2023-02-04 | 2023-12-16 |
| uruguay/liga-auf-uruguaya/2024 | 297 | 297 | 2024-02-16 | 2024-12-02 |
| uruguay/liga-auf-uruguaya/2025 | 300 | 300 | 2025-01-31 | 2025-11-30 |
| uruguay/liga-auf-uruguaya/2026 | 232 | 232 | 2026-02-06 | 2026-09-21 |
| uruguay/segunda-division/2021 | 140 | 140 | 2021-06-01 | 2021-12-11 |
| uruguay/segunda-division/2022 | 173 | 173 | 2022-03-19 | 2022-10-30 |
| uruguay/segunda-division/2023 | 231 | 231 | 2023-03-04 | 2024-01-27 |
| uruguay/segunda-division/2024 | 233 | 233 | 2024-03-16 | 2024-12-12 |
| uruguay/segunda-division/2025 | 230 | 230 | 2025-03-08 | 2025-11-29 |
| uruguay/segunda-division/2026 | 176 | 176 | 2026-03-13 | 2026-09-20 |
| usa/mls/2021 | 473 | 473 | 2021-04-16 | 2021-12-11 |
| usa/mls/2022 | 490 | 490 | 2022-02-26 | 2022-11-05 |
| usa/mls/2023 | 521 | 521 | 2023-02-25 | 2023-12-09 |
| usa/mls/2024 | 523 | 523 | 2024-02-21 | 2024-12-07 |
| usa/mls/2025 | 541 | 541 | 2025-02-22 | 2025-12-06 |
| usa/mls/2026 | 388 | 388 | 2026-02-21 | 2026-09-20 |
| usa/usl-championship/2021 | 511 | 511 | 2021-04-24 | 2021-11-28 |
| usa/usl-championship/2022 | 472 | 472 | 2022-03-12 | 2022-11-13 |
| usa/usl-championship/2023 | 423 | 423 | 2023-03-11 | 2023-11-12 |
| usa/usl-championship/2024 | 423 | 423 | 2024-03-09 | 2024-11-23 |
| usa/usl-championship/2025 | 375 | 375 | 2025-03-08 | 2025-11-22 |
| usa/usl-championship/2026 | 308 | 308 | 2026-03-06 | 2026-09-20 |
| venezuela/liga-futve/2021 | 303 | 303 | 2021-04-11 | 2021-12-11 |
| venezuela/liga-futve/2022 | 277 | 277 | 2022-02-24 | 2022-10-30 |
| venezuela/liga-futve/2023 | 223 | 223 | 2023-02-03 | 2023-11-25 |
| venezuela/liga-futve/2024 | 234 | 234 | 2024-02-02 | 2024-12-08 |
| venezuela/liga-futve/2025 | 233 | 233 | 2025-01-24 | 2025-12-06 |
| venezuela/liga-futve/2026 | 193 | 193 | 2026-01-29 | 2026-09-20 |
| wales/cymru-premier/2021-2022 | 195 | 195 | 2021-08-13 | 2022-05-14 |
| wales/cymru-premier/2022-2023 | 195 | 195 | 2022-08-12 | 2023-05-13 |
| wales/cymru-premier/2023-2024 | 195 | 195 | 2023-08-11 | 2024-05-18 |
| wales/cymru-premier/2024-2025 | 196 | 196 | 2024-08-09 | 2025-05-18 |
| wales/cymru-premier/2025-2026 | 195 | 195 | 2025-08-08 | 2026-05-02 |
| wales/cymru-premier/2026-2027 | 79 | 79 | 2026-07-31 | 2026-09-19 |

</details>

## 4. Integrità
Rilettura completa di ogni gzip salvato (hash, parser, `row_count`, righe DB).
| campo | valore |
| --- | --- |
| snapshots | 617 |
| hash_mismatch | 0 |
| malformed_csv | 0 |
| header_row_mismatch | 0 |
| empty_payload | 0 |
| today_empty_snapshots | 1 |
| parser_vs_row_count_mismatch | 0 |
| dataset_row_count_vs_db_mismatch | 0 |
| duplicate_match_keys_in_snapshot | 0 |
| missing_home | 0 |
| missing_away | 0 |
| missing_date | 0 |
| date_parse_failures | 0 |
| parser_rows | 161,801 |
| stored_row_count | 161,801 |
| db_rows | 161,801 |
| sweep_failures | 0 |
| duplicate_snapshot_hashes | 0 |
| duplicate_versions | 0 |
| zero_loss | true |

Controlli SQL FASE 3:
| campo | valore |
| --- | --- |
| match_key_collisions | 0 |
| provider_match_id_collisions | 0 |
| provider_match_id_shared_same_identity | 40 |
| duplicate_payload_hashes | 0 |
| orphan_versions | 0 |
| orphan_snapshots | 0 |
| snapshot_row_gaps | 0 |
| missing_home | 0 |
| missing_away | 0 |
| missing_date | 0 |
| date_parse_failures | 0 |
| team_splits | 0 |
| teams | 2,931 |
| teams_with_provider_id | 0 |
| gate | true |

`empty_payload` conta solo gli snapshot di dataset storici. Un feed `jogos-do-dia` senza partite è contato a parte in `today_empty_snapshots`: è lo stato reale del provider, non un dataset perso.

Snapshot `jogos-do-dia`: le righe DB possono essere meno di `row_count` perché una versione identica non viene reinserita.
| snapshot | dataset | row_count | db_rows |
| --- | --- | --- | --- |
| 106 | today/2026-10-04 | 24 | 24 |
| 617 | today/2026-10-05 | 0 | 0 |

Gate: **PASS**

## 5. Schema
| campo | valore |
| --- | --- |
| raw_unique_fields | 325 |
| registry_unique_fields | 325 |
| missing_from_registry | 0 |
| extra_in_registry | 0 |
| missing_normalized | 0 |
| missing_type_history | 0 |
| transforms | 325 |
| versions_without_lineage | 0 |
| suppressed_aliases | 0 |
| gate | true |

## 6. Coverage
| campo | valore |
| --- | --- |
| global_classes | {"dense":187,"sparse":138} |
| normalized_classes | {"dense":186,"sparse":138} |
| global_tags | {"league-specific":64,"season-specific":64} |
| rows_per_dimension | {"dataset":160585,"global":325,"league":27736,"normalized":324,"period":1891,"season":3463,"team":9} |

<details><summary>Audit FASE 5</summary>

| campo | valore |
| --- | --- |
| registry_fields | 325 |
| normalized_names | 324 |
| global_fields | 325 |
| missing_global | 0 |
| unclassified | 0 |
| dataset_rows | 160,585 |
| league_rows | 27,736 |
| season_rows | 3,463 |
| period_rows | 1,891 |
| team_rows | 9 |
| normalized_rows | 324 |
| payload_mismatches | 0 |
| rollup_mismatches | 0 |
| class_mismatches | 0 |
| historical_team_unresolved | 0 |
| today_country_unresolved | 24 |
| class_counts | {"dense":187,"sparse":138} |
| tag_counts | {"league-specific":64,"season-specific":64} |
| evidence | {"diff_sample":[],"team_census":false,"empty_tokens":["","null","undefined","nan","na","n/a","-"],"sample_limit":"3 teams with the most stored matches, fields Home, Date and Match_ID. Not a full team-field census.","sample_teams":["fpt:team:6466b1adead39533dc040cb7","fpt:team:a395287f448454d4ffce600c","fpt:team:fccced53cfa80319d226fc92"],"sample_fields":["Home","Date","Match_ID"],"overlap_versions":0,"team_sample_mismatches":0} |
| computed_at | 2026-10-04T23:13:42.610Z |
| gate | true |

</details>

Gate: **PASS**

## 7. Registry competizione e stagione
| campo | valore |
| --- | --- |
| competitions | 185 |
| competition_seasons | 1,027 |
| earliest_season | 2020-2021 |
| latest_season | 2026-2027 |
| missing_available_seasons | 0 |
| onboarding_status | {"AVAILABLE":615,"UNAVAILABLE_404":412} |
| gaps | 1 |

<details><summary>Buchi rilevati (1)</summary>

| paese | lega | stagione | detector | in_catalog | missing_available |
| --- | --- | --- | --- | --- | --- |
| ecuador | copa-ecuador | 2023 | annual_cadence | false | false |

</details>

Gate: **PASS**

## 8. Riproducibilità point-in-time
| campo | valore |
| --- | --- |
| phase6_pit | {"t0":"2026-10-04T14:35:03.311Z","t1":"2026-10-04T18:41:49.698Z","dataset":"argentina/liga-profesional/2026","contract":"fpt-schema-4","total_t0":405,"total_t1":161777,"argentina_t0":405,"later_dataset":"argentina/primera-nacional/2026","total_t0_repeat":405,"later_dataset_t0":0,"later_dataset_t1":540,"wrong_contract_t0":0,"t0_matches_snapshot":true} |
| known_now | 161,777 |
| known_now_repeat | 161,777 |
| known_before_mirror | 0 |
| contract | fpt-schema-4 |
| gate | true |

## 9. Entity resolution
| campo | valore |
| --- | --- |
| teams | 2,931 |
| aliases | 3,324 |
| team_splits | 0 |
| with_provider_team_id | 0 |
| historical_unresolved_home | 0 |
| historical_unresolved_away | 0 |
| coded_international_teams | 555 |
| links_total | 555 |
| link_status | {"CODE_UNRESOLVED":133,"LINKED":421,"NO_DOMESTIC_MATCH":1} |

`CODE_UNRESOLVED`: il codice paese non ha un campionato domestico nel catalogo con nomi in comune, quindi non esiste una squadra a cui collegare. `NO_DOMESTIC_MATCH`: il paese è noto ma nessun nome normalizzato coincide. Nessun collegamento è fuzzy.

<details><summary>Codici paese internazionali (65)</summary>

| codice | paese derivato | squadre | collegate |
| --- | --- | --- | --- |
| ALB | N/D | 9 | 0 |
| AND | N/D | 4 | 0 |
| ARG | argentina | 28 | 28 |
| ARM | N/D | 6 | 0 |
| AUT | austria | 6 | 6 |
| AZE | N/D | 7 | 0 |
| BEL | belgium | 9 | 9 |
| BIH | bosnia-and-herzegovina | 6 | 6 |
| BLR | N/D | 9 | 0 |
| BOL | bolivia | 15 | 15 |
| BRA | brazil | 23 | 23 |
| BUL | bulgaria | 7 | 7 |
| CHI | chile | 17 | 17 |
| COL | colombia | 15 | 15 |
| CRO | croatia | 5 | 5 |
| CYP | cyprus | 7 | 7 |
| CZE | czech-republic | 10 | 10 |
| DEN | denmark | 8 | 8 |
| ECU | ecuador | 15 | 15 |
| ENG | england | 5 | 5 |
| ESP | spain | 5 | 5 |
| EST | estonia | 6 | 6 |
| FAI | N/D | 5 | 0 |
| FIN | finland | 8 | 8 |
| FRA | france | 7 | 7 |
| GEO | N/D | 6 | 0 |
| GER | germany | 5 | 5 |
| GIB | N/D | 4 | 0 |
| GRE | greece | 5 | 5 |
| HUN | N/D | 9 | 0 |
| ICE | iceland | 7 | 7 |
| IRL | ireland | 5 | 5 |
| ISR | israel | 7 | 7 |
| ITA | italy | 2 | 2 |
| KAZ | N/D | 7 | 0 |
| KOS | N/D | 7 | 0 |
| LAT | N/D | 6 | 0 |
| LIE | switzerland | 1 | 1 |
| LTU | N/D | 8 | 0 |
| LUX | N/D | 9 | 0 |
| MDA | N/D | 5 | 0 |
| MKD | N/D | 9 | 0 |
| MLT | N/D | 9 | 0 |
| MNE | N/D | 7 | 0 |
| NED | netherlands | 8 | 8 |
| NIR | northern-ireland | 8 | 7 |
| NOR | norway | 8 | 8 |
| PAR | paraguay | 15 | 15 |
| PER | peru | 17 | 17 |
| POL | poland | 10 | 10 |
| POR | portugal | 6 | 6 |
| ROU | romania | 7 | 7 |
| RUS | N/D | 1 | 0 |
| SAN | N/D | 6 | 0 |
| SCO | scotland | 10 | 10 |
| SLO | slovenia | 8 | 8 |
| SRB | serbia | 9 | 9 |
| SUI | switzerland | 10 | 10 |
| SVK | slovakia | 6 | 6 |
| SWE | sweden | 10 | 10 |
| TUR | turkey | 9 | 9 |
| UKR | ukraine | 9 | 9 |
| URU | uruguay | 15 | 15 |
| VEN | venezuela | 16 | 16 |
| WAL | wales | 7 | 7 |

</details>

Gate: **PASS**

## 10. Lineage
| campo | valore |
| --- | --- |
| versions_without_lineage | 0 |
| facts_without_version | 0 |
| facts_version_mismatch | 0 |
| orphan_versions | 0 |
| field_transforms | 325 |
| chain | fpt_raw_snapshots -> fpt_match_versions -> fpt_match_facts |
| gate | true |

| provider | parser | schema | transform | versioni |
| --- | --- | --- | --- | --- |
| futpythontrader | fpt-csv-1 | fpt-schema-4 | fpt-norm-1 | 161801 |

## 11. Request ledger e budget API
| campo | valore |
| --- | --- |
| rows | 840 |
| first_row | 2026-10-04T20:12:09Z |
| last_row | 2026-10-05T10:18:53Z |
| api_key_paths | 0 |
| migration_014_applied_at | 2026-10-05T08:52:23Z |
| rows_after_014 | 167 |
| rows_after_014_upstream | 2 |
| rows_after_014_missing_fields | 0 |
| latency_p50_ms_after_014 | 643 |
| unknown_outcomes | 0 |
| rows_without_endpoint_family | 0 |
| rows_with_latency | 2 |
| rows_with_budget_state | 167 |
| rows_with_provider_quota | 0 |
| deduped_rows | 0 |
| by_budget_state | {"not_recorded":673,"ok":167} |
| window | {"minute_used":0,"day_used":15,"rate_limited_day":0,"max_backoff_ms":0} |
| config | {"perMinute":20,"perDay":2000,"backfillPerMinute":8,"maxAttempts":4,"backoffBaseMs":500,"backoffCapMs":30000,"circuitFailures":5,"circuitOpenMs":60000} |

| outcome | endpoint | righe | latenza p50 ms | latenza max ms |
| --- | --- | --- | --- | --- |
| cache_hit | dataset | 825 | N/D | N/D |
| upstream | catalog | 7 | 1266 | 1266 |
| upstream | dataset | 2 | N/D | N/D |
| upstream | today | 6 | 643 | 643 |

Meccanismi e test che li provano:
| meccanismo | test |
| --- | --- |
| cache_first | test/request-budget.test.mjs, test/incremental-sync.test.mjs |
| in_flight_dedup | test/request-budget.test.mjs (deduped ledger row) |
| no_restart_burst | test/request-budget.test.mjs (ledger-backed minute/day window survives a new process) |
| retry_after | test/request-budget.test.mjs |
| backoff_jitter | test/request-budget.test.mjs |
| circuit_breaker | test/request-budget.test.mjs, test/phase8-watchdog.test.mjs |
| backfill_throttling | test/request-budget.test.mjs |
| budget_warning_critical | test/phase8-watchdog.test.mjs |

Gate: **PASS**

## 12. Sync incrementale
| run | kind | status | cache_hit | upstream | dataset upstream | errori | snapshot | righe |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| fpt-1791157076578-4231ba2e | manual | complete | 165 | 2 | 0 | 0 | 0 | 0 |
| fpt-1791157259618-a37a60a5 | manual | complete | 165 | 2 | 0 | 0 | 0 | 0 |

Run successivi non backfill: 2

| run | kind | status | started_at | snapshot | righe |
| --- | --- | --- | --- | --- | --- |
| fpt-1791173821493-91ab3f24 | cron | complete | 2026-10-05T04:17:01.606Z | 1 | 0 |
| fpt-1791195420927-282816e5 | cron | complete | 2026-10-05T10:17:01.030Z | 0 | 0 |

Gate: **PASS**

## 13. Watchdog e Telegram
| campo | valore |
| --- | --- |
| phase8_gate | true |
| phase8_status | pass |
| check | {"status":"pass","checked_at":"2026-10-04T23:52:21Z","telegram":{"sent":true,"messages":1,"outbound":true,"configured":true,"secondSuppressed":true}} |
| alerts | {"alerts":54,"open_alerts":1,"delivered":54,"occurrences":181,"delivered_last_day":54} |
| deliveries_without_repeat | true |

| code | severity | occorrenze | ultimo |
| --- | --- | --- | --- |
| NEW_DATASETS_AGG | info | 1 | 2026-10-04T16:19:24Z |

## 14. Layer di query normalizzato
| campo | valore |
| --- | --- |
| facts_rows | 161,801 |
| distinct_match_keys | 161,801 |
| today_rows | 24 |
| historical_without_team_ids | 0 |
| today_without_team_ids | 24 |
| without_competition | 24 |
| without_season | 24 |
| kickoff_utc_set | 0 |
| kickoff_local_time_set | 161,801 |
| with_provider_match_id | 161,801 |
| facts_stale | 0 |
| facts_at_now | 161,801 |
| facts_at_now_repeat | 161,801 |
| result_status | {"FINAL":161754,"NOT_STARTED":24,"NO_RESULT":23} |
| kickoff_tz_status | {"PROVIDER_TZ_UNDOCUMENTED":161801} |
| facts_version | fpt-facts-1 |
| columns | internal_match_id, internal_competition_id, season_id, kickoff_utc, kickoff_local_time, home_team_id, away_team_id, provider_match_id, provider_competition_id, home_score, away_score, result_status, version_id, snapshot_id |
| gate | true |

## 15. Registry metadati filtri
| campo | valore |
| --- | --- |
| registry_rows | 325 |
| schema_fields | 325 |
| unclassified_family | 0 |
| timing_unset | 0 |
| postmatch_marked_safe | 0 |
| filterable | 278 |
| zero_is_missing | 144 |
| without_coverage | 0 |
| timing_classes | {"POSTMATCH_OUTCOME":126,"PREMATCH_IDENTITY":11,"PREMATCH_MARKET_UNTIMED":188} |
| families | {"corners":6,"defense":18,"discipline":24,"expected_goals":26,"goals":4,"identity":11,"market":188,"possession_creation":18,"set_pieces":2,"shooting":28} |
| version | fpt-filters-1 |
| gate | true |

## 16. Layer di query per l’assistente
Le risposte vengono da Neon. Il modulo non importa il client FutPythonTrader.
| route | query |
| --- | --- |
| /api/fpt/teams | teamSearch |
| /api/fpt/team-matches | teamMatches |
| /api/fpt/team-summary | teamSummary |
| /api/fpt/h2h | headToHead |
| /api/fpt/competition-season | competitionSeason |
| /api/fpt/matches | matchesOnDate |
| /api/fpt/match | matchDetail |
| /api/fpt/competitions | competitions |
| /api/fpt/filters | filters |

| query | righe | chiamate upstream | prima riga |
| --- | --- | --- | --- |
| teamSearch | 2 | 0 | {"internal_team_id":"fpt:team:a395287f448454d4ffce600c","canonical_name":"Deportes Tolima","country_slug":"colombia","competitions":["primera-a"]} |
| teamSummary | 1 | 0 | {"played":285,"won":136,"drawn":80,"lost":69,"goals_for":382,"goals_against":261,"first_match":"2021-01-18T00:00:00.000Z","last_match":"2026-09-20T00:00:00.000Z"} |
| headToHead | 5 | 0 | {"internal_match_id":"fpt:hash:7ec40e86c0ef7f1f500ef7b88ddcc0d8","match_date":"2026-07-25T00:00:00.000Z","home_score":2,"away_score":1} |

Gate: **PASS**

## 17. Performance query su Neon
Limiti: esecuzione ≤ 250 ms, righe lette ≤ 20,000, nessun Seq Scan su fpt_match_facts / fpt_match_versions / fpt_raw_snapshots. Una prima esecuzione scalda la cache, poi `EXPLAIN (ANALYZE, BUFFERS)`.

| query | esito | exec ms | plan ms | righe lette | indici | seq scan grandi |
| --- | --- | --- | --- | --- | --- | --- |
| teamSearch | PASS | 0.086 | 2.168 | 6 | fpt_team_aliases_normalized_idx, fpt_teams_pkey | - |
| teamMatches | PASS | 0.607 | 0.177 | 285 | fpt_match_facts_home_idx, fpt_match_facts_away_idx | - |
| teamSummary | PASS | 0.649 | 0.2 | 285 | fpt_match_facts_home_idx, fpt_match_facts_away_idx | - |
| headToHead | PASS | 0.497 | 0.217 | 287 | fpt_match_facts_home_idx | - |
| competitionSeason | PASS | 1.54 | 0.13 | 745 | fpt_match_facts_comp_season_idx | - |
| matchesOnDate | PASS | 0.767 | 0.108 | 350 | fpt_match_facts_date_idx | - |
| matchDetail | PASS | 0.054 | 0.523 | 2 | fpt_match_facts_pkey, fpt_match_versions_pkey | - |

Gate: **PASS**

## Limiti noti
- `expected_match_count`: FutPythonTrader non pubblica il numero atteso di partite per stagione: expected_match_count resta nullo e nessuna stagione è COMPLETE, solo AVAILABLE.
- `kickoff_timezone`: Il fuso orario di Date/Time non è documentato dal provider: kickoff_utc resta nullo, kickoff_local_time conserva l’orario del CSV (kickoff_tz_status=PROVIDER_TZ_UNDOCUMENTED).
- `market_capture_time`: Le quote storiche non hanno un timestamp di cattura: sono classificate PREMATCH_MARKET_UNTIMED, non come quote di apertura o chiusura.
- `provider_quota`: La quota reale del fornitore non è nota: i tetti per minuto/giorno sono default conservativi di codice, provider_quota_remaining è valorizzato solo se il provider manda un header di rate limit.
- `sigterm`: Il SIGTERM live del drill di resume è caduto fra due dataset, non a metà scrittura; il rollback a metà storeDataset è provato solo su Postgres locale.
- `team_links`: Le squadre delle competizioni internazionali ("Club (XXX)") sono collegate alla squadra nazionale solo con nome normalizzato identico; le altre restano entità separate con stato esplicito in fpt_team_links.
- `ledger_history`: Le righe del ledger scritte prima della migrazione 014 non hanno latency, budget_state e quota: non sono state misurate e non vengono ricostruite.
- `today_odds_placeholder`: Il feed jogos-do-dia manda 0 nelle quote non ancora quotate: lo zero di un campo di mercato è N/D, non un prezzo.

## Verifica incrociata
Controlli indipendenti eseguiti dall'agente dopo il cron reale, fuori dal report: query di sola lettura su Neon e log Render.

- Render log del cron reale: `FUTPYTHON_SYNC` run `fpt-1791195420927-282816e5` (cron, avvio 10:17:00Z, fine 10:18:54Z) sull'istanza `srv-davpi23ncjis73f9dkbg-cgvrd` del deploy live `dep-db1ml36q1p3s73ffhpc0` (commit `9f09e1d`): status complete, 165 cache_hit, 2 upstream HTTP 200, 0 dataset scaricati, 0 errori.
- Neon (query diretta di sola lettura) su `fpt_request_ledger` dopo `014` (applicata 08:52:23Z): 167 righe, tutte del run di servizio sopra; catalog `/api-docs` 10:17:03Z latency 1266 ms; today `/api/jogos-do-dia?date=2026-10-05` 10:18:53Z latency 643 ms; budget_state ok, residuo giorno 1986 e 1985, residuo minuto 19; provider_quota_remaining nullo (il provider non manda header di rate limit); 0 campi mancanti; attempt massimo 1, backoff 0; 0 righe 429/error nelle 24 ore; picco storico 4 richieste upstream al minuto.
- Le richieste vengono dal servizio MatchPilot: run_id presente in `fpt_sync_runs` (kind cron); nessuna chiamata manuale o esterna a FutPythonTrader. Il workflow `provider-trial-keepalive` (commit `9f09e1d`) chiama solo `betsapi-trial-collector.onrender.com/healthz`, non FutPythonTrader né matchpilot-test.
- Scansione log Render del servizio dalle 08:50Z alle 10:23Z per `api_key=`, `postgres://`, `postgresql://`, `DATABASE_URL`, `FUTPYTHON_API_KEY`, token Telegram: 0 occorrenze. Warning/error: solo l'avviso SSL di pg al boot.
- Telegram: tutti i 54 alert con consegna sono del 2026-10-04. 52 dalla raffica 15:02-16:19Z (50 DATASET_SYNC_FAILED, 1 DATASET_ERRORS, 1 SYNC_STALE, 1 NEW_DATASETS_AGG) prima dell'aggregazione e del cooldown; 1 WATCHDOG_CERT di FPT-PR-08 alle 23:52Z. Dal 2026-10-04 23:52Z nessuna consegna. Unico alert aperto: NEW_DATASETS_AGG (info).

## Esito
**CERTIFIED WITH KNOWN LIMITATIONS**

La issue #12 resta aperta. La chiusura è riservata all’owner.
