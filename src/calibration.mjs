// Pure measurement-preflight helpers, deliberately independent of React.
// A displayed "1:100" scale alone never authorises a dimension calculation.
export function scaleSheetRegister(sources) {
  return sources.flatMap(({d,filename,numPages})=>Array.from({length:numPages},(_,index)=>({
    document_id:d.id,filename,revision:String(d.revision||''),
    file_path:String(d.file_path||''),page:index+1,
  })));
}
export function calibrationStatus(entry,from) {
  const value=(from?.calibrations||{})[entry.document_id+'#'+entry.page];
  if(!value||value.source_path!==entry.file_path||String(value.source_revision||'')!==entry.revision)return 'needed';
  if(value.status==='reference-only'&&value.reference_only_confirmed===true)return 'reference-only';
  if(value.status==='calibrated'&&Number.isFinite(Number(value.metresPerPixel))&&Number(value.metresPerPixel)>0
    &&Number.isFinite(Number(value.metres))&&Number(value.metres)>0
    &&Number.isFinite(Number(value.pixelLength))&&Number(value.pixelLength)>=5){
    if(value.crosscheck_verified!==true)return 'needs-check';
    return 'calibrated';
  }
  return 'needed';
}
export function missingCalibration(entries,from) {
  return entries.filter(entry=>!['calibrated','reference-only'].includes(calibrationStatus(entry,from)));
}
