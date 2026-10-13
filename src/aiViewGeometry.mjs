// Maps AI-proposed crop-local points back to the original drawing-sheet
// coordinates and reconciles a view-specific scale at different render sizes.
import {validateDrawingView,viewCalibrationStatus,cropPixels} from './drawingViewModel.mjs';
const valid=n=>typeof n==='number'&&Number.isFinite(n);
export const MEASURABLE_VIEW_KINDS=new Set(['ground-floor-plan','upper-floor-plan']);
export function aiViewContext(view,document,cal,sourceImageDimensions,cropDimensions){
 const validity=validateDrawingView(view,document);
 if(!validity.ok)return {ok:false,error:validity.error};
 if(!MEASURABLE_VIEW_KINDS.has(view.kind))
  return {ok:true,calibration_status:'reference-only',metresPerPixel:null};
 const scale=viewCalibrationStatus(view,document,cal);
 if(!scale.ok)return {ok:false,error:scale.error};
 if(!Array.isArray(cropDimensions)||cropDimensions.length!==2||
    cropDimensions.some(n=>!valid(n)||n<=0)||
    !Array.isArray(sourceImageDimensions)||sourceImageDimensions.some(n=>!valid(n)||n<=0))
  return {ok:false,error:'Rendered image dimensions are unavailable'};
 const px=cropPixels(view,sourceImageDimensions);
 if(!px||Math.abs(px.width/px.height-cal.dimensions_px[0]/cal.dimensions_px[1])>.02)
  return {ok:false,error:'The drawing crop aspect ratio has changed; reset view calibration'};
 const sx=cal.dimensions_px[0]/cropDimensions[0],sy=cal.dimensions_px[1]/cropDimensions[1];
 if(!valid(sx)||!valid(sy)||Math.abs(sx-sy)/Math.max(sx,sy)>.02)
  return {ok:false,error:'The view was re-rendered with different horizontal and vertical scales; recalibrate'};
 return {ok:true,calibration_status:'calibrated',metresPerPixel:cal.metresPerPixel*(sx+sy)/2};
}
export function mapCropPoint(point,view){
 return {x:view.bounds.x+point.x*view.bounds.w,y:view.bounds.y+point.y*view.bounds.h};
}
export function mapCropMark(mark,view){
 if(!mark||!view)return null;
 const a=mapCropPoint({x:mark.x||0,y:mark.y||0},view);
 const b=mapCropPoint({x:(mark.x||0)+(mark.w||0),y:(mark.y||0)+(mark.h||0)},view);
 return {...mark,view_id:view.id,
  x:a.x,y:a.y,w:b.x-a.x,h:b.y-a.y,
  ...(Array.isArray(mark.points)?{points:mark.points.map(p=>mapCropPoint(p,view))}:{}),
  ...(Array.isArray(mark.openings)?{openings:mark.openings.map(r=>r.map(p=>mapCropPoint(p,view)))}:{})};
}
export function mapCropMeasurement(measurement,view){
 if(!view)return measurement;
 const mark=mapCropMark(measurement.mark,view);
 return {...measurement,mark,view_id:view.id,
  key:view.id+'|'+measurement.key};
}
export async function renderViewCropFromDataUri(image,view,sourceDimensions,makeCanvas=()=>document.createElement('canvas')){
 if(!view)return {image,dimensions:sourceDimensions};
 const bounds=cropPixels(view,sourceDimensions);
 if(!bounds)throw Error('Registered drawing-view crop is invalid');
 const source=new Image();
 source.src=image;await source.decode();
 const canvas=makeCanvas();canvas.width=bounds.width;canvas.height=bounds.height;
 canvas.getContext('2d').drawImage(source,bounds.x,bounds.y,bounds.width,bounds.height,0,0,bounds.width,bounds.height);
 return {image:canvas.toDataURL('image/jpeg',.83),dimensions:[bounds.width,bounds.height]};
}
