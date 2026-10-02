import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSnapshot, compareCatalog, parseRoiStrategies } from './source-parser.mjs';
test('new controls and fields do not break known controls or retain values', () => {
  const previous = parseSnapshot({ text: 'Dashboard', controls: [{tag:'button',id:'known',label:'Read'}], inputs: [] });
  const current = parseSnapshot({ text: 'Dashboard', controls: [{tag:'button',id:'known',label:'Read'}, {tag:'button',id:'new',label:'New'}], inputs: [{tag:'input',id:'password',type:'password',value:'secret'}], extra:'secret' });
  assert.equal(current.usable, true);
  assert.equal(current.controls[0].key, previous.controls[0].key);
  assert.equal(compareCatalog(previous,current).added.length,2);
  assert.equal(JSON.stringify(current).includes('secret'),false);
});
const roiFixture = 'SUGGERIMENTO OPERATIVO\tPARTITE\tWIN\tROI\tQUOTA\tAFFIDABILITÀ\n'+['Casa Punta','Casa Lay','Pareggio Punta','Pareggio Lay','Trasferta Punta','Trasferta Lay'].map(name=>[name,'52','38,5%','-21,7%',name.endsWith('Punta')?'> 2,68':'< 2,52','Media'].join('\t')).join('\n');
test('ROI extra rows tolerate expansion while essential missing rows block use',()=>{
  assert.equal(parseRoiStrategies(roiFixture+'\nNuova strategia\t52\t50%\t1%\t> 2\tMedia').usable,true);
  assert.equal(parseRoiStrategies(roiFixture.split('\n').slice(0,-1).join('\n')).usable,false);
  assert.equal(parseRoiStrategies(roiFixture).rows[0].roiPercent,-21.7);
});
test('ROI malformed amounts and wrong threshold direction cannot enter financial analysis',()=>{
  assert.equal(parseRoiStrategies(roiFixture.replace('> 2,68','< 2,68')).usable,false);
  assert.equal(parseRoiStrategies(roiFixture.replace('38,5%','150%')).usable,false);
  assert.equal(parseRoiStrategies(roiFixture.replace('-21,7%','NaN')).usable,false);
});
test('malformed optional data and missing essential controls remain explicit', () => {
  const result = parseSnapshot({text:'Page',controls:[null,5],inputs:{}},{required:['essential']});
  assert.equal(result.usable,false);
  assert.ok(result.issues.some(item=>item.code==='missing_required'));
  assert.doesNotThrow(()=>parseSnapshot(null));
});
test('formatting, ordering and duplicate controls do not cause catalog changes', () => {
  const a = {tag:'button',id:'a',label:' A  B '}; const b={tag:'button',id:'b',label:'Other'};
  const first=parseSnapshot({text:'Page',controls:[a,b],inputs:[]});
  const second=parseSnapshot({text:'Page',controls:[b,{...a,label:'A B'},a],inputs:[]});
  assert.equal(first.signature,second.signature);
  assert.deepEqual(compareCatalog(first,second),{added:[],removed:[]});
});
test('anonymous repeated quote fields stay distinct and row context survives reordering', () => {
  const field={tag:'input',type:'number'};
  const result=parseSnapshot({text:'Ladder',controls:[],inputs:[field,field]});
  assert.equal(result.inputs.length,2);
  assert.ok(result.issues.some(item=>item.code==='ambiguous_identity'));
  const a={...field,context:'0-0'},b={...field,context:'0-1'};
  const first=parseSnapshot({text:'Ladder',controls:[],inputs:[a,b]});
  const second=parseSnapshot({text:'Ladder',controls:[],inputs:[b,a]});
  assert.equal(first.signature,second.signature);
  assert.equal(first.inputs.length,2);
});
