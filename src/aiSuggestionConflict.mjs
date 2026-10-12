import {canonicalUnit} from './takeoffMeasurement.mjs';

const ignore=new Set(['new','proposed','existing','works','work','construction','measure','measured','length','area','areas','run','face','surface','for','the','of']);
const words=value=>[...new Set(String(value||'').toLowerCase()
 .replace(/[^a-z0-9 ]+/g,' ').split(/\s+/)
 .filter(w=>w.length>1&&!ignore.has(w)))];
const normal=value=>String(value||'').trim().toLowerCase().replace(/\s+/g,' ');
function sameSource(a,b){
 const left=a?.takeoff_evidence||{},right=b?.takeoff_evidence||{};
 if(left.drawing_id&&right.drawing_id&&left.page&&right.page)
  return left.drawing_id===right.drawing_id&&Number(left.page)===Number(right.page);
 // A filename/page must match exactly; don't collapse one storey into another.
 const file=a?.drawing,other=b?.drawing;
 return Boolean(file&&other&&normal(file)===normal(other));
}
function semanticOverlap(a,b){
 const aa=words(a),bb=words(b);
 if(!aa.length||!bb.length)return 0;
 const same=aa.filter(w=>bb.includes(w)).length;
 return same/Math.min(aa.length,bb.length);
}
export function findPotentialAiOverlaps(item,existing,max=4){
 if(!item||!Array.isArray(existing))return [];
 return existing.filter(row=>{
  if(!row||canonicalUnit(row.unit)!==canonicalUnit(item.unit)||!sameSource(row,item))return false;
  const similarity=semanticOverlap(row.description,item.description);
  if(similarity<.8)return false;
  // Warn, don't auto-delete, even if different construction layers might coexist.
  return true;
 }).slice(0,max).map(row=>{
  const current=Number(item.quantity),prior=Number(row.quantity);
  const comparable=Number.isFinite(current)&&current>0&&Number.isFinite(prior)&&prior>0;
  const difference=comparable?Math.round((current-prior)/prior*1000)/10:null;
  return {ref_no:row.ref_no||'—',description:row.description,
   quantity:row.quantity,unit:row.unit,
   difference_percent:difference,
   reason:difference===null?'Same page, unit and related description — check scope':
     Math.abs(difference)<=2?'Very similar quantity — possible double-count':
      'Different quantities for related work — compare outlines and deductions'
  };
 });
}
