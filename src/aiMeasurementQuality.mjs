// QS exceptions, not universal building-size limits. All limits are advisory
// thresholds for reviewing a *candidate*, never assertions about a real site.
export function measurementQualityFlags({description='',unit='',quantity=0,kind='',method='',dimension_evidence=null}={}){
 const name=String(description).toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ');
 const u=String(unit).trim().toLowerCase();
 const measured=Number(quantity);
 const flags=[];
 if(!Number.isFinite(measured)||measured<=0)return ['No positive independently calculated quantity'];
 const area=['m²','m2','sqm'].includes(u);
 const wall=/(^| )(?:wall|walls|elevation|elevations|facade|fa[çc]ade|cladding)( |$)/.test(name);
 const elevation=/(^| )(?:elevation|elevations)( |$)/.test(name);
 const roomOrExtension=/(^| )(?:kitchen|bedroom|bathroom|room|extension|conservatory)( |$)/.test(name);
 if(area&&elevation){
   flags.push('Elevation view may include the title block, full facade or repeated storeys; trace the actual construction face and verify wall height and openings');
 }
 if(area&&wall&&!['wall_face'].includes(kind)){
   flags.push('Wall face area traced without an explicitly dimensioned wall height; verify vertical dimensions or use dimensioned wall-face take-off');
 }
 if(area&&roomOrExtension&&measured>60){
   flags.push('Unusually large room/extension area above 60 m² review threshold — confirm the complete boundary, scale, floor level and whether this is a billable work item');
 }
 if(area&&wall&&measured>100){
   flags.push('Wall/elevation face exceeds 100 m² review threshold — verify scaled face, excluded openings, storeys and whether whole drawing was selected');
 }
 if(area&&measured>250){
   flags.push('Area exceeds 250 m² general review threshold — check the drawing crop, scale and boundary. Larger commercial projects may be legitimate');
 }
 if(area&&/^(?:proposed|existing)\s+(?:right|left|front|rear)\s+elevation/.test(name)){
   flags.push('Drawing view label is not itself a construction work item; define the wall build-up/work activity before pricing');
 }
 if(u==='m³'&&measured>150&&(/slab|excavat|trench|foundat/i.test(name))){
   flags.push('Bulk quantity exceeds 150 m³ review threshold — confirm depth, width, site formation and multiple sections');
 }
 if(u==='m'&&measured>150){
   flags.push('Linear run exceeds 150 m review threshold — check scale and whether unrelated runs were combined');
 }
 return [...new Set(flags)];
}
export function auditMeasurementQuality(items){
 const rows=[];
 for(const item of (items||[])){
  if(item?.takeoff_evidence?.automatic!==true)continue;
  const issues=measurementQualityFlags({
   description:item.description,unit:item.unit,quantity:item.quantity,
   kind:item.takeoff_evidence?.measurement_kind||item.takeoff_evidence?.kind,
   dimension_evidence:item.takeoff_evidence?.dimension_evidence
  });
  if(issues.length)rows.push({id:item.id,ref_no:item.ref_no||'Unnumbered',description:item.description,
     quantity:item.quantity,unit:item.unit,issues});
 }
 return rows;
}
