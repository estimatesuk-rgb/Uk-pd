import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareIfcElements,createIfc4Model} from '../src/ifcExport.mjs';
const id='drawing-1',file_path='projects/1/proposed.pdf';
const docs=[{id,file_path,revision:'P02',document_no:'A-101 proposed',status:'Current'}];
const calibration={status:'calibrated',source_path:file_path,source_revision:'P02',
 metresPerPixel:.02,sheet_dimensions_px:[1000,800],crosscheck_verified:true};
const calibrations={[id+'#1']:calibration};
const slab={id:'s',drawing_id:id,page:1,kind:'polygon',name:'Ground floor slab',stage:'Proposed',
 points:[{x:.1,y:.1},{x:.3,y:.1},{x:.3,y:.2},{x:.1,y:.2}]};
const wall={id:'w',drawing_id:id,page:1,kind:'polyline',name:'External wall',stage:'Proposed',
 points:[{x:.1,y:.1},{x:.3,y:.1}]};
const approved={s:{include:true,qs_checked:true,element:'slab',base_m:'0',thickness_m:'0.15',
 evidence:'Drawing A-101 Section A-A 150mm slab'},
 w:{include:true,qs_checked:true,element:'wall',base_m:'0.15',height_m:'2.7',
 thickness_m:'0.3',evidence:'Section B-B wall height 2700mm thickness 300mm'}};
