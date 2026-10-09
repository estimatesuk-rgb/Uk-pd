import React,{useEffect,useMemo,useState} from 'react';
import {DESIGN_GUIDANCE} from './DetailGuidance.js';
import {JUNCTIONS,junctionSvg} from './JunctionDetails.js';

const PARTS=Object.keys(DESIGN_GUIDANCE);
const LAYERED_ELEMENTS=new Set(['foundation','damp','floor','walls','structure','upperfloor','roof','covering','roofinsulation','openings']);
const ELEMENT_NAME={foundation:'Foundations / concrete',damp:'DPC / DPM / gas',floor:'Ground floor',walls:'External walls',structure:'Structural beams / lintels',upperfloor:'Upper floor',roof:'Roof structure',covering:'Roof covering',roofinsulation:'Roof insulation',openings:'Windows and doors',drainage:'Drainage',ventilation:'Ventilation',heating:'Heating and hot water',fire:'Fire protection',electrical:'Electrical',access:'Stairs and access',completion:'External works / finishes'};
const PRODUCT_FIELDS=[['product','Product / approved assembly'],['manufacturer','Manufacturer / supplier'],['size','Thickness / size and units'],['performance','Required performance and evidence'],['reference','Product data / certificate reference'],['drawing','Coordinated drawing / revision'],['notes','Installation / interface notes']];
const BASIS_FIELDS=[['projectType','Building use and applicable regulatory regime'],['noticeDate','Building Control application / notice date'],['startDate','Commencement date and evidence'],['buildingControl','Building Control body and application reference'],['edition','Applicable Approved Document edition(s) / transition decision'],['basisEvidence','Evidence for transitional arrangements / regulatory basis'],['designer','Lead designer / responsible person'],['reviewer','Independent technical reviewer'],['reviewDate','Technical review date'],['reviewReference','Signed review evidence / document reference']];
const esc=s=>String(s??'').replace(/[&<>"]/g,t=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[t]));
const value=o=>String(o??'').trim();
const countFilled=(o,fields)=>fields.filter(([k])=>value(o?.[k])).length;
export function getTechnicalAudit(data={}){
 const basis=data.basis||{},materials=data.materials||{},junctions=data.junctions||{};
 const issues=[];
 for(const [key,name] of BASIS_FIELDS)if(!value(basis[key]))issues.push('Regulatory/design basis: '+name+' missing');
 for(const k of PARTS){
  const v=materials[k]||{};
  if(!value(v.applicability))issues.push('Materials: '+ELEMENT_NAME[k]+' - construction scope not assessed');
  if(v.applicability==='not-applicable'||v.applicability==='existing'){
    if(!value(v.notes))issues.push('Materials: '+ELEMENT_NAME[k]+' - reason / existing condition not recorded');
    continue;
  }
  if(v.applicability==='new-work'&&LAYERED_ELEMENTS.has(k)&&!(v.layers||[]).length)issues.push('Materials: '+ELEMENT_NAME[k]+' - construction layer build-up not entered');
  (v.layers||[]).forEach((layer,i)=>{if(!value(layer.product)||!value(layer.thickness)||!value(layer.reference))issues.push('Materials: '+ELEMENT_NAME[k]+' - layer '+(i+1)+' needs product, thickness and evidence reference')});
  if(!value(v.product))issues.push('Materials: '+ELEMENT_NAME[k]+' - product/assembly unconfirmed');
  if(!value(v.performance))issues.push('Materials: '+ELEMENT_NAME[k]+' - performance evidence missing');
  if(!value(v.reference))issues.push('Materials: '+ELEMENT_NAME[k]+' - product/certificate reference missing');
 }
 for(const j of JUNCTIONS){
  const v=junctions[j.id]||{};
  if(!value(v.applicability)){issues.push(j.id+' - applicability not assessed');continue;}
  if(v.applicability==='existing'||v.applicability==='not-applicable'){
   if(!value(v.scopeReason))issues.push(j.id+' - existing/not applicable reason required');
   continue;
  }
  const missing=j.fields.filter(([k])=>!value(v[k]));
  if(missing.length)issues.push(j.id+' - '+missing.length+' dimension / construction decisions missing');
  if(!value(v.evidenceRef))issues.push(j.id+' - verification drawing / evidence reference missing');
  if(!value(v.reviewedBy))issues.push(j.id+' - design reviewer not recorded');
 }
 const relevant=JUNCTIONS.filter(j=>junctions[j.id]?.applicability==='new-work');
 const complete= relevant.filter(j=>j.fields.every(([k])=>value(junctions[j.id]?.[k]))&&value(junctions[j.id]?.evidenceRef)&&value(junctions[j.id]?.reviewedBy)).length;
 return {issues,complete:issues.length===0,totalJunctions:relevant.length,reviewedJunctions:complete,ready:complete,materials:PARTS.filter(k=>materials[k]?.applicability==='new-work'&&value(materials[k]?.product)&&value(materials[k]?.reference)&&value(materials[k]?.performance)).length,applicableMaterials:PARTS.filter(k=>materials[k]?.applicability==='new-work').length,unassessed:JUNCTIONS.filter(j=>!value(junctions[j.id]?.applicability)).length};
}
export function technicalAppendixHtml(project,specs={},issue={}){
 const data=specs.__technical||{};
 const basis=data.basis||{},materials=data.materials||{},junctions=data.junctions||{};
 const audit=getTechnicalAudit(data);
 const rev=issue.revision||'P01';
 const head=(heading,ref)=>'<header><img src="/ukpd-logo.jpg" alt="UK Principal Designers"/><div><h1>'+esc(heading)+'</h1><strong>'+esc(ref)+' | REV '+esc(rev)+'</strong></div></header><div class="meta"><b>Project:</b> '+esc(project.name||'TBC')+' | <b>Site:</b> '+esc(project.site_address||'TBC')+' | <b>Project ref:</b> '+esc(project.project_no||'TBC')+'</div>';
 const footer=ref=>'<footer>UK PRINCIPAL DESIGNERS | '+esc(ref)+' | REV '+esc(rev)+' | DESIGN COORDINATION / NOT FOR CONSTRUCTION</footer>';
 const basisSheet='<article class="sheet">'+head('REGULATORY BASIS & TECHNICAL REVIEW','UKPD-S01')+'<h2>Project-specific regulatory basis</h2><p>England: Approved Documents support statutory Building Regulations but are not, in themselves, an automatic certificate of compliance. Confirm the applicable editions, commencement dates and transitional conditions on this project.</p><table><tbody>'+BASIS_FIELDS.map(([k,label])=>'<tr><th>'+esc(label)+'</th><td>'+esc(basis[k]||'NOT CONFIRMED')+'</td></tr>').join('')+'</tbody></table><h2>Important regulatory change</h2><p>2026 editions of Parts F and L were published in March 2026, with commencement for ordinary (non-higher-risk) work on 24 March 2027 and for specified higher-risk building work on 24 September 2027, subject to transition provisions. Do not apply these editions without checking project applicability.</p><h2>Technical audit</h2><p>'+audit.issues.length+' information/review gaps remain. A completed questionnaire is not professional certification.</p>'+footer('UKPD-S01')+'</article>';
 const materialsSheet='<article class="sheet">'+head('MATERIAL & PRODUCT SPECIFICATION SCHEDULE','UKPD-S02')+'<p>Specify actual products and performance evidence. The schedule does not substitute for approved manufacturer instructions, design calculations, fire testing or Building Control review.</p><table><thead><tr><th>Element</th><th>Product / assembly</th><th>Size</th><th>Performance</th><th>Reference</th></tr></thead><tbody>'+PARTS.map(k=>'<tr><td>'+esc(ELEMENT_NAME[k])+'<small> ['+esc(materials[k]?.applicability||'not assessed')+']</small></td><td>'+esc(materials[k]?.product|| (materials[k]?.applicability==='not-applicable'?'Not applicable':'TBC'))+'</td><td>'+esc(materials[k]?.size||'TBC')+'</td><td>'+esc(materials[k]?.performance||'TBC')+'</td><td>'+esc(materials[k]?.reference||'TBC')+'</td></tr>').join('')+'</tbody></table>'+footer('UKPD-S02')+'</article>';
 const layerSheets=PARTS.filter(k=>(materials[k]?.layers||[]).length).map(k=>'<article class="sheet">'+head('CONSTRUCTION BUILD-UP / LAYER SCHEDULE','UKPD-M-'+esc(k.toUpperCase()))+'<h2>'+esc(ELEMENT_NAME[k])+'</h2><p>Scope: '+esc(materials[k]?.applicability||'NOT ASSESSED')+' | Product/assembly: '+esc(materials[k]?.product||'UNCONFIRMED')+'</p><table><thead><tr><th>Layer order</th><th>Product / material</th><th>Thickness / size</th><th>Design evidence reference</th></tr></thead><tbody>'+(materials[k].layers||[]).map((layer,i)=>'<tr><td>'+esc(i+1)+'</td><td>'+esc(layer.product||'TBC')+'</td><td>'+esc(layer.thickness||'TBC')+'</td><td>'+esc(layer.reference||'TBC')+'</td></tr>').join('')+'</tbody></table><h2>Performance and installation coordination</h2><p>'+esc(materials[k]?.performance||'NOT SPECIFIED')+'</p><p>'+esc(materials[k]?.notes||'Notes and junction compatibility require review')+'</p>'+footer('UKPD-M-'+k.toUpperCase())+'</article>').join('');
 const drawings=JUNCTIONS.filter(j=>junctions[j.id]?.applicability==='new-work').map(j=>{
  const v=junctions[j.id]||{};
  return '<article class="sheet">'+head(j.title,'UKPD-'+j.id)+'<div class="drawing">'+junctionSvg(j,v,project,rev)+'</div><h2>Construction specification and coordination</h2><p>'+esc(j.note)+'</p><table><tbody>'+j.fields.map(([k,label])=>'<tr><th>'+esc(label)+'</th><td>'+esc(v[k]||'DESIGN REQUIRED')+'</td></tr>').join('')+'</tbody></table><h2>Evidence and review</h2><p><b>Evidence drawing / calc:</b> '+esc(v.evidenceRef||'UNCONFIRMED')+' | <b>Reviewed by:</b> '+esc(v.reviewedBy||'NOT REVIEWED')+'</p>'+footer('UKPD-'+j.id)+'</article>';
 }).join('');
 const issueSheet='<article class="sheet">'+head('DESIGN ACTION & MISSING INFORMATION SCHEDULE','UKPD-S03')+'<h2>Items to resolve before professional issue</h2>'+(audit.issues.length?'<ol>'+audit.issues.map(t=>'<li>'+esc(t)+'</li>').join('')+'</ol>':'<p>All recorded schedule fields have been populated. Designer must still verify accuracy, coordination and statutory applicability.</p>')+'<h2>Design status</h2><p>No construction certification is generated by this application. The responsible design team must check actual site measurements, materials, engineering design and approvals before issuing technical drawings.</p>'+footer('UKPD-S03')+'</article>';
 const scopeSheet='<article class="sheet">'+head('JUNCTION APPLICABILITY AND EXCLUSIONS','UKPD-S04')+'<p>Each standard junction must be assessed for the project. Exclusions are not verified by the app and need an appropriate design justification.</p><table><thead><tr><th>Reference</th><th>Detail</th><th>Scope</th><th>Reason / evidence</th></tr></thead><tbody>'+JUNCTIONS.map(j=>'<tr><td>'+esc(j.id)+'</td><td>'+esc(j.title)+'</td><td>'+esc(junctions[j.id]?.applicability||'NOT ASSESSED')+'</td><td>'+esc(junctions[j.id]?.scopeReason||'—')+'</td></tr>').join('')+'</tbody></table>'+footer('UKPD-S04')+'</article>';
 return basisSheet+materialsSheet+scopeSheet+layerSheets+drawings+issueSheet;
}
const fieldBox={width:'100%',padding:9,border:'1px solid #cbd6df',borderRadius:5,marginTop:5};
const labelStyle={display:'block',fontSize:13,fontWeight:600};
const panel={padding:16,border:'1px solid #d7e1e9',borderRadius:8,background:'#fff',marginBottom:12};
const grid={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(230px,1fr))',gap:12};
export default function TechnicalDesignWorkspace({project,specs={},saveSpecs,issue={}}){
 const [data,setData]=useState(()=>specs.__technical||{});
 const [tab,setTab]=useState('junctions');
 const [selected,setSelected]=useState('J01');
 const [element,setElement]=useState('foundation');
 const [saved,setSaved]=useState('');
 useEffect(()=>{setData(specs.__technical||{});setSaved('')},[project.id]);
 const audit=useMemo(()=>getTechnicalAudit(data),[data]);
 const j=JUNCTIONS.find(x=>x.id===selected)||JUNCTIONS[0];
 const v=data.junctions?.[j.id]||{};
 const update=(group,id,key,value)=>{
  setData(old=>{
   if(group==='basis')return {...old,basis:{...(old.basis||{}),[key]:value}};
   return {...old,[group]:{...(old[group]||{}),[id]:{...(old[group]?.[id]||{}),[key]:value}}};
  });
  setSaved('Unsaved changes');
 };
 const layers=data.materials?.[element]?.layers||[];
 const layerChange=(index,key,value)=>setData(old=>{const materials={...(old.materials||{})};const current={...(materials[element]||{})};const arr=[...(current.layers||[])];arr[index]={...(arr[index]||{}),[key]:value};current.layers=arr;materials[element]=current;setSaved('Unsaved changes');return {...old,materials}});
 const addLayer=()=>setData(old=>{const materials={...(old.materials||{})};materials[element]={...(materials[element]||{}),layers:[...(materials[element]?.layers||[]),{product:'',thickness:'',reference:''}]};setSaved('Unsaved changes');return {...old,materials}});
 const removeLayer=index=>setData(old=>{const materials={...(old.materials||{})};materials[element]={...(materials[element]||{}),layers:(materials[element]?.layers||[]).filter((_,i)=>i!==index)};setSaved('Unsaved changes');return {...old,materials}});
 const persist=async()=>{setSaved('Saving…');try{await saveSpecs({...specs,__technical:data});setSaved('Save requested — check project status above')}catch(e){setSaved('Save failed: '+e.message)}};
 const draw=()=>{const blob=new Blob([junctionSvg(j,v,project,issue.revision||'P01')],{type:'image/svg+xml;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=(project.project_no||'UKPD')+'-'+j.id+'-'+(issue.revision||'P01')+'.svg';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000)};
 const input=(group,id,key,label,val,placeholder='Required — do not assume')=><label key={key} style={labelStyle}>{label}<input style={fieldBox} value={val||''} placeholder={placeholder} onChange={e=>update(group,id,key,e.target.value)} onBlur={()=>{}}/></label>;
 return <div style={{marginTop:20,paddingTop:18,borderTop:'4px solid #263e55'}}>
  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:12}}>
   <div><h2 style={{margin:'0 0 6px'}}>Project-specific technical design & junction drawings</h2><p className="muted">Architectural drawing coordination, selected products, measured dimensions and review evidence. Values are never invented or auto-certified.</p></div>
   <button onClick={persist}>Save technical design</button>
  </div>
  <div style={{...grid,marginBottom:14}}>
   <div style={panel}><b>Junction drawings</b><h3 style={{margin:'4px 0'}}>{audit.ready} / {audit.totalJunctions}</h3><small>Complete input and reviewer records</small></div>
   <div style={panel}><b>Material schedules</b><h3 style={{margin:'4px 0'}}>{audit.materials} / {audit.applicableMaterials}</h3><small>Products and performance evidence</small></div>
   <div style={panel}><b>Outstanding checks</b><h3 style={{margin:'4px 0'}}>{audit.issues.length}</h3><small>Require professional review</small></div>
  </div>
  <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:14}}>
   {['junctions','materials','basis','audit'].map(id=><button className={tab===id?'selected':'outline'} key={id} onClick={()=>setTab(id)}>{({junctions:'Construction junctions',materials:'Product specifications',basis:'Regulatory basis',audit:'Technical review'})[id]}</button>)}
  </div>
  {tab==='junctions'&&<div style={panel}>
   <label style={labelStyle}>Select an architectural junction drawing<select style={fieldBox} value={selected} onChange={e=>setSelected(e.target.value)}>{JUNCTIONS.map(z=><option key={z.id} value={z.id}>{z.id} — {z.title}</option>)}</select></label>
   <p style={{margin:'12px 0 6px'}}><b>Relevant Approved Documents:</b> {j.parts.replaceAll(' ', ', ')}</p>
   <div style={{...grid,margin:'12px 0',background:'#f1f5f8',padding:12}}>
    <label style={labelStyle}>Project applicability
     <select style={fieldBox} value={v.applicability||''} onChange={e=>update('junctions',j.id,'applicability',e.target.value)}>
      <option value=''>Not yet assessed</option>
      <option value='new-work'>New / altered junction — include in A3 issue</option>
      <option value='existing'>Existing retained — document interface</option>
      <option value='not-applicable'>Not applicable to project</option>
     </select>
    </label>
    {(v.applicability==='existing'||v.applicability==='not-applicable')&&input('junctions',j.id,'scopeReason','Reason / drawing evidence for exclusion',v.scopeReason,'Specific design or drawing reference required')}
   </div>
   <div style={{border:'1px solid #d9e0e7',background:'#fff',marginBottom:12}} dangerouslySetInnerHTML={{__html:junctionSvg(j,v,project,issue.revision||'P01')}}/>
   {v.applicability==='new-work'&&<div style={grid}>{j.fields.map(([key,label])=>input('junctions',j.id,key,label,v[key]))}{input('junctions',j.id,'evidenceRef','Calculation / drawing / specification reference',v.evidenceRef)}{input('junctions',j.id,'reviewedBy','Competent reviewer and date (record)',v.reviewedBy)}</div>}
   <p className="muted">{j.note} Drawings remain not to scale, regardless of entered dimensions. Actual measured geometry and the design team must confirm the final construction detail.</p>
   <div style={{display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}}><button className="outline" onClick={draw} disabled={v.applicability!=='new-work'}>Download applicable vector detail</button><small>UKPD-{j.id} | Draft / not for construction</small></div>
  </div>}
  {tab==='materials'&&<div style={panel}>
   <label style={labelStyle}>Construction element<select style={fieldBox} value={element} onChange={e=>setElement(e.target.value)}>{PARTS.map(k=><option key={k} value={k}>{ELEMENT_NAME[k]}</option>)}</select></label>
   <p><b>Technical requirement:</b> {DESIGN_GUIDANCE[element]?.detail}</p>
   <label style={labelStyle}>Scope / applicability for this project<select style={fieldBox} value={data.materials?.[element]?.applicability||''} onChange={e=>update('materials',element,'applicability',e.target.value)}><option value=''>Choose scope</option><option value='new-work'>New / altered construction</option><option value='existing'>Existing retained — record evidence</option><option value='not-applicable'>Not applicable — explain why</option></select></label>
   <div style={grid}>{PRODUCT_FIELDS.map(([key,label])=>input('materials',element,key,label,data.materials?.[element]?.[key]))}</div>
   {LAYERED_ELEMENTS.has(element)&&data.materials?.[element]?.applicability==='new-work'&&<div style={{...panel,marginTop:15,background:'#f5f8fb'}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,flexWrap:'wrap'}}><b>Layer-by-layer construction build-up</b><button className='outline' onClick={addLayer}>+ Add material layer</button></div><p className='muted'>Enter each layer in its construction sequence (for example outer leaf, cavity insulation, inner leaf and internal finish). Enter actual dimensions and product references. No default compliant build-up is assumed.</p>{layers.length===0?<p className='muted'>No layers recorded.</p>:layers.map((layer,i)=><div key={i} style={{...grid,padding:'12px 0',borderTop:'1px solid #d4e1ea'}}><label style={labelStyle}>Layer {i+1}: product / material<input style={fieldBox} value={layer.product||''} placeholder='Product and type' onChange={e=>layerChange(i,'product',e.target.value)}/></label><label style={labelStyle}>Thickness / size / units<input style={fieldBox} value={layer.thickness||''} placeholder='e.g. 100 mm (verify)' onChange={e=>layerChange(i,'thickness',e.target.value)}/></label><label style={labelStyle}>Data sheet / test reference<input style={fieldBox} value={layer.reference||''} placeholder='Manufacturer / drawing ref' onChange={e=>layerChange(i,'reference',e.target.value)}/></label><div style={{alignSelf:'end'}}><button className='outline' onClick={()=>removeLayer(i)}>Remove layer</button></div></div>)}</div>}
   <p className="muted"><b>Verification:</b> {DESIGN_GUIDANCE[element]?.evidence}. Confirm manufacturer detail compatibility, structural design, thermal performance and any fire rating using project-specific calculations and approved product information.</p>
  </div>}
  {tab==='basis'&&<div style={panel}>
   <p><b>England regulatory editions:</b> The 2026 Approved Documents F and L were published in March 2026 but their main effective dates are 24 March 2027 (non-higher-risk work) and 24 September 2027 (specified higher-risk work), subject to transitional provisions. Verify the actual applicable edition for this project.</p>
   <p><a href="https://www.gov.uk/government/collections/approved-documents" target="_blank" rel="noreferrer">Government Approved Documents</a> · <a href="https://www.gov.uk/government/publications/the-future-homes-and-buildings-standards-building-circular-012026/the-future-homes-and-buildings-standards-building-circular-012026-letter" target="_blank" rel="noreferrer">2026 circular / transitions</a></p>
   <div style={grid}>{BASIS_FIELDS.map(([key,label])=>input('basis','',key,label,data.basis?.[key]))}</div>
  </div>}
  {tab==='audit'&&<div style={panel}>
   <h3>Technical issue-readiness audit</h3><p>{audit.issues.length===0?'All recorded fields are complete. A competent technical approval is still required; this is not a compliance certificate.':'The package remains DRAFT while the following project decisions or evidence are missing.'}</p>
   <div style={{maxHeight:340,overflow:'auto',background:'#f4f7fa',padding:14,borderRadius:6}}>{audit.issues.length?<ol>{audit.issues.map((item,i)=><li key={i}>{item}</li>)}</ol>:<p>Ready for independent technical review and coordination against site information.</p>}</div>
   <p className="muted">Professional issue must be controlled by the appointed designer. Entering a reviewer's name does not certify compliance or produce an issued construction drawing.</p>
  </div>}
  <p role="status" style={{fontSize:12,color:'#3d5870'}}>{saved}</p>
 </div>;
}
