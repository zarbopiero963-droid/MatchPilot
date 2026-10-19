import json, glob, os
B='/tmp/claude-0/-home-user-MatchPilot/9501c668-6355-52e9-bcad-bf70034a666f/scratchpad/rv-p8/bundle'
obs=sorted('observations/'+os.path.basename(p) for p in glob.glob(B+'/observations/*.json'))
def d(id,sev,summary,ev,reason,impact,fu):
    return {"id":id,"source":"ai","classification":"BUG","severity":sev,"status":"DEFERRED","summary":summary,"evidence":ev,"reason":reason,"impact":impact,"follow_up":fu}
F=[
d("AI-1","P3","Daily Board (/#/board, desktop and mobile): every match card shows the raw English enum 'PROVIDER_TZ_UNDOCUMENTED' as a pill next to the kickoff time; the Italian explanation exists only as a hover title (not reachable on touch). The time carries no zone indication, so D-7 (Europe/Rome with zone shown) is not met and the user cannot tell which clock 15:00/20:45 refers to.",
  ["observations/01-desktop-end.json","observations/01-desktop-end.png","observations/03-desktop-open.png","observations/04-mobile-open.png"],
  "Presentation defect only: the value is honest (the provider zone is undocumented, so a Europe/Rome conversion cannot be invented); the label and its explanation are wrong for an Italian user.",
  "Users see an internal code instead of an Italian sentence and cannot interpret kickoff times; no data is wrong or invented.",
  "V-B: replace the pill with an Italian visible label (e.g. 'ora del fornitore, fuso non documentato') readable on mobile; keep D-7 conversion for when the zone is documented."),
d("AI-2","P3","Match cards and tables show raw English enum values instead of Italian labels: 'Stato risultato: FINAL', 'Favorito: HOME 2,200', 'Fase: HISTORICAL' (Daily Board desktop/mobile), 'Stato: AVAILABLE' (Dashboard coverage table), 'DEPRECATED'/'KEPT' (API page). The search filter calls the same state 'Finale'. When the home odd is missing the favourite renders as 'N/D N/D' (e.g. Barcelona – Real Madrid, Ajax – PSV on 2024-08-01).",
  ["observations/03-desktop-open.json","observations/03-desktop-open.png","observations/04-mobile-open.png","observations/01-desktop-open.png","observations/13-desktop-open.png","observations/05-desktop-open.json"],
  "Labelling defect; values themselves are consistent with the data shown.",
  "Mixed-language UI, inconsistent terminology between Board and Ricerca, duplicated N/D looks like a rendering glitch.",
  "V-B: map result_status, favorite_side, phase, coverage_status and route status to Italian labels; render a single N/D when the favourite is unknown."),
d("AI-3","P3","Ricerca (/#/search?run=1, desktop and mobile): results claim 'in ordine di data, dal più recente' but within the same day the kickoff order is inconsistent: 2024-08-10 shows 20:45, 15:00, N/D; 2024-08-09 shows 15:00, 20:45, N/D; 2024-08-08 shows 20:45, N/D, 15:00; 2024-08-06 shows N/D, 15:00, 20:45. Neither ascending nor descending time, against D-4 chronological order.",
  ["observations/05-desktop-open.json","observations/05-desktop-open.png","observations/06-mobile-open.json","observations/06-mobile-open.png"],
  "Ordering within a date looks arbitrary (likely a secondary key that is not the kickoff time); the date order itself is correct and pagination is not affected.",
  "A trader scanning recent matches gets a misleading intra-day sequence; no value is wrong.",
  "Next search PR: add kickoff time (nulls last) as secondary sort key in /api/v1/fpt/search with a regression test, keeping cursor stability."),
d("AI-4","P3","Fornitori dati (/#/providers, desktop 1280px): deeply nested certification values wrap 2-4 characters per line in a narrow right column while the left half of the card is empty: phase6 evidence pit t1 '202 / 5- / 06- / 01T / 00:0 / 0:00. / 000 / Z', dataset 'arge / ntina / /liga / - / profe / sion / al/20 / 26', labels 'wron / g / contr / act / t0', and 'UNAVAILABL / E 404'. This is the V-A audit defect still present at this head on desktop (mobile renders these values on one line).",
  ["observations/05-desktop-end.png","observations/11-desktop-open.png","observations/11-desktop-open.json","observations/04-mobile-end.png"],
  "Known V-A layout defect (nested dl grid columns), reproduced here on desktop; content is complete in the accessibility tree.",
  "Values are practically unreadable on desktop; workaround: mobile layout or reading the API.",
  "V-A: fix nested definition-list layout on desktop with desktop and mobile regression tests."),
d("AI-5","P3","Mobile (390px) tables are clipped with no scroll cue: in Ricerca results only Data/Ora/Partita/Campionato and a cut 'Ri…' column are visible, the 1X2 odds, Over 2,5 and xG columns are off-screen (V-A 'mobile search result not perceivable'); the Dashboard coverage table is cut at 'Ulti… par…' with dates truncated '202 08-'; on the API page the Successore column is clipped ('/api/v1/fpt/team-summ', '/api/v1/fpt/away-match') and paths wrap 3-4 characters per line.",
  ["observations/06-mobile-open.png","observations/02-mobile-open.png","observations/14-mobile-open.png","observations/14-mobile-open.json"],
  "Known V-A mobile defect; the data is in the DOM and reachable by horizontal scrolling inside the table wrapper.",
  "On phones the most important trading values (odds, xG) are not perceivable without discovering a hidden horizontal scroll.",
  "V-A: card layout or visible scroll affordance for result/coverage/endpoint tables on mobile, with mobile regression tests."),
d("AI-6","P3","Fornitori dati and API pages (desktop and mobile) expose untranslated internal keys and English sentences: 'phase2'…'phase8', 'catalog total', 'classified total', 'unclassified', 'issues', 'samples', 'match key collisions', 'cadence: a hole is recorded only when…', 'expected match count: null: the provider catalog does not carry a fixture total'; API descriptions mix English ('Process health and API version (no database access)', 'TotalCorner prematch collection report') with Italian, and one description writes odds as '1.50 e 1.90' (dot decimal, against D-3). Routes kept without successor show an amber 'N/D' as if data were missing.",
  ["observations/04-mobile-end.json","observations/05-desktop-end.json","observations/03-desktop-end.json","observations/13-desktop-open.png","observations/14-mobile-open.png"],
  "Localisation/labelling defect on technical pages; numbers shown match the API.",
  "Technical pages are hard to read for an Italian user and mislabel 'no successor' as missing data.",
  "V-B: Italian labels for provider certification keys and endpoint descriptions; '—' instead of N/D for KEPT routes; comma decimals in descriptions."),
d("AI-7","P3","Data health is presented contradictorily: Dashboard and Fornitori dati show 'Salute dei dati: Stato ok · Avvisi nessuno · Dataset con errori 0' while the certification block on the same page lists issues 'available without snapshot 2' and 'available incomplete 2', phase2 'classified total 0 / unclassified 2 / labels AVAILABLE 0' next to 'Dataset available 2' and phase6 'status counts AVAILABLE 2', and 5 of 6 gates 'no'. The PIT evidence names dataset 'argentina/liga-profesional/2026', which is not in the catalog (only netherlands eredivisie and spain laliga), with no explanation that it is a fixed probe.",
  ["observations/01-desktop-open.json","observations/01-desktop-open.png","observations/04-mobile-end.json","observations/05-desktop-end.json","observations/05-desktop-end.png"],
  "The two blocks likely measure different scopes (ingestion errors vs certification gates), so the underlying values are NOT VERIFIED as wrong; the defect is the unexplained, apparently contradictory presentation.",
  "A user cannot tell whether the saved data is healthy; risk of trusting 'ok' while certification gates fail.",
  "V-B: state the scope of 'Stato ok' and surface certification issues as Italian warnings; explain the PIT probe dataset or hide it from the user view."),
d("AI-8","P3","Timestamps and dates are not in Italian form and not per D-7: every 'generato:' line and 'computed at' show raw ISO UTC ('2026-10-19T14:51:23.396Z') without Europe/Rome conversion; Board heading 'Partite del 2024-08-09' is ISO while the native date field next to it shows '08/09/2024' (month first in the crawler's en-US browser), which an Italian reads as 8 settembre; date fields in Ricerca show 'mm/dd/yyyy'.",
  ["observations/01-desktop-end.png","observations/01-desktop-open.png","observations/03-desktop-open.png","observations/02-mobile-end.png","observations/06-mobile-end.png"],
  "The native date-input format follows the browser locale (en-US in the crawler), so its appearance in an it-IT browser is NOT VERIFIED; the ISO/UTC 'generato' timestamps are app-rendered.",
  "Ambiguous dates and UTC clock times for Italian users; values are not wrong.",
  "V-B: format provenance timestamps in Europe/Rome with zone (UTC on hover/accessible), Italian date format in headings; set lang=it and verify the date input in an it-IT browser context."),
d("AI-9","P3","The home route '/#/' opens the Dashboard (data health tiles) on desktop and mobile, while owner decision D-2 (MP-OWNER-VISUAL-BASELINE-D1-D7-01) requires the home page to be Oggi / Daily Board with the Dashboard kept in the menu.",
  ["observations/01-desktop-open.json","observations/01-desktop-open.png","observations/02-mobile-open.png"],
  "Conformity gap to an owner visual decision scheduled for V-B; navigation to the Daily Board works from the menu.",
  "First screen is a technical health page instead of the day's matches; one extra click.",
  "V-B: make '#/' route to the Daily Board (Oggi) and keep Dashboard in the menu, with a journey step asserting the home heading."),
{"id":"AI-10","source":"ai","classification":"DATA_QUALITY_ISSUE","status":"OPEN",
 "summary":"QA archive fixture is implausible as football data: on the Daily Board for 2024-08-01 (desktop and mobile, first page only) Sevilla appears in 8 matches and Real Madrid in 9, several at the same 15:00 kickoff; the Dashboard reports 56 La Liga matches between 2024-08-01 and 2024-08-02; draw odd is always 3,400, Over 2,5 always 1,900, BTTS always 1,800 and the favourite is always HOME.",
 "evidence":["observations/03-desktop-open.json","observations/03-desktop-open.png","observations/04-mobile-open.png","observations/01-desktop-open.json"],
 "reason":"Synthetic QA fixture, not production data (exploratory.md Limits); the software displays it faithfully, so this is not a BUG, but it prevents checking value plausibility (favourite logic, odds formatting variety, per-team schedules) in this review."},
{"id":"AI-11","source":"ai","classification":"NOT_VERIFIED","status":"OPEN",
 "summary":"Pagination ('Carica altre partite' on the Board for 2024-08-01, 'Altri risultati' in Ricerca) and the ordering across pages, as well as the feedback after entering filters (07-desktop-end and 11-desktop-end show 'Quota favorito a = 30' filled but 'Imposta i filtri e premi Cerca.' still shown), could not be judged: the observations only capture open/end states, not the result of those actions.",
 "evidence":["observations/03-desktop-open.png","observations/05-desktop-open.png","observations/07-desktop-end.png","observations/11-desktop-end.png"],
 "reason":"Insufficient evidence in this bundle: no observation after a 'load more' or a submitted search with filters; the crawler reported no errors for these actions."}
]
r={"schema":"mp-browser-ai-review-v1","head_sha":"82ad736feb92978151340ad6362d9c4dac20df4d",
 "exploration_sha256":"4b07537f0d3e726c5fa4276d6510d8584c09808314fb1bc3b8e6a9deaa478e7d",
 "reviewer":{"kind":"claude-code-session","session":"https://claude.ai/code/session_01YSsco5dhGuxe1dM8ET2yyd"},
 "reviewed_at":"2026-10-19T17:09:04Z","observations_reviewed":obs,"observations_not_reviewed":{},
 "findings":F,"verdict":"NO_BLOCKING"}
for f in F:
    for e in f['evidence']: assert os.path.exists(B+'/'+e), e
json.dump(r,open('/tmp/claude-0/-home-user-MatchPilot/9501c668-6355-52e9-bcad-bf70034a666f/scratchpad/rv-p8/ai-review.json','w'),indent=2,ensure_ascii=False)
print(len(obs))
