import React,{useEffect,useRef,useState} from 'react';
import * as pdfjs from 'pdfjs-dist';
import {VIEW_KINDS,validateDrawingView,cropPixels,saveViewScaleCheck,
  viewCalibrationStatus,viewQuantity,prepareViewBim} from './drawingViewModel.mjs';
import {createIfc4Model} from './ifcExport.mjs';

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
   <path d={d} fill={closed?'rgba(2,122,183,.15)':'none'} stroke="#0077be" strokeWidth=".45" strokeDasharray=".65 .4"/>
   {points.map((p,i)=><circle key={i} cx={100*p.x} cy={100*p.y} r=".65" fill="#d82342" stroke="#fff" strokeWidth=".2"/>)}
 </svg>;
}
export default function DrawingViewWorkbench({db,project,docs=[],estimate={},onCommit=async()=>{}}){
 const views=estimate.drawing_views||[],calibrations=estimate.view_calibrations||{};
 const elements=estimate.view_bim_elements||[];
 const [docId,setDocId]=useState(''),[page,setPage]=useState(1);
 const [sheet,setSheet]=useState(null),[sheetDims,setSheetDims]=useState(null),[pages,setPages]=useState(1);
 const [viewName,setViewName]=useState(''),[viewKind,setViewKind]=useState('ground-floor-plan');
 const [drawnBox,setDrawnBox]=useState(null),[selected,setSelected]=useState('');
 const [preview,setPreview]=useState(null),[previewDims,setPreviewDims]=useState(null);
 const [mode,setMode]=useState('scale'),[points,setPoints]=useState([]),[metres,setMetres]=useState('');
 const [bimName,setBimName]=useState(''),[bimType,setBimType]=useState('slab');
 const [base,setBase]=useState(''),[thickness,setThickness]=useState(''),[height,setHeight]=useState('');
 const [xOrigin,setXOrigin]=useState(''),[yOrigin,setYOrigin]=useState('');
 const [sourceNote,setSourceNote]=useState(''),[expectedArea,setExpectedArea]=useState('');
 const [approved,setApproved]=useState(false),[working,setWorking]=useState(false);
 const [message,setMessage]=useState(''),startRef=useRef(null),sheetNode=useRef(null);
 const currentDoc=docs.find(d=>d.id===docId);
 const view=views.find(v=>v.id===selected);
 const viewDoc=docs.find(d=>d.id===view?.document_id);
 const calibration=calibrations[view?.id];
 const scaleCheck=viewCalibrationStatus(view,viewDoc,calibration);
 const measures=view&&scaleCheck.ok&&points.length>=2?
   viewQuantity({view,document:viewDoc,calibration,points,kind:mode==='wall'?'length':'area'}):null;
 const bim=prepareViewBim({views,docs,calibrations,elements});
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
    const bitmap=await createImageBitmap(await res.blob());
    const scale=Math.min(1,2400/Math.max(bitmap.width,bitmap.height));
    canvas.width=Math.max(1,Math.round(bitmap.width*scale));
    canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
    bitmap.close?.();
   }
   setSheet(canvas.toDataURL('image/jpeg',.87));
   setSheetDims([canvas.width,canvas.height]);setPages(count);setDocId(chosenDoc);setPage(chosenPage);
   setDrawnBox(null);setMessage('Drag around ONE plan, elevation or section, excluding other views and the title block.');
  }catch(e){setMessage('Drawing preview failed: '+String(e?.message||e))}
  finally{setWorking(false)}
 }
 function pointerEnd(e){
  if(!startRef.current||!sheetNode.current)return;
  const a=startRef.current,b=pos(e,sheetNode.current);startRef.current=null;
  const bounds={x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.abs(a.x-b.x),h:Math.abs(a.y-b.y)};
  if(bounds.w<.03||bounds.h<.03)return setMessage('Draw a larger rectangle around exactly one view.');
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
  try{await saveUpdate('drawing_views',[...views,registered]);setSelected(registered.id);
    setDrawnBox(null);setMessage('View registered. Select it and check two independent printed dimensions.')}
  catch{}
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
  if(!preview||!previewDims||!view)return;
  const p=pos(e,e.currentTarget);
  setPoints(current=>mode==='scale'&&current.length>=2?[p]:[...current,p]);
 }
 async function storeScale(){
  if(!view||!viewDoc||!previewDims)return setMessage('Select a registered drawing view.');
  if(points.length!==2)return setMessage('Click both ends of a printed dimension INSIDE the isolated view.');
  const result=saveViewScaleCheck({view,document:viewDoc,previous:calibration,
   dimensions:previewDims,points,metres:n(metres)});
  if(!result.ok)return setMessage(result.error);
  try{await saveUpdate('view_calibrations',{...calibrations,[view.id]:result.value});
   setPoints([]);setMetres('');
   setMessage(result.complete?'Two independent printed dimensions agree. The view is ready for checked take-off.':
     'First dimension saved. Select a DIFFERENT printed dimension for the second scale check.');
  }catch{}
 }
 async function addElement(){
  if(!view||!scaleCheck.ok)return setMessage(scaleCheck.error||'First verify both dimensions.');
  if(!approved)return setMessage('A competent reviewer must confirm the geometry and evidence.');
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
 function exportIfc(){
  if(bim.issues.length)return setMessage('IFC export held: '+bim.issues.map(x=>x.reason).join('; '));
  try{
   const text=createIfc4Model({projectName:project.name||'UKPD partial BIM',elements:bim.models});
   const url=URL.createObjectURL(new Blob([text],{type:'application/x-step'}));
   const link=document.createElement('a');link.href=url;link.download='UKPD-checked-elements.ifc';link.click();
   setTimeout(()=>URL.revokeObjectURL(url),2000);
   setMessage('IFC4 file created from '+bim.models.length+' independently checked wall/slab elements.');
  }catch(e){setMessage('IFC export failed: '+String(e?.message||e))}
 }
 async function setAligned(v,checked){
  if(!window.confirm(checked?'Confirm view origins and floor levels have been aligned to a common construction datum using checked drawings?':'Remove multi-view alignment confirmation?'))return;
  try{await saveUpdate('drawing_views',views.map(x=>x.id===v.id?{...x,common_origin_verified:checked}:x))}
  catch{}
 }
 return <div className="estimateForm" style={{border:'2px solid #577997',borderRadius:12,
   padding:14,margin:'18px 0',gridTemplateColumns:'minmax(0,1fr)'}}>
  <h3 style={{margin:'0 0 8px'}}>Drawing-view workbench — measured take-off + IFC4 BIM</h3>
  <p className="muted">For A1 sheets with plans, elevations and sections at different scales. Register each view independently, check two printed dimensions, then draw the actual work outline. No whole-sheet scale, guessed geometry or assumed wall heights.</p>
  <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'end'}}>
   <label>Drawing<select value={docId} onChange={e=>{setDocId(e.target.value);setPage(1);setSheet(null);setPreview(null)}}>{docs.map(d=><option key={d.id} value={d.id}>{d.document_no||d.title||d.file_path}</option>)}</select></label>
   <label>PDF page<input type="number" min="1" max={pages} value={page} onChange={e=>{setPage(Math.max(1,Number(e.target.value)||1));setSheet(null);setPreview(null)}}/></label>
   <button type="button" disabled={working||!docId} onClick={()=>loadSheet()}>Load drawing</button>
  </div>
  {sheet&&<div><strong>1. Draw a box around one separate drawing view</strong>
   <div ref={sheetNode} onPointerDown={e=>{startRef.current=pos(e,e.currentTarget);e.currentTarget.setPointerCapture(e.pointerId)}}
     onPointerUp={pointerEnd} style={{position:'relative',cursor:'crosshair',touchAction:'none',maxWidth:1000,
       border:'1px solid #8190a5',margin:'8px 0'}}>
    <img src={sheet} alt="Original drawing sheet" draggable={false} style={{display:'block',width:'100%',height:'auto'}}/>
    {drawnBox&&<div style={{position:'absolute',left:drawnBox.x*100+'%',top:drawnBox.y*100+'%',
      width:drawnBox.w*100+'%',height:drawnBox.h*100+'%',border:'2px solid #b22234',background:'rgba(190,20,40,.10)',pointerEvents:'none'}}/>}
   </div>
   <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
    <label>View type<select value={viewKind} onChange={e=>setViewKind(e.target.value)}>
     {VIEW_KINDS.map(k=><option key={k.id} value={k.id}>{k.label}</option>)}</select></label>
    <label>View label<input value={viewName} onChange={e=>setViewName(e.target.value)} placeholder="e.g. Plot 18 ground floor"/></label>
    <button type="button" disabled={!drawnBox||working} onClick={saveView}>Save drawing view</button>
   </div>
  </div>}
  <div><strong>2. Registered views ({views.length})</strong>
   {views.length===0&&<p>Start by drawing a rectangle around a ground floor plan, first floor plan or elevation above.</p>}
   {views.map(v=><div key={v.id} style={{padding:6,display:'flex',gap:8,flexWrap:'wrap',alignItems:'center',borderBottom:'1px solid #cdd5e2'}}>
     <button type="button" className={selected===v.id?'selected':'outline'} disabled={working} onClick={()=>chooseView(v.id)}>{v.name} · p{v.page}</button>
     <small>{VIEW_KINDS.find(k=>k.id===v.kind)?.label} · {viewCalibrationStatus(v,docs.find(d=>d.id===v.document_id),calibrations[v.id]).ok?'Two scales checked':'Scale not verified'}</small>
     <label style={{display:'flex',gap:5,alignItems:'center'}}><input type="checkbox" disabled={working} checked={v.common_origin_verified===true} onChange={e=>setAligned(v,e.target.checked)}/> Common model origin verified</label>
    </div>)}
  </div>
  {view&&<div>
   <strong>3. Calibrate or trace: {view.name}</strong>
   {!preview&&<p>Load the matching drawing and select this registered view again to see its isolated crop.</p>}
   {preview&&<>
    <div style={{display:'flex',gap:10,alignItems:'end',flexWrap:'wrap'}}>
     <label>Tool<select value={mode} onChange={e=>{setMode(e.target.value);setPoints([])}}>
      <option value="scale">Select dimension endpoints</option>
      <option value="slab">Trace slab/floor perimeter</option>
      <option value="wall">Trace wall centre-line</option>
     </select></label>
     <button type="button" className="outline" onClick={()=>setPoints(x=>x.slice(0,-1))}>Undo last point</button>
     <button type="button" className="outline" onClick={()=>setPoints([])}>Clear trace</button>
    </div>
    <div style={{position:'relative',maxWidth:1000,border:'1px solid #8190a5',margin:'8px 0'}}>
     <img src={preview} alt={'Isolated '+view.name+' drawing view; click vertices'}
      draggable={false} onClick={viewClick} style={{display:'block',width:'100%',cursor:'crosshair',touchAction:'manipulation'}}/>
     <Overlay points={points} closed={mode==='slab'}/>
    </div>
    <p role="status">{points.length} selected point(s) · {scaleCheck.ok?
     'Two independent scale dimensions verified':
     (calibration?.status==='first-dimension'?'First dimension saved; select a second independent line':
      'Unverified view scale')}.</p>
    {mode==='scale'?<div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'end'}}>
     <label>Printed dimension (metres)<input type="number" min="0.001" step="0.001" value={metres} onChange={e=>setMetres(e.target.value)} placeholder="e.g. 5.006"/></label>
     <button type="button" disabled={working||points.length!==2} onClick={storeScale}>{calibration?'Verify second dimension':'Save first dimension'}</button>
    </div>:<>
     <p><strong>Deterministic trace:</strong> {measures?.ok?format(measures.quantity)+' '+measures.unit:'Not yet measurable. Complete the trace on a two-dimension-calibrated view.'}</p>
     <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
      <label>Element<input value={bimName} onChange={e=>setBimName(e.target.value)} placeholder="e.g. Plot 18 ground floor slab"/></label>
      <label>IFC class<select value={bimType} onChange={e=>setBimType(e.target.value)}><option value="slab">IfcSlab</option><option value="wall">IfcWall</option></select></label>
      <label>Base level (m)<input type="number" step=".001" value={base} onChange={e=>setBase(e.target.value)}/></label>
      <label>Thickness (m)<input type="number" step=".001" value={thickness} onChange={e=>setThickness(e.target.value)}/></label>
      {mode==='wall'&&<label>Wall height (m)<input type="number" step=".001" value={height} onChange={e=>setHeight(e.target.value)}/></label>}
      <label>Common origin X (m)<input type="number" step=".001" value={xOrigin} onChange={e=>setXOrigin(e.target.value)}/></label>
      <label>Common origin Y (m)<input type="number" step=".001" value={yOrigin} onChange={e=>setYOrigin(e.target.value)}/></label>
      {mode==='slab'&&<label>Known floor area for comparison (m², optional)<input type="number" step=".01" value={expectedArea} onChange={e=>setExpectedArea(e.target.value)} placeholder="e.g. 31.88"/></label>}
     </div>
     <label>Dimension source / section reference<input value={sourceNote} onChange={e=>setSourceNote(e.target.value)} placeholder="Drawing C3, 5006 mm by 6368 mm, Section A-A"/></label>
     <label><input type="checkbox" checked={approved} onChange={e=>setApproved(e.target.checked)}/> I have checked the trace, drawing revision, scale, level, thickness and construction source</label>
     <button type="button" disabled={working||!scaleCheck.ok||!approved} onClick={addElement}>Save checked element to BIM</button>
    </>}
   </>}
  </div>}
  <div>
   <strong>4. IFC4 BIM model · {bim.models.length} generated element(s)</strong>
   <p className="muted">Only checked geometry is included. All included views must have a reviewed common coordinate origin. Roof form, openings, framing, foundations and services require their own verified geometry and specifications.</p>
   {elements.map(e=><p key={e.id}>{e.name} — {e.type} · source {views.find(v=>v.id===e.view_id)?.name||'missing'} · {e.checked?'QS checked':'Unverified'}</p>)}
   {bim.issues.length>0&&<p role="alert">{bim.issues.slice(0,6).map(x=>x.label+': '+x.reason).join(' | ')}</p>}
   <button type="button" onClick={exportIfc} disabled={working||bim.issues.length>0||!bim.models.length}>Generate IFC4 3D BIM file</button>
  </div>
  {message&&<p role="status" className="notice">{message}</p>}
 </div>;
}
