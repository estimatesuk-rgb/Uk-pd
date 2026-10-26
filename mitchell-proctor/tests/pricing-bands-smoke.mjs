import {strict as assert} from 'node:assert';
import {makePricingDefaults,resolvePricingDefaults,PROJECT_BANDS,BAND_IDS} from '../src/pricing-defaults.mjs';
import {calculateProfessionalFee,proposalFeeLines} from '../src/fee-math.mjs';
const defaults=makePricingDefaults();
assert.deepEqual(BAND_IDS,['micro','small','medium','large','extra']);
assert.equal(PROJECT_BANDS.length,5);
assert.equal(defaults.stages.length,5);assert.equal(defaults.extras.length,12);
for(const item of [...defaults.stages,...defaults.extras])for(const band of BAND_IDS){
  assert.equal(typeof item.bandFees[band],'number');
  assert.ok(item.bandFees[band]>=0);
}
const sample=()=>({
 area:150,feeMode:'band',pricingBand:'large',
 stages:defaults.stages.map(item=>({...item,bandFees:{...item.bandFees},quotedFee:null})),
 extras:defaults.extras.map(item=>({...item,bandFees:{...item.bandFees},quotedFee:null})),
 adjustments:[]
});
let p=sample();
assert.equal(calculateProfessionalFee(p),9100,'large band: design 1900 + planning 3000 + technical 4200');
p.pricingBand='micro';assert.equal(calculateProfessionalFee(p),2800);
p.pricingBand='small';assert.equal(calculateProfessionalFee(p),3800);
p.pricingBand='medium';assert.equal(calculateProfessionalFee(p),5400);
p.pricingBand='extra';assert.equal(calculateProfessionalFee(p),11900);
p=sample();p.stages.find(x=>x.id==='planning').quotedFee=3500;
p.extras.find(x=>x.id==='survey').selected=true;
p.adjustments=[{description:'Repeat client credit',kind:'omission',amount:200}];
assert.equal(calculateProfessionalFee(p),1900+3500+4200+850-200);
assert.equal(Math.round(proposalFeeLines(p).reduce((v,x)=>v+x.fee,0)*100)/100,calculateProfessionalFee(p));
p=sample();p.feeMode='bespoke';p.pricingBand='';
for(const x of p.stages)x.quotedFee=200;
assert.equal(calculateProfessionalFee(p),600);
p=sample();p.feeMode='sqm';p.area=10;
assert.equal(calculateProfessionalFee(p),2750,'legacy minimum 25 sq m x 110');
p.area=150;assert.equal(calculateProfessionalFee(p),16500,'150 x 110 legacy price preserved');
const legacy=resolvePricingDefaults({stages:[{id:'planning',rate:57,selected:true}],extras:[{id:'survey',amount:1250,selected:true}]});
assert.equal(legacy.stages.find(x=>x.id==='planning').rate,57);
assert.equal(legacy.extras.find(x=>x.id==='survey').amount,1250);
assert.equal(legacy.stages[0].bandFees.micro,600);
const custom=resolvePricingDefaults({feeMode:'band',stages:[{id:'planning',bandFees:{large:3500}}]});
assert.equal(custom.stages.find(x=>x.id==='planning').bandFees.large,3500);
assert.equal(custom.stages.find(x=>x.id==='technical').bandFees.extra,5500);
console.log('Band fee smoke passed: 5 price bands, 17 line prices, overrides, bespoke, extras, legacy £/m² preservation.');
