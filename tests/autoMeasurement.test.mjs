import test from 'node:test';
import assert from 'node:assert/strict';
import {measureAutoCandidate,measureAutoPage} from '../src/autoMeasurement.mjs';
const ctx={classification:'Proposed',calibration_status:'calibrated',metresPerPixel:0.01,dimensions:[1000,500],document_id:'example-drawing',page:1};
const area={kind:'area',description:'New floor slab',stage:'Proposed',work_section:'Floors',evidence:'Clearly outlined slab boundary',confidence:'high',x:.2,y:.1,w:.3,h:.4};
test('AI-suggested rectangle measures via existing checked scale, not AI quantity',()=>{
 const r=measureAutoCandidate({...area,quantity:900},ctx);
 assert.equal(r.quantity,6);assert.equal(r.unit,'m²');assert.equal(r.mark.x,.2);
 assert.match(r.method,/calibrated/);
});
test('straight length is scaled using both axes, not page diagonal',()=>{
 const r=measureAutoCandidate({...area,kind:'length',points:[{x:.1,y:.1},{x:.4,y:.5}]},ctx);
 assert.equal(r.quantity,3.61);assert.equal(r.unit,'m');
});
test('distinct count point produces one nr, not a guessed whole-room count',()=>{
 const r=measureAutoCandidate({...area,kind:'count',x:.2,y:.2},ctx);
 assert.equal(r.quantity,1);assert.equal(r.unit,'nr');
});
test('no scale, reference page, retained, existing and supporting views refuse automatic quantities',()=>{
 for(const override of [{calibration_status:'reference-only'},{calibration_status:'needed'},{classification:'Existing'},{classification:'Structural'},{classification:'Uncertain'}]){
   const r=measureAutoCandidate(area,{...ctx,...override});
   assert.ok(r.error,JSON.stringify(override));
 }
});
test('model cannot certify itself with confidence medium or missing evidence',()=>{
 assert.equal(measureAutoCandidate({...area,confidence:'medium'},ctx).error,'Outline confidence not high');
 assert.ok(measureAutoCandidate({...area,evidence:''},ctx).error);
 assert.ok(measureAutoCandidate({...area,stage:'Retained'},ctx).error);
 assert.ok(measureAutoCandidate({...area,stage:'Demolition'},ctx).error);
});
test('invalid/out-of-bounds or unsupported shapes cannot enter BOQ',()=>{
 for(const c of [{...area,x:.9,w:.3},{...area,w:-.2},{...area,kind:'volume',depth_m:1},
 {...area,kind:'length',points:[{x:.1,y:.1},{x:.1,y:.1}]},{...area,kind:'count',x:1.5,y:.2}]){
    assert.ok(measureAutoCandidate(c,ctx).error,c.kind);
 }
});
test('two identically located outlines on a page are not double-counted',()=>{
 const r=measureAutoPage([area,area],ctx);
 assert.equal(r.measured.length,1);assert.equal(r.rejected.length,1);
 const other=measureAutoPage([area],{...ctx,page:2});
 assert.notEqual(other.measured[0].key,r.measured[0].key);
});
test('invalid source scale and image dimensions are never replaced with a guessed drawing scale',()=>{
 assert.ok(measureAutoCandidate(area,{...ctx,metresPerPixel:0}).error);
 assert.ok(measureAutoCandidate(area,{...ctx,dimensions:[]}).error);
});

test('large elevation candidate carries QS quality flags without claiming verified geometry',()=>{
 const result=measureAutoCandidate({...area,
   description:'Proposed right elevation',quantity:1000,kind:'area',
   x:.05,y:.05,w:.8,h:.8}, {...ctx,metresPerPixel:.03});
 assert.equal(result.error,undefined);
 assert.ok(result.quality_flags.some(flag=>flag.includes('wall height')));
 assert.ok(result.quality_flags.some(flag=>flag.includes('not itself a construction work item')));
});
test('ordinary slab area has no elevated warning flags',()=>{
 const result=measureAutoCandidate(area,ctx);
 assert.deepEqual(result.quality_flags,[]);
});
