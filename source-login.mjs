import { chromium } from 'playwright';
const redact=text=>{
 let s=String(text||'');
 for(const key of ['GOAT_USERNAME','GOAT_PASSWORD','APP_PASSWORD','OPENROUTER_API_KEY'])if(process.env[key])s=s.split(process.env[key]).join('[REDACTED]');
 return s.replace(/[^\s]+@[^\s]+/g,'[EMAIL]').split(/(\s+)/).map(w=>w.startsWith('http')?'[URL]':w).join('');
};
async function capture(page,pool,id,section){
 const data=await page.evaluate(()=>{
  const visible=e=>!!(e.offsetWidth||e.offsetHeight||e.getClientRects().length);
  return {text:document.body.innerText,controls:[...document.querySelectorAll('a,button,[role="button"],[role="tab"]')].filter(visible).map(e=>({tag:e.tagName,label:(e.innerText||e.getAttribute('aria-label')||'').trim(),id:e.id})),inputs:[...document.querySelectorAll('input,select,textarea')].filter(visible).map(e=>({tag:e.tagName,type:e.type,id:e.id,min:e.getAttribute('min'),max:e.getAttribute('max'),step:e.getAttribute('step'),placeholder:e.getAttribute('placeholder'),options:e.tagName==='SELECT'?[...e.options].map(o=>o.textContent):undefined}))};
 });
 data.text=redact(data.text);data.controls=data.controls.map(o=>({...o,label:redact(o.label)}));
 await pool.query('INSERT INTO matchpilot_source_snapshots(snapshot_id,data) VALUES($1,$2) ON CONFLICT DO NOTHING',[id,JSON.stringify(data)]);
 console.log('SOURCE_MAP_BATCH '+JSON.stringify({section,characters:data.text.length,controls:data.controls,inputs:data.inputs,text:data.text.slice(0,6000)}));
 return data;
}
export async function testSourceLogin(pool){
 const runId='source-mapping-2026-10-02-small-batches-v1';
 if(!pool)return;
 await pool.query('CREATE TABLE IF NOT EXISTS matchpilot_test_runs(run_id text PRIMARY KEY,started_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz,result jsonb NOT NULL)');
 await pool.query('CREATE TABLE IF NOT EXISTS matchpilot_source_snapshots(snapshot_id text PRIMARY KEY,captured_at timestamptz NOT NULL DEFAULT now(),data jsonb NOT NULL)');
 const claimed=await pool.query('INSERT INTO matchpilot_test_runs(run_id,result) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING run_id',[runId,JSON.stringify({status:'running'})]);
 if(!claimed.rowCount){console.log('SOURCE_MAP_BATCH_DONE already_recorded');return;}
 let stage='start',browser;const completed=[];let outcome='complete';
 try{
  const groups=[['Asian Odds','Monitorate','Ladder Dutching'],['Statistiche Lega','Archivio'],['Live','Analisi']];
  for(const group of groups){
   stage='login';
   browser=await chromium.launch({headless:true});
   const page=await browser.newPage();
   page.setDefaultTimeout(15000);
   await page.goto('https://layscore.goatbettingexchange.com/',{waitUntil:'domcontentloaded',timeout:30000});
   await page.locator('#loginEmail').fill(process.env.GOAT_USERNAME);
   await page.locator('#loginPassword').fill(process.env.GOAT_PASSWORD);
   await page.locator('#loginSubmitBtn').click();
   await page.locator('#loginEmail').waitFor({state:'hidden',timeout:25000});
   for(const section of group){
    stage=section;
    await page.getByRole('button',{name:section,exact:true}).click();
    await page.waitForTimeout(3500);
    await capture(page,pool,runId+'-'+section,section);
    completed.push(section);
    if(section==='Live'){
     await page.getByRole('button',{name:'⚙️ Filtri avanzati',exact:true}).click();
     await page.waitForTimeout(500);
     await capture(page,pool,runId+'-live-filters','Live: filtri avanzati');
    }
    const legends=page.getByRole('button',{name:/legend|legenda/i});
    const total=await legends.count();
    for(let index=0;index<total&&index<8;index++){
     if(!await legends.nth(index).isVisible())continue;
     await legends.nth(index).click();
     await page.waitForTimeout(300);
     const data=await capture(page,pool,runId+'-'+section+'-legend-'+index,section+': Legend '+index);
     const close=data.controls.find(o=>/^(✕|×|Chiudi|Close)$/.test(o.label));
     if(close){await page.getByText(close.label,{exact:true}).filter({visible:true}).first().click();}
     else{await page.keyboard.press('Escape');}
    }
   }
   await browser.close();browser=null;
  }
 }catch{outcome='partial';}finally{
  if(browser)await browser.close().catch(()=>{});
  const result={status:outcome,stage,completed};
  await pool.query('UPDATE matchpilot_test_runs SET completed_at=now(),result=$2 WHERE run_id=$1',[runId,JSON.stringify(result)]);
  console.log('SOURCE_MAP_BATCH_DONE '+JSON.stringify(result));
 }
}
