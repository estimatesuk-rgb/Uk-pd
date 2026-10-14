import {strict as assert} from 'node:assert';
import {makePricingDefaults,resolvePricingDefaults} from '../src/pricing-defaults.mjs';
const base=makePricingDefaults();
assert.equal(base.stages.length,5);
assert.equal(base.extras.length,12);
assert.equal(new Set(base.stages.map(x=>x.id)).size,5);
assert.equal(new Set(base.extras.map(x=>x.id)).size,12);
assert.equal(base.stages.find(x=>x.id==='technical').rate,55);
assert.equal(base.extras.find(x=>x.id==='conditions').amount,950);
assert.equal(base.minimumArea,25);
const original=resolvePricingDefaults(null);
assert.equal(original.stages.length,5);
assert.equal(original.extras.length,12);
const fromLegacy=resolvePricingDefaults({buildRate:1900,feeVatRate:5,stages:[],extras:[]});
assert.equal(fromLegacy.buildRate,1900);
assert.equal(fromLegacy.feeVatRate,5);
assert.equal(fromLegacy.stages.length,5);
assert.equal(fromLegacy.extras.length,12);
const customised=resolvePricingDefaults({buildRate:2300,validDays:60,contingency:7.5,
 stages:[{id:'technical',rate:73,selected:false},{id:'planning',rate:41,selected:true}],
 extras:[{id:'survey',amount:1250,selected:true},{id:'bng',amount:925,selected:false}]
});
assert.equal(customised.stages.find(x=>x.id==='technical').rate,73);
assert.equal(customised.stages.find(x=>x.id==='technical').selected,false);
assert.equal(customised.stages.find(x=>x.id==='planning').rate,41);
assert.equal(customised.extras.find(x=>x.id==='survey').amount,1250);
assert.equal(customised.extras.find(x=>x.id==='survey').selected,true);
assert.equal(customised.extras.find(x=>x.id==='bng').amount,925);
assert.equal(customised.stages.find(x=>x.id==='design').rate,20);
assert.equal(customised.contingency,7.5);
assert.equal(customised.validDays,60);
customised.stages[0].rate=900;
assert.equal(makePricingDefaults().stages[0].rate,20);
const protectedMin=resolvePricingDefaults({minimumArea:0});
assert.equal(protectedMin.minimumArea,25);
console.log('Pricing defaults test passed: all 5 stages and 12 extras, stored overrides, legacy migration and fixed minimum');
