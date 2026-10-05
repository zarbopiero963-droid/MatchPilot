// #12 "Data Coverage → Competitions": server-rendered page over the read-only coverage queries.
// The browser never calls FutPythonTrader; every number comes from the database through runQuery.

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const pct = value => value == null ? 'N/D' : `${(Number(value) * 100).toFixed(1)}%`;
const day = value => value ? new Date(value).toISOString().slice(0, 10) : '–';

const STYLE = `body{margin:0;background:#07111f;color:#e6eef8;font-family:system-ui,-apple-system,sans-serif}
main{max-width:1200px;margin:auto;padding:32px 16px}h1{font-size:30px;margin:0 0 8px}p{color:#a9bad0;line-height:1.5}
a{color:#8cc8ff}table{width:100%;border-collapse:collapse;font-size:14px;margin-top:16px}
th,td{padding:7px 8px;border-bottom:1px solid #203753;text-align:left;white-space:nowrap}th{color:#a9bad0;font-weight:600}
td.num{text-align:right;font-variant-numeric:tabular-nums}.wrap{overflow-x:auto}
form{display:flex;flex-wrap:wrap;gap:10px;align-items:end;background:#0e1d31;border:1px solid #203753;border-radius:12px;padding:12px}
label{display:flex;flex-direction:column;font-size:12px;color:#a9bad0;gap:4px}input,select{background:#07111f;color:#e6eef8;border:1px solid #203753;border-radius:6px;padding:6px}
button{background:#173652;color:#e6eef8;border:0;border-radius:6px;padding:8px 14px}.muted{color:#6f839c}.warn{color:#ffcf70}`;

function page(title, body) {
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<title>${esc(title)}</title><style>${STYLE}</style></head><body><main>${body}</main></body></html>`;
}

const NOTES = `<p class="muted">Fonte: FutPythonTrader, letta dal database MatchPilot (nessuna chiamata al provider). `
  + `Stato stagione: AVAILABLE. COMPLETE/PARTIAL non sono calcolabili perché il provider non pubblica il numero atteso di partite. `
  + `Overlap FPT/TC: non disponibile finché TotalCorner (#20) non è integrato. Live: non disponibile per FutPythonTrader.</p>`;

export function renderCoverageCompetitions(rows, filters = {}) {
  const f = key => esc(filters[key] ?? '');
  const form = `<form method="get" action="/coverage">
<label>Paese<input name="country" value="${f('country')}" placeholder="italy"></label>
<label>Stagioni minime<input name="min_seasons" type="number" min="0" value="${f('min_seasons')}"></label>
<label>Partite minime<input name="min_matches" type="number" min="0" value="${f('min_matches')}"></label>
<label>Coverage quote minima (0–1)<input name="min_odds_coverage" type="number" step="0.05" min="0" max="1" value="${f('min_odds_coverage')}"></label>
<label>Provider<select name="provider"><option>futpythontrader</option></select></label>
<label>Overlap FPT/TC<select disabled><option>non disponibile (#20)</option></select></label>
<label>Live<select disabled><option>non disponibile</option></select></label>
<button type="submit">Filtra</button></form>`;
  const body = rows.map(r => `<tr><td>${esc(r.country_slug)}</td>`
    + `<td><a href="/coverage?country=${encodeURIComponent(r.country_slug)}&amp;league=${encodeURIComponent(r.league_slug)}">${esc(r.league_slug)}</a></td>`
    + `<td>${esc(r.provider)}</td><td>${esc(r.first_season ?? '–')}</td><td>${esc(r.last_season ?? '–')}</td>`
    + `<td class="num">${esc(r.seasons_with_data)} / ${esc(r.seasons_listed)}</td><td class="num">${esc(r.seasons_unavailable_404)}</td>`
    + `<td class="num">${esc(r.matches)}</td><td>${esc(r.coverage_status)}</td>`
    + `<td class="num">${pct(r.odds_coverage)}</td><td class="num">${pct(r.xg_coverage)}</td>`
    + `<td class="num">${r.season_gaps ? `<span class="warn">${esc(r.season_gaps)}</span>` : '0'}</td>`
    + `<td class="num">${esc(r.seasons_in_onboarding)}</td><td class="muted">N/D</td></tr>`).join('');
  return page('Data Coverage — Competizioni', `<h1>Data Coverage → Competizioni</h1>`
    + `<p>${rows.length} leghe. Ogni riga: prima e ultima stagione con dati, stagioni con dati su stagioni elencate, partite, coverage quote 1X2 e xG, buchi di stagione, stagioni in onboarding.</p>`
    + NOTES + form
    + `<div class="wrap"><table><thead><tr><th>Paese</th><th>Lega</th><th>Provider</th><th>Prima stagione</th><th>Ultima stagione</th>`
    + `<th>Stagioni</th><th>404</th><th>Partite</th><th>Stato</th><th>Quote</th><th>xG</th><th>Buchi</th><th>Onboarding</th><th>Overlap FPT/TC</th></tr></thead>`
    + `<tbody>${body}</tbody></table></div>`);
}

export function renderCoverageSeasons(country, league, rows) {
  const body = rows.map(r => `<tr><td>${esc(r.season)}</td><td>${esc(r.availability ?? 'non pubblicata')}</td>`
    + `<td>${esc(r.classification ?? '–')}</td><td>${esc(r.onboarding_state ?? '–')}</td>`
    + `<td class="num">${esc(r.matches)}</td><td>${day(r.first_date)}</td><td>${day(r.last_date)}</td>`
    + `<td class="num">${pct(r.odds_coverage)}</td><td class="num">${pct(r.xg_coverage)}</td><td class="num">${esc(r.fields_available)}</td>`
    + `<td>${day(r.last_success_at)}</td><td>${r.gap ? '<span class="warn">buco</span>' : ''}</td></tr>`).join('');
  return page(`Coverage ${country}/${league}`, `<p><a href="/coverage">← tutte le competizioni</a></p>`
    + `<h1>${esc(country)} / ${esc(league)}</h1>` + NOTES
    + `<div class="wrap"><table><thead><tr><th>Stagione</th><th>Disponibilità</th><th>Classificazione</th><th>Onboarding</th>`
    + `<th>Partite</th><th>Prima partita</th><th>Ultima partita</th><th>Quote</th><th>xG</th><th>Campi</th><th>Ultimo download</th><th>Anomalie</th></tr></thead>`
    + `<tbody>${body}</tbody></table></div>`);
}
