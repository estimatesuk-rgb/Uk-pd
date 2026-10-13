// UK Architect / Mitchell Proctor shared CAD core.
// Produces editable AutoCAD-compatible ASCII DXF from VERIFIED metre coordinates.
// This does not interpret sketch photographs or infer dimensions.
const num = (n) => {
  if (typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n) > 1e6) throw Error('Invalid CAD coordinate');
  return String(Number(n.toFixed(6)));
};
const safe = (s) => String(s ?? '').replace(/[^A-Za-z0-9 _-]/g, '_').slice(0, 80);
const pair = (code, value) => code + '\n' + value + '\n';
export function measuredSketchToDxf({segments = [], project = 'Measured sketch'} = {}) {
  if (!Array.isArray(segments) || segments.length === 0) throw Error('At least one verified segment is required');
  let entities = '';
  for (const item of segments) {
    if (item.verified !== true) throw Error('Unverified sketch geometry cannot be exported');
    if (!item.start || !item.end) throw Error('Segment endpoints are required');
    const x1 = num(item.start.x), y1 = num(item.start.y);
    const x2 = num(item.end.x), y2 = num(item.end.y);
    if (x1 === x2 && y1 === y2) throw Error('Zero-length segment');
    const layer = safe(item.layer || 'WALLS');
    entities += pair(0,'LINE') + pair(8,layer) + pair(10,x1) + pair(20,y1) +
      pair(30,'0') + pair(11,x2) + pair(21,y2) + pair(31,'0');
  }
  // INSUNITS=6 denotes metres. DXF coordinates are real metres, not pixels.
  return pair(0,'SECTION') + pair(2,'HEADER') + pair(9,'$ACADVER') + pair(1,'AC1015') +
    pair(9,'$INSUNITS') + pair(70,'6') + pair(9,'$PROJECTNAME') + pair(1,safe(project)) +
    pair(0,'ENDSEC') + pair(0,'SECTION') + pair(2,'ENTITIES') + entities +
    pair(0,'ENDSEC') + pair(0,'EOF');
}
