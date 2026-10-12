import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyAiCoverage,summariseAiCoverage} from '../src/aiCoverage.mjs';
const page=(more={})=>({filename:'Plan.pdf',page:1,calibration_status:'calibrated',
 classification:'Proposed',provisional_measured:0,held_shapes:0,scope_items:3,unresolved_questions:0,...more});
test('proposed sheet with zero traces is prominently incomplete, never marked fully measured',()=>{
 assert.match(classifyAiCoverage(page()).status,/manual take-off/);
 assert.equal(classifyAiCoverage(page()).needs_qs,true);
});
test('notes-only sheet cannot count as scaled measure',()=>{
 assert.match(classifyAiCoverage(page({calibration_status:'reference-only'})).status,/Notes only/);
});
test('unresolved questions, rejected shapes or remaining tasks signal partial coverage',()=>{
 assert.match(classifyAiCoverage(page({provisional_measured:2,scope_items:3})).status,/Partial/);
 assert.match(classifyAiCoverage(page({provisional_measured:3,held_shapes:1})).status,/Partial/);
 assert.match(classifyAiCoverage(page({provisional_measured:3,unresolved_questions:1})).status,/Partial/);
});
test('a measured page remains QS provisional even with all visible suggestions processed',()=>{
 const status=classifyAiCoverage(page({provisional_measured:3,scope_items:3}));
 assert.match(status.status,/Provisional/);assert.equal(status.needs_qs,true);
});
test('pages and total counts are calculated without collapsing distinct floors or notes',()=>{
 const r=summariseAiCoverage([page({page:1,provisional_measured:2,held_shapes:1}),
  page({page:2,classification:'Existing',scope_items:0}),
  page({page:3,calibration_status:'reference-only',scope_items:2,unresolved_questions:1})]);
 assert.equal(r.total_pages,3);
 assert.equal(r.provisional_shapes,2);
 assert.equal(r.held_shapes,1);
 assert.equal(r.unresolved_questions,1);
 assert.equal(r.pages_without_measurements,1);
 assert.equal(r.requires_qs_review,true);
});
