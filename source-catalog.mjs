import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
export const key=s=>String(s).normalize('NFC').trim().replace(/\s+/g,' ').toLowerCase();
export function extractLeagues(data){
 const rows=data.tables.flatMap(t=>t.rows).filter(r=>r.cells[0]?.html?.includes('lst-lg-name'));
 const leagues=rows.map(r=>{const [name,country]=r.cells[0].text.trim().split(/\n+/);if(!name||!country)throw Error('Missing league territory');return {id:key(name),name:name.trim(),country:country.trim(),kind:country.trim()==='EUROPE'?'region':'country'};});
 if(leagues.length!==49||new Set(leagues.map(l=>l.id)).size!==49)throw Error('Contract requires exactly49 distinct leagues');
 return leagues.sort((a,b)=>a.id.localeCompare(b.id));
}
export function catalogueDigest(leagues){return createHash('sha256').update(JSON.stringify([...leagues].sort((a,b)=>a.id.localeCompare(b.id)))).digest('hex');}
export function extractTeams(table){
 const header=table.rows.find(r=>r.cells.some(c=>/^SQUADRA$/i.test(c.text.trim())));
 if(!header)throw Error('Standings team header absent');
 const index=header.cells.findIndex(c=>/^SQUADRA$/i.test(c.text.trim()));
 const teams=table.rows.filter(r=>r!==header&&/^\d+$/.test(r.cells[0]?.text.trim()||'')).map(r=>r.cells[index]?.text.trim());
 if(!teams.length||teams.some(t=>!t)||new Set(teams.map(key)).size!==teams.length)throw Error('Empty or ambiguous roster');
 return teams;
}
export async function seedCatalogue(pool,observed,snapshotId){
 const approved=JSON.parse(await readFile(new URL('./data/approved-leagues.json',import.meta.url),'utf8'));
 const digest=catalogueDigest(approved.leagues);
 if(catalogueDigest(observed)!==digest){await quarantine(pool,snapshotId,'source_catalogue_changed',{observed});throw Error('League contract changed; owner authorization required');}
 const db=await pool.connect();
 try{await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(491031)');
 const prior=await db.query('SELECT digest FROM mp_catalog_contract WHERE id=1');
 if(prior.rows.length&&prior.rows[0].digest!==digest)throw Error('Frozen database contract differs');
 await db.query('INSERT INTO mp_catalog_contract(id,version,expected_count,digest,owner_authorization,evidence_snapshot) VALUES(1,$1,49,$2,$3,$4) ON CONFLICT DO NOTHING',[approved.contractVersion,digest,approved.ownerAuthorization,snapshotId]);
 for(const l of approved.leagues){await db.query('INSERT INTO mp_territories(id,name,kind) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[key(l.country),l.country,l.kind]);await db.query('INSERT INTO mp_leagues(id,name,territory_id,contract_id,source_snapshot) VALUES($1,$2,$3,1,$4) ON CONFLICT DO NOTHING',[l.id,l.name,key(l.country),snapshotId]);}
 const current=await db.query('SELECT l.id,l.name,t.name AS country,t.kind FROM mp_leagues l JOIN mp_territories t ON t.id=l.territory_id');
 if(catalogueDigest(current.rows)!==digest)throw Error('Database catalogue differs from owner contract');
 await db.query('COMMIT');return approved.leagues;
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
export async function quarantine(pool,snapshotId,reason,data){await pool.query('INSERT INTO mp_catalog_quarantine(snapshot_id,reason,data) VALUES($1,$2,$3)',[snapshotId,reason,JSON.stringify(data)]);}
export async function persistRoster(pool,{leagueId,groupName='overall',season='unknown',snapshotId,matchId,teams,allGroups=false}){
 if(!teams.length||teams.some(t=>!String(t).trim())||new Set(teams.map(key)).size!==teams.length)throw Error('Invalid roster');
 const db=await pool.connect();try{await db.query('BEGIN');
 const permitted=await db.query('SELECT id FROM mp_leagues WHERE id=$1',[leagueId]);if(!permitted.rowCount)throw Error('League outside owner contract');
 for(const name of teams){const id=createHash('sha256').update(leagueId+'\0'+key(name)).digest('hex');
 await db.query('INSERT INTO mp_teams(id,source_name,league_id) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET last_seen=now()',[id,name.trim(),leagueId]);
 await db.query('INSERT INTO mp_team_memberships(team_id,league_id,season,group_name,source_snapshot) VALUES($1,$2,$3,$4,$5) ON CONFLICT(team_id,league_id,season,group_name) DO UPDATE SET last_seen=now(),source_snapshot=EXCLUDED.source_snapshot',[id,leagueId,season,groupName,snapshotId]);}
 await db.query('INSERT INTO mp_roster_observations(snapshot_id,league_id,group_name,season,team_count,coverage,source_match_id) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING',[snapshotId,leagueId,groupName,season,teams.length,allGroups?'observed_all_exposed_groups':'observed_group',matchId]);
 await db.query('COMMIT');return teams.length;
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}

export async function ensureCatalogueSchema(pool){await pool.query(await readFile(new URL('./migrations/001-catalog.sql',import.meta.url),'utf8'));}
