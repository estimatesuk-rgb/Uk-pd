import test from 'node:test';
import assert from 'node:assert/strict';
import {applySavedRate,applySavedRates,rateLibraryCoverage,rateComponents} from '../src/ratePricing.mjs';
const make=(overrides={})=>({description:'Blockwork',unit:'m²',quantity:10,material_rate:0,plant_rate:0,labour_hours:0,labour_rate:0,...overrides});
test('uniquely matched exact descriptions and equivalent units transfer separate rate components',()=>{
 const item=make(),r={description:'blockwork',unit:'m2',supplier:'Merchant A',price_date:'2026-10-01',material_rate:27,plant_rate:5,labour_hours:1.5,labour_rate:25};
 const {item:priced,status}=applySavedRate(item,[r]);
 assert.equal(status,'matched');assert.equal(priced.quantity,10);
 assert.deepEqual([priced.material_rate,priced.plant_rate,priced.labour_hours,priced.labour_rate],[27,5,1.5,25]);
 assert.equal(priced.rate_checked_at,'2026-10-01');
 assert.equal(priced.supplier,'Merchant A');
 assert.equal(priced.status,'Library rate matched — QS verification required');
});
test('does not match similar wording with different descriptions or incompatible measurement units',()=>{
 const library=[{description:'Blockwork',unit:'m',material_rate:20},{description:'Concrete blocks',unit:'m²',material_rate:4}];
 assert.equal(applySavedRate(make(),library).status,'missing');
 assert.equal(applySavedRate(make(),[{description:'Blockwork',unit:'m³',material_rate:20}]).status,'missing');
});
test('duplicate matching prices are ambiguous and never selected',()=>{
 const item=make(),rates=[{description:'Blockwork',unit:'m2',material_rate:10},{description:' blockwork ',unit:'m²',material_rate:11}];
 const result=applySavedRate(item,rates);
 assert.equal(result.status,'ambiguous');assert.strictEqual(result.item,item);
});
test('any manually entered materials or labour stays unchanged',()=>{
 const item=make({material_rate:18,supplier:'Existing supplier'});
 const result=applySavedRate(item,[{description:'Blockwork',unit:'m²',material_rate:99}]);
 assert.equal(result.status,'already-priced');assert.strictEqual(result.item,item);
 assert.equal(applySavedRate(make({labour_hours:2}),[{description:'Blockwork',unit:'m²',material_rate:99}]).status,'already-priced');
});
test('rates with missing labour rate, NaN or no cost are flagged as invalid',()=>{
 assert.equal(rateComponents({labour_hours:2,labour_rate:0}),null);
 assert.equal(rateComponents({material_rate:-1}),null);
 assert.equal(rateComponents({material_rate:'garbage'}),null);
 assert.equal(applySavedRate(make(),[{description:'Blockwork',unit:'m²',labour_hours:1,labour_rate:0}]).status,'invalid-rate');
});
test('bulk matching reports missing, ambiguous, manual and matched, preserving row order',()=>{
 const items=[make(),make({description:'Unlisted'}),make({description:'Duplicate'}),make({description:'Manually priced',material_rate:30})];
 const rates=[{description:'Blockwork',unit:'m²',labour_hours:1,labour_rate:30},{description:'Duplicate',unit:'m²',material_rate:5},{description:'Duplicate',unit:'m2',material_rate:7}];
 const result=applySavedRates(items,rates);
 assert.deepEqual(result.stats,{matched:1,missing:1,ambiguous:1,'invalid-rate':0,'already-priced':1});
 assert.equal(result.rows[0].labour_hours,1);
 assert.equal(result.rows[1],items[1]);assert.equal(result.rows[2],items[2]);assert.equal(result.rows[3],items[3]);
});
test('coverage counts labour-only, material-only and plant separately',()=>{
 const coverage=rateLibraryCoverage([
  {labour_hours:1,labour_rate:50},{material_rate:12},{plant_rate:6},
  {material_rate:1,plant_rate:1,labour_hours:.5,labour_rate:10},{labour_hours:1}
 ]);
 assert.deepEqual(coverage,{materials:2,plant:2,labour:2,invalid:1});
});
