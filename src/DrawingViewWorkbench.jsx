import React,{useEffect,useMemo,useRef,useState} from 'react';
import * as pdfjs from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjs.GlobalWorkerOptions.workerSrc=pdfWorkerUrl;
import {VIEW_KINDS,validateDrawingView,cropPixels,saveViewScaleCheck,
  viewCalibrationStatus,viewQuantity,prepareViewBim} from './drawingViewModel.mjs';
import {createIfc4Model} from './ifcExport.mjs';
import {prepareArchitecturalBim} from './bimArchitecturalParts.mjs';
import BimScene3D from './BimScene3D.jsx';

const n=v=>Number(v);
const format=v=>Number(v).toLocaleString('en-GB',{maximumFractionDigits:3});
const ext=s=>String(s||'').split(/[?#]/)[0].split('.').pop().toLowerCase();
const clamp=t=>Math.max(0,Math.min(1,t));
const pos=(e,node)=>{const r=node.getBoundingClientRect();return {
  x:clamp((e.clientX-r.left)/r.width),y:clamp((e.clientY-r.top)/r.height)
};};
function Overlay({points=[],closed=false}){
 if(points.length===0)return null;
 const d=points.map((p,i)=>(i?'L':'M')+(p.x*100).toFixed(3)+' '+(p.y*100).toFixed(3)).join(' ')+(closed?' Z':'');
 return <svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none"
  style={{pointerEvents:'none',position:'absolute',inset:0,width:'100%',height:'100%',overflow:'visible'}}>
   <path d={d} fill={closed?'rgba(255,235,59,.14)':'none'} stroke="#e0b900" strokeWidth=".20" strokeDasharray=".65 .4"/>
   {points.map((p,i)=><circle key={i} cx={100*p.x} cy={100*p.y} r=".30" fill="#ffdf00" stroke="#705c00" strokeWidth=".10"/>)}
 </svg>;
}
export default function DrawingViewWorkbench({db,project,docs=[],estimate={},onCommit=async()=>{}}){
 const views=estimate.drawing_views||[],calibrations=estimate.view_calibrations||{};
 const elements=estimate.view_bim_elements||[],features=estimate.view_bim_features||[];
 const [docId,setDocId]=useState(''),[page,setPage]=useState(1);
 const [sheet,setSheet]=useState(null),[sheetDims,setSheetDims]=useState(null),[pages,setPages]=useState(1);
 const [viewName,setViewName]=useState(''),[viewKind,setViewKind]=useState('ground-floor-plan');
 const [drawnBox,setDrawnBox]=useState(null),[dragBox,setDragBox]=useState(null),[selected,setSelected]=useState('');
 const [preview,setPreview]=useState(null),[previewDims,setPreviewDims]=useState(null);
 const [mode,setMode]=useState('scale'),[points,setPoints]=useState([]),[metres,setMetres]=useState('');
 const [bimName,setBimName]=useState(''),[bimType,setBimType]=useState('slab');
 const [base,setBase]=useState(''),[thickness,setThickness]=useState(''),[height,setHeight]=useState('');
 const [roofHigh,setRoofHigh]=useState(''),[slopeAxis,setSlopeAxis]=useState('x');
 const [openingHost,setOpeningHost]=useState(''),[openingOffset,setOpeningOffset]=useState(''),[openingWidth,setOpeningWidth]=useState(''),[openingSill,setOpeningSill]=useState('');
 const [xOrigin,setXOrigin]=useState(''),[yOrigin,setYOrigin]=useState('');
 const [sourceNote,setSourceNote]=useState(''),[expectedArea,setExpectedArea]=useState('');
 const [approved,setApproved]=useState(false),[working,setWorking]=useState(false);
 const [message,setMessage]=useState(''),startRef=useRef(null),sheetNode=useRef(null);
 const currentDoc=docs.find(d=>d.id===docId);
 const view=views.find(v=>v.id===selected);
 const viewDoc=docs.find(d=>d.id===view?.document_id);
 const calibration=calibrations[view?.id];
 const scaleCheck=viewCalibrationStatus(view,viewDoc,calibration);
 const measures=view&&scaleCheck.ok&&points.length>=2&&mode!=='opening'?
   viewQuantity({view,document:viewDoc,calibration,points,kind:mode==='wall'?'length':'area'}):null;
 const bim=useMemo(()=>prepareArchitecturalBim({views,docs,calibrations,elements,features}),[views,docs,calibrations,elements,features]);
 const hostChoices=bim.models.filter(m=>m.element==='wall');
 const nextHint=!sheet?'NEXT: Select your drawing and press Load drawing.':
  !view?'NEXT: Draw a box around one full floor plan, then press Use this box.':
  !preview?'NEXT: Load the saved drawing view.':
  !scaleCheck.ok?(calibration?.status==='first-dimension'?'NEXT: Click the ends of a vertical dimension, enter its printed length, then verify Y.':'NEXT: Click the ends of a horizontal dimension, enter its printed length, then save X.'):
  bim.models.length===0?'NEXT: Trace the floor outline, enter measured thickness and drawing reference, tick the approval box, then Add to 3D model.':
  'NEXT: Add the remaining checked floors, walls, roofs and openings. Generate IFC4 when ready.';
 useEffect(()=>{if(!docId&&docs.length)setDocId(docs[0].id)},[docs,docId]);
 async function saveUpdate(key,value){
  setWorking(true);
  try{await onCommit({[key]:value});setMessage('Saved to the project.')}
  catch(e){setMessage('Save failed: '+String(e?.message||e));throw e}
  finally{setWorking(false)}
 }
 async function loadSheet(chosenDoc=docId,chosenPage=page){
  const doc=docs.find(d=>d.id===chosenDoc);
  if(!doc?.file_path)return setMessage('Choose an uploaded drawing.');
  setWorking(true);setMessage('Rendering original drawing…');
  try{
   const {data,error}=await db.storage.from('project-files').createSignedUrl(doc.file_path,600);
   if(error||!data?.signedUrl)throw Error(error?.message||'Signed drawing URL unavailable');
   const canvas=document.createElement('canvas');
   let count=1;
   if(ext(doc.file_path)==='pdf'){
    const pdf=await pdfjs.getDocument({url:data.signedUrl}).promise;
    try{
     count=pdf.numPages;
     if(chosenPage>count||chosenPage<1)throw Error('Page is outside this PDF');
     const pg=await pdf.getPage(chosenPage);
     const baseViewport=pg.getViewport({scale:1});
     const scale=Math.min(3,2400/Math.max(baseViewport.width,baseViewport.height));
     const viewport=pg.getViewport({scale});
     canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
     await pg.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
    }finally{await pdf.destroy()}
   }else{
    const res=await fetch(data.signedUrl);
    if(!res.ok)throw Error('Could not load image');
    const blob=await res.blob();
    let image;
    let release=()=>{};
    if(typeof createImageBitmap==='function'){
     try{image=await createImageBitmap(blob);release=()=>image.close?.()}catch{}
    }
    if(!image){
     const objectUrl=URL.createObjectURL(blob);
     try{
      image=new Image();image.src=objectUrl;
      await image.decode();
     }catch(error){URL.revokeObjectURL(objectUrl);throw error}
     release=()=>URL.revokeObjectURL(objectUrl);
    }
    try{
     const width=image.width||image.naturalWidth,height=image.height||image.naturalHeight;
     if(!width||!height)throw Error('Image has no usable dimensions');
     const scale=Math.min(1,2400/Math.max(width,height));
     canvas.width=Math.max(1,Math.round(width*scale));
     canvas.height=Math.max(1,Math.round(height*scale));
     canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
    }finally{release()}
   }
   setSheet(canvas.toDataURL('image/jpeg',.87));
   setSheetDims([canvas.width,canvas.height]);setPages(count);setDocId(chosenDoc);setPage(chosenPage);
   setDrawnBox(null);setDragBox(null);
   const registeredView=views.find(v=>v.id===selected&&v.document_id===chosenDoc&&v.page===chosenPage);
   if(registeredView){
    const crop=cropPixels(registeredView,[canvas.width,canvas.height]);
    if(crop){
     const isolated=document.createElement('canvas');
     isolated.width=crop.width;isolated.height=crop.height;
     isolated.getContext('2d').drawImage(canvas,crop.x,crop.y,crop.width,crop.height,0,0,crop.width,crop.height);
     setPreview(isolated.toDataURL('image/jpeg',.92));setPreviewDims([crop.width,crop.height]);
     setMessage('Drawing and saved view loaded. Select dimension endpoints or trace verified geometry.');
    }else{setPreview(null);setPreviewDims(null);setMessage('Saved view crop is invalid. Draw a new view box.');}
   }else{setPreview(null);setPreviewDims(null);setMessage('Drag around ONE plan, elevation or section, excluding other views and the title block.');}
  }catch(e){setMessage('Drawing preview failed: '+String(e?.message||e))}
  finally{setWorking(false)}
 }
 function pointerEnd(e){
  if(!startRef.current||!sheetNode.current)return;
  const a=startRef.current,b=pos(e,sheetNode.current);startRef.current=null;setDragBox(null);
  const bounds={x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.abs(a.x-b.x),h:Math.abs(a.y-b.y)};
  if(bounds.w<.03||bounds.h<.03){setDrawnBox(null);return setMessage('Draw a larger rectangle around exactly one view.');}
  setDrawnBox(bounds);setMessage('Choose the view type, name it, then Save drawing view.');
 }
 async function saveView(){
  if(!sheet||!drawnBox||!currentDoc)return setMessage('Load the drawing and mark a single plan/elevation view.');
  const registered={id:crypto.randomUUID(),document_id:currentDoc.id,page,kind:viewKind,
   name:viewName.trim()||VIEW_KINDS.find(k=>k.id===viewKind)?.label||'Drawing view',
   source_path:currentDoc.file_path,source_revision:String(currentDoc.revision||''),
   bounds:drawnBox,common_origin_verified:false};
  const check=validateDrawingView(registered,currentDoc);
  if(!check.ok)return setMessage(check.error);
  try{
   await saveUpdate('drawing_views',[...views,registered]);
  }catch{return;}
  setSelected(registered.id);setDrawnBox(null);setPoints([]);setMode('scale');
  try{
   const px=cropPixels(registered,sheetDims);
   if(!px)throw Error('Saved view has invalid crop dimensions');
   const bitmap=new Image();bitmap.src=sheet;await bitmap.decode();
   const cropped=document.createElement('canvas');
   cropped.width=px.width;cropped.height=px.height;
   cropped.getContext('2d').drawImage(bitmap,px.x,px.y,px.width,px.height,0,0,px.width,px.height);
   setPreview(cropped.toDataURL('image/jpeg',.92));setPreviewDims([px.width,px.height]);
   setMessage('Box saved. NEXT: Click both ends of a horizontal printed dimension to calibrate the drawing.');
  }catch(e){setMessage('View saved, but preview could not open: '+String(e?.message||e))}
 }
 async function chooseView(id){
  const v=views.find(x=>x.id===id);if(!v)return;
  const doc=docs.find(d=>d.id===v.document_id);
  const check=validateDrawingView(v,doc);
  if(!check.ok)return setMessage(check.error);
  setSelected(id);setPoints([]);
  let image=sheet,dim=sheetDims;
  if(!image||v.document_id!==docId||v.page!==page){
   // Preview is loaded explicitly so the physical calibration is never silently
   // carried over from a different rendering size.
   setPreview(null);setPreviewDims(null);setDocId(v.document_id);setPage(v.page);
   return setMessage('Press Load drawing, then select this view again to see its crop.');
  }
  const px=cropPixels(v,dim);
  if(!px)return setMessage('This registered view has invalid pixel dimensions');
  const bitmap=new Image();bitmap.src=image;await bitmap.decode();
  const cropped=document.createElement('canvas');
  cropped.width=px.width;cropped.height=px.height;
  cropped.getContext('2d').drawImage(bitmap,px.x,px.y,px.width,px.height,0,0,px.width,px.height);
  setPreview(cropped.toDataURL('image/jpeg',.92));setPreviewDims([px.width,px.height]);
  setMessage('View loaded. Select calibration mode and click two endpoints of a written dimension.');
 }
 function viewClick(e){
  if(!preview||!previewDims||!view||mode==='opening')return;
  const p=pos(e,e.currentTarget);
  setPoints(current=>mode==='scale'&&current.length>=2?[p]:[...current,p]);
 }
 async function storeScale(){
  if(!view||!viewDoc||!previewDims)return setMessage('Select a registered drawing view.');
  if(points.length!==2)return setMessage('Click both ends of a printed dimension INSIDE the isolated view.');
  const dx=Math.abs((points[1].x-points[0].x)*previewDims[0]);
  const dy=Math.abs((points[1].y-points[0].y)*previewDims[1]);
  const first=!scaleCheck.ok&&calibration?.status!=='first-dimension';
  if(scaleCheck.ok)return setMessage('Both dimensions are already verified. Choose Trace slab/floor perimeter or Trace wall centre-line.');
  if(first&&dx<=dy*2)return setMessage('Step 1: choose a HORIZONTAL X-axis printed dimension.');
  if(!first&&dy<=dx*2)return setMessage('Step 2: choose a VERTICAL Y-axis printed dimension.');
  const result=saveViewScaleCheck({view,document:viewDoc,previous:calibration,
   dimensions:previewDims,points,metres:n(metres)});
  if(!result.ok)return setMessage(result.error);
  try{await saveUpdate('view_calibrations',{...calibrations,[view.id]:result.value});
   setPoints([]);setMetres('');
   if(result.complete){setMode('slab');setBimType('slab');}
   setMessage(result.complete?'X and Y verified. Step 3: click each corner of the floor perimeter to measure its area in square metres. Then verify Z heights from an elevation or section.':
     'X-axis saved. Now click both ends of a VERTICAL Y-axis dimension and enter its printed length.');
  }catch{}
 }
 async function addElement(){
  if(!view||!scaleCheck.ok)return setMessage(scaleCheck.error||'First verify both dimensions.');
  if(!approved)return setMessage('A competent reviewer must confirm the geometry and evidence.');
  if(mode==='roof'||mode==='opening')return addArchitecturalFeature();
  const type=mode==='wall'?'wall':'slab';
  if(type!==bimType)return setMessage('Choose matching Wall/Slab type.');
  const measured=viewQuantity({view,document:viewDoc,calibration,points,
    kind:type==='wall'?'length':'area'});
  if(!measured.ok)return setMessage(measured.error);
  if(expectedArea.trim()&&type==='slab'){
   const expected=n(expectedArea),delta=expected>0?Math.abs(measured.quantity-expected)/expected:Infinity;
   if(delta>.02)return setMessage('Area benchmark mismatch: measured '+format(measured.quantity)+
     ' m² versus stated '+format(expected)+' m². Correct the trace or scale, do not approve this element.');
  }
  const el={id:crypto.randomUUID(),view_id:view.id,name:bimName.trim(),
   type,points,base_m:n(base),thickness_m:n(thickness),
   height_m:type==='wall'?n(height):null,
   origin_x_m:n(xOrigin),origin_y_m:n(yOrigin),
   dimension_reference:sourceNote.trim(),checked:true,include:true,
   benchmark_m2:type==='slab'&&expectedArea.trim()?n(expectedArea):null};
  if(!el.name||!sourceNote.trim()||sourceNote.trim().length<12||
      [base,thickness,xOrigin,yOrigin].some(v=>!String(v).trim())||
      type==='wall'&&!String(height).trim())
   return setMessage('Enter element name, measured evidence, actual thickness, height (if wall), origin and level.');
  const validation=prepareViewBim({views,docs,calibrations,elements:[el]});
  if(validation.issues.length)return setMessage(validation.issues.map(x=>x.reason).join(' | '));
  try{await saveUpdate('view_bim_elements',[...elements,el]);setPoints([]);setApproved(false);
   setMessage(format(measured.quantity)+' '+measured.unit+' verified and saved as IFC '+type+
    '. All model elements still require a BIM coordination check.')}
  catch{}
 }
 async function addArchitecturalFeature(){
  if(!bimName.trim()||sourceNote.trim().length<12)return setMessage('Give this component a name and a verifiable drawing/section dimension reference.');
  const type=mode==='roof'?'roof':bimType;
  const common={id:crypto.randomUUID(),name:bimName.trim(),type,
    dimension_reference:sourceNote.trim(),checked:true,include:true};
  let feature;
  if(mode==='roof'){
   if(!['roof'].includes(bimType)||![base,thickness,roofHigh,xOrigin,yOrigin].every(v=>String(v).trim()!=='')){
    return setMessage('Enter the verified eaves level, high/ridge level, roof thickness and common X/Y origin.');
   }
   if(points.length<3)return setMessage('Click the actual corners of ONE roof plane, not the whole roof silhouette.');
   feature={...common,view_id:view.id,points,
    eave_m:n(base),ridge_m:n(roofHigh),thickness_m:n(thickness),
    origin_x_m:n(xOrigin),origin_y_m:n(yOrigin),slope_axis:slopeAxis};
  }else{
   if(!['window','door'].includes(bimType))return setMessage('Select IFC Window or IFC Door.');
   if(!openingHost||![openingOffset,openingWidth,openingSill,height].every(v=>String(v).trim()!==''))
    return setMessage('Choose a checked wall segment and enter the measured offset, width, sill height and opening height.');
   feature={...common,host_id:openingHost,view_id:view.id,
    offset_m:n(openingOffset),width_m:n(openingWidth),sill_m:n(openingSill),height_m:n(height)};
  }
  const check=prepareArchitecturalBim({views,docs,calibrations,elements,features:[feature]});
  if(check.issues.length)return setMessage(check.issues.map(x=>x.reason).join(' | '));
  const combined=prepareArchitecturalBim({views,docs,calibrations,elements,features:[...features,feature]});
  if(combined.issues.length)return setMessage(combined.issues.map(x=>x.reason).join(' | '));
  try{await saveUpdate('view_bim_features',[...features,feature]);
   setPoints([]);setApproved(false);
   setMessage('Saved verified '+type+' and rebuilt IFC geometry. Check the interactive 3D preview before export.');
  }catch{}
 }
 function exportIfc(){
  if(bim.issues.length)return setMessage('IFC export held: '+bim.issues.map(x=>x.reason).join('; '));
  try{
   if(!bim.models.length)return setMessage('No verified BIM elements yet. Save a checked slab or wall before generating IFC4.');
   const text=createIfc4Model({projectName:project?.name||'UKPD partial BIM',elements:bim.models});
   const url=URL.createObjectURL(new Blob([text],{type:'application/x-step'}));
   const link=document.createElement('a');link.href=url;link.download='UKPD-checked-elements.ifc';link.click();
   setTimeout(()=>URL.revokeObjectURL(url),2000);
   setMessage('IFC4 file created from '+bim.models.length+' checked building elements, including verified roofs and wall-hosted openings where entered.');
  }catch(e){setMessage('IFC export failed: '+String(e?.message||e))}
 }
 async function setAligned(v,checked){
  if(!window.confirm(checked?'Confirm view origins and floor levels have been aligned to a common construction datum using checked drawings?':'Remove multi-view alignment confirmation?'))return;
  try{await saveUpdate('drawing_views',views.map(x=>x.id===v.id?{...x,common_origin_verified:checked}:x))}
  catch{}
 }
 return <div id="ukpd-drawing-view-workbench" tabIndex={-1} className="estimateForm" style={{border:'2px solid #577997',borderRadius:12,
   padding:14,margin:'18px 0',gridTemplateColumns:'minmax(0,1fr)'}}>
  <h3 style={{margin:'0 0 8px'}}>Create 3D BIM from your drawing</h3>
  <p role="status" aria-live="polite" style={{padding:16,border:'3px solid #1774a8',borderRadius:8,background:'#eaf4fb',color:'#173a55',fontSize:'1.2rem',fontWeight:800}}>⬇ {nextHint}</p>
  <p className="muted">Follow the arrow. Complete one action at a time.</p>
  <details style={{padding:'12px',margin:'10px 0',border:'1px solid #b7c9d7',borderRadius:8,background:'#f6f9fc',color:'#172c40'}}>
   <summary style={{fontWeight:700,cursor:'pointer'}}>What drawings and measurements do I need? (BIM checklist)</summary>
   <p><strong>1. Floor plans:</strong> Upload a clear, dimensioned plan for every floor you want in the 3D model. Each floor needs its full external outline, wall positions, openings and horizontal and vertical dimensions. Draw a separate box around each plan.</p>
   <p><strong>2. Elevations or sections:</strong> Include a dimensioned elevation or section showing floor-to-floor heights, wall/eaves heights, ridge height and roof form. These establish the third dimension (height); a floor plan alone cannot establish it.</p>
   <p><strong>3. Construction information:</strong> Check wall thickness, floor/slab thickness, roof build-up and door/window sizes against the drawings or specifications. Do not assume missing sizes.</p>
   <p><strong>4. Position and accuracy:</strong> Confirm drawing revision, two independent dimensions to calibrate the plan, and alignment between floors. Trace floor boundaries, walls and roof faces, then check each element before adding it.</p>
   <p><strong>Inside each drawn box:</strong> ONE complete floor plan, every outside corner and extension, plus legible X and Y dimension lines and their numbers. <strong>Outside:</strong> other plans, elevations, title blocks and unrelated notes. Draw additional boxes for other views.</p>
   <p><strong>What happens next?</strong> Load drawing → draw box → check two dimensions → trace parts → enter verified heights → approve parts → Generate 3D BIM (IFC4).</p>
   <p><strong>Important:</strong> This tool currently builds IFC4 from manually verified and traced elements. It does not automatically read all construction details or produce a complete BIM model from a single box. Missing information must be supplied and checked.</p>
  </details>
  <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'end'}}>
   <label>Drawing<select value={docId} onChange={e=>{setDocId(e.target.value);setPage(1);setSheet(null);setPreview(null)}}>{docs.map(d=><option key={d.id} value={d.id}>{d.document_no||d.title||d.file_path}</option>)}</select></label>
   <label>PDF page<input type="number" min="1" max={pages} value={page} onChange={e=>{setPage(Math.max(1,Number(e.target.value)||1));setSheet(null);setPreview(null)}}/></label>
   <button type="button" disabled={working||!docId} onClick={()=>loadSheet()}>{working?'Loading…':'1. Load drawing'}</button>
  </div>
  {sheet&&<div><strong>⬇ 2. Draw a box around ONE complete floor plan</strong>
   <p style={{margin:'8px 0'}}><strong>Include inside the box:</strong> all external walls and corners of that floor, any extensions or projections, and at least one readable horizontal and one readable vertical dimension line (with their numbers). Leave a little space around the drawing so nothing is cut off.</p>
   <p className="muted" style={{margin:'6px 0'}}><strong>Leave outside:</strong> other floor plans, elevations, sections, title blocks and unrelated notes. Select those separately if needed. For a new build, use the proposed floor plan; for an extension, select existing and proposed plans separately.</p>
   <p className="muted" style={{margin:'6px 0'}}><strong>Important:</strong> the box only selects the drawing. It does not automatically recognise walls or generate a complete 3D building. You will still confirm scale, trace the outline and enter heights from a section or elevation.</p>
   <div style={{position:'relative',maxWidth:1000}}><div ref={sheetNode} onPointerDown={e=>{if(e.pointerType==='mouse'&&e.button!==0)return;const p=pos(e,e.currentTarget);startRef.current=p;setDrawnBox(null);setDragBox({x:p.x,y:p.y,w:0,h:0});try{e.currentTarget.setPointerCapture(e.pointerId)}catch{}}}
     onPointerMove={e=>{if(!startRef.current)return;const a=startRef.current,b=pos(e,e.currentTarget);setDragBox({x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.abs(a.x-b.x),h:Math.abs(a.y-b.y)})}} onPointerUp={pointerEnd} onPointerCancel={()=>{startRef.current=null;setDragBox(null)}} style={{position:'relative',cursor:'crosshair',touchAction:'none',maxWidth:1000,
       border:'1px solid #8190a5',margin:'8px 0'}}>
    <img src={sheet} alt="Original drawing sheet" draggable={false} style={{display:'block',width:'100%',height:'auto'}}/>
    {!dragBox&&!drawnBox&&<div style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',zIndex:2,background:'rgba(255,255,255,.95)',color:'#173a55',padding:'9px 12px',border:'3px solid #1976a3',borderRadius:8,fontWeight:800,pointerEvents:'none',maxWidth:'min(340px,80%)'}}>⬇ DRAW HERE: Box the whole floor plan and its dimensions</div>}
    {(dragBox||drawnBox)&&<div style={{position:'absolute',left:(dragBox||drawnBox).x*100+'%',top:(dragBox||drawnBox).y*100+'%',
      width:(dragBox||drawnBox).w*100+'%',height:(dragBox||drawnBox).h*100+'%',border:'2px solid #b22234',background:'rgba(190,20,40,.10)',pointerEvents:'none'}}/>}
   </div></div>
   <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
    <label>View type<select value={viewKind} onChange={e=>setViewKind(e.target.value)}>
     {VIEW_KINDS.map(k=><option key={k.id} value={k.id}>{k.label}</option>)}</select></label>
    <label>View label<input value={viewName} onChange={e=>setViewName(e.target.value)} placeholder="e.g. Plot 18 ground floor"/></label>
    {drawnBox&&<strong style={{color:'#176c41'}}>⬇ Box ready. Press here</strong>}<button type="button" disabled={!drawnBox||working} onClick={saveView}>{working?'Saving…':'➡ Use this box'}</button>
   </div>
  </div>}
  <details><summary>Previously saved drawing views ({views.length})</summary>
   {views.length===0&&<p>Start by drawing a rectangle around a ground floor plan, first floor plan or elevation above.</p>}
   {views.map(v=><div key={v.id} style={{padding:6,display:'flex',gap:8,flexWrap:'wrap',alignItems:'center',borderBottom:'1px solid #cdd5e2'}}>
     <button type="button" className={selected===v.id?'selected':'outline'} disabled={working} onClick={()=>chooseView(v.id)}>{v.name} · p{v.page}</button>
     <small>{VIEW_KINDS.find(k=>k.id===v.kind)?.label} · {viewCalibrationStatus(v,docs.find(d=>d.id===v.document_id),calibrations[v.id]).ok?'Two scales checked':'Scale not verified'}</small>
     <label style={{display:'flex',gap:5,alignItems:'center'}}><input type="checkbox" disabled={working} checked={v.common_origin_verified===true} onChange={e=>setAligned(v,e.target.checked)}/> Common model origin verified</label>
    </div>)}
  </details>
  {view&&<div>
   <strong>3. Check dimensions and outline: {view.name}</strong>
   {!preview&&<p>Load the matching drawing and select this registered view again to see its isolated crop.</p>}
   {preview&&<>
    <div style={{display:'flex',gap:10,alignItems:'end',flexWrap:'wrap'}}>
     <label>Tool<select value={mode} onChange={e=>{const next=e.target.value;setMode(next);setPoints([]);setBimType(next==='opening'?'window':next==='roof'?'roof':next==='wall'?'wall':'slab')}}>
      <option value="scale">Select dimension endpoints</option>
      <option value="slab">Trace slab/floor perimeter</option>
      <option value="wall">Trace wall centre-line</option>
      <option value="roof">Trace one roof face</option>
      <option value="opening">Add door / window to checked wall</option>
     </select></label>
     <button type="button" className="outline" onClick={()=>setPoints(x=>x.slice(0,-1))}>Undo last point</button>
     <button type="button" className="outline" onClick={()=>setPoints([])}>Clear trace</button>
    </div>
    <div style={{position:'relative',maxWidth:1000,border:'1px solid #8190a5',margin:'8px 0'}}>
     <div style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',zIndex:2,pointerEvents:'none',background:'rgba(255,255,255,.95)',border:'2px solid #1976a3',borderRadius:8,padding:'8px 10px',maxWidth:'min(340px,85%)',fontWeight:800,color:'#173a55'}}>⬇ {mode==='scale'?(calibration?.status==='first-dimension'?'CLICK BOTH ENDS OF A VERTICAL DIMENSION':'CLICK BOTH ENDS OF A HORIZONTAL DIMENSION'):mode==='slab'?'CLICK EACH OUTSIDE CORNER OF THE FLOOR':mode==='wall'?'CLICK ALONG THE WALL CENTRE-LINE':mode==='roof'?'CLICK EACH CORNER OF ONE ROOF FACE':'SELECT A VERIFIED WALL BELOW'}</div>
     <img src={preview} alt={'Isolated '+view.name+' drawing view; click vertices'}
      draggable={false} onClick={viewClick} style={{display:'block',width:'100%',cursor:'crosshair',touchAction:'manipulation'}}/>
     <Overlay points={points} closed={mode==='slab'||mode==='roof'}/>
    </div>
    <p role="status">{points.length} selected point(s) · {scaleCheck.ok?
     'X and Y scale verified — now trace the floor corners for area (m²)':
     (calibration?.status==='first-dimension'?'First dimension saved; select a second independent line':
      'Unverified view scale')}.</p>
    {mode==='scale'?<div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'end'}}>
      <p style={{flexBasis:'100%'}}><strong>{scaleCheck.ok?'Step 3: Z heights':calibration?.status==='first-dimension'?'Step 2: Y-axis (vertical)':'Step 1: X-axis (horizontal)'}</strong> — {scaleCheck.ok?'Use a dimensioned elevation or section to verify wall, eaves and ridge heights before saving 3D elements.':calibration?.status==='first-dimension'?'Select the two ends of a vertical printed dimension and enter its true length.':'Select the two ends of a horizontal printed dimension and enter its true length.'}</p>
     <label>{calibration?.status==='first-dimension'?'Y-axis printed dimension (metres)':'X-axis printed dimension (metres)'}<input type="number" min="0.001" step="0.001" value={metres} onChange={e=>setMetres(e.target.value)} placeholder="e.g. 5.006"/></label>
     <button type="button" disabled={working||points.length!==2} onClick={storeScale}>{calibration?.status==='first-dimension'?'Verify Y-axis dimension':scaleCheck.ok?'Scale verified':'Save X-axis dimension'}</button>
    </div>:<>
     {mode==='slab'&&<p role="status"><strong>Step 3 — Measure floor area:</strong> Click the floor perimeter corners in order (four corners for a rectangular floor). The area updates below as you click. Use Undo if needed. Confirm whether the boundary is internal or external before saving. Then proceed to heights (Z) from the elevations or sections.</p>}
      <p><strong>{mode==='opening'?'Host wall opening':mode==='roof'?'Roof face trace':'Deterministic trace'}:</strong> {mode==='opening'?'Choose a checked host wall and enter the opening dimensions.':measures?.ok?(mode==='slab'?'Measured floor area: ':'')+format(measures.quantity)+' '+measures.unit:'Click at least three floor corners on a calibrated drawing to calculate area.'}</p>
     <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
      <label>Building part<input value={bimName} onChange={e=>setBimName(e.target.value)} placeholder="e.g. Plot 18 ground floor slab"/></label>
      <label>Type<select value={bimType} onChange={e=>setBimType(e.target.value)}>{mode==='opening'?<><option value="window">IfcWindow</option><option value="door">IfcDoor</option></>:mode==='roof'?<option value="roof">IfcRoof</option>:mode==='wall'?<option value="wall">IfcWall</option>:<option value="slab">IfcSlab</option>}</select></label>
      {mode!=='opening'&&<>
       <label>{mode==='roof'?'Eaves level (m)':'Base level (m)'}<input type="number" step=".001" value={base} onChange={e=>setBase(e.target.value)}/></label>
       <label>How thick is this {mode==='roof'?'roof':mode==='wall'?'wall':'floor/slab'}? (mm)<input type="number" min="1" step="1" value={thickness===''?'':Math.round(Number(thickness)*1000)} onChange={e=>setThickness(e.target.value===''?'':String(Number(e.target.value)/1000))} placeholder="Enter thickness from drawing in mm"/></label>
       <small style={{flexBasis:'100%'}}>Use the construction drawing or specification. Do not guess the thickness. Millimetres are converted automatically for BIM.</small>
       <label style={{display:'none'}}>Common origin X (m)<input type="number" step=".001" value={xOrigin} onChange={e=>setXOrigin(e.target.value)}/></label>
       <label style={{display:'none'}}>Common origin Y (m)<input type="number" step=".001" value={yOrigin} onChange={e=>setYOrigin(e.target.value)}/></label>
      </>}
      {(mode==='wall'||mode==='opening')&&<label>{mode==='opening'?'Opening height (m)':'Wall height (m)'}<input type="number" step=".001" value={height} onChange={e=>setHeight(e.target.value)}/></label>}
      {mode==='roof'&&<>
       <label>High/ridge level (m)<input type="number" step=".001" value={roofHigh} onChange={e=>setRoofHigh(e.target.value)} placeholder="Verified from section"/></label>
       <label>Roof rises along<select value={slopeAxis} onChange={e=>setSlopeAxis(e.target.value)}><option value="x">Project X axis</option><option value="y">Project Y axis</option></select></label>
      </>}
      {mode==='opening'&&<>
       <label>Host wall segment<select value={openingHost} onChange={e=>setOpeningHost(e.target.value)}><option value="">Choose verified wall</option>{hostChoices.map(w=><option key={w.id} value={w.id}>{w.name} (length checked)</option>)}</select></label>
       <label>Start offset along wall (m)<input type="number" step=".001" value={openingOffset} onChange={e=>setOpeningOffset(e.target.value)} /></label>
       <label>Opening width (m)<input type="number" step=".001" value={openingWidth} onChange={e=>setOpeningWidth(e.target.value)} /></label>
       <label>Sill above host wall base (m)<input type="number" step=".001" value={openingSill} onChange={e=>setOpeningSill(e.target.value)} /></label>
      </>}
      {mode==='slab'&&<label style={{display:'none'}}>Known floor area for comparison (m², optional)<input type="number" step=".01" value={expectedArea} onChange={e=>setExpectedArea(e.target.value)} placeholder="e.g. 31.88"/></label>}
     </div>
     <p className="muted">Enter heights from the elevations or sections. Do not guess missing dimensions.</p>
      <label>Drawing or section reference<input value={sourceNote} onChange={e=>setSourceNote(e.target.value)} placeholder="Drawing C3, 5006 mm by 6368 mm, Section A-A"/></label>
     <label><input type="checkbox" checked={approved} onChange={e=>setApproved(e.target.checked)}/> I have checked the dimensions, revision, alignment, source section and element position</label>
     <button type="button" disabled={working||!scaleCheck.ok||!approved} onClick={addElement}>Add to 3D model</button>
    </>}
   </>}
  </div>}
  <div>
   <strong>4. Your 3D BIM · {bim.models.length} verified part(s)</strong>
   <p className="muted">Checked floors, walls, roof faces and door/window openings only. Any unmodelled elements, structural details and services remain outstanding. Verify the whole model in a dedicated IFC/BIM viewer.</p>
   {elements.map(e=><p key={e.id}>{e.name} — {e.type} · source {views.find(v=>v.id===e.view_id)?.name||'missing'}</p>)}
   {features.map(f=><p key={f.id}>{f.name} — {f.type} · verified dimensions recorded</p>)}
   {bim.issues.length>0&&<p role="alert">{bim.issues.slice(0,6).map(x=>x.label+': '+x.reason).join(' | ')}</p>}
   {bim.models.length>0&&<BimScene3D elements={bim.models}/>}
   <button type="button" onClick={exportIfc} disabled={working}>Generate 3D BIM (IFC4)</button>
   {(!bim.models.length||bim.issues.length>0)&&<p role="status">{!bim.models.length?'No verified model elements yet. Save a calibrated and checked slab or wall first. ':''}{bim.issues.length?bim.issues.length+' BIM issue(s) need resolving before export.':''}</p>}
  </div>
  {message&&<p role="status" className="notice">{message}</p>}
 </div>;
}
