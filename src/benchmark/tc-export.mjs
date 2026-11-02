// MP-TC-BENCH-01: TotalCorner LIVE series for the benchmark, read from the archive only (tc_matches, tc_live_snapshots,
// tc_live_events). The query runs in a READ ONLY transaction: it cannot write, and it calls no provider. Snapshot
// fields are the scalar top-level keys of the stored payload, as the provider wrote them; only the identity keys the
// collector itself uses (id, l_id, status) are left out. No field is renamed or interpreted here.
export const TC_SERIES_SQL = `
SELECT coalesce(json_agg(series ORDER BY kickoff, match_id), '[]'::json) AS series FROM (
  SELECT m.match_id, m.kickoff_utc AS kickoff, json_build_object(
    'provider', 'totalcorner',
    'match', json_build_object('id', m.match_id, 'league', m.league_id,
      'kickoff', to_char(m.kickoff_utc AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'home', m.home, 'away', m.away),
    'snapshots', (SELECT coalesce(json_agg(json_build_object(
        'acquired_at', to_char(s.acquired_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'minute', s.minute,
        'fields', (SELECT coalesce(jsonb_object_agg(e.k, e.v), '{}'::jsonb) FROM jsonb_each(s.payload) AS e(k, v)
                   WHERE jsonb_typeof(e.v) IN ('string', 'number', 'boolean') AND e.k NOT IN ('id', 'l_id', 'status')))
        ORDER BY s.acquired_at, s.snapshot_id), '[]'::json)
      FROM tc_live_snapshots s WHERE s.match_id = m.match_id),
    'events', (SELECT coalesce(json_agg(json_build_object('type', ev.event_type, 'minute', ev.minute,
        'acquired_at', to_char(ev.acquired_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) ORDER BY ev.acquired_at, ev.event_id), '[]'::json)
      FROM tc_live_events ev WHERE ev.match_id = m.match_id)
  ) AS series
  FROM tc_matches m
  WHERE m.kickoff_utc >= $1 AND m.kickoff_utc < $2
    AND EXISTS (SELECT 1 FROM tc_live_snapshots s WHERE s.match_id = m.match_id)
) t`;

const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/;
export const MAX_WINDOW_DAYS = 31;

// Series of the matches with archived LIVE snapshots whose kickoff is in [from, to). The window is bounded so that
// one export stays reviewable. `client` must be a dedicated connection (the READ ONLY transaction lives on it).
export async function exportTcSeries(client, {from, to}) {
  const a = typeof from === 'string' && ISO_WITH_OFFSET.test(from) ? Date.parse(from) : Number.NaN;
  const b = typeof to === 'string' && ISO_WITH_OFFSET.test(to) ? Date.parse(to) : Number.NaN;
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) throw new TypeError('from and to are ISO instants with time zone, from < to');
  if (b - a > MAX_WINDOW_DAYS * 86400000) throw new RangeError(`window longer than ${MAX_WINDOW_DAYS} days`);
  await client.query('BEGIN TRANSACTION READ ONLY');
  try {
    const result = await client.query(TC_SERIES_SQL, [new Date(a).toISOString(), new Date(b).toISOString()]);
    await client.query('COMMIT');
    return result.rows[0].series;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  }
}
