import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Synthetic test rates only. Real customer M3/NHF ratebook data is never published.
const html=readFileSync(new URL('../public/maintenance/index.html',import.meta.url),'utf8');
function section(start,end){
  const a=html.indexOf(start),b=html.indexOf(end,a);
  assert.ok(a>=0&&b>a,'Expected maintenance source anchors: '+start);
  return html.slice(a,b);
}
const helpers=[
  section('function findQty(line){','const STOP_MATCH_WORDS='),
  section('const STOP_MATCH_WORDS=','function scopeConflict(source,rate){'),
  section('function scopeConflict(source,rate){','const APPROVED_MATCH_STORE='),
  section('const APPROVED_MATCH_STORE=','const EXACT_RATE_INDEX=new Map();'),
  section('const EXACT_RATE_INDEX=new Map();','function applyExactMatches(){'),
  section('function repeatWorkKey(line){','function reviewAction(message,bad=false){'),
  section('function switchReviewRate(index,code,qty){','function renderReviewSuggestions(){')
].join('\n');

const sample=[
  {code:'100001',description:'Renew internal door including hinges',medium:'Renew internal door including hinges',unit:'IT',trade:'Joinery',rate:185},
  {code:'100002',description:'Renew FD30 fire door',medium:'Renew FD30 fire door',unit:'IT',trade:'Joinery',rate:375},
  {code:'100003',description:'Renew internal door with lock',medium:'Renew internal door with lock',unit:'IT',trade:'Joinery',rate:200},
  {code:'110001',description:'12.5mm plasterboard and skim ceilings',unit:'SM',trade:'Plaster',rate:55},
  {code:'110002',description:'15mm plasterboard and skim ceilings',unit:'SM',trade:'Plaster',rate:65},
  {code:'120001',description:'Repair timber door',unit:'IT',trade:'Joinery',rate:60},
  {code:'120002',description:'Repair upvc door',unit:'IT',trade:'Joinery',rate:75},
  {code:'130001',description:'Renew internal door',unit:'SM',trade:'Joinery',rate:120}
];
function makeEngine(lines=[],client='Council A',jobId='UKM-000001'){
  const state={lines,client,jobId};
  const prefix=[
    'const rates=rows,codes=new Map(rows.map(r=>[r.code,r]));',
    "const $=()=>({value:state.client,textContent:''});",
    'const reviewSourceLines=()=>state.lines;',
    'const clean=x=>String(x==null?\'\':x).trim();',
    'const reviewAction=()=>{};',
    'const selectedMatches=new Map(),job=[];',
    'const confirm=()=>true,save=()=>{},persistReviewSelections=()=>{},renderReviewSuggestions=()=>{};',
    'const activeJobId=state.jobId;',
    'const REVIEW_RANK_CACHE={clear:()=>{}};',
    'const setTimeout=fn=>{fn();return 1},clearTimeout=()=>{};',
    'const put=()=>Promise.resolve(),get=()=>Promise.resolve([]);'
  ].join('\n');
  const suffix=[
    'for(const r of rates){r._shortTokens=new Set(matchWords(r.description));',
    "r._extraTokens=new Set(matchWords([r.medium,r.long,r.trade,r.section].join(' ')));}",
    'rebuildExactRateIndex();',
    'activeLibrarySignature=matchRatebookSignature(rates);',
    'return {findQty,matchUnits,scopeConflict,rankedRateMatches,safeExactMatch,',
    'rememberHumanApproval,approvedRateForLine,verifiedRateForLine,resolveMatchingConflict,',
    'repeatWorkKey,fillIdenticalWorkLines,switchReviewRate,job,selectedMatches,matchingCustomerKey,',
    'disableLearnedAfterUndo,approvalKey,matchRatebookSignature};'
  ].join('\n');
  const factory=new Function('rows','state',prefix+'\n'+helpers+'\n'+suffix);
  return {engine:factory(sample.map(x=>({...x})),state),state};
}

