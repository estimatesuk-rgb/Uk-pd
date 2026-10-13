// Fail-closed cross-drawing evidence gate for automatic take-off.
// AI descriptions alone do not establish geometric identity.
const norm=v=>String(v??'').toLowerCase().replace(/\s+/g,' ').trim();
const classes=new Set(['new','altered','demolished']);
export function classifyChangeEvidence(pages,changes,candidate){
 const existing=(pages||[]).some(p=>norm(p.classification).includes('existing'));
 if(!existing)return {approved:true,reason:'No existing plan supplied: new-build mode; QS review still required'};
 const source=norm(candidate.filename),page=Number(candidate.page),name=norm(candidate.mark?.name);
 if(!source||!Number.isInteger(page)||page<1||!name)return {approved:false,reason:'Missing traceable drawing reference'};
 const matches=(changes||[]).filter(c=>{
  const kind=norm(c.classification);
  if(!classes.has(kind)||norm(c.confidence)!=='high')return false;
  const ref=norm(kind==='demolished'?c.existing_source:c.proposed_source);
  const filenameMatch=ref===source+' p'+page||ref===source+' page '+page||
    ref===source+' '+page;
  return filenameMatch&&norm(c.element)===name;
 });
 if(matches.length!==1)return {approved:false,reason:matches.length?'Conflicting change evidence':'No exact confirmed change evidence'};
 return {approved:true,reason:'High-confidence drawing comparison match',change:matches[0]};
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
