import {measuredQuantity} from './takeoffMeasurement.mjs';

// Provisional quantities derived only when visual geometry is scaled AND a
// separately cited written dimension is present. The cited text comes from
// AI and is NOT independently authenticated: all work requires QS review.
const METRIC=/(\d+(?:\.\d+)?)\s*(mm|millimetres?|cm|centimetres?|m|metres?|meters?)(?![a-z])/gi;
function metresIn(text){
 const values=[];let match;
 while((match=METRIC.exec(String(text||'')))!==null){
  const raw=Number(match[1]),unit=match[2].toLowerCase();
  const metres=unit.startsWith('mm')||unit.startsWith('millimet')?raw/1000:
    unit.startsWith('cm')||unit.startsWith('centimet')?raw/100:raw;
  if(Number.isFinite(metres))values.push(metres);
 }
 METRIC.lastIndex=0;
 return values;
}
export function confirmedDimension(value,evidence,min=0.02,max=20){
 if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)return false;
 if(typeof evidence!=='string'||evidence.trim().length<5||evidence.length>220)return false;
 return metresIn(evidence).some(m=>Math.abs(m-value)<=Math.max(0.005,value*.005));
}
function evidenceMeasure(c,key,min,max){
 return confirmedDimension(c?.[key+'_m'],c?.[key+'_evidence'],min,max)?
  c[key+'_m']:null;
}
const round3=n=>Number(n.toFixed(3));
export function measureDimensionedCandidate(c,region,dimensions,scale){
 const kind=c?.kind;
 const baseKind=kind==='wall_face'||kind==='trench'?'polyline':
   kind==='slab_volume'?'polygon':null;
 if(!baseKind||!region)return null;
 const base=measuredQuantity({...region,kind:baseKind},dimensions,scale);
 if(!base)return null;
 if(kind==='wall_face'){
  const height=evidenceMeasure(c,'height',.3,15);
  if(height===null)return null;
  const gross=base.quantity*height;
  const openings=Array.isArray(c.opening_dimensions)?c.opening_dimensions:[];
  if(openings.length>12)return null;
  let deducted=0;
  for(const hole of openings){
   const width=confirmedDimension(hole?.width_m,hole?.width_evidence,.1,10)?hole.width_m:null;
   const h=confirmedDimension(hole?.height_m,hole?.height_evidence,.1,10)?hole.height_m:null;
   if(width===null||h===null||h>height)return null;
   deducted+=width*h;
  }
  if(deducted>=gross)return null;
  const quantity=Number((gross-deducted).toFixed(2));
  return quantity>0?{
   quantity,unit:'m²',method:'calibrated wall run × cited height - cited rectangular openings; provisional',
   dimension_evidence:{height_m:height,height_evidence:c.height_evidence,
    openings:openings.map(h=>({width_m:h.width_m,height_m:h.height_m,
      width_evidence:h.width_evidence,height_evidence:h.height_evidence}))},
   calculation:{length_m:base.quantity,height_m:height,gross_m2:round3(gross),
     opening_deduction_m2:round3(deducted),net_m2:quantity}
  }:null;
 }
 if(kind==='trench'){
  const width=evidenceMeasure(c,'width',.1,10),depth=evidenceMeasure(c,'depth',.1,15);
  if(width===null||depth===null)return null;
  const quantity=Number((base.quantity*width*depth).toFixed(3));
  return quantity>0?{
   quantity,unit:'m³',method:'calibrated trench centre-line × cited width × cited depth; provisional',
   dimension_evidence:{width_m:width,width_evidence:c.width_evidence,depth_m:depth,depth_evidence:c.depth_evidence},
   calculation:{length_m:base.quantity,width_m:width,depth_m:depth,volume_m3:quantity}
  }:null;
 }
 if(kind==='slab_volume'){
  const depth=evidenceMeasure(c,'depth',.04,3);
  if(depth===null)return null;
  const quantity=Number((base.quantity*depth).toFixed(3));
  return quantity>0?{
   quantity,unit:'m³',method:'calibrated net slab footprint × cited slab thickness; provisional',
   dimension_evidence:{depth_m:depth,depth_evidence:c.depth_evidence},
   calculation:{net_area_m2:base.quantity,depth_m:depth,volume_m3:quantity,
     gross_area_m2:base.gross_area_m2??null,deductions_area_m2:base.deductions_area_m2??null}
  }:null;
 }
 return null;
}
