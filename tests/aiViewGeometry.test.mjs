import test from 'node:test';
import assert from 'node:assert/strict';
import {aiViewContext,mapCropPoint,mapCropMark,mapCropMeasurement,MEASURABLE_VIEW_KINDS} from '../src/aiViewGeometry.mjs';
const doc={id:'p1',file_path:'drawings/C3.pdf',revision:'C3',status:'Current'};
const view={id:'ground',document_id:'p1',page:1,kind:'ground-floor-plan',
 source_path:doc.file_path,source_revision:doc.revision,
 bounds:{x:.1,y:.4,w:.35,h:.4},name:'Ground floor'};
const calibration={view_id:'ground',status:'calibrated',source_path:doc.file_path,
 source_revision:doc.revision,crosscheck_verified:true,
 metresPerPixel:.01,dimensions_px:[840,680]};
test('AI crop scale is reconciled from separately calibrated view render, never page scale',()=>{
 const ctx=aiViewContext(view,doc,calibration,[2400,1700],[840,680]);
 assert.equal(ctx.ok,true);assert.equal(ctx.metresPerPixel,.01);
 const smaller=aiViewContext(view,doc,calibration,[1200,850],[420,340]);
 assert.equal(smaller.ok,true);assert.equal(smaller.metresPerPixel,.02);
 assert.equal(MEASURABLE_VIEW_KINDS.has('elevation'),false);
});
test('unverified or mismatched view revision fails closed',()=>{
 assert.equal(aiViewContext(view,doc,{...calibration,crosscheck_verified:false},[2400,1700],[840,680]).ok,false);
 assert.equal(aiViewContext(view,{...doc,revision:'C4'},calibration,[2400,1700],[840,680]).ok,false);
 assert.equal(aiViewContext(view,doc,calibration,[2400,1700],[840,400]).ok,false);
});
test('crop-local AI mark is mapped back into source sheet while keeping source reference',()=>{
 const m={kind:'polygon',x:.1,y:.2,w:.4,h:.3,
  points:[{x:.1,y:.2},{x:.5,y:.2},{x:.5,y:.5},{x:.1,y:.5}],
  openings:[[{x:.2,y:.3},{x:.3,y:.3},{x:.3,y:.4}]]};
 const converted=mapCropMark(m,view);
 assert.equal(Number(converted.x.toFixed(3)),.135);
 assert.equal(Number(converted.y.toFixed(3)),.48);
 assert.equal(Number(converted.w.toFixed(3)),.14);
 assert.equal(Number(converted.h.toFixed(3)),.12);
 assert.equal(converted.points.length,4);
 assert.equal(converted.openings[0].length,3);
 const measure=mapCropMeasurement({mark:m,key:'p1|1|slab'},view);
 assert.equal(measure.key,'ground|p1|1|slab');
 assert.equal(measure.mark.view_id,'ground');
});
test('model point translation is consistent for calibration-independent normalized coordinates',()=>{
 assert.deepEqual(mapCropPoint({x:0,y:0},view),{x:.1,y:.4});
 assert.ok(Math.abs(mapCropPoint({x:1,y:1},view).x-.45)<1e-10);
});
