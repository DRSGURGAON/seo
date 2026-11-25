// Website blog articles (website only, never posted to GBP). Long-form versions of local topics:
// one article = one search keyword = its own page /blogs/<slug>/ on the business website.
// The sheet's <id>_blogs tab is the source of truth; `npm run blogs` fills it, `npm run sync` writes out/<id>/blogs.json.
import { similarity } from './similarity.js';
import { seasonFor } from './month.js';

export const BLOG_RULES = { min_words: 700, max_words: 1400, max_similarity: 0.3, per_month: 8 };
const PHONE_RE = /(\+?\d[\d\s-]{8,}\d)/;
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const BLOG_SCHEMA = {
  type: 'OBJECT',
  properties: {
    keyword: { type: 'STRING' }, slug: { type: 'STRING' }, title: { type: 'STRING' },
    description: { type: 'STRING' }, body: { type: 'STRING' },
  },
  required: ['keyword', 'slug', 'title', 'description', 'body'],
};

export const blogsPerMonth = biz => (Number.isFinite(biz.blogs_per_month) ? biz.blogs_per_month : BLOG_RULES.per_month);
export const wordCount = s => (String(s).match(/[A-Za-z0-9][A-Za-z0-9'’-]*/g) || []).length;
// Where this business's blog pages live: /blogs/ for a whole site, /gurgaon/blogs/ for a city folder like storagewale.com/gurgaon/.
export function blogPath(website) {
  try { return `${new URL(website).pathname.replace(/\/+$/, '')}/blogs/`; } catch { return '/blogs/'; }
}

export const slugify =s => String(s).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70).replace(/-+$/, '');

// `count` dates spread evenly over the month (from `from` if given), e.g. 8 -> roughly every 4th day.
export function spreadDates(month, count, from) {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const all = Array.from({ length: last }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`).filter(d => !from || d >= from);
  if (count <= 0 || !all.length) return [];
  if (count >= all.length) return all;
  const step = all.length / count;
  return Array.from({ length: count }, (_, i) => all[Math.min(all.length - 1, Math.floor(step / 2 + i * step))]);
}

// Problems with one article. `others` = earlier blogs (sheet + this batch); `taken` = slugs already used on the site.
// Words that say nothing about a page's topic, so "packers-and-movers-gurgaon-sector-49" -> "sector 49".
const GENERIC = new Set(['packers', 'movers', 'and', 'in', 'the', 'of', 'for', 'near', 'me', 'best', 'services', 'service', 'storage', 'household',
  'relocation', 'home', 'house', 'office', 'shifting', 'moving', 'packing', 'company', 'index', 'page']);
const QUESTION = new Set(['how', 'to', 'what', 'why', 'when', 'which', 'can', 'i', 'choose', 'get', 'a', 'it', 'works', 'vs', 'is', 'does', 'do']);
const SKIP_PAGES =new Set(['', 'blogs', 'blog', 'about us', 'contact us', 'gallery', 'locations', 'guides', 'lp', 'faq', 'privacy policy', 'terms']);
export const norm = s => ` ${String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\bsec\b/g, 'sector').replace(/\s+/g, ' ').trim()} `;

// Topics the business already ranks with: every existing website page (by its URL) and every area it serves.
// A blog must not target these, or it competes with the area/service page for the same search (keyword cannibalisation).
// The city itself (e.g. Gurgaon) is not a topic, blogs may and should name it.
export function takenTopics(biz, sitePages = []) {
  const city = norm(biz.widget?.city || '').trim();
  const out = new Map(); // phrase -> where it comes from
  for (const p of sitePages) {
    const full = norm(p.split('/').pop()).trim();
    let words = full.split(' ').filter(w => w && !GENERIC.has(w) && w !== city);
    // "how-to-choose-packers-and-movers" would shrink to "how to choose", which forbids every how-to: keep the whole name.
    if (words.every(w => QUESTION.has(w))) words = full.split(' ');
    const phrase = words.join(' ');
    // One-word page names (/furniture/, /pricing/) are too broad to forbid; single-word places come from the areas list.
    if (!SKIP_PAGES.has(norm(p.split('/').pop()).trim()) && words.length >= 2 && !/^\d+$/.test(phrase)) out.set(phrase, `page /${p}/`);
  }
  for (const a of biz.areas || []) {
    const phrase = norm(a).trim();
    if (phrase && phrase !== city) out.set(phrase, `area ${a}`);
  }
  return out;
}

export function blogProblems(biz, b, others = [], taken = new Set(), topics = new Map()) {
  const r = { ...BLOG_RULES, ...(biz.blog_rules || {}) }, probs = [];
  const words = wordCount(b.body);
  if (words < r.min_words || words > r.max_words) probs.push(`body is ${words} words, must be ${r.min_words}-${r.max_words}`);
  if (!b.title || b.title.length > 70) probs.push('title must be 1-70 characters');
  if (!b.description || b.description.length < 70 || b.description.length > 160) probs.push(`meta description must be 70-160 characters (is ${String(b.description || '').length})`);
  if (!SLUG_RE.test(b.slug || '')) probs.push('slug must be lowercase words joined by -');
  else if (taken.has(b.slug) || others.some(o => o.slug === b.slug)) probs.push(`slug "${b.slug}" already exists on the website or in another blog, pick a different topic`);
  const kw = String(b.keyword || '').toLowerCase().trim();
  if (!kw) probs.push('keyword is empty');
  else {
    if (!b.title.toLowerCase().includes(kw) && !b.body.toLowerCase().split(/\s+/).slice(0, 120).join(' ').includes(kw)) probs.push(`use the keyword "${b.keyword}" in the title or the first paragraph`);
    if (others.some(o => String(o.keyword || '').toLowerCase().trim() === kw)) probs.push(`keyword "${b.keyword}" already has a blog, choose another`);
    const target = norm(`${b.keyword} ${b.title}`);
    const hit = [...topics].find(([phrase]) => target.includes(` ${phrase} `));
    if (hit) probs.push(`the keyword/title targets "${hit[0]}", which already has its own ${hit[1]}; pick a question or how-to topic that names no area`);
    // No two blogs built on the same template ("household storage in X", "household storage in Y").
    const head = norm(kw).trim().split(' ').slice(0, 3).join(' ');
    if (head.split(' ').length === 3 && others.some(o => norm(o.keyword || '').trim().startsWith(head + ' ') || norm(o.keyword || '').trim() === head))
      probs.push(`keyword starts like an earlier blog ("${head} ..."), use a different kind of topic`);
  }
  if (!/^##\s/m.test(b.body)) probs.push('use ## subheadings');
  if (PHONE_RE.test(`${b.title} ${b.body}`)) probs.push('must not contain any phone number');
  const worst = Math.max(0, ...others.map(o => similarity(b.body, o.body || '')));
  if (worst > r.max_similarity) probs.push(`too similar to an earlier blog (${worst.toFixed(2)}), use a different topic and wording`);
  return probs;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// One kind of article per blog, rotated, so a month never becomes eight copies of "<service> in <area>".
export const BLOG_ANGLES = [
  'what decides the cost (factors only, no prices)', 'a step-by-step how-to guide', 'a printable checklist', 'common mistakes to avoid',
  'a comparison of two options the customer is choosing between', 'what can and cannot be stored or moved, and how to prepare each item',
  'a specific life situation (renovation, job transfer, going abroad, small flat, new baby, students, e-commerce sellers)',
  'questions to ask before choosing a provider', 'season-specific care for goods',
];

export function buildBlogPrompt(biz, { month, avoid = [], sitePages = [], fix = null, angle = BLOG_ANGLES[0], topics = new Map() }) {
  const r = { ...BLOG_RULES, ...(biz.blog_rules || {}) };
  const when = `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
  const city = biz.widget?.city || 'Gurgaon';
  return [
    `Write ONE blog article for the website of "${biz.name}", a ${biz.category || 'packers and movers'} business in ${city} (established ${biz.established}).`,
    `Services: ${biz.services.join(', ')}. Areas served: ${biz.areas.join(', ')}. Main keyword of the business: "${biz.primary_keyword}".`,
    `It is published in ${when}, in ${seasonFor(month)}. Any weather or seasonal angle must match that season.`,
    '',
    `The website already has a separate page for every area and service, so this blog must NOT target an area. Pick ONE informational long-tail keyword a real customer in ${city} would type: a question, a how-to, a cost factor, a checklist or a comparison, e.g. "how to store a sofa for 6 months" or "what affects household storage cost in ${city}". The keyword may contain "${city}" but no locality, sector or neighbourhood name.`,
    `This article's angle: ${angle}.`,
    topics.size ? `Keywords and titles must not contain any of these names (they have their own pages): ${[...topics.keys()].slice(0, 80).join(', ')}. You may mention areas inside the body.` : '',
    'Rules:',
    `- ${r.min_words}-${r.max_words} words of body. Markdown only: ## and ### subheadings, short paragraphs, "- " bullet lists. No links, no images, no tables, no H1.`,
    '- Use the keyword in the title and in the first paragraph, naturally. Title under 70 characters.',
    '- description: a meta description of 120-155 characters that makes people click.',
    '- slug: 3-7 lowercase words from the keyword joined by -, e.g. "2bhk-shifting-cost-gurgaon".',
    '- Genuinely useful and specific: steps, checklists, what affects cost (no actual prices or price ranges), mistakes to avoid. Name real areas from the list where it helps.',
    '- End with a "## Frequently asked questions" section of 3-4 questions (### for each question), then one short closing paragraph inviting the reader to call for a free survey.',
    '- Only describe the services listed above. Do not invent equipment, guarantees, certifications, awards, discounts, statistics or customer stories.',
    '- Transit insurance, if mentioned, is optional and separate, never included.',
    '- No phone numbers, emojis, hashtags or ALL CAPS.',
    avoid.length ? `\nThese topics already have a blog, choose something clearly different:\n${avoid.map(t => `- ${t}`).join('\n')}` : '',
    sitePages.length ? `\nThe website already has these pages, do not write about the same topic or use these slugs:\n${sitePages.slice(0, 120).map(s => `- /${s}/`).join('\n')}` : '',
    fix ? `\nYour previous attempt "${fix.title}" was rejected: ${fix.problems.join('; ')}. Write a new article that fixes this.` : '',
    '\nReturn JSON with keys keyword, slug, title, description, body.',
  ].join('\n');
}

// generate(prompt) -> {keyword,slug,title,description,body}. Injected so tests run without an API.
export async function generateBlogs({ biz, existing = [], dates, photos = [], sitePages = [], generate, triesPerBlog = 3, log = () => {} }) {
  const taken = new Set(sitePages.map(s => s.split('/').pop()));
  const topics = takenTopics(biz, sitePages);
  const accepted = [];
  let stopped = '';
  for (const date of dates) {
    if (stopped) break;
    let fix = null, ok = null;
    for (let t = 0; t < triesPerBlog && !ok; t++) {
      const others = [...existing, ...accepted];
      let b;
      // Gemini still down after all retries/fallbacks: keep the blogs written so far instead of losing them.
      try { b = await generate(buildBlogPrompt(biz, { month: date.slice(0, 7), avoid: others.map(o => `${o.title} (keyword: ${o.keyword})`).slice(-60), sitePages, fix, topics,
        angle: BLOG_ANGLES[(others.length + t) % BLOG_ANGLES.length] })); } catch (e) {
        stopped = e.message; log(`  ${date}: stopped, ${e.message}`); break;
      }
      const blog = { ...b, slug: slugify(b.slug || b.title || ''), title: String(b.title || '').trim(), description: String(b.description || '').trim(), body: String(b.body || '').trim(), keyword: String(b.keyword || '').trim() };
      const problems = blogProblems(biz, blog, others, taken, topics);
      if (problems.length) { fix = { title: blog.title, problems }; log(`  ${date}: attempt ${t + 1} rejected (${problems.join('; ')})`); continue; }
      ok = blog;
    }
    if (!ok) { if (!stopped) log(`  ${date}: no acceptable blog after ${triesPerBlog} attempts, skipped`); continue; }
    accepted.push({ ...ok, date });
    log(`  ${date}: "${ok.title}" (${wordCount(ok.body)} words)`);
  }
  // Rotate photos, continuing after the last photo an existing blog used.
  const lastImg = existing.at(-1)?.image;
  const start = photos.length ? (photos.findIndex(p => p.id === lastImg || p.url === lastImg) + 1) % photos.length : 0;
  const rows = accepted.map((b, i) => ({
    id: `${biz.id}-blog-${b.date.replace(/-/g, '')}`, date: b.date, slug: b.slug, title: b.title, description: b.description, keyword: b.keyword,
    body: b.body, image: photos.length ? photos[(start + i) % photos.length].id : '', status: 'scheduled', words: wordCount(b.body), notes: 'gemini',
  }));
  if (stopped) rows.stopped = stopped;
  return rows;
}

// RFC 4180 CSV (quoted fields may hold commas, quotes and newlines) -> array of objects keyed by the header row.
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', q = false;
  const s = String(text).replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i++; } else if (c === '"') q = false; else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows.filter(r => r.some(v => v !== ''));
  return head ? body.map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? '']))) : [];
}

