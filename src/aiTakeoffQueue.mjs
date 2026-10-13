import {duplicateAutoCandidate} from './aiDuplicateGuard.mjs';

// Reanalysis is deliberately non-destructive: observations must not silently
// change quantities/costs that a QS may have reviewed on an earlier pass.
export function isAiReanalysis(estimate){
 return Boolean(estimate?.ai_last_analysed_at ||
  (estimate?.items||[]).some(item=>item?.ai_auto_key||item?.ai_draft_key));
}
const candidateKey=p=>p?.item?.ai_auto_key||p?.item?.ai_draft_key||p?.id||'';
export function stageAiTakeoff(estimate,scopeItems=[],measuredItems=[],newHighlights=[],options={}){
 const originalItems=estimate?.items||[],originalHighlights=estimate?.highlights||[];
 if(!isAiReanalysis(estimate)){
  const reviewAll=options.forceReview===true;
  const flagged=measuredItems.filter(i=>reviewAll||(i?.takeoff_evidence?.quality_flags||[]).length>0);
  const safe=measuredItems.filter(i=>!reviewAll&&!(i?.takeoff_evidence?.quality_flags||[]).length);
  const flaggedIds=new Set(flagged.map(i=>i.takeoff_evidence?.highlight_id));
  const markups=new Map(newHighlights.map(h=>[h.id,h]));
  const prior=estimate?.ai_pending_takeoff||[];
  const existingKeys=new Set(prior.map(candidateKey));
  const pending=[...prior];
  let staged=0;
  const suggestions=[
   ...flagged.map(item=>({id:item.id,kind:'measured',item,
     highlight:markups.get(item.takeoff_evidence.highlight_id)||null})),
   ...(reviewAll?scopeItems.map(item=>({id:item.id,kind:'scope',item,highlight:null})):[])
  ];
  for(const proposal of suggestions){
    const key=candidateKey(proposal);
    if(existingKeys.has(key))continue;
    if(pending.length>=150)throw Error('More than 150 unreviewed AI observations. Review or dismiss queued items before another take-off; no partial batch saved.');
    pending.push(proposal);existingKeys.add(key);staged++;
  }
  return {
   items:[...originalItems,...(reviewAll?[]:scopeItems),...safe],
   highlights:[...originalHighlights,...newHighlights.filter(h=>!flaggedIds.has(h.id))],
   ai_pending_takeoff:pending,
   ai_review_mode:reviewAll?'comparison-review':'initial',
   staged_count:staged
  };
 }
 const marks=new Map(newHighlights.map(h=>[h.id,h]));
 const newProposals=[
  ...measuredItems.map(item=>({id:item.id,kind:'measured',item,
   highlight:marks.get(item?.takeoff_evidence?.highlight_id)||null})),
  ...scopeItems.map(item=>({id:item.id,kind:'scope',item,highlight:null}))
 ];
 // Retain earlier unreviewed proposals and do not add repeated identical keys.
 const pending=[...(estimate?.ai_pending_takeoff||[])];
 const used=new Set(pending.map(candidateKey));
 let staged=0;
 for(const proposal of newProposals){
  const key=candidateKey(proposal);
  if(used.has(key))continue;
  if(pending.length>=150)throw Error('More than 150 unreviewed AI observations. Review or dismiss queued items before another take-off; no partial batch saved.');
  pending.push(proposal);used.add(key);staged++;
 }
 return {items:originalItems,highlights:originalHighlights,
   ai_pending_takeoff:pending,ai_review_mode:'rerun-review',
   staged_count:staged};
}
function nextReference(items){
 const numbers=items.map(i=>Number(i.ref_no)).filter(Number.isSafeInteger);
 return String((numbers.length?Math.max(...numbers):0)+1).padStart(3,'0');
}
export function decideAiSuggestion(estimate,pendingId,decision){
 if(decision!=='add'&&decision!=='dismiss')return {error:'Unsupported decision'};
 const pending=estimate?.ai_pending_takeoff||[];
 const p=pending.find(x=>x.id===pendingId);
 if(!p)return {error:'Suggestion not in the review queue'};
 if(decision==='dismiss')
  return {next:{...estimate,ai_pending_takeoff:pending.filter(x=>x.id!==pendingId)}};
 if(!p.item||!p.item.description||!['measured','scope'].includes(p.kind))
  return {error:'Invalid suggestion'};
 const item=p.item;
 const already=(estimate.items||[]).some(i=>
  i.id===item.id||
  (i.ai_auto_key&&item.ai_auto_key&&i.ai_auto_key===item.ai_auto_key)||
  (i.ai_draft_key&&item.ai_draft_key&&i.ai_draft_key===item.ai_draft_key));
 if(already)return {error:'This AI suggestion is already in the BOQ'};
 if(p.kind==='measured'){
  if(!Number.isFinite(item.quantity)||item.quantity<=0 || !p.highlight)
   return {error:'Unmeasured or missing drawing mark. Recheck this suggestion.'};
  const e=item.takeoff_evidence||{};
  const hit=duplicateAutoCandidate({
   document_id:e.drawing_id,page:e.page,filename:String(item.drawing||'').replace(/ p\d+$/i,''),
   key:item.ai_auto_key,unit:item.unit,quantity:item.quantity,mark:{
    name:item.description,...e.region
   }},estimate.items||[]);
  if(hit.duplicate)return {error:'An existing measured item overlaps this suggestion: '+hit.reason};
  const covered=(estimate.highlights||[]).some(h=>h.id===p.highlight.id);
  if(covered)return {error:'This drawing mark is already accepted'};
 }
 const accepted={...item,ref_no:nextReference(estimate.items||[]),
   status:p.kind==='measured'?'QS-selected provisional AI measurement — verification still required':
    'QS-selected AI scope — measurement and verification still required'};
 return {next:{...estimate,items:[...(estimate.items||[]),accepted],
  highlights:p.kind==='measured'?[...(estimate.highlights||[]),p.highlight]:estimate.highlights||[],
  ai_pending_takeoff:pending.filter(x=>x.id!==pendingId)}};
}
