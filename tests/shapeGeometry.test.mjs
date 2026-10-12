import test from 'node:test';
import assert from 'node:assert/strict';
import {validateTrace,validatedPolygonWithOpenings,polygonArea,measuredTrace} from '../src/shapeGeometry.mjs';
import {measureAutoCandidate} from '../src/autoMeasurement.mjs';
import {measuredQuantity} from '../src/takeoffMeasurement.mjs';
const size=[1000,500],scale=.01;
const outline=[
 {x:.1,y:.1},{x:.5,y:.1},{x:.5,y:.3},
 {x:.3,y:.3},{x:.3,y:.5},{x:.1,y:.5}
];
const opening=[
 {x:.15,y:.14},{x:.25,y:.14},{x:.25,y:.24},{x:.15,y:.24}
];
const context={classification:'Proposed',calibration_status:'calibrated',metresPerPixel:scale,
 dimensions:size,document_id:'plan-rev-A',page:1};
const candidate={kind:'polygon',points:outline,description:'New irregular floor slab',stage:'Proposed',
 evidence:'Continuous boundary shown on proposed drawing',confidence:'high'};
test('non-rectangular L-shaped floor measures actual area not enclosing box',()=>{
 const m=measuredTrace({kind:'polygon',points:outline},size,scale);
 assert.deepEqual([m.quantity,m.unit,m.gross_area_m2],[6,'m²',6]);
 assert.ok(Math.abs(polygonArea(outline)-.12)<1e-10);
 assert.equal(measuredQuantity({kind:'polygon',points:outline},size,scale).quantity,6);
});
test('only explicitly drawn internal openings are deducted, never negative BOQ quantities',()=>{
 const m=measuredTrace({kind:'polygon',points:outline,openings:[opening]},size,scale);
 assert.equal(m.gross_area_m2,6);
 assert.equal(m.deductions_area_m2,.5);
 assert.equal(m.quantity,5.5);
 assert.equal(m.openings_count,1);
 assert.match(m.method,/openings/);
});
test('reject holes outside or touching outer boundary',()=>{
 assert.equal(validatedPolygonWithOpenings(outline,[[{x:.2,y:.2},{x:.6,y:.2},{x:.6,y:.25}]]),null);
 assert.equal(validatedPolygonWithOpenings(outline,[[{x:.1,y:.12},{x:.18,y:.12},{x:.18,y:.2},{x:.1,y:.2}]]),null);
});
test('reject overlapping or nested openings, so none are subtracted twice',()=>{
 const other=opening.map(p=>({x:p.x+.02,y:p.y+.01}));
 assert.equal(validatedPolygonWithOpenings(outline,[opening,other]),null);
 assert.equal(validatedPolygonWithOpenings(outline,[opening,opening]),null);
});
test('reject crossed/self-touching polygons and invalid or excessive point data',()=>{
 const bowtie=[{x:.1,y:.1},{x:.4,y:.4},{x:.1,y:.4},{x:.4,y:.1}];
 assert.equal(validateTrace(bowtie),null);
 assert.equal(measuredTrace({kind:'polygon',points:bowtie},size,scale),null);
 assert.equal(validateTrace([{x:.1,y:.1},{x:1.3,y:.4},{x:.4,y:.1}]),null);
 assert.equal(validateTrace(Array.from({length:55},(_,i)=>({x:i/100,y:.1}))),null);
});
test('trace lengths are the sum of line segments in actual scaled axes',()=>{
 const points=[{x:.1,y:.1},{x:.4,y:.1},{x:.4,y:.5}];
 const result=measuredTrace({kind:'polyline',points},size,scale);
 assert.equal(result.quantity,5);
 assert.equal(result.unit,'m');
 assert.equal(result.method,'calibrated multi-segment polyline');
});
test('auto polygon carries net deduction detail but never trusts claimed model quantity',()=>{
 const result=measureAutoCandidate({...candidate,openings:[opening],quantity:9999},context);
 assert.equal(result.quantity,5.5);
 assert.equal(result.mark.openings.length,1);
 assert.equal(result.mark.kind,'polygon');
 assert.equal(result.unit,'m²');
});
test('auto polyline uses correct unit and refuses unrelated existing and notes-only geometry',()=>{
 const result=measureAutoCandidate({...candidate,kind:'polyline',points:[{x:.1,y:.1},{x:.4,y:.1},{x:.4,y:.5}]},context);
 assert.equal(result.quantity,5);assert.equal(result.unit,'m');
 assert.ok(measureAutoCandidate(candidate,{...context,calibration_status:'reference-only'}).error);
 assert.ok(measureAutoCandidate(candidate,{...context,classification:'Existing'}).error);
});
test('polygon identity changes when an opening changes and is scoped to drawing page',()=>{
 const simple=measureAutoCandidate(candidate,context);
 const net=measureAutoCandidate({...candidate,openings:[opening]},context);
 const newPage=measureAutoCandidate(candidate,{...context,page:2});
 assert.notEqual(simple.key,net.key);
 assert.notEqual(simple.key,newPage.key);
});
test('refuse unsupported guessed volume and invalid zero scale',()=>{
 assert.equal(measuredTrace({kind:'polygon',points:outline},size,0),null);
 assert.ok(measureAutoCandidate({...candidate,kind:'volume',depth_m:2},context).error);
});
