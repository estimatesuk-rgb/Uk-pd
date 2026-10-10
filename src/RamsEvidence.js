// Pure evidence checks used to keep drawing-linked RAMS provisional after source changes.
const list=value=>Array.isArray(value)?value:[];
const rev=value=>String(value?.revision||'Not provided');
const current=docs=>list(docs).filter(d=>d?.status==='Current');
const name=d=>d?.document_no||d?.title||d?.file_path||d?.id||'unknown drawing';

export function drawingRevisionIssues(scan,docs=[]){
 if(!scan)return [];
 const issues=[],now=current(docs),previous=list(scan.document_snapshot);
 if(now.length&&!previous.length)issues.push('Drawing revision verification unavailable: re-analyse current plans to establish a document and revision baseline');
 if(!previous.length)return issues;
 const byId=new Map(now.map(d=>[String(d.id),d]));
 for(const d of now){
  const earlier=previous.find(x=>String(x.id)===String(d.id));
  if(!earlier||rev(earlier)!==rev(d)||String(earlier.file_path||'')!==String(d.file_path||'')){
   issues.push('Drawing revision changed: '+name(d)+' — repeat design-risk and contractor RAMS review');
  }
 }
 for(const d of previous){
  if(!byId.has(String(d.id)))issues.push('Drawing removed or superseded since AI analysis: '+(d.label||d.id)+' — review affected RAMS before issue');
 }
 return issues;
}

export function activityDrawingIssues(sources=[],docs=[],activity='Activity'){
 const issues=[],byId=new Map(current(docs).map(d=>[String(d.id),d]));
 for(const source of list(sources)){
  const drawing=byId.get(String(source.documentId));
  if(!drawing)issues.push(activity+' — linked drawing no longer current: '+(source.name||source.documentId||'unknown'));
  else if(rev(drawing)!==rev(source))issues.push(activity+' — linked drawing revision out of date: '+(source.name||name(drawing))+'; update and review the activity');
 }
 return issues;
}
