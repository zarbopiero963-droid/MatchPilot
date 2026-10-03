import pg from 'pg';
import {pathToFileURL} from 'node:url';
import {ensureCatalogueSchema,seedCatalogue,extractLeagues,extractTeams,persistRoster,quarantine,extractBacktestLeagues,recordLeagueSources,extractStatisticSamples} from './source-catalog.mjs';
export async function syncCatalogueRun(pool,prefix){
if(!prefix||!prefix.startsWith('source-catalogue-')&&!prefix.startsWith('source-backtest-catalogue-'))throw Error('Provide an evidenced catalogue run prefix');
 const active=await pool.query('SELECT run_id FROM matchpilot_test_runs WHERE run_id=$1 AND completed_at IS NULL',[prefix]);
 if(active.rowCount)throw Error('Wait for browser run completion');
 await ensureCatalogueSchema(pool);
 const rows=await pool.query("SELECT snapshot_id,data FROM matchpilot_source_snapshots WHERE left(snapshot_id,length($1))=$1 ORDER BY captured_at",[prefix]);
 if(prefix.startsWith('source-backtest-catalogue-')){
  const backtest=rows.rows.filter(r=>r.data.checkboxes?.some(c=>c.attrs?.some(a=>a[0]==='data-league'))).at(-1);if(!backtest)throw Error('Populated Backtest league snapshot missing');
  const approved=JSON.parse(await (await import('node:fs/promises')).readFile(new URL('./data/approved-leagues.json',import.meta.url),'utf8'));
  const sid=approved.sourceCatalogues.find(s=>s.id==='statistiche_lega').snapshotId;
  const stats=await pool.query('SELECT data FROM matchpilot_source_snapshots WHERE snapshot_id=$1',[sid]);if(!stats.rowCount)throw Error('Real Statistiche Lega baseline missing');
  await seedCatalogue(pool,extractLeagues(stats.rows[0].data),sid);
  await recordLeagueSources(pool,'statistiche_lega',extractStatisticSamples(stats.rows[0].data),sid);
  await recordLeagueSources(pool,'backtest_storico',extractBacktestLeagues(backtest.data),backtest.snapshot_id);
  return (await pool.query('SELECT * FROM mp_catalog_coverage ORDER BY id')).rows;
 }
 const catalog=rows.rows.filter(r=>r.snapshot_id.endsWith('-league-catalog')).at(-1);
 if(!catalog)throw Error('Real league snapshot missing');
 await seedCatalogue(pool,extractLeagues(catalog.data),catalog.snapshot_id);
 await recordLeagueSources(pool,'statistiche_lega',statsRecords,catalog.snapshot_id);
 // Explicit source labels, never fuzzy string matching. Additional aliases require evidence review.
 const aliases={'BRAZIL SERIE B':'brazil 2','NORWAY 1. DIVISION':'norway 2','NETHERLANDS EERSTE DIVISIE':'netherlands 2','ENGLAND LEAGUE ONE':'england 3','SPAIN LA LIGA 2':'spain 2','ARGENTINA LIGA PROFESIONAL DE FÚTBOL':'argentina 1','COLOMBIA LIGA BETPLAY':'colombia 1'};
 for(const r of rows.rows.filter(r=>r.data.leagueLabel)){
  const leagueId=aliases[r.data.leagueLabel];
  if(!leagueId){await quarantine(pool,r.snapshot_id,'unresolved_league_label',{label:r.data.leagueLabel});continue;}
  const tables=r.data.tables.filter(t=>t.rows?.some(x=>x.cells?.some(c=>/^SQUADRA$/i.test(c.text.trim()))));
  if(tables.length!==1){await quarantine(pool,r.snapshot_id,'ambiguous_standings_tables',{count:tables.length});continue;}
  const previous=await pool.query('SELECT league_id FROM mp_league_aliases WHERE source_name=$1',[r.data.leagueLabel]);if(previous.rowCount&&previous.rows[0].league_id!==leagueId)throw Error('Conflicting league alias; review required');
  await pool.query('INSERT INTO mp_league_aliases(source_name,league_id,evidence_snapshot) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[r.data.leagueLabel,leagueId,r.snapshot_id]);
  await persistRoster(pool,{leagueId,snapshotId:r.snapshot_id,matchId:r.data.match.id,groupName:r.data.groupName||'overall',teams:extractTeams(tables[0]),allGroups:false});
 }
 return (await pool.query('SELECT * FROM mp_catalog_coverage ORDER BY id')).rows;
}
if(process.argv[1] && pathToFileURL(process.argv[1]).href===import.meta.url){const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:2});try{console.log(JSON.stringify(await syncCatalogueRun(pool,process.argv[2])));}finally{await pool.end();}}
