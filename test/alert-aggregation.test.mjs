import test from 'node:test';
import assert from 'node:assert/strict';

test('alert aggregation policy distinguishes initial 404 from regression',()=>{
  const classify=(status,previouslySucceeded)=>{
    if(status===404 && !previouslySucceeded) return 'unavailable';
    if(status===404 && previouslySucceeded) return 'regression';
    return 'failure';
  };
  assert.equal(classify(404,false),'unavailable');
  assert.equal(classify(404,true),'regression');
  assert.equal(classify(500,false),'failure');
});
