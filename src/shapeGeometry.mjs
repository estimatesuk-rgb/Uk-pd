// Geometric validation for AI-proposed takeoff shapes.
// All points are fractions of the whole drawing (0..1); calculation uses
// the saved revision-specific drawing scale. This cannot validate a model's
// visual interpretation of a building plan.
const EPS=1e-9;
const inside=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1;
const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
const close=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y)<EPS;
function onSegment(a,b,p){
 return Math.abs(cross(a,b,p))<EPS &&
   p.x>=Math.min(a.x,b.x)-EPS&&p.x<=Math.max(a.x,b.x)+EPS&&
   p.y>=Math.min(a.y,b.y)-EPS&&p.y<=Math.max(a.y,b.y)+EPS;
}
function segmentsIntersect(a,b,c,d){
 const v1=cross(a,b,c),v2=cross(a,b,d),v3=cross(c,d,a),v4=cross(c,d,b);
 if((v1>EPS&&v2< -EPS||v1< -EPS&&v2>EPS)&&
    (v3>EPS&&v4< -EPS||v3< -EPS&&v4>EPS))return true;
 return onSegment(a,b,c)||onSegment(a,b,d)||onSegment(c,d,a)||onSegment(c,d,b);
}
export function validateTrace(raw,closed=true){
 if(!Array.isArray(raw)||raw.length<(closed?3:2)||raw.length>48)return null;
 const points=raw.map(p=>({x:p?.x,y:p?.y}));
 if(points.some(p=>!inside(p.x)||!inside(p.y)))return null;
 if(closed&&points.length>3&&close(points[0],points[points.length-1]))points.pop();
 if(points.length<(closed?3:2))return null;
 const last=closed?points.length:points.length-1;
 for(let i=0;i<last;i++){
  if(Math.hypot(points[i].x-points[(i+1)%points.length].x,
     points[i].y-points[(i+1)%points.length].y)<0.0005)return null;
 }
 // Check non-adjacent edges (no crossings or self-touching).
 for(let i=0;i<last;i++){
  for(let j=i+1;j<last;j++){
   if(j===i+1||(closed&&i===0&&j===last-1))continue;
   if(segmentsIntersect(points[i],points[(i+1)%points.length],points[j],points[(j+1)%points.length]))
     return null;
  }
 }
 if(closed&&polygonArea(points)<0.00001)return null;
 return points;
}
export function polygonArea(points){
 let twice=0;
 for(let i=0;i<points.length;i++){
  const a=points[i],b=points[(i+1)%points.length];
  twice+=a.x*b.y-b.x*a.y;
 }
 return Math.abs(twice)/2;
}
function strictlyInside(p,polygon){
 // Border contact is unsafe when subtracting openings.
 for(let i=0;i<polygon.length;i++){
  if(onSegment(polygon[i],polygon[(i+1)%polygon.length],p))return false;
 }
 let inShape=false;
 for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
  const a=polygon[i],b=polygon[j];
  if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)
    inShape=!inShape;
 }
 return inShape;
}
function boundariesIntersect(a,b){
 for(let i=0;i<a.length;i++)
  for(let j=0;j<b.length;j++)
   if(segmentsIntersect(a[i],a[(i+1)%a.length],b[j],b[(j+1)%b.length]))return true;
 return false;
}
export function validatedPolygonWithOpenings(raw,openings=[]){
 const outline=validateTrace(raw,true);
 if(!outline||!Array.isArray(openings)||openings.length>12)return null;
 const holes=[];
 for(const rawHole of openings){
  const hole=validateTrace(rawHole,true);
  if(!hole||!hole.every(point=>strictlyInside(point,outline))||boundariesIntersect(hole,outline))return null;
  if(holes.some(other=>boundariesIntersect(hole,other)||
     strictlyInside(hole[0],other)||strictlyInside(other[0],hole)))return null;
  holes.push(hole);
 }
 const gross=polygonArea(outline),openingsArea=holes.reduce((n,h)=>n+polygonArea(h),0);
 if(openingsArea>=gross-EPS)return null;
 return {outline,holes,gross,openingsArea,net:gross-openingsArea};
}
export function polygonBounds(points){
 const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
 const x=Math.min(...xs),y=Math.min(...ys);
 return {x,y,w:Math.max(...xs)-x,h:Math.max(...ys)-y};
}
export function measuredTrace(mark,dimensions,metresPerPixel){
 if(!Array.isArray(dimensions)||dimensions.length!==2||dimensions.some(n=>typeof n!=='number'||!Number.isFinite(n)||n<=0)||
   !Number.isFinite(metresPerPixel)||metresPerPixel<=0)return null;
 const [width,height]=dimensions;
 const toMeters=p=>({x:p.x*width*metresPerPixel,y:p.y*height*metresPerPixel});
 if(mark.kind==='polyline'){
  const line=validateTrace(mark.points,false);
  if(!line)return null;
  const metres=line.map(toMeters),length=metres.slice(1).reduce((n,p,i)=>n+Math.hypot(p.x-metres[i].x,p.y-metres[i].y),0);
  const quantity=Number(length.toFixed(2));
  return quantity>0?{quantity,unit:'m',method:'calibrated multi-segment polyline'}:null;
 }
 if(mark.kind==='polygon'){
  const shape=validatedPolygonWithOpenings(mark.points,mark.openings||[]);
  if(!shape)return null;
  const measureArea=vertices=>polygonArea(vertices.map(toMeters));
  const gross=measureArea(shape.outline),deductions=shape.holes.map(measureArea);
  const deducted=deductions.reduce((a,b)=>a+b,0);
  const quantity=Number((gross-deducted).toFixed(2));
  return quantity>0?{quantity,unit:'m²',
    method:deductions.length?'calibrated net polygon area with explicitly outlined openings':'calibrated irregular polygon area',
    gross_area_m2:Number(gross.toFixed(2)),deductions_area_m2:Number(deducted.toFixed(2)),
    openings_count:deductions.length}:null;
 }
 return null;
}
