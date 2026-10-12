import test from 'node:test';
import assert from 'node:assert/strict';
import {measurementQualityFlags,auditMeasurementQuality} from '../src/aiMeasurementQuality.mjs';
const checks=o=>measurementQualityFlags(o);
test('observed 296m2 elevation is flagged for nonbillable view, missing height and scale sanity',()=>{
 const flags=checks({description:'proposed right elevation',unit:'m²',quantity:296,kind:'area'});
 assert.ok(flags.some(x=>x.includes('not itself a construction work item')));
 assert.ok(flags.some(x=>x.includes('wall height')));
 assert.ok(flags.some(x=>x.includes('250 m²')));
});
test('107.13m² kitchen extension receives room/extension boundary check',()=>{
 const flags=checks({description:'new kitchen extension',unit:'m²',quantity:107.13,kind:'polygon'});
 assert.ok(flags.some(x=>x.includes('room/extension')));
});
test('legit small plan slab and ordinary straight lengths are not held solely for size',()=>{
 assert.deepEqual(checks({description:'Concrete floor slab',unit:'m²',quantity:70,kind:'polygon'}),[]);
 assert.deepEqual(checks({description:'New wall length',unit:'m',quantity:12.49,kind:'polyline'}),[]);
});
test('dimensioned wall face passes generic wall-height warning even for large facades',()=>{
 const flags=checks({description:'External wall face',unit:'m²',quantity:120,kind:'wall_face',
 dimension_evidence:{height_m:3.5,height_evidence:'3500mm'}});
 assert.equal(flags.some(x=>x.includes('without an explicitly')),false);
 assert.equal(flags.some(x=>x.includes('100 m²')),true);
});
test('small elevation is still a named view and not automatically a billable rate',()=>{
 const flags=checks({description:'Proposed front elevation',unit:'m²',quantity:25,kind:'area'});
 assert.ok(flags.length>=2);
});
test('observed manual entries and zero-quantity draft scope are not treated as automatic priced lines',()=>{
 const items=[{id:'1',description:'proposed left elevation',unit:'m²',quantity:222,
 takeoff_evidence:{automatic:true,kind:'area'}},
 {id:'2',description:'kitchen extension',unit:'m²',quantity:107.13,
 takeoff_evidence:{automatic:true,kind:'polygon'}},
 {id:'3',description:'Proposed right elevation',unit:'m²',quantity:300,
 takeoff_evidence:{automatic:false,kind:'area'}}];
 const result=auditMeasurementQuality(items);
 assert.deepEqual(result.map(x=>x.id),['1','2']);
 assert.ok(result[0].issues.length>0);
});
