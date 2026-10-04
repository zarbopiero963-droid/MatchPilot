import { chromium } from 'playwright';
import { createHash } from 'node:crypto';

const hash=v=>createHash('sha256').update(String(v??'')).digest('hex');
const csvLine=s=>{
  const out=[]; let cur='',q=false;
  for(let i=0;i<s.length;i++){const c=s[i]; if(c==='"'){if(q&&s[i+1]==='"'){cur+='"';i++;}else q=!q;} else if(c===','&&!q){out.push(cur);cur='';} else cur+=c;}
  out.push(cur); return out;
};
const norm=s=>String(s??'').normalize('NFKD').replace(/\p{Diacritic}/gu,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const keyFor=r=>[r.Date,r.Home,r.Away].map(norm).join('|');

async function fetchCsv(path,key){
  const url='https://futpythontrader.com.br/api/download/'+path+'?api_key='+encodeURIComponent(key);
  const r=await fetch(url,{signal:AbortSignal.timeout(30000)});
  if(!r.ok) throw new Error('FutPython HTTP '+r.status+' for '+path);
  const text=await r.text(), lines=text.split(/\r?\n/).filter(Boolean), hdr=csvLine(lines.shift());
  return lines.map(line=>Object.fromEntries(hdr.map((h,i)=>[h,csvLine(line)[i]??''])));
}

export async function runFutpythonForensics(pool){
  if(!pool||!process.env.FUTPYTHON_API_KEY||!process.env.GOAT_USERNAME||!process.env.GOAT_PASSWORD)return;
  const runId='forensics-futpython-goat-v2';
  await pool.query('CREATE TABLE IF NOT EXISTS matchpilot_test_runs(run_id text PRIMARY KEY,started_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz,result jsonb NOT NULL)');
  const prior=await pool.query('SELECT completed_at,result FROM matchpilot_test_runs WHERE run_id=$1',[runId]);
  if(prior.rows[0]?.completed_at){console.log('FUTPYTHON_FORENSICS already_recorded');return;}
  await pool.query('INSERT INTO matchpilot_test_runs(run_id,result) VALUES($1,$2) ON CONFLICT DO NOTHING',[runId,JSON.stringify({status:'running'})]);

  let browser;
  try{
    browser=await chromium.launch({headless:true});
    const ctx=await browser.newContext({viewport:{width:1440,height:1000}});
    const portal=await ctx.newPage();
    await portal.goto('https://goatbettingexchange.com/portale',{waitUntil:'domcontentloaded',timeout:30000});
    await portal.locator('#heroEmail').fill(process.env.GOAT_USERNAME);
    await portal.locator('#heroPass').fill(process.env.GOAT_PASSWORD);
    await portal.getByRole('button',{name:'Accedi',exact:true}).click();
    await portal.locator('#heroEmail').waitFor({state:'hidden',timeout:60000});
    const pp=portal.waitForEvent('popup',{timeout:15000});
    await portal.getByRole('button',{name:'Apri →',exact:true}).nth(1).click();
    const page=await pp; await page.waitForLoadState('domcontentloaded',{timeout:30000});
    await page.waitForTimeout(3000);
    if(await page.locator('#loginEmail').isVisible()){
      await page.locator('#loginEmail').fill(process.env.GOAT_USERNAME);
      await page.locator('#loginPassword').fill(process.env.GOAT_PASSWORD);
      await page.locator('#loginSubmitBtn').click();
      await page.locator('#loginEmail').waitFor({state:'hidden',timeout:60000});
    }
    await page.getByRole('button',{name:'Backtest Storico',exact:true}).click();
    await page.waitForFunction(()=>typeof window.PANDORA_EMBEDDED_DB==='string'&&window.PANDORA_EMBEDDED_DB.length>1000,{},{timeout:60000});
    const goat=await page.evaluate(()=>{
      const text=window.PANDORA_EMBEDDED_DB, lines=text.split('\n').filter(Boolean), header=lines[0].split(';');
      const rows=lines.slice(1).map(line=>{const c=line.split(';'),o={};header.forEach((h,i)=>o[h]=c[i]??'');return o;});
      const italy=rows.filter(r=>/ital/i.test(String(r.Country||''))||/serie\s*a/i.test(String(r.League||r.Div||''))).slice(0,500);
      const sample=italy.length?italy:rows.slice(0,500);
      return {bytes:text.length,header,sample,filteredItaly:italy.length,firstDate:sample[0]?.Date||null,lastSampleDate:sample.at(-1)?.Date||null};
    });
    await browser.close(); browser=null;

    const seasons=['2021-2022','2022-2023','2023-2024','2024-2025','2025-2026','2026-2027'];
    const datasets=[];
    for(const season of seasons){
      try{datasets.push(...await fetchCsv('italy/serie-a/'+season,process.env.FUTPYTHON_API_KEY));}
      catch(e){console.log('FUTPYTHON_FORENSICS dataset_skip '+season+' '+String(e.message).replace(process.env.FUTPYTHON_API_KEY,'[REDACTED]'));}
    }
    const byKey=new Map(datasets.map(r=>[keyFor(r),r]));
    const relevant=['Date','Home','Away','Home_Score','Away_Score','Min_Goals_Home','Min_Goals_Away','Odd_1_FT','Odd_X_FT','Odd_2_FT'];
    const exact=[];
    for(const g of goat.sample){
      const f=byKey.get(keyFor(g)); if(!f)continue;
      exact.push({key:keyFor(g),fieldMatches:Object.fromEntries(relevant.map(k=>[k,String(g[k]??'')===String(f[k]??'')])),goat:Object.fromEntries(relevant.map(k=>[k,g[k]??''])),fut:Object.fromEntries(relevant.map(k=>[k,f[k]??'']))});
    }
    const result={
      status:'complete',
      keyPresent:true,
      goat:{bytes:goat.bytes,header:goat.header,sampleCount:goat.sample.length,sampleHash:hash(JSON.stringify(goat.sample)),firstDate:goat.firstDate,lastSampleDate:goat.lastSampleDate},
      futpython:{datasetRows:datasets.length,seasons},
      directMatches:exact.length,
      exactRows:exact.slice(0,20)
    };
    await pool.query('UPDATE matchpilot_test_runs SET completed_at=now(),result=$2 WHERE run_id=$1',[runId,JSON.stringify(result)]);
    console.log('FUTPYTHON_FORENSICS '+JSON.stringify({status:result.status,keyPresent:true,goatBytes:goat.bytes,header:goat.header,filteredItaly:goat.filteredItaly,futRows:datasets.length,directMatches:exact.length,firstMatches:exact.slice(0,3).map(x=>({key:x.key,fieldMatches:x.fieldMatches}))}));
  }catch(e){
    if(browser)await browser.close().catch(()=>{});
    const result={status:'failed',keyPresent:Boolean(process.env.FUTPYTHON_API_KEY),errorType:e.name,message:String(e.message).replace(process.env.FUTPYTHON_API_KEY||'','[REDACTED]').slice(0,500)};
    await pool.query('UPDATE matchpilot_test_runs SET completed_at=now(),result=$2 WHERE run_id=$1',[runId,JSON.stringify(result)]);
    console.log('FUTPYTHON_FORENSICS failed '+JSON.stringify({errorType:e.name}));
  }
}
