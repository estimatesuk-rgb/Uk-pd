import {measuredQuantity} from './takeoffMeasurement.mjs';
import {validateTrace,validatedPolygonWithOpenings,polygonBounds} from './shapeGeometry.mjs';
import {measureDimensionedCandidate} from './dimensionedMeasurements.mjs';
import {measurementQualityFlags} from './aiMeasurementQuality.mjs';
import {aiGeometryRejection} from './aiGeometryTrust.mjs';

// AI suggests outlines; all quantities are calculated deterministically against
// a revision-matched scale. Never infer a scale from the picture or from a label.
const inside=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1;
const safeText=v=>String(v??'').trim().slice(0,180);
const round=v=>Number(v.toFixed(4));
function candidateMark(c){
  if(c?.kind==='area'){
    if(![c.x,c.y,c.w,c.h].every(inside)||c.w<=0.004||c.h<=0.004||
       c.x+c.w>1.000001||c.y+c.h>1.000001)return null;
    return {kind:'area',x:c.x,y:c.y,w:c.w,h:c.h};
  }
  if(c?.kind==='length'){
    const [a,b]=Array.isArray(c.points)?c.points:[];
    if(!a||!b||![a.x,a.y,b.x,b.y].every(inside))return null;
    if(Math.hypot(b.x-a.x,b.y-a.y)<0.005)return null;
    return {kind:'length',x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),
      w:Math.abs(b.x-a.x),h:Math.abs(b.y-a.y),points:[{x:a.x,y:a.y},{x:b.x,y:b.y}]};
  }
  if(c?.kind==='polygon'){
    const shape=validatedPolygonWithOpenings(c.points,c.openings||[]);
    if(!shape)return null;
    return {kind:'polygon',...polygonBounds(shape.outline),points:shape.outline,openings:shape.holes};
  }
  if(c?.kind==='polyline'){
    const points=validateTrace(c.points,false);
    if(!points)return null;
    return {kind:'polyline',...polygonBounds(points),points};
  }
  if(c?.kind==='count'){
    if(!inside(c.x)||!inside(c.y))return null;
    return {kind:'count',x:c.x,y:c.y,w:0,h:0};
  }
  return null; // No guessed depths, 3D volumes, curved arcs or unclosed holes.
}

export function measureAutoCandidate(c,context){
  if(context?.calibration_status!=='calibrated')return {error:'No verified sheet calibration'};
  const unsafe=aiGeometryRejection(c,context);
  if(unsafe)return {error:unsafe};
  if(!['Proposed','Demolition'].includes(context?.classification))return {error:'Supporting/existing/uncertain sheet'};
  if(!['high'].includes(c?.confidence))return {error:'Outline confidence not high'};
  if(!['Proposed','Demolition'].includes(c?.stage)||c.stage!==context.classification)
    return {error:'Work stage is not established'};
  const description=safeText(c.description),evidence=safeText(c.evidence);
  if(description.length<5||evidence.length<8)return {error:'Missing work or drawing evidence'};
  const isDerived=['wall_face','trench','slab_volume'].includes(c?.kind);
  const geometryKind=c.kind==='slab_volume'?'polygon':isDerived?'polyline':c.kind;
  const region=candidateMark({...c,kind:geometryKind});
  if(!region)return {error:'Unsupported or invalid visible outline'};
  const calibration=Number(context?.metresPerPixel);
  const dimensions=context?.dimensions;
  const measured=isDerived?measureDimensionedCandidate(c,region,dimensions,calibration):
    measuredQuantity(region,dimensions,calibration);
  if(!measured||!Number.isFinite(measured.quantity)||measured.quantity<=0)
    return {error:isDerived?'Cited metric height/width/depth or valid derived geometry missing':'Could not calculate a scaled quantity'};
  const coords=['length','polyline','polygon'].includes(region.kind)
    ?[...region.points.flatMap(p=>[p.x,p.y]),...(region.openings||[]).flatMap(h=>h.flatMap(p=>[p.x,p.y]))]
    :region.kind==='count'?[region.x,region.y]:[region.x,region.y,region.w,region.h];
  const key=[context.document_id,context.page,c.kind,description.toLowerCase(),
    ...coords.map(round)].join('|');
  const quality_flags=measurementQualityFlags({description,unit:measured.unit,
    quantity:measured.quantity,kind:c.kind,dimension_evidence:measured.dimension_evidence});
  return {quality_flags,key,mark:{...region,name:description,stage:c.stage,source:'AI proposed markup',
    evidence,measurement_kind:c.kind},quantity:measured.quantity,unit:measured.unit,method:measured.method,
    gross_area_m2:measured.gross_area_m2??null,deductions_area_m2:measured.deductions_area_m2??null,
    openings_count:measured.openings_count||0,
    dimension_evidence:measured.dimension_evidence||null,
    calculation:measured.calculation||null,
    evidence,work_section:safeText(c.work_section)||'AI assisted take-off'};
}
export function measureAutoPage(candidates,context){
  const measured=[],rejected=[],seen=new Set();
  for(const c of (Array.isArray(candidates)?candidates:[]).slice(0,12)){
    const result=measureAutoCandidate(c,context);
    if(result.error){rejected.push({description:safeText(c?.description),reason:result.error});continue}
    if(seen.has(result.key)){rejected.push({description:safeText(c?.description),reason:'Duplicate outline on page'});continue}
    seen.add(result.key);measured.push(result);
  }
  return {measured,rejected};
}
