# BetsAPI documented endpoint catalog

Audited against the BetsAPI documentation index on 2026-10-05.

This file is an implementation reference for issue #40. It lists every API call currently exposed in the public BetsAPI documentation index. The Everything collector remains disabled by default.

## Events API — 21

| Key | Method | Endpoint | Mode |
|---|---|---|---|
| events_inplay | GET | /v3/events/inplay | scheduled |
| events_upcoming | GET | /v3/events/upcoming | scheduled |
| events_ended | GET | /v3/events/ended | scheduled |
| events_search | GET | /v1/events/search | on_demand |
| event_view | GET | /v1/event/view | event |
| event_history | GET | /v1/event/history | event |
| event_odds_summary | GET | /v2/event/odds/summary | event |
| event_odds | GET | /v2/event/odds | event |
| event_stats_trend | GET | /v1/event/stats_trend | event |
| event_lineup | GET | /v1/event/lineup | event |
| league_list | GET | /v3/league | scheduled |
| league_info | GET | /v1/league/info | league |
| league_table | GET | /v3/league/table | league |
| league_toplist | GET | /v1/league/toplist | league |
| team_list | GET | /v3/team | scheduled |
| team_info | GET | /v1/team/info | team |
| team_squad | GET | /v1/team/squad | team |
| team_members | GET | /v1/team/members | team |
| player | GET | /v1/player | player |
| tennis_ranking | GET | /v1/tennis/ranking | on_demand |
| event_merge_history | GET | /v1/event/merge_history | scheduled |

## Bet365 API — 7

| Key | Method | Endpoint | Mode |
|---|---|---|---|
| bet365_inplay | GET | /v1/bet365/inplay | scheduled |
| bet365_inplay_filter | GET | /v1/bet365/inplay_filter | scheduled |
| bet365_event | GET | /v1/bet365/event | event |
| bet365_league | GET | /v1/bet365/league | scheduled |
| bet365_upcoming | GET | /v1/bet365/upcoming | scheduled |
| bet365_prematch | GET | /v4/bet365/prematch | event |
| bet365_result | GET | /v1/bet365/result | event |

## BWin API — 4

- GET /v1/bwin/inplay
- GET /v1/bwin/event
- GET /v1/bwin/prematch
- GET /v1/bwin/result

## Betfair API — 8

- GET /v1/betfair/sb/inplay
- GET /v1/betfair/sb/upcoming
- GET /v1/betfair/sb/event
- GET /v1/betfair/ex/inplay
- GET /v1/betfair/ex/upcoming
- GET /v1/betfair/ex/event
- GET /v1/betfair/timeline
- GET /v1/betfair/result

## SBOBET API — 4

- GET /v1/sbobet/inplay
- GET /v1/sbobet/upcoming
- GET /v1/sbobet/event
- GET /v1/sbobet/result

## 1xBet API — 4

- GET /v1/1xbet/inplay
- GET /v1/1xbet/upcoming
- GET /v1/1xbet/event
- GET /v1/1xbet/result

## Results API — 3

- GET /v1/williamhill/result
- GET /v1/sbobet/result
- GET /v1/betsson/result

## Total

51 documented calls.

## Runtime contract

- Everything traffic is disabled unless `BETSAPI_EVERYTHING_ENABLED=true`.
- All calls go through the same hourly budget.
- Required parameters are validated before spending budget.
- Missing parameters fail closed.
- Raw JSON is preserved.
- Unknown fields are discovered, not discarded.
- Token values are never written in stored metadata.
- Endpoints requiring entity IDs are available through the generic documented caller and can be driven by IDs discovered from scheduled endpoints during the trial.
- Results/search/detail calls are not fabricated if the required upstream identifiers are unavailable.
