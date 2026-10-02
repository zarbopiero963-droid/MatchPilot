import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSnapshot, compareCatalog } from './source-parser.mjs';
test('new controls and fields do not break known controls or retain values', () => {
  const previous = parseSnapshot({ text: 'Dashboard', controls: [{tag:'button',id:'known',label:'Read'}], inputs: [] });
  const current = parseSnapshot({ text: 'Dashboard', controls: [{tag:'button',id:'known',label:'Read'}, {tag:'button',id:'new',label:'New'}], inputs: [{tag:'input',id:'password',type:'password',value:'secret'}], extra:'secret' });
  assert.equal(current.usable, true);
  assert.equal(current.controls[0].key, previous.controls[0].key);
  assert.equal(compareCatalog(previous,current).added.length,2);
  assert.equal(JSON.stringify(current).includes('secret'),false);
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
