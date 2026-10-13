// Explicit job scope selected by the estimator before AI reads any drawings.
// The job choice determines whether an existing/proposed comparison is mandatory.
export const TAKEOFF_JOB_TYPES=[
 {id:'new-house',label:'New-build house',mode:'new-build'},
 {id:'new-bungalow',label:'New-build bungalow',mode:'new-build'},
 {id:'new-commercial',label:'New-build commercial / industrial',mode:'new-build'},
 {id:'single-extension',label:'Single-storey extension',mode:'comparison'},
 {id:'double-extension',label:'Two-storey / multi-storey extension',mode:'comparison'},
 {id:'loft-conversion',label:'Loft conversion',mode:'comparison'},
 {id:'garage-conversion',label:'Garage conversion',mode:'comparison'},
 {id:'barn-conversion',label:'Barn / outbuilding conversion',mode:'comparison'},
 {id:'refurbishment',label:'Refurbishment / renovation',mode:'comparison'},
 {id:'internal-alterations',label:'Internal / structural alterations',mode:'comparison'},
 {id:'change-of-use',label:'Conversion / change of use',mode:'comparison'},
 {id:'demolition-rebuild',label:'Demolition and rebuild',mode:'comparison'},
 {id:'other-alterations',label:'Other works to an existing building',mode:'comparison'},
 {id:'other-new-build',label:'Other new-build project',mode:'new-build'}
];
export const jobTypeFor=id=>TAKEOFF_JOB_TYPES.find(t=>t.id===id)||null;
export function validateJobType(jobType,drawingMode){
 const type=jobTypeFor(jobType);
 if(!type)return {ok:false,error:'Before reading plans, choose the type of construction job.'};
 if(type.mode!==drawingMode)return {ok:false,error:'Job type and drawing comparison mode do not agree. Select the job type again before running AI.'};
 return {ok:true,mode:type.mode,label:type.label};
}
