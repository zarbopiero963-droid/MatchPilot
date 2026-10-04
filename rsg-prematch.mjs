const csvLine=s=>{const out=[];let cur='',q=false;for(let i=0;i<s.length;i++){const c=s[i];if(c==='"'){if(q&&s[i+1]==='"'){cur+='"';i++;}else q=!q;}else if(c===','&&!q){out.push(cur);cur='';}else cur+=c;}out.push(cur);return out;};
const num=v=>{const n=Number(String(v??'').replace(',','.'));return Number.isFinite(n)?n:null};
const norm=s=>String(s??'').normalize('NFKD').replace(/\p{Diacritic}/gu,'').toLowerCase();
const isRS=s=>/real sociedad b|real sociedad ii|real sociedad 2/.test(norm(s));
const isGR=s=>/^granada$|granada cf/.test(norm(s));
const dateVal=v=>{const s=String(v||'');const m=s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);if(m)return Date.UTC(+m[3],+m[2]-1,+m[1]);const y=s.match(/(\d{4})[\-\/](\d{1,2})[\-\/](\d{1,2})/);if(y)return Date.UTC(+y[1],+y[2]-1,+y[3]);return Date.parse(s)||0;};
const pct=(a,b)=>b?Math.round(a/b*1000)/10:null;
async function csv(url){const r=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('HTTP '+r.status);const t=await r.text(),ls=t.split(/\r?\n/).filter(Boolean),h=csvLine(ls.shift());return ls.map(line=>{const c=csvLine(line);return Object.fromEntries(h.map((x,i)=>[x,c[i]??'']));});}
function teamSummary(rows,pred){let w=0,d=0,l=0,gf=0,ga=0,o15=0,o25=0,o35=0,btts=0,sc=0,cl=0;for(const r of rows){const hg=num(r.Home_Score),ag=num(r.Away_Score);if(hg===null||ag===null)continue;const h=pred(r.Home),f=h?hg:ag,a=h?ag:hg;gf+=f;ga+=a;if(f>a)w++;else if(f===a)d++;else l++;const t=hg+ag;if(t>=2)o15++;if(t>=3)o25++;if(t>=4)o35++;if(hg>0&&ag>0)btts++;if(f>0)sc++;if(a===0)cl++;}const n=w+d+l;return{n,w,d,l,gf:n?+(gf/n).toFixed(2):null,ga:n?+(ga/n).toFixed(2):null,o15:pct(o15,n),o25:pct(o25,n),o35:pct(o35,n),btts:pct(btts,n),scored:pct(sc,n),clean:pct(cl,n)};}
const mean=a=>a.length?+(a.reduce((x,y)=>x+y,0)/a.length).toFixed(2):null;
function adv(rows,pred){const specs=[['xgFor','xG_Home_FT','xG_Away_FT'],['xgAgainst','xG_Away_FT','xG_Home_FT'],['xgotFor','xGOT_Home_FT','xGOT_Away_FT'],['xgotAgainst','xGOT_Away_FT','xGOT_Home_FT'],['shotsFor','Total_Shots_Home_FT','Total_Shots_Away_FT'],['shotsAgainst','Total_Shots_Away_FT','Total_Shots_Home_FT'],['sotFor','Shots_On_Target_Home_FT','Shots_On_Target_Away_FT'],['sotAgainst','Shots_On_Target_Away_FT','Shots_On_Target_Home_FT'],['bigFor','Big_Chances_Home_FT','Big_Chances_Away_FT'],['bigAgainst','Big_Chances_Away_FT','Big_Chances_Home_FT'],['cornersFor','Corners_Home_FT','Corners_Away_FT'],['cornersAgainst','Corners_Away_FT','Corners_Home_FT'],['poss','Possession_Home_FT','Possession_Away_FT'],['xA','xA_Home_FT','xA_Away_FT'],['touchesBox','Touches_Box_Home_FT','Touches_Box_Away_FT'],['finalThirdPct','Passes_Final_Third_Pct_Home_FT','Passes_Final_Third_Pct_Away_FT'],['clearances','Clearances_Home_FT','Clearances_Away_FT'],['interceptions','Interceptions_Home_FT','Interceptions_Away_FT']];
 const o={};for(const [name,hk,ak] of specs){const vals=[];for(const r of rows){const v=num(r[pred(r.Home)?hk:ak]);if(v!==null)vals.push(v);}if(vals.length)o[name]={avg:mean(vals),coverage:vals.length};}return o;}
