// Offer banner: a brand-coloured strip at the bottom of a photo with the offer and its dates,
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

// Returns a JPEG (max 1200 px wide, 4:3 crop) with the banner on it.
export async function addBanner(input, { headline, sub, brand, color = '#9b1c2c' }) {
  const W = 1200, H = 900;
  const base = await sharp(input).rotate().resize(W, H, { fit: 'cover' }).toBuffer();
  const band = Math.round(H * 0.25), y0 = H - band, pad = 48;
  const hs = fit(headline, W - 2 * pad, 84, 0.78), ss = fit(sub, (W - 2 * pad) * 0.6, 40), bs = fit(brand, (W - 2 * pad) * 0.4, 30);
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="${y0}" width="${W}" height="${band}" fill="${color}" fill-opacity="0.93"/>
  <rect x="0" y="${y0}" width="${W}" height="6" fill="#ffffff" fill-opacity="0.9"/>
  <g font-family="DejaVu Sans, Liberation Sans, Arial, Helvetica, sans-serif" fill="#ffffff">
    <text x="${pad}" y="${y0 + 32 + hs}" font-size="${hs}" font-weight="800">${esc(headline)}</text>
    <text x="${pad}" y="${H - 34}" font-size="${ss}" font-weight="600">${esc(sub)}</text>
    <text x="${W - pad}" y="${H - 34}" font-size="${bs}" text-anchor="end" fill-opacity="0.9">${esc(brand)}</text>
  </g>
</svg>`;
  return sharp(base).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
}
