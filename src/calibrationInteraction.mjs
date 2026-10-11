// Device-independent calibration point selection. The browser provides normalised
// drawing coordinates; these never change when the drawing is zoomed or panned.
export function calibrationPointDistance(a,b,pageWidth,pageHeight){
  return Math.hypot((a.x-b.x)*pageWidth,(a.y-b.y)*pageHeight);
}
export function resolveCalibrationClick(press,release,previous,pageWidth,pageHeight){
  if(!press||!release||!(pageWidth>0)||!(pageHeight>0))return {step:"invalid"};
  const moved=calibrationPointDistance(press,release,pageWidth,pageHeight)>=5;
  if(!moved&&!previous)return {step:"point-a",first:release};
  const first=moved?press:previous;
  const length=calibrationPointDistance(first,release,pageWidth,pageHeight);
  if(length<5)return {step:"too-close",first:previous};
  return {step:"complete",first,second:release,length};
}
