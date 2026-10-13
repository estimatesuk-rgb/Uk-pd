// View-specific measurement and BIM geometry. Every PDF sheet can contain
// differently scaled plans, sections and elevations. A page calibration is
// NEVER inherited by a view on that page.
import {validatedPolygonWithOpenings,validateTrace,polygonArea} from './shapeGeometry.mjs';
import {verifySecondDimension} from './scaleCrosscheck.mjs';

export const VIEW_KINDS=[
 {id:'ground-floor-plan',label:'Ground floor plan'},
 {id:'upper-floor-plan',label:'Upper floor plan'},
 {id:'roof-plan',label:'Roof plan'},
 {id:'elevation',label:'Elevation'},
 {id:'section',label:'Section'},
 {id:'detail',label:'Construction detail'},
 {id:'site-plan',label:'Site plan'}
];
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const positive=n=>finite(n)&&n>0;
const close=(a,b)=>Math.abs(a-b)<1e-8;
const pointIn=p=>finite(p?.x)&&finite(p?.y)&&p.x>=0&&p.y>=0&&p.x<=1&&p.y<=1;
const err=message=>({ok:false,error:message});
export function validateDrawingView(view,document){
 if(!view?.id||!VIEW_KINDS.some(k=>k.id===view.kind))return err('Select a recognised plan, elevation or section view');
 if(!document||document.id!==view.document_id||document.status==='Superseded'||
    document.file_path!==view.source_path||
    String(document.revision||'')!==String(view.source_revision||''))
  return err('The original drawing file or revision has changed; re-register this view');
 if(!Number.isInteger(view.page)||view.page<1)return err('Choose a valid PDF page');
 const b=view.bounds;
 if(!b||[b.x,b.y,b.w,b.h].some(v=>!finite(v))||b.x<0||b.y<0||
    b.w<.03||b.h<.03||b.x+b.w>1.000001||b.y+b.h>1.000001)
  return err('Drag a meaningful rectangle wholly within the original drawing sheet');
 return {ok:true};
}
export function cropPixels(view,dimensions){
 const b=view?.bounds;
 if(!Array.isArray(dimensions)||dimensions.length!==2||dimensions.some(n=>!positive(n))||
    !b||[b.x,b.y,b.w,b.h].some(x=>!finite(x)))return null;
 const x=Math.max(0,Math.floor(b.x*dimensions[0]));
 const y=Math.max(0,Math.floor(b.y*dimensions[1]));
 const right=Math.min(dimensions[0],Math.ceil((b.x+b.w)*dimensions[0]));
 const bottom=Math.min(dimensions[1],Math.ceil((b.y+b.h)*dimensions[1]));
 return right>x&&bottom>y?{x,y,width:right-x,height:bottom-y}:null;
}
export function viewCalibrationStatus(view,doc,cal){
 const valid=validateDrawingView(view,doc);
 if(!valid.ok)return valid;
 if(!cal||cal.view_id!==view.id||cal.source_path!==doc.file_path||
    String(cal.source_revision||'')!==String(doc.revision||''))
  return err('The view has not been calibrated against the current drawing revision');
 if(cal.crosscheck_verified!==true||!positive(cal.metresPerPixel))
  return err('Check two independent printed dimensions inside this view');
 if(!Array.isArray(cal.dimensions_px)||cal.dimensions_px.length!==2||
    cal.dimensions_px.some(n=>!positive(n)))return err('Calibrated view pixel dimensions are missing');
 return {ok:true};
}
export function saveViewScaleCheck({view,document,previous=null,dimensions,points,metres}){
 const valid=validateDrawingView(view,document);
 if(!valid.ok)return valid;
 if(!Array.isArray(dimensions)||dimensions.length!==2||
    dimensions.some(n=>!positive(n)))return err('Load this individual drawing view before calibrating it');
 if(!Array.isArray(points)||points.length!==2||!points.every(pointIn)||
    !positive(metres))return err('Click the two endpoints of a printed dimension and enter its true length in metres');
 const line=Math.hypot((points[1].x-points[0].x)*dimensions[0],
                       (points[1].y-points[0].y)*dimensions[1]);
 if(!positive(line)||line<8)return err('Select a longer printed dimension to calibrate this view');
 if(!previous||previous.view_id!==view.id||previous.source_path!==document.file_path||
    String(previous.source_revision||'')!==String(document.revision||'')){
  return {ok:true,complete:false,value:{
   view_id:view.id,source_path:document.file_path,source_revision:String(document.revision||''),
   dimensions_px:dimensions,metresPerPixel:metres/line,
   status:'first-dimension',crosscheck_verified:false,
   metres,pixelLength:line,reference_points:points
  }};
 }
 if(previous.crosscheck_verified===true)return err('Scale already checked; reset calibration explicitly to change it');
 if(previous.dimensions_px.some((n,i)=>!close(n,dimensions[i])))
  return err('Drawing image dimensions have changed; reset the calibration before continuing');
 const checked=verifySecondDimension(
  {...previous,status:'calibrated'},metres,line,points,dimensions);
 if(!checked.ok)return err(checked.reason);
 return {ok:true,complete:true,value:{...previous,status:'calibrated',
   crosscheck_verified:true,second_metres:metres,second_pixel_length:line,
   second_reference_points:points,scale_difference:checked.difference}};
}
function wallBoundary(points,thickness){
 const result=[];
 for(let i=0;i<points.length-1;i++){
  const a=points[i],b=points[i+1],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
  if(len<0.02)return null;
  const nx=-dy/len*thickness/2,ny=dx/len*thickness/2;
  result.push([{x:a.x+nx,y:a.y+ny},{x:b.x+nx,y:b.y+ny},
   {x:b.x-nx,y:b.y-ny},{x:a.x-nx,y:a.y-ny}]);
 }
 return result;
}
export function prepareViewBim({views=[],calibrations={},elements=[],docs=[]}={}){
 const models=[],issues=[],selected=new Set(),sources=new Set();
 for(const el of elements){
  if(el?.include===false)continue;
  const fail=reason=>issues.push({id:el.id||'',label:el.name||'Element',reason});
  const view=views.find(v=>v.id===el.view_id);
  const doc=docs.find(d=>d.id===view?.document_id);
  if(!view||!doc){fail('The source drawing view is missing');continue;}
  const cal=calibrations[view.id];
  const valid=viewCalibrationStatus(view,doc,cal);
  if(!valid.ok){fail(valid.error);continue;}
  if(!['ground-floor-plan','upper-floor-plan','roof-plan','section','elevation','detail'].includes(view.kind)){
    fail('Only a verified construction drawing view may define building model elements');continue;
  }
  if(el.checked!==true||String(el.dimension_reference||'').trim().length<12){
   fail('Enter dimensional evidence and confirm competent QS review');continue;
  }
  if(!['slab','wall'].includes(el.type)){fail('Choose Floor/slab or Wall');continue;}
  if(![el.origin_x_m,el.origin_y_m,el.base_m,el.thickness_m].every(finite)||
     !positive(el.thickness_m)){
   fail('Set verified common origin, level and thickness in metres');continue;
  }
  if(el.type==='wall'&&(!finite(el.height_m)||el.height_m<0.3||el.height_m>20)){
   fail('Provide a verified wall height from a section or elevation');continue;
  }
  if(el.type==='slab'&&(el.thickness_m<.025||el.thickness_m>3)||
    el.type==='wall'&&(el.thickness_m<.05||el.thickness_m>1.5)){
   fail('Element thickness outside reasonable physical bounds');continue;
  }
  if(!Array.isArray(el.points)||!el.points.every(pointIn)){
   fail('Trace points must stay within the individually calibrated drawing view');continue;
  }
  const shape=el.type==='slab'?validatedPolygonWithOpenings(el.points,el.openings||[]):
    validateTrace(el.points,false);
  if(!shape){fail('The source trace is incomplete, crossed, or invalid');continue;}
  const metric=p=>({x:el.origin_x_m+p.x*cal.dimensions_px[0]*cal.metresPerPixel,
    y:el.origin_y_m-p.y*cal.dimensions_px[1]*cal.metresPerPixel});
  const transformed=el.type==='slab'?shape.outline.map(metric):shape.map(metric);
  const footprints=el.type==='slab'?[transformed]:wallBoundary(transformed,el.thickness_m);
  if(!footprints){fail('Wall run contains a zero-length segment');continue;}
  const holes=el.type==='slab'?shape.holes.map(poly=>poly.map(metric)):[];
  for(let i=0;i<footprints.length;i++){
   models.push({id:el.id+'-'+i,name:el.name+(footprints.length>1?' segment '+(i+1):''),
    element:el.type,base_m:el.base_m,depth:el.type==='slab'?el.thickness_m:el.height_m,
    outline:footprints[i],holes:el.type==='slab'?holes:[],
    source:doc.document_no||doc.title||doc.file_path,page:view.page,
    evidence:el.dimension_reference,view_id:view.id,original_element_id:el.id});
  }
  selected.add(el.id);sources.add(view.id);
 }
 // Register a common project origin explicitly for every selected view to
 // prevent adjacent floors/pairs being silently stacked on wrong axes.
 if(sources.size>1&&!views.filter(v=>sources.has(v.id)).every(v=>v.common_origin_verified===true)){
  issues.push({id:'view-alignment',label:'Drawing origin',
   reason:'Multiple cropped views cannot be combined until their common X/Y datum and floor alignment are independently verified'});
 }
 if(!models.length)issues.push({id:'empty',label:'3D model',
   reason:'No BIM elements have approved traces, source dimensions and complete geometry'});
 return {models,issues};
}
export function viewQuantity({view,document,calibration,points,kind}={}){
 const valid=viewCalibrationStatus(view,document,calibration);
 if(!valid.ok)return valid;
 const shape=kind==='area'?validatedPolygonWithOpenings(points,[]):validateTrace(points,false);
 if(!shape)return err('Finish tracing a valid polygon or length');
 const toMetres=p=>({x:p.x*calibration.dimensions_px[0]*calibration.metresPerPixel,
                     y:p.y*calibration.dimensions_px[1]*calibration.metresPerPixel});
 if(kind==='area'){
  const area=polygonArea(shape.outline.map(toMetres));
  return area>0?{ok:true,quantity:area,unit:'m²'}:err('Area trace has no measurable size');
 }
 if(kind==='length'){
  const q=shape.map(toMetres).slice(1).reduce((n,p,i,arr)=>{
   const previous=toMetres(shape[i]);return n+Math.hypot(p.x-previous.x,p.y-previous.y);
  },0);
  return q>0?{ok:true,quantity:q,unit:'m'}:err('Length trace has no measurable size');
 }
 return err('Choose area or length');
}
