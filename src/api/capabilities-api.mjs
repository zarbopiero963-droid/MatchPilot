// MP-CAP-01b (#263, MP-OWNER-IMPL-20261101 item 2): GET /api/v1/capabilities, the dynamic capability catalog, read only.
// - FutPythonTrader: one entry per column of the schema registry (fpt_schema_fields, with the global coverage of
//   fpt_field_coverage), recomputed with the current timing rule; the provider is retired, so these are the frozen
//   historical archive.
// - API-FOOTBALL: the capabilities observed in the real verification of 2026-11-01, without a call (no provider call
//   from the API, ever).
// Search, analysis, strategies and the interface can be built from this list instead of a fixed list of markets.
import { buildCatalog, fptFieldCapability, KINDS, STATUSES } from '../capabilities/catalog.mjs';
import { apiFootballCapabilities, apiFootballDeferred } from '../capabilities/apifootball.mjs';

export const CAPABILITY_PROVIDERS = Object.freeze(['fpt', 'apifootball']);
// The registry holds a few hundred columns; the cap only bounds a corrupted registry.
export const FPT_FIELDS_MAX = 5000;

export const FPT_CAPABILITY_SQL = `SELECT f.field_name, f.inferred_type, f.nonempty_seen, f.filterable, c.coverage_ratio
  FROM fpt_schema_fields f
  LEFT JOIN fpt_field_coverage c ON c.dimension = 'global' AND c.dimension_key = '' AND c.field_name = f.field_name
  ORDER BY f.field_name
  LIMIT $1`;

function counts(list) {
  const out = {by_provider: {}, by_kind: {}, by_status: {}};
  for (const c of list) {
    for (const [bucket, key] of [['by_provider', c.provider], ['by_kind', c.kind], ['by_status', c.status]]) out[bucket][key] = (out[bucket][key] ?? 0) + 1;
  }
  return out;
}

// The catalog as the endpoint returns it. `rows` are the FutPythonTrader registry rows (null when not read).
export function capabilityCatalog(rows, {provider = null, kind = null, status = null} = {}) {
  const fpt = rows ? rows.slice(0, FPT_FIELDS_MAX).map(row => fptFieldCapability(row)) : [];
  const entries = [...(provider === 'apifootball' ? [] : fpt), ...(provider === 'fpt' ? [] : apiFootballCapabilities())];
  const catalog = buildCatalog(entries);
  const selected = catalog.capabilities.filter(c => (!kind || c.kind === kind) && (!status || c.status === status));
  return {
    version: catalog.version,
    rows: selected,
    counts: counts(selected),
    deferred: provider === 'fpt' ? [] : apiFootballDeferred(),
    errors: catalog.errors,
    truncated: Boolean(rows && rows.length > FPT_FIELDS_MAX),
    notes: [
      'NOT VERIFIED is the default: nothing is declared available from documentation alone',
      'AVAILABLE BUT NOT IMPLEMENTED: observed from the provider, not stored or usable in MatchPilot yet',
      'no capability claims a complete coverage; coverage is a measured ratio or null when unknown'
    ]
  };
}

export function capabilitiesEndpoint({param, oneOf}) {
  return {
    path: '/api/v1/capabilities', source: 'MatchPilot',
    summary: 'Catalogo delle capacità per provider: campi, mercati e statistiche realmente offerti, con stato, tempi PIT, fasi, provenienza e limiti',
    params: {
      provider: param(`${CAPABILITY_PROVIDERS.join(' | ')}`, false, oneOf('provider', CAPABILITY_PROVIDERS)),
      kind: param(`${KINDS.join(' | ')}`, false, oneOf('kind', KINDS)),
      status: param('one of the inventory statuses', false, oneOf('status', STATUSES))
    },
    read: async (client, input) => {
      // API-FOOTBALL alone needs no database: the registry is read only when FutPythonTrader entries are asked for.
      const rows = input.provider === 'apifootball' ? null : (await client.query(FPT_CAPABILITY_SQL, [FPT_FIELDS_MAX + 1])).rows;
      return capabilityCatalog(rows, input);
    },
    provenance: data => ({source: 'fpt_schema_fields + api-football verification 2026-11-01', upstream_calls: 0, catalog_version: data?.version ?? null}),
    limit: () => null
  };
}
