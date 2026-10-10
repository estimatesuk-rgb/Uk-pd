// Per-project activity catalogue. Reference library is a starting point, never the ceiling.
// Dynamic proposals remain provisional until drawing/site evidence and contractor review.
import {RAMS_ACTIVITIES} from './RamsLibrary.js';

export const activityName = proposal => String(proposal?.activity_name || proposal?.activity || proposal?.name || proposal?.work_package || proposal?.activity_id || 'Unidentified work package').trim();
export const customActivityId = name => 'custom_' + String(name || 'work').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,75);

export function scopedActivityCatalog(pkg={}){
 const existing=new Set(RAMS_ACTIVITIES.map(a=>a.id));
 const added=Object.values(pkg.customActivities||{}).filter(a=>a && typeof a.id==='string' && a.name && !existing.has(a.id));
 return [...RAMS_ACTIVITIES,...added];
}

const list = value => Array.isArray(value)?value.map(x=>String(x).trim()).filter(Boolean):typeof value==='string'?value.split(/\n|;/).map(x=>x.trim()).filter(Boolean):[];

export function incorporateAiProposals(pkg={},proposals=[],documents=[]){
 const next={...pkg,activities:{...(pkg.activities||{})},customActivities:{...(pkg.customActivities||{})}};
 for(const proposal of Array.isArray(proposals)?proposals:[]){
  if(!proposal || typeof proposal!=='object')continue;
  const name=activityName(proposal);
  const existingId=RAMS_ACTIVITIES.some(a=>a.id===proposal.activity_id)?proposal.activity_id:null;
  // Unknown AI activity IDs become additional project work packages, not silent omissions.
  const id=existingId || customActivityId(name);
  if(!existingId && !next.customActivities[id])next.customActivities[id]={
   id,name,regs:'Identify applicable law and specialist guidance — professional review required',
   hazards:list(proposal.hazards),controls:list(proposal.potential_controls),origin:'AI candidate'
  };
  const previous=next.activities[id]||{};
  if(['Relevant','Not applicable'].includes(previous.applicability))continue;
  const source=documents.find(d=>(d.document_no||d.title||d.file_path)===proposal.source_document);
  const sourceName=String(proposal.source_document||'').trim();
  next.activities[id]={
   ...previous,applicability:'To check',
   reason:previous.reason||String(proposal.reason||''),
   hazards:previous.hazards||list(proposal.hazards).join('\n'),
   controls:previous.controls||list(proposal.potential_controls).join('\n'),
   method:previous.method||list(proposal.method_sequence).join('\n'),
   evidence:previous.evidence||String(proposal.verification||''),
   sources:Array.isArray(previous.sources)&&previous.sources.length?previous.sources:
    source?[{documentId:source.id,name:sourceName,revision:source.revision||'',note:proposal.source_note||'',confidence:proposal.confidence||'Low'}]:[]
  };
 }
 return next;
}

export function addProjectActivity(pkg={},name){
 const clean=String(name||'').trim();
 if(clean.length<3)throw new Error('Enter a descriptive construction activity.');
 let id=customActivityId(clean);
 if(RAMS_ACTIVITIES.some(a=>a.id===id))id='custom_'+id;
 const record=pkg.customActivities?.[id];
 const next={...pkg,customActivities:{...(pkg.customActivities||{}),[id]:record||{
   id,name:clean,regs:'Confirm applicable legislation and specialist guidance',
   hazards:[],controls:[],origin:'User-identified activity'
  }},activities:{...(pkg.activities||{}),[id]:{
   ...(pkg.activities?.[id]||{}),applicability:pkg.activities?.[id]?.applicability||'To check'
  }}};
 return {pkg:next,id};
}

// Trusted starting points, not automatic proof that a project-specific safe method exists.
export const SAFETY_RESEARCH_SOURCES=[
 {name:'HSE CDM 2015 construction management',url:'https://www.hse.gov.uk/construction/cdm/2015/index.htm'},
 {name:'HSE construction health hazards',url:'https://www.hse.gov.uk/construction/healthrisks/index.htm'},
 {name:'HSE working at height',url:'https://www.hse.gov.uk/construction/safetytopics/workingatheight.htm'},
 {name:'HSE construction site excavations',url:'https://www.hse.gov.uk/construction/safetytopics/excavations.htm'},
 {name:'HSE COSHH',url:'https://www.hse.gov.uk/coshh/'}
];
