// Evidence-led RAMS drafting. These are review prompts, not approved controls.
export function draftRamsItem(type, project) {
  const scope = project.project_description || project.scope || project.name || 'Scope not provided';
  const site = project.site_constraints || 'Site constraints and existing services require confirmation';
  const sequence = project.construction_method || 'Principal Contractor to provide task-specific work sequence';
  const risks = project.residual_risks || 'Residual design risks require designer review';
  const templates = {
    'Risk Assessment': ['Construction activities and interface with other trades', 'Confirm access, segregation, supervision, plant, permits and emergency arrangements'],
    'Method Statement': ['Unverified construction sequence and site interfaces', 'Confirm sequence, equipment, temporary stability, hold points and responsible supervisor'],
    'COSHH Assessment': ['Substances, exposure routes and safety data sheets not yet identified', 'Identify each substance and current SDS; assess exposure, ventilation, PPE/RPE and disposal'],
    'Construction Phase Plan': ['Site logistics, welfare, interfaces, services and emergency procedures', 'Principal Contractor to complete site-specific CPP before construction starts'],
    'Emergency Plan': ['Fire, injury, excavation collapse and restricted access', 'Confirm first aid, site access, assembly point, emergency contacts and rescue arrangements'],
    'Work at Height Assessment': ['Falls from edges, openings, ladders and fragile surfaces', 'Design collective fall prevention and safe access; confirm rescue plan'],
    'Excavation Assessment': ['Collapse, buried services, flooding and adjacent structures', 'Verify service searches, ground conditions, temporary support and inspections'],
    'Lifting Operations Assessment': ['Dropped loads, lifting equipment failure and exclusion zones', 'Competent lift planner to confirm lifting plan, ground bearing and exclusion zones']
  };
  const [hazard, control] = templates[type] || ['Task-specific hazards not yet verified', 'Competent contractor to prepare task-specific controls and confirm competence'];
  return {
    item_type: type,
    title: type + ' — ' + (project.name || 'Project'),
    activity: scope,
    hazards: hazard + '. Site context: ' + site + '. Design risks: ' + risks,
    controls: 'PROPOSED REVIEW ITEMS ONLY: ' + control + '. Verify against current drawings, surveys, actual work methods and site conditions.',
    method_sequence: sequence,
    source_reference: 'Project record; verify original drawing, survey and revision before approval',
    status: 'Draft - Contractor Review Required'
  };
}
