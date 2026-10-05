// Renders the FPT-PR-09 certificate JSON as Markdown. Pure function: it only prints what the report holds.

const yes = value => (value === true ? 'PASS' : 'FAIL');
const n = value => (value == null ? 'N/D' : typeof value === 'number' ? value.toLocaleString('en-US') : String(value));
const cell = value => String(value ?? 'N/D').replace(/\|/g, '\\|').replace(/\n/g, ' ');

function table(headers, rows) {
  if (!rows.length) return '_nessuna riga_\n';
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map(row => `| ${row.map(cell).join(' | ')} |`)
  ].join('\n') + '\n';
}

function kv(obj) {
  return table(['campo', 'valore'], Object.entries(obj || {}).map(([k, v]) => [k, typeof v === 'object' && v !== null ? JSON.stringify(v) : n(v)]));
}

function details(summary, body) {
  return `<details><summary>${summary}</summary>\n\n${body}\n</details>\n`;
}

export function renderCertificateMarkdown(report, {deploy = null, verification = []} = {}) {
  const r = report;
  const id = r.identity;
  const out = [];
  const date = String(id.generated_at).slice(0, 10);
  out.push(`# FutPythonTrader — certificato finale ${date}`);
  out.push('');
  out.push(`**Esito: ${r.verdict}**`);
  out.push('');
  out.push(`Generato da \`/api/futpython-certificate\` sul servizio Render alle ${id.generated_at} (UTC). Ogni numero sotto viene dal report; nessun valore è stato scritto a mano. Issue #12 (FPT-CERT).`);
  out.push('');
  if (r.failed_gates?.length) {
    out.push(`Gate falliti: ${r.failed_gates.map(g => `\`${g}\``).join(', ')}.`);
    out.push('');
  }

  out.push('## Gate');
  out.push(table(['gate', 'esito'], Object.entries(r.gates).map(([k, v]) => [k, yes(v)])));

  out.push('## 1. Identità');
  out.push(kv({...id, render_deploy_id: deploy || 'N/D'}));

  const c = r.catalog;
  out.push('## 2. Catalogo');
  out.push(kv({
    catalog_total: c.catalog_total, countries: c.countries, leagues: c.leagues,
    classified_total: c.classified_total, unclassified: c.unclassified,
    duplicate_catalog_keys: c.duplicate_catalog_keys, inactive_rows: c.inactive_rows,
    ...Object.fromEntries(Object.entries(c.classification).map(([k, v]) => [k, v])),
    classification_sum: c.classification_sum,
    'classified_total === catalog_total': c.classified_total === c.catalog_total
  }));
  out.push(`http_disposition: ${JSON.stringify(c.http_disposition)}\n`);
  out.push(`Gate: **${yes(c.gate)}**\n`);

  const d = r.data;
  out.push('## 3. Dati');
  out.push(kv({
    snapshots: d.snapshots, dataset_snapshots: d.dataset_snapshots, today_snapshots: d.today_snapshots,
    incomplete_snapshots: d.incomplete_snapshots, dataset_rows: d.dataset_rows, versions: d.versions,
    historical_versions: d.historical_versions, prematch_versions: d.prematch_versions,
    unique_matches: d.unique_matches, min_date: d.min_date, max_date: d.max_date
  }));
  out.push(details(`Per stagione (${d.per_season.length})`, table(['season', 'leghe', 'match'], d.per_season.map(x => [x.season, x.leagues, x.matches]))));
  out.push(details(`Per lega (${d.per_league.length})`, table(['lega', 'stagioni', 'versioni', 'match', 'prima', 'ultima'],
    d.per_league.map(x => [x.league, x.seasons, x.versions, x.matches, x.first_season, x.last_season]))));
  out.push(details(`Per dataset (${d.per_dataset.length})`, table(['dataset', 'versioni', 'match', 'min', 'max'],
    d.per_dataset.map(x => [x.dataset_key, x.versions, x.matches, x.min_date, x.max_date]))));

  const i = r.integrity;
  out.push('## 4. Integrità');
  out.push('Rilettura completa di ogni gzip salvato (hash, parser, `row_count`, righe DB).');
  out.push(kv({
    ...i.raw_sweep.totals,
    sweep_failures: i.raw_sweep.failures.length,
    duplicate_snapshot_hashes: i.duplicate_snapshot_hashes,
    duplicate_versions: i.duplicate_versions,
    zero_loss: i.zero_loss
  }));
  out.push('Controlli SQL FASE 3:');
  out.push(kv(i.phase3));
  if (i.raw_sweep.today.length) {
    out.push('Snapshot `jogos-do-dia`: le righe DB possono essere meno di `row_count` perché una versione identica non viene reinserita.');
    out.push(table(['snapshot', 'dataset', 'row_count', 'db_rows'], i.raw_sweep.today.map(x => [x.snapshot_id, x.dataset_key, x.row_count, x.db_rows])));
  }
  out.push(`Gate: **${yes(i.gate)}**\n`);

  out.push('## 5. Schema');
  out.push(kv(r.schema));

  const cov = r.coverage;
  out.push('## 6. Coverage');
  out.push(kv({
    global_classes: cov.global_classes, normalized_classes: cov.normalized_classes,
    global_tags: cov.global_tags, rows_per_dimension: cov.rows_per_dimension
  }));
  out.push(details('Audit FASE 5', kv(cov.phase5)));
  out.push(`Gate: **${yes(cov.gate)}**\n`);

  const s = r.seasons;
  out.push('## 7. Registry competizione e stagione');
  out.push(kv({
    competitions: s.competitions, competition_seasons: s.competition_seasons,
    earliest_season: s.earliest_season, latest_season: s.latest_season,
    missing_available_seasons: s.missing_available_seasons, onboarding_status: s.onboarding_status,
    gaps: s.gaps.length
  }));
  out.push(details(`Buchi rilevati (${s.gaps.length})`, table(['paese', 'lega', 'stagione', 'detector', 'in_catalog', 'missing_available'],
    s.gaps.map(g => [g.country_slug, g.league_slug, g.season, g.detector, g.in_catalog, g.missing_available]))));
  out.push(`Gate: **${yes(s.gate)}**\n`);

  out.push('## 8. Riproducibilità point-in-time');
  out.push(kv(r.point_in_time));

  const e = r.entity_resolution;
  out.push('## 9. Entity resolution');
  out.push(kv({
    teams: e.teams, aliases: e.aliases, team_splits: e.team_splits, with_provider_team_id: e.with_provider_team_id,
    historical_unresolved_home: e.historical_unresolved_home, historical_unresolved_away: e.historical_unresolved_away,
    coded_international_teams: e.coded_international_teams, links_total: e.links_total, link_status: e.link_status
  }));
  out.push(details(`Codici paese internazionali (${e.codes.length})`, table(['codice', 'paese derivato', 'squadre', 'collegate'],
    e.codes.map(x => [x.country_code, x.code_country_slug, x.teams, x.linked]))));
  out.push(`Gate: **${yes(e.gate)}**\n`);

  out.push('## 10. Lineage');
  const {version_sets: versionSets, ...lineage} = r.lineage;
  out.push(kv(lineage));
  out.push(table(['provider', 'parser', 'schema', 'transform', 'versioni'], versionSets.map(v => [v.source_provider, v.parser_version, v.schema_version, v.transform_version, v.n])));

  const l = r.request_ledger;
  out.push('## 11. Request ledger e budget API');
  out.push(kv({
    rows: l.rows, first_row: l.first_row, last_row: l.last_row, api_key_paths: l.api_key_paths,
    unknown_outcomes: l.unknown_outcomes, rows_without_endpoint_family: l.rows_without_endpoint_family,
    rows_with_latency: l.rows_with_latency, rows_with_budget_state: l.rows_with_budget_state,
    rows_with_provider_quota: l.rows_with_provider_quota, deduped_rows: l.deduped_rows,
    by_budget_state: l.by_budget_state, window: l.window, config: l.config
  }));
  out.push(table(['outcome', 'endpoint', 'righe', 'latenza p50 ms', 'latenza max ms'],
    l.by_outcome.map(x => [x.outcome, x.endpoint_family, x.n, x.latency_p50_ms, x.latency_max_ms])));
  out.push('Meccanismi e test che li provano:');
  out.push(table(['meccanismo', 'test'], Object.entries(l.mechanisms)));
  out.push(`Gate: **${yes(l.gate)}**\n`);

  const inc = r.incremental_sync;
  out.push('## 12. Sync incrementale');
  out.push(table(['run', 'kind', 'status', 'cache_hit', 'upstream', 'dataset upstream', 'errori', 'snapshot', 'righe'],
    inc.certified_runs.map(x => [x.run_id, x.kind, x.status, x.cache_hit, x.upstream, x.dataset_upstream, x.failed_requests, x.snapshots_inserted, x.rows_inserted])));
  out.push(`Run successivi non backfill: ${inc.later_runs.length}\n`);
  if (inc.later_runs.length) {
    out.push(table(['run', 'kind', 'status', 'started_at', 'snapshot', 'righe'],
      inc.later_runs.map(x => [x.run_id, x.kind, x.status, x.started_at, x.snapshots_inserted, x.rows_inserted])));
  }
  out.push(`Gate: **${yes(inc.gate)}**\n`);

  const w = r.watchdog;
  out.push('## 13. Watchdog e Telegram');
  out.push(kv({phase8_gate: w.phase8?.gate, phase8_status: w.phase8?.status, check: w.check, alerts: w.alerts, deliveries_without_repeat: w.deliveries_without_repeat}));
  out.push(table(['code', 'severity', 'occorrenze', 'ultimo'], w.open_alerts.map(a => [a.code, a.severity, a.occurrences, a.last_seen])));

  const f = r.normalized_layer;
  out.push('## 14. Layer di query normalizzato');
  out.push(kv({...f, columns: f.columns.join(', ')}));

  const fr = r.filter_registry;
  out.push('## 15. Registry metadati filtri');
  out.push(kv(fr));

  const a = r.assistant_query_layer;
  out.push('## 16. Layer di query per l’assistente');
  out.push('Le risposte vengono da Neon. Il modulo non importa il client FutPythonTrader.');
  out.push(table(['route', 'query'], Object.entries(a.routes)));
  out.push(table(['query', 'righe', 'chiamate upstream', 'prima riga'], a.answers.map(x => [x.query, x.row_count, x.upstream_calls, JSON.stringify(x.first)])));
  out.push(`Gate: **${yes(a.gate)}**\n`);

  const p = r.query_performance;
  out.push('## 17. Performance query su Neon');
  out.push(`Limiti: esecuzione ≤ ${p.limits.maxExecutionMs} ms, righe lette ≤ ${n(p.limits.maxRowsScanned)}, nessun Seq Scan su fpt_match_facts / fpt_match_versions / fpt_raw_snapshots. Una prima esecuzione scalda la cache, poi \`EXPLAIN (ANALYZE, BUFFERS)\`.\n`);
  out.push(table(['query', 'esito', 'exec ms', 'plan ms', 'righe lette', 'indici', 'seq scan grandi'],
    p.queries.map(x => [x.query, yes(x.pass), x.execution_ms, x.planning_ms, x.rows_scanned, x.indexes.join(', '), x.seq_scan_on_large_table.join(', ') || '-'])));
  out.push(`Gate: **${yes(p.gate)}**\n`);

  out.push('## Limiti noti');
  out.push(r.known_limitations.length ? r.known_limitations.map(x => `- \`${x.code}\`: ${x.text}`).join('\n') + '\n' : '_nessuno_\n');

  if (verification.length) {
    out.push('## Verifica incrociata');
    out.push(verification.map(line => `- ${line}`).join('\n') + '\n');
  }

  out.push('## Esito');
  out.push(`**${r.verdict}**`);
  out.push('');
  out.push('La issue #12 resta aperta. La chiusura è riservata all’owner.');
  return out.join('\n') + '\n';
}
