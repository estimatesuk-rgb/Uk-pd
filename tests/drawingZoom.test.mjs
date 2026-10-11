import test from 'node:test';
import assert from 'node:assert/strict';
import {clampZoom,normalizedDrawingPoint,anchoredScroll,pinchGeometry} from '../src/drawingZoom.mjs';

test('zoom is bounded but fit-to-width can shrink an A1 sheet on mobile',()=>{
  assert.equal(clampZoom(0.01),0.08);
  assert.equal(clampZoom(500),8);
  assert.equal(clampZoom(1.5),1.5);
  assert.equal(clampZoom(Infinity),1);
});
test('calibration points refer to original drawing coordinates at all zoom levels',()=>{
  const original=normalizedDrawingPoint(500,400,{left:100,top:100,width:800,height:600});
  const zoomed=normalizedDrawingPoint(900,700,{left:100,top:100,width:1600,height:1200});
  assert.deepEqual(original,zoomed);
  assert.deepEqual(original,{x:0.5,y:0.5});
  const originalPixelDistance=Math.hypot((0.75-0.5)*2400,(0.7-0.5)*1500);
  assert.equal(originalPixelDistance,Math.hypot((0.75-zoomed.x)*2400,(0.7-zoomed.y)*1500));
});
test('points outside the drawing clamp to original-page bounds',()=>{
  assert.deepEqual(normalizedDrawingPoint(-500,9000,{left:0,top:0,width:1000,height:800}),{x:0,y:1});
});
test('zoom around one point keeps that content fixed beneath the cursor',()=>{
  assert.deepEqual(anchoredScroll({scrollLeft:200,scrollTop:100,fromZoom:1,toZoom:2,anchorX:150,anchorY:100}),
    {left:550,top:300});
  assert.deepEqual(anchoredScroll({scrollLeft:550,scrollTop:300,fromZoom:2,toZoom:1,anchorX:150,anchorY:100}),
    {left:200,top:100});
});
test('pinch movement zooms and pans around the finger midpoint',()=>{
  const a=pinchGeometry({x:100,y:100},{x:300,y:100});
  const b=pinchGeometry({x:140,y:150},{x:440,y:150});
  assert.equal(a.distance,200);
  assert.equal(a.x,200);
  assert.equal(b.distance,300);
  const next=anchoredScroll({scrollLeft:400,scrollTop:200,fromZoom:1,toZoom:b.distance/a.distance,
    anchorX:a.x,anchorY:a.y,targetX:b.x,targetY:b.y});
  assert.deepEqual(next,{left:610,top:300});
});
