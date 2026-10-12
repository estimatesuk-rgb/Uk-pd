import test from 'node:test';
import assert from 'node:assert/strict';
import {isAiReanalysis,stageAiTakeoff,decideAiSuggestion} from '../src/aiTakeoffQueue.mjs';
const saved={items:[{id:'a',ref_no:'001',description:'kitchen extension',quantity:107.13,
 ai_auto_key:'old-1',unit:'m²',drawing:'drawing01 p1',
 takeoff_evidence:{automatic:true,drawing_id:'doc1',page:1,region:{x:.1,y:.1,w:.4,h:.3}}}],
 highlights:[{id:'existing',drawing_id:'doc1',page:1}],ai_last_analysed_at:'2026-10-12T11:00:00Z'};
const newItem={id:'b',ref_no:'002',description:'New kitchen area',unit:'m²',quantity:107.13,
 ai_auto_key:'new-1',drawing:'drawing01 p1',
 takeoff_evidence:{automatic:true,highlight_id:'mark-b',drawing_id:'doc1',page:1,region:{x:.1,y:.1,w:.4,h:.3}}};
const mark={id:'mark-b',drawing_id:'doc1',page:1,x:.1,y:.1,w:.4,h:.3};
test('first analysis may build provisional draft, saved reanalysis never modifies BOQ/highlights',()=>{
 assert.equal(isAiReanalysis({items:[]}),false);
 const first=stageAiTakeoff({items:[],highlights:[]},[],[newItem],[mark]);
 assert.equal(first.items.length,1);assert.equal(first.highlights.length,1);
 const rerun=stageAiTakeoff(saved,[],[newItem],[mark]);
 assert.strictEqual(rerun.items,saved.items);assert.strictEqual(rerun.highlights,saved.highlights);
 assert.equal(rerun.ai_pending_takeoff.length,1);
 assert.equal(rerun.ai_review_mode,'rerun-review');
});
test('rerunning again cannot multiply exact same queued observation',()=>{
 const first=stageAiTakeoff(saved,[],[newItem],[mark]);
 const twice=stageAiTakeoff({...saved,ai_pending_takeoff:first.ai_pending_takeoff},[],[newItem],[mark]);
 assert.equal(twice.ai_pending_takeoff.length,1);assert.equal(twice.staged_count,0);
});
test('prior unmeasured AI scope is also queued on reanalysis',()=>{
 const scope={id:'scope-1',description:'New window',quantity:0,ai_draft_key:'new-window'};
 const r=stageAiTakeoff(saved,[scope],[],[]);
 assert.equal(r.items.length,1);assert.equal(r.ai_pending_takeoff[0].kind,'scope');
});
test('duplicate geometry is not silently approved by a user click',()=>{
 const r=stageAiTakeoff(saved,[],[newItem],[mark]);
 const decided=decideAiSuggestion({...saved,ai_pending_takeoff:r.ai_pending_takeoff},'b','add');
 assert.match(decided.error,/existing measured item/i);
});
test('distinct pending outline may be explicitly selected but still provisional',()=>{
 const item={...newItem,id:'c',ai_auto_key:'new-2',
 takeoff_evidence:{...newItem.takeoff_evidence,highlight_id:'mark-c',region:{x:.7,y:.7,w:.1,h:.1}}};
 const distinct={...mark,id:'mark-c',x:.7,y:.7,w:.1,h:.1};
 const r=stageAiTakeoff(saved,[],[item],[distinct]);
 const result=decideAiSuggestion({...saved,ai_pending_takeoff:r.ai_pending_takeoff},'c','add');
 assert.equal(result.error,undefined);
 assert.equal(result.next.items.length,2);
 assert.equal(result.next.items[1].ref_no,'002');
 assert.match(result.next.items[1].status,/verification still required/);
 assert.equal(result.next.highlights.length,2);
});
test('dismissing candidate only removes the queue entry, not the estimate',()=>{
 const r=stageAiTakeoff(saved,[],[newItem],[mark]);
 const result=decideAiSuggestion({...saved,ai_pending_takeoff:r.ai_pending_takeoff},'b','dismiss');
 assert.equal(result.next.items.length,1);
 assert.equal(result.next.highlights.length,1);
 assert.equal(result.next.ai_pending_takeoff.length,0);
});
test('unknown candidate, missing geometry, and invalid action are rejected',()=>{
 assert.equal(decideAiSuggestion(saved,'x','add').error,'Suggestion not in the review queue');
 assert.equal(decideAiSuggestion({...saved,ai_pending_takeoff:[{id:'x',kind:'measured',item:newItem}]},'x','add').error.includes('missing drawing mark'),true);
 assert.equal(decideAiSuggestion(saved,'x','overwrite').error,'Unsupported decision');
});

test('first run holds flagged elevation quantities instead of immediately entering BOQ',()=>{
 const flagged={...newItem,id:'suspicious',description:'proposed right elevation',quantity:296,
  takeoff_evidence:{...newItem.takeoff_evidence,highlight_id:'risk-mark',
   quality_flags:['Elevation view label is not billable work']}};
 const pendingMark={...mark,id:'risk-mark'};
 const result=stageAiTakeoff({items:[],highlights:[]},[],[flagged],[pendingMark]);
 assert.equal(result.items.length,0);
 assert.equal(result.highlights.length,0);
 assert.equal(result.ai_pending_takeoff.length,1);
 assert.equal(result.ai_pending_takeoff[0].item.description,'proposed right elevation');
 assert.deepEqual(result.ai_pending_takeoff[0].item.takeoff_evidence.quality_flags,
  ['Elevation view label is not billable work']);
});
test('a first run with both sound and suspicious marks saves only sound draft lines',()=>{
 const suspicious={...newItem,id:'suspect',takeoff_evidence:{...newItem.takeoff_evidence,
 quality_flags:['Review boundary']}};
 const clean={...newItem,id:'legit',ai_auto_key:'legit-key',quantity:6,
 takeoff_evidence:{...newItem.takeoff_evidence,highlight_id:'legit-mark',quality_flags:[]}};
 const result=stageAiTakeoff({items:[],highlights:[]},[],[suspicious,clean],
 [mark,{...mark,id:'legit-mark'}]);
 assert.equal(result.items.length,1);
 assert.equal(result.items[0].id,'legit');
 assert.deepEqual(result.highlights.map(h=>h.id),['legit-mark']);
 assert.equal(result.ai_pending_takeoff.length,1);
});
