import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizedDrawingPoint} from '../src/drawingZoom.mjs';
import {resolveCalibrationClick,calibrationPointDistance} from '../src/calibrationInteraction.mjs';

const dims=[2000,1200];
const click=p=>resolveCalibrationClick(p,p,null,...dims);

test('single quick mouse click or phone tap registers point A',()=>{
  for(const p of [{x:.2,y:.3},{x:.63,y:.71}]){
    assert.deepEqual(click(p),{step:'point-a',first:p});
  }
});
test('A then B yields actual unzoomed drawing pixel length',()=>{
  const a={x:.2,y:.3},b={x:.7,y:.3};
  const first=click(a);
  const selected=resolveCalibrationClick(b,b,first.first,...dims);
  assert.equal(selected.step,'complete');
  assert.equal(selected.length,1000);
  assert.deepEqual(selected.first,a);assert.deepEqual(selected.second,b);
});
test('desktop click-and-drag remains supported',()=>{
  const a={x:.1,y:.2},b={x:.4,y:.6};
  const selected=resolveCalibrationClick(a,b,null,...dims);
  assert.equal(selected.step,'complete');
  assert.equal(selected.length,calibrationPointDistance(a,b,...dims));
});
test('near-identical A B points must not complete calibration',()=>{
  const a={x:.2,y:.3},b={x:.201,y:.301};
  const selected=resolveCalibrationClick(b,b,a,...dims);
  assert.equal(selected.step,'too-close');
  assert.deepEqual(selected.first,a);
});
test('zooming and panning display coordinates leave calibration unchanged',()=>{
  const original={left:100,top:80,width:1000,height:600};
  const zoomed={left:-400,top:-120,width:2000,height:1200};
  const a=normalizedDrawingPoint(300,260,original);
  const b=normalizedDrawingPoint(800,260,original);
  const az=normalizedDrawingPoint(0,240,zoomed);
  const bz=normalizedDrawingPoint(1000,240,zoomed);
  assert.deepEqual(az,a);assert.deepEqual(bz,b);
  assert.equal(resolveCalibrationClick(b,b,a,...dims).length,
               resolveCalibrationClick(bz,bz,az,...dims).length);
});
test('cancelled or missing pointer positions never silently save a scale',()=>{
  assert.equal(resolveCalibrationClick(null,{x:.2,y:.1},null,...dims).step,'invalid');
  assert.equal(resolveCalibrationClick({x:.2,y:.1},null,null,...dims).step,'invalid');
});
