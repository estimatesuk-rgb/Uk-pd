// Fail-closed cross-drawing evidence gate for automatic take-off.
// AI descriptions alone do not establish geometric identity.
const norm=v=>String(v??'').toLowerCase().replace(/\s+/g,' ').trim();
const classes=new Set(['new','altered','demolished']);
export function classifyChangeEvidence(pages,changes,candidate){
 const existing=(pages||[]).some(p=>norm(p.classification).includes('existing'));
 if(!existing)return {approved:true,reason:'No existing plan supplied: new-build mode; QS review still required'};
 const source=norm(candidate.filename),page=Number(candidate.page),name=norm(candidate.mark?.name);
 if(!source||!Number.isInteger(page)||page<1||!name)return {approved:false,reason:'Missing traceable drawing reference'};
 const references=new Set([source+' p'+page,source+' page '+page,source+' '+page]);
 // Inspect all records for this element/source, including uncertain and retained
 // records. A contradictory retained entry must invalidate an apparent new work.
 const related=(changes||[]).filter(c=>norm(c.element)===name&&
   [norm(c.existing_source),norm(c.proposed_source)].some(ref=>references.has(ref)));
 if(related.length!==1)return {approved:false,reason:related.length?'Conflicting change evidence':'No exact confirmed change evidence'};
 const change=related[0],kind=norm(change.classification);
 if(!classes.has(kind)||norm(change.confidence)!=='high')
  return {approved:false,reason:'Change is retained, uncertain or lacks high-confidence evidence'};
 const requiredRef=norm(kind==='demolished'?change.existing_source:change.proposed_source);
 if(!references.has(requiredRef))
  return {approved:false,reason:'Change evidence is not linked to the correct drawing stage'};
 return {approved:true,reason:'High-confidence drawing comparison match',change};
}
export function validateDraftChange(pages,changes,draft){
 const existing=(pages||[]).some(p=>norm(p.classification).includes('existing'));
 if(!existing)return true;
 const name=norm(draft.description),ref=norm(draft.drawing_reference);
 // A draft scope item must have one unambiguous, exact change record.
 // Duplicate or contradictory classifications are held for human review.
 if(!name||!ref)return false;
 const related=(changes||[]).filter(c=>norm(c.element)===name&&
   (norm(c.proposed_source)===ref||norm(c.existing_source)===ref));
 return related.length===1&&classes.has(norm(related[0].classification))&&
   norm(related[0].confidence)==='high';
}
