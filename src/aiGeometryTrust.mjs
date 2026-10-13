// Fail-closed geometry plausibility gate. A vision-language model can produce
// coordinate values that look precise without tracking a real boundary.
// Never turn a multi-view drawing or a diagram title into measured work.
const text=x=>String(x||'').toLowerCase().replace(/\s+/g,' ').trim();
export function aiGeometryRejection(candidate,context={}){
 const filename=text(context.filename);
 const title=text(candidate?.description);
 const evidence=text(candidate?.evidence);
 if(/(?:floor\s+)?plans?.*(?:elevation|section)|(?:elevation|section).*plans?/.test(filename))
  return 'MULTI-VIEW SHEET: Plans, elevations and sections share one page. Scale and coordinates must be registered and checked separately for each cropped drawing view.';
 if(/^(?:proposed |existing )?(?:ground|first|second|third|upper|lower) floor plan$/.test(title)||
    /^(?:proposed |existing )?(?:front|rear|right|left|side) elevation(?: wall)?$/.test(title))
  return 'DRAWING VIEW LABEL: A floor plan or elevation title is not a billable construction element. Trace actual construction boundaries and identify the work first.';
 if(!evidence||/^(?:clearly |visibly )?(?:visible |outlined |bounded )?(?:outline|drawing outline|boundary|shape)(?: is)?(?: clearly)?(?: visible| outlined)?$/.test(evidence)||
    /^(?:clearly visible outline|clearly outlined slab boundary|visible footprint|drawing boundary|shown on drawing)$/.test(evidence))
  return 'UNSUPPORTED GEOMETRY: Model asserted a visible outline without a traceable dimension, specific wall/room reference, or identifying mark.';
 if(candidate?.kind!=='count'){
   const vertices=Array.isArray(candidate?.points)?candidate.points:
     ['x','y','w','h'].every(k=>typeof candidate?.[k]==='number')?
     [{x:candidate.x,y:candidate.y},{x:candidate.x+candidate.w,y:candidate.y+candidate.h}]:[];
   // Generic rounded grids are common when an LLM invents approximate points.
   if(vertices.length>=2&&vertices.every(p=>[p.x,p.y].every(v=>
      typeof v==='number'&&Number.isFinite(v)&&Math.abs(v*20-Math.round(v*20))<1e-7)))
     return 'ROUNDED GRID OUTLINE: All proposed boundary coordinates fall on the same 5% page grid, consistent with approximate or invented geometry. QS tracing is required.';
 }
 return '';
}