function scoreDist(rows){const m={};for(const r of rows){const h=num(r.Home_Score),a=num(r.Away_Score);if(h===null||a===null)continue;const k=h+'-'+a;m[k]=(m[k]||0)+1;}const n=Object.values(m).reduce((x,y)=>x+y,0);return Object.entries(m).map(([score,c])=>({score,n:c,pct:pct(c,n)})).sort((a,b)=>b.n-a.n).slice(0,12);}
function poisson(lambda,mu){const fact=n=>n<2?1:Array.from({length:n},(_,i)=>i+1).reduce((a,b)=>a*b,1);let p1=0,px=0,p2=0,o15=0,o25=0,b=0;const cs=[];for(let h=0;h<=6;h++)for(let a=0;a<=6;a++){const p=Math.exp(-lambda)*lambda**h/fact(h)*Math.exp(-mu)*mu**a/fact(a);if(h>a)p1+=p;else if(h===a)px+=p;else p2+=p;if(h+a>=2)o15+=p;if(h+a>=3)o25+=p;if(h>0&&a>0)b+=p;cs.push({score:h+'-'+a,p});}cs.sort((x,y)=>y.p-x.p);return{lambdaHome:+lambda.toFixed(3),lambdaAway:+mu.toFixed(3),p1:+(p1*100).toFixed(1),px:+(px*100).toFixed(1),p2:+(p2*100).toFixed(1),o15:+(o15*100).toFixed(1),o25:+(o25*100).toFixed(1),btts:+(b*100).toFixed(1),scores:cs.slice(0,8).map(x=>({score:x.score,pct:+(x.p*100).toFixed(1)}))};}
export async function runSociedadGranadaPrematch(){
 const fk=process.env.FUTPYTHON_API_KEY?.trim(),tk=process.env.TOTALCORNER_API_TOKEN?.trim();if(!fk||!tk){console.log('RSG_PREMATCH missing_keys');return;}
 const variants=[['spain','segunda-division'],['spain','segunda'],['espanha','segunda-division'],['espanha','la-liga-2'],['spain','la-liga-2']];
 let all=[],used=null;
 for(const [country,league] of variants){let tmp=[];for(const y of ['2021','2022','2023','2024','2025','2026']){try{tmp.push(...await csv('https://futpythontrader.com.br/api/download/'+country+'/'+league+'/'+y+'?api_key='+encodeURIComponent(fk)));}catch{}}
  if(tmp.length>100){all=tmp;used={country,league};break;}}
 let daily=[];try{daily=await csv('https://futpythontrader.com.br/api/jogos-do-dia?date=2026-10-04&format=csv&api_key='+encodeURIComponent(fk));}catch{}
 const fixture=daily.find(r=>(isRS(r.Home)&&isGR(r.Away))||(isGR(r.Home)&&isRS(r.Away)))||{};
 const fin=all.filter(r=>num(r.Home_Score)!==null&&num(r.Away_Score)!==null).sort((a,b)=>dateVal(a.Date)-dateVal(b.Date));
 const rsAll=fin.filter(r=>isRS(r.Home)||isRS(r.Away)),grAll=fin.filter(r=>isGR(r.Home)||isGR(r.Away));
 const rsHome=fin.filter(r=>isRS(r.Home)),grAway=fin.filter(r=>isGR(r.Away));
 const h2h=fin.filter(r=>(isRS(r.Home)&&isGR(r.Away))||(isGR(r.Home)&&isRS(r.Away)));
 const targetOdds={o1:num(fixture.Odd_1_FT)||2.62,ox:num(fixture.Odd_X_FT)||3.29,o2:num(fixture.Odd_2_FT)||2.75};
 const similar=fin.filter(r=>{const a=num(r.Odd_1_FT),x=num(r.Odd_X_FT),b=num(r.Odd_2_FT);return a&&x&&b&&Math.abs(a-targetOdds.o1)<=0.30&&Math.abs(x-targetOdds.ox)<=0.45&&Math.abs(b-targetOdds.o2)<=0.45;});
 const rsH=rsHome.slice(-15), grA=grAway.slice(-15);
 const rsGF=teamSummary(rsH,isRS),grGA=teamSummary(grA,isGR);
 const lambdaHome=Math.max(.2,(rsGF.gf+(grGA.ga??rsGF.gf))/2),lambdaAway=Math.max(.2,(grGA.gf+(rsGF.ga??grGA.gf))/2);
 const model=poisson(lambdaHome,lambdaAway);
 const tcUrl=new URL('https://api.totalcorner.com/v1/match/view/201317399');tcUrl.searchParams.set('token',tk);tcUrl.searchParams.set('columns','odds,asian,cornerLine,goalLine,asianCorner');
 const tr=await fetch(tcUrl,{signal:AbortSignal.timeout(15000)});const tj=tr.ok?await tr.json():{};const tm=Array.isArray(tj?.data)?tj.data[0]:tj?.data||{};
 const odUrl=new URL('https://api.totalcorner.com/v1/match/odds/201317399');odUrl.searchParams.set('token',tk);odUrl.searchParams.set('columns','asianList,goalList,cornerList,oddsList,asianHalfList,goalHalfList,cornerHalfList,oddsHalfList');
 const or=await fetch(odUrl,{signal:AbortSignal.timeout(15000)});const oj=or.ok?await or.json():{};const od=Array.isArray(oj?.data)?oj.data[0]:oj?.data||oj;
 const safeOdds={pre1x2:tm.p_odds??null,opening1x2:tm.po_odds??null,preAsian:tm.p_asian??null,preGoal:tm.p_goal??null,preCorner:tm.p_corner??null,asianCorner:tm.asian_corner??null,oddsHistoryKeys:od&&typeof od==='object'?Object.keys(od):[],oddsHistory:od};
 const fixturePre=Object.fromEntries(Object.entries(fixture).filter(([k,v])=>String(v??'').trim()!=='' && !/score|result|min_goal|goal_count|shots|possession|corner|card|foul|offside|save|xg_home_ft|xg_away_ft|xgot_home_ft|xgot_away_ft/i.test(k)).slice(0,160));
 const result={futpython:{used,rows:fin.length,fixturePre,rsLast10:teamSummary(rsAll.slice(-10),isRS),grLast10:teamSummary(grAll.slice(-10),isGR),rsLast20:teamSummary(rsAll.slice(-20),isRS),grLast20:teamSummary(grAll.slice(-20),isGR),rsHome15:rsGF,grAway15:grGA,rsHome15Adv:adv(rsH,isRS),grAway15Adv:adv(grA,isGR),h2h:{n:h2h.length,summaryRS:teamSummary(h2h.slice(-15),isRS),scores:scoreDist(h2h.slice(-15))},similarOdds:{target:targetOdds,n:similar.length,summaryHome:teamSummary(similar,()=>true),scores:scoreDist(similar)}},model,totalcorner:safeOdds};
 console.log('RSG_PREMATCH '+JSON.stringify(result));
}