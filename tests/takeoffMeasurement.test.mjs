import test from 'node:test';
import assert from 'node:assert/strict';
import {measuredQuantity,findUniqueRate,canonicalUnit} from '../src/takeoffMeasurement.mjs';
const dimensions=[1000,500],metresPerPixel=0.01;
test('area rectangle produces calibrated square metres',()=>{
 assert.deepEqual(measuredQuantity({kind:'area',x:0,y:0,w:0.2,h:0.4},dimensions,metresPerPixel),{quantity:4,unit:'m²',method:'calibrated rectangle area'});
});
test('length uses true endpoint distance including diagonals and verticals',()=>{
 assert.equal(measuredQuantity({kind:'length',points:[{x:.1,y:.1},{x:.4,y:.5}]},dimensions,metresPerPixel).quantity,Math.hypot(3,2).toFixed(2)*1);
 assert.equal(measuredQuantity({kind:'length',points:[{x:.1,y:.1},{x:.1,y:.5}]},dimensions,metresPerPixel).quantity,2);
});
test('volume is measured plan area times entered depth, not a guessed depth',()=>{
 assert.deepEqual(measuredQuantity({kind:'volume',x:0,y:0,w:0.2,h:0.4,depth_m:0.15},dimensions,metresPerPixel),{quantity:0.6,unit:'m³',method:'calibrated rectangle area × entered depth'});
 assert.equal(measuredQuantity({kind:'volume',w:.2,h:.4,depth_m:0},dimensions,metresPerPixel),null);
});
test('point counts are one per marked object; no area or scale presumed',()=>{
 assert.deepEqual(measuredQuantity({kind:'count',x:0.2,y:0.3},dimensions,0),{quantity:1,unit:'nr',method:'manual point count'});
 assert.equal(measuredQuantity({kind:'length',points:[]},dimensions,metresPerPixel),null);
});
test('unscaled/invalid drawing geometry is rejected',()=>{
 assert.equal(measuredQuantity({kind:'area',w:.2,h:.3},dimensions,0),null);
 assert.equal(measuredQuantity({kind:'area',w:.2,h:.3},[0,0],metresPerPixel),null);
});
test('unit synonyms allow exact description match only, never duplicate choices',()=>{
 const rates=[{description:'Concrete',unit:'m3',material_rate:50,labour_rate:0},{description:'Concrete',unit:'m',material_rate:3},{description:'Drain',unit:'nr',material_rate:10}];
 assert.equal(canonicalUnit('m2'),'m²');
 assert.equal(findUniqueRate(rates,'concrete','m³').rate.material_rate,50);
 assert.equal(findUniqueRate(rates,'Concrete','m').rate.material_rate,3);
 assert.equal(findUniqueRate(rates,'concret','m³').status,'missing');
 assert.equal(findUniqueRate([...rates,{description:'Concrete',unit:'m³'}],'Concrete','m3').status,'ambiguous');
});
