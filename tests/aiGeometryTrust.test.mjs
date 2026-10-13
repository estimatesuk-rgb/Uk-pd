import test from 'node:test';
import assert from 'node:assert/strict';
import {aiGeometryRejection} from '../src/aiGeometryTrust.mjs';
import {measureAutoPage} from '../src/autoMeasurement.mjs';
const context={classification:'Proposed',calibration_status:'calibrated',metresPerPixel:.025230339883096056,
 dimensions:[2400,1681],filename:'390-16-10 - C3 - Stockwood House Type - Type G (HA) - Plots 18-19 - Floor Plans. Elevations & Section A-A.pdf',
 document_id:'stockwood',page:1};
const ground={description:'ground floor plan',evidence:'clearly visible outline',kind:'polygon',stage:'Proposed',confidence:'high',
 points:[{x:.15,y:.55},{x:.5,y:.55},{x:.5,y:.9},{x:.15,y:.9}]};
const first={...ground,description:'first floor plan',points:[{x:.6,y:.55},{x:.95,y:.55},{x:.95,y:.9},{x:.6,y:.9}]};
test('actual TEST 7 Stockwood invented floor plan rectangles are REJECTED not measured',()=>{
 const result=measureAutoPage([ground,first],context);
 assert.equal(result.measured.length,0);
 assert.equal(result.rejected.length,2);
 assert.ok(result.rejected.every(r=>/MULTI-VIEW SHEET/.test(r.reason)));
});
test('floor plan and elevation titles are not billable elements',()=>{
 assert.match(aiGeometryRejection(ground,{filename:'proposed-sheet.pdf'}),/DRAWING VIEW LABEL/);
 assert.match(aiGeometryRejection({...ground,description:'proposed right elevation'},{filename:'proposed-sheet.pdf'}),/DRAWING VIEW LABEL/);
});
test('generic AI evidence and 5 percent rounded geometry fail closed',()=>{
 const candidate={...ground,description:'Ground floor slab to grid A-C'};
 assert.match(aiGeometryRejection(candidate,{filename:'proposed-sheet.pdf'}),/UNSUPPORTED GEOMETRY/);
 assert.match(aiGeometryRejection({...candidate,evidence:'Slab between grids A-C labelled GF-02'},
  {filename:'proposed-sheet.pdf'}),/ROUNDED GRID OUTLINE/);
});
test('a non-grid-specific boundary with identifiable physical evidence may enter review only',()=>{
 const candidate={...ground,description:'New concrete foundation slab',evidence:'Foundation edge within grids A1-B3 labelled F1',
  points:[{x:.157,y:.551},{x:.501,y:.553},{x:.502,y:.904},{x:.158,y:.907}]};
 assert.equal(aiGeometryRejection(candidate,{filename:'proposed-sheet.pdf'}),'');
});
