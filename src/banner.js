// Offer artwork on a photo: "LIMITED OFFER" ribbon, round "10% OFF" badge, offer line, dates, "Call now" pill,
// drawn by code (not by the AI) so the text is always spelled right.
import sharp from 'sharp';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dm = iso => `${+iso.slice(8, 10)} ${MON[+iso.slice(5, 7) - 1]}`;

// "Valid 2-7 Dec 2026", "Valid 16 Nov - 3 Dec 2026", "Valid 28 Dec 2026 - 3 Jan 2027"
export function validity(start, end) {
  if (!start || !end) return '';
  const [ys, ye] = [start.slice(0, 4), end.slice(0, 4)];
  if (ys !== ye) return `Valid ${dm(start)} ${ys} – ${dm(end)} ${ye}`;
  if (start.slice(0, 7) === end.slice(0, 7)) return `Valid ${+start.slice(8, 10)}–${dm(end)} ${ye}`;
  return `Valid ${dm(start)} – ${dm(end)} ${ye}`;
}

// Headline: the `banner` cell if filled, else "10% OFF LOCAL SHIFTING" from "10% off on local shifting charges",
// else "10% OFF", else "SPECIAL OFFER".
export function bannerLines(post, biz = {}) {
  const all = `${post.title} ${post.text}`;
  let headline = (post.banner || '').trim();
  if (!headline) {
    const m = all.match(/(\d+\s*%)\s*off\s+(?:on\s+)?([a-z ]{3,30}?)\s+charges/i) || all.match(/(\d+\s*%)\s*off/i);
    headline = m ? `${m[1].replace(/\s/g, '')} OFF${m[2] ? ' ' + m[2].trim() : ''}` : 'SPECIAL OFFER';
  }
  return { headline: headline.toUpperCase(), sub: validity(post.offer_start || post.date.slice(0, 10), post.offer_end), brand: biz.name || '' };
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
// Font size that keeps `text` inside `width`; `em` = average character width in em (heavy capitals ~0.78).
const fit = (text, width, max, em = 0.62) => Math.min(max, Math.floor(width / (Math.max(text.length, 1) * em)));

// "10% OFF LOCAL SHIFTING" -> { badge: "10%", line: "LOCAL SHIFTING" }; no percentage -> { badge: "", line: headline }
export function splitHeadline(headline) {
  const m = String(headline).match(/^(.*?)(\d+\s*%)\s*OFF\b\s*(.*)$/i);
  if (!m) return { badge: '', line: headline };
  return { badge: m[2].replace(/\s/g, ''), line: `${m[1]}${m[3]}`.replace(/\s+/g, ' ').trim() || 'SPECIAL OFFER' };
}

// Returns a 1200x900 JPEG: the photo, a dark fade at the bottom, a "LIMITED OFFER" ribbon, a round
// "10% OFF" badge, the offer line, the dates and a "Call now" pill.
export async function addBanner(input, { headline, sub, brand, color = '#9b1c2c' }) {
  const W = 1200, H = 900, pad = 56;
  const base = await sharp(input).rotate().resize(W, H, { fit: 'cover' }).modulate({ saturation: 1.08 }).toBuffer();
  const { badge, line } = splitHeadline(headline);
  const ls = fit(line, W - 2 * pad - 40, 92, 0.78);
  const ss = fit(sub, W * 0.55, 40);
  const bs = fit(brand, W * 0.55, 28);
  const R = 150, cx = W - pad - R, cy = pad + R - 10;
  const badgeSvg = badge ? `
  <circle cx="${cx + 6}" cy="${cy + 8}" r="${R}" fill="#000" fill-opacity="0.28"/>
  <circle cx="${cx}" cy="${cy}" r="${R}" fill="${color}"/>
  <circle cx="${cx}" cy="${cy}" r="${R - 12}" fill="none" stroke="#ffd54a" stroke-width="5" stroke-dasharray="14 10"/>
  <text x="${cx}" y="${cy + 18}" font-size="${fit(badge, R * 1.45, 100, 0.66)}" font-weight="800" text-anchor="middle" fill="#fff">${esc(badge)}</text>
  <text x="${cx}" y="${cy + 82}" font-size="54" font-weight="800" text-anchor="middle" fill="#ffd54a" letter-spacing="4">OFF</text>` : '';
  const pillW = 250, pillH = 68, px = W - pad - pillW, py = H - pad - pillH;
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#000" stop-opacity="0"/>
      <stop offset="0.45" stop-color="#000" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.85"/>
    </linearGradient>
  </defs>
  <rect x="0" y="${H * 0.5}" width="${W}" height="${H * 0.5}" fill="url(#fade)"/>
  <g font-family="DejaVu Sans, Liberation Sans, Arial, Helvetica, sans-serif">
    <path d="M0 ${pad} H420 L390 ${pad + 34} L420 ${pad + 68} H0 Z" fill="#ffd54a"/>
    <text x="${pad - 20}" y="${pad + 46}" font-size="30" font-weight="800" fill="#1e1e1e" letter-spacing="2" textLength="320" lengthAdjust="spacingAndGlyphs">LIMITED OFFER</text>
    ${badgeSvg}
    <rect x="${pad}" y="${H - pad - 190 - ls * 0.15}" width="90" height="8" rx="4" fill="#ffd54a"/>
    <text x="${pad}" y="${H - pad - 105}" font-size="${ls}" font-weight="800" fill="#fff">${esc(line)}</text>
    <text x="${pad}" y="${H - pad - 48}" font-size="${ss}" font-weight="700" fill="#ffd54a">${esc(sub)}</text>
    <text x="${pad}" y="${H - pad - 6}" font-size="${bs}" fill="#fff" fill-opacity="0.9">${esc(brand)}</text>
    <rect x="${px}" y="${py}" width="${pillW}" height="${pillH}" rx="${pillH / 2}" fill="${color}" stroke="#fff" stroke-width="3"/>
    <text x="${px + pillW / 2}" y="${py + 45}" font-size="32" font-weight="800" text-anchor="middle" fill="#fff">Call now</text>
  </g>
</svg>`;
  return sharp(base).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
}
