// IFC4 partial-design model, strictly from QS-approved, explicitly dimensioned
// takeoff marks. Never infer walls, heights, levels or unseen geometry from AI.
// Geometry is in a LOCAL coordinate system of ONE verified drawing sheet only.
import {validatedPolygonWithOpenings,validateTrace} from './shapeGeometry.mjs';

const valid=(n,min,max)=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max;
const finite=(n)=>Number.isFinite(n)&&typeof n==='number';
const alphabet='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';
function makeGuid(){
 // IFC's compressed GUID is a 128-bit value using 22 base64 digits; the
 // leading digit is 0..3. This is a new GUID for each entity.
 const bytes=new Uint8Array(16);
 if(!globalThis.crypto?.getRandomValues)throw Error('Secure random GUID generation is unavailable');
 globalThis.crypto.getRandomValues(bytes);
 let num=0n;for(const b of bytes)num=(num<<8n)+BigInt(b);
 let result='';for(let i=0;i<22;i++){result=alphabet[Number(num&63n)]+result;num>>=6n;}
 return result;
}
const quote=x=>"'"+String(x??'').replace(/'/g,"''").replace(/[\r\n]/g,' ')+"'";
const numeric=n=>{
 if(!finite(n))throw Error('Invalid geometry number');
 const str=Number(n.toFixed(6)).toString();
 return /[.Ee]/.test(str)?str:str+'.';
};
function markPoints(mark){
 if(mark.kind==='polygon')return validatedPolygonWithOpenings(mark.points,mark.openings||[]);
 if(mark.kind==='polyline'||mark.kind==='length'){
  const points=validateTrace(mark.points,false);
  return points?{outline:points,holes:[]}:null;
 }
 return null;
}
function widthPolygon(a,b,w){
 const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);
 if(d<.02)return null;
 const nx=-dy/d*w/2,ny=dx/d*w/2;
 return [{x:a.x+nx,y:a.y+ny},{x:b.x+nx,y:b.y+ny},
         {x:b.x-nx,y:b.y-ny},{x:a.x-nx,y:a.y-ny}];
}
export function prepareIfcElements({highlights=[],bim_specs={},calibrations={},docs=[]}={}){
 const ready=[],issues=[],sources=new Set();
 for(const mark of highlights){
  const spec=bim_specs[mark.id];
  if(!spec||spec.include!==true)continue;
  const label=String(mark.name||mark.id||'Unnamed mark');
  const fail=reason=>issues.push({id:mark.id,label,reason});
  if(spec.qs_checked!==true){fail('Confirm the geometry and specification have been checked by a competent reviewer');continue;}
  if(typeof spec.evidence!=='string'||spec.evidence.trim().length<12){fail('Provide the checked dimension/detail reference');continue;}
  if(!['Proposed','Existing'].includes(mark.stage)){fail('Only identified existing or proposed elements can be modelled');continue;}
  if(!['slab','wall'].includes(spec.element)){fail('Choose Slab/Floor or Wall');continue;}
  if(!valid(Number(spec.base_m),-20,150)){fail('Provide a valid base elevation in metres');continue;}
  const doc=docs.find(d=>d.id===mark.drawing_id&&d.status!=='Superseded');
  const cal=calibrations[mark.drawing_id+'#'+mark.page];
  if(!doc||!cal||cal.status!=='calibrated'||cal.source_path!==doc.file_path||
    String(cal.source_revision||'')!==String(doc.revision||'')){
    fail('Drawing revision and calibrated scale must match the source');continue;
  }
  if(!valid(Number(cal.metresPerPixel),1e-9,1)||!Array.isArray(cal.sheet_dimensions_px)||
     cal.sheet_dimensions_px.length!==2||cal.sheet_dimensions_px.some(n=>!valid(n,50,50000))){
    fail('Original page dimensions are missing. Recalibrate this drawing with the current reader');continue;
  }
  const shape=markPoints(mark);
  if(!shape){fail('An actual traced polygon or wall line is required');continue;}
  const scale=Number(cal.metresPerPixel),[width,height]=cal.sheet_dimensions_px;
  const toMeters=point=>({x:point.x*width*scale,y:-point.y*height*scale});
  const outline=shape.outline.map(toMeters),holes=shape.holes.map(h=>h.map(toMeters));
  const base=Number(spec.base_m);
  if(spec.element==='slab'){
   if(mark.kind!=='polygon'){fail('Floor/slab needs a closed footprint polygon');continue;}
   if(!valid(Number(spec.thickness_m),.025,3)){fail('Enter verified slab thickness (m)');continue;}
   ready.push({id:mark.id,name:label,element:'slab',base_m:base,depth:Number(spec.thickness_m),
     outline,holes,source:doc.document_no||doc.title||doc.file_path,page:mark.page,
     evidence:spec.evidence.trim(),drawing_id:mark.drawing_id});
  }else{
   if(!['length','polyline'].includes(mark.kind)){fail('Wall needs a separately traced centre-line');continue;}
   if(!valid(Number(spec.thickness_m),.05,1.5)||!valid(Number(spec.height_m),.3,20)){
    fail('Enter verified wall thickness and height (m)');continue;
   }
   for(let i=0;i<outline.length-1;i++){
    const rectangle=widthPolygon(outline[i],outline[i+1],Number(spec.thickness_m));
    if(!rectangle){fail('Zero-length wall segment');continue;}
    ready.push({id:mark.id+'-'+i,name:label+(outline.length>2?' segment '+(i+1):''),
      element:'wall',base_m:base,depth:Number(spec.height_m),outline:rectangle,holes:[],
      source:doc.document_no||doc.title||doc.file_path,page:mark.page,
      evidence:spec.evidence.trim(),drawing_id:mark.drawing_id});
   }
  }
  sources.add(mark.drawing_id+'#'+mark.page);
 }
 if(sources.size>1)issues.push({id:'sheets',label:'Sheet alignment',
  reason:'IFC export supports a single source page. Register/verify common origins and floor levels before combining sheets.'});
 if(!ready.length)issues.push({id:'empty',label:'Model',reason:'Select and verify at least one dimensioned polygon or wall run'});
 return {ready,issues};
}
export function createIfc4Model({projectName='UKPD partial BIM',elements=[],now=new Date(),newGuid=makeGuid}={}){
 if(!elements.length)throw Error('No verified BIM elements');
 const lines=[],put=(type,args)=>{const n=lines.length+1;lines.push('#'+n+'='+type+'('+args+');');return '#'+n;};
 const guid=()=>quote(newGuid());
 const cart3=(x=0,y=0,z=0)=>put('IFCCARTESIANPOINT', '('+[x,y,z].map(numeric).join(',')+')');
 const axis=(x=0,y=0,z=0)=>put('IFCAXIS2PLACEMENT3D',cart3(x,y,z)+',$,$');
 const lengthUnit=put('IFCSIUNIT','*,.LENGTHUNIT.,$,.METRE.');
 const areaUnit=put('IFCSIUNIT','*,.AREAUNIT.,$,.SQUARE_METRE.');
 const volumeUnit=put('IFCSIUNIT','*,.VOLUMEUNIT.,$,.CUBIC_METRE.');
 const units=put('IFCUNITASSIGNMENT','('+[lengthUnit,areaUnit,volumeUnit].join(',')+')');
 const rootAxis=axis();
 const context=put('IFCGEOMETRICREPRESENTATIONCONTEXT',"$,'Model',3,0.00001,"+rootAxis+',$');
 const project=put('IFCPROJECT',guid()+',$,'+quote(projectName)+',$,$,$,$,('+context+'),'+units);
 const rootPlace=put('IFCLOCALPLACEMENT','$,'+axis());
 const site=put('IFCSITE',guid()+',$,'+quote('Local site')+',$,$,'+rootPlace+',$,$,.ELEMENT.,$,$,$,$,$');
 const buildingPlace=put('IFCLOCALPLACEMENT',rootPlace+','+axis());
 const building=put('IFCBUILDING',guid()+',$,'+quote('Building')+',$,$,'+buildingPlace+',$,$,.ELEMENT.,$,$,$');
 const storeyPlace=put('IFCLOCALPLACEMENT',buildingPlace+','+axis());
 const storey=put('IFCBUILDINGSTOREY',guid()+',$,'+quote('Modelled level')+',$,$,'+storeyPlace+',$,$,.ELEMENT.,0.');
 for(const [parent,child] of [[project,site],[site,building],[building,storey]])
  put('IFCRELAGGREGATES',guid()+',$,$,$,'+parent+',('+child+')');
 const extrudeDir=put('IFCDIRECTION','(0.,0.,1.)');
 const contained=[];
 function polyline(coords){
  const pts=[...coords,coords[0]];
  const ids=pts.map(p=>put('IFCCARTESIANPOINT','('+[p.x,p.y].map(numeric).join(',')+')'));
  return put('IFCPOLYLINE','('+ids.join(',')+')');
 }
 for(const el of elements){
  if(!valid(el.depth,.001,25)||!finite(el.base_m)||!Array.isArray(el.outline)||el.outline.length<3)
   throw Error('Invalid verified geometry');
  const boundary=polyline(el.outline);
  const holes=(el.holes||[]).map(polyline);
  const profile=holes.length?put('IFCARBITRARYPROFILEDEFWITHVOIDS','.AREA.,$,'+boundary+',('+holes.join(',')+')'):
    put('IFCARBITRARYCLOSEDPROFILEDEF','.AREA.,$,'+boundary);
  const solid=put('IFCEXTRUDEDAREASOLID',profile+','+axis()+','+extrudeDir+','+numeric(el.depth));
  const shape=put('IFCSHAPEREPRESENTATION',context+','+quote('Body')+','+quote('SweptSolid')+',('+solid+')');
  const representation=put('IFCPRODUCTDEFINITIONSHAPE','$,$,('+shape+')');
  const localPlace=put('IFCLOCALPLACEMENT',storeyPlace+','+axis(0,0,el.base_m));
  const type=el.element==='slab'?'IFCSLAB':el.element==='wall'?'IFCWALL':null;
  if(!type)throw Error('Unknown BIM entity type');
  const entity=put(type,guid()+',$,'+quote(el.name)+',$,$,'+localPlace+','+representation+',$,'+(type==='IFCSLAB'?'.FLOOR.':'.NOTDEFINED.'));
  contained.push(entity);
  const p1=put('IFCPROPERTYSINGLEVALUE',quote('Source drawing')+',$,IFCTEXT('+quote(el.source+' page '+el.page)+'),$');
  const p2=put('IFCPROPERTYSINGLEVALUE',quote('Checked dimension reference')+',$,IFCTEXT('+quote(el.evidence)+'),$');
  const pset=put('IFCPROPERTYSET',guid()+',$,'+quote('UKPD verified inputs')+',$,('+p1+','+p2+')');
  put('IFCRELDEFINESBYPROPERTIES',guid()+',$,$,$,('+entity+'),'+pset);
 }
 put('IFCRELCONTAINEDINSPATIALSTRUCTURE',guid()+',$,$,$,('+contained.join(',')+'),'+storey);
 const iso=now.toISOString().slice(0,19);
 const header=['ISO-10303-21;','HEADER;', "FILE_DESCRIPTION(('ViewDefinition [DesignTransferView]'),'2;1');",
  "FILE_NAME('ukpd-verified-partial-bim.ifc',"+quote(iso)+",('UKPD'),('UK Estimates'),'UKPD IFC export','UKPD','');",
  "FILE_SCHEMA(('IFC4'));",'ENDSEC;','DATA;'];
 return [...header,...lines,'ENDSEC;','END-ISO-10303-21;',''].join('\n');
}
