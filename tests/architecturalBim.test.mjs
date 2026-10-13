import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareArchitecturalBim} from '../src/bimArchitecturalParts.mjs';
import {createIfc4Model} from '../src/ifcExport.mjs';

const doc={id:'doc',status:'Current',revision:'C3',file_path:'plots/stockwood-C3.pdf',document_no:'390-16-10'};
const base={document_id:'doc',page:1,source_path:doc.file_path,source_revision:'C3',
 bounds:{x:.05,y:.2,w:.42,h:.45},common_origin_verified:true};
const floorView={...base,id:'floor',name:'Ground plan',kind:'ground-floor-plan'};
const roofView={...base,id:'roof-view',name:'Pitched roof plan',kind:'roof-plan'};
const calibrations={
 floor:{view_id:'floor',source_path:doc.file_path,source_revision:'C3',
  status:'calibrated',crosscheck_verified:true,metresPerPixel:.01,dimensions_px:[1000,800]},
 'roof-view':{view_id:'roof-view',source_path:doc.file_path,source_revision:'C3',
  status:'calibrated',crosscheck_verified:true,metresPerPixel:.01,dimensions_px:[1000,800]}
};
const evidence='C3 Sections A-A / B-B; independently checked opening and roof dimensions';
const wall={id:'wall',view_id:'floor',name:'External wall',type:'wall',checked:true,
 dimension_reference:evidence,base_m:0,thickness_m:.3,height_m:3,origin_x_m:0,origin_y_m:0,
 points:[{x:.1,y:.2},{x:.8,y:.2}]};
const slab={id:'slab',view_id:'floor',name:'Ground slab',type:'slab',checked:true,
 dimension_reference:evidence,base_m:0,thickness_m:.15,origin_x_m:0,origin_y_m:0,
 points:[{x:.1,y:.2},{x:.8,y:.2},{x:.8,y:.6},{x:.1,y:.6}]};
const roof={id:'roof',name:'East roof plane',type:'roof',view_id:'roof-view',
 checked:true,dimension_reference:evidence,slope_axis:'x',
 eave_m:3.1,ridge_m:4.5,thickness_m:.2,origin_x_m:0,origin_y_m:0,
 points:[{x:.1,y:.2},{x:.8,y:.2},{x:.8,y:.6},{x:.1,y:.6}]};
const door={id:'door',name:'Front entrance',type:'door',checked:true,dimension_reference:evidence,
 host_id:'wall-0',offset_m:1.1,width_m:.9,height_m:2.1,sill_m:0};
const window={id:'window',name:'Lounge window',type:'window',checked:true,dimension_reference:evidence,
 host_id:'wall-0',offset_m:3.3,width_m:1.2,height_m:1.1,sill_m:.9};
const args={views:[floorView,roofView],docs:[doc],calibrations,elements:[slab,wall],
 features:[roof,door,window]};
test('checked roof, wall, slab, door and window form a five-component building shell',()=>{
 const data=prepareArchitecturalBim(args);
 assert.deepEqual(data.issues,[]);
 assert.deepEqual(data.models.map(x=>x.element),['slab','wall','roof','door','window']);
 assert.equal(data.models[2].rise_m,1.4);
 assert.equal(data.models[3].base_m,0);
 assert.equal(data.models[4].base_m,.9);
 assert.equal(data.models[4].host_id,'wall-0');
});
test('IFC4 exports faceted sloping roof plus real opening, void and fill relationships',()=>{
 const data=prepareArchitecturalBim(args);
 const ifc=createIfc4Model({projectName:'Stockwood shell fixture',elements:data.models,
  newGuid:()=> '0123456789ABCDEFghijkl',now:new Date('2026-10-13T12:00:00Z')});
 for(const name of ['IFCROOF','IFCSLAB','IFCWALL','IFCDOOR','IFCWINDOW',
   'IFCOPENINGELEMENT','IFCRELVOIDSELEMENT','IFCRELFILLSELEMENT',
   'IFCFACETEDBREP','IFCCLOSEDSHELL','IFCFACE','IFCLOCALPLACEMENT']){
  assert.match(ifc,new RegExp(name+'\\('),name);
 }
 const refs=ifc.split('\n').filter(x=>/^#\d+=/.test(x));
 assert.ok(refs.length>60);
 assert.equal(new Set(refs.map(x=>x.match(/^#\d+/)[0])).size,refs.length);
 assert.match(ifc,/FILE_SCHEMA\(\('IFC4'\)\)/);
});
test('no roof model if high/eaves levels, slope, profile, or approval missing',()=>{
 for(const bad of [{ridge_m:2.5},{slope_axis:'z'},{checked:false},
  {thickness_m:0},{points:[{x:.1,y:.2},{x:.1,y:.3}]}]){
  const data=prepareArchitecturalBim({...args,features:[{...roof,...bad}]});
  assert.ok(data.issues.length>0);
  assert.equal(data.models.filter(x=>x.element==='roof').length,0);
 }
});
test('host wall must be checked; opening must fit wall and height and not overlap',()=>{
 for(const bad of [{host_id:'missing'},{offset_m:6.5},{sill_m:2.5},{checked:false}]){
  const data=prepareArchitecturalBim({...args,features:[{...door,...bad}]});
  assert.ok(data.issues.length>0);
  assert.equal(data.models.filter(x=>x.element==='door').length,0);
 }
 const duplicate={...door,id:'duplicate',offset_m:1.2};
 const data=prepareArchitecturalBim({...args,features:[door,duplicate]});
 assert.ok(data.issues.some(x=>/overlaps/.test(x.reason)));
});
test('calibration or view alignment mismatch prevents export',()=>{
 const mismatch=prepareArchitecturalBim({...args,views:[floorView,{...roofView,common_origin_verified:false}]});
 assert.ok(mismatch.issues.some(x=>x.id==='view-alignment'));
 const stale=prepareArchitecturalBim({...args,calibrations:{...calibrations,
  'roof-view':{...calibrations['roof-view'],crosscheck_verified:false}}});
 assert.equal(stale.models.some(x=>x.element==='roof'),false);
 assert.ok(stale.issues.some(x=>/two independent/.test(x.reason)));
});
