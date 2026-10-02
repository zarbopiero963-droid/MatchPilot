import { parseSnapshot, compareCatalog } from './source-parser.mjs';
import { chromium } from 'playwright';
const redact=text=>{
 let s=String(text||'');
 for(const key of ['GOAT_USERNAME','GOAT_PASSWORD','APP_PASSWORD','OPENROUTER_API_KEY'])if(process.env[key])s=s.split(process.env[key]).join('[REDACTED]');
 return s.replace(/[^\s]+@[^\s]+/g,'[EMAIL]').split(/(\s+)/).map(w=>w.startsWith('http')?'[URL]':w).join('');
};
async function capture(page,pool,id,section){
 const data=await page.evaluate(()=>{
  const visible=e=>!!(e.offsetWidth||e.offsetHeight||e.getClientRects().length);
  return {text:document.body.innerText,controls:[...document.querySelectorAll('a,button,[role="button"],[role="tab"]')].filter(visible).map(e=>({tag:e.tagName,label:(e.innerText||e.getAttribute('aria-label')||'').trim(),id:e.id,name:e.getAttribute('name'),context:e.closest('tr')?.querySelector('td')?.innerText||''})),inputs:[...document.querySelectorAll('input,select,textarea')].filter(visible).map(e=>({tag:e.tagName,type:e.type,id:e.id,name:e.getAttribute('name'),context:e.closest('tr')?.querySelector('td')?.innerText||e.labels?.[0]?.innerText||'',min:e.getAttribute('min'),max:e.getAttribute('max'),step:e.getAttribute('step'),placeholder:e.getAttribute('placeholder'),options:e.tagName==='SELECT'?[...e.options].map(o=>o.textContent):undefined}))};
 });
 data.text=redact(data.text);data.controls=data.controls.map(o=>({...o,context:redact(o.context),label:redact(o.label)}));
 data.inputs=data.inputs.map(o=>({...o,context:redact(o.context),placeholder:redact(o.placeholder),options:o.options?.map(redact)}));
 const parsed=parseSnapshot(data,{section});
 const previous=await pool.query("SELECT data FROM matchpilot_source_snapshots WHERE data->>'section'=$1 AND snapshot_id<>$2 ORDER BY captured_at DESC LIMIT 1",[section,id]);
 const changes=compareCatalog(previous.rows[0]?.data,parsed);
 Object.assign(data,parsed,{changes});
 if(!parsed.usable)throw new Error('Snapshot validation failed');
 await pool.query('INSERT INTO matchpilot_source_snapshots(snapshot_id,data) VALUES($1,$2) ON CONFLICT DO NOTHING',[id,JSON.stringify(data)]);
 console.log('SOURCE_MAP_BATCH '+JSON.stringify({section,characters:data.text.length,controls:data.controls.length,inputs:data.inputs.length,added:changes.added.length,removed:changes.removed.length}));
 return data;
}
export async function testSourceLogin(pool){
 const runId='source-mapping-2026-10-02-panels-v8';
 if(!pool)return;
 await pool.query('CREATE TABLE IF NOT EXISTS matchpilot_test_runs(run_id text PRIMARY KEY,started_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz,result jsonb NOT NULL)');
 await pool.query('CREATE TABLE IF NOT EXISTS matchpilot_source_snapshots(snapshot_id text PRIMARY KEY,captured_at timestamptz NOT NULL DEFAULT now(),data jsonb NOT NULL)');
 const owner=String(Date.now())+'-'+Math.random().toString(36).slice(2);
 const existing=await pool.query('SELECT result,completed_at FROM matchpilot_test_runs WHERE run_id=$1',[runId]);
 if(existing.rows[0]?.completed_at){console.log('SOURCE_MAP_BATCH_DONE already_recorded');return;}
 const claimed=await pool.query("INSERT INTO matchpilot_test_runs(run_id,result) VALUES($1,$2) ON CONFLICT (run_id) DO UPDATE SET result=matchpilot_test_runs.result || EXCLUDED.result WHERE COALESCE((matchpilot_test_runs.result->>'leaseUntil')::bigint,0)<$3 RETURNING run_id",[runId,JSON.stringify({status:'running',owner,leaseUntil:Date.now()+60000}),Date.now()]);
 if(!claimed.rowCount){console.log('SOURCE_MAP_BATCH waiting_for_lease');const timer=setTimeout(()=>testSourceLogin(pool).catch(()=>console.log('SOURCE_MAP_RETRY failed')),65000);timer.unref();return;}
 let stage='start',browser,page;const completed=existing.rows[0]?.result?.completed||[],failed=[];let outcome='complete';
 const heartbeat=setInterval(()=>pool.query("UPDATE matchpilot_test_runs SET result=result || $2::jsonb WHERE run_id=$1 AND result->>'owner'=$3",[runId,JSON.stringify({leaseUntil:Date.now()+60000}),owner]).catch(()=>{}),15000);heartbeat.unref();
 try{
  const groups=[['ROI Strategie','Dettaglio Partita','Money Management']];
  for(const group of groups){
   stage='login';
   browser=await chromium.launch({headless:true});

   const context=await browser.newContext();
   await context.route('**/*',route=>['image','media','font'].includes(route.request().resourceType())?route.abort():route.continue());
   const portal=await context.newPage();
   portal.setDefaultTimeout(15000);
   stage='portal_navigation';
   await portal.goto('https://goatbettingexchange.com/portale',{waitUntil:'domcontentloaded',timeout:30000});
   stage='portal_login';
   await portal.locator('#heroEmail').fill(process.env.GOAT_USERNAME);
   await portal.locator('#heroPass').fill(process.env.GOAT_PASSWORD);
   await portal.getByRole('button',{name:'Accedi',exact:true}).click();
   await portal.locator('#heroEmail').waitFor({state:'hidden',timeout:25000});
   stage='module_open';
   const popupPromise=portal.waitForEvent('popup',{timeout:15000});
   await portal.getByRole('button',{name:'Apri →',exact:true}).nth(1).click();
   page=await popupPromise;
   await page.waitForURL(url=>url.protocol==='https:',{timeout:20000});
   await page.waitForLoadState('domcontentloaded',{timeout:20000});
   await portal.close();
   page.setDefaultTimeout(15000);
   stage='module_login';
   await page.locator('#loginEmail').fill(process.env.GOAT_USERNAME);
   await page.locator('#loginPassword').fill(process.env.GOAT_PASSWORD);
   await page.locator('#loginSubmitBtn').click();
   await page.locator('#loginEmail').waitFor({state:'hidden',timeout:25000});
   for(const section of group){
    if(completed.includes(section))continue;
    stage=section;
    try {
    if(section==='Money Management') {
     const portal=await context.newPage();
     await portal.goto('https://goatbettingexchange.com/portale',{waitUntil:'domcontentloaded',timeout:30000});
     if(await portal.locator('#heroEmail').isVisible()) {
       await portal.locator('#heroEmail').fill(process.env.GOAT_USERNAME);
       await portal.locator('#heroPass').fill(process.env.GOAT_PASSWORD);
       await portal.getByRole('button',{name:'Accedi',exact:true}).click();
       await portal.locator('#heroEmail').waitFor({state:'hidden',timeout:25000});
     }
     const pending=portal.waitForEvent('popup',{timeout:20000});
     await portal.getByRole('button',{name:'Apri →',exact:true}).nth(0).click();
     page=await pending;
     await page.waitForURL(url=>url.protocol==='https:',{timeout:30000});
     await page.waitForLoadState('domcontentloaded');
     await portal.close();
     await page.locator('body').waitFor({state:'visible'});
    } else {
     await page.getByRole('button',{name:'Dashboard',exact:true}).click({force:true});
     const target=page.getByRole('button',{name:section==='ROI Strategie'?'📊 ROI STR':'DETTAGLIO',exact:true}).first();
     await target.waitFor({state:'visible',timeout:60000});
     await target.click({force:true});
    }
    await page.waitForTimeout(3500);
    await capture(page,pool,runId+'-'+section,section);
    completed.push(section);
    await pool.query('UPDATE matchpilot_test_runs SET result=$2 WHERE run_id=$1',[runId,JSON.stringify({status:'running',stage,completed,failed,owner,leaseUntil:Date.now()+60000})]);
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
    } catch(error) {
      outcome='partial'; failed.push({section,errorType:error.name});
      console.log('SOURCE_MAP_SECTION_ERROR '+JSON.stringify({section,errorType:error.name}));
      await capture(page,pool,runId+'-'+section+'-error',section+': diagnostic').catch(()=>{});
      await page.keyboard.press('Escape').catch(()=>{});
      await pool.query('UPDATE matchpilot_test_runs SET result=$2 WHERE run_id=$1',[runId,JSON.stringify({status:'running',stage,completed,failed})]);
    }
   }
   await browser.close();browser=null;
  }
 }catch(error){outcome='partial';console.log('SOURCE_MAP_ERROR '+JSON.stringify({stage,errorType:error.name,detail:redact(error.message).slice(0,1800)}));if(page&&!page.isClosed())await capture(page,pool,runId+'-error','Error diagnostic').catch(()=>{});}finally{
  clearInterval(heartbeat);
  if(browser)await browser.close().catch(()=>{});
  const result={status:outcome,stage,completed,failed};
  await pool.query('UPDATE matchpilot_test_runs SET completed_at=now(),result=$2 WHERE run_id=$1',[runId,JSON.stringify(result)]);
  console.log('SOURCE_MAP_BATCH_DONE '+JSON.stringify(result));
 }
}
