// Google Sheet <-> JSON. The sheet is the source of truth; businesses/<id>.json and out/<id>/*.json are built from it.
// Tabs: "Businesses" (one row per profile), "Photos" (photo pool, all profiles), "<id>_posts" (one tab per profile).
import ExcelJS from 'exceljs';
import { AI_TAB, AI_COLUMNS, aiStatus, applyApproved } from './photos.js';

export const BIZ_TAB = 'Businesses', PHOTO_TAB = 'Photos', postsTab = id => `${id}_posts`;

// [column, how to read it]. Lists are comma-separated in one cell.
export const BIZ_COLUMNS = [
  'active', 'id', 'name', 'website', 'phone', 'whatsapp', 'email', 'address', 'established', 'gbp_profile_url', 'instagram',
  'primary_keyword', 'secondary_keyword', 'services', 'areas', 'post_time', 'post_time_window', 'timezone', 'cta', 'min_chars', 'max_chars',
  'length_tolerance', 'max_similarity', 'widget_heading', 'widget_city', 'widget_accent', 'widget_cols', 'widget_limit',
  'whatsapp_text', 'directions_url', 'localo_location',
];
export const POST_COLUMNS = ['id', 'date', 'time', 'title', 'text', 'image', 'cta', 'status', 'chars', 'notes', 'type', 'offer_start', 'offer_end'];
export const POST_TYPES = ['post', 'offer'];
export const PHOTO_COLUMNS = ['business_id', 'photo_id', 'url', 'alt', 'last_used'];
const REQUIRED_BIZ = ['id', 'name', 'phone', 'primary_keyword', 'secondary_keyword', 'min_chars', 'max_chars', 'max_similarity'];
const ID_RE = /^[a-z0-9][a-z0-9-]*$/;

// ---------- cell helpers ----------
export function cellText(v) {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map(r => r.text).join('').trim();
    if ('result' in v) return cellText(v.result);
    if ('text' in v) return cellText(v.text);
    if (v.error) return '';
  }
  return String(v).trim();
}
const pad = n => String(n).padStart(2, '0');

export function parseDate(v) {
  if (v && typeof v === 'object' && !(v instanceof Date) && 'result' in v) v = v.result;
  if (v instanceof Date) return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  if (typeof v === 'number') return parseDate(new Date(Math.round((v - 25569) * 864e5)));
  const s = cellText(v);
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/); // Indian style DD/MM/YYYY
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  return null;
}

export function parseTime(v) {
  if (v && typeof v === 'object' && !(v instanceof Date) && 'result' in v) v = v.result;
  if (v instanceof Date) return `${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}`;
  if (typeof v === 'number') { const mins = Math.round((v % 1) * 1440); return `${pad(Math.floor(mins / 60) % 24)}:${pad(mins % 60)}`; }
  const m = cellText(v).toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(am|pm)?$/);
  if (!m) return null;
  let h = +m[1]; if (m[3] === 'pm' && h < 12) h += 12; if (m[3] === 'am' && h === 12) h = 0;
  return h < 24 ? `${pad(h)}:${m[2] || '00'}` : null;
}

// "+05:30" for Asia/Kolkata on that date
export function tzOffset(tz, dateStr) {
  const s = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' })
    .formatToParts(new Date(`${dateStr}T12:00:00Z`)).find(p => p.type === 'timeZoneName').value;
  return s === 'GMT' ? '+00:00' : s.replace('GMT', '');
}

const list = s => cellText(s).split(/\s*[,\n]\s*/).filter(Boolean);
const num = (v, d) => { const s = cellText(v); return s === '' ? d : Number(s); };
const encodeQuery = s => encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());

// ---------- reading ----------
function readTab(ws) {
  const headers = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (c, n) => { headers[n] = cellText(c.value).toLowerCase().replace(/\s+/g, '_'); });
  const rows = [];
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (n === 1) return;
    const data = {};
    headers.forEach((h, i) => { if (h) data[h] = row.getCell(i).value; });
    rows.push({ n, data });
  });
  return rows;
}

