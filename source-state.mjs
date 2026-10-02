const normalized=value=>String(value??'').normalize('NFKC').replace(/\s+/gu,' ').trim();
export function validateView(raw,{expectedTab}={}){
 const issues=[];
 if(typeof raw?.authVisible!=='boolean'||typeof raw?.loading!=='boolean')issues.push({code:'unverified_view_state'});
 if(raw?.authVisible)issues.push({code:'authentication_required'});
 if(!normalized(raw?.text))issues.push({code:'empty_page'});
 if(raw?.loading)issues.push({code:'data_pending'});
 if(expectedTab&&(!Array.isArray(raw?.activeTabs)||!raw.activeTabs.some(t=>normalized(t)===normalized(expectedTab))))issues.push({code:'wrong_active_tab',expected:expectedTab});
 return {readyForAnalysis:issues.length===0,issues};
}
