// Never automatically reconcile conflicting provisional AI quantities.
const norm=s=>String(s||'').toLowerCase().replace(/\b(new|proposed|construction|the|of|work|works|area|areas)\b/g,' ').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
const tokenSimilarity=(a,b)=>{
 const aa=new Set(norm(a).split(' ').filter(x=>x.length>2));
 const bb=new Set(norm(b).split(' ').filter(x=>x.length>2));
 if(!aa.size||!bb.size)return 0;
 const same=[...aa].filter(x=>bb.has(x)).length;
 return same/Math.min(aa.size,bb.size);
};
const close=(a,b,tol=.02)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=tol;
function sameSource(entry,item){
 const e=item?.takeoff_evidence||{};
 if(e.drawing_id&&e.page)return e.drawing_id===entry.document_id&&Number(e.page)===entry.page;
 const d=String(item?.drawing||'').trim().toLowerCase();
 return d===String(entry.filename+' p'+entry.page).toLowerCase();
}
export function duplicateAutoCandidate(entry,items){
 const candidates=(items||[]).filter(i=>sameSource(entry,i)
    &&i?.takeoff_evidence?.automatic===true
    &&String(i.unit||'')===String(entry.unit||''));
 for(const i of candidates){
   const e=i.takeoff_evidence;
   if(i.ai_auto_key&&entry.key===i.ai_auto_key)
     return {duplicate:true,reason:'Previously measured same outlined work'};
   const nameScore=tokenSimilarity(entry.mark?.name,i.description);
   const region=e.region||{};
   const mark=entry.mark||{};
   const sameLocation=['x','y'].every(k=>close(Number(region[k]),Number(mark[k]),.035));
   const sameExtent=['w','h'].every(k=>close(Number(region[k]),Number(mark[k]),.06));
   const q1=Number(i.quantity),q2=Number(entry.quantity);
   const sameQuantity=q1>0&&q2>0&&Math.abs(q1-q2)<=Math.max(.05,q1*.02);
   if(nameScore>=.8&&sameLocation&&sameExtent)
     return {duplicate:true,reason:sameQuantity?'Existing AI quantity and outline match':'Conflicting AI quantity on substantially same outline — QS reconcile'};
   if(nameScore>=.8&&sameQuantity&&sameLocation)
     return {duplicate:true,reason:'Previously measured same work and approximate position'};
 }
 return {duplicate:false,reason:''};
}
