const xml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const rect=(x,y,w,h,fill,stroke='#263b53')=>'<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" fill="'+fill+'" stroke="'+stroke+'" stroke-width="1.5"/>';
const line=(x1,y1,x2,y2,color='#263b53',width=2)=>'<line x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'" stroke="'+color+'" stroke-width="'+width+'"/>';
const label=(x,y,s,size=13)=>'<text x="'+x+'" y="'+y+'" font-family="Arial,sans-serif" font-size="'+size+'" fill="#263b53">'+xml(s)+'</text>';
const dim=(x1,y1,x2,y2,value)=>line(x1,y1,x2,y2,'#b12a3b',1)+line(x1-5,y1-5,x1+5,y1+5,'#b12a3b',1)+line(x2-5,y2-5,x2+5,y2+5,'#b12a3b',1)+label((x1+x2)/2+8,(y1+y2)/2-7,value,12);
const get=(specs,key)=>{const v=specs?.[key];return v===undefined||v===null||String(v).trim()===''?'TBC':String(v)};
export function technicalSectionSvg(code,choice,specs={},project={}){
const a=[];let title='Design coordination section';
const c=String(code);
if(c==='01'||c==='02'){
title='FOUNDATION / DPC / WALL INTERFACE';
a.push(rect(170,65,65,190,'#d7b7a4'),rect(250,65,80,190,'#dce8f2'),rect(345,65,75,190,'#b7c7d4'));
a.push(rect(105,255,385,55,'#a9a9a9'),rect(90,310,420,85,'#e6ddc9'),line(90,235,510,235,'#b12a3b',4));
a.push(dim(105,420,490,420,get(specs,'Foundation width (mm)')+' mm foundation width'));
a.push(dim(70,255,70,395,get(specs,'Founding depth (mm)')+' mm founding depth'));
a.push(label(520,100,'Outer leaf / cavity / inner leaf'),label(520,165,'DPC / DPM junction'),label(520,285,'Concrete foundation'),label(520,355,'Founding stratum'));
}else if(['03','06'].includes(c)){
title='FLOOR BUILD-UP / PERIMETER';
a.push(rect(90,100,490,25,'#c6b7a5'),rect(90,125,490,65,'#dceac5'),rect(90,190,490,55,'#c3c3c3'),line(90,247,580,247,'#b12a3b',5),rect(90,252,490,95,'#dfd7c9'));
a.push(dim(65,100,65,347,'Overall floor build-up: verify'));
a.push(label(600,115,'Floor finish / screed'),label(600,160,'Insulation / void'),label(600,225,'Structural slab / deck'),label(600,255,'DPM / airtightness'),label(600,325,'Sub-base / ground'));
}else if(['04','05'].includes(c)){
title='WALL / OPENING SECTION';
a.push(rect(110,90,110,280,'#cba79a'),rect(220,90,135,280,'#dbe9f2'),rect(355,90,105,280,'#b9c7d2'));
a.push(line(105,310,465,310,'#b12a3b',5),dim(110,405,460,405,'Wall overall thickness: verify'));
a.push(label(510,140,'Outer leaf'),label(510,205,'Cavity / insulation'),label(510,265,'Inner leaf'),label(510,330,'DPC / cavity tray at junction'));
}else if(['07','08','09'].includes(c)){
title='PITCHED ROOF / EAVES JUNCTION';
a.push('<path d="M100 240 L415 65 L730 240" fill="none" stroke="#394b5e" stroke-width="20"/>');
a.push('<path d="M112 260 L415 92 L718 260" fill="none" stroke="#b6d3e2" stroke-width="16"/>');
a.push('<path d="M130 278 L415 123 L700 278" fill="none" stroke="#dceac5" stroke-width="24"/>');
a.push(rect(115,295,95,95,'#caa79a'),rect(220,295,80,95,'#dbe9f2'),rect(310,295,90,95,'#b9c7d2'));
a.push(label(495,65,'Roof covering / battens'),label(495,95,'Underlay / structural roof'),label(495,125,'Insulation / VCL continuity'),label(490,335,'Eaves / wall junction'));
a.push(dim(80,240,145,120,'Roof pitch: '+get(specs,'Roof pitch (degrees)')+' degrees'));
}else if(c==='11'){
title='BELOW-GROUND DRAINAGE';
a.push(line(80,95,790,95,'#677d91',4),'<path d="M95 210 L705 290" fill="none" stroke="#397e9e" stroke-width="25"/>',rect(100,130,70,180,'#dce8f2'),rect(690,175,70,165,'#dce8f2'));
a.push(label(200,160,'Pipe diameter, gradient and invert: confirm'),label(200,345,'Bedding, backfill and access points to drainage design'));
}else if(c==='10'){
title='WINDOW / CAVITY WALL - HEAD, JAMB AND SILL';
a.push(rect(100,95,95,255,'#cda998'),rect(195,95,130,255,'#dce9ed'),rect(325,95,95,255,'#acbbca'));
a.push(rect(80,180,365,100,'white'),rect(210,180,30,100,'#9eaeba'),rect(245,180,30,100,'#a9d5eb'),rect(275,180,30,100,'#a9d5eb'));
a.push(line(80,174,445,174,'#a92a3b',4),line(80,288,445,288,'#a92a3b',4));
a.push(label(480,112,'Outer leaf / cavity / inner leaf'),label(480,155,'Cavity tray / weeps at head: design'),label(480,215,'Lintel and bearing: engineer to confirm'),label(480,252,'Glazing specification and safety: check'),label(480,315,'Insulated closer / airtight seal'),label(480,350,'Sill projection, tray and drip detail'));
a.push(dim(105,398,420,398,'Opening / reveals: '+get(specs,'Opening size (mm)')));
}else if(c==='14'){
title='FIRE SAFETY - COMPARTMENT JUNCTION';
a.push(rect(120,90,260,45,'#babfc8'),rect(120,135,90,230,'#cba999'),rect(210,135,80,230,'#e3e8ee'),rect(290,135,90,230,'#b9c7d2'));
a.push(line(115,135,385,135,'#b12a3b',6),rect(195,128,110,26,'#f2b67a'),line(210,150,290,150,'#b12a3b',3));
a.push(label(440,120,'Floor / wall fire separation: confirm'),label(440,170,'Cavity barrier / fire-stop at junction'),label(440,225,'Continuity around services and penetrations'),label(440,280,'Fire resistance rating: '+get(specs,'Fire resistance')),label(440,325,'Fire strategy and Part B assessment needed'));
}else if(c==='16'){
title='STAIR SECTION - GOING, RISE AND HEADROOM';
a.push('<path d="M110 360 H220 V305 H330 V250 H440 V195 H550 V140 H690" fill="none" stroke="#687b8c" stroke-width="17"/>');
a.push(line(110,85,710,85),line(110,365,110,85,'#78909c',1));
a.push(dim(110,405,220,405,'Going: '+get(specs,'Going (mm)')),dim(70,305,70,360,'Rise: '+get(specs,'Rise (mm)')));
a.push(label(580,225,'Guarding / handrail: detail required'),label(580,265,'Headroom and pitch: verify'),label(580,305,'Landing geometry: verify'),label(580,345,'Part K / Part M applicability: check'));
}else if(c==='12'){
title='VENTILATION - ROOM EXTRACT / AIR PATH';
a.push(rect(135,100,400,250,'#edf2f5'),line(135,350,535,350),rect(425,110,70,50,'#d6e8f3'));
a.push('<path d="M230 300 C280 265 335 265 380 235" stroke="#3c8496" stroke-width="5" fill="none"/><path d="M365 226 L385 230 L376 248" stroke="#3c8496" stroke-width="4" fill="none"/>');
a.push(line(460,135,700,135,'#3c8496',10),label(550,112,'Duct discharge outdoors'),label(545,195,'Fan airflow / run-on: confirm'),label(545,235,'Duct size / insulation: verify'),label(545,275,'Background / transfer air path: design'),label(545,320,'Commissioning evidence required'));
}else{
title='PROJECT DESIGN COORDINATION';
a.push(rect(110,100,600,250,'#eef3f7'),line(110,180,710,180),line(110,260,710,260));
a.push(label(140,155,'Selected system: '+String(choice||'UNCONFIRMED').slice(0,64)),label(140,225,'Design dimensions and installation requirements: TBC'),label(140,305,'See technical specification schedule and approved drawings'));
}
const lines=Object.entries(specs||{}).filter(([,v])=>String(v||'').trim()).slice(0,4);
const footer=lines.map(([k,v],i)=>label(90,470+i*23,k+': '+String(v).slice(0,80),12)).join('');
return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 920 590" role="img" aria-label="'+xml(title)+'" style="display:block;width:100%;max-height:440px;background:white"><rect x="1" y="1" width="918" height="588" fill="#fff" stroke="#263b53" stroke-width="2"/>'+label(35,40,title,20)+a.join('')+footer+label(35,575,'DESIGN DEVELOPMENT / REVIEW - NOT TO SCALE - NOT FOR CONSTRUCTION',14)+'</svg>';
}
