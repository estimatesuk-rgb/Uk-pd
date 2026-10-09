import React,{useState,useEffect} from 'react';
const DETAILS=[
{id:'F01',title:'Strip foundation and cavity wall',parts:['Concrete strip footing — width/depth to structural engineer and ground assessment','Loadbearing masonry centred on foundation; below-ground blocks to specification','DPC minimum 150 mm above finished external ground level','Continuous cavity insulation and proprietary insulated cavity closer','DPM lapped and sealed to DPC; radon/gas measures subject to site assessment'],checks:['Ground bearing capacity and tree influence','Foundation width/depth by engineer and Building Control','Drain proximity and services','Cavity dimensions, insulation and wall ties']},
{id:'W01',title:'Insulated cavity wall and opening',parts:['External facing masonry / ventilated drained cavity where specified','Insulation thickness and conductivity from approved U-value calculation','Internal loadbearing leaf and internal finish as designed','Insulated cavity closer, cavity tray, stop ends and weep vents at openings','Lintel to structural schedule; cavity barriers and fire stopping as applicable'],checks:['Wall U-value calculation and condensation assessment','Lintel load and bearing','Exposure zone and cavity specification','Opening head/sill/jamb thermal bridging']},
{id:'G01',title:'Ground-bearing insulated floor',parts:['Compacted suitable sub-base and blinding as designed','DPM / gas membrane with sealed laps and junction to wall DPC','Concrete slab thickness and reinforcement subject to engineer','Floor insulation to verified Part L specification; perimeter upstand','Screed / finish with movement joints as specified'],checks:['Ground gas and moisture conditions','Insulation U-value and compressive strength','Slab design and floor levels','Thermal bridge at wall perimeter']},
{id:'R01',title:'Pitched roof eaves and ridge',parts:['Roof tiles rated for actual pitch and exposure; fixings to manufacturer design','Battens and underlay to current applicable standards','Rafters/trusses and restraint straps to structural design','Insulation continuity at eaves with ventilation provision as designed','Ceiling vapour control and airtightness layer; sealed penetrations'],checks:['Actual roof pitch and tile minimum pitch','Roof U-value and condensation risk','Ventilation strategy: cold or warm roof','Fire stopping, party-wall junction and structural restraint']},
{id:'D01',title:'Below-ground drainage junction',parts:['Foul and surface drainage kept separate unless approved otherwise','Pipe sizes, falls and bedding to approved drainage design','Access chambers at changes of direction and suitable maintenance points','Sealed connection to existing system subject to survey and approval','Sleeves, lintels and flexible joints at building penetrations'],checks:['Invert levels and outfall capacity','Drainage authority approval and build-over consent','Pipe gradients and cover','Testing and inspection before backfill']}
];

