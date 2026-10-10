import test from 'node:test';
import assert from 'node:assert/strict';
import {drawingRevisionIssues,activityDrawingIssues} from '../src/RamsEvidence.js';

const d=(id,revision,status='Current',path=id+'.pdf')=>({id,revision,status,file_path:path,document_no:id+'.pdf'});
const snap=(id,revision,path=id+'.pdf')=>({id,revision,file_path:path,label:id+'.pdf'});

test('unchanged drawing snapshot permits revision evidence to remain current',()=>{
 assert.deepEqual(drawingRevisionIssues({document_snapshot:[snap('a','A')]},[d('a','A')]),[]);
});
test('new, revised and replaced drawing sources require review',()=>{
 const cases=[[d('a','B'),'revision'],[d('b','A'),'revision'],[d('a','A','Current','replacement.pdf'),'revision']];
 for(const [drawing,expected] of cases)assert.ok(drawingRevisionIssues({document_snapshot:[snap('a','A')]},[drawing]).some(x=>x.includes(expected)));
});
test('drawing removed or made superseded requires review',()=>{
 assert.ok(drawingRevisionIssues({document_snapshot:[snap('a','A')]},[]).some(x=>x.includes('removed')));
 assert.ok(drawingRevisionIssues({document_snapshot:[snap('a','A')]},[d('a','A','Superseded')]).some(x=>x.includes('removed')));
});
test('prior unversioned analysis must be re-analysed',()=>{
 assert.ok(drawingRevisionIssues({files_read:['a.pdf']},[d('a','A')]).some(x=>x.includes('verification unavailable')));
});
test('current activity link with matching revision passes',()=>{
 assert.deepEqual(activityDrawingIssues([{documentId:'a',revision:'A',name:'a.pdf'}],[d('a','A')],'Roof'),[]);
});
test('activity source missing, superseded or changed is blocked',()=>{
 const source=[{documentId:'a',revision:'A',name:'a.pdf'}];
 assert.ok(activityDrawingIssues(source,[d('a','B')],'Roof').some(x=>x.includes('out of date')));
 assert.ok(activityDrawingIssues(source,[],'Roof').some(x=>x.includes('no longer current')));
 assert.ok(activityDrawingIssues(source,[d('a','A','Superseded')],'Roof').some(x=>x.includes('no longer current')));
});
