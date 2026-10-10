// A4 print layout for project-specific draft CPP, separate RA/MS, COSHH and registers.
// Source evidence and human review are mandatory; formatting is not an approval.
import {CPP_GROUPS,SCHEDULE3,DOCUMENTS,PERMIT_TYPES} from './RamsLibrary.js';
import {scopedActivityCatalog} from './RamsScope.js';
const html=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const lines=s=>String(s??'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
const listed=s=>lines(s).length?'<ol>'+lines(s).map(t=>'<li>'+html(t.replace(/^\d+[.)]\s*/,''))+'</li>').join('')+'</ol>':'<p>NOT CONFIRMED — enter activity-specific steps.</p>';
const v=x=>'<span style="white-space:pre-wrap">'+html(String(x||'TO BE CONFIRMED'))+'</span>';
const tr=(title,value)=>'<tr><th>'+html(title)+'</th><td>'+v(value)+'</td></tr>';
const table=rows=>'<table>'+rows.map(([k,w])=>tr(k,w)).join('')+'</table>';
const cols=(header,rows)=>'<table><thead><tr>'+header.map(h=>'<th>'+html(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(cell=>'<td>'+v(cell)+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
function riskRows(a){
 const rows=Array.isArray(a.hazardRows)?a.hazardRows.filter(r=>r&&r.hazard?.trim()):[];
 if(rows.length)return rows.map(r=>[r.hazard,r.people,r.initial,r.controls,r.residual]);
 return [[a.hazards||'Individual hazards not yet recorded','To confirm',a.initialRisk||'Assessor to score',a.controls||'Controls require confirmation',a.residualRisk||'Assessor to score']];
}
export function renderRamsReport(project,pkg,docs=[],issues=[]){
 const title=html(project?.name||'Project to confirm');
 const address=html(project?.site_address||'Site address to confirm');
 const revision=html(pkg?.revision||'P01');
 const issueDate=html(pkg?.issueDate||new Date().toISOString().slice(0,10));
 const status='DRAFT — NOT APPROVED FOR CONSTRUCTION';
 const first=(heading,ref)=>'<section class="sheet"><div class="running"><img alt="UK Principal Designers logo" src="/ukpd-logo.jpg" /></div><h1>'+html(heading)+'</h1><p class="subtitle">'+title+' | '+address+' | '+html(ref)+' | REV '+revision+' | '+issueDate+'</p>';
 const end='<footer>UK PRINCIPAL DESIGNERS LTD | CONTROLLED DRAFT | '+revision+' | '+issueDate+' | PC / COMPETENT REVIEW REQUIRED</footer></section>';
 let pages=[];
 pages.push('<section class="sheet cover"><div class="running"><img alt="UK Principal Designers logo" src="/ukpd-logo.jpg" /></div><h1>CONSTRUCTION PHASE PLAN<br/>RISK ASSESSMENTS &amp; METHOD STATEMENTS</h1>'+table([
 ['Project',project?.name],['Client',pkg?.cpp?.project?.client],['Location',project?.site_address],
 ['Principal Designer',pkg?.cpp?.project?.dutyholders],['Principal Contractor',pkg?.review?.principalContractor],
 ['Drawing references',docs.map(d=>(d.document_no||d.title||d.file_path||'Drawing')+' Rev '+(d.revision||'?')).join('; ')],
 ['Revision',pkg?.revision],['Issue date',pkg?.issueDate],['Document status',status]
 ])+'<h2>CONTROLLED PROJECT DOCUMENT</h2><p>Read with the latest drawings, specialist contractor RAMS, design risk information, lifting plans, temporary works designs, permits, current SDS/COSHH and live registers. This is an unverified working draft until reviewed and accepted by the appropriate dutyholder.</p>'+end);
 pages.push(first('1. DOCUMENT CONTROL AND DUTYHOLDERS','DC-01')+table([
 ['Prepared by',pkg.review?.preparedBy],['Checked by',pkg.review?.checkedBy],['Approval status',status],['Revision',pkg.revision],
 ['Principal Contractor',pkg.review?.principalContractor],['Site manager',pkg.review?.siteManager],
 ['Contractor acceptance',pkg.review?.contractorAccepted],['Next review',pkg.review?.reviewDate],
 ['Change-control procedure',pkg.review?.changesProcedure]
 ])+end);
 for(const g of CPP_GROUPS){
  pages.push(first('CONSTRUCTION PHASE PLAN — '+g.name,'CPP-'+g.id.toUpperCase())+table(g.fields.map(([id,label])=>[label,pkg.cpp?.[g.id]?.[id]]))+end);
 }
 pages.push(first('RISK MATRIX AND SCORING','RA-00')+'<p>Initial and residual likelihood × severity scores must be judged for the real activity by a competent assessor. Scores cannot be assumed safe because a control is listed.</p>'+cols(['L / S','Meaning'],[['1','Rare / minor'],['2','Unlikely / first aid'],['3','Possible / lost time'],['4','Likely / major injury'],['5','Almost certain / catastrophic']])+cols(['Risk score','Action'],[['1–4','Maintain controls'],['5–9','Supervise and verify'],['10–14','Manager review and improve controls'],['15–25','STOP until risk reduced']])+end);
 const activities=scopedActivityCatalog(pkg).filter(a=>pkg.activities?.[a.id]?.applicability==='Relevant');
 for(let i=0;i<activities.length;i++){
  const def=activities[i],a=pkg.activities[def.id],ref=String(i+1).padStart(2,'0');
  const sources=(Array.isArray(a.sources)?a.sources:[]).map(s=>(s.name||'Unidentified document')+' Rev '+(s.revision||'?')+' '+(s.note||'PAGE/DETAIL UNCONFIRMED')).join('; ');
  pages.push(first('RA-'+ref+' — INDIVIDUAL RISK ASSESSMENT','RA-'+ref)+table([
   ['Project and activity',(project?.name||'')+' — '+def.name],['Activity location',a.location],
   ['People exposed and review triggers',a.hazards],['Drawing evidence',sources||a.evidence]
  ])+cols(['Hazard','Who may be harmed','Initial L×S','Control measures required','Residual L×S'],riskRows(a))+
  '<h2>Required records / hold points</h2>'+listed(a.permits)+table([['Competence / supervision',a.responsible],['Assessor and review',a.reviewedBy],['Acceptance / briefing',a.briefing]])+end);
 }
 for(let i=0;i<activities.length;i++){
  const def=activities[i],a=pkg.activities[def.id],ref=String(i+1).padStart(2,'0');
  pages.push(first('MS-'+ref+' — METHOD STATEMENT','MS-'+ref)+table([
   ['Work package',def.name],['Location',a.location],['Linked risk assessment','RA-'+ref]
  ])+'<h2>Scope</h2><p>'+v(a.reason||def.name)+'</p><h2>Competence / supervision</h2><p>'+v(a.responsible)+'</p><h2>Plant, equipment and PPE</h2>'+table([['Plant and temporary works',a.plant],['PPE, RPE and health controls',a.ppe]])+'<h2>Sequence of work</h2>'+listed(a.method)+'<h2>Mandatory controls and hold points</h2><p>'+v(a.controls)+'</p><h2>Emergency and environmental</h2><p>'+v(a.emergency)+'</p><h2>Briefing record</h2><p>'+v(a.briefing)+'</p>'+cols(['Supervisor','Date','Operative name','Signature'],[['','','',''],['','','','']])+end);
 }
 pages.push(first('CDM SCHEDULE 3 — PARTICULAR RISKS','SCH-03')+table(SCHEDULE3.map((name,i)=>[name,(pkg.schedule3?.[i]?.state||'NOT CHECKED')+' | '+(pkg.schedule3?.[i]?.controls||'Controls not recorded')+' | '+(pkg.schedule3?.[i]?.reason||'')]))+end);
 pages.push(first('F10 NOTIFICATION SCREENING','F10-01')+table([
  ['Working days',pkg.notification?.days],['Peak simultaneous workers',pkg.notification?.peakWorkers],
  ['Person days',pkg.notification?.personDays],['F10 reference',pkg.notification?.reference],['Reviewer',pkg.notification?.screenedBy]
 ])+end);
 pages.push(first('COSHH SCREENING','COSHH-00')+table([
  ['Exposure decision',pkg.coshhReview?.state],['Evidence or exclusion',pkg.coshhReview?.reason],['Assessor',pkg.coshhReview?.assessor]
 ])+end);
 for(const [id,c] of Object.entries(pkg.coshh||{})){
  if(c?.applicability!=='Relevant')continue;
  pages.push(first('COSHH — '+(c.product||id),'COSHH-'+id)+table([
   ['Exact product and supplier',c.product],['Current SDS reference and date',c.sds],['Work task and exposure',c.task],
   ['Classification and routes',c.hazards],['People exposed',c.exposure],['Specific preventive controls',c.controls],
   ['PPE / RPE',c.ppe],['Storage',c.storage],['Spill / fire / first aid',c.emergency],
   ['Health surveillance',c.health],['Assessor / review',c.assessor]
  ])+end);
 }
 pages.push(first('PERMITS AND AUTHORISATIONS','PER-01')+table(PERMIT_TYPES.map(([id,name])=>{
  const x=pkg.permits?.[id]||{};return [name, [x.state,x.owner,x.reference,x.controls,x.reason].filter(Boolean).join(' | ')||'NOT ASSESSED'];
 }))+end);
 pages.push(first('RECORDS AND INSPECTION REGISTER','REC-01')+table(DOCUMENTS.map(([id,name])=>{
  const x=pkg.records?.[id]||{};return [name,[x.state,x.reference,x.owner,x.reason].filter(Boolean).join(' | ')||'NOT ASSESSED'];
 }))+end);
 pages.push(first('PRINCIPAL DESIGNER — DESIGN RISK COORDINATION','PD-01')+'<p>This is design-stage residual risk information for coordination by the appointed Principal Designer. It is not a Principal Contractor method statement, instruction to commence work or RAMS approval.</p>'+cols(['Residual design hazard','Document / location','Coordination / action required'],(Array.isArray(pkg.ai?.significant_design_risks)?pkg.ai.significant_design_risks:[]).map(x=>[x.risk,x.source_document+' / '+(x.source_note||'Detail not verified'),x.action]))+'<h2>Pre-construction information and missing evidence</h2><ol>'+(Array.isArray(pkg.ai?.missing_information)?pkg.ai.missing_information:[]).map(x=>'<li>'+html(x)+'</li>').join('')+'</ol>'+end);
 pages.push(first('PROJECT SCOPE DECISIONS / OMISSIONS','SCOPE-01')+table(scopedActivityCatalog(pkg).filter(x=>pkg.activities?.[x.id]?.applicability==='Not applicable').map(x=>[x.name,pkg.activities[x.id].reason||'EXCLUSION REASON MISSING']))+end);
 pages.push(first('OPEN QUESTIONS AND RELEASE BLOCKERS','REV-01')+'<h2>Information requiring verification</h2><ol>'+issues.map(x=>'<li>'+html(x)+'</li>').join('')+'</ol><h2>Drawing analysis warnings</h2><ol>'+(Array.isArray(pkg.ai?.missing_information)?pkg.ai.missing_information:[]).map(x=>'<li>'+html(x)+'</li>').join('')+'</ol><p><b>'+html(status)+'</b>. Requires contractor review, approval, site briefing, and task-specific specialist information before use.</p>'+end);
 return '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>UKPD — Project RAMS draft</title><base href="'+html(location.origin)+'/"><style>'+
 '@page{size:A4;margin:15mm}*{box-sizing:border-box}body{font:11px Arial,sans-serif;color:#173453;margin:0}h1{font-size:17px;line-height:1.3;color:#173453;margin:12px 0}h2{color:#cb2931;font-size:13px;margin:15px 0 8px}.sheet{position:relative;page-break-after:always;break-after:page;min-height:260mm;padding:3mm 0 18mm}.sheet:last-child{page-break-after:auto}.cover h1{text-align:center;font-size:24px;margin:30mm 0 12mm}.running{height:16mm;text-align:right}.running img{max-height:14mm;max-width:68mm;object-fit:contain}table{border-collapse:collapse;width:100%;table-layout:fixed;margin:8px 0}td,th{border:1px solid #738192;padding:5px 6px;vertical-align:top;overflow-wrap:anywhere}th{background:#193859;color:#fff;text-align:left;font-weight:bold}td{background:white}p,li{line-height:1.36;overflow-wrap:anywhere}li{margin-bottom:5px}.subtitle{border-bottom:2px solid #cb2931;padding-bottom:8px;font-size:10px}footer{position:absolute;bottom:0;border-top:1px solid #c92830;padding-top:5px;font-size:9px;width:100%}@media screen{body{background:#e9edf1;padding:24px}.sheet{background:white;max-width:210mm;min-height:297mm;margin:0 auto 20px;padding:15mm;box-shadow:0 1px 12px #0003}}'+
 '</style></head><body>'+pages.join('')+'</body></html>';
}
export function printProjectRams(project,pkg,docs=[],issues=[]){
 const w=window.open('','_blank');
 if(!w){window.alert('Please allow pop-ups to preview and print the RAMS pack.');return;}
 w.document.write(renderRamsReport(project,pkg,docs,issues));
 w.document.close();
 w.focus();
 setTimeout(()=>w.print(),800);
}
