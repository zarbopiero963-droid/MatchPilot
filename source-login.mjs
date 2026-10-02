import { parseSnapshot, compareCatalog, parseRoiStrategies } from './source-parser.mjs';
import { chromium } from 'playwright';
const redact=text=>{
 let s=String(text||'');
 for(const key of ['GOAT_USERNAME','GOAT_PASSWORD','APP_PASSWORD','OPENROUTER_API_KEY'])if(process.env[key])s=s.split(process.env[key]).join('[REDACTED]');
 return s.replace(/[^\s]+@[^\s]+/g,'[EMAIL]').split(/(\s+)/).map(w=>w.startsWith('http')?'[URL]':w).join('');
};
function bounded(promise,ms=15000) {
 let timer;
 return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Operation deadline exceeded')),ms);})]).finally(()=>clearTimeout(timer));
}

async function capture(page,pool,id,section){
 const data=await bounded(page.evaluate(()=>{
  const visible=e=>!!(e.offsetWidth||e.offsetHeight||e.getClientRects().length);
  return {detailButtonDiagnostics:[...document.querySelectorAll('button')].filter(e=>['STATS','STATS +','CONSIGLIO'].includes(e.innerText.trim())).map(e=>({label:e.innerText,disabled:e.disabled,onclick:e.getAttribute('onclick'),className:e.className})),activeTabs:[...document.querySelectorAll('button[aria-selected="true"],[role="tab"][aria-selected="true"],button.active')].map(e=>e.innerText),text:document.body.innerText,controls:[...document.querySelectorAll('a,button,[role="button"],[role="tab"]')].filter(visible).map(e=>({tag:e.tagName,label:(e.innerText||e.getAttribute('aria-label')||'').trim(),id:e.id,name:e.getAttribute('name'),context:e.closest('tr')?.querySelector('td')?.innerText||''})),inputs:[...document.querySelectorAll('input,select,textarea')].filter(visible).map(e=>({tag:e.tagName,type:e.type,id:e.id,name:e.getAttribute('name'),context:e.closest('tr')?.querySelector('td')?.innerText||e.labels?.[0]?.innerText||'',min:e.getAttribute('min'),max:e.getAttribute('max'),step:e.getAttribute('step'),placeholder:e.getAttribute('placeholder'),options:e.tagName==='SELECT'?[...e.options].map(o=>o.textContent):undefined}))};
 }),15000);
 data.text=redact(data.text);data.controls=data.controls.map(o=>({...o,context:redact(o.context),label:redact(o.label)}));
 data.inputs=data.inputs.map(o=>({...o,context:redact(o.context),placeholder:redact(o.placeholder),options:o.options?.map(redact)}));
 const parsed=parseSnapshot(data,{section});
 const previous=await pool.query("SELECT data FROM matchpilot_source_snapshots WHERE data->>'section'=$1 AND snapshot_id<>$2 ORDER BY captured_at DESC LIMIT 1",[section,id]);
 const changes=compareCatalog(previous.rows[0]?.data,parsed);
 Object.assign(data,parsed,{changes});
 if(section==='ROI Strategie')data.semantic=parseRoiStrategies(data.text);
 if(!parsed.usable)throw new Error('Snapshot validation failed');
 await pool.query('INSERT INTO matchpilot_source_snapshots(snapshot_id,data) VALUES($1,$2) ON CONFLICT DO NOTHING',[id,JSON.stringify(data)]);
 console.log('SOURCE_MAP_BATCH '+JSON.stringify({section,characters:data.text.length,controls:data.controls.length,inputs:data.inputs.length,added:changes.added.length,removed:changes.removed.length}));
 return data;
}

