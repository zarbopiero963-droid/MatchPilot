import { chromium } from 'playwright';
export async function testSourceLogin(pool){
 const runId='source-login-2026-10-02-v1';
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
 }catch{
  result={status:'test_failed',stage};
 }finally{
  if(browser)await browser.close().catch(()=>{});
  await pool.query('UPDATE matchpilot_test_runs SET completed_at=now(),result=$2 WHERE run_id=$1',[runId,JSON.stringify(result)]);
  console.log('SOURCE_LOGIN_TEST '+JSON.stringify(result));
 }
}
