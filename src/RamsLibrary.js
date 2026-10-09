// CDM 2015 RAMS drafting inventory: professional judgement and site verification remain mandatory.
export const CDM_REFERENCES=[
 {name:'CDM Regulations 2015',url:'https://www.legislation.gov.uk/uksi/2015/51/contents'},
 {name:'HSE L153 CDM guidance',url:'https://www.hse.gov.uk/pubns/priced/l153.pdf'},
 {name:'HSE Construction Phase Plan',url:'https://www.hse.gov.uk/construction/safetytopics/planning.htm'},
 {name:'HSE Site rules and induction',url:'https://www.hse.gov.uk/construction/safetytopics/site-rules-induction.htm'},
 {name:'HSE Control of substances hazardous to health',url:'https://www.hse.gov.uk/coshh/'},
 {name:'HSE construction health risks',url:'https://www.hse.gov.uk/construction/healthrisks/index.htm'},
 {name:'HSE Work at height',url:'https://www.hse.gov.uk/construction/safetytopics/workingatheight.htm'},
 {name:'HSE Asbestos',url:'https://www.hse.gov.uk/asbestos/'}];
export const CPP_GROUPS=[
 {id:'project',name:'Project and legal particulars',fields:[
 ['site','Site location, boundaries, access and occupied interfaces'],
 ['scope','Scope, phases, programme and sequence of works'],
 ['dates','Proposed start and finish; working hours and restrictions'],
 ['client','Client contact and responsible duties'],
 ['dutyholders','CDM principal designer / principal contractor appointments and named contractors'],
 ['notification','F10 notification applicability and reference, if applicable'],
 ['information','Pre-construction information, surveys and existing utility records'],
 ['consultation','Resident, occupier, tenant, neighbour and public interface'],
 ['design','Design risk information and unresolved assumptions']
 ]},
 {id:'management',name:'Construction management arrangements',fields:[
 ['responsibilities','PC, site manager, supervisor and subcontractor responsibilities'],
 ['coordination','Contractor interfaces, coordination meetings, works sequencing and change control'],
 ['competence','Competence, skills, training and subcontractor appointment checks'],
 ['induction','Site-specific induction, briefing, consultation and toolbox talks'],
 ['rams','RAMS preparation, review, acceptance and revision process'],
 ['permits','Permit to work responsibilities, issue, isolation and close-out'],
 ['monitoring','Site inspections, audits, non-compliances, near misses, review frequency'],
 ['protection','Public protection, security, boundary control and safeguarding'],
 ['outofhours','Out-of-hours emergencies, lone working and access control']
 ]},
 {id:'site',name:'Site establishment and rules',fields:[
 ['layout','Site compound / layout, pedestrian-plant segregation and material areas'],
 ['access','Gates, deliveries, vehicle management and banksmen'],
 ['welfare','Suitable toilets, hot/warm water, washing, drinking water, rest and changing facilities'],
 ['storage','Material and hazardous substance storage / ventilation'],
 ['utilities','Power, lighting, heating, temporary services and isolation'],
 ['rules','PPE, smoking, phone use, cleanliness, parking, restricted zones, visitors'],
 ['fire','Fire precautions, alarm, extinguishers, evacuation routes, hot works controls'],
 ['waste','Waste, dust, spills, noise, vibrations, water run-off and environmental controls']
 ]},
 {id:'emergency',name:'Emergency and first aid arrangements',fields:[
 ['firstaid','First aid needs assessment, first aider(s), equipment and contacts'],
 ['fireplan','Fire and evacuation procedure, assembly point and roll-call'],
 ['rescue','Work-at-height rescue, confined space rescue and excavation rescue arrangements'],
 ['hospital','Verified nearest appropriate A&E and route; do not automatically invent an address'],
 ['ambulance','Ambulance access, precise site location, site escort and emergency vehicle access'],
 ['incident','Accident, dangerous occurrence, near miss and RIDDOR reporting'],
 ['spills','Chemical spills, utilities strike, structural collapse and emergency isolation'],
 ['communication','Emergency communications and out-of-hours contacts']
 ]},
 {id:'highrisk',name:'Significant risk and Schedule 3 arrangements',fields:[
 ['fall','Falls from height and elevated work access'],
 ['collapse','Excavations, unstable structures, temporary works and shoring'],
 ['substances','Asbestos, silica, lead, biological and other chemical exposure'],
 ['electrical','Live/underground/overhead electrical hazards and isolations'],
 ['lifting','Lifting operations, suspended loads and equipment'],
 ['public','Public/occupied building interfaces, deliveries and traffic'],
 ['confined','Confined spaces, tanks, drains and rescue'],
 ['firehot','Fire, hot works, welding and combustible construction'],
 ['demolition','Demolition / structural alteration / temporary stability'],
 ['schedule3','All CDM Schedule 3 categories assessed and separately controlled where relevant']
 ]},
 {id:'handover',name:'Records, changes and handover',fields:[
 ['documentcontrol','Approved revisions, distribution, control of superseded information'],
 ['surveillance','Daily checks and inspection / test / hold point records'],
 ['subcontractors','Subcontractor RAMS acceptance, induction and briefing sign-off'],
 ['training','Competence, plant certification, lifting, scaffold and training records'],
 ['permitslog','Permits, isolations, hot works, excavation and confined space logs'],
 ['designchanges','Design / site change review and H&S file interface'],
 ['handover','As-built works, inspection evidence, residual risks and O&M / H&S file'],
 ['clientrelease','Principal contractor review, issue authority and project-specific approval']
 ]}];
