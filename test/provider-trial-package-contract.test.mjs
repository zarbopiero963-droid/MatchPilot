import test from 'node:test';import assert from 'node:assert/strict';
import {assertPackageContract,ARCHIVE_VERSION,ANALYTICS_VERSION,RAW_DATASETS,CANONICAL_DATASETS,REQUIRED_VIEWS,PARQUETS,REQUIRED_FILES} from '../scripts/lib/provider-trial-package-contract.mjs';
function valid(){
 const counts=Object.fromEntries(CANONICAL_DATASETS.map(n=>[n,n==='odds_summary'?64446:1]));
 const stats=n=>({db:n,rows:n,distinct_keys:n,duplicate_keys:0,missing_keys:0,extra_keys:0});
 const analytics={package_version:ANALYTICS_VERSION,closing_rule_version:'closing_odds_pit_v1',counts,contamination:Object.fromEntries(CANONICAL_DATASETS.map(n=>[n,0])),files:[...PARQUETS,'matchpilot_trial.duckdb'].map(file=>({file})),views:Object.fromEntries(REQUIRED_VIEWS.map(n=>[n,0])),closing_pit_coverage:{total_groups:64446,available:0,unavailable:64446,ambiguous_same_timestamp:0,arbitrary_prices_selected:0},readiness:{closing_odds_pit:'UNAVAILABLE',limitation:'NO_FROZEN_OBSERVATION_SATISFIES_BOTH_PREMATCH_CLOCKS',retrospective:'AUDIT_RESEARCH_ONLY_NOT_PIT_FEATURE'}};
 return {manifest:{archive_version:ARCHIVE_VERSION,datasets:RAW_DATASETS.map(name=>({name,file:name+'.ndjson.gz',rows:name==='odds_summary'?64446:1}))},analytics,report:{version:'provider-trial-final-reconciliation-v2',export:Object.fromEntries(RAW_DATASETS.map(n=>[n,stats(n==='odds_summary'?64446:1)])),canonical:Object.fromEntries(CANONICAL_DATASETS.map(n=>[n,stats(counts[n])])),pit:{result:'PASS',mismatch_count:0,closing_rule_version:'closing_odds_pit_v1',statuses:[{closing_status:'UNAVAILABLE',groups:64446}]},analytics_manifest:{counts,files:analytics.files},final_checksums:{files_hashed:26},scoretrend_excluded:stats(1),transient_files:[]},files:[...REQUIRED_FILES]};
}
test('complete regenerated metadata contract accepted',()=>assert.equal(assertPackageContract(valid()),true));
for(const [name,mutate] of [
 ['missing dataset',p=>p.manifest.datasets.pop()],
 ['missing view',p=>delete p.analytics.views.v_prematch],
 ['empty report section',p=>p.report.export={}],
 ['empty report analytics files',p=>p.report.analytics_manifest.files=[]],
 ['missing closing version',p=>delete p.analytics.closing_rule_version],
 ['wrong closing version',p=>p.analytics.closing_rule_version='legacy'],
 ['wrong archive version',p=>p.manifest.archive_version='provider-trial-freeze-v1'],
 ['missing canonical',p=>delete p.analytics.counts.events],
 ['missing parquet',p=>p.files=p.files.filter(n=>n!=='parquet/canonical/events.parquet')],
 ['missing DuckDB',p=>p.files=p.files.filter(n=>n!=='matchpilot_trial.duckdb')],
 ['empty PIT report',p=>p.report.pit={}],
 ['missing readiness',p=>delete p.analytics.readiness],
 ['incomplete consistent package',p=>{p.files=['manifest.json'];p.manifest.datasets=[];p.analytics.counts={events:1};p.report.export={};}]
])test('fail-closed package rejects '+name,()=>{const p=valid();mutate(p);assert.throws(()=>assertPackageContract(p),/package_contract/);});
