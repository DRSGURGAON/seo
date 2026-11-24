import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { spreadDates, markdownToHtml, blogProblems, generateBlogs, fetchSitePages, wordCount, slugify, buildBlogPrompt } from '../src/blogs.js';
import { buildTemplate, parseWorkbook, blogsTab } from '../src/sheet.js';
import { checkBlogs } from '../src/check.js';

const biz = JSON.parse(readFileSync('businesses/amex.json', 'utf8'));

// A unique, valid-looking article body of ~n words (seeded so bodies never resemble each other).
function body(seed, n = 800, keyword = '') {
  let x = [...seed].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0;
  const w = () => { x = (Math.imul(x, 1103515245) + 12345) >>> 0; return 'w' + (x % 50000).toString(36); };
  const para = k => Array.from({ length: k }, w).join(' ') + '.';
  const parts = [`${keyword} ${para(60)}`.trim(), '## Plan the move', para(150), '- ' + para(10), '- ' + para(10), '## What changes the cost', para(200),
    '## Frequently asked questions', '### How early to book?', para(120), '### Is packing included?', para(120)];
  let text = parts.join('\n\n');
  while (wordCount(text) < n) text += '\n\n' + para(40);
  return text;
}
const blog = (seed, o = {}) => ({ keyword: `${seed} shifting gurgaon`, slug: `${seed}-shifting-gurgaon`, title: `${seed} shifting in Gurgaon guide`,
  description: 'A practical guide for families planning a move in Gurgaon, with steps, checklists and mistakes to avoid.', body: body(seed, 800, `${seed} shifting gurgaon`), ...o });

test('spreadDates spaces blogs over the month', () => {
  const d = spreadDates('2026-12', 8);
  assert.equal(d.length, 8);
  assert.equal(new Set(d).size, 8);
  assert.ok(d.every(x => x.startsWith('2026-12-')));
  assert.deepEqual(spreadDates('2026-12', 2, '2026-12-20'), ['2026-12-23', '2026-12-29']);
  assert.deepEqual(spreadDates('2026-12', 0), []);
});

test('markdownToHtml handles headings, lists, bold and escapes HTML', () => {
  const html = markdownToHtml('## Why plan\nFirst line\nsame para **bold**.\n\n- one\n- two <b>\n\n1. a\n2. b\n\n### Q?\n<script>x</script>');
  assert.equal(html, [
    '<h2>Why plan</h2>', '<p>First line same para <strong>bold</strong>.</p>', '<ul><li>one</li><li>two &lt;b&gt;</li></ul>',
    '<ol><li>a</li><li>b</li></ol>', '<h3>Q?</h3>', '<p>&lt;script&gt;x&lt;/script&gt;</p>',
  ].join('\n'));
});

test('blogProblems catches short, duplicate slug/keyword, phone and copies', () => {
  const a = blog('alpha');
  assert.deepEqual(blogProblems(biz, a, [], new Set()), []);
  assert.match(blogProblems(biz, { ...a, body: '## x\nshort' }).join(), /words/);
  assert.match(blogProblems(biz, a, [], new Set(['alpha-shifting-gurgaon'])).join(), /already exists/);
  assert.match(blogProblems(biz, blog('beta', { keyword: a.keyword }), [a]).join(), /already has a blog/);
  assert.match(blogProblems(biz, blog('gamma', { body: a.body + ' call 98765 43210' })).join(), /phone/);
  assert.match(blogProblems(biz, blog('delta', { body: a.body }), [a]).join(), /too similar/);
});

test('generateBlogs retries rejected drafts and rotates photos', async () => {
  const prompts = [];
  const queue = [blog('one', { body: '## too short' }), blog('one'), blog('two')];
  const rows = await generateBlogs({
    biz, dates: ['2026-12-04', '2026-12-08'], photos: [{ id: 'p01' }, { id: 'p02' }], existing: [{ image: 'p01', slug: 'x', keyword: 'old', body: 'old', title: 'Old' }],
    generate: async p => { prompts.push(p); return queue.shift(); },
  });
  assert.equal(rows.length, 2);
  assert.match(prompts[1], /was rejected: body is \d+ words/);
  assert.deepEqual(rows.map(r => [r.id, r.image, r.status]), [['amex-blog-20261204', 'p02', 'scheduled'], ['amex-blog-20261208', 'p01', 'scheduled']]);
  assert.ok(rows[0].words >= 700);
});

