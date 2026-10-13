import test from 'node:test';
import assert from 'node:assert/strict';
import {validateDrawingPackage,validateObservedDrawingPackage,verifiedAutoStage} from '../src/drawingPackageGate.mjs';

const docs=[{id:'existing',document_no:'Existing Ground Floor.pdf'},
 {id:'proposed',document_no:'Proposed Ground Floor.pdf'},
 {id:'notes',document_no:'Specification.pdf'}];
const stages={existing:'Existing',proposed:'Proposed',notes:'Detail / Supporting'};
const pages=[{classification:'Existing'},{classification:'Proposed'},{classification:'Detail / Supporting'}];

test('comparison mode requires declared existing and proposed source drawings',()=>{
 assert.equal(validateDrawingPackage('comparison',docs,stages).ok,true);
 assert.match(validateDrawingPackage('',docs,stages).error,/Choose Existing/);
 assert.match(validateDrawingPackage('comparison',docs,{proposed:'Proposed',notes:'Detail / Supporting'}).error,/Classify every/);
 assert.match(validateDrawingPackage('comparison',[docs[1]],{proposed:'Proposed'}).error,/Existing drawing/);
 assert.match(validateDrawingPackage('comparison',[docs[0]],{existing:'Existing'}).error,/At least one drawing/);
});

test('new build cannot silently be selected for an existing or demolition project',()=>{
 assert.equal(validateDrawingPackage('new-build',[docs[1]],{proposed:'Proposed'}).ok,true);
 assert.match(validateDrawingPackage('new-build',docs,stages).error,/cannot include/);
 assert.match(validateDrawingPackage('new-build',docs.slice(1),{proposed:'Proposed',notes:'Demolition'}).error,/cannot include/);
});

test('mixed existing/proposed file requires observed pages for comparison but never autoruns mixed markings',()=>{
 const combined=[{id:'combined',document_no:'Combined Plans.pdf'}];
 assert.equal(validateDrawingPackage('comparison',combined,{combined:'Mixed existing/proposed'}).ok,true);
 assert.equal(verifiedAutoStage('Mixed existing/proposed','Proposed'),'Unclassified');
 assert.equal(verifiedAutoStage('Mixed existing/proposed','Demolition'),'Unclassified');
});

test('AI not recognising existing work must stop instead of using new-build fallback',()=>{
 assert.equal(validateObservedDrawingPackage('comparison',pages).ok,true);
 assert.match(validateObservedDrawingPackage('comparison',[{classification:'Proposed'}]).error,/did not identify an existing drawing/);
 assert.match(validateObservedDrawingPackage('comparison',[{classification:'Existing'}]).error,/did not identify a proposed drawing/);
 assert.match(validateObservedDrawingPackage('comparison',[]).error,/No drawings/);
});

test('new-build mode stops when AI finds existing or demolition work',()=>{
 assert.equal(validateObservedDrawingPackage('new-build',[{classification:'Proposed'}]).ok,true);
 assert.match(validateObservedDrawingPackage('new-build',pages).error,/detected existing or demolition/);
 assert.match(validateObservedDrawingPackage('new-build',[{classification:'Demolition'}]).error,/detected existing or demolition/);
});

test('measure only when the manual register and AI stage agree exactly',()=>{
 assert.equal(verifiedAutoStage('Proposed','Proposed'),'Proposed');
 assert.equal(verifiedAutoStage('Demolition','Demolition'),'Demolition');
 for(const stage of ['Existing','Detail / Supporting','Unclassified','Mixed existing/proposed'])
  assert.equal(verifiedAutoStage(stage,'Proposed'),'Unclassified');
 assert.equal(verifiedAutoStage('Existing','Proposed'),'Unclassified');
 assert.equal(verifiedAutoStage('Proposed','Demolition'),'Unclassified');
 assert.equal(verifiedAutoStage('Demolition','Proposed'),'Unclassified');
});