const packageArgs={highlights:[slab,wall],bim_specs:approved,docs,calibrations};
test('only verified independent sheet dimensions and manually accepted geometry create IFC parts',()=>{
 const result=prepareIfcElements(packageArgs);
 assert.deepEqual(result.issues,[]);
 assert.equal(result.ready.length,2);
 assert.equal(result.ready[0].depth,.15);
 assert.equal(result.ready[1].depth,2.7);
 assert.equal(result.ready[0].outline[0].x,2);
 assert.equal(result.ready[0].outline[0].y,-1.6);
});
test('model source is IFC4 with semantic entities, extrusions, metre units and provenance',()=>{
 const result=prepareIfcElements(packageArgs);
 const ifc=createIfc4Model({projectName:'Test Building',elements:result.ready,
  newGuid:()=> '0123456789ABCDEFghijkl',now:new Date('2026-10-13T12:00:00Z')});
 assert.match(ifc,/ISO-10303-21;/);
 assert.match(ifc,/FILE_SCHEMA\(\('IFC4'\)\)/);
 assert.match(ifc,/IFCPROJECT\(/);
 assert.match(ifc,/IFCSLAB\(/);
 assert.match(ifc,/IFCWALL\(/);
 assert.match(ifc,/IFCEXTRUDEDAREASOLID\(/);
 assert.match(ifc,/IFCRELCONTAINEDINSPATIALSTRUCTURE\(/);
 assert.match(ifc,/IFCPROPERTYSET\(/);
 assert.match(ifc,/IFCSIUNIT\(\*,\.LENGTHUNIT\.,\$,\.METRE\.\)/);
});
test('no inferred BIM generated for AI unverified, missing heights or first-only scale',()=>{
 let r=prepareIfcElements({...packageArgs,bim_specs:{s:{...approved.s,qs_checked:false}}});
 assert.equal(r.ready.length,0);
 assert.ok(r.issues.length>0);
 r=prepareIfcElements({...packageArgs,calibrations:{[id+'#1']:{...calibration,crosscheck_verified:false}}});
 assert.equal(r.ready.length,0);
 assert.match(r.issues[0].reason,/second independent/);
 r=prepareIfcElements({...packageArgs,bim_specs:{w:{...approved.w,height_m:''}}});
 assert.equal(r.ready.length,0);
 r=prepareIfcElements({...packageArgs,docs:[{...docs[0],revision:'P03'}]});
 assert.equal(r.ready.length,0);
});
test('different drawing pages cannot be silently combined in same IFC origin',()=>{
 const r=prepareIfcElements({...packageArgs,highlights:[slab,{...wall,id:'w2',page:2}],
  bim_specs:{s:approved.s,w2:approved.w},
  calibrations:{...calibrations,[id+'#2']:{...calibration}}});
 assert.ok(r.issues.some(x=>x.id==='sheets'));
});

test('IFC output preserves exact reviewed metric footprint and wall height',()=>{
 const prepared=prepareIfcElements(packageArgs);
 assert.deepEqual(prepared.issues,[]);
 const slabElement=prepared.ready.find(e=>e.element==='slab');
 const wallElement=prepared.ready.find(e=>e.element==='wall');
 const xs=slabElement.outline.map(p=>p.x),ys=slabElement.outline.map(p=>p.y);
 const measuredArea=(Math.max(...xs)-Math.min(...xs))*(Math.max(...ys)-Math.min(...ys));
 // Normalised trace: 200px x 80px at 0.02m/px = 4m x 1.6m.
 assert.ok(Math.abs(measuredArea-6.4)<1e-9);
 assert.equal(slabElement.depth,0.15);
 assert.equal(wallElement.depth,2.7);
 assert.equal(wallElement.base_m,0.15);
 const ifc=createIfc4Model({elements:prepared.ready});
 assert.match(ifc,/IFCSLAB\(/);
 assert.match(ifc,/IFCWALL\(/);
 assert.match(ifc,/IFCPROPERTYSINGLEVALUE\('Checked dimension reference'/);
});

test('duplicate BIM element identifiers are rejected before export',()=>{
 const ready=prepareIfcElements(packageArgs).ready;
 assert.throws(()=>createIfc4Model({elements:[ready[0],{...ready[0]}]}),/unique ID/);
 assert.throws(()=>createIfc4Model({elements:[{...ready[0],id:''}]}),/unique ID/);
});

test('invalid IFC coordinates and incomplete openings fail before file generation',()=>{
 const ready=prepareIfcElements(packageArgs).ready;
 assert.throws(()=>createIfc4Model({elements:[{...ready[0],outline:[...ready[0].outline.slice(0,3),{x:NaN,y:2}]}]}),/invalid coordinates/);
 assert.throws(()=>createIfc4Model({elements:[{...ready[0],base_m:Infinity}]}),/base elevation/);
 assert.throws(()=>createIfc4Model({elements:[{...ready[0],element:'window',host_id:'missing'}]}),/verified host and dimensions/);
});

test('zero-area outlines cannot produce misleading IFC solids',()=>{
 const ready=prepareIfcElements(packageArgs).ready;
 const collinear=[{x:0,y:0},{x:1,y:1},{x:2,y:2}];
 assert.throws(()=>createIfc4Model({elements:[{...ready[0],outline:collinear}]}),/zero or negligible area/);
});

test('self-intersecting IFC footprints are rejected',()=>{
 const ready=prepareIfcElements(packageArgs).ready;
 const crossed=[{x:0,y:0},{x:3,y:3},{x:0,y:4},{x:4,y:0}];
 assert.throws(()=>createIfc4Model({elements:[{...ready[0],outline:crossed}]}),/crosses itself/);
});

test('a zero-length segment rejects the entire multi-segment wall',()=>{
 const badWall={...wall,points:[{x:.1,y:.1},{x:.3,y:.1},{x:.3006,y:.1}]};
 const result=prepareIfcElements({...packageArgs,highlights:[badWall],bim_specs:{w:approved.w}});
 assert.equal(result.ready.length,0);
 assert.ok(result.issues.some(issue=>/Zero-length wall segment/.test(issue.reason)));
});

test('malformed void coordinates are rejected before IFC output',()=>{
 const ready=prepareIfcElements(packageArgs).ready;
 assert.throws(()=>createIfc4Model({elements:[{...ready[0],holes:[[{x:0,y:0},{x:1,y:0},{x:NaN,y:1}]]}]}),/void contains invalid coordinates/);
});

test('openings cannot reference missing or later wall hosts',()=>{
 const ready=prepareIfcElements(packageArgs).ready;
 const host=ready.find(e=>e.element==='wall');
 const opening={...host,id:'opening-1',element:'window',host_id:host.id,width_m:1.2,height_m:1.1};
 assert.throws(()=>createIfc4Model({elements:[opening,host]}),/verified, preceding IFC wall element/);
 assert.throws(()=>createIfc4Model({elements:[{...opening,host_id:'unknown'},host]}),/verified, preceding IFC wall element/);
});
