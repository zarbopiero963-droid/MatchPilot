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
  const runId='forensics-futpython-goat-v3-buc-junior';
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
    const colSeasons=['2021','2022','2023','2024','2025','2026'];
    for(const season of colSeasons){
      try{datasets.push(...await fetchCsv('colombia/primera-a/'+season,process.env.FUTPYTHON_API_KEY));}
      catch(e){console.log('FUTPYTHON_FORENSICS dataset_skip '+season+' '+String(e.message).replace(process.env.FUTPYTHON_API_KEY,'[REDACTED]'));}
    }
    const byKey=new Map(datasets.map(r=>[keyFor(r),r]));
    const num=v=>{const n=Number(String(v??'').replace(',','.'));return Number.isFinite(n)?n:null};
    const pct=(a,b)=>b?Math.round(a/b*1000)/10:null;
    const isBuc=s=>/bucaramanga/i.test(String(s||''));
    const isJun=s=>/junior/i.test(String(s||''));
    const finished=datasets.filter(r=>num(r.Home_Score)!==null&&num(r.Away_Score)!==null);
    const teamRows=(pred,n=9999)=>finished.filter(r=>pred(r.Home)||pred(r.Away)).slice(-n);
    const homeRows=finished.filter(r=>isBuc(r.Home));
    const awayRows=finished.filter(r=>isJun(r.Away));
    const h2h=finished.filter(r=>(isBuc(r.Home)&&isJun(r.Away))||(isJun(r.Home)&&isBuc(r.Away)));
    const sumGoals=rows=>rows.reduce((s,r)=>s+(num(r.Home_Score)||0)+(num(r.Away_Score)||0),0);
    const summarize=(rows,teamPred)=>{
      let w=0,d=0,l=0,gf=0,ga=0,o15=0,o25=0,btts=0,clean=0,scored=0;
      for(const r of rows){
        const hg=num(r.Home_Score)||0, ag=num(r.Away_Score)||0, home=teamPred(r.Home), tg=home?hg:ag, og=home?ag:hg;
        gf+=tg;ga+=og;if(tg>og)w++;else if(tg===og)d++;else l++;if(hg+ag>=2)o15++;if(hg+ag>=3)o25++;if(hg>0&&ag>0)btts++;if(og===0)clean++;if(tg>0)scored++;
      }
      return {n:rows.length,w,d,l,gfPer:rows.length?gf/rows.length:null,gaPer:rows.length?ga/rows.length:null,o15:pct(o15,rows.length),o25:pct(o25,rows.length),btts:pct(btts,rows.length),clean:pct(clean,rows.length),scored:pct(scored,rows.length)};
    };
    const recentB=teamRows(isBuc,20), recentJ=teamRows(isJun,20);
    const recentB10=recentB.slice(-10), recentJ10=recentJ.slice(-10);
    const home15=homeRows.slice(-15), away15=awayRows.slice(-15), h2h15=h2h.slice(-15);
    const target={o1:1.90,ox:3.35,o2:3.80};
    const similar=(rows,years)=>rows.filter(r=>{
      const y=Number(String(r.Date||'').match(/(20\d{2})/)?.[1]||0);if(years&&y<2027-years)return false;
      const a=num(r.Odd_1_FT),x=num(r.Odd_X_FT),b=num(r.Odd_2_FT);return a&&x&&b&&Math.abs(a-target.o1)<=0.25&&Math.abs(x-target.ox)<=0.45&&Math.abs(b-target.o2)<=0.80;
    });
    const scoreDist=rows=>{
      const m={};for(const r of rows){const k=(num(r.Home_Score)||0)+'-'+(num(r.Away_Score)||0);m[k]=(m[k]||0)+1;}
      return Object.entries(m).map(([score,n])=>({score,n,pct:pct(n,rows.length)})).sort((a,b)=>b.n-a.n).slice(0,12);
    };
    const minuteBins=rows=>{
      const bins={'0-15':0,'16-30':0,'31-45':0,'46-60':0,'61-75':0,'76-90':0};let total=0;
      for(const r of rows)for(const f of ['Min_Goals_Home','Min_Goals_Away'])for(const x of String(r[f]||'').split(/[,; ]+/)){const m=parseInt(x);if(!m||m>90)continue;total++;const k=m<=15?'0-15':m<=30?'16-30':m<=45?'31-45':m<=60?'46-60':m<=75?'61-75':'76-90';bins[k]++;}
      return {total,...Object.fromEntries(Object.entries(bins).map(([k,v])=>[k,pct(v,total)]))};
    };
    let daily=[];
    try{
      const url='https://futpythontrader.com.br/api/jogos-do-dia?date=2026-10-05&format=csv&api_key='+encodeURIComponent(process.env.FUTPYTHON_API_KEY);
      const rr=await fetch(url,{signal:AbortSignal.timeout(30000)});if(rr.ok){const t=await rr.text(),ls=t.split(/\r?\n/).filter(Boolean),h=csvLine(ls.shift());daily=ls.map(line=>Object.fromEntries(h.map((x,i)=>[x,csvLine(line)[i]??''])));}
    }catch{}
    const fixture=daily.find(r=>(isBuc(r.Home)&&isJun(r.Away))||(isJun(r.Home)&&isBuc(r.Away)))||datasets.find(r=>(isBuc(r.Home)&&isJun(r.Away))&&/2026/.test(String(r.Date||'')));
    const advancedKeys=['xG_Home_FT','xG_Away_FT','xGOT_Home_FT','xGOT_Away_FT','Total_Shots_Home_FT','Total_Shots_Away_FT','Shots_On_Target_Home_FT','Shots_On_Target_Away_FT','Big_Chances_Home_FT','Big_Chances_Away_FT','Possession_Home_FT','Possession_Away_FT','Corners_Home_FT','Corners_Away_FT','Over_FT_1_5','Under_FT_1_5','Over_FT_2_5','Under_FT_2_5','BTTS_Yes','BTTS_No','CS_0_0','CS_0_1','CS_1_0','CS_1_1'];
    const adv=fixture?Object.fromEntries(advancedKeys.filter(k=>String(fixture[k]??'').trim()!=='').map(k=>[k,fixture[k]])):{};
    const analytical={
      rows:finished.length,
      recentB10:summarize(recentB10,isBuc),recentJ10:summarize(recentJ10,isJun),
      recentB20:summarize(recentB,isBuc),recentJ20:summarize(recentJ,isJun),
      bucHome15:summarize(home15,isBuc),juniorAway15:summarize(away15,isJun),
      h2h15:{summary:summarize(h2h15,isBuc),goalsPer:h2h15.length?sumGoals(h2h15)/h2h15.length:null,scoreDist:scoreDist(h2h15)},
      similar1y:{n:similar(finished,1).length,scoreDist:scoreDist(similar(finished,1)),minutes:minuteBins(similar(finished,1))},
      similar3y:{n:similar(finished,3).length,scoreDist:scoreDist(similar(finished,3)),minutes:minuteBins(similar(finished,3))},
      similar6y:{n:similar(finished,6).length,scoreDist:scoreDist(similar(finished,6)),minutes:minuteBins(similar(finished,6))},
      fixtureAdvanced:adv,
      fixtureCore:fixture?Object.fromEntries(['Date','Time','Home','Away','Odd_1_FT','Odd_X_FT','Odd_2_FT','Bookie_1X2_FT','League','Season'].map(k=>[k,fixture[k]??''])):{}
    };
    const relevant=['Date','Home','Away','Home_Score','Away_Score','Min_Goals_Home','Min_Goals_Away','Odd_1_FT','Odd_X_FT','Odd_2_FT'];
    const exact=[];
    for(const g of goat.sample){
      const f=byKey.get(keyFor(g)); if(!f)continue;
      exact.push({key:keyFor(g),fieldMatches:Object.fromEntries(relevant.map(k=>[k,String(g[k]??'')===String(f[k]??'')])),goat:Object.fromEntries(relevant.map(k=>[k,g[k]??''])),fut:Object.fromEntries(relevant.map(k=>[k,f[k]??'']))});
    }
    const result={
      status:'complete',
      analytical,
      keyPresent:true,
      goat:{bytes:goat.bytes,header:goat.header,sampleCount:goat.sample.length,sampleHash:hash(JSON.stringify(goat.sample)),firstDate:goat.firstDate,lastSampleDate:goat.lastSampleDate},
      futpython:{datasetRows:datasets.length,seasons:colSeasons},
      directMatches:exact.length,
      exactRows:exact.slice(0,20)
    };
    await pool.query('UPDATE matchpilot_test_runs SET completed_at=now(),result=$2 WHERE run_id=$1',[runId,JSON.stringify(result)]);
    console.log('FUTPYTHON_FORENSICS '+JSON.stringify({status:result.status,keyPresent:true,futRows:datasets.length,analytical,directMatches:exact.length}));
  }catch(e){
    if(browser)await browser.close().catch(()=>{});
    const result={status:'failed',keyPresent:Boolean(process.env.FUTPYTHON_API_KEY),errorType:e.name,message:String(e.message).replace(process.env.FUTPYTHON_API_KEY||'','[REDACTED]').slice(0,500)};
    await pool.query('UPDATE matchpilot_test_runs SET completed_at=now(),result=$2 WHERE run_id=$1',[runId,JSON.stringify(result)]);
    console.log('FUTPYTHON_FORENSICS failed '+JSON.stringify({errorType:e.name}));
  }
}
