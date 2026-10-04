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
 const dateVal=v=>{const s=String(v||'');const m=s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);if(m)return Date.UTC(+m[3],+m[2]-1,+m[1]);const y=s.match(/(\d{4})[\-\/](\d{1,2})[\-\/](\d{1,2})/);if(y)return Date.UTC(+y[1],+y[2]-1,+y[3]);return Date.parse(s)||0;};
 const chronological=fin.slice().sort((a,b)=>dateVal(a.Date)-dateVal(b.Date));
 const bAll=chronological.filter(r=>isB(r.Home)||isB(r.Away)),jAll=chronological.filter(r=>isJ(r.Home)||isJ(r.Away));
 const bHome=chronological.filter(r=>isB(r.Home)),jAway=chronological.filter(r=>isJ(r.Away));
 const h2h=chronological.filter(r=>(isB(r.Home)&&isJ(r.Away))||(isJ(r.Home)&&isB(r.Away)));
 const target={o1:1.90,ox:3.35,o2:3.80};
 const sim=(yrs)=>fin.filter(r=>{const y=Number(String(r.Season||r.Date).match(/20\d{2}/)?.[0]||0);if(yrs&&y<2027-yrs)return false;const a=num(r.Odd_1_FT),x=num(r.Odd_X_FT),b=num(r.Odd_2_FT);return a&&x&&b&&Math.abs(a-target.o1)<=0.25&&Math.abs(x-target.ox)<=0.45&&Math.abs(b-target.o2)<=0.80;});
 let daily=[];try{daily=await csv('https://futpythontrader.com.br/api/jogos-do-dia?date=2026-10-05&format=csv&api_key='+encodeURIComponent(key));}catch{}
 const fx=daily.find(r=>(isB(r.Home)&&isJ(r.Away))||(isJ(r.Home)&&isB(r.Away)))||{};
 const advKeys=Object.keys(fx).filter(k=>/^(xG|xGOT|xA|Possession|Total_Shots|Shots_On_Target|Shots_Off_Target|Big_Chances|Corners|Over_|Under_|BTTS_|CS_|Bookie_)/.test(k)&&String(fx[k]??'').trim()!=='');
 const avg=(rows,key)=>{const v=rows.map(r=>num(r[key])).filter(x=>x!==null);return v.length?Math.round(v.reduce((a,b)=>a+b,0)/v.length*100)/100:null};
 const advHist=(rows)=>Object.fromEntries(['xG_Home_FT','xG_Away_FT','xGOT_Home_FT','xGOT_Away_FT','Total_Shots_Home_FT','Total_Shots_Away_FT','Shots_On_Target_Home_FT','Shots_On_Target_Away_FT','Big_Chances_Home_FT','Big_Chances_Away_FT','Corners_Home_FT','Corners_Away_FT','Possession_Home_FT','Possession_Away_FT'].map(k=>[k,avg(rows,k)]).filter(([,v])=>v!==null));
 const teamAdv=(rows,pred)=>{
   const keys=['xG_Home_FT','xG_Away_FT','xGOT_Home_FT','xGOT_Away_FT','Total_Shots_Home_FT','Total_Shots_Away_FT','Shots_On_Target_Home_FT','Shots_On_Target_Away_FT','Big_Chances_Home_FT','Big_Chances_Away_FT','Corners_Home_FT','Corners_Away_FT','Possession_Home_FT','Possession_Away_FT'];
   const acc={n:0,xgFor:[],xgAgainst:[],xgotFor:[],xgotAgainst:[],shotsFor:[],shotsAgainst:[],sotFor:[],sotAgainst:[],bigFor:[],bigAgainst:[],cornersFor:[],cornersAgainst:[],poss:[]};
   for(const r of rows){
     const home=pred(r.Home);acc.n++;
     const get=(h,a)=>num(r[home?h:a]);
     for(const [name,h,a] of [
       ['xgFor','xG_Home_FT','xG_Away_FT'],['xgAgainst','xG_Away_FT','xG_Home_FT'],
       ['xgotFor','xGOT_Home_FT','xGOT_Away_FT'],['xgotAgainst','xGOT_Away_FT','xGOT_Home_FT'],
       ['shotsFor','Total_Shots_Home_FT','Total_Shots_Away_FT'],['shotsAgainst','Total_Shots_Away_FT','Total_Shots_Home_FT'],
       ['sotFor','Shots_On_Target_Home_FT','Shots_On_Target_Away_FT'],['sotAgainst','Shots_On_Target_Away_FT','Shots_On_Target_Home_FT'],
       ['bigFor','Big_Chances_Home_FT','Big_Chances_Away_FT'],['bigAgainst','Big_Chances_Away_FT','Big_Chances_Home_FT'],
       ['cornersFor','Corners_Home_FT','Corners_Away_FT'],['cornersAgainst','Corners_Away_FT','Corners_Home_FT'],
       ['poss','Possession_Home_FT','Possession_Away_FT']
     ]){const v=get(h,a);if(v!==null)acc[name].push(v);}
   }
   const mean=a=>a.length?Math.round(a.reduce((x,y)=>x+y,0)/a.length*100)/100:null;
   return Object.fromEntries(Object.entries(acc).map(([k,v])=>[k,Array.isArray(v)?mean(v):v]));
 };

 const deepMetrics=(rows,pred)=>{
   const specs={
     creation:[
       ['xA','xA_Home_FT','xA_Away_FT'],['passesPct','Passes_Pct_Home_FT','Passes_Pct_Away_FT'],
       ['longPassesPct','Long_Passes_Pct_Home_FT','Long_Passes_Pct_Away_FT'],['finalThirdPassesPct','Passes_Final_Third_Pct_Home_FT','Passes_Final_Third_Pct_Away_FT'],
       ['throughPasses','Through_Passes_Home_FT','Through_Passes_Away_FT'],['crossesPct','Crosses_Pct_Home_FT','Crosses_Pct_Away_FT'],
       ['touchesBox','Touches_Box_Home_FT','Touches_Box_Away_FT']
     ],
     shooting:[
       ['shotsOff','Shots_Off_Target_Home_FT','Shots_Off_Target_Away_FT'],['blocked','Blocked_Shots_Home_FT','Blocked_Shots_Away_FT'],
       ['insideBox','Shots_Inside_Box_Home_FT','Shots_Inside_Box_Away_FT'],['outsideBox','Shots_Outside_Box_Home_FT','Shots_Outside_Box_Away_FT'],
       ['woodwork','Hit_Woodwork_Home_FT','Hit_Woodwork_Away_FT']
     ],
     discipline:[
       ['freeKicks','Free_Kicks_Home_FT','Free_Kicks_Away_FT'],['throwIns','Throw_Ins_Home_FT','Throw_Ins_Away_FT'],
       ['fouls','Fouls_Home_FT','Fouls_Away_FT'],['yellow','Yellow_Cards_Home_FT','Yellow_Cards_Away_FT'],
       ['red','Red_Cards_Home_FT','Red_Cards_Away_FT'],['offsides','Offsides_Home_FT','Offsides_Away_FT']
     ],
     defense:[
       ['saves','Goalkeeper_Saves_Home_FT','Goalkeeper_Saves_Away_FT'],['tacklesPct','Tackles_Pct_Home_FT','Tackles_Pct_Away_FT'],
       ['duelsWon','Duels_Won_Home_FT','Duels_Won_Away_FT'],['clearances','Clearances_Home_FT','Clearances_Away_FT'],
       ['interceptions','Interceptions_Home_FT','Interceptions_Away_FT'],['errorsShot','Errors_Shot_Home_FT','Errors_Shot_Away_FT'],
       ['errorsGoal','Errors_Goal_Home_FT','Errors_Goal_Away_FT'],['goalsPrevented','Goals_Prevented_Home_FT','Goals_Prevented_Away_FT']
     ],
     ht:[
       ['xG','xG_Home_HT','xG_Away_HT'],['xGOT','xGOT_Home_HT','xGOT_Away_HT'],['xA','xA_Home_HT','xA_Away_HT'],
       ['possession','Possession_Home_HT','Possession_Away_HT'],['shots','Total_Shots_Home_HT','Total_Shots_Away_HT'],
       ['sot','Shots_On_Target_Home_HT','Shots_On_Target_Away_HT'],['shotsOff','Shots_Off_Target_Home_HT','Shots_Off_Target_Away_HT'],
       ['big','Big_Chances_Home_HT','Big_Chances_Away_HT'],['corners','Corners_Home_HT','Corners_Away_HT'],
       ['yellow','Yellow_Cards_Home_HT','Yellow_Cards_Away_HT'],['fouls','Fouls_Home_HT','Fouls_Away_HT'],
       ['offsides','Offsides_Home_HT','Offsides_Away_HT'],['saves','Goalkeeper_Saves_Home_HT','Goalkeeper_Saves_Away_HT']
     ],
     secondHalf:[
       ['xG','xG_Home_2T','xG_Away_2T'],['xGOT','xGOT_Home_2T','xGOT_Away_2T'],['xA','xA_Home_2T','xA_Away_2T'],
       ['possession','Possession_Home_2T','Possession_Away_2T'],['shots','Total_Shots_Home_2T','Total_Shots_Away_2T'],
       ['sot','Shots_On_Target_Home_2T','Shots_On_Target_Away_2T'],['shotsOff','Shots_Off_Target_Home_2T','Shots_Off_Target_Away_2T'],
       ['big','Big_Chances_Home_2T','Big_Chances_Away_2T'],['corners','Corners_Home_2T','Corners_Away_2T'],
       ['yellow','Yellow_Cards_Home_2T','Yellow_Cards_Away_2T'],['red','Red_Cards_Home_2T','Red_Cards_Away_2T'],
       ['fouls','Fouls_Home_2T','Fouls_Away_2T'],['offsides','Offsides_Home_2T','Offsides_Away_2T'],['saves','Goalkeeper_Saves_Home_2T','Goalkeeper_Saves_Away_2T']
     ]
   };
   const mean=a=>a.length?Math.round(a.reduce((x,y)=>x+y,0)/a.length*100)/100:null;
   const out={};
   for(const [group,items] of Object.entries(specs)){
     const g={};
     for(const [name,hk,ak] of items){
       const vals=[];
       for(const row of rows){const home=pred(row.Home);const v=num(row[home?hk:ak]);if(v!==null)vals.push(v);}
       if(vals.length)g[name]={avg:mean(vals),coverage:vals.length};
     }
     if(Object.keys(g).length)out[group]=g;
   }
   return out;
 };
 const marketCoverage=(rows)=>{
   const keys=['Odd_1_HT','Odd_X_HT','Odd_2_HT','Over_HT_0_5','Under_HT_0_5','Over_HT_1_5','Under_HT_1_5','Over_HT_2_5','Under_HT_2_5',
     'Over_FT_0_5','Under_FT_0_5','Over_FT_1_5','Under_FT_1_5','Over_FT_2_5','Under_FT_2_5','Over_FT_3_5','Under_FT_3_5','Over_FT_4_5','Under_FT_4_5',
     'BTTS_Yes','BTTS_No','DC_1X','DC_12','DC_X2','CS_0_0','CS_0_1','CS_0_2','CS_0_3','CS_1_0','CS_1_1','CS_1_2','CS_1_3','CS_2_0','CS_2_1','CS_2_2','CS_2_3','CS_3_0','CS_3_1','CS_3_2','CS_3_3'];
   const out={};for(const k of keys){const vals=rows.map(r=>num(r[k])).filter(v=>v!==null);if(vals.length)out[k]={avg:Math.round(vals.reduce((a,b)=>a+b,0)/vals.length*100)/100,coverage:vals.length};}
   return out;
 };

 const result={
  rows:fin.length,
  b10:sum(bAll.slice(-10),isB),j10:sum(jAll.slice(-10),isJ),b10Advanced:teamAdv(bAll.slice(-10),isB),j10Advanced:teamAdv(jAll.slice(-10),isJ),
  b20:sum(bAll.slice(-20),isB),j20:sum(jAll.slice(-20),isJ),
  bHome15:sum(bHome.slice(-15),isB),jAway15:sum(jAway.slice(-15),isJ),bHome15Advanced:teamAdv(bHome.slice(-15),isB),jAway15Advanced:teamAdv(jAway.slice(-15),isJ),bHome15Deep:deepMetrics(bHome.slice(-15),isB),jAway15Deep:deepMetrics(jAway.slice(-15),isJ),b20Deep:deepMetrics(bAll.slice(-20),isB),j20Deep:deepMetrics(jAll.slice(-20),isJ),h2h15Advanced:{buc:teamAdv(h2h.slice(-15),isB),junior:teamAdv(h2h.slice(-15),isJ)},h2h15Deep:{buc:deepMetrics(h2h.slice(-15),isB),junior:deepMetrics(h2h.slice(-15),isJ)},
  h2h15:{summary:sum(h2h.slice(-15),isB),scores:scores(h2h.slice(-15)),minutes:mins(h2h.slice(-15))},
  sim1:{n:sim(1).length,scores:scores(sim(1)),minutes:mins(sim(1))},
  sim3:{n:sim(3).length,scores:scores(sim(3)),minutes:mins(sim(3))},
  sim6:{n:sim(6).length,scores:scores(sim(6)),minutes:mins(sim(6)),marketCoverage:marketCoverage(sim(6))},
  fixture:{core:Object.fromEntries(['Date','Time','Home','Away','League','Season','Bookie_1X2_FT','Odd_1_FT','Odd_X_FT','Odd_2_FT'].map(k=>[k,fx[k]??''])),advanced:Object.fromEntries(advKeys.map(k=>[k,fx[k]]))}
 };
 console.log('BUC_JUN_ANALYSIS_V3 '+JSON.stringify(result));
}
