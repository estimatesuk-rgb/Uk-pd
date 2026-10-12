import test from 'node:test';
import assert from 'node:assert/strict';
import {findPotentialAiOverlaps} from '../src/aiSuggestionConflict.mjs';
const item=(description,quantity,unit='m²',drawing='BR01.pdf p1')=>({description,quantity,unit,drawing,takeoff_evidence:{}});
const rows=[
 {...item('new kitchen extension',107.13),ref_no:'001'},
 {...item('new wall',12.49,'m'),ref_no:'002'},
 {...item('new external wall construction',29.9,'m²','BR03.pdf p1'),ref_no:'003'},
 {...item('proposed right elevation',296,'m²','BR02.pdf p1'),ref_no:'010'},
 {...item('proposed left elevation',222,'m²','BR02.pdf p1'),ref_no:'011'}
];
test('detects repeated kitchen and wall quantities under different descriptions',()=>{
 assert.equal(findPotentialAiOverlaps(item('new kitchen area',107.13),rows)[0].ref_no,'001');
 assert.equal(findPotentialAiOverlaps(item('new wall length',12.49,'m'),rows)[0].ref_no,'002');
});
test('flags changed right elevation area and keeps left separate',()=>{
 const conflicts=findPotentialAiOverlaps(item('Proposed right elevation wall',300.6,'m²','BR02.pdf p1'),rows);
 assert.equal(conflicts.length,1);assert.equal(conflicts[0].ref_no,'010');
 assert.equal(conflicts[0].reason.includes('double-count'),true);
 const left=findPotentialAiOverlaps(item('Proposed left elevation wall',250.14,'m²','BR02.pdf p1'),rows);
 assert.equal(left.length,1);assert.equal(left[0].ref_no,'011');
 assert.match(left[0].reason,/Different quantities/);
});
test('external wall mismatch is held for inspection without guessing which quantity is correct',()=>{
 const a=findPotentialAiOverlaps(item('new external wall construction',11.96,'m²','BR03.pdf p1'),rows);
 assert.equal(a.length,1);assert.equal(a[0].quantity,29.9);
 assert.match(a[0].reason,/Different quantities/);
});
test('different floor, drawing or unit never falsely match',()=>{
 assert.equal(findPotentialAiOverlaps(item('new kitchen area',107.13,'m²','BR01.pdf p2'),rows).length,0);
 assert.equal(findPotentialAiOverlaps(item('new wall length',12.49,'m²','BR01.pdf p1'),rows).length,0);
 assert.equal(findPotentialAiOverlaps(item('new kitchen area',107.13,'m²','BR04.pdf p1'),rows).length,0);
});
test('unrelated work types should not flag based only on same page',()=>{
 assert.equal(findPotentialAiOverlaps(item('new door set',1,'nr'),rows).length,0);
});
test('drawing id and page provide authoritative matching when both available',()=>{
 const a={...item('new kitchen',100),takeoff_evidence:{drawing_id:'doc1',page:1}};
 const b={...item('new kitchen',100,'m²','different title p1'),takeoff_evidence:{drawing_id:'doc1',page:1}};
 const c={...b,takeoff_evidence:{drawing_id:'doc1',page:2}};
 assert.equal(findPotentialAiOverlaps(a,[b]).length,1);
 assert.equal(findPotentialAiOverlaps(a,[c]).length,0);
});
