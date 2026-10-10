import React,{useEffect,useMemo,useState} from 'react';
import {addProjectActivity,incorporateAiProposals,scopedActivityCatalog,SAFETY_RESEARCH_SOURCES} from './RamsScope.js';
import {printProjectRams} from './RamsReport.js';
import {downloadRamsWord} from './RamsWord.js';
import {CDM_REFERENCES,CPP_GROUPS,SCHEDULE3,RAMS_ACTIVITIES,COSHH_REQUIRED,DOCUMENTS,PERMIT_TYPES} from './RamsLibrary.js';
const shell={border:'1px solid #d8e1e9',borderRadius:8,padding:14,background:'#fff',margin:'12px 0'};
const field={width:'100%',padding:9,border:'1px solid #ccd7e2',borderRadius:5,marginTop:5};
const grid={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(230px,1fr))',gap:12};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const iso=()=>new Date().toISOString().slice(0,10);
const initial=()=>({revision:'P01',status:'DRAFT — NOT APPROVED',issueDate:iso(),cpp:{},schedule3:{},activities:{},coshh:{},coshhReview:{},notification:{},permits:{},records:{},review:{},ai:null,changeLog:[]});
const array=v=>Array.isArray(v)?v:[];
const actApplicable=r=>r?.applicability==='Relevant';
const LABELS={activities:'Activity RAMS',cpp:'Construction Phase Plan',coshh:'COSHH',schedule3:'Schedule 3',permits:'Permits and records',review:'Issue review'};
const detail=(row)=>RAMS_ACTIVITIES.find(x=>x.id===row);
const reviewRequired=(item)=>['location','hazards','initialRisk','controls','residualRisk','method','plant','ppe','responsible','emergency','permits','briefing','reviewedBy'].filter(k=>!String(item?.[k]||'').trim());
const positiveNumber=v=>{if(v===null||v===undefined||String(v).trim()==='')return null;const n=Number(v);return Number.isFinite(n)&&n>=0?n:null};
export function assessF10(notification={}){
 const days=positiveNumber(notification.days),peak=positiveNumber(notification.peakWorkers),personDays=positiveNumber(notification.personDays);
 if(days===null||peak===null||personDays===null)return {status:'Needs programme figures',notifiable:null};
 const notifiable=(days>30&&peak>20)||personDays>500;
 return {status:notifiable?'F10 notification threshold met':'F10 threshold not met on entered programme',notifiable};
}
const officialSource='https://www.hse.gov.uk/pubns/priced/l153.pdf';
export function ramsAudit(pkg={}){
 const issues=[],cpp=pkg.cpp||{},items=pkg.activities||{},coshh=pkg.coshh||{},sch=pkg.schedule3||{},rev=pkg.review||{};
 for(const group of CPP_GROUPS)for(const [key,label] of group.fields){if(!String(cpp[group.id]?.[key]||'').trim())issues.push('CPP / '+group.name+' / '+label)}
 const scan=pkg.ai;
 if(scan){
  const read=array(scan.files_read).length;
  if(Number(scan.files_total||0)>read)issues.push('Drawing analysis incomplete: '+read+' of '+scan.files_total+' current drawings read');
  for(const warning of array(scan.warnings))issues.push('AI drawing warning: '+String(warning));
  for(const item of array(scan.missing_information))issues.push('Design / site information not resolved: '+String(item));
  for(const item of array(scan.significant_design_risks))if(item&&!String(item.action||'').trim())issues.push('Principal Designer design-risk action requires coordination: '+String(item.risk||'Unknown'));
 }
 const f10=assessF10(pkg.notification||{});
 if(f10.notifiable===null)issues.push('F10 screening: enter working days, peak workers and total person-days');
 if(f10.notifiable===true&&!String(pkg.notification?.reference||'').trim())issues.push('F10: notification/reference and responsible person need confirmation');
 if(!String(pkg.notification?.screenedBy||'').trim())issues.push('F10: screening reviewer and date not recorded');
 for(const activity of scopedActivityCatalog(pkg)){
  const a=items[activity.id]||{};
  if(!a.applicability){issues.push('Activity not assessed: '+activity.name);continue}
  if(a.applicability==='To check'){issues.push('Activity requires scope / site verification: '+activity.name);continue}
  if(a.applicability==='Not applicable'&&!String(a.reason||'').trim())issues.push('Exclusion requires justification: '+activity.name);
  if(actApplicable(a)){
   for(const key of reviewRequired(a))issues.push(activity.name+' — '+key+' missing');
   if(!Array.isArray(a.hazardRows)||!a.hazardRows.length)issues.push(activity.name+' — separate hazard-by-hazard risk scores and controls not assessed');
   else for(const [i,r] of a.hazardRows.entries())for(const key of ['hazard','people','initial','controls','residual'])if(!String(r?.[key]||'').trim())issues.push(activity.name+' — hazard '+(i+1)+' / '+key+' missing');
   const sources=array(a.sources);
   if(sources.some(source=>!String(source.note||'').trim()))issues.push(activity.name+' — drawing source needs page/detail annotation');
   if(!sources.length&&!String(a.evidence||'').trim())issues.push(activity.name+' — no drawing reference or documented site/survey evidence');
  }
 }
 for(const [i,label]of SCHEDULE3.entries()){
  const row=sch[i]||{};
  if(!row.state||row.state==='Requires check')issues.push('Schedule 3 requires assessment: '+label);
  if(row.state==='Applicable'&&(!String(row.controls||'').trim()||!String(row.owner||'').trim()))issues.push('Schedule 3 controls / responsible person incomplete: '+label);
  if(row.state==='Not applicable'&&!String(row.reason||'').trim())issues.push('Schedule 3 exclusion reason missing: '+label);
 }
 const screen=pkg.coshhReview||{};
 if(!['Relevant','Not applicable'].includes(screen.state))issues.push('COSHH: project substance screening not completed');
 if(!String(screen.assessor||'').trim())issues.push('COSHH: screening assessor and date missing');
 if(screen.state==='Not applicable'&&!String(screen.reason||'').trim())issues.push('COSHH: exclusion requires written assessment and reason');
 if(screen.state==='Relevant'&&!Object.values(coshh).some(x=>x?.applicability==='Relevant'))issues.push('COSHH: hazardous exposures identified but no relevant substance/task assessment recorded');
 for(const [id,c] of Object.entries(coshh)){
  if(!c.applicability||c.applicability==='To check'){issues.push('COSHH '+id+': product or exposure requires assessment');continue}
  if(c.applicability==='Not applicable'&&!String(c.reason||'').trim())issues.push('COSHH '+id+': exclusion reason missing');
  if(c.applicability==='Relevant')for(const key of ['product','task','sds','hazards','exposure','controls','ppe','storage','emergency','health','assessor'])if(!String(c[key]||'').trim())issues.push('COSHH '+id+': missing '+key);
 }
 for(const [id,label] of DOCUMENTS){
  const row=pkg.records?.[id]||{};
  if(!['Required','Not required'].includes(row.state))issues.push('Site register '+id+': scope and status not assessed');
  if(row.state==='Required'&&(!String(row.reference||'').trim()||!String(row.owner||'').trim()))issues.push('Site register '+id+': issue reference / owner missing');
  if(row.state==='Not required'&&!String(row.reason||'').trim())issues.push('Site register '+id+': exclusion reason missing');
 }
 for(const [id,label] of PERMIT_TYPES){
  const row=pkg.permits?.[id]||{};
  if(!['Required','Not required'].includes(row.state))issues.push('Permit '+id+': applicability not assessed');
  if(row.state==='Required'&&(!String(row.owner||'').trim()||!String(row.reference||'').trim()||!String(row.controls||'').trim()))issues.push('Permit '+id+': owner, authorisation and safe-work controls missing');
  if(row.state==='Not required'&&!String(row.reason||'').trim())issues.push('Permit '+id+': exclusion reason required');
 }
 for(const key of ['principalContractor','siteManager','preparedBy','checkedBy','reviewDate','contractorAccepted','changesProcedure'])if(!String(rev[key]||'').trim())issues.push('Release control: '+key+' not recorded');
 return {issues,ready:issues.length===0,relevant:Object.values(items).filter(actApplicable).length,coshh:Object.values(coshh).filter(x=>x?.applicability==='Relevant').length,f10};
}
function printRams(p,pkg,docs){
 const audit=ramsAudit(pkg),chunks=[];
 const h=(title,ref)=>'<section class="page"><header><strong>UK PRINCIPAL DESIGNERS LTD</strong><h1>'+esc(title)+'</h1><p>'+esc(p.name||'Project')+' | '+esc(p.site_address||'Address to confirm')+' | '+esc(ref)+' | REV '+esc(pkg.revision||'P01')+' | '+esc(pkg.issueDate||iso())+'</p></header>';
 const e=s=>'<div class="entry">'+esc(s||'NOT CONFIRMED')+'</div>';
 const tableRows=rows=>'<table><tbody>'+rows.map(([a,b])=>'<tr><th>'+esc(a)+'</th><td>'+e(b)+'</td></tr>').join('')+'</tbody></table>';
 const close='<footer>DRAFT FOR REVIEW — NOT APPROVED FOR SITE USE | PC / CONTRACTOR TO VERIFY AND ACCEPT</footer></section>';
 chunks.push(h('CDM 2015 — RAMS / CPP / COSHH REGISTER','RAMS-00')+'<h2>Document control</h2>'+tableRows([['Principal Contractor',pkg.review?.principalContractor],['Site Manager',pkg.review?.siteManager],['Prepared by',pkg.review?.preparedBy],['Reviewed by',pkg.review?.checkedBy],['Revision',pkg.revision],['Status','UNVERIFIED DRAFT'],['Original site documents',array(docs).map(x=>(x.title||x.document_no||x.file_path)+' Rev '+(x.revision||'?')).join('; ')||'None']])+'<h2>Document inventory</h2><ul>'+DOCUMENTS.map(([id,label])=>'<li><b>'+esc(id)+'</b>: '+esc(label)+'</li>').join('')+'</ul><h2>Readiness</h2><p>'+audit.issues.length+' unresolved mandatory/provisional inputs. Every record requires competent review, site verification and contractor issue control.</p>'+close);
 for(const g of CPP_GROUPS){chunks.push(h('CONSTRUCTION PHASE PLAN — '+g.name,'CPP-'+g.id.toUpperCase())+tableRows(g.fields.map(([id,label])=>[label,pkg.cpp?.[g.id]?.[id]]))+close)}
 chunks.push(h('CDM Schedule 3 — particular risks','SCH-03')+tableRows(SCHEDULE3.map((x,i)=>[x,'Status: '+(pkg.schedule3?.[i]?.state||'TO CHECK')+'; controls: '+(pkg.schedule3?.[i]?.controls||'NOT RECORDED')+'; reason / evidence: '+(pkg.schedule3?.[i]?.reason||'NOT RECORDED')]))+close);

 chunks.push(h('F10 SCREENING / NOTIFICATION','F10-01')+tableRows([['Working days',pkg.notification?.days],['Peak workers',pkg.notification?.peakWorkers],['Total person-days',pkg.notification?.personDays],['Screening result',audit.f10.status],['Notification reference',pkg.notification?.reference],['Screened by / date',pkg.notification?.screenedBy]])+close);
 chunks.push(h('SITE DOCUMENT & SAFETY RECORD REGISTER','REC-01')+tableRows(DOCUMENTS.map(([id,label])=>{const r=pkg.records?.[id]||{};return [id+' — '+label,'Status: '+(r.state||'NOT ASSESSED')+'; Owner: '+(r.owner||'NOT RECORDED')+'; Reference: '+(r.reference||'NOT RECORDED')+'; Exclusion reason: '+(r.reason||'NOT RECORDED')]}))+close);
 chunks.push(h('PERMIT TO WORK / AUTHORISATION REGISTER','PER-01')+tableRows(PERMIT_TYPES.map(([id,label])=>{const r=pkg.permits?.[id]||{};return [id+' — '+label,'Status: '+(r.state||'NOT ASSESSED')+'; Authorising contractor: '+(r.owner||'NOT RECORDED')+'; Permit / authorisation ref: '+(r.reference||'NOT RECORDED')+'; Controls: '+(r.controls||'NOT RECORDED')+'; Exclusion reason: '+(r.reason||'NOT RECORDED')]}))+close);
 chunks.push(h('COSHH EXPOSURE SCREENING','COSHH-00')+tableRows([['Screening decision',pkg.coshhReview?.state],['Assessment / reason',pkg.coshhReview?.reason],['Competent assessor / date',pkg.coshhReview?.assessor],['Relevant COSHH assessments',audit.coshh]])+close);
 for(const a of RAMS_ACTIVITIES){
 const row=pkg.activities?.[a.id];if(!row||row.applicability!=='Relevant')continue;
 const sources=array(row.sources).map(x=>x.name+' Rev '+(x.revision||'TBC')+'; '+(x.note||'no detail note')+'; '+(x.confidence||'unverified')).join('; ');
 chunks.push(h('RISK ASSESSMENT & METHOD STATEMENT — '+a.name,'RA-MS-'+a.id.toUpperCase())+tableRows([['Activity / location',row.location],['Work scope / sequence',row.method],['Hazards and persons at risk',row.hazards],['Initial risk rating (assessor)',row.initialRisk],['Controls / hierarchy',row.controls],['Residual risk rating (assessor)',row.residualRisk],['Plant, access, lifting, temporary works',row.plant],['PPE / RPE and health monitoring',row.ppe],['Competent persons / supervision',row.responsible],['Emergency and rescue arrangement',row.emergency],['Permit / inspection hold points',row.permits],['Drawings and evidence',sources+'; '+(row.evidence||'')],['Worker briefing / acknowledgment',row.briefing],['Reviewed by / date',row.reviewedBy]])+'<h2>Draft risk themes to evaluate</h2><p>'+esc(a.hazards.join('; '))+'</p>'+close);
 }
 for(const [id,c]of Object.entries(pkg.coshh||{})){
  if(c?.applicability!=='Relevant')continue;
  chunks.push(h('COSHH — '+(c.product||id),'COSHH-'+id)+tableRows([['Product / supplier',c.product],['Current SDS and issue reference',c.sds],['Specific task, location and amount',c.task],['Hazard classification / routes / OEL',c.hazards],['Exposures and people at risk',c.exposure],['Substitution, engineering and extraction controls',c.controls],['PPE / RPE / face fit',c.ppe],['Handling and storage',c.storage],['Spill, first aid, fire and disposal',c.emergency],['Health surveillance / exposure monitoring',c.health],['Assessor and review',c.assessor]])+close)
 }
 const analysis=pkg.ai||{};
 chunks.push(h('DRAWING EVIDENCE / AI CANDIDATES','AI-01')+'<p>AI observations require professional verification against the actual drawings. No automatic contractor method approval.</p><h2>Potential design risks</h2><ul>'+array(analysis.significant_design_risks).map(x=>'<li>'+esc(x.risk)+' — '+esc(x.source_document||'No confirmed drawing')+' — '+esc(x.action)+'</li>').join('')+'</ul><h2>Missing information</h2><ul>'+array(analysis.missing_information).map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>'+close);
 chunks.push(h('OUTSTANDING INFORMATION / RELEASE BLOCKERS','REVIEW-01')+'<ul>'+audit.issues.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul><p><strong>Document control:</strong> This document does not certify legal compliance or construction methodology. Principal Contractor or sole contractor must prepare/maintain the actual CPP, complete task assessments, ensure competence/worker consultation, and accept the final approved arrangements.</p>'+close);
 const w=window.open('','_blank');if(!w){alert('Allow pop-ups to print the RAMS pack');return;}
 w.document.write('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>UKPD RAMS draft</title><style>@page{size:A4;margin:15mm}body{font:12px Arial,sans-serif;color:#21344b;margin:0}h1{font-size:20px;margin:12px 0}h2{font-size:15px;margin:16px 0 9px}.page{page-break-after:always;position:relative;min-height:250mm}header{border-bottom:3px solid #d02432;padding:8px 0 15px}header strong{letter-spacing:2px}footer{border-top:2px solid #d02432;font-size:10px;position:absolute;bottom:0;left:0;right:0;padding:10px 0}table{width:100%;border-collapse:collapse;table-layout:fixed}td,th{border:1px solid #b9c9d5;padding:8px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#eef3f7;width:40%}.entry{white-space:pre-wrap}li{margin:7px 0;overflow-wrap:anywhere}@media screen{body{padding:20px}.page{box-shadow:0 2px 18px #0002;padding:20px;margin:20px auto;max-width:860px}}</style></head><body>'+chunks.join('')+'</body></html>');w.document.close();w.focus();setTimeout(()=>w.print(),500);
}
const GROUPS=['cpp','activities','coshh','schedule3','permits','review','evidence'];
export default function RamsWorkspace({project,docs=[],questions=[],db,onSaved}){
 const [pkg,setPkg]=useState(()=>({...initial(),...(project.rams_package||{})}));
 const [page,setPage]=useState('evidence'),[choice,setChoice]=useState('site_setup'),[group,setGroup]=useState('project'),[coshhId,setCoshhId]=useState('substance-1'),[busy,setBusy]=useState(false),[status,setStatus]=useState(''),[newActivity,setNewActivity]=useState('');
 useEffect(()=>{setPkg({...initial(),...(project.rams_package||{})});setStatus('')},[project.id]);
 const audit=useMemo(()=>ramsAudit(pkg),[pkg]);
 const setRoot=(key,value)=>{setPkg(old=>({...old,[key]:value}));setStatus('Unsaved changes')};
 const setItem=(key,id,fieldName,value)=>setPkg(old=>({...old,[key]:{...(old[key]||{}),[id]:{...(old[key]?.[id]||{}),[fieldName]:value}}}));
 const setCpp=(grp,key,value)=>setPkg(old=>({...old,cpp:{...(old.cpp||{}),[grp]:{...(old.cpp?.[grp]||{}),[key]:value}}}));
 const docsList=array(docs).filter(x=>x.status==='Current');
 const catalog=scopedActivityCatalog(pkg);
 const selected=catalog.find(x=>x.id===choice)||catalog[0];
 const item=pkg.activities?.[selected.id]||{};
 const groupObj=CPP_GROUPS.find(x=>x.id===group)||CPP_GROUPS[0];
 const fieldInput=(label,val,onChange,multi=true,placeholder='Site-specific information to confirm')=><label style={{display:'block',fontSize:12,fontWeight:650,margin:'10px 0'}}>{label}{multi?<textarea style={{...field,minHeight:58}} rows={2} value={val||''} placeholder={placeholder} onChange={e=>onChange(e.target.value)}/>:<input style={field} value={val||''} placeholder={placeholder} onChange={e=>onChange(e.target.value)}/>}</label>;
 async function save(next=pkg){setBusy(true);setStatus('Saving RAMS to project database…');try{const {error}=await db.from('projects').update({rams_package:next}).eq('id',project.id);if(error)throw error;if(onSaved)onSaved(current=>({...current,rams_package:next}));setStatus('RAMS draft saved to project');return true}catch(e){setStatus('Save failed: '+e.message);return false}finally{setBusy(false)}}
 async function analyse(){
  if(!docsList.length){setStatus('Upload current drawings before requesting plan review.');return}
  setBusy(true);
  const batches=[];for(let i=0;i<docsList.length;i+=5)batches.push(docsList.slice(i,i+5));
  const combined={summary:'',analysed_files:[],suggested_activities:[],coshh_candidates:[],significant_design_risks:[],schedule3_flags:[],missing_information:[],warnings:[],files_read:[],unsupported:[]};
  let processed=0;
  try{
   for(let i=0;i<batches.length;i++){
    setStatus('Analysing current drawing batch '+(i+1)+' of '+batches.length+'; do not close the project…');
    const batch=batches[i];
    try{
     const {data,error}=await db.functions.invoke('rams-assistant',{body:{project_id:project.id,document_ids:batch.map(d=>d.id)}});
     if(error)throw error;if(data?.error)throw new Error(data.error);
     if(!data?.analysis)throw new Error('AI did not return drawing analysis');
     const ai=data.analysis;
     for(const key of ['analysed_files','suggested_activities','coshh_candidates','significant_design_risks','schedule3_flags','missing_information','warnings','files_read','unsupported'])combined[key].push(...array(ai[key]));
     if(ai.summary)combined.summary+=(combined.summary?'\n':'')+'Batch '+(i+1)+': '+ai.summary;
     processed+=batch.length;
    }catch(batchErr){
     combined.warnings.push('Drawing batch '+(i+1)+' failed: '+String(batchErr?.message||batchErr)+'. Re-run after resolving this failure.');
     combined.missing_information.push('Unreviewed drawings in failed batch: '+batch.map(d=>d.document_no||d.title||d.file_path).join(', '));
    }
   }
   if(!combined.files_read.length)throw new Error(combined.warnings.join(' ')||'No drawings could be analysed');
   const dedupe=(v,key)=>[...new Map(v.map(x=>[typeof x==='string'?x:String(x?.[key]||JSON.stringify(x)),x])).values()];
   combined.suggested_activities=dedupe(combined.suggested_activities,'activity_id');
   combined.coshh_candidates=dedupe(combined.coshh_candidates,'substance');
   combined.significant_design_risks=dedupe(combined.significant_design_risks,'risk');
   combined.generated_at=new Date().toISOString();
   combined.files_total=docsList.length;
   combined.files_reviewed=combined.files_read.length;
   combined.status=combined.files_read.length<docsList.length?'INCOMPLETE AI DRAFT — SOME FILES NOT READ':'AI DRAFT — VERIFY SOURCE REFERENCES';
   const withProposals=incorporateAiProposals(pkg,combined.suggested_activities,docsList);
   const next={...withProposals,ai:combined,revision:pkg.revision||'P01',status:'AI DRAFT — CONTRACTOR REVIEW REQUIRED'};
   setPkg(next);
   const ok=await save(next);
   setStatus(ok?('AI analysis saved. '+combined.files_read.length+'/'+docsList.length+' current files read; '+combined.warnings.length+' warnings. Review all proposed work and site questions.'):'Analysis obtained, but save failed. Save before leaving.');
   setPage('evidence');
  }catch(err){setStatus('Analysis failed: '+(err?.message||String(err)))}
  finally{setBusy(false)}
 }
 const addManualActivity=()=>{
  try{
   const added=addProjectActivity(pkg,newActivity);
   setPkg(added.pkg);setChoice(added.id);setNewActivity('');setPage('activities');
   setStatus('New project-specific activity added as provisional; enter its hazards, controls, method, evidence and reviewer then save.');
  }catch(err){setStatus(err.message||'Please provide a specific work activity.')}
 };
 const updateHazard=(idx,key,value)=>{
  const items=[...(Array.isArray(item.hazardRows)?item.hazardRows:[])];
  items[idx]={...(items[idx]||{}),[key]:value};
  setItem('activities',selected.id,'hazardRows',items);setStatus('Unsaved changes');
 };

 const addSource=(docId)=>{const d=docsList.find(x=>x.id===docId);if(!d)return;const sources=array(item.sources);if(sources.some(x=>x.documentId===docId))return;setItem('activities',selected.id,'sources',[...sources,{documentId:d.id,name:d.document_no||d.title||d.file_path,revision:d.revision||'Not provided',note:'',confidence:'Needs checking'}]);setStatus('Unsaved changes')};
 const input=(name,label,multi=true)=>fieldInput(label,item[name],v=>{setItem('activities',selected.id,name,v);setStatus('Unsaved changes')},multi);
 const cells=(
  <>
  {input('location','Work area / exact location / limits')}
  {input('hazards','Hazards, people exposed and foreseeable harm')}
  {input('initialRisk','Initial risk score and assessment method',false)}
  {input('controls','Specific control measures / hierarchy of control')}
  {input('residualRisk','Residual risk after controls and approval basis',false)}
  {input('method','Work sequence — setup, activity, hold points, handover')}
  {input('plant','Plant, lifting, scaffolds, temporary works and inspection checks')}
  {input('ppe','PPE / RPE, face fit and exposure/health surveillance')}
  {input('responsible','Competent supervisor, trade contractor and training / licences')}
  {input('emergency','Rescue and emergency arrangements for this activity')}
  {input('permits','Work permits, isolation, approvals and inspection hold points')}
  {input('evidence','Surveys, designs, drawings, certificates and remaining checks')}
  {input('briefing','Toolbox talk, workforce consultation and RAMS acknowledgment')}
  {input('reviewedBy','Contractor technical reviewer / date (not an automated sign-off)')}
  </>
 );
 return <section className='panel'>
 <div className='reportInfoHead'><div><span className='packageCode'>CDM 2015 — CONTRACTOR DRAFT</span><h2>Construction Phase Plan · RAMS · COSHH</h2><p className='muted'>Drawing-linked technical safety workspace, HSE reference inventory and accountable site review. The Principal Designer supplies residual design risks; the Principal Contractor or sole contractor establishes and approves safe working arrangements.</p></div><div><b>{audit.issues.length} open checks</b><p className='muted'>{docsList.length} current project documents</p></div></div>
 <div style={{display:'flex',gap:10,flexWrap:'wrap',margin:'12px 0'}}><button disabled={busy} onClick={analyse}>{busy?'Working…':'Analyse uploaded plans for RAMS'}</button><button disabled={busy} onClick={()=>save()}>Save RAMS draft</button><button className='outline' onClick={()=>printProjectRams(project,pkg,docsList,audit.issues)}>Print full reference-style A4 draft pack</button><button className='outline' onClick={async()=>{try{await downloadRamsWord(project,pkg,docsList,audit.issues);setStatus('Editable Word RAMS draft downloaded — professional approval still required.')}catch(e){setStatus('Word export failed: '+(e?.message||e))}}}>Download editable Word RAMS pack</button></div>
 <p role='status' style={{color:'#31516a',minHeight:22}}>{status||'No legal approval is issued by this software. Resolve open checks and obtain contractor review before site use.'}</p>
 <div style={grid}><div style={shell}><b>Risk assessments / method statements</b><h3>{audit.relevant} relevant</h3><small>Each requires method, controls, evidence and briefing</small></div><div style={shell}><b>Substance assessments</b><h3>{audit.coshh} identified</h3><small>Exact current SDS / exposure assessment required</small></div><div style={shell}><b>Site readiness</b><h3>{audit.issues.length} gaps</h3><small>Draft until signed professional and contractor review</small></div></div>
 <div style={{display:'flex',gap:8,flexWrap:'wrap',margin:'14px 0'}}>{GROUPS.map(p=><button key={p} className={page===p?'selected':'outline'} onClick={()=>setPage(p)}>{({cpp:'Construction Phase Plan',activities:'Risk assessments & methods',coshh:'COSHH',schedule3:'Schedule 3',permits:'Records & permits',review:'Dutyholders & issue',evidence:'Drawing evidence & AI'})[p]}</button>)}</div>
 {page==='evidence'&&<div style={shell}><h3>Pre-construction information and drawing-derived risks</h3><p>The AI checks current project drawings in batches of up to five (8 MB maximum per batch). Files that fail to load are reported as missing evidence, not silently marked as reviewed. Actual site methods still require contractor review.</p><h4>Current drawing register</h4><table><thead><tr><th>Document</th><th>Revision</th><th>Status</th></tr></thead><tbody>{docsList.map(d=><tr key={d.id}><td>{d.document_no||d.title||d.file_path}</td><td>{d.revision||'Unrecorded'}</td><td>{d.status}</td></tr>)}</tbody></table>{docsList.length>5&&<p style={{color:'#a54a20'}}>This project has {docsList.length} drawings. The AI will process multiple batches and report every failed or unread file; larger projects may require additional AI usage allowance.</p>}
 {pkg.ai?<><h4>AI plan-review findings</h4><p><b>{pkg.ai.summary}</b></p><p className='muted'>Last analysis {pkg.ai.generated_at||'Unknown'} · Documents read: {array(pkg.ai.files_read).join(', ')||'Not recorded'}.</p>
 <h4>Proposed activities</h4>{array(pkg.ai.suggested_activities).map((x,i)=><div key={i} style={{...shell,background:'#f5f7fa'}}><b>{catalog.find(y=>y.id===x.activity_id)?.name||x.activity_name||x.activity_id}</b><p>{x.reason}</p><small>Drawing: {x.source_document||'NOT EVIDENCED'} · {x.source_note||'No page detail'} · Confidence {x.confidence||'Low'}</small><p><b>Verify:</b> {x.verification}</p><button className='outline' onClick={()=>{setChoice(catalog.some(y=>y.id===x.activity_id)?x.activity_id:('custom_'+String(x.activity_name||x.activity_id||'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,75)));setPage('activities')}}>Review this RAMS item</button></div>)}
 <h4>Significant residual design risks</h4><ul>{array(pkg.ai.significant_design_risks).map((x,i)=><li key={i}><b>{x.risk}</b> — {x.source_document||'No drawing evidence'}; {x.action}</li>)}</ul>
 <h4>Analysis coverage and warnings</h4><p>{pkg.ai.files_reviewed||array(pkg.ai.files_read).length} of {pkg.ai.files_total||docsList.length} current documents read.</p><ul>{array(pkg.ai.warnings).map((x,i)=><li key={i} style={{color:'#a54a20'}}>{x}</li>)}</ul><h4>Information still required</h4><ul>{array(pkg.ai.missing_information).map((x,i)=><li key={i}>{x}</li>)}</ul>
 <h4>Possible COSHH products to confirm</h4><ul>{array(pkg.ai.coshh_candidates).map((x,i)=><li key={i}><b>{x.substance}</b> — {x.verification} <button className='outline' onClick={()=>{const id='substance-'+(Math.max(1,...Object.keys(pkg.coshh||{}).map(k=>Number(k.match(/^substance-(\d+)$/)?.[1])||0))+1);setPkg(old=>({...old,coshh:{...(old.coshh||{}),[id]:{applicability:'To check',product:x.substance,task:catalog.find(y=>y.id===x.activity_id)?.name||'',sds:'',source_document:x.source_document||'',assessor:''}}}));setCoshhId(id);setPage('coshh');setStatus('COSHH draft added; obtain current manufacturer SDS and complete assessment before saving.')}}>Create COSHH record</button></li>)}</ul></>:<p className='muted'>No drawing analysis yet. Run the AI above after uploading drawings. Filename matches alone are not accepted as drawing evidence.</p>}</div>}
 {page==='evidence'&&<div style={shell}><h3>Job-specific construction questions</h3><p className='muted'>Record decisions not stated on drawings. They are not proof of safe working methods until supported and accepted by the contractor.</p>
 {array(pkg.ai?.missing_information).map((q,i)=><div key={i}>{fieldInput(q,pkg.scopeAnswers?.[i],v=>setRoot('scopeAnswers',{...(pkg.scopeAnswers||{}),[i]:v}))}</div>)}
 <h4>Authoritative guidance for research</h4><p>AI-generated proposals require checking against source guidance and the actual contractor's chosen materials and methods.</p><ul>{SAFETY_RESEARCH_SOURCES.map(src=><li key={src.url}><a target='_blank' rel='noreferrer' href={src.url}>{src.name}</a></li>)}</ul>
 </div>}
 {page==='cpp'&&<div style={shell}><h3>Construction Phase Plan — CDM Regulation 12</h3><p>The principal contractor (or sole contractor) must prepare, review and maintain the actual CPP before construction. Record specific site arrangements.</p><label>CPP section<select style={field} value={group} onChange={e=>setGroup(e.target.value)}>{CPP_GROUPS.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label><h4>{groupObj.name}</h4><div style={grid}>{groupObj.fields.map(([id,label])=><div key={id}>{fieldInput(label,pkg.cpp?.[group]?.[id],v=>{setCpp(group,id,v);setStatus('Unsaved changes')})}</div>)}</div>
 {group==='project'&&<div style={{...shell,background:'#f3f7fb'}}><h4>F10 notification threshold assessment</h4><p className='muted'>Notifiable if work lasts more than 30 working days and has more than 20 workers simultaneously at any point, OR if it exceeds 500 person-days. A CPP is required on construction projects whether or not notifiable.</p>
 <div style={grid}>{[['days','Expected working days'],['peakWorkers','Maximum simultaneous workers'],['personDays','Total person-days']].map(([key,title])=><div key={key}>{fieldInput(title,pkg.notification?.[key],v=>setRoot('notification',{...(pkg.notification||{}),[key]:v}),false)}</div>)}</div>
 <p><b>Screening:</b> {assessF10(pkg.notification).status}</p>
 <div style={grid}>{fieldInput('HSE F10 submission/reference (only if notifiable)',pkg.notification?.reference,v=>setRoot('notification',{...(pkg.notification||{}),reference:v}))}{fieldInput('Screened by / role / date and decision evidence',pkg.notification?.screenedBy,v=>setRoot('notification',{...(pkg.notification||{}),screenedBy:v}))}</div>
 <p><a href='https://www.hse.gov.uk/construction/cdm/faq/index.htm' target='_blank' rel='noreferrer'>HSE F10 notification guidance</a></p></div>}</div>}
 {page==='activities'&&<div style={shell}><h3>Risk assessment & method statement by construction activity</h3><p>Add any work package that the standard catalogue or drawing analysis missed. Project scope decides what is included.</p><div style={{...grid,alignItems:'end'}}><input style={field} value={newActivity} placeholder='e.g. underpinning, piling, fire-stopping, crane rail installation' onChange={e=>setNewActivity(e.target.value)}/><button type='button' onClick={addManualActivity}>+ Add project-specific work</button></div><label>Construction activity<select style={field} value={choice} onChange={e=>setChoice(e.target.value)}>{catalog.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label><p><b>Relevant H&S legislation:</b> {selected.regs}</p><p className='muted'>Hazard themes: {selected.hazards.join(' • ')}</p><label>Applicability<select style={field} value={item.applicability||''} onChange={e=>{setItem('activities',selected.id,'applicability',e.target.value);setStatus('Unsaved changes')}}><option value=''>Not assessed</option><option value='To check'>Potential / needs site confirmation</option><option value='Relevant'>Relevant — include in RAMS</option><option value='Not applicable'>Not applicable — record reason</option></select></label>{fieldInput('Activity decision / exclusion / scope reason',item.reason,v=>{setItem('activities',selected.id,'reason',v);setStatus('Unsaved changes')})}
 {(item.applicability==='Relevant'||item.applicability==='To check')&&<><h4>Drawing and plan evidence</h4><label>Add actual drawing reference<select style={field} value='' onChange={e=>addSource(e.target.value)}><option value=''>Select a current drawing</option>{docsList.map(d=><option key={d.id} value={d.id}>{d.document_no||d.title||d.file_path} (rev {d.revision||'?'})</option>)}</select></label>{array(item.sources).map((x,i)=><div style={{...shell,background:'#f4f7fa'}} key={i}><b>{x.name} — Rev {x.revision}</b>{fieldInput('Page, note or detail which establishes this work',x.note,v=>{let links=[...item.sources];links[i]={...links[i],note:v};setItem('activities',selected.id,'sources',links);setStatus('Unsaved changes')})}<small>Evidence confidence: {x.confidence||'Not assessed'}</small><p><button className='outline' onClick={()=>{setItem('activities',selected.id,'sources',item.sources.filter((_,ix)=>ix!==i));setStatus('Unsaved changes')}}>Remove link</button></p></div>)}
 <h4>Individual risk matrix (hazard by hazard)</h4><p className='muted'>Add one line per actual hazard. Each likelihood × severity score must be assessed for the activity, before and after the named controls.</p>
 {array(item.hazardRows).map((r,i)=><div key={i} style={{...shell,background:'#f7f9fb'}}><b>Hazard {i+1}</b><div style={grid}>{[['hazard','Hazard / foreseeable harm'],['people','Who may be harmed'],['initial','Initial L × S = score'],['controls','Specific preventive controls'],['residual','Residual L × S = score']].map(([k,label])=><div key={k}>{fieldInput(label,r[k],v=>updateHazard(i,k,v),k==='controls')}</div>)}</div><button className='outline' onClick={()=>{setItem('activities',selected.id,'hazardRows',item.hazardRows.filter((_,idx)=>idx!==i));setStatus('Unsaved changes')}}>Remove this hazard</button></div>)}
 <button className='outline' onClick={()=>{setItem('activities',selected.id,'hazardRows',[...array(item.hazardRows),{hazard:'',people:'',initial:'',controls:'',residual:''}]);setStatus('Unsaved changes')}}>+ Add individual hazard</button>
 <div style={grid}>{cells}</div><div style={{...shell,background:'#f4f7fa'}}> <b>Common hazard and control prompts — review, do not copy as approval</b><p>{selected.hazards.join('; ')}</p><p>{selected.controls.join('; ')}</p></div></>}</div>}
 {page==='coshh'&&<div style={shell}><h3>COSHH register & substance-specific assessments</h3><p>Identify actual substances and products used on site. A generic building materials list or architectural note is not a current Safety Data Sheet.</p><div style={{...shell,background:'#f3f7fb'}}><h4>Project COSHH exposure screening</h4><label>Foreseeable hazardous products, dusts, fumes or biological exposures?<select style={field} value={pkg.coshhReview?.state||''} onChange={e=>setRoot('coshhReview',{...(pkg.coshhReview||{}),state:e.target.value})}><option value=''>Not assessed</option><option value='Relevant'>Yes — individual substance/task COSHH assessments needed</option><option value='Not applicable'>No relevant exposure — give reasons</option></select></label><div style={grid}>{fieldInput('Reason, scope and exposure assessment',pkg.coshhReview?.reason,v=>setRoot('coshhReview',{...(pkg.coshhReview||{}),reason:v}))}{fieldInput('Competent assessor / date',pkg.coshhReview?.assessor,v=>setRoot('coshhReview',{...(pkg.coshhReview||{}),assessor:v}))}</div></div><div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}><select value={coshhId} style={{...field,flex:'1'}} onChange={e=>setCoshhId(e.target.value)}><option value='substance-1'>Substance 1</option>{Object.keys(pkg.coshh||{}).filter(x=>x!=='substance-1').map(id=><option value={id} key={id}>{id}</option>)}</select><button onClick={()=>{const id='substance-'+(Math.max(1,...Object.keys(pkg.coshh||{}).map(k=>Number(k.match(/^substance-(\d+)$/)?.[1])||0))+1);setCoshhId(id);setItem('coshh',id,'applicability','To check');setStatus('Unsaved changes')}}>+ Add COSHH assessment</button></div><label>Applicability<select value={pkg.coshh?.[coshhId]?.applicability||''} style={field} onChange={e=>{setItem('coshh',coshhId,'applicability',e.target.value);setStatus('Unsaved changes')}}><option value=''>Not assessed</option><option value='To check'>Product / SDS needed</option><option value='Relevant'>Relevant and to be assessed</option><option value='Not applicable'>Not required — justify</option></select></label>{fieldInput('Exclusion or unresolved substance justification',pkg.coshh?.[coshhId]?.reason,v=>{setItem('coshh',coshhId,'reason',v);setStatus('Unsaved changes')})}<div style={grid}>{[['product','Exact product and manufacturer'],['task','Use, location, duration and quantity'],['sds','Current supplier SDS reference, date and version'],['hazards','Hazard statements, routes, workplace exposure limits'],['exposure','Persons at risk and realistic exposure routes'],['controls','Substitution, engineering, LEV and handling measures'],['ppe','PPE/RPE and face fit where necessary'],['storage','Storage and incompatible substances'],['emergency','Spill, first aid, fire and disposal arrangements'],['health','Exposure monitoring / health surveillance'],['assessor','Competent COSHH assessor, review date']].map(([key,title])=><div key={key}>{fieldInput(title,pkg.coshh?.[coshhId]?.[key],v=>{setItem('coshh',coshhId,key,v);setStatus('Unsaved changes')})}</div>)}</div><h4>Required substance-assessment checks</h4><ul>{COSHH_REQUIRED.map(x=><li key={x}>{x}</li>)}</ul></div>}
 {page==='schedule3'&&<div style={shell}><h3>Schedule 3 — particular risks</h3><p>Record each category's applicability. A design drawing cannot rule out site risks without suitable evidence.</p>{SCHEDULE3.map((x,i)=>{const v=pkg.schedule3?.[i]||{};return <div key={i} style={{...shell,background:'#f7f9fb'}}><b>{i+1}. {x}</b><select value={v.state||''} style={field} onChange={e=>{setItem('schedule3',i,'state',e.target.value);setStatus('Unsaved changes')}}><option value=''>Not checked</option><option value='Requires check'>Requires investigation</option><option value='Applicable'>Applicable — specific measures required</option><option value='Not applicable'>Not applicable — reason required</option></select><div style={grid}>{fieldInput('Evidence and exclusion reason',v.reason,z=>{setItem('schedule3',i,'reason',z);setStatus('Unsaved changes')})}{fieldInput('Specific measures / safeguards / permits',v.controls,z=>{setItem('schedule3',i,'controls',z);setStatus('Unsaved changes')})}{fieldInput('Named responsible contractor',v.owner,z=>{setItem('schedule3',i,'owner',z);setStatus('Unsaved changes')})}</div></div>})}</div>}
 {page==='permits'&&<div style={shell}><h3>Site records, task permits and authorisations</h3><p>Assess every document and relevant formal authorisation for this site. A permit is only selected when required by the activity, contractor's control system or another specific duty.</p>
 <h4>Safety records and document register</h4>
 {DOCUMENTS.map(([id,label])=>{const row=pkg.records?.[id]||{};return <div key={id} style={{...shell,background:'#f7f9fb'}}><b>{id}: {label}</b><label>Document requirement<select style={field} value={row.state||''} onChange={e=>{setItem('records',id,'state',e.target.value);setStatus('Unsaved changes')}}><option value=''>Not assessed</option><option value='Required'>Required / plan and retain evidence</option><option value='Not required'>Not required — justify</option></select></label><div style={grid}>{row.state==='Required'&&<>{fieldInput('Reference, revision, available location',row.reference,z=>{setItem('records',id,'reference',z);setStatus('Unsaved changes')})}{fieldInput('Document owner and review period',row.owner,z=>{setItem('records',id,'owner',z);setStatus('Unsaved changes')})}</>}{row.state==='Not required'&&fieldInput('Exclusion reason and reference',row.reason,z=>{setItem('records',id,'reason',z);setStatus('Unsaved changes')})}</div></div>})}
 <h4>Activity permit / authorisation screening</h4>
 {PERMIT_TYPES.map(([id,label])=>{const row=pkg.permits?.[id]||{};return <div key={id} style={{...shell,background:'#f7f9fb'}}><b>{id}: {label}</b><label>Permit / authorisation needed?<select style={field} value={row.state||''} onChange={e=>{setItem('permits',id,'state',e.target.value);setStatus('Unsaved changes')}}><option value=''>Not assessed</option><option value='Required'>Required by site/task control</option><option value='Not required'>Not required — justification recorded</option></select></label><div style={grid}>{row.state==='Required'&&<>{fieldInput('Permit / approval reference',row.reference,z=>{setItem('permits',id,'reference',z);setStatus('Unsaved changes')})}{fieldInput('Authorising manager / contractor',row.owner,z=>{setItem('permits',id,'owner',z);setStatus('Unsaved changes')})}{fieldInput('Work limits, isolation, conditions and close-out',row.controls,z=>{setItem('permits',id,'controls',z);setStatus('Unsaved changes')})}</>}{row.state==='Not required'&&fieldInput('Scope and evidence for exclusion',row.reason,z=>{setItem('permits',id,'reason',z);setStatus('Unsaved changes')})}</div></div>})}
 </div>}
 {page==='review'&&<div style={shell}><h3>Principal Contractor responsibility and issue control</h3><p><b>No one-click automatic approval.</b> Signing, workforce briefing, adequacy of controls and site adoption require actual competent people and evidence.</p><div style={grid}>{[['principalContractor','CDM Principal Contractor (or sole contractor)'],['siteManager','Site Manager / direct supervision'],['preparedBy','Prepared by / competent assessor'],['checkedBy','Checked by / competent reviewer'],['reviewDate','Review date'],['contractorAccepted','Contractor acceptance reference and date'],['changesProcedure','Review triggers, changes and re-brief process']].map(([key,label])=><div key={key}>{fieldInput(label,pkg.review?.[key],v=>{setRoot('review',{...(pkg.review||{}),[key]:v})})}</div>)}</div><div style={grid}>{fieldInput('Document revision',pkg.revision,v=>setRoot('revision',v),false)}{fieldInput('Document issue date',pkg.issueDate,v=>setRoot('issueDate',v),false)}</div><p className='muted'><b>HSE sources:</b></p><ul>{CDM_REFERENCES.map(r=><li key={r.url}><a href={r.url} target='_blank' rel='noreferrer'>{r.name}</a></li>)}</ul></div>}
 <p style={{fontSize:12,color:'#6c7b87'}}>DRAFT / NOT FOR CONSTRUCTION. Safeguards and methods must be completed and adopted by the competent contractor and coordinated by the PC. Check CDM 2015 Regulation 12 and Schedule 3 as applicable. No regulatory approval, sign-off, rescue arrangements or actual COSHH controls are generated automatically.</p>
 </section>
}