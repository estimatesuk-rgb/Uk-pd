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
  section('function repeatWorkKey(line){','function fillIdenticalWorkLines(index,code){')
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
function makeEngine(lines=[],client='Council A'){
  const state={lines,client};
  const prefix=[
    'const rates=rows,codes=new Map(rows.map(r=>[r.code,r]));',
    "const $=()=>({value:state.client,textContent:''});",
    'const reviewSourceLines=()=>state.lines;',
    'const reviewAction=()=>{};',
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
    'rememberHumanApproval,approvedRateForLine,verifiedRateForLine,',
    'repeatWorkKey,disableLearnedAfterUndo,approvalKey,matchRatebookSignature};'
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
