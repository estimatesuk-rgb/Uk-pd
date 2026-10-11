import test from 'node:test';
import assert from 'node:assert/strict';
import {scaleSheetRegister,calibrationStatus,missingCalibration} from '../src/calibration.mjs';
const d={id:'drawing-1',file_path:'current/rev-b.pdf',revision:'B'};
const entries=scaleSheetRegister([{d,filename:'Plans.pdf',numPages:3}]);
const key=page=>'drawing-1#'+page;
const checked=page=>({status:'calibrated',source_path:d.file_path,source_revision:d.revision,metres:5,pixelLength:200,metresPerPixel:0.025});
test('every PDF page gets a separate required scale',()=>{
 assert.equal(entries.length,3);
 assert.deepEqual(entries.map(x=>x.page),[1,2,3]);
 assert.equal(missingCalibration(entries,{calibrations:{}}).length,3);
});
test('calibration of one page does not grant scale to other pages',()=>{
 const estimate={calibrations:{[key(1)]:checked(1)}};
 assert.equal(calibrationStatus(entries[0],estimate),'calibrated');
 assert.deepEqual(missingCalibration(entries,estimate).map(x=>x.page),[2,3]);
});
test('a changed revision or source path invalidates a saved scale',()=>{
 const existing={calibrations:{[key(1)]:checked(1)}};
 assert.equal(calibrationStatus({...entries[0],revision:'C'},existing),'needed');
 assert.equal(calibrationStatus({...entries[0],file_path:'new-upload.pdf'},existing),'needed');
});
test('legacy and incomplete calibration cannot masquerade as measured scale',()=>{
 assert.equal(calibrationStatus(entries[0],{calibrations:{[key(1)]:{metresPerPixel:0.01}}}),'needed');
 assert.equal(calibrationStatus(entries[0],{calibrations:{[key(1)]:{...checked(1),pixelLength:0}}}),'needed');
});
test('reference-only requires an explicit saved confirmation',()=>{
 const confirmed={status:'reference-only',source_path:d.file_path,source_revision:d.revision,reference_only_confirmed:true};
 assert.equal(calibrationStatus(entries[0],{calibrations:{[key(1)]:confirmed}}),'reference-only');
 assert.equal(calibrationStatus(entries[0],{calibrations:{[key(1)]:{...confirmed,reference_only_confirmed:false}}}),'needed');
});
test('all eligible pages can pass only with valid saved states',()=>{
 const from={calibrations:{[key(1)]:checked(1),[key(2)]:checked(2),[key(3)]:{status:'reference-only',source_path:d.file_path,source_revision:d.revision,reference_only_confirmed:true}}};
 assert.equal(missingCalibration(entries,from).length,0);
});
