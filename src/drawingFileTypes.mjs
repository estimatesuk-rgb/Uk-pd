// The drawing number is often a reference (e.g. A-101 / P01), not a filename.
// Inspect the actual uploaded storage path before human-friendly labels.
const supported=new Set(['pdf','png','jpg','jpeg','webp']);
export function uploadedExtension(doc){
 for(const raw of [doc?.file_path,doc?.title,doc?.document_no]){
  const clean=String(raw||'').split(/[?#]/)[0];
  const match=clean.match(/\.([a-z0-9]+)$/i);
  if(match&&supported.has(match[1].toLowerCase()))return match[1].toLowerCase();
 }
 return '';
}
export function isCurrentDrawingFile(doc){
 return !!doc?.file_path&&doc?.status!=='Superseded'&&!!uploadedExtension(doc);
}
export function drawingDisplayName(doc){
 return String(doc?.document_no||doc?.title||doc?.file_path||'Drawing').trim();
}