// Detail register: each variation is a separately selectable drawing-sheet entry.
// All dimensions and performance values remain design-dependent until reviewed.
const GROUPS=[
['A','Foundations',['Trench-fill foundation','Raft foundation','Piled foundation and ground beam','Stepped foundation','Foundation near existing drains','Foundation adjacent to existing building','Foundation near trees','Foundation at change in ground level','Foundation with retaining wall']],
['B','Ground floors',['Suspended timber floor','Beam-and-block floor','Suspended concrete slab','Insulated solid floor','Existing floor thermal upgrade','Floor DPM to wall DPC junction','Floor gas membrane junction','Level-access threshold','Garage floor junction']],
['C','External walls',['Brick and block cavity wall','Full-fill insulated cavity wall','Partial-fill insulated cavity wall','Timber-frame external wall','Solid masonry wall insulation','External wall insulation','Internal wall insulation','Cavity tray over opening','Cavity tray at abutment','Movement joint','Wall tie arrangement','Cavity barrier at floor','Cavity barrier at roof','Wall base and DPC','Parapet wall']],
['D','Internal walls',['Loadbearing block partition','Timber stud partition','Metal stud partition','Acoustic partition','Fire-resisting partition','Wall to floor junction','Wall to roof junction','Service penetration through wall']],
['E','Upper floors',['Solid timber joist floor','Engineered I-joist floor','Metal-web joist floor','Steel beam supporting floor','Joist hanger bearing','Stairwell opening trimming','Floor acoustic separation','Floor fire protection','Floor to external wall junction']],
['F','Roofs',['Cold pitched roof eaves','Warm pitched roof','Vaulted roof insulation','Low-pitch tiled roof','Pitched roof ridge','Pitched roof verge','Pitched roof valley','Pitched roof abutment','Pitched roof chimney flashing','Rooflight head and sill','Warm flat roof','Cold flat roof','Inverted flat roof','Flat roof parapet','Flat roof outlet','Roof terrace','Dormer cheek','Dormer roof junction','Party-wall roof junction','Solar panel roof penetration']],
['G','Doors and windows',['Window head','Window jamb','Window sill','Door head','Door jamb','External door threshold','Cavity closer','Fire door frame','Roof window','Escape window','Glazed safety barrier']],
['H','Stairs and guarding',['Straight flight stairs','Winder stairs','Quarter landing','Half landing','Stair headroom','Stair guarding','Balustrade fixing','Handrail return','External access steps']],
['J','Drainage',['Foul drainage trench','Surface water drainage trench','Inspection chamber','Manhole','Drain through foundation','Drain beneath building','Rainwater downpipe','Soakaway','Attenuation crate','Channel drain','Below-ground connection','Above-ground soil stack','Air admittance valve','Drainage ventilation terminal']],
['K','Fire safety',['Cavity barrier at opening','Cavity barrier at compartment line','Fire stopping around pipe','Fire stopping around cable','Fire stopping at floor edge','Fire-rated wall junction','Compartment floor','Protected stair enclosure','Fire door installation','Smoke alarm location','Roof-space compartment barrier']],
['L','Thermal and airtightness',['Wall to foundation thermal bridge','Wall to floor thermal bridge','Wall to roof thermal bridge','Window reveal insulation','Door threshold insulation','Balcony thermal break','Airtightness at service penetration','Vapour control layer junction','Insulation continuity at eaves']],
['M','Ventilation',['Kitchen extract duct','Bathroom extract duct','Background ventilator','Continuous mechanical extract','MVHR supply and extract','Roof duct terminal','Wall duct terminal','Subfloor ventilation','Roof void ventilation','Ventilation fire damper']],
['N','Plumbing and heating',['Hot and cold water distribution','Unvented hot water cylinder','Boiler flue penetration','Air source heat pump connection','Underfloor heating build-up','Radiator pipe penetration','Condensate discharge','Sanitary appliance drainage','Water service entry']],
['P','Electrical',['Consumer unit location','Electrical cable in wall','Electrical cable through fire barrier','Recessed downlight fire protection','External electrical supply','EV charger connection','Smoke and heat alarm wiring','Electrical service entry']],
['Q','External works',['Level-access path','External ramp','Retaining wall','Patio to DPC junction','Paving and surface drainage','Boundary wall','Garden steps','External drainage channel']],
['R','Existing buildings',['New extension to existing wall','New roof to existing roof','Existing wall opening and beam','Chimney removal and support','Loft conversion floor','Loft conversion dormer','Existing damp wall remediation','Existing roof insulation upgrade','Party wall junction','Existing foundations underpinning']]
];
const REGISTER=GROUPS.flatMap(([group,category,names])=>names.map((name,i)=>({id:group+String(i+1).padStart(2,'0'),category,title:name,group})));
const genericSpecification=['Confirm the relevant existing and proposed drawing geometry, levels and dimensions before selecting this detail.','Specify products and construction build-up only after checking the applicable Approved Documents, manufacturer instructions and exposure conditions.','Provide continuous moisture, thermal, air and fire-control layers where applicable; coordinate interfaces with adjoining elements.','Obtain structural calculations and connection design where loads, spans, bearings or ground conditions are involved.'];
const genericChecks=['Design responsibility and site-specific applicability','Measured dimensions and levels','Part L performance / condensation where relevant','Fire, acoustic, moisture and accessibility requirements where relevant','Building Control inspection and specialist sign-off'];
const dim=(x1,y1,x2,y2,label)=> <g stroke="#9b2431" strokeWidth="1" fill="#9b2431"><line x1={x1} y1={y1} x2={x2} y2={y2}/><text x={(x1+x2)/2+5} y={(y1+y2)/2-5} fontSize="10" stroke="none">{label}</text></g>;
function Drawing({id}){const common={stroke:'#17365d',strokeWidth:2,fill:'none'};return <svg viewBox="0 0 650 300" role="img" aria-label={'Indicative construction section '+id} style={{width:'100%',background:'#fff',border:'1px solid #ccd6e1'}}>
<g {...common}>{id==='F01'?<><rect x="210" y="65" width="55" height="150"/><rect x="320" y="65" width="55" height="150"/><rect x="175" y="215" width="235" height="55" fill="#e7edf4"/><path d="M265 65 V215 M320 65 V215" strokeDasharray="6 4"/><path d="M180 92 H410" stroke="#9b2431" strokeWidth="4"/><path d="M180 125 H210 M375 125 H410" strokeDasharray="4 4"/></>:id==='W01'?<><rect x="195" y="40" width="55" height="210"/><rect x="320" y="40" width="55" height="210"/><rect x="250" y="40" width="70" height="210" fill="#e8f0f5"/><rect x="180" y="120" width="215" height="20" fill="#cad6e4"/><path d="M250 85 H320 M250 185 H320" strokeDasharray="5 5"/><path d="M180 145 H395" stroke="#9b2431" strokeWidth="3"/></>:id==='G01'?<><rect x="125" y="145" width="410" height="42" fill="#d4dce5"/><rect x="125" y="187" width="410" height="32" fill="#dce9f1"/><rect x="125" y="219" width="410" height="42" fill="#e9e9e9"/><path d="M125 186 H535" stroke="#9b2431" strokeWidth="3"/><rect x="130" y="80" width="45" height="65"/><rect x="485" y="80" width="45" height="65"/></>:id==='R01'?<><path d="M120 200 L325 45 L530 200"/><path d="M120 215 L325 60 L530 215" stroke="#9b2431" strokeWidth="3"/><path d="M155 200 H495"/><path d="M160 188 H490" strokeDasharray="5 4"/><path d="M200 175 V235 M450 175 V235"/><path d="M200 235 H450"/></>:<><rect x="95" y="105" width="460" height="100" fill="#e8edf2"/><path d="M95 165 H555" stroke="#9b2431" strokeWidth="4"/><path d="M165 165 V235 H260 V165 M400 165 V235 H490 V165"/><circle cx="260" cy="165" r="9"/><circle cx="400" cy="165" r="9"/></>}</g>
{dim(80,55,80,255,'VERIFY ON DESIGN') }<text x="115" y="285" fill="#9b2431" fontSize="12" fontWeight="bold">SCHEMATIC ONLY • NOT TO SCALE • NOT FOR CONSTRUCTION</text></svg>}


