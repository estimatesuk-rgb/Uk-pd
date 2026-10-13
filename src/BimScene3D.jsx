import React,{useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';

const material={
 slab:()=>new THREE.MeshStandardMaterial({color:0xbcc8d1,roughness:.82,metalness:.04}),
 wall:()=>new THREE.MeshStandardMaterial({color:0xd6dcd9,roughness:.87}),
 roof:()=>new THREE.MeshStandardMaterial({color:0x536a87,roughness:.72,side:THREE.DoubleSide}),
 door:()=>new THREE.MeshStandardMaterial({color:0x9b643e,roughness:.65}),
 window:()=>new THREE.MeshStandardMaterial({color:0x65bada,transparent:true,opacity:.62,
  roughness:.2,metalness:.1,depthWrite:false,side:THREE.DoubleSide})
};
function shape3D(el){
 const path=new THREE.Shape();
 el.outline.forEach((p,i)=>i?path.lineTo(p.x,p.y):path.moveTo(p.x,p.y));
 path.closePath();
 for(const inner of el.holes||[]){
  const hole=new THREE.Path();
  [...inner].reverse().forEach((p,i)=>i?hole.lineTo(p.x,p.y):hole.moveTo(p.x,p.y));
  hole.closePath();path.holes.push(hole);
 }
 const geometry=new THREE.ExtrudeGeometry(path,{depth:el.depth,bevelEnabled:false,
  curveSegments:1,steps:1});
 if(el.element==='roof'){
  const vals=el.outline.map(p=>p[el.slope_axis]);
  const low=Math.min(...vals),span=Math.max(...vals)-low;
  const attribute=geometry.getAttribute('position');
  for(let i=0;i<attribute.count;i++){
   const x=attribute.getX(i),y=attribute.getY(i);
   const z=attribute.getZ(i);
   attribute.setZ(i,z+el.base_m+el.rise_m*((el.slope_axis==='x'?x:y)-low)/span);
  }
  attribute.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingBox();
 }else{
  geometry.translate(0,0,el.base_m);
 }
 return geometry;
}
function buildSceneGeometry(elements,group){
 const solids=new Map();
 for(const el of elements){
  if(el.element==='roof'||el.element==='slab'){
   const mesh=new THREE.Mesh(shape3D(el),material[el.element]());
   mesh.userData={id:el.id,name:el.name,type:el.element};
   group.add(mesh);solids.set(el.id,mesh);
   const edges=new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry),
     new THREE.LineBasicMaterial({color:el.element==='roof'?0x24374b:0x63798a,transparent:true,opacity:.5}));
   group.add(edges);
  }
 }
 const hosted=new Map();
 for(const el of elements.filter(x=>x.element==='door'||x.element==='window')){
  const groupForHost=hosted.get(el.host_id)||[];
  groupForHost.push(el);hosted.set(el.host_id,groupForHost);
 }
 for(const el of elements.filter(x=>x.element==='wall')){
  const [a,b,c,d]=el.outline;
  if(!a||!b||!c||!d)continue;
  const start={x:(a.x+d.x)/2,y:(a.y+d.y)/2};
  const end={x:(b.x+c.x)/2,y:(b.y+c.y)/2};
  const length=Math.hypot(end.x-start.x,end.y-start.y);
  const thickness=Math.hypot(a.x-d.x,a.y-d.y);
  if(length<.02||thickness<=0)continue;
  const angle=Math.atan2(end.y-start.y,end.x-start.x);
  const axis={x:(end.x-start.x)/length,y:(end.y-start.y)/length};
  function block(from,to,bottom,top,element=el){
   if(to-from<=.001||top-bottom<=.001)return;
   const mesh=new THREE.Mesh(new THREE.BoxGeometry(to-from,thickness,top-bottom),
     material[element.element]());
   const dist=(from+to)/2;
   mesh.position.set(start.x+axis.x*dist,start.y+axis.y*dist,el.base_m+(bottom+top)/2);
   mesh.rotation.z=angle;
   mesh.userData={name:element.name,type:element.element,id:element.id};
   group.add(mesh);solids.set(element.id,mesh);
  }
  const openings=[...(hosted.get(el.id)||[])].sort((a,b)=>a.offset_m-b.offset_m);
  let cursor=0;
  for(const opening of openings){
   block(cursor,opening.offset_m,0,el.depth);
   block(opening.offset_m,opening.offset_m+opening.width_m,0,opening.sill_m);
   block(opening.offset_m,opening.offset_m+opening.width_m,
    opening.sill_m+opening.height_m,el.depth);
   // Geometry is genuinely absent in the cutout. Window/door fill is a
   // separate, thin panel centred in the verified host opening.
   const centre=opening.offset_m+opening.width_m/2;
   const depth=Math.min(thickness*.45,.1);
   const fill=new THREE.Mesh(new THREE.BoxGeometry(opening.width_m,depth,opening.height_m),
     material[opening.element]());
   fill.position.set(start.x+axis.x*centre,start.y+axis.y*centre,
     el.base_m+opening.sill_m+opening.height_m/2);
   fill.rotation.z=angle;
   fill.userData={name:opening.name,type:opening.element,id:opening.id};
   group.add(fill);solids.set(opening.id,fill);
   cursor=opening.offset_m+opening.width_m;
  }
  block(cursor,length,0,el.depth);
 }
 return solids;
}
export default function BimScene3D({elements=[]}){
 const container=useRef(null),[error,setError]=useState(''),[picked,setPicked]=useState(null);
 useEffect(()=>{
  const host=container.current;
  if(!host||!elements.length)return;
  let renderer,controls,frame=0,observer;
  const scene=new THREE.Scene();
  scene.background=new THREE.Color(0xf1f5fa);
  const camera=new THREE.PerspectiveCamera(48,1,.05,2000);
  camera.up.set(0,0,1);
  const group=new THREE.Group();scene.add(group);
  try{
   renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});
   renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
   renderer.outputColorSpace=THREE.SRGBColorSpace;
   host.appendChild(renderer.domElement);
   controls=new OrbitControls(camera,renderer.domElement);
   controls.enableDamping=true;
   const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(20,-20,35);scene.add(light);
   scene.add(new THREE.HemisphereLight(0xffffff,0xa6b5bf,1.2));
   buildSceneGeometry(elements,group);
   const box=new THREE.Box3().setFromObject(group);
   if(box.isEmpty())throw Error('No renderable architectural geometry yet');
   const centre=box.getCenter(new THREE.Vector3());
   const size=box.getSize(new THREE.Vector3()),radius=Math.max(size.length(),5);
   const grid=new THREE.GridHelper(Math.max(10,Math.ceil(radius/5)*5),20,0xb1c1d3,0xdce4ed);
   grid.rotation.x=Math.PI/2;grid.position.z=Math.min(box.min.z,0)-.03;scene.add(grid);
   camera.position.set(centre.x+radius*.9,centre.y-radius*1.1,centre.z+radius*.75);
   controls.target.copy(centre);controls.maxDistance=radius*8;
   controls.update();
   const resize=()=>{
    const width=Math.max(260,host.clientWidth),height=Math.max(260,host.clientHeight);
    camera.aspect=width/height;camera.updateProjectionMatrix();renderer.setSize(width,height);
   };
   observer=new ResizeObserver(resize);observer.observe(host);resize();
   const raycaster=new THREE.Raycaster(),mouse=new THREE.Vector2();
   const click=e=>{
    const rect=renderer.domElement.getBoundingClientRect();
    mouse.set((e.clientX-rect.left)/rect.width*2-1,
      -(e.clientY-rect.top)/rect.height*2+1);
    raycaster.setFromCamera(mouse,camera);
    const hit=raycaster.intersectObjects(group.children,false)
      .find(x=>x.object.userData?.id);
    setPicked(hit?.object.userData||null);
   };
   renderer.domElement.addEventListener('click',click);
   const tick=()=>{frame=requestAnimationFrame(tick);controls.update();renderer.render(scene,camera)};
   tick();setError('');
   return ()=>{
    cancelAnimationFrame(frame);observer?.disconnect();
    renderer?.domElement.removeEventListener('click',click);
    controls?.dispose();
    scene.traverse(obj=>{if(obj.isMesh||obj.isLineSegments){
     obj.geometry?.dispose();if(Array.isArray(obj.material))obj.material.forEach(m=>m.dispose());
     else obj.material?.dispose();
    }});
    renderer?.dispose();renderer?.domElement.remove();};
  }catch(e){
   setError('3D preview unavailable: '+String(e.message||e)+
    '. Your checked IFC export remains available.');
   observer?.disconnect();controls?.dispose();renderer?.dispose();
   renderer?.domElement.remove();
  }
 },[elements]);
 return <div style={{margin:'12px 0'}}>
  <strong>Interactive 3D building preview</strong>
  <p className="muted">Drag to orbit · scroll/pinch to zoom · tap a component to identify it. Only verified IFC elements are shown; missing walls/roof are not invented.</p>
  <div ref={container} role="img" aria-label="Orbitable verified BIM roof, walls, floors, doors and windows"
   style={{height:380,width:'100%',border:'1px solid #cad5e2',borderRadius:10,overflow:'hidden'}}/>
  {picked&&<p role="status"><strong>{picked.name}</strong> — {picked.type}</p>}
  {error&&<p role="alert">{error}</p>}
 </div>;
}
