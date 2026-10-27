import {strict as assert} from 'node:assert';
import {readFileSync} from 'node:fs';
import {makePricingDefaults,resolvePricingDefaults} from '../src/pricing-defaults.mjs';
import {proposalFeeLines,calculateProfessionalFee} from '../src/fee-math.mjs';
import {proposalPdf} from '../src/pdf.mjs';

const catalog=makePricingDefaults();
assert.equal(catalog.feasibilityPercent,0.3);
assert.equal(resolvePricingDefaults({}).feasibilityPercent,0.3);
assert.equal(resolvePricingDefaults({feasibilityPercent:0.25}).feasibilityPercent,0.25);
const project=()=>{
 const fees=makePricingDefaults();
 return {
  area:100,buildRate:2500,buildVatRate:20,feeVatRate:20,feasibilityPercent:0.3,
  contingency:20,feeMode:'band',pricingBand:'medium',
  client:'Example Client',address:'1 Example Street',
  stages:fees.stages.map(s=>({...s,selected:false,quotedFee:null})),
  extras:fees.extras.map(s=>({...s,selected:s.id==='feasibility',quotedFee:null})),
  adjustments:[]
 };
};
let p=project();
assert.equal(calculateProfessionalFee(p),750,'0.3% of £250,000 construction cost is £750');
assert.equal(proposalFeeLines(p)[0].basis,'0.3% of estimated construction cost ex VAT');
p.area=200;assert.equal(calculateProfessionalFee(p),1500);
p.buildRate=1500;assert.equal(calculateProfessionalFee(p),900);
p.contingency=100;p.buildVatRate=0;assert.equal(calculateProfessionalFee(p),900,'construction contingency and VAT do not change feasibility fee');
p.feeMode='sqm';p.area=100;p.buildRate=2500;assert.equal(calculateProfessionalFee(p),750,'percentage applies to £/m² comparison mode');
p.feeMode='bespoke';assert.equal(calculateProfessionalFee(p),750,'percentage applies to bespoke mode without manual override');
p.extras[1].selected=false;
p.extras.find(x=>x.id==='feasibility').quotedFee=999.99;
assert.equal(calculateProfessionalFee(p),999.99,'individual agreed fee can override percentage');
p.extras.find(x=>x.id==='feasibility').selected=false;
assert.equal(calculateProfessionalFee(p),0,'not charged when omitted');
p=project();p.feasibilityPercent=null;
assert.equal(calculateProfessionalFee(p),650,'old saved medium-band quotation keeps legacy fixed feasibility amount');
p.feeMode='sqm';assert.equal(calculateProfessionalFee(p),1250,'old £/m² quotation keeps original £1,250 feasibility amount');
p=project();p.feasibilityPercent=0;assert.equal(calculateProfessionalFee(p),0,'owner may set zero');
p=project();
const lines=proposalFeeLines(p);
assert.equal(lines.reduce((sum,line)=>sum+line.fee,0),calculateProfessionalFee(p));
const row={reference:'MP-2026-99999',payload:JSON.stringify({...p,clientEmail:'client@example.com'}),fee_ex_vat:calculateProfessionalFee(p),client:'Example Client',site_address:'1 Example Street'};
const bytes=await proposalPdf(row);
const header=Buffer.from(bytes).subarray(0,5).toString();
assert.equal(header,'%PDF-','the issued proposal is a valid PDF');
const root=new URL('../',import.meta.url);
const browser=readFileSync(new URL('public/app.html',root),'utf8');
const owner=readFileSync(new URL('public/owner.html',root),'utf8');
const sync=readFileSync(new URL('public/cloud-sync.js',root),'utf8');
assert.match(browser,/function extraFee\(x\)/);
assert.match(browser,/feasibilityPercent/);
assert.match(owner,/name="feasibilityPercent"/);
assert.match(sync,/pricingDefaults\?\.feasibilityPercent/);
console.log('Feasibility checks passed: 0.3% ex VAT, all fee modes, PDF, manual override, legacy preservation and owner settings.');
