// Drawing coordinates are stored at their original, unzoomed proportions.
// Resizing for visibility must never change the calibration distance.
export function clampZoom(value,min=0.08,max=8){
 const n=Number(value);
 return Number.isFinite(n)?Math.max(min,Math.min(max,n)):1;
}
export function normalizedDrawingPoint(clientX,clientY,rect){
 const width=Number(rect.width),height=Number(rect.height);
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return {x:0,y:0};
 const between01=x=>Math.max(0,Math.min(1,x));
 return {x:between01((clientX-rect.left)/width),y:between01((clientY-rect.top)/height)};
}
export function anchoredScroll({scrollLeft,scrollTop,fromZoom,toZoom,anchorX,anchorY,targetX=anchorX,targetY=anchorY}){
 const ratio=clampZoom(toZoom)/clampZoom(fromZoom);
 return {left:Math.max(0,(scrollLeft+anchorX)*ratio-targetX),top:Math.max(0,(scrollTop+anchorY)*ratio-targetY)};
}
export function pinchGeometry(a,b){
 return {distance:Math.hypot(a.x-b.x,a.y-b.y),x:(a.x+b.x)/2,y:(a.y+b.y)/2};
}
