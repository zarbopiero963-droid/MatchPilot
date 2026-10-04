import { withClient } from '../db.mjs';
import { fetchDataset } from '../providers/futpython/client.mjs';
import { storeDataset } from '../providers/futpython/store.mjs';

async function saveCheck(client, code, status, details={}) {
  await client.query(
    `INSERT INTO fpt_certification_checks(phase,check_code,status,details)
     VALUES('FPT_PHASE1',$1,$2,$3::jsonb)`,
    [code,status,JSON.stringify(details)]
  );
}

export async function runPhase1Verification() {
  return withClient(async client => {
    const results=[];

    const samples=await client.query(
      `SELECT c.dataset_key,c.country_slug,c.league_slug,c.season,c.route
       FROM fpt_catalog c
       JOIN fpt_dataset_state s USING(dataset_key)
       WHERE c.active=true AND s.availability='available'
       ORDER BY c.season ASC,c.dataset_key ASC
       LIMIT 3`
    );

    for (const entry of samples.rows) {
      const before=await client.query(
        `SELECT
           (SELECT count(*)::int FROM fpt_raw_snapshots WHERE dataset_key=$1) AS snapshots,
           (SELECT count(*)::int FROM fpt_match_versions WHERE dataset_key=$1) AS versions`,
        [entry.dataset_key]
      );
      try {
        const data=await fetchDataset({
          datasetKey:entry.dataset_key,
          countrySlug:entry.country_slug,
          leagueSlug:entry.league_slug,
          season:entry.season,
          route:entry.route
        });
        const stored=await storeDataset(client,{
          datasetKey:entry.dataset_key,sourceKind:'dataset',
          providerPath:data.providerPath,countrySlug:entry.country_slug,
          leagueSlug:entry.league_slug,season:entry.season,...data
        });
        const after=await client.query(
          `SELECT
             (SELECT count(*)::int FROM fpt_raw_snapshots WHERE dataset_key=$1) AS snapshots,
             (SELECT count(*)::int FROM fpt_match_versions WHERE dataset_key=$1) AS versions`,
          [entry.dataset_key]
        );
        const pass=!stored.changed &&
          before.rows[0].snapshots===after.rows[0].snapshots &&
          before.rows[0].versions===after.rows[0].versions;
        const details={
          dataset_key:entry.dataset_key,
          rows:data.rows.length,
          changed:stored.changed,
          before:before.rows[0],
          after:after.rows[0]
        };
        await saveCheck(client,'DEDUP_'+entry.dataset_key,pass?'pass':'fail',details);
        results.push({code:'DEDUP_'+entry.dataset_key,status:pass?'pass':'fail',details});
      } catch (e) {
        const details={dataset_key:entry.dataset_key,error:String(e?.message||e).replace(/api_key=[^&\s]+/gi,'api_key=[REDACTED]')};
        await saveCheck(client,'DEDUP_'+entry.dataset_key,'fail',details);
        results.push({code:'DEDUP_'+entry.dataset_key,status:'fail',details});
      }
    }

    const unavailable=await client.query(
      `SELECT c.dataset_key,c.country_slug,c.league_slug,c.season,c.route
       FROM fpt_catalog c JOIN fpt_dataset_state s USING(dataset_key)
       WHERE c.active=true AND s.availability='unavailable_404'
       ORDER BY c.dataset_key LIMIT 1`
    );
    if (unavailable.rowCount) {
      const entry=unavailable.rows[0];
      let status='fail', observed=null;
      try {
        await fetchDataset({
          datasetKey:entry.dataset_key,countrySlug:entry.country_slug,
          leagueSlug:entry.league_slug,season:entry.season,route:entry.route
        });
        observed='success';
      } catch(e) {
        observed=e?.status||String(e?.message||e);
        status=e?.status===404?'pass':'fail';
      }
      const details={dataset_key:entry.dataset_key,observed};
      await saveCheck(client,'UNAVAILABLE_404_SAMPLE',status,details);
      results.push({code:'UNAVAILABLE_404_SAMPLE',status,details});
    } else {
      await saveCheck(client,'UNAVAILABLE_404_SAMPLE','blocked',{reason:'no_unavailable_404_dataset'});
      results.push({code:'UNAVAILABLE_404_SAMPLE',status:'blocked'});
    }

    const available=await client.query(
      `SELECT c.dataset_key,s.last_row_count
       FROM fpt_catalog c JOIN fpt_dataset_state s USING(dataset_key)
       WHERE c.active=true AND s.availability='available' AND s.last_row_count>0
       ORDER BY s.last_row_count DESC LIMIT 1`
    );
    const availablePass=available.rowCount>0 && Number(available.rows[0].last_row_count)>0;
    const availableDetails=available.rows[0]||{};
    await saveCheck(client,'AVAILABLE_DATASET_SAMPLE',availablePass?'pass':'fail',availableDetails);
    results.push({code:'AVAILABLE_DATASET_SAMPLE',status:availablePass?'pass':'fail',details:availableDetails});

    const multi=await client.query(
      `SELECT c.country_slug,c.league_slug,count(DISTINCT c.season)::int AS seasons,
              count(*) FILTER (WHERE s.availability='available')::int AS available_seasons
       FROM fpt_catalog c JOIN fpt_dataset_state s USING(dataset_key)
       WHERE c.active=true
       GROUP BY c.country_slug,c.league_slug
       HAVING count(DISTINCT c.season)>=2
       ORDER BY available_seasons DESC,seasons DESC
       LIMIT 1`
    );
    const multiPass=multi.rowCount>0 && Number(multi.rows[0].seasons)>=2;
    const multiDetails=multi.rows[0]||{};
    await saveCheck(client,'MULTI_SEASON_SAMPLE',multiPass?'pass':'fail',multiDetails);
    results.push({code:'MULTI_SEASON_SAMPLE',status:multiPass?'pass':'fail',details:multiDetails});

    const failed=results.filter(r=>r.status!=='pass');
    const summary={status:failed.length?'fail':'pass',checks:results.length,failed:failed.length,results};
    console.log('FUTPYTHON_PHASE1_VERIFY '+JSON.stringify({
      status:summary.status,checks:summary.checks,failed:summary.failed
    }));
    return summary;
  });
}

if (import.meta.url===`file://${process.argv[1]}`) {
  runPhase1Verification()
    .then(r=>{if(r.status!=='pass') process.exitCode=1;})
    .catch(e=>{
      console.error('FUTPYTHON_PHASE1_VERIFY_FATAL',String(e?.message||e).replace(/api_key=[^&\s]+/gi,'api_key=[REDACTED]'));
      process.exitCode=1;
    });
}