async function captureScrolled(page,pool,id,section) {
 await capture(page,pool,id+'-initial',section);
 const targets=await bounded(page.evaluate(()=>{
  const candidates=[document.scrollingElement,...document.querySelectorAll('body *')].filter((e,i,a)=>e&&a.indexOf(e)===i&&(e===document.scrollingElement||/auto|scroll/.test(getComputedStyle(e).overflowY))&&e.clientHeight>60&&e.scrollHeight>e.clientHeight+30&&e.getClientRects().length);
  return candidates.map((e,i)=>{e.setAttribute('data-matchpilot-scroll',String(i));return {index:i,height:e.scrollHeight,clientHeight:e.clientHeight,width:e.scrollWidth,clientWidth:e.clientWidth};});
 }));
 const coverage=[];
 for(const target of targets){
  let end=false,steps=0;
  for(;steps<220;steps++){
   const state=await bounded(page.evaluate(index=>{
    const e=document.querySelector('[data-matchpilot-scroll="'+index+'"]');
    if(!e)return {missing:true};
    e.scrollTop=Math.min(e.scrollHeight,e.scrollTop+Math.max(60,e.clientHeight*0.8));
    return {top:e.scrollTop,height:e.scrollHeight,clientHeight:e.clientHeight,end:e.scrollTop+e.clientHeight>=e.scrollHeight-2};
   },String(target.index)));
   if(state.missing)break;
   await page.waitForTimeout(200);
   await capture(page,pool,id+'-scroll-'+target.index+'-'+steps,section);
   if(state.end){end=true;break;}
  }
  coverage.push({...target,steps:steps+1,reachedBottom:end});
 }
 const horizontal=await bounded(page.evaluate(()=>{
  return [...document.querySelectorAll('body *')].filter(e=>/auto|scroll/.test(getComputedStyle(e).overflowX)&&e.clientWidth>60&&e.scrollWidth>e.clientWidth+30&&e.getClientRects().length).map((e,i)=>{
   e.scrollLeft=e.scrollWidth;return {index:i,width:e.scrollWidth,clientWidth:e.clientWidth,reachedRight:e.scrollLeft+e.clientWidth>=e.scrollWidth-2};
  });
 }));
 if(horizontal.length)await capture(page,pool,id+'-horizontal',section);
 await pool.query('INSERT INTO matchpilot_source_snapshots(snapshot_id,data) VALUES($1,$2) ON CONFLICT DO NOTHING',[id+'-coverage',JSON.stringify({section:section+': scroll coverage',vertical:coverage,horizontal,complete:coverage.every(e=>e.reachedBottom)&&horizontal.every(e=>e.reachedRight)})]);
}


