const normalize=s=>String(s??'').normalize('NFKC').replace(/−/g,'-');
const amount=s=>{
 if(!/^[+-]?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d+)?$/.test(s??''))return null;
 const n=Number(s.replace(/\./g,'').replace(',','.'));
 return Number.isFinite(n)?n:null;
};
export function parseBacktestPerformance(text,{side,odds,stake,commissionPercent}={}){
 const issues=[];
 const validOptions=['BACK','LAY'].includes(side)&&Number.isFinite(odds)&&odds>1&&Number.isFinite(stake)&&stake>0&&Number.isFinite(commissionPercent)&&commissionPercent>=0&&commissionPercent<=100;
 if(!validOptions)return {usable:false,issues:[{code:'invalid_financial_context'}]};
 const source=normalize(text).slice(normalize(text).lastIndexOf('La resa della mia strategia'));
 const n=source.match(/OPERAZIONI\s*(\d+)/i);
 const wl=source.match(/(\d+) vinte\s*·\s*(\d+) perse/i);
 const p=source.match(/PROFITTO TOTALE\s*([+-]?\d[\d.,]*)\s*€/i);
 const roi=source.match(/ROI SUL RISCHIO\s*([+-]?\d[\d.,]*)%/i);
 const risk=source.match(/su\s*([+-]?\d[\d.,]*)\s*€ puntati/i);
 const dd=source.match(/DRAWDOWN MASSIMO\s*([+-]?\d[\d.,]*)\s*€/i);
 if(!n||!wl||!p||!roi||!risk||!dd)return {usable:false,issues:[{code:'missing_performance_fields'}]};
 const sample=Number(n[1]),wins=Number(wl[1]),losses=Number(wl[2]);
 const profit=amount(p[1]),roiPercent=amount(roi[1]),riskTotal=amount(risk[1]),drawdown=amount(dd[1]);
 if(!Number.isSafeInteger(sample)||sample<1||wins+losses!==sample)issues.push({code:'invalid_operation_counts'});
 if([profit,roiPercent,riskTotal,drawdown].some(v=>v===null))issues.push({code:'invalid_financial_amount'});
 const expectedProfit=side==='BACK'?wins*stake*(odds-1)*(1-commissionPercent/100)-losses*stake:wins*stake*(1-commissionPercent/100)-losses*stake*(odds-1);
 const expectedRisk=sample*stake*(side==='BACK'?1:odds-1);
 const expectedRoiPercent=expectedProfit/expectedRisk*100;
 if(profit!==null&&Math.abs(profit-expectedProfit)>0.011)issues.push({code:'net_profit_mismatch'});
 if(riskTotal!==null&&Math.abs(riskTotal-expectedRisk)>0.011)issues.push({code:'risk_total_mismatch'});
 if(roiPercent!==null&&Math.abs(roiPercent-expectedRoiPercent)>0.051)issues.push({code:'roi_mismatch'});
 if(drawdown!==null&&(drawdown>0||drawdown < -expectedRisk-0.011))issues.push({code:'invalid_drawdown'});
 return {usable:issues.length===0,issues,sample,wins,losses,profit,roiPercent,riskTotal,drawdown,context:{side,odds,stake,commissionPercent},expected:{profit:expectedProfit,riskTotal:expectedRisk,roiPercent:expectedRoiPercent},assumption:'Same quoted odds on every historical operation; drawdown sequence not independently reconstructed'};
}
