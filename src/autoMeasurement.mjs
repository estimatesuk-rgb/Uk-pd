import {measuredQuantity} from './takeoffMeasurement.mjs';

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
  if(c?.kind==='count'){
    if(!inside(c.x)||!inside(c.y))return null;
    return {kind:'count',x:c.x,y:c.y,w:0,h:0};
  }
  return null; // No guessed depth, volumes, polylines or arcs.
}

export function measureAutoCandidate(c,context){
  if(context?.calibration_status!=='calibrated')return {error:'No verified sheet calibration'};
  if(!['Proposed','Demolition'].includes(context?.classification))return {error:'Supporting/existing/uncertain sheet'};
  if(!['high'].includes(c?.confidence))return {error:'Outline confidence not high'};
  if(!['Proposed','Demolition'].includes(c?.stage)||c.stage!==context.classification)
    return {error:'Work stage is not established'};
  const description=safeText(c.description),evidence=safeText(c.evidence);
  if(description.length<5||evidence.length<8)return {error:'Missing work or drawing evidence'};
  const region=candidateMark(c);
  if(!region)return {error:'Unsupported or invalid visible outline'};
  const calibration=Number(context?.metresPerPixel);
  const dimensions=context?.dimensions;
  const measured=measuredQuantity(region,dimensions,calibration);
  if(!measured||!Number.isFinite(measured.quantity)||measured.quantity<=0)return {error:'Could not calculate a scaled quantity'};
  const coords=region.kind==='length'
    ?region.points.flatMap(p=>[p.x,p.y])
    :region.kind==='count'?[region.x,region.y]:[region.x,region.y,region.w,region.h];
  const key=[context.document_id,context.page,region.kind,description.toLowerCase(),
    ...coords.map(round)].join('|');
  return {key,mark:{...region,name:description,stage:c.stage,source:'AI proposed markup',
    evidence},quantity:measured.quantity,unit:measured.unit,method:measured.method,
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
