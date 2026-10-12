import test from 'node:test';
import assert from 'node:assert/strict';
import {previewPendingMark} from '../src/aiPendingPreview.mjs';
const base={id:'h',drawing_id:'doc1',page:2,kind:'area',x:.1,y:.2,w:.3,h:.4};
const pending={kind:'measured',highlight:base};
test('a candidate appears only on its own drawing revision and page',()=>{
 assert.deepEqual(previewPendingMark(pending,'doc1',2),base);
 assert.equal(previewPendingMark(pending,'doc1',3),null);
 assert.equal(previewPendingMark(pending,'doc2',2),null);
});
test('pending scope has no geometry to preview',()=>{
 assert.equal(previewPendingMark({kind:'scope',highlight:base},'doc1',2),null);
});
test('invalid and out-of-bounds geometry cannot be drawn',()=>{
 assert.equal(previewPendingMark({kind:'measured',highlight:{...base,x:0.9,w:.3}},'doc1',2),null);
 assert.equal(previewPendingMark({kind:'measured',highlight:{...base,x:'0.1'}},'doc1',2),null);
});
test('a valid line, count and polygon with opening can be shown',()=>{
 const points=[{x:.1,y:.1},{x:.5,y:.1},{x:.5,y:.5},{x:.1,y:.5}];
 const opening=[[{x:.2,y:.2},{x:.3,y:.2},{x:.3,y:.3},{x:.2,y:.3}]];
 for(const shape of [
  {...base,kind:'length',points:points.slice(0,2)},
  {...base,kind:'polyline',points},
  {...base,kind:'count',x:.2,y:.4},
  {...base,kind:'polygon',points,openings:opening}
 ]){
  assert.ok(previewPendingMark({kind:'measured',highlight:shape},'doc1',2));
 }
});
test('a crossed polygon does not draw even if stored from old AI response',()=>{
 const points=[{x:.1,y:.1},{x:.4,y:.4},{x:.1,y:.4},{x:.4,y:.1}];
 assert.equal(previewPendingMark({kind:'measured',highlight:{...base,kind:'polygon',points}},'doc1',2),null);
});
