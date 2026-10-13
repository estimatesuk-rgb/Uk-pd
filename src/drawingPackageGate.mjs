// A drawing package must declare its intended comparison mode before AI take-off.
// Unrecognised stages and conflicting registrations fail closed, never fall back
// to treating refurbishment works as a new build.
const allowedModes=new Set(['comparison','new-build']);
const allowedStages=new Set(['Existing','Proposed','Demolition','Detail / Supporting','Mixed existing/proposed']);
const observed=p=>String(p?.classification||'').trim().toLowerCase();
export function validateDrawingPackage(mode,docs,stages={}){
 if(!allowedModes.has(mode))return {ok:false,error:'Choose Existing versus proposed or New build before starting AI take-off.'};
 if(!Array.isArray(docs)||docs.length===0)return {ok:false,error:'Upload at least one proposed construction drawing.'};
 const registered=docs.map(d=>({name:d.document_no||d.title||'Drawing',stage:stages[d.id]||'Unclassified'}));
 const missing=registered.filter(d=>!allowedStages.has(d.stage));
 if(missing.length)return {ok:false,error:'Classify every drawing in the Drawing register first: '+missing.map(d=>d.name).join(', ')};
 const exists=registered.some(d=>d.stage==='Existing'||d.stage==='Mixed existing/proposed');
 const proposed=registered.some(d=>d.stage==='Proposed'||d.stage==='Mixed existing/proposed');
 if(!proposed)return {ok:false,error:'At least one drawing must be marked Proposed (or Mixed existing/proposed).'};
 if(mode==='comparison'&&!exists)return {ok:false,error:'Existing versus proposed requires an Existing drawing or a Mixed existing/proposed document. Do not select New build to bypass this check.'};
 if(mode==='new-build'&&registered.some(d=>['Existing','Demolition','Mixed existing/proposed'].includes(d.stage)))
  return {ok:false,error:'New build cannot include drawings marked Existing, Demolition or Mixed existing/proposed. Use Existing versus proposed instead.'};
 return {ok:true};
}
export function validateObservedDrawingPackage(mode,pages){
 if(!Array.isArray(pages)||!pages.length)return {ok:false,error:'No drawings were returned by the AI reader.'};
 const stages=pages.map(observed);
 if(mode==='comparison'){
  if(!stages.some(s=>s.includes('existing')))
   return {ok:false,error:'AI did not identify an existing drawing. Comparison cannot be trusted; review the drawing classifications before running take-off again.'};
  if(!stages.some(s=>s.includes('proposed')))
   return {ok:false,error:'AI did not identify a proposed drawing. No automatic BOQ will be saved.'};
 }else if(mode==='new-build'){
  if(stages.some(s=>s.includes('existing')||s.includes('demolition')))
   return {ok:false,error:'AI detected existing or demolition work in New build mode. Reclassify drawings and use comparison mode if applicable.'};
 }else return {ok:false,error:'No valid drawing comparison mode selected.'};
 return {ok:true};
}
// The AI must agree with the registered document stage before a quantity
// is extracted. Mixed-document sheets need page-specific human confirmation.
export function verifiedAutoStage(registeredStage,aiStage){
 return (registeredStage==='Proposed'&&aiStage==='Proposed')||
        (registeredStage==='Demolition'&&aiStage==='Demolition')
  ?aiStage:'Unclassified';
}
