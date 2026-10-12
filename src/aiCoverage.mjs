// An honest page-by-page audit of AI coverage. It does not prove that every
// building element was recognised: a page with measurements may have omissions.
export function classifyAiCoverage(page){
 const review=Number(page?.provisional_measured)||0;
 const discovered=Number(page?.scope_items)||0;
 const questions=Number(page?.unresolved_questions)||0;
 const rejected=Number(page?.held_shapes)||0;
 const status=page?.calibration_status;
 if(status==='reference-only')
  return {status:'Notes only — no scaled take-off',needs_qs:true};
 if(status!=='calibrated')
  return {status:'Scale missing — not measured',needs_qs:true};
 if(['Existing','Retained','Supporting','Construction Detail','Structural'].includes(page?.classification))
  return {status:'Reference/comparison sheet — inspect linked work',needs_qs:questions>0||rejected>0};
 if(!['Proposed','Demolition'].includes(page?.classification))
  return {status:'Uncertain classification — review drawing',needs_qs:true};
 if(!review)
  return {status:'No automatic quantities — manual take-off required',needs_qs:true};
 if(questions||rejected||discovered>review)
  return {status:'Partial provisional coverage — check omitted work',needs_qs:true};
 return {status:'Provisional outlines found — full QS check still required',needs_qs:true};
}
export function summariseAiCoverage(pages){
 const rows=(Array.isArray(pages)?pages:[]).map(p=>({...p,...classifyAiCoverage(p)}));
 return {pages:rows,
  total_pages:rows.length,
  provisional_shapes:rows.reduce((n,p)=>n+(Number(p.provisional_measured)||0),0),
  held_shapes:rows.reduce((n,p)=>n+(Number(p.held_shapes)||0),0),
  scope_items:rows.reduce((n,p)=>n+(Number(p.scope_items)||0),0),
  unresolved_questions:rows.reduce((n,p)=>n+(Number(p.unresolved_questions)||0),0),
  pages_without_measurements:rows.filter(p=>!p.provisional_measured&&!['reference-only'].includes(p.calibration_status)).length,
  // Always true while this is a provisional vision system. No false 'complete'.
  requires_qs_review:true};
}
