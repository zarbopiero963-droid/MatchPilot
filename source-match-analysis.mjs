const csvLine=s=>{const out=[];let cur='',q=false;for(let i=0;i<s.length;i++){const c=s[i];if(c==='"'){if(q&&s[i+1]==='"'){cur+='"';i++;}else q=!q;}else if(c===','&&!q){out.push(cur);cur='';}else cur+=c;}out.push(cur);return out;};
const num=v=>{const n=Number(String(v??'').replace(',','.'));return Number.isFinite(n)?n:null};
const norm=s=>String(s??'').normalize('NFKD').replace(/\p{Diacritic}/gu,'').toLowerCase();
const isB=s=>/bucaramanga/.test(norm(s)), isJ=s=>/junior/.test(norm(s));
const pct=(a,b)=>b?Math.round(a/b*1000)/10:null;
async function csv(url){const r=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('HTTP '+r.status);const t=await r.text(),ls=t.split(/\r?\n/).filter(Boolean),h=csvLine(ls.shift());return ls.map(line=>{const c=csvLine(line);return Object.fromEntries(h.map((x,i)=>[x,c[i]??'']));});}
function sum(rows,pred){let w=0,d=0,l=0,gf=0,ga=0,o15=0,o25=0,b=0,sc=0,cl=0;for(const r of rows){const hg=num(r.Home_Score),ag=num(r.Away_Score);if(hg===null||ag===null)continue;const h=pred(r.Home),tg=h?hg:ag,og=h?ag:hg;gf+=tg;ga+=og;if(tg>og)w++;else if(tg===og)d++;else l++;if(hg+ag>=2)o15++;if(hg+ag>=3)o25++;if(hg>0&&ag>0)b++;if(tg>0)sc++;if(og===0)cl++;}const n=w+d+l;return{n,w,d,l,gf:n?Math.round(gf/n*100)/100:null,ga:n?Math.round(ga/n*100)/100:null,o15:pct(o15,n),o25:pct(o25,n),btts:pct(b,n),scored:pct(sc,n),clean:pct(cl,n)};}
function scores(rows){const m={};for(const r of rows){const h=num(r.Home_Score),a=num(r.Away_Score);if(h===null||a===null)continue;const k=h+'-'+a;m[k]=(m[k]||0)+1;}const n=Object.values(m).reduce((a,b)=>a+b,0);return Object.entries(m).map(([score,c])=>({score,n:c,pct:pct(c,n)})).sort((a,b)=>b.n-a.n).slice(0,10);}
function mins(rows){const b={'0-15':0,'16-30':0,'31-45':0,'46-60':0,'61-75':0,'76-90':0};let n=0;for(const r of rows)for(const k of ['Min_Goals_Home','Min_Goals_Away'])for(const x of String(r[k]||'').split(/[,; ]+/)){const m=parseInt(x);if(!m||m>90)continue;n++;const z=m<=15?'0-15':m<=30?'16-30':m<=45?'31-45':m<=60?'46-60':m<=75?'61-75':'76-90';b[z]++;}return{goals:n,...Object.fromEntries(Object.entries(b).map(([k,v])=>[k,pct(v,n)]))};}
export async function runBucJuniorAnalysis(){
 const key=process.env.FUTPYTHON_API_KEY;if(!key)return;
 let all=[];for(const y of ['2021','2022','2023','2024','2025','2026'])try{all.push(...await csv('https://futpythontrader.com.br/api/download/colombia/primera-a/'+y+'?api_key='+encodeURIComponent(key)));}catch(e){console.log('BUC_JUN_SKIP '+y+' '+e.message);}
 const fin=all.filter(r=>num(r.Home_Score)!==null&&num(r.Away_Score)!==null);
 const chronological=fin.slice().sort((a,b)=>String(a.Date).localeCompare(String(b.Date)));
 const bAll=chronological.filter(r=>isB(r.Home)||isB(r.Away)),jAll=chronological.filter(r=>isJ(r.Home)||isJ(r.Away));
 const bHome=chronological.filter(r=>isB(r.Home)),jAway=chronological.filter(r=>isJ(r.Away));
 const h2h=chronological.filter(r=>(isB(r.Home)&&isJ(r.Away))||(isJ(r.Home)&&isB(r.Away)));
 const target={o1:1.90,ox:3.35,o2:3.80};
 const sim=(yrs)=>fin.filter(r=>{const y=Number(String(r.Season||r.Date).match(/20\d{2}/)?.[0]||0);if(yrs&&y<2027-yrs)return false;const a=num(r.Odd_1_FT),x=num(r.Odd_X_FT),b=num(r.Odd_2_FT);return a&&x&&b&&Math.abs(a-target.o1)<=0.25&&Math.abs(x-target.ox)<=0.45&&Math.abs(b-target.o2)<=0.80;});
 let daily=[];try{daily=await csv('https://futpythontrader.com.br/api/jogos-do-dia?date=2026-10-05&format=csv&api_key='+encodeURIComponent(key));}catch{}
 const fx=daily.find(r=>(isB(r.Home)&&isJ(r.Away))||(isJ(r.Home)&&isB(r.Away)))||{};
 const advKeys=Object.keys(fx).filter(k=>/^(xG|xGOT|xA|Possession|Total_Shots|Shots_On_Target|Shots_Off_Target|Big_Chances|Corners|Over_|Under_|BTTS_|CS_|Bookie_)/.test(k)&&String(fx[k]??'').trim()!=='');
 const result={
  rows:fin.length,
  b10:sum(bAll.slice(-10),isB),j10:sum(jAll.slice(-10),isJ),
  b20:sum(bAll.slice(-20),isB),j20:sum(jAll.slice(-20),isJ),
  bHome15:sum(bHome.slice(-15),isB),jAway15:sum(jAway.slice(-15),isJ),
  h2h15:{summary:sum(h2h.slice(-15),isB),scores:scores(h2h.slice(-15)),minutes:mins(h2h.slice(-15))},
  sim1:{n:sim(1).length,scores:scores(sim(1)),minutes:mins(sim(1))},
  sim3:{n:sim(3).length,scores:scores(sim(3)),minutes:mins(sim(3))},
  sim6:{n:sim(6).length,scores:scores(sim(6)),minutes:mins(sim(6))},
  fixture:{core:Object.fromEntries(['Date','Time','Home','Away','League','Season','Bookie_1X2_FT','Odd_1_FT','Odd_X_FT','Odd_2_FT'].map(k=>[k,fx[k]??''])),advanced:Object.fromEntries(advKeys.map(k=>[k,fx[k]]))}
 };
 console.log('BUC_JUN_ANALYSIS '+JSON.stringify(result));
}
