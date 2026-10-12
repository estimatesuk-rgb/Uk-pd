import {validateTrace,validatedPolygonWithOpenings} from './shapeGeometry.mjs';

// Persisted AI suggestions can be stale or malformed. Preview only the trace
// belonging to the currently displayed drawing and page. Never mutate a mark.
const inBounds=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=1;
export function previewPendingMark(proposal,documentId,page){
 if(proposal?.kind!=='measured'||!proposal.highlight)return null;
 const h=proposal.highlight;
 if(h.drawing_id!==documentId||Number(h.page)!==Number(page))return null;
 if(h.kind==='polygon'){
  const validated=validatedPolygonWithOpenings(h.points,h.openings||[]);
  return validated?{...h,points:validated.outline,openings:validated.holes}:null;
 }
 if(h.kind==='polyline'||h.kind==='length'){
  const line=validateTrace(h.points,false);
  if(!line||(h.kind==='length'&&line.length!==2))return null;
  return {...h,points:line};
 }
 if(h.kind==='count')return inBounds(h.x)&&inBounds(h.y)?{...h}:null;
 if(h.kind==='area'){
  return [h.x,h.y,h.w,h.h].every(inBounds)&&h.w>0&&h.h>0&&
   h.x+h.w<=1.000001&&h.y+h.h<=1.000001?{...h}:null;
 }
 return null;
}
