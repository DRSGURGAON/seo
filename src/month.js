// Month generator: asks an LLM for one GBP post per day, validates each against the
// business's post_rules, and re-asks for the ones that fail.
import { similarity } from './similarity.js';

const PHONE_RE = /(\+?\d[\d\s-]{8,}\d)/;
export const POST_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: { topic: { type: 'STRING' }, title: { type: 'STRING' }, text: { type: 'STRING' } },
    required: ['topic', 'title', 'text'],
  },
};

// Dates (YYYY-MM-DD) from `from` (or the 1st) to the last day of the month.
export function monthDates(month, from) {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const out = [];
  for (let d = 1; d <= last; d++) {
    const iso = `${month}-${String(d).padStart(2, '0')}`;
    if (!from || iso >= from) out.push(iso);
  }
  return out;
}

export function dayAfter(iso) {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// Continue the photo rotation after the last photo used by existing posts.
export function pickPhotos(photos, existing, count) {
  if (!photos.length) return Array(count).fill('');
  const lastUrl = existing.length ? existing[existing.length - 1].image : '';
  const start = (photos.findIndex(p => p.url === lastUrl || p.id === lastUrl) + 1) % photos.length;
  return Array.from({ length: count }, (_, i) => photos[(start + i) % photos.length].id);
}

// Problems with one post: length, keyword, phone number, similarity to `others`.
export function postProblems(biz, post, others) {
  const r = biz.post_rules, tol = r.length_tolerance || 0, probs = [];
  const full = `${post.title} ${post.text}`;
  if (full.length < r.min_chars - tol || full.length > r.max_chars + tol)
    probs.push(`title+text is ${full.length} characters, must be ${r.min_chars}-${r.max_chars}`);
  const low = full.toLowerCase();
  if (!low.includes(biz.primary_keyword.toLowerCase())) probs.push(`must contain "${biz.primary_keyword}" in the first sentence`);
  if (!low.includes(biz.secondary_keyword.toLowerCase())) probs.push(`must contain "${biz.secondary_keyword}" near the end`);
  if (PHONE_RE.test(full)) probs.push('must not contain any phone number');
  const worst = Math.max(0, ...others.map(o => similarity(full, `${o.title} ${o.text}`)));
  if (worst > r.max_similarity) probs.push(`too similar to an earlier post (${worst.toFixed(2)}), use a different angle and wording`);
  return probs;
}

export function buildPrompt(biz, { count, avoidTitles, fixes = [] }) {
  const r = biz.post_rules;
  return [
    `Write ${count} Google Business Profile posts for "${biz.name}", a packers and movers company in ${biz.widget?.city || 'Gurgaon'} (established ${biz.established}).`,
    `Services: ${biz.services.join(', ')}. Areas served: ${biz.areas.join(', ')}.`,
    '',
    'Rules for EVERY post:',
    `- title + text together: ${r.min_chars}-${r.max_chars} characters. Title is a short hook question or statement (under 70 characters).`,
    `- Use "${biz.primary_keyword}" in the first sentence and "${biz.secondary_keyword}" near the end, naturally.`,
    '- Each post a DIFFERENT practical topic (a service, a packing tip, a route, a season, a customer worry, an area). Name 2-3 real areas from the list.',
    '- Plain, helpful, specific English. No phone numbers, no prices, no emojis, no hashtags, no ALL CAPS, no fake reviews or claims.',
    '- End with an invitation to call (the button is "Call now").',
    avoidTitles.length ? `\nDo not repeat these earlier topics:\n${avoidTitles.map(t => `- ${t}`).join('\n')}` : '',
    fixes.length ? `\nRewrite these posts, fixing the problems listed:\n${fixes.map((f, i) => `${i + 1}. "${f.title}": ${f.problems.join('; ')}`).join('\n')}` : '',
    `\nReturn a JSON array of exactly ${count} objects with keys topic, title, text.`,
  ].join('\n');
}

// generate(prompt) -> array of {topic,title,text}. Injected so tests run without an API.
// Failed posts are sent back in the next request with their problems, up to `extraTries` extra calls.
export async function generateMonth({ biz, existing, photos, dates, generate, batchSize = 10, extraTries = 6, log = () => {} }) {
  const accepted = [];
  let fixes = [];
  const maxCalls = Math.ceil(dates.length / batchSize) + extraTries;
  for (let call = 0; call < maxCalls && accepted.length < dates.length; call++) {
    const count = Math.min(batchSize, dates.length - accepted.length);
    const avoidTitles = [...existing, ...accepted].map(p => p.title).slice(-60);
    const batch = await generate(buildPrompt(biz, { count, avoidTitles, fixes }));
    fixes = [];
    let got = 0;
    for (const p of (Array.isArray(batch) ? batch : []).slice(0, count)) {
      const problems = postProblems(biz, p, [...existing, ...accepted]);
      if (problems.length) { fixes.push({ title: p.title, problems }); continue; }
      accepted.push(p); got++;
    }
    log(`  request ${call + 1}: ${got}/${count} accepted${fixes.length ? `, ${fixes.length} sent back to rewrite` : ''}`);
  }
  const imgs = pickPhotos(photos, existing, accepted.length);
  return accepted.map((p, i) => ({
    id: `${biz.id}-${dates[i].replace(/-/g, '')}`,
    date: dates[i], time: biz.post_rules.time, title: p.title.trim(), text: p.text.trim(),
    image: imgs[i], cta: biz.post_rules.cta, status: 'scheduled',
    chars: `${p.title} ${p.text}`.length, notes: `gemini: ${p.topic}`,
  }));
}

export function toCsv(rows, columns) {
  const esc = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [columns.join(','), ...rows.map(r => columns.map(c => esc(r[c])).join(','))].join('\n') + '\n';
}

// Markdown table for the GitHub Actions run page, so posts can be read without downloading anything.
export function toSummary(rows, { id, month }) {
  const cell = s => String(s ?? '').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');
  return [
    `## ${id} ${month}: ${rows.length} posts`,
    '',
    'Read each post, then import the CSV (Artifacts, below) into the sheet.',
    '',
    '| Date | Title | Text | Chars |',
    '|---|---|---|---|',
    ...rows.map(r => `| ${r.date} | ${cell(r.title)} | ${cell(r.text)} | ${r.chars} |`),
    '',
  ].join('\n');
}
