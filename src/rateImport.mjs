// Parse user-provided Priceajob labour/time rates for staff-controlled import.
// A composite labour price is never a material rate.
const clean = value => String(value ?? '').trim();
const normal = value => clean(value).toLowerCase().replace(/\s+/g, ' ');
export const normalizeRateUnit = value => {
  const unit = normal(value);
  return ({ each: 'nr', no: 'nr', number: 'nr', m2: 'm²', 'm^2': 'm²', m3: 'm³', 'm^3': 'm³' })[unit] || clean(value);
};
export const rateMatchKey = rate => normal(rate.description) + '|' + normal(normalizeRateUnit(rate.unit));
export function prepareMasterRateImport(rows) {
  if (!Array.isArray(rows)) throw Error('The master rates sheet could not be read.');
  const headerIndex = rows.findIndex(row => Array.isArray(row) && row.some(cell => normal(cell) === 'description') && row.some(cell => normal(cell).startsWith('price')));
  if (headerIndex < 0) throw Error('Expected the Construction Rates Master headings, including Description and Price.');
  const headers = rows[headerIndex].map(cell => normal(cell).replace(/[^a-z0-9]/g, ''));
  const col = (row, ...names) => {
    const index = headers.findIndex(head => names.includes(head));
    return index < 0 ? '' : row[index];
  };
  const candidates = [], needsReview = [];
  let total = 0;
  for (const row of rows.slice(headerIndex + 1)) {
    if (!Array.isArray(row)) continue;
    const description = clean(col(row, 'description'));
    if (!description) continue;
    total++;
    const trade = clean(col(row, 'tradespeople', 'trade'));
    const unit = normalizeRateUnit(col(row, 'unit'));
    const hoursRaw = col(row, 'hours'), priceRaw = col(row, 'priceexclvat', 'price');
    const hours = Number(hoursRaw), price = Number(priceRaw);
    const note = clean(col(row, 'reviewnote'));
    const page = clean(col(row, 'page')), rowNo = clean(col(row, 'sourcerow')), image = clean(col(row, 'sourceimage'));
    const entry = { description, trade, unit, hours: hoursRaw, price: priceRaw, page, row: rowNo, image };
    const reasons = [];
    if (note) reasons.push(note);
    if (!unit) reasons.push('Missing unit');
    if (!trade) reasons.push('Missing trade');
    if (!Number.isFinite(hours) || hours <= 0) reasons.push('Missing or zero hours');
    if (!Number.isFinite(price) || price <= 0) reasons.push('Missing or zero price');
    if (reasons.length) { needsReview.push({ ...entry, reason: reasons.join('; ') }); continue; }
    candidates.push({ source: entry, db: {
      description, trade, unit, material_rate: 0, plant_rate: 0,
      labour_hours: hours, labour_rate: Number((price / hours).toFixed(10)),
      supplier: `Priceajob source ${image || 'screenshot'}, page ${page || '?'}, row ${rowNo || '?'}`,
      price_url: '', updated_at: null,
    } });
  }
  const multiplicity = new Map();
  for (const c of candidates) multiplicity.set(rateMatchKey(c.db), (multiplicity.get(rateMatchKey(c.db)) || 0) + 1);
  const ready = [];
  for (const c of candidates) {
    if (multiplicity.get(rateMatchKey(c.db)) > 1) {
      needsReview.push({ ...c.source, reason: 'Ambiguous duplicate description and unit; review before automatic matching' });
    } else ready.push(c.db);
  }
  return { ready, needsReview, total };
}
