export const CLOSING_RULE_VERSION='closing_odds_pit_v1';
const keys=['provider','event_id','bookmaker','market_key','selection_key','line_value'];
// observation_id orders candidate output only; it never participates in temporal ranking.
export function closingSql(source,{retrospective=false}={}) {
 const key=keys.join(',');
 const eligible=`provider_time <= kickoff_utc${retrospective?'':' AND observed_at <= kickoff_utc'}`;
 return `WITH universe AS (SELECT DISTINCT ${key} FROM ${source}), ranked AS (
 SELECT *,dense_rank() OVER (PARTITION BY ${key} ORDER BY provider_time DESC,observed_at DESC) AS temporal_rank
 FROM ${source} WHERE ${eligible}
 ), winners AS (
 SELECT ${key},max(provider_time) AS closing_provider_time,max(observed_at) AS closing_observed_at,
 CASE WHEN count(DISTINCT price)=1 AND count(price)=count(*) THEN (array_agg(price ORDER BY observation_id))[1] END AS closing_odds_pit,
 CASE WHEN count(DISTINCT price)=1 AND count(price)=count(*) THEN 'AVAILABLE' ELSE 'AMBIGUOUS_SAME_TIMESTAMP' END AS closing_status,
 array_agg(price ORDER BY observation_id) AS candidate_prices,array_agg(observation_id ORDER BY observation_id) AS candidate_observation_ids
 FROM ranked WHERE temporal_rank=1 GROUP BY ${key}
 ) SELECT ${keys.map(k=>'u.'+k).join(',')},w.closing_odds_pit,
 coalesce(w.closing_status,'UNAVAILABLE') AS closing_status,w.closing_provider_time,w.closing_observed_at,
 w.candidate_prices,w.candidate_observation_ids,'${CLOSING_RULE_VERSION}' AS closing_rule_version
 FROM universe u LEFT JOIN winners w ON ${keys.map(k=>`u.${k} IS NOT DISTINCT FROM w.${k}`).join(' AND ')}`;
}
export function regeneratedSummarySql(){
 const fields=['provider','event_id','bookmaker','market_key','selection_key','line_value','sport_id','country_code','league_id','league_name','kickoff_utc','opening_price','latest_price','min_price','max_price','first_observed_at','last_observed_at','observations','change_open_latest'];
 return `SELECT ${fields.map(k=>'s.'+k).join(',')},c.closing_odds_pit AS closing_price,
 NULL::numeric AS change_open_close,c.closing_odds_pit,c.closing_status,c.closing_provider_time,c.closing_observed_at,c.candidate_prices,c.candidate_observation_ids,c.closing_rule_version
 FROM provider_trial.odds_summary s JOIN (${closingSql('provider_trial.odds_observations')}) c ON ${keys.map(k=>`s.${k} IS NOT DISTINCT FROM c.${k}`).join(' AND ')}`;
}
export function pitViewsSql(){return `
 CREATE OR REPLACE VIEW v_closing_odds_pit AS ${closingSql('canonical_odds_observations')};
 CREATE OR REPLACE VIEW v_provider_closing_retrospective AS ${closingSql('canonical_odds_observations',{retrospective:true}).replaceAll('closing_odds_pit','provider_closing_retrospective')};
 CREATE OR REPLACE VIEW v_prematch AS SELECT * FROM v_odds_timeline WHERE provider_time<=kickoff_utc AND observed_at<=kickoff_utc;
 CREATE OR REPLACE VIEW v_replay_asof AS SELECT *,greatest(provider_time,observed_at) AS valid_from FROM v_prematch;
 CREATE OR REPLACE VIEW v_market_movement AS SELECT * FROM v_closing_odds_pit;
 CREATE OR REPLACE VIEW v_backtest_observations AS SELECT *,kickoff_utc AS kickoff_cutoff,'${CLOSING_RULE_VERSION}' AS closing_rule FROM v_prematch;
 CREATE OR REPLACE VIEW v_indicator_inputs AS SELECT provider,event_id,market_key,selection_key,line_value,price,provider_time,observed_at,acquisition_time,effective_at,kickoff_utc,'UNAVAILABLE'::VARCHAR AS liquidity_status,'INDICATOR_INPUT_READY'::VARCHAR AS readiness FROM v_prematch;
 UPDATE strategy_field_catalog SET source_view='v_prematch',phases='prematch',temporal_semantics='provider_time AND observed_at <= kickoff; apply valid_from <= as_of for replay' WHERE source_view='v_odds_timeline';
 CREATE OR REPLACE VIEW v_math_inputs AS SELECT provider,event_id,bookmaker,market_key,selection_key,line_value,price,provider_time,observed_at,acquisition_time,effective_at,kickoff_utc,'UNAVAILABLE'::VARCHAR AS liquidity_status,NULL::DOUBLE AS available_liquidity,NULL::DOUBLE AS matched_fill_price,'MATH_INPUT_READY'::VARCHAR AS readiness FROM v_prematch;
 `;}

// All frozen groups may be UNAVAILABLE: never rely on JSON null-only type inference.
export function summaryProjection(source){
 return `SELECT * EXCLUDE (closing_price,change_open_close,closing_odds_pit,closing_provider_time,closing_observed_at,candidate_prices,candidate_observation_ids),
 CAST(closing_price AS DOUBLE) closing_price,CAST(change_open_close AS DOUBLE) change_open_close,CAST(closing_odds_pit AS DOUBLE) closing_odds_pit,
 CAST(closing_provider_time AS TIMESTAMP) closing_provider_time,CAST(closing_observed_at AS TIMESTAMP) closing_observed_at,
 CAST(candidate_prices AS DOUBLE[]) candidate_prices,CAST(candidate_observation_ids AS BIGINT[]) candidate_observation_ids FROM ${source}`;
}
