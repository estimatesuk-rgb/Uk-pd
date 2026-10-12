import test from 'node:test';
import assert from 'node:assert/strict';
import {confirmedDimension,measureDimensionedCandidate} from '../src/dimensionedMeasurements.mjs';
import {measureAutoCandidate} from '../src/autoMeasurement.mjs';
const page={calibration_status:'calibrated',classification:'Proposed',metresPerPixel:.01,
 dimensions:[1000,500],document_id:'drawing-A',page:1};
const path=[{x:.1,y:.1},{x:.5,y:.1}];
const wall={kind:'wall_face',points:path,stage:'Proposed',description:'New masonry external wall',
 evidence:'New external wall linework',confidence:'high',height_m:2.4,height_evidence:'Height 2400 mm per floor-to-ceiling note'};
const trench={kind:'trench',points:path,stage:'Proposed',description:'Foundation strip excavation',
 evidence:'Strip foundation identified',confidence:'high',width_m:.6,
 width_evidence:'600 mm wide strip foundation',depth_m:1.1,depth_evidence:'1100mm below ground'};
const slab={kind:'slab_volume',points:[{x:.1,y:.1},{x:.5,y:.1},{x:.5,y:.3},{x:.1,y:.3}],
 stage:'Proposed',description:'Reinforced concrete floor slab',confidence:'high',
 evidence:'Clearly outlined slab footprint',depth_m:.15,depth_evidence:'150mm slab thickness'};
test('cited 2400mm is 2.4m, unsupported numbers and ambiguities rejected',()=>{
 assert.equal(confirmedDimension(2.4,'2400 mm finished storey height'),true);
 assert.equal(confirmedDimension(.15,'150 mm concrete slab'),true);
 assert.equal(confirmedDimension(.6,'0.6 metres wide trench'),true);
 assert.equal(confirmedDimension(.6,'200 mm wide trench'),false);
 assert.equal(confirmedDimension(.6,'600 wide trench'),false);
 assert.equal(confirmedDimension(.6,''),false);
 assert.equal(confirmedDimension('0.6','600mm wall'),false);
});
test('wall run × cited height computes m², with exact cited opening deductions',()=>{
 const result=measureAutoCandidate({...wall,
  opening_dimensions:[{width_m:.9,width_evidence:'900 mm door width',height_m:2.1,height_evidence:'2100 mm door height'}]},page);
 assert.equal(result.quantity,7.71);
 assert.equal(result.unit,'m²');
 assert.equal(result.calculation.gross_m2,9.6);
 assert.equal(result.calculation.opening_deduction_m2,1.89);
 assert.equal(result.mark.kind,'polyline');
});
test('uncited height, opening sizes or opening taller than wall cannot produce a priced quantity',()=>{
 assert.ok(measureAutoCandidate({...wall,height_m:2.4,height_evidence:'Not on drawing'},page).error);
 assert.ok(measureAutoCandidate({...wall,opening_dimensions:[{width_m:.9,height_m:2.1,width_evidence:'900mm',height_evidence:'unknown'}]},page).error);
 assert.ok(measureAutoCandidate({...wall,opening_dimensions:[{width_m:4,height_m:3.5,width_evidence:'4000mm',height_evidence:'3500mm'}]},page).error);
 assert.ok(measureAutoCandidate({...wall,opening_dimensions:Array.from({length:15},()=>({}))},page).error);
});
test('trench m³ is length × cited width × cited depth',()=>{
 const m=measureAutoCandidate(trench,page);
 assert.equal(m.quantity,2.64);
 assert.equal(m.unit,'m³');
 assert.deepEqual(m.calculation,{length_m:4,width_m:.6,depth_m:1.1,volume_m3:2.64});
});
test('slab volume follows net irregular footprint × expressly specified thickness',()=>{
 const m=measureAutoCandidate(slab,page);
 assert.equal(m.quantity,.6);
 assert.equal(m.unit,'m³');
 assert.equal(m.calculation.net_area_m2,4);
 assert.equal(m.calculation.depth_m,.15);
});
test('no unscaled heights, no invented thickness, and no retained work',()=>{
 assert.ok(measureAutoCandidate(trench,{...page,metresPerPixel:0}).error);
 assert.ok(measureAutoCandidate(slab,{...page,calibration_status:'reference-only'}).error);
 assert.ok(measureAutoCandidate({...slab,depth_evidence:'No depth shown'},page).error);
 assert.ok(measureAutoCandidate({...wall,stage:'Retained'},page).error);
 assert.ok(measureAutoCandidate({...wall,confidence:'medium'},page).error);
});
test('AI-reported arbitrary numeric volume ignored and calculations recomputed',()=>{
 const m=measureAutoCandidate({...trench,quantity:600},page);
 assert.equal(m.quantity,2.64);
 const noDims=measureDimensionedCandidate({...trench,width_m:0}, {kind:'polyline',points:path},page.dimensions,page.metresPerPixel);
 assert.equal(noDims,null);
});
