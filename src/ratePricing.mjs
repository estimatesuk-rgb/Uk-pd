import {findUniqueRate} from './takeoffMeasurement.mjs';

// A quoted supplier price is a unit rate, excluding VAT, and must never be silently
// substituted for a differently measured unit or a manually entered price.
const numberOrZero=value=>value===null||value===undefined||value===''?0:Number(value);
export function rateComponents(rate) {
 if(!rate||typeof rate!=='object')return null;
 const material_rate=numberOrZero(rate.material_rate),
       plant_rate=numberOrZero(rate.plant_rate),
       labour_hours=numberOrZero(rate.labour_hours),
       labour_rate=numberOrZero(rate.labour_rate);
 if(![material_rate,plant_rate,labour_hours,labour_rate].every(v=>Number.isFinite(v)&&v>=0))return null;
 if((labour_hours>0)!==(labour_rate>0))return null; // Partial labour inputs are not a valid unit rate.
 if(!(material_rate+plant_rate+labour_hours*labour_rate>0))return null;
 return {material_rate,plant_rate,labour_hours,labour_rate};
}
export function hasEnteredRate(item) {
 // Preserve any manual cost, including a partial rate pending review.
 const values=['material_rate','plant_rate','labour_hours','labour_rate'].map(k=>Number(item?.[k]??0));
 return values.some(v=>!Number.isFinite(v)||v!==0);
}
export function applySavedRate(item,rateLibrary) {
 if(hasEnteredRate(item))return {item,status:'already-priced'};
 const match=findUniqueRate(rateLibrary,item?.description,item?.unit);
 if(match.status!=='matched')return {item,status:match.status};
 const components=rateComponents(match.rate);
 if(!components)return {item,status:'invalid-rate'};
 const r=match.rate;
 return {status:'matched',item:{...item,...components,
    supplier:item.supplier||r.supplier||'',
    price_url:item.price_url||r.price_url||'',
    rate_source:r.supplier||r.source||'Saved pricing library',
    rate_checked_at:r.price_date||r.updated_at||null,
    status:'Library rate matched — QS verification required'
 }};
}
export function applySavedRates(items,rateLibrary) {
 const stats={matched:0,missing:0,ambiguous:0,'invalid-rate':0,'already-priced':0};
 const rows=(items||[]).map(item=>{
    const result=applySavedRate(item,rateLibrary);
    stats[result.status]++;
    return result.item;
 });
 return {rows,stats};
}
export function rateLibraryCoverage(rateLibrary) {
 return (rateLibrary||[]).reduce((count,rate)=>{
   const parts=rateComponents(rate);
   if(!parts){count.invalid++;return count;}
   if(parts.material_rate>0)count.materials++;
   if(parts.plant_rate>0)count.plant++;
   if(parts.labour_hours*parts.labour_rate>0)count.labour++;
   return count;
 },{materials:0,plant:0,labour:0,invalid:0});
}
