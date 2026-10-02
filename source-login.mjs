import { chromium } from 'playwright';
export async function testSourceLogin(pool){
 const runId='source-mapping-2026-10-02-pages-v1';
 if(!pool){console.log('SOURCE_LOGIN_TEST database_missing');return;}
 await pool.query('CREATE TABLE IF NOT EXISTS matchpilot_test_runs (run_id text PRIMARY KEY, started_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz, result jsonb NOT NULL)');
 const claimed=await pool.query("INSERT INTO matchpilot_test_runs (run_id,result) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING run_id",[runId,JSON.stringify({status:'running'})]);
 if(!claimed.rowCount){console.log('SOURCE_LOGIN_TEST already_recorded');return;}
 let browser; let stage='configuration'; let result={status:'unknown'};
 try{
  if(!process.env.GOAT_USERNAME||!process.env.GOAT_PASSWORD){result={status:'credentials_missing'};return;}
  stage='browser_launch';
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext();
  const page=await context.newPage();
  page.setDefaultTimeout(15000);
  let failedRequests=0;
  page.on('requestfailed',()=>{failedRequests++});
  stage='navigation';
  await page.goto('https://goatbettingexchange.com/portale',{waitUntil:'domcontentloaded',timeout:30000});
  const email=page.locator('#heroEmail'),password=page.locator('#heroPass');
  stage='login_form';
  await email.waitFor({state:'visible'});
  stage='submission';
  await email.fill(process.env.GOAT_USERNAME);
  await password.fill(process.env.GOAT_PASSWORD);
  await page.getByRole('button',{name:'Accedi',exact:true}).click();
  stage='verification';
  const outcome=await Promise.race([
   page.getByText('Failed to fetch',{exact:true}).waitFor({state:'visible',timeout:20000}).then(()=> 'fetch_failed').catch(()=>null),
   page.getByText(/password errata|credenziali non valide|invalid login|invalid credentials/i).first().waitFor({state:'visible',timeout:20000}).then(()=> 'credentials_rejected').catch(()=>null),
   page.getByRole('button',{name:/^(Esci|Logout|Log out)$/i}).or(page.getByRole('link',{name:/^(Esci|Logout|Log out)$/i})).first().waitFor({state:'visible',timeout:20000}).then(()=> 'signed_in').catch(()=>null)
  ]);
  const loginVisible=await email.isVisible().catch(()=>false);
  const logoutVisible=await page.getByRole('button',{name:/^(Esci|Logout|Log out)$/i}).or(page.getByRole('link',{name:/^(Esci|Logout|Log out)$/i})).first().isVisible().catch(()=>false);
  result={status:outcome==='signed_in'&&!loginVisible&&logoutVisible?'signed_in':outcome||'unconfirmed',loginFormVisible:loginVisible,logoutVisible,failedRequests};

  if(result.status==='signed_in'){
   const snapshot=await page.evaluate(()=>{
    const visible=e=>!!(e.offsetWidth||e.offsetHeight||e.getClientRects().length);
    return {title:document.title,text:document.body.innerText,controls:[...document.querySelectorAll('a,button,[role="button"]')].filter(visible).map(e=>({tag:e.tagName,label:(e.innerText||e.getAttribute('aria-label')||'').trim(),id:e.id,href:e.tagName==='A'?e.getAttribute('href'):null})),inputs:[...document.querySelectorAll('input,select,textarea')].filter(visible).map(e=>({tag:e.tagName,type:e.type,id:e.id,placeholder:e.getAttribute('placeholder')}))};
   });
   const redact=text=>{
    let s=String(text||'');
    for(const key of ['GOAT_USERNAME','GOAT_PASSWORD','APP_PASSWORD','OPENROUTER_API_KEY']){
     if(process.env[key])s=s.split(process.env[key]).join('[REDACTED]');
    }
    return s.replace(/[^\s]+@[^\s]+/g,'[EMAIL]').split(/(\s+)/).map(w=>w.startsWith('http')?'[URL]':w).join('');
   };
   snapshot.text=redact(snapshot.text);
   snapshot.title=redact(snapshot.title);
   snapshot.controls=snapshot.controls.map(c=>({...c,label:redact(c.label),href:c.href?(()=>{try{const u=new URL(c.href,page.url());return u.origin+u.pathname}catch{return null}})():null}));
   await pool.query('CREATE TABLE IF NOT EXISTS matchpilot_source_snapshots (snapshot_id text PRIMARY KEY, captured_at timestamptz NOT NULL DEFAULT now(), data jsonb NOT NULL)');
   await pool.query('INSERT INTO matchpilot_source_snapshots(snapshot_id,data) VALUES($1,$2) ON CONFLICT DO NOTHING',[runId,JSON.stringify(snapshot)]);
   console.log('SOURCE_MAP_PORTAL '+JSON.stringify(snapshot));
   result.snapshotSaved=true;

   for(const [index,moduleName] of [[1,'layscore'],[0,'money']]){
    stage='module_'+moduleName;
    if(page.isClosed())break;
    if(index===0)await page.goto('https://goatbettingexchange.com/portale',{waitUntil:'domcontentloaded',timeout:30000});
    await page.getByRole('button',{name:'Apri →',exact:true}).nth(index).waitFor({state:'visible'});
    const popupPromise=page.waitForEvent('popup',{timeout:10000}).catch(()=>null);
    await page.getByRole('button',{name:'Apri →',exact:true}).nth(index).click();
    const popup=await popupPromise;
    const target=popup||page;
    await target.waitForLoadState('domcontentloaded',{timeout:30000}).catch(()=>{});

    await target.waitForURL(url=>url.protocol==='https:',{timeout:15000}).catch(()=>{});
    await target.waitForTimeout(1500);
    if(moduleName==='layscore' && await target.locator('#loginEmail').isVisible()){
     stage='layscore_login';
     await target.locator('#loginEmail').fill(process.env.GOAT_USERNAME);
     await target.locator('#loginPassword').fill(process.env.GOAT_PASSWORD);
     await target.locator('#loginSubmitBtn').click();
     await target.locator('#loginEmail').waitFor({state:'hidden',timeout:25000});
    }
    const moduleSnapshot=await target.evaluate(()=>{
     const visible=e=>!!(e.offsetWidth||e.offsetHeight||e.getClientRects().length);
     return {title:document.title,text:document.body.innerText,controls:[...document.querySelectorAll('a,button,[role="button"],nav [onclick],aside [onclick]')].filter(visible).map(e=>({tag:e.tagName,label:(e.innerText||e.getAttribute('aria-label')||'').trim(),id:e.id,href:e.tagName==='A'?e.getAttribute('href'):null})),inputs:[...document.querySelectorAll('input,select,textarea')].filter(visible).map(e=>({tag:e.tagName,type:e.type,id:e.id,placeholder:e.getAttribute('placeholder'),options:e.tagName==='SELECT'?[...e.options].map(o=>o.textContent):undefined}))};
    });
    moduleSnapshot.origin=new URL(target.url()).origin;
    moduleSnapshot.path=new URL(target.url()).pathname;
    moduleSnapshot.text=redact(moduleSnapshot.text);
    moduleSnapshot.title=redact(moduleSnapshot.title);
    moduleSnapshot.controls=moduleSnapshot.controls.map(control=>({...control,label:redact(control.label),href:control.href?(()=>{try{const u=new URL(control.href,target.url());return u.origin+u.pathname}catch{return null}})():null}));
    await pool.query('INSERT INTO matchpilot_source_snapshots(snapshot_id,data) VALUES($1,$2) ON CONFLICT DO NOTHING',[runId+'-'+moduleName,JSON.stringify(moduleSnapshot)]);
    console.log('SOURCE_MAP_MODULE '+JSON.stringify({moduleName,...moduleSnapshot,text:moduleSnapshot.text.slice(0,14000)}));

    if(moduleName==='layscore'){
     for(const section of ['Guida','Dashboard','Palinsesto','Live','Analisi','Lay Goleada Favorito','Backtest Storico','Asian Odds','Monitorate','Ladder Dutching','Statistiche Lega','Archivio']){
      stage='layscore_section_'+section;
      const nav=target.getByRole('button',{name:section,exact:true});
      if(await nav.count()!==1){console.log('SOURCE_MAP_SECTION_SKIP '+JSON.stringify({section,reason:'navigation_ambiguous'}));continue;}
      await nav.click();
      await target.waitForTimeout(1500);
      const read=await target.evaluate(()=>{
       const visible=e=>!!(e.offsetWidth||e.offsetHeight||e.getClientRects().length);
       return {text:document.body.innerText,controls:[...document.querySelectorAll('a,button,[role="button"],[role="tab"]')].filter(visible).map(e=>({tag:e.tagName,label:(e.innerText||e.getAttribute('aria-label')||'').trim(),id:e.id})),inputs:[...document.querySelectorAll('input,select,textarea')].filter(visible).map(e=>({tag:e.tagName,type:e.type,id:e.id,min:e.getAttribute('min'),max:e.getAttribute('max'),step:e.getAttribute('step'),placeholder:e.getAttribute('placeholder'),options:e.tagName==='SELECT'?[...e.options].map(o=>o.textContent):undefined}))};
      });
      read.text=redact(read.text);
      read.controls=read.controls.map(o=>({...o,label:redact(o.label)}));
      await pool.query('INSERT INTO matchpilot_source_snapshots(snapshot_id,data) VALUES($1,$2) ON CONFLICT DO NOTHING',[runId+'-'+section,JSON.stringify(read)]);
      console.log('SOURCE_MAP_SECTION '+JSON.stringify({section,characters:read.text.length,controls:read.controls,inputs:read.inputs,text:read.text.slice(0,4500)}));
      if(section==='Guida'){
       for(let offset=0;offset<read.text.length;offset+=5000)console.log('SOURCE_MAP_GUIDE '+JSON.stringify({offset,text:read.text.slice(offset,offset+5000)}));
      }
      const legends=target.getByRole('button',{name:/legend|legenda/i});
      if(await legends.count()===1 && await legends.first().isVisible()){
       await legends.first().click();
       await target.waitForTimeout(400);
       const legendText=redact(await target.locator('body').innerText());
       await pool.query('INSERT INTO matchpilot_source_snapshots(snapshot_id,data) VALUES($1,$2) ON CONFLICT DO NOTHING',[runId+'-'+section+'-legend',JSON.stringify({text:legendText})]);
       console.log('SOURCE_MAP_LEGEND '+JSON.stringify({section,text:legendText.slice(-10000)}));
       await target.keyboard.press('Escape');
      }
     }
    }
    if(popup)await popup.close();
   }

  }
 }catch{
  result={status:'test_failed',stage};
 }finally{
  if(browser)await browser.close().catch(()=>{});
  await pool.query('UPDATE matchpilot_test_runs SET completed_at=now(),result=$2 WHERE run_id=$1',[runId,JSON.stringify(result)]);
  console.log('SOURCE_LOGIN_TEST '+JSON.stringify(result));
 }
}
