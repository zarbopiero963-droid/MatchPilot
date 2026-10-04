export async function runTotalCornerProbe(){
  const token=process.env.TOTALCORNER_API_TOKEN?.trim();
  if(!token){console.log('TOTALCORNER_PROBE missing_token');return;}
  const url=new URL('https://api.totalcorner.com/v1/match/today');
  url.searchParams.set('token',token);
  url.searchParams.set('type','inplay');
  url.searchParams.set('columns','events,odds,asian,cornerLine,goalLine,asianCorner,attacks,dangerousAttacks,shotOn,shotOff,possession');
  try{
    const r=await fetch(url,{signal:AbortSignal.timeout(15000)});
    const rate={limit:r.headers.get('x-rate-limit-limit'),remaining:r.headers.get('x-rate-limit-remaining'),reset:r.headers.get('x-rate-limit-reset')};
    if(!r.ok){console.log('TOTALCORNER_PROBE '+JSON.stringify({ok:false,status:r.status,rate}));return;}
    const j=await r.json();
    const rows=Array.isArray(j?.data)?j.data:[];
    const slim=rows.slice(0,20).map(x=>({
      id:x.id??x.match_id??null,
      home:x.h??x.home??null,
      away:x.a??x.away??null,
      minute:x.time??x.minute??x.t??null,
      score:[x.hg??x.homeGoal??x.home_score??null,x.ag??x.awayGoal??x.away_score??null],
      attacks:x.attacks??null,
      dangerousAttacks:x.dangerousAttacks??null,
      shotOn:x.shotOn??null,
      shotOff:x.shotOff??null,
      possession:x.possession??null,
      corner:x.corner??x.corners??null,
      yellow:x.yellow??x.yellowCard??null,
      red:x.red??x.redCard??null,
      odds:x.odds??null,
      asian:x.asian??null,
      goalLine:x.goalLine??null,
      cornerLine:x.cornerLine??null
    }));
    console.log('TOTALCORNER_PROBE '+JSON.stringify({ok:true,count:rows.length,rate,rows:slim}));
    const target=rows.find(x=>String(x.h||x.home||'').toLowerCase().includes('real sociedad b')&&String(x.a||x.away||'').toLowerCase().includes('granada'));
    if(target){
      const shape=Object.fromEntries(Object.entries(target).map(([k,v])=>[k,Array.isArray(v)?{type:'array',len:v.length,sample:v.slice(0,4)}:(v&&typeof v==='object'?{type:'object',keys:Object.keys(v).slice(0,30),sample:v}:v)]));
      console.log('TOTALCORNER_TARGET '+JSON.stringify({id:target.id??target.match_id,shape}));
    }
  }catch(e){console.log('TOTALCORNER_PROBE '+JSON.stringify({ok:false,error:e?.name||'error'}));}
}
