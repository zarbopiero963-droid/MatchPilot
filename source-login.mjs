import { validateView } from './source-state.mjs';
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
  const visible=e=>!!(e.offsetWidth||e.offsetHeight||e.getClientRects().length)&&!['hidden','collapse'].includes(getComputedStyle(e).visibility)&&!e.closest('[inert],[aria-hidden="true"]');
  const authVisible=['heroEmail','loginEmail'].some(id=>{const e=document.getElementById(id);return e&&visible(e);});
  const loading=/Calcolo analisi in corso|Caricamento dati|Loading data/i.test(document.body.innerText);
  const interactive=[...new Set([...document.querySelectorAll('a,button,[role="button"],[role="tab"],[onclick],summary,[tabindex="0"]'),...[...document.querySelectorAll('body *')].filter(e=>visible(e)&&getComputedStyle(e).cursor==='pointer')])].filter(visible);
  return {authVisible,loading,detailButtonDiagnostics:[...document.querySelectorAll('button')].filter(e=>['STATS','STATS +','CONSIGLIO'].includes(e.innerText.trim())).map(e=>({label:e.innerText,disabled:e.disabled,onclick:e.getAttribute('onclick'),className:e.className})),activeTabs:[...document.querySelectorAll('button[aria-selected="true"],[role="tab"][aria-selected="true"],button.active')].filter(visible).map(e=>e.innerText),text:document.body.innerText,controls:interactive.map(e=>({tag:e.tagName,label:(e.innerText||e.getAttribute('aria-label')||e.getAttribute('title')||'').trim(),id:e.id,name:e.getAttribute('name'),context:e.closest('tr')?.querySelector('td')?.innerText||''})),inputs:[...document.querySelectorAll('input,select,textarea')].filter(visible).map(e=>({tag:e.tagName,type:e.type,id:e.id,name:e.getAttribute('name'),context:e.closest('tr')?.querySelector('td')?.innerText||e.labels?.[0]?.innerText||'',min:e.getAttribute('min'),max:e.getAttribute('max'),step:e.getAttribute('step'),placeholder:e.getAttribute('placeholder'),options:e.tagName==='SELECT'?[...e.options].map(o=>o.textContent):undefined}))};
 }),15000);
 data.text=redact(data.text);data.controls=data.controls.map(o=>({...o,context:redact(o.context),label:redact(o.label)}));
 data.inputs=data.inputs.map(o=>({...o,context:redact(o.context),placeholder:redact(o.placeholder),options:o.options?.map(redact)}));
 data.viewValidation=validateView(data,{expectedTab:section.startsWith('Dettaglio: ')?section.slice(11).split(':')[0]:undefined});
 const parsed=parseSnapshot(data,{section,required:section==='Live: filtri avanzati'?['lav-golcasa','lav-golospite']:[]});
 const previous=await pool.query("SELECT data FROM matchpilot_source_snapshots WHERE data->>'section'=$1 AND snapshot_id<>$2 ORDER BY captured_at DESC LIMIT 1",[section,id]);
 const changes=compareCatalog(previous.rows[0]?.data,parsed);
 Object.assign(data,parsed,{changes});
 if(section==='ROI Strategie')data.semantic=parseRoiStrategies(data.text);
 await pool.query('INSERT INTO matchpilot_source_snapshots(snapshot_id,data) VALUES($1,$2) ON CONFLICT DO NOTHING',[id,JSON.stringify(data)]);
 if(!parsed.usable)throw new Error('Snapshot validation failed');
 console.log('SOURCE_MAP_BATCH '+JSON.stringify({section,usable:parsed.usable,characters:data.text.length,controls:data.controls.length,inputs:data.inputs.length,added:changes.added.length,removed:changes.removed.length}));
 return data;
}