// Page slugs that already exist on the website, read from its sitemap (best effort: [] if anything fails).
export async function fetchSitePages(website, fetchFn = fetch) {
  if (!website) return [];
  try {
    const base = new URL(website).origin; // the sitemap lives at the domain root even when the profile is a city folder
    const get = async u => { const r = await fetchFn(u); return r.ok ? r.text() : ''; };
    const locs = xml => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(m => m[1]);
    const index = await get(`${base}/sitemap-index.xml`) || await get(`${base}/sitemap.xml`);
    const maps = /<sitemapindex/.test(index) ? locs(index) : [];
    const urls = maps.length ? (await Promise.all(maps.map(get))).flatMap(locs) : locs(index);
    return [...new Set(urls.map(u => new URL(u).pathname.replace(/^\/+|\/+$/g, '')).filter(Boolean))];
  } catch { return []; }
}

// Minimal Markdown -> HTML for blog bodies: ##/### headings, paragraphs, - and 1. lists, **bold**, *italic*. Everything else is escaped.
export function markdownToHtml(md) {
  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<em>$2</em>');
  const out = [];
  let list = null, para = [];
  const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; } };
  const flushList = () => { if (list) { out.push(`<${list.tag}>${list.items.map(i => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`); list = null; } };
  for (const raw of String(md).replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    let m;
    if (!line) { flushPara(); flushList(); continue; }
    if ((m = line.match(/^(#{2,4})\s+(.*)$/))) { flushPara(); flushList(); const n = Math.min(m[1].length, 4); out.push(`<h${n}>${inline(m[2])}</h${n}>`); continue; }
    if ((m = line.match(/^#\s+(.*)$/))) { flushPara(); flushList(); out.push(`<h2>${inline(m[1])}</h2>`); continue; }
    const bullet = line.match(/^[-*•]\s+(.*)$/), numbered = line.match(/^\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      flushPara();
      const tag = bullet ? 'ul' : 'ol';
      if (list && list.tag !== tag) flushList();
      (list ||= { tag, items: [] }).items.push((bullet || numbered)[1]);
      continue;
    }
    flushList();
    para.push(line);
  }
  flushPara(); flushList();
  return out.join('\n');
}

// Markdown table for the GitHub Actions run page.
export function blogSummary(rows, { id, month }) {
  const cell = s => String(s ?? '').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');
  return [
    `## ${id} ${month}: ${rows.length} blogs`, '',
    'Read them, then import the CSV (Artifacts, below) into the sheet tab ' + `\`${id}_blogs\`.`, '',
    '| Date | Title | Keyword | Words | Description |', '|---|---|---|---|---|',
    ...rows.map(r => `| ${r.date} | ${cell(r.title)} | ${cell(r.keyword)} | ${r.words} | ${cell(r.description)} |`), '',
  ].join('\n');
}
