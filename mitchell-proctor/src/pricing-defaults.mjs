// Canonical practice fee defaults, shared by owner settings and new quotations.
// Values initialise first use and can be changed by the practice owner.
export const defaultStageRates = Object.freeze([
  {id:'design',title:'Concept design & brief development',rate:20,selected:true},
  {id:'planning',title:'Planning drawings & application',rate:35,selected:true},
  {id:'technical',title:'Technical design & Building Regulations',rate:55,selected:true},
  {id:'tender',title:'Tendering & procurement support',rate:10,selected:false},
  {id:'site',title:'Construction stage & handover',rate:30,selected:false}
]);
export const defaultExtraRates = Object.freeze([
  {id:'survey',title:'Measured building survey',amount:850,selected:false},
  {id:'feasibility',title:'Feasibility & options appraisal',amount:1250,selected:false},
  {id:'preapp',title:'Pre-application advice package',amount:650,selected:false},
  {id:'visuals',title:'3D visualisations / CGI',amount:950,selected:false},
  {id:'heritage',title:'Heritage / conservation coordination',amount:950,selected:false},
  {id:'conditions',title:'Discharge of planning conditions (optional)',amount:950,selected:false},
  {id:'bng',title:'Biodiversity Net Gain (BNG) initial advice & coordination',amount:850,selected:false},
  {id:'bngplan',title:'BNG gain-plan submission coordination (optional)',amount:1200,selected:false},
  {id:'cdm',title:'CDM Principal Designer services',amount:2250,selected:false},
  {id:'brpd',title:'Building Regulations Principal Designer services',amount:1250,selected:false},
  {id:'qs',title:'Cost plan / quantity surveying allowance',amount:1800,selected:false},
  {id:'revisions',title:'Additional design revisions',amount:750,selected:false}
]);
export function makePricingDefaults(){
  return {
    buildRate:2500,buildVatRate:20,feeVatRate:20,minimumArea:25,
    contingency:0,validDays:30,
    stages:defaultStageRates.map(x=>({...x})),
    extras:defaultExtraRates.map(x=>({...x}))
  };
}
export function resolvePricingDefaults(saved){
  const defaults=makePricingDefaults();
  if(!saved||typeof saved!=='object')return defaults;
  const numeric=(value,base,min,max)=>{
    if(value===undefined||value===null||value==='')return base;
    const n=Number(value);
    return Number.isFinite(n)&&n>=min&&n<=max?n:base;
  };
  defaults.buildRate=numeric(saved.buildRate,defaults.buildRate,0,30000);
  defaults.buildVatRate=numeric(saved.buildVatRate,defaults.buildVatRate,0,30);
  defaults.feeVatRate=numeric(saved.feeVatRate,defaults.feeVatRate,0,30);
  defaults.contingency=numeric(saved.contingency,defaults.contingency,0,100);
  defaults.validDays=numeric(saved.validDays,defaults.validDays,1,365);
  // The approved under-25m2 stage fee floor remains fixed until expressly changed.
  defaults.minimumArea=25;
  for(const kind of ['stages','extras']){
    if(!Array.isArray(saved[kind]))continue;
    const values=new Map(saved[kind].filter(x=>x&&typeof x.id==='string').map(x=>[x.id,x]));
    for(const item of defaults[kind]){
      const previous=values.get(item.id);if(!previous)continue;
      const field=kind==='stages'?'rate':'amount';
      const cap=kind==='stages'?5000:1000000;
      item[field]=numeric(previous[field],item[field],0,cap);
      if(typeof previous.selected==='boolean')item.selected=previous.selected;
    }
  }
  return defaults;
}