export function bizFromRow(d) {
  const t = k => cellText(d[k]);
  const biz = {
    id: t('id'), name: t('name'), website: t('website'), phone: t('phone'), whatsapp: t('whatsapp'), email: t('email'),
    address: t('address'), established: num(d.established, undefined), gbp_profile_url: t('gbp_profile_url'), instagram: t('instagram'),
    primary_keyword: t('primary_keyword'), secondary_keyword: t('secondary_keyword'), services: list(d.services), areas: list(d.areas),
    post_rules: {
      min_chars: num(d.min_chars), max_chars: num(d.max_chars), length_tolerance: num(d.length_tolerance, 0), max_similarity: num(d.max_similarity, 0.5),
      time: parseTime(d.post_time) || '11:00', ...(t('post_time_window') ? { time_window: t('post_time_window') } : {}), tz: t('timezone') || 'Asia/Kolkata', cta: t('cta') || 'call',
    },
    widget: {
      heading: t('widget_heading') || 'Live Updates', city: t('widget_city'), accent: t('widget_accent'),
      cols: num(d.widget_cols, 4), limit: num(d.widget_limit, 8),
    },
    whatsapp_text: t('whatsapp_text'), directions_url: t('directions_url'), localo_location: t('localo_location'),
  };
  for (const k of Object.keys(biz)) if (biz[k] === '' || biz[k] === undefined) delete biz[k];
  return biz;
}

// The posts.json header the widget needs (actions bar, heading, profile link).
export function feedHeader(biz) {
  const actions = [];
  if (biz.phone) actions.push({ id: 'call', label: 'Call now', url: `tel:${biz.phone}` });
  if (biz.whatsapp) actions.push({ id: 'whatsapp', label: 'WhatsApp', url: `https://wa.me/${biz.whatsapp}` + (biz.whatsapp_text ? `?text=${encodeQuery(biz.whatsapp_text)}` : '') });
  actions.push({ id: 'directions', label: 'Directions', url: biz.directions_url || `https://www.google.com/maps/search/?api=1&query=${encodeQuery(`${biz.name} ${biz.address || ''}`.trim()).replace(/%20/g, '+')}` });
  if (biz.gbp_profile_url) actions.push({ id: 'review', label: 'Review us', url: biz.gbp_profile_url });
  return { business: biz.name, profile_url: biz.gbp_profile_url, city: biz.widget.city, heading: biz.widget.heading, actions };
}

