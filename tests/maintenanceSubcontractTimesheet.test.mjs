import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Synthetic rate data only: never publish a customer's licensed V8 ratebook.
const html=readFileSync(new URL('../public/maintenance/index.html',import.meta.url),'utf8');
const start=html.indexOf('function normaliseSubcontractTimesheet(original){');
const end=html.indexOf('function renderSubcontractTimesheet(){',start);
assert.ok(start>=0&&end>start,'Subcontractor model and timesheet helpers exist');
const source=html.slice(start,end);

const rates=[
 {code:'100001',description:'Renew internal door',unit:'IT',trade:'Joinery',labour:120,smv:90,smvMethod:'V8'},
 {code:'200001',description:'Plaster repair',unit:'SM',trade:'Plastering',labour:15,smv:60,smvMethod:'Estimated'},
 {code:'300001',description:'Bathroom basket',unit:'IT',trade:'Plumbing',labour:0,smv:0,smvMethod:'Unavailable'}
];
function create({trade='__all__',jobQty=7,rateData={},entries={},includePlaster=true,extra=0}={}){
 const codes=new Map(rates.map(x=>[x.code,x]));
 const job=[{code:'100001',qty:jobQty,snapshot:rates[0]}];
 if(includePlaster)job.push({code:'200001',qty:10,snapshot:rates[1]});
 if(extra)job.push({code:'300001',qty:extra,snapshot:rates[2]});
 const lines=['2 item [Bedroom 1] - Renew internal door','5 item [Bedroom 2] - Renew internal door','10 m2 [Kitchen] - Plaster repair'];
 const matches=new Map([[0,{code:'100001',qty:2}],[1,{code:'100001',qty:5}]]);
 if(includePlaster)matches.set(2,{code:'200001',qty:10});
 const state={trade,contractors:{Joinery:{company:'Example Subcontract Ltd',operative:'Site Team',weekEnding:'2026-10-16'}},rates:rateData,entries};
 const code=[
   "const subcontractTimesheet=state;",
   "const rates=data.rates,job=data.job,codes=data.codes,selectedMatches=data.matches;",
   "const reviewSourceLines=()=>data.lines;",
   "const sourceMapLocation=i=>data.locations[i]||null;",
   "const clean=s=>String(s==null?'':s).trim(),num=v=>Number(v)||0;",
   source,
   "return {buildSubcontractorSheet,subRateInfo,subEntryKey,normaliseSubcontractTimesheet};"
 ].join('\n');
 const factory=new Function('state','data',code);
 const api=factory(state,{rates,job,codes,matches,lines,locations:[
   {sheet:'Void Schedule',row:43},{sheet:'Void Schedule',row:51},{sheet:'Void Schedule',row:61}
 ]});
 return {api,state,lines,job};
}

test('timesheet keeps separate original spreadsheet source rows and completed quantities blank initially',()=>{
 const {api}=create();
 const result=api.buildSubcontractorSheet();
 assert.equal(result.rows.length,3);
 assert.equal(result.rows[0].source,'Void Schedule · Excel row 44');
 assert.equal(result.rows[1].source,'Void Schedule · Excel row 52');
 assert.equal(result.rows[0].quantity,2);
 assert.equal(result.rows[1].quantity,5);
 assert.equal(result.rows[0].completed,null);
 assert.equal(result.rows[0].hours,null);
 assert.equal(result.rows[0].amount,null);
 assert.equal(result.certifiableValue,0);
 assert.equal(result.unagreed,3);
});

test('labour-only rates require explicit agreement and actual work before a payable amount appears',()=>{
 const {api,state,lines}=create({includePlaster:false,rateData:{'100001':{basis:'unit',value:'90',confirmed:true}}});
 let result=api.buildSubcontractorSheet();
 assert.equal(result.certifiableValue,0,'unentered actual completed quantity does not imply completion');
 const key=api.subEntryKey(0,'100001',lines[0]);
 state.entries[key]={completed:'2',hours:'3',note:'Door signed off'};
 result=api.buildSubcontractorSheet();
 assert.equal(result.certifiableValue,180);
 assert.equal(result.rows[1].amount,null);
 assert.equal(result.actualHours,3);
 state.rates['100001'].confirmed=false;
 assert.equal(api.buildSubcontractorSheet().certifiableValue,0,'unapproved rate must not price work');
});

test('hourly subcontract rates use only actual hours, never BoQ quantity or SMV',()=>{
 const {api,state,lines}=create({includePlaster:false,rateData:{'100001':{basis:'hour',value:'25',confirmed:true}}});
 state.entries[api.subEntryKey(0,'100001',lines[0])]={completed:'2',hours:'4.5',note:''};
 const r=api.buildSubcontractorSheet();
 assert.equal(r.certifiableValue,112.5);
 assert.equal(r.rows[0].standardHours,3,'SMV remains a separate reference');
 assert.equal(r.rows[0].terms.basis,'hour');
});

test('a job quantity exceeding matched originals becomes an explicit extra BoQ row, never silently lost',()=>{
 const {api}=create({jobQty:8,includePlaster:false});
 const r=api.buildSubcontractorSheet();
 assert.equal(r.rows.length,3);
 assert.equal(r.rows[2].quantity,1);
 assert.equal(r.rows[2].sourceLinked,false);
 assert.match(r.rows[2].source,/Extra BoQ quantity/);
});

test('too much linked source quantity is flagged for reconciliation',()=>{
 const {api}=create({jobQty:6,includePlaster:false});
 const r=api.buildSubcontractorSheet();
 assert.deepEqual(r.reconciliationIssues,['100001']);
});

test('timesheets filter trades for subcontractor-specific signature forms',()=>{
 const {api}=create({trade:'Joinery'});
 const r=api.buildSubcontractorSheet();
 assert.equal(r.rows.length,2);
 assert.equal(r.viewTrade,'Joinery');
 assert.ok(r.rows.every(x=>x.trade==='Joinery'));
 assert.equal(r.profile.company,'Example Subcontract Ltd');
});

test('missing labour split requires manual price instead of inventing an agreed subcontract rate',()=>{
 const {api}=create({extra:1});
 const r=api.buildSubcontractorSheet(),plumbing=r.rows.find(x=>x.code==='300001');
 assert.equal(plumbing.terms.amount,null);
 assert.equal(plumbing.terms.confirmed,false);
 assert.equal(plumbing.amount,null);
});

test('timesheet data validation preserves blanks for unsigned records',()=>{
 const {api}=create();
 const v=api.normaliseSubcontractTimesheet({entries:{alpha:{completed:'',hours:'',note:'Check'},beta:{completed:'3',hours:'4.5'}}});
 assert.equal(v.entries.alpha.completed,'');
 assert.equal(v.entries.alpha.hours,'');
 assert.equal(v.entries.beta.completed,'3');
 assert.equal(v.entries.beta.hours,'4.5');
});

test('print report, Excel sign-off, and job persistence controls are wired',()=>{
 for(const id of ['sub-preview','sub-export','sub-print','sub-preview-excel','sub-close','sub-trade','sub-work','sub-rates']){
  assert.match(html,new RegExp('id="'+id+'"'));
 }
 assert.match(html,/subcontractTimesheet:JSON\.parse\(JSON\.stringify\(subcontractTimesheet\)\)/);
 assert.match(html,/function appendSubcontractorSheet\(/);
 assert.match(html,/function renderSubcontractPaper\(/);
 assert.match(html,/Subcontractor \/ operative signature/);
 assert.match(html,/Site supervisor signature/);
 assert.match(html,/Approved\?/);
 assert.match(html,/row\.getCell\(11\)\.value=\{formula:/);
});
