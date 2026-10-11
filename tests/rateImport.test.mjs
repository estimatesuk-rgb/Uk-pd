import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareMasterRateImport, rateMatchKey} from '../src/rateImport.mjs';
const head=['Description','Tradespeople','Category','Unit','Hours','Price (£ excl. VAT)','Page','Source row','Source image','Review note'];
test('labour price imported without double-counting as materials',()=>{
 const x=prepareMasterRateImport([['Title'],head,['Paint wall','Painter','Decoration','m2',1.29,56.44,2,3,'IMG.png','']]);
 assert.equal(x.ready.length,1); assert.equal(x.needsReview.length,0);
 const r=x.ready[0]; assert.equal(r.unit,'m²'); assert.equal(r.material_rate,0); assert.equal(r.plant_rate,0);
 assert.ok(Math.abs(r.labour_hours*r.labour_rate-56.44)<0.000001);
 assert.equal(r.updated_at,null);
});
test('missing prices and hours, zero-cost items and review notes are excluded',()=>{
 const x=prepareMasterRateImport([head,['A','Labourer','','each',3,'',1,1,'',''],['B','Labourer','','m2','',20,2,1,'',''],['C','Labourer','','m3',0,0,3,1,'',''],['D','Painter','','m2',2,80,4,1,'','Description unclear']]);
 assert.equal(x.total,4); assert.equal(x.ready.length,0); assert.equal(x.needsReview.length,4);
});
test('ambiguous same description/unit variants are never automatically matched',()=>{
 const x=prepareMasterRateImport([head,['A','Painter','','m2',1,43.75,1,1,'',''],['A','Painter','','m²',2,87.5,2,1,'',''],['B','Painter','','each',1,43.75,3,1,'','']]);
 assert.equal(x.ready.length,1); assert.equal(x.needsReview.length,2); assert.equal(rateMatchKey(x.ready[0]),'b|nr');
});
test('wrong sheet gets clear error',()=>assert.throws(()=>prepareMasterRateImport([['Foo','Bar']]),/Expected/));
