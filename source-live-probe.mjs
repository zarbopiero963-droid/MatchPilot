import { chromium } from 'playwright';
const safe=u=>{try{const x=new URL(u);return x.origin+x.pathname}catch{return ''}};
export async function runLiveSourceProbe(){
 if(!process.env.GOAT_USERNAME||!process.env.GOAT_PASSWORD)return;
 let browser;
 try{
  browser=await chromium.launch({headless:true});
  const ctx=await browser.newContext({viewport:{width:1440,height:1000}});
  const seen=new Map();
  ctx.on('request',req=>{const u=safe(req.url()); if(!u)return; const k=req.resourceType()+' '+u;seen.set(k,(seen.get(k)||0)+1);});
  const portal=await ctx.newPage();
  await portal.goto('https://goatbettingexchange.com/portale',{waitUntil:'domcontentloaded',timeout:30000});
  await portal.locator('#heroEmail').fill(process.env.GOAT_USERNAME);
  await portal.locator('#heroPass').fill(process.env.GOAT_PASSWORD);
  await portal.getByRole('button',{name:'Accedi',exact:true}).click();
  await portal.locator('#heroEmail').waitFor({state:'hidden',timeout:60000});
  const pp=portal.waitForEvent('popup',{timeout:15000});
  await portal.getByRole('button',{name:'Apri →',exact:true}).nth(1).click();
  const page=await pp; await page.waitForLoadState('domcontentloaded',{timeout:30000});
  await page.waitForTimeout(2500);
  if(await page.locator('#loginEmail').isVisible()){
   await page.locator('#loginEmail').fill(process.env.GOAT_USERNAME);
   await page.locator('#loginPassword').fill(process.env.GOAT_PASSWORD);
   await page.locator('#loginSubmitBtn').click();
   await page.locator('#loginEmail').waitFor({state:'hidden',timeout:60000});
  }
  const live=page.getByRole('button',{name:'Live',exact:true}).filter({visible:true});
  if(await live.count())await live.first().click();
  await page.waitForTimeout(12000);
  const text=(await page.locator('body').innerText()).slice(0,3000);
  const events=[...seen.entries()].map(([k,count])=>({request:k,count})).filter(x=>!x.request.includes('fonts.googleapis.com')&&!x.request.includes('fonts.gstatic.com'));
  console.log('LIVE_SOURCE_PROBE '+JSON.stringify({events,text:text.replace(/[^\s]+@[^\s]+/g,'[EMAIL]')}));
 }finally{if(browser)await browser.close().catch(()=>{});}
}