export const SCHEDULE3=[
 'Particularly aggravated burial / engulfment or falls from height',
 'Chemical / biological substances involving particular danger or legally required health monitoring',
 'Ionising radiation controlled or supervised areas',
 'Working near high-voltage power lines',
 'Risk of drowning',
 'Wells, underground earthworks and tunnels',
 'Underwater diving with supplied air',
 'Work in caissons with compressed air',
 'Explosives',
 'Erection or dismantling of heavy prefabricated components'];
export const RAMS_ACTIVITIES=[
 {id:'site_setup',name:'Site setup, welfare, fencing and public protection',triggers:'site setup|compound|hoarding|fencing|access|site layout|demolition|new build',hazards:['Moving vehicles and pedestrians','Unauthorised entry','Uneven ground','Welfare deficiencies'],controls:['Establish secure segregated access and controlled deliveries','Provide adequate welfare before work','Document emergency access, lighting and first aid'],regs:'CDM 2015 / Schedule 2 welfare'},
 {id:'surveys',name:'Surveys, intrusive investigations and setting out',triggers:'survey|trial hole|soil test|intrusive|existing|investigation|asbestos',hazards:['Unknown underground services','Asbestos and contaminated ground','Unstable structures','Exposure to occupied premises'],controls:['Review pre-construction information and locate services','Confirm intrusive survey authority and isolation','Stop and escalate unexpected finds'],regs:'CDM 2015; HSG47; CAR 2012'},
 {id:'demolition',name:'Demolition, soft strip and structural alterations',triggers:'demolition|soft strip|strip out|remove wall|removal|knock through|alteration|chimney',hazards:['Uncontrolled collapse','Asbestos / lead / silica','Falls','Dust, noise and flying debris'],controls:['Appointed competent demolition and temporary works designers','Verify utilities isolated and R&D asbestos survey as applicable','Use sequenced, approved demolition method and exclusion zones'],regs:'CDM 2015; Work at Height Regulations; CAR 2012'},
 {id:'excavations',name:'Excavations, trenches, foundations and underground works',triggers:'trench|excavat|foundation|footing|groundwork|drain|pile|basement|trial hole',hazards:['Ground collapse','Buried services','Falls into excavations','Plant/person collision','Flooding'],controls:['Designed earthwork support and competent inspections','Service drawings, detection, trial holes and permits','Spoil and plant set-backs; barriers and safe access'],regs:'CDM 2015; HSG47; Schedule 3'},
 {id:'concrete',name:'Concrete, reinforcement, formwork and pours',triggers:'concrete|reinforc|slab|strip footing|foundation|raft|beam',hazards:['Wet cement burns / dermatitis','Formwork collapse','Rebar impalement','Pump and delivery hazards'],controls:['Engineer-designed temporary works where required','Wet cement COSHH and washing facilities','Controlled pump position, exclusion and curing method'],regs:'COSHH 2002; CDM 2015'},
 {id:'drainage',name:'Drainage, connections and sewer works',triggers:'drain|sewer|manhole|inspection chamber|sv(p|t)|foul|surface water|pump',hazards:['Excavation collapse','Confined space / toxic atmosphere','Biological contamination','Flooding and utilities strikes'],controls:['Verify public sewer permissions and invert levels','Assess confined space / isolation and rescue by specialist','Ventilation, testing, access and hygienic controls'],regs:'CDM 2015; Confined Spaces Regulations 1997; COSHH'},
 {id:'scaffold',name:'Scaffold, access towers and collective fall protection',triggers:'scaffold|access|elevated|fascia|roof|chimney|render|extension',hazards:['Falls from height','Dropped objects','Unstable access equipment'],controls:['Competently designed/installed access and inspections','Guardrails, toe boards and exclusion zones','Rescue plan where personal fall arrest is used'],regs:'Work at Height Regulations 2005'},
 {id:'roof',name:'Roof structure, coverings and rooflights',triggers:'roof|rafter|truss|batten|tile|slate|chimney|dormer|rooflight|solar',hazards:['Falls through fragile areas','Falls from edges','Wind-related instability','Manual handling and dropped materials'],controls:['Specify edge and fragile roof protection before work','Control lifting, weather limits and roof material storage','Sequence work to maintain stability and fire safety'],regs:'WAHR 2005; CDM 2015'},
 {id:'masonry',name:'Brickwork, blockwork, lintels and cavity construction',triggers:'brick|block|mason|wall|lintel|render|cladding|cavity',hazards:['Manual handling','Silica dust during cutting','Unstable partially built walls','Work at height'],controls:['Use mechanical handling and suitable access','Control dust at source with water/extraction and RPE if required','Temporary support and wind stability arrangements'],regs:'COSHH; Manual Handling; CDM 2015'},
 {id:'steel',name:'Structural steelwork, beams and heavy lifts',triggers:'steel|beam|column|portal frame|crane|padstone|rsj|lift',hazards:['Suspended loads','Structural instability','Falls during connection','Crushing'],controls:['Lifting plan by competent person and exclusion zones','Engineer-approved temporary stability and sequence','Certified lifting accessories and defined banksman'],regs:'LOLER 1998; PUWER 1998; CDM 2015'},
 {id:'timber',name:'Carpentry, floor joists and timber frame',triggers:'timber|joist|stud|floor|roof truss|stair|joinery',hazards:['Falls through openings','Wood dust and tool injury','Instability during erection'],controls:['Guard open edges and openings','Dust extraction / tool guarding and training','Temporary restraint, secure fixings and safe lifting'],regs:'COSHH; PUWER; WAHR'},
 {id:'windows',name:'Windows, doors, glazing and façade openings',triggers:'window|door|glaz|curtain|shopfront|rooflight|opening',hazards:['Glass cuts and falling panels','Falls from openings','Manual handling','Unsecured frames'],controls:['Engineered handling/suction equipment where required','Temporary guard openings and secure frames','Design installation sequence and segregate below'],regs:'WAHR; Manual Handling; CDM 2015'},
 {id:'electrical',name:'Electrical works, temporary supplies and testing',triggers:'electrical|cable|power|consumer unit|lighting|ev charger|solar|pv',hazards:['Electric shock / arc flash','Unexpected energisation','Overhead/underground cables','Fire'],controls:['Safe isolation, lock-off and test by competent person','Appropriate temporary supply, RCD and inspection','Permit and exclusion near exposed electrical hazards'],regs:'Electricity at Work Regulations 1989'},
 {id:'mechanical',name:'Heating, plumbing, hot works and pressurised systems',triggers:'boiler|gas|heating|hvac|plumb|pipe|ventilat|hot water|flue|air source',hazards:['Hot works fire','Pressure release','Legionella / contaminated water','Fumes and burns'],controls:['Competent operatives / safe isolation and pressure release','Hot works permits and fire watch where needed','Flue, plant room and safe commissioning controls'],regs:'COSHH; PUWER; CDM 2015'},
 {id:'insulation',name:'Insulation, dry lining, plaster and decoration',triggers:'insulation|plaster|dry lining|screed|paint|render|sealant|adhesive',hazards:['Inhalation of airborne dust','Chemical vapours / skin exposure','Manual handling','Work at height'],controls:['Review current manufacturer SDS and product-specific COSHH','Ventilation/extraction with selected PPE/RPE','Use safe access, material handling and segregation'],regs:'COSHH; WAHR; CDM 2015'},
 {id:'asbestos',name:'Asbestos investigation, removal and control',triggers:'asbestos|refurbishment|demolition|existing building|old building|strip out|asbestos survey',hazards:['Asbestos fibre exposure / contamination','Uncontrolled disturbance'],controls:['Stop disturbance pending appropriate asbestos survey/assessment','Use licensed contractor and notifications where legally required','Control enclosure, clearance and waste by task classification'],regs:'Control of Asbestos Regulations 2012'},
 {id:'hazmat',name:'Hazardous substances, dust, noise and vibration',triggers:'coshh|chemic|paint|cement|silica|cutting|grind|noise|vibrat|lead|adhesive',hazards:['Respirable crystalline silica','Solvent vapours','Wet cement burns','HAVS / hearing damage'],controls:['Substitute hazardous materials/processes where practicable','Exposure assessments, extraction and product-specific SDS','Face-fit RPE and health surveillance as indicated'],regs:'COSHH; Noise 2005; Vibration 2005'},
 {id:'lifting',name:'Lifting equipment, cranes, hoists and loads',triggers:'crane|lift|hoist|steel|prefab|machinery|unit installation',hazards:['Crushing under suspended loads','Lifting equipment failure','Unstable outrigger bearing'],controls:['Appointed competent lifting planner / lift plan','LOLER thorough examinations and pre-use checks','Segregated lift zones, ground bearing and weather limits'],regs:'LOLER 1998; PUWER 1998'},
 {id:'plant',name:'Construction plant, deliveries and reversing',triggers:'plant|excavator|dumper|forklift|delivery|lorry|grab|skip|loader',hazards:['Vehicle strike','Reversing accidents','Tip-over','Noise / dust'],controls:['Pedestrian/vehicle segregation and banksmen','Competence, inspections and ground bearing','Defined one-way routes, speed and reversing controls'],regs:'CDM 2015; PUWER'},
 {id:'fire',name:'Fire, hot works and combustible material management',triggers:'hot works|welding|torch|flame|gas|grinding|refurb|roof|construction',hazards:['Fire spreading','Smoke inhalation','Gas cylinders / arson'],controls:['Site fire risk assessment and emergency plan','Hot works permit, firefighting provision and fire watch','Secure combustible storage and escape routes'],regs:'CDM 2015; Regulatory Reform (Fire Safety) Order interfaces as applicable'},
 {id:'occupied',name:'Working in occupied buildings and public interface',triggers:'surgery|medical|nhs|occupied|school|office|shop|house|dwelling|resident|operational',hazards:['Exposure of occupants to dust/noise','Uncontrolled public access','Fire escape compromised','Infection-control interfaces'],controls:['Phasing/segregation and stakeholder communications','Maintain alternative fire/accessible escape routes','Dust, air quality and infection-control protocol where applicable'],regs:'CDM 2015; Occupied-premises duties'},
 {id:'confined',name:'Confined spaces and rescue',triggers:'confined space|manhole|sewer|tank|vault|pit|cellar|chamber',hazards:['Oxygen depletion','Toxic gas','Engulfment / drowning'],controls:['Avoid entry where practicable; competent confined space assessment','Atmospheric testing, isolation, ventilation and permit','Trained rescue team, equipment and emergency plan'],regs:'Confined Spaces Regulations 1997'}
];
export const COSHH_REQUIRED=['Product exact name and intended use','Manufacturer and current SDS issue/revision','Exposure routes (inhalation, skin, eye, ingestion)','GHS hazard classifications and exposure limits as applicable','Users, bystanders and other affected people','Quantity, handling duration and work location','Substitution / avoidance and engineered controls','Ventilation, LEV and testing/maintenance','PPE/RPE selection, training and face fit as applicable','Storage, incompatibilities and spill response','First aid, emergency arrangements and firefighting','Waste and environmental disposal route','Health surveillance, monitoring and exposure review where applicable','Responsible assessor, date, review and briefing'];
export const DOCUMENTS=[
 ['RA','Task-specific risk assessments; persons at risk, initial/residual risk, hierarchy of controls, sign-off'],
 ['MS','Method statements: sequence, supervision, plant, permits, hold points, rescue and interface controls'],
 ['CPP','Construction Phase Plan prepared pre-start, maintained by PC or sole contractor'],
 ['COSHH','Substance assessments linked to exact SDS and use/exposure conditions'],
 ['PCI','Pre-construction information; surveys, utilities, site, design risks, asbestos and existing structure'],
 ['PERMITS','Hot works, excavations/breaking ground, live electrical isolation, lifting and confined spaces as applicable'],
 ['SITE','Site rules and induction, welfare, fire, traffic, delivery and security plans'],
 ['REGISTERS','Training, competences, equipment inspections, lifting, temporary works, asbestos, health monitoring, briefing'],
 ['EMERGENCY','First aid, fire, excavation/height/confined-space rescue and communication'],
 ['BRIEFING','Acceptance/acknowledgment, toolbox talks, changes, rebrief and documented version controls'],
 ['FILE','H&S file and residual design risks for operation and future maintenance']
];