// Reads a workbook and returns { businesses: [{biz, posts, photos}], errors, warnings }. Nothing is written here.
export function parseWorkbook(wb) {
  const errors = [], warnings = [], out = [];
  const bizWs = wb.getWorksheet(BIZ_TAB);
  if (!bizWs) return { businesses: [], errors: [`tab "${BIZ_TAB}" missing`], warnings };

  const photosBy = {};
  const photoWs = wb.getWorksheet(PHOTO_TAB);
  if (photoWs) for (const { n, data } of readTab(photoWs)) {
    const bid = cellText(data.business_id), pid = cellText(data.photo_id), url = cellText(data.url);
    if (!bid && !pid && !url) continue;
    if (!bid || !url) { errors.push(`${PHOTO_TAB} row ${n}: business_id and url are required`); continue; }
    (photosBy[bid] ||= []).push({ id: pid || `photo-${n}`, url, alt: cellText(data.alt), last_used: parseDate(data.last_used) || '' });
  }

  const aiBy = {};
  const aiWs = wb.getWorksheet(AI_TAB);
  if (aiWs) for (const { data } of readTab(aiWs)) {
    const bid = cellText(data.business_id), pid = cellText(data.post_id), url = cellText(data.url);
    if (!bid || !pid || !url) continue;
    (aiBy[bid] ||= []).push({ post_id: pid, url, status: aiStatus(cellText(data.status)), notes: cellText(data.notes) });
  }

  const seen = new Set();
  for (const { n, data } of readTab(bizWs)) {
    if (!cellText(data.id) && !cellText(data.name)) continue;
    if (/^(no|n|false|0)$/i.test(cellText(data.active))) continue;
    const where = `${BIZ_TAB} row ${n}`;
    const biz = bizFromRow(data);
    if (!ID_RE.test(biz.id || '')) { errors.push(`${where}: id "${biz.id || ''}" must be lowercase letters, numbers or -`); continue; }
    if (seen.has(biz.id)) { errors.push(`${where}: id "${biz.id}" used twice`); continue; }
    seen.add(biz.id);
    const flat = { ...biz, ...biz.post_rules };
    const missing = REQUIRED_BIZ.filter(k => flat[k] === undefined || flat[k] === '' || Number.isNaN(flat[k]));
    if (missing.length) { errors.push(`${where} (${biz.id}): fill ${missing.join(', ')}`); continue; }

    const photos = photosBy[biz.id] || [];
    const photoUrl = Object.fromEntries(photos.map(p => [p.id, p.url]));
    const ws = wb.getWorksheet(postsTab(biz.id));
    const aiRows = aiBy[biz.id] || [];
    if (!ws) { warnings.push(`${biz.id}: no "${postsTab(biz.id)}" tab, posts not updated`); out.push({ biz, posts: null, photos, aiRows }); continue; }

    const posts = [], ids = new Set();
    let drafts = 0;
    for (const { n: rn, data: p } of readTab(ws)) {
      const at = `${postsTab(biz.id)} row ${rn}`;
      const title = cellText(p.title), text = cellText(p.text), status = cellText(p.status).toLowerCase() || 'scheduled';
      if (!title && !text && !cellText(p.date)) continue;
      if (status === 'draft' || status === 'skip') { drafts++; continue; }
      const date = parseDate(p.date), time = cellText(p.time) ? parseTime(p.time) : biz.post_rules.time;
      if (!date) { errors.push(`${at}: date "${cellText(p.date)}" not understood (use 2026-12-25 or 25/12/2026)`); continue; }
      if (!time) { errors.push(`${at}: time "${cellText(p.time)}" not understood (use 11:00)`); continue; }
      if (!title || !text) { errors.push(`${at}: title and text are required`); continue; }
      const type = cellText(p.type).toLowerCase() || 'post';
      if (!POST_TYPES.includes(type)) { errors.push(`${at}: type "${type}" must be post or offer`); continue; }
      let offer = {};
      if (type === 'offer') {
        const end = parseDate(p.offer_end), start = cellText(p.offer_start) ? parseDate(p.offer_start) : date;
        if (!end || !start) { errors.push(`${at}: offer needs offer_end (and offer_start if filled) as 2026-12-25 or 25/12/2026`); continue; }
        if (end < start || end < date) { errors.push(`${at}: offer_end ${end} is before the start or the post date`); continue; }
        offer = { type, offer_start: start, offer_end: end };
      }
      const id = cellText(p.id) || `${biz.id}-${type === 'offer' ? 'offer-' : ''}${date.replace(/-/g, '')}`;
      if (ids.has(id)) { errors.push(`${at}: id "${id}" used twice`); continue; }
      ids.add(id);
      const img = cellText(p.image);
      if (img && !photoUrl[img] && !/^(https?:)?\/\//.test(img) && !img.startsWith('/')) warnings.push(`${at}: image "${img}" is not a photo_id in ${PHOTO_TAB} or a URL`);
      posts.push({ id, date: `${date}T${time}:00${tzOffset(biz.post_rules.tz, date)}`, title, text, image: photoUrl[img] || img, cta: cellText(p.cta) || biz.post_rules.cta, ...offer });
    }
    posts.sort((a, b) => a.date.localeCompare(b.date));
    if (drafts) warnings.push(`${biz.id}: ${drafts} draft row(s) left out`);
    const waiting = aiRows.filter(r => r.status === '').length;
    if (waiting) warnings.push(`${biz.id}: ${waiting} AI photo(s) in ${AI_TAB} waiting for approve/reject`);
    out.push({ biz, posts: applyApproved(posts, aiRows), photos, aiRows });
  }
  return { businesses: out, errors, warnings };
}

export async function loadWorkbook({ file, sheetId }) {
  const wb = new ExcelJS.Workbook();
  if (file) { await wb.xlsx.readFile(file); return wb; }
  const id = (sheetId.match(/\/d\/([\w-]+)/) || [, sheetId])[1];
  const res = await fetch(`https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`);
  const type = res.headers.get('content-type') || '';
  if (!res.ok || type.includes('text/html')) throw new Error(`Could not download the sheet (HTTP ${res.status}). In Google Sheets: Share > General access > "Anyone with the link" > Viewer.`);
  await wb.xlsx.load(Buffer.from(await res.arrayBuffer()));
  return wb;
}

// ---------- writing the template ----------
const HEAD = { font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF9B1C2C' } } };

function addTab(wb, name, columns, rows, widths = {}) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = columns.map(k => ({ header: k, key: k, width: widths[k] || 16 }));
  ws.getRow(1).eachCell(c => { c.font = HEAD.font; c.fill = HEAD.fill; });
  rows.forEach(r => ws.addRow(r));
  return ws;
}

export function bizToRow(biz, header = {}) {
  const wa = (header.actions || []).find(a => a.id === 'whatsapp');
  const dir = (header.actions || []).find(a => a.id === 'directions');
  const r = biz.post_rules || {}, w = biz.widget || {};
  return {
    active: biz.active === false ? 'no' : 'yes', id: biz.id, name: biz.name, website: biz.website, phone: biz.phone, whatsapp: biz.whatsapp, email: biz.email,
    address: biz.address, established: biz.established, gbp_profile_url: biz.gbp_profile_url, instagram: biz.instagram,
    primary_keyword: biz.primary_keyword, secondary_keyword: biz.secondary_keyword, services: (biz.services || []).join(', '), areas: (biz.areas || []).join(', '),
    post_time: r.time, post_time_window: r.time_window || '', timezone: r.tz, cta: r.cta, min_chars: r.min_chars, max_chars: r.max_chars, length_tolerance: r.length_tolerance, max_similarity: r.max_similarity,
    widget_heading: w.heading, widget_city: w.city, widget_accent: w.accent, widget_cols: w.cols, widget_limit: w.limit,
    whatsapp_text: biz.whatsapp_text ?? (wa && new URL(wa.url).searchParams.get('text')) ?? '',
    directions_url: biz.directions_url ?? dir?.url ?? '', localo_location: biz.localo_location || '',
  };
}

// profiles: [{ biz, feed (posts.json or null) }]
export function buildTemplate(profiles) {
  const wb = new ExcelJS.Workbook();
  const guide = wb.addWorksheet('Guide');
  guide.columns = [{ width: 110 }];
  [
    'GBP Posts sheet - yahi sheet master hai. Yahan badlo, phir terminal me: npm run sync',
    '',
    'Businesses: har company/profile ki ek row. active = no karo to wo profile skip hoga.',
    '   post_time_window (khali = 00:00-23:59, poore din me): month generator har post ko alag time deta hai. fixed = sab post_time par.',
    '   services aur areas comma se alag likho. Sab columns ke naam mat badlo.',
    '<id>_posts: har company ka alag tab (jaise amex_posts). Ek row = ek post.',
    '   date: 2026-12-25 ya 25/12/2026. time khali = Businesses wala post_time.',
    '   Ek din me 2 post (jaise offer + daily) ho sakte hain, bas time alag ho.',
    '   type: khali/post = roz wala post. offer = offer post: offer_end bharo (offer_start khali = post ki date).',
    '   Website par offer post offer_end ke baad apne aap chhup jata hai.',
    '   status: draft = website/Localo me nahi jayega. scheduled / posted = jayega.',
    '   image: Photos tab ka photo_id (jaise p01) ya poora URL.',
    '   chars: apne aap ginta hai (title + text). Laal ho to length theek karo.',
    '   id khali chhod sakte ho, sync khud bana dega.',
    'Photos: sab companies ki photos. business_id = Businesses tab ka id.',
    'AI_Photos: Gemini ki banayi photos. "Generate AI photos" Action ki photo-review.csv yahan import karo (Append).',
    '   status: approve = sync us post par photo laga dega. reject + notes = agli baar Gemini nayi photo banayega.',
    '   khali status = abhi review baaki.',
    '',
    'Naya company tab: koi bhi _posts tab copy karo, naam <id>_posts rakho, rows hata do.',
    'Sheet me customer ka data mat daalo: link share karna padta hai ("Anyone with the link" > Viewer).',
  ].forEach(t => guide.addRow([t]));
  guide.getRow(1).font = { bold: true, size: 13 };

  addTab(wb, BIZ_TAB, BIZ_COLUMNS, profiles.map(p => bizToRow(p.biz, p.feed || {})),
    { name: 30, address: 40, services: 40, areas: 50, primary_keyword: 26, secondary_keyword: 26, website: 28, gbp_profile_url: 30, whatsapp_text: 40, directions_url: 40 });

  const photoRows = [];
  for (const { biz, feed } of profiles) {
    const ws = addTab(wb, postsTab(biz.id), POST_COLUMNS, [], { id: 12, date: 12, time: 8, title: 40, text: 80, image: 10, cta: 10, status: 11, chars: 8, notes: 24 });
    const ids = new Map();
    (feed?.posts || []).forEach(p => {
      if (p.image && !ids.has(p.image)) ids.set(p.image, `p${pad(ids.size + 1)}`);
      ws.addRow({ id: p.id, date: p.date.slice(0, 10), time: p.date.slice(11, 16), title: p.title, text: p.text, image: ids.get(p.image) || '', cta: p.cta, status: 'scheduled',
        type: p.type || '', offer_start: p.offer_start || '', offer_end: p.offer_end || '' });
    });
    for (const [url, id] of ids) photoRows.push({ business_id: biz.id, photo_id: id, url, alt: '', last_used: '' });

    const last = 400, r = biz.post_rules || {}, tol = r.length_tolerance || 0;
    for (let i = 2; i <= last; i++) ws.getCell(`I${i}`).value = { formula: `IF(E${i}="","",LEN(D${i})+1+LEN(E${i}))` };
    ws.getColumn('text').alignment = { wrapText: true, vertical: 'top' };
    ws.dataValidations.add(`H2:H${last}`, { type: 'list', allowBlank: true, formulae: ['"draft,scheduled,posted"'] });
    ws.dataValidations.add(`K2:K${last}`, { type: 'list', allowBlank: true, formulae: ['"post,offer"'] });
    ws.dataValidations.add(`G2:G${last}`, { type: 'list', allowBlank: true, formulae: ['"call,whatsapp,directions,review"'] });
    if (r.min_chars) ws.addConditionalFormatting({ ref: `I2:I${last}`, rules: [{ type: 'expression', priority: 1,
      formulae: [`AND(I2<>"",OR(I2<${r.min_chars - tol},I2>${r.max_chars + tol}))`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFF4CCCC' } } } }] });
  }
  addTab(wb, PHOTO_TAB, PHOTO_COLUMNS, photoRows, { url: 90, alt: 30, last_used: 12 });
  const ai = addTab(wb, AI_TAB, AI_COLUMNS, [], { post_id: 22, status: 10, preview: 30, url: 60, notes: 40, prompt: 60, created: 18 });
  ai.dataValidations.add('C2:C1000', { type: 'list', allowBlank: true, formulae: ['"approve,reject"'] });
  return wb;
}
