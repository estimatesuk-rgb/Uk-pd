// Verified architectural shell features, additional to independently calibrated
// wall and floor outlines. No roof pitch, opening position or height is inferred.
import {prepareViewBim,viewCalibrationStatus} from './drawingViewModel.mjs';
import {validatedPolygonWithOpenings} from './shapeGeometry.mjs';
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const inRange=(x,a,b)=>finite(x)&&x>=a&&x<=b;
const xy=p=>p&&inRange(p.x,0,1)&&inRange(p.y,0,1);
export function prepareArchitecturalBim({views=[],calibrations={},docs=[],elements=[],features=[]}={}){
 const basic=prepareViewBim({views,calibrations,docs,elements});
 const models=[...basic.models],issues=[...basic.issues].filter(x=>x.id!=='empty');
 const sourceViews=new Set(models.map(x=>x.view_id).filter(Boolean));
 for(const f of features){
  if(f.include===false)continue;
  const fail=reason=>issues.push({id:f.id||'',label:f.name||'Architectural element',reason});
  if(!f.id||!f.name||!['roof','door','window'].includes(f.type)){
   fail('Choose an identified roof plane, door or window');continue;
  }
  if(f.checked!==true||String(f.dimension_reference||'').trim().length<12){
   fail('Confirm the drawing, dimensions and construction section reference');continue;
  }
  if(f.type==='roof'){
   const view=views.find(v=>v.id===f.view_id),doc=docs.find(d=>d.id===view?.document_id);
   const scale=viewCalibrationStatus(view,doc,calibrations[view?.id]);
   if(!scale.ok){fail(scale.error);continue}
   if(view.kind!=='roof-plan'&&view.kind!=='detail'){
    fail('Roof faces must be traced on a separately calibrated roof plan or detail');continue;
   }
   if(!Array.isArray(f.points)||!f.points.every(xy)){
    fail('Trace a roof-face perimeter inside the registered drawing view');continue;
   }
   const shape=validatedPolygonWithOpenings(f.points,[]);
   if(!shape||shape.holes.length){fail('Each roof face requires a simple closed polygon');continue;}
   if(!['x','y'].includes(f.slope_axis)||!inRange(f.eave_m,-10,120)||
      !inRange(f.ridge_m,-10,130)||f.ridge_m<f.eave_m||
      !inRange(f.thickness_m,.025,1.5)||![f.origin_x_m,f.origin_y_m].every(finite)){
    fail('Enter a verified eaves level, ridge/high level, slope axis, thickness and common origin');continue;
   }
   const c=calibrations[view.id];
   const boundary=shape.outline.map(p=>({x:f.origin_x_m+p.x*c.dimensions_px[0]*c.metresPerPixel,
    y:f.origin_y_m-p.y*c.dimensions_px[1]*c.metresPerPixel}));
   const values=boundary.map(p=>p[f.slope_axis]);
   if(Math.max(...values)-Math.min(...values)<.05){fail('Roof plane has no horizontal run along the stated slope axis');continue;}
   models.push({id:f.id,name:f.name,element:'roof',base_m:f.eave_m,
    high_m:f.ridge_m,rise_m:f.ridge_m-f.eave_m,slope_axis:f.slope_axis,depth:f.thickness_m,
    outline:boundary,holes:[],source:doc.document_no||doc.title||doc.file_path,
    page:view.page,view_id:view.id,evidence:f.dimension_reference});
   sourceViews.add(view.id);
   continue;
  }
  // Doors and windows must identify an explicit individual wall SEGMENT
  // already produced from a verified wall trace. Position is measured from
  // the wall segment start, not guessed from a generic AI rectangle.
  const host=models.find(m=>m.id===f.host_id&&m.element==='wall');
  if(!host){fail('Choose an existing, verified wall segment before placing this opening');continue;}
  if(!inRange(f.offset_m,0,200)||!inRange(f.width_m,.25,5)||
     !inRange(f.height_m,.3,6)||!inRange(f.sill_m,0,30)){
   fail('Enter the checked opening width, height, sill height and distance from wall segment start');continue;
  }
  const [a,b,c,d]=host.outline;
  if(!a||!b||!c||!d){fail('Host wall geometry is incomplete');continue;}
  const length=Math.hypot(b.x-a.x,b.y-a.y);
  if(f.offset_m<.05||f.offset_m+f.width_m>length-.05){
   fail('The door or window exceeds the host wall, or leaves less than 50mm at a wall end');continue;
  }
  if(f.sill_m+f.height_m>host.depth+.0001){
   fail('The opening top would exceed the verified wall height');continue;
  }
  if(f.type==='door'&&f.sill_m>.4){fail('Door sill exceeds 400mm above the verified wall base');continue;}
  const ux=(b.x-a.x)/length,uy=(b.y-a.y)/length;
  const start={x:(a.x+d.x)/2+ux*f.offset_m,y:(a.y+d.y)/2+uy*f.offset_m};
  const end={x:start.x+ux*f.width_m,y:start.y+uy*f.width_m};
  const half=Math.hypot(a.x-d.x,a.y-d.y)/2;
  const nx=-uy,ny=ux;
  const rect=[
   {x:start.x+nx*half,y:start.y+ny*half},
   {x:end.x+nx*half,y:end.y+ny*half},
   {x:end.x-nx*half,y:end.y-ny*half},
   {x:start.x-nx*half,y:start.y-ny*half}
  ];
  models.push({id:f.id,name:f.name,element:f.type,host_id:host.id,
    offset_m:f.offset_m,width_m:f.width_m,height_m:f.height_m,sill_m:f.sill_m,
    base_m:host.base_m+f.sill_m,depth:f.height_m,outline:rect,holes:[],
    source:host.source,page:host.page,view_id:host.view_id,
    evidence:f.dimension_reference});
 }
 if(sourceViews.size>1&&!views.filter(v=>sourceViews.has(v.id)).every(v=>v.common_origin_verified===true)){
  if(!issues.some(x=>x.id==='view-alignment'))issues.push({id:'view-alignment',label:'View coordination',
   reason:'Roof and floor views must be explicitly aligned to a shared X/Y origin and building levels'});
 }
 if(!models.length)issues.push({id:'empty',label:'3D building model',
  reason:'Add checked walls, floors, roof faces or openings before export'});
 return {models,issues};
}