async function testInteractions(page,pool,runId,section) {
 const results=[];
 const state=()=>bounded(page.evaluate(()=>({text:document.body.innerText,active:[...document.querySelectorAll('button.active,button[aria-pressed="true"]')].map(e=>e.innerText)})));
 async function probe(name,action,assertion){
  const before=await state();
  try{
   await action();await page.waitForTimeout(500);
   const after=await state();
   if(assertion&&!await assertion(after))throw new Error('Expected result missing');
   const changed=JSON.stringify(before)!==JSON.stringify(after);
   results.push({name,status:assertion?'passed':'observed',effectChanged:changed});
   await capture(page,pool,runId+'-'+section+'-test-'+results.length,section+': '+name);
  }catch(error){results.push({name,status:'failed',errorType:error.name,message:redact(error.message).slice(0,300)});}
 }
 if(section==='Dashboard'){
  for(const label of ['BANCA','GIOCABILE','OSSERVA','SCARTA','TUTTE','STRATEGIE'])
   await probe(label,()=>clickObserved(page,label));
  if(await page.locator('#resetStrategyFiltersBtn').isVisible())await probe('Reset filtri',()=>page.locator('#resetStrategyFiltersBtn').click());
  await probe('Vista tabella',()=>clickObserved(page,'Vista tabella'));
 }
 if(section==='Live'){
  await probe('Vista tabella',()=>clickObserved(page,'▤ Tabella'));
  await probe('Vista card',()=>clickObserved(page,'▦ Card'));
  for(const label of ['Tutti i campionati ▾','🎯 Scores ▾','🕐 Time ▾','⭐ Le mie strategie ▾']){
   await probe(label,()=>clickObserved(page,label));
   await page.keyboard.press('Escape');
  }
  await probe('Apri filtri',()=>clickObserved(page,'⚙️ Filtri avanzati'),()=>page.locator('#lav-golcasa').isVisible());
  await probe('Gol casa zero',()=>page.locator('#lav-golcasa').fill('0'),()=>page.locator('#lav-golcasa').inputValue().then(v=>v==='0'));
  await probe('Gol casa qualsiasi',()=>page.locator('#lav-golcasa').fill(''),()=>page.locator('#lav-golcasa').inputValue().then(v=>v===''));
  await page.keyboard.press('Escape');
  await clickObserved(page,'Live');
  for(const label of ['Dettaglio Gol+ Gol++','Risultato Esatto Live','1X2','O/U','BTTS','Risultato','STATS+']){
   const exists=await bounded(page.evaluate(label=>[...document.querySelectorAll('button')].some(e=>e.innerText.trim()===label&&e.getClientRects().length),label));
   if(exists)await probe(label,()=>clickObserved(page,label));
   else results.push({name:label,status:'blocked',reason:'No visible control for current live state'});
  }
  await captureScrolled(page,pool,runId+'-live-expanded','Live: pannelli espansi');
  await page.waitForTimeout(30000);
  await capture(page,pool,runId+'-live-followup','Live: successivo aggiornamento');
 }
 if(section==='Backtest Storico'){
  await probe('Ricerca campionato',()=>page.locator('#btLeagueSearch').fill('IRELAND'),s=>s.text.includes('IRELAND'));
  await page.locator('#btLeagueSearch').fill('');
  for(const [id,value] of Object.entries({btO1min:'1.5',btO1max:'2',btOXmin:'3',btOXmax:'5',btO2min:'3',btO2max:'5',btMinute:'60',btGolH:'1',btGolA:'1'}))await page.locator('#'+id).fill(value);
  const ticket=await pool.query('INSERT INTO matchpilot_test_runs(run_id,result) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING run_id',[runId+'-backtest-once',JSON.stringify({status:'claimed',maximumExecutions:1,inputs:{minute:60,score:'1-1',odds1:[1.5,2],oddsX:[3,5],odds2:[3,5]}})]);
  if(ticket.rowCount){
   await probe('Backtest una esecuzione',async()=>{
    await page.locator('#btRunBtn').click();
    await page.waitForFunction(()=>document.body.innerText.includes('partite trovate')||document.body.innerText.includes('PARTITE TROVATE')||document.body.innerText.includes('Nessuna partita trovata'),{},{timeout:60000});
   });
   await captureScrolled(page,pool,runId+'-backtest-result','Backtest: risultato');
   await pool.query('UPDATE matchpilot_test_runs SET completed_at=now(),result=result || $2::jsonb WHERE run_id=$1',[runId+'-backtest-once',JSON.stringify({status:results.at(-1)?.status==='failed'?'uncertain':'observed',attempted:1})]);
  }
 }
 if(section==='Asian Odds'){
  for(const label of ['Live','Non iniziate','Tutte'])await probe('Filtro '+label,()=>clickObserved(page,label));
  for(const [id,value] of [['aoSearchInput','Romania'],['aoTeamSearchInput','Unirea']]){
   await probe('Ricerca '+id,()=>page.locator('#'+id).fill(value));
   await page.locator('#'+id).fill('');
  }
 }
 if(section==='Statistiche Lega'){
  await probe('Ricerca NORWAY',()=>page.locator('#lstSearchIn').fill('NORWAY'),s=>s.text.includes('NORWAY'));
  await probe('Ricerca inesistente',()=>page.locator('#lstSearchIn').fill('MATCHPILOT_NONEXISTENT'));
  await page.locator('#lstSearchIn').fill('');
 }
 if(section==='Ladder Dutching'){
  await page.locator('#dutchProfitInput').fill('10');
  await page.locator('#dutchCommInput').fill('5');
  const row=page.locator('tr').filter({hasText:'⚽ 0-0'}).first();
  await probe('Lay 0-0 quota 5',async()=>{
   await row.locator('input[type="number"]').fill('5');
   await row.locator('input[type="checkbox"]').check();
  },s=>s.text.includes('10.00')||s.text.includes('10,00'));
  await capture(page,pool,runId+'-ladder-calculation','Ladder: calcolo quota 5 profitto 10 commissione 5');
  await probe('Azzera quote',()=>clickObserved(page,'AZZERA QUOTE'));
 }
 if(section==='Analisi'){
  await page.waitForFunction(()=>!document.body.innerText.includes('Calcolo analisi in corso'),{},{timeout:60000}).catch(()=>results.push({name:'Analisi pronta',status:'blocked',reason:'Loading persists'}));
  await captureScrolled(page,pool,runId+'-analysis-ready','Analisi: attesa risultati');
 }
 await pool.query('INSERT INTO matchpilot_source_snapshots(snapshot_id,data) VALUES($1,$2) ON CONFLICT DO NOTHING',[runId+'-'+section+'-tests',JSON.stringify({section:section+': test results',results})]);
}