test('full specification and matching review actions exist',()=>{
  assert.match(html,/function reviewSourceLines\(\)\{[\s\S]*?filter\(s=>s.length>=3\);/);
  assert.ok(!html.includes('filter(s=>s.length>=3).slice(0,160)'));
  assert.match(html,/id="review-exact"/);
  assert.match(html,/id="review-next-unpriced"/);
  assert.match(html,/id="matching-learn-status"/);
  assert.match(html,/REUSED APPROVED MATCH/);
});

test('repeated room activities normalise without merging different door ratings',()=>{
  const {engine:e}=makeEngine();
  assert.equal(e.repeatWorkKey('1 item [Bedroom 1] — Renew internal door'),
               e.repeatWorkKey('6 item [Bedroom 2] — Renew internal door'));
  assert.notEqual(e.repeatWorkKey('1 item [Bedroom 1] — Renew internal door'),
                  e.repeatWorkKey('1 item [Bedroom 2] — Renew FD30 fire door'));
});

test('critical conflicts block wrong thickness, fire rating, material and action',()=>{
  const {engine:e}=makeEngine();
  assert.equal(e.scopeConflict('7 m2 [Kitchen] — 12.5mm plasterboard and skim ceilings',sample[4]),true);
  assert.equal(e.scopeConflict('1 item [Bedroom] — Renew internal door',sample[1]),true);
  assert.equal(e.scopeConflict('1 item [Bedroom] — Repair timber door',sample[6]),true);
  assert.equal(e.scopeConflict('1 item [Bedroom] — Renew internal door',sample[5]),true);
  assert.equal(e.scopeConflict('7 m2 [Kitchen] — 12.5mm plasterboard and skim ceilings',sample[3]),false);
});

test('unit mismatch blocks an exact rate and learned entry',()=>{
  const {engine:e}=makeEngine(['2 item [Bedroom 1] — Renew internal door']);
  assert.equal(e.safeExactMatch('2 kg Renew internal door'),null);
  assert.equal(e.rememberHumanApproval(0,'130001'),false);
  assert.equal(e.approvedRateForLine('2 item [Bedroom 2] — Renew internal door'),null);
});

test('one approved choice applies to the same work in other rooms and synonyms',()=>{
  const {engine:e}=makeEngine(['1 item [Bedroom 1] — Renew internal door']);
  assert.equal(e.rememberHumanApproval(0,'100001'),true);
  const reused=e.verifiedRateForLine('5 item [Bedroom 4] — Replace internal door');
  assert.equal(reused.rate?.code,'100001');
  assert.equal(reused.kind,'learned');
  assert.equal(e.findQty('5 item [Bedroom 4] — Replace internal door').qty,5);
  assert.equal(e.verifiedRateForLine('1 item [Bathroom] — Renew FD30 fire door').rate?.code,'100002');
});

test('approved choices are isolated between customers',()=>{
  const {engine:e,state}=makeEngine(['2 item [Bedroom 1] — Renew internal door']);
  assert.ok(e.rememberHumanApproval(0,'100001'));
  state.client='Different Council';
  assert.equal(e.verifiedRateForLine('3 item [Bedroom 2] — Renew internal door').rate,null);
  state.client='Council A';
  assert.equal(e.verifiedRateForLine('3 item [Bedroom 2] — Renew internal door').rate.code,'100001');
});

test('No / Item synonyms retain the approved rate and distinct measured quantities',()=>{
  const {engine:e}=makeEngine(['1 no [Bedroom 1] — Renew internal door']);
  assert.equal(e.rememberHumanApproval(0,'100001'),true);
  const result=e.verifiedRateForLine('5 item [Bedroom 2] — Replace internal door');
  assert.equal(result.rate?.code,'100001');
  assert.equal(result.kind,'learned');
  assert.equal(e.findQty('5 item [Bedroom 2] — Replace internal door').qty,5);
});

test('description survives room-first and quantity-first layouts',()=>{
  const {engine:e}=makeEngine();
  assert.equal(e.repeatWorkKey('2 item [Bedroom 1] — Renew internal door'),
               e.repeatWorkKey('[Bedroom 2] — 4 item Renew internal door'));
});

test('conflicting approvals disable automatic reuse',()=>{
  const {engine:e}=makeEngine(['1 item [Bedroom 1] — Renew internal door']);
  assert.equal(e.rememberHumanApproval(0,'100001'),true);
  assert.equal(e.rememberHumanApproval(0,'100003'),true);
  const blocked=e.verifiedRateForLine('2 item [Bedroom 2] — Renew internal door');
  assert.equal(blocked.rate,null);
  assert.equal(blocked.kind,'conflict');
});

test('undo revokes the previously taught SOR',()=>{
  const line='2 item [Bedroom 1] — Renew internal door';
  const {engine:e}=makeEngine([line]);
  assert.equal(e.rememberHumanApproval(0,'100001'),true);
  e.disableLearnedAfterUndo(line,'100001');
  assert.equal(e.verifiedRateForLine('3 item [Bedroom 2] — Renew internal door').kind,'conflict');
});

test('vague or unmeasured activities do not teach or auto-price',()=>{
  const {engine:e}=makeEngine(['Renew internal door','Kitchen','1 item Bathroom']);
  assert.equal(e.rememberHumanApproval(0,'100001'),false);
  assert.equal(e.approvalKey('Kitchen'),null);
  assert.equal(e.approvalKey('1 item Bathroom'),null);
  assert.equal(e.safeExactMatch('1 m2 New internal door'),null);
});

test('explicit SOR codes with contradictory descriptions are not auto-approved',()=>{
  const {engine:e}=makeEngine();
  assert.equal(e.safeExactMatch('10 m2 12.5mm plasterboard and skim ceilings SOR 110002'),null);
  assert.equal(e.safeExactMatch('10 m2 12.5mm plasterboard and skim ceilings SOR 110001')?.code,'110001');
});

test('price changes do not invalidate approval memory fingerprint',()=>{
  const {engine:e}=makeEngine();
  const edited=sample.map(r=>({...r,rate:r.rate*1.1}));
  assert.equal(e.matchRatebookSignature(sample),e.matchRatebookSignature(edited));
});

test('repeated activities populate across different room and quantity layouts without wrong units',()=>{
  const lines=[
    '1 item [Bedroom 1] — Renew internal door',
    '[Bedroom 2] 2 item Renew internal door',
    'Bedroom 3: 4 item Renew internal door',
    '1 item [Bedroom 4] — Renew FD30 fire door',
    '3 m2 [Bedroom 5] — Renew internal door'
  ];
  const {engine:e}=makeEngine(lines);
  assert.equal(e.repeatWorkKey(lines[0]),e.repeatWorkKey(lines[1]));
  assert.equal(e.repeatWorkKey(lines[0]),e.repeatWorkKey(lines[2]));
  assert.notEqual(e.repeatWorkKey(lines[0]),e.repeatWorkKey(lines[3]));
  e.job.push({code:'100001',qty:1});
  e.selectedMatches.set(0,{code:'100001',qty:1});
  const repeated=e.fillIdenticalWorkLines(0,'100001');
  assert.equal(repeated,2);
  assert.equal(e.job[0].qty,7); // 1 + 2 + 4, never includes m2 or fire-rated door.
  assert.equal(e.selectedMatches.size,3);
  assert.equal(e.selectedMatches.get(1).qty,2);
  assert.equal(e.selectedMatches.get(2).qty,4);
  assert.ok(!e.selectedMatches.has(3)&&!e.selectedMatches.has(4));
});

test('manual choice cannot silently force incorrect SOR unit or dangerous scope',()=>{
  const lines=['2 item [Bedroom 1] — Renew internal door','1 item [Bedroom 2] — Renew FD30 fire door'];
  const {engine:e,state}=makeEngine(lines);
  assert.equal(e.switchReviewRate(0,'130001',2),false); // IT vs SM
  assert.equal(e.switchReviewRate(1,'100001',1),false); // fire-rated vs ordinary
  assert.equal(e.job.length,0);
  assert.equal(e.selectedMatches.size,0);
});

test('previously conflicting approved codes can only be reused after explicit human resolution',()=>{
  const {engine:e}=makeEngine(['1 item [Bedroom 1] — Renew internal door']);
  assert.equal(e.rememberHumanApproval(0,'100001'),true);
  assert.equal(e.rememberHumanApproval(0,'100003'),true);
  assert.equal(e.verifiedRateForLine('5 item [Bedroom 2] — Renew internal door').kind,'conflict');
  e.selectedMatches.set(0,{code:'100003',qty:1});
  assert.equal(e.resolveMatchingConflict(0),true);
  assert.equal(e.verifiedRateForLine('5 item [Bedroom 2] — Renew internal door').rate?.code,'100003');
});

test('when client is blank, learned mappings stay job-specific',()=>{
  const one=makeEngine(['1 item [Bedroom 1] — Renew internal door'],'','UKM-000010');
  const two=makeEngine(['1 item [Bedroom 1] — Renew internal door'],'','UKM-000011');
  assert.notEqual(one.engine.matchingCustomerKey(),two.engine.matchingCustomerKey());
  assert.ok(one.engine.matchingCustomerKey().includes('UKM-000010'));
  assert.ok(two.engine.matchingCustomerKey().includes('UKM-000011'));
});

test('conflict resolution and safeguards are visible in maintenance matching controls',()=>{
  assert.match(html,/data-resolve-conflict/);
  assert.match(html,/function resolveMatchingConflict\(/);
  assert.match(html,/priced in.*but this work item is measured/);
  assert.match(html,/function matchingCustomerKey\(\)/);
});
