import test from 'node:test';
import assert from 'node:assert/strict';
import {verifySecondDimension} from '../src/scaleCrosscheck.mjs';
const prior={status:'calibrated',metresPerPixel:0.01,
 reference_points:[{x:.1,y:.1},{x:.6,y:.1}]};
const vertical=[{x:.8,y:.2},{x:.8,y:.7}];
test('two independent dimensioned lines within 2 percent certify scale without altering first scale',()=>{
 const result=verifySecondDimension(prior,5,500,vertical,[1000,1000]);
 assert.equal(result.ok,true);assert.equal(result.metresPerPixel,0.01);
});
test('second point pair at same location is not independent',()=>{
 const result=verifySecondDimension(prior,5,500,prior.reference_points,[1000,1000]);
 assert.equal(result.ok,false);assert.match(result.reason,/different dimension/);
});
test('scan distortion or wrong printed scale blocks measured geometry',()=>{
 const result=verifySecondDimension(prior,4,500,vertical,[1000,1000]);
 assert.equal(result.ok,false);assert.match(result.reason,/differs/);
});
test('first calibration and dimension geometry are required',()=>{
 assert.equal(verifySecondDimension(null,4,400,vertical,[1000,1000]).ok,false);
 assert.equal(verifySecondDimension(prior,4,0,vertical,[1000,1000]).ok,false);
});
