import {measuredTrace} from './shapeGeometry.mjs';
// Geometry is calculated from marked points against a checked drawing scale. AI-suggested outlines are provisional.
export const canonicalUnit = unit => {
 const u=String(unit??'').trim().toLowerCase().replace(/\s+/g,'');
 return ({'m2':'m²','m²':'m²','sqm':'m²','m3':'m³','m³':'m³','cum':'m³','metre':'m','meter':'m','metres':'m','meters':'m','nr':'nr','no':'nr','number':'nr','each':'nr','ea':'nr'}[u] || u);
};
const valid = n => typeof n === 'number' && Number.isFinite(n) && n > 0;
export function measuredQuantity(mark, dimensions, metresPerPixel) {
 const kind=mark?.kind||'area';
 if(kind==='polygon'||kind==='polyline')return measuredTrace(mark,dimensions,metresPerPixel);
 if(kind==='count')return Number.isFinite(mark?.x)&&Number.isFinite(mark?.y)&&mark.x>=0&&mark.x<=1&&mark.y>=0&&mark.y<=1?{quantity:1,unit:'nr',method:'manual point count'}:null;
 if(!valid(metresPerPixel)||!Array.isArray(dimensions)||dimensions.length<2||!dimensions.every(valid))return null;
 const [width,height]=dimensions;
 if(kind==='length'){
  const [a,b]=mark?.points||[];
  if(!a||!b||![a.x,a.y,b.x,b.y].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1))return null;
  const length=Math.hypot((b.x-a.x)*width,(b.y-a.y)*height)*metresPerPixel;
  return valid(length)&&Number(length.toFixed(2))>0?{quantity:Number(length.toFixed(2)),unit:'m',method:'two-point calibrated length'}:null;
 }
 if(!valid(mark?.w)||!valid(mark?.h)||!Number.isFinite(mark?.x)||!Number.isFinite(mark?.y)||mark.x<0||mark.y<0||mark.x+mark.w>1.000001||mark.y+mark.h>1.000001)return null;
 const area=mark.w*width*mark.h*height*metresPerPixel**2;
 if(kind==='area')return Number(area.toFixed(2))>0?{quantity:Number(area.toFixed(2)),unit:'m²',method:'calibrated rectangle area'}:null;
 if(kind==='volume'){
  const depth=Number(mark.depth_m);
  if(!valid(depth))return null;
  return Number((area*depth).toFixed(3))>0?{quantity:Number((area*depth).toFixed(3)),unit:'m³',method:'calibrated rectangle area × entered depth'}:null;
 }
 return null;
}
export function findUniqueRate(library, description, unit) {
 const normal=s=>String(s??'').trim().toLowerCase().replace(/\s+/g,' ');
 const matches=(Array.isArray(library)?library:[]).filter(r=>
  normal(r.description)===normal(description) && canonicalUnit(r.unit)===canonicalUnit(unit));
 return {status:matches.length===1?'matched':matches.length>1?'ambiguous':'missing',rate:matches.length===1?matches[0]:null};
}
