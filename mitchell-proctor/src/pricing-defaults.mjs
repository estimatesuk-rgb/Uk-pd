
export const PROJECT_BANDS=Object.freeze([
  {id:'micro',label:'Micro',description:'Typically up to 20 m² / very modest alterations'},
  {id:'small',label:'Small',description:'Typically 20–40 m² / straightforward extension'},
  {id:'medium',label:'Medium',description:'Typically 40–85 m² / substantial extension or remodelling'},
  {id:'large',label:'Large',description:'Typically 85–180 m² / complex extension or smaller new home'},
  {id:'extra',label:'Extra large',description:'Typically above 180 m² / substantial new home'}
]);
// Indicative owner-editable starting points, excluding VAT, not competitor price quotations.
// Complexity, project scope and fixed-price appointment terms determine the final category.
const STAGE_BANDS={
  design:[600,750,1100,1900,2500],
  planning:[800,1200,1700,3000,3900],
  technical:[1400,1850,2600,4200,5500],
  tender:[500,700,1200,2000,2800],
  site:[800,1400,2400,3500,4800]
};
const EXTRA_BANDS={
  survey:[350,450,600,850,1250],
  feasibility:[350,450,650,1000,1600],
  preapp:[200,300,450,650,850],
  visuals:[400,600,850,1100,1450],
  heritage:[650,850,1100,1500,1900],
  conditions:[450,650,950,1350,1750],
  bng:[650,800,1050,1400,1900],
  bngplan:[850,1000,1400,1800,2300],
  cdm:[950,1250,1800,2500,3500],
  brpd:[650,950,1300,1800,2400],
  qs:[650,1100,1800,2500,3500],
  revisions:[350,500,750,1100,1600]
};
export const BAND_IDS=Object.freeze(PROJECT_BANDS.map(x=>x.id));
export function bandValues(itemId,kind){
  const values=(kind==='stages'?STAGE_BANDS:EXTRA_BANDS)[itemId]||[];
  return Object.fromEntries(BAND_IDS.map((id,i)=>[id,values[i]??0]));
}
export function validBand(id){return BAND_IDS.includes(id);}

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
    feeMode:'band',defaultBand:'medium',
    stages:defaultStageRates.map(x=>({...x,bandFees:bandValues(x.id,'stages')})),
    extras:defaultExtraRates.map(x=>({...x,bandFees:bandValues(x.id,'extras')}))
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
  defaults.feeMode=['band','sqm'].includes(saved.feeMode)?saved.feeMode:defaults.feeMode;
  defaults.defaultBand=validBand(saved.defaultBand)?saved.defaultBand:defaults.defaultBand;
  for(const kind of ['stages','extras']){
    if(!Array.isArray(saved[kind]))continue;
    const values=new Map(saved[kind].filter(x=>x&&typeof x.id==='string').map(x=>[x.id,x]));
    for(const item of defaults[kind]){
      const previous=values.get(item.id);if(!previous)continue;
      const field=kind==='stages'?'rate':'amount';
      const cap=kind==='stages'?5000:1000000;
      item[field]=numeric(previous[field],item[field],0,cap);
      if(typeof previous.selected==='boolean')item.selected=previous.selected;
      if(previous.bandFees&&typeof previous.bandFees==='object'){
        for(const band of BAND_IDS){
          item.bandFees[band]=numeric(previous.bandFees[band],item.bandFees[band],0,1000000);
        }
      }
    }
  }
  return defaults;
}
