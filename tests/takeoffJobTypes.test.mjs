import test from 'node:test';
import assert from 'node:assert/strict';
import {TAKEOFF_JOB_TYPES,jobTypeFor,validateJobType} from '../src/takeoffJobTypes.mjs';
test('every UI job type derives a specific safe drawing mode',()=>{
 assert.ok(TAKEOFF_JOB_TYPES.length>=10);
 const ids=new Set();
 for(const job of TAKEOFF_JOB_TYPES){
  assert.equal(ids.has(job.id),false,'Duplicate job id '+job.id);ids.add(job.id);
  assert.ok(['comparison','new-build'].includes(job.mode));
  assert.equal(validateJobType(job.id,job.mode).ok,true);
  assert.equal(validateJobType(job.id,job.mode==='new-build'?'comparison':'new-build').ok,false);
 }
});
test('loft, extension, conversion, refurbishment and demolition require existing-plan comparison',()=>{
 for(const id of ['single-extension','double-extension','loft-conversion','garage-conversion','barn-conversion','refurbishment','internal-alterations','change-of-use','demolition-rebuild'])
  assert.equal(jobTypeFor(id)?.mode,'comparison',id);
});
test('only explicitly selected new builds can run with no existing plan',()=>{
 for(const id of ['new-house','new-bungalow','new-commercial','other-new-build'])
  assert.equal(jobTypeFor(id)?.mode,'new-build',id);
 assert.equal(validateJobType('', '').ok,false);
 assert.equal(validateJobType('other', 'new-build').ok,false);
});
