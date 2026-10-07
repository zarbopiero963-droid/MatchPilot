export const ARCHIVE_VERSION='provider-trial-regenerated-pit-v1';
export const ANALYTICS_VERSION='matchpilot-trial-analytics-pit-v2';
export const RAW_DATASETS=['records','sports','competitions','coverage','events','odds_observations','odds_summary','reconciliation_state'];
export const CANONICAL_DATASETS=['sports','competitions','coverage','events','odds_observations','odds_summary'];
export const CLEAN_DATASETS=['sports','competitions','coverage','events'];
export const REQUIRED_VIEWS=['v_prematch','v_live','v_replay_asof','v_events','v_odds_timeline','v_market_movement','v_coverage','v_provider_comparison','v_strategy_fields','v_indicator_inputs','v_math_inputs','v_backtest_observations','v_outcomes','v_closing_odds_pit','v_provider_closing_retrospective','v_pit_observation_timeline'];
export const PARQUETS=[...CANONICAL_DATASETS.map(n=>'parquet/canonical/'+n+'.parquet'),'parquet/quality/reconciliation_state.parquet','parquet/comparison/provider_comparison.parquet'];
export const REQUIRED_FILES=[...RAW_DATASETS.map(n=>n+'.ndjson.gz'),...CLEAN_DATASETS.map(n=>'canonical_without_scoretrend/'+n+'.ndjson.gz'),'scoretrend_excluded.ndjson.gz','manifest.json','SHA256SUMS.txt','analytics_manifest.json','secret_scan_report.json','final_checksums.json','SHA256SUMS.final.txt','final_reconciliation_report.json',...PARQUETS,'matchpilot_trial.duckdb'];
const same=(a,b)=>Array.isArray(a)&&a.length===b.length&&new Set(a).size===a.length&&JSON.stringify([...a].sort())===JSON.stringify([...b].sort());
export function assertPackageContract({manifest,analytics,report,files}){
 const check=(ok,reason)=>{if(!ok)throw new Error('package_contract_'+reason);};
 check(manifest.archive_version===ARCHIVE_VERSION,'archive_version');
 check(analytics.package_version===ANALYTICS_VERSION,'analytics_version');
 check(analytics.closing_rule_version==='closing_odds_pit_v1','closing_rule_version');
 check(same(files,REQUIRED_FILES),'file_set');
 check(same(manifest.datasets?.map(d=>d.name),RAW_DATASETS)&&same(manifest.datasets?.map(d=>d.file),RAW_DATASETS.map(n=>n+'.ndjson.gz')),'raw_datasets');
 check(same(Object.keys(analytics.counts||{}),CANONICAL_DATASETS)&&Object.values(analytics.counts).every(n=>Number.isSafeInteger(n)&&n>0),'canonical_datasets');
 check(same(Object.keys(analytics.contamination||{}),CANONICAL_DATASETS),'contamination');
 check(same(analytics.files?.map(f=>f.file),[...PARQUETS,'matchpilot_trial.duckdb']),'analytics_files');
 check(same(Object.keys(analytics.views||{}),REQUIRED_VIEWS)&&Object.values(analytics.views).every(n=>Number.isSafeInteger(n)&&n>=0),'views');
 check(same(Object.keys(report.export||{}),RAW_DATASETS),'report_export');
 check(same(Object.keys(report.canonical||{}),CANONICAL_DATASETS),'report_canonical');
 check(report.pit?.result==='PASS'&&report.pit.mismatch_count===0&&report.pit.closing_rule_version==='closing_odds_pit_v1'&&Array.isArray(report.pit.statuses)&&report.pit.statuses.length>0,'report_pit');
 check(report.pit.statuses.length===1&&report.pit.statuses[0].closing_status==='UNAVAILABLE'&&Number(report.pit.statuses[0].groups)===64446,'frozen_pit_statuses');
 check(report.version==='provider-trial-final-reconciliation-v2'&&report.analytics_manifest?.counts&&report.final_checksums?.files_hashed>0&&report.scoretrend_excluded&&Array.isArray(report.transient_files),'report_sections');
 check(analytics.closing_pit_coverage?.total_groups===64446&&analytics.closing_pit_coverage.available===0&&analytics.closing_pit_coverage.unavailable===64446&&analytics.closing_pit_coverage.ambiguous_same_timestamp===0&&analytics.closing_pit_coverage.arbitrary_prices_selected===0&&analytics.readiness?.closing_odds_pit&&analytics.readiness?.limitation&&analytics.readiness?.retrospective,'coverage_readiness');
 for(const name of RAW_DATASETS){
  const r=report.export[name],m=manifest.datasets.find(d=>d.name===name);
  check(Number.isSafeInteger(r.rows)&&r.rows>0&&r.rows===r.db&&r.rows===r.distinct_keys&&r.rows===m.rows&&r.duplicate_keys===0&&r.missing_keys===0&&r.extra_keys===0,'report_export_'+name);
 }
 for(const name of CANONICAL_DATASETS){const r=report.canonical[name];check(Number.isSafeInteger(r.rows)&&r.rows>0&&r.rows===r.db&&r.rows===r.distinct_keys&&r.rows===analytics.counts[name]&&r.duplicate_keys===0&&r.missing_keys===0&&r.extra_keys===0,'report_canonical_'+name);}
 check(same(report.analytics_manifest.files?.map(f=>f.file),[...PARQUETS,'matchpilot_trial.duckdb']),'report_analytics_files');
 check(Number.isSafeInteger(report.scoretrend_excluded.rows)&&report.scoretrend_excluded.rows>0&&report.scoretrend_excluded.duplicate_keys===0&&report.scoretrend_excluded.missing_keys===0&&report.scoretrend_excluded.extra_keys===0,'report_scoretrend');
 check(JSON.stringify(report.analytics_manifest.counts)===JSON.stringify(analytics.counts),'report_analytics_counts');
 return true;
}
