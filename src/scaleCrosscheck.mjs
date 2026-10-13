const finite=n=>typeof n==='number'&&Number.isFinite(n);
export function verifySecondDimension(previous,metres,pixels,newPoints,dimensions){
 if(!previous||previous.status!=='calibrated')return {ok:false,reason:'Save the first dimension before checking another'};
 if(!finite(metres)||metres<=0||!finite(pixels)||pixels<5)return {ok:false,reason:'Select another printed dimension with a valid length'};
 if(!Array.isArray(dimensions)||dimensions.length!==2||dimensions.some(n=>!finite(n)||n<=0))return {ok:false,reason:'Original page dimensions are missing'};
 const first=previous.reference_points;
 if(!Array.isArray(first)||first.length!==2||!Array.isArray(newPoints)||newPoints.length!==2)
  return {ok:false,reason:'Both independent measured lines must be saved'};
 const pixelDistance=(a,b)=>Math.hypot((a.x-b.x)*dimensions[0],(a.y-b.y)*dimensions[1]);
 const a=pixelDistance(first[0],newPoints[0])+pixelDistance(first[1],newPoints[1]);
 const b=pixelDistance(first[0],newPoints[1])+pixelDistance(first[1],newPoints[0]);
 if(Math.min(a,b)<20)return {ok:false,reason:'Choose a different dimension, preferably in the perpendicular direction'};
 const scale=metres/pixels,original=Number(previous.metresPerPixel);
 if(!finite(original)||original<=0)return {ok:false,reason:'Original scale invalid'};
 const difference=Math.abs(scale-original)/original;
 if(difference>.02)return {ok:false,difference,reason:'The second dimension differs by '+(difference*100).toFixed(1)+'%. Check the paper scale, drawing view, dimensions or scan distortion before measuring.'};
 return {ok:true,difference,metresPerPixel:original};
}
