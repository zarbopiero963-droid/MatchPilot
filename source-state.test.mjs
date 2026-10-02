import test from 'node:test';
import assert from 'node:assert/strict';
import {validateView} from './source-state.mjs';
test('requested tab merely present in page does not certify selection',()=>{
 assert.equal(validateView({text:'STATS CONSIGLIO',activeTabs:['CONSIGLIO']},{expectedTab:'STATS'}).readyForAnalysis,false);
 assert.equal(validateView({text:'Statistics',authVisible:false,loading:false,activeTabs:[' STATS  + ']},{expectedTab:'STATS +'}).readyForAnalysis,true);
});
test('authenticated loading page is unsuitable for AI analysis',()=>{
 assert.equal(validateView({text:'Calcolo analisi in corso',loading:true}).readyForAnalysis,false);
 assert.equal(validateView({text:'Login',authVisible:true}).readyForAnalysis,false);
 assert.equal(validateView(null).readyForAnalysis,false);
});
test('new optional controls do not invalidate known ready view',()=>{
 assert.deepEqual(validateView({text:'data',authVisible:false,loading:false,activeTabs:['STATS','NEW'],unknown:{button:true}},{expectedTab:'STATS'}),{readyForAnalysis:true,issues:[]});
});
test('legacy snapshots without observed authentication and loading state cannot certify readiness',()=>{
 assert.equal(validateView({text:'data',activeTabs:['STATS']},{expectedTab:'STATS'}).readyForAnalysis,false);
});
