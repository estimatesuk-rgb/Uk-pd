import test from 'node:test';import assert from 'node:assert/strict';
import {uploadedExtension,isCurrentDrawingFile,drawingDisplayName} from '../src/drawingFileTypes.mjs';
test('source filename extension wins over drawing reference',()=>{
 const file={document_no:'A-101',title:'Existing ground floor',file_path:'id/documents/123-existing.PDF',status:'Current'};
 assert.equal(uploadedExtension(file),'pdf');
 assert.equal(isCurrentDrawingFile(file),true);
 assert.equal(drawingDisplayName(file),'A-101');
});
test('supported image formats work even with drawing code instead of filename',()=>{
 for(const extension of ['png','jpeg','jpg','webp'])
  assert.equal(uploadedExtension({document_no:'P-02',file_path:'id/'+extension+'.'+extension}),extension);
});
test('exclude replaced documents and unsupported file types',()=>{
 assert.equal(isCurrentDrawingFile({document_no:'E-01',file_path:'id/e-01.pdf',status:'Superseded'}),false);
 assert.equal(isCurrentDrawingFile({document_no:'E-01',file_path:'id/e-01.docx',status:'Current'}),false);
 assert.equal(isCurrentDrawingFile({document_no:'E-01',status:'Current'}),false);
});
test('query strings in signed or stored paths do not mask the file extension',()=>{
 assert.equal(uploadedExtension({file_path:'path/plan.PDF?download=true'}),'pdf');
});
