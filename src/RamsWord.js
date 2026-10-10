import {Document,Packer,Paragraph,TextRun,Table,TableRow,TableCell,HeadingLevel,Header,Footer,AlignmentType,WidthType,ShadingType,ImageRun} from 'docx';
import {CPP_GROUPS,SCHEDULE3,DOCUMENTS,PERMIT_TYPES} from './RamsLibrary.js';
import {scopedActivityCatalog} from './RamsScope.js';
const navy='173453',red='C92D38';
const val=x=>String(x??'').trim()||'NOT CONFIRMED';
const para=(x='',size=19)=>new Paragraph({spacing:{after:100},children:[new TextRun({text:String(x),font:'Arial',size})]});
const head=(x)=>new Paragraph({heading:HeadingLevel.HEADING_2,spacing:{before:220,after:140},children:[new TextRun({text:String(x),font:'Arial',size:24,bold:true,color:red})]});
const cell=(x,bold)=>new TableCell({shading:bold?{type:ShadingType.CLEAR,fill:navy}:undefined,margins:{top:85,bottom:85,left:95,right:95},children:[new Paragraph({children:[new TextRun({text:val(x),font:'Arial',size:16,bold:!!bold,color:bold?'FFFFFF':navy})]})]});
const matrix=(rows,header=false)=>new Table({width:{size:100,type:WidthType.PERCENTAGE},rows:rows.length?rows.map((r,i)=>new TableRow({cantSplit:true,children:r.map(v=>cell(v,header&&i===0))})):[new TableRow({children:[cell('No applicable entries'),cell('None recorded')]})]});
const kv=rows=>matrix(rows.map(([a,b])=>[a,b]));
const title=(name,ref,p,pkg)=>[new Paragraph({pageBreakBefore:true,spacing:{after:155},children:[new TextRun({text:name,font:'Arial',size:29,color:navy,bold:true})]}),para((p.name||'Project')+' | '+(p.site_address||'Location TBC')+' | '+ref+' | REV '+(pkg.revision||'P01'))];
const list=v=>String(v||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean).map((x,i)=>para((i+1)+'. '+x.replace(/^\d+[.)]\s*/,'')));
const sources=a=>(Array.isArray(a.sources)?a.sources:[]).map(s=>[s.name,s.revision,s.note].filter(Boolean).join(' / ')).join('; ');
export async function downloadRamsWord(project,pkg,docs=[],issues=[]){
 const elements=[],add=(...x)=>elements.push(...x);
 add(head('CONSTRUCTION PHASE PLAN | RISK ASSESSMENTS | METHOD STATEMENTS'),
 para('UK PRINCIPAL DESIGNERS LTD | DRAFT — NOT APPROVED FOR SITE USE'),
 kv([['Project',project.name],['Address',project.site_address],['Client',pkg.cpp?.project?.client],['Principal Designer',pkg.cpp?.project?.dutyholders],['Principal Contractor',pkg.review?.principalContractor],['Revision',pkg.revision],['Drawing register',docs.map(x=>(x.document_no||x.title||x.file_path)+' Rev '+(x.revision||'?')).join('; ')]]),
 para('This pack requires competent contractor review, confirmation of site facts, current SDS and work permits, acceptance and worker briefing before site use.'));
 add(...title('Document control and dutyholders','DC-01',project,pkg),kv([['Prepared by',pkg.review?.preparedBy],['Checked by',pkg.review?.checkedBy],['Principal Contractor',pkg.review?.principalContractor],['Site manager',pkg.review?.siteManager],['Review date',pkg.review?.reviewDate],['Contractor acceptance',pkg.review?.contractorAccepted],['Change procedure',pkg.review?.changesProcedure]]));
 for(const g of CPP_GROUPS)add(...title('Construction Phase Plan: '+g.name,'CPP-'+g.id.toUpperCase(),project,pkg),kv(g.fields.map(([k,n])=>[n,pkg.cpp?.[g.id]?.[k]])));
 add(...title('F10 notification screening','F10-01',project,pkg),kv([['Working days',pkg.notification?.days],['Peak workers',pkg.notification?.peakWorkers],['Person-days',pkg.notification?.personDays],['F10 reference',pkg.notification?.reference],['Screened by / date',pkg.notification?.screenedBy]]));
 add(...title('Risk matrix and initial/residual assessment','RA-00',project,pkg),para('A competent assessor must determine both initial and residual likelihood × severity for every individual hazard. No automatic assessment or approval is issued.'));
 const included=scopedActivityCatalog(pkg).filter(a=>pkg.activities?.[a.id]?.applicability==='Relevant');
 included.forEach((a,i)=>{
  const d=pkg.activities[a.id],ref='RA-'+String(i+1).padStart(2,'0');
  const hz=Array.isArray(d.hazardRows)&&d.hazardRows.length?d.hazardRows:[{hazard:d.hazards,people:'TO BE CONFIRMED',initial:d.initialRisk,controls:d.controls,residual:d.residualRisk}];
  add(...title(ref+' — '+a.name,ref,project,pkg),kv([['Location',d.location],['Drawing or site evidence',sources(d)||d.evidence],['Assessor and date',d.reviewedBy]]),
  head('Activity hazard-by-hazard assessment'),matrix([['Hazard','People exposed','Initial L×S','Control measures','Residual L×S'],...hz.map(x=>[x.hazard,x.people,x.initial,x.controls,x.residual])],true),
  head('Permits / safety controls / hold points'),kv([['Supervision and competence',d.responsible],['Permits and inspections',d.permits],['Emergency and rescue',d.emergency],['Workforce consultation / briefing',d.briefing]]));
 });
 included.forEach((a,i)=>{
  const d=pkg.activities[a.id],ref='MS-'+String(i+1).padStart(2,'0');
  add(...title(ref+' — '+a.name,ref,project,pkg),kv([['Linked RA','RA-'+String(i+1).padStart(2,'0')],['Scope',d.reason||a.name],['Location',d.location],['Supervisor',d.responsible],['Plant and temporary works',d.plant],['PPE / RPE',d.ppe]]),
  head('Numbered work sequence'),...list(d.method),head('Detailed controls and hold points'),para(val(d.controls)),head('Emergency and environmental arrangements'),para(val(d.emergency)),
  head('Operative briefing and signatures'),matrix([['Name / employer','Supervisor','Date','Signature'],['','','',''],['','','','']],true));
 });
 add(...title('CDM Schedule 3 particular risk categories','SCH-03',project,pkg),kv(SCHEDULE3.map((x,i)=>[x,[pkg.schedule3?.[i]?.state,pkg.schedule3?.[i]?.controls,pkg.schedule3?.[i]?.reason].filter(Boolean).join(' | ')])));
 add(...title('COSHH screening','COSHH-00',project,pkg),kv([['State',pkg.coshhReview?.state],['Scope / exclusion evidence',pkg.coshhReview?.reason],['Assessor and date',pkg.coshhReview?.assessor]]));
 for(const [id,d] of Object.entries(pkg.coshh||{})){
  if(d?.applicability!=='Relevant')continue;
  add(...title('COSHH — '+(d.product||id),'COSHH-'+id,project,pkg),kv([['Exact product',d.product],['Work task / exposure',d.task],['Current manufacturer SDS and date',d.sds],['Hazard classification / routes',d.hazards],['People at risk',d.exposure],['Preventive controls',d.controls],['PPE/RPE and face fit',d.ppe],['Handling and storage',d.storage],['First aid / fire / spill / waste',d.emergency],['Exposure monitoring / surveillance',d.health],['Assessor/date',d.assessor]]));
 }
 add(...title('Permit and authorisation register','PER-01',project,pkg),kv(PERMIT_TYPES.map(([id,n])=>[n,[pkg.permits?.[id]?.state,pkg.permits?.[id]?.owner,pkg.permits?.[id]?.reference,pkg.permits?.[id]?.controls,pkg.permits?.[id]?.reason].filter(Boolean).join(' | ')])));
 add(...title('Construction safety records','REC-01',project,pkg),kv(DOCUMENTS.map(([id,n])=>[n,[pkg.records?.[id]?.state,pkg.records?.[id]?.owner,pkg.records?.[id]?.reference,pkg.records?.[id]?.reason].filter(Boolean).join(' | ')])));
 add(...title('Principal Designer residual design risks / PCI','PD-01',project,pkg),para('Design-phase risks and significant residual issues for PD coordination; not contractor RAMS approval.'),kv((Array.isArray(pkg.ai?.significant_design_risks)?pkg.ai.significant_design_risks:[]).map(x=>[x.risk,[x.source_document,x.source_note,x.action].filter(Boolean).join(' | ')])),head('Outstanding pre-construction information'),...((Array.isArray(pkg.ai?.missing_information)?pkg.ai.missing_information:[]).map(x=>para('• '+x))));
 add(...title('Excluded work package register','SCOPE-01',project,pkg),kv(scopedActivityCatalog(pkg).filter(a=>pkg.activities?.[a.id]?.applicability==='Not applicable').map(a=>[a.name,pkg.activities[a.id]?.reason])));
 add(...title('Missing information and pre-issue blockers','REV-01',project,pkg),...((issues.length?issues:['No missing form field recorded; competent professional approval remains mandatory.']).map(x=>para('• '+x))),
 para('This remains a draft. Neither the Principal Designer nor AI approves contractor RAMS or certifies compliance.'));
 let brandImage=null;
 try{
  const response=await fetch('/ukpd-logo.jpg',{cache:'force-cache'});
  if(response.ok){const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.length>100&&bytes.length<300000)brandImage=new ImageRun({data:bytes,transformation:{width:140,height:52},type:'jpg'});}
 }catch{/* Logo upload or connection failure must not prevent RAMS export. */}
 const doc=new Document({creator:'UK Principal Designers Ltd',title:(project.name||'Project')+' RAMS DRAFT',
 sections:[{properties:{page:{size:{width:11906,height:16838},margin:{top:950,bottom:950,left:950,right:950}}},
 headers:{default:new Header({children:[new Paragraph({alignment:AlignmentType.RIGHT,children:[...(brandImage?[brandImage,new TextRun({text:'   ',font:'Arial'})]:[]),new TextRun({text:'UK PRINCIPAL DESIGNERS LTD  |  CONTROLLED DOCUMENT',font:'Arial',size:16,bold:true,color:navy})]})]})},
 footers:{default:new Footer({children:[new Paragraph({alignment:AlignmentType.CENTER,children:[new TextRun({text:(project.project_no||'UKPD')+'  |  REV '+(pkg.revision||'P01')+'  |  DRAFT — NOT APPROVED FOR CONSTRUCTION',font:'Arial',size:16,color:red})]})]})},
 children:elements}]});
 const blob=await Packer.toBlob(doc),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=(project.project_no||'UKPD')+'-RAMS-'+(pkg.revision||'P01')+'-DRAFT.docx';
 document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
}