async function clickObserved(page,label) {
 const text=label.replace(/\s+/g,' ').trim();
 await page.waitForFunction(target=>[...document.querySelectorAll('button')].some(e=>(e.innerText||'').replace(/\s+/g,' ').trim()===target&&!!(e.offsetWidth||e.offsetHeight||e.getClientRects().length)),text,{timeout:60000});
 await bounded(page.evaluate(target=>{
  const button=[...document.querySelectorAll('button')].find(e=>(e.innerText||'').replace(/\s+/g,' ').trim()===target&&!!(e.offsetWidth||e.offsetHeight||e.getClientRects().length));
  if(!button)throw new Error('Known control missing');document.querySelectorAll('[data-matchpilot-target]').forEach(e=>e.removeAttribute('data-matchpilot-target'));button.setAttribute('data-matchpilot-target','true');
 },text),15000);
 await page.locator('[data-matchpilot-target="true"]').click({timeout:15000});
}

export async function testSourceLogin(pool){
 const runId='source-mapping-2026-10-02-qa-v14';
 if(!pool)return;
 await pool.query('CREATE TABLE IF NOT EXISTS matchpilot_test_runs(run_id text PRIMARY KEY,started_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz,result jsonb NOT NULL)');
 await pool.query('CREATE TABLE IF NOT EXISTS matchpilot_source_snapshots(snapshot_id text PRIMARY KEY,captured_at timestamptz NOT NULL DEFAULT now(),data jsonb NOT NULL)');
 const owner=String(Date.now())+'-'+Math.random().toString(36).slice(2);
 const existing=await pool.query('SELECT result,completed_at FROM matchpilot_test_runs WHERE run_id=$1',[runId]);
 if(existing.rows[0]?.completed_at){console.log('SOURCE_MAP_BATCH_DONE already_recorded');return;}
 const restartCount=(existing.rows[0]?.result?.restartCount||0)+1;
 if(restartCount>4 && Number(existing.rows[0]?.result?.leaseUntil||0)<Date.now()){await pool.query("UPDATE matchpilot_test_runs SET completed_at=now(),result=result || '{\"status\":\"blocked\",\"reason\":\"restart_limit\"}'::jsonb WHERE run_id=$1",[runId]);console.log('SOURCE_MAP_BATCH_DONE restart_limit');return;}
 const claimed=await pool.query("INSERT INTO matchpilot_test_runs(run_id,result) VALUES($1,$2) ON CONFLICT (run_id) DO UPDATE SET result=matchpilot_test_runs.result || EXCLUDED.result WHERE COALESCE((matchpilot_test_runs.result->>'leaseUntil')::bigint,0)<$3 RETURNING run_id",[runId,JSON.stringify({status:'running',restartCount,owner,leaseUntil:Date.now()+60000}),Date.now()]);
 if(!claimed.rowCount){console.log('SOURCE_MAP_BATCH waiting_for_lease');const timer=setTimeout(()=>testSourceLogin(pool).catch(()=>console.log('SOURCE_MAP_RETRY failed')),65000);timer.unref();return;}
 let stage='start',browser,page;const completed=existing.rows[0]?.result?.completed||[],failed=[];let outcome='complete';
 const heartbeat=setInterval(()=>pool.query("UPDATE matchpilot_test_runs SET result=result || $2::jsonb WHERE run_id=$1 AND result->>'owner'=$3",[runId,JSON.stringify({leaseUntil:Date.now()+60000}),owner]).catch(()=>{}),15000);heartbeat.unref();
 try{
  const groups=['Money Management','Live','Dashboard','Backtest Storico','Asian Odds','Statistiche Lega','Ladder Dutching','Analisi'].map(section=>[section]);
  for(const group of groups){
   if(group.every(section=>completed.includes(section)))continue;
   stage='login';
   browser=await bounded(chromium.launch({headless:true}),45000);

   const context=await bounded(browser.newContext(),15000);
   await context.route('**/*',route=>['image','media','font'].includes(route.request().resourceType())?route.abort():route.continue());
   const portal=await bounded(context.newPage(),15000);
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
   await portal.getByRole('button',{name:'Apri →',exact:true}).nth(group[0]==='Money Management'?0:1).click();
   page=await popupPromise;
   if(group[0]!=='Money Management')await page.waitForURL(url=>url.protocol==='https:',{timeout:20000});
   await page.waitForLoadState('domcontentloaded',{timeout:20000});
   await portal.close();
   page.setDefaultTimeout(15000);
   stage='module_login';
   if(group[0]!=='Money Management'){
   await page.locator('#loginEmail').fill(process.env.GOAT_USERNAME);
   await page.locator('#loginPassword').fill(process.env.GOAT_PASSWORD);
   await page.locator('#loginSubmitBtn').click();
   await page.locator('#loginEmail').waitFor({state:'hidden',timeout:25000});
   } else {await page.waitForFunction(()=>document.body?.innerText?.trim().length>30,{},{timeout:30000});}
   await page.waitForTimeout(8000);
   for(const section of group){
    if(completed.includes(section))continue;
    stage=section;
    try {
    if(section==='Money Management') {
     await page.locator('body').waitFor({state:'visible'});
    } else if(section.startsWith('Dettaglio: ')||section==='ROI Strategie') {
     await clickObserved(page,'Dashboard');
     await clickObserved(page,section==='ROI Strategie'?'📊 ROI STR':'DETTAGLIO');
     if(section.startsWith('Dettaglio: ')){
      const tab=section.slice(11);
      await page.waitForTimeout(8000);
      for(let attempt=0;attempt<3;attempt++){
       await clickObserved(page,tab);
       await page.waitForTimeout(1000);
       const selected=await bounded(page.evaluate(target=>[...document.querySelectorAll('button.active,button[aria-selected="true"]')].some(e=>e.innerText.trim()===target),tab));
       if(selected)break;
      }
    }
    } else {await clickObserved(page,section);}
    await page.waitForTimeout(3500);
    if(section.startsWith('Dettaglio: ')){
     const selected=await bounded(page.evaluate(target=>[...document.querySelectorAll('button.active,button[aria-selected="true"]')].some(e=>e.innerText.trim()===target),section.slice(11)));
     if(!selected)throw new Error('Requested detail tab did not remain selected');
    }
    await captureScrolled(page,pool,runId+'-'+section,section);
    await testInteractions(page,pool,runId,section);
    completed.push(section);
    await pool.query("UPDATE matchpilot_test_runs SET result=$2 WHERE run_id=$1 AND result->>'owner'=$3",[runId,JSON.stringify({status:'running',restartCount,stage,completed,failed,owner,leaseUntil:Date.now()+60000}),owner]);
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
      console.log('SOURCE_MAP_SECTION_ERROR '+JSON.stringify({section,errorType:error.name,detail:redact(error.message).slice(0,1800)}));
      await capture(page,pool,runId+'-'+section+'-error',section+': diagnostic').catch(()=>{});
      await page.keyboard.press('Escape').catch(()=>{});
      await pool.query('UPDATE matchpilot_test_runs SET result=$2 WHERE run_id=$1',[runId,JSON.stringify({status:'running',stage,completed,failed,owner,leaseUntil:Date.now()+60000})]);
    }
   }
   await bounded(browser.close(),15000);browser=null;
  }
 }catch(error){outcome='partial';console.log('SOURCE_MAP_ERROR '+JSON.stringify({stage,errorType:error.name,detail:redact(error.message).slice(0,1800)}));if(page&&!page.isClosed())await capture(page,pool,runId+'-error','Error diagnostic').catch(()=>{});}finally{
  clearInterval(heartbeat);
  if(browser)await bounded(browser.close(),15000).catch(()=>{});
  const result={status:outcome,stage,completed,failed};
  await pool.query('UPDATE matchpilot_test_runs SET completed_at=now(),result=$2 WHERE run_id=$1',[runId,JSON.stringify(result)]);
  console.log('SOURCE_MAP_BATCH_DONE '+JSON.stringify(result));
 }
}