test('prompt names the season and existing site pages', () => {
  const p = buildBlogPrompt(biz, { month: '2026-12', sitePages: ['sec-56-packers-movers'] });
  assert.match(p, /winter/);
  assert.match(p, /\/sec-56-packers-movers\//);
});

test('fetchSitePages reads a sitemap index and never throws', async () => {
  const pages = {
    'https://x.in/sitemap-index.xml': '<sitemapindex><sitemap><loc>https://x.in/sitemap-0.xml</loc></sitemap></sitemapindex>',
    'https://x.in/sitemap-0.xml': '<urlset><url><loc>https://x.in/</loc></url><url><loc>https://x.in/blogs/a-b/</loc></url></urlset>',
  };
  const f = async u => ({ ok: u in pages, text: async () => pages[u] || '' });
  assert.deepEqual(await fetchSitePages('https://x.in/', f), ['blogs/a-b']);
  assert.deepEqual(await fetchSitePages('https://x.in/', async () => { throw new Error('offline'); }), []);
});

test('sheet: <id>_blogs tab round-trips to blogs.json with HTML, drafts left out', async () => {
  const b1 = { id: 'amex-blog-20261204', date: '2026-12-04', ...blog('one'), image: '' };
  const b2 = { id: 'amex-blog-20261208', date: '2026-12-08', ...blog('two'), image: '' };
  const wb = buildTemplate([{ biz, feed: { posts: [] }, blogs: [b1, b2] }]);
  wb.getWorksheet(blogsTab('amex')).addRow({ date: '2026-12-12', title: 'Draft one', body: 'x', status: 'draft' });
  const back = new ExcelJS.Workbook();
  await back.xlsx.load(await wb.xlsx.writeBuffer());
  const { businesses, errors, warnings } = parseWorkbook(back);
  assert.deepEqual(errors, []);
  const { blogs } = businesses[0];
  assert.deepEqual(blogs.map(b => b.slug), [b1.slug, b2.slug]);
  assert.match(blogs[0].html, /<h2>Plan the move<\/h2>/);
  assert.match(warnings.join(), /1 draft blog/);
  assert.deepEqual(checkBlogs(biz, blogs), []);
});

test('sheet: no _blogs tab means blogs stay null (blogs.json untouched)', async () => {
  const wb = buildTemplate([{ biz, feed: { posts: [] } }]);
  wb.removeWorksheet(wb.getWorksheet(blogsTab('amex')).id);
  const { businesses } = parseWorkbook(wb);
  assert.equal(businesses[0].blogs, null);
  assert.equal(slugify('2BHK Shifting: Cost & Tips!'), '2bhk-shifting-cost-and-tips');
});

test('withRetry retries busy Gemini answers, not real errors', async () => {
  const { withRetry } = await import('../src/gemini.js');
  let n = 0;
  const busy = () => { n++; if (n < 3) throw Object.assign(new Error('503'), { status: 503 }); return 'ok'; };
  assert.equal(await withRetry(busy, { wait: async () => {} }), 'ok');
  assert.equal(n, 3);
  await assert.rejects(withRetry(() => { throw Object.assign(new Error('bad key'), { status: 400 }); }, { wait: async () => {} }), /bad key/);
});

test('city-folder websites: sitemap from the domain root, blogs under the city', async () => {
  const { blogPath } = await import('../src/blogs.js');
  assert.equal(blogPath('https://www.storagewale.com/gurgaon/'), '/gurgaon/blogs/');
  assert.equal(blogPath('https://americanpackersncr.in/'), '/blogs/');
  const seen = [];
  await fetchSitePages('https://x.in/pune/', async u => { seen.push(u); return { ok: false, text: async () => '' }; });
  assert.equal(seen[0], 'https://x.in/sitemap-index.xml');
});

test('geminiJson falls back to another model when the first stays busy, and keeps it', async () => {
  const { geminiJson, listTextModels, resetModelSwitch } = await import('../src/gemini.js');
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    calls.push(url);
    if (url.includes('busy-flash')) return { ok: false, status: 503, statusText: 'busy', json: async () => ({ error: { message: 'high demand' } }) };
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"ok":1}' }] } }] }) };
  };
  try {
    resetModelSwitch();
    const opts = { apiKey: 'k', model: 'busy-flash', prompt: 'p', schema: {} };
    const deps = { list: async () => ['busy-flash', 'gemini-9-flash'], retry: { wait: async () => {} }, log: () => {} };
    assert.deepEqual(await geminiJson(opts, deps), { ok: 1 });
    assert.ok(calls.at(-1).includes('gemini-9-flash'));
    calls.length = 0;
    await geminiJson(opts, deps);
    assert.equal(calls.length, 1, 'second call goes straight to the working model');
    resetModelSwitch();
  } finally { globalThis.fetch = realFetch; }

  const list = await listTextModels('k', async () => ({ ok: true, json: async () => ({ models: [
    { name: 'models/gemini-2.5-pro', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-3.8-pro', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-3.8-flash-image', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-3.9-flash-preview-11-2026', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
  ] }) }));
  assert.deepEqual(list, ['gemini-3.8-flash', 'gemini-3.8-pro', 'gemini-2.5-pro']);
});

test('parseCsv reads back what toCsv wrote (commas, quotes, newlines)', async () => {
  const { parseCsv } = await import('../src/blogs.js');
  const { toCsv } = await import('../src/month.js');
  const rows = [{ id: 'a', date: '2026-12-02', body: '## Hi, "there"\n\n- one\r\n- two' }, { id: 'b', date: '2026-12-06', body: 'plain' }];
  assert.deepEqual(parseCsv(toCsv(rows, ['id', 'date', 'body'])), rows);
});

test('generateBlogs keeps finished blogs when Gemini goes down mid-run', async () => {
  let n = 0;
  const rows = await generateBlogs({
    biz, dates: ['2026-12-02', '2026-12-06', '2026-12-10'],
    generate: async () => { if (++n === 2) throw new Error('Gemini 503: busy'); return blog('first'); },
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].date, '2026-12-02');
  assert.match(rows.stopped, /503/);
});
