import { getFreezeBoundary, listProviderTrialDatasets, resolveDatasetOrder, DATASET_ORDER_KEYS } from './provider-trial-final-export.mjs';

export const FROZEN_DATASET=Object.freeze({freeze_at_utc:'2026-10-06T11:18:19.484Z',max_raw_record_id:82862,total_raw:82862});
export const ARCHIVE_QUALIFICATION='REGENERATED CERTIFIED ARCHIVE FROM SAME FROZEN DATASET';

// Legacy opening/latest are retained only for audit; ambiguity there still blocks export.
// Closing is separately derived under the owner-authorized PIT rule.
export const PRICE_TIE_SQL=`WITH ranked AS (
 SELECT provider,event_id,bookmaker,market_key,selection_key,line_value,price,
 coalesce(provider_time,observed_at) AS effective_at,observed_at,
 dense_rank() OVER (PARTITION BY provider,event_id,bookmaker,market_key,selection_key,line_value ORDER BY coalesce(provider_time,observed_at),observed_at) AS first_rank,
 dense_rank() OVER (PARTITION BY provider,event_id,bookmaker,market_key,selection_key,line_value ORDER BY coalesce(provider_time,observed_at) DESC,observed_at DESC) AS last_rank
 FROM provider_trial.odds_observations
), candidates AS (
 SELECT 'opening' AS kind,provider,event_id,bookmaker,market_key,selection_key,line_value,price FROM ranked WHERE first_rank=1
 UNION ALL SELECT 'latest',provider,event_id,bookmaker,market_key,selection_key,line_value,price FROM ranked WHERE last_rank=1

) SELECT count(*)::bigint AS n FROM (
 SELECT kind,provider,event_id,bookmaker,market_key,selection_key,line_value FROM candidates
 GROUP BY kind,provider,event_id,bookmaker,market_key,selection_key,line_value
 HAVING count(DISTINCT price)>1 OR (count(price)>0 AND count(price)<count(*))
) ambiguous`;

export async function assertFrozenDataset(pool){
 const freeze=await getFreezeBoundary(pool);
 if(!freeze || Object.entries(FROZEN_DATASET).some(([k,v])=>String(freeze[k])!==String(v))) throw new Error('frozen_boundary_mismatch');
 const {rows}=await pool.query(`SELECT count(*)::bigint AS n,min(record_id)::bigint AS min_id,max(record_id)::bigint AS max_id,
 count(*) FILTER (WHERE record_id>$1 OR observed_at>$2::timestamptz)::bigint AS post_freeze
 FROM provider_trial.records`,[FROZEN_DATASET.max_raw_record_id,FROZEN_DATASET.freeze_at_utc]);
 const r=rows[0];
 if(Number(r.n)!==82862 || Number(r.min_id)!==1 || Number(r.max_id)!==82862 || Number(r.post_freeze)!==0) throw new Error('frozen_records_mismatch');
 const names=(await listProviderTrialDatasets(pool)).map(x=>x.table_name).sort();
 if(JSON.stringify(names)!==JSON.stringify(Object.keys(DATASET_ORDER_KEYS).sort())) throw new Error('frozen_dataset_set_mismatch');
 for(const name of names){
  const resolved=await resolveDatasetOrder(pool,name);
  if(name!=='odds_summary'&&JSON.stringify(resolved.primary_key)!==JSON.stringify(DATASET_ORDER_KEYS[name])) throw new Error('frozen_primary_key_mismatch_'+name);
 }
 const times={odds_observations:'observed_at',sports:'last_seen_at',competitions:'last_seen_at',coverage:'latest_observed_at',events:'last_seen_at',odds_summary:'last_observed_at'};
 for(const [name,col] of Object.entries(times)){
  const q=await pool.query('SELECT count(*)::bigint AS n FROM provider_trial.'+name+' WHERE '+col+'>$1::timestamptz',[FROZEN_DATASET.freeze_at_utc]);
  if(Number(q.rows[0].n)!==0) throw new Error('post_freeze_'+name);
 }
 const ties=await pool.query(PRICE_TIE_SQL);
 if(Number(ties.rows[0].n)!==0) throw new Error('OWNER_DECISION_REQUIRED_ambiguous_odds_summary_prices_'+ties.rows[0].n);
 return freeze;
}
