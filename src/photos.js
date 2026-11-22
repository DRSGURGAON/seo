// AI photos: Gemini draws a photo for a post that has none; Pradeep approves or rejects it in the
// AI_Photos tab of the sheet; `npm run sync` puts approved photos on their posts.
import { seasonFor } from './month.js';

export const AI_TAB = 'AI_Photos';
export const AI_COLUMNS = ['business_id', 'post_id', 'status', 'preview', 'url', 'notes', 'prompt', 'created'];

// '' = waiting for review, 'approve', 'reject'
export function aiStatus(s) {
  const v = String(s || '').trim().toLowerCase();
  if (/^(approve|approved|ok|yes|y)$/.test(v)) return 'approve';
  if (/^(reject|rejected|no|n)$/.test(v)) return 'reject';
  return '';
}

const firstSentences = (t, n = 2) => (String(t).match(/[^.!?]+[.!?]+/g) || [t]).slice(0, n).map(x => x.trim()).join(' ');

export function buildPhotoPrompt(biz, post, feedback = '') {
  const month = post.date.slice(0, 7);
  return [
    `A realistic, natural-looking photograph for a Google Business Profile post of a packers and movers company in ${biz.widget?.city || 'Gurgaon'}, India.`,
    `The post is about: "${post.title}". ${firstSentences(post.text)}`,
    'Show the moving work itself: packed and labelled cartons, wrapped furniture, packing material, loading, or a home or apartment being shifted, in an Indian urban setting.',
    `Season: ${seasonFor(month)}. Natural daylight, clean and uncluttered, landscape 4:3.`,
    'Strict rules: no text, letters, numbers, signs, logos, brand names, watermarks or phone numbers anywhere in the image.',
    'Do not show a branded truck, company uniforms or an office that could be taken for a real company. People only from behind or at a distance, no recognisable faces.',
    'Do not show discount signs, price tags or the word sale.',
    feedback ? `The previous image was rejected. Change this: ${feedback}` : '',
  ].filter(Boolean).join('\n');
}

// Posts that need a photo: future (date >= today), no image, and no AI photo waiting or approved.
// A post whose AI photos were all rejected gets a new one, with the last rejection's notes as feedback.
export function pickTargets({ posts, aiRows, today, only = 'all', limit = Infinity }) {
  const out = [];
  for (const p of posts) {
    if (p.image || p.date.slice(0, 10) < today) continue;
    if (only === 'offer' && p.type !== 'offer') continue;
    if (only === 'post' && p.type === 'offer') continue;
    const mine = aiRows.filter(r => r.post_id === p.id);
    if (mine.some(r => r.status !== 'reject')) continue;
    out.push({ post: p, feedback: mine.length ? mine[mine.length - 1].notes : '' });
    if (out.length >= limit) break;
  }
  return out;
}

// One row for the AI_Photos tab. The preview formula shows the photo in Google Sheets after import.
export function reviewRow({ bizId, post, url, prompt, created }) {
  return { business_id: bizId, post_id: post.id, status: '', preview: `=IMAGE("${url}")`, url, notes: '', prompt, created };
}

// Approved AI photos go on posts that have no image yet (an image typed in the sheet always wins).
export function applyApproved(posts, aiRows) {
  const ok = new Map(aiRows.filter(r => r.status === 'approve').map(r => [r.post_id, r.url]));
  return posts.map(p => (!p.image && ok.has(p.id) ? { ...p, image: ok.get(p.id), image_ai: true } : p));
}

export const extFor = mime => ({ 'image/jpeg': 'jpg', 'image/webp': 'webp' })[mime] || 'png';
