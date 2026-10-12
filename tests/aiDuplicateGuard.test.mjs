import test from 'node:test';
import assert from 'node:assert/strict';
import {duplicateAutoCandidate} from '../src/aiDuplicateGuard.mjs';
const entry={document_id:'docA',page:1,filename:'BR01.pdf',key:'new-key',unit:'m²',quantity:107.13,mark:{name:'New kitchen extension',x:.2,y:.1,w:.4,h:.3}};
const row={description:'kitchen extension',drawing:'BR01.pdf p1',unit:'m²',quantity:107.13,
 takeoff_evidence:{automatic:true,drawing_id:'docA',page:1,region:{x:.201,y:.102,w:.405,h:.298}}};
test('a second AI run cannot add nearly identical kitchen area',()=>{
 assert.equal(duplicateAutoCandidate(entry,[row]).duplicate,true);
});
test('conflicting quantity from same marked area held for review instead of overwritten',()=>{
 const x=duplicateAutoCandidate({...entry,quantity:95},[row]);
 assert.equal(x.duplicate,true);assert.match(x.reason,/Conflicting/);
});
test('another drawing page or floor is a distinct measured area',()=>{
 assert.equal(duplicateAutoCandidate({...entry,page:2},[row]).duplicate,false);
 assert.equal(duplicateAutoCandidate({...entry,document_id:'docB'},[row]).duplicate,false);
});
test('different work or distinct areas must not be suppressed',()=>{
 assert.equal(duplicateAutoCandidate({...entry,mark:{...entry.mark,x:.77,y:.73}},[row]).duplicate,false);
 assert.equal(duplicateAutoCandidate({...entry,mark:{...entry.mark,name:'Reinforced beam'}},[row]).duplicate,false);
});
test('legacy hand-entered prices or scoped tasks are never auto-rejected on fuzzy text alone',()=>{
 assert.equal(duplicateAutoCandidate(entry,[{...row,takeoff_evidence:{}}]).duplicate,false);
});
test('exact saved auto key cannot recur',()=>{
 assert.equal(duplicateAutoCandidate(entry,[{...row,ai_auto_key:'new-key'}]).duplicate,true);
});
