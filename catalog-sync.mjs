import pg from 'pg';
import {pathToFileURL} from 'node:url';
import {ensureCatalogueSchema,seedCatalogue,extractLeagues,extractTeams,persistRoster,quarantine} from './source-catalog.mjs';
export async function syncCatalogueRun(pool,prefix){
if(!prefix||!prefix.startsWith('source-catalogue-'))throw Error('Provide an evidenced catalogue run prefix');
 const active=await pool.query('SELECT run_id FROM matchpilot_test_runs WHERE run_id=$1 AND completed_at IS NULL',[prefix]);
 if(active.rowCount)throw Error('Wait for browser run completion');
 await ensureCatalogueSchema(pool);
 const rows=await pool.query("SELECT snapshot_id,data FROM matchpilot_source_snapshots WHERE left(snapshot_id,length($1))=$1 ORDER BY captured_at",[prefix]);
 const catalog=rows.rows.filter(r=>r.snapshot_id.endsWith('-league-catalog')).at(-1);
 if(!catalog)throw Error('Real league snapshot missing');
 await seedCatalogue(pool,extractLeagues(catalog.data),catalog.snapshot_id);
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
