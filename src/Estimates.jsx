import React,{useEffect,useRef,useState} from 'react';
import {Document,Packer,Paragraph,TextRun,Table,TableRow,TableCell,HeadingLevel,ImageRun} from 'docx';
import * as pdfjs from 'pdfjs-dist';
import * as XLSX from 'xlsx';
import './estimates.css';
import {scaleSheetRegister,calibrationStatus as storedCalibrationStatus,missingCalibration as pagesAwaitingCalibration} from './calibration.mjs';
import {clampZoom,normalizedDrawingPoint,anchoredScroll,pinchGeometry} from './drawingZoom.mjs';
import {resolveCalibrationClick} from './calibrationInteraction.mjs';
import {prepareMasterRateImport,rateMatchKey} from './rateImport.mjs';
import {measuredQuantity,findUniqueRate} from './takeoffMeasurement.mjs';
import {applySavedRate,applySavedRates,rateLibraryCoverage,rateComponents} from './ratePricing.mjs';
import {measureAutoPage} from './autoMeasurement.mjs';
import {summariseAiCoverage} from './aiCoverage.mjs';
import {duplicateAutoCandidate} from './aiDuplicateGuard.mjs';
import {stageAiTakeoff,decideAiSuggestion} from './aiTakeoffQueue.mjs';
pdfjs.GlobalWorkerOptions.workerSrc=new URL('pdfjs-dist/build/pdf.worker.min.mjs',import.meta.url).toString();
const fresh={items:[],highlights:[],builder_id:'',takeoff_review_status:'Draft',takeoff_reviewer:'',takeoff_reviewed_at:'',measurement_standard:'NRM2',drawing_stages:{},supplier_price_date:'',supplier_price_source:'',global_adjustment:0,overheads:15,profit:10,vat:20,pc_sums:[],provisional_sums:[],dayworks:[],contingency_mode:'percent',contingency_value:0,quote_intro:'We are pleased to provide our quotation for the works described below.',quote_scope:'',quote_validity:'30 days',quote_payment_terms:'Payment schedule to be agreed before commencement.',quote_exclusions:'Items not expressly included are excluded.',quote_terms:'Subject to agreed contract terms.',quote_ref:'',quote_revisions:[]};
const initialItem={ref_no:'',work_section:'Measured Works',description:'',trade:'General',drawing:'',quantity:0,unit:'m²',material_rate:0,plant_rate:0,labour_hours:0,labour_rate:0,supplier:'',price_url:'',status:'Needs verification'};
const money=n=>'£'+(Number(n)||0).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2});
const num=v=>Number(v)||0;
const svgTrace=(points,closed)=>Array.isArray(points)&&points.length?points.map((p,i)=>(i?'L':'M')+(Number(p.x)*100).toFixed(3)+' '+(Number(p.y)*100).toFixed(3)).join(' ')+(closed?' Z':''):'';
const svgPolygon=h=>[h.points,...(h.openings||[])].map(poly=>svgTrace(poly,true)).join(' ');
const perLine=i=>num(i.quantity)*(num(i.material_rate)+num(i.plant_rate)+num(i.labour_hours)*num(i.labour_rate));
const BUILDER_FIELDS=['name','contact_name','address','phone','email','vat_number','company_number','footer','logo_path'];
const emptyBuilderForm={name:'',contact_name:'',address:'',phone:'',email:'',vat_number:'',company_number:'',footer:'',logo_path:''};
export default function Estimates({db,project,docs=[]}){
 const [estimate,setEstimate]=useState({...fresh,...project.estimate_data,items:project.estimate_data?.items||[],highlights:project.estimate_data?.highlights||[]});
 const [builders,setBuilders]=useState([]),[builderForm,setBuilderForm]=useState(null),[builderSaving,setBuilderSaving]=useState(false),[logoUploading,setLogoUploading]=useState(false);const [rateLibrary,setRateLibrary]=useState([]);
 const [rateImportBusy,setRateImportBusy]=useState(false),[rateImportStatus,setRateImportStatus]=useState(''),[rateImportReview,setRateImportReview]=useState([]);
 const [editingBoq,setEditingBoq]=useState(null);const [takeoffNotes,setTakeoffNotes]=useState('');const [item,setItem]=useState(initialItem),[pcDraft,setPcDraft]=useState({description:'',amount:'',attendance_percent:'0'}),[provisionalDraft,setProvisionalDraft]=useState({description:'',amount:'',defined:false,include:true}),[dayworkDraft,setDayworkDraft]=useState({description:'',labour:0,materials:0,plant:0,markup:0}),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const [aiBusy,setAiBusy]=useState(false),[aiReview,setAiReview]=useState(null);
 const [aiProgress,setAiProgress]=useState({processed:0,total:0,stage:'idle'}); const [drawing,setDrawing]=useState(''),[page,setPage]=useState(1),[pageCount,setPageCount]=useState(1),[image,setImage]=useState(''),[dimensions,setDimensions]=useState([0,0]);
 const [calibrate,setCalibrate]=useState(false),[reference,setReference]=useState(null),[calibrationMetres,setCalibrationMetres]=useState(''),[calibrationFirst,setCalibrationFirst]=useState(null),[drag,setDrag]=useState(null),[hover,setHover]=useState(null),[markName,setMarkName]=useState('New work'),[stage,setStage]=useState('Proposed');
 const [markMode,setMarkMode]=useState('area'),[markDepth,setMarkDepth]=useState(''),[firstMeasurePoint,setFirstMeasurePoint]=useState(null);
 const firstMeasurePointRef=useRef(null);
 const [calibrationWizard,setCalibrationWizard]=useState(false),[calibrationPages,setCalibrationPages]=useState([]),[calibrationLoading,setCalibrationLoading]=useState(false),[calibrationSaving,setCalibrationSaving]=useState(false);
 const canvas=useRef(null),overlay=useRef(null),drawingScroll=useRef(null);
 // Physical PDF bitmap resolution can change on zoom; logical page dimensions must not.
 const pdfView=useRef(null),pdfRender=useRef(null);
 // Mouse/pointer events can be batched: keep the press and first calibration tap synchronously.
 const pressedPoint=useRef(null),firstCalibrationPoint=useRef(null);
 const [zoom,setZoom]=useState(1),[panMode,setPanMode]=useState(false);
 const zoomRef=useRef(1),pointerPositions=useRef(new Map()),pinchRef=useRef(null),panRef=useRef(null),gestureRef=useRef(false),scrollAnimation=useRef(null);
 useEffect(()=>{zoomRef.current=1;setZoom(1);setPanMode(false);pointerPositions.current.clear();pinchRef.current=null;panRef.current=null;gestureRef.current=false;pressedPoint.current=null;firstCalibrationPoint.current=null;firstMeasurePointRef.current=null;setFirstMeasurePoint(null);setDrag(null);setHover(null);return()=>{if(scrollAnimation.current)cancelAnimationFrame(scrollAnimation.current)}},[drawing,page]);
 const fileDocs=docs.filter(d=>d.status!=='Superseded'&&/\.(pdf|png|jpg|jpeg)$/i.test(d.document_no||d.title||d.file_path||''));
 useEffect(()=>{db.from('estimate_rate_library').select('*').order('description').limit(5000).then(({data,error})=>{if(!error)setRateLibrary(data||[])});},[db]);
 useEffect(()=>{db.from('estimate_builders').select('*').order('name').then(({data,error})=>{if(!error)setBuilders(data||[])});},[db]);
 // Fetch a selected sheet only when the drawing or page changes, never on each zoom.
 useEffect(()=>{
   let cancelled=false,doc=null;
   pdfView.current=null;
   setImage('');setDimensions([0,0]);
   if(!drawing)return;
   async function load(){
     const d=fileDocs.find(x=>x.id===drawing);if(!d)return;
     const {data,error}=await db.storage.from('project-files').createSignedUrl(d.file_path,1200);
     if(cancelled)return;
     if(error||!data?.signedUrl){setNotice(error?.message||'Drawing could not be opened');return}
     try{
       const url=data.signedUrl,ext=(d.document_no||d.title||d.file_path||'').split('.').pop().toLowerCase();
       if(ext!=='pdf'){setImage(url);setPageCount(1);return}
       const loading=pdfjs.getDocument({url});
       doc=await loading.promise;
       if(cancelled){await doc.destroy();doc=null;return}
       const pg=await doc.getPage(Math.min(page,doc.numPages));
       if(cancelled)return;
       const bounds=pg.getViewport({scale:1.4});
       pdfView.current={doc,pg,drawing,page};
       setPageCount(doc.numPages);
       setDimensions([bounds.width,bounds.height]);
     }catch(e){if(!cancelled)setNotice('Drawing preview failed: '+(e?.message||e))}
   }
   load();
   return()=>{cancelled=true;pdfView.current=null;
     if(pdfRender.current)pdfRender.current.cancel();
     if(doc){doc.destroy().catch(()=>{});doc=null}
   };
 },[drawing,page,docs,db]);
 // PDF pages contain vectors. Re-render at an appropriate backing resolution at every
 // zoom level instead of stretching a fixed 1.4x preview into blurry enlarged pixels.
 useEffect(()=>{
   const sheet=pdfView.current;
   if(image||!sheet||sheet.drawing!==drawing||sheet.page!==page||!dimensions[0]||!dimensions[1])return;
   let disposed=false;
   const timer=window.setTimeout(async()=>{
     const previous=pdfRender.current;
     if(previous){previous.cancel();try{await previous.promise}catch{}}
     if(disposed||pdfView.current!==sheet||!canvas.current)return;
     const backingRatio=Math.min(2,Math.max(1,window.devicePixelRatio||1));
     const target=Math.max(0.25,zoom*backingRatio);
     // Protect memory on large A0/A1 sheets, especially iPad and iPhone.
     const maxBySide=6144/Math.max(dimensions[0],dimensions[1]);
     const maxByArea=Math.sqrt(18000000/(dimensions[0]*dimensions[1]));
     const resolution=Math.min(target,maxBySide,maxByArea);
     const viewport=sheet.pg.getViewport({scale:1.4*resolution});
     const el=canvas.current;
     el.width=Math.max(1,Math.round(viewport.width));
     el.height=Math.max(1,Math.round(viewport.height));
     const task=sheet.pg.render({canvasContext:el.getContext('2d'),viewport});
     pdfRender.current=task;
     try{await task.promise}catch(e){
       if(!disposed&&e?.name!=='RenderingCancelledException')
         setNotice('Drawing redraw failed: '+String(e?.message||e))
     }finally{if(pdfRender.current===task)pdfRender.current=null}
   },100);
   return()=>{disposed=true;clearTimeout(timer);if(pdfRender.current)pdfRender.current.cancel()};
 },[drawing,page,image,zoom,dimensions[0],dimensions[1]]);
 // Render all drawing pages locally: Cloudflare vision accepts images, not raw PDFs.
 // Only the signed-in user's drawing images are sent to our own authenticated Worker.
 const MAX_AI_PAGES=20;
 function canvasAsImage(canvas){
   let image=canvas.toDataURL('image/jpeg',0.72);
   for(let tries=0;image.length>2800000&&tries<3;tries++){
     const smaller=document.createElement('canvas');smaller.width=Math.max(320,Math.floor(canvas.width*0.75));smaller.height=Math.max(320,Math.floor(canvas.height*0.75));
     smaller.getContext('2d').drawImage(canvas,0,0,smaller.width,smaller.height);canvas=smaller;image=canvas.toDataURL('image/jpeg',0.65)
   }
   if(image.length>2800000)throw Error('Drawing is too large for Cloudflare AI. Reduce the image size.');
   return image;
 }
 async function prepareAiDrawings(){
   const sources=[];let count=0;
   for(const d of fileDocs){
     const {data:signed,error}=await db.storage.from('project-files').createSignedUrl(d.file_path,1200);
     if(error||!signed?.signedUrl)throw Error('Cannot read drawing '+(d.document_no||d.title||''));
     const filename=d.document_no||d.title||d.file_path||'Drawing';
     const ext=filename.split('.').pop().toLowerCase();
     if(ext==='pdf'){
       const pdf=await pdfjs.getDocument({url:signed.signedUrl}).promise;
       count+=pdf.numPages;
       if(count>MAX_AI_PAGES){await pdf.destroy();throw Error('There are more than '+MAX_AI_PAGES+' drawing pages. This free AI trial will not silently skip sheets. Split the drawing package into a reviewed batch before running it.')}
       sources.push({d,filename,pdf,numPages:pdf.numPages});
     }else if(['png','jpeg','jpg','webp'].includes(ext)){
       count++;
       if(count>MAX_AI_PAGES)throw Error('There are more than '+MAX_AI_PAGES+' drawing pages. No partial take-off was saved.');
       sources.push({d,filename,url:signed.signedUrl,numPages:1});
     }else throw Error('Unsupported drawing type for '+filename+'. Use a PDF, PNG or JPEG.');
   }
   return {sources,count};
 }

 // Calibration belongs to a SPECIFIC drawing revision and page. A scale taken
 // from a different sheet, a superseded drawing or a different view is unsafe.
 function calibrationStatus(entry,from=estimate){return storedCalibrationStatus(entry,from)}
 const missingCalibration=(entries,from=estimate)=>pagesAwaitingCalibration(entries,from);
 function chooseCalibrationPage(entry){
   setDrawing(entry.document_id);setPage(entry.page);
   // Scale picking wins over Move mode when changing pages.
   setPanMode(false);panRef.current=null;pressedPoint.current=null;firstCalibrationPoint.current=null;
   setCalibrate(true);setCalibrationFirst(null);setReference(null);setCalibrationMetres('');
   setDrag(null);setHover(null);
   setTimeout(()=>document.getElementById('estimate-drawing-takeoff')?.scrollIntoView({behavior:'smooth',block:'start'}),0);
 }
 async function beginCalibration(){
   if(calibrationLoading||aiBusy)return;
   setCalibrationLoading(true);setNotice('Working… checking how many pages need scaling.');
   let sources=[];
   try{
     const {sources:loaded}=await prepareAiDrawings();sources=loaded;
     const entries=scaleSheetRegister(sources),missing=missingCalibration(entries);
     setCalibrationPages(entries);setCalibrationWizard(true);
     if(missing.length){
       chooseCalibrationPage(missing[0]);
       setNotice(missing.length+' drawing page(s) need a checked scale. Select the ends of a printed dimension and enter the length in metres. For construction-notes sheets with no measurable drawing, press Construction notes — no scale required.');
     }else setNotice('Every drawing page is scaled or marked no scale required. Construction notes will still be read by AI. You can start the AI take-off.');
   }catch(error){setNotice('Calibration setup failed: '+String(error?.message||error))}
   finally{for(const src of sources)if(src.pdf){try{await src.pdf.destroy()}catch{}}setCalibrationLoading(false)}
 }
 async function saveCalibration(referenceOnly=false){
   if(calibrationSaving||!drawing)return;
   const entry=calibrationPages.find(x=>x.document_id===drawing&&x.page===page);
   if(!entry){setNotice('Choose a drawing from the calibration checklist first.');return}
   const length=Number(calibrationMetres),line=Number(reference?.length);
   if(!referenceOnly&&(reference?.drawing_id!==drawing||reference?.page!==page||
      !Number.isFinite(line)||line<5||!Number.isFinite(length)||length<=0)){
     setNotice('Select BOTH ends of a known dimension on this drawing, then enter its actual length in metres.');return;
   }
   if(referenceOnly&&!window.confirm('Mark this page as construction notes — no scale required? AI will still read the notes and specification, but it MUST NOT use this page for scaled measurements. Only choose this when the page has no measurable drawing or usable scale.'))return;
   const status=referenceOnly?'reference-only':'calibrated';
   const saved={
     status,source_path:entry.file_path,source_revision:entry.revision,
     calibrated_at:new Date().toISOString(),reference_only_confirmed:referenceOnly,
     ...(referenceOnly?{}:{
       metresPerPixel:length/line,metres:length,pixelLength:line,
       reference_points:reference.points||null,
       method:'two drawing points against stated dimension — QS verify',
     }),
   };
   const next={...estimate,calibrations:{...(estimate.calibrations||{}),[drawing+'#'+page]:saved}};
   setCalibrationSaving(true);
   try{
     const {error}=await db.from('projects').update({estimate_data:next}).eq('id',project.id);
     if(error)throw error;
     setEstimate(next);setReference(null);setCalibrationMetres('');setCalibrationFirst(null);firstCalibrationPoint.current=null;setCalibrate(false);
     const pending=missingCalibration(calibrationPages,next);
     if(pending.length){
       chooseCalibrationPage(pending[0]);
       setNotice((referenceOnly?'Construction notes — no scale required':'Checked dimension and page scale')+' saved. '+pending.length+' page(s) still need review.');
     }else{
       setNotice('All pages are now scaled or marked no scale required. Press Start AI Take-Off to read all drawings and construction notes.');
       setTimeout(()=>document.getElementById('estimate-ai-takeoff')?.scrollIntoView({behavior:'smooth',block:'start'}),0);
     }
   }catch(error){setNotice('Could not SAVE the drawing scale: '+String(error?.message||error))}
   finally{setCalibrationSaving(false)}
 }
 async function assertAiServiceReady(){
   let response;
   try{response=await fetch('/api/ai-health',{method:'GET',cache:'no-store'});}
   catch{throw Error('Cannot reach the Cloudflare AI reader. Check the app internet connection and Cloudflare deployment.');}
   let health;
   try{health=await response.json()}catch{
     throw Error('This app deployment does not expose the Cloudflare AI health endpoint. The latest Worker build may not be deployed.');
   }
   if(!response.ok||health?.provider!=='Cloudflare Workers AI')
     throw Error('The Cloudflare plan-reader service is unavailable in this deployment. Ask an administrator to check the Worker route.');
   if(!health?.ready)throw Error('Cloudflare Workers AI is not connected to this deployment. Configure the AI binding, then redeploy.');
   return health;
 }
 async function postCloudflareTakeoff(endpoint,payload,token){
   const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(payload)});
   let data={};try{data=await response.json()}catch{}
   if(!response.ok||data?.error)throw Error(data?.error||'Cloudflare AI request failed (HTTP '+response.status+').');
   return data;
 }
 async function renderAiPage(source,pageNumber){
   const canvas=document.createElement('canvas');
   let dimensions=[0,0];
   if(source.pdf){
     const pg=await source.pdf.getPage(pageNumber);
     // Calibration was taken against the same unzoomed 1.4x PDF viewport.
     const logical=pg.getViewport({scale:1.4});
     dimensions=[logical.width,logical.height];
     const base=pg.getViewport({scale:1});
     const scale=Math.min(2,1900/Math.max(base.width,base.height));
     const viewport=pg.getViewport({scale});
     canvas.width=Math.max(1,Math.ceil(viewport.width));canvas.height=Math.max(1,Math.ceil(viewport.height));
     await pg.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
   }else{
     const response=await fetch(source.url);
     if(!response.ok)throw Error('Could not download '+source.filename);
     const bitmap=await createImageBitmap(await response.blob());
     dimensions=[bitmap.width,bitmap.height];
     const scale=Math.min(1,1900/Math.max(bitmap.width,bitmap.height));
     canvas.width=Math.max(1,Math.ceil(bitmap.width*scale));canvas.height=Math.max(1,Math.ceil(bitmap.height*scale));
     canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
     bitmap.close?.();
   }
   return {image:await canvasAsImage(canvas),dimensions};
 }
 async function runAiTakeoff(){
   if(aiBusy)return;
   if(!fileDocs.length){setNotice('Upload plans in Documents before running take-off.');return}
   setAiBusy(true);setAiReview(null);setAiProgress({processed:0,total:0,stage:'Checking Cloudflare AI'});
   setNotice('Working… checking the AI service before opening drawings.');
   let sources=[];
   try{
     const {data:{session}}=await db.auth.getSession();
     if(!session?.access_token)throw Error('Sign in again before running AI take-off.');
     await assertAiServiceReady();
     setAiProgress({processed:0,total:0,stage:'Preparing drawings'});
     const prepared=await prepareAiDrawings();sources=prepared.sources;
     const {count}=prepared;setAiProgress({processed:0,total:count,stage:'Checking drawing scales'});
     const checkedPages=scaleSheetRegister(sources);
     setCalibrationPages(checkedPages);
     const unchecked=missingCalibration(checkedPages);
     if(unchecked.length){
       setCalibrationWizard(true);chooseCalibrationPage(unchecked[0]);
       setAiProgress({processed:0,total:count,stage:'Waiting for scale calibration'});
       setNotice('Before AI take-off, '+unchecked.length+' drawing page(s) need scale calibration or a construction-notes/no-scale decision. No AI request has been sent.');
       return;
     }
     const reviewed=[],autoCandidates=[],autoRejections=[],pageCoverage=[];let complete=0;
     for(const source of sources){
       for(let pageNumber=1;pageNumber<=source.numPages;pageNumber++){
         setAiProgress({processed:complete,total:count,stage:'Analysing page '+(complete+1)+' of '+count});
         setNotice('Working… reading drawing page '+(complete+1)+' of '+count+' with Cloudflare AI.');
         const rendered=await renderAiPage(source,pageNumber);
         const result=await postCloudflareTakeoff('/api/estimate-plan-review',{
           project_id:project.id,document_id:source.d.id,page_number:pageNumber,image:rendered.image,
           calibration_status:calibrationStatus(checkedPages.find(p=>p.document_id===source.d.id&&p.page===pageNumber)),
         },session.access_token);
         if(!result?.page||!Array.isArray(result.page.takeoff_draft))throw Error('Cloudflare AI did not return a usable page review.');
         const sheetEntry=checkedPages.find(p=>p.document_id===source.d.id&&p.page===pageNumber);
         const savedScale=(estimate.calibrations||{})[source.d.id+'#'+pageNumber];
         const {measured,rejected}=measureAutoPage(result.page.auto_marks,{
           calibration_status:calibrationStatus(sheetEntry),
           metresPerPixel:savedScale?.metresPerPixel,dimensions:rendered.dimensions,
           classification:result.page.classification,document_id:source.d.id,page:pageNumber,
         });
         for(const measurement of measured)autoCandidates.push({...measurement,document_id:source.d.id,
           filename:source.filename,page:pageNumber,metresPerPixel:savedScale.metresPerPixel});
         for(const problem of rejected)autoRejections.push({...problem,filename:source.filename,page:pageNumber});
         pageCoverage.push({
           document_id:source.d.id,filename:source.filename,page:pageNumber,
           classification:result.page.classification,
           calibration_status:calibrationStatus(sheetEntry),
           provisional_measured:measured.length,held_shapes:rejected.length,
           scope_items:result.page.takeoff_draft.length,
           unresolved_questions:result.page.unresolved?.length||0
         });
         reviewed.push(result.page);complete++;
         setAiProgress({processed:complete,total:count,stage:'Analysed '+complete+' of '+count+' pages'});
       }
     }
     setAiProgress({processed:count,total:count,stage:'Comparing drawings and preparing BOQ'});
     setNotice('Working… comparing existing and proposed drawings and preparing draft BOQ.');
     const comparison=await postCloudflareTakeoff('/api/estimate-plan-summary',{project_id:project.id,pages:reviewed},session.access_token);
     if(!comparison.drawing_review||!Array.isArray(comparison.takeoff_draft))throw Error('Cloudflare AI comparison was incomplete; no estimate was saved.');
     const normalizedUnit=unit=>({'m2':'m²','m3':'m³','m²':'m²','m³':'m³'}[String(unit||'').toLowerCase()]||String(unit||'item'));
     const norm=x=>String(x||'').toLowerCase().trim().replace(/\s+/g,' ');
     const seen=new Set((estimate.items||[]).map(i=>i.ai_draft_key).filter(Boolean));
     const previousAuto=new Set((estimate.items||[]).map(i=>i.ai_auto_key).filter(Boolean));
     const added=[],autoAdded=[],newHighlights=[];
     const uniqueAuto=autoCandidates.filter(m=>!previousAuto.has(m.key));
     const measuredScopeFor=(description,unit,reference)=> {
       // Identical tasks on separate floors or drawings must remain visible
       // as outstanding scope until specifically tied to their source page.
       if(!reference)return false;
       const ref=norm(reference);
       const existing=(estimate.items||[]).filter(i=>i.ai_auto_key).map(i=>{
         const name=String(i.drawing||''),page=i.takeoff_evidence?.page;
         const suffix=' p'+page;
         return {mark:{name:i.description},unit:i.unit,
           filename:name.endsWith(suffix)?name.slice(0,-suffix.length):name,page};
       });
       return [...autoCandidates,...existing].some(m=>{
         if(norm(m.mark.name)!==norm(description)||norm(m.unit)!==norm(unit)||!m.filename)return false;
         const page=''+m.page;
         return ref.includes(norm(m.filename)) &&
           (ref.endsWith(' p'+page)||ref.endsWith(' page '+page)||
            ref.includes(' p'+page+' ')||ref.includes(' page '+page+' '));
       });
     };
     for(const draft of comparison.takeoff_draft){
       const description=String(draft.description||'').trim();
       if(!description)continue;
       const unit=normalizedUnit(draft.unit),reference=String(draft.drawing_reference||'').trim();
       // Keep the measured line rather than also issuing a zero-quantity AI scope
       // row for the same work type. Different descriptions remain separate.
       if(measuredScopeFor(description,unit,reference))continue;
       const key=[norm(description),norm(unit),norm(reference)].join('|');
       if(seen.has(key))continue;seen.add(key);
       const priced=applySavedRate({...initialItem,description,unit},rateLibrary).item;
       added.push({...priced,id:crypto.randomUUID(),
         ref_no:String((estimate.items||[]).length+added.length+1).padStart(3,'0'),
         work_section:draft.work_section||'AI draft',description,unit,quantity:0,drawing:reference,
         status:'Needs measurement — AI scope only',ai_draft_key:key,
         takeoff_evidence:{source:'Cloudflare Workers AI',confidence:'unverified',draft:true,
           measurement_basis:draft.measurement_basis||'No confirmed dimensions',
           drawing_reference:reference,quantity_status:'Needs measurement'},
       });
     }
     for(const entry of uniqueAuto){
       const previousResult=duplicateAutoCandidate(entry,[...(estimate.items||[]),...autoAdded]);
       if(previousResult.duplicate){
         autoRejections.push({description:entry.mark.name,reason:previousResult.reason,
           filename:entry.filename,page:entry.page});continue;
       }
       const highlightId=crypto.randomUUID();
       const existingManual=(estimate.highlights||[]).some(h=>
         h.drawing_id===entry.document_id && h.page===entry.page
         && norm(h.name)===norm(entry.mark.name)
         && Math.abs(Number(h.x)-Number(entry.mark.x))<.003
         && Math.abs(Number(h.y)-Number(entry.mark.y))<.003
         && Math.abs(Number(h.w)-Number(entry.mark.w))<.003
         && Math.abs(Number(h.h)-Number(entry.mark.h))<.003);
       if(existingManual){autoRejections.push({description:entry.mark.name,
         reason:'Overlaps an existing manually marked feature',filename:entry.filename,page:entry.page});continue}
       const marks={...entry.mark,id:highlightId,drawing_id:entry.document_id,page:entry.page};
       newHighlights.push(marks);
       const description=entry.mark.name,unit=entry.unit;
       const priced=applySavedRate({...initialItem,description,unit},rateLibrary).item;
       autoAdded.push({...priced,id:crypto.randomUUID(),
         ref_no:String((estimate.items||[]).length+added.length+autoAdded.length+1).padStart(3,'0'),
         description,work_section:entry.work_section,unit,quantity:entry.quantity,
         trade:'AI-detected '+entry.mark.stage.toLowerCase()+' work',
         drawing:entry.filename+' p'+entry.page,ai_auto_key:entry.key,
         status:'AI auto-measured outline — provisional; QS check required',
         takeoff_evidence:{source:'Cloudflare Workers AI',automatic:true,confidence:'unverified',draft:true,
           highlight_id:highlightId,drawing_id:entry.document_id,page:entry.page,
           calibration_m_per_px:entry.metresPerPixel,kind:entry.mark.kind,
           region:{x:entry.mark.x,y:entry.mark.y,w:entry.mark.w,h:entry.mark.h},
           points:entry.mark.points||null,openings:entry.mark.openings||null,
           gross_area_m2:entry.gross_area_m2??null,deductions_area_m2:entry.deductions_area_m2??null,
           openings_count:entry.openings_count||0,
           measurement_kind:entry.mark.measurement_kind||entry.mark.kind,
           dimension_evidence:entry.dimension_evidence||null,
           calculation:entry.calculation||null,
           measurement_basis:entry.evidence,
           method:entry.method,quantity_status:'Provisional - QS verify'},
       });
     }
     const stage=stageAiTakeoff(estimate,added,autoAdded,newHighlights);
     const next={...estimate,items:stage.items,highlights:stage.highlights,
       ai_pending_takeoff:stage.ai_pending_takeoff,ai_review_mode:stage.ai_review_mode,
       ai_auto_measurement_review:{accepted:stage.ai_review_mode==='initial'?autoAdded.length:0,
         suggested_for_review:stage.staged_count,rejected:autoRejections.slice(0,100),
         checked_pages:count,analysed_at:new Date().toISOString()},
       ai_page_coverage:summariseAiCoverage(pageCoverage),
       ai_drawing_review:comparison.drawing_review,ai_last_analysed_at:new Date().toISOString(),
       takeoff_review_status:'AI draft — QS review required'};
     const {error:saveError}=await db.from('projects').update({estimate_data:next}).eq('id',project.id);
     if(saveError)throw Error('Could not save draft BOQ: '+saveError.message);
     setEstimate(next);setAiReview(comparison.drawing_review);
     setAiProgress({processed:count,total:count,
       stage:stage.ai_review_mode==='rerun-review'?'Reanalysis saved — BOQ unchanged':'Draft BOQ saved for QS checking'});
     const needsMeasurement=added.filter(x=>!x.quantity).length;
     setNotice(stage.ai_review_mode==='rerun-review'
       ?'AI reviewed '+count+' page(s). Existing BOQ and marked areas were LEFT UNCHANGED. '
         +stage.staged_count+' new observation(s) queued for QS approval; '
         +autoRejections.length+' outline(s) held as duplicates, conflicts or invalid. Inspect the Review new AI suggestions section.'
       :'AI reviewed '+count+' page(s): '+autoAdded.length+' provisional AI measured outline(s) and '
         +added.length+' other scope item(s) needing measurement. All require QS checks before quotation.');
   }catch(e){
     setAiProgress(p=>({...p,stage:'Stopped — review error'}));
     setNotice('AI plan reader stopped: '+(e.message||String(e))+' No partial BOQ was saved. Fix the reported issue before restarting.');
   }
   finally{for(const source of sources)if(source.pdf){try{await source.pdf.destroy()}catch{}}setAiBusy(false)}
 }
 async function reviewAiSuggestion(id,decision){
   if(aiBusy||busy)return;
   const proposal=(estimate.ai_pending_takeoff||[]).find(p=>p.id===id);
   if(!proposal)return setNotice('AI suggestion was not found. Refresh the estimate.');
   if(decision==='add'&&!window.confirm('Add this AI suggestion to the draft BOQ for QS verification?\n'+
      proposal.item.description+' — '+proposal.item.quantity+' '+proposal.item.unit+
      '\n'+proposal.item.drawing+'\nThis does not verify the drawing boundary, dimensions or price.'))return;
   const result=decideAiSuggestion(estimate,id,decision);
   if(result.error)return setNotice('Suggestion not added: '+result.error);
   setBusy(true);
   try{
     const {error}=await db.from('projects').update({estimate_data:result.next}).eq('id',project.id);
     if(error)throw Error(error.message);
     setEstimate(result.next);
     setNotice(decision==='add'?'AI suggestion added to draft BOQ with QS verification outstanding.':'AI suggestion dismissed. Existing BOQ unchanged.');
   }catch(error){setNotice('Could not save suggestion decision: '+String(error?.message||error))}
   finally{setBusy(false)}
 }
 function patch(k,v){setEstimate(x=>({...x,[k]:v}))}
 async function save(next=estimate){setBusy(true);try{const{error}=await db.from('projects').update({estimate_data:next}).eq('id',project.id);setNotice(error?'Save failed: '+error.message:'Estimate and drawing highlights saved')}finally{setBusy(false)}}
 async function uploadBuilderLogo(f){
  if(!f)return;
  if(!['image/png','image/jpeg'].includes(f.type)){setNotice('Please select a PNG or JPEG builder logo.');return}
  const path='builder-logos/'+Date.now()+'-'+f.name.replace(/[^A-Za-z0-9._-]/g,'_');
  setLogoUploading(true);
  try{
   const{error}=await db.storage.from('project-files').upload(path,f);
   if(error)throw error;
   setBuilderForm(b=>b?({...b,logo_path:path}):b);
   setNotice('Logo uploaded. Save builder details to use it in quotations.');
  }catch(error){setNotice('Logo upload failed: '+error.message)}
  finally{setLogoUploading(false)}
 }
 function editBuilder(){
  if(!builder){setNotice('Select a saved builder before choosing Edit Builder.');return}
  const fields=Object.fromEntries(BUILDER_FIELDS.map(k=>[k,builder[k]||'']));
  setBuilderForm({...fields,id:builder.id});
  setNotice('');
 }
 async function saveBuilder(){
  if(!builderForm||builderSaving||logoUploading)return;
  if(!builderForm.name?.trim()){setNotice('Enter the builder company name before saving.');return}
  setBuilderSaving(true);
  try{
   const payload=Object.fromEntries(BUILDER_FIELDS.map(k=>[k,builderForm[k]||'']));
   payload.name=payload.name.trim();
   const editing=Boolean(builderForm.id);
   const query=editing?db.from('estimate_builders').update(payload).eq('id',builderForm.id):db.from('estimate_builders').insert(payload);
   const{data,error}=await query.select('*').single();
   if(error)throw error;
   if(!data)throw new Error('No saved builder was returned. Please try again.');
   setBuilders(list=>[...list.filter(b=>b.id!==data.id),data].sort((a,b)=>a.name.localeCompare(b.name)));
   patch('builder_id',data.id);
   setBuilderForm(null);
   setNotice(editing?'Builder details updated. The latest details will be used in quotations.':'Builder added. Save the estimate to retain its builder selection.');
  }catch(error){setNotice('Builder not saved: '+error.message)}
  finally{setBuilderSaving(false)}
 }
 const builder=builders.find(b=>String(b.id)===String(estimate.builder_id));

 function point(e){return normalizedDrawingPoint(e.clientX,e.clientY,overlay.current.getBoundingClientRect())}
 // CSS zoom only changes the page's on-screen size, never the underlying drawing coordinates.
 function setDrawingZoom(requested,anchor=null,origin=null){
   const viewer=drawingScroll.current;
   if(!viewer)return;
   const oldZoom=zoomRef.current,nextZoom=clampZoom(requested);
   const dest=anchor||{x:viewer.clientWidth/2,y:viewer.clientHeight/2};
   const source=origin||{scrollLeft:viewer.scrollLeft,scrollTop:viewer.scrollTop,anchorX:dest.x,anchorY:dest.y,zoom:oldZoom};
   const nextScroll=anchoredScroll({
     scrollLeft:source.scrollLeft,scrollTop:source.scrollTop,
     fromZoom:source.zoom,toZoom:nextZoom,
     anchorX:source.anchorX,anchorY:source.anchorY,targetX:dest.x,targetY:dest.y
   });
   zoomRef.current=nextZoom;
   setZoom(nextZoom);
   if(scrollAnimation.current)cancelAnimationFrame(scrollAnimation.current);
   scrollAnimation.current=requestAnimationFrame(()=>{
     viewer.scrollLeft=nextScroll.left;viewer.scrollTop=nextScroll.top;scrollAnimation.current=null;
   });
 }
 function handleZoomWheel(e){
   if(!e.ctrlKey&&!e.metaKey)return;
   e.preventDefault();
   const bounds=drawingScroll.current.getBoundingClientRect();
   setDrawingZoom(zoomRef.current*(e.deltaY<0?1.12:1/1.12),{x:e.clientX-bounds.left,y:e.clientY-bounds.top});
 }
 function handleDrawingPointerDown(e){
   if(!drawing||!dimensions[0]||!dimensions[1])return;
   e.preventDefault();
   overlay.current.setPointerCapture(e.pointerId);
   pointerPositions.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
   if(pointerPositions.current.size>=2){
     gestureRef.current=true;panRef.current=null;pressedPoint.current=null;setDrag(null);setHover(null);
     if(pointerPositions.current.size===2){
       const [a,b]=[...pointerPositions.current.values()],geo=pinchGeometry(a,b);
       const bounds=drawingScroll.current.getBoundingClientRect();
       pinchRef.current={
         distance:Math.max(1,geo.distance),zoom:zoomRef.current,
         scrollLeft:drawingScroll.current.scrollLeft,scrollTop:drawingScroll.current.scrollTop,
         anchorX:geo.x-bounds.left,anchorY:geo.y-bounds.top
       };
     }
     return;
   }
   if(gestureRef.current)return;
   if(panMode){
     panRef.current={
       pointerId:e.pointerId,x:e.clientX,y:e.clientY,
       left:drawingScroll.current.scrollLeft,top:drawingScroll.current.scrollTop
     };
     return;
   }
   const p=point(e);pressedPoint.current=p;setDrag(p);setHover(p);
 }
 function handleDrawingPointerMove(e){
   if(pointerPositions.current.has(e.pointerId))
     pointerPositions.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
   if(pointerPositions.current.size>=2&&pinchRef.current){
     e.preventDefault();
     const [a,b]=[...pointerPositions.current.values()],geo=pinchGeometry(a,b);
     const bounds=drawingScroll.current.getBoundingClientRect(),start=pinchRef.current;
     setDrawingZoom(start.zoom*geo.distance/start.distance,
       {x:geo.x-bounds.left,y:geo.y-bounds.top},start);
     return;
   }
   if(panRef.current?.pointerId===e.pointerId){
     e.preventDefault();
     const p=panRef.current;
     drawingScroll.current.scrollLeft=p.left-(e.clientX-p.x);
     drawingScroll.current.scrollTop=p.top-(e.clientY-p.y);
     return;
   }
   if(!gestureRef.current&&(pressedPoint.current||firstCalibrationPoint.current||firstMeasurePointRef.current))setHover(point(e));
 }
 function handleDrawingPointerUp(e){
   const wasActive=pointerPositions.current.has(e.pointerId);
   pointerPositions.current.delete(e.pointerId);
   const handled=Boolean(gestureRef.current||panRef.current);
   if(pointerPositions.current.size<2)pinchRef.current=null;
   if(panRef.current?.pointerId===e.pointerId)panRef.current=null;
   if(!pointerPositions.current.size)gestureRef.current=false;
   if(handled){pressedPoint.current=null;setDrag(null);setHover(null);return}
   if(wasActive)finish(e);
 }
 function handleDrawingPointerCancel(e){
   pointerPositions.current.delete(e.pointerId);panRef.current=null;
   if(pointerPositions.current.size<2)pinchRef.current=null;
   if(!pointerPositions.current.size)gestureRef.current=false;
   pressedPoint.current=null;setDrag(null);setHover(null);
 }
 function distanceOnDrawing(a,b){return Math.hypot((a.x-b.x)*dimensions[0],(a.y-b.y)*dimensions[1])}
 function finish(e){
   // React state might not have committed before a quick click/tap's pointerup.
   const initial=pressedPoint.current;
   pressedPoint.current=null;
   if(!initial)return;
   const end=point(e),x=Math.min(end.x,initial.x),y=Math.min(end.y,initial.y),
     w=Math.abs(end.x-initial.x),h=Math.abs(end.y-initial.y);
   setDrag(null);setHover(null);
   if(calibrate){
     const result=resolveCalibrationClick(initial,end,firstCalibrationPoint.current,dimensions[0],dimensions[1]);
     if(result.step==='point-a'){
       firstCalibrationPoint.current=result.first;
       setCalibrationFirst(result.first);
       setNotice('Point A selected. Now click or tap point B at the other end of that printed dimension.');
       return;
     }
     if(result.step==='too-close'||result.step==='invalid'){
       setNotice('Points A and B are too close. Select two distinct ends of the printed dimension.');
       return;
     }
     setReference({length:result.length,drawing_id:drawing,page,points:[result.first,result.second]});
     firstCalibrationPoint.current=null;
     setCalibrationFirst(null);setCalibrate(false);
     setNotice('A and B selected. Enter the dimension in metres, then press Save scale & next.');
     return;
   }
   if(selectedCalibrationStatus==='reference-only')return setNotice('Construction notes cannot supply measured quantities. Select a measurable drawing page.');
   if(markMode==='count'){
     patch('highlights',[...estimate.highlights,{id:crypto.randomUUID(),drawing_id:drawing,page,x:end.x,y:end.y,w:0,h:0,kind:'count',name:markName,stage}]);
     setNotice('One item counted and marked. Add more points for more items; then add each count to the draft BOQ.');
     return;
   }
   if(!metresPerPixel)return setNotice('Set a checked scale on this page before measuring a length, area or volume.');
   if(markMode==='length'){
     if(!firstMeasurePointRef.current){
       firstMeasurePointRef.current=end;setFirstMeasurePoint(end);
       setNotice('Length point A selected. Tap or click point B.');
       return;
     }
     const a=firstMeasurePointRef.current;
     if(Math.hypot((end.x-a.x)*dimensions[0],(end.y-a.y)*dimensions[1])<5)return setNotice('Length points are too close. Tap a different endpoint.');
     const line={id:crypto.randomUUID(),drawing_id:drawing,page,kind:'length',points:[a,end],x:Math.min(a.x,end.x),y:Math.min(a.y,end.y),w:Math.abs(end.x-a.x),h:Math.abs(end.y-a.y),name:markName,stage};
     firstMeasurePointRef.current=null;setFirstMeasurePoint(null);
     patch('highlights',[...estimate.highlights,line]);
     setNotice('Length marked. Add it to the draft BOQ to use the checked drawing scale.');
     return;
   }
   if(w<.01||h<.01)return;
   const depth=Number(markDepth);
   if(markMode==='volume'&&(!Number.isFinite(depth)||depth<=0))return setNotice('Enter a positive depth in metres before marking a volume.');
   patch('highlights',[...estimate.highlights,{id:crypto.randomUUID(),drawing_id:drawing,page,x,y,w,h,kind:markMode,depth_m:markMode==='volume'?depth:undefined,name:markName,stage}]);
   setNotice(markMode==='volume'?'Plan area marked with the entered depth. Review the depth and add the volume to the BOQ.':'Area marked on scaled plan. Add to draft BOQ and check the quantity.');
 }

 const selectedCalibrationEntry=calibrationPages.find(x=>x.document_id===drawing&&x.page===page);
 const selectedCalibrationStatus=selectedCalibrationEntry?calibrationStatus(selectedCalibrationEntry):'needed';
 const calibration=(estimate.calibrations||{})[drawing+'#'+page];
 const metresPerPixel=selectedCalibrationStatus==='calibrated'?Number(calibration?.metresPerPixel)||0:0;
 const regionMeasures=h=>measuredQuantity(h,dimensions,metresPerPixel);
 function addMeasured(h){
   if(selectedCalibrationStatus==='reference-only')return alert('Reference-only construction notes cannot supply measured quantities.');
   if(!estimate.drawing_stages?.[drawing]||estimate.drawing_stages[drawing]==='Unclassified')return alert('Classify this drawing before measuring.');
   if(['Existing','Retained'].includes(h.stage))return alert('Existing and retained work is not a new-build BOQ charge. Mark the actual new or demolition work separately.');
   if((estimate.items||[]).some(i=>i.takeoff_evidence?.highlight_id===h.id))return alert('This marked region already has a BOQ item. Edit that line to avoid double counting.');
   const m=regionMeasures(h);
   if(!m||!(m.quantity>0))return alert('No valid quantity: calibrate this page or enter a valid depth, and check the marked geometry.');
   const description=String(h.name||'').trim()||'Measured work';
   const {rate:match,status:matchStatus}=findUniqueRate(rateLibrary,description,m.unit);
   const components=match?rateComponents(match):null;
   const rate=components?{...components,supplier:match.supplier||'',price_url:match.price_url||'',rate_source:match.supplier||'Saved rate library',rate_checked_at:match.price_date||match.updated_at||null}:{};
   const draft={...initialItem,...rate,id:crypto.randomUUID(),ref_no:String(estimate.items.length+1).padStart(3,'0'),
     description,trade:match?.trade||'Measured '+String(h.stage||'proposed').toLowerCase()+' work',
     drawing:(fileDocs.find(x=>x.id===drawing)?.document_no||'')+' p'+page,quantity:m.quantity,unit:m.unit,
     status:components?'Matched rate — QS verification required':'Measured quantity — rate and QS verification required',
     takeoff_evidence:{highlight_id:h.id,drawing_id:drawing,page,kind:h.kind||'area',depth_m:h.depth_m||null,
       points:h.points||null,region:{x:h.x,y:h.y,w:h.w,h:h.h},calibration_m_per_px:metresPerPixel||null,
       method:m.method,drawing_stage:estimate.drawing_stages[drawing],work_stage:h.stage,confidence:'unverified'}};
   patch('items',[...estimate.items,draft]);
   setNotice('Added '+m.quantity+' '+m.unit+' to draft BOQ. '+(components?'A unique valid matching '+m.unit+' rate was applied.':matchStatus==='ambiguous'?'Multiple library rates match; choose and verify a rate.':match?'Library rate is incomplete or invalid; enter correct rates.':'No matching rate; enter labour, materials and plant rates.')+' Review and Save estimate.');
 }
 const currentHighlights=(estimate.highlights||[]).filter(x=>x.drawing_id===drawing&&x.page===page); const linkedBoq=h=>(estimate.items||[]).filter(i=>i.takeoff_evidence?.highlight_id===h.id); const pricedBoq=h=>linkedBoq(h).filter(i=>perLine(i)>0);
 const coverage=rateLibraryCoverage(rateLibrary);
 const sum=estimate.items.reduce((a,i)=>({materials:a.materials+num(i.quantity)*num(i.material_rate),plant:a.plant+num(i.quantity)*num(i.plant_rate),labour:a.labour+num(i.quantity)*num(i.labour_hours)*num(i.labour_rate)}),{materials:0,plant:0,labour:0});
 const pricingIssues=(estimate.items||[]).flatMap(row=>{const problems=[];if(!Number.isFinite(Number(row.quantity))||Number(row.quantity)<=0)problems.push('quantity is missing or invalid');if([row.material_rate,row.plant_rate,row.labour_hours,row.labour_rate].some(x=>!Number.isFinite(Number(x))||Number(x)<0))problems.push('invalid rate');if(num(row.material_rate)+num(row.plant_rate)+num(row.labour_hours)*num(row.labour_rate)<=0)problems.push('no priced materials, labour or plant');return problems.map(problem=>({ref:row.ref_no||row.description||'Unnumbered item',problem,id:row.id}));});
 const direct=sum.materials+sum.plant+sum.labour,oh=direct*num(estimate.overheads)/100,profit=(direct+oh)*num(estimate.profit)/100,pcTotal=(estimate.pc_sums||[]).reduce((n,p)=>n+num(p.amount)*(1+num(p.attendance_percent)/100),0),provisionalTotal=(estimate.provisional_sums||[]).filter(x=>x.include!==false).reduce((n,p)=>n+num(p.amount),0),dayworksTotal=(estimate.dayworks||[]).reduce((n,d)=>n+(num(d.labour)+num(d.materials)+num(d.plant))*(1+num(d.markup)/100),0),contingencyBase=direct+oh+profit+pcTotal+provisionalTotal+dayworksTotal,contingency=estimate.contingency_mode==='lump'?num(estimate.contingency_value):contingencyBase*num(estimate.contingency_value)/100,unadjustedSubtotal=contingencyBase+contingency,globalAdjustment=unadjustedSubtotal*num(estimate.global_adjustment)/100,subtotal=unadjustedSubtotal+globalAdjustment,total=subtotal*(1+num(estimate.vat)/100);
 async function printQuote(){
 const w=window.open('','_blank');if(!w)return alert('Allow pop-ups to generate the quotation');w.document.write('<!doctype html><title>Preparing quotation</title><p>Preparing quotation…</p>');
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let builderLogo='';if(builder?.logo_path){const {data:logo,error:logoError}=await db.storage.from('project-files').createSignedUrl(builder.logo_path,300);if(!logoError&&logo?.signedUrl)builderLogo='<img src="'+esc(logo.signedUrl)+'" alt="Company logo" style="max-height:95px;max-width:240px;object-fit:contain" />';}
 const quoteRef=estimate.quote_ref||project.project_no||'Draft';
 const lines=estimate.items.map(i=>'<tr><td>'+esc(i.ref_no||'')+'</td><td>'+esc(i.description)+'</td><td>'+esc(i.quantity)+' '+esc(i.unit)+'</td><td>'+esc(money(perLine(i)))+'</td></tr>').join('');
 const row=(name,value)=>'<tr><td colspan="3">'+esc(name)+'</td><td>'+esc(money(value))+'</td></tr>';
 const html='<!doctype html><html><head><meta charset="utf-8"><title>Quotation '+esc(quoteRef)+'</title><style>body{font-family:Arial,sans-serif;color:#182d43;max-width:900px;margin:30px auto;line-height:1.5}header{border-bottom:4px solid #bd2431;padding-bottom:16px}h1{font-size:25px}h2{font-size:17px;margin-top:28px}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #ddd;padding:8px;text-align:left}td:last-child,th:last-child{text-align:right}.total{font-weight:bold;font-size:19px}.print{padding:12px;background:#bd2431;color:white;border:0;margin:20px 0}pre{font:inherit;white-space:pre-wrap}@media print{.print{display:none}body{margin:10mm}}</style></head><body><header>'+builderLogo+'<h1>'+esc(builder?.name||'Builder Quotation')+'</h1><div>'+esc([builder?.address,builder?.phone,builder?.email,builder?.company_number?'Company no. '+builder.company_number:'',builder?.vat_number?'VAT '+builder.vat_number:''].filter(Boolean).join(' | '))+'</div></header><h1>Quotation</h1><p><b>Reference:</b> '+esc(quoteRef)+'<br><b>Date:</b> '+esc(new Date().toLocaleDateString('en-GB'))+'<br><b>Client:</b> '+esc(project.client_name)+'<br><b>Project:</b> '+esc(project.name)+'<br><b>Site:</b> '+esc(project.site_address)+'</p><pre>'+esc(estimate.quote_intro)+'</pre><h2>Scope of works</h2><pre>'+esc(estimate.quote_scope||estimate.items.map(i=>i.description).join('\\n'))+'</pre><h2>Priced works</h2><table><thead><tr><th>Ref</th><th>Description</th><th>Quantity</th><th>Amount</th></tr></thead><tbody>'+lines+row('Measured works',direct)+row('Preliminaries / overheads',oh)+row('Profit',profit)+row('PC sums including attendance',pcTotal)+row('Included provisional sums',provisionalTotal)+row('Dayworks',dayworksTotal)+row('Contingency',contingency)+row('Global adjustment ('+num(estimate.global_adjustment)+'%)',globalAdjustment)+'<tr class="total"><td colspan="3">Subtotal excluding VAT</td><td>'+esc(money(subtotal))+'</td></tr>'+row('VAT ('+estimate.vat+'%)',total-subtotal)+'<tr class="total"><td colspan="3">TOTAL INCLUDING VAT</td><td>'+esc(money(total))+'</td></tr></tbody></table><h2>Payment terms</h2><pre>'+esc(estimate.quote_payment_terms)+'</pre><h2>Quotation validity</h2><p>'+esc(estimate.quote_validity)+'</p><h2>Exclusions</h2><pre>'+esc(estimate.quote_exclusions)+'</pre><h2>Terms and conditions</h2><pre>'+esc(estimate.quote_terms)+'</pre><p>Draft quotation — verify quantities, prices and VAT treatment before issue.</p><button class="print" onclick="window.print()">Print / Save PDF</button></body></html>';
 w.document.open();w.document.write(html);w.document.close();
 }
 async function saveQuoteRevision(){
 if(estimate.items.some(i=>i.takeoff_evidence?.confidence==='unverified'))return alert('Measured BOQ items still contain unverified take-off evidence. Review and verify them before saving a quotation revision.');if(pricingIssues.length)return alert('Quote revision not saved: resolve the '+pricingIssues.length+' BOQ pricing checks listed below first. Draft estimates can still be saved.');if(estimate.takeoff_review_status!=='QS reviewed'||!String(estimate.takeoff_reviewer||'').trim()||!estimate.takeoff_reviewed_at)return alert('Quotation revision requires a recorded QS reviewer and review date. Drafts may be saved and previewed.');if(fileDocs.some(d=>!((estimate.drawing_stages||{})[d.id])||(estimate.drawing_stages||{})[d.id]==='Unclassified'))return alert('Classify all current drawings as Existing, Proposed, Demolition or Supporting before saving a quotation revision.');
 const revision={id:crypto.randomUUID(),saved_at:new Date().toISOString(),reference:estimate.quote_ref||project.project_no||'Draft',net:subtotal,vat:total-subtotal,gross:total,estimate_snapshot:JSON.parse(JSON.stringify(estimate))};
 const next={...estimate,quote_revisions:[...(estimate.quote_revisions||[]),revision]};
 setEstimate(next);await save(next);
 }

 async function importMasterRates(e){
  const f=e.target.files?.[0];if(!f)return;
  setRateImportBusy(true);setRateImportStatus('Reading master rates sheet…');setRateImportReview([]);
  let inserted=0;
  try{
   if(!/\.xlsx?$/i.test(f.name))throw Error('Choose the original Construction_Rates_Master.xlsx file.');
   const wb=XLSX.read(await f.arrayBuffer(),{type:'array'});
   const sheet=wb.Sheets[wb.SheetNames[0]];
   if(!sheet)throw Error('No rate worksheet was found.');
   const rows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:''});
   const {ready,needsReview,total}=prepareMasterRateImport(rows);
   if(!total||!ready.length)throw Error('No valid labour rates found. Check the spreadsheet headings and price data.');
   const {data:stored,error:lookupError}=await db.from('estimate_rate_library').select('*').limit(5000);
   if(lookupError)throw Error('Cannot read saved pricing library: '+lookupError.message);
   if(stored.length===5000)throw Error('Saved rate library has reached its 5,000-row lookup limit; ask an administrator to review before importing.');
   const saved=new Map(stored.map(rate=>[rateMatchKey(rate),rate]));
   const toInsert=[],review=[...needsReview];
   let alreadySaved=0;
   for(const rate of ready){
    const key=rateMatchKey(rate),existing=saved.get(key);
    if(existing){
     const original=Number(rate.labour_hours)*Number(rate.labour_rate);
     const savedPrice=Number(existing.labour_hours)*Number(existing.labour_rate)+Number(existing.material_rate)+Number(existing.plant_rate);
     if(Math.abs(original-savedPrice)>0.015||String(existing.trade||'').trim().toLowerCase()!==String(rate.trade||'').trim().toLowerCase()){
      review.push({description:rate.description,trade:rate.trade,unit:rate.unit,price:original,reason:'Existing saved rate differs — not overwritten'});
     }else alreadySaved++;
    }else{toInsert.push(rate);saved.set(key,rate);}
   }
   setRateImportReview(review);
   for(let offset=0;offset<toInsert.length;offset+=50){
    setRateImportStatus('Saving rates '+(offset+1)+'–'+Math.min(offset+50,toInsert.length)+' of '+toInsert.length+'…');
    const {error}=await db.from('estimate_rate_library').insert(toInsert.slice(offset,offset+50));
    if(error)throw Error('Could not save rate batch: '+error.message);
    inserted+=Math.min(50,toInsert.length-offset);
   }
   const {data:refreshed,error:refreshError}=await db.from('estimate_rate_library').select('*').order('description').limit(5000);
   if(refreshError)throw Error('Rates saved, but reloading failed: '+refreshError.message);
   setRateLibrary(refreshed||[]);
   setRateImportStatus('Master rate import: '+inserted+' added; '+alreadySaved+' already saved; '+review.length+' held for QS review. '+(refreshed||[]).length+' rates available. Labour prices exclude VAT; no materials were inferred.');
  }catch(error){
   setRateImportStatus('Rate import stopped after '+inserted+' additions: '+(error.message||String(error))+'. Existing rates were not overwritten.');
  }finally{setRateImportBusy(false);e.target.value='';}
 }
 function downloadRateReview(){
  const columns=['Description','Trade','Unit','Hours','Price excl VAT','Source page','Source row','Source image','Review reason'];
  const records=[columns,...rateImportReview.map(r=>[r.description,r.trade,r.unit,r.hours,r.price,r.page,r.row,r.image,r.reason])];
  const csv=records.map(row=>row.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\r\n');
  const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='UK_Estimates_Master_Rates_Review.csv';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
 }
 function matchSavedRates(){
   const {rows,stats}=applySavedRates(estimate.items,rateLibrary);
   if(stats.matched)patch('items',rows);
   setNotice(stats.matched+' items matched to a unique valid library rate. '
     +stats.ambiguous+' ambiguous, '+stats.missing+' without a matching description/unit, '
     +stats['invalid-rate']+' with incomplete or invalid rate data; '
     +stats['already-priced']+' existing priced items preserved. '
     +'Check material, plant, labour and verification dates before issuing. Save the estimate to keep new prices.');
 }
 function addItem(){
   if(!item.description.trim())return alert('Please enter the BOQ description');
   if(!Number.isFinite(Number(item.quantity))||Number(item.quantity)<=0)return alert('Enter a quantity greater than zero');
   for(const key of ['material_rate','plant_rate','labour_hours','labour_rate']){
     if(String(item[key]).trim()===''||!Number.isFinite(Number(item[key]))||Number(item[key])<0)return alert('Enter a valid non-negative '+key.replaceAll('_',' '));
   }
   const lookup=applySavedRate(item,rateLibrary);
   const priced=lookup.item;
   const hasPrice=num(priced.material_rate)+num(priced.plant_rate)+num(priced.labour_hours)*num(priced.labour_rate)>0;
   const status=!hasPrice?'UNPRICED — rate required':
     lookup.status==='matched'?'Library rate matched — QS verification required':
     'Manually priced — QS verification required';
   patch('items',[...estimate.items,{...priced,status,ref_no:priced.ref_no||String(estimate.items.length+1).padStart(3,'0'),
     work_section:priced.work_section||'Measured Works',id:crypto.randomUUID()}]);
   setItem(initialItem);
   if(lookup.status==='ambiguous'||lookup.status==='invalid-rate')setNotice('BOQ item added without automatic pricing because matching supplier rates were '+(lookup.status==='ambiguous'?'ambiguous.':'incomplete or invalid.')+' Enter and verify a rate manually.');
 }
 function editBoq(id,key,value){if(['quantity','material_rate','plant_rate','labour_hours','labour_rate'].includes(key)&&value!==''&&(!Number.isFinite(Number(value))||Number(value)<0))return;patch('items',estimate.items.map(row=>row.id===id?{...row,[key]:value,status:'Revised — recheck rates'}:row));}
 async function readCSV(e,type){const f=e.target.files?.[0];if(!f)return;let rows;if(/\.xlsx?$/i.test(f.name)){const wb=XLSX.read(await f.arrayBuffer(),{type:'array'}),sheet=wb.Sheets[wb.SheetNames[0]];rows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:''});const idx=rows.findIndex(r=>r.some(c=>String(c).toLowerCase()==='description'));rows=rows.slice(idx<0?0:idx);}else{const raw=await f.text();rows=raw.replace(/^\uFEFF/,'').trim().split(/\r?\n/).map(x=>x.split(',').map(y=>y.replace(/^"|"$/g,'').trim()));}const heads=(rows.shift()||[]).map(s=>String(s).toLowerCase().replace(/[\s_()£.-]/g,''));const at=(row,...keys)=>{const idx=heads.findIndex(h=>keys.includes(h));return idx<0?'':row[idx]};const additions=rows.map(r=>{const desc=at(r,'description','task','item','material');return desc?{...initialItem,id:crypto.randomUUID(),description:desc,trade:at(r,'tradespeople','trade','category')||'Imported',unit:at(r,'unit','uom')||'nr',material_rate:type==='materials'?num(at(r,'rate','price','unitprice','priceexclvat')):0,labour_hours:type==='labour'?num(at(r,'hours','time','hoursperunit')):0,labour_rate:type==='labour'?num(at(r,'hourlyrate','labourrate'))||(num(at(r,'priceexclvat'))&&num(at(r,'hours'))?num(at(r,'priceexclvat'))/num(at(r,'hours')):0):0,supplier:at(r,'supplier','merchant'),price_url:at(r,'url','link'),status:'Imported — check and match quantities'}:null}).filter(Boolean);patch('items',[...estimate.items,...additions]);setNotice('Imported '+additions.length+' items; check the rates and match them to measured work.');e.target.value=''}
 function exportBoqCSV(){const headers=['Ref','Section','Description','Drawing','Quantity','Unit','Material unit rate','Plant unit rate','Labour hours per unit','Labour hourly rate','Status','Drawing ID','Page','Measurement method','Confidence','Highlight ID','Line total'];const csv=[headers,...estimate.items.map(i=>[i.ref_no,i.work_section,i.description,i.drawing,i.quantity,i.unit,i.material_rate,i.plant_rate,i.labour_hours,i.labour_rate,i.status,i.takeoff_evidence?.drawing_id,i.takeoff_evidence?.page,i.takeoff_evidence?.method,i.takeoff_evidence?.confidence,i.takeoff_evidence?.highlight_id,perLine(i)])].map(row=>row.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\r\n');const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=(project.project_no||'takeoff')+'-BOQ.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500)}
 async function printMarkedDrawing(){if(!drawing)return alert('Select a drawing first');const doc=fileDocs.find(d=>d.id===drawing);if(!doc)return alert('Drawing not found');const marked=currentHighlights;if(!marked.length)return alert('Mark areas on this drawing before exporting the appendix');const win=window.open('','_blank');if(!win)return alert('Allow pop-ups to print the marked-up drawing');win.document.write('<p>Preparing marked-up drawing appendix…</p>');try{let source;if(image){const pic=new Image();pic.crossOrigin='anonymous';await new Promise((resolve,reject)=>{pic.onload=resolve;pic.onerror=reject;pic.src=image});source=document.createElement('canvas');source.width=pic.naturalWidth;source.height=pic.naturalHeight;source.getContext('2d').drawImage(pic,0,0)}else{source=canvas.current;if(!source||!source.width)throw Error('Drawing page has not rendered yet')}const output=document.createElement('canvas');output.width=source.width;output.height=source.height;const ctx=output.getContext('2d');ctx.drawImage(source,0,0);for(const h of marked){const priced=pricedBoq(h).length>0,linked=linkedBoq(h).length>0;ctx.fillStyle=priced?'rgba(35,156,82,.30)':linked?'rgba(234,172,37,.30)':'rgba(205,57,57,.22)';ctx.strokeStyle=priced?'#239c52':linked?'#eaaa25':'#cd3939';ctx.lineWidth=Math.max(2,output.width/500);if(['polygon','polyline'].includes(h.kind)&&Array.isArray(h.points)&&h.points.length>=2){
 const trace=points=>{ctx.moveTo(points[0].x*output.width,points[0].y*output.height);for(const p of points.slice(1))ctx.lineTo(p.x*output.width,p.y*output.height);};
 ctx.beginPath();trace(h.points);
 if(h.kind==='polygon'){ctx.closePath();for(const hole of h.openings||[]){if(hole.length>=3){trace(hole);ctx.closePath();}}ctx.fill('evenodd');}
 ctx.stroke();
}else if(h.kind==='length'&&h.points?.length===2){ctx.beginPath();ctx.moveTo(h.points[0].x*output.width,h.points[0].y*output.height);ctx.lineTo(h.points[1].x*output.width,h.points[1].y*output.height);ctx.stroke()}else if(h.kind==='count'){ctx.beginPath();ctx.arc(h.x*output.width,h.y*output.height,Math.max(5,output.width/220),0,Math.PI*2);ctx.fill();ctx.stroke()}else{ctx.fillRect(h.x*output.width,h.y*output.height,h.w*output.width,h.h*output.height);ctx.strokeRect(h.x*output.width,h.y*output.height,h.w*output.width,h.h*output.height)}}const esc=v=>String(v??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));const rows=marked.map(h=>'<tr><td>'+esc(h.name)+'</td><td>'+esc(h.stage)+'</td><td>'+esc(pricedBoq(h).length?'Priced':linkedBoq(h).length?'Linked / unpriced':'Not linked')+'</td><td>'+esc(linkedBoq(h).map(i=>i.ref_no||i.description).join(', ')||'—')+'</td></tr>').join('');win.document.open();win.document.write('<!doctype html><html><head><title>Marked-up take-off appendix</title><style>body{font:12px Arial,sans-serif;margin:22px;color:#222}h1{font-size:20px}img{display:block;width:100%;max-height:75vh;object-fit:contain;border:1px solid #ccc}table{width:100%;border-collapse:collapse;margin-top:12px}td,th{border:1px solid #ccc;padding:6px;text-align:left}small{color:#555}@page{size:landscape;margin:12mm}@media print{button{display:none}}</style></head><body><h1>UK Estimates — Marked-up Take-off Appendix</h1><p>'+esc(project.name)+' · '+esc(doc.document_no||doc.title)+' · Revision '+esc(doc.revision||'Unspecified')+' · Page '+page+'</p><p>🟢 Priced · 🟡 Linked but unpriced · 🔴 Not linked to BOQ</p><img src="'+output.toDataURL('image/png')+'" alt="Marked-up drawing"/><table><thead><tr><th>Area</th><th>Work stage</th><th>Pricing status</th><th>BOQ references</th></tr></thead><tbody>'+rows+'</tbody></table><p><small>Draft take-off evidence. Highlights are manually drawn and must be checked against dimensions, drawing scale, revision and measured quantities. A priced highlight does not confirm the full scope has been priced.</small></p><button onclick="window.print()">Print / Save as PDF</button></body></html>');win.document.close()}catch(e){win.document.body.textContent='Could not prepare marked-up drawing: '+(e.message||e)}}
 function exportTakeoffJSON(){const payload={schema:'ukestimates-takeoff-v1',project:{name:project.name,number:project.project_no,address:project.site_address},measurement_standard:estimate.measurement_standard||'NRM2',review_status:estimate.takeoff_review_status||'Draft',reviewer:estimate.takeoff_reviewer||'',reviewed_at:estimate.takeoff_reviewed_at||'',drawings:fileDocs.map(d=>({id:d.id,filename:d.document_no||d.title,revision:d.revision,status:d.status,stage:(estimate.drawing_stages||{})[d.id]||'Unclassified'})),measured_regions:(estimate.highlights||[]).map(h=>({...h,linked_boq_refs:(estimate.items||[]).filter(i=>i.takeoff_evidence?.highlight_id===h.id).map(i=>i.ref_no||i.description),priced:(estimate.items||[]).some(i=>i.takeoff_evidence?.highlight_id===h.id&&perLine(i)>0)})),calibrations:estimate.calibrations||{},items:estimate.items,assumptions:project.assumptions||'',exported_at:new Date().toISOString()};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=(project.project_no||'takeoff')+'-takeoff.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500)}
 function makeRow(cells){return new TableRow({children:cells.map(v=>new TableCell({children:[new Paragraph(String(v??''))]}))})}
 async function makeWord(){if(!estimate.items.length&&!(estimate.pc_sums||[]).length&&!(estimate.provisional_sums||[]).length&&!(estimate.dayworks||[]).length)return alert('Add priced work or allowances first');const cells=[makeRow(['Trade','Description','Qty','Unit','Materials','Plant','Labour','Total'])];estimate.items.forEach(i=>cells.push(makeRow([i.trade,i.description,i.quantity,i.unit,money(num(i.material_rate)*num(i.quantity)),money(num(i.plant_rate)*num(i.quantity)),money(num(i.labour_hours)*num(i.labour_rate)*num(i.quantity)),money(perLine(i))])));const para=t=>new Paragraph(String(t||''));const heading=t=>new Paragraph({text:t,heading:HeadingLevel.HEADING_2});let logoParagraph=[];if(builder?.logo_path){try{const {data:signed}=await db.storage.from('project-files').createSignedUrl(builder.logo_path,120);if(signed?.signedUrl){const bytes=new Uint8Array(await (await fetch(signed.signedUrl)).arrayBuffer());const ext=builder.logo_path.toLowerCase().split('.').pop();logoParagraph=[new Paragraph({children:[new ImageRun({data:bytes,type:ext==='jpg'||ext==='jpeg'?'jpg':'png',transformation:{width:180,height:80}})]})]}}catch(e){console.warn('Logo could not be embedded',e)}}const d=new Document({sections:[{children:[...logoParagraph,new Paragraph({children:[new TextRun({text:builder?.name||'Draft Builder Quotation',bold:true,size:34})]}),para([builder?.address,builder?.phone,builder?.email,builder?.vat_number&&'VAT: '+builder.vat_number].filter(Boolean).join(' | ')),heading('Bill of Quantities and Estimate'),para('Project: '+project.name+' | '+(project.project_no||'')),para('Site: '+(project.site_address||'')),para('DRAFT - NOT APPROVED FOR ISSUE. Drawing highlights are scope indicators only. All quantities, specifications, labour times and current merchant prices require checking.'),new Table({rows:cells}),heading('Summary'),para('Materials: '+money(sum.materials)),para('Plant: '+money(sum.plant)),para('Labour: '+money(sum.labour)),para('Overheads / preliminaries ('+estimate.overheads+'%): '+money(oh)),para('Profit ('+estimate.profit+'%): '+money(profit)),heading('Prime Cost Sums'),...(estimate.pc_sums||[]).map(p=>para(p.description+': '+money(p.amount)+' + '+num(p.attendance_percent)+'% attendance/profit = '+money(num(p.amount)*(1+num(p.attendance_percent)/100)))),para('PC sums incl. attendance: '+money(pcTotal)),heading('Provisional Sums'),...(estimate.provisional_sums||[]).map(p=>para(p.description+' ('+(p.defined?'Defined':'Undefined')+', '+(p.include===false?'excluded':'included')+'): '+money(p.amount))),para('Included provisional sums: '+money(provisionalTotal)),heading('Dayworks'),...(estimate.dayworks||[]).map(d=>para(d.description+': labour '+money(d.labour)+', materials '+money(d.materials)+', plant '+money(d.plant)+', markup '+num(d.markup)+'% = '+money((num(d.labour)+num(d.materials)+num(d.plant))*(1+num(d.markup)/100)))),para('Dayworks total: '+money(dayworksTotal)),para('Contingency ('+(estimate.contingency_mode==='lump'?'lump sum':num(estimate.contingency_value)+'%')+'): '+money(contingency)),para('Global adjustment ('+num(estimate.global_adjustment)+'%): '+money(globalAdjustment)),para('Subtotal excluding VAT: '+money(subtotal)),para('VAT ('+estimate.vat+'%): '+money(total-subtotal)),para('Total including VAT: '+money(total)),heading('Qualifications'),para('Draft for review. No automatic scale measurement or live merchant-price confirmation is claimed.'),para(builder?.footer||'')] }]});const blob=await Packer.toBlob(d),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=(project.project_no||'project')+'-BOQ.docx';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000)}
 return <section className="panel estimateMain"><h2>Estimates & Bill of Quantities</h2><p className="muted">Mark new work on proposed plans, compare against existing drawings, then build a quantity-checked materials, plant and labour estimate. Marked areas are not automatically measured: confirm dimensions and scale before pricing.</p>
 <div id="estimate-ai-takeoff" className="estimateForm" style={{padding:16,marginBottom:16}}>
 <div style={{gridColumn:'1 / -1'}}><strong>Step 1 — Check drawing scales</strong><p className="muted">Each measurable sheet needs one checked, written dimension before the AI take-off can start. Use two taps (phone) or drag along the dimension (desktop). Construction notes and details without measurable drawings can be marked no scale required; AI still reads their specifications and notes. Different-scale views need separate checking.</p></div>
 <button type="button" onClick={beginCalibration} disabled={calibrationLoading||aiBusy}>{calibrationLoading?'Working…':'Set drawing scales'}</button>
 <button type="button" aria-busy={aiBusy} style={{fontSize:18,fontWeight:700,padding:'14px 22px'}} onClick={runAiTakeoff} disabled={aiBusy||calibrationLoading||calibrationSaving}>{aiBusy?<span role="status" aria-live="polite">Working…</span>:"Step 2 — Start AI Take-Off"}</button>
 {calibrationPages.length>0&&<p style={{gridColumn:'1 / -1'}} aria-live="polite">{calibrationPages.length-missingCalibration(calibrationPages).length} of {calibrationPages.length} pages scaled or marked no scale required. {missingCalibration(calibrationPages).length?'Finish the remaining pages before take-off.':'All pages checked — ready to start AI drawing review.'}</p>}
 <div style={{gridColumn:'1 / -1'}} aria-live="polite" role="status">
  <strong>AI reader: {aiProgress.stage}</strong>
  {aiProgress.total>0&&<><progress aria-label="Drawing pages analysed" max={aiProgress.total} value={aiProgress.processed} style={{width:'100%',marginTop:8}}/><small>{aiProgress.processed} of {aiProgress.total} drawing pages processed. The comparison and saving stages take additional time.</small></>}
 </div>
 {notice&&<p role="alert" className="notice" style={{gridColumn:'1 / -1',marginTop:12}}>{notice}</p>}</div>{aiReview&&<div className="estimateForm"><h3>AI drawing review</h3><p>Pages: {aiReview.pages?.length||0} · Changes: {aiReview.changes?.length||0} · Questions: {aiReview.unresolved?.length||0}</p>{(aiReview.pages||[]).map((p,i)=><p key={i}><strong>{p.filename} page {p.page_number}:</strong> {p.classification} — {p.reason}</p>)}{(aiReview.changes||[]).map((c,i)=><p key={i}><strong>{c.element}:</strong> {c.classification} — {c.reason}</p>)}{(aiReview.unresolved||[]).map((q,i)=><p key={i}><strong>Question:</strong> {q.question}</p>)}<button type="button" onClick={()=>document.getElementById('estimate-drawing-takeoff')?.scrollIntoView({behavior:'smooth'})}>Open drawing for measured take-off</button></div>}
 <div className="estimateToolbar"><label>Saved builder<select value={estimate.builder_id||''} onChange={e=>patch('builder_id',e.target.value)}><option value="">Select builder</option>{builders.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><button type="button" onClick={()=>{setBuilderForm({...emptyBuilderForm});setNotice('')}}>+ Add Builder</button><button type="button" className="outline" onClick={editBuilder} disabled={!builder} title={builder?'Edit the saved company and quotation details':'Select a saved builder first'}>Edit Builder</button><button onClick={()=>save()} disabled={busy}>Save estimate</button><button onClick={makeWord}>Generate Word BOQ</button><button type="button" onClick={exportBoqCSV}>Export BOQ CSV</button><button type="button" onClick={exportTakeoffJSON}>Export take-off JSON</button><button type="button" onClick={printMarkedDrawing}>Marked-up drawing PDF appendix</button><button onClick={printQuote}>Preview / Print Quotation</button><button onClick={saveQuoteRevision} disabled={busy||pricingIssues.length>0} title={pricingIssues.length?'Resolve pricing checks before saving a quote revision':''}>Save Quote Revision</button></div>
 {builderForm&&<div className="estimateForm" aria-label={builderForm.id?'Edit builder':'Add builder'}><h3>{builderForm.id?'Edit Builder — company and letterhead details':'Add Builder — company and letterhead details'}</h3>{[['name','Company name'],['contact_name','Contact'],['address','Postal address'],['phone','Phone'],['email','Email'],['vat_number','VAT number'],['company_number','Company number'],['footer','Quotation footer']].map(([k,l])=><label key={k}>{l}<input value={builderForm[k]||''} onChange={e=>setBuilderForm(b=>({...b,[k]:e.target.value}))}/></label>)}<label>Company logo (PNG or JPEG)<input type="file" accept=".png,.jpg,.jpeg" disabled={builderSaving||logoUploading} onChange={e=>uploadBuilderLogo(e.target.files?.[0])}/>{builderForm.logo_path&&<small>Saved logo on file. Upload another image to replace it.</small>}</label><button type="button" onClick={saveBuilder} disabled={builderSaving||logoUploading}>{builderSaving?'Saving builder…':logoUploading?'Uploading logo…':builderForm.id?'Save Builder Changes':'Save Builder'}</button><button type="button" className="outline" disabled={builderSaving||logoUploading} onClick={()=>setBuilderForm(null)}>Cancel</button></div>}
 <h3 id="estimate-drawing-takeoff">1. Drawing take-off and QS review</h3>
 {calibrationWizard&&<div className="estimateCalibrationWizard" aria-label="Drawing calibration checklist">
   <h4>Drawing scale checklist — {calibrationPages.length-missingCalibration(calibrationPages).length} of {calibrationPages.length} reviewed</h4>
   <p>Open each measurable drawing page, tap the two ends of a printed dimension, type that dimension in metres and press <strong>Save scale &amp; next</strong>. Calibration saves to this project automatically. For a page with only construction notes and no measurable drawing, press <strong>Construction notes — no scale required</strong>. AI will still read its notes but no scaled measurements will be taken from it. For sheets with more than one scale, check each view separately before relying on a measurement.</p>
   <div className="estimateCalibrationPages">{calibrationPages.map(entry=>{
     const status=calibrationStatus(entry),selected=drawing===entry.document_id&&page===entry.page;
     return <button type="button" key={entry.document_id+'#'+entry.page} className={selected?'selected':''}
       aria-current={selected?'step':undefined} disabled={calibrationSaving}
       onClick={()=>chooseCalibrationPage(entry)}>
       {status==='calibrated'?'✓ Scaled':status==='reference-only'?'Notes — no scale':'Needs scale'} — {entry.filename} (page {entry.page}, rev {entry.revision||'not stated'})
     </button>
   })}</div>
 </div>}<div className="estimateForm"><label>Drawing register — classify each drawing before measuring<div style={{display:'grid',gap:8,marginTop:8}}>{fileDocs.length?fileDocs.map(d=><div key={d.id} style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}><span style={{flex:'1 1 190px'}}>{d.document_no||d.title} (rev {d.revision||'not stated'})</span><select aria-label={'Drawing stage for '+(d.document_no||d.title)} value={(estimate.drawing_stages||{})[d.id]||'Unclassified'} onChange={e=>patch('drawing_stages',{...(estimate.drawing_stages||{}),[d.id]:e.target.value})}><option>Unclassified</option><option>Existing</option><option>Proposed</option><option>Demolition</option><option>Detail / Supporting</option></select></div>):<span>No current plans uploaded. Open Project → Upload Plans.</span>}</div></label></div><div className="estimateForm"><label>Measurement standard<select value={estimate.measurement_standard||'NRM2'} onChange={e=>patch('measurement_standard',e.target.value)}><option>NRM2</option><option>SMM7</option></select></label><label>Take-off review status<select value={estimate.takeoff_review_status||'Draft'} onChange={e=>patch('takeoff_review_status',e.target.value)}><option>Draft</option><option>QS review required</option><option>QS reviewed</option></select></label><label>QS reviewer / checker<input value={estimate.takeoff_reviewer||''} onChange={e=>patch('takeoff_reviewer',e.target.value)} placeholder="Full name"/></label><label>Review date<input type="date" value={estimate.takeoff_reviewed_at||''} onChange={e=>patch('takeoff_reviewed_at',e.target.value)}/></label></div><p className="muted">The selected measurement standard is recorded for review; automated NRM2/SMM7 rules are not yet implemented. Upload Existing, Proposed and Demolition plans in the project Documents section, then identify them by stage here. Scale measurements remain indicative pending QS verification.</p><p className="muted">For accurate quantities, the written drawing dimensions must be verified. Press <strong>Select a dimension</strong>, then on a phone tap the two ends of the SAME printed dimension (or drag on a desktop). Enter the written length in metres. Scale is retained by drawing revision and page. Area take-off remains provisional until independently checked.</p>
 <div className="estimateToolbar estimateScaleControls">
  <button type="button" aria-pressed={calibrate} className={calibrate?'selected':''} onClick={()=>{
     // Turning on calibration always turns off Move drawing so points really register.
     setPanMode(false);panRef.current=null;pressedPoint.current=null;firstCalibrationPoint.current=null;
     setCalibrate(true);setCalibrationFirst(null);setReference(null);setDrag(null);
     setNotice('Select point A, then point B. A blue marker appears for each point.');
   }} disabled={!drawing||!dimensions[0]||!calibrationWizard||calibrationSaving}>{calibrate?'Selecting A → B':'Select a dimension (A → B)'}</button>
  <label>Printed dimension length (metres)<input type="number" inputMode="decimal" min="0" step="any" value={calibrationMetres} onChange={e=>setCalibrationMetres(e.target.value)} placeholder="e.g. 3.6" /></label>
  <button type="button" disabled={calibrationSaving||!reference||reference.drawing_id!==drawing||reference.page!==page||!(Number(calibrationMetres)>0)} onClick={()=>saveCalibration(false)}>{calibrationSaving?'Saving…':'Save scale & next'}</button>
  <button type="button" className="outline" disabled={calibrationSaving||!calibrationWizard||!drawing} onClick={()=>saveCalibration(true)}>Construction notes — no scale required</button>
  <span role="status" aria-live="polite">{calibrate?(calibrationFirst?'Tap second end of the dimension':'Tap first and second ends, or drag along the dimension'):reference?'Line selected — enter metres and save':selectedCalibrationStatus==='calibrated'?'This page has a saved scale':selectedCalibrationStatus==='reference-only'?'Construction notes — no scale required':'Scale not set for this page'}</span>
 </div><div className="estimateToolbar" aria-label="Manual take-off tools"><label>Mark type<select value={markMode} onChange={e=>{setMarkMode(e.target.value);setPanMode(false);panRef.current=null;firstMeasurePointRef.current=null;setFirstMeasurePoint(null);setCalibrate(false);setReference(null);setNotice('Select a measurable plan and mark '+e.target.value+' work.')}}><option value="area">Area — m² (rectangle)</option><option value="length">Length — m (two taps)</option><option value="count">Count — nr (one tap per item)</option><option value="volume">Volume — m³ (rectangle × depth)</option></select></label>{markMode==='volume'&&<label>Depth / thickness (metres)<input type="number" inputMode="decimal" step="any" min="0.001" value={markDepth} placeholder="e.g. 0.15" onChange={e=>setMarkDepth(e.target.value)}/></label>}<small>Manual marks only, checked against project scale where required. All BOQ quantities need QS review.</small></div><div className="estimateToolbar"><label>Choose uploaded plan<select value={drawing} onChange={e=>{setDrawing(e.target.value);setPage(1);setReference(null);setCalibrationFirst(null);setCalibrate(false)}}><option value="">Select existing or proposed PDF</option>{fileDocs.map(d=><option key={d.id} value={d.id}>{d.document_no||d.title}</option>)}</select></label><label>Work / rate description<input list="estimate-rate-descriptions" value={markName} onChange={e=>setMarkName(e.target.value)} placeholder="Enter the same description as a library rate"/><datalist id="estimate-rate-descriptions">{[...new Set(rateLibrary.map(r=>r.description).filter(Boolean))].slice(0,1000).map((desc,i)=><option key={i} value={desc}/>)}</datalist></label><label>Drawing stage<select value={stage} onChange={e=>setStage(e.target.value)}><option>Proposed</option><option>Existing</option><option>Demolition</option><option>Retained</option></select></label>{pageCount>1&&<label>Page<select value={page} onChange={e=>{setPage(Number(e.target.value));setReference(null);setCalibrationFirst(null);setCalibrate(false)}}>{Array.from({length:pageCount},(_,i)=><option key={i} value={i+1}>{i+1}</option>)}</select></label>}</div>
 <div className="estimateToolbar estimateZoomControls" aria-label="Drawing zoom and movement">
   <button type="button" disabled={!drawing||!dimensions[0]} onClick={()=>setDrawingZoom(zoomRef.current/1.5)} aria-label="Zoom out on drawing">− Zoom out</button>
   <button type="button" disabled={!drawing||!dimensions[0]} onClick={()=>setDrawingZoom(zoomRef.current*1.5)} aria-label="Zoom in on drawing">+ Zoom in</button>
   <button type="button" disabled={!drawing||!dimensions[0]} onClick={()=>setDrawingZoom((drawingScroll.current.clientWidth-24)/dimensions[0])}>Fit width</button>
   <button type="button" disabled={!drawing||!dimensions[0]} onClick={()=>setDrawingZoom(1)}>100%</button>
   <button type="button" className={panMode?'selected':''} aria-pressed={panMode} disabled={!drawing||!dimensions[0]} onClick={()=>{
     setPanMode(v=>!v);pressedPoint.current=null;panRef.current=null;setDrag(null);setHover(null);
     if(!panMode)setNotice('Move drawing mode. Click and drag, or drag with one finger. Choose Select a dimension to resume A to B.');
   }}>{panMode?'Move on — select dimension to stop':'Move drawing'}</button>
   <span role="status" aria-live="polite">{Math.round(zoom*100)}% zoom · {image?'Image': 'High-resolution PDF'}</span>
   <small>Mouse: click point A, then B. Touchscreen: tap A, then B. Zoom or move the drawing first; selecting a dimension automatically stops Move mode. The checked measurement stays unchanged when zooming. Scanned image clarity depends on the original file.</small>
 </div>
 <div ref={drawingScroll} className="estimateDrawingScroll" onWheel={handleZoomWheel}>
   <div className="estimateDrawing" style={{width:dimensions[0]?dimensions[0]*zoom:800,height:dimensions[1]?dimensions[1]*zoom:undefined}}>
   {image?<img src={image} alt="Drawing to mark" style={{width:dimensions[0]?dimensions[0]*zoom:undefined,height:dimensions[1]?dimensions[1]*zoom:undefined}} onLoad={e=>setDimensions([e.currentTarget.naturalWidth,e.currentTarget.naturalHeight])}/>:<canvas ref={canvas} style={{width:dimensions[0]?dimensions[0]*zoom:undefined,height:dimensions[1]?dimensions[1]*zoom:undefined}}/>}
   <div ref={overlay} className="estimateOverlay" style={{cursor:panMode?'grab':'crosshair'}} onPointerDown={handleDrawingPointerDown} onPointerMove={handleDrawingPointerMove} onPointerUp={handleDrawingPointerUp} onPointerCancel={handleDrawingPointerCancel} onLostPointerCapture={e=>{if(pointerPositions.current.has(e.pointerId))handleDrawingPointerCancel(e)}}>{(reference?.points||calibrationFirst)&&<svg style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none',overflow:'visible'}} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
 {reference?.points&&<line x1={reference.points[0].x*100} y1={reference.points[0].y*100} x2={reference.points[1].x*100} y2={reference.points[1].y*100} stroke="#0076ba" strokeWidth=".5"/>}
 {reference?.points?.map((p,i)=><g key={i}><circle cx={p.x*100} cy={p.y*100} r="1.4" fill="#0076ba" stroke="white" strokeWidth=".3"/><text x={p.x*100+1.7} y={p.y*100-1.7} fontSize="2.8" fill="#004b75" stroke="white" strokeWidth=".2" paintOrder="stroke">{i===0?'A':'B'}</text></g>)}
 {calibrationFirst&&<g><circle cx={calibrationFirst.x*100} cy={calibrationFirst.y*100} r="1.5" fill="#0076ba" stroke="white" strokeWidth=".3"/><text x={calibrationFirst.x*100+1.7} y={calibrationFirst.y*100-1.7} fontSize="2.8" fill="#004b75" stroke="white" strokeWidth=".2" paintOrder="stroke">A</text></g>}
 {calibrationFirst&&hover&&<line x1={calibrationFirst.x*100} y1={calibrationFirst.y*100} x2={hover.x*100} y2={hover.y*100} stroke="#0076ba" strokeWidth=".35" strokeDasharray="1 .6"/>}
 </svg>}{(currentHighlights.some(h=>['length','count','polygon','polyline'].includes(h.kind))||firstMeasurePoint)&&<svg style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none',overflow:'visible'}} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
 {currentHighlights.filter(h=>h.kind==='length'&&h.points?.length===2).map(h=><line key={h.id} x1={h.points[0].x*100} y1={h.points[0].y*100} x2={h.points[1].x*100} y2={h.points[1].y*100} stroke="#cc3939" strokeWidth=".5"/>)}
 {currentHighlights.filter(h=>h.kind==='count').map(h=><circle key={h.id} cx={h.x*100} cy={h.y*100} r="1" fill="#cc3939" stroke="#fff" strokeWidth=".3"/>)}
 {currentHighlights.filter(h=>h.kind==='polyline'&&h.points?.length>=2).map(h=><path key={h.id} d={svgTrace(h.points,false)} fill="none" stroke={pricedBoq(h).length?'#239c52':linkedBoq(h).length?'#eaaa25':'#cc3939'} strokeWidth=".55" strokeLinejoin="round" strokeLinecap="round"/>)}
 {currentHighlights.filter(h=>h.kind==='polygon'&&h.points?.length>=3).map(h=><path key={h.id} d={svgPolygon(h)} fill={pricedBoq(h).length?'rgba(35,156,82,.30)':linkedBoq(h).length?'rgba(234,172,37,.30)':'rgba(205,57,57,.22)'} fillRule="evenodd" stroke={pricedBoq(h).length?'#239c52':linkedBoq(h).length?'#eaaa25':'#cc3939'} strokeWidth=".35" strokeLinejoin="round"/>)}
 {firstMeasurePoint&&<circle cx={firstMeasurePoint.x*100} cy={firstMeasurePoint.y*100} r="1.3" fill="#006a9d" stroke="white" strokeWidth=".3"/>}
 {firstMeasurePoint&&hover&&<line x1={firstMeasurePoint.x*100} y1={firstMeasurePoint.y*100} x2={hover.x*100} y2={hover.y*100} stroke="#006a9d" strokeDasharray="1 .6" strokeWidth=".4"/>}
 </svg>}{currentHighlights.filter(h=>!['length','count','polygon','polyline'].includes(h.kind)).map(h=><div key={h.id} className="estimateMark" style={{left:h.x*100+'%',top:h.y*100+'%',width:h.w*100+'%',height:h.h*100+'%',background:pricedBoq(h).length?"rgba(35,156,82,.34)":linkedBoq(h).length?"rgba(234,172,37,.3)":"rgba(205,57,57,.2)",borderColor:pricedBoq(h).length?"#239c52":linkedBoq(h).length?"#eaaa25":"#cd3939"}} title={h.name+" — "+(pricedBoq(h).length?"Priced: "+pricedBoq(h).map(i=>i.ref_no||i.description).join(", "):linkedBoq(h).length?"Linked but unpriced":"Not linked to BOQ")}/>) }{drag&&hover&&!calibrate&&<div className="estimateMark drawingNew" style={{left:Math.min(drag.x,hover.x)*100+'%',top:Math.min(drag.y,hover.y)*100+'%',width:Math.abs(drag.x-hover.x)*100+'%',height:Math.abs(drag.y-hover.y)*100+'%'}}/>}</div></div></div><p className="muted">Drawing key: 🟢 Green = linked to a priced BOQ item; 🟡 Amber = linked but unpriced; 🔴 Red = not linked to BOQ. Drawings must be calibrated and measured quantities reviewed before issue.</p>
 {currentHighlights.map(h=>{const m=regionMeasures(h);return <div key={h.id} className="estimateHighlightRow">{h.stage}: {h.name} — {h.kind||'area'} (page {h.page}) {m?m.quantity+' '+m.unit:''}{m?.openings_count?' (gross '+m.gross_area_m2+' m² less '+m.deductions_area_m2+' m² for '+m.openings_count+' opening(s))':''} — {pricedBoq(h).length?'PRICED':linkedBoq(h).length?'LINKED / UNPRICED':'NOT LINKED'} <button type="button" disabled={selectedCalibrationStatus==='reference-only'||(h.kind!=='count'&&!metresPerPixel)} onClick={()=>addMeasured(h)}>Add measured {h.kind||'area'} to BOQ</button> <button type="button" className="outline" onClick={()=>patch('highlights',estimate.highlights.filter(x=>x.id!==h.id))}>Remove</button></div>})}
 <h3>2. Build measured BOQ items</h3>
 {(estimate.ai_pending_takeoff||[]).length>0&&<div className="notice" role="region" aria-label="Review new AI takeoff suggestions">
   <strong>Review new AI suggestions — {(estimate.ai_pending_takeoff||[]).length} pending</strong>
   <p>The AI has reanalysed drawings. <strong>It has not changed your existing BOQ.</strong> These are unapproved observations, not additional priced work. Check against the marked drawings and other BOQ entries to prevent duplication before adding anything.</p>
   {(estimate.ai_pending_takeoff||[]).map(p=><div key={p.id} className="estimateHighlightRow">
     <div><strong>{p.kind==='measured'?'Measured suggestion':'Scope needing measurement'}:</strong>
       {' '+p.item.description+' — '+p.item.quantity+' '+p.item.unit+' · '+(p.item.drawing||'Drawing reference required')}
       <small> · QS must verify location, quantity and rate</small>
     </div>
     <button type="button" disabled={busy||aiBusy} onClick={()=>reviewAiSuggestion(p.id,'add')}>Review and add as draft BOQ line</button>
     <button type="button" className="outline" disabled={busy||aiBusy} onClick={()=>reviewAiSuggestion(p.id,'dismiss')}>Dismiss</button>
   </div>)}
  </div>}
 {estimate.ai_page_coverage&&<div className="notice" aria-label="Project-wide AI drawing coverage">
   <b>Automatic take-off coverage by drawing:</b>
   <p>{estimate.ai_page_coverage.total_pages||0} drawing page(s) analysed; {estimate.ai_page_coverage.provisional_shapes||0} candidate quantity mark(s);
   {estimate.ai_page_coverage.held_shapes||0} held for review; {estimate.ai_page_coverage.unresolved_questions||0} outstanding page question(s).
   This is a coverage register of AI observations, <strong>not certification that every building element was found.</strong></p>
   <details><summary>Review every sheet and outstanding measurements</summary>
    <ul>{(estimate.ai_page_coverage.pages||[]).map((p,i)=><li key={p.document_id+'#'+p.page+'-'+i}>
     <b>{p.filename} — page {p.page} ({p.classification})</b>: {p.status}.
     {p.provisional_measured>0?' '+p.provisional_measured+' provisional mark(s).':''}
     {p.held_shapes>0?' '+p.held_shapes+' candidate(s) held.':''}
     {p.unresolved_questions>0?' '+p.unresolved_questions+' question(s).':''}
    </li>)}</ul>
   </details>
 </div>}
  {estimate.ai_auto_measurement_review&&<div className="notice" role="status">
   <b>AI automatic measurement preview:</b> {estimate.ai_auto_measurement_review.accepted||0} provisional measured outline(s)
   across {estimate.ai_auto_measurement_review.checked_pages||0} reviewed page(s).
   {(estimate.ai_auto_measurement_review.rejected||[]).length} attempted outline(s) require manual checking.
   {(estimate.items||[]).filter(i=>i.takeoff_evidence?.source==='Cloudflare Workers AI' && !(Number(i.quantity)>0)).length} AI scope item(s) still need a checked quantity.
   <p>AI-suggested visible outlines are calculated against the saved per-sheet scale. Wall heights, trench widths/depths and slab thicknesses are only used where the AI quotes a matching metric dimension; the quote and its applicability must still be checked against the actual drawing. No AI measurement is deemed verified.</p>
   <details><summary>Show automatic quantity calculations and quoted dimensions</summary>
    <ul>{(estimate.items||[]).filter(i=>i.takeoff_evidence?.automatic).slice(-60).map((i,n)=>{
      const evidence=i.takeoff_evidence,calc=evidence.calculation||{};
      const dims=evidence.dimension_evidence||{};
      return <li key={i.id||n}><b>{i.description}: {i.quantity} {i.unit}</b> — {i.drawing}.
        {Object.keys(calc).length>0&&<span> Calculation: {Object.entries(calc).map(([key,val])=>key.replaceAll('_',' ')+' = '+val).join('; ')}.</span>}
        {Object.keys(dims).filter(k=>k.endsWith('_evidence')).map(k=><span key={k}> {k.replaceAll('_',' ')}: “{dims[k]}”.</span>)}
        {Array.isArray(dims.openings)&&dims.openings.length>0&&<span> {dims.openings.length} opening(s): verify widths/heights and the location of each on elevations.</span>}
      </li>;
    })}</ul>
   </details>
   {(estimate.ai_auto_measurement_review.rejected||[]).length>0&&<details><summary>See outlines held for review</summary><ul>{estimate.ai_auto_measurement_review.rejected.slice(0,30).map((m,i)=><li key={i}>{m.filename} page {m.page}: {m.description||'Unlabelled'} — {m.reason}</li>)}</ul></details>}
  </div>}
  <div className="estimateToolbar" aria-label="Import master pricing rates">
   <label>Import Construction Rates Master (staff only)
    <input type="file" accept=".xlsx,.xls" aria-label="Import Construction Rates Master spreadsheet" disabled={rateImportBusy} onChange={importMasterRates}/>
   </label>
   {rateImportBusy&&<span role="status">Working — importing prices…</span>}
   {rateImportStatus&&<span role="status" className="muted">{rateImportStatus}</span>}
   {rateImportReview.length>0&&<button type="button" className="outline" onClick={downloadRateReview}>Download {rateImportReview.length} rates for review</button>}
  </div>
  <p className="muted">Import skips existing rates, holds ambiguous or incomplete prices for QS review, and treats Priceajob unit prices as labour hours × hourly labour rate (excluding VAT). Rates are provisional until verified. Staff access is checked by the database.</p>
  <div className="estimateToolbar"><button type="button" onClick={matchSavedRates} disabled={!estimate.items.length||!rateLibrary.length}>Match missing rates from library</button><span>{rateLibrary.length} imported entries: {coverage.materials} with material rates, {coverage.plant} with plant rates and {coverage.labour} with labour rates. Only one valid description/unit match is applied; ambiguous matches are held for QS review and existing prices stay unchanged.</span></div><div className="notice"><b>Measurement verification:</b> {estimate.items.filter(i=>i.takeoff_evidence?.confidence==='unverified').length} take-off item(s) (manual and AI) remain unverified. Individual evidence must be checked before final quotation revisions. <button type="button" className="outline" onClick={()=>{const checked=window.confirm('Confirm that you personally checked all recorded drawing quantities, scale and measurements?');if(checked)patch('items',estimate.items.map(i=>i.takeoff_evidence?.confidence==='unverified'?{...i,takeoff_evidence:{...i.takeoff_evidence,confidence:'manually verified',verified_at:new Date().toISOString(),verified_by:estimate.takeoff_reviewer||'Reviewer'},status:'Manually verified take-off — confirm pricing'}:i))}}>Mark checked take-offs as verified</button></div><p className="muted">All manually measured items retain drawing/page/region and scale evidence where available. AI-detected quantities, element recognition and existing-versus-proposed subtraction are still under development; do not assume a highlighted rectangle is an automatic take-off.</p><div className="estimateForm">{[['ref_no','BoQ reference (auto if blank)'],['work_section','Work section'],['description','Work item / description'],['trade','Trade'],['drawing','Drawing reference'],['quantity','Verified quantity'],['material_rate','Material £/unit'],['plant_rate','Plant £/unit'],['labour_hours','Labour hours / unit'],['labour_rate','Labour £/hour'],['supplier','Supplier'],['price_url','Price source URL']].map(([k,l])=><label key={k}>{l}<input type={['quantity','material_rate','plant_rate','labour_hours','labour_rate'].includes(k)?'number':'text'} step="any" value={item[k]} onChange={e=>setItem(x=>({...x,[k]:e.target.value}))}/></label>)}<label>Unit<select value={item.unit} onChange={e=>setItem(x=>({...x,unit:e.target.value}))}>{['nr','m','m²','m³','kg','tonne','day','item'].map(x=><option key={x}>{x}</option>)}</select></label><button onClick={addItem}>Add BOQ item</button></div>
 <div className="estimateForm"><label>Imported price list / supplier reference<input value={estimate.supplier_price_source||''} placeholder="e.g. Huws Gray trade price list" onChange={e=>patch('supplier_price_source',e.target.value)}/></label><label>Date rates last verified<input type="date" value={estimate.supplier_price_date||''} onChange={e=>patch('supplier_price_date',e.target.value)}/></label></div><p className="muted">Use agreed supplier price lists until merchant API access has been authorised. Record the price source/date, and confirm availability, delivery and VAT before issuing. No live supplier API connection is claimed.</p><p className="muted">Rates are applied from the saved library only on a unique, valid description and unit match. {coverage.materials} entries contain material costs, {coverage.plant} contain plant costs, {coverage.labour} contain labour costs and {coverage.invalid} have incomplete or unpriced components. The library can contain labour-only rates: missing materials or plant are <strong>not</strong> invented. Confirm source dates, delivery and VAT. No live merchant price connection is claimed.</p>
 <div role="status" className={pricingIssues.length?'notice':'muted'}><b>BOQ pricing review: {pricingIssues.length?pricingIssues.length+' check(s) outstanding':'No unpriced or invalid BOQ items detected'}</b>{pricingIssues.length>0&&<ul>{pricingIssues.map((issue,i)=><li key={i}>{issue.ref}: {issue.problem}</li>)}</ul>}<p>Drafts can be saved while checks are open; quotation revisions are blocked until every item has a valid quantity and a non-zero unit rate.</p></div>
 <div className="estimateTableScroll"><table className="estimateTable"><thead><tr>{['Ref','Section','Trade','Description','Qty','Unit','Materials','Plant','Labour','Unit rate','Total',''].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{estimate.items.map(x=><tr key={x.id}><td>{x.ref_no||'—'}</td><td>{x.work_section||'Measured Works'}</td><td>{x.trade}</td><td>{x.description}<small>{x.drawing||''}{x.rate_source?' · Rate: '+x.rate_source:''}{x.rate_checked_at?' · '+String(x.rate_checked_at).slice(0,10):''}</small></td><td>{x.quantity}</td><td>{x.unit}</td><td>{money(num(x.material_rate)*num(x.quantity))}</td><td>{money(num(x.plant_rate)*num(x.quantity))}</td><td>{money(num(x.labour_hours)*num(x.labour_rate)*num(x.quantity))}</td><td>{money(num(x.material_rate)+num(x.plant_rate)+num(x.labour_hours)*num(x.labour_rate))}</td><td>{money(perLine(x))}</td><td><button className="outline" type="button" onClick={()=>setEditingBoq(editingBoq===x.id?null:x.id)}>{editingBoq===x.id?'Close':'Edit'}</button><button className="outline" type="button" onClick={()=>patch('items',estimate.items.filter(y=>y.id!==x.id))}>Delete</button></td></tr>)}</tbody></table></div>
 {editingBoq&&estimate.items.some(x=>x.id===editingBoq)&&<div className="estimateForm" aria-label="Edit BOQ item">{(()=>{const row=estimate.items.find(x=>x.id===editingBoq);return <><h3>Edit BOQ item {row.ref_no||''}</h3>{[['description','Description'],['drawing','Drawing reference'],['quantity','Measured quantity'],['material_rate','Material rate £/unit'],['plant_rate','Plant rate £/unit'],['labour_hours','Labour hours/unit'],['labour_rate','Labour £/hour'],['supplier','Supplier'],['price_url','Merchant/source URL']].map(([key,label])=><label key={key}>{label}<input type={['quantity','material_rate','plant_rate','labour_hours','labour_rate'].includes(key)?'number':'text'} min={key==='quantity'?'0.00001':0} step="any" value={row[key]??''} onChange={e=>editBoq(row.id,key,e.target.value)}/></label>)}<p>Updated unit rate: {money(num(row.material_rate)+num(row.plant_rate)+num(row.labour_hours)*num(row.labour_rate))}. {row.rate_source?'Price source: '+row.rate_source+'. ':''}{row.rate_checked_at?'Recorded date: '+String(row.rate_checked_at).slice(0,10)+'. ':''}Recheck drawing quantities, material, labour and plant rates, availability and VAT before issue.</p><button type="button" onClick={()=>setEditingBoq(null)}>Finish editing</button></>})()}</div>}
 <h3>3. Prime Cost (PC) sums</h3><p className="muted">PC sums are allowances; attendance/profit is added only at the rate entered below, not through the general measured-work markup. Confirm VAT treatment and contract wording before issue.</p><div className="estimateForm">{[['description','PC item description'],['amount','Allowance (£)'],['attendance_percent','Attendance/profit (%)']].map(([k,l])=><label key={k}>{l}<input type={k==='description'?'text':'number'} min={k==='description'?undefined:0} step="any" value={pcDraft[k]} onChange={e=>setPcDraft(v=>({...v,[k]:e.target.value}))}/></label>)}<button type="button" onClick={()=>{if(!pcDraft.description.trim()||!(num(pcDraft.amount)>0)||num(pcDraft.attendance_percent)<0)return alert('Enter a description, positive PC allowance and non-negative attendance percentage');patch('pc_sums',[...(estimate.pc_sums||[]),{...pcDraft,id:crypto.randomUUID()}]);setPcDraft({description:'',amount:'',attendance_percent:'0'})}}>Add PC sum</button></div>{(estimate.pc_sums||[]).map(p=><div key={p.id} className="estimateToolbar"><span>{p.description} — {money(p.amount)} + {num(p.attendance_percent)}% = {money(num(p.amount)*(1+num(p.attendance_percent)/100))}</span><button className="outline" onClick={()=>patch('pc_sums',(estimate.pc_sums||[]).filter(x=>x.id!==p.id))}>Remove</button></div>)}<h3>4. Provisional sums</h3><p className="muted">Defined and undefined provisional sums are separately identified. Excluded sums are recorded but omitted from the quote total.</p><div className="estimateForm"><label>Description<input value={provisionalDraft.description} onChange={e=>setProvisionalDraft(v=>({...v,description:e.target.value}))}/></label><label>Allowance (£)<input type="number" min="0" step="any" value={provisionalDraft.amount} onChange={e=>setProvisionalDraft(v=>({...v,amount:e.target.value}))}/></label><label>Classification<select value={provisionalDraft.defined?'defined':'undefined'} onChange={e=>setProvisionalDraft(v=>({...v,defined:e.target.value==='defined'}))}><option value="undefined">Undefined</option><option value="defined">Defined</option></select></label><label><input type="checkbox" checked={provisionalDraft.include} onChange={e=>setProvisionalDraft(v=>({...v,include:e.target.checked}))}/> Include in quote total</label><button type="button" onClick={()=>{if(!provisionalDraft.description.trim()||!(num(provisionalDraft.amount)>0))return alert('Enter a description and positive allowance');patch('provisional_sums',[...(estimate.provisional_sums||[]),{...provisionalDraft,id:crypto.randomUUID()}]);setProvisionalDraft({description:'',amount:'',defined:false,include:true})}}>Add provisional sum</button></div>{(estimate.provisional_sums||[]).map(p=><div className="estimateToolbar" key={p.id}><span>{p.description} — {p.defined?'Defined':'Undefined'} — {money(p.amount)}</span><label><input type="checkbox" checked={p.include!==false} onChange={e=>patch('provisional_sums',estimate.provisional_sums.map(x=>x.id===p.id?{...x,include:e.target.checked}:x))}/> Include</label><button className="outline" onClick={()=>patch('provisional_sums',estimate.provisional_sums.filter(x=>x.id!==p.id))}>Remove</button></div>)}<h3>5. Dayworks</h3><p className="muted">Enter extended labour, material and plant allowances; the specified markup applies once to their combined value.</p><div className="estimateForm">{[['description','Description'],['labour','Labour (£)'],['materials','Materials (£)'],['plant','Plant (£)'],['markup','Markup (%)']].map(([k,l])=><label key={k}>{l}<input type={k==='description'?'text':'number'} min={k==='description'?undefined:0} step="any" value={dayworkDraft[k]} onChange={e=>setDayworkDraft(v=>({...v,[k]:e.target.value}))}/></label>)}<button type="button" onClick={()=>{if(!dayworkDraft.description.trim()||['labour','materials','plant','markup'].some(k=>num(dayworkDraft[k])<0))return alert('Enter a description and non-negative amounts');patch('dayworks',[...(estimate.dayworks||[]),{...dayworkDraft,id:crypto.randomUUID()}]);setDayworkDraft({description:'',labour:0,materials:0,plant:0,markup:0})}}>Add daywork</button></div>{(estimate.dayworks||[]).map(d=><div className="estimateToolbar" key={d.id}><span>{d.description}: {money((num(d.labour)+num(d.materials)+num(d.plant))*(1+num(d.markup)/100))}</span><button className="outline" onClick={()=>patch('dayworks',estimate.dayworks.filter(x=>x.id!==d.id))}>Remove</button></div>)}<h3>6. Summary & pricing</h3><div className="estimateForm"><label>Global adjustment across entire quotation (%)<input type="number" min="-100" max="500" step="0.1" value={estimate.global_adjustment??0} onChange={e=>patch('global_adjustment',Math.max(-100,Math.min(500,Number(e.target.value)||0)))}/></label><button type="button" className="outline" onClick={()=>patch('global_adjustment',0)}>Reset to 0%</button><small>Applied once to the full net quotation including PC sums, provisional sums, dayworks and contingency, before VAT. Positive increases; negative reduces. Existing rates stay unchanged.</small></div><div className="estimateForm">{[['overheads','Preliminaries/overheads %'],['profit','Profit %'],['vat','VAT %']].map(([k,l])=><label key={k}>{l}<input type="number" min="0" step="any" value={estimate[k]} onChange={e=>patch(k,e.target.value)}/></label>)}</div><div className="estimateForm"><label>Contingency type<select value={estimate.contingency_mode||'percent'} onChange={e=>patch('contingency_mode',e.target.value)}><option value="percent">Percentage</option><option value="lump">Lump sum (£)</option></select></label><label>Contingency {estimate.contingency_mode==='lump'?'£':'%'}<input type="number" min="0" step="any" value={estimate.contingency_value??0} onChange={e=>patch('contingency_value',e.target.value)}/></label></div><div className="estimateTotals"><span>Materials <b>{money(sum.materials)}</b></span><span>Plant <b>{money(sum.plant)}</b></span><span>Labour <b>{money(sum.labour)}</b></span><span>Overheads <b>{money(oh)}</b></span><span>Profit <b>{money(profit)}</b></span><span>PC sums + attendance <b>{money(pcTotal)}</b></span><span>Included provisional sums <b>{money(provisionalTotal)}</b></span><span>Dayworks <b>{money(dayworksTotal)}</b></span><span>Contingency <b>{money(contingency)}</b></span><span>Global adjustment ({num(estimate.global_adjustment)}%) <b>{money(globalAdjustment)}</b></span><span>Net <b>{money(subtotal)}</b></span><span>Inc VAT <b>{money(total)}</b></span></div>
 <h3>7. Client quotation</h3><div className="estimateForm">{[['quote_ref','Quote reference'],['quote_intro','Introductory letter'],['quote_scope','Editable scope of works'],['quote_payment_terms','Payment schedule / terms'],['quote_validity','Quotation validity'],['quote_exclusions','Exclusions'],['quote_terms','Terms and conditions']].map(([k,l])=><label key={k}>{l}<textarea rows={k==='quote_scope'?5:2} value={estimate[k]??''} onChange={e=>patch(k,e.target.value)}/></label>)}</div><p className="muted">Quotation is generated from the same live totals as the BoQ. Save a revision to preserve a snapshot of the pricing and terms; print/PDF output requires visual review.</p><h3>Saved quotation revisions</h3>{(estimate.quote_revisions||[]).map(q=><p key={q.id}>{new Date(q.saved_at).toLocaleString('en-GB')} — {q.reference} — {money(q.gross)} including VAT</p>)} {notice&&<p role="status" className="notice">{notice}</p>}</section>
}
