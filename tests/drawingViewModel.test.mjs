import test from 'node:test';
import assert from 'node:assert/strict';
import {validateDrawingView,cropPixels,saveViewScaleCheck,viewCalibrationStatus,
 viewQuantity,prepareViewBim} from '../src/drawingViewModel.mjs';
import {createIfc4Model} from '../src/ifcExport.mjs';
const doc={id:'doc-1',file_path:'p1/a1-revC3.pdf',revision:'C3',status:'Current',document_no:'390-16-10'};
const view={id:'ground',document_id:doc.id,page:1,kind:'ground-floor-plan',
 name:'Stockwood ground floor (isolated)',bounds:{x:.08,y:.48,w:.35,h:.4},
 source_path:doc.file_path,source_revision:doc.revision,common_origin_verified:true};
const dims=[900,1200],a=[{x:.1,y:.1},{x:.6,y:.1}],b=[{x:.8,y:.2},{x:.8,y:.7}];
const first=saveViewScaleCheck({view,document:doc,dimensions:dims,points:a,metres:4.5});
const second=saveViewScaleCheck({view,document:doc,previous:first.value,dimensions:dims,points:b,metres:6});
test('A1 multi-view sheets must register separately scoped rectangles by current revision',()=>{
 assert.equal(validateDrawingView(view,doc).ok,true);
 assert.deepEqual(cropPixels(view,[3000,2000]),{x:240,y:960,width:1050,height:800});
 assert.equal(validateDrawingView(view,{...doc,revision:'C4'}).ok,false);
 assert.equal(validateDrawingView({...view,bounds:{x:0,y:0,w:1.2,h:.5}},doc).ok,false);
});
test('each view needs two independent printed dimensions; a page-level scale is not inherited',()=>{
 assert.equal(first.ok,true);assert.equal(first.complete,false);
 assert.equal(viewCalibrationStatus(view,doc,first.value).ok,false);
 assert.equal(second.ok,true);assert.equal(second.complete,true);
 assert.equal(viewCalibrationStatus(view,doc,second.value).ok,true);
 assert.equal(second.value.metresPerPixel,.01);
 const incorrect=saveViewScaleCheck({view,document:doc,previous:first.value,
  dimensions:dims,points:b,metres:8});
 assert.equal(incorrect.ok,false);
});
test('view crop has its own coordinate system and deterministic area, never 613 m2 guessed rectangles',()=>{
 const trace=[{x:.1,y:.1},{x:.6,y:.1},{x:.6,y:.5},{x:.1,y:.5}];
 const result=viewQuantity({view,document:doc,calibration:second.value,kind:'area',points:trace});
 assert.equal(result.ok,true);assert.equal(result.quantity,21.6);
 assert.equal(viewQuantity({view,document:doc,calibration:first.value,kind:'area',points:trace}).ok,false);
 assert.equal(viewQuantity({view,document:doc,calibration:second.value,kind:'length',points:trace}).ok,true);
});
test('valid two-dimension checked IFC slab exports actual geometry with source evidence',()=>{
 const element={id:'slab-1',view_id:view.id,name:'Stockwood slab',type:'slab',checked:true,
  dimension_reference:'Drawing C3 section A-A; checked 4500 and 6000 dimension references',
  base_m:0,thickness_m:.15,origin_x_m:0,origin_y_m:0,
  points:[{x:.1,y:.1},{x:.6,y:.1},{x:.6,y:.5},{x:.1,y:.5}]};
 const prepared=prepareViewBim({views:[view],calibrations:{[view.id]:second.value},elements:[element],docs:[doc]});
 assert.deepEqual(prepared.issues,[]);assert.equal(prepared.models.length,1);
 assert.equal(prepared.models[0].depth,.15);assert.equal(prepared.models[0].outline[0].x,.9);
 const file=createIfc4Model({projectName:'Stockwood verified subset',elements:prepared.models,
  newGuid:()=> '0123456789ABCDEFghijkl',now:new Date('2026-10-13T12:00:00Z')});
 assert.match(file,/FILE_SCHEMA\(\('IFC4'\)\)/);assert.match(file,/IFCSLAB\(/);
});
test('multi-view IFC export refuses to silently align two separate cropped floor plans',()=>{
 const secondView={...view,id:'upper',kind:'upper-floor-plan',common_origin_verified:false};
 const upperCal={...second.value,view_id:'upper'};
 const el={id:'s1',view_id:'ground',name:'Ground slab',type:'slab',
  checked:true,dimension_reference:'Ground slab by printed dimensions on C3',
  base_m:0,origin_x_m:0,origin_y_m:0,thickness_m:.15,
  points:[{x:.1,y:.1},{x:.6,y:.1},{x:.6,y:.5},{x:.1,y:.5}]};
 const prepared=prepareViewBim({views:[view,secondView],docs:[doc],
  calibrations:{ground:second.value,upper:upperCal},
  elements:[el,{...el,id:'s2',name:'Upper floor',view_id:'upper',base_m:2.7}]});
 assert.equal(prepared.models.length,2);
 assert.ok(prepared.issues.some(x=>x.id==='view-alignment'));
});