const MATERIAL_NOTES={
A:['Ground investigation and bearing capacity','Foundation concrete and reinforcement as designed','Depth to competent stratum and frost/tree influence','DPC / DPM and gas protection junction'],
B:['Sub-base or joist support and structural design','Floor insulation conductivity, thickness and compressive strength','Moisture / gas barrier continuity','Floor finish, level and perimeter thermal bridge'],
C:['External leaf, cavity, insulation and inner leaf specifications','Wall tie type and spacing per structural/exposure design','Cavity tray, closer, DPC and weep provision','Calculated U-value, condensation and thermal bridge'],
D:['Partition construction and fixing','Fire and acoustic performance if required','Deflection head and junction seal','Service penetrations and restraint'],
E:['Joist or slab structural calculations','Bearing, restraint and lateral stability','Fire and acoustic performance','Services, openings and movement'],
F:['Actual pitch and covering manufacturer minimum pitch','Structure and restraint design','Insulation and vapour-control continuity','Underlay, ventilation, flashings and fire barriers'],
G:['Opening size and structural lintel design','Frame fixings, weathering and airtightness','Insulated reveals, closers and thermal bridge','Safety glazing, escape and accessibility'],
H:['Rise, going, pitch and clear width','Headroom and landing geometry','Guarding and handrail heights','Fire escape and accessibility where applicable'],
J:['Pipe diameter, gradient, cover and bedding','Access and rodding provision','Outfall approval and invert levels','Air / water testing and separation'],
K:['Required fire resistance period and tested assembly','Fire stopping system and substrate compatibility','Continuity of compartmentation','Inspection, photographs and certification'],
L:['Target elemental U-value and verified build-up','Insulation lambda, thickness and fixings','Junction psi-value / thermal bridging','Airtightness and condensation checks'],
M:['Required ventilation flow rate and strategy','Duct route, insulation and terminals','Noise, fire and condensation control','Commissioning and test evidence'],
N:['Equipment selection and installation design','Pipework and insulation','Fire and acoustic seals at penetrations','Commissioning, safety and certification'],
P:['Electrical design and circuit protection','Safe zones and cable routing','Penetration fire stopping','Inspection and test certification'],
Q:['Levels, falls, accessibility and slip resistance','Drainage and retaining design','DPC clearance and waterproofing','External materials and frost exposure'],
R:['Existing structure survey and opening-up','Temporary works and structural design','New-to-existing damp, air and thermal junctions','Fire, sound and building control upgrade scope']
};
const PRE_ISSUE=['Confirm project address, drawing revision and the selected element actually exists in the scheme.','Record material manufacturer, product designation and build-up thicknesses.','Check current applicable regulations, standards and statutory guidance for this project.','Provide structural engineer design and approval where required.','Check insulation U-value / condensation / thermal bridges when applicable.','Resolve all drawing interfaces and Building Control comments before issuing for construction.'];
function TypologySection({detail}) {
const g=detail.group;
const stroke='#17365d',red='#a32939',blue='#6b9db9';
const line=(x1,y1,x2,y2,key,colour=stroke,dash)=> <line key={key} x1={x1} y1={y1} x2={x2} y2={y2} stroke={colour} strokeWidth="2" strokeDasharray={dash}/>;
const rect=(x,y,w,h,key,fill='#e5edf4')=><rect key={key} x={x} y={y} width={w} height={h} stroke={stroke} strokeWidth="2" fill={fill}/>;
let shapes=[];
if(['A','B','L','Q'].includes(g)){shapes=[rect(95,192,450,62,'ground','#edf0f2'),rect(190,90,56,102,'wall'),rect(395,90,56,102,'wall2'),rect(160,170,320,22,'slab','#c9d7e3'),line(150,170,485,170,'dpm',red),line(246,90,395,90,'thermal',blue,'7 4')];if(g==='A')shapes.push(rect(160,192,320,35,'footing','#c8d0da'))}
else if(['C','D','K','G'].includes(g)){shapes=[rect(180,35,75,218,'leaf1'),rect(315,35,75,218,'leaf2'),rect(255,35,60,218,'insulation','#dbeaf2'),line(160,130,415,130,'barrier',red),line(255,85,315,85,'tie',stroke,'6 4')];if(g==='G')shapes.push(rect(220,95,130,120,'opening','#fff'))}
else if(['E','H'].includes(g)){shapes=[rect(105,170,445,25,'floor'),rect(150,195,28,52,'joist'),rect(285,195,28,52,'joist'),rect(420,195,28,52,'joist'),line(105,165,550,165,'membrane',red)];if(g==='H')shapes=[line(125,235,225,235,'st1'),line(225,235,225,190,'r1'),line(225,190,325,190,'st2'),line(325,190,325,145,'r2'),line(325,145,425,145,'st3'),line(425,145,425,100,'r3'),line(425,100,525,100,'st4')]}
else if(g==='F'){shapes=[line(105,205,325,50,'slope1'),line(325,50,545,205,'slope2'),line(105,218,325,63,'roof1',red),line(325,63,545,218,'roof2',red),line(165,205,485,205,'ceiling'),line(165,195,485,195,'vapour',blue,'6 3'),line(205,175,205,235,'support1'),line(445,175,445,235,'support2')]}
else if(['J','M','N','P'].includes(g)){shapes=[rect(90,70,470,160,'building','#f1f5f8'),line(110,155,540,155,'service',g==='P'?red:blue),line(230,155,230,95,'riser'),line(400,155,400,95,'riser2'),rect(215,80,30,20,'outlet','#fff'),rect(385,80,30,20,'outlet2','#fff')]}
else{shapes=[rect(105,105,430,120,'context'),line(125,170,515,170,'interface',red),line(325,75,325,240,'junction',blue,'5 5')]}
return <svg viewBox="0 0 650 320" role="img" aria-label={'Conceptual diagram for '+detail.title} style={{width:'100%',background:'#fff',border:'1px solid #ccd6e1'}}>
<text x="22" y="25" fontSize="14" fontWeight="bold" fill={stroke}>{detail.id} · {detail.category.toUpperCase()}</text>
{shapes}
<g fill={stroke} fontSize="11"><text x="22" y="270">Diagram shows a typical element arrangement only.</text><text x="22" y="285">Not a scaled or dimensioned detail; variants require competent design.</text></g>
<text x="22" y="307" fill={red} fontSize="12" fontWeight="bold">CONCEPT SECTION · NOT TO SCALE · NOT FOR CONSTRUCTION</text>
</svg>
}
export default function ConstructionDetails({project}) {
const [notes,setNotes]=useState({}),[specs,setSpecs]=useState({}),[search,setSearch]=useState(''),[group,setGroup]=useState('ALL'),[selected,setSelected]=useState([]),[showRegister,setShowRegister]=useState(true);
const draftKey='ukpd-construction-details:'+String(project?.id||'unassigned');
const [draftStatus,setDraftStatus]=useState('Not saved');
useEffect(()=>{
 try{
  const raw=localStorage.getItem(draftKey);
  if(raw){const d=JSON.parse(raw);setNotes(d.notes||{});setSpecs(d.specs||{});setSelected(Array.isArray(d.selected)?d.selected:[]);setDraftStatus('Draft restored');}
  else{setNotes({});setSpecs({});setSelected([]);setDraftStatus('Not saved');}
 }catch(err){setDraftStatus('Local storage unavailable');}
},[draftKey]);
function saveDraft(){
 try{localStorage.setItem(draftKey,JSON.stringify({selected,notes,specs,savedAt:new Date().toISOString()}));setDraftStatus('Saved in this browser');}
 catch(err){setDraftStatus('Save failed');}
}
const all=[...DETAILS.map(x=>({...x,category:'Core sections',group:'0'})),...REGISTER];
const shown=all.filter(x=>(group==='ALL'||x.group===group)&&(!search||[x.id,x.title,x.category].join(' ').toLowerCase().includes(search.toLowerCase())));
const chosen=all.filter(x=>selected.includes(x.id));
function toggle(id){setSelected(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id])}
return <section className="panel constructionDetails">
<style>{`@media print {.constructionDetails .controls,.constructionDetails button,.constructionDetails input,.constructionDetails select,.constructionDetails textarea{display:none!important}.constructionDetails article{break-inside:avoid;page-break-after:always}.constructionDetails{font-family:Arial,sans-serif}.constructionDetails h2{color:#17365d}.constructionDetails article{border:0!important}}`}</style>
<h2>Architectural Construction Detail Library</h2>
<p><b>{all.length} registered construction detail types</b> across foundations, floors, walls, roofs, fire, drainage, services and alterations. Five core types include indicative schematic sections; the remainder have typology diagrams, material schedules and review fields. These are not individually engineered details.</p>
<p><b>Important:</b> Register entries are not dimensioned construction drawings. Every sheet is preliminary and requires project-specific architect / engineer design, applicable regulatory checks and Building Control review.</p>
<div className="controls" style={{display:'flex',gap:12,flexWrap:'wrap',margin:'15px 0'}}>
<input aria-label="Search details" placeholder="Search detail number or construction element" value={search} onChange={e=>setSearch(e.target.value)}/>
<select aria-label="Detail category" value={group} onChange={e=>setGroup(e.target.value)}><option value="ALL">All categories</option><option value="0">Core illustrated sections</option>{GROUPS.map(g=><option key={g[0]} value={g[0]}>{g[0]} — {g[1]}</option>)}</select>
<button type="button" onClick={()=>setShowRegister(v=>!v)}>{showRegister?'Hide':'Show'} detail register</button>
<button type="button" onClick={saveDraft}>Save draft</button><button type="button" onClick={()=>window.print()}>Print / Save PDF</button>
</div>
<p className="controls"><small>{draftStatus} · Saved drafts remain on this device only, not in the project database.</small></p>{showRegister&&<div className="controls" style={{maxHeight:350,overflowY:'auto',border:'1px solid #ccd6e1',padding:12}}>{shown.map(d=><label key={d.id} style={{display:'block',marginBottom:8}}><input type="checkbox" checked={selected.includes(d.id)} onChange={()=>toggle(d.id)}/> <b>{d.id}</b> — {d.title} <small>({d.category})</small></label>)}</div>}
<h3>Selected drawing sheets ({chosen.length})</h3>
{!chosen.length&&<p>Select the details relevant to this project from the register above. No assumptions are made about which construction systems the project uses.</p>}
{chosen.map(d=><article key={d.id} style={{pageBreakInside:'avoid',margin:'28px 0',padding:18,border:'1px solid #ccd6e1'}}>
<div className="detailSheetHeader" style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:16,borderBottom:'2px solid #17365d',paddingBottom:12,marginBottom:12}}>
<img src="/ukpd-logo.jpg" alt="UK Principal Designers Ltd logo" style={{width:165,maxWidth:'36%',height:'auto',objectFit:'contain'}}/>
<div style={{textAlign:'right'}}><b>UK PRINCIPAL DESIGNERS LTD</b><div>BUILDING REGULATIONS · CONSTRUCTION DETAILS</div><small>PRELIMINARY DESIGN REVIEW · NOT FOR CONSTRUCTION</small></div>
</div>
<h3>{d.id} — {d.title}</h3>
<p><b>Project:</b> {project?.name||'Project not named'} · <b>Drawing:</b> UKPD-{d.id} · <b>Revision:</b> P01 · <b>Status:</b> Design review</p>
{d.group==='0'?<Drawing id={d.id}/>:<TypologySection detail={d}/>}
<h4>Construction specification / design prompts</h4><ol>{(d.parts||genericSpecification).map(x=><li key={x}>{x}</li>)}</ol>
<h4>Element-specific material and technical schedule</h4><ul>{(MATERIAL_NOTES[d.group]||genericSpecification).map(x=><li key={x}>{x}</li>)}</ul>
<div className="controls" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:10,marginBottom:14}}>
{[['reference','Drawing / plan reference'],['buildUp','Approved material build-up'],['dimensions','Verified dimensions (mm)'],['uValue','Calculated U-value (W/m²K)'],['reviewer','Competent designer / reviewer'],['approval','Building Control / engineer status']].map(([key,label])=><label key={key}>{label}<input value={specs[d.id]?.[key]||''} onChange={e=>setSpecs(prev=>({...prev,[d.id]:{...(prev[d.id]||{}),[key]:e.target.value}}))} placeholder="Unconfirmed"/></label>)}
</div>
<h4>Pre-issue design gate</h4><ul>{PRE_ISSUE.map(x=><li key={x}>{x}</li>)}</ul>
<h4>Design confirmations before issue</h4><ul>{(d.checks||genericChecks).map(x=><li key={x}>{x}</li>)}</ul>
<label className="controls">Review notes<textarea rows="3" value={notes[d.id]||''} onChange={e=>setNotes(v=>({...v,[d.id]:e.target.value}))} placeholder="Local review notes (not saved to the project database)"/></label>
<p><small>NOT FOR CONSTRUCTION. Dimensions, U-values, materials, structural requirements and regulatory compliance must be verified by competent designers.</small></p>
</article>)}
</section>}
