import test from 'node:test';import assert from 'node:assert/strict';
import {classifyChangeEvidence,validateDraftChange} from '../src/drawingChangeGate.mjs';
const pages=[{classification:'Existing'},{classification:'Proposed'}];
const candidate={filename:'proposed.pdf',page:1,mark:{name:'New wall'}};
const change={classification:'New',confidence:'high',element:'New wall',proposed_source:'proposed.pdf p1'};
test('retained or uncertain work never enters automatic takeoff',()=>{
 for(const classification of ['Retained unchanged','Uncertain'])assert.equal(classifyChangeEvidence(pages,[{...change,classification}],candidate).approved,false);
});
test('only an exact high-confidence page and element match qualifies',()=>{
 assert.equal(classifyChangeEvidence(pages,[change],candidate).approved,true);
 assert.equal(classifyChangeEvidence(pages,[{...change,proposed_source:'proposed.pdf p10'}],candidate).approved,false);
 assert.equal(classifyChangeEvidence(pages,[{...change,element:'New wall in another room'}],candidate).approved,false);
 assert.equal(classifyChangeEvidence(pages,[{...change,confidence:'medium'}],candidate).approved,false);
 assert.equal(classifyChangeEvidence(pages,[change,change],candidate).approved,false);
});
test('draft scope requires exact source and classification',()=>{
 const draft={description:'New wall',drawing_reference:'proposed.pdf p1'};
 assert.equal(validateDraftChange(pages,[change],draft),true);
 assert.equal(validateDraftChange(pages,[change],{...draft,drawing_reference:'proposed.pdf p10'}),false);
 assert.equal(validateDraftChange(pages,[{...change,classification:'Retained unchanged'}],draft),false);
});

test('draft scope fails closed for duplicated or contradictory evidence',()=>{
 const draft={description:'New wall',drawing_reference:'proposed.pdf p1'};
 assert.equal(validateDraftChange(pages,[change,change],draft),false);
 assert.equal(validateDraftChange(pages,[change,{...change,classification:'Retained unchanged'}],draft),false);
 assert.equal(validateDraftChange(pages,[change,{...change,confidence:'low'}],draft),false);
});