async function captureScrolled(page,pool,id,section) {
 await capture(page,pool,id+'-initial',section);
 const targets=await bounded(page.evaluate(()=>{
  for(const old of document.querySelectorAll('[data-matchpilot-scroll]'))old.removeAttribute('data-matchpilot-scroll');
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
 if(section==='Backtest Storico'){
  await probe('Ricerca campionato',()=>page.locator('#btLeagueSearch').fill('IRELAND'),s=>s.text.includes('IRELAND'));
  await page.locator('#btLeagueSearch').fill('');
  for(const [id,value] of Object.entries({btO1min:'1.5',btO1max:'2',btOXmin:'3',btOXmax:'5',btO2min:'3',btO2max:'5',btMinute:'60',btGolH:'1',btGolA:'1'}))await page.locator('#'+id).fill(value);
  const ticket=await pool.query('INSERT INTO matchpilot_test_runs(run_id,result) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING run_id',['source-backtest-test-2026-10-02-02',JSON.stringify({status:'claimed',maximumExecutions:1,inputs:{minute:60,score:'1-1',odds1:[1.5,2],oddsX:[3,5],odds2:[3,5]}})]);
  if(ticket.rowCount){
   await probe('Backtest una esecuzione',async()=>{
    await page.locator('#btRunBtn').click();
    await page.waitForFunction(()=>document.body.innerText.includes('partite trovate')||document.body.innerText.includes('PARTITE TROVATE')||document.body.innerText.includes('Nessuna partita trovata'),{},{timeout:60000});
   });
   await captureScrolled(page,pool,runId+'-backtest-result','Backtest: risultato');
   await pool.query('UPDATE matchpilot_test_runs SET completed_at=now(),result=result || $2::jsonb WHERE run_id=$1',['source-backtest-test-2026-10-02-02',JSON.stringify({status:results.at(-1)?.status==='failed'?'uncertain':'observed',attempted:1})]);
  }
 }
 if(section==='Asian Odds'){
  for(const label of ['Live','Non iniziate','Tutte'])await probe('Filtro '+label,()=>page.getByRole('button',{name:label,exact:true}).last().click());
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

 if(section.startsWith('Dettaglio: ')){
  const choices={
   'Dettaglio: STATS +':['5','10','20','Casa / Trasf.','Complessivo','Stessa lega','Tutte','H2H','Race'],
   'Dettaglio: TIMING DEI GOL':['5','10','20','Overall','Casa/Trasferta'],
   'Dettaglio: CLASSIFICA':['Casa','Trasferta','Generale']
  }[section]||[];
  for(const label of choices){
   const control=page.getByRole('button',{name:label,exact:true}).filter({visible:true}).last();
   if(await control.count())await probe('Filtro '+label,()=>control.click());
   else results.push({name:'Filtro '+label,status:'blocked',reason:'No visible exact control'});
  }
  if(section==="Dettaglio: GESTIONE 75'"){
   const buttons=page.getByRole('button',{name:/^\d+-\d+ \d+ casi/});
   const names=await buttons.allTextContents();
   for(const name of names)await probe('Punteggio '+name,()=>page.getByRole('button',{name,exact:true}).click());
  }
  if(section==='Dettaglio: CONSIGLIO'){
   for(const label of ['Entro in lay adesso?','Quale risultato lavoro?','Quanto rischio?',"Cosa faccio al 75'?",'È già successo prima?'])
    await probe('Assistente: '+label,()=>clickObserved(page,label));
   const quote=page.locator('#qeBetfairInput');
   if(await quote.isVisible())await probe('Quota manuale 5',()=>quote.fill('5'),()=>quote.inputValue().then(v=>v==='5'));
  }
  await captureScrolled(page,pool,runId+'-'+section+'-expanded',section+': filtri');
 }


 if(section==='Money Management'){
  for(const [label,id] of [['ANDAMENTO STRATEGIE','btnStats'],['GUIDA',null],['TRACKER','btnTracker']]){
   await probe('Tab '+label,async()=>{
    const close=page.locator('#guideOverlay').getByRole('button',{name:/^chiudi$/i});
    if(await close.isVisible())await close.click();
    if(id)await page.locator('#'+id).click();
    else await page.getByRole('button',{name:/^guida$/i}).click();
    await captureScrolled(page,pool,runId+'-money-'+label,section+': '+label);
   });
  }
  const initial=page.locator('#initial'),original=await initial.inputValue();
  await probe('Capitale virtuale 2000',()=>initial.fill('2000'),s=>s.text.includes('2000,00')||s.text.includes('2.000,00'));
  await initial.fill(original);
  const strategy=page.getByPlaceholder('Strategia',{exact:true}).first();
  const profit=page.getByPlaceholder('+10 / -5',{exact:true}).first();
  const originalStrategy=await strategy.inputValue(),originalProfit=await profit.inputValue();
  await strategy.fill('QA MatchPilot');
  await probe('Trade virtuale +10',()=>profit.fill('+10'),s=>/GUADAGNO TOTALE\s*10,00\s*€/i.test(s.text)&&/CASSA ATTUALE\s*(1010,00|1\.010,00)\s*€/i.test(s.text));
  await profit.fill(originalProfit);await strategy.fill(originalStrategy);
  await capture(page,pool,runId+'-money-restored','Money: impostazioni ripristinate');
 }

 if(section==='Live'){
  if(!await page.locator('#lav-golcasa').isVisible())await clickObserved(page,'⚙️ Filtri avanzati');
  await page.waitForTimeout(3000);
  const qaName='QA MatchPilot 2026-10-02';
  await probe('Nuovo contesto senza strategia QA',async()=>{},s=>!s.text.includes(qaName)&&/LE MIE STRATEGIE\s*0\s*\/\s*5/i.test(s.text));
  const clean=(await state()).text;
  if(!clean.includes(qaName)&&/LE MIE STRATEGIE\s*0\s*\/\s*5/i.test(clean)){
   await pool.query("UPDATE matchpilot_test_runs SET result=result || $2::jsonb WHERE run_id=$1",['source-live-strategy-test-2026-10-02-01',JSON.stringify({status:'isolated_context_disposed',freshContextEmpty:true,removed:true,cleanupMethod:'browser_context_disposal',uiDeleteUntested:true})]);
  }else results.push({name:'Pulizia QA esistente',status:'blocked',reason:'Existing entry needs scoped delete review'});
  await captureScrolled(page,pool,runId+'-fresh-context','Live: nuovo contesto');
 }
 if(section==='Backtest Storico'&&await page.locator('#btStratMarket').isVisible()){
  const labels=['Finisce con lo stesso risultato','Almeno un altro gol','Over 2,5 finale','Over 3,5 finale','1 (vince la casa)','X (pareggio)',"2 (vince l'ospite)",'Risultato esatto 1-1','Risultato esatto 2-1','Risultato esatto 1-2','Risultato esatto 2-2','Risultato esatto 3-1','Risultato esatto 3-2'];
  for(const label of labels){
   const found=await page.locator('#btStratMarket').evaluate((e,label)=>[...e.options].some(o=>o.textContent===label),label);
   if(!found){results.push({name:'Mercato '+label,status:'blocked',reason:'Known market not available'});continue;}
   for(const side of ['Punta','Banca']){
    await probe(label+' '+side,async()=>{
     await page.locator('#btStratMarket').selectOption({label});
     await page.locator('#btStratSide').selectOption({label:side});
     await page.locator('#btStratQuota').fill('3');
     await page.locator('#btStratImporto').fill('10');
     await page.locator('#btStratCommissione').fill('5');
     await page.locator('#btStratCalcBtn').click();
    },s=>/OPERAZIONI\s*\d+/i.test(s.text)&&/PROFITTO TOTALE\s*[+−-]?\d[\d.,]*\s*€/i.test(s.text));
   }
  }
  await captureScrolled(page,pool,runId+'-equity','Backtest: rendimento ed equity');
  const charts=await bounded(page.evaluate(()=>[...document.querySelectorAll('canvas')].filter(e=>e.getClientRects().length).map(e=>({width:e.width,height:e.height}))));
  await pool.query('INSERT INTO matchpilot_source_snapshots(snapshot_id,data) VALUES($1,$2) ON CONFLICT DO NOTHING',[runId+'-equity-charts',JSON.stringify({section:'Backtest: grafici',charts})]);
 }

 await pool.query('INSERT INTO matchpilot_source_snapshots(snapshot_id,data) VALUES($1,$2) ON CONFLICT DO NOTHING',[runId+'-'+section+'-tests',JSON.stringify({section:section+': test results',results})]);
}


async function testSavedStrategies(page,pool,runId,section){
 const results=[];
 async function check(name,fn){
  try{await fn();results.push({name,status:'passed'});}
  catch(e){results.push({name,status:'failed',message:redact(e.message).slice(0,240)});}
  await capture(page,pool,runId+'-'+section+'-save-'+results.length,section+': '+name);
 }
 const prefix='QA MP v27 ';
 const ownText=()=>page.locator('body').innerText();
 const live=section==='Live';
 const open=async()=>{
  await clickObserved(page,section);await page.waitForTimeout(3000);
  if(live&&!await page.locator('#lav-golcasa').isVisible())await page.locator('[data-live-advtoggle]').filter({visible:true}).click();
 };
 await open();
 if(!live){
  await check('Cinque backtest persistenti da contesto precedente',async()=>{
   await page.getByText('QA MP v24 Backtest Storico 1',{exact:true}).filter({visible:true}).first().waitFor({state:'visible',timeout:15000});
   const text=await ownText();
   if(!Array.from({length:5},(_,i)=>'QA MP v24 Backtest Storico '+(i+1)).every(n=>text.includes(n)))throw new Error('Prior own QA entries incomplete');
  });
  await check('Richiamo backtest persistente',async()=>{
   await page.locator('#btMinute').fill('11');
   await page.getByText('QA MP v24 Backtest Storico 1',{exact:true}).filter({visible:true}).click();
   if(await page.locator('#btMinute').inputValue()!=='60')throw new Error('Minute not restored');
  });
  await pool.query('INSERT INTO matchpilot_source_snapshots(snapshot_id,data) VALUES($1,$2) ON CONFLICT DO NOTHING',[runId+'-'+section+'-tests',JSON.stringify({section:section+': saved strategy test results',results})]);return;
 }
 const baseline=await ownText();
 if(live?!/LE MIE STRATEGIE\s*0\s*\/\s*5/i.test(baseline):(!(baseline.includes('Nessuna strategia salvata.'))&&(await page.locator('#btSavedList').innerText()).trim()!=='')){
  results.push({name:'Preservare strategie esistenti',status:'blocked',reason:'Initial list not empty'});
 }else{
  const guard='source-saved-limits-2026-10-02-v27-'+section;
  let pendingName='',dialogs=[],deletingName='';
  const claim=await pool.query('INSERT INTO matchpilot_test_runs(run_id,result) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING run_id',[guard,JSON.stringify({status:'claimed',maxSaveAttempts:6,backtestExecutions:0})]);
  if(claim.rowCount){
   const save=async name=>{
    pendingName=name;
    if(live){
     const button=page.getByRole('button',{name:'💾 Salva strategia',exact:true}).filter({visible:true});
     if(await button.isDisabled())return;
     await button.click();
     if(await page.locator('#lavSaveName').isVisible()){
      await page.locator('#lavSaveName').fill(name);
      const b=page.getByRole('button',{name:/^salva$/i}).filter({visible:true});
      if(await b.count()!==1)throw new Error('Ambiguous inline save');
      await b.click();
     }
    }else{
     await page.locator('#btStratName').fill(name);
     if(await page.locator('#btSaveStratBtn').isDisabled())return;
     await page.locator('#btSaveStratBtn').click();
    }
    await page.waitForTimeout(500);
   };
   page.removeAllListeners('dialog');page.on('dialog',d=>{dialogs.push({type:d.type(),message:redact(d.message())});return d.type()==='prompt'&&/nome|strategia/i.test(d.message())?d.accept(pendingName):d.type()==='confirm'&&deletingName.startsWith(prefix)&&/elimin|strategia/i.test(d.message())?d.accept():d.dismiss();});
   const field=live?'lav-golcasa':'btMinute';
   if(!live){
    const ticket=await pool.query('INSERT INTO matchpilot_test_runs(run_id,result) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING run_id',['source-backtest-test-2026-10-02-04',JSON.stringify({status:'claimed',maximumExecutions:1,reason:'Saved strategies require completed backtest'})]);
    if(!ticket.rowCount)throw new Error('Fourth backtest already attempted; no retry');
    for(const [id,value] of Object.entries({btO1min:'1.5',btO1max:'2',btOXmin:'3',btOXmax:'5',btO2min:'3',btO2max:'5',btMinute:'60',btGolH:'1',btGolA:'1'}))await page.locator('#'+id).fill(value);
    await page.locator('#btRunBtn').click();
    await page.waitForFunction(()=>/partite trovate|nessuna partita trovata/i.test(document.body.innerText),{},{timeout:60000});
    await capture(page,pool,runId+'-fourth-backtest','Backtest: prerequisito salvataggio');
    await pool.query("UPDATE matchpilot_test_runs SET completed_at=now(),result=result || $2::jsonb WHERE run_id=$1",['source-backtest-test-2026-10-02-04',JSON.stringify({status:'observed',attempted:1})]);
   }else await page.locator('#'+field).fill('2');
   for(let i=1;i<=5;i++)await check('Salva '+i+' di 5',async()=>{
    await save(prefix+section+' '+i);
    await page.getByText(prefix+section+' '+i,{exact:true}).filter({visible:true}).first().waitFor({state:'visible',timeout:5000});
   });
   await check('Sesta strategia rifiutata',async()=>{
    const names=await ownText();
    if(!Array.from({length:5},(_,i)=>prefix+section+' '+(i+1)).every(n=>names.includes(n)))throw new Error('Five entries not established');
    await save(prefix+section+' 6');
    const after=await ownText();
    if(after.includes(prefix+section+' 6'))throw new Error('Sixth entry accepted');
    if(!Array.from({length:5},(_,i)=>prefix+section+' '+(i+1)).every(n=>after.includes(n)))throw new Error('Existing entry replaced');
   });
   await check('Richiamo parametri salvati',async()=>{
    await page.locator('#'+field).fill(live?'0':'11');
    await page.getByText(prefix+section+' 1',{exact:true}).filter({visible:true}).click();
    if(await page.locator('#'+field).inputValue()!==(live?'2':'60'))throw new Error('Saved parameter not restored');
   });
   const rowStructure=await page.getByText(prefix+section+' 1',{exact:true}).filter({visible:true}).first().evaluate(e=>{
    const parents=[];for(let i=0;i<4&&e;i++,e=e.parentElement)parents.push({tag:e.tagName,id:e.id,text:e.innerText.slice(0,500),buttons:[...e.querySelectorAll('button,[role="button"],[onclick]')].map(b=>({label:b.innerText,title:b.title,attributes:[...b.attributes].filter(a=>a.name.startsWith('data-')).map(a=>[a.name,a.value])}))});return parents;
   }).catch(()=>[]);
   await pool.query('INSERT INTO matchpilot_source_snapshots(snapshot_id,data) VALUES($1,$2) ON CONFLICT DO NOTHING',[runId+'-'+section+'-row-structure',JSON.stringify({section:section+': QA row structure',rowStructure})]);
   await check('Persistenza cinque dopo reload',async()=>{
    await page.reload({waitUntil:'domcontentloaded',timeout:30000});
    if(await page.locator('#loginEmail').isVisible()){
     await page.locator('#loginEmail').fill(process.env.GOAT_USERNAME);
     await page.locator('#loginPassword').fill(process.env.GOAT_PASSWORD);
     await page.locator('#loginSubmitBtn').click();
     await page.locator('#loginEmail').waitFor({state:'hidden',timeout:25000});
    }
    await page.waitForTimeout(10000);await open();
    await page.getByText(prefix+section+' 1',{exact:true}).filter({visible:true}).first().waitFor({state:'visible',timeout:15000});
    const text=await ownText();
    if(!Array.from({length:5},(_,i)=>prefix+section+' '+(i+1)).every(n=>text.includes(n)))throw new Error('Reload lost entries');
   });
   // Inspect only visible row controls belonging to exact own QA names.
   const diagnostic=await bounded(page.evaluate(prefix=>{
    const visible=e=>!!e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';
    return [...document.querySelectorAll('body *')].filter(e=>visible(e)&&e.children.length===0&&e.textContent.trim().startsWith(prefix)).map(leaf=>{
     let row=leaf.parentElement;
     for(let i=0;i<3&&row;i++,row=row.parentElement){
      const b=[...row.querySelectorAll('button,[role="button"],[onclick]')].filter(visible);
      if(b.length)return {name:leaf.textContent.trim(),controls:b.map(e=>({tag:e.tagName,label:e.innerText,title:e.title,attributes:[...e.attributes].filter(a=>a.name.startsWith('data-')).map(a=>[a.name,a.value])}))};
     }return {name:leaf.textContent.trim(),controls:[]};
    });
   },prefix+section));
   await pool.query('INSERT INTO matchpilot_source_snapshots(snapshot_id,data) VALUES($1,$2) ON CONFLICT DO NOTHING',[runId+'-'+section+'-delete-controls',JSON.stringify({section:section+': own QA delete controls',diagnostic,dialogs})]);
   // Cross-module limits checked before deleting: leave own entries within this disposable context.
   await pool.query('UPDATE matchpilot_test_runs SET completed_at=now(),result=result || $2::jsonb WHERE run_id=$1',[guard,JSON.stringify({status:results.every(r=>r.status==='passed')?'passed':'partial',results,cleanup:'context_disposal_pending'})]);
  }else results.push({name:'Save guard',status:'blocked',reason:'Already attempted'});
 }
 if(live){
  await check('Limiti indipendenti: cinque backtest e cinque live',async()=>{
   if(!Array.from({length:5},(_,i)=>prefix+'Live '+(i+1)).every(n=>baseline.includes(n)||(false))) {
    const now=await ownText();
    if(!Array.from({length:5},(_,i)=>prefix+'Live '+(i+1)).every(n=>now.includes(n)))throw new Error('Five live entries absent');
   }
   await clickObserved(page,'Backtest Storico');
   await page.getByText('QA MP v24 Backtest Storico 1',{exact:true}).filter({visible:true}).first().waitFor({state:'visible',timeout:15000});
   const back=await ownText();
   if(!Array.from({length:5},(_,i)=>'QA MP v24 Backtest Storico '+(i+1)).every(n=>back.includes(n)))throw new Error('Backtest entries lost when live populated');
   await open();
  });
 }
 
 if(live){
  for(const module of ['Backtest Storico','Live']){
   await clickObserved(page,module);await page.waitForTimeout(1500);
   if(module==='Live'&&!await page.locator('#lav-golcasa').isVisible())await page.locator('[data-live-advtoggle]').filter({visible:true}).click();
   for(let i=1;i<=5;i++)await check('Elimina solo QA '+module+' '+i,async()=>{
    const name=(module==='Backtest Storico'?'QA MP v24 ':prefix)+module+' '+i;
    const leaf=page.getByText(name,{exact:true}).filter({visible:true});
    if(await leaf.count()!==1)throw new Error('Own QA row not unique');
    const row=leaf.locator('..').locator('..');
    const target=row.getByText('✕',{exact:true}).filter({visible:true});
    if(await target.count()!==1)throw new Error('Own QA delete control not unique');
    page.removeAllListeners('dialog');
    page.on('dialog',d=>d.type()==='confirm'&&/elimin|strategia/i.test(d.message())?d.accept():d.dismiss());
    await target.click();
    await leaf.waitFor({state:'hidden',timeout:5000});
   });
  }
  await check('Pulizia persistente dopo reload',async()=>{
   await page.reload({waitUntil:'domcontentloaded',timeout:30000});await page.waitForTimeout(10000);
   if(await page.locator('#loginEmail').isVisible()){
    await page.locator('#loginEmail').fill(process.env.GOAT_USERNAME);await page.locator('#loginPassword').fill(process.env.GOAT_PASSWORD);
    await page.locator('#loginSubmitBtn').click();await page.locator('#loginEmail').waitFor({state:'hidden',timeout:25000});await page.waitForTimeout(8000);
   }
   for(const module of ['Backtest Storico','Live']){
    await clickObserved(page,module);await page.waitForTimeout(2000);
    if(module==='Live'&&!await page.locator('#lav-golcasa').isVisible())await page.locator('[data-live-advtoggle]').filter({visible:true}).click();
    if((await ownText()).includes(prefix)||(module==='Backtest Storico'&&(await ownText()).includes('QA MP v24 Backtest Storico')))throw new Error('QA entry remains');
   }
  });
 }

await pool.query('INSERT INTO matchpilot_source_snapshots(snapshot_id,data) VALUES($1,$2) ON CONFLICT DO NOTHING',[runId+'-'+section+'-tests',JSON.stringify({section:section+': saved strategy test results',results})]);
}


async function testFinalNavigation(page,pool,runId,section){
 const results=[];
 async function check(name,action,assertion){
  try{await action();await page.waitForTimeout(1000);if(assertion&&!await assertion())throw new Error('Expected state absent');results.push({name,status:assertion?'passed':'observed'});}
  catch(e){results.push({name,status:'failed',message:redact(e.message).slice(0,200)});}
  await pool.query('INSERT INTO matchpilot_source_snapshots(snapshot_id,data) VALUES($1,$2) ON CONFLICT(snapshot_id) DO UPDATE SET data=EXCLUDED.data',[runId+'-'+section+'-journal',JSON.stringify({section:section+': click journal',results})]);
  await capture(page,pool,runId+'-'+section+'-final-'+results.length,section+': '+name);
 }
 if(section==='Dashboard'){
  for(const label of ['Score','Rischio','Orario','Campionato','Nome'])
   await check('Selezione ordinamento '+label,()=>page.locator('#sortOrder').selectOption({label}),()=>page.locator('#sortOrder option:checked').textContent().then(s=>s===label));
  await page.locator('#sortOrder').selectOption({label:'Score'});
  await check('Apri scelta giornata',()=>clickObserved(page,'02 OTT 2026'));
  const dates=page.locator('input[type="date"]').filter({visible:true});
  if(await dates.count()===1){
   const original=await dates.inputValue();
   await check('Seleziona ieri',async()=>{await dates.fill('2026-10-01');await dates.press('Tab');await page.waitForTimeout(5000);},()=>page.locator('#todayDateLabel').innerText().then(s=>/01.*OTT.*2026/i.test(s)));
   await check('Ripristina oggi',async()=>{await dates.fill(original);await dates.press('Tab');await page.waitForTimeout(3000);},()=>page.locator('#todayDateLabel').innerText().then(s=>/02.*OTT.*2026/i.test(s)));
  }else{
   results.push({name:'Cambio data',status:'blocked',reason:'No unique visible date input; native picker not certified'});
   await page.keyboard.press('Escape');
  }
  const ui=await bounded(page.evaluate(()=>[...document.querySelectorAll('button,[role="button"],[onclick],input[type="date"]')].filter(e=>e.getClientRects().length).map(e=>({tag:e.tagName,id:e.id,label:(e.innerText||e.title||e.getAttribute('aria-label')||'').trim(),attributes:[...e.attributes].filter(a=>a.name.startsWith('data-')).map(a=>[a.name,a.value])})).filter(o=>/favor|monitor|star|date/i.test(JSON.stringify(o))).slice(0,60)));
  await pool.query('INSERT INTO matchpilot_source_snapshots(snapshot_id,data) VALUES($1,$2) ON CONFLICT DO NOTHING',[runId+'-dashboard-remaining-controls',JSON.stringify({section:'Dashboard: remaining control metadata',ui})]);
 }
 if(section==='Palinsesto'){
  await check('Apri inserimento manuale',()=>page.getByRole('button',{name:/^manuale$/i}).click(),async()=>await page.locator('textarea').filter({visible:true}).count()>0);
  // No imports or global analysis invoked.
 }
 if(section==='Archivio'){
  for(const label of ['VINTE','PERSE','SALTATE','TUTTE']){
   const b=page.getByRole('button',{name:new RegExp(label,'i')}).filter({visible:true});
   if(await b.count()===1)await check('Filtro archivio '+label,()=>b.click());
   else results.push({name:'Filtro archivio '+label,status:'blocked',reason:'Unique visible known control absent'});
  }
 }
 if(section==='Live'){
  if(!await page.locator('#lav-golcasa').isVisible())await page.locator('[data-live-advtoggle]').filter({visible:true}).click();
  await check('Nuovo contesto live pulito',async()=>{},async()=>{
   const t=await page.locator('body').innerText();return /LE MIE STRATEGIE\s*0\s*\/\s*5/i.test(t)&&!t.includes('QA MP v');
  });
 }
 if(section==='Backtest Storico'){
  await page.waitForTimeout(5000);
  await check('Nuovo contesto backtest pulito',async()=>{},async()=>!(await page.locator('#btSavedList').innerText()).includes('QA MP v'));
 }
 await pool.query('INSERT INTO matchpilot_source_snapshots(snapshot_id,data) VALUES($1,$2) ON CONFLICT DO NOTHING',[runId+'-'+section+'-tests',JSON.stringify({section:section+': final navigation results',results})]);
}


async function inspectControlMap(page,pool,runId,section){
 async function inventory(suffix){
  const controls=await bounded(page.evaluate(()=>{
   const visible=e=>!!(e.offsetWidth||e.offsetHeight||e.getClientRects().length)&&getComputedStyle(e).visibility!=='hidden';
   const candidate=e=>['BUTTON','A','SUMMARY'].includes(e.tagName)||['button','tab'].includes(e.getAttribute('role'))||e.hasAttribute('onclick')||([...e.attributes].some(a=>a.name.startsWith('data-')&&!a.name.startsWith('data-matchpilot'))&&getComputedStyle(e).cursor==='pointer');
   return {controls:[...document.querySelectorAll('body *')].filter(e=>visible(e)&&candidate(e)).map(e=>({tag:e.tagName,id:e.id,label:(e.innerText||e.getAttribute('aria-label')||e.title||'').trim().slice(0,200),title:e.title,role:e.getAttribute('role'),disabled:!!e.disabled,attributes:[...e.attributes].filter(a=>a.name.startsWith('data-')&&!a.name.startsWith('data-matchpilot')&&!/token|secret|password|auth/i.test(a.name)).map(a=>[a.name,a.value]),link:e.tagName==='A'?(()=>{try{const u=new URL(e.href);return u.origin+u.pathname}catch{return ''}})():undefined})),dates:[...document.querySelectorAll('input[type="date"]')].map(e=>({id:e.id,type:e.type,visible:visible(e),value:e.value})),dialogs:[...document.querySelectorAll('[role="dialog"],dialog')].filter(visible).map(e=>e.innerText.slice(0,1000))};
  }));
  for(const c of controls.controls){c.label=redact(c.label);c.title=redact(c.title);if(c.link)c.link=redact(c.link);}
  await pool.query('INSERT INTO matchpilot_source_snapshots(snapshot_id,data) VALUES($1,$2) ON CONFLICT DO NOTHING',[runId+'-'+section+'-map-'+suffix,JSON.stringify({section:section+': control map '+suffix,...controls})]);
  await capture(page,pool,runId+'-'+section+'-text-'+suffix,section+': '+suffix);
 }
 await inventory('initial');
 if(section==='Dashboard'){
  const analysis=page.locator('button').filter({hasText:/^🧠?\s*Analisi\s*▾?$/i}).filter({visible:true}).first();
  if(await analysis.count()){await analysis.click();await inventory('analysis-dropdown');await page.keyboard.press('Escape');}
  await clickObserved(page,'02 OTT 2026');await inventory('calendar');await page.keyboard.press('Escape');
 }
 if(section==='Live'){
  await page.getByRole('button',{name:/Tabella/}).filter({visible:true}).first().click();await inventory('table');
  await page.getByRole('button',{name:/Card/}).filter({visible:true}).first().click();await inventory('card');
  for(const [key,re] of [['scores',/Scores/],['time',/Time\s*▾?/],['league',/Tutti i campionati/],['strategy',/Le mie strategie/]]){
   const b=page.getByRole('button',{name:re}).filter({visible:true}).first();
   if(await b.count()){await b.click();await inventory(key);await b.click().catch(()=>{});}
  }
 }
 if(section==='Asian Odds'){
  const extra=page.getByRole('button',{name:/^altre/i}).filter({visible:true}).first();
  if(await extra.count()){await extra.click();await inventory('other-lines');await page.keyboard.press('Escape');}
 }
}


async function testMarkedControls(page,pool,runId,section){
 if(section!=='Dashboard')return;
 const context=page.context();const moduleUrl=page.url();
 const evidence={section:'QA-02 logout',startedAt:new Date().toISOString(),before:{loginVisible:await page.locator('#loginEmail').isVisible(),logout:await page.locator('#logoutBtn').evaluate(e=>({label:e.innerText,tag:e.tagName,href:e.getAttribute('href'),type:e.type}))},dialogs:[]};
 page.on('dialog',async d=>{evidence.dialogs.push({type:d.type(),message:redact(d.message())});await d.accept();});
 await page.locator('#logoutBtn').click({timeout:15000});
 await page.waitForTimeout(1000);
 if(!page.isClosed()){
  const visible=await page.locator('button').filter({visible:true}).allTextContents();evidence.afterClickButtons=visible.map(redact);
  const confirmation=page.getByRole('button',{name:'Conferma',exact:true}).filter({visible:true});
  if(await confirmation.count()===1){await confirmation.click();evidence.confirmed=true;}
 }
 for(let n=0;n<30&&!page.isClosed()&&!await page.locator('#loginEmail').isVisible();n++)await page.waitForTimeout(1000);
 evidence.closed=page.isClosed();
 if(!evidence.closed){evidence.after={path:new URL(page.url()).pathname,loginVisible:await page.locator('#loginEmail').isVisible(),logoutVisible:await page.locator('#logoutBtn').isVisible(),text:redact(await page.locator('body').innerText()).slice(0,2500)};}
 const probe=await context.newPage();await probe.goto(moduleUrl,{waitUntil:'domcontentloaded',timeout:30000});await probe.waitForTimeout(8000);
 evidence.protectedRevisit={loginVisible:await probe.locator('#loginEmail').isVisible(),logoutVisible:await probe.locator('#logoutBtn').isVisible(),path:new URL(probe.url()).pathname};
 if(evidence.protectedRevisit.loginVisible){
  await probe.locator('#loginEmail').fill(process.env.GOAT_USERNAME);await probe.locator('#loginPassword').fill(process.env.GOAT_PASSWORD);await probe.locator('#loginSubmitBtn').click();
  await probe.locator('#loginEmail').waitFor({state:'hidden',timeout:25000});evidence.reloginPassed=await probe.locator('#logoutBtn').isVisible();
 }
 evidence.status=evidence.protectedRevisit.loginVisible&&!evidence.protectedRevisit.logoutVisible&&evidence.reloginPassed?'passed':'failed';
 await pool.query('INSERT INTO matchpilot_source_snapshots(snapshot_id,data) VALUES($1,$2) ON CONFLICT DO NOTHING',[runId+'-QA02',JSON.stringify(evidence)]);
 await probe.close();
}

async function clickObserved(page,label) {
 const text=label.replace(/\s+/g,' ').trim();
 await page.waitForFunction(target=>[...document.querySelectorAll('button,[role="button"],[role="tab"],[onclick],summary')].some(e=>[e.innerText,e.getAttribute('aria-label'),e.getAttribute('title')].some(s=>(s||'').replace(/\s+/g,' ').trim()===target)&&!!(e.offsetWidth||e.offsetHeight||e.getClientRects().length)),text,{timeout:60000});
 await bounded(page.evaluate(target=>{
  const button=[...document.querySelectorAll('button,[role="button"],[role="tab"],[onclick],summary')].find(e=>[e.innerText,e.getAttribute('aria-label'),e.getAttribute('title')].some(s=>(s||'').replace(/\s+/g,' ').trim()===target)&&!!(e.offsetWidth||e.offsetHeight||e.getClientRects().length));
  if(!button)throw new Error('Known control missing');document.querySelectorAll('[data-matchpilot-target]').forEach(e=>e.removeAttribute('data-matchpilot-target'));button.setAttribute('data-matchpilot-target','true');
 },text),15000);
 await page.locator('[data-matchpilot-target="true"]').click({timeout:15000});
}

export async function testSourceLogin(pool){
 const runId='source-mapping-2026-10-02-issue2-qa02-v42';
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
 const snapshotRunId=runId+'-attempt-'+owner;
 let stage='start',browser,page;const completed=existing.rows[0]?.result?.completed||[],failed=[];let outcome='complete';
 const heartbeat=setInterval(()=>pool.query("UPDATE matchpilot_test_runs SET result=result || $2::jsonb WHERE run_id=$1 AND result->>'owner'=$3",[runId,JSON.stringify({leaseUntil:Date.now()+60000}),owner]).catch(()=>{}),15000);heartbeat.unref();
 try{
  const groups=[['Dashboard']];
  for(const group of groups){
   if(group.every(section=>completed.includes(section)))continue;
   stage='login: '+group[0];
   await pool.query('UPDATE matchpilot_test_runs SET result=result || $2::jsonb WHERE run_id=$1',[runId,JSON.stringify({stage,completed,failed,restartCount})]);
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
   if(group[0]!=='Money Management')await portal.close();
   page.setDefaultTimeout(15000);
   stage='module_login';
   if(group[0]!=='Money Management'){
   await page.locator('#loginEmail').fill(process.env.GOAT_USERNAME);
   await page.locator('#loginPassword').fill(process.env.GOAT_PASSWORD);
   await page.locator('#loginSubmitBtn').click();
   await page.locator('#loginEmail').waitFor({state:'hidden',timeout:25000});
   } else {await page.waitForFunction(()=>document.body?.innerText?.trim().length>30,{},{timeout:45000});await portal.close();}
   await page.waitForTimeout(8000);
   for(const section of group){
    if(completed.includes(section))continue;
    stage=section;
    try {
    if(section==='Money Management') {
     await page.locator('body').waitFor({state:'visible'});
    } else if(section.startsWith('Dettaglio: ')||section==='ROI Strategie') {
     if(await page.locator('#closeDetailBtn').isVisible())await page.locator('#closeDetailBtn').click();
     await clickObserved(page,'Dashboard');
     await clickObserved(page,section==='ROI Strategie'?'📊 ROI STR':'DETTAGLIO');
     if(section.startsWith('Dettaglio: ')){
      const tab=section.slice(11);
      await page.waitForTimeout(8000);
      for(let attempt=0;attempt<12;attempt++){
       await clickObserved(page,tab);
       await page.waitForTimeout(3500);
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
    // QA02 records its own before/after session evidence.
    await testMarkedControls(page,pool,snapshotRunId,section);
    completed.push(section);
    await pool.query("UPDATE matchpilot_test_runs SET result=$2 WHERE run_id=$1 AND result->>'owner'=$3",[runId,JSON.stringify({status:'running',restartCount,stage,completed,failed,owner,leaseUntil:Date.now()+60000}),owner]);
    if(section==='Live'){
     if(!await page.locator('#lav-golcasa').isVisible())await page.locator('[data-live-advtoggle]').filter({visible:true}).click();
     await page.waitForTimeout(500);
     await capture(page,pool,snapshotRunId+'-live-filters','Live: filtri avanzati');
    }
    const legends=page.getByText(/^\s*\??\s*(Legend|Legenda)\s*$/i).filter({visible:true});
    const total=await legends.count();
    for(let index=0;index<total&&index<8;index++){
     if(!await legends.nth(index).isVisible())continue;
     await legends.nth(index).click();
     await page.waitForTimeout(300);
     const data=await capture(page,pool,snapshotRunId+'-'+section+'-legend-'+index,section+': Legend '+index);
     const close=data.controls.find(o=>/^(✕|×|Chiudi|Close)$/.test(o.label));
     if(close){await page.getByText(close.label,{exact:true}).filter({visible:true}).first().click();}
     else{await page.keyboard.press('Escape');}
    }
    } catch(error) {
      outcome='partial'; failed.push({section,errorType:error.name});
      console.log('SOURCE_MAP_SECTION_ERROR '+JSON.stringify({section,errorType:error.name,detail:redact(error.message).slice(0,1800)}));
      await capture(page,pool,snapshotRunId+'-'+section+'-error',section+': diagnostic').catch(()=>{});
      await page.keyboard.press('Escape').catch(()=>{});
      await pool.query('UPDATE matchpilot_test_runs SET result=$2 WHERE run_id=$1',[runId,JSON.stringify({status:'running',restartCount,stage,completed,failed,owner,leaseUntil:Date.now()+60000})]);
    }
   }

   await bounded(browser.close(),15000);browser=null;
  }
 }catch(error){outcome='partial';console.log('SOURCE_MAP_ERROR '+JSON.stringify({stage,errorType:error.name,detail:redact(error.message).slice(0,1800)}));if(page&&!page.isClosed())await capture(page,pool,snapshotRunId+'-error','Error diagnostic').catch(()=>{});}finally{
  clearInterval(heartbeat);
  if(browser)await bounded(browser.close(),15000).catch(()=>{});
  const result={status:outcome,stage,completed,failed,restartCount,snapshotRunId};
  await pool.query("UPDATE matchpilot_test_runs SET completed_at=now(),result=$2 WHERE run_id=$1 AND result->>'owner'=$3",[runId,JSON.stringify(result),owner]);
  console.log('SOURCE_MAP_BATCH_DONE '+JSON.stringify(result));
 }
